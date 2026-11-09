// Full card stats for the market-wide card list (Player Ratings and the player finder): face stats, all in-game
// attributes, weak foot, skill moves, foot, height, AcceleRATE, alternative positions, PlayStyles and Roles.
// FUT.GG's public files only carry overall and position, so this reads FUT.GG's card page data one card at a time
// (the same JSON its player pages load). The bot's scheduler runs it every 15 minutes (fut-api job
// "futgg-attributes"); each run fetches a few hundred cards, so the whole list fills in within a few hours and after
// that only new cards and dynamic (upgradeable) cards are fetched again. FUTGG_ATTRIBUTES=off pauses it.
import { DETAIL_STATS, FACE_STATS, PLAYSTYLES } from "./stats.ts";
import { FutError, type FutDb } from "./service.ts";
import { EA_POSITIONS, type Fetcher } from "./futgg-catalogue.ts";

const FUTGG_R2 = "https://r2.fut.gg/27";
const CARD_URL = (id: number) => `https://www.fut.gg/api/fut/player-item-definitions/27/${id}/`;
type Json = Record<string, unknown>;

export interface CardStats {
  ea_item_id: number;
  /** false when FUT.GG has no page for the card; it's checked again in a month. */
  found: boolean;
  pac?: number | null; sho?: number | null; pas?: number | null; dri?: number | null; def?: number | null; phy?: number | null;
  detail?: Record<string, number>;
  skill_moves?: number | null; weak_foot?: number | null; foot?: "left" | "right" | null; height_cm?: number | null;
  accelerate_type?: string | null; alt_positions?: string[]; total_igs?: number | null; is_dynamic?: boolean;
  playstyles?: string[]; playstyles_plus?: string[];
  roles?: { position: string; role: string; level: "plus" | "plusplus" }[];
}

/** Names for PlayStyle and Role ids, from FUT.GG's public files. */
export interface FutggNames { playstyles: Map<number, string>; roles: Map<number, { position: string; role: string; level: "plus" | "plusplus" }> }

const stat = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
};
const small = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Pure: one FUT.GG card definition into the stats we store. */
export function parseCardDefinition(raw: unknown, names: FutggNames): CardStats | null {
  const d = (raw && typeof raw === "object" ? (raw as Json).data : null) as Json | null;
  if (!d || typeof d !== "object" || !Number.isSafeInteger(d.eaId)) return null;
  const detail: Record<string, number> = {};
  for (const s of DETAIL_STATS) { const v = stat(d[s.futgg!]); if (v !== null) detail[s.key] = v; }
  const face = Object.fromEntries(FACE_STATS.map((s) => [s.key, stat(d[s.futgg!])])) as Record<"pac" | "sho" | "pas" | "dri" | "def" | "phy", number | null>;
  const ids = (v: unknown) => Array.isArray(v) ? v.filter((x): x is number => Number.isSafeInteger(x)) : [];
  const styleNames = (v: unknown) => [...new Set(ids(v).map((i) => names.playstyles.get(i)).filter((n): n is string => !!n))];
  const plus = styleNames(d.playstylesPlus);
  const roles: CardStats["roles"] = [];
  for (const [list, level] of [[d.rolesPlusPlus, "plusplus"], [d.rolesPlus, "plus"]] as const) {
    for (const id of ids(list)) {
      const r = names.roles.get(id);
      if (r && r.level === level && !roles.some((x) => x.position === r.position && x.role === r.role)) roles.push(r);
    }
  }
  const primary = EA_POSITIONS[Number(d.position)];
  const accel = typeof d.accelerateType === "string" && /^[A-Z_]{3,30}$/.test(d.accelerateType) ? d.accelerateType : null;
  return {
    ea_item_id: Number(d.eaId), found: true, ...face, detail,
    skill_moves: small(d.skillMoves, 1, 5), weak_foot: small(d.weakFoot, 1, 5),
    // FUT.GG card definitions: 1 = right foot, 2 = left foot
    foot: d.foot === 1 ? "right" : d.foot === 2 ? "left" : null,
    height_cm: small(d.height, 140, 220),
    accelerate_type: accel,
    alt_positions: [...new Set(ids(d.alternativePositionIds).map((p) => EA_POSITIONS[p]).filter((p): p is string => !!p && p !== primary))].slice(0, 4),
    total_igs: small(d.totalIgs, 1, 4000),
    is_dynamic: d.hasDynamic === true,
    playstyles: styleNames(d.playstyles).filter((n) => !plus.includes(n)),
    playstyles_plus: plus,
    roles,
  };
}

