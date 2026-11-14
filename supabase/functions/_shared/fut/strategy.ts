// Daily FUT strategy (Jeff, 2026-11-10): "tell me what I should buy and sell each day to maximise profit, a daily
// strategy based on all the info we have and our cards and coins".
//
// Built from what GafferBot already has: FUT.GG's twice-daily prices for the market-wide card list (7 days), the
// user's coins and transfer list (XI Lab helper, My Account), their club and which copies are tradeable (club sync),
// their active squad, and the UK clock (weekly FUT market rhythm, Black Friday, TOTY, TOTS).
//
// ADVICE ONLY. Nothing here talks to EA, bids, buys or lists: EA bans automated trading. The user does every trade
// themselves in the Web App or the game. Prices are FUT.GG lowest Buy Now estimates published twice a day, not sales,
// and the weekly rhythm is community knowledge, not EA data, so every plan says so.
//
// The engine (buildStrategy and the helpers it calls) is pure so it can be tested; dailyStrategy loads the data,
// builds today's plan, saves it (fut.strategy_plans) and scores the picks of earlier days against prices since.
// runStrategyLearning (bot job after each refresh) logs and settles market-wide picks and relearns strategy-model.ts.
import { DEFAULT_MARKET_RULES, netAfterTax, roundToStep, stepAt } from "./xilab/market/rules.ts";
import { FutDbError, FutError, type FutDb } from "./service.ts";
import { liveFutggPrices, type LivePrices } from "./futgg-live.ts";
import { bounceBand, buyOutlook, cleanSeries, discountBand, forecast24, learnModel, learnMoves, moveBucket, priceBand, resolvePick, sellOutlook, trendBand, WINDOW_DAYS,
  type BuyFeatures, type LoggedPick, type SellFeatures, type StrategyModel } from "./strategy-model.ts";

type Row = Record<string, unknown>;
const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};
const RULES = DEFAULT_MARKET_RULES;
const net = (price: number) => netAfterTax(price, RULES);
const down = (price: number) => roundToStep(price, "down", RULES);
const near = (price: number) => roundToStep(price, "nearest", RULES);
const pct = (v: number) => Math.round(v * 1000) / 10;
const c = (n: number) => Math.round(n).toLocaleString("en-US");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ------------------------------------------------------------------ price series → stats

/** One card's FUT.GG prices from fut.strategy_price_series: oldest first, ages in hours before the latest refresh. */
export interface SeriesCard {
  ea_item_id: number; name: string; version: string | null; rating: number; position: string | null;
  club?: string | null; league?: string | null; nation?: string | null; is_icon: boolean; is_hero: boolean; tracked: boolean;
  prices: number[]; ages: number[];
}

export interface CardStats {
  latest: number; latest_age_h: number; prev: number | null;
  change_24h: number | null; change_72h: number | null;
  median: number; min: number; max: number; points: number;
  /** Refreshes in a row the price fell (or rose) up to the latest one. */
  falling: number; rising: number;
  /** First seen after the window started: a card new to the market (fresh promo cards usually keep falling). */
  new_card: boolean;
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The price about `hours` before the latest point (within 6 hours), as a % change to now. */
function changeOver(card: SeriesCard, hours: number): number | null {
  const n = card.prices.length;
  if (n < 2) return null;
  const want = card.ages[n - 1]! + hours;
  let best = -1, gap = Infinity;
  for (let i = 0; i < n - 1; i++) { const g = Math.abs(card.ages[i]! - want); if (g < gap) { gap = g; best = i; } }
  if (best < 0 || gap > 6) return null;
  return pct((card.prices[n - 1]! - card.prices[best]!) / card.prices[best]!);
}

/** `window_h`: hours the series covers (the oldest refresh's age), for spotting cards new to the market. */
export function cardStats(card: SeriesCard, window_h: number): CardStats | null {
  const n = card.prices.length;
  if (!n || card.prices.length !== card.ages.length) return null;
  let falling = 0, rising = 0;
  for (let i = n - 1; i > 0 && card.prices[i]! < card.prices[i - 1]!; i--) falling++;
  for (let i = n - 1; i > 0 && card.prices[i]! > card.prices[i - 1]!; i--) rising++;
  return {
    latest: card.prices[n - 1]!, latest_age_h: card.ages[n - 1]!, prev: n > 1 ? card.prices[n - 2]! : null,
    change_24h: changeOver(card, 24), change_72h: changeOver(card, 72),
    median: median(card.prices), min: Math.min(...card.prices), max: Math.max(...card.prices), points: n, falling, rising,
    new_card: window_h >= 48 && card.ages[0]! < window_h - 18,
  };
}

/**
 * Adds FUT.GG's newest prices (futgg-live.ts) to the stored series as the latest point, so the plan uses this hour's
 * Buy Now estimates instead of the last 06:00/18:00 refresh. Ages shift by the time since that refresh. Cards FUT.GG
 * has no current price for keep their old points, and `fresh` lists the cards that got a live price.
 */
export function withLive<S extends { latest: string | null; window_h: number; cards: SeriesCard[] }>(series: S, live: LivePrices | null | undefined): { series: S; fresh: Set<number> | null; live_at: string | null } {
  if (!live || !series.latest) return { series, fresh: null, live_at: null };
  const h = Math.round(((Date.parse(live.at) - Date.parse(series.latest)) / 3_600_000) * 10) / 10;
  if (!(h >= 0.25)) {
    // The stored refresh is as new as the live file: every stored latest price is current.
    return { series, fresh: new Set(series.cards.filter((c) => live.prices.has(c.ea_item_id)).map((c) => c.ea_item_id)), live_at: series.latest };
  }
  const fresh = new Set<number>();
  const cards = series.cards.map((card) => {
    const price = live.prices.get(card.ea_item_id), ages = card.ages.map((a) => a + h);
    if (price === undefined) return { ...card, ages };
    fresh.add(card.ea_item_id);
    return { ...card, prices: [...card.prices, price], ages: [...ages, 0] };
  });
  return { series: { ...series, latest: live.at, window_h: series.window_h + h, cards }, fresh, live_at: live.at };
}

export type CardKind = "icon" | "hero" | "promo" | "fodder" | "gold" | "silver_bronze";
export function cardKind(c: Pick<SeriesCard, "version" | "rating" | "is_icon" | "is_hero">): CardKind {
  if (c.is_icon) return "icon";
  if (c.is_hero) return "hero";
  const v = (c.version ?? "").toLowerCase();
  const base = !v || ["rare", "common", "non-rare", "non rare", "base", "gold", "silver", "bronze"].some((x) => v === x || v.endsWith(` ${x}`));
  if (!base) return "promo";
  if (c.rating >= 83 && c.rating <= 88) return "fodder";
  return c.rating >= 75 ? "gold" : "silver_bronze";
}

// ------------------------------------------------------------------ the clock: UK time, weekly rhythm, big events

export interface UkClock { date: string; weekday: number; hour: number; month: number; day: number; year: number }
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** FUT's day turns at 18:00 UK, so everything here runs on UK time. */
export function ukClock(now: number): UkClock {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
    .formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), hour: Number(parts.hour) % 24, month, day, year };
}

