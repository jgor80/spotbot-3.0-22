// Promo / crash calendar (Jeff, 2026-11-10): FUT's weekly rhythm, back-tested on GafferBot's own FUT.GG snapshots.
// The events are the usual Ultimate Team schedule in UK time (unconfirmed for FC 27, so labelled as the usual
// rhythm). For each past occurrence, the market move over the next 24 hours is compounded from the twice-daily steps
// (fut.market_steps) per rating band; only patterns seen at least MIN_WEEKS times turn into advice. Read-only.

import { FutError, type FutDb } from "./service.ts";
import { cardPriceHistory } from "./price-history.ts";

export const UK_TZ = "Europe/London";
export const MIN_WEEKS = 4;
export const BANDS = ["all", "82-84", "85-87", "88-90", "91+"] as const;
export type Band = typeof BANDS[number];

export interface RhythmEvent { key: string; label: string; weekday: number; hour: number; window_hours: number; why: string }
/** Weekday 0 = Sunday. Times are UK local. */
export const EVENTS: RhythmEvent[] = [
  { key: "totw", label: "Team of the Week", weekday: 3, hour: 18, window_hours: 24, why: "New TOTW informs go in packs; players chase the in-forms and sell what they had." },
  { key: "rewards", label: "Rivals and Champs rewards", weekday: 4, hour: 8, window_hours: 24, why: "Reward packs open and flood the market with cards." },
  { key: "promo", label: "Friday content / promo", weekday: 5, hour: 18, window_hours: 24, why: "New promos and SBCs arrive; packs get opened and older cards drop." },
  { key: "weekend", label: "Champs weekend", weekday: 6, hour: 8, window_hours: 48, why: "Players build their best squads for Champs: meta cards are in demand." },
  { key: "monday", label: "After the weekend", weekday: 1, hour: 8, window_hours: 24, why: "Champs is over: meta cards are listed again." },
];

export interface Step { t: string; band: string; move: number; cards: number }

/** London local weekday/hour/minute for an instant. */
export function ukParts(ms: number) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!), hour: Number(p.hour), minute: Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}

/** Every instant (on the hour, UTC ms) in [from, to) when the event starts. */
export function occurrences(e: RhythmEvent, from: number, to: number) {
  const out: number[] = [];
  for (let t = Math.ceil(from / 3_600_000) * 3_600_000; t < to; t += 3_600_000) {
    const p = ukParts(t);
    if (p.weekday === e.weekday && p.hour === e.hour && p.minute === 0) out.push(t);
  }
  return out;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Compounded move (%) of a band across the steps that land inside (start, start + hours]. Null when no step does. */
export function windowMove(steps: Step[], band: string, start: number, hours: number) {
  const inside = steps.filter((s) => s.band === band && Date.parse(s.t) > start && Date.parse(s.t) <= start + hours * 3_600_000);
  if (!inside.length) return null;
  return (inside.reduce((m, s) => m * (1 + s.move / 100), 1) - 1) * 100;
}

export interface EventStats { band: string; weeks: number; median: number | null; falls: number; rises: number; verdict: "sell_before" | "buy_before" | "no_pattern" | "not_enough_data"; line: string }

/** What happened after each past occurrence of the event, for one band. Pure. */
export function eventStats(e: RhythmEvent, steps: Step[], band: string, now: number, days = 90): EventStats {
  const moves = occurrences(e, now - days * 86_400_000, now - e.window_hours * 3_600_000)
    .map((t) => windowMove(steps, band, t, e.window_hours)).filter((m): m is number => m !== null);
  const med = median(moves), falls = moves.filter((m) => m <= -1).length, rises = moves.filter((m) => m >= 1).length;
  const label = band === "all" ? "Tracked cards" : band === "card" ? "This card" : `${band} cards`;
  if (moves.length < MIN_WEEKS || med === null) {
    return { band, weeks: moves.length, median: med === null ? null : r1(med), falls, rises, verdict: "not_enough_data", line: `Only ${moves.length} week${moves.length === 1 ? "" : "s"} of prices so far; GafferBot needs ${MIN_WEEKS} before it says anything.` };
  }
  const share = (n: number) => n / moves.length;
  const drop = med <= -2 && share(falls) >= 0.6, rise = med >= 2 && share(rises) >= 0.6;
  const verdict: EventStats["verdict"] = drop ? "sell_before" : rise ? "buy_before" : "no_pattern";
  const span = e.window_hours === 24 ? "the next day" : `the next ${e.window_hours / 24} days`;
  const line = drop
    ? `${label} fell a median ${Math.abs(r1(med))}% over ${span} (down in ${falls} of ${moves.length} weeks): sell before, or buy after.`
    : rise
      ? `${label} rose a median ${r1(med)}% over ${span} (up in ${rises} of ${moves.length} weeks): buy before, or sell into it.`
      : `No clear pattern for ${label.toLowerCase()}: median ${r1(med) > 0 ? "+" : ""}${r1(med)}% over ${moves.length} weeks.`;
  return { band, weeks: moves.length, median: r1(med), falls, rises, verdict, line };
}

/** Big market-wide drops (likely promo crashes): steps where the median tracked card fell 4%+. Pure. */
export function crashes(steps: Step[]) {
  return steps.filter((s) => s.band === "all" && s.move <= -4 && s.cards >= 50).map((s) => {
    const p = ukParts(Date.parse(s.t));
    return { t: s.t, move: s.move, cards: s.cards, uk_weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][p.weekday]!, uk_date: p.date };
  }).sort((a, b) => b.t.localeCompare(a.t));
}

