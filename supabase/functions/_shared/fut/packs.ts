// Pack Advisor (Jeff, 2026-11-09): which EA store packs are worth buying, and when.
//
// Input: the pack store the XI Lab helper copied from the user's own EA Web App when they opened the Store (format
// "xilab-store-capture", jgor80/11-lab src/store/capture.ts), plus the items packs gave them when they opened one.
// Nothing here talks to EA, buys or opens anything. Prices are FUT.GG's twice-daily bulk prices for the market-wide
// card list (docs/futgg-sync.md), grouped into rating bands by fut.pack_value_bands.
//
// UNVERIFIED: the store's field names follow FC 26 community clients; each upload keeps the field names it saw
// (fut.pack_store_captures.shape) so the first real capture can confirm them. The expected-value model is an
// estimate: EA publishes "chance of at least one" per category, not the full distribution, so the maths assumes
// the best card in the pack sits in the highest line it hit and the rest are fodder for the pack's quality.
import { FutDbError, FutError, type FutDb } from "./service.ts";
import { cleanArtUrl } from "./card-art.ts";

type Row = Record<string, unknown>;
const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};

export const MAX_PACKS = 400;
export const MAX_PULLS = 1000;
export const MAX_ODDS = 30;
/** EA's 5% tax on transfer-market sales. */
export const EA_TAX = 0.05;

// ------------------------------------------------------------------ upload parsing

export interface PackOdd {
  label: string;
  odds_text: string;
  probability: number | null;
  min_rating: number | null;
  max_rating: number | null;
  special: boolean;
  category_id: number | null;
  tier_id: number | null;
  quality_id: number | null;
  rarity_asset_id: number | null;
  rules: { type: number; value: number; text?: string }[];
}

export interface PackOffer {
  pack_id: number;
  name: string | null;
  name_key: string | null;
  /** EA's art id for the pack picture and a picture address from the store item (helper 0.11.0+). */
  asset_id?: number | null;
  image_url?: string | null;
  /** When the helper last saw it in the store (helper 0.11.0+; older helpers: the upload time). */
  seen_at?: string | null;
  /** When the helper last matched it to a tile on the Store screen (helper 0.12.1+). */
  shown_at?: string | null;
  description: string | null;
  state: string | null;
  pack_type: string | null;
  coins: number | null;
  points: number | null;
  untradeable: boolean;
  is_player_pick: boolean;
  item_count: number | null;
  gold: number | null;
  silver: number | null;
  bronze: number | null;
  rare: number | null;
  content_type: string | null;
  start_at: string | null;
  end_at: string | null;
  purchase_limit: number | null;
  purchase_count: number | null;
  unopened: boolean;
  odds: PackOdd[];
}

export interface PackPull {
  item_id: number;
  ea_item_id: number;
  item_type: string | null;
  rating: number | null;
  rare_flag: number | null;
  untradeable: boolean;
  pack_id: number | null;
  opened_at: string;
}

const isObj = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2 ** 53 ? v : null);
const count = (v: unknown, max = 1000): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const coins = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 50_000_000 ? v : null);
const rating = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99 ? v : null);
const text = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
const when = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t > Date.UTC(2020, 0, 1) && t < Date.UTC(2040, 0, 1) ? new Date(t).toISOString() : null;
};

function parseOdd(v: unknown): PackOdd | null {
  if (!isObj(v)) return null;
  const odds_text = text(v.odds_text, 40);
  if (!odds_text) return null;
  const p = typeof v.probability === "number" && v.probability >= 0 && v.probability <= 1 ? v.probability : null;
  const rules = Array.isArray(v.rules)
    ? v.rules.filter(isObj).slice(0, 10).flatMap((r) => (typeof r.value === "number" && Number.isFinite(r.value)
      ? [{ type: count(r.type, 10_000) ?? 0, value: r.value, ...(text(r.text) ? { text: text(r.text)! } : {}) }] : []))
    : [];
  return {
    label: text(v.label) ?? "Pack line", odds_text, probability: p, min_rating: rating(v.min_rating), max_rating: rating(v.max_rating),
    special: v.special === true, category_id: count(v.category_id, 1e9), tier_id: count(v.tier_id, 1e9), quality_id: count(v.quality_id, 1e9),
    rarity_asset_id: count(v.rarity_asset_id, 1e9), rules,
  };
}