/** Black Friday: the day after the fourth Thursday of November. */
export function blackFriday(year: number): string {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const thursday = 1 + ((4 - first + 7) % 7) + 21;
  return new Date(Date.UTC(year, 10, thursday + 1)).toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export interface Timing {
  uk_time: string; weekday: string;
  /** -1..1: how good a time it is to buy, and to sell, from the weekly rhythm and the calendar. */
  buy_bias: number; sell_bias: number;
  /** Extra share of coins to keep back today (added to the base reserve). */
  extra_reserve: number;
  now: string; next: string | null;
  events: { name: string; date: string; days: number; advice: string }[];
  /** Always shown: the 18:00 UK content drop and the SBC fodder cycle. */
  daily: string;
}

export function marketTiming(now: number): Timing {
  const k = ukClock(now), wd = k.weekday, h = k.hour;
  let buy = 0, sell = 0, extra = 0, nowText: string, next: string | null = null;
  if (wd === 1) { buy = 1; sell = -0.5; nowText = "Monday: the weekend's games are over and prices are usually at their weekly low. A good day to buy cards to sell later in the week."; next = "Sell what you buy today from Thursday evening to Saturday, when demand for the weekend's games peaks."; }
  else if (wd === 2 || wd === 3) { buy = 0.5; nowText = `${DAYS[wd]}: a quiet midweek market. Buy now for the weekend; prices usually drift up from Thursday.`; next = "Weekend rewards land on Thursday morning (UK), which floods the market with packed cards for a few hours."; }
  else if (wd === 4 && h < 8) { sell = 1; buy = -0.5; nowText = "Thursday before 08:00 UK: weekend rewards land soon and push prices down for a few hours. Sell anything you planned to sell now."; next = "Buy later today once the reward packs are opened."; }
  else if (wd === 4) { buy = 1; nowText = "Thursday: weekend rewards are being opened, so prices dip through the day. A good afternoon to buy."; next = "Prices usually climb into Friday afternoon; sell before the 18:00 UK promo drop on Friday."; }
  else if (wd === 5 && h < 18) { sell = 1; buy = -1; extra = 0.2; nowText = "Friday before 18:00 UK: prices usually peak ahead of the weekend and the new promo. Sell now and keep coins back."; next = "At 18:00 UK the new promo packs land and prices usually drop for a few hours: that's the time to buy."; }
  else if (wd === 5) { buy = 1; sell = -1; nowText = "Friday evening: the new promo just dropped and pack openings usually pull prices down. One of the best buying windows of the week."; next = "Sell on Saturday when demand for the weekend's games peaks."; }
  else if (wd === 6) { sell = 1; buy = -0.5; nowText = "Saturday: weekend games are in full swing and demand for good players peaks. A good day to sell."; next = "Demand falls on Sunday evening as the weekend's games end."; }
  else if (h < 18) { sell = 0.5; nowText = "Sunday: sell what you don't need before the evening; demand falls as the weekend's games end."; next = "Buy on Monday when prices are usually at their weekly low."; }
  else { buy = 0.5; nowText = "Sunday evening: the weekend's games are ending and prices start to soften. You can begin buying for next week."; next = "Monday is usually the cheapest day of the week."; }

  const events: Timing["events"] = [];
  const bf = blackFriday(k.year), toBf = daysBetween(k.date, bf);
  if (toBf > 0 && toBf <= 21) {
    events.push({ name: "Black Friday", date: bf, days: toBf, advice: `Black Friday is ${toBf} day${toBf === 1 ? "" : "s"} away. It usually brings one of the biggest market drops of the year, with flash promos and cheap packs. ${toBf <= 10 ? "Keep more coins than usual and sell cards you don't need before it." : "Start selling cards you don't need over the next week."}` });
    if (toBf <= 10) { extra += 0.15; sell += 0.5; }
  } else if (toBf <= 0 && toBf >= -3) {
    events.push({ name: "Black Friday", date: bf, days: toBf, advice: "Black Friday promos are running and the market is usually at its lowest. Buy the cards you want for the weeks after." });
    buy += 1;
  }
  const toty = k.month === 12 || (k.month === 1 && k.day <= 25);
  if (toty) {
    events.push({ name: "Team of the Year", date: `${k.month === 12 ? k.year + 1 : k.year}-01-15`, days: daysBetween(k.date, `${k.month === 12 ? k.year + 1 : k.year}-01-15`), advice: "Team of the Year usually lands in mid-January and drops high-end prices hard. Sell expensive cards you don't need before it, then buy back during it." });
    if (k.month === 12 && k.day >= 20 || k.month === 1 && k.day <= 10) { extra += 0.15; sell += 0.5; }
  }
  if ((k.month === 4 && k.day >= 15) || k.month === 5 || (k.month === 6 && k.day <= 10)) {
    events.push({ name: "Team of the Season", date: `${k.year}-05-01`, days: daysBetween(k.date, `${k.year}-05-01`), advice: "Team of the Season runs from late April into June, one league at a time. Each league's release usually drops prices of that league's best cards." });
  }
  return {
    uk_time: `${String(h).padStart(2, "0")}:00`, weekday: DAYS[wd]!, buy_bias: clamp(buy, -1, 1), sell_bias: clamp(sell, -1, 1), extra_reserve: extra,
    now: nowText, next, events,
    daily: h < 18 ? "New SBCs and content land at 18:00 UK every day. Fodder (83 to 88 rated gold cards) usually jumps in the hour after a big SBC: buy fodder in the morning and list it just before 18:00." :
      "Today's 18:00 UK content is out. If a big SBC landed, fodder is at its daily high now: list fodder you don't need, and buy fodder again tomorrow morning.",
  };
}

// ------------------------------------------------------------------ the plan

export interface ClubCard { card_id: string; ea_item_id: number | null; name: string; version: string | null; rating: number | null; position: string | null; tradeable_quantity: number; price: number | null }
export interface PileItem { ea_item_id: number; state: string; buy_now: number | null; current_bid: number | null; untradeable: boolean; rating: number | null }
export interface PastPlan { plan_date: string; prices_at: string | null; buys: { ea_item_id: number; name: string; buy_at: number; sell_at: number }[] }

export interface StrategyInput {
  now: number;
  /** null when the helper hasn't sent the balance and no budget was given. */
  coins: number | null; coins_source: "helper" | "entered" | null; coins_at: string | null;
  series: { latest: string | null; window_h: number; cards: SeriesCard[] };
  club: ClubCard[] | null;
  tradepile: PileItem[] | null; tradepile_max: number | null;
  squad_card_ids: Set<string>;
  past: PastPlan[];
  risk?: "careful" | "normal" | "bold";
  /** What the learning job has learned from earlier picks on this platform (strategy-model.ts). */
  model?: StrategyModel | null;
  /** Trades from the user's trade log that followed an earlier pick. */
  followed?: FollowedTrade[];
  /** FUT.GG's newest hourly prices; null when they couldn't be fetched (the plan then flags its prices as old). */
  live?: LivePrices | null;
}
export interface FollowedTrade { plan_date: string; ea_item_id: number; name: string; bought_for: number; sold_for: number | null; profit: number | null; target: number }

export interface BuyPick {
  ea_item_id: number; name: string; version: string | null; rating: number; position: string | null; kind: CardKind;
  price: number; buy_at: number; sell_at: number; profit: number; roi: number;
  quantity: number | null; spend: number | null; total_profit: number | null;
  median: number; low: number; high: number; change_24h: number | null; points: number;
  confidence: "low" | "medium" | "high"; hold: string; why: string[]; risks: string[]; score: number;
  /** The plain-rules target before learning lowered it, the pick's features, and the learned chance it sells. */
  target_raw: number; features: BuyFeatures; p_hit: number | null;
  /** The most you can pay and still make the profit floor after tax: if the Buy Now price in the game is higher, skip it. */
  max_buy: number;
  /** Where the price is likely to be a day from now, from how cards in the same spot moved (null until learned). */
  forecast: Forecast | null;
}
export interface Forecast { low: number; mid: number; high: number; up: number; n: number }
export interface SellPick {
  card_id: string; ea_item_id: number; name: string; version: string | null; rating: number | null; position: string | null;
  quantity: number; list_at: number; quick_at: number; after_tax: number; median: number | null; high: number | null; change_24h: number | null;
  reason: "near_high" | "falling" | "weekend_demand" | "before_event"; why: string; in_squad: boolean; score: number;
  /** How often this kind of sell call was right before, once the model has enough results. */
  right_rate: number | null;
  forecast: Forecast | null;
}
export interface PileFix { ea_item_id: number; name: string; rating: number | null; state: string; buy_now: number | null; price: number | null; action: "clear" | "relist" | "lower"; list_at: number | null; why: string }

const RISK = { careful: { reserve: 0.35, picks: 4, cap: 0.2, min_roi: 0.05 }, normal: { reserve: 0.2, picks: 6, cap: 0.3, min_roi: 0.03 }, bold: { reserve: 0.1, picks: 8, cap: 0.4, min_roi: 0.02 } };
const MIN_PROFIT = 150;

/** Candidates for flipping: liquid cards trading clearly below their 7-day middle that have stopped falling. */
export function scoreBuys(cards: { card: SeriesCard; stats: CardStats }[], timing: Timing, o: { max_price: number; min_roi: number; owned: Set<number>; model?: StrategyModel | null; fresh?: Set<number> | null }): BuyPick[] {
  const reach = o.model?.ready ? o.model.buys.reach : 1;
  const out: BuyPick[] = [];
  for (const { card, stats: s } of cards) {
    if (!card.tracked || s.points < 6 || s.latest_age_h > 13 || s.latest < 1000 || s.latest > o.max_price) continue;
    // Silver and bronze cards trade too thinly: their "prices" are a listing or two, and the 2026-11-14 review found
    // their dips and doublings were mostly that flicker, not money anyone could make.
    if (cardKind(card) === "silver_bronze") continue;
    if (s.new_card) continue; // fresh promo cards usually keep falling for days
    if (o.fresh && !o.fresh.has(card.ea_item_id)) continue; // no current Buy Now price from FUT.GG: don't guess
    const discount = (s.median - s.latest) / s.median;
    if (discount < 0.05) continue;
    // Far under its week on a liquid card is usually a bad price point or a crash, not a bargain.
    if (discount > 0.45) continue;
    // A price that just jumped well above the last refresh (an SBC spike) isn't a dip.
    if (s.prev !== null && s.latest > s.prev * 1.25) continue;
    if (s.falling >= 3 && s.latest <= s.min) continue; // still making new lows: a falling knife
    const buy_at = down(s.latest);
    // Aim for the usual price, but never more than 30% above today's: dips that paid in our data climbed 10 to 30%.
    const target_raw = down(Math.min(s.median, s.max * 0.98, s.latest * 1.3));
    // Learning: when picks usually peak short of the middle price, aim for the part of the gap they really reach.
    let sell_at = reach < 1 && target_raw > buy_at ? Math.max(buy_at, down(buy_at + (target_raw - buy_at) * reach)) : target_raw;
    // Before enough picks have settled: aim for the rise that half the cards in the same spot reached within 2 days.
    if (!o.model?.ready && o.model?.moves) {
      const mb = moveBucket(o.model.moves, { discount, rising: s.rising, falling: s.falling, kind: cardKind(card), price: s.latest });
      const likely = mb ? down(buy_at * (1 + mb.b.peak[5]!)) : sell_at;
      if (likely < sell_at && likely > buy_at) sell_at = likely;
    }
    const profit = net(sell_at) - buy_at, roi = profit / buy_at;
    if (profit < MIN_PROFIT || roi < o.min_roi) continue;
    const max_buy = Math.max(buy_at, down(Math.min(net(sell_at) / (1 + o.min_roi), net(sell_at) - MIN_PROFIT)));
    const kind = cardKind(card), range = (s.max - s.min) / s.median;
    if (range > 1) continue; // more than doubled and halved in a week: not a price you can trade on
    // No bonus for a bounce: in our data, dips that had already bounced did worst over the next 2 days (the rebound
    // had happened), while dips still falling or flat recovered more often.
    let conf = clamp(s.points / 12, 0.4, 1) * (range > 0.6 ? 0.6 : 1);
    if (s.change_72h !== null && s.change_72h < -20) conf *= 0.7;
    const why = [`${pct(discount)}% under its 7-day middle price (${c(s.median)}).`];
    if (s.rising >= 1) why.push(`Bounced off its low: up ${s.rising === 1 ? "since the last refresh" : `${s.rising} refreshes in a row`}.`);
    else if (s.falling === 0) why.push("Stopped falling at the last refresh.");
    why.push(`Traded between ${c(s.min)} and ${c(s.max)} this week.`);
    let bonus = 0;
    if (kind === "fodder") { why.push("SBC fodder: rated 83 to 88 golds usually rise when big SBCs land at 18:00 UK."); bonus = timing.buy_bias >= 0 ? 0.15 : 0.05; }
    if (o.owned.has(card.ea_item_id)) why.push("You already own a copy.");
    const risks: string[] = [];
    if (s.falling >= 2) risks.push(`Fell ${s.falling} refreshes before the latest one.`);
    if (s.rising >= 1) risks.push("It has already bounced: in our data, dips that had bounced gained less over the next 2 days than ones still at their low.");
    if (range > 0.6) risks.push("Very jumpy price this week.");
    if (s.change_72h !== null && s.change_72h < -20) risks.push(`Down ${Math.abs(s.change_72h)}% in 3 days: could be a new promo pulling it down.`);
    if (kind === "promo") risks.push("Promo card: supply can jump if it comes back in packs or an SBC.");
    const features: BuyFeatures = { kind, band: priceBand(s.latest), discount: discountBand(discount), bounce: bounceBand(s.rising, s.falling), trend: trendBand(s.change_72h), weekday: timing.weekday };
    const learned = buyOutlook(o.model, features, { discount, rising: s.rising, falling: s.falling, kind, price: s.latest, rise: sell_at / buy_at - 1 });
    const forecast = forecast24(o.model?.moves, { discount, rising: s.rising, falling: s.falling, kind, price: s.latest });
    if (learned.p_hit !== null && learned.from_moves) {
      why.push(`Cards in the same spot reached a price this high within 2 days ${Math.round(learned.p_hit * 100)}% of the time (${learned.similar.toLocaleString("en-US")} past price moves).`);
      if (learned.factor < 0.8) risks.push("Cards in this spot have usually not climbed this far, so it's ranked lower.");
    } else if (learned.p_hit !== null) {
      why.push(`Past picks like this reached their target ${Math.round(learned.p_hit * 100)}% of the time${learned.similar ? ` (from ${learned.similar}+ similar picks)` : ""}.`);
      if (learned.factor < 0.8) risks.push("Picks like this have done worse than average, so it's ranked lower.");
    }
    const score = (roi * conf * (1 + 0.3 * timing.buy_bias) + bonus * roi) * learned.factor;
    if (learned.p_hit !== null) conf = learned.p_hit >= 0.6 ? 1 : learned.p_hit >= 0.4 ? 0.7 : 0.4;
    out.push({
      ea_item_id: card.ea_item_id, name: card.name, version: card.version, rating: card.rating, position: card.position, kind,
      price: s.latest, buy_at, sell_at, profit, roi: pct(roi), quantity: null, spend: null, total_profit: null,
      median: Math.round(s.median), low: s.min, high: s.max, change_24h: s.change_24h, points: s.points,
      confidence: conf >= 0.85 ? "high" : conf >= 0.6 ? "medium" : "low", hold: o.model?.ready && o.model.buys.median_hours_to_hit != null ? `about ${o.model.buys.median_hours_to_hit} hours` : kind === "fodder" ? "Same day to 2 days" : "1 to 4 days", why, risks, score,
      target_raw, features, p_hit: learned.p_hit, max_buy, forecast,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Your tradeable club cards worth selling today. */
export function scoreSells(club: ClubCard[], stats: Map<number, CardStats>, timing: Timing, squad: Set<string>, model?: StrategyModel | null): SellPick[] {
  const out: SellPick[] = [];
  const event = timing.events.find((e) => e.days > 0 && e.days <= 10);
  for (const card of club) {
    if (card.tradeable_quantity <= 0 || !card.ea_item_id) continue;
    const s = stats.get(card.ea_item_id);
    const price = s && s.latest_age_h <= 13 ? s.latest : card.price;
    if (!price || price < 1000) continue;
    const premium = s ? (price - s.median) / s.median : 0;
    let reason: SellPick["reason"] | null = null, why = "", score = 0;
    if (s && s.points >= 6 && premium >= 0.06) { reason = "near_high"; why = `${pct(premium)}% above its 7-day middle price (${c(s.median)}). Prices this far up usually come back down.`; score = premium; }
    else if (s && s.points >= 6 && s.max > s.min * 1.05 && price >= s.max * 0.97) { reason = "near_high"; why = `At its weekly high (${c(s.max)}).`; score = 0.05; }
    else if (s && s.falling >= 3 && s.change_72h !== null && s.change_72h <= -8) { reason = "falling"; why = `Down ${Math.abs(s.change_72h)}% in 3 days and still falling. If you don't use it, selling now saves losing more.`; score = Math.abs(s.change_72h) / 200; }
    else if (timing.sell_bias > 0 && (card.rating ?? 0) >= 86) { reason = "weekend_demand"; why = "Demand for highly rated players is at its weekly peak. If you won't play it this weekend, now is a good time."; score = 0.03; }
    else if (event && price >= 20_000) { reason = "before_event"; why = `${event.name} is ${event.days} day${event.days === 1 ? "" : "s"} away and usually drops prices. Sell it now if you don't need it.`; score = 0.02; }
    if (!reason) continue;
    const list_at = near(price), quick_at = Math.max(RULES.min_price, list_at - stepAt(list_at, RULES));
    const in_squad = squad.has(card.card_id);
    if (in_squad) why += " It's in your active squad, so only sell if you have a replacement.";
    const usedCalls = (model?.sells.by_reason[reason]?.n ?? 0) >= 15;
    const spot = s ? { discount: (s.median - price) / s.median, rising: s.rising, falling: s.falling, kind: cardKind({ version: card.version, rating: card.rating ?? 0, is_icon: false, is_hero: false }), price } : undefined;
    const learned = sellOutlook(model, reason, spot);
    const forecast = spot ? forecast24(model?.moves, spot) : null;
    if (learned.rate !== null) why += usedCalls ? ` Calls like this were right ${Math.round(learned.rate * 100)}% of the time (${learned.n} calls).` : ` Cards in the same spot were lower a day later ${Math.round(learned.rate * 100)}% of the time (${learned.n.toLocaleString("en-US")} past price moves).`;
    score = score * (1 + 0.3 * timing.sell_bias) * (in_squad ? 0.3 : 1) * Math.log10(price) * learned.factor;
    out.push({
      card_id: card.card_id, ea_item_id: card.ea_item_id, name: card.name, version: card.version, rating: card.rating, position: card.position,
      quantity: card.tradeable_quantity, list_at, quick_at, after_tax: net(list_at) * card.tradeable_quantity,
      median: s ? Math.round(s.median) : null, high: s?.max ?? null, change_24h: s?.change_24h ?? null, reason, why, in_squad, score, right_rate: learned.rate, forecast,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Transfer list housekeeping: clear sales, relist expired items, reprice listings the market won't pay. */
export function pileFixes(items: PileItem[], stats: Map<number, CardStats>, names: Map<number, string>): PileFix[] {
  const out: PileFix[] = [];
  for (const i of items) {
    const s = stats.get(i.ea_item_id), price = s && s.latest_age_h <= 13 ? s.latest : null;
    const name = names.get(i.ea_item_id) ?? `Item ${i.ea_item_id}`;
    if (i.state === "sold") out.push({ ea_item_id: i.ea_item_id, name, rating: i.rating, state: i.state, buy_now: i.buy_now, price, action: "clear", list_at: null, why: `Sold for ${c(i.current_bid ?? i.buy_now ?? 0)}. Clear it to collect the coins and free the slot.` });
    else if ((i.state === "expired" || i.state === "unlisted") && !i.untradeable) out.push({ ea_item_id: i.ea_item_id, name, rating: i.rating, state: i.state, buy_now: i.buy_now, price, action: "relist", list_at: price ? near(price) : null, why: price ? `Not selling. Relist at ${c(near(price))}, the current lowest price.` : "Not selling. Check the current price before relisting." });
    else if (i.state === "listed" && price && i.buy_now && i.buy_now > price * 1.1) out.push({ ea_item_id: i.ea_item_id, name, rating: i.rating, state: i.state, buy_now: i.buy_now, price, action: "lower", list_at: near(price), why: `Listed at ${c(i.buy_now)}, ${pct(i.buy_now / price - 1)}% above the market. When it expires, relist at ${c(near(price))}.` });
  }
  const order = { clear: 0, relist: 1, lower: 2 };
  return out.sort((a, b) => order[a.action] - order[b.action] || (b.price ?? 0) - (a.price ?? 0));
}

/** How earlier days' buy picks did: a pick "hit" when a later refresh reached its sell price. */
export function scorePast(past: PastPlan[], series: Map<number, SeriesCard>, latest: string | null) {
  if (!latest) return { days: 0, picks: 0, hit: 0, open_up: 0, open_down: 0, avg_now_pct: null as number | null, items: [] as unknown[] };
  const items = past.flatMap((p) => p.buys.map((b) => {
    const card = series.get(b.ea_item_id), age = p.prices_at ? (Date.parse(latest) - Date.parse(p.prices_at)) / 3_600_000 : null;
    if (!card || age === null) return { plan_date: p.plan_date, name: b.name, buy_at: b.buy_at, sell_at: b.sell_at, best: null, now: null, outcome: "unknown" as const, now_pct: null };
    const after = card.prices.filter((_, i) => card.ages[i]! < age - 0.5);
    const now = card.prices.at(-1)!, best = after.length ? Math.max(...after) : null;
    const hit = best !== null && best >= b.sell_at;
    const now_pct = pct((net(now) - b.buy_at) / b.buy_at);
    return { plan_date: p.plan_date, name: b.name, buy_at: b.buy_at, sell_at: b.sell_at, best, now, outcome: hit ? "hit" as const : now_pct >= 0 ? "open_up" as const : after.length ? "open_down" as const : "too_soon" as const, now_pct };
  }));
  const known = items.filter((i) => i.outcome !== "unknown" && i.outcome !== "too_soon");
  return {
    days: past.length, picks: known.length,
    hit: known.filter((i) => i.outcome === "hit").length, open_up: known.filter((i) => i.outcome === "open_up").length, open_down: known.filter((i) => i.outcome === "open_down").length,
    avg_now_pct: known.length ? pct(known.reduce((n, i) => n + (i.now_pct ?? 0), 0) / known.length / 100) : null,
    items,
  };
}

export function buildStrategy(raw: StrategyInput) {
  const lived = withLive(raw.series, raw.live);
  const input = { ...raw, series: { ...lived.series, cards: lived.series.cards.map((c) => cleanSeries(c)) } };
  const timing = marketTiming(input.now);
  const risk = RISK[input.risk ?? "normal"];
  const byEa = new Map(input.series.cards.map((card) => [card.ea_item_id, card]));
  const stats = new Map<number, CardStats>();
  for (const card of input.series.cards) { const s = cardStats(card, input.series.window_h); if (s) stats.set(card.ea_item_id, s); }

  // Market mood: the middle 24-hour move across the tracked card list.
  const moves = input.series.cards.flatMap((card) => { const s = stats.get(card.ea_item_id); return card.tracked && s && s.change_24h !== null && s.latest_age_h <= 13 ? [s.change_24h] : []; });
  const moves72 = input.series.cards.flatMap((card) => { const s = stats.get(card.ea_item_id); return card.tracked && s && s.change_72h !== null && s.latest_age_h <= 13 ? [s.change_72h] : []; });
  const m24 = moves.length >= 50 ? Math.round(median(moves) * 10) / 10 : null, m72 = moves72.length >= 50 ? Math.round(median(moves72) * 10) / 10 : null;
  const mood = m24 === null ? "unknown" : m24 <= -2 ? "falling" : m24 >= 2 ? "rising" : "steady";
  const moodBuy = mood === "falling" ? 0.3 : mood === "rising" ? -0.3 : 0;
  const tilt = clamp(timing.buy_bias + moodBuy - timing.sell_bias, -2, 2);
  const stance = tilt >= 0.75 ? "buy" : tilt <= -0.75 ? "sell" : "flip";

  // Budget: keep a reserve, split the rest over a few cards so one bad pick can't sink the day.
  const reserve_pct = clamp(risk.reserve + timing.extra_reserve + (stance === "sell" ? 0.15 : 0) - (stance === "buy" ? 0.05 : 0), 0.05, 0.7);
  const coins = input.coins;
  const reserve = coins === null ? null : Math.round(coins * reserve_pct);
  const spend = coins === null ? null : coins - reserve!;
  const per_pick = spend === null ? null : Math.max(0, Math.floor(spend * risk.cap));
  const used_slots = input.tradepile?.length ?? 0, max_slots = input.tradepile_max ?? 100;
  const free_slots = Math.max(0, max_slots - used_slots);

  const owned = new Set((input.club ?? []).flatMap((x) => (x.ea_item_id ? [x.ea_item_id] : [])));
  const candidates = scoreBuys([...stats].flatMap(([ea, s]) => { const card = byEa.get(ea); return card ? [{ card, stats: s }] : []; }), timing, {
    max_price: per_pick !== null && per_pick >= 1000 ? per_pick : 15_000_000, min_roi: risk.min_roi, owned, model: input.model, fresh: lived.fresh,
  });
  const buys: BuyPick[] = [], seenPlayer = new Set<string>();
  let left = spend ?? 0, slots = free_slots;
  for (const p of candidates) {
    if (buys.length >= risk.picks) break;
    const player = `${p.name}|${p.rating}`;
    if (seenPlayer.has(player)) continue;
    if (spend !== null) {
      const cap = Math.min(per_pick!, left), maxQty = p.price >= 50_000 ? 2 : p.price >= 10_000 ? 5 : 10;
      const qty = Math.min(Math.floor(cap / p.buy_at), maxQty, slots);
      if (qty < 1) continue;
      p.quantity = qty; p.spend = qty * p.buy_at; p.total_profit = qty * p.profit;
      left -= p.spend; slots -= qty;
    }
    seenPlayer.add(player);
    buys.push(p);
  }
  const ranges = priceRanges(stats, byEa, timing, { min_roi: risk.min_roi, owned, model: input.model, fresh: lived.fresh, per_pick, cap_slots: free_slots, taken: buys });
  const watch = candidates.filter((p) => !buys.includes(p) && !seenPlayer.has(`${p.name}|${p.rating}`)).slice(0, 8);

  const sells = input.club ? scoreSells(input.club, stats, timing, input.squad_card_ids, input.model).slice(0, stance === "sell" ? 10 : 6) : [];
  const names = new Map<number, string>([...byEa].map(([k, v]) => [k, v.name]));
  for (const x of input.club ?? []) if (x.ea_item_id) names.set(x.ea_item_id, x.name);
  const pile = input.tradepile ? pileFixes(input.tradepile, stats, names) : [];
  const record = scorePast(input.past, byEa, input.series.latest);

  const buySpend = buys.reduce((n, b) => n + (b.spend ?? 0), 0), buyProfit = buys.reduce((n, b) => n + (b.total_profit ?? 0), 0);
  const sellValue = sells.reduce((n, s) => n + s.after_tax, 0);
  const sold = pile.filter((p) => p.action === "clear"), relist = pile.filter((p) => p.action !== "clear");
  const soldCoins = (input.tradepile ?? []).filter((i) => i.state === "sold").reduce((n, i) => n + netAfterTax(i.current_bid ?? i.buy_now ?? 0, RULES), 0);

  // Today's steps, in the order to do them.
  const steps: string[] = [];
  if (sold.length) steps.push(`Clear ${sold.length} sold item${sold.length === 1 ? "" : "s"} on your transfer list to collect the coins.`);
  if (relist.length) steps.push(`Relist ${relist.length} item${relist.length === 1 ? "" : "s"} at today's price (see Transfer list).`);
  if (sells.length) steps.push(`${timing.sell_bias > 0 ? "List now" : "List when it suits you"}: ${sells.slice(0, 3).map((s) => s.name).join(", ")}${sells.length > 3 ? ` and ${sells.length - 3} more` : ""}, about ${c(sellValue)} coins after tax.`);
  if (buys.length) steps.push(`${timing.buy_bias < 0 ? "Wait for the dip, then buy" : "Buy"} ${buys.length} card${buys.length === 1 ? "" : "s"}${buySpend ? ` for about ${c(buySpend)} coins` : ""}, and list each at its sell price straight away${buyProfit ? ` (about ${c(buyProfit)} profit after tax if they all sell)` : ""}.`);
  if (reserve !== null) steps.push(`Keep ${c(reserve)} coins (${Math.round(reserve_pct * 100)}%) back${timing.extra_reserve > 0 ? " for the drop ahead" : " for surprises"}.`);
  if (coins === null) steps.push("Open the EA Web App with the XI Lab helper running (or enter your coins) so the plan can size each buy.");

  const moodText = m24 === null ? "Not enough price history yet to read the market." : `The market is ${mood === "steady" ? "steady" : mood} (middle card ${m24 > 0 ? "+" : ""}${m24}% in 24 hours${m72 !== null ? `, ${m72 > 0 ? "+" : ""}${m72}% in 3 days` : ""}).`;
  const stanceText = { buy: "Today is a buying day.", sell: "Today is a selling day.", flip: "Today is a day for quick flips: buy cheap, list straight away." }[stance];

  const notes = [
    "Advice only. GafferBot never bids, buys or lists for you: EA bans automated trading. Do every trade yourself.",
    "Prices are FUT.GG's lowest Buy Now estimates, refreshed at 06:00 and 18:00 UTC, not actual sales. Check the price in the game before you buy.",
    `Profit is after EA's ${Math.round(RULES.transfer_tax_rate * 100)}% tax and rounded to price steps. Buy prices assume you buy at today's lowest price; sniping or bidding lower adds profit.`,
    "The weekly rhythm (Monday lows, Thursday rewards, Friday 18:00 UK promos, Saturday highs) is community knowledge, not EA data.",
  ];
  if (input.series.window_h < 72) notes.push(`Only ${Math.max(1, Math.round(input.series.window_h / 24))} day${input.series.window_h < 36 ? "" : "s"} of price history so far: picks get better as a full week builds up.`);

  return {
    as_of: new Date(input.now).toISOString(), uk_date: ukClock(input.now).date, prices_at: input.series.latest,
    headline: `${stanceText} ${moodText}`,
    stance, mood: { label: mood, median_24h: m24, median_72h: m72, cards: moves.length },
    timing,
    prices: priceFreshness(raw.series.latest, lived.live_at, raw.live === undefined ? null : !!raw.live, input.now),
    budget: { coins, coins_source: input.coins_source, coins_at: input.coins_at, reserve_pct: Math.round(reserve_pct * 100), reserve, spend, per_pick, buy_spend: buySpend, expected_profit: buyProfit, free_slots, risk: input.risk ?? "normal" },
    move: bestMove({ buys, sells, pile, stance, timing, coins, sold_coins: soldCoins, prices_at: input.series.latest, now: input.now, stale: !lived.live_at && !!input.series.latest && input.now - Date.parse(input.series.latest) > 3 * 3_600_000 }),
    ranges, steps, buys, watch, sells, transfer_list: pile, record, learning: learningSummary(input.model, input.followed ?? []), notes, verified: false as const,
  };
}
export type Strategy = ReturnType<typeof buildStrategy>;

// ------------------------------------------------------------------ best pick per price range

export const PRICE_RANGES = [
  { key: "low", label: "Low price", sub: "1k to 10k", min: 1_000, max: 10_000 },
  { key: "medium", label: "Medium price", sub: "10k to 100k", min: 10_000, max: 100_000 },
  { key: "high", label: "High price", sub: "100k and up", min: 100_000, max: 15_000_001 },
] as const;
export interface RangePick { key: (typeof PRICE_RANGES)[number]["key"]; label: string; sub: string; pick: BuyPick | null; affordable: boolean | null; others: BuyPick[] }

/**
 * The best flip in each price range across the whole market (Jeff, 2026-11-11: "show me low priced recs, medium
 * price rec, and high price recs"), whatever the budget, ranked like the plan's picks. Sized to the coins when known;
 * `affordable` is false when one copy is more than the plan would put into a single card.
 */
export function priceRanges(stats: Map<number, CardStats>, byEa: Map<number, SeriesCard>, timing: Timing, o: { min_roi: number; owned: Set<number>; model?: StrategyModel | null; fresh: Set<number> | null; per_pick: number | null; cap_slots: number; taken: BuyPick[] }): RangePick[] {
  const all = scoreBuys([...stats].flatMap(([ea, st]) => { const card = byEa.get(ea); return card ? [{ card, stats: st }] : []; }), timing, { max_price: 15_000_000, min_roi: o.min_roi, owned: o.owned, model: o.model, fresh: o.fresh });
  const taken = new Map(o.taken.map((b) => [b.ea_item_id, b]));
  return PRICE_RANGES.map((r) => {
    const seen = new Set<string>();
    const inRange = all.filter((b) => b.buy_at >= r.min && b.buy_at < r.max).filter((b) => { const k = `${b.name}|${b.rating}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const sized = inRange.slice(0, 4).map((b) => {
      const t = taken.get(b.ea_item_id);
      if (t) return t;
      if (o.per_pick === null) return b;
      const maxQty = b.price >= 50_000 ? 2 : b.price >= 10_000 ? 5 : 10, qty = Math.min(Math.floor(o.per_pick / b.buy_at), maxQty, Math.max(o.cap_slots, 1));
      return qty >= 1 ? { ...b, quantity: qty, spend: qty * b.buy_at, total_profit: qty * b.profit } : b;
    });
    const pick = sized[0] ?? null;
    return { key: r.key, label: r.label, sub: r.sub, pick, affordable: pick && o.per_pick !== null ? pick.buy_at <= o.per_pick : null, others: sized.slice(1) };
  });
}

/** How fresh the plan's prices are: FUT.GG's hourly prices when they loaded, else the last full refresh. */
export function priceFreshness(refresh_at: string | null, live_at: string | null, live_ok: boolean | null, now: number) {
  const at = live_at ?? refresh_at;
  const age_h = at ? Math.max(0, Math.round(((now - Date.parse(at)) / 3_600_000) * 10) / 10) : null;
  return {
    at, refresh_at, source: live_at ? ("live" as const) : ("refresh" as const), age_h,
    note: live_at
      ? "Buy Now prices are FUT.GG's newest estimates, updated about once an hour. Check the price in the game before you buy, and skip a card if it's over its \"don't pay more than\" price."
      : `${live_ok === false ? "FUT.GG's hourly prices couldn't be loaded, so these" : "These"} prices are from the last full refresh${age_h !== null ? `, ${age_h < 1 ? "under an hour" : `${Math.round(age_h)} hour${Math.round(age_h) === 1 ? "" : "s"}`} ago` : ""}. Prices may have moved: check each one in the game first.`,
  };
}

// ------------------------------------------------------------------ the one move to make coins now

/** FUT.GG prices refresh at 06:00 and 18:00 UTC; the next refresh after `now`. */
export function nextRefresh(now: number) {
  const d = new Date(now), day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const slots = [day + 6 * 3_600_000, day + 18 * 3_600_000, day + 30 * 3_600_000];
  return new Date(slots.find((t) => t > now + 20 * 60_000) ?? slots[2]!).toISOString();
}

const CONF_CHANCE = { high: 0.6, medium: 0.45, low: 0.3 } as const;
/** A buy pick's expected profit: its profit if it sells, times the chance it sells (learned, or from its confidence). */
export const buyValue = (b: BuyPick) => (b.total_profit ?? b.profit) * (b.p_hit ?? CONF_CHANCE[b.confidence]);

export interface CoinMove {
  kind: "buy" | "sell" | "relist" | "wait";
  title: string; detail: string;
  /** Coins the move should bring in: a buy's profit after tax (times its learned chance, once there is one), a sell's coins after tax. */
  coins: number | null; chance: number | null;
  ea_item_id: number | null; name: string | null;
  /** Do this first: collect coins from sold items. */
  first: string | null;
  prices_at: string | null; next_update: string;
}

/**
 * The single best way to make coins right now, from the same picks as the plan (Jeff, 2026-11-11: "make one how to
 * make coins now recommendation every update"). It is recomputed whenever the plan is, so it changes with every
 * FUT.GG refresh, the user's coins and club, and what the model has learned.
 *   - On a selling day, or when a card the user owns is falling and that kind of call is usually right, sell it.
 *   - Otherwise buy the pick with the best expected profit (profit if it sells times its chance of selling).
 *   - With nothing worth buying or selling, relist what's stuck, or wait for the next refresh.
 */
export function bestMove(o: { buys: BuyPick[]; sells: SellPick[]; pile: PileFix[]; stance: "buy" | "sell" | "flip"; timing: Timing; coins: number | null; sold_coins: number; prices_at: string | null; now: number; stale?: boolean }): CoinMove {
  const base = { prices_at: o.prices_at, next_update: nextRefresh(o.now) };
  const soldN = o.pile.filter((p) => p.action === "clear").length;
  const first = soldN ? `First clear ${soldN} sold item${soldN === 1 ? "" : "s"} on your transfer list${o.sold_coins ? ` to collect ${c(o.sold_coins)} coins` : ""}.` : null;
  const buy = [...o.buys].sort((a, b) => buyValue(b) - buyValue(a))[0];
  const sell = o.sells[0];
  const sellFirst = !!sell && (o.stance === "sell" || !buy || (sell.reason === "falling" && (sell.right_rate ?? 0.5) >= 0.5));
  if (sell && sellFirst) {
    const right = sell.right_rate !== null ? ` Calls like this were right ${Math.round(sell.right_rate * 100)}% of the time.` : "";
    return { ...base, kind: "sell", first, ea_item_id: sell.ea_item_id, name: sell.name, coins: sell.after_tax, chance: sell.right_rate,
      title: `Sell ${sell.quantity > 1 ? `${sell.quantity}x ` : ""}${sell.name}${sell.rating ? ` (${sell.rating})` : ""} at ${c(sell.list_at)}`,
      detail: `${sell.why} That's about ${c(sell.after_tax)} coins after tax. If it hasn't sold in an hour, drop to ${c(sell.quick_at)}.${right}` };
  }
  if (buy) {
    const qty = buy.quantity ?? 1, chance = buy.p_hit ?? CONF_CHANCE[buy.confidence], profit = buy.total_profit ?? buy.profit;
    const when = o.timing.buy_bias < 0 ? "Prices often dip later today, so wait for the dip if you can. " : "";
    const odds = buy.p_hit !== null ? `Cards like this reached that price ${Math.round(buy.p_hit * 100)}% of the time` : `Confidence is ${buy.confidence}`;
    // Only a learned chance is shown; until the model is ready the coins are the profit if it sells.
    return { ...base, kind: "buy", first, ea_item_id: buy.ea_item_id, name: buy.name, coins: buy.p_hit !== null ? Math.round(profit * chance) : profit, chance: buy.p_hit,
      title: `Buy ${qty > 1 ? `${qty}x ` : ""}${buy.name} (${buy.rating}) at ${c(buy.buy_at)}, list at ${c(buy.sell_at)}`,
      detail: `${when}It's ${Math.round(((buy.median - buy.price) / buy.median) * 100)}% under its usual price. If ${qty > 1 ? "they all sell" : "it sells"}, that's ${c(profit)} profit after tax, usually within ${buy.hold}. ${odds}. Don't pay more than ${c(buy.max_buy)}: above that it isn't worth it after tax.${o.stale ? " These prices are old, so check the Buy Now price in the game first." : ""}${buy.quantity === null ? " Your coins aren't known, so buy as many as you can afford." : ""}` };
  }
  const relist = o.pile.filter((p) => p.action !== "clear");
  if (relist.length) return { ...base, kind: "relist", first, ea_item_id: relist[0]!.ea_item_id, name: relist[0]!.name, coins: null, chance: null,
    title: `Relist ${relist.length} stuck item${relist.length === 1 ? "" : "s"} at today's price`, detail: `Start with ${relist[0]!.name}: ${relist[0]!.why} Coins sitting in unsold cards can't make more coins.` };
  return { ...base, kind: "wait", first, ea_item_id: null, name: null, coins: null, chance: null,
    title: o.coins !== null && o.coins < 2000 ? "Sell a few cards you don't use to get coins to trade with" : "Hold your coins until the next price update",
    detail: o.coins !== null && o.coins < 2000 ? "You have under 2,000 coins, which is too little to flip safely. Spare players and duplicates are the quickest coins." : "No card is cheap enough right now to flip for a safe profit after tax. Holding coins costs nothing; a bad buy does." };
}

/** What the page shows about learning: the model's state and lessons, and the user's own trades on earlier picks. */
export function learningSummary(model: StrategyModel | null | undefined, followed: FollowedTrade[]) {
  const done = followed.filter((t) => t.profit !== null);
  return {
    ready: !!model?.ready, updated_at: model?.updated_at ?? null,
    buy_picks: model?.buys.n ?? 0, buy_hit_rate: model?.buys.rate ?? null, hours_to_hit: model?.buys.median_hours_to_hit ?? null, target_reach: model?.buys.reach ?? 1,
    sell_calls: model?.sells.n ?? 0, sell_right_rate: model?.sells.rate ?? null,
    price_moves: model?.moves?.n ?? 0, moves_up24: model?.moves?.by["12%+ under|bounced"]?.up24 ?? null,
    moves_hit: model?.moves?.check?.hit ?? null, moves_trust: model?.moves?.trust ?? null,
    lessons: model?.lessons ?? ["Learning starts with the next price refresh: every refresh logs the day's picks and checks earlier ones against the prices since."],
    followed: { trades: followed.length, sold: done.length, profit: done.reduce((n, t) => n + (t.profit ?? 0), 0), items: followed.slice(0, 20) },
  };
}

// ------------------------------------------------------------------ loading and saving

export const riskParam = (v: string | null): "careful" | "normal" | "bold" => (v === "careful" || v === "bold" ? v : "normal");
const arr = <T>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null);

export async function dailyStrategy(db: FutDb, userId: string, platform: "console" | "pc", opts: { budget?: number | null; risk?: "careful" | "normal" | "bold"; now?: number; live?: LivePrices | null } = {}) {
  const now = opts.now ?? Date.now();
  const livePromise = opts.live !== undefined ? Promise.resolve(opts.live) : liveFutggPrices(platform);
  const [stateRes, clubRes, pastRes, squadRes, modelRes, tradesRes] = await Promise.all([
    db.from("account_state").select("balance,tradepile,profile,balance_at").eq("user_id", userId).eq("platform", platform).maybeSingle(),
    db.rpc("club_trade_value", { p_user: userId, p_platform: platform }),
    db.from("strategy_plans").select("plan_date,prices_at,plan").eq("user_id", userId).eq("platform", platform).order("plan_date", { ascending: false }).limit(8),
    db.from("squads").select("id").eq("user_id", userId).eq("is_active", true).limit(1),
    db.from("strategy_model").select("model").eq("platform", platform).maybeSingle(),
    db.from("trade_log").select("ea_item_id,bought_for,bought_at,sold_for").eq("user_id", userId).eq("platform", platform).gte("bought_at", new Date(now - 9 * 86_400_000).toISOString()).limit(500),
  ]);
  fail(stateRes.error); fail(pastRes.error); fail(squadRes.error); fail(modelRes.error); fail(tradesRes.error);
  let model = ((modelRes.data as Row | null)?.model ?? null) as StrategyModel | null;
  if (clubRes.error) throw new FutError(`Your club is unavailable: ${clubRes.error.message}`, 500);
  const state = (stateRes.data ?? null) as Row | null;
  const balance = (state?.balance ?? null) as { coins?: number | null } | null;
  const helperCoins = typeof balance?.coins === "number" ? balance.coins : null;
  const coins = opts.budget ?? helperCoins;
  const tradepile = arr<PileItem>(state?.tradepile);
  const profile = (state?.profile ?? null) as { tradepile_max?: number | null } | null;
  const clubRows = arr<Row>((clubRes.data as Row | null)?.cards) ?? [];
  const club: ClubCard[] = clubRows.map((r) => ({
    card_id: String(r.id), ea_item_id: r.ea_item_id == null ? null : Number(r.ea_item_id), name: String(r.player_name ?? "Card"), version: (r.version as string) ?? null,
    rating: r.overall == null ? null : Number(r.overall), position: (r.position as string) ?? null, tradeable_quantity: Number(r.tradeable_quantity ?? 0), price: r.price == null ? null : Number(r.price),
  }));
  const uk = ukClock(now).date;
  const past: PastPlan[] = ((pastRes.data ?? []) as Row[]).filter((p) => String(p.plan_date) !== uk).slice(0, 7).map((p) => ({
    plan_date: String(p.plan_date), prices_at: (p.prices_at as string | null) ?? null,
    buys: (arr<Row>((p.plan as Row | null)?.buys) ?? []).map((b) => ({ ea_item_id: Number(b.ea_item_id), name: String(b.name), buy_at: Number(b.buy_at), sell_at: Number(b.sell_at) })),
  }));

  let squad = new Set<string>();
  const active = ((squadRes.data ?? []) as Row[])[0];
  if (active) {
    const { data, error } = await db.from("squad_slots").select("card_id").eq("squad_id", String(active.id));
    fail(error);
    squad = new Set(((data ?? []) as Row[]).flatMap((r) => (r.card_id ? [String(r.card_id)] : [])));
  }

  const ids = [...new Set([
    ...club.filter((x) => x.tradeable_quantity > 0 && x.ea_item_id).map((x) => x.ea_item_id!),
    ...(tradepile ?? []).map((t) => t.ea_item_id),
    ...past.flatMap((p) => p.buys.map((b) => b.ea_item_id)),
  ].filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 5000);
  const { data: seriesData, error: seriesErr } = await db.rpc("strategy_price_series", { p_platform: platform, p_ids: ids, p_days: 7 });
  if (seriesErr) throw new FutError(`Prices are unavailable: ${seriesErr.message}`, 500);
  const sd = (seriesData ?? {}) as Row;
  const snaps = arr<number>(sd.snapshots) ?? [];
  const series = { latest: (sd.latest as string | null) ?? null, window_h: snaps.length ? Math.max(...snaps) : 0, cards: arr<SeriesCard>(sd.cards) ?? [] };
  // Before the learning job has run, learn how prices moved from this week's prices right here.
  if (!model?.ready && !model?.moves) {
    const moves = learnMoves(series.cards.filter((c) => c.tracked).map((c) => ({ ...cleanSeries(c), kind: cardKind(c) })));
    if (moves) model = model ? { ...model, moves, lessons: learnModel(platform, [], now, moves).lessons } : learnModel(platform, [], now, moves);
  }

  const plan = buildStrategy({
    now, coins, coins_source: opts.budget != null ? "entered" : helperCoins !== null ? "helper" : null, coins_at: helperCoins !== null && opts.budget == null ? ((state?.balance_at as string | null) ?? null) : null,
    series, club: clubRows.length ? club : null, tradepile, tradepile_max: profile?.tradepile_max ?? null, squad_card_ids: squad, past, risk: opts.risk,
    model, followed: followedTrades(past, (tradesRes.data ?? []) as Row[]), live: await livePromise,
  });

  // Keep one plan per UK day (the last one built that day), so later days can score its picks.
  if (series.latest && plan.buys.length) {
    const keep = { buys: plan.buys.map((b) => ({ ea_item_id: b.ea_item_id, name: b.name, buy_at: b.buy_at, sell_at: b.sell_at, quantity: b.quantity })), sells: plan.sells.map((s) => ({ ea_item_id: s.ea_item_id, name: s.name, list_at: s.list_at })), stance: plan.stance, mood: plan.mood };
    fail((await db.from("strategy_plans").upsert({ user_id: userId, platform, plan_date: uk, prices_at: series.latest, plan: keep, created_at: new Date(now).toISOString() }, { onConflict: "user_id,platform,plan_date" })).error);
    const cutoff = new Date(now - 60 * 86_400_000).toISOString().slice(0, 10);
    fail((await db.from("strategy_plans").delete().eq("user_id", userId).eq("platform", platform).lt("plan_date", cutoff)).error);
  }
  return { platform, ...plan };
}

/** The user's own trades (fut.trade_log) that bought a card within 3 days after an earlier plan picked it. */
export function followedTrades(past: PastPlan[], trades: Row[]): FollowedTrade[] {
  const out: FollowedTrade[] = [];
  const used = new Set<Row>();
  for (const p of past) {
    if (!p.prices_at) continue;
    const from = Date.parse(p.prices_at), to = from + 3 * 86_400_000;
    for (const b of p.buys) {
      for (const t of trades) {
        const at = t.bought_at ? Date.parse(String(t.bought_at)) : NaN;
        if (used.has(t) || Number(t.ea_item_id) !== b.ea_item_id || !(at >= from && at <= to) || t.bought_for == null) continue;
        used.add(t);
        const sold = t.sold_for == null ? null : Number(t.sold_for);
        out.push({ plan_date: p.plan_date, ea_item_id: b.ea_item_id, name: b.name, bought_for: Number(t.bought_for), sold_for: sold, profit: sold === null ? null : net(sold) - Number(t.bought_for), target: b.sell_at });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ learning job (bot scheduler, after each refresh)

const LOG_BUYS = 80, LOG_SELLS = 40;

/** Market-wide sell signals: tracked cards an owner would be told to sell (near their high, or still falling). */
function marketSells(cards: SeriesCard[], stats: Map<number, CardStats>, timing: Timing) {
  const club: ClubCard[] = cards.filter((c) => c.tracked).map((c) => ({ card_id: String(c.ea_item_id), ea_item_id: c.ea_item_id, name: c.name, version: c.version, rating: c.rating, position: c.position, tradeable_quantity: 1, price: null }));
  return scoreSells(club, stats, timing, new Set()).filter((s) => s.reason === "near_high" || s.reason === "falling");
}

/**
 * The bot's `strategy-learn` job, after each FUT.GG refresh, per platform: settle earlier logged picks against the
 * prices since, log this refresh's candidates (plain rules, no learning, so the sample stays fair), then relearn
 * the model from the last 30 days of results.
 */
export async function runStrategyLearning(db: FutDb, now = Date.now()) {
  const out: Record<string, unknown> = {};
  for (const platform of ["console", "pc"] as const) {
    // Every pick from the last 10 days, settled or not: each run re-checks them against the cleaned prices, so a
    // "hit" that was only a price glitch is taken back (2026-11-14 review).
    const { data: open, error: openErr } = await db.from("strategy_pick_log").select("*").eq("platform", platform).gte("picked_at", new Date(now - 10 * 86_400_000).toISOString()).order("picked_at", { ascending: true }).limit(5000);
    fail(openErr);
    const openRows = (open ?? []) as LoggedPick[];
    const { data: sd, error } = await db.rpc("strategy_price_series", { p_platform: platform, p_ids: [...new Set(openRows.map((r) => Number(r.ea_item_id)))].slice(0, 5000), p_days: 30 });
    if (error) throw new FutError(`Prices are unavailable: ${error.message}`, 500);
    const d = (sd ?? {}) as Row, latest = (d.latest as string | null) ?? null;
    if (!latest) { out[platform] = { skipped: "no prices" }; continue; }
    const cards = (arr<SeriesCard>(d.cards) ?? []).map((c) => cleanSeries(c)), snaps = arr<number>(d.snapshots) ?? [];
    const byEa = new Map(cards.map((c) => [c.ea_item_id, c]));

    // 1. Settle earlier picks
    const settled = openRows.flatMap((r) => {
      const base = { ...r, ea_item_id: Number(r.ea_item_id), outcome: null, resolved_at: null, hours_to_hit: null, best_price: null, final_price: null };
      const x = resolvePick(base, byEa.get(Number(r.ea_item_id)), latest, now);
      if (x) return x.outcome === r.outcome && x.best_price === r.best_price && x.final_price === r.final_price ? [] : [x];
      return r.outcome ? [base] : []; // no longer settled once the glitch is gone: open again
    });
    for (let i = 0; i < settled.length; i += 500) fail((await db.from("strategy_pick_log").upsert(settled.slice(i, i + 500), { onConflict: "platform,side,ea_item_id,picked_at" })).error);

    // 2. Log this refresh's candidates once (window limited to 7 days like the page)
    const { count, error: cErr } = await db.from("strategy_pick_log").select("ea_item_id", { count: "exact", head: true }).eq("platform", platform).eq("picked_at", latest);
    fail(cErr);
    let logged = 0;
    if (!count) {
      const window_h = snaps.length ? Math.min(Math.max(...snaps), 7 * 24) : 0;
      const stats = new Map<number, CardStats>();
      for (const c of cards) {
        const keep = c.ages.map((a, i) => (a <= 7 * 24 ? i : -1)).filter((i) => i >= 0);
        const s = cardStats({ ...c, prices: keep.map((i) => c.prices[i]!), ages: keep.map((i) => c.ages[i]!) }, window_h);
        if (s) stats.set(c.ea_item_id, s);
      }
      const timing = marketTiming(Date.parse(latest));
      const buys = scoreBuys([...stats].flatMap(([ea, s]) => { const card = byEa.get(ea); return card ? [{ card, stats: s }] : []; }), timing, { max_price: 15_000_000, min_roi: 0.03, owned: new Set() }).slice(0, LOG_BUYS);
      const sells = marketSells(cards, stats, timing).slice(0, LOG_SELLS);
      const rows: LoggedPick[] = [
        ...buys.map((b, i) => ({ platform, side: "buy" as const, ea_item_id: b.ea_item_id, picked_at: latest, rank: i + 1, price: b.buy_at, target: b.target_raw, features: b.features })),
        ...sells.map((x, i) => ({ platform, side: "sell" as const, ea_item_id: x.ea_item_id, picked_at: latest, rank: i + 1, price: x.list_at, target: x.median ?? x.list_at,
          features: { reason: x.reason, kind: cardKind({ version: x.version, rating: x.rating ?? 0, is_icon: !!byEa.get(x.ea_item_id)?.is_icon, is_hero: !!byEa.get(x.ea_item_id)?.is_hero }), band: priceBand(x.list_at) } as SellFeatures })),
      ];
      for (let i = 0; i < rows.length; i += 500) fail((await db.from("strategy_pick_log").upsert(rows.slice(i, i + 500), { onConflict: "platform,side,ea_item_id,picked_at" })).error);
      logged = rows.length;
    }

    // 3. Relearn from the last 30 days of results, and forget picks older than 90 days
    const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
    const results: LoggedPick[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: rErr } = await db.from("strategy_pick_log").select("side,ea_item_id,picked_at,price,target,features,outcome,hours_to_hit,best_price,final_price")
        .eq("platform", platform).gte("picked_at", since).in("outcome", ["hit", "miss", "good", "bad"]).order("picked_at", { ascending: true }).range(from, from + 999);
      fail(rErr);
      results.push(...((data ?? []) as LoggedPick[]));
      if (!data || data.length < 1000 || results.length >= 50_000) break;
    }
    // Every stored price move teaches something now, without waiting for picks to settle.
    const moves = learnMoves(cards.filter((c) => c.tracked).map((c) => ({ prices: c.prices, ages: c.ages, kind: cardKind(c) })));
    const model = learnModel(platform, results, now, moves);
    fail((await db.from("strategy_model").upsert({ platform, model, updated_at: model.updated_at }, { onConflict: "platform" })).error);
    fail((await db.from("strategy_pick_log").delete().eq("platform", platform).lt("picked_at", new Date(now - 90 * 86_400_000).toISOString())).error);
    out[platform] = { settled: settled.length, logged, results: results.length, ready: model.ready, hit_rate: model.buys.rate, moves: moves?.n ?? 0 };
  }
  return out;
}
