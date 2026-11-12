// Daily Strategy learning: settling picks, learning the model, applying it, the bot job end to end (memory db)
// and the migration on real PostgreSQL (PGlite).
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
import { buyOutlook, forecast24, learnModel, learnMoves, MIN_RESULTS, moveBucket, reachChance, resolvePick, sellOutlook, type BuyFeatures, type LoggedPick } from "./strategy-model.ts";
import { buildStrategy, followedTrades, marketTiming, cardStats, runStrategyLearning, scoreBuys, type SeriesCard } from "./strategy.ts";
import { futMemoryDb } from "./test-db.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const LATEST = "2026-11-10T06:00:00Z", NOW = Date.parse("2026-11-10T07:00:00Z");
const f = (o: Partial<BuyFeatures> = {}): BuyFeatures => ({ kind: "gold", band: "5k to 20k", discount: "8 to 12% under", bounce: "bounced", trend: "steady", weekday: "Tuesday", ...o });
const pick = (o: Partial<LoggedPick> = {}): LoggedPick => ({ platform: "console", side: "buy", ea_item_id: 1, picked_at: "2026-11-05T06:00:00Z", rank: 1, price: 10_000, target: 11_000, features: f(), ...o });
// Prices every 12 hours up to LATEST; ages in hours before it
const trail = (prices: number[]) => ({ prices, ages: prices.map((_, i) => (prices.length - 1 - i) * 12) });

Deno.test("settling: a buy hits when a later price reaches the target, misses after 4 days, stays open before", () => {
  // Picked 120h before LATEST; 11 points (120h..0h)
  const hit = resolvePick(pick(), trail([10_000, 10_200, 10_500, 11_100, 10_900, 10_800, 10_700, 10_600, 10_500, 10_400, 10_300]), LATEST, NOW)!;
  assert(hit.outcome === "hit" && hit.hours_to_hit === 36 && hit.best_price === 11_100, JSON.stringify(hit));
  const miss = resolvePick(pick(), trail(Array(11).fill(10_400)), LATEST, NOW)!;
  assert(miss.outcome === "miss" && miss.best_price === 10_400, JSON.stringify(miss));
  const open = resolvePick(pick({ picked_at: "2026-11-09T06:00:00Z" }), trail([10_000, 10_100, 10_200]), LATEST, NOW);
  assert(open === null, "24 hours in and not at target: still open");
  const gone = resolvePick(pick({ picked_at: "2026-11-01T06:00:00Z" }), undefined, LATEST, NOW)!;
  assert(gone.outcome === "expired");
});

Deno.test("settling: a sell call is good when holding would have lost", () => {
  const s = (prices: number[]) => resolvePick(pick({ side: "sell", features: { reason: "near_high", kind: "gold", band: "5k to 20k" } }), trail(prices), LATEST, NOW)!;
  assert(s([10_000, 9_800, 9_700, 9_600, 9_500, 9_600, 9_700, 9_800, 9_900, 9_900, 9_900]).outcome === "good");
  assert(s([10_000, 10_100, 10_200, 10_300, 10_400, 10_400, 10_400, 10_400, 10_400, 10_400, 10_400]).outcome === "bad");
  assert(s([10_000, 9_000, 10_500, 10_500, 10_500, 10_500, 10_500, 10_500, 10_500, 10_500, 10_500]).outcome === "good", "an 8%+ drop settles it early");
});

