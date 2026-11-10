// Club FUT layer in Discord (Jeff, 2026-11-10): things only a Discord bot can do with FUT. Each player opts in on
// the website (fut.club_share, off by default): big pack pulls posted to the club channel, and a place on the club's
// FUT board and in "who has this card". The bot works out which players are in which server (verified Discord links
// of the server's members) and passes their website user ids here. Coins and the transfer list are never shared.
import { FutError, type FutDb } from "./service.ts";
import { tradeSummary, type TradeRow } from "./trades.ts";
import { result as gameResult } from "./champs.ts";

type Row = Record<string, unknown>;
const fail = (e: { message?: string } | null) => { if (e) throw new FutError(`Club sharing: ${e.message ?? "database error"}`, 500); };
const DAY = 86_400_000;
/** Pulls older than this when the job first sees them are skipped, so turning sharing on doesn't post old packs. */
export const PULL_WINDOW_MS = 12 * 3_600_000;
export const PULLS_PER_RUN = 3;
const MAX_USERS = 500;

export interface ClubShare { platform: "console" | "pc"; share_pulls: boolean; share_board: boolean; min_pull_rating: number }
const DEFAULTS: ClubShare = { platform: "console", share_pulls: false, share_board: false, min_pull_rating: 86 };

export async function getShare(db: FutDb, userId: string): Promise<ClubShare> {
  const { data, error } = await db.from("club_share").select("*").eq("user_id", userId).maybeSingle();
  fail(error);
  const r = (data ?? {}) as Partial<ClubShare>;
  return { platform: r.platform === "pc" ? "pc" : "console", share_pulls: r.share_pulls === true, share_board: r.share_board === true, min_pull_rating: typeof r.min_pull_rating === "number" ? r.min_pull_rating : DEFAULTS.min_pull_rating };
}

export async function setShare(db: FutDb, userId: string, b: Row) {
  const cur = await getShare(db, userId);
  const next: ClubShare = { platform: cur.platform, share_pulls: cur.share_pulls, share_board: cur.share_board, min_pull_rating: cur.min_pull_rating };
  if (b.platform !== undefined) { if (b.platform !== "console" && b.platform !== "pc") throw new FutError("platform must be console or pc."); next.platform = b.platform; }
  for (const k of ["share_pulls", "share_board"] as const) if (b[k] !== undefined) { if (typeof b[k] !== "boolean") throw new FutError(`${k} must be true or false.`); next[k] = b[k] as boolean; }
  if (b.min_pull_rating !== undefined) {
    const n = Number(b.min_pull_rating);
    if (!Number.isInteger(n) || n < 75 || n > 99) throw new FutError("min_pull_rating must be a whole rating from 75 to 99.");
    next.min_pull_rating = n;
  }
  const { error } = await db.from("club_share").upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  fail(error);
  return getShare(db, userId);
}

async function names(db: FutDb, platform: string, ids: number[]) {
  const out = new Map<number, { name: string | null; price: number | null }>();
  if (!ids.length) return out;
  const { data, error } = await db.rpc("account_item_prices", { p_platform: platform, p_ids: [...new Set(ids)] });
  if (error) return out; // names are nice to have; a pull still posts with its rating
  for (const i of (((data as Row | null)?.items ?? []) as Row[])) out.set(Number(i.ea_item_id), { name: (i.player_name as string | null) ?? null, price: (i.price as number | null) ?? null });
  return out;
}

const coins = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

export interface PullDelivery { user_id: string; item_id: number; ea_item_id: number; rating: number; name: string | null; price: number | null; untradeable: boolean; opened_at: string; text: string }

/**
 * Bot job: new big pulls from players who share them, at most PULLS_PER_RUN each (best first). Each pull is marked
 * as posted here, so a failed Discord post isn't retried; that's preferred over posting twice.
 */
export async function runClubPulls(db: FutDb, now = Date.now()) {
  const { data: shares, error } = await db.from("club_share").select("*").eq("share_pulls", true).limit(MAX_USERS);
  fail(error);
  const deliveries: PullDelivery[] = [];
  let skipped = 0;
  for (const s of (shares ?? []) as (ClubShare & { user_id: string })[]) {
    const { data: pulls, error: e1 } = await db.from("pack_pulls").select("item_id, ea_item_id, rating, untradeable, opened_at").eq("user_id", s.user_id).eq("platform", s.platform).gte("rating", s.min_pull_rating).order("opened_at", { ascending: false }).limit(50);
    fail(e1);
    const list = (pulls ?? []) as { item_id: number; ea_item_id: number; rating: number; untradeable: boolean; opened_at: string }[];
    if (!list.length) continue;
    const { data: posted, error: e2 } = await db.from("club_pull_posts").select("item_id").eq("user_id", s.user_id).in("item_id", list.map((p) => p.item_id));
    fail(e2);
    const done = new Set(((posted ?? []) as { item_id: number }[]).map((p) => Number(p.item_id)));
    const fresh = list.filter((p) => !done.has(Number(p.item_id)));
    if (!fresh.length) continue;
    const recent = fresh.filter((p) => now - Date.parse(p.opened_at) <= PULL_WINDOW_MS).sort((a, b) => b.rating - a.rating || b.opened_at.localeCompare(a.opened_at));
    const send = recent.slice(0, PULLS_PER_RUN);
    skipped += fresh.length - send.length;
    const marks = fresh.map((p) => ({ user_id: s.user_id, item_id: p.item_id, posted_at: new Date(now).toISOString() }));
    fail((await db.from("club_pull_posts").upsert(marks, { onConflict: "user_id,item_id" })).error);
    const named = await names(db, s.platform, send.map((p) => p.ea_item_id));
    for (const p of send) {
      const n = named.get(p.ea_item_id);
      const price = p.untradeable ? null : n?.price ?? null;
      const name = n?.name ?? null;
      deliveries.push({ user_id: s.user_id, item_id: Number(p.item_id), ea_item_id: Number(p.ea_item_id), rating: p.rating, name, price, untradeable: p.untradeable === true, opened_at: p.opened_at,
        text: `pulled ${name ? `**${name}** ` : "a "}**${p.rating}**${p.untradeable ? " (untradeable)" : price ? ` · worth about ${coins(price)}` : ""}` });
    }
  }
  return { deliveries, skipped };
}

