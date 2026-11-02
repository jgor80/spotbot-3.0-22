// Pull prices for the caller's own cards from the public fc27-market API (Val Town project bowli/fut-market-api),
// at Jeff's request (2026-11-02). Third-party, not licensed: stored under its own source ("fc27_market", evidence
// estimate), private to the caller. Cards match by EA item id (player_cards.source_card_key), which is the API's
// eaId. Read-only GETs to that API; nothing is sent to EA.
import { FutError, searchMyCards, type FutDb } from "./service.ts";

export const FC27_MARKET_BASE = "https://fc27-market.val.run";
const MAX_CARDS = 60;

type Fetch = (url: string) => Promise<Response>;
interface LatestPlayer { eaId: number; name?: string; rating?: number; price?: number | null }
interface Importer { importPriceHistory(owner: string, text: string, opts?: { source_id?: string }): Promise<Record<string, unknown>> }

async function getJson(fetchFn: Fetch, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    throw new FutError("Couldn't reach fc27-market. Try again later.", 502);
  }
  if (!res.ok) throw new FutError(`fc27-market answered ${res.status}. Try again later.`, 502);
  try {
    return await res.json();
  } catch {
    throw new FutError("fc27-market sent something that isn't JSON.", 502);
  }
}

export async function pullFc27Market(db: FutDb, userId: string, market: Importer, fetchFn: Fetch = (u) => fetch(u, { headers: { accept: "application/json" } })) {
  const latest = await getJson(fetchFn, `${FC27_MARKET_BASE}/latest`) as { updated?: string; groups?: Record<string, LatestPlayer[]> };
  const updated = typeof latest?.updated === "string" && !Number.isNaN(Date.parse(latest.updated)) ? new Date(latest.updated).toISOString() : null;
  const listed = new Map<number, number | null>();
  for (const list of Object.values(latest?.groups ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const p of list) if (Number.isInteger(p?.eaId) && p.eaId > 0) listed.set(p.eaId, typeof p.price === "number" && p.price > 0 ? p.price : null);
  }
  if (!listed.size) throw new FutError("fc27-market returned no prices right now.", 502);

  const cards = await searchMyCards(db, userId, { all: true });
  const mine = cards.filter((c) => c.ea_item_id !== null);
  const matched = mine.filter((c) => listed.has(c.ea_item_id!)).slice(0, MAX_CARDS);

  const lines = new Set<string>();
  for (const c of matched) {
    const h = await getJson(fetchFn, `${FC27_MARKET_BASE}/history/${c.ea_item_id}`).catch(() => null) as { t?: unknown; p?: unknown } | null;
    const t = Array.isArray(h?.t) ? h!.t as unknown[] : [];
    const p = Array.isArray(h?.p) ? h!.p as unknown[] : [];
    for (let i = 0; i < Math.min(t.length, p.length); i++) {
      const minutes = Number(t[i]), price = Number(p[i]);
      if (!Number.isInteger(minutes) || minutes <= 0 || !Number.isInteger(price) || price <= 0) continue;
      lines.add(`${c.id},console,${price},${new Date(minutes * 60_000).toISOString()},lowest_bin`);
    }
    const now = listed.get(c.ea_item_id!);
    if (now && updated) lines.add(`${c.id},console,${now},${updated},lowest_bin`);
  }

  const imported = lines.size
    ? await market.importPriceHistory(userId, ["card_id,platform,price,observed_at,kind", ...lines].join("\n"), { source_id: "fc27_market" })
    : null;
  const hoursOld = updated ? Math.round((Date.now() - Date.parse(updated)) / 3_600_000) : null;
  return {
    source: "fc27_market",
    updated,
    hours_old: hoursOld,
    your_cards_with_ea_id: mine.length,
    matched: matched.length,
    observations: lines.size,
    import: imported,
    note: "Third-party prices (fc27-market on Val Town, from FUT.GG's PlayStation file; console prices are shared with Xbox). " +
      "Only the top 100 cards per group are listed, so cheaper cards won't match." +
      (hoursOld !== null && hoursOld > 6 ? ` Its latest prices are ${hoursOld} hours old.` : ""),
  };
}
