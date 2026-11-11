import { historyStats, type PricePoint } from "./price-history.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

Deno.test("historyStats: latest, range, 24h and 7d change, hourly count", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const p = (h: number, price: number, kind: PricePoint["kind"] = "full"): PricePoint => ({ t: new Date(now - h * 3_600_000).toISOString(), price, kind });
  const s = historyStats([p(240, 8000), p(170, 10_000), p(25, 12_000), p(2, 11_000, "hourly"), p(1, 11_400, "hourly")], now);
  assert(s.latest === 11_400 && s.low === 8000 && s.high === 12_000 && s.hourly_points === 2, JSON.stringify(s));
  assert(s.change_24h === -5 && s.change_7d === 14 && s.change_range === 42.5, JSON.stringify(s));
  assert(historyStats([]).latest === null, "empty");
});
