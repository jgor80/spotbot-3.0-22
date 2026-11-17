// Quick sell or list? (Jeff, 2026-11-17: "i also want to know when it would be better just to quicksell the card")
import { buildStrategy, pileFixes, quickSellCall, quickSellValue, quickSells, type ClubCard } from "./strategy.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

Deno.test("FC 27 quick sell values by rating", () => {
  assert(quickSellValue(75) === 533 && quickSellValue(84) === 596 && quickSellValue(74) === 259 && quickSellValue(92) === 11_224, "table");
  assert(quickSellValue(30) === 28 && quickSellValue(null) === null, "clamped low, unknown rating");
});

Deno.test("a cheap gold is worth more quick sold; a 2,000-coin card is worth listing", () => {
  const cheap = quickSellCall({ rating: 84, price: 650 })!;
  assert(cheap.quicksell && cheap.value === 596 && cheap.why.startsWith("Quick sell it for 596"), JSON.stringify(cheap));
  assert(cheap.why.includes("only if it sells") && cheap.why.includes("cards this cheap"), cheap.why);
  const dear = quickSellCall({ rating: 84, price: 2_000 })!;
  assert(!dear.quicksell && dear.why.startsWith("List it"), JSON.stringify(dear));
  // Already expired once and falling: the chance of a sale drops, so a 1,000-coin card tips to quick sell.
  assert(!quickSellCall({ rating: 84, price: 1_100 })!.quicksell, "1,100 lists normally");
  const stuck = quickSellCall({ rating: 84, price: 1_100, failed: true, change_72h: -20 })!;
  assert(stuck.quicksell && stuck.why.includes("didn't sell once") && stuck.why.includes("fell 20%"), JSON.stringify(stuck));
  // Promo cards: the base value is a floor, and an exact value from the game wins.
  assert(quickSellCall({ rating: 84, special: true, price: 600 })!.why.includes("at least 596"), "special");
  assert(quickSellCall({ rating: 84, exact: 900, price: 900 })!.value === 900, "exact value");
});

Deno.test("transfer list: an expired cheap card is quick sold, not relisted", () => {
  const fixes = pileFixes([
    { ea_item_id: 1, state: "expired", buy_now: 700, current_bid: null, untradeable: false, rating: 83 },
    { ea_item_id: 2, state: "expired", buy_now: 9_000, current_bid: null, untradeable: false, rating: 86 },
  ], new Map(), new Map([[1, "Cheap Gold"], [2, "Good Card"]]));
  assert(fixes[0]!.action === "quicksell" && fixes[0]!.quick_sell === 589, JSON.stringify(fixes[0]));
  assert(fixes[1]!.action === "relist", JSON.stringify(fixes[1]));
});

Deno.test("club: cards not in the squad worth more as a quick sell are listed in the plan", () => {
  const club: ClubCard[] = [
    { card_id: "a", ea_item_id: 11, name: "Spare Gold", version: "Rare", rating: 82, position: "CB", tradeable_quantity: 3, price: 500 },
    { card_id: "b", ea_item_id: 12, name: "Squad Gold", version: "Rare", rating: 82, position: "CB", tradeable_quantity: 1, price: 500 },
    { card_id: "c", ea_item_id: 13, name: "Worth Listing", version: "Rare", rating: 86, position: "ST", tradeable_quantity: 1, price: 5_000 },
  ];
  const q = quickSells(club, new Map(), new Set(["b"]));
  assert(q.length === 1 && q[0]!.card_id === "a" && q[0]!.total === 582 * 3, JSON.stringify(q));
  const plan = buildStrategy({ now: Date.parse("2026-11-17T09:00:00Z"), coins: 50_000, coins_source: "helper", coins_at: null, series: { latest: "2026-11-17T06:00:00Z", window_h: 156, cards: [] },
    club, tradepile: null, tradepile_max: 100, squad_card_ids: new Set(["b"]), past: [] });
  assert(plan.quick_sells.length === 1 && plan.steps.some((s) => s.startsWith("Quick sell Spare Gold for about 1,746")), JSON.stringify(plan.steps));
});
