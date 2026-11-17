// Daily Strategy picking rules (Jeff, 2026-11-17: "most of the picks are still dropping some dramatically"): dips that
// are still falling are screened out, rising cards can be picked, and the replay of past refreshes chooses the rule
// whose picks really made money 2 days later.
import { buildStrategy, cardStats, chooseRule, marketTiming, replayRules, scoreBuys, type SeriesCard } from "./strategy.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const NOW = Date.parse("2026-11-17T09:00:00Z"), LATEST = "2026-11-17T06:00:00Z";
const ages = (n: number) => Array.from({ length: n }, (_, i) => (n - 1 - i) * 12);
const card = (id: number, prices: number[], extra: Partial<SeriesCard> = {}): SeriesCard => ({
  ea_item_id: id, name: `Player ${id}`, version: "Rare", rating: 80, position: "ST", is_icon: false, is_hero: false, tracked: true,
  prices, ages: ages(prices.length), ...extra,
});
const flat = Array.from({ length: 60 }, (_, i) => card(1000 + i, Array(14).fill(5000 + i * 100)));
const timing = marketTiming(NOW);
const run = (cards: SeriesCard[], rule: "dip" | "settled" | "rising" | "steady") => {
  const all = [...flat, ...cards], stats = new Map(all.map((c) => [c.ea_item_id, cardStats(c, 156)!]));
  return scoreBuys(cards.map((c) => ({ card: c, stats: stats.get(c.ea_item_id)! })), timing, { max_price: 1e9, min_roi: 0.03, owned: new Set(), rule, market: { m24: 0, m72: 0 } });
};

Deno.test("a dip still falling over the last day is picked by the old rule only; one that has held for days passes", () => {
  // Down 15% over 3 days and lower than a day ago, with a one-refresh bounce: the kind of pick that kept dropping.
  const sliding = card(1, [20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 19_000, 18_500, 18_000, 17_500, 16_800, 17_000]);
  // Fell early in the week, then held flat for 3 days.
  const held = card(2, [20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 17_000, 17_000, 17_000, 17_000, 17_000, 17_000, 17_100]);
  assert(run([sliding, held], "dip").map((b) => b.ea_item_id).includes(1), "the old rule buys the sliding card");
  const settled = run([sliding, held], "settled");
  assert(settled.length === 1 && settled[0]!.ea_item_id === 2, JSON.stringify(settled.map((b) => b.ea_item_id)));
  assert(settled[0]!.why.some((w) => w.includes("over 3 days")), JSON.stringify(settled[0]!.why));
});

Deno.test("rising cards: up over 3 days and today, beating the market; spikes and fallers are not", () => {
  const riser = card(3, [10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_200, 10_400, 10_600, 10_800, 11_000, 11_200]);
  const spike = card(4, [10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_400, 12_400]);
  const faller = card(5, [12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 11_800, 11_600, 11_400, 11_200, 11_000, 10_800]);
  const out = run([riser, spike, faller], "rising");
  assert(out.length === 1 && out[0]!.ea_item_id === 3, JSON.stringify(out.map((b) => b.ea_item_id)));
  assert(out[0]!.sell_at >= out[0]!.buy_at * 1.07, `aims at least ~8% up: ${out[0]!.buy_at} → ${out[0]!.sell_at}`);
});

// Ten days of twice-daily refreshes: 60 cards climb 2% a refresh, 60 drop 4% every other refresh (staircase down).
const days = 20;
const risers = Array.from({ length: 60 }, (_, i) => card(100 + i, Array.from({ length: days }, (_, k) => Math.round((8_000 + i * 50) * 1.02 ** k))));
const stairs = Array.from({ length: 60 }, (_, i) => card(300 + i, Array.from({ length: days }, (_, k) => Math.round((12_000 + i * 50) * 0.96 ** Math.ceil(k / 2)))));
const snaps = ages(days);

Deno.test("replay: runs every rule on past refreshes and finds the one that made money 2 days later", () => {
  const replay = replayRules([...risers, ...stairs], snaps, LATEST)!;
  assert(replay && replay.refreshes >= 8, JSON.stringify(replay));
  const by = new Map(replay.rules.map((r) => [r.rule, r]));
  assert(by.get("dip")!.n >= 30 && by.get("dip")!.net48! < 0, `dips kept falling: ${JSON.stringify(by.get("dip"))}`);
  assert(by.get("rising")!.n >= 30 && by.get("rising")!.net48! > 0, `risers kept rising: ${JSON.stringify(by.get("rising"))}`);
  assert(by.get("settled")!.n === 0, "no dip in this market ever stopped falling");
  const choice = chooseRule(replay);
  assert(choice.rule === "rising" && !choice.hold && choice.why.includes("Cards on the way up"), JSON.stringify(choice));
  // The plan uses it: its buys are the climbing cards, none of the falling ones.
  const plan = buildStrategy({ now: NOW, coins: 200_000, coins_source: "helper", coins_at: null, series: { latest: LATEST, window_h: 156, cards: [...risers, ...stairs].map((c) => ({ ...c, prices: c.prices.slice(-14), ages: c.ages.slice(-14) })) },
    club: null, tradepile: null, tradepile_max: 100, squad_card_ids: new Set(), past: [], rules: replay });
  assert(plan.picking.rule === "rising" && plan.buys.length > 0 && plan.buys.every((b) => b.ea_item_id < 300), JSON.stringify(plan.buys.map((b) => b.ea_item_id)));
  assert(plan.picking.replay!.rules.find((r) => r.rule === "dip")!.name === "Any dip");
});

Deno.test("replay: when every rule lost money, the plan says so, buys less and keeps more coins", () => {
  const replay = replayRules(stairs.concat(stairs.map((c) => ({ ...c, ea_item_id: c.ea_item_id + 1000 }))), snaps, LATEST)!;
  const choice = chooseRule(replay);
  assert(choice.hold && choice.why.startsWith("No way of picking has made money"), JSON.stringify(choice));
  const series = { latest: LATEST, window_h: 156, cards: [...flat, card(9, [20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000, 17_000, 17_000, 17_000, 17_000, 17_000, 17_000, 17_100])] };
  const base = { now: NOW, coins: 100_000, coins_source: "helper" as const, coins_at: null, series, club: null, tradepile: null, tradepile_max: 100, squad_card_ids: new Set<string>(), past: [] };
  const normal = buildStrategy(base), held = buildStrategy({ ...base, rules: replay });
  assert(held.budget.reserve! > normal.budget.reserve!, `reserve ${normal.budget.reserve} → ${held.budget.reserve}`);
  assert(held.steps[0]!.startsWith("No way of picking"), JSON.stringify(held.steps));
});

Deno.test("without a replay the plan uses dips that stopped falling, and says why", () => {
  const choice = chooseRule(null);
  assert(choice.rule === "settled" && !choice.hold && choice.why.includes("Not enough past refreshes"), JSON.stringify(choice));
});
