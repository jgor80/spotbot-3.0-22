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
    note: "Third-party PlayStation prices (fc27-market on Val Town, from FUT.GG's PlayStation file; Xbox and PlayStation share one console market). " +
      "Only the top 100 cards per group are listed, so cheaper cards won't match." +
      (hoursOld !== null && hoursOld > 6 ? ` Its latest prices are ${hoursOld} hours old.` : ""),
  };
}

// ---------------------------------------------------------------- scheduled collection
// The bot's scheduler calls this hourly (Jeff, 2026-11-08: prices without a signed-in Web App session). It keeps
// EVERY card in each /latest snapshot (shared reference table fut.market_feed_prices, service role only, never
// public), with the feed's own snapshot time so staleness is visible, and adds the new snapshot price to the private
// price history of every user who has that card synced. Third-party data (FUT.GG-derived), not EA's market.

const GROUPS = ["icons", "heroes", "bronze", "silver", "gold", "special"];

export function parseLatest(latest: unknown) {
  const l = latest as { updated?: unknown; groups?: Record<string, unknown> } | null;
  const updated = typeof l?.updated === "string" && !Number.isNaN(Date.parse(l.updated)) ? new Date(l.updated).toISOString() : null;
  const rows = new Map<number, { ea_item_id: number; grp: string; name: string | null; rating: number | null; rarity_id: number | null; price: number }>();
  for (const [grp, list] of Object.entries(l?.groups ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const p of list as Record<string, unknown>[]) {
      const ea = Number(p?.eaId), price = Number(p?.price);
      if (!Number.isInteger(ea) || ea <= 0 || !Number.isInteger(price) || price <= 0) continue;
      rows.set(ea, {
        ea_item_id: ea, grp: GROUPS.includes(grp) ? grp : "other", name: typeof p.name === "string" ? p.name.slice(0, 120) : null,
        rating: Number.isInteger(p.rating) ? Number(p.rating) : null, rarity_id: Number.isInteger(p.rarityId) ? Number(p.rarityId) : null, price,
      });
    }
  }
  return { updated, rows: [...rows.values()] };
}

const failDb = (error: { message?: string } | null) => {
  if (error) throw new FutError(`fut db: ${error.message ?? "error"}`, 500);
};

export async function collectFc27Market(db: FutDb, market: Importer, fetchFn: Fetch = (u) => fetch(u, { headers: { accept: "application/json" } })) {
  const started_at = new Date().toISOString();
  const run = async (status: "succeeded" | "failed", accepted: number, message: string) =>
    failDb((await db.from("market_provider_runs").insert({ source_id: "fc27_market", started_at, finished_at: new Date().toISOString(), status, accepted, rejected: 0, message })).error);
  let parsed: ReturnType<typeof parseLatest>;
  try {
    parsed = parseLatest(await getJson(fetchFn, `${FC27_MARKET_BASE}/latest`));
    if (!parsed.updated || !parsed.rows.length) throw new FutError("fc27-market returned no snapshot.", 502);
  } catch (e) {
    await run("failed", 0, e instanceof Error ? e.message : String(e));
    throw e;
  }
  const { updated, rows } = parsed as { updated: string; rows: ReturnType<typeof parseLatest>["rows"] };
  const { data: seen, error } = await db.from("market_feed_prices").select("ea_item_id").eq("source_id", "fc27_market").eq("feed_updated", updated).limit(1);
  failDb(error);
  if ((seen ?? []).length) {
    const hours = Math.round((Date.now() - Date.parse(updated)) / 3_600_000);
    await run("succeeded", 0, `No new snapshot (still ${updated}, ${hours}h old).`);
    return { updated, new_snapshot: false, cards: rows.length, users_updated: 0, observations: 0 };
  }
  const fetched_at = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    failDb((await db.from("market_feed_prices").insert(rows.slice(i, i + 500).map((r) => ({ ...r, source_id: "fc27_market", feed_updated: updated, fetched_at })))).error);
  }
  // Everyone's synced cards with these EA item ids get the snapshot price in their own private history.
  const price = new Map(rows.map((r) => [String(r.ea_item_id), r.price]));
  const keys = [...price.keys()];
  const byOwner = new Map<string, string[]>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error: e2 } = await db.from("player_cards").select("id, owner_user_id, source_card_key").in("source_card_key", keys.slice(i, i + 100));
    failDb(e2);
    for (const c of (data ?? []) as { id: string; owner_user_id: string | null; source_card_key: string }[]) {
      if (!c.owner_user_id) continue;
      byOwner.set(c.owner_user_id, [...(byOwner.get(c.owner_user_id) ?? []), `${c.id},console,${price.get(c.source_card_key)},${updated},lowest_bin`]);
    }
  }
  let observations = 0;
  for (const [owner, lines] of byOwner) {
    try {
      const r = await market.importPriceHistory(owner, ["card_id,platform,price,observed_at,kind", ...lines].join("\n"), { source_id: "fc27_market" });
      observations += Number((r as { inserted?: number }).inserted ?? 0);
    } catch (e) {
      console.warn("[fc27-market] import for a user failed:", e);
    }
  }
  await run("succeeded", rows.length, `Snapshot ${updated}: ${rows.length} cards stored, ${observations} prices added for ${byOwner.size} users.`);
  return { updated, new_snapshot: true, cards: rows.length, users_updated: byOwner.size, observations };
}

/** What the scheduled collection last did, for the Import prices page. */
export async function fc27MarketStatus(db: FutDb) {
  const { data: last, error } = await db.from("market_feed_prices").select("feed_updated, fetched_at").eq("source_id", "fc27_market").order("feed_updated", { ascending: false }).limit(1);
  failDb(error);
  const latest = (last ?? [])[0] as { feed_updated: string; fetched_at: string } | undefined;
  let cards = 0;
  if (latest) {
    const { count, error: e2 } = await db.from("market_feed_prices").select("ea_item_id", { count: "exact", head: true }).eq("source_id", "fc27_market").eq("feed_updated", latest.feed_updated);
    failDb(e2);
    cards = count ?? 0;
  }
  const { data: runs, error: e3 } = await db.from("market_provider_runs").select("finished_at, status, message").eq("source_id", "fc27_market").order("finished_at", { ascending: false }).limit(1);
  failDb(e3);
  const run = (runs ?? [])[0] as { finished_at: string; status: string; message: string } | undefined;
  const feed = latest ? new Date(latest.feed_updated).toISOString() : null;
  return {
    feed_updated: feed,
    hours_old: feed ? Math.round((Date.now() - Date.parse(feed)) / 3_600_000) : null,
    cards,
    last_run: run ? { at: run.finished_at, status: run.status, message: run.message } : null,
    platform_label: "PlayStation",
    note: "Pulled hourly by the server from fc27-market, a third-party copy of FUT.GG's PlayStation prices (not EA's market). Xbox and PlayStation share one console market, so they're stored as console prices. Your synced cards get each new snapshot automatically.",
  };
}
