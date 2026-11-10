// SBC Solver data: the user's club, spare duplicates and market cards as solver cards, the SBC sets and challenges
// the helper saw, and reward values. The solving itself is pure code in ./sbc.ts.
import { activeRules, fail, FutError, searchMyCards, type FutDb } from "./service.ts";
import { packAdvice } from "./packs.ts";
import type { SbcChallenge, SbcSet, UnassignedItem } from "./account.ts";
import {
  cleanRequirements, describe, formationFromEa, fromEa, parseRequirements, solveMany, worthIt,
  type EaNames, type Requirement, type SbcCard, type SolveOptions,
} from "./sbc.ts";
import { FORMATIONS } from "./xilab/workspace/index.ts";

type Row = Record<string, unknown>;
type Platform = "console" | "pc";

const MAX_CHALLENGES = 10;

/** Requirement names the solver can look up cheap market cards for. */
const namesIn = (reqs: Requirement[]) => [...new Set(reqs.flatMap((r) => (r.kind === "from" ? r.names : [])))].slice(0, 30);

async function cardPool(db: FutDb, platform: Platform, ids: number[], names: string[]) {
  const { data, error } = await db.rpc("sbc_card_pool", { p_platform: platform, p_ids: ids.slice(0, 1000), p_names: names, p_per_rating: 12 });
  if (error) throw new FutError(`Market cards are unavailable: ${error.message}`, 500);
  const d = (data ?? {}) as Row;
  return { published_at: (d.published_at as string | null) ?? null, market: ((d.market ?? []) as Row[]), items: ((d.items ?? []) as Row[]) };
}

const fromCatalogue = (r: Row, source: SbcCard["source"], untradeable: boolean, id?: string): SbcCard => ({
  id: id ?? `market:${r.ea_item_id}`, name: String(r.player_name ?? `Card ${r.ea_item_id}`), rating: Number(r.overall),
  positions: Array.isArray(r.positions) ? (r.positions as string[]) : [], league: (r.league as string) ?? null, nation: (r.nation as string) ?? null,
  club: (r.club as string) ?? null, version: (r.version as string) ?? null, is_icon: r.is_icon === true, is_hero: r.is_hero === true,
  source, untradeable, price: typeof r.price === "number" ? r.price : null, ea_item_id: Number(r.ea_item_id) || null,
});

/** Everything the solver can pick from: club cards, spare duplicates from the unassigned pile, and market cards. */
export async function sbcPool(db: FutDb, userId: string, platform: Platform, reqs: Requirement[]) {
  const [mine, state] = await Promise.all([
    searchMyCards(db, userId, { all: true, owned_only: true }),
    db.from("account_state").select("unassigned").eq("user_id", userId).eq("platform", platform).maybeSingle(),
  ]);
  fail(state.error);
  const spares = (((state.data as Row | null)?.unassigned ?? []) as UnassignedItem[]).filter((u) => u.duplicate && (u.item_type ?? "player") === "player");
  const ids = [...new Set([...mine.map((c) => c.ea_item_id).filter((x): x is number => !!x), ...spares.map((s) => s.ea_item_id)])];
  const pool = await cardPool(db, platform, ids, namesIn(reqs));
  const cat = new Map(pool.items.map((r) => [Number(r.ea_item_id), r]));
  const cards: SbcCard[] = [];
  for (const c of mine) {
    const ref = c.ea_item_id ? cat.get(c.ea_item_id) : undefined;
    cards.push({
      id: c.id, name: c.player_name, rating: c.overall, positions: c.positions, league: c.league, nation: c.nation, club: c.club,
      // The catalogue's version name ("Team of the Week") says more than the club file's rareflag.
      version: (ref?.version as string | undefined) ?? c.version, is_icon: c.is_icon, is_hero: c.is_hero,
      source: "owned", untradeable: c.tradeable === false, price: typeof ref?.price === "number" ? ref.price : null, ea_item_id: c.ea_item_id,
    });
  }
  spares.forEach((s, i) => {
    const ref = cat.get(s.ea_item_id);
    if (ref && ref.overall) cards.push(fromCatalogue(ref, "spare", s.untradeable, `spare:${s.item_id ?? i}`));
  });
  const ownedIds = new Set(cards.map((c) => c.ea_item_id));
  for (const r of pool.market) if (!ownedIds.has(Number(r.ea_item_id))) cards.push(fromCatalogue(r, "buy", false));
  return { cards, prices_at: pool.published_at, owned: mine.length, spares: spares.length };
}

