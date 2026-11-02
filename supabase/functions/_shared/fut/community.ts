// Community price pool (Jeff, 2026-11-02): users who opt in share the prices their own XI Lab helper recorded from
// their own EA Web App (the capture CSV they import), and in return can pull the pooled prices for their own cards.
// Contributors only ("give to get"); never shown on public pages or through MCP until licensed.
//
// What is shared: EA item id, platform, the lowest price seen in an hour, how many listings, and when. Nothing
// about the account, club or session. A contributor is stored by user id only so their rows can be counted once
// and deleted when they stop sharing. Turning sharing off deletes everything they contributed.
import { FutDbError, FutError, searchMyCards, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};

export const COMMUNITY_SOURCE_ID = "community_pool";
const MIN_PRICE = 150;
const MAX_PRICE = 15_000_000;
/** Contributions older than this are dropped, and only this window is pulled. */
export const KEEP_DAYS = 30;
/** A contributed hour may be at most this old when it arrives. */
const MAX_AGE_DAYS = 14;
/** A price more than this many times off the hour's median is ignored as a typo or a mismatched card. */
const OUTLIER_FACTOR = 3;
const MAX_PULL_CARDS = 300;
const H = 3_600_000;

interface Importer { importPriceHistory(owner: string, text: string, opts?: { source_id?: string }): Promise<Record<string, unknown>> }

const hourOf = (iso: string) => new Date(Math.floor(Date.parse(iso) / H) * H).toISOString();

export async function getSharing(db: FutDb, userId: string) {
  const { data, error } = await db.from("market_sharing").select("*").eq("user_id", userId).maybeSingle();
  fail(error);
  const r = data as Row | null;
  const { count, error: e2 } = await db.from("market_community_observations").select("id", { count: "exact", head: true }).eq("contributor_user_id", userId);
  fail(e2);
  return { sharing: !!r?.sharing, since: (r?.sharing && r.updated_at) ? String(r.updated_at) : null, your_contributions: count ?? 0 };
}

