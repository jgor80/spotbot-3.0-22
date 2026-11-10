// Fodder index (Jeff, 2026-11-10): the price of SBC fodder (the cheapest cards of each rating, 81-91) over time,
// like a stock index. Each rating's floor comes from fut.fodder_index (average of the 5 cheapest priced cards at that
// overall at every full FUT.GG refresh). The index is the equal-weighted average of each rating's floor relative to
// the first refresh, ×100. A floor 15%+ above its own 7-day median is flagged as an SBC demand spike; 10%+ below,
// as cheap. Read-only advice.
import { FutError, type FutDb } from "./service.ts";

export const RATINGS = [81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91] as const;
export const SPIKE = 0.15, CHEAP = -0.1;
export interface FodderPoint { t: string; rating: number; floor: number; n: number }

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const pct = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : Math.round((a / b - 1) * 1000) / 10);
const H = 3_600_000;

/** The floor at or just before `at` (ms), from one rating's points sorted by time. */
function at(points: FodderPoint[], ms: number) {
  let hit: FodderPoint | null = null;
  for (const p of points) { if (Date.parse(p.t) <= ms) hit = p; else break; }
  return hit;
}

export type FodderSignal = "spike" | "cheap" | "normal" | "new";
export interface FodderRating { rating: number; floor: number; cards: number; at: string; change_24h: number | null; change_7d: number | null; vs_week: number | null; low_30d: number; high_30d: number; signal: FodderSignal; line: string; history: { t: string; value: number }[] }

/** Per rating: latest floor, changes, 7-day median comparison and the signal. Pure. */
export function fodderRatings(points: FodderPoint[], now = Date.now()): FodderRating[] {
  const by = new Map<number, FodderPoint[]>();
  for (const p of [...points].sort((a, b) => a.t.localeCompare(b.t))) by.set(p.rating, [...(by.get(p.rating) ?? []), p]);
  const out: FodderRating[] = [];
  for (const r of RATINGS) {
    const list = by.get(r);
    if (!list?.length) continue;
    const last = list.at(-1)!, lastMs = Date.parse(last.t);
    const week = list.filter((p) => lastMs - Date.parse(p.t) <= 7 * 24 * H && p !== last).map((p) => p.floor);
    const weekMed = week.length >= 4 ? median(week) : null;
    const month = list.filter((p) => now - Date.parse(p.t) <= 30 * 24 * H).map((p) => p.floor);
    const vs = weekMed === null ? null : last.floor / weekMed - 1;
    const signal: FodderSignal = vs === null ? "new" : vs >= SPIKE ? "spike" : vs <= CHEAP ? "cheap" : "normal";
    const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
    const line = signal === "spike" ? `${r}s are ${Math.round(vs! * 100)}% above their week (${k(last.floor)} vs ${k(weekMed!)}): likely SBC demand. Sell spare ${r}s, don't buy them for SBCs now.`
      : signal === "cheap" ? `${r}s are ${Math.round(-vs! * 100)}% below their week (${k(last.floor)} vs ${k(weekMed!)}): a good time to stock up for SBCs.`
        : signal === "new" ? `${r}s: ${k(last.floor)}. Not enough refreshes yet to compare with the week.`
          : `${r}s: ${k(last.floor)}, close to their week (${vs! >= 0 ? "+" : ""}${Math.round(vs! * 100)}%).`;
    out.push({
      rating: r, floor: last.floor, cards: last.n, at: last.t,
      change_24h: pct(last.floor, at(list, lastMs - 23 * H)?.floor ?? null),
      change_7d: pct(last.floor, at(list, lastMs - 7 * 24 * H + H)?.floor ?? null),
      vs_week: vs === null ? null : Math.round(vs * 1000) / 10, low_30d: Math.min(...month, last.floor), high_30d: Math.max(...month, last.floor),
      signal, line, history: list.map((p) => ({ t: p.t, value: p.floor })),
    });
  }
  return out;
}

/** Equal-weighted index: each rating's floor relative to its first point, averaged, ×100, at every refresh. Pure. */
export function fodderIndexSeries(points: FodderPoint[], ratings: readonly number[] = RATINGS) {
  const times = [...new Set(points.map((p) => p.t))].sort();
  const base = new Map<number, number>();
  const series: { t: string; value: number }[] = [];
  for (const t of times) {
    const here = points.filter((p) => p.t === t && ratings.includes(p.rating));
    for (const p of here) if (!base.has(p.rating)) base.set(p.rating, p.floor);
    const rel = here.map((p) => p.floor / base.get(p.rating)!);
    if (rel.length) series.push({ t, value: Math.round((rel.reduce((a, b) => a + b, 0) / rel.length) * 1000) / 10 });
  }
  return series;
}

export function fodderSummary(points: FodderPoint[], now = Date.now()) {
  const ratings = fodderRatings(points, now);
  const index = fodderIndexSeries(points);
  const last = index.at(-1) ?? null, lastMs = last ? Date.parse(last.t) : 0;
  const weekAgo = [...index].reverse().find((p) => Date.parse(p.t) <= lastMs - 7 * 24 * H + H) ?? null;
  const spikes = ratings.filter((r) => r.signal === "spike"), cheap = ratings.filter((r) => r.signal === "cheap");
  const headline = !ratings.length ? "No FUT.GG prices for 81-91 rated cards yet."
    : spikes.length ? `Fodder is spiking at ${spikes.map((r) => r.rating).join(", ")}: likely a demanding SBC. Sell spares now and wait to buy.`
      : cheap.length ? `Fodder is cheap at ${cheap.map((r) => r.rating).join(", ")}: a good time to stock up for upcoming SBCs.`
        : "Fodder prices are normal for the week.";
  return {
    headline, index: last?.value ?? null, index_change_7d: last && weekAgo ? Math.round((last.value - weekAgo.value) * 10) / 10 : null, index_history: index, ratings,
    note: "Floor = the average of the 5 cheapest cards of that rating on FUT.GG at each twice-daily refresh. Index = all 81-91 floors relative to the start of the period, averaged (100 = no change). Spikes are 15%+ above the rating's 7-day median, cheap is 10%+ below. Advice only.",
    verified: false as const,
  };
}

export async function fodderIndex(db: FutDb, platform: "console" | "pc", days: number, now = Date.now()) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new FutError("days must be a whole number from 1 to 90.");
  const { data, error } = await db.rpc("fodder_index", { p_platform: platform, p_days: days });
  if (error) throw new FutError(`Fodder index is unavailable: ${error.message}`, 500);
  const points = (((data as Record<string, unknown> | null)?.points ?? []) as FodderPoint[]).map((p) => ({ t: String(p.t), rating: Number(p.rating), floor: Number(p.floor), n: Number(p.n) }));
  return { platform, days, ...fodderSummary(points, now) };
}
