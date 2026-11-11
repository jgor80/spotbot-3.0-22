// Daily Strategy learning (Jeff, 2026-11-11: "learn from past picks for cards to buy/sell and keep learning").
//
// After every FUT.GG refresh the bot's `strategy-learn` job (strategy.ts runStrategyLearning) logs the market-wide
// buy candidates and sell signals in fut.strategy_pick_log, ranked by the plain rules with no learning applied so the
// sample stays fair, then checks earlier logged picks against the prices since:
//   - a buy pick "hit" when a later refresh reached its target price within 4 days, else "miss";
//   - a sell signal was "good" when the price 4 days later was lower than when it fired (selling beat holding),
//     or it fell 8% sooner, else "bad".
// learnModel turns the last 30 days of results into a small model per platform (fut.strategy_model):
//   - a hit rate for each kind of pick (card type, price band, discount, bounce, 3-day trend, weekday), smoothed
//     toward the overall rate so a handful of results can't swing it, used to re-rank today's picks;
//   - how far prices really climbed toward the target ("reach"), used to lower sell targets when picks usually
//     peak short of them;
//   - how long hits took to sell, and how often each kind of sell signal was right.
// Everything here is pure so it can be tested. Prices are FUT.GG estimates, so the model is an estimate too.

export const HORIZON_H = 96;          // a pick has 4 days to reach its target
export const WINDOW_DAYS = 30;        // the model learns from the last 30 days of results
export const MIN_RESULTS = 30;        // below this many resolved buy picks the model only watches
const SMOOTH = 10;                    // results' worth of pull toward the overall rate

export interface BuyFeatures { kind: string; band: string; discount: string; bounce: string; trend: string; weekday: string }
export interface SellFeatures { reason: string; kind: string; band: string }
export const FEATURE_LABEL: Record<keyof BuyFeatures, string> = { kind: "Card type", band: "Price", discount: "Discount", bounce: "Bounce", trend: "3-day trend", weekday: "Day picked" };

export const priceBand = (p: number) => (p < 5_000 ? "under 5k" : p < 20_000 ? "5k to 20k" : p < 100_000 ? "20k to 100k" : "100k+");
export const discountBand = (d: number) => (d < 0.08 ? "5 to 8% under" : d < 0.12 ? "8 to 12% under" : "12%+ under");
export const bounceBand = (rising: number, falling: number) => (rising >= 1 ? "bounced" : falling === 0 ? "flat" : "still dipping");
export const trendBand = (change72: number | null) => (change72 === null ? "unknown" : change72 < -20 ? "crashing" : change72 < -8 ? "falling" : "steady");

/** One logged pick as stored in fut.strategy_pick_log. */
export interface LoggedPick {
  platform: "console" | "pc"; side: "buy" | "sell"; ea_item_id: number; picked_at: string; rank: number;
  price: number; target: number; features: BuyFeatures | SellFeatures;
  outcome?: "hit" | "miss" | "good" | "bad" | "expired" | null; resolved_at?: string | null;
  hours_to_hit?: number | null; best_price?: number | null; final_price?: number | null;
}
/** A card's FUT.GG prices oldest first, with each point's age in hours before `latest`. */
export interface PriceTrail { prices: number[]; ages: number[] }

/** Settles a logged pick from the prices since it was made, or returns null while it's still open. */
export function resolvePick(p: LoggedPick, trail: PriceTrail | undefined, latest: string, now: number): LoggedPick | null {
  const pickAge = (Date.parse(latest) - Date.parse(p.picked_at)) / 3_600_000;
  const done = (o: Partial<LoggedPick>): LoggedPick => ({ ...p, resolved_at: new Date(now).toISOString(), ...o });
  // Points after the pick and inside the horizon, with hours since the pick
  const after = (trail?.prices ?? []).flatMap((price, i) => {
    const since = pickAge - trail!.ages[i]!;
    return since > 0.5 && since <= HORIZON_H + 0.5 ? [{ price, since }] : [];
  });
  if (!after.length) return pickAge > 7 * 24 ? done({ outcome: "expired" }) : null;
  const best = Math.max(...after.map((a) => a.price)), low = Math.min(...after.map((a) => a.price)), final = after.at(-1)!.price;
  const closed = pickAge >= HORIZON_H;
  if (p.side === "buy") {
    const hit = after.find((a) => a.price >= p.target);
    if (hit) return done({ outcome: "hit", hours_to_hit: Math.round(hit.since), best_price: best, final_price: final });
    return closed ? done({ outcome: "miss", best_price: best, final_price: final }) : null;
  }
  if (low <= p.price * 0.92) return done({ outcome: "good", best_price: best, final_price: final });
  return closed ? done({ outcome: final < p.price ? "good" : "bad", best_price: best, final_price: final }) : null;
}

export interface Bucket { n: number; wins: number; rate: number; factor: number }
export interface StrategyModel {
  version: 1; platform: "console" | "pc"; updated_at: string; window_days: number; ready: boolean;
  buys: { n: number; hits: number; rate: number | null; median_hours_to_hit: number | null; reach: number; rate_at_reach: number | null; factors: Record<string, Record<string, Bucket>> };
  sells: { n: number; good: number; rate: number | null; by_reason: Record<string, Bucket> };
  lessons: string[];
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
};
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pc = (v: number) => Math.round(v * 100);

