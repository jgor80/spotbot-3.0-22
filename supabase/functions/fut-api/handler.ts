// XI Lab's website API (gafferbot.app/fut), served at /api/functions/v1/fut-api/v1/... through the Worker.
// Signed-in users only (their GafferBot session); every route acts on the caller's own XI Lab data, keyed by
// their auth user id. No GafferBot club or server is needed. Off unless FUT_ENABLED=true.
// The MCP FUT tools call the same services (../_shared/fut/service.ts and XI Lab's workspace), so both always agree.
import {
  addCard, addManager, compareCards, deleteCard, deleteManager, deleteSquad, futEnabled, FutError, getCard, listManagers, logRun,
  parseCardInput, parseManagerInput, runWorkspace, searchMyCards, toWorkspaceCard, updateCard, workspaceFor, type FutDb,
} from "../_shared/fut/service.ts";
import { marketCardId, marketFor, MAX_IMPORT_ROWS, platformParam } from "../_shared/fut/market.ts";
import { scanRequestSchema, thesisInputSchema, watchItemInputSchema } from "../_shared/fut/xilab/market/index.ts";
import { assignCard, cardSchema, createSquad, FORMATIONS, squadSchema, type Squad, type WorkspaceCard } from "../_shared/fut/xilab/workspace/index.ts";

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
}

/** Price-history imports can be bigger than other requests (up to MAX_IMPORT_ROWS lines). */
const MAX_IMPORT_BODY = 1024 * 1024;

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

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!futEnabled(deps.env)) return err(404, "Not found");
  const userId = await deps.userFor(req);
  if (!userId) return err(401, "Sign in to GafferBot to use XI Lab.");
  const limited = deps.throttle?.(userId);
  if (limited) return limited;

  const url = new URL(req.url);
  const at = url.pathname.indexOf("/fut-api");
  const path = (at >= 0 ? url.pathname.slice(at + "/fut-api".length) : url.pathname).replace(/\/+$/, "");
  if (!path.startsWith("/v1")) return err(404, "This API is /fut-api/v1.");
  const route = path.slice(3) || "/";
  const m = req.method;
  const db = deps.db;

  try {
    if (route === "/health" && m === "GET") return json({ ok: true, api: "v1" });

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

    if (route === "/managers" && m === "GET") return json({ data: await listManagers(db, userId) });
    if (route === "/managers" && m === "POST") return json({ data: await addManager(db, userId, parseManagerInput(await body(req))) }, 201);
    const manager = route.match(/^\/managers\/([^/]+)$/);
    if (manager) {
      if (m !== "DELETE") return err(405, "Use DELETE.");
      return (await deleteManager(db, userId, manager[1]!)) ? json({ data: { deleted: manager[1] } }) : err(404, "Manager not found.");
    }

    // ---- the squad workspace (XI Lab's builder, Chemistry Surgeon and optimizer). A squad is sent whole, or by saved id.
    if (route === "/formations" && m === "GET") return json({ data: Object.keys(FORMATIONS) });
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
        });
        return json({ data: await runWorkspace(() => mk.findMarketOpportunities(userId, q)) });
      }
      const ci = route.match(/^\/market\/cards\/([^/]+)$/);
      if (ci && m === "GET") return json({ data: await runWorkspace(() => mk.getCardMarketIntelligence(userId, marketCardId(ci[1]), { platform: platformParam(p.get("platform")) })) });
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
      if (route === "/market/prices/import" && m === "POST") {
        const b = obj(await body(req, MAX_IMPORT_BODY));
        if (typeof b.text !== "string" || !b.text.trim()) throw new FutError("Send the price history as text: CSV with card_id,platform,price,observed_at, or a JSON array.");
        if (b.text.split("\n").length > MAX_IMPORT_ROWS + 1) throw new FutError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
        const r = await runWorkspace(() => mk.importPriceHistory(userId, b.text as string));
        return json({ data: { ...r, rejected: r.rejected.slice(0, 100).map((x) => ({ line: x.line, reason: x.reason })) } });
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
