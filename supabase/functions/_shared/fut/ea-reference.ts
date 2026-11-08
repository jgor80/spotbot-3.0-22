// EA reference prices from the helper's captures (2026-11-08): the Web App's search results carry
// itemData.marketAverage (one number per card version; looks like a smoothed average sale price, but what it measures
// is UNCONFIRMED) and lastSalePrice (each listed item's previous sale, 0 if never sold). The helper (v0.4.2+) puts
// them in the capture CSV as market_average and last_sales. They are kept apart from price history, private to the
// user, and never feed the market maths until their meaning is confirmed.
import { FutDbError, getCard, type FutDb } from "./service.ts";

const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};
export const EA_REFERENCE_LABEL = "EA reference price (meaning unconfirmed)";
const MAX_PRICE = 15_000_000;

export function referenceRows(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const head = (lines.shift() ?? "").split(",").map((h) => h.trim());
  const at = (n: string) => head.indexOf(n);
  const [iEa, iPl, iAt, iAvg, iSales] = ["ea_item_id", "platform", "observed_at", "market_average", "last_sales"].map(at);
  if (iEa !== 0 || iAvg < 0 || iAt < 0) return [];
  const out = new Map<string, { ea_item_id: number; platform: string; observed_at: string; market_average: number | null; last_sales: number[] }>();
  for (const line of lines) {
    const f = line.split(",");
    const ea = Number(f[iEa]), t = Date.parse(f[iAt] ?? "");
    const platform = iPl >= 0 && f[iPl] === "pc" ? "pc" : "console";
    const avgN = Number(f[iAvg]);
    const avg = Number.isInteger(avgN) && avgN > 0 && avgN <= MAX_PRICE ? avgN : null;
    const sales = iSales >= 0 ? (f[iSales] ?? "").split(";").map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_PRICE).slice(0, 20) : [];
    if (!Number.isInteger(ea) || ea <= 0 || Number.isNaN(t) || (!avg && !sales.length)) continue;
    const observed_at = new Date(t).toISOString();
    out.set(`${ea}|${platform}|${observed_at}`, { ea_item_id: ea, platform, observed_at, market_average: avg, last_sales: sales });
  }
  return [...out.values()];
}

/** Store the reference columns of a capture CSV for this user. Returns how many rows were stored. */
export async function storeEaReference(db: FutDb, userId: string, text: string) {
  if (!/^\s*ea_item_id,/.test(text)) return 0;
  const rows = referenceRows(text).map((r) => ({ ...r, owner_user_id: userId }));
  for (let i = 0; i < rows.length; i += 500) {
    fail((await db.from("market_ea_reference").upsert(rows.slice(i, i + 500), { onConflict: "owner_user_id,ea_item_id,platform,observed_at" })).error);
  }
  return rows.length;
}

/** The latest EA reference price and recent past sales for one of your cards. */
export async function cardEaReference(db: FutDb, userId: string, cardId: string, platform: string) {
  const card = await getCard(db, userId, cardId);
  const ea = card?.ea_item_id ?? null;
  const empty = { label: EA_REFERENCE_LABEL, evidence: "hypothesis", market_average: null, observed_at: null, history: [], recent_sales: [] };
  if (!ea) return { ...empty, note: "This card has no EA item id (sync your club to add it)." };
  const { data, error } = await db.from("market_ea_reference").select("observed_at, market_average, last_sales")
    .eq("owner_user_id", userId).eq("ea_item_id", ea).eq("platform", platform).order("observed_at", { ascending: false }).limit(50);
  fail(error);
  const rows = (data ?? []) as { observed_at: string; market_average: number | null; last_sales: number[] | null }[];
  const latest = rows.find((r) => r.market_average);
  return {
    ...empty,
    market_average: latest?.market_average ?? null,
    observed_at: latest ? new Date(latest.observed_at).toISOString() : null,
    history: rows.filter((r) => r.market_average).map((r) => ({ observed_at: new Date(r.observed_at).toISOString(), market_average: r.market_average })),
    recent_sales: rows.flatMap((r) => (r.last_sales ?? []).map((p) => ({ price: p, seen_at: new Date(r.observed_at).toISOString() }))).slice(0, 30),
    note: "From EA's own search results your helper saw. marketAverage looks like a smoothed average sale price, but EA doesn't document it, so it's shown for reference only and isn't used in the market maths. Recent sales are what individual listed items last sold for.",
  };
}