function buckets<T>(rows: T[], key: (r: T) => string | undefined, win: (r: T) => boolean, overall: number) {
  const out: Record<string, Bucket> = {};
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const b = (out[k] ??= { n: 0, wins: 0, rate: 0, factor: 1 });
    b.n++; if (win(r)) b.wins++;
  }
  for (const b of Object.values(out)) {
    const smoothed = (b.wins + SMOOTH * overall) / (b.n + SMOOTH);
    b.rate = Math.round((b.wins / b.n) * 1000) / 1000;
    b.factor = overall > 0 ? Math.round(clampN(smoothed / overall, 0.5, 1.6) * 1000) / 1000 : 1;
  }
  return out;
}

/** The model from resolved picks (any order); `rows` should already be limited to the learning window. */
export function learnModel(platform: "console" | "pc", rows: LoggedPick[], now: number): StrategyModel {
  const buys = rows.filter((r) => r.side === "buy" && (r.outcome === "hit" || r.outcome === "miss"));
  const sells = rows.filter((r) => r.side === "sell" && (r.outcome === "good" || r.outcome === "bad"));
  const hits = buys.filter((r) => r.outcome === "hit");
  const rate = buys.length ? hits.length / buys.length : null;
  const ready = buys.length >= MIN_RESULTS;
  const factors: Record<string, Record<string, Bucket>> = {};
  if (rate !== null) for (const f of Object.keys(FEATURE_LABEL) as (keyof BuyFeatures)[]) {
    factors[f] = buckets(buys, (r) => (r.features as BuyFeatures)[f], (r) => r.outcome === "hit", rate);
  }
  // Reach: how far toward its target each pick's best later price got (1 = reached it).
  const reaches = buys.flatMap((r) => (r.best_price != null && r.target > r.price ? [(r.best_price - r.price) / (r.target - r.price)] : []));
  const q = quantile(reaches, 0.4);
  const reach = ready && q !== null ? Math.round(clampN(q, 0.5, 1) * 100) / 100 : 1;
  const rate_at_reach = reaches.length ? Math.round((reaches.filter((x) => x >= reach).length / reaches.length) * 1000) / 1000 : null;
  const hours = quantile(hits.flatMap((r) => (r.hours_to_hit != null ? [r.hours_to_hit] : [])), 0.5);
  const sellRate = sells.length ? sells.filter((r) => r.outcome === "good").length / sells.length : null;
  const by_reason = sellRate === null ? {} : buckets(sells, (r) => (r.features as SellFeatures).reason, (r) => r.outcome === "good", sellRate);

  const lessons: string[] = [];
  if (!ready) lessons.push(`Still watching: ${buys.length} of the first ${MIN_RESULTS} buy picks have settled. Picks are ranked by the plain rules until then.`);
  else {
    lessons.push(`${pc(rate!)}% of buy picks reached their target within 4 days (${buys.length} picks in the last ${WINDOW_DAYS} days).`);
    if (hours !== null) lessons.push(`Picks that sold usually got there in about ${Math.round(hours)} hours.`);
    if (reach < 1) lessons.push(`Prices usually stopped short of the old targets, so targets are now set ${pc(reach)}% of the way to the 7-day middle price; ${pc(rate_at_reach ?? 0)}% of past picks reached that.`);
    const notable = Object.entries(factors).flatMap(([f, bs]) => Object.entries(bs).filter(([, b]) => b.n >= 10 && Math.abs(b.factor - 1) >= 0.15)
      .map(([k, b]) => ({ f, k, b }))).sort((a, b) => Math.abs(b.b.factor - 1) - Math.abs(a.b.factor - 1)).slice(0, 4);
    for (const { f, k, b } of notable) lessons.push(`${FEATURE_LABEL[f as keyof BuyFeatures]} "${k}": ${pc(b.rate)}% hit (${b.n} picks), so these are ranked ${b.factor > 1 ? "higher" : "lower"}.`);
  }
  if (sells.length >= 15) lessons.push(`Sell calls were right ${pc(sellRate!)}% of the time (${sells.length} calls).`);
  return {
    version: 1, platform, updated_at: new Date(now).toISOString(), window_days: WINDOW_DAYS, ready,
    buys: { n: buys.length, hits: hits.length, rate: rate === null ? null : Math.round(rate * 1000) / 1000, median_hours_to_hit: hours === null ? null : Math.round(hours), reach, rate_at_reach, factors },
    sells: { n: sells.length, good: sells.length ? sells.filter((r) => r.outcome === "good").length : 0, rate: sellRate === null ? null : Math.round(sellRate * 1000) / 1000, by_reason },
    lessons,
  };
}

/** How the model rates a buy pick with these features: a score multiplier and the chance it hits its target. */
export function buyOutlook(model: StrategyModel | null | undefined, f: BuyFeatures): { factor: number; p_hit: number | null; similar: number } {
  if (!model?.ready || model.buys.rate === null) return { factor: 1, p_hit: null, similar: 0 };
  let factor = 1, similar = Infinity;
  for (const k of Object.keys(FEATURE_LABEL) as (keyof BuyFeatures)[]) {
    const b = model.buys.factors[k]?.[f[k]];
    if (b) { factor *= b.factor; similar = Math.min(similar, b.n); }
  }
  // The features overlap (cheap cards are often fodder), so their factors are damped rather than simply multiplied.
  factor = clampN(Math.pow(factor, 0.7), 0.35, 2);
  return { factor, p_hit: Math.round(clampN(model.buys.rate * factor, 0.02, 0.9) * 100) / 100, similar: similar === Infinity ? 0 : similar };
}

/** How often this kind of sell call was right, once there are enough results. */
export function sellOutlook(model: StrategyModel | null | undefined, reason: string): { factor: number; rate: number | null; n: number } {
  const b = model?.sells.by_reason[reason];
  if (!b || b.n < 15) return { factor: 1, rate: null, n: b?.n ?? 0 };
  return { factor: b.factor, rate: b.rate, n: b.n };
}
