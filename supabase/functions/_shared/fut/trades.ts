// Trade log (Jeff, 2026-11-10): every buy and sale the XI Lab helper saw, recorded automatically from the transfer
// list and Transfer Targets the Web App showed, with after-tax profit per flip, profit over time and what's still held.
// EA's item id stays the same while a card moves from Transfer Targets to the club to the transfer list, so a won
// item and a later sale of that item are one trade. Nothing here buys, sells or lists anything.
import { fail, FutError, type FutDb } from "./service.ts";
import type { TradeItem } from "./account.ts";

type Row = Record<string, unknown>;
export const EA_TAX = 0.05;
const afterTax = (v: number) => Math.floor(v * (1 - EA_TAX));
const MAX_TRADES = 5000;

export interface TradeRow {
  user_id: string; platform: string; item_id: number; ea_item_id: number; rating: number | null;
  bought_for: number | null; bought_at: string | null; bought_source: "watchlist" | "manual" | null;
  listed_for: number | null; listed_at: string | null;
  sold_for: number | null; sold_at: string | null;
}

/**
 * New facts from one look at the piles: won Transfer Targets are buys (the winning bid), sold transfer-list items are
 * sales, listed items keep their asking price. Facts already known are never overwritten (the first sighting wins),
 * except a manual buy price, which the user can always change. Pure.
 */
export function tradeUpdates(have: Map<number, TradeRow>, u: { user_id: string; platform: string; seen_at: string; tradepile: TradeItem[] | null; watchlist: TradeItem[] | null }): TradeRow[] {
  const out = new Map<number, TradeRow>();
  const get = (i: TradeItem): TradeRow => out.get(i.item_id) ?? { ...(have.get(i.item_id) ?? {
    user_id: u.user_id, platform: u.platform, item_id: i.item_id, ea_item_id: i.ea_item_id, rating: i.rating,
    bought_for: null, bought_at: null, bought_source: null, listed_for: null, listed_at: null, sold_for: null, sold_at: null,
  }) };
  for (const i of u.watchlist ?? []) {
    if (i.state !== "won" || !i.current_bid) continue;
    const t = get(i);
    if (t.bought_for !== null) continue;
    out.set(i.item_id, { ...t, bought_for: i.current_bid, bought_at: u.seen_at, bought_source: "watchlist" });
  }
  for (const i of u.tradepile ?? []) {
    const t = get(i);
    if (i.state === "sold" && t.sold_for === null) {
      const price = i.current_bid ?? i.buy_now;
      if (price) out.set(i.item_id, { ...t, sold_for: price, sold_at: u.seen_at });
    } else if (i.state === "listed" && i.buy_now && t.sold_for === null && t.listed_for !== i.buy_now) {
      out.set(i.item_id, { ...t, listed_for: i.buy_now, listed_at: u.seen_at });
    }
  }
  return [...out.values()];
}

/** Saves what the helper's latest account upload says about buys and sales (called from importAccount). */
export async function recordTrades(db: FutDb, userId: string, platform: string, seen_at: string, tradepile: TradeItem[] | null, watchlist: TradeItem[] | null) {
  const ids = [...new Set([...(tradepile ?? []), ...(watchlist ?? [])].map((i) => i.item_id))];
  if (!ids.length) return 0;
  const have = new Map<number, TradeRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("trade_log").select("*").eq("user_id", userId).eq("platform", platform).in("item_id", ids.slice(i, i + 200));
    fail(error);
    for (const r of (data ?? []) as TradeRow[]) have.set(Number(r.item_id), r);
  }
  const rows = tradeUpdates(have, { user_id: userId, platform, seen_at, tradepile, watchlist });
  for (let i = 0; i < rows.length; i += 200) fail((await db.from("trade_log").upsert(rows.slice(i, i + 200), { onConflict: "user_id,platform,item_id" })).error);
  return rows.length;
}

// ------------------------------------------------------------------ the page

export interface Flip { item_id: number; ea_item_id: number; name: string; rating: number | null; bought_for: number; sold_for: number; after_tax: number; profit: number; bought_at: string | null; sold_at: string; held_hours: number | null; roi: number }

