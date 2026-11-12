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

// ------------------------------------------------------------------ price moves: learning from every price we hold
// Jeff, 2026-11-12: "use all the data you have every time, don't wait for more, infer logically". Waiting for 30 logged
// picks to settle takes days, but every stored FUT.GG refresh already shows how cards in a given spot moved next:
// every card at every refresh is one example. learnMoves turns those into, for each kind of spot (how far under or
// over its usual price, whether it had bounced, card type), how often the price rose and how high it got within the
// next 2 days. It needs only a day of prices after a point, so it works from the first days of history, and the
// model uses it until enough real picks have settled.

export const MOVE_AHEAD_H = 48;
const MOVE_MIN = 30;      // examples needed before anything is learned
const MOVE_KEEP = 8;      // a kind of spot needs this many examples to count at all
const SHRINK = 40;        // examples' worth of pull toward the more general kind of spot
export const moveBand = (d: number) => (d >= 0.12 ? "12%+ under" : d >= 0.08 ? "8 to 12% under" : d >= 0.05 ? "5 to 8% under" : d > -0.05 ? "near usual" : d > -0.15 ? "5 to 15% over" : "15%+ over");
/** One kind of spot: how many examples, how often it was up or down a day later, the average move, and the spread
 * of the move a day later and of the best price within 2 days (each as a rise over the price then, at the 0th,
 * 10th ... 100th percentile). */
