// Daily FUT strategy: the pure engine (timing, buys, sells, transfer list, budget, track record) and the SQL that
// feeds it, on real PostgreSQL (PGlite).
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
import { decodeIndex, decodePrices, liveFutggPrices, resetLiveCache } from "./futgg-live.ts";
import { bestMove, blackFriday, buildStrategy, nextRefresh, withLive, cardKind, cardStats, marketTiming, pileFixes, scorePast, scoreSells, ukClock, type SeriesCard, type StrategyInput } from "./strategy.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

// Tuesday 10 November 2026, 09:00 UTC (09:00 UK)
const TUE = Date.parse("2026-11-10T09:00:00Z");
const ages = (n: number) => Array.from({ length: n }, (_, i) => (n - 1 - i) * 12);
const card = (id: number, prices: number[], extra: Partial<SeriesCard> = {}): SeriesCard => ({
  ea_item_id: id, name: `Player ${id}`, version: "Rare", rating: 84, position: "ST", is_icon: false, is_hero: false, tracked: true,
  prices, ages: ages(prices.length), ...extra,
});
// A steady market of 60 cards so the market mood has enough cards to read
const flat = Array.from({ length: 60 }, (_, i) => card(1000 + i, Array(14).fill(5000 + i * 100)));
const input = (cards: SeriesCard[], o: Partial<StrategyInput> = {}): StrategyInput => ({
  now: TUE, coins: 100_000, coins_source: "helper", coins_at: null,
  series: { latest: "2026-11-10T06:00:00Z", window_h: 156, cards: [...flat, ...cards] },
  club: null, tradepile: null, tradepile_max: 100, squad_card_ids: new Set(), past: [], ...o,
});

Deno.test("UK clock, Black Friday and the weekly rhythm", () => {
  assert(blackFriday(2026) === "2026-11-27", blackFriday(2026));
  assert(blackFriday(2025) === "2025-11-28", blackFriday(2025));
  const k = ukClock(Date.parse("2026-07-03T17:30:00Z")); // BST: 18:30 UK on a Friday
  assert(k.weekday === 5 && k.hour === 18, JSON.stringify(k));
  const fri = marketTiming(Date.parse("2026-11-13T12:00:00Z"));
  assert(fri.sell_bias > 0 && fri.buy_bias < 0 && fri.extra_reserve > 0, "Friday before 18:00 UK: sell and keep coins");
  const friNight = marketTiming(Date.parse("2026-11-13T19:00:00Z"));
  assert(friNight.buy_bias > 0, "Friday evening promo drop: buy");
  const tue = marketTiming(TUE);
  assert(tue.events.some((e) => e.name === "Black Friday" && e.days === 17), JSON.stringify(tue.events));
  assert(marketTiming(Date.parse("2026-11-20T10:00:00Z")).extra_reserve >= 0.15, "a week before Black Friday keeps more coins");
});

Deno.test("card kinds", () => {
  assert(cardKind({ version: "Rare", rating: 85, is_icon: false, is_hero: false }) === "fodder");
  assert(cardKind({ version: "Team of the Week", rating: 85, is_icon: false, is_hero: false }) === "promo");
  assert(cardKind({ version: "Icon", rating: 88, is_icon: true, is_hero: false }) === "icon");
  assert(cardKind({ version: "Common", rating: 70, is_icon: false, is_hero: false }) === "silver_bronze");
});

Deno.test("stats: changes, streaks and new cards", () => {
  const s = cardStats(card(1, [10_000, 10_000, 10_000, 10_000, 10_000, 9_000, 8_000, 8_500]), 156)!;
  assert(s.latest === 8_500 && s.prev === 8_000 && s.rising === 1 && s.falling === 0, JSON.stringify(s));
  assert(s.change_24h === pct((8_500 - 9_000) / 9_000), `24h ${s.change_24h}`);
  assert(s.new_card, "first seen 84h ago in a 156h window");
  assert(!cardStats(card(2, Array(14).fill(5000)), 156)!.new_card);
});
const pct = (v: number) => Math.round(v * 1000) / 10;