/** Profit, flips, best and worst, profit by day, and what's still held (valued at FUT.GG's price after tax). Pure. */
export function tradeSummary(rows: TradeRow[], names: Map<number, { name: string | null; price: number | null }>, now = Date.now()) {
  const nameOf = (r: TradeRow) => names.get(r.ea_item_id)?.name ?? `Item ${r.ea_item_id}`;
  const flips: Flip[] = rows.filter((r) => r.bought_for !== null && r.sold_for !== null && r.sold_at).map((r) => {
    const at = afterTax(r.sold_for!), profit = at - r.bought_for!;
    return {
      item_id: r.item_id, ea_item_id: r.ea_item_id, name: nameOf(r), rating: r.rating, bought_for: r.bought_for!, sold_for: r.sold_for!, after_tax: at, profit,
      bought_at: r.bought_at, sold_at: r.sold_at!, held_hours: r.bought_at ? Math.max(0, Math.round((Date.parse(r.sold_at!) - Date.parse(r.bought_at)) / 3_600_000)) : null,
      roi: r.bought_for! > 0 ? Math.round((profit / r.bought_for!) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.sold_at.localeCompare(a.sold_at));
  const since = (days: number) => flips.filter((f) => now - Date.parse(f.sold_at) <= days * 86_400_000);
  const sum = (l: Flip[]) => l.reduce((n, f) => n + f.profit, 0);
  const byDay = new Map<string, number>();
  for (const f of [...flips].reverse()) byDay.set(f.sold_at.slice(0, 10), (byDay.get(f.sold_at.slice(0, 10)) ?? 0) + f.profit);
  let running = 0;
  const history = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, p]) => ({ t: `${day}T12:00:00Z`, value: (running += p) }));
  const open = rows.filter((r) => r.bought_for !== null && r.sold_for === null).map((r) => {
    const price = names.get(r.ea_item_id)?.price ?? null;
    return { item_id: r.item_id, ea_item_id: r.ea_item_id, name: nameOf(r), rating: r.rating, bought_for: r.bought_for!, bought_at: r.bought_at, listed_for: r.listed_for, price, unrealised: price === null ? null : afterTax(price) - r.bought_for! };
  }).sort((a, b) => (a.bought_at ?? "").localeCompare(b.bought_at ?? ""));
  const unknownBuy = rows.filter((r) => r.bought_for === null && r.sold_for !== null).map((r) => ({ item_id: r.item_id, ea_item_id: r.ea_item_id, name: nameOf(r), rating: r.rating, sold_for: r.sold_for!, after_tax: afterTax(r.sold_for!), sold_at: r.sold_at }));
  const wins = flips.filter((f) => f.profit > 0).length;
  return {
    totals: {
      flips: flips.length, profit: sum(flips), week: sum(since(7)), month: sum(since(30)), win_rate: flips.length ? Math.round((wins / flips.length) * 100) : null,
      tax_paid: flips.reduce((n, f) => n + (f.sold_for - f.after_tax), 0),
      open: open.length, open_cost: open.reduce((n, o) => n + o.bought_for, 0),
      unrealised: open.some((o) => o.unrealised !== null) ? open.reduce((n, o) => n + (o.unrealised ?? 0), 0) : null,
      sales_without_buy: unknownBuy.length, sales_without_buy_after_tax: unknownBuy.reduce((n, s) => n + s.after_tax, 0),
    },
    best: [...flips].sort((a, b) => b.profit - a.profit).slice(0, 5),
    worst: [...flips].sort((a, b) => a.profit - b.profit).filter((f) => f.profit < 0).slice(0, 5),
    history, flips: flips.slice(0, 200), open, sales_without_buy: unknownBuy.slice(0, 100),
  };
}

export async function tradeOverview(db: FutDb, userId: string, platform: "console" | "pc", now = Date.now()) {
  const { data, error } = await db.from("trade_log").select("*").eq("user_id", userId).eq("platform", platform).order("item_id", { ascending: false }).limit(MAX_TRADES);
  fail(error);
  const rows = (data ?? []) as TradeRow[];
  const ids = [...new Set(rows.map((r) => Number(r.ea_item_id)))].slice(0, 2000);
  let names = new Map<number, { name: string | null; price: number | null }>(), prices_at: string | null = null;
  if (ids.length) {
    const { data: p, error: e } = await db.rpc("account_item_prices", { p_platform: platform, p_ids: ids });
    if (e) throw new FutError(`Card prices are unavailable: ${e.message}`, 500);
    prices_at = ((p as Row | null)?.published_at as string | null) ?? null;
    names = new Map((((p as Row | null)?.items ?? []) as Row[]).map((i) => [Number(i.ea_item_id), { name: (i.player_name as string | null) ?? null, price: (i.price as number | null) ?? null }]));
  }
  return { platform, prices_at, ...tradeSummary(rows, names, now), note: "Recorded from what the XI Lab helper saw on your transfer list and Transfer Targets: wins are buys, sold items are sales, matched by EA's item id. Buys made before the helper or straight to your club from a search won't show; add their price by hand.", verified: false as const };
}

/** The user sets (or clears) what they paid for an item, for sales the helper saw without a buy. */
export async function setBuyPrice(db: FutDb, userId: string, platform: "console" | "pc", itemId: unknown, price: unknown) {
  const id = typeof itemId === "number" ? itemId : Number(itemId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new FutError("item_id must be EA's item id.");
  const p = price === null ? null : Number(price);
  if (p !== null && (!Number.isInteger(p) || p < 0 || p > 15_000_000)) throw new FutError("price must be whole coins from 0 to 15,000,000, or null.");
  const { data, error } = await db.from("trade_log").select("item_id").eq("user_id", userId).eq("platform", platform).eq("item_id", id).maybeSingle();
  fail(error);
  if (!data) throw new FutError("No trade with that item id.", 404);
  fail((await db.from("trade_log").update({ bought_for: p, bought_source: p === null ? null : "manual", bought_at: null }).eq("user_id", userId).eq("platform", platform).eq("item_id", id)).error);
  return { item_id: id, bought_for: p };
}
