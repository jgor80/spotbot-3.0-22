// My Account (Jeff, 2026-11-09): the user's own EA Ultimate Team account as the XI Lab helper copied it while they
// were signed in to the EA Web App: coins, FC Points and other currencies, club record, transfer list, watchlist,
// unassigned pile, SBCs, objectives and season progress.
//
// Input: format "xilab-account-capture" (jgor80/11-lab src/account/capture.ts). The helper only reads GET answers the
// Web App loads by itself at sign-in or on the user's own screens; nothing here talks to EA. Card names and prices
// come from the FUT.GG catalogue (fut.account_item_prices).
//
// UNVERIFIED on FC 27: the answer addresses are verified, their field names are not. Each upload keeps the field
// names it saw (`shape`) and the page shows them so the first real capture can confirm them.
import { FutDbError, FutError, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};

export const SECTIONS = ["balance", "profile", "tradepile", "watchlist", "unassigned", "sbcs", "sbc_challenges", "evolutions", "objectives", "season"] as const;
export type SectionName = typeof SECTIONS[number];
export const EA_TAX = 0.05;
const MAX_TRADE = 300, MAX_UNASSIGNED = 500, MAX_SBCS = 600, MAX_OBJECTIVES = 600;
/** Keep a balance point at least this often even when nothing changed, so the chart has a line. */
const HISTORY_EVERY_MS = 6 * 3_600_000;
const HISTORY_DAYS = 180;

// ------------------------------------------------------------------ upload parsing (strict: anything odd is dropped)

const isObj = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2 ** 53 ? v : null);
const num = (v: unknown, max = 2_000_000_000): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const text = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const bool = (v: unknown) => v === true;
const when = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t > Date.UTC(2020, 0, 1) && t < Date.UTC(2040, 0, 1) ? new Date(t).toISOString() : null;
};
const rating = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99 ? v : null);

export interface Balance { coins: number | null; points: number | null; draft_tokens: number | null; currencies: { name: string; funds: number }[] }
export interface Profile {
  persona_name: string | null; club_name: string | null; club_abbr: string | null; established: string | null;
  won: number | null; lost: number | null; draw: number | null; trophies: number | null; division_online: number | null; division_offline: number | null;
  unopened_packs: number | null; unassigned_count: number | null; tradepile_max: number | null; watchlist_max: number | null; platform_name: string | null;
}
const TRADE_STATES = ["listed", "sold", "expired", "unlisted", "winning", "outbid", "won", "lost", "watching"] as const;
export type TradeState = typeof TRADE_STATES[number];
export interface PileItem { item_id: number; ea_item_id: number; item_type: string | null; rating: number | null; rare_flag: number | null; untradeable: boolean }
export interface TradeItem extends PileItem { trade_id: string | null; state: TradeState; buy_now: number | null; current_bid: number | null; starting_bid: number | null; expires_at: string | null; last_sale_price: number | null }
export interface UnassignedItem extends PileItem { duplicate: boolean }
export interface SbcSet {
  set_id: number; name: string; category: string | null; description: string | null; challenges: number | null; completed: number | null;
  times_completed: number | null; repeat_limit: number | null; repeatable: boolean; end_at: string | null;
  awards: { type: string; value: number | null; count: number | null; untradeable: boolean }[];
}
export interface SbcChallenge {
  set_id: number; challenge_id: number; name: string; description: string | null; formation: string | null; status: string | null; operation: string | null;
  requirements: { type: string; scope: string | null; values: number[]; count: number | null; slot: number | null }[];
  awards: SbcSet["awards"]; end_at: string | null;
}
export interface Objective { id: number | null; name: string; group: string | null; progress: number | null; target: number | null; done: boolean; end_at: string | null; xp: number | null }

function parseBalance(v: unknown): Balance | null {
  if (!isObj(v)) return null;
  const currencies = (Array.isArray(v.currencies) ? v.currencies : []).filter(isObj)
    .map((c) => ({ name: text(c.name, 40)?.toUpperCase() ?? "", funds: num(c.funds) }))
    .filter((c): c is { name: string; funds: number } => !!c.name && /^[A-Z0-9_]+$/.test(c.name) && c.funds !== null).slice(0, 20);
  const b = { coins: num(v.coins), points: num(v.points), draft_tokens: num(v.draft_tokens, 10_000), currencies };
  return b.coins === null && b.points === null && !currencies.length ? null : b;
}