Deno.test("buys: a dip that bounced is picked, a falling knife and a brand new card are not, sized to the budget", () => {
  const dip = card(1, [20_000, 20_500, 21_000, 20_000, 20_500, 21_000, 20_000, 20_500, 20_000, 19_000, 18_000, 17_000, 16_500, 17_000]);
  const knife = card(2, [20_000, 20_500, 21_000, 20_000, 20_500, 21_000, 20_000, 20_500, 20_000, 19_000, 18_000, 17_000, 16_500, 16_000]);
  const fresh = card(3, [40_000, 35_000, 30_000, 25_000, 22_000, 21_000, 22_000], { ages: [72, 60, 48, 36, 24, 12, 0] });
  const plan = buildStrategy(input([dip, knife, fresh]));
  assert(plan.buys.length === 1 && plan.buys[0]!.ea_item_id === 1, JSON.stringify(plan.buys.map((b) => b.ea_item_id)));
  const b = plan.buys[0]!;
  assert(b.buy_at === 17_000 && b.sell_at === 20_000, `buy ${b.buy_at} sell ${b.sell_at}`);
  assert(b.profit === 20_000 - 1_000 - 17_000, `profit after 5% tax ${b.profit}`);
  // 100k coins, normal risk: 20% reserve, 30% of the rest per card → 24k → one copy
  assert(plan.budget.reserve === 20_000 && plan.budget.per_pick === 24_000 && b.quantity === 1, JSON.stringify(plan.budget));
  assert(plan.stance === "flip" || plan.stance === "buy", plan.stance);
  assert(plan.steps.some((s) => s.startsWith("Buy 1 card")), JSON.stringify(plan.steps));
});

Deno.test("buys respect the transfer list's free slots and work without coins", () => {
  const dips = Array.from({ length: 4 }, (_, i) => card(10 + i, [...Array(10).fill(3_000), 2_500, 2_400, 2_300, 2_400], { name: `Dip ${i}` }));
  const full = buildStrategy(input(dips, { tradepile: Array.from({ length: 97 }, (_, i) => ({ ea_item_id: 9_000 + i, state: "listed", buy_now: 1000, current_bid: null, untradeable: false, rating: 80 })) }));
  assert(full.buys.reduce((n, b) => n + (b.quantity ?? 0), 0) <= 3, "only 3 free slots");
  const blind = buildStrategy(input(dips, { coins: null, coins_source: null }));
  assert(blind.buys.length === 4 && blind.buys.every((b) => b.quantity === null), "no coins: picks without sizes");
  assert(blind.steps.some((s) => s.includes("XI Lab helper")), "asks for coins");
});

Deno.test("sells: a club card well above its week, squad cards are flagged, untradeable cards are skipped", () => {
  const timing = marketTiming(Date.parse("2026-11-14T12:00:00Z")); // Saturday
  const s = cardStats(card(1, [...Array(12).fill(10_000), 11_000, 12_000]), 156)!;
  const stats = new Map([[1, s], [2, s], [3, s]]);
  const club = [
    { card_id: "a", ea_item_id: 1, name: "Hot", version: "Rare", rating: 84, position: "ST", tradeable_quantity: 2, price: 12_000 },
    { card_id: "b", ea_item_id: 2, name: "Starter", version: "Rare", rating: 84, position: "ST", tradeable_quantity: 1, price: 12_000 },
    { card_id: "c", ea_item_id: 3, name: "Locked", version: "Rare", rating: 84, position: "ST", tradeable_quantity: 0, price: 12_000 },
  ];
  const sells = scoreSells(club, stats, timing, new Set(["b"]));
  assert(sells.length === 2 && sells[0]!.name === "Hot", JSON.stringify(sells.map((x) => x.name)));
  assert(sells[0]!.reason === "near_high" && sells[0]!.after_tax === 2 * 11_400 && sells[0]!.quick_at === 11_750, JSON.stringify(sells[0]));
  assert(sells[1]!.in_squad && sells[1]!.why.includes("active squad"));
});