function parsePack(v: unknown): PackOffer | null {
  if (!isObj(v)) return null;
  const pack_id = id(v.pack_id);
  if (!pack_id) return null;
  return {
    pack_id, name: text(v.name), name_key: text(v.name_key), description: text(v.description, 400), state: text(v.state, 40),
    asset_id: id(v.asset_id), image_url: cleanArtUrl(v.image_url), seen_at: when(v.seen_at), shown_at: when(v.shown_at),
    pack_type: text(v.pack_type, 40), coins: coins(v.coins), points: coins(v.points), untradeable: v.untradeable === true,
    is_player_pick: v.is_player_pick === true, item_count: count(v.item_count, 100), gold: count(v.gold, 100), silver: count(v.silver, 100),
    bronze: count(v.bronze, 100), rare: count(v.rare, 100), content_type: text(v.content_type, 40), start_at: when(v.start_at), end_at: when(v.end_at),
    purchase_limit: count(v.purchase_limit, 1e6), purchase_count: count(v.purchase_count, 1e6), unopened: v.unopened === true,
    odds: (Array.isArray(v.odds) ? v.odds : []).slice(0, MAX_ODDS).map(parseOdd).filter((o): o is PackOdd => !!o),
  };
}

function parsePull(v: unknown): PackPull | null {
  if (!isObj(v)) return null;
  const item_id = id(v.item_id), ea_item_id = id(v.ea_item_id), opened_at = when(v.opened_at);
  if (!item_id || !ea_item_id || !opened_at) return null;
  return { item_id, ea_item_id, item_type: text(v.item_type, 40), rating: rating(v.rating), rare_flag: count(v.rare_flag, 1e6), untradeable: v.untradeable === true, pack_id: id(v.pack_id), opened_at };
}

export interface StoreUpload { platform: "console" | "pc"; captured_at: string; packs: PackOffer[]; pulls: PackPull[]; shape: Row; skipped: number; reset: boolean }

export function parseStoreUpload(raw: unknown): StoreUpload {
  if (!isObj(raw) || raw.format !== "xilab-store-capture") throw new FutError("This isn't a pack store file from the XI Lab helper (format xilab-store-capture).");
  if (raw.version !== 1) throw new FutError("Unknown pack store file version. Update the XI Lab helper.");
  const packsIn = Array.isArray(raw.packs) ? raw.packs : [], pullsIn = Array.isArray(raw.pulls) ? raw.pulls : [];
  if (packsIn.length > MAX_PACKS) throw new FutError(`Send at most ${MAX_PACKS} packs at a time.`);
  if (pullsIn.length > MAX_PULLS) throw new FutError(`Send at most ${MAX_PULLS} pulls at a time.`);
  const packs = packsIn.map(parsePack).filter((p): p is PackOffer => !!p);
  const pulls = pullsIn.map(parsePull).filter((p): p is PackPull => !!p);
  const names = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 60).slice(0, max) : []);
  const shape: Row = isObj(raw.shape) ? Object.fromEntries(["pack_keys", "odds_keys", "category_keys"].map((k) => [k, names((raw.shape as Row)[k], 120)])) : {};
  // Helper 0.7.0+: every store-like answer it saw (address with ids as N, top-level field names, packs and odds read).
  const seenIn = isObj(raw.shape) && Array.isArray((raw.shape as Row).seen) ? ((raw.shape as Row).seen as unknown[]) : [];
  const seen = seenIn.filter(isObj).slice(0, 20).map((x) => ({
    path: text(x.path, 120), keys: names(x.keys, 40), packs: count(x.packs, 10_000) ?? 0, odds: count(x.odds, 100_000) ?? 0, at: when(x.at),
  })).filter((x) => x.path);
  if (seen.length) shape.seen = seen;
  return {
    platform: raw.platform === "pc" ? "pc" : "console", captured_at: when(raw.captured_at) ?? new Date().toISOString(),
    packs, pulls, shape, skipped: packsIn.length - packs.length + pullsIn.length - pulls.length,
    // Helper 0.12.1+: "Clear stored packs" in the popup. Wipes this platform's packs even when the new list is empty.
    reset: raw.reset === true,
  };
}