function parseProfile(v: unknown): Profile | null {
  if (!isObj(v)) return null;
  return {
    persona_name: text(v.persona_name, 60), club_name: text(v.club_name, 60), club_abbr: text(v.club_abbr, 10), established: text(v.established, 40),
    won: num(v.won), lost: num(v.lost), draw: num(v.draw), trophies: num(v.trophies), division_online: num(v.division_online, 100), division_offline: num(v.division_offline, 100),
    unopened_packs: num(v.unopened_packs, 100_000), unassigned_count: num(v.unassigned_count, 100_000), tradepile_max: num(v.tradepile_max, 10_000),
    watchlist_max: num(v.watchlist_max, 10_000), platform_name: text(v.platform_name, 20),
  };
}

function parsePileItem(v: Row): PileItem | null {
  const item_id = id(v.item_id), ea_item_id = id(v.ea_item_id);
  if (!item_id || !ea_item_id) return null;
  return { item_id, ea_item_id, item_type: text(v.item_type, 30), rating: rating(v.rating), rare_flag: num(v.rare_flag, 1000), untradeable: bool(v.untradeable) };
}

function parseTrades(v: unknown): TradeItem[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, MAX_TRADE).filter(isObj).map((t) => {
    const base = parsePileItem(t);
    if (!base || !TRADE_STATES.includes(t.state as TradeState)) return null;
    const coin = (x: unknown) => num(x, 15_000_000) || null;
    return {
      ...base, trade_id: typeof t.trade_id === "string" && /^\d{1,20}$/.test(t.trade_id) ? t.trade_id : null, state: t.state as TradeState,
      buy_now: coin(t.buy_now), current_bid: coin(t.current_bid), starting_bid: coin(t.starting_bid), expires_at: when(t.expires_at), last_sale_price: coin(t.last_sale_price),
    };
  }).filter((t): t is TradeItem => !!t);
}

function parseUnassigned(v: unknown): UnassignedItem[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, MAX_UNASSIGNED).filter(isObj).map((u) => { const b = parsePileItem(u); return b ? { ...b, duplicate: bool(u.duplicate) } : null; })
    .filter((u): u is UnassignedItem => !!u);
}

function parseSbcs(v: unknown): SbcSet[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, MAX_SBCS).filter(isObj).map((s) => {
    const set_id = id(s.set_id), name = text(s.name, 120);
    if (!set_id || !name) return null;
    return {
      set_id, name, category: text(s.category, 60), description: text(s.description, 300), challenges: num(s.challenges, 500), completed: num(s.completed, 500),
      times_completed: num(s.times_completed, 100_000), repeat_limit: num(s.repeat_limit, 100_000), repeatable: bool(s.repeatable), end_at: when(s.end_at),
      awards: (Array.isArray(s.awards) ? s.awards : []).filter(isObj).slice(0, 10).map((a) => ({ type: text(a.type, 30) ?? "item", value: num(a.value), count: num(a.count, 1000), untradeable: bool(a.untradeable) })),
    };
  }).filter((s): s is SbcSet => !!s);
}

function parseSbcChallenges(v: unknown): SbcChallenge[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, 300).filter(isObj).map((c) => {
    const set_id = id(c.set_id), challenge_id = id(c.challenge_id), name = text(c.name, 120);
    if (!set_id || !challenge_id || !name) return null;
    const small = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi ? x : null);
    return {
      set_id, challenge_id, name, description: text(c.description, 300), formation: text(c.formation, 20), status: text(c.status, 30), operation: text(c.operation, 10),
      requirements: (Array.isArray(c.requirements) ? c.requirements : []).filter(isObj).slice(0, 20).map((r) => ({
        type: (text(r.type, 60) ?? "").toUpperCase(), scope: text(r.scope, 20)?.toUpperCase() ?? null,
        values: (Array.isArray(r.values) ? r.values : []).map((x) => small(x, -(2 ** 31), 2 ** 31)).filter((x): x is number => x !== null).slice(0, 40),
        count: small(r.count, -1, 30), slot: small(r.slot, -1, 30),
      })).filter((r) => /^[A-Z0-9_]{1,60}$/.test(r.type)),
      awards: (Array.isArray(c.awards) ? c.awards : []).filter(isObj).slice(0, 10).map((a) => ({ type: text(a.type, 30) ?? "item", value: num(a.value), count: num(a.count, 1000), untradeable: bool(a.untradeable) })),
      end_at: when(c.end_at),
    };
  }).filter((c): c is SbcChallenge => !!c);
}