/** Pure: PlayStyle names by EA id and Role names by EA id (with position and plus level). */
export function buildNames(playstyles: unknown, core: unknown): FutggNames {
  const out: FutggNames = { playstyles: new Map(), roles: new Map() };
  const known = new Map(PLAYSTYLES.map((p) => [p.toLowerCase(), p]));
  if (Array.isArray(playstyles)) for (const p of playstyles as Json[]) {
    if (Number.isSafeInteger(p?.eaId) && typeof p.name === "string") out.playstyles.set(Number(p.eaId), known.get(p.name.toLowerCase()) ?? p.name.slice(0, 40));
  }
  const roles = (core && typeof core === "object" ? (core as Json).roles : null);
  if (Array.isArray(roles)) for (const r of roles as Json[]) {
    if (!Number.isSafeInteger(r?.eaId) || typeof r.positionName !== "string") continue;
    const level = r.isPlusPlus === true ? "plusplus" : r.isPlus === true ? "plus" : null;
    const role = typeof r.cleanName === "string" ? r.cleanName : typeof r.name === "string" ? r.name.replace(/\+*$/, "") : "";
    if (level && role) out.roles.set(Number(r.eaId), { position: r.positionName, role: role.slice(0, 40), level });
  }
  return out;
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const res = await fetcher(url);
  if (!res.ok) throw new FutError(`${new URL(url).host} returned HTTP ${res.status}`, 502);
  return await res.json();
}

export async function loadNames(fetcher: Fetcher): Promise<FutggNames> {
  const manifest = await getJson(fetcher, `${FUTGG_R2}/manifest.json`) as Json;
  const file = (name: string) => {
    const hash = manifest[name], version = manifest._version;
    if (!Number.isSafeInteger(version) || typeof hash !== "string" || !/^[a-f0-9]+$/.test(hash)) throw new FutError(`FUT.GG manifest has no ${name}`, 502);
    return `${FUTGG_R2}/${name}.v${version}.${hash}.json`;
  };
  const [playstyles, core] = await Promise.all([getJson(fetcher, file("play-styles")), getJson(fetcher, file("fc-core-data"))]);
  return buildNames(playstyles, core);
}

export interface AttributesResult { queued: number; fetched: number; saved: number; missing: number; failed: number; stopped: string | null; remaining: number }

export interface AttributeOptions { batch?: number; concurrency?: number; budgetMs?: number; pauseMs?: number; now?: () => number }

/**
 * One run: takes the cards that most need stats (no stats yet first, then stale dynamic cards), fetches them a couple
 * at a time with a short pause, and saves every 50. Stops early when FUT.GG says no (403/429) or the time is up.
 */
export async function syncFutggAttributes(db: FutDb, fetcher: Fetcher = defaultFetcher, opts: AttributeOptions = {}): Promise<AttributesResult> {
  const now = opts.now ?? Date.now, started = now();
  const budget = opts.budgetMs ?? 200_000, pause = opts.pauseMs ?? 250, conc = Math.max(1, Math.min(4, opts.concurrency ?? 2));
  const { data: queueData, error } = await db.rpc("futgg_attribute_queue", { p_limit: opts.batch ?? 1200 });
  if (error) throw new FutError(`Stats queue failed: ${error.message}`, 500);
  const queue = ((queueData as { ids?: unknown[] } | null)?.ids ?? []).map(Number).filter(Number.isSafeInteger);
  const remainingBefore = Number((queueData as { waiting?: unknown } | null)?.waiting ?? queue.length);
  const result: AttributesResult = { queued: queue.length, fetched: 0, saved: 0, missing: 0, failed: 0, stopped: null, remaining: remainingBefore };
  if (!queue.length) return result;
  const names = await loadNames(fetcher);
  let pending: CardStats[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending; pending = [];
    const { data, error } = await db.rpc("upsert_futgg_attributes", { p_cards: batch });
    if (error) throw new FutError(`Stats save failed: ${error.message}`, 500);
    result.saved += Number(data ?? 0);
  };
  let next = 0, failedInARow = 0;
  const worker = async () => {
    while (!result.stopped && next < queue.length) {
      if (now() - started > budget) { result.stopped ??= "time"; break; }
      const id = queue[next++]!;
      let res: Response;
      try { res = await fetcher(CARD_URL(id)); } catch { result.failed++; if (++failedInARow >= 10) result.stopped ??= "network"; continue; }
      if (res.status === 403 || res.status === 429) { result.stopped ??= `FUT.GG answered HTTP ${res.status}`; await res.body?.cancel(); break; }
      if (res.status === 404) { await res.body?.cancel(); pending.push({ ea_item_id: id, found: false }); result.missing++; failedInARow = 0; }
      else if (!res.ok) { await res.body?.cancel(); result.failed++; if (++failedInARow >= 10) result.stopped ??= `FUT.GG answered HTTP ${res.status}`; }
      else {
        const parsed = parseCardDefinition(await res.json().catch(() => null), names);
        if (parsed && parsed.ea_item_id === id) { pending.push(parsed); result.fetched++; failedInARow = 0; } else result.failed++;
      }
      if (pending.length >= 50) await flush();
      if (pause) await new Promise((r) => setTimeout(r, pause));
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  await flush();
  result.remaining = Math.max(0, remainingBefore - result.fetched - result.missing);
  return result;
}

const defaultFetcher: Fetcher = (u) => fetch(u, {
  headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; XI-Lab-Card-Stats/1.0)" },
  signal: AbortSignal.timeout(20_000),
});