/** The next 7 days of the rhythm with the back-test for each band, soonest first. Pure. */
export function marketCalendar(steps: Step[], now = Date.now(), days = 90) {
  const upcoming = EVENTS.flatMap((e) => occurrences(e, now, now + 7 * 86_400_000).map((t) => ({ e, t }))).sort((a, b) => a.t - b.t).map(({ e, t }) => {
    const stats = BANDS.map((b) => eventStats(e, steps, b, now, days));
    const all = stats[0]!;
    return { key: e.key, label: e.label, at: new Date(t).toISOString(), uk: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][e.weekday]} ${String(e.hour).padStart(2, "0")}:00 UK`, why: e.why, window_hours: e.window_hours, headline: all.line, verdict: all.verdict, bands: stats };
  });
  const weeks = new Set(steps.filter((s) => s.band === "all").map((s) => ukParts(Date.parse(s.t)).date)).size;
  return {
    upcoming, crashes: crashes(steps).slice(0, 20), days_of_prices: weeks,
    note: "The usual Ultimate Team weekly schedule in UK time (not confirmed for FC 27; promos and EA's timings change). Moves are medians of FUT.GG prices across market-tracked cards, compounded over the window after each event, from GafferBot's own twice-daily snapshots. Past patterns aren't promises.",
    verified: false as const,
  };
}

/** The same back-test on one card's own price history (points from card_price_history). Pure. */
export function cardRhythm(points: { t: string; price: number }[], now = Date.now(), days = 90) {
  const sorted = [...points].sort((a, b) => a.t.localeCompare(b.t));
  const steps: Step[] = sorted.slice(1).map((p, i) => ({ t: p.t, band: "card", move: (p.price / sorted[i]!.price - 1) * 100, cards: 1 }));
  return EVENTS.map((e) => ({ key: e.key, label: e.label, ...eventStats(e, steps, "card", now, days) }));
}

// ---------- Data ----------

export async function calendarFor(db: FutDb, userId: string, platform: "console" | "pc", cardId: string | null, now = Date.now()) {
  const { data, error } = await db.rpc("market_steps", { p_platform: platform, p_days: 90 });
  if (error) throw new FutError(`Market calendar is unavailable: ${error.message}`, 500);
  const steps = (((data as Record<string, unknown> | null)?.steps ?? []) as Step[]).map((s) => ({ ...s, move: Number(s.move), cards: Number(s.cards) }));
  const out = { platform, ...marketCalendar(steps, now) };
  if (!cardId) return { ...out, card: null };
  const h = await cardPriceHistory(db, userId, platform, cardId, 90, now);
  const points = h.points.filter((p) => p.kind === "full");
  return { ...out, card: { card_id: cardId, name: (h as { name?: string }).name ?? null, points: points.length, events: cardRhythm(points, now) } };
}
