// XI Lab's website API (gafferbot.app/fut), served at /api/functions/v1/fut-api/v1/... through the Worker.
// Signed-in users only (their GafferBot session); every route acts on the caller's own XI Lab data, keyed by
// their auth user id. No GafferBot club or server is needed. Off unless FUT_ENABLED=true.
// The MCP FUT tools call the same services (../_shared/fut/service.ts), so both always agree.
import {
  addCard, compareCards, deleteCard, deleteSquad, futEnabled, FutError, getCard, getSquad, listSquads, parseCardInput,
  parseSquadInput, saveSquad, searchMyCards, squadChemistry, updateCard, type FutDb,
} from "../_shared/fut/service.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const err = (status: number, message: string) => json({ error: message }, status);

const MAX_BODY = 32 * 1024;

export interface Deps {
  db: FutDb;
  /** The signed-in user's auth id, or null for anyone else (anon key, bot, no token). */
  userFor: (req: Request) => Promise<string | null>;
  /** Per-user throttle; returns a response when the caller is over it. */
  throttle?: (userId: string) => Response | null;
  env?: (k: string) => string | undefined;
}

async function body(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new FutError("Request body is too large.");
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw new FutError("Request body must be JSON."); }
}

function intParam(v: string | null, field: string, min: number, max: number): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new FutError(`${field} must be a whole number from ${min} to ${max}.`);
  return n;
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

    if (route === "/squads" && m === "GET") return json({ data: await listSquads(db, userId) });
    if (route === "/squads" && m === "POST") return json({ data: await saveSquad(db, userId, parseSquadInput(await body(req))) }, 201);
    const squad = route.match(/^\/squads\/([^/]+)$/);
    if (squad) {
      const id = squad[1]!;
      if (m === "GET") { const s = await getSquad(db, userId, id); return s ? json({ data: s }) : err(404, "Squad not found."); }
      if (m === "PUT") return json({ data: await saveSquad(db, userId, parseSquadInput(await body(req)), id) });
      if (m === "DELETE") return (await deleteSquad(db, userId, id)) ? json({ data: { deleted: id } }) : err(404, "Squad not found.");
      return err(405, "Use GET, PUT or DELETE.");
    }
    if (route === "/chemistry" && m === "POST") {
      const b = (await body(req)) as { squad_id?: unknown; swaps?: unknown };
      return json({ data: await squadChemistry(db, userId, { squad_id: b.squad_id, swaps: b.swaps }) });
    }
    return err(404, "No such XI Lab route.");
  } catch (e) {
    if (e instanceof FutError) return err(e.status, e.message);
    console.error("[fut-api] error:", e);
    return err(500, "Something went wrong in XI Lab. Try again.");
  }
}
