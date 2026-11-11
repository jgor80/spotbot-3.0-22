// XI Lab's website API (gafferbot.app/fut), served at /api/functions/v1/fut-api/v1/... through the Worker.
// Signed-in users only (their GafferBot session); every route acts on the caller's own XI Lab data, keyed by
// their auth user id. No GafferBot club or server is needed. Off unless FUT_ENABLED=true.
// The MCP FUT tools call the same services (../_shared/fut/service.ts and XI Lab's workspace), so both always agree.
import {
  addCard, addManager, compareCards, deleteCard, deleteManager, deleteSquad, futEnabled, FutError, getCard, listManagers, logRun,
  activeRules, parseCardInput, parseManagerInput, runWorkspace, searchMyCards, toWorkspaceCard, updateCard, workspaceFor, type FutDb,
} from "../_shared/fut/service.ts";
import { importClub } from "../_shared/fut/club.ts";
import { cardEaReference, storeEaReference } from "../_shared/fut/ea-reference.ts";
import { collectFc27Market, fc27MarketStatus, pullFc27Market } from "../_shared/fut/fc27market.ts";
import { futggStatus } from "../_shared/fut/futgg-status.ts";
import { clearStore, importStore, packAdvice } from "../_shared/fut/packs.ts";
import { accountOverview, clearAccount, importAccount } from "../_shared/fut/account.ts";
import { dailyStrategy, riskParam, runStrategyLearning } from "../_shared/fut/strategy.ts";
import { parseSolveBody, sbcOverview, solveForUser } from "../_shared/fut/sbc-data.ts";
import { checkPastedEvolution, evolutionsOverview } from "../_shared/fut/evolutions-data.ts";
import { getAlertSettings, runPriceAlerts, setAlertSettings } from "../_shared/fut/alerts.ts";
import { setBuyPrice, tradeOverview } from "../_shared/fut/trades.ts";
import { sellOrKeep } from "../_shared/fut/sell-keep.ts";
import { cardPriceHistory } from "../_shared/fut/price-history.ts";
import { metaForCard, metaTop } from "../_shared/fut/meta-data.ts";
import { compareAnyCards } from "../_shared/fut/card-compare.ts";
import { addGame, champsOverview, createRun, deleteGame, deleteRun, updateRun } from "../_shared/fut/champs.ts";
import { describe as describeRequirement, parseRequirements } from "../_shared/fut/sbc.ts";
import { importSquad, type ImportImage } from "../_shared/fut/squad-import.ts";
import { bestSquads, squadRoles, suggestForSlot } from "../_shared/fut/squad-suggest.ts";
import { syncFutggCatalogue } from "../_shared/fut/futgg-catalogue.ts";
import { syncFutggAttributes } from "../_shared/fut/futgg-attributes.ts";
import { findPlayers, MAX_FINDER_TEXT, searchPlayers, type FinderTurn } from "../_shared/fut/player-finder.ts";
import { cleanPlayerQuery } from "../_shared/fut/stats.ts";
import { cardImages } from "../_shared/fut/card-images.ts";
import {
  addSource, ask, deleteKnowledgeSource, KB_CATEGORIES, knowledgeMap, knowledgeSources, knowledgeStatus, knowledgeTopic, MAX_ADD_TEXT, MAX_QUESTION,
  runKnowledgeIngest, type AskTurn,
} from "../_shared/fut/knowledge.ts";
import { importCardArt, listCardArt } from "../_shared/fut/card-art.ts";
import { contributeCaptures, getSharing, pullCommunity, setSharing } from "../_shared/fut/community.ts";
import { createHelperKey, HELPER_KEY_PREFIX, HELPER_ROUTES, helperKeyUser, helperStatus, revealHelperKey, revokeHelperKeys } from "../_shared/fut/helper-keys.ts";
import { forgetMarketOwner, marketCardId, marketFor, MAX_IMPORT_ROWS, platformParam } from "../_shared/fut/market.ts";
import { scanRequestSchema, thesisInputSchema, watchItemInputSchema } from "../_shared/fut/xilab/market/index.ts";
import { assignCard, cardSchema, createSquad, FORMATIONS, setFormation, squadSchema, type Squad, type WorkspaceCard } from "../_shared/fut/xilab/workspace/index.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const err = (status: number, message: string) => json({ error: message }, status);

const MAX_BODY = 64 * 1024;

export interface Deps {
  db: FutDb;
  /** The signed-in user's auth id, or null for anyone else (anon key, bot, no token). */
  userFor: (req: Request) => Promise<string | null>;
  /** Per-user throttle; returns a response when the caller is over it. */
  throttle?: (userId: string) => Response | null;
  env?: (k: string) => string | undefined;
  /** True for the bot's own scheduler (service role); it may only call /jobs/* routes. */
  isBot?: (req: Request) => Promise<boolean>;
  /** Outbound HTTP for third-party price pulls (tests pass a fake). */
  fetch?: (url: string) => Promise<Response>;
}

/** Price-history imports can be bigger than other requests (up to MAX_IMPORT_ROWS lines). */
const MAX_IMPORT_BODY = 1024 * 1024;
/** A pack store file: a few hundred packs with their odds lines, plus pulls. */
const MAX_STORE_BODY = 2 * 1024 * 1024;
/** A squad import: a chat message, or a screenshot the browser already shrank to ~1600px (a few hundred KB). */
const MAX_SQUAD_IMPORT_BODY = 6 * 1024 * 1024;
/** Squad imports that need Claude (free text, screenshots) per user per hour; plain lists don't count. */
const AI_IMPORTS_PER_HOUR = 30;
const aiImports = new Map<string, number[]>();
/** Player finder messages that need Claude, per user per hour. */
const AI_FINDS_PER_HOUR = 60;
const aiFinds = new Map<string, number[]>();
/** Knowledge bank: questions answered by Claude, and sources users add (each one is read by Claude), per user per hour. */
const AI_ASKS_PER_HOUR = 60;
const aiAsks = new Map<string, number[]>();
const KB_ADDS_PER_HOUR = 20;
const kbAdds = new Map<string, number[]>();
function aiImportAllowed(userId: string, perHour: number, uses = aiImports): boolean {
  const now = Date.now();
  const recent = (uses.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= perHour) return false;
  recent.push(now);
  uses.set(userId, recent);
  if (uses.size > 5000) uses.clear();
  return true;
}

