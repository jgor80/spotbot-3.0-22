// Price history route: the caller's own card (or a catalogue card), matched by EA item id; nobody else's.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222", OTHER = "33333333-3333-4333-8333-333333333333";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

Deno.test("GET /prices/history returns points, stats and market drops for my card only", async () => {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  const asked: Record<string, unknown>[] = [];
  db.rpc = (fn, args) => {
    asked.push(args);
    return Promise.resolve(fn === "card_price_history" ? { data: { points: [{ t: "2026-11-09T06:00:00Z", price: 10_000, kind: "full" }, { t: "2026-11-10T05:00:00Z", price: 9000, kind: "hourly" }], market_drops: [{ t: "2026-11-09T18:00:00Z", median_move: -6.2, cards: 2100 }] }, error: null } : { data: null, error: { message: "?" } });
  };
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, user = ME, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const c = await call("POST", "/v1/cards", ME, { player_name: "Mine", overall: 85, positions: ["ST"], evidence: "game_data", owned: true });
  const id = c.data.data.id as string;
  (db.tables.player_cards as Record<string, unknown>[]).find((r) => r.id === id)!.source_card_key = "50331648";
  const r = await call("GET", `/v1/prices/history?platform=console&card_id=${id}&days=14`);
  assert(r.status === 200 && r.data.data.points.length === 2 && r.data.data.stats.latest === 9000 && r.data.data.market_drops[0].median_move === -6.2, JSON.stringify(r.data));
  assert(asked[0]!.p_ea_item_id === 50331648 && asked[0]!.p_days === 14, JSON.stringify(asked));
  assert((await call("GET", `/v1/prices/history?platform=console&card_id=${id}`, OTHER)).status === 404, "someone else's card");
  assert((await call("GET", `/v1/prices/history?platform=console&card_id=${id}&days=500`)).status === 400, "days checked");
});