Deno.test("transfer list: clear sold, relist expired at today's price, flag overpriced listings", () => {
  const stats = new Map([[1, cardStats(card(1, Array(14).fill(10_000)), 156)!]]);
  const fixes = pileFixes([
    { ea_item_id: 1, state: "listed", buy_now: 13_000, current_bid: null, untradeable: false, rating: 84 },
    { ea_item_id: 1, state: "expired", buy_now: 12_000, current_bid: null, untradeable: false, rating: 84 },
    { ea_item_id: 1, state: "sold", buy_now: 10_000, current_bid: 10_000, untradeable: false, rating: 84 },
    { ea_item_id: 1, state: "listed", buy_now: 10_000, current_bid: null, untradeable: false, rating: 84 },
  ], stats, new Map([[1, "Sold Guy"]]));
  assert(fixes.map((f) => f.action).join() === "clear,relist,lower", fixes.map((f) => f.action).join());
  assert(fixes[1]!.list_at === 10_000);
});

Deno.test("make coins now: one move, buy the best expected profit, sell on a selling day, clear sold items first, wait when nothing fits", () => {
  const dip = card(1, [20_000, 20_500, 21_000, 20_000, 20_500, 21_000, 20_000, 20_500, 20_000, 19_000, 18_000, 17_000, 16_500, 17_000]);
  const sold = { ea_item_id: 1, state: "sold", buy_now: 10_000, current_bid: 10_000, untradeable: false, rating: 84 };
  const plan = buildStrategy(input([dip], { tradepile: [sold] }));
  const m = plan.move;
  assert(m.kind === "buy" && m.ea_item_id === 1 && m.title.includes("at 17,000, list at 20,000"), JSON.stringify(m));
  assert(m.first === "First clear 1 sold item on your transfer list to collect 9,500 coins.", String(m.first));
  assert(m.coins === 2_000 && m.chance === null && m.next_update === "2026-11-10T18:00:00.000Z", JSON.stringify(m));
  // Saturday with a club card near its high: sell it
  const hot = card(2, [...Array(12).fill(10_000), 11_000, 12_000]);
  const sat = buildStrategy(input([dip, hot], { now: Date.parse("2026-11-14T12:00:00Z"), series: { latest: "2026-11-14T06:00:00Z", window_h: 156, cards: [...flat, dip, hot] },
    club: [{ card_id: "a", ea_item_id: 2, name: "Hot", version: "Rare", rating: 84, position: "ST", tradeable_quantity: 1, price: 12_000 }] }));
  assert(sat.stance === "sell" && sat.move.kind === "sell" && sat.move.title.startsWith("Sell Hot (84) at"), JSON.stringify(sat.move));
  // A steady market with nothing cheap: hold coins
  const flatPlan = buildStrategy(input([]));
  assert(flatPlan.move.kind === "wait" && flatPlan.move.title.startsWith("Hold"), JSON.stringify(flatPlan.move));
  assert(bestMove({ buys: [], sells: [], pile: [], stance: "flip", timing: plan.timing, coins: 900, sold_coins: 0, prices_at: null, now: TUE }).title.startsWith("Sell a few cards"));
  assert(nextRefresh(Date.parse("2026-11-10T19:00:00Z")) === "2026-11-11T06:00:00.000Z" && nextRefresh(Date.parse("2026-11-10T05:50:00Z")) === "2026-11-10T18:00:00.000Z");
});