/** The finder chat's last few turns, as the browser sends them back. */
function finderHistory(v: unknown): FinderTurn[] {
  if (!Array.isArray(v)) return [];
  return v.slice(-6).flatMap((t) => {
    const o = t && typeof t === "object" ? t as Record<string, unknown> : {};
    return (o.role === "user" || o.role === "assistant") && typeof o.text === "string" && o.text.trim()
      ? [{ role: o.role, text: o.text.slice(0, MAX_FINDER_TEXT) } as FinderTurn] : [];
  });
}

function importImage(v: unknown): ImportImage | null {
  if (v === undefined || v === null) return null;
  const o = obj(v);
  const types = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (typeof o.media_type !== "string" || !types.includes(o.media_type)) throw new FutError("Upload a JPEG, PNG, WebP or GIF screenshot.");
  if (typeof o.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(o.data) || o.data.length > MAX_SQUAD_IMPORT_BODY) throw new FutError("That screenshot couldn't be read. Try another one.");
  return { media_type: o.media_type as ImportImage["media_type"], data: o.data };
}

/** A club file from the XI Lab helper: a few hundred bytes per item. */
const MAX_CLUB_BODY = 4 * 1024 * 1024;

async function body(req: Request, max = MAX_BODY): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > max) throw new FutError("Request body is too large.");
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw new FutError("Request body must be JSON."); }
}

function intParam(v: string | null, field: string, min: number, max: number): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new FutError(`${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

/** Validate a Market Lab request with XI Lab's schema; a bad field is the caller's to fix. */
function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: (string | number)[]; message: string }[] } } }, v: unknown): T {
  const r = schema.safeParse(v);
  if (r.success) return r.data as T;
  throw new FutError(`Invalid request: ${r.error!.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")}`);
}

const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new FutError("Expected a JSON object.");
  return v as Record<string, unknown>;
};

/** A saved squad's id, or a whole squad object (validated by the workspace). */
function squadRef(v: unknown): string | Record<string, unknown> {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new FutError("squad must be a saved squad id or a squad object.");
}

function slotName(v: unknown, required: boolean): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (required) throw new FutError("slot is required (e.g. LCB).");
    return undefined;
  }
  if (typeof v !== "string" || v.length > 8) throw new FutError("slot must be a slot name like LCB.");
  return v;
}

/** The card going into a slot: one of the caller's stored cards by card_id, a card object (e.g. a target), or null to empty it. */
async function incomingCard(db: FutDb, userId: string, b: Record<string, unknown>): Promise<WorkspaceCard | null> {
  if (typeof b.card_id === "string") {
    const c = await getCard(db, userId, b.card_id);
    if (!c) throw new FutError("Card not found among your cards.", 404);
    return toWorkspaceCard(c);
  }
  if (b.card === null || b.card_id === null) return null;
  if (b.card && typeof b.card === "object") return cardSchema.parse(b.card) as WorkspaceCard;
  throw new FutError("Send card_id (one of your cards), card (a card object) or card: null to empty the slot.");
}