async function eaNames(db: FutDb, challenges: SbcChallenge[]): Promise<EaNames> {
  const want = { leagues: new Set<number>(), nations: new Set<number>(), clubs: new Set<number>() };
  for (const c of challenges) for (const r of c.requirements) {
    const t = r.type === "LEAGUE_ID" ? "leagues" : r.type === "NATION_ID" ? "nations" : r.type === "CLUB_ID" ? "clubs" : null;
    if (t) for (const v of r.values) want[t].add(v);
  }
  const out: EaNames = { leagues: new Map(), nations: new Map(), clubs: new Map() };
  for (const t of ["leagues", "nations", "clubs"] as const) {
    const ids = [...want[t]].slice(0, 200);
    if (!ids.length) continue;
    const { data, error } = await db.from(t).select("ea_id, name").in("ea_id", ids);
    fail(error);
    for (const r of (data ?? []) as Row[]) if (typeof r.name === "string") out[t].set(Number(r.ea_id), r.name);
  }
  return out;
}

/** The SBC sets and the challenges the helper saw, each challenge with its requirements read into our list. */
export async function sbcOverview(db: FutDb, userId: string, platform: Platform) {
  const { data, error } = await db.from("account_state").select("sbcs, sbcs_at, sbc_challenges, sbc_challenges_at, shape").eq("user_id", userId).eq("platform", platform).maybeSingle();
  fail(error);
  const s = (data ?? null) as Row | null;
  const sets = ((s?.sbcs ?? []) as SbcSet[]);
  const challenges = ((s?.sbc_challenges ?? []) as SbcChallenge[]);
  const names = await eaNames(db, challenges);
  const read = challenges.map((c) => {
    const { requirements, unread } = fromEa(c.requirements, names);
    return {
      set_id: c.set_id, challenge_id: c.challenge_id, name: c.name, description: c.description, status: c.status,
      formation: formationFromEa(c.formation), ea_formation: c.formation, requirements, lines: requirements.map(describe), unread, awards: c.awards,
    };
  });
  const open = (x: SbcSet) => !(x.times_completed && !x.repeatable) && !(x.repeat_limit && (x.times_completed ?? 0) >= x.repeat_limit);
  return {
    platform, sets_at: (s?.sbcs_at as string | null) ?? null, challenges_at: (s?.sbc_challenges_at as string | null) ?? null,
    sets: sets.filter(open).map((x) => ({ ...x, challenges_seen: read.filter((c) => c.set_id === x.set_id) })),
    other_challenges: read.filter((c) => !sets.some((x) => x.set_id === c.set_id)),
    shape: { challenge: ((s?.shape as Row | null)?.sbc_challenge ?? null) as string[] | null, requirement: ((s?.shape as Row | null)?.sbc_requirement ?? null) as string[] | null },
    formations: Object.keys(FORMATIONS),
    verified: false as const,
  };
}

/** What a set's reward is worth: a pack's typical value from Pack Advisor, a player's FUT.GG price, or coins. */
export async function rewardValue(db: FutDb, userId: string, platform: Platform, awards: SbcSet["awards"]): Promise<{ value: number | null; label: string | null }> {
  if (!awards.length) return { value: null, label: null };
  let total = 0, known = false;
  const labels: string[] = [];
  let packs: Awaited<ReturnType<typeof packAdvice>>["packs"] | null = null;
  for (const a of awards) {
    const n = a.count ?? 1;
    if (/coin/i.test(a.type) && a.value) { total += a.value * n; known = true; labels.push(`${a.value.toLocaleString("en-US")} coins`); continue; }
    if (/pack/i.test(a.type) && a.value) {
      packs ??= (await packAdvice(db, userId, platform)).packs;
      const p = packs.find((x) => x.pack_id === a.value);
      if (p && p.ev_low !== null) { total += Math.round(p.ev_low) * n; known = true; labels.push(`${n > 1 ? `${n}× ` : ""}${p.name}`); }
      else labels.push(`pack ${a.value}`);
      continue;
    }
    if (a.value) {
      const { data, error } = await db.rpc("account_item_prices", { p_platform: platform, p_ids: [a.value] });
      if (!error) {
        const item = (((data as Row | null)?.items ?? []) as Row[])[0];
        if (item && typeof item.price === "number") { total += item.price * n; known = true; labels.push(String(item.player_name ?? "the player")); continue; }
      }
      labels.push(a.type);
    }
  }
  return { value: known ? total : null, label: labels.join(" + ") || null };
}

