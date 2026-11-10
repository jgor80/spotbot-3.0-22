// Promo / crash calendar: UK-time occurrences, windows compounded from steps, advice only after MIN_WEEKS weeks.
import { calendarFor, cardRhythm, crashes, EVENTS, eventStats, marketCalendar, occurrences, ukParts, windowMove, type Step } from "./calendar.ts";
import { futMemoryDb } from "./test-db.ts";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const NOW = Date.parse("2026-11-10T12:00:00Z"); // a Tuesday
const promo = EVENTS.find((e) => e.key === "promo")!;

/** Twice-daily steps for 10 weeks; the Saturday 06:00 UTC refresh (after Friday's promo) drops 5% in the 85-87 and all bands. */
function steps(): Step[] {
  const out: Step[] = [];
  for (let t = NOW - 70 * 86_400_000; t <= NOW; t += 43_200_000) {
    const d = new Date(t), iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() < 12 ? 6 : 18)).toISOString();
    const sat6 = new Date(iso).getUTCDay() === 6 && new Date(iso).getUTCHours() === 6;
    for (const band of ["all", "85-87", "88-90"]) out.push({ t: iso, band, move: sat6 && band !== "88-90" ? -5 : 0.2, cards: 120 });
  }
  return out;
}

Deno.test("occurrences follow UK time across the clock change", () => {
  // Friday 18:00 UK is 17:00 UTC in summer (BST) and 18:00 UTC in winter.
  const summer = occurrences(promo, Date.parse("2026-07-01T00:00:00Z"), Date.parse("2026-07-08T00:00:00Z"));
  const winter = occurrences(promo, Date.parse("2026-11-01T00:00:00Z"), Date.parse("2026-11-08T00:00:00Z"));
  assert(summer.length === 1 && new Date(summer[0]!).getUTCHours() === 17, new Date(summer[0]!).toISOString());
  assert(winter.length === 1 && new Date(winter[0]!).getUTCHours() === 18, new Date(winter[0]!).toISOString());
  assert(ukParts(winter[0]!).weekday === 5, "Friday");
});

Deno.test("back-test: Friday promo drops show as sell-before; no pattern where prices didn't move; too little data says so", () => {
  const s = steps();
  const w = windowMove(s, "85-87", occurrences(promo, NOW - 10 * 86_400_000, NOW)[0]!, 24)!;
  assert(Math.abs(w - (0.998 * 0.95 * 1.002 - 1) * 100) < 1 || w < -4, `window ${w}`);
  const mid = eventStats(promo, s, "85-87", NOW);
  assert(mid.verdict === "sell_before" && mid.weeks >= 9 && mid.median! <= -4.5 && /fell a median/.test(mid.line), JSON.stringify(mid));
  const high = eventStats(promo, s, "88-90", NOW);
  assert(high.verdict === "no_pattern", JSON.stringify(high));
  const few = eventStats(promo, s.filter((x) => Date.parse(x.t) > NOW - 20 * 86_400_000), "85-87", NOW);
  assert(few.verdict === "not_enough_data" && /needs 4/.test(few.line), JSON.stringify(few));
  const cal = marketCalendar(s, NOW);
  assert(cal.upcoming.length === 5 && cal.upcoming[0]!.key === "totw" && cal.upcoming.find((u) => u.key === "promo")!.verdict === "sell_before", JSON.stringify(cal.upcoming.map((u) => [u.key, u.verdict])));
  assert(crashes(s).length >= 9 && crashes(s)[0]!.uk_weekday === "Saturday", JSON.stringify(crashes(s)[0]));
  // One card's own history, same idea.
  const pts = s.filter((x) => x.band === "85-87").reduce<{ t: string; price: number }[]>((acc, x) => [...acc, { t: x.t, price: Math.round((acc.at(-1)?.price ?? 10000) * (1 + x.move / 100)) }], []);
  const card = cardRhythm(pts, NOW);
  assert(card.find((c) => c.key === "promo")!.verdict === "sell_before" && /This card fell/.test(card.find((c) => c.key === "promo")!.line), JSON.stringify(card));
});

Deno.test("calendarFor reads market_steps and fails clearly when it can't", async () => {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, a: Record<string, unknown>) => Promise<unknown> };
  db.rpc = (fn) => Promise.resolve(fn === "market_steps" ? { data: { steps: steps().map((x) => ({ ...x, move: String(x.move) })) }, error: null } : { data: null, error: { message: "?" } });
  const r = await calendarFor(db, "u", "console", null, NOW);
  assert(r.upcoming.length === 5 && r.card === null && r.days_of_prices > 60, JSON.stringify(r).slice(0, 300));
  db.rpc = () => Promise.resolve({ data: null, error: { message: "down" } });
  let failed = false;
  try { await calendarFor(db, "u", "console", null, NOW); } catch (e) { failed = /unavailable/.test((e as Error).message); }
  assert(failed, "error surfaced");
});