/** Save an upload: the store list replaces this platform's packs (the helper sends its whole current list); pulls add up. */
export async function importStore(db: FutDb, userId: string, raw: unknown) {
  const u = parseStoreUpload(raw);
  const now = new Date().toISOString();
  if (u.reset && !u.packs.length) {
    fail((await db.from("pack_offers").delete().eq("user_id", userId).eq("platform", u.platform)).error);
    const shape = Array.isArray(u.shape.seen) ? { ...u.shape, seen_at: u.captured_at } : u.shape;
    fail((await db.from("pack_store_captures").upsert({ user_id: userId, platform: u.platform, captured_at: u.captured_at, pack_count: 0, shape }, { onConflict: "user_id,platform" })).error);
  } else if (u.packs.length) {
    fail((await db.from("pack_offers").delete().eq("user_id", userId).eq("platform", u.platform)).error);
    const cap = (t: string | null | undefined) => (t && t <= u.captured_at ? t : null);
    const rows = u.packs.map((p) => ({ user_id: userId, platform: u.platform, ...p, seen_at: cap(p.seen_at) ?? u.captured_at, shown_at: cap(p.shown_at), updated_at: now }));
    for (let i = 0; i < rows.length; i += 200) fail((await db.from("pack_offers").insert(rows.slice(i, i + 200))).error);
    fail((await db.from("pack_store_captures").upsert({ user_id: userId, platform: u.platform, captured_at: u.captured_at, pack_count: u.packs.length, shape: u.shape }, { onConflict: "user_id,platform" })).error);
  } else if (Array.isArray(u.shape.seen)) {
    // Store answers seen but no packs read: keep the packs stored before, update only what the helper saw.
    const prev = await db.from("pack_store_captures").select("captured_at, pack_count, shape").eq("user_id", userId).eq("platform", u.platform).maybeSingle();
    fail(prev.error);
    const p = prev.data as Row | null;
    const shape = { ...(isObj(p?.shape) ? (p!.shape as Row) : {}), seen: u.shape.seen, seen_at: u.captured_at };
    fail((await db.from("pack_store_captures").upsert({ user_id: userId, platform: u.platform, captured_at: p?.captured_at ?? u.captured_at, pack_count: p?.pack_count ?? 0, shape }, { onConflict: "user_id,platform" })).error);
  }
  if (u.pulls.length) {
    const rows = u.pulls.map((p) => ({ user_id: userId, platform: u.platform, ...p }));
    for (let i = 0; i < rows.length; i += 200) fail((await db.from("pack_pulls").upsert(rows.slice(i, i + 200), { onConflict: "user_id,item_id" })).error);
  }
  return { packs: u.packs.length, pulls: u.pulls.length, skipped: u.skipped, platform: u.platform, reset: u.reset, verified: false as const };
}

/** Remove this user's stored packs and pulls on one platform. */
export async function clearStore(db: FutDb, userId: string, platform: "console" | "pc") {
  for (const t of ["pack_offers", "pack_pulls", "pack_store_captures"]) fail((await db.from(t).delete().eq("user_id", userId).eq("platform", platform)).error);
  return { cleared: true };
}

// ------------------------------------------------------------------ value model (pure)

export type Kind = "common" | "rare" | "special";
/** One rating band in one FUT.GG refresh: [overall, kind, cards priced, 25th percentile, median, mean]. */
export type Band = [number, Kind, number, number, number, number];
export interface BandSnapshot { published_at: string; bands: Band[] }

export interface LineValue { low: number; high: number; cards: number }

/** Value of a random card rated lo..hi of these kinds: median-based (typical) and mean-based (with the big pulls). */
export function bandValue(bands: Band[], lo: number, hi: number, kinds: Kind[]): LineValue | null {
  let n = 0, low = 0, high = 0;
  for (const [o, k, c, , med, mean] of bands) {
    if (o < lo || o > hi || !kinds.includes(k) || c <= 0) continue;
    n += c; low += med * c; high += mean * c;
  }
  return n ? { low: low / n, high: high / n, cards: n } : null;
}

/** Ratings a quality covers when a line or pack names gold, silver or bronze but no number. */
const QUALITY: Record<string, [number, number]> = { gold: [75, 99], silver: [65, 74], bronze: [45, 64] };
function qualityOf(label: string): [number, number] | null {
  const m = label.toLowerCase().match(/\b(gold|silver|bronze)\b/);
  return m ? QUALITY[m[1]!]! : null;
}
const rareOnly = (label: string) => /\brare\b/i.test(label) && !/\bnon[- ]?rare\b/i.test(label);

export interface OddsLineResult { label: string; odds_text: string; probability: number | null; covers: string | null; value_low: number | null; value_high: number | null; used: boolean; note?: string }
export interface PackValue {
  ev_low: number | null;
  ev_high: number | null;
  lines: OddsLineResult[];
  fodder_each: number | null;
  fodder_items: number;
  notes: string[];
}

/**
 * Estimated pack value in coins, before tax. Plain lines ("84+ player 15%", "82+ 100%") are read as "chance the best
 * card is at least this good": sorted high to low, each band's value is weighted by the extra chance of landing in it.
 * Special lines (promo, Icon, Hero, TOTW) add their chance times what a special card in that range is worth above
 * fodder. Every other item counts at fodder value for the pack's quality.
 */