export interface SolveRequest {
  challenges: { name: string; formation: string; requirements: Requirement[] }[];
  options: SolveOptions;
  reward: number | null;
  set_id: number | null;
  dropped: number;
}

/** Checks a solve body: one challenge (requirements or pasted text) or several (a set), plus options. */
export function parseSolveBody(b: Row): SolveRequest {
  const list = Array.isArray(b.challenges) ? b.challenges : [b];
  if (!list.length || list.length > MAX_CHALLENGES) throw new FutError(`Send 1 to ${MAX_CHALLENGES} challenges.`);
  let dropped = 0;
  const challenges = list.map((raw, i) => {
    const c = (raw && typeof raw === "object" ? raw : {}) as Row;
    const formation = typeof c.formation === "string" && c.formation ? (FORMATIONS[c.formation] ? c.formation : formationFromEa(c.formation)) : "4-3-3";
    if (!formation) throw new FutError(`formation must be one of: ${Object.keys(FORMATIONS).join(", ")}.`);
    const cleaned = cleanRequirements(c.requirements);
    dropped += cleaned.dropped;
    let reqs = cleaned.requirements;
    if (typeof c.text === "string" && c.text.trim()) reqs = [...reqs, ...parseRequirements(c.text.slice(0, 4000)).requirements];
    if (!reqs.length) throw new FutError(`Challenge ${i + 1} has no requirements. Paste them or add them on the page.`);
    return { name: typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 120) : `Challenge ${i + 1}`, formation, requirements: reqs };
  });
  const o = (b.options && typeof b.options === "object" ? b.options : {}) as Row;
  const protect = typeof o.protect_from === "number" && Number.isInteger(o.protect_from) && o.protect_from >= 1 && o.protect_from <= 99 ? o.protect_from : null;
  const exclude = Array.isArray(o.exclude) ? o.exclude.filter((x): x is string => typeof x === "string" && x.length <= 60).slice(0, 200) : [];
  const reward = typeof b.reward === "number" && Number.isFinite(b.reward) && b.reward >= 0 && b.reward <= 100_000_000 ? Math.round(b.reward) : null;
  const set_id = typeof b.set_id === "number" && Number.isInteger(b.set_id) && b.set_id > 0 ? b.set_id : null;
  return { challenges, options: { use_tradeables: o.use_tradeables !== false, buy: o.buy !== false, protect_from: protect, exclude }, reward, set_id, dropped };
}

/** Solves one challenge or a whole set from the user's club and the market, and says whether it's worth it. */
export async function solveForUser(db: FutDb, userId: string, platform: Platform, req: SolveRequest) {
  const all = req.challenges.flatMap((c) => c.requirements);
  const needChem = all.some((r) => r.kind === "chemistry" || r.kind === "player_chemistry");
  const [pool, rules] = await Promise.all([sbcPool(db, userId, platform, all), needChem ? activeRules(db) : Promise.resolve(null)]);
  if (!pool.cards.length) throw new FutError("No cards to build with yet. Sync your club with the XI Lab helper, or wait for the first FUT.GG price refresh.");
  const solved = solveMany(req.challenges, pool.cards, rules, req.options);
  let reward: { value: number | null; label: string | null } = { value: req.reward, label: req.reward === null ? null : "The reward" };
  if (req.reward === null && req.set_id) {
    const { data, error } = await db.from("account_state").select("sbcs").eq("user_id", userId).eq("platform", platform).maybeSingle();
    fail(error);
    const set = (((data as Row | null)?.sbcs ?? []) as SbcSet[]).find((s) => s.set_id === req.set_id);
    if (set) reward = await rewardValue(db, userId, platform, set.awards);
  }
  return {
    platform, prices_at: pool.prices_at, owned_cards: pool.owned, spare_duplicates: pool.spares, dropped_requirements: req.dropped,
    ...solved, reward, worth: worthIt(solved.total_cost, reward), verified: false as const,
  };
}