Deno.test("live prices: FUT.GG's hourly Buy Now replaces a stale refresh, picks without a live price are dropped (the McTominay case)", () => {
  // At the 18:00 refresh he was 2,300 against a 2,800 week; an hour later SBC demand had him at 7,000.
  const mctominay = card(1, [2_800, 2_900, 2_800, 2_700, 2_800, 2_900, 2_800, 2_750, 2_800, 2_600, 2_400, 2_300, 2_250, 2_300], { name: "McTominay", rating: 86, version: "Common" });
  const other = card(2, [20_000, 20_500, 21_000, 20_000, 20_500, 21_000, 20_000, 20_500, 20_000, 19_000, 18_000, 17_000, 16_500, 17_000]);
  const stale = buildStrategy(input([mctominay, other]));
  assert(stale.buys.some((b) => b.name === "McTominay"), "the old refresh alone picks him");
  assert(stale.prices.source === "refresh" && stale.prices.age_h === 3, JSON.stringify(stale.prices));
  const live = { platform: "console" as const, at: "2026-11-10T08:30:00Z", prices: new Map([[1, 7_000], [2, 17_000]]) };
  const plan = buildStrategy(input([mctominay, other], { live }));
  assert(!plan.buys.some((b) => b.name === "McTominay"), "not a dip at 7,000");
  assert(plan.buys[0]!.ea_item_id === 2 && plan.buys[0]!.buy_at === 17_000 && plan.prices.source === "live" && plan.prices_at === live.at, JSON.stringify(plan.prices));
  // No live price for a card (FUT.GG has none right now): it isn't recommended
  const gone = buildStrategy(input([other], { live: { ...live, prices: new Map() } }));
  assert(gone.buys.length === 0, "no current Buy Now, no pick");
  // Ages shift by the time since the refresh, and the live price becomes the latest point
  const w = withLive({ latest: "2026-11-10T06:00:00Z", window_h: 156, cards: [other] }, live);
  assert(w.series.cards[0]!.prices.at(-1) === 17_000 && w.series.cards[0]!.ages.at(-2) === 2.5 && w.series.window_h === 158.5, JSON.stringify(w.series.cards[0]!.ages.slice(-2)));
  // The most to pay: the profit floor after tax still holds at max_buy
  const b = plan.buys[0]!;
  assert(b.max_buy >= b.buy_at && 20_000 * 0.95 - b.max_buy >= 150 && plan.move.detail.includes(`Don't pay more than ${b.max_buy.toLocaleString("en-US")}`), `${b.max_buy} ${plan.move.detail}`);
});

Deno.test("price ranges: the best flip under 10k, 10k to 100k and 100k+, flagged when over the per-card budget", () => {
  const shape = (base: number) => [1, 1.02, 1.05, 1, 1.02, 1.05, 1, 1.02, 1, 0.95, 0.9, 0.85, 0.82, 0.85].map((f) => Math.round(base * f / 50) * 50);
  const cheap = card(1, shape(4_000), { name: "Cheap" }), mid = card(2, shape(40_000), { name: "Mid" }), dear = card(3, shape(400_000), { name: "Dear" });
  const plan = buildStrategy(input([cheap, mid, dear]));
  const r = Object.fromEntries(plan.ranges.map((x) => [x.key, x]));
  assert(r.low!.pick?.name === "Cheap" && r.medium!.pick?.name === "Mid" && r.high!.pick?.name === "Dear", JSON.stringify(plan.ranges.map((x) => x.pick?.name)));
  assert(r.low!.affordable === true && r.high!.affordable === false && r.high!.pick!.quantity === null, "100k coins can't put 340k into one card");
  assert(r.low!.pick!.quantity! >= 1, "sized to the budget");
});

Deno.test("live prices: decoding FUT.GG's index and price file, status 0 only, cached until the files change", async () => {
  const ids = decodeIndex({ v: 2, id0: 100, d: [5, 10] });
  assert(ids.join() === "100,105,115");
  const prices = decodePrices(ids, { v: 2, p: [5_700, 9_000, null], s: [0, 3, 0] });
  assert(prices.get(100) === 5_700 && !prices.has(105) && !prices.has(115) && prices.size === 1);
  resetLiveCache();
  const urls: string[] = [];
  const files: Record<string, unknown> = {
    "manifest.json": { _version: 3, "player-prices-index": "aa", "player-prices-ps5-dyn": "bb", "player-prices-pc-dyn": "cc", _published_at: { "player-prices-ps5-dyn": 1_794_371_775 } },
    "player-prices-index.v3.aa.json": { v: 2, id0: 100, d: [5, 10] }, "player-prices-ps5-dyn.v3.bb.json": { v: 2, p: [5_700, 9_000, 1_200], s: [0, 0, 0] },
  };
  const fetcher = (u: string) => { urls.push(u); const f = files[u.split("/").pop()!]; return Promise.resolve(new Response(JSON.stringify(f ?? {}), { status: f ? 200 : 404 })); };
  const live = await liveFutggPrices("console", fetcher, 1_000_000);
  assert(live?.prices.get(115) === 1_200 && live.at === "2026-11-11T04:36:15.000Z", JSON.stringify(live?.at));
  await liveFutggPrices("console", fetcher, 1_060_000);
  assert(urls.length === 3, `cached: ${urls.length} requests`);
  assert(await liveFutggPrices("pc", fetcher, 1_100_000) === null, "a missing file means no live prices, not an error");
  resetLiveCache();
});

