// Metarating routes: one card (catalogue stats borrowed by EA item id) and the best cards for a position.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const stats = (v: number) => ({ acceleration: v, sprint_speed: v, finishing: v, positioning: v, composure: v, ball_control: v, dribbling: v, strength: 70, heading_accuracy: 70, jumping: 70, shot_power: v, reactions: v, short_passing: 75, vision: 75, agility: v });

Deno.test("GET /meta/card borrows catalogue stats; GET /meta/top re-scores the search's candidates", async () => {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  let asked: Record<string, unknown> | null = null;
  db.rpc = (fn, args) => {
    asked = args;
    return Promise.resolve(fn === "futgg_player_search" ? { data: { platform: "console", published_at: "x", sort: "fit", direction: "desc", catalogue_cards: 2, with_stats: 2, total: 2, cards: [
      { id: "a", player_name: "Slow", overall: 90, position: "ST", alt_positions: [], price: 50_000, stats: stats(78), playstyles: [], playstyles_plus: [], height_cm: 190, accelerate_type: "LENGTHY", weak_foot: 3, skill_moves: 3 },
      { id: "b", player_name: "Rocket", overall: 86, position: "ST", alt_positions: ["LW"], price: 20_000, stats: stats(90), playstyles: ["Quick Step"], playstyles_plus: ["Finesse Shot"], height_cm: 178, accelerate_type: "EXPLOSIVE", weak_foot: 4, skill_moves: 4, owned: true },
    ] }, error: null } : { data: null, error: { message: "?" } });
  };
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const top = await call("GET", "/v1/meta/top?position=ST&role=Advanced%20Forward&max_price=60000&platform=console");
  assert(top.status === 200 && top.data.data.cards[0].name === "Rocket" && top.data.data.cards[0].meta.role === "Advanced Forward", JSON.stringify(top.data));
  const q = (asked as unknown as { p_query: { positions: string[]; max_price: number; weights: { stat: string }[] } }).p_query;
  assert(q.positions[0] === "ST" && q.max_price === 60_000 && q.weights.some((w) => w.stat === "finishing"), JSON.stringify(q));
  assert((await call("GET", "/v1/meta/top?position=XX")).status === 400 && (await call("GET", "/v1/meta/top?position=ST&role=Sweeper")).status === 400, "bad position/role");
  // One of my cards: stats come from the catalogue card with the same EA item id.
  const mine = await call("POST", "/v1/cards", { player_name: "Mine", overall: 84, positions: ["CB"], evidence: "game_data", owned: true });
  const cat = await call("POST", "/v1/cards", { player_name: "Mine", overall: 84, positions: ["CB"], evidence: "game_data" });
  const rows = db.tables.player_cards as Record<string, unknown>[];
  rows.find((r) => r.id === mine.data.data.id)!.source_card_key = "777";
  Object.assign(rows.find((r) => r.id === cat.data.data.id)!, { source_card_key: "777", source_id: "futgg_catalogue", owner_user_id: null });
  db.tables.card_attributes = [...(db.tables.card_attributes ?? []).filter((r) => r.card_id !== cat.data.data.id), { card_id: cat.data.data.id, pac: 80, detail: { defensive_awareness: 88, standing_tackle: 87, interceptions: 86, strength: 90, jumping: 85, heading_accuracy: 84, sliding_tackle: 85, acceleration: 75, sprint_speed: 80, aggression: 88, short_passing: 70, long_passing: 65, composure: 75, vision: 55 }, height_cm: 191, alt_positions: [] }];
  const one = await call("GET", `/v1/meta/card?card_id=${mine.data.data.id}`);
  assert(one.status === 200 && one.data.data.best.position === "CB" && !one.data.data.estimated && one.data.data.best.score >= 85, JSON.stringify(one.data));
  assert(/CB/.test(one.data.data.verdict), one.data.data.verdict);
});
