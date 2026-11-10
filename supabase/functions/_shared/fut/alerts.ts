// Price alerts (Jeff, 2026-11-10): after each FUT.GG price refresh the bot asks fut-api which watched cards reached
// their owner's buy or sell target (Market Lab watchlist) or moved a lot since the last refresh, then DMs each player
// on Discord. A target alert fires once and re-arms when the price moves back past the target, so nobody gets the
// same DM twice a day. Nothing here buys or sells.
import { fail, FutError, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
export type AlertKind = "buy" | "sell" | "move";

export interface Candidate {
  user_id: string; card_id: string; platform: "console" | "pc"; name: string; overall: number | null;
  target_buy: number | null; target_sell: number | null; move_pct: number | null;
  price: number; previous_price: number | null; published_at: string;
}
export interface AlertState { user_id: string; card_id: string; platform: string; kind: AlertKind; armed: boolean; last_fired_at: string | null; last_price: number | null }
export interface Fired { user_id: string; card_id: string; platform: string; kind: AlertKind; line: string; price: number }

/** Re-arm a target once the price is this far back on the other side, so a price sitting on the target doesn't flap. */
const REARM = 0.02;
/** A move alert for one card fires at most this often. */
const MOVE_EVERY_MS = 20 * 3_600_000;

const c = (n: number) => n.toLocaleString("en-US");
const key = (s: { user_id: string; card_id: string; platform: string; kind: string }) => `${s.user_id}|${s.card_id}|${s.platform}|${s.kind}`;

/** Which alerts fire now, and the state every candidate alert should have afterwards. Pure. */
export function decideAlerts(cands: Candidate[], states: AlertState[], now = Date.now()): { fired: Fired[]; next: AlertState[] } {
  const have = new Map(states.map((s) => [key(s), s]));
  const fired: Fired[] = [], next: AlertState[] = [];
  const plat = (p: string) => (p === "pc" ? "PC" : "console");
  for (const x of cands) {
    const base = { user_id: x.user_id, card_id: x.card_id, platform: x.platform };
    const label = `${x.name}${x.overall ? ` (${x.overall})` : ""}`;
    const target = (kind: "buy" | "sell", t: number | null) => {
      if (t === null || t === undefined) return;
      const s = have.get(key({ ...base, kind })) ?? { ...base, kind, armed: true, last_fired_at: null, last_price: null };
      const hit = kind === "buy" ? x.price <= t : x.price >= t;
      const rearm = kind === "buy" ? x.price > t * (1 + REARM) : x.price < t * (1 - REARM);
      if (s.armed && hit) {
        fired.push({ ...base, kind, price: x.price, line: kind === "buy"
          ? `🟢 **${label}** is ${c(x.price)} coins on ${plat(x.platform)}, at or under your buy target of ${c(t)}.`
          : `🔴 **${label}** is ${c(x.price)} coins on ${plat(x.platform)}, at or over your sell target of ${c(t)} (${c(Math.floor(x.price * 0.95))} after tax).` });
        next.push({ ...s, armed: false, last_fired_at: new Date(now).toISOString(), last_price: x.price });
      } else next.push({ ...s, armed: s.armed || rearm, last_price: x.price });
    };
    target("buy", x.target_buy);
    target("sell", x.target_sell);
    if (x.move_pct && x.previous_price && x.previous_price > 0) {
      const s = have.get(key({ ...base, kind: "move" })) ?? { ...base, kind: "move" as const, armed: true, last_fired_at: null, last_price: null };
      const pct = ((x.price - x.previous_price) / x.previous_price) * 100;
      const recent = s.last_fired_at && now - Date.parse(s.last_fired_at) < MOVE_EVERY_MS;
      if (Math.abs(pct) >= x.move_pct && !recent) {
        fired.push({ ...base, kind: "move", price: x.price, line: `${pct > 0 ? "📈" : "📉"} **${label}** ${pct > 0 ? "rose" : "fell"} ${Math.abs(Math.round(pct))}% since the last refresh: ${c(x.previous_price)} → ${c(x.price)} coins on ${plat(x.platform)}.` });
        next.push({ ...s, last_fired_at: new Date(now).toISOString(), last_price: x.price });
      } else next.push({ ...s, last_price: x.price });
    }
  }
  return { fired, next };
}

/** One DM per player: their fired alerts, capped so a crash day doesn't send a wall of text. */
export function groupDeliveries(fired: Fired[], max = 12) {
  const by = new Map<string, Fired[]>();
  for (const f of fired) by.set(f.user_id, [...(by.get(f.user_id) ?? []), f]);
  return [...by.entries()].map(([user_id, list]) => {
    const lines = list.slice(0, max).map((f) => f.line);
    if (list.length > max) lines.push(`…and ${list.length - max} more. See Market Lab → Watchlist.`);
    return { user_id, count: list.length, text: `**GafferBot price alerts** (FUT.GG prices)\n${lines.join("\n")}\n\nChange or stop these at https://gafferbot.app/fut/market/watchlist` };
  });
}

/** The bot's job: find what fires, save the new state, return one message per player (auth user id). */
export async function runPriceAlerts(db: FutDb, now = Date.now()) {
  const { data, error } = await db.rpc("price_alert_candidates", {});
  if (error) throw new FutError(`Price alerts are unavailable: ${error.message}`, 500);
  const cands = ((data ?? []) as Candidate[]).filter((x) => typeof x.price === "number");
  if (!cands.length) return { checked: 0, fired: 0, deliveries: [] };
  const users = [...new Set(cands.map((x) => x.user_id))];
  const states: AlertState[] = [];
  for (let i = 0; i < users.length; i += 100) {
    const { data: s, error: e } = await db.from("price_alert_state").select("*").in("user_id", users.slice(i, i + 100));
    fail(e);
    states.push(...((s ?? []) as AlertState[]));
  }
  const { fired, next } = decideAlerts(cands, states, now);
  for (let i = 0; i < next.length; i += 200) fail((await db.from("price_alert_state").upsert(next.slice(i, i + 200), { onConflict: "user_id,card_id,platform,kind" })).error);
  return { checked: cands.length, fired: fired.length, deliveries: groupDeliveries(fired) };
}

// ------------------------------------------------------------------ the player's settings (website)

export async function getAlertSettings(db: FutDb, userId: string) {
  const { data, error } = await db.from("alert_settings").select("dm, move_pct, updated_at").eq("user_id", userId).maybeSingle();
  fail(error);
  const s = (data ?? null) as Row | null;
  return { dm: s ? s.dm !== false : true, move_pct: (s?.move_pct as number | null) ?? null, needs_discord: "Alerts arrive as Discord DMs from GafferBot, to the Discord account you sign in with. Keep DMs from server members on in a server GafferBot is in." };
}

export async function setAlertSettings(db: FutDb, userId: string, b: Row) {
  const dm = b.dm === undefined ? true : b.dm === true;
  const mp = b.move_pct === null || b.move_pct === undefined || b.move_pct === "" ? null : Number(b.move_pct);
  if (mp !== null && (!Number.isInteger(mp) || mp < 3 || mp > 90)) throw new FutError("move_pct must be a whole number from 3 to 90, or empty to turn it off.");
  fail((await db.from("alert_settings").upsert({ user_id: userId, dm, move_pct: mp, updated_at: new Date().toISOString() }, { onConflict: "user_id" })).error);
  return getAlertSettings(db, userId);
}