Deno.test("learning: waits for enough results, then rates kinds of picks, lowers targets and explains", () => {
  const few = learnModel("console", Array.from({ length: 10 }, () => pick({ outcome: "hit", best_price: 11_000 })), NOW);
  assert(!few.ready && few.lessons[0]!.startsWith("Still watching"), JSON.stringify(few.lessons));
  assert(buyOutlook(few, f()).factor === 1 && buyOutlook(few, f()).p_hit === null);
  // 40 fodder picks hit 80%, 40 promo picks hit 20%; misses peak 60% of the way to target
  const rows: LoggedPick[] = [];
  for (let i = 0; i < 40; i++) rows.push(pick({ features: f({ kind: "fodder" }), outcome: i < 32 ? "hit" : "miss", best_price: i < 32 ? 11_000 : 10_600, hours_to_hit: 20 }));
  for (let i = 0; i < 40; i++) rows.push(pick({ features: f({ kind: "promo" }), outcome: i < 8 ? "hit" : "miss", best_price: i < 8 ? 11_000 : 10_600, hours_to_hit: 40 }));
  for (let i = 0; i < 20; i++) rows.push(pick({ side: "sell", features: { reason: "near_high", kind: "gold", band: "5k to 20k" }, outcome: i < 15 ? "good" : "bad" }));
  const m = learnModel("console", rows, NOW);
  assert(m.ready && m.buys.n === 80 && m.buys.rate === 0.5, JSON.stringify(m.buys));
  const fodder = m.buys.factors.kind!.fodder!, promo = m.buys.factors.kind!.promo!;
  assert(fodder.factor > 1.3 && promo.factor < 0.7, `${fodder.factor} ${promo.factor}`);
  assert(m.buys.reach === 0.6, `40th percentile reach ${m.buys.reach}`);
  assert(m.buys.median_hours_to_hit === 20 || m.buys.median_hours_to_hit === 30, String(m.buys.median_hours_to_hit));
  assert(m.lessons.some((l) => l.includes('Card type "promo"')) && m.lessons.some((l) => l.includes("Sell calls were right 75%")), JSON.stringify(m.lessons));
  const good = buyOutlook(m, f({ kind: "fodder" })), bad = buyOutlook(m, f({ kind: "promo" }));
  assert(good.p_hit! > 0.6 && bad.p_hit! < 0.4 && good.similar === 40, JSON.stringify({ good, bad }));
  assert(sellOutlook(m, "near_high").rate === 0.75 && sellOutlook(m, "falling").rate === null);
  assert(MIN_RESULTS === 30);
});

const ages = (n: number) => Array.from({ length: n }, (_, i) => (n - 1 - i) * 12);
const dipCard = (id: number, extra: Partial<SeriesCard> = {}): SeriesCard => ({ ea_item_id: id, name: `Dip ${id}`, version: "Rare", rating: 80, position: "ST", is_icon: false, is_hero: false, tracked: true,
  prices: [...Array(10).fill(10_000), 9_000, 8_800, 8_600, 8_800], ages: ages(14), ...extra });

Deno.test("applying the model: lower targets, re-ranked picks, learned chances in the reasons", () => {
  const rows: LoggedPick[] = [];
  for (let i = 0; i < 40; i++) rows.push(pick({ features: f({ kind: "fodder", band: "5k to 20k" }), outcome: i < 30 ? "hit" : "miss", best_price: i < 30 ? 11_000 : 10_800 }));
  for (let i = 0; i < 40; i++) rows.push(pick({ features: f({ kind: "gold", band: "5k to 20k" }), outcome: i < 10 ? "hit" : "miss", best_price: i < 10 ? 11_000 : 10_800 }));
  const model = learnModel("console", rows, NOW);
  const timing = marketTiming(Date.parse("2026-11-10T09:00:00Z"));
  const cards = [dipCard(1, { rating: 80 }), dipCard(2, { rating: 85 })].map((card) => ({ card, stats: cardStats(card, 156)! }));
  const plain = scoreBuys(cards, timing, { max_price: 1e9, min_roi: 0.03, owned: new Set() });
  const learned = scoreBuys(cards, timing, { max_price: 1e9, min_roi: 0.03, owned: new Set(), model });
  assert(plain[0]!.target_raw === plain[0]!.sell_at && plain[0]!.p_hit === null, "no model: plain target");
  const fod = learned.find((b) => b.ea_item_id === 2)!, gold = learned.find((b) => b.ea_item_id === 1)!;
  assert(learned[0]!.ea_item_id === 2, "fodder picks hit more often, so they rank first");
  assert(fod.sell_at < fod.target_raw && fod.sell_at > fod.buy_at, `target lowered ${fod.buy_at} → ${fod.sell_at} (was ${fod.target_raw})`);
  assert(fod.p_hit! > gold.p_hit! && fod.why.some((w) => w.startsWith("Past picks like this")), JSON.stringify(fod.why));
  assert(gold.risks.some((r) => r.includes("done worse")), JSON.stringify(gold.risks));
  const plan = buildStrategy({ now: NOW, coins: null, coins_source: null, coins_at: null, series: { latest: LATEST, window_h: 156, cards: cards.map((x) => x.card) },
    club: null, tradepile: null, tradepile_max: null, squad_card_ids: new Set(), past: [], model });
  assert(plan.learning.ready && plan.learning.buy_picks === 80 && plan.learning.lessons.length > 1, JSON.stringify(plan.learning));
});