function parseEvolutions(v: unknown) {
  if (!Array.isArray(v)) return null;
  const entry = (r: Row) => ({
    type: (text(r.type, 60) ?? "").toUpperCase(), scope: text(r.scope, 20)?.toUpperCase() ?? null,
    values: (Array.isArray(r.values) ? r.values : []).filter((x) => (typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 2 ** 31) || (typeof x === "string" && x.length <= 40)).slice(0, 20),
  });
  const ok = (e: { type: string }) => /^[A-Z0-9_ +]{1,60}$/.test(e.type);
  return v.slice(0, 150).filter(isObj).map((e) => {
    const evo_id = id(e.evo_id), name = text(e.name, 120);
    if (!evo_id || !name) return null;
    return {
      evo_id, name, description: text(e.description, 300), end_at: when(e.end_at), coins: num(e.coins), points: num(e.points), status: text(e.status, 30),
      requirements: (Array.isArray(e.requirements) ? e.requirements : []).filter(isObj).slice(0, 20).map(entry).filter(ok),
      levels: (Array.isArray(e.levels) ? e.levels : []).filter(isObj).slice(0, 12).map((l) => ({ upgrades: (Array.isArray(l.upgrades) ? l.upgrades : []).filter(isObj).slice(0, 20).map(entry).filter(ok) })),
    };
  }).filter((e) => !!e);
}

function parseObjectives(v: unknown): Objective[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, MAX_OBJECTIVES).filter(isObj).map((o) => {
    const name = text(o.name, 160);
    if (!name) return null;
    return { id: id(o.id), name, group: text(o.group, 160), progress: num(o.progress), target: num(o.target), done: bool(o.done), end_at: when(o.end_at), xp: num(o.xp, 10_000_000) };
  }).filter((o): o is Objective => !!o);
}

function parseSeason(v: unknown): Record<string, number> | null {
  if (!isObj(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v).slice(0, 40)) if (/^[A-Za-z0-9_.]{1,60}$/.test(k) && typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e10) out[k] = x;
  return Object.keys(out).length ? out : null;
}

const PARSERS: Record<SectionName, (v: unknown) => unknown> = {
  balance: parseBalance, profile: parseProfile, tradepile: parseTrades, watchlist: parseTrades, unassigned: parseUnassigned,
  sbcs: parseSbcs, sbc_challenges: parseSbcChallenges, evolutions: parseEvolutions, objectives: parseObjectives, season: parseSeason,
};

export interface AccountUpload {
  platform: "console" | "pc";
  captured_at: string;
  sections: Partial<Record<SectionName, { seen_at: string; data: unknown }>>;
  shape: Record<string, string[]>;
}

export function parseAccountUpload(raw: unknown, now = Date.now()): AccountUpload {
  if (!isObj(raw) || raw.format !== "xilab-account-capture") throw new FutError("This isn't an account file from the XI Lab helper (format xilab-account-capture).");
  if (raw.version !== 1) throw new FutError("Unknown account file version. Update the XI Lab helper.");
  const sections: AccountUpload["sections"] = {};
  const future = new Date(now + 10 * 60_000).toISOString();
  for (const name of SECTIONS) {
    const s = raw[name];
    if (!isObj(s)) continue;
    const seen_at = when(s.seen_at);
    const data = PARSERS[name](s.data);
    if (seen_at && seen_at <= future && data !== null) sections[name] = { seen_at, data };
  }
  const shape: Record<string, string[]> = {};
  if (isObj(raw.shape)) for (const [k, v] of Object.entries(raw.shape).slice(0, 20)) {
    if (/^[a-z_]{1,30}$/.test(k) && Array.isArray(v)) shape[k] = v.filter((x): x is string => typeof x === "string" && x.length <= 60).slice(0, 80);
  }
  return { platform: raw.platform === "pc" ? "pc" : "console", captured_at: when(raw.captured_at) ?? new Date(now).toISOString(), sections, shape };
}

// ------------------------------------------------------------------ storage

