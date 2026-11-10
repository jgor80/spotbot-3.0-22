// Sell or keep: verdicts from squad use, evolutions, SBC fodder floors and the FUT.GG trend.
import { adviseCard, adviseClub, pct, type KeepInput, type Trend } from "./sell-keep.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const trend = (p: Partial<Trend>): Trend => ({ price: 10_000, d1: 10_000, d3: 10_000, d7: 10_000, low14: 9800, high14: 10_200, points: 28, ...p });
const card = (p: Partial<KeepInput> = {}): KeepInput => ({
  id: "c1", name: "Card", rating: 80, version: "rare", positions: ["ST"], ea_item_id: 1, purchase_price: null, trend: trend({}), squads: [], evo: null, floor: null, ...p,
});

Deno.test("adviseCard: squad and evolution use first, then fodder, then the price trend", () => {
  assert(adviseCard(card({ squads: ["Main", "Weekend", "Rivals"] })).verdict === "keep", "starts in a squad");
  assert(adviseCard(card({ squads: ["Main", "Weekend", "Rivals"] })).reason === "Starts in Main and Weekend and 1 more.", "names the squads");
  assert(adviseCard(card({ evo: { name: "Maestro", gain: 3 } })).verdict === "keep_evo", "evolution");
  assert(adviseCard(card({ evo: { name: "Maestro", gain: 0 } })).verdict === "sell", "an evolution with no gain doesn't count");
  assert(adviseCard(card({ trend: null })).verdict === "no_price", "no price");
  assert(adviseCard(card({ rating: 85, floor: 9000 })).verdict === "hold_fodder", "85 at the floor is fodder");
  assert(adviseCard(card({ rating: 82, floor: 9000 })).verdict !== "hold_fodder", "82s aren't fodder");
  assert(adviseCard(card({ rating: 85, floor: 5000 })).verdict !== "hold_fodder", "well above the floor isn't fodder");
  const falling = adviseCard(card({ trend: trend({ d3: 11_000 }) }));
  assert(falling.verdict === "sell_now" && falling.change_3d === -9.1 && falling.after_tax === 9500, JSON.stringify(falling));
  assert(adviseCard(card({ trend: trend({ d3: null, d1: null, d7: 11_500 }) })).verdict === "sell_now", "7-day fall");
  assert(adviseCard(card({ trend: trend({ d3: 9000, low14: 8000, high14: 10_100 }) })).verdict === "sell_high", "rising into its two-week high");
  assert(adviseCard(card({ trend: trend({ d3: 9000, low14: 8000, high14: 14_000 }) })).verdict === "wait", "still rising, well under the high");
  assert(adviseCard(card({ purchase_price: 8000 })).profit === 1500, "profit after tax over what was paid");
  assert(pct(110, 100) === 10 && pct(null, 100) === null, "pct");
});

Deno.test("adviseClub: sell list first, coin totals", () => {
  const r = adviseClub([
    card({ id: "keep", squads: ["Main"], trend: trend({ price: 50_000 }) }),
    card({ id: "fall", trend: trend({ d3: 12_000 }) }),
    card({ id: "flat", trend: trend({ price: 2000, d1: 2000, d3: 2000, d7: 2000, low14: 2000, high14: 2000 }) }),
  ]);
  assert(r.advice.map((a) => a.id).join() === "fall,flat,keep", r.advice.map((a) => a.id).join());
  assert(r.totals.sell_now_coins === 9500 && r.totals.sell_all_coins === 9500 + 1900 && r.totals.keep_value === 47_500, JSON.stringify(r.totals));
  assert(r.totals.counts.sell_now === 1 && r.totals.counts.keep === 1 && r.totals.cards === 3, JSON.stringify(r.totals.counts));
});