/** Only the given website users who chose to be on the club board. */
async function boardUsers(db: FutDb, userIds: unknown) {
  if (!Array.isArray(userIds)) throw new FutError("user_ids must be a list.");
  const ids = [...new Set(userIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, MAX_USERS);
  if (!ids.length) return [];
  const { data, error } = await db.from("club_share").select("*").in("user_id", ids).eq("share_board", true);
  fail(error);
  return (data ?? []) as (ClubShare & { user_id: string })[];
}

export interface BoardRow { user_id: string; platform: string; club_value: number | null; trade_profit_week: number | null; flips_week: number; champs: { w: number; d: number; l: number } | null; best_pull: { rating: number; name: string | null } | null }

/** Bot job: the club's FUT board for this week, for the server members who share it. */
export async function clubBoard(db: FutDb, userIds: unknown, now = Date.now()) {
  const users = await boardUsers(db, userIds);
  const since = new Date(now - 7 * DAY).toISOString();
  const rows: BoardRow[] = [];
  for (const u of users) {
    const [value, trades, runs, pulls] = await Promise.all([
      db.rpc("club_trade_value", { p_user: u.user_id, p_platform: u.platform }),
      db.from("trade_log").select("*").eq("user_id", u.user_id).eq("platform", u.platform).gte("sold_at", since).limit(2000),
      db.from("ut_runs").select("id").eq("user_id", u.user_id).eq("platform", u.platform).limit(60),
      db.from("pack_pulls").select("ea_item_id, rating").eq("user_id", u.user_id).eq("platform", u.platform).gte("opened_at", since).order("rating", { ascending: false }).limit(1),
    ]);
    const totals = ((value.data as Row | null)?.totals ?? null) as Row | null;
    const t = trades.error ? null : tradeSummary((trades.data ?? []) as TradeRow[], new Map(), now).totals;
    let champs: BoardRow["champs"] = null;
    const runIds = ((runs.data ?? []) as { id: string }[]).map((r) => r.id);
    if (!runs.error && runIds.length) {
      const { data: games } = await db.from("ut_games").select("goals_for, goals_against, penalties, played_at").in("run_id", runIds).gte("played_at", since);
      const list = (games ?? []) as { goals_for: number; goals_against: number; penalties: "won" | "lost" | null }[];
      if (list.length) champs = { w: 0, d: 0, l: 0 };
      for (const g of list) { const r = gameResult(g); champs![r === "W" ? "w" : r === "D" ? "d" : "l"]++; }
    }
    const top = ((pulls.data ?? []) as { ea_item_id: number; rating: number }[])[0];
    const pullName = top ? (await names(db, u.platform, [Number(top.ea_item_id)])).get(Number(top.ea_item_id))?.name ?? null : null;
    rows.push({
      user_id: u.user_id, platform: u.platform,
      club_value: !value.error && totals && typeof totals.value_after_tax === "number" && (totals.cards as number) > 0 ? totals.value_after_tax as number : null,
      trade_profit_week: t && t.flips ? t.week : null, flips_week: t?.flips ?? 0, champs, best_pull: top ? { rating: top.rating, name: pullName } : null,
    });
  }
  return { since, rows };
}

/** Bot job: which sharing members own a card whose name matches the query (their synced club). */
export async function whoHas(db: FutDb, userIds: unknown, query: unknown) {
  const q = typeof query === "string" ? query.normalize("NFKC").replace(/[%_\\]/g, " ").trim().slice(0, 60) : "";
  if (q.length < 2) throw new FutError("Type at least two letters of the player's name.");
  const users = await boardUsers(db, userIds);
  if (!users.length) return { query: q, owners: [] };
  // Their own synced cards with a matching name, kept only while still in their club (club_inventory).
  const { data, error } = await db.from("player_cards").select("id, owner_user_id, player_name, overall, version").in("owner_user_id", users.map((u) => u.user_id)).ilike("player_name", `%${q}%`).order("overall", { ascending: false }).limit(200);
  fail(error);
  const cards = (data ?? []) as Row[];
  const held = new Set<string>();
  for (let i = 0; i < cards.length; i += 100) {
    const part = cards.slice(i, i + 100);
    const { data: inv, error: e } = await db.from("club_inventory").select("user_id, card_id").in("card_id", part.map((c) => c.id));
    fail(e);
    for (const r of (inv ?? []) as Row[]) held.add(`${r.user_id}|${r.card_id}`);
  }
  const by = new Map<string, { name: string; rating: number | null; version: string | null }[]>();
  for (const c of cards.filter((c) => held.has(`${c.owner_user_id}|${c.id}`))) {
    const list = by.get(c.owner_user_id as string) ?? [];
    if (list.length < 5) list.push({ name: c.player_name as string, rating: (c.overall as number | null) ?? null, version: (c.version as string | null) ?? null });
    by.set(c.owner_user_id as string, list);
  }
  return { query: q, owners: [...by.entries()].map(([user_id, cards]) => ({ user_id, cards })).sort((a, b) => (b.cards[0]?.rating ?? 0) - (a.cards[0]?.rating ?? 0)) };
}