/** Save an upload: each section replaces the stored one only when the Web App showed it later. */
export async function importAccount(db: FutDb, userId: string, raw: unknown, now = Date.now()) {
  const u = parseAccountUpload(raw, now);
  const { data: have, error } = await db.from("account_state").select("*").eq("user_id", userId).eq("platform", u.platform).maybeSingle();
  fail(error);
  const row: Row = { user_id: userId, platform: u.platform, updated_at: new Date(now).toISOString(), shape: { ...((have?.shape as Row) ?? {}), ...u.shape } };
  const updated: SectionName[] = [];
  for (const name of SECTIONS) {
    const s = u.sections[name];
    const prevAt = have?.[`${name}_at`] as string | null | undefined;
    if (s && (!prevAt || Date.parse(s.seen_at) >= Date.parse(prevAt))) {
      row[name] = s.data; row[`${name}_at`] = s.seen_at; updated.push(name);
    } else if (have) {
      row[name] = have[name] ?? null; row[`${name}_at`] = prevAt ?? null;
    }
  }
  fail((await db.from("account_state").upsert(row, { onConflict: "user_id,platform" })).error);
  if (updated.includes("balance")) await recordBalance(db, userId, u.platform, u.sections.balance!.data as Balance, u.sections.balance!.seen_at, now);
  return { updated, platform: u.platform, verified: false as const };
}

async function recordBalance(db: FutDb, userId: string, platform: string, b: Balance, at: string, now: number) {
  const { data, error } = await db.from("account_balance_history").select("at, coins, points, draft_tokens")
    .eq("user_id", userId).eq("platform", platform).order("at", { ascending: false }).limit(1);
  fail(error);
  const last = (data ?? [])[0] as Row | undefined;
  const same = last && last.coins === b.coins && last.points === b.points && last.draft_tokens === b.draft_tokens;
  if (last && (Date.parse(at) <= Date.parse(String(last.at)) || (same && Date.parse(at) - Date.parse(String(last.at)) < HISTORY_EVERY_MS))) return;
  fail((await db.from("account_balance_history").upsert({ user_id: userId, platform, at, coins: b.coins, points: b.points, draft_tokens: b.draft_tokens }, { onConflict: "user_id,platform,at" })).error);
  fail((await db.from("account_balance_history").delete().eq("user_id", userId).eq("platform", platform).lt("at", new Date(now - HISTORY_DAYS * 86_400_000).toISOString())).error);
}

export async function clearAccount(db: FutDb, userId: string, platform: "console" | "pc") {
  for (const t of ["account_state", "account_balance_history"]) fail((await db.from(t).delete().eq("user_id", userId).eq("platform", platform)).error);
  return { cleared: true };
}

// ------------------------------------------------------------------ overview (pure parts exported for tests)

export interface CardInfo { ea_item_id: number; card_id?: string | null; player_name: string | null; version: string | null; overall: number | null; position: string | null; price: number | null }
type Named<T> = T & { name: string; version: string | null; position: string | null; price: number | null };

const afterTax = (v: number) => Math.floor(v * (1 - EA_TAX));
function named<T extends PileItem>(items: T[], cards: Map<number, CardInfo>): Named<T>[] {
  return items.map((i) => {
    const c = cards.get(i.ea_item_id);
    return { ...i, name: c?.player_name ?? `${i.item_type && i.item_type !== "player" ? i.item_type : "Item"} ${i.ea_item_id}`, version: c?.version ?? null, position: c?.position ?? null, price: c?.price ?? null, rating: i.rating ?? c?.overall ?? null };
  });
}

export function tradepileSummary(items: Named<TradeItem>[], max: number | null) {
  const by = (s: TradeState) => items.filter((i) => i.state === s);
  const sold = by("sold"), listed = by("listed"), expired = by("expired"), unlisted = by("unlisted");
  const soldFor = sold.reduce((n, i) => n + (i.current_bid ?? i.buy_now ?? 0), 0);
  const marketValue = (list: Named<TradeItem>[]) => list.reduce((n, i) => n + (i.untradeable ? 0 : i.price ?? 0), 0);
  return {
    total: items.length, max, listed: listed.length, sold: sold.length, expired: expired.length, unlisted: unlisted.length,
    sold_for: soldFor, sold_after_tax: afterTax(soldFor),
    listed_buy_now: listed.reduce((n, i) => n + (i.buy_now ?? 0), 0), listed_after_tax: afterTax(listed.reduce((n, i) => n + (i.buy_now ?? 0), 0)),
    idle_market_value: marketValue([...expired, ...unlisted]),
    overpriced: listed.filter((i) => i.price && i.buy_now && i.buy_now > i.price * 1.25).length,
  };
}