export function packValue(p: Pick<PackOffer, "odds" | "item_count" | "gold" | "silver" | "bronze" | "rare">, bands: Band[]): PackValue {
  const notes: string[] = [];
  const lines: OddsLineResult[] = [];
  const range = (o: PackOdd): [number, number] | null => {
    if (o.min_rating) return [o.min_rating, o.max_rating ?? 99];
    return qualityOf(o.label);
  };
  // Fodder: the pack's lowest quality it guarantees items of.
  const floorRange: [number, number] = p.gold ? [75, 79] : p.silver ? [65, 74] : p.bronze ? [45, 64] : [75, 79];
  const commonFodder = bandValue(bands, floorRange[0], floorRange[1], ["common"]) ?? bandValue(bands, floorRange[0], floorRange[1], ["rare", "common"]);
  const rareFodder = bandValue(bands, floorRange[0], floorRange[1], ["rare"]) ?? commonFodder;
  const items = p.item_count ?? ((p.gold ?? 0) + (p.silver ?? 0) + (p.bronze ?? 0) || null);
  if (!items) notes.push("EA didn't say how many items the pack holds; only its odds lines are counted.");

  const plain = p.odds.filter((o) => !o.special && o.probability !== null && range(o));
  const special = p.odds.filter((o) => o.special && o.probability !== null && range(o));
  for (const o of p.odds) {
    if (o.probability === null) lines.push({ label: o.label, odds_text: o.odds_text, probability: null, covers: null, value_low: null, value_high: null, used: false, note: "Couldn't read these odds." });
    else if (!range(o)) lines.push({ label: o.label, odds_text: o.odds_text, probability: o.probability, covers: null, value_low: null, value_high: null, used: false, note: "No rating range in this line, so it isn't priced." });
  }

  // Plain lines, best first. Each band runs up to just below the next better line's minimum.
  const sorted = [...plain].sort((a, b) => range(b)![0] - range(a)![0]);
  let best = null as { low: number; high: number } | null;
  let cum = 0, upper = 99;
  for (const o of sorted) {
    const [lo, hiRaw] = range(o)!;
    const hi = Math.min(hiRaw, upper);
    const kinds: Kind[] = rareOnly(o.label) ? ["rare"] : ["rare", "common"];
    const v = hi >= lo ? bandValue(bands, lo, hi, kinds) : null;
    const pr = Math.max(cum, Math.min(1, o.probability!));
    const extra = pr - cum;
    lines.push({ label: o.label, odds_text: o.odds_text, probability: o.probability, covers: `${lo}${hi > lo ? `-${hi}` : ""}`, value_low: v?.low ?? null, value_high: v?.high ?? null, used: !!v, ...(v ? {} : { note: "No priced cards in this range." }) });
    if (v) {
      best = { low: (best?.low ?? 0) + extra * v.low, high: (best?.high ?? 0) + extra * v.high };
      cum = pr;
    }
    upper = lo - 1;
  }
  // The rest of the chance: the best card is fodder.
  if (best && cum < 1 && rareFodder) best = { low: best.low + (1 - cum) * rareFodder.low, high: best.high + (1 - cum) * rareFodder.high };

  // Special lines add upside above fodder.
  let upLow = 0, upHigh = 0;
  for (const o of special) {
    const [lo, hi] = range(o)!;
    const v = bandValue(bands, lo, hi, ["special"]);
    lines.push({ label: o.label, odds_text: o.odds_text, probability: o.probability, covers: `${lo}${hi > lo ? `-${hi}` : ""} special`, value_low: v?.low ?? null, value_high: v?.high ?? null, used: !!v, ...(v ? {} : { note: "No priced special cards in this range." }) });
    if (v) {
      upLow += o.probability! * Math.max(0, v.low - (rareFodder?.low ?? 0));
      upHigh += o.probability! * Math.max(0, v.high - (rareFodder?.high ?? 0));
    }
  }

  const rares = p.rare ?? 0;
  const restItems = Math.max(0, (items ?? 0) - (best ? 1 : 0));
  const restRares = Math.max(0, rares - (best ? 1 : 0));
  const restCommon = Math.max(0, restItems - restRares);
  const fodderLow = restRares * (rareFodder?.low ?? 0) + restCommon * (commonFodder?.low ?? 0);
  const fodderHigh = restRares * (rareFodder?.high ?? 0) + restCommon * (commonFodder?.high ?? 0);
  if (!plain.length && !special.length) notes.push("No odds lines with a rating range: open this pack's odds in the Store so the helper can read them.");
  if (!rareFodder) notes.push("No fodder prices for this pack's quality yet.");
  // Without EA's odds there's nothing to judge the pack on: fodder alone would undersell it.
  const anything = p.odds.length > 0 && (best || upLow || (restItems && rareFodder));
  return {
    ev_low: anything ? Math.round((best?.low ?? 0) + upLow + fodderLow) : null,
    ev_high: anything ? Math.round((best?.high ?? 0) + upHigh + fodderHigh) : null,
    lines, fodder_each: rareFodder ? Math.round(rareFodder.low) : null, fodder_items: restItems, notes,
  };
}

