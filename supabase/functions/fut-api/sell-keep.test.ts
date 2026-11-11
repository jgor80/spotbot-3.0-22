// Sell or keep route: club cards with verdicts from saved squads, live evolutions and the price trend.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

Deno.test("GET /club/sell-or-keep: squad cards kept, evolution cards kept, falling cards sold, untradeables left out", async () => {
  const db = futMemoryDb(seededRules()) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  const asked: unknown[] = [];
  db.rpc = (fn, args) => {
    asked.push(args.p_ids);
    return Promise.resolve(fn === "card_price_trend" ? { data: { published_at: "2026-11-10T06:00:00Z", floors: { "84": 900 }, items: [
      { ea_item_id: 101, price: 20_000, d1: 21_000, d3: 23_000, d7: 24_000, low14: 20_000, high14: 25_000, points: 20 },
      { ea_item_id: 102, price: 5000, d1: 5000, d3: 5000, d7: 5000, low14: 5000, high14: 5000, points: 20 },
      { ea_item_id: 103, price: 1000, d1: 1000, d3: 1000, d7: 1000, low14: 1000, high14: 1000, points: 20 },
    ] }, error: null } : { data: null, error: { message: "?" } });
  };
  db.tables.account_state = [{ user_id: ME, platform: "console", evolutions_at: "2026-11-10T04:00:00Z", shape: {}, evolutions: [
    { evo_id: 31, name: "Maestro", description: null, end_at: null, coins: null, points: null, status: null,
      requirements: [{ type: "OVR", values: [80], scope: "LOWER" }], levels: [{ upgrades: [{ type: "OVR", values: [10], scope: null }] }] },
  ] }];
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const add = async (name: string, overall: number, key: string, tradeable: boolean | null = true) => {
    const r = await call("POST", "/v1/cards", { player_name: name, overall, positions: ["ST"], evidence: "game_data", owned: true, tradeable });
    const row = (db.tables.player_cards as Record<string, unknown>[]).find((c) => c.id === r.data.data.id)!;
    row.source_card_key = key;
    return r.data.data.id as string;
  };
  const striker = await add("Striker", 88, "101");
  await add("Falling", 86, "101");
  await add("Steady", 80, "102");
  await add("Fodder", 84, "103");
  await add("Locked", 90, "104", false);
  db.tables.squads = [{ id: "s1", user_id: ME, name: "Main", formation: "4-3-3", updated_at: "2026-11-10T00:00:00Z" }];
  db.tables.squad_slots = [{ squad_id: "s1", slot: "ST", position_code: "ST", card_id: striker }];
  const r = await call("GET", "/v1/club/sell-or-keep?platform=console");
  assert(r.status === 200, JSON.stringify(r.data));
  const d = r.data.data, by = (n: string) => d.advice.find((a: { name: string }) => a.name === n);
  assert(by("Striker").verdict === "keep" && by("Falling").verdict === "sell_now" && by("Fodder").verdict === "hold_fodder", JSON.stringify(d.advice.map((a: { name: string; verdict: string }) => [a.name, a.verdict])));
  assert(by("Steady").verdict === "keep_evo" && /Maestro/.test(by("Steady").reason), JSON.stringify(by("Steady")));
  assert(!by("Locked") && d.untradeable_skipped === 1, "untradeable left out");
  assert(d.advice[0].name === "Falling" && d.totals.sell_now_coins === 19_000, JSON.stringify(d.totals));
});
