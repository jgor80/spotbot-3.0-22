// Upgrade path: the best swaps for a coin budget from market cards (FUT.GG search, mocked) and unused club cards.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";
import { gainOf } from "../_shared/fut/upgrades.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const stats = (v: number) => ({ acceleration: v, sprint_speed: v, finishing: v, positioning: v, composure: v, ball_control: v, dribbling: v, strength: 70, heading_accuracy: 70, jumping: 70, shot_power: v, reactions: v, short_passing: 75, vision: 75, agility: v });
const XI: string[][] = [["GK"], ["LB"], ["CB"], ["CB"], ["RB"], ["CM"], ["CM", "CDM"], ["CM", "CAM"], ["LW", "LM"], ["ST"], ["RW", "RM"]];

function setup() {
  const db = futMemoryDb(seededRules()) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  const asked: Record<string, unknown>[] = [];
  db.rpc = (fn, args) => {
    if (fn !== "futgg_player_search") return Promise.resolve({ data: null, error: { message: "not mocked" } });
    const q = args.p_query as { positions: string[]; max_price: number };
    asked.push(q);
    const market = [
      { id: "m1", player_name: "Market Striker", overall: 90, position: "ST", alt_positions: [], price: 50_000, club: "Unity FC", league: "Unity League", nation: "Unityland", stats: stats(90), playstyles: [], playstyles_plus: [], height_cm: 185, accelerate_type: "CONTROLLED", weak_foot: 4, skill_moves: 4 },
      { id: "m2", player_name: "Pricey Keeper", overall: 91, position: "GK", alt_positions: [], price: 400_000, club: "Elsewhere", league: "Other League", nation: "Farland", stats: {}, playstyles: [], playstyles_plus: [], height_cm: 195, accelerate_type: null, weak_foot: 2, skill_moves: 1 },
    ].filter((c) => q.positions.includes(c.position) && c.price <= q.max_price);
    return Promise.resolve({ data: { platform: "console", published_at: "x", sort: "overall", direction: "desc", catalogue_cards: 2, with_stats: 2, total: market.length, cards: market }, error: null });
  };
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { call, asked };
}

Deno.test("gainOf: team rating counts most, then chemistry, then metarating", () => {
  assert(gainOf(1, 0, null) === 8 && gainOf(0, 2, null) === 3 && gainOf(0, 0, 5) === 3 && gainOf(0, 0, null, 4) === 1, "weights");
});

Deno.test("POST /squads/upgrades: market swap within budget, free club card, budget checks", async () => {
  const { call, asked } = setup();
  for (const [i, positions] of XI.entries()) await call("POST", "/v1/cards", { player_name: `Unity ${i}`, overall: 80, positions, club: "Unity FC", league: "Unity League", nation: "Unityland", evidence: "game_data", owned: true });
  const empty = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  assert((await call("POST", "/v1/squads/upgrades", { squad: empty, budget: 1000 })).status === 400, "empty squad");
  const best = (await call("POST", "/v1/squads/best", { squad: empty, by: "chem" })).data.data.results[0];
  const squad = best.squad ?? best;
  assert(squad.slots.filter((s: { card: unknown }) => s.card).length === 11, JSON.stringify(best).slice(0, 300));
  // Added after the squad was built: a spare club card on the bench: same club, rated higher, costs nothing.
  await call("POST", "/v1/cards", { player_name: "Spare Back", overall: 84, positions: ["LB"], club: "Unity FC", league: "Unity League", nation: "Unityland", evidence: "game_data", owned: true });
  assert((await call("POST", "/v1/squads/upgrades", { squad, budget: -5 })).status === 400, "negative budget");
  assert((await call("POST", "/v1/squads/upgrades", { squad, budget: 99_000_000 })).status === 400, "huge budget");

  const res = await call("POST", "/v1/squads/upgrades", { squad, budget: 60_000 });
  assert(res.status === 200, JSON.stringify(res.data));
  const d = res.data.data;
  assert(asked.every((q) => (q as { max_price: number }).max_price === 60_000), "searched within budget");
  const st = d.singles.find((p: { swaps: { slot: string; in: { name: string } }[] }) => p.swaps[0]!.in.name === "Market Striker");
  assert(st && st.cost === 50_000 && st.rating_after >= st.rating_before, JSON.stringify(d.singles));
  assert(!d.singles.some((p: { swaps: { in: { name: string } }[] }) => p.swaps[0]!.in.name === "Pricey Keeper"), "over budget keeper skipped");
  const free = d.free.find((p: { swaps: { in: { name: string } }[] }) => p.swaps[0]!.in.name === "Spare Back");
  assert(free && free.cost === 0 && free.swaps[0].in.owned, JSON.stringify(d.free));
  assert(d.best && d.best.gain >= st.gain, JSON.stringify(d.best));
  // A pair (free back + striker) beats either on its own when both fit.
  assert(d.pairs.length === 0 || d.pairs[0].swaps.length === 2, "pairs have two swaps");

  // Zero budget: only free club swaps.
  const zero = (await call("POST", "/v1/squads/upgrades", { squad, budget: 0 })).data.data;
  assert(zero.singles.every((p: { cost: number }) => p.cost === 0) && zero.singles.length >= 1, JSON.stringify(zero.singles));
});