export function watchlistSummary(items: Named<TradeItem>[]) {
  const by = (s: TradeState) => items.filter((i) => i.state === s);
  return {
    total: items.length, winning: by("winning").length, outbid: by("outbid").length, won: by("won").length, lost: by("lost").length,
    coins_in_bids: by("winning").reduce((n, i) => n + (i.current_bid ?? 0), 0),
  };
}

const hoursLeft = (iso: string | null, now: number) => (iso ? (Date.parse(iso) - now) / 3_600_000 : null);

/** Short, practical things to do, from what the Web App last showed. */
export function accountTips(o: {
  now: number; trade: ReturnType<typeof tradepileSummary> | null; watch: ReturnType<typeof watchlistSummary> | null;
  unassigned: Named<UnassignedItem>[] | null; sbcs: SbcSet[] | null; objectives: Objective[] | null;
}): string[] {
  const tips: string[] = [];
  const c = (n: number) => n.toLocaleString("en-US");
  if (o.trade) {
    if (o.trade.sold) tips.push(`${o.trade.sold} sold on your transfer list for ${c(o.trade.sold_for)} coins (${c(o.trade.sold_after_tax)} after tax). Clear them to free the slots.`);
    if (o.trade.expired) tips.push(`${o.trade.expired} listing${o.trade.expired === 1 ? "" : "s"} expired${o.trade.idle_market_value ? `, worth about ${c(o.trade.idle_market_value)} coins at FUT.GG prices` : ""}. Relist or send them to your club.`);
    if (o.trade.overpriced) tips.push(`${o.trade.overpriced} listing${o.trade.overpriced === 1 ? " is" : "s are"} priced more than 25% above FUT.GG's latest price and may not sell.`);
    if (o.trade.max && o.trade.total >= o.trade.max * 0.9) tips.push(`Your transfer list is ${o.trade.total}/${o.trade.max} full.`);
  }
  if (o.watch) {
    if (o.watch.won) tips.push(`${o.watch.won} won item${o.watch.won === 1 ? "" : "s"} in your Transfer Targets to send to your club.`);
    if (o.watch.outbid) tips.push(`You've been outbid on ${o.watch.outbid} item${o.watch.outbid === 1 ? "" : "s"}.`);
  }
  if (o.unassigned?.length) {
    const dupes = o.unassigned.filter((u) => u.duplicate);
    tips.push(`${o.unassigned.length} item${o.unassigned.length === 1 ? "" : "s"} unassigned${dupes.length ? `, ${dupes.length} duplicate${dupes.length === 1 ? "" : "s"} (${dupes.filter((d) => d.untradeable).length} untradeable: SBC fodder)` : ""}. Sort them in the Web App before your next pack.`);
  }
  for (const s of (o.sbcs ?? []).filter((s) => { const h = hoursLeft(s.end_at, o.now); return h !== null && h > 0 && h <= 24 && (s.completed ?? 0) < (s.challenges ?? 1) && !(s.times_completed && !s.repeatable); }).slice(0, 3)) {
    tips.push(`SBC "${s.name}" ends in ${Math.max(1, Math.round(hoursLeft(s.end_at, o.now)!))} hours${s.challenges ? ` (${s.completed ?? 0}/${s.challenges} done)` : ""}.`);
  }
  const ending = (o.objectives ?? []).filter((x) => { const h = hoursLeft(x.end_at, o.now); return !x.done && h !== null && h > 0 && h <= 24; });
  if (ending.length) tips.push(`${ending.length} objective${ending.length === 1 ? "" : "s"} not done end in the next 24 hours.`);
  return tips;
}

const arr = <T>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null);