export interface MoveBucket { n: number; up24: number; down24: number; ret24: number; r24: number[]; peak: number[] }
/** How well the up/down calls did on the most recent refreshes, which the check model never saw. */
export interface MoveCheck { n: number; brier: number; base_brier: number; skill: number; hit: number }
export interface MoveModel { n: number; cards: number; history_h: number; overall: MoveBucket; by: Record<string, MoveBucket>; check?: MoveCheck | null; trust?: number }
export interface MoveSpot { discount: number; rising: number; falling: number; kind: string; price?: number }
/** General to specific: discount, + bounce, + card type, + price band. */
const moveKeys = (f: MoveSpot) => {
  const d = moveBand(f.discount), b = bounceBand(f.rising, f.falling), k = `${d}|${b}|${f.kind}`;
  return f.price ? [d, `${d}|${b}`, k, `${k}|${priceBand(f.price)}`] : [d, `${d}|${b}`, k];
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;
type MoveEx = { keys: string[]; at: number; ret24: number; peak: number };

function fitMoves(ex: MoveEx[]) {
  const bucket = (xs: MoveEx[]): MoveBucket => {
    const peaks = xs.map((x) => x.peak).sort((a, b) => a - b), rets = xs.map((x) => x.ret24).sort((a, b) => a - b);
    return {
      n: xs.length, up24: r3(xs.filter((x) => x.ret24 > 0.005).length / xs.length), down24: r3(xs.filter((x) => x.ret24 < -0.005).length / xs.length),
      ret24: r3(xs.reduce((t, x) => t + x.ret24, 0) / xs.length),
      r24: Array.from({ length: 11 }, (_, k) => r3(quantile(rets, k / 10)!)),
      peak: Array.from({ length: 11 }, (_, k) => r3(quantile(peaks, k / 10)!)),
    };
  };
  const groups = new Map<string, MoveEx[]>();
  for (const x of ex) for (const k of x.keys) { const g = groups.get(k); if (g) g.push(x); else groups.set(k, [x]); }
  const by: Record<string, MoveBucket> = {};
  for (const [k, xs] of groups) if (xs.length >= MOVE_KEEP) by[k] = bucket(xs);
  return { overall: bucket(ex), by };
}

/** Blends a spot's numbers from the general kind down to the most specific, each step weighted by how many examples
 * it has, so a kind of spot seen only a few times can't swing the answer. */
function blendSpot(m: { overall: MoveBucket; by: Record<string, MoveBucket> }, f: MoveSpot): { b: MoveBucket; key: string; n: number } {
  let cur = m.overall, key = "all", n = m.overall.n;
  for (const k of moveKeys(f)) {
    const b = m.by[k];
    if (!b) break;
    const w = b.n / (b.n + SHRINK), mix = (x: number, y: number) => r3(w * x + (1 - w) * y);
    cur = { n: b.n, up24: mix(b.up24, cur.up24), down24: mix(b.down24, cur.down24), ret24: mix(b.ret24, cur.ret24),
      r24: b.r24.map((v, i) => mix(v, cur.r24[i]!)), peak: b.peak.map((v, i) => mix(v, cur.peak[i]!)) };
    key = k; n = b.n;
  }
  return { b: cur, key, n };
}

/**
 * Pure: every (card, refresh) with at least a day of prices before it and a day after becomes one example. Spots are
 * read with only the prices up to that refresh, as the plan would have seen them. Cards are SeriesCard-shaped
 * (prices oldest first, ages in hours before the latest refresh).
 *
 * Rigour: before trusting it, the model is checked on the most recent quarter of examples by a copy trained only on
 * the older ones (no peeking at the future). Its up/down calls are scored against always guessing the overall rate
 * (Brier score); `trust` (0 to 1) is how much better than that it did, and the plan leans on it only that much.
 */
export function learnMoves(cards: { prices: number[]; ages: number[]; kind: string }[]): MoveModel | null {
  const ex: MoveEx[] = [];
  let history = 0, used = 0;
  for (const c of cards) {
    const n = c.prices.length;
    if (n < 4 || c.ages.length !== n) continue;
    history = Math.max(history, c.ages[0]!);
    let any = false;
    for (let i = 2; i < n - 1; i++) {
      const p = c.prices[i]!, at = c.ages[i]!;
      if (p < 1000) continue;
      const before: number[] = [];
      for (let k = 0; k <= i; k++) if (c.ages[k]! - at <= 168) before.push(c.prices[k]!);
      if (before.length < 3 || c.ages[0]! - at < 20) continue;
      let peak = -Infinity, ret24: number | null = null, gap24 = Infinity, span = 0;
      for (let j = i + 1; j < n; j++) {
        const ahead = at - c.ages[j]!;
        if (ahead <= 0 || ahead > MOVE_AHEAD_H + 0.5) continue;
        peak = Math.max(peak, c.prices[j]!); span = Math.max(span, ahead);
        if (Math.abs(ahead - 24) <= 6 && Math.abs(ahead - 24) < gap24) { gap24 = Math.abs(ahead - 24); ret24 = c.prices[j]! / p - 1; }
      }
      if (ret24 === null || span < 20) continue;
      let rising = 0, falling = 0;
      for (let k = i; k > 0 && c.prices[k]! > c.prices[k - 1]!; k--) rising++;
      for (let k = i; k > 0 && c.prices[k]! < c.prices[k - 1]!; k--) falling++;
      const s = [...before].sort((a, b) => a - b), m = s.length >> 1, med = s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
      ex.push({ keys: moveKeys({ discount: (med - p) / med, rising, falling, kind: c.kind, price: p }), at, ret24, peak: peak / p - 1 });
      any = true;
    }
    if (any) used++;
  }
  if (ex.length < MOVE_MIN) return null;

  // Walk-forward check: train on older refreshes, score on the newest quarter.
  let check: MoveCheck | null = null;
  const ages = [...new Set(ex.map((x) => x.at))].sort((a, b) => a - b);
  const cut = ages[Math.max(0, Math.floor(ages.length * 0.25) - 1)];
  if (cut !== undefined && ages.length >= 2) {
    const test = ex.filter((x) => x.at <= cut), train = ex.filter((x) => x.at > cut);
    if (test.length >= MOVE_MIN && train.length >= MOVE_MIN) {
      const fit = fitMoves(train), base = fit.overall.up24;
      let brier = 0, baseBrier = 0, hit = 0;
      for (const x of test) {
        const [d, db, dbk, dbkp] = x.keys;
        const spot = blendFromKeys(fit, [d!, db!, dbk!, dbkp].filter(Boolean) as string[]);
        const up = x.ret24 > 0.005 ? 1 : 0, p = spot.up24;
        brier += (p - up) ** 2; baseBrier += (base - up) ** 2;
        if ((p >= 0.5) === (up === 1)) hit++;
      }
      brier /= test.length; baseBrier /= test.length;
      check = { n: test.length, brier: r3(brier), base_brier: r3(baseBrier), skill: r3(baseBrier > 0 ? 1 - brier / baseBrier : 0), hit: r3(hit / test.length) };
    }
  }
  const fit = fitMoves(ex);
  // Full trust once it beats the overall-rate guess by 5%+; none if it doesn't beat it; some before it can be checked.
  const trust = check ? r3(clampN(check.skill / 0.05, 0, 1)) : 0.5;
  return { n: ex.length, cards: used, history_h: history, ...fit, check, trust };
}
function blendFromKeys(m: { overall: MoveBucket; by: Record<string, MoveBucket> }, keys: string[]): MoveBucket {
  let cur = m.overall;
  for (const k of keys) {
    const b = m.by[k];
    if (!b) break;
    const w = b.n / (b.n + SHRINK);
    cur = { ...cur, n: b.n, up24: w * b.up24 + (1 - w) * cur.up24, down24: w * b.down24 + (1 - w) * cur.down24 };
  }
  return cur;
}

/** The share of examples whose best price within 2 days was at least `rise` above the price then. */
export function reachChance(b: MoveBucket, rise: number): number {
  const q = b.peak;
  if (rise <= q[0]!) return 1;
  if (rise > q[10]!) return 0;
  for (let k = 1; k <= 10; k++) if (rise <= q[k]!) { const lo = q[k - 1]!, hi = q[k]!; return 1 - ((k - 1) + (hi > lo ? (rise - lo) / (hi - lo) : 1)) / 10; }
  return 0;
}

/** The blended numbers for a spot, or null when nothing has been learned. `n` is the most specific kind's examples. */
export function moveBucket(m: MoveModel | null | undefined, f: MoveSpot): { key: string; b: MoveBucket; n: number } | null {
  if (!m) return null;
  const r = blendSpot(m, f);
  return r.key === "all" ? null : r;
}

/** Where the price is likely to be a day from now: the middle and the 10th to 90th percentile range. */
export function forecast24(m: MoveModel | null | undefined, f: MoveSpot & { price: number }): { low: number; mid: number; high: number; up: number; n: number } | null {
  const hit = moveBucket(m, f);
  if (!hit || !hit.b.r24) return null;
  const at = (r: number) => Math.round(f.price * (1 + r));
  return { low: at(hit.b.r24[1]!), mid: at(hit.b.r24[5]!), high: at(hit.b.r24[9]!), up: hit.b.up24, n: hit.n };
}
export interface StrategyModel {
  version: 1; platform: "console" | "pc"; updated_at: string; window_days: number; ready: boolean;
  buys: { n: number; hits: number; rate: number | null; median_hours_to_hit: number | null; reach: number; rate_at_reach: number | null; factors: Record<string, Record<string, Bucket>> };
  sells: { n: number; good: number; rate: number | null; by_reason: Record<string, Bucket> };
  lessons: string[];
  /** How prices moved after every stored refresh (learnMoves); used until enough real picks have settled. */
  moves?: MoveModel | null;
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
export function learnModel(platform: "console" | "pc", rows: LoggedPick[], now: number, moves: MoveModel | null = null): StrategyModel {
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
  if (!ready && moves) lessons.push(...moveLessons(moves), `${buys.length} of the first ${MIN_RESULTS} real picks have settled; until then picks are rated from these price moves.`);
  else if (!ready) lessons.push(`Still watching: ${buys.length} of the first ${MIN_RESULTS} buy picks have settled. Picks are ranked by the plain rules until then.`);
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
    lessons, moves,
  };
}

/** Plain sentences about how prices have moved. */
export function moveLessons(m: MoveModel): string[] {
  const days = Math.max(1, Math.round(m.history_h / 24));
  const out: string[] = [];
  out.push(`Learned from ${m.n.toLocaleString("en-US")} price moves across ${m.cards.toLocaleString("en-US")} cards over the last ${days} day${days === 1 ? "" : "s"}: what each card did in the 2 days after every refresh.`);
  if (m.check) out.push(m.check.skill > 0
    ? `Tested on the newest ${m.check.n.toLocaleString("en-US")} moves it hadn't seen: it called up or down right ${pc(m.check.hit)}% of the time, ${pc(m.check.skill)}% better than guessing from the market average, so it's trusted ${pc(m.trust ?? 0)}%.`
    : `Tested on the newest ${m.check.n.toLocaleString("en-US")} moves it hadn't seen, it wasn't better than guessing from the market average yet, so picks lean on the plain rules.`);
  const say = (key: string, text: (b: MoveBucket) => string) => { const b = m.by[key]; if (b) out.push(text(b)); };
  say("12%+ under|bounced", (b) => `Cards 12%+ under their usual price that had started to bounce were up a day later ${pc(b.up24)}% of the time; half of them rose ${pc(b.peak[5]!)}% or more within 2 days (${b.n} examples).`);
  say("12%+ under|still dipping", (b) => `Cards 12%+ under their usual price that were still falling kept falling a day later ${pc(b.down24)}% of the time (${b.n} examples), so the plan waits for a bounce.`);
  say("15%+ over", (b) => `Cards 15%+ over their usual price were lower a day later ${pc(b.down24)}% of the time (${b.n} examples): that's when to sell.`);
  say("near usual", (b) => `Cards near their usual price moved ${b.ret24 >= 0 ? "+" : ""}${pc(b.ret24)}% in a day on average, so there's little to gain flipping them.`);
  return out;
}

/** How the model rates a buy pick with these features: a score multiplier and the chance it hits its target. */
export function buyOutlook(model: StrategyModel | null | undefined, f: BuyFeatures, spot?: MoveSpot & { rise: number }): { factor: number; p_hit: number | null; similar: number; from_moves?: boolean } {
  if ((!model?.ready || model.buys.rate === null) && model?.moves && spot) {
    // Not enough settled picks yet: rate the pick from how cards in the same spot moved after earlier refreshes.
    const hit = moveBucket(model.moves, spot);
    if (!hit) return { factor: 1, p_hit: null, similar: 0 };
    // Lean on it only as much as it earned on prices it hadn't seen (trust), else toward the market-wide rate.
    const t = model.moves.trust ?? 0.5, base = reachChance(model.moves.overall, spot.rise), p = t * reachChance(hit.b, spot.rise) + (1 - t) * base;
    return { factor: clampN(base > 0.02 ? p / base : p > 0.1 ? 1.6 : 1, 0.5, 1.6), p_hit: Math.round(clampN(p, 0.02, 0.9) * 100) / 100, similar: hit.n, from_moves: true };
  }
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
export function sellOutlook(model: StrategyModel | null | undefined, reason: string, spot?: MoveSpot): { factor: number; rate: number | null; n: number } {
  const b = model?.sells.by_reason[reason];
  if ((!b || b.n < 15) && model?.moves && spot) {
    // Not enough settled sell calls yet: how often cards in the same spot were lower a day later.
    const hit = moveBucket(model.moves, spot), base = model.moves.overall.down24, t = model.moves.trust ?? 0.5;
    if (hit) { const rate = r3(t * hit.b.down24 + (1 - t) * base); return { factor: clampN(base > 0.05 ? rate / base : 1, 0.5, 1.6), rate, n: hit.n }; }
  }
  if (!b || b.n < 15) return { factor: 1, rate: null, n: b?.n ?? 0 };
  return { factor: b.factor, rate: b.rate, n: b.n };
}