Deno.test("track record: a pick that reached its sell price is a hit", () => {
  const series = new Map([[1, card(1, [10_000, 9_000, 9_500, 10_500, 10_000])], [2, card(2, [10_000, 9_000, 8_500, 8_000, 8_000])]]);
  // Picked at the refresh 36 hours before the latest one
  const r = scorePast([{ plan_date: "2026-11-08", prices_at: "2026-11-08T18:00:00Z", buys: [
    { ea_item_id: 1, name: "Up", buy_at: 9_000, sell_at: 10_500 }, { ea_item_id: 2, name: "Down", buy_at: 9_000, sell_at: 10_000 }, { ea_item_id: 3, name: "Gone", buy_at: 1, sell_at: 2 },
  ] }], series, "2026-11-10T06:00:00Z");
  assert(r.picks === 2 && r.hit === 1 && r.open_down === 1, JSON.stringify(r));
});

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
CREATE TABLE fut.player_cards(id SERIAL PRIMARY KEY, owner_user_id UUID, source_id TEXT, source_card_key TEXT, player_name TEXT, overall SMALLINT,
  positions TEXT[], club TEXT, league TEXT, nation TEXT, version TEXT, is_icon BOOLEAN NOT NULL DEFAULT false, is_hero BOOLEAN NOT NULL DEFAULT false, market_tracked BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER,
  PRIMARY KEY (game_year, platform, ea_item_id, published_at));
GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`;

Deno.test("strategy_price_series: tracked cards plus asked-for ids, last 7 days oldest first, service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261110190000_fut_daily_strategy.sql", import.meta.url)));
    await db.exec(`INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
      INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, player_name, overall, positions, version, market_tracked) VALUES
      (NULL, 'futgg_catalogue', '1', 'Tracked', 84, '{ST}', 'Rare', true), (NULL, 'futgg_catalogue', '2', 'Mine', 75, '{CB}', 'Rare', false),
      (NULL, 'futgg_catalogue', '3', 'Ignored', 70, '{GK}', 'Common', false);
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', '2026-11-01T06:00Z'), (27, 'console', '2026-11-09T06:00Z'), (27, 'console', '2026-11-09T18:00Z'), (27, 'console', '2026-11-10T06:00Z');
      INSERT INTO fut.futgg_prices SELECT 27, 'console', id, s.published_at, 1000 * id + extract(hour FROM s.published_at)::INT FROM generate_series(1, 3) id, fut.futgg_snapshots s;`);
    await db.exec("SET ROLE service_role");
    const r = await db.query<{ r: { latest: string; snapshots: number[]; cards: SeriesCard[] } }>("SELECT fut.strategy_price_series('console', ARRAY[2]::BIGINT[], 7) AS r");
    const out = r.rows[0]!.r;
    assert(JSON.stringify(out.snapshots) === "[24,12,0]", `the 9-day-old refresh is outside the window: ${JSON.stringify(out.snapshots)}`);
    assert(out.cards.length === 2 && out.cards.every((x) => x.ea_item_id !== 3), JSON.stringify(out.cards.map((x) => x.ea_item_id)));
    const t = out.cards.find((x) => x.ea_item_id === 1)!;
    assert(t.tracked && t.name === "Tracked" && JSON.stringify(t.prices) === "[1006,1018,1006]" && JSON.stringify(t.ages) === "[24,12,0]", JSON.stringify(t));
    const empty = await db.query<{ r: { cards: unknown[] } }>("SELECT fut.strategy_price_series('pc') AS r");
    assert(empty.rows[0]!.r.cards.length === 0);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT fut.strategy_price_series('console')"); } catch { denied = true; } assert(denied, "web roles can't call it");
    denied = false; try { await db.query("SELECT * FROM fut.strategy_plans"); } catch { denied = true; } assert(denied, "web roles can't read plans");
  } finally { await db.close(); }
});