Deno.test("your own trades that followed a pick are matched by item and time", () => {
  const past = [{ plan_date: "2026-11-08", prices_at: "2026-11-08T06:00:00Z", buys: [{ ea_item_id: 7, name: "Seven", buy_at: 9_000, sell_at: 10_000 }] }];
  const t = followedTrades(past, [
    { ea_item_id: 7, bought_for: 9_000, bought_at: "2026-11-08T10:00:00Z", sold_for: 10_000 },
    { ea_item_id: 7, bought_for: 9_000, bought_at: "2026-11-01T10:00:00Z", sold_for: 10_000 }, // before the pick
    { ea_item_id: 8, bought_for: 9_000, bought_at: "2026-11-08T10:00:00Z", sold_for: null },
  ]);
  assert(t.length === 1 && t[0]!.profit === 500, JSON.stringify(t));
});

Deno.test("the strategy-learn job logs picks once per refresh, settles them later and saves a model", async () => {
  const db = futMemoryDb() as ReturnType<typeof futMemoryDb> & { rpc: unknown };
  let latest = LATEST;
  const cards = () => [...Array.from({ length: 40 }, (_, i) => dipCard(100 + i, { name: `Dip ${i}`, rating: 80 + (i % 5) })),
    { ...dipCard(1), name: "Hot", prices: [...Array(12).fill(10_000), 11_000, 12_000] }];
  db.rpc = (_name: string, args: { p_platform: string }) => Promise.resolve({ data: args.p_platform === "pc" ? { latest: null, snapshots: [], cards: [] } : { latest, snapshots: ages(14), cards: cards() }, error: null });
  const first = await runStrategyLearning(db, NOW) as Record<string, { logged?: number; skipped?: string }>;
  assert(first.pc!.skipped === "no prices", JSON.stringify(first));
  const log = db.tables.strategy_pick_log!;
  assert(first.console!.logged === log.length && log.some((r) => r.side === "buy") && log.some((r) => r.side === "sell" && r.ea_item_id === 1), JSON.stringify(first));
  const again = await runStrategyLearning(db, NOW) as Record<string, { logged?: number }>;
  assert(again.console!.logged === 0, "same refresh: nothing logged twice");
  // Five days later every card climbed back to 10,000: buys hit, the sell call on "Hot" was wrong (it held 12,000)
  latest = "2026-11-15T06:00:00Z";
  const later = cards().map((c) => ({ ...c, prices: [...c.prices, ...Array(10).fill(c.ea_item_id === 1 ? 12_000 : 10_000)], ages: ages(24) }));
  db.rpc = (_name: string, args: { p_platform: string }) => Promise.resolve({ data: args.p_platform === "pc" ? { latest: null, snapshots: [], cards: [] } : { latest, snapshots: ages(24), cards: later }, error: null });
  const third = await runStrategyLearning(db, Date.parse("2026-11-15T07:00:00Z")) as Record<string, { settled?: number; results?: number }>;
  const buys = log.filter((r) => r.side === "buy" && r.picked_at === LATEST);
  assert(third.console!.settled! >= buys.length && buys.every((r) => r.outcome === "hit"), JSON.stringify(third));
  assert(db.tables.strategy_pick_log!.find((r) => r.side === "sell" && r.ea_item_id === 1 && r.picked_at === LATEST)?.outcome === "bad");
  const model = db.tables.strategy_model!.find((r) => r.platform === "console")!.model as { buys: { n: number } };
  assert(model.buys.n === buys.length, JSON.stringify(model.buys));
});