export type Verdict = "buy" | "only_for_fodder" | "skip" | "points_only" | "no_odds" | "no_prices";

export function verdictFor(p: Pick<PackOffer, "coins" | "points" | "untradeable">, v: PackValue): { verdict: Verdict; ratio: number | null; why: string } {
  if (v.ev_low === null || v.ev_high === null) {
    return v.lines.length ? { verdict: "no_prices", ratio: null, why: "There aren't enough FUT.GG prices for the cards in this pack's odds yet." }
      : { verdict: "no_odds", ratio: null, why: "The helper hasn't seen this pack's odds. Open the pack's odds (Pack Probability) in the Web App Store." };
  }
  if (!p.coins) return { verdict: "points_only", ratio: null, why: p.points ? "FC Points only. Compare value per 100 points with other points packs." : "No coin price in the store." };
  const net = p.untradeable ? 1 : 1 - EA_TAX;
  // Judged on the typical pack (band medians): EA's odds inside a band lean to its cheaper cards, so the mean-based
  // average is the optimistic case, shown alongside but never enough on its own to call a pack worth buying.
  const typical = (v.ev_low * net) / p.coins, withLuck = (v.ev_high * net) / p.coins;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const both = `about ${pct(typical)} of the price in a typical pack, ${pct(withLuck)} on average with the big pulls`;
  if (p.untradeable) {
    return typical >= 0.75
      ? { verdict: "only_for_fodder", ratio: typical, why: `Untradeable, so you can't sell what you pull. If you'd otherwise buy these cards for SBCs, they're worth ${both}.` }
      : { verdict: "skip", ratio: typical, why: `Untradeable, and even as SBC fodder the cards are worth ${both}.` };
  }
  if (typical >= 1) return { verdict: "buy", ratio: typical, why: `Expected to return ${both}, after EA's tax.` };
  if (typical >= 0.75 || withLuck >= 1) return { verdict: "only_for_fodder", ratio: typical, why: `Returns ${both}, after tax. Worth it only if you need the fodder for SBCs or want the gamble.` };
  return { verdict: "skip", ratio: typical, why: `Returns ${both}, after tax. You lose coins on most openings.` };
}

/** Next Friday 18:00 UK time (the usual promo release slot), as epoch ms. Handles BST/GMT. */
export function nextPromoSlot(now: number): number {
  const ukOffsetHours = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
    const h = Number(parts.find((x) => x.type === "hour")?.value ?? new Date(t).getUTCHours());
    return (h - new Date(t).getUTCHours() + 24) % 24;
  };
  const d = new Date(now);
  for (let i = 0; i < 8; i++) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i, 18));
    if (day.getUTCDay() !== 5) continue;
    const t = day.getTime() - ukOffsetHours(day.getTime()) * 3_600_000;
    if (t > now) return t;
  }
  return now + 7 * 86_400_000;
}

export interface TimingInput { now: number; ev_series: { at: string; ev: number }[]; end_at: string | null; start_at: string | null; purchase_limit: number | null; purchase_count: number | null; has_special: boolean; verdict: Verdict }