/** Import price rows (a typed CSV/JSON, or the helper's capture CSV). Capture rows also go to the community pool if you share. */
async function importPrices(db: FutDb, userId: string, raw: unknown) {
  const b = obj(raw);
  if (typeof b.text !== "string" || !b.text.trim()) throw new FutError("Send the price history as text: CSV with card_id,platform,price,observed_at, or a JSON array.");
  if (b.text.split("\n").length > MAX_IMPORT_ROWS + 1) throw new FutError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  const mk = await marketFor(db);
  const r = await runWorkspace(() => mk.importPriceHistory(userId, b.text as string));
  const pooled = await contributeCaptures(db, userId, b.text as string);
  const ea_reference = await storeEaReference(db, userId, b.text as string);
  return { ...r, shared_with_community: pooled.shared, ea_reference_rows: ea_reference, rejected: r.rejected.slice(0, 100).map((x) => ({ line: x.line, reason: x.reason })) };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!futEnabled(deps.env)) return err(404, "Not found");
  // Scheduled jobs from the bot (scheduler.cjs calls the function with { job }): fc27-market snapshot, futgg-catalogue.
  // Only the bare function address takes jobs, and only from the bot; nothing else is reachable this way.
  if (req.method === "POST" && /\/fut-api\/?$/.test(new URL(req.url).pathname)) {
    if (!(await deps.isBot?.(req))) return err(401, "Only the bot's scheduler can run jobs.");
    const job = (await req.json().catch(() => null) as { job?: unknown } | null)?.job;
    if (job !== "fc27-market" && job !== "futgg-catalogue" && job !== "futgg-attributes" && job !== "knowledge-ingest" && job !== "price-alerts" && job !== "strategy-learn") return err(400, "Unknown job.");
    try {
      // Knowledge bank: collect Reddit/YouTube sources and read what's waiting (see knowledge.ts)
      if (job === "knowledge-ingest") {
        const env = deps.env ?? ((k: string) => Deno.env.get(k));
        if (env("FUT_KNOWLEDGE") === "off") return json({ data: { paused: true } });
        const fetchFn = (deps.fetch as unknown as typeof fetch | undefined) ?? fetch;
        const started = new Date().toISOString();
        let result: Record<string, unknown> | null = null, failure: string | null = null;
        try { result = await runKnowledgeIngest(deps.db, env, fetchFn) as unknown as Record<string, unknown>; }
        catch (e) { failure = (e as Error).message?.slice(0, 500) ?? "failed"; throw e; }
        finally {
          const r = result as { feeds?: unknown; read?: number; skipped?: number; failed?: number } | null;
          await deps.db.from("kb_runs").insert({ started_at: started, finished_at: new Date().toISOString(), feeds: r?.feeds ?? {}, read: r?.read ?? 0,
            skipped: r?.skipped ?? 0, failed: r?.failed ?? 0, error: failure });
        }
        return json({ data: result });
      }
      // Full card stats for Player Ratings, a few hundred cards per run (see futgg-attributes.ts)
      if (job === "futgg-attributes") return json({ data: await syncFutggAttributes(deps.db, deps.fetch) });
      // Watchlist targets and big moves after a price refresh; the bot DMs each player the text it gets back.
      if (job === "price-alerts") return json({ data: await runPriceAlerts(deps.db) });
      // Daily Strategy learning: settle earlier picks, log this refresh's, relearn (see strategy-model.ts)
      if (job === "strategy-learn") return json({ data: await runStrategyLearning(deps.db) });
      if (job === "futgg-catalogue") {
        // Market-wide card list after the twice-daily FUT.GG prices, then baskets so the indexes include it.
        const result = await syncFutggCatalogue(deps.db, deps.fetch);
        await (await marketFor(deps.db)).rebalanceBaskets();
        return json({ data: result });
      }
      return json({ data: await collectFc27Market(deps.db, await marketFor(deps.db), deps.fetch) });
    } catch (e) {
      if (e instanceof FutError) return err(e.status, e.message);
      console.error(`[fut-api] ${job} job:`, e);
      return err(500, `${job} job failed.`);
    }
  }
  // The XI Lab browser helper signs in with its own key, which can only upload (HELPER_ROUTES).
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const viaHelper = bearer.startsWith(HELPER_KEY_PREFIX);
  let userId: string | null;
  try {
    userId = viaHelper ? await helperKeyUser(deps.db, bearer) : await deps.userFor(req);
  } catch (e) {
    console.error("[fut-api] auth:", e);
    return err(500, "Something went wrong in XI Lab. Try again.");
  }
  if (!userId) return err(401, viaHelper ? "This helper key is turned off or wrong. Connect the helper again from Market Lab > Import prices." : "Sign in to GafferBot to use XI Lab.");
  const limited = deps.throttle?.(userId);
  if (limited) return limited;

  const url = new URL(req.url);
  const at = url.pathname.indexOf("/fut-api");
  const path = (at >= 0 ? url.pathname.slice(at + "/fut-api".length) : url.pathname).replace(/\/+$/, "");
  if (!path.startsWith("/v1")) return err(404, "This API is /fut-api/v1.");
  const route = path.slice(3) || "/";
  const m = req.method;
  if (viaHelper && !(HELPER_ROUTES.has(route) && m === "POST")) return err(403, "A helper key can only upload prices, your club, the pack store, your account and card art addresses.");
  const db = deps.db;
  // Any change (cards, prices, club import, helper upload) makes the caller's cached Market Lab snapshot stale
  // (Player searches are POSTs that change nothing, so they keep it.)
  if (m !== "GET" && !route.startsWith("/players/") && !route.startsWith("/knowledge/")) forgetMarketOwner(db, userId);

  try {
    if (route === "/health" && m === "GET") {
      // card_images tells the browser whether cards may show EA player faces (FUT_EA_FACES=on) and where they live
      const images = await cardImages(deps.env ?? ((k: string) => Deno.env.get(k)), deps.fetch ?? ((u: string) => fetch(u, { signal: AbortSignal.timeout(10_000) })));
      return json({ ok: true, api: "v1", card_images: images });
    }

    if (route === "/cards" && m === "GET") {
      const p = url.searchParams;
      const cards = await searchMyCards(db, userId, {
        q: p.get("q")?.slice(0, 60) || undefined, position: p.get("position") || undefined,
        min_overall: intParam(p.get("min_overall"), "min_overall", 1, 99), owned_only: p.get("owned") === "true",
        limit: intParam(p.get("limit"), "limit", 1, 100),
      });
      return json({ data: cards, count: cards.length });
    }
    if (route === "/cards" && m === "POST") return json({ data: await addCard(db, userId, parseCardInput(await body(req))) }, 201);
    if (route === "/cards/compare" && m === "POST") {
      return json({ data: await compareCards(db, userId, ((await body(req)) as { card_ids?: unknown }).card_ids) });
    }
    const card = route.match(/^\/cards\/([^/]+)$/);
    if (card) {
      const id = card[1]!;
      if (m === "GET") { const c = await getCard(db, userId, id); return c ? json({ data: c }) : err(404, "Card not found."); }
      if (m === "PUT") { const c = await updateCard(db, userId, id, parseCardInput(await body(req))); return c ? json({ data: c }) : err(404, "Card not found."); }
      if (m === "DELETE") return (await deleteCard(db, userId, id)) ? json({ data: { deleted: id } }) : err(404, "Card not found.");
      return err(405, "Use GET, PUT or DELETE.");
    }

    // Club sync: the file the XI Lab helper saved from the user's own Web App club. Reads nothing from EA.
    // XI Lab browser helper: connect (signed in, shows the key once), status, turn off, and its two upload routes.
    if (route === "/helper" && m === "GET") return json({ data: await helperStatus(db, userId) });
    if (route === "/helper" && m === "DELETE") return json({ data: await revokeHelperKeys(db, userId) });
    if (route === "/helper/connect" && m === "POST") return json({ data: await createHelperKey(db, userId, deps.env ?? ((k: string) => Deno.env.get(k))) }, 201);
    // The full key again, for its owner's profile (never for a helper key: /helper/key isn't in HELPER_ROUTES).
    if (route === "/helper/key" && m === "GET") return json({ data: await revealHelperKey(db, userId, deps.env ?? ((k: string) => Deno.env.get(k))) });
    if (route === "/helper/prices" && m === "POST") return json({ data: await importPrices(db, userId, await body(req, MAX_IMPORT_BODY)) });

    // Pack Advisor: the pack store and pack pulls the helper copied from the user's own Web App, scored on FUT.GG prices.
    if (route === "/helper/packs" && m === "POST") return json({ data: await importStore(db, userId, await body(req, MAX_STORE_BODY)) });
    if (route === "/packs" && m === "GET") return json({ data: await packAdvice(db, userId, platformParam(url.searchParams.get("platform"))) });
    if (route === "/packs" && m === "DELETE") return json({ data: await clearStore(db, userId, platformParam(url.searchParams.get("platform"))) });

    // My Account: coins, points, piles, SBCs and objectives the helper copied from the user's own Web App.
    // Card art addresses the Web App loaded (helper 0.8.0+): addresses only, to learn EA's promo background names.
    if (route === "/helper/images" && m === "POST") return json({ data: await importCardArt(db, await body(req, MAX_STORE_BODY)) });
    if (route === "/card-art" && m === "GET") return json({ data: await listCardArt(db) });
    if (route === "/helper/account" && m === "POST") return json({ data: await importAccount(db, userId, await body(req, MAX_STORE_BODY)) });
    if (route === "/account" && m === "GET") return json({ data: await accountOverview(db, userId, platformParam(url.searchParams.get("platform"))) });
    if (route === "/account" && m === "DELETE") return json({ data: await clearAccount(db, userId, platformParam(url.searchParams.get("platform"))) });

    // SBC Solver: the SBCs the helper saw, requirement text → requirements, and the cheapest squad from your club.
    // Trade log: buys and sales the helper saw on the user's piles, after-tax profit per flip, and what's still held.
    if (route === "/trades" && m === "GET") return json({ data: await tradeOverview(db, userId, platformParam(url.searchParams.get("platform"))) });
    if (route === "/trades/buy-price" && m === "POST") {
      const b = obj(await body(req));
      return json({ data: await setBuyPrice(db, userId, platformParam(typeof b.platform === "string" ? b.platform : null), b.item_id, b.price) });
    }
    // Price alerts: Discord DMs for watchlist targets and big moves (the bot sends them after each price refresh).
    if (route === "/alerts/settings" && m === "GET") return json({ data: await getAlertSettings(db, userId) });
    if (route === "/alerts/settings" && m === "POST") return json({ data: await setAlertSettings(db, userId, obj(await body(req))) });
    // Evolutions finder: live evolutions the helper saw (or one pasted), matched to the user's club cards and squad.
    if (route === "/evolutions" && m === "GET") return json({ data: await runWorkspace(() => evolutionsOverview(db, userId, platformParam(url.searchParams.get("platform")))) });
    if (route === "/evolutions/check" && m === "POST") return json({ data: await runWorkspace(async () => checkPastedEvolution(db, userId, obj(await body(req)))) });
    if (route === "/sbc" && m === "GET") return json({ data: await sbcOverview(db, userId, platformParam(url.searchParams.get("platform"))) });
    if (route === "/sbc/parse" && m === "POST") {
      const b = obj(await body(req));
      if (typeof b.text !== "string" || !b.text.trim()) throw new FutError("Paste the SBC's requirements as text.");
      const r = parseRequirements(b.text.slice(0, 4000));
      return json({ data: { ...r, lines: r.requirements.map(describeRequirement) } });
    }
    if (route === "/sbc/solve" && m === "POST") {
      const b = obj(await body(req));
      return json({ data: await runWorkspace(() => solveForUser(db, userId, platformParam(typeof b.platform === "string" ? b.platform : url.searchParams.get("platform")), parseSolveBody(b))) });
    }

    if ((route === "/club/import" || route === "/helper/club") && m === "POST") {
      const result = await importClub(db, userId, await body(req, MAX_CLUB_BODY));
      // Synced cards carry EA item ids, so prices captured before the sync can now find their card.
      let prices_linked = 0;
      try {
        prices_linked = (await (await marketFor(db)).relinkHeldCaptures(userId)).linked;
      } catch (e) { console.warn("[fut-api] relink after club sync:", e); }
      return json({ data: { ...result, prices_linked } });
    }
    // Club trade value: which synced cards are tradeable and what the tradeable copies sell for now (latest FUT.GG
    // price, or the user's own newer Web App capture), with totals before and after EA's 5% tax.
    if (route === "/club/value" && m === "GET") {
      const { data, error } = await db.rpc("club_trade_value", { p_user: userId, p_platform: platformParam(url.searchParams.get("platform")) });
      if (error) throw new FutError(`Club value is unavailable: ${error.message}`, 500);
      return json({ data });
    }

    // Daily strategy: today's buys, sells, transfer list fixes and budget split from prices, coins and club. Advice only.
    if (route === "/strategy" && m === "GET") return json({ data: await dailyStrategy(db, userId, platformParam(url.searchParams.get("platform")), { budget: intParam(url.searchParams.get("budget"), "budget", 0, 2_000_000_000) ?? null, risk: riskParam(url.searchParams.get("risk")) }) });
    // Champs / Rivals tracker: runs and games the user logs themselves.
    if (route === "/champs" && m === "GET") return json({ data: await champsOverview(db, userId, platformParam(url.searchParams.get("platform"))) });
    if (route === "/champs/runs" && m === "POST") return json({ data: await createRun(db, userId, obj(await body(req))) }, 201);
    const champRun = route.match(/^\/champs\/runs\/([^/]+)(\/games)?$/);
    if (champRun) {
      if (champRun[2] && m === "POST") return json({ data: await addGame(db, userId, champRun[1]!, obj(await body(req))) }, 201);
      if (!champRun[2] && m === "POST") return json({ data: await updateRun(db, userId, champRun[1]!, obj(await body(req))) });
      if (!champRun[2] && m === "DELETE") return json({ data: await deleteRun(db, userId, champRun[1]!) });
      return err(405, "Use POST or DELETE.");
    }
    const champGame = route.match(/^\/champs\/games\/([^/]+)$/);
    if (champGame && m === "DELETE") return json({ data: await deleteGame(db, userId, champGame[1]!) });
    // Card compare: 2-4 of any cards with full stats, chem styles applied, PlayStyles diff, metaratings and value.
    if (route === "/compare/cards" && m === "POST") return json({ data: await compareAnyCards(db, userId, obj(await body(req))) });
    // Metaratings: how good a card plays in each role (attributes, PlayStyles, body, chem style), and the best per position.
    if (route === "/meta/card" && m === "GET") return json({ data: await metaForCard(db, userId, url.searchParams.get("card_id") ?? "") });
    if (route === "/meta/top" && m === "GET") {
      const q = url.searchParams;
      return json({ data: await metaTop(db, userId, { position: q.get("position"), role: q.get("role"), max_price: q.get("max_price"), platform: q.get("platform"), owned_only: q.get("owned_only") === "1" }) });
    }
    // Price history graph: one card's FUT.GG price (twice daily + hourly hot cards) with market-wide drops marked.
    if (route === "/prices/history" && m === "GET") {
      const days = Number(url.searchParams.get("days") ?? 30);
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new FutError("days must be a whole number from 1 to 90.");
      return json({ data: await cardPriceHistory(db, userId, platformParam(url.searchParams.get("platform")), url.searchParams.get("card_id") ?? "", days) });
    }
    // Sell or keep: a verdict for every tradeable club card (saved squads, live evolutions, SBC fodder, FUT.GG trend).
    if (route === "/club/sell-or-keep" && m === "GET") {
      const platform = platformParam(url.searchParams.get("platform"));
      return json({ data: await runWorkspace(() => sellOrKeep(db, userId, platform, async () => new Map((await evolutionsOverview(db, userId, platform)).best_upgrades.map((b) => [b.card_id, { name: b.evolution, gain: b.gain }])))) });
    }

    if (route === "/managers" && m === "GET") return json({ data: await listManagers(db, userId) });
    if (route === "/managers" && m === "POST") return json({ data: await addManager(db, userId, parseManagerInput(await body(req))) }, 201);
    const manager = route.match(/^\/managers\/([^/]+)$/);
    if (manager) {
      if (m !== "DELETE") return err(405, "Use DELETE.");
      return (await deleteManager(db, userId, manager[1]!)) ? json({ data: { deleted: manager[1] } }) : err(404, "Manager not found.");
    }

    // ---- the squad workspace (XI Lab's builder, Chemistry Surgeon and optimizer). A squad is sent whole, or by saved id.
    if (route === "/formations" && m === "GET") return json({ data: Object.keys(FORMATIONS) });
    // Each formation's slots, positions and pitch rows (row 0 = goalkeeper), for drawing the pitch.
    if (route === "/formations/slots" && m === "GET") return json({ data: FORMATIONS });
    if (route === "/squads/new" && m === "POST") {
      const b = obj(await body(req));
      const formation = typeof b.formation === "string" ? b.formation.trim() : "";
      const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : undefined;
      const budget = b.budget === undefined ? 0 : Number(b.budget);
      if (!Number.isInteger(budget) || budget < 0 || budget > 100_000_000) throw new FutError("budget must be a whole number of coins.");
      // A blank squad, not saved until the user saves it.
      return json({ data: await runWorkspace(() => Promise.resolve().then(() => createSquad({ formation, name, owner_id: userId, budget }))) });
    }
    if (route.startsWith("/squads")) {
      const ws = await workspaceFor(db);
      if (route === "/squads" && m === "GET") return json({ data: await runWorkspace(() => ws.listSquads(userId)) });
      if (route === "/squads" && m === "POST") {
        // The squad is always saved as the caller's, whatever owner_id it arrived with.
        const squad = { ...obj(await body(req)), owner_id: userId };
        return json({ data: await runWorkspace(() => ws.saveSquad(userId, squad)) });
      }
      if (route === "/squads/save-as" && m === "POST") {
        const b = obj(await body(req));
        const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
        if (!name) throw new FutError("Give the new squad a name.");
        return json({ data: await runWorkspace(() => ws.saveSquadAs(userId, { ...obj(b.squad), owner_id: userId }, name)) }, 201);
      }
      if (route === "/squads/chemistry" && m === "POST") {
        const b = obj(await body(req));
        return json({ data: await runWorkspace(() => ws.calculateChemistry(userId, squadRef(b.squad))) });
      }
      if (route === "/squads/diagnose" && m === "POST") {
        const b = obj(await body(req));
        return json({ data: await runWorkspace(() => ws.diagnose(userId, squadRef(b.squad), slotName(b.slot, false))) });
      }
      if (route === "/squads/assign" && m === "POST") {
        // Puts a card in a slot and returns the edited squad; nothing is saved until POST /squads.
        const b = obj(await body(req));
        return json({ data: await runWorkspace(async () => {
          const squad = squadSchema.parse({ ...obj(b.squad), owner_id: userId }) as Squad;
          return assignCard(squad, slotName(b.slot, true)!, await incomingCard(db, userId, b));
        }) });
      }
      if (route === "/squads/formation" && m === "POST") {
        // Switch formation, keeping every card (same slot name, then a slot it plays, then any free slot). Not saved.
        const b = obj(await body(req));
        if (typeof b.formation !== "string" || !FORMATIONS[b.formation]) throw new FutError(`formation must be one of: ${Object.keys(FORMATIONS).join(", ")}.`);
        return json({ data: await runWorkspace(async () => setFormation(squadSchema.parse({ ...obj(b.squad), owner_id: userId }) as Squad, b.formation as string)) });
      }
      if ((route === "/squads/best" || route === "/squads/suggest") && m === "POST") {
        // Best XI from the user's club cards (one formation or all of them), or ranked picks for one slot. by: ovr | chem.
        const b = obj(await body(req));
        const by = b.by === "chem" ? "chem" : b.by === "ovr" || b.by === undefined ? "ovr" : null;
        if (!by) throw new FutError('by must be "ovr" or "chem".');
        return json({ data: await runWorkspace(async () => {
          const squad = squadSchema.parse({ ...obj(b.squad), owner_id: userId }) as Squad;
          const [rules, mine] = await Promise.all([activeRules(db), searchMyCards(db, userId, { all: true, owned_only: true })]);
          const pool = mine.map(toWorkspaceCard);
          if (route === "/squads/suggest") return suggestForSlot(squad, slotName(b.slot, true)!, pool, rules, by);
          const formation = b.formation === undefined ? squad.formation : b.formation;
          if (typeof formation !== "string" || (formation !== "all" && !FORMATIONS[formation])) throw new FutError(`formation must be "all" or one of: ${Object.keys(FORMATIONS).join(", ")}.`);
          if (!pool.length) throw new FutError("You have no club cards yet. Sync your club or add cards on My cards first.");
          return { by, owned_cards: pool.length, results: bestSquads(squad, formation, pool, rules, by) };
        }) });
      }
      if (route === "/squads/roles" && m === "POST") {
        // Each squad card's FC 27 player roles (+ / ++) for the position it plays.
        const b = obj(await body(req));
        return json({ data: await runWorkspace(async () => squadRoles(db, userId, squadSchema.parse({ ...obj(b.squad), owner_id: userId }) as Squad)) });
      }
      if (route === "/squads/import" && m === "POST") {
        // Type your squad or upload a screenshot/list: matched to your cards and the market card list, placed into
        // the squad sent along. Nothing is saved until POST /squads.
        const b = obj(await body(req, MAX_SQUAD_IMPORT_BODY));
        const text = typeof b.text === "string" ? b.text : null;
        const image = importImage(b.image);
        const env = deps.env ?? ((k: string) => Deno.env.get(k));
        const perHour = Number(env("FUT_IMPORT_AI_PER_HOUR")) || AI_IMPORTS_PER_HOUR;
        const fetchFn = (deps.fetch as unknown as typeof fetch | undefined) ?? fetch;
        const result = await runWorkspace(async () => {
          const squad = squadSchema.parse({ ...obj(b.squad), owner_id: userId }) as Squad;
          return importSquad(db, userId, squad, { text, image }, env, fetchFn, {
            beforeAi: () => { if (!aiImportAllowed(userId, perHour)) throw new FutError("That's a lot of squad reads this hour. Try again later, or type the squad as a list.", 429); },
          });
        });
        return json({ data: result });
      }
      if (route === "/squads/preview" && m === "POST") {
        const b = obj(await body(req));
        return json({ data: await runWorkspace(async () => ws.previewAssign(userId, squadRef(b.squad), slotName(b.slot, true)!, await incomingCard(db, userId, b))) });
      }
      if (route === "/squads/optimize" && m === "POST") {
        const b = obj(await body(req));
        const result = await runWorkspace(() => ws.optimize(userId, squadRef(b.squad), { goal: obj(b.goal) as never, options: b.options as never }));
        await logRun(db, userId, { squad: typeof b.squad === "string" ? b.squad : null, kind: "optimize", input: { goal: b.goal, options: b.options }, result, via: "web" });
        return json({ data: result });
      }
      if (route === "/squads/compare" && m === "POST") {
        const b = obj(await body(req));
        return json({ data: await runWorkspace(() => ws.compare(userId, squadRef(b.a), squadRef(b.b), b.base === undefined ? undefined : squadRef(b.base))) });
      }
      const one = route.match(/^\/squads\/([^/]+)$/);
      if (one) {
        const id = decodeURIComponent(one[1]!);
        if (m === "GET") return json({ data: await runWorkspace(() => ws.getSquad(userId, id)) });
        if (m === "DELETE") return (await deleteSquad(db, userId, id)) ? json({ data: { deleted: id } }) : err(404, "Squad not found.");
        return err(405, "Use GET or DELETE (save with POST /squads).");
      }
    }

    // ---- Player Ratings: every card on the market-wide list with its full stats, sorted and filtered by any stat, and
    // the player finder chat that turns "fast CB under 50k with good passing" into a ranked search.
    if (route === "/players/search" && m === "POST") {
      const b = obj(await body(req));
      return json({ data: await searchPlayers(db, userId, cleanPlayerQuery(b.query), {
        platform: platformParam(typeof b.platform === "string" ? b.platform : null),
        limit: intParam(b.limit === undefined ? null : String(b.limit), "limit", 1, 100) ?? 50,
        offset: intParam(b.offset === undefined ? null : String(b.offset), "offset", 0, 100_000) ?? 0,
      }) });
    }
    if (route === "/players/find" && m === "POST") {
      const b = obj(await body(req));
      if (typeof b.message !== "string" || !b.message.trim()) throw new FutError("Tell me what kind of player you're looking for.");
      if (b.message.length > MAX_FINDER_TEXT) throw new FutError(`Keep it under ${MAX_FINDER_TEXT} characters.`);
      const env = deps.env ?? ((k: string) => Deno.env.get(k));
      const perHour = Number(env("FUT_FINDER_AI_PER_HOUR")) || AI_FINDS_PER_HOUR;
      const fetchFn = (deps.fetch as unknown as typeof fetch | undefined) ?? fetch;
      return json({ data: await findPlayers(db, userId, {
        message: b.message,
        previous: b.previous && typeof b.previous === "object" ? cleanPlayerQuery(b.previous) : null,
        history: finderHistory(b.history),
        platform: platformParam(typeof b.platform === "string" ? b.platform : null),
      }, env, fetchFn, {
        beforeAi: () => { if (!aiImportAllowed(userId, perHour, aiFinds)) throw new FutError("That's a lot of player searches this hour. Try again later, or use the filters.", 429); },
      }) });
    }

    // ---- Knowledge bank: what the FUT community says about gameplay and strategy (knowledge.ts). Shared sources plus the
    // caller's own; the map, one topic, the source list, adding and deleting their own sources, and the Ask chat.
    if (route.startsWith("/knowledge/")) {
      const env = deps.env ?? ((k: string) => Deno.env.get(k));
      const fetchFn = (deps.fetch as unknown as typeof fetch | undefined) ?? fetch;
      const p = url.searchParams;
      const days = intParam(p.get("days"), "days", 1, 365);
      if (route === "/knowledge/status" && m === "GET") return json({ data: await knowledgeStatus(db, env) });
      if (route === "/knowledge/map" && m === "GET") {
        const category = p.get("category") || null;
        if (category && !(KB_CATEGORIES as readonly string[]).includes(category)) throw new FutError(`category must be one of ${KB_CATEGORIES.join(", ")}.`);
        return json({ data: await knowledgeMap(db, userId, days ?? 30, category) });
      }
      const tp = route.match(/^\/knowledge\/topics\/([a-z0-9-]{1,80})$/);
      if (tp && m === "GET") {
        const topic = await knowledgeTopic(db, userId, tp[1]!, days ?? 90);
        return topic ? json({ data: topic }) : err(404, "Nobody has talked about that topic in this period.");
      }
      if (route === "/knowledge/sources" && m === "GET") {
        return json({ data: await knowledgeSources(db, userId, p.get("mine") === "true", intParam(p.get("limit"), "limit", 1, 100) ?? 30, intParam(p.get("offset"), "offset", 0, 100_000) ?? 0) });
      }
      if (route === "/knowledge/sources" && m === "POST") {
        const b = obj(await body(req, MAX_ADD_TEXT * 4 + 8192));
        for (const k of ["url", "text", "title"]) if (b[k] !== undefined && b[k] !== null && typeof b[k] !== "string") throw new FutError(`${k} must be text.`);
        if (typeof b.text === "string" && b.text.length > MAX_ADD_TEXT) throw new FutError(`Paste up to ${MAX_ADD_TEXT.toLocaleString("en")} characters.`);
        if (!(b.url as string | undefined)?.trim() && !(b.text as string | undefined)?.trim()) throw new FutError("Add a link or paste some text.");
        if (!aiImportAllowed(userId, Number(env("FUT_KB_ADDS_PER_HOUR")) || KB_ADDS_PER_HOUR, kbAdds)) throw new FutError("That's a lot of sources this hour. Try again later.", 429);
        return json({ data: await addSource(db, userId, { url: b.url as string, text: b.text as string, title: b.title as string, share: b.share === true }, env, fetchFn) }, 201);
      }
      const sd = route.match(/^\/knowledge\/sources\/([0-9a-f-]{36})$/);
      if (sd && m === "DELETE") return (await deleteKnowledgeSource(db, userId, sd[1]!)) ? json({ data: { deleted: sd[1] } }) : err(404, "You can only delete sources you added.");
      if (route === "/knowledge/ask" && m === "POST") {
        const b = obj(await body(req));
        if (typeof b.question !== "string" || !b.question.trim()) throw new FutError("Ask a question about FUT gameplay or strategy.");
        if (b.question.length > MAX_QUESTION) throw new FutError(`Keep it under ${MAX_QUESTION} characters.`);
        const history: AskTurn[] = (Array.isArray(b.history) ? b.history.slice(-6) : []).flatMap((t: unknown) => {
          const o = t && typeof t === "object" ? t as Record<string, unknown> : {};
          return (o.role === "user" || o.role === "assistant") && typeof o.text === "string" && o.text.trim() ? [{ role: o.role, text: o.text.slice(0, 1500) } as AskTurn] : [];
        });
        const perHour = Number(env("FUT_KB_ASK_PER_HOUR")) || AI_ASKS_PER_HOUR;
        return json({ data: await ask(db, userId, b.question, history, env, fetchFn, () => {
          if (!aiImportAllowed(userId, perHour, aiAsks)) throw new FutError("That's a lot of questions this hour. Try again later.", 429);
        }) });
      }
      return err(404, "No such knowledge bank route.");
    }

    // ---- Market Lab (research and decision support; never buys, sells or bids). Prices are the caller's own imports.
    if (route.startsWith("/market")) {
      const mk = await marketFor(db);
      const p = url.searchParams;
      if (route === "/market/sources" && m === "GET") return json({ data: mk.getDataSourceStatus() });
      if (route === "/market/overview" && m === "GET") return json({ data: await runWorkspace(() => mk.getMarketOverview(userId, { platform: platformParam(p.get("platform")) })) });
      if (route === "/market/opportunities" && m === "GET") {
        const q = parse(scanRequestSchema, {
          platform: p.get("platform") || undefined,
          status: p.get("status") ? p.get("status")!.split(",") : undefined,
          max_price: intParam(p.get("max_price"), "max_price", 0, 15_000_000),
          category: p.get("category") || undefined,
          limit: intParam(p.get("limit"), "limit", 1, 200),
          offset: intParam(p.get("offset"), "offset", 0, 100_000),
        });
        return json({ data: await runWorkspace(() => mk.findMarketOpportunities(userId, q)) });
      }
      const ci = route.match(/^\/market\/cards\/([^/]+)$/);
      if (ci && m === "GET") return json({ data: await runWorkspace(() => mk.getCardMarketIntelligence(userId, marketCardId(ci[1]), { platform: platformParam(p.get("platform")) })) });
      const er = route.match(/^\/market\/cards\/([^/]+)\/ea-reference$/);
      if (er && m === "GET") return json({ data: await cardEaReference(db, userId, marketCardId(er[1]), platformParam(p.get("platform"))) });
      const rv = route.match(/^\/market\/cards\/([^/]+)\/relative-value$/);
      if (rv && m === "GET") {
        const others = (p.get("others") ?? "").split(",").filter(Boolean).slice(0, 10).map(marketCardId);
        return json({ data: await runWorkspace(() => mk.compareCardRelativeValue(userId, marketCardId(rv[1]), { platform: platformParam(p.get("platform")), others })) });
      }
      if (route === "/market/thesis" && m === "POST") {
        const input = parse(thesisInputSchema, await body(req));
        marketCardId(input.card_id);
        return json({ data: await runWorkspace(() => mk.analyzeTradeThesis(userId, input)) });
      }
      if (route === "/market/compare-squad" && m === "POST") {
        const b = obj(await body(req));
        const ws = await workspaceFor(db);
        return json({ data: await runWorkspace(async () => {
          const ref = squadRef(b.squad);
          const squad = typeof ref === "string" ? await ws.getSquad(userId, ref) : { ...ref, owner_id: userId };
          return mk.compareInMySquad(userId, marketCardId(b.card_id), squad, { platform: platformParam(b.platform) });
        }) });
      }
      if (route === "/market/watchlist" && m === "GET") return json({ data: await runWorkspace(() => mk.getWatchlist(userId)) });
      if (route === "/market/watchlist" && m === "POST") {
        const w = parse(watchItemInputSchema, await body(req));
        marketCardId(w.card_id);
        return json({ data: await runWorkspace(() => mk.addToWatchlist(userId, w)) }, 201);
      }
      const wl = route.match(/^\/market\/watchlist\/([^/]+)$/);
      if (wl && m === "DELETE") {
        await runWorkspace(() => mk.removeFromWatchlist(userId, marketCardId(wl[1]), platformParam(p.get("platform"))));
        return json({ data: { deleted: wl[1] } });
      }
      if (route === "/market/prices/import" && m === "POST") return json({ data: await importPrices(db, userId, await body(req, MAX_IMPORT_BODY)) });
      // Community price pool: opt in to share your captures, and pull pooled prices for your own cards.
      if (route === "/market/sharing" && m === "GET") return json({ data: await getSharing(db, userId) });
      if (route === "/market/sharing" && m === "POST") {
        const b = obj(await body(req));
        if (typeof b.sharing !== "boolean") throw new FutError("sharing must be true or false.");
        return json({ data: await setSharing(db, userId, b.sharing) });
      }
      if (route === "/market/import/community" && m === "POST") {
        return json({ data: await runWorkspace(() => pullCommunity(db, userId, mk)) });
      }
      // Third-party prices from the public fc27-market API, for the caller's own cards only (Jeff's request).
      if (route === "/market/feeds/fc27-market" && m === "GET") return json({ data: await fc27MarketStatus(db) });
      if (route === "/market/feeds/futgg" && m === "GET") return json({ data: await futggStatus(db) });
      // Market cards: the FUT.GG card list with latest prices, filtered and paged in SQL.
      if (route === "/market/cards" && m === "GET") {
        const p = url.searchParams, text = (k: string) => (p.get(k) ?? "").trim() || null;
        const position = text("position"), type = text("type"), sort = text("sort") ?? "price_desc";
        if (position && !/^(GK|RB|CB|LB|CDM|CM|CAM|RM|LM|RW|LW|ST)$/.test(position)) throw new FutError("position must be a position code like ST or CB.");
        if (type && !["icon", "hero", "promo", "base"].includes(type)) throw new FutError("type must be icon, hero, promo or base.");
        if (!["price_desc", "price_asc", "rating_desc", "change_desc", "change_asc", "name"].includes(sort)) throw new FutError("Unknown sort.");
        const q = text("q");
        if (q && q.length > 60) throw new FutError("Search is too long.");
        const { data, error } = await db.rpc("futgg_market_cards", {
          p_platform: platformParam(p.get("platform")), p_q: q, p_position: position, p_type: type,
          p_min_rating: intParam(p.get("min_rating"), "min_rating", 1, 99) ?? null, p_max_rating: intParam(p.get("max_rating"), "max_rating", 1, 99) ?? null,
          p_min_price: intParam(p.get("min_price"), "min_price", 0, 15_000_000) ?? null, p_max_price: intParam(p.get("max_price"), "max_price", 0, 15_000_000) ?? null,
          p_sort: sort, p_limit: intParam(p.get("limit"), "limit", 1, 100) ?? 50, p_offset: intParam(p.get("offset"), "offset", 0, 100_000) ?? 0,
        });
        if (error) throw new FutError(`Market cards are unavailable: ${error.message}`, 500);
        return json({ data });
      }
      if (route === "/market/import/fc27-market" && m === "POST") {
        return json({ data: await runWorkspace(() => pullFc27Market(db, userId, mk, deps.fetch)) });
      }
      if (route === "/market/held" && m === "GET") return json({ data: await runWorkspace(() => mk.getHeldCaptures(userId)) });
      if (route === "/market/held/relink" && m === "POST") return json({ data: await runWorkspace(() => mk.relinkHeldCaptures(userId)) });
      if (route === "/market/held/link" && m === "POST") {
        const b = obj(await body(req));
        const ea = Number(b.ea_item_id);
        if (!Number.isInteger(ea) || ea <= 0) throw new FutError("ea_item_id must be EA's item id (a whole number).");
        return json({ data: await runWorkspace(() => mk.linkHeldCapture(userId, ea, marketCardId(b.card_id))) });
      }
      return err(404, "No such Market Lab route.");
    }
    return err(404, "No such XI Lab route.");
  } catch (e) {
    if (e instanceof FutError) return err(e.status, e.message);
    console.error("[fut-api] error:", e);
    return err(500, "Something went wrong in XI Lab. Try again.");
  }
}
