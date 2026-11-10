// Price alert routes: the player's settings, and the bot-only job that returns what to DM.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

Deno.test("alert settings and the price-alerts job", async () => {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string) => Promise<unknown> };
  db.rpc = (fn) => Promise.resolve(fn === "price_alert_candidates" ? { data: [{ user_id: ME, card_id: "c1", platform: "console", name: "Star", overall: 88, target_buy: 10000, target_sell: null, move_pct: null, price: 9000, previous_price: 9500, published_at: "x" }], error: null } : { data: null, error: { message: "?" } });
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), isBot: (req) => Promise.resolve(req.headers.get("x-bot") === "1"), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = { "x-test-user": ME }): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const s = await call("GET", "/v1/alerts/settings");
  assert(s.status === 200 && s.data.data.dm === true && s.data.data.move_pct === null, JSON.stringify(s.data));
  const u = await call("POST", "/v1/alerts/settings", { dm: true, move_pct: 12 });
  assert(u.data.data.move_pct === 12, JSON.stringify(u.data));
  assert((await call("POST", "/v1/alerts/settings", { move_pct: 1 })).status === 400, "too small");
  assert((await call("POST", "", { job: "price-alerts" }, {})).status === 401, "only the bot");
  const j = await call("POST", "", { job: "price-alerts" }, { "x-bot": "1" });
  assert(j.status === 200 && j.data.data.fired === 1 && j.data.data.deliveries[0].user_id === ME, JSON.stringify(j.data));
  const again = await call("POST", "", { job: "price-alerts" }, { "x-bot": "1" });
  assert(again.data.data.fired === 0, "state saved, no repeat");
});