/** "When" advice: value trend over the last days, store window, purchase limit and the weekly promo slot. */
export function timingFor(t: TimingInput): { trend_pct: number | null; tips: string[] } {
  const tips: string[] = [];
  let trend_pct: number | null = null;
  const latest = t.ev_series.at(-1);
  if (latest) {
    const cutoff = Date.parse(latest.at) - 3 * 86_400_000;
    const before = t.ev_series.filter((x) => Date.parse(x.at) <= cutoff);
    const base = before.length ? before.reduce((s, x) => s + x.ev, 0) / before.length : null;
    if (base && base > 0) {
      trend_pct = Math.round(((latest.ev - base) / base) * 1000) / 10;
      if (trend_pct >= 5) tips.push(`Pack value is up ${trend_pct}% on 3+ days ago: the cards inside are selling for more. A good time to open packs you already have and sell what you pull.`);
      else if (trend_pct <= -5) tips.push(`Pack value is down ${Math.abs(trend_pct)}% on 3+ days ago: prices are falling. Hold stored packs until prices recover, and sell anything you pull quickly.`);
      else tips.push("Pack value has been steady over the last few days.");
    }
  }
  const ends = t.end_at ? Date.parse(t.end_at) - t.now : null;
  if (ends !== null && ends > 0 && ends < 72 * 3_600_000) tips.push(`Leaves the store in ${ends < 3_600_000 ? `${Math.max(1, Math.round(ends / 60_000))} min` : `${Math.round(ends / 3_600_000)} h`}.`);
  const starts = t.start_at ? Date.parse(t.start_at) - t.now : null;
  if (starts !== null && starts > 0) tips.push(`Not on sale yet: arrives in ${Math.round(starts / 3_600_000)} h.`);
  if (t.purchase_limit) tips.push(`Limited to ${t.purchase_limit}${t.purchase_count !== null ? `; you've bought ${t.purchase_count}` : ""}.`);
  if (t.has_special) {
    const slot = nextPromoSlot(t.now), hoursTo = (slot - t.now) / 3_600_000, sinceLast = 168 - hoursTo;
    if (hoursTo <= 30) tips.push(`A new promo usually lands Friday 6pm UK, in about ${Math.round(hoursTo)} h. If you want the new cards in the pool, wait for it.`);
    else if (sinceLast <= 24) tips.push("A promo landed in the last day: the new cards are in the pool, and older cards often dip in price, so sell pulls quickly.");
  }
  if (t.verdict === "skip") tips.push("At these prices it's cheaper to buy the cards you want on the market.");
  return { trend_pct, tips };
}

// ------------------------------------------------------------------ advice (reads the database)

const bandCache = new Map<string, { at: number; data: BandSnapshot[] }>();
const BAND_TTL_MS = 15 * 60_000;

/** Rating-band prices for the last week of FUT.GG refreshes (cached for 15 min; shared by all users). */
export async function valueBands(db: FutDb, platform: "console" | "pc", now = Date.now()): Promise<BandSnapshot[]> {
  const hit = bandCache.get(platform);
  if (hit && now - hit.at < BAND_TTL_MS) return hit.data;
  const { data, error } = await db.rpc("pack_value_bands", { p_platform: platform, p_days: 8 });
  if (error) throw new FutError(`Pack prices are unavailable: ${error.message}`, 500);
  const snaps = Array.isArray((data as Row | null)?.snapshots) ? ((data as Row).snapshots as BandSnapshot[]) : [];
  bandCache.set(platform, { at: now, data: snaps });
  return snaps;
}
export const forgetValueBands = () => bandCache.clear();

/** A pack missing from the latest store list by more than this is no longer live. */
export const STORE_GONE_MS = 2 * 3_600_000;
const NOT_LIVE_STATE = /expired|unavailable|inactive|disabled|ended|sold.?out|locked|hidden|retired/i;

/**
 * Live in the store now: not owned-only, started and not ended, buyable, and in the newest store list the helper saw.
 * The FC 27 store data lists more packs than the Store screen shows (Jeff, 2026-11-11), so once the helper has matched
 * any pack to a Store tile (newestShown > 0), only packs shown on the screen around the same time count.
 */
export function liveInStore(p: Pick<PackOffer, "unopened" | "start_at" | "end_at" | "state" | "coins" | "points" | "seen_at" | "shown_at">, newestSeen: number, now: number, newestShown = 0): boolean {
  if (p.unopened) return false;
  if (p.end_at && Date.parse(p.end_at) <= now) return false;
  if (p.start_at && Date.parse(p.start_at) > now) return false;
  if (p.state && NOT_LIVE_STATE.test(p.state)) return false;
  if (!p.coins && !p.points) return false;
  if (newestShown) {
    const shown = Date.parse(String(p.shown_at ?? "")) || 0;
    if (shown < newestShown - STORE_GONE_MS) return false;
  }
  const seen = Date.parse(String(p.seen_at ?? "")) || 0;
  return !newestSeen || seen >= newestSeen - STORE_GONE_MS;
}

/** Gold, silver, bronze or mixed, from what the pack holds (for the pack tile and the fallback name). */
export function packQuality(p: Pick<PackOffer, "gold" | "silver" | "bronze" | "pack_type">): "gold" | "silver" | "bronze" | "mixed" {
  const g = p.gold ?? 0, si = p.silver ?? 0, b = p.bronze ?? 0;
  if (g && !si && !b) return "gold";
  if (si && !g && !b) return "silver";
  if (b && !g && !si) return "bronze";
  const t = (p.pack_type ?? "").toLowerCase();
  return t.includes("gold") ? "gold" : t.includes("silver") ? "silver" : t.includes("bronze") ? "bronze" : "mixed";
}

/**
 * The name to show: EA's own when the helper read it, else words from EA's text key ("FUT_STORE_PACK_GOLD_RARE_NAME"
 * reads "Gold Rare"), else what the pack holds ("Gold pack, 12 items, 3 rare"). Never just the id number.
 */
export function packName(p: Pick<PackOffer, "pack_id" | "name" | "name_key" | "gold" | "silver" | "bronze" | "pack_type" | "item_count" | "rare" | "untradeable" | "is_player_pick">): string {
  if (p.name) return p.name;
  const words = (p.name_key ?? "").replace(/^(?:FUT_)?(?:STORE_)?(?:PACK_)?/i, "").replace(/_(?:NAME|TITLE)$/i, "")
    .split(/[_.\s-]+/).filter((w) => w && !/^\d+$/.test(w) && !/^(?:fut|store|pack|name|loc)$/i.test(w));
  if (words.length) return words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  const q = packQuality(p);
  const kind = p.is_player_pick ? "Player pick" : `${q === "mixed" ? "Mixed" : q[0]!.toUpperCase() + q.slice(1)} pack`;
  const bits = [p.item_count ? `${p.item_count} items` : null, p.rare ? `${p.rare} rare` : null, p.untradeable ? "untradeable" : null].filter(Boolean);
  return bits.length ? `${kind}, ${bits.join(", ")}` : `${kind} ${p.pack_id}`;
}

/** EA pack pictures the Web App loaded (shared card art addresses with "pack" in the path), newest first. */
async function packPictures(db: FutDb): Promise<string[]> {
  const { data, error } = await db.from("ea_card_art").select("url").ilike("url", "%pack%").order("last_seen_at", { ascending: false }).limit(500);
  if (error) return []; // pictures are a nicety: never fail the advice for them
  return ((data ?? []) as { url: string }[]).map((r) => r.url);
}

/** The picture whose file name carries the pack's art id (or else its pack id) as a whole number. */
export function pictureFor(p: Pick<PackOffer, "pack_id" | "asset_id">, urls: string[]): string | null {
  for (const want of [p.asset_id, p.pack_id]) {
    if (!want) continue;
    const hit = urls.find((u) => (u.split("/").pop() ?? "").match(/\d+/g)?.includes(String(want)));
    if (hit) return hit;
  }
  return null;
}

const VERDICT_ORDER: Verdict[] = ["buy", "only_for_fodder", "points_only", "skip", "no_prices", "no_odds"];

export async function packAdvice(db: FutDb, userId: string, platform: "console" | "pc", now = Date.now()) {
  const [packsRes, capRes, pullsRes] = await Promise.all([
    db.from("pack_offers").select("*").eq("user_id", userId).eq("platform", platform),
    db.from("pack_store_captures").select("captured_at, pack_count, shape").eq("user_id", userId).eq("platform", platform).maybeSingle(),
    db.from("pack_pulls").select("item_id, ea_item_id, rating, untradeable, pack_id, opened_at, item_type").eq("user_id", userId).eq("platform", platform).order("opened_at", { ascending: false }).limit(MAX_PULLS),
  ]);
  fail(packsRes.error); fail(capRes.error); fail(pullsRes.error);
  const packs = (packsRes.data ?? []) as (PackOffer & Row)[];
  // Only packs live in the store now (Jeff, 2026-11-11): not ended, started, buyable, and in the latest store list.
  const newestSeen = packs.reduce((m, p) => Math.max(m, Date.parse(String(p.seen_at ?? "")) || 0), 0);
  const newestShown = packs.reduce((m, p) => Math.max(m, Date.parse(String(p.shown_at ?? "")) || 0), 0);
  const live = packs.filter((p) => liveInStore(p, newestSeen, now, newestShown));
  const hidden = packs.length - live.length;
  const pictures = live.length ? await packPictures(db) : [];
  const snaps = packs.length || (pullsRes.data ?? []).length ? await valueBands(db, platform, now) : [];
  const latest = snaps.at(-1);

  const advice = live.map((p) => {
    const odds = Array.isArray(p.odds) ? (p.odds as PackOdd[]) : [];
    const pack = { ...p, odds };
    const value = latest ? packValue(pack, latest.bands) : { ev_low: null, ev_high: null, lines: [], fodder_each: null, fodder_items: 0, notes: ["No FUT.GG prices yet."] };
    const v = verdictFor(pack, value);
    const ev_series = snaps.map((s) => ({ at: s.published_at, ev: packValue(pack, s.bands).ev_high })).filter((x): x is { at: string; ev: number } => x.ev !== null);
    const timing = timingFor({ now, ev_series, end_at: p.end_at, start_at: p.start_at, purchase_limit: p.purchase_limit, purchase_count: p.purchase_count, has_special: odds.some((o) => o.special), verdict: v.verdict });
    return {
      pack_id: p.pack_id, name: packName(p), named: !!p.name, description: p.description, coins: p.coins, points: p.points,
      image_url: p.image_url ?? pictureFor(p, pictures), quality: packQuality(p),
      untradeable: p.untradeable, is_player_pick: p.is_player_pick, item_count: p.item_count, rare: p.rare, end_at: p.end_at, start_at: p.start_at, unopened: p.unopened,
      ev_low: value.ev_low, ev_high: value.ev_high, ev_after_tax: value.ev_high === null ? null : Math.round(value.ev_high * (p.untradeable ? 1 : 1 - EA_TAX)),
      value_per_100_points: p.points && value.ev_high !== null ? Math.round((value.ev_high * (p.untradeable ? 1 : 1 - EA_TAX)) / (p.points / 100)) : null,
      ...v, lines: value.lines, notes: value.notes, fodder_each: value.fodder_each, fodder_items: value.fodder_items,
      trend_pct: timing.trend_pct, tips: timing.tips, history: ev_series.map((x) => ({ t: x.at, value: x.ev })),
    };
  }).sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) || (b.ratio ?? -1) - (a.ratio ?? -1) || (b.value_per_100_points ?? -1) - (a.value_per_100_points ?? -1));

  return {
    platform, captured_at: capRes.data?.captured_at ?? null, shape: capRes.data?.shape ?? null, hidden,
    prices_at: latest?.published_at ?? null, packs: advice,
    pulls: await pullSummary(db, platform, (pullsRes.data ?? []) as PackPull[], new Map(packs.map((p) => [Number(p.pack_id), p]))),
    model: [
      "EA lists the chance of getting at least one card of each kind. The best card is assumed to sit in the highest line it hit, and every other item is fodder for the pack's quality.",
      "Card values are FUT.GG's latest prices for every card in each rating band: the typical figure uses each band's median, the average uses its mean (so it counts the rare big pull).",
      "Tradeable packs are judged after EA's 5% sales tax. Cheap fodder often doesn't sell at its listed price, so real returns are usually lower.",
      "Untradeable packs can't be sold, so their value only counts if you'd otherwise buy those cards for SBCs.",
    ],
    verified: false as const,
  };
}

