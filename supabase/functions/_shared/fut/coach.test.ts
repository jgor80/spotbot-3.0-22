// Coins plan: the pure planner (what to do with your coins right now for your squad).
import { buildCoachPlan, MIN_GAIN, type CoachInput } from "./coach.ts";
import type { Advice } from "./sell-keep.ts";
import type { Plan } from "./upgrades.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const advice = (name: string, verdict: Advice["verdict"], after_tax: number): Advice => ({
  id: name, name, rating: 84, version: null, positions: ["CM"], ea_item_id: 1, purchase_price: null, trend: null, squads: [], evo: null, floor: null,
  verdict, reason: `${name} reason`, price: Math.ceil(after_tax / 0.95), after_tax, change_3d: null, change_7d: null, profit: null,
});
const plan = (inName: string, cost: number, gain: number, sells_for: number | null = null): Plan => ({
  swaps: [{ slot: "ST", position: "ST", cost, out: { id: "o", name: "Old Striker", rating: 82, meta: null, sells_for }, in: { id: `m-${inName}`, name: inName, rating: 87, owned: cost === 0, meta: null, card: {} as never } }],
  cost, net_cost: Math.max(0, cost - (sells_for ?? 0)), rating_before: 83, rating_after: 84, chem_before: 30, chem_after: 31, meta_gain: null, gain, per_10k: null,
});
const base = (over: Partial<CoachInput> = {}): CoachInput => ({
  coins: 20_000, coins_at: "2026-11-14T10:00:00Z",
  squad: { source: "game", note: "", name: "My squad", formation: "4-2-3-1", rating: 83, chemistry: 30 },
  sold: { count: 0, coins: 0 }, pile: [], advice: [], upgrades: { best: null, singles: [], pairs: [], free: [] },
  timing: { now: "", next: "Buy on Monday.", buy_bias: 0.5, sell_bias: 0, events: [], weekday: "Tuesday", uk_time: "10:00" },
  move: null, flips: [], sbc: { open: 0, ending: [], seen_at: null }, prices_at: null, ...over,
});

Deno.test("coins plan: collect, sell what you don't play, then buy the upgrade the sales pay for", () => {
  const p = buildCoachPlan(base({
    sold: { count: 2, coins: 9_500 },
    advice: [advice("Falling", "sell_now", 30_000), advice("Steady A", "sell", 10_000), advice("Steady B", "sell", 50_000), advice("Kept", "keep", 90_000), advice("Fodder", "hold_fodder", 900)],
    upgrades: { best: plan("Star", 65_000, 12), singles: [], pairs: [], free: [] },
  }));
  assert(p.steps.map((s) => s.kind).join() === "collect,sell,upgrade", p.steps.map((s) => s.kind).join());
  // 20k + 9.5k collected + 30k falling = 59.5k: needs one steady sale (10k) to reach 65k, not both
  const sell = p.steps.find((s) => s.kind === "sell")!;
  assert(sell.items!.map((i) => i.name).join() === "Falling,Steady A", sell.items!.map((i) => i.name).join());
  assert(p.headline.kind === "upgrade" && p.headline.title.includes("Star"), p.headline.title);
  assert(p.headline.detail.includes("Sell the cards you don't play first"), p.headline.detail);
  assert(p.money.left === 4_500, String(p.money.left));
  assert(!JSON.stringify(p.steps).includes("Kept"), "kept cards are never sold");
});

Deno.test("coins plan: no upgrade worth it, so grow the coins with the best affordable flip", () => {
  const p = buildCoachPlan(base({
    upgrades: { best: plan("Meh", 5_000, MIN_GAIN - 1), singles: [plan("Meh", 5_000, MIN_GAIN - 1)], pairs: [], free: [] },
    flips: [{ name: "Too dear", rating: 88, buy_at: 50_000, sell_at: 60_000, profit: 7_000, ea_item_id: 1 }, { name: "Cheap flip", rating: 85, buy_at: 8_000, sell_at: 9_500, profit: 1_000, ea_item_id: 2 }],
  }));
  assert(p.steps.map((s) => s.kind).join() === "save,flip", p.steps.map((s) => s.kind).join());
  assert(p.steps[1]!.title.includes("Cheap flip"), p.steps[1]!.title);
  assert(p.headline.kind === "flip", p.headline.kind);
});

Deno.test("coins plan: a bad time to buy says so; free club swaps and SBCs are listed; unknown coins asks for the helper", () => {
  const p = buildCoachPlan(base({
    coins: null,
    timing: { now: "", next: "At 18:00 UK the new promo packs land.", buy_bias: -1, sell_bias: 1, events: [], weekday: "Friday", uk_time: "12:00" },
    advice: [advice("Falling", "sell_now", 40_000)],
    upgrades: { best: plan("Star", 30_000, 10), singles: [], pairs: [], free: [plan("Bench guy", 0, 3)] },
    sbc: { open: 3, ending: [{ name: "Marquee", end_at: "2026-11-16T18:00:00Z" }], seen_at: null },
  }));
  assert(p.steps.map((s) => s.kind).join() === "setup,sell,swap,upgrade,sbc", p.steps.map((s) => s.kind).join());
  const up = p.steps.find((s) => s.kind === "upgrade")!;
  assert(up.detail.includes("Friday is usually an expensive time") && up.detail.includes("18:00 UK"), up.detail);
  assert(p.headline.detail.includes("buy after the dip"), p.headline.detail);
  assert(p.steps.find((s) => s.kind === "sbc")!.detail.includes("Marquee"), "names the SBC ending soonest");
});

Deno.test("coins plan: no club at all asks to sync first", () => {
  const p = buildCoachPlan(base({ squad: { source: "none", note: "Sync your club.", name: null, formation: null, rating: null, chemistry: null }, upgrades: null }));
  assert(p.headline.kind === "setup", p.headline.kind);
});
