// Trade log: buys from won Transfer Targets, sales from the transfer list, matched by EA's item id, and the summary.
import { tradeSummary, tradeUpdates, type TradeRow } from "./trades.ts";
import type { TradeItem } from "./account.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const U = "u1";
const item = (item_id: number, state: TradeItem["state"], p: Partial<TradeItem> = {}): TradeItem => ({
  item_id, ea_item_id: 1000 + item_id, item_type: "player", rating: 85, rare_flag: 1, untradeable: false,
  trade_id: null, state, buy_now: null, current_bid: null, starting_bid: null, expires_at: null, last_sale_price: null, ...p,
});
const row = (p: Partial<TradeRow>): TradeRow => ({
  user_id: U, platform: "console", item_id: 1, ea_item_id: 1001, rating: 85, bought_for: null, bought_at: null, bought_source: null,
  listed_for: null, listed_at: null, sold_for: null, sold_at: null, ...p,
});

Deno.test("tradeUpdates: won targets are buys, sold items are sales, first sighting wins", () => {
  const t1 = "2026-11-10T10:00:00.000Z", t2 = "2026-11-10T14:00:00.000Z";
  const first = tradeUpdates(new Map(), { user_id: U, platform: "console", seen_at: t1, watchlist: [item(1, "won", { current_bid: 10_000 }), item(2, "outbid", { current_bid: 5000 }), item(9, "won")], tradepile: [] });
  assert(first.length === 1 && first[0]!.bought_for === 10_000 && first[0]!.bought_source === "watchlist" && first[0]!.bought_at === t1, JSON.stringify(first));
  const have = new Map(first.map((r) => [r.item_id, r]));
  // Same item later on the transfer list: listed, then sold. The buy price stays.
  const listed = tradeUpdates(have, { user_id: U, platform: "console", seen_at: t1, watchlist: [item(1, "won", { current_bid: 99 })], tradepile: [item(1, "listed", { buy_now: 13_000, starting_bid: 12_000 })] });
  assert(listed.length === 1 && listed[0]!.bought_for === 10_000 && listed[0]!.listed_for === 13_000, JSON.stringify(listed));
  have.set(1, listed[0]!);
  assert(tradeUpdates(have, { user_id: U, platform: "console", seen_at: t2, watchlist: null, tradepile: [item(1, "listed", { buy_now: 13_000 })] }).length === 0, "same listing isn't rewritten");
  const sold = tradeUpdates(have, { user_id: U, platform: "console", seen_at: t2, watchlist: null, tradepile: [item(1, "sold", { current_bid: 12_500, buy_now: 13_000 }), item(3, "sold", { buy_now: 4000 })] });
  const s1 = sold.find((r) => r.item_id === 1)!, s3 = sold.find((r) => r.item_id === 3)!;
  assert(s1.sold_for === 12_500 && s1.sold_at === t2 && s1.bought_for === 10_000, "sale price is the final bid");
  assert(s3.sold_for === 4000 && s3.bought_for === null && s3.ea_item_id === 1003, "a sale without a seen buy is still kept");
  have.set(1, s1);
  assert(tradeUpdates(have, { user_id: U, platform: "console", seen_at: t2, watchlist: null, tradepile: [item(1, "sold", { current_bid: 1 })] }).length === 0, "a sale is recorded once");
});

Deno.test("tradeSummary: after-tax profit, best and worst, history, open positions and sales without a buy", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const rows = [
    row({ item_id: 1, bought_for: 10_000, bought_at: "2026-11-09T08:00:00Z", sold_for: 12_000, sold_at: "2026-11-09T20:00:00Z" }), // 11,400 - 10,000 = +1,400
    row({ item_id: 2, ea_item_id: 1002, bought_for: 5000, bought_at: "2026-09-01T08:00:00Z", sold_for: 5000, sold_at: "2026-09-02T08:00:00Z" }), // 4,750 - 5,000 = -250
    row({ item_id: 3, ea_item_id: 1003, bought_for: 2000, bought_at: "2026-11-10T08:00:00Z", listed_for: 3000 }),
    row({ item_id: 4, ea_item_id: 1004, sold_for: 1000, sold_at: "2026-11-10T09:00:00Z" }),
  ];
  const names = new Map([[1001, { name: "Star", price: 12_000 }], [1003, { name: "Held", price: 3000 }]]);
  const s = tradeSummary(rows, names, now);
  assert(s.totals.flips === 2 && s.totals.profit === 1150 && s.totals.week === 1400 && s.totals.month === 1400, JSON.stringify(s.totals));
  assert(s.totals.win_rate === 50 && s.totals.tax_paid === 850, JSON.stringify(s.totals));
  assert(s.flips[0]!.name === "Star" && s.flips[0]!.held_hours === 12 && s.flips[0]!.roi === 14, JSON.stringify(s.flips[0]));
  assert(s.flips[1]!.name === "Item 1002", "unnamed cards get a placeholder");
  assert(s.best[0]!.item_id === 1 && s.worst.length === 1 && s.worst[0]!.item_id === 2, "worst lists only losses");
  assert(s.history.length === 2 && s.history[0]!.value === -250 && s.history[1]!.value === 1150, JSON.stringify(s.history));
  assert(s.open.length === 1 && s.open[0]!.unrealised === 850 && s.totals.open_cost === 2000 && s.totals.unrealised === 850, JSON.stringify(s.open));
  assert(s.totals.sales_without_buy === 1 && s.sales_without_buy[0]!.after_tax === 950, JSON.stringify(s.sales_without_buy));
  const empty = tradeSummary([], new Map(), now);
  assert(empty.totals.flips === 0 && empty.totals.win_rate === null && empty.totals.unrealised === null, "empty log");
});
