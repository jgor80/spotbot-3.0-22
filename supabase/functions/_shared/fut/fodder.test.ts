// Fodder index: floors per rating, the equal-weighted index, spike and cheap signals, and the route.
import { fodderIndexSeries, fodderRatings, fodderSummary, type FodderPoint } from "./fodder.ts";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const NOW = Date.parse("2026-11-10T12:00:00Z");
/** 10 days of twice-daily floors: 84s flat at 1,000, 86s flat at 3,000 then a last-refresh spike to 4,000, 88s drop to 8,000 from 10,000. */
function points(): FodderPoint[] {
  const out: FodderPoint[] = [];
  for (let i = 20; i >= 0; i--) {
    const t = new Date(NOW - i * 43_200_000 - 6 * 3_600_000).toISOString();
    out.push({ t, rating: 84, floor: 1000, n: 40 }, { t, rating: 86, floor: i === 0 ? 4000 : 3000, n: 30 }, { t, rating: 88, floor: i === 0 ? 8000 : 10000, n: 20 });
  }
  return out;
}

Deno.test("fodder: spike and cheap signals against the rating's own week", () => {
  const r = fodderRatings(points(), NOW);
  const by = Object.fromEntries(r.map((x) => [x.rating, x]));
  assert(by[84]!.signal === "normal" && by[84]!.change_7d === 0, JSON.stringify(by[84]));
  assert(by[86]!.signal === "spike" && by[86]!.vs_week === 33.3 && by[86]!.change_24h === 33.3 && /SBC demand/.test(by[86]!.line), JSON.stringify(by[86]));
  assert(by[88]!.signal === "cheap" && /stock up/.test(by[88]!.line) && by[88]!.low_30d === 8000 && by[88]!.high_30d === 10000, JSON.stringify(by[88]));
});

Deno.test("fodder index: 100 at the start, equal-weighted moves after", () => {
  const s = fodderIndexSeries(points());
  assert(s[0]!.value === 100 && s.at(-1)!.value === Math.round(((1 + 4 / 3 + 0.8) / 3) * 1000) / 10, JSON.stringify(s.at(-1)));
  const sum = fodderSummary(points(), NOW);
  assert(/spiking at 86/.test(sum.headline) && sum.index === s.at(-1)!.value && sum.index_change_7d !== null, sum.headline);
  assert(/No FUT.GG prices/.test(fodderSummary([], NOW).headline), "empty");
});

Deno.test("GET /market/fodder: days checked, RPC points summarised", async () => {
  const { handle } = await import("../../fut-api/handler.ts");
  const { futMemoryDb } = await import("./test-db.ts");
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, a: Record<string, unknown>) => Promise<unknown> };
  let asked: Record<string, unknown> | null = null;
  db.rpc = (fn, a) => { asked = a; return Promise.resolve(fn === "fodder_index" ? { data: { points: points().map((p) => ({ ...p, floor: String(p.floor) })) }, error: null } : { data: null, error: { message: "?" } }); };
  const deps = { db, userFor: () => Promise.resolve("22222222-2222-4222-8222-222222222222"), env: (k: string) => (k === "FUT_ENABLED" ? "true" : undefined) };
  // deno-lint-ignore no-explicit-any
  const get = async (q: string) => { const r = await handle(new Request(`http://local/functions/v1/fut-api/v1/market/fodder${q}`), deps as any); return { status: r.status, data: await r.json() }; };
  assert((await get("?days=0")).status === 400, "days checked");
  const ok = await get("?platform=pc&days=14");
  assert(ok.status === 200 && ok.data.data.ratings.length === 3 && (asked as unknown as { p_platform: string; p_days: number }).p_days === 14, JSON.stringify(ok.data).slice(0, 200));
});