// A small market with the three classic shapes: a dip that bounces and recovers, a dip that keeps falling, a spike that fades.
const shapes = {
  bounce: [10_000, 10_000, 10_000, 10_000, 8_500, 8_600, 9_500, 10_000, 10_000, 10_000],
  knife: [10_000, 10_000, 10_000, 10_000, 9_000, 8_500, 8_000, 7_500, 7_000, 6_800],
  spike: [10_000, 10_000, 10_000, 10_000, 12_000, 12_500, 11_000, 10_000, 10_000, 10_000],
};
const market = Object.entries(shapes).flatMap(([shape, ps]) => Array.from({ length: 40 }, (_, i) => {
  const k = 1 + i / 100, prices = ps.map((p) => Math.round(p * k / 50) * 50);
  return { ea_item_id: (shape === "bounce" ? 1_000 : shape === "knife" ? 2_000 : 3_000) + i, name: `${shape} ${i}`, version: "Rare", rating: 80, position: "ST", is_icon: false, is_hero: false, tracked: true, prices, ages: prices.map((_, j) => (prices.length - 1 - j) * 12) } as SeriesCard;
}));

Deno.test("price moves: learned from every stored refresh straight away, no settled picks needed", () => {
  const m = learnMoves(market.map((c) => ({ prices: c.prices, ages: c.ages, kind: "gold" })))!;
  assert(m && m.cards === 120 && m.history_h === 108, JSON.stringify({ n: m?.n, cards: m?.cards, h: m?.history_h }));
  const bounced = moveBucket(m, { discount: 0.14, rising: 1, falling: 0, kind: "gold" })!;
  const dipping = moveBucket(m, { discount: 0.14, rising: 0, falling: 2, kind: "gold" })!;
  const over = moveBucket(m, { discount: -0.25, rising: 1, falling: 0, kind: "gold" })!;
  // Blended toward the wider "12%+ under" spot by how many examples each has, so thin spots can't swing it
  assert(bounced.key === "12%+ under|bounced|gold" && bounced.b.up24 > 0.8 && bounced.b.peak[5]! > 0.1, JSON.stringify(bounced));
  // Some dips still falling at a refresh bounced next time, but most kept falling
  assert(dipping.b.down24 >= 0.6 && dipping.b.up24 < bounced.b.up24 && dipping.b.peak[5]! < 0, JSON.stringify(dipping));
  assert(over.b.down24 > 0.8, JSON.stringify(over));
  // Checked on the newest refreshes it hadn't seen: here every shape had finished by then (flat prices), so what it
  // learned from the dips didn't help, and it isn't trusted
  assert(m.check && m.check.n >= 30 && m.check.skill <= 0 && m.trust === 0, JSON.stringify({ check: m.check, trust: m.trust }));
  const untrusted = buyOutlook(learnModel("console", [], NOW, m), f(), { discount: 0.14, rising: 1, falling: 0, kind: "gold", rise: 0.1 });
  assert(untrusted.factor === 1, "untrusted: falls back to the market-wide rate, so no re-ranking");
  m.trust = 1; // the rest of this test checks what it learned
  // A day-ahead forecast with a range
  const fc = forecast24(m, { discount: 0.14, rising: 1, falling: 0, kind: "gold", price: 8_600 })!;
  assert(fc.low <= fc.mid && fc.mid <= fc.high && fc.mid > 8_600, JSON.stringify(fc));
  // Chance of reaching a rise falls as the rise grows
  assert(reachChance(bounced.b, 0.05) === 1 && reachChance(bounced.b, 0.5) === 0 && reachChance(m.overall, 0.1) < 1);
  // The model uses them before any pick has settled: a bounced dip is rated up, a falling one down, and sells use them too
  const model = learnModel("console", [], NOW, m);
  assert(!model.ready && model.lessons[0]!.startsWith(`Learned from ${m.n}`) && model.lessons.some((l) => l.includes("still falling kept falling")), JSON.stringify(model.lessons));
  const up = buyOutlook(model, f(), { discount: 0.14, rising: 1, falling: 0, kind: "gold", rise: 0.1 });
  const down = buyOutlook(model, f(), { discount: 0.14, rising: 0, falling: 2, kind: "gold", rise: 0.1 });
  assert(up.from_moves && up.p_hit! > 0.6 && up.factor > 1 && down.p_hit! < 0.3 && down.factor < up.factor, JSON.stringify({ up, down }));
  const sell = sellOutlook(model, "near_high", { discount: -0.25, rising: 1, falling: 0, kind: "gold" });
  assert(sell.rate! > 0.6 && sell.n >= 30, JSON.stringify(sell));
  // Too little history: nothing to learn yet
  assert(learnMoves([{ prices: [1_000, 1_100, 1_200], ages: [24, 12, 0], kind: "gold" }]) === null);
});

