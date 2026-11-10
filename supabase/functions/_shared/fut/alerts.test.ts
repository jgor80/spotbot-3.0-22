// Price alerts: targets fire once and re-arm, big moves fire at most daily, one DM per player.
import { decideAlerts, groupDeliveries, type Candidate } from "./alerts.ts";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const cand = (p: Partial<Candidate>): Candidate => ({ user_id: "u", card_id: "c", platform: "console", name: "Star", overall: 88, target_buy: null, target_sell: null, move_pct: null, price: 10000, previous_price: 10000, published_at: "2026-11-10T06:00:00Z", ...p });

Deno.test("a buy target fires once, stays quiet while the price sits there, and re-arms after it moves away", () => {
  const t0 = Date.parse("2026-11-10T06:00:00Z");
  const a = decideAlerts([cand({ target_buy: 10000, price: 9800 })], [], t0);
  assert(a.fired.length === 1 && a.fired[0]!.kind === "buy" && a.fired[0]!.line.includes("9,800"), JSON.stringify(a.fired));
  const b = decideAlerts([cand({ target_buy: 10000, price: 9700 })], a.next, t0 + 12 * 3_600_000);
  assert(b.fired.length === 0, "no repeat");
  const c = decideAlerts([cand({ target_buy: 10000, price: 10500 })], b.next, t0 + 24 * 3_600_000);
  assert(c.fired.length === 0 && c.next[0]!.armed, "re-armed above target + 2%");
  const d = decideAlerts([cand({ target_buy: 10000, price: 9900 })], c.next, t0 + 36 * 3_600_000);
  assert(d.fired.length === 1, "fires again");
});

Deno.test("sell targets mention the after-tax amount; moves need the threshold and wait 20 hours", () => {
  const t0 = Date.parse("2026-11-10T06:00:00Z");
  const s = decideAlerts([cand({ target_sell: 20000, price: 21000 })], [], t0);
  assert(s.fired[0]!.line.includes("19,950 after tax"), s.fired[0]!.line);
  const m = decideAlerts([cand({ move_pct: 10, previous_price: 10000, price: 8500 })], [], t0);
  assert(m.fired.length === 1 && m.fired[0]!.line.includes("fell 15%"), JSON.stringify(m.fired));
  const again = decideAlerts([cand({ move_pct: 10, previous_price: 8500, price: 7000 })], m.next, t0 + 12 * 3_600_000);
  assert(again.fired.length === 0, "not twice in 20 hours");
  const small = decideAlerts([cand({ move_pct: 10, previous_price: 10000, price: 9500 })], [], t0);
  assert(small.fired.length === 0, "5% is under 10%");
});

Deno.test("one message per player, capped", () => {
  const fired = Array.from({ length: 15 }, (_, i) => ({ user_id: "u1", card_id: `c${i}`, platform: "console", kind: "buy" as const, price: 1, line: `line ${i}` }));
  const d = groupDeliveries([...fired, { ...fired[0]!, user_id: "u2" }], 12);
  assert(d.length === 2 && d[0]!.count === 15 && d[0]!.text.includes("…and 3 more"), JSON.stringify(d[0]));
});