/** What the user's own pack openings returned, valued at the latest FUT.GG price of each pulled card. */
async function pullSummary(db: FutDb, platform: "console" | "pc", pulls: PackPull[], packs: Map<number, Row>) {
  if (!pulls.length) return { opens: [], items: 0 };
  const ids = [...new Set(pulls.map((p) => p.ea_item_id))];
  const { data: snap, error: e1 } = await db.from("futgg_snapshots").select("published_at").eq("game_year", 27).eq("platform", platform).order("published_at", { ascending: false }).limit(1).maybeSingle();
  fail(e1);
  const price = new Map<number, number>();
  if (snap?.published_at) {
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await db.from("futgg_prices").select("ea_item_id, price").eq("game_year", 27).eq("platform", platform).eq("published_at", snap.published_at).in("ea_item_id", ids.slice(i, i + 300));
      fail(error);
      for (const r of (data ?? []) as Row[]) if (typeof r.price === "number") price.set(Number(r.ea_item_id), r.price);
    }
  }
  // One opening = one pack id within the same minute.
  const opens = new Map<string, { pack_id: number | null; opened_at: string; items: number; tradeable_value: number; untradeable_value: number; best: { ea_item_id: number; rating: number | null; price: number | null } | null }>();
  for (const p of pulls) {
    const key = `${p.pack_id ?? "?"}|${p.opened_at.slice(0, 16)}`;
    const o = opens.get(key) ?? { pack_id: p.pack_id, opened_at: p.opened_at, items: 0, tradeable_value: 0, untradeable_value: 0, best: null };
    const v = price.get(p.ea_item_id) ?? null;
    o.items++;
    if (v) { if (p.untradeable) o.untradeable_value += v; else o.tradeable_value += v; }
    if (!o.best || (v ?? 0) > (o.best.price ?? 0)) o.best = { ea_item_id: p.ea_item_id, rating: p.rating, price: v };
    opens.set(key, o);
  }
  return {
    items: pulls.length,
    opens: [...opens.values()].sort((a, b) => b.opened_at.localeCompare(a.opened_at)).slice(0, 50).map((o) => {
      const pack = o.pack_id ? packs.get(o.pack_id) : undefined;
      const cost = pack?.coins ? Number(pack.coins) : null;
      return { ...o, pack_name: pack ? packName(pack as unknown as PackOffer) : o.pack_id ? `Pack ${o.pack_id}` : "Unknown pack", pack_coins: cost,
        after_tax: Math.round(o.tradeable_value * (1 - EA_TAX)), profit: cost ? Math.round(o.tradeable_value * (1 - EA_TAX)) - cost : null };
    }),
  };
}