export async function accountOverview(db: FutDb, userId: string, platform: "console" | "pc", now = Date.now()) {
  const [stateRes, histRes] = await Promise.all([
    db.from("account_state").select("*").eq("user_id", userId).eq("platform", platform).maybeSingle(),
    db.from("account_balance_history").select("at, coins, points, draft_tokens").eq("user_id", userId).eq("platform", platform).order("at", { ascending: false }).limit(500),
  ]);
  fail(stateRes.error); fail(histRes.error);
  const s = (stateRes.data ?? null) as Row | null;
  const trade = arr<TradeItem>(s?.tradepile), watch = arr<TradeItem>(s?.watchlist), un = arr<UnassignedItem>(s?.unassigned);
  const ids = [...new Set([...(trade ?? []), ...(watch ?? []), ...(un ?? [])].map((i) => i.ea_item_id))].slice(0, 2000);
  let cards = new Map<number, CardInfo>(), prices_at: string | null = null;
  if (ids.length) {
    const { data, error } = await db.rpc("account_item_prices", { p_platform: platform, p_ids: ids });
    if (error) throw new FutError(`Card prices are unavailable: ${error.message}`, 500);
    prices_at = ((data as Row | null)?.published_at as string | null) ?? null;
    cards = new Map(((((data as Row | null)?.items) ?? []) as CardInfo[]).map((c) => [Number(c.ea_item_id), c]));
  }
  const profile = (s?.profile ?? null) as Profile | null;
  const tradeN = trade ? named(trade, cards) : null, watchN = watch ? named(watch, cards) : null, unN = un ? named(un, cards) : null;
  const tradeSum = tradeN ? tradepileSummary(tradeN, profile?.tradepile_max ?? null) : null, watchSum = watchN ? watchlistSummary(watchN) : null;
  const sbcs = arr<SbcSet>(s?.sbcs), objectives = arr<Objective>(s?.objectives);
  const at = (k: SectionName) => (s?.[`${k}_at`] as string | null) ?? null;
  const ORDER: Record<string, number> = { sold: 0, expired: 1, listed: 2, unlisted: 3, won: 0, winning: 1, outbid: 2, watching: 3, lost: 4 };
  const sortTrades = (l: Named<TradeItem>[]) => [...l].sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) || (a.expires_at ?? "~").localeCompare(b.expires_at ?? "~") || (b.price ?? 0) - (a.price ?? 0));
  const sbcOpen = (x: SbcSet) => !(x.times_completed && !x.repeatable) && !(x.repeat_limit && (x.times_completed ?? 0) >= x.repeat_limit);
  return {
    platform, connected: !!s, updated_at: (s?.updated_at as string | null) ?? null, prices_at,
    seen: Object.fromEntries(SECTIONS.map((k) => [k, at(k)])) as Record<SectionName, string | null>,
    balance: (s?.balance ?? null) as Balance | null,
    profile,
    history: ((histRes.data ?? []) as Row[]).reverse().map((h) => ({ t: String(h.at), coins: h.coins as number | null, points: h.points as number | null, draft_tokens: h.draft_tokens as number | null })),
    tradepile: tradeN ? { summary: tradeSum!, items: sortTrades(tradeN) } : null,
    watchlist: watchN ? { summary: watchSum!, items: sortTrades(watchN) } : null,
    unassigned: unN ? {
      total: unN.length, duplicates: unN.filter((u) => u.duplicate).length,
      tradeable_value: unN.reduce((n, u) => n + (u.untradeable ? 0 : u.price ?? 0), 0),
      items: [...unN].sort((a, b) => (b.price ?? 0) - (a.price ?? 0) || (b.rating ?? 0) - (a.rating ?? 0)),
    } : null,
    sbcs: sbcs ? {
      total: sbcs.length, open: sbcs.filter(sbcOpen).length,
      items: [...sbcs].sort((a, b) => Number(!sbcOpen(a)) - Number(!sbcOpen(b)) || (a.end_at ?? "~").localeCompare(b.end_at ?? "~") || a.name.localeCompare(b.name)),
    } : null,
    objectives: objectives ? {
      total: objectives.length, done: objectives.filter((o) => o.done).length,
      xp_left: objectives.filter((o) => !o.done).reduce((n, o) => n + (o.xp ?? 0), 0),
      items: [...objectives].sort((a, b) => Number(a.done) - Number(b.done) || (a.end_at ?? "~").localeCompare(b.end_at ?? "~")),
    } : null,
    season: (s?.season ?? null) as Record<string, number> | null,
    tips: accountTips({ now, trade: tradeSum, watch: watchSum, unassigned: unN, sbcs, objectives }),
    shape: (s?.shape ?? null) as Record<string, string[]> | null,
    verified: false as const,
  };
}
