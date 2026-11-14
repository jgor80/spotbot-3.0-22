// Coins plan route: joins account coins, the squad you play, sell or keep and the transfer list into one plan.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

Deno.test("GET /coach: collects sold coins, sells unused cards but never a starter of the squad you play", async () => {
  const db = futMemoryDb(seededRules()) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  db.rpc = (fn) => Promise.resolve(fn === "card_price_trend" ? { data: { published_at: "2026-11-14T06:00:00Z", floors: {}, items: [
    { ea_item_id: 101, price: 20_000, d1: 21_000, d3: 23_000, d7: 24_000, low14: 20_000, high14: 25_000, points: 20 },
    { ea_item_id: 102, price: 20_000, d1: 21_000, d3: 23_000, d7: 24_000, low14: 20_000, high14: 25_000, points: 20 },
  ] }, error: null } : { data: null, error: { message: "not in this test" } });
  db.tables.account_state = [{ user_id: ME, platform: "console", balance: { coins: 12_000 }, balance_at: "2026-11-14T09:00:00Z",
    tradepile: [{ ea_item_id: 5, state: "sold", buy_now: 10_000, current_bid: 10_000 }],
    sbcs: [{ set_id: 1, name: "Marquee Matchups", repeatable: false, times_completed: 0, end_at: "2099-01-01T00:00:00Z", awards: [] }] }];
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const add = async (name: string, overall: number, key: string) => {
    const r = await call("POST", "/v1/cards", { player_name: name, overall, positions: ["ST"], evidence: "game_data", owned: true, tradeable: true });
    (db.tables.player_cards as Record<string, unknown>[]).find((c) => c.id === r.data.data.id)!.source_card_key = key;
  };
  await add("Starter", 88, "101");
  await add("Spare", 86, "102");
  // The squad opened in the Web App: only Starter plays
  db.tables.game_squads = [{ user_id: ME, squad_key: "a", name: "Main", formation_code: null, active: true, seen_at: "2026-11-14T09:00:00Z", players: [{ index: 0, ea_item_id: 101 }] }];

  const r = await call("GET", "/v1/coach?platform=console");
  assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.data)}`);
  const d = r.data.data;
  assert(d.squad.source === "game", `squad source ${d.squad.source}`);
  assert(d.money.coins === 12_000 && d.money.sold === 9_500, JSON.stringify(d.money));
  const kinds = d.steps.map((s: { kind: string }) => s.kind);
  assert(kinds[0] === "collect" && kinds.includes("sell") && kinds.includes("sbc"), kinds.join());
  const sell = d.steps.find((s: { kind: string }) => s.kind === "sell");
  assert(sell.items.length === 1 && sell.items[0].name === "Spare", JSON.stringify(sell.items));
  assert(d.headline?.title, "has a headline");

  // Sell or Keep itself now keeps the starter too
  const k = await call("GET", "/v1/club/sell-or-keep?platform=console");
  const starter = k.data.data.advice.find((a: { name: string }) => a.name === "Starter");
  assert(starter.verdict === "keep" && starter.reason.includes("the squad you play"), JSON.stringify(starter));
});