/** Turn sharing on or off. Off deletes everything this user contributed. */
export async function setSharing(db: FutDb, userId: string, on: boolean) {
  fail((await db.from("market_sharing").upsert({ user_id: userId, sharing: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" })).error);
  let deleted = 0;
  if (!on) {
    const { count } = await db.from("market_community_observations").select("id", { count: "exact", head: true }).eq("contributor_user_id", userId);
    fail((await db.from("market_community_observations").delete().eq("contributor_user_id", userId)).error);
    deleted = count ?? 0;
  }
  return { ...(await getSharing(db, userId)), deleted };
}

/** Rows of a helper capture CSV (header starts with ea_item_id), reduced to the lowest price per item, platform and hour. */
export function captureContributions(text: string, now = Date.now()) {
  const lines = text.trim().split(/\r?\n/);
  const head = (lines.shift() ?? "").split(",").map((s) => s.trim());
  const col = (n: string) => head.indexOf(n);
  const [iEa, iPl, iPr, iAt, iLs] = ["ea_item_id", "platform", "price", "observed_at", "listings"].map(col);
  if (iEa !== 0 || iPr < 0 || iAt < 0) return [];
  const best = new Map<string, { ea_item_id: number; platform: string; hour: string; price: number; listings: number | null; observed_at: string }>();
  for (const line of lines) {
    const f = line.split(",");
    const ea = Number(f[iEa]), price = Number(f[iPr]), at = Date.parse(f[iAt] ?? "");
    const platform = iPl >= 0 ? (f[iPl] ?? "").trim() : "console";
    if (!Number.isInteger(ea) || ea <= 0 || !Number.isInteger(price) || price < MIN_PRICE || price > MAX_PRICE) continue;
    if (platform !== "console" && platform !== "pc") continue;
    if (Number.isNaN(at) || at > now + 10 * 60_000 || at < now - MAX_AGE_DAYS * 86_400_000) continue;
    const observed_at = new Date(at).toISOString(), hour = hourOf(observed_at);
    const listings = iLs >= 0 && f[iLs] ? Number(f[iLs]) : null;
    const k = `${ea}|${platform}|${hour}`;
    const prev = best.get(k);
    if (!prev || price < prev.price) best.set(k, { ea_item_id: ea, platform, hour, price, listings: Number.isInteger(listings) ? listings : null, observed_at });
  }
  return [...best.values()];
}

/** Add a capture file to the pool if this user shares. Returns how many item-hours were contributed (0 if not sharing). */
export async function contributeCaptures(db: FutDb, userId: string, text: string) {
  if (!/^\s*ea_item_id,/.test(text)) return { shared: 0, sharing: false };
  const { sharing } = await getSharing(db, userId);
  if (!sharing) return { shared: 0, sharing: false };
  const rows = captureContributions(text);
  // Keep the lower price when the same hour arrives twice.
  const ids = [...new Set(rows.map((r) => r.ea_item_id))];
  const have = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("market_community_observations").select("ea_item_id, platform, hour, price").eq("contributor_user_id", userId).in("ea_item_id", ids.slice(i, i + 100));
    fail(error);
    for (const r of (data ?? []) as Row[]) have.set(`${r.ea_item_id}|${r.platform}|${new Date(String(r.hour)).toISOString()}`, Number(r.price));
  }
  const fresh = rows.filter((r) => {
    const old = have.get(`${r.ea_item_id}|${r.platform}|${r.hour}`);
    return old === undefined || r.price < old;
  }).map((r) => ({ ...r, contributor_user_id: userId }));
  for (let i = 0; i < fresh.length; i += 500) {
    fail((await db.from("market_community_observations").upsert(fresh.slice(i, i + 500), { onConflict: "contributor_user_id,ea_item_id,platform,hour" })).error);
  }
  // Housekeeping: the pool only keeps a rolling window.
  fail((await db.from("market_community_observations").delete().lte("hour", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString())).error);
  return { shared: fresh.length, sharing: true };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/** Pooled hourly prices for some EA items: the median of each contributor's lowest price, outliers dropped. */
export function poolHours(rows: { contributor_user_id: string; ea_item_id: number; platform: string; hour: string; price: number }[], caller: string) {
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.ea_item_id}|${r.platform}|${new Date(r.hour).toISOString()}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: { ea_item_id: number; platform: string; hour: string; price: number; contributors: number }[] = [];
  for (const g of groups.values()) {
    // Your own captures are already in your history; only hours someone else saw add anything.
    if (!g.some((r) => r.contributor_user_id !== caller)) continue;
    const m = median(g.map((r) => r.price));
    const kept = g.filter((r) => r.price <= m * OUTLIER_FACTOR && r.price * OUTLIER_FACTOR >= m);
    if (!kept.length) continue;
    out.push({ ea_item_id: g[0]!.ea_item_id, platform: g[0]!.platform, hour: new Date(g[0]!.hour).toISOString(), price: median(kept.map((r) => r.price)), contributors: new Set(kept.map((r) => r.contributor_user_id)).size });
  }
  return out;
}

/** Pull pooled prices for the caller's own synced cards into their private history (source community_pool). */
export async function pullCommunity(db: FutDb, userId: string, market: Importer) {
  const { sharing } = await getSharing(db, userId);
  if (!sharing) throw new FutError("Turn on price sharing first: community prices are for people who share theirs.", 403);
  const cards = (await searchMyCards(db, userId, { all: true })).filter((c) => c.ea_item_id !== null);
  const byEa = new Map<number, string>();
  for (const c of cards) if (!byEa.has(c.ea_item_id!)) byEa.set(c.ea_item_id!, c.id);
  const ids = [...byEa.keys()].slice(0, MAX_PULL_CARDS);
  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("market_community_observations").select("contributor_user_id, ea_item_id, platform, hour, price").in("ea_item_id", ids.slice(i, i + 100)).gte("hour", since);
    fail(error);
    rows.push(...((data ?? []) as Row[]));
  }
  const pooled = poolHours(rows.map((r) => ({ contributor_user_id: String(r.contributor_user_id), ea_item_id: Number(r.ea_item_id), platform: String(r.platform), hour: String(r.hour), price: Number(r.price) })), userId);
  const lines = pooled.map((p) => `${byEa.get(p.ea_item_id)},${p.platform},${p.price},${p.hour},lowest_bin`);
  const imported = lines.length ? await market.importPriceHistory(userId, ["card_id,platform,price,observed_at,kind", ...lines].join("\n"), { source_id: COMMUNITY_SOURCE_ID }) : null;
  const { count } = await db.from("market_sharing").select("user_id", { count: "exact", head: true }).eq("sharing", true);
  return {
    source: COMMUNITY_SOURCE_ID,
    sharers: count ?? 0,
    your_cards_with_ea_id: byEa.size,
    cards_with_community_prices: new Set(pooled.map((p) => p.ea_item_id)).size,
    observations: lines.length,
    max_contributors: pooled.reduce((m, p) => Math.max(m, p.contributors), 0),
    import: imported,
    note: "Pooled from other XI Lab users' own Web App searches: for each hour, the median of each person's lowest price, with outliers dropped. " +
      "Hours only you saw are skipped (they're already in your history). Stored privately as an estimate.",
  };
}
