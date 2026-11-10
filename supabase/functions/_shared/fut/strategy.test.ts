// Daily FUT strategy: the pure engine (timing, buys, sells, transfer list, budget, track record) and the SQL that
// feeds it, on real PostgreSQL (PGlite).
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
import { blackFriday, buildStrategy, cardKind, cardStats, marketTiming, pileFixes, scorePast, scoreSells, ukClock, type SeriesCard, type StrategyInput } from "./strategy.ts";
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
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261110150000_fut_daily_strategy.sql", import.meta.url)));
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
