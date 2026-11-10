// Price history graphs (Jeff, 2026-11-10): one card's FUT.GG price over 1-90 days, from the twice-daily full refresh
// plus the hourly hot-card rows (FUTGG_HOURLY=on), with market-wide drops marked. Read-only.
import { FutError, getCard, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
export interface PricePoint { t: string; price: number; kind: "full" | "hourly" }

/** Low, high, latest and change over 24h / 7d / the whole range. Pure. */
export function historyStats(points: PricePoint[], now = Date.now()) {
  if (!points.length) return { latest: null, low: null, high: null, change_24h: null, change_7d: null, change_range: null, hourly_points: 0 };
  const latest = points[points.length - 1]!;
  const at = (ms: number) => [...points].reverse().find((p) => Date.parse(p.t) <= now - ms) ?? null;
  const pct = (then: PricePoint | null) => (then && then.price > 0 ? Math.round(((latest.price - then.price) / then.price) * 1000) / 10 : null);
  return {
    latest: latest.price, latest_at: latest.t, low: Math.min(...points.map((p) => p.price)), high: Math.max(...points.map((p) => p.price)),
    change_24h: pct(at(24 * 3_600_000)), change_7d: pct(at(7 * 86_400_000)), change_range: pct(points[0]!),
    hourly_points: points.filter((p) => p.kind === "hourly").length,
  };
}

export async function cardPriceHistory(db: FutDb, userId: string, platform: "console" | "pc", cardId: string, days: number, now = Date.now()) {
  const card = await getCard(db, userId, cardId);
  if (!card) throw new FutError("Card not found.", 404);
  if (!card.ea_item_id) return { card_id: cardId, platform, days, points: [], market_drops: [], stats: historyStats([]), note: "This card has no EA item id, so FUT.GG prices can't be matched to it." };
  const { data, error } = await db.rpc("card_price_history", { p_platform: platform, p_ea_item_id: card.ea_item_id, p_days: days });
  if (error) throw new FutError(`Price history is unavailable: ${error.message}`, 500);
  const d = (data ?? {}) as Row;
  const points = ((d.points ?? []) as Row[]).filter((p) => typeof p.price === "number").map((p) => ({ t: String(p.t), price: p.price as number, kind: p.kind === "hourly" ? "hourly" as const : "full" as const }));
  return {
    card_id: cardId, ea_item_id: card.ea_item_id, name: card.player_name, platform, days, points,
    market_drops: ((d.market_drops ?? []) as Row[]).map((m) => ({ t: String(m.t), median_move: Number(m.median_move), cards: Number(m.cards) })),
    stats: historyStats(points, now),
    note: "FUT.GG prices: every card twice a day, plus hourly for tracked, watched and club cards when hourly refresh is on. Market drops mark refreshes where the median tracked card fell 4% or more.",
  };
}