Deno.test("price moves in the plan: a bounced dip's target comes down to what half of similar cards reached, and the reason says so", () => {
  const m = { ...learnMoves(market.map((c) => ({ prices: c.prices, ages: c.ages, kind: "gold" })))!, trust: 1 };
  const model = learnModel("console", [], NOW, m);
  // Today: a card 14% under that just bounced, with a 7-day middle well above
  const card: SeriesCard = { ea_item_id: 9, name: "Today", version: "Rare", rating: 80, position: "ST", is_icon: false, is_hero: false, tracked: true,
    prices: [12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 10_000, 10_100], ages: [84, 72, 60, 48, 36, 24, 12, 0] };
  const timing = marketTiming(NOW), s = cardStats(card, 84)!;
  const plain = scoreBuys([{ card, stats: s }], timing, { max_price: 1e9, min_roi: 0.03, owned: new Set() })[0]!;
  const learned = scoreBuys([{ card, stats: s }], timing, { max_price: 1e9, min_roi: 0.03, owned: new Set(), model })[0]!;
  assert(plain.sell_at === 11_750 && learned.sell_at < plain.sell_at && learned.sell_at > learned.buy_at, `${plain.sell_at} → ${learned.sell_at}`);
  assert(learned.p_hit !== null && learned.why.some((w) => w.includes("past price moves")), JSON.stringify(learned.why));
});

Deno.test("price moves are trusted only when they beat guessing on refreshes they hadn't seen", () => {
  // Zigzag cards: two refreshes low, two high, all through the week, so a day after a low comes a high. Steady cards never move.
  const zig = Array.from({ length: 60 }, (_, i) => { const lo = 9_000 + i * 10, hi = 10_000 + i * 10; const prices = Array.from({ length: 16 }, (_, j) => (((j + i) >> 1) % 2 ? hi : lo)); return { prices, ages: prices.map((_, j) => (15 - j) * 12), kind: "gold" }; });
  const flat = Array.from({ length: 60 }, (_, i) => { const prices = Array(16).fill(5_000 + i * 10); return { prices, ages: prices.map((_, j) => (15 - j) * 12), kind: "gold" }; });
  const m = learnMoves([...zig, ...flat])!;
  assert(m.check && m.check.skill > 0.05 && m.trust === 1 && m.check.hit > 0.9, JSON.stringify(m.check));
  assert(learnModel("console", [], NOW, m).lessons.some((l) => l.startsWith("Tested on the newest")), "says how it tested");
});

Deno.test("strategy learning tables: service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;`);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261111030000_fut_strategy_learning.sql", import.meta.url)));
    await db.exec(`SET ROLE service_role; INSERT INTO fut.strategy_pick_log(platform, side, ea_item_id, picked_at, rank, price, target, features) VALUES ('console', 'buy', 1, now(), 1, 1000, 1100, '{}');
      INSERT INTO fut.strategy_model VALUES ('console', '{}', now());`);
    let bad = false; try { await db.exec("INSERT INTO fut.strategy_pick_log(platform, side, ea_item_id, picked_at, rank, price, target, features) VALUES ('console', 'hold', 1, now(), 1, 1000, 1100, '{}')"); } catch { bad = true; }
    assert(bad, "side must be buy or sell");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT * FROM fut.strategy_pick_log"); } catch { denied = true; } assert(denied, "web roles can't read the log");
    denied = false; try { await db.query("SELECT * FROM fut.strategy_model"); } catch { denied = true; } assert(denied, "web roles can't read the model");
  } finally { await db.close(); }
});
