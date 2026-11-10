// SBC Solver (Jeff, 2026-11-10): fills a Squad Building Challenge from the user's own club first (duplicates and
// untradeables before tradeables), then the cheapest market cards, and says what's left to buy and whether the SBC
// is worth doing. Read-only: it never submits anything; the user hands the squad in themselves in EA's app.
//
// Requirements come from three places, all turned into the same `Requirement` list:
//   1. the challenges the XI Lab helper saw when the user opened an SBC set (`account_state.sbc_challenges`,
//      EA's field names UNVERIFIED on FC 27, see `fromEa`),
//   2. requirement text pasted from EA's app, FUT.GG or FUTBIN (`parseRequirements`),
//   3. the list the user edits on the page.
// Team rating follows the community formula (average plus each player's excess over it); chemistry is XI Lab's
// engine, so it matches the Squad Builder. Both are estimates until checked against a real submission.
import { computeSquadChemistry, type ChemistryRules } from "./xilab/chemistry/index.ts";
import { FORMATIONS } from "./xilab/workspace/index.ts";

export type Op = "min" | "max" | "exact";
export type Group = "league" | "nation" | "club";
export type Quality = "bronze" | "silver" | "gold";
export type Rarity = "common" | "rare" | "special" | "totw";

export type Requirement =
  | { kind: "players"; op: Op; value: number }
  | { kind: "team_rating"; op: Op; value: number }
  | { kind: "chemistry"; op: Op; value: number }
  | { kind: "player_chemistry"; op: Op; value: number }
  /** With count: at least/at most `count` players rated `op value`. Without: every player. */
  | { kind: "rating"; op: Op; value: number; count?: number }
  | { kind: "quality"; op: Op; value: Quality; count?: number }
  /** `count` players of this rarity (min/max/exact by op). */
  | { kind: "rarity"; op: Op; value: Rarity; count: number }
  /** The biggest group of players sharing one league/nation/club. */
  | { kind: "same"; of: Group; op: Op; value: number }
  /** How many different leagues/nations/clubs. */
  | { kind: "distinct"; of: Group; op: Op; value: number }
  /** `count` players from any of these leagues/nations/clubs (`of` "any" until names are resolved). */
  | { kind: "from"; of: Group | "any"; names: string[]; op: Op; count: number };

export interface SbcCard {
  id: string;
  name: string;
  rating: number;
  positions: string[];
  league: string | null;
  nation: string | null;
  club: string | null;
  version: string | null;
  is_icon?: boolean;
  is_hero?: boolean;
  /** owned: in the club; spare: an unassigned duplicate (only good for SBCs or quick sell); buy: from the market. */
  source: "owned" | "spare" | "buy";
  untradeable: boolean;
  /** FUT.GG price (what it costs to buy, or what a tradeable owned card would sell for before tax). */
  price: number | null;
  ea_item_id?: number | null;
}

export interface SolveOptions {
  /** Use tradeable club cards (they could be sold instead). Default true. */
  use_tradeables?: boolean;
  /** Buy cards from the market when the club can't fill it. Default true. */
  buy?: boolean;
  /** Never use club cards rated this or higher (keep your best). */
  protect_from?: number | null;
  /** Card ids not to use (already used by an earlier challenge, or the user said no). */
  exclude?: string[];
  seed?: number;
}

export const EA_TAX = 0.05;

// ------------------------------------------------------------------ card facts

export const quality = (r: number): Quality => (r >= 75 ? "gold" : r >= 65 ? "silver" : "bronze");
const QUALITY_RANK: Record<Quality, number> = { bronze: 0, silver: 1, gold: 2 };

/** Common, rare, special (any promo, icon, hero) and Team of the Week (in-form). From the card's version name. */
export function rarityOf(c: Pick<SbcCard, "version" | "is_icon" | "is_hero">): Rarity[] {
  const v = (c.version ?? "").toLowerCase().trim();
  if (/team of the week|\btotw\b|in-?form|rareflag 3\)/.test(v)) return ["totw", "special", "rare"];
  if (c.is_icon || c.is_hero || (v && !/^(common|rare|non-?rare)$/.test(v))) return ["special", "rare"];
  if (v === "rare") return ["rare"];
  return ["common"];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const plays = (c: SbcCard, position: string) => c.positions.some((p) => p.toUpperCase() === position.toUpperCase());

/** EA's squad rating: average, plus each player's points above that average, over 11, rounded down. */
export function teamRating(ratings: number[]): number {
  if (!ratings.length) return 0;
  const n = 11, sum = ratings.reduce((a, b) => a + b, 0), avg = sum / n;
  const excess = ratings.reduce((a, r) => a + Math.max(0, r - avg), 0);
  return Math.floor(Math.round(((sum + excess) / n) * 100) / 100);
}

// ------------------------------------------------------------------ requirement text

const OPS: [RegExp, Op][] = [[/\b(min(imum)?\.?|at least|or more|\+)\b|\+/i, "min"], [/\b(max(imum)?\.?|at most|or fewer|or less)\b/i, "max"], [/\b(exactly|exact)\b/i, "exact"]];
const opOf = (s: string, fallback: Op = "min"): Op => OPS.find(([re]) => re.test(s))?.[1] ?? fallback;
const groupOf = (s: string): Group | null => (/\bleagues?\b/i.test(s) ? "league" : /\b(nation(s|alit(y|ies))?|countr(y|ies)(\/regions?)?|regions?)\b/i.test(s) ? "nation" : /\bclubs?\b/i.test(s) ? "club" : null);
const numbers = (s: string) => [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
const RARITY_WORDS: [RegExp, Rarity][] = [[/team of the week|\btotw\b|in-?form/i, "totw"], [/\bspecial\b/i, "special"], [/\bnon-?rare\b|\bcommon\b/i, "common"], [/\brare\b/i, "rare"]];

/** One pasted requirement line → a requirement, or null when it isn't one we understand. */
export function parseRequirementLine(raw: string): Requirement | null {
  const line = raw.replace(/[•·▪●*–-]\s+/g, " ").replace(/\s+/g, " ").trim();
  if (!line) return null;
  const n = numbers(line);
  const op = opOf(line);
  // Squad size: "Exactly 11 Players", "# of players in the Squad: 11"
  if (/players? in (the )?squad|squad size|^#? ?(of )?players\b.*\d+$|^(exactly|min(imum)?\.?|max(imum)?\.?)\s*\d+\s*players?$/i.test(line) && n.length && !groupOf(line) && !/rated|ovr|rating/i.test(line)) return { kind: "players", op: opOf(line, "exact"), value: n.at(-1)! };
  if (/\b(team|squad) rating\b/i.test(line) && n.length) return { kind: "team_rating", op, value: n.at(-1)! };
  if (/chem(istry)? (points )?per player|player chem/i.test(line) && n.length) return { kind: "player_chemistry", op, value: n.at(-1)! };
  if (/\b(team |total |squad )?chem(istry)?\b/i.test(line) && n.length) return { kind: "chemistry", op, value: n.at(-1)! };
  const rar = RARITY_WORDS.find(([re]) => re.test(line))?.[1];
  if (rar) return { kind: "rarity", op, value: rar, count: n.length ? n[0]! : 1 };
  const q = /\bgold\b/i.test(line) ? "gold" : /\bsilver\b/i.test(line) ? "silver" : /\bbronze\b/i.test(line) ? "bronze" : null;
  if (q) {
    // "Player Quality: Min. Gold" (every player) or "Min. 5 Players: Gold" (a count).
    return n.length ? { kind: "quality", op, value: q, count: n[0]! } : { kind: "quality", op, value: q };
  }
  if (/\b(ovr|overall|rated|rating)\b/i.test(line) && n.length) {
    // "Player OVR: Min. 80" (every player) or "Min. 2 Players: 85+ OVR" (a count).
    if (n.length >= 2) return { kind: "rating", op: /\+|or more|min/i.test(line) ? "min" : op, value: Math.max(n[0]!, n[1]!), count: Math.min(n[0]!, n[1]!) };
    return { kind: "rating", op, value: n[0]! };
  }
  const g = groupOf(line);
  // "League: Premier League OR LALIGA, Min 1" names groups; "Leagues: Min 3" counts them.
  const named = /^[^:]+:\s*(?!(min|max|exactly)\b|\d)[a-z]/i.test(line) && !/\bsame\b/i.test(line);
  if (g && /\bsame\b/i.test(line) && n.length) return { kind: "same", of: g, op, value: n.at(-1)! };
  if (g && n.length && !named && !/\bfrom\b/i.test(line)) return { kind: "distinct", of: g, op, value: n.at(-1)! };
  // "Min. 1 Players from: Premier League", "Premier League: Min 1", "Nation: England OR Spain, min 2"
  const from = /from:?\s*(.+)$/i.exec(line) ?? /^([^:]+):\s*(?:min|max|exactly)/i.exec(line) ?? /^(?:league|nation|club|country\/region):\s*([^,]+?)(?:,|\s+(?:min|max|exactly)|$)/i.exec(line);
  if (from) {
    const names = from[1]!.replace(/\b(min(imum)?\.?|max(imum)?\.?|exactly)\b.*$/i, "").split(/\s*(?:,|\bor\b|\/|\|)\s*/i).map((s) => s.replace(/\d+\s*players?/i, "").replace(/[:.]+$/, "").trim()).filter((s) => s && !/^\d+$/.test(s)).slice(0, 10);
    if (names.length) return { kind: "from", of: /^league/i.test(line) ? "league" : /^(nation|country)/i.test(line) ? "nation" : /^club/i.test(line) ? "club" : "any", names, op, count: n.length ? n[0]! : 1 };
  }
  return null;
}

export function parseRequirements(text: string): { requirements: Requirement[]; unread: string[] } {
  const requirements: Requirement[] = [], unread: string[] = [];
  for (const l of text.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 40)) {
    const r = parseRequirementLine(l);
    if (r) requirements.push(r); else unread.push(l.slice(0, 160));
  }
  return { requirements, unread };
}

// ------------------------------------------------------------------ EA's own requirements (helper capture)

export interface EaRequirement { type: string; scope: string | null; values: number[]; count: number | null; slot: number | null }
export interface EaNames { leagues: Map<number, string>; nations: Map<number, string>; clubs: Map<number, string> }

const scopeOp = (s: string | null): Op => (s === "LOWER" ? "max" : s === "EXACT" ? "exact" : "min");
const QUALITY_BY_LEVEL: Record<number, Quality> = { 1: "bronze", 2: "silver", 3: "gold" };
/** EA rarity ids (community clients): 0 common, 1 rare, 3 in-form/TOTW; any other id counts as special. */
const rarityById = (id: number): Rarity => (id === 0 ? "common" : id === 1 ? "rare" : id === 3 ? "totw" : "special");

/**
 * EA's requirement types as community clients name them (UNVERIFIED on FC 27). Anything else comes back in
 * `unread` so the page can show it and the user can type it in.
 */
export function fromEa(reqs: EaRequirement[], names: EaNames): { requirements: Requirement[]; unread: string[] } {
  const requirements: Requirement[] = [], unread: string[] = [];
  for (const r of reqs) {
    const op = scopeOp(r.scope), v = r.values[0], count = r.count !== null && r.count > 0 ? r.count : null;
    const name = (m: Map<number, string>, id: number) => m.get(id) ?? `EA ${id}`;
    const push = (x: Requirement | null) => (x ? requirements.push(x) : unread.push([r.type, r.scope, r.values.join(","), count ? `x${count}` : null].filter(Boolean).join(" ")));
    if (v === undefined) { push(null); continue; }
    switch (r.type) {
      case "PLAYER_COUNT": push({ kind: "players", op, value: v }); break;
      case "TEAM_RATING": case "TEAM_STAR_RATING": push({ kind: "team_rating", op, value: v }); break;
      case "CHEMISTRY_POINTS": case "TEAM_CHEMISTRY": push({ kind: "chemistry", op, value: v }); break;
      case "ALL_PLAYERS_CHEMISTRY_POINTS": push({ kind: "player_chemistry", op, value: v }); break;
      case "PLAYER_MIN_OVR": push({ kind: "rating", op: "min", value: v, ...(count ? { count } : {}) }); break;
      case "PLAYER_MAX_OVR": push({ kind: "rating", op: "max", value: v, ...(count ? { count } : {}) }); break;
      case "PLAYER_EXACT_OVR": push({ kind: "rating", op: "exact", value: v, ...(count ? { count } : {}) }); break;
      case "PLAYER_LEVEL": case "PLAYER_QUALITY": push(QUALITY_BY_LEVEL[v] ? { kind: "quality", op, value: QUALITY_BY_LEVEL[v]!, ...(count ? { count } : {}) } : null); break;
      case "PLAYER_RARITY": case "PLAYER_RARITY_GROUP": push({ kind: "rarity", op: "min", value: rarityById(v), count: count ?? 1 }); break;
      case "SAME_NATION_COUNT": push({ kind: "same", of: "nation", op, value: v }); break;
      case "SAME_LEAGUE_COUNT": push({ kind: "same", of: "league", op, value: v }); break;
      case "SAME_CLUB_COUNT": push({ kind: "same", of: "club", op, value: v }); break;
      case "NATION_COUNT": push({ kind: "distinct", of: "nation", op, value: v }); break;
      case "LEAGUE_COUNT": push({ kind: "distinct", of: "league", op, value: v }); break;
      case "CLUB_COUNT": push({ kind: "distinct", of: "club", op, value: v }); break;
      case "NATION_ID": push({ kind: "from", of: "nation", names: r.values.map((id) => name(names.nations, id)), op: "min", count: count ?? 1 }); break;
      case "LEAGUE_ID": push({ kind: "from", of: "league", names: r.values.map((id) => name(names.leagues, id)), op: "min", count: count ?? 1 }); break;
      case "CLUB_ID": push({ kind: "from", of: "club", names: r.values.map((id) => name(names.clubs, id)), op: "min", count: count ?? 1 }); break;
      default: push(null);
    }
  }
  return { requirements, unread };
}

/** EA's formation code (f4231, f433-2) → ours ("4-2-3-1", "4-3-3 (2)"), or null. */
export function formationFromEa(code: string | null): string | null {
  if (!code) return null;
  if (FORMATIONS[code]) return code;
  const m = /^f?(\d{3,5})(?:[-_ ]?(\d))?$/i.exec(code.trim());
  if (!m) return null;
  const name = m[1]!.split("").join("-") + (m[2] && m[2] !== "1" ? ` (${m[2]})` : "");
  return FORMATIONS[name] ? name : null;
}

// ------------------------------------------------------------------ input checks (web/MCP body → requirements)

const OP_SET = new Set(["min", "max", "exact"]);
const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** Strict: anything malformed is dropped (and reported) rather than guessed. */
export function cleanRequirements(raw: unknown): { requirements: Requirement[]; dropped: number } {
  if (!Array.isArray(raw)) return { requirements: [], dropped: 0 };
  const out: Requirement[] = [];
  let dropped = 0;
  for (const x of raw.slice(0, 30)) {
    const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const op = OP_SET.has(r.op as string) ? (r.op as Op) : null;
    const group = ["league", "nation", "club"].includes(r.of as string) ? (r.of as Group) : null;
    let ok: Requirement | null = null;
    if (op) switch (r.kind) {
      case "players": { const v = int(r.value, 1, 11); if (v !== null) ok = { kind: "players", op, value: v }; break; }
      case "team_rating": { const v = int(r.value, 1, 99); if (v !== null) ok = { kind: "team_rating", op, value: v }; break; }
      case "chemistry": { const v = int(r.value, 0, 33); if (v !== null) ok = { kind: "chemistry", op, value: v }; break; }
      case "player_chemistry": { const v = int(r.value, 0, 3); if (v !== null) ok = { kind: "player_chemistry", op, value: v }; break; }
      case "rating": { const v = int(r.value, 1, 99), c = r.count === undefined || r.count === null ? undefined : int(r.count, 0, 11); if (v !== null && c !== null) ok = { kind: "rating", op, value: v, ...(c !== undefined ? { count: c } : {}) }; break; }
      case "quality": { const c = r.count === undefined || r.count === null ? undefined : int(r.count, 0, 11); if (["bronze", "silver", "gold"].includes(r.value as string) && c !== null) ok = { kind: "quality", op, value: r.value as Quality, ...(c !== undefined ? { count: c } : {}) }; break; }
      case "rarity": { const c = int(r.count, 0, 11); if (["common", "rare", "special", "totw"].includes(r.value as string) && c !== null) ok = { kind: "rarity", op, value: r.value as Rarity, count: c }; break; }
      case "same": { const v = int(r.value, 1, 11); if (group && v !== null) ok = { kind: "same", of: group, op, value: v }; break; }
      case "distinct": { const v = int(r.value, 1, 11); if (group && v !== null) ok = { kind: "distinct", of: group, op, value: v }; break; }
      case "from": {
        const c = int(r.count, 0, 11);
        const names = Array.isArray(r.names) ? r.names.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().slice(0, 60)).slice(0, 10) : [];
        const of = r.of === "any" ? "any" : group;
        if (of && c !== null && names.length) ok = { kind: "from", of, names, op, count: c };
        break;
      }
    }
    if (ok) out.push(ok); else dropped++;
  }
  return { requirements: out, dropped };
}

/** Plain-English line for a requirement, for the page and the AI. */
export function describe(r: Requirement): string {
  const o = (op: Op) => (op === "min" ? "Min." : op === "max" ? "Max." : "Exactly");
  const g = (x: Group | "any") => (x === "nation" ? "nations" : x === "any" ? "" : `${x}s`);
  switch (r.kind) {
    case "players": return `${o(r.op)} ${r.value} players in the squad`;
    case "team_rating": return `Team rating: ${o(r.op)} ${r.value}`;
    case "chemistry": return `Team chemistry: ${o(r.op)} ${r.value}`;
    case "player_chemistry": return `Chemistry per player: ${o(r.op)} ${r.value}`;
    case "rating": return r.count === undefined ? `Player rating: ${o(r.op)} ${r.value}` : `${o(r.op)} ${r.count} players rated ${r.op === "max" ? `${r.value} or lower` : r.op === "exact" ? r.value : `${r.value}+`}`;
    case "quality": return r.count === undefined ? `Player quality: ${o(r.op)} ${r.value}` : `${o(r.op)} ${r.count} ${r.value} players`;
    case "rarity": return `${o(r.op)} ${r.count} ${r.value === "totw" ? "Team of the Week" : r.value} players`;
    case "same": return `Players from the same ${r.of}: ${o(r.op)} ${r.value}`;
    case "distinct": return `${g(r.of)[0]!.toUpperCase()}${g(r.of).slice(1)}: ${o(r.op)} ${r.value}`;
    case "from": return `${o(r.op)} ${r.count} players from: ${r.names.join(" or ")}`;
  }
}

// ------------------------------------------------------------------ checking a squad

export interface Placed { slot: string; position: string; card: SbcCard | null }
export interface Check { requirement: Requirement; label: string; ok: boolean; actual: number | string; gap: number }

const cmp = (op: Op, actual: number, want: number) => (op === "min" ? Math.max(0, want - actual) : op === "max" ? Math.max(0, actual - want) : Math.abs(actual - want));

function chemistryOf(formation: string, slots: Placed[], rules: ChemistryRules | null) {
  const filled = slots.filter((s) => s.card);
  if (!rules || !filled.length) return { total: 0, players: new Map<string, number>() };
  const r = computeSquadChemistry({ formation, slots: filled.map((s) => ({ slot: s.slot, position: s.position, card: { ...s.card!, id: s.card!.id } })) }, rules);
  return { total: r.total, players: new Map(r.players.map((p) => [p.slot, p.chemistry])) };
}

export function checkSquad(formation: string, slots: Placed[], reqs: Requirement[], rules: ChemistryRules | null): { checks: Check[]; team_rating: number; chemistry: number } {
  const cards = slots.map((s) => s.card).filter((c): c is SbcCard => !!c);
  const ratings = cards.map((c) => c.rating);
  const tr = teamRating(ratings);
  const needChem = reqs.some((r) => r.kind === "chemistry" || r.kind === "player_chemistry");
  const chem = needChem ? chemistryOf(formation, slots, rules) : { total: 0, players: new Map<string, number>() };
  const groupCounts = (g: Group) => {
    const m = new Map<string, number>();
    for (const c of cards) { const k = c[g]; if (k) m.set(norm(k), (m.get(norm(k)) ?? 0) + 1); }
    return m;
  };
  const checks: Check[] = reqs.map((r) => {
    let actual: number | string = 0, gap = 0;
    switch (r.kind) {
      case "players": actual = cards.length; gap = cmp(r.op, cards.length, r.value); break;
      case "team_rating": actual = tr; gap = cmp(r.op, tr, r.value) * 3; break;
      case "chemistry": actual = chem.total; gap = cmp(r.op, chem.total, r.value); break;
      case "player_chemistry": {
        const worst = slots.filter((s) => s.card).map((s) => chem.players.get(s.slot) ?? 0);
        actual = worst.length ? Math.min(...worst) : 0;
        gap = worst.reduce((a, c) => a + cmp(r.op, c, r.value), 0);
        break;
      }
      case "rating": {
        const hit = (x: number) => (r.op === "min" ? x >= r.value : r.op === "max" ? x <= r.value : x === r.value);
        if (r.count === undefined) { const bad = ratings.filter((x) => !hit(x)); actual = bad.length ? `${bad.length} off` : "all"; gap = bad.reduce((a, x) => a + 1 + Math.abs(x - r.value) / 10, 0); }
        else { const n = ratings.filter((x) => (r.op === "max" ? x <= r.value : r.op === "exact" ? x === r.value : x >= r.value)).length; actual = n; gap = Math.max(0, r.count - n); }
        break;
      }
      case "quality": {
        const rank = QUALITY_RANK[r.value];
        const hit = (c: SbcCard) => (r.op === "min" ? QUALITY_RANK[quality(c.rating)] >= rank : r.op === "max" ? QUALITY_RANK[quality(c.rating)] <= rank : quality(c.rating) === r.value);
        if (r.count === undefined) { const bad = cards.filter((c) => !hit(c)).length; actual = bad ? `${bad} off` : "all"; gap = bad; }
        else { const n = cards.filter((c) => quality(c.rating) === r.value || (r.op === "min" && QUALITY_RANK[quality(c.rating)] >= rank)).length; actual = n; gap = r.op === "max" ? Math.max(0, n - r.count) : Math.max(0, r.count - n); }
        break;
      }
      case "rarity": { const n = cards.filter((c) => rarityOf(c).includes(r.value)).length; actual = n; gap = cmp(r.op, n, r.count); break; }
      case "same": { const big = Math.max(0, ...groupCounts(r.of).values()); actual = big; gap = cmp(r.op, big, r.value); break; }
      case "distinct": { const n = groupCounts(r.of).size; actual = n; gap = cmp(r.op, n, r.value); break; }
      case "from": {
        const want = new Set(r.names.map(norm));
        const n = cards.filter((c) => (r.of === "any" ? [c.league, c.nation, c.club] : [c[r.of]]).some((x) => x && want.has(norm(x)))).length;
        actual = n; gap = cmp(r.op, n, r.count);
        break;
      }
    }
    return { requirement: r, label: describe(r), ok: gap === 0, actual, gap };
  });
  // Always 11 players unless the SBC says otherwise (some take fewer).
  if (!reqs.some((r) => r.kind === "players")) {
    const r: Requirement = { kind: "players", op: "exact", value: 11 };
    checks.unshift({ requirement: r, label: describe(r), ok: cards.length === 11, actual: cards.length, gap: Math.abs(11 - cards.length) });
  }
  return { checks, team_rating: tr, chemistry: chem.total };
}

// ------------------------------------------------------------------ cost of using a card

/**
 * What using a card costs you, in coins: a market card its price; a tradeable club card what it would sell for after
 * tax; an untradeable club card a small share of its price (it can only go to SBCs or quick sell, but it's still
 * useful for the next one); a spare duplicate almost nothing. Unknown prices fall back to a rating guess.
 */
export function useCost(c: SbcCard): number {
  const guess = c.rating >= 75 ? 200 + Math.max(0, c.rating - 80) ** 2 * 150 : 150;
  const p = c.price ?? guess;
  if (c.source === "buy") return p;
  if (c.source === "spare") return Math.round(p * 0.05) + 1;
  return c.untradeable ? Math.round(p * 0.25) + 5 : Math.floor(p * (1 - EA_TAX)) + 10;
}

// ------------------------------------------------------------------ solver

export interface SolveResult {
  formation: string;
  feasible: boolean;
  slots: Placed[];
  checks: Check[];
  team_rating: number;
  chemistry: number;
  /** Coins to buy the market cards. */
  buy_cost: number;
  /** What the tradeable club cards used would sell for after tax. */
  tradeable_value: number;
  /** Coins this really costs you: buys plus tradeable club cards you give up. */
  total_cost: number;
  counts: { spare: number; untradeable: number; tradeable: number; buy: number };
  notes: string[];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
}

/**
 * Pre-filters the pool to what can matter: every spare and untradeable club card, the cheapest few tradeable and
 * market cards at each rating (and position, when chemistry counts), cards that meet a group/rarity rule, and cards
 * from the biggest groups.
 */
export function shortlist(pool: SbcCard[], reqs: Requirement[], perRating = 12, cap = 800): SbcCard[] {
  const byCost = [...pool].sort((a, b) => useCost(a) - useCost(b) || b.rating - a.rating);
  const keep = new Map<string, SbcCard>();
  const add = (c: SbcCard) => { if (keep.size < cap) keep.set(c.id, c); };
  for (const c of byCost) if ((c.source === "spare" || (c.source === "owned" && c.untradeable)) && keep.size < 350) add(c);
  const chem = reqs.some((r) => r.kind === "chemistry" || r.kind === "player_chemistry");
  const perR = new Map<string, number>();
  for (const c of byCost) {
    if (keep.has(c.id)) continue;
    const key = `${c.source === "buy" ? "b" : "o"}|${c.rating}|${chem ? c.positions[0] ?? "" : ""}`;
    const n = perR.get(key) ?? 0;
    if (n < (chem ? 3 : perRating)) { perR.set(key, n + 1); add(c); }
  }
  for (const r of reqs) {
    let test: ((c: SbcCard) => boolean) | null = null;
    if (r.kind === "from") { const want = new Set(r.names.map(norm)); test = (c) => (r.of === "any" ? [c.league, c.nation, c.club] : [c[r.of]]).some((x) => !!x && want.has(norm(x))); }
    if (r.kind === "rarity") test = (c) => rarityOf(c).includes(r.value);
    if (r.kind === "quality" && r.count !== undefined) test = (c) => quality(c.rating) === r.value;
    if (test) { let n = 0; for (const c of byCost) if (test(c) && n++ < 40) add(c); }
  }
  // Cards from the biggest leagues/nations/clubs in the pool help "same"/chemistry rules.
  if (reqs.some((r) => r.kind === "chemistry" || r.kind === "player_chemistry" || (r.kind === "same" && r.op !== "max"))) {
    for (const g of ["league", "nation", "club"] as const) {
      const counts = new Map<string, number>();
      for (const c of byCost) if (c[g]) counts.set(c[g]!, (counts.get(c[g]!) ?? 0) + 1);
      for (const [k] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) { let n = 0; for (const c of byCost) if (c[g] === k && n++ < 25) add(c); }
    }
  }
  return [...keep.values()];
}

/**
 * The cheapest squad that meets the requirements: a greedy start, then single-card swaps and slot swaps that lower
 * (requirement gap × a big weight + cost), from a few starts. Positions only matter when chemistry is asked for.
 */
export function solveSbc(formation: string, reqs: Requirement[], poolIn: SbcCard[], rules: ChemistryRules | null, opts: SolveOptions = {}): SolveResult {
  const layout = FORMATIONS[formation];
  if (!layout) throw new Error(`Unknown formation "${formation}"`);
  const size = (reqs.find((r) => r.kind === "players") as { value: number } | undefined)?.value ?? 11;
  const exclude = new Set(opts.exclude ?? []);
  const pool = poolIn.filter((c) =>
    !exclude.has(c.id) &&
    (c.source !== "buy" || (opts.buy !== false && c.price !== null && c.price > 0)) &&
    (c.source === "buy" || opts.use_tradeables !== false || c.untradeable || c.source === "spare") &&
    (c.source === "buy" || !opts.protect_from || c.rating < opts.protect_from));
  const cands = shortlist(pool, reqs);
  const chemMatters = reqs.some((r) => r.kind === "chemistry" || r.kind === "player_chemistry");
  const slotsFor = layout.slice(0, Math.min(size, layout.length));
  const W = 1_000_000;
  const value = (s: Placed[]) => {
    const { checks } = checkSquad(formation, s, reqs, rules);
    const gap = checks.reduce((a, c) => a + c.gap, 0);
    return gap * W + s.reduce((a, x) => a + (x.card ? useCost(x.card) : W), 0);
  };
  const random = rng(opts.seed ?? 27);
  const fits = (c: SbcCard, position: string) => !chemMatters || plays(c, position);

  // Per-player hard rules (every player's rating/quality) shape the greedy start.
  const perPlayer = (c: SbcCard) => reqs.every((r) => {
    if (r.kind === "rating" && r.count === undefined) return r.op === "min" ? c.rating >= r.value : r.op === "max" ? c.rating <= r.value : c.rating === r.value;
    if (r.kind === "quality" && r.count === undefined) { const a = QUALITY_RANK[quality(c.rating)], b = QUALITY_RANK[r.value]; return r.op === "min" ? a >= b : r.op === "max" ? a <= b : a === b; }
    return true;
  });
  const tr = reqs.find((r) => r.kind === "team_rating" && r.op !== "max") as { value: number } | undefined;

  const start = (variant: number): Placed[] => {
    const out: Placed[] = slotsFor.map((l) => ({ slot: l.slot, position: l.position, card: null }));
    const used = new Set<string>();
    const sorted = [...cands].filter(perPlayer).sort((a, b) => {
      // Variant 0: cheapest near the target rating; others shuffle a little so restarts explore.
      const target = tr ? tr.value : 0;
      const da = tr ? Math.abs(a.rating - target) * 40 : 0, db = tr ? Math.abs(b.rating - target) * 40 : 0;
      return useCost(a) + da - (useCost(b) + db) + (variant ? (random() - 0.5) * 400 * variant : 0);
    });
    for (const s of out) {
      const pick = sorted.find((c) => !used.has(norm(c.name)) && fits(c, s.position));
      if (pick) { s.card = pick; used.add(norm(pick.name)); }
    }
    return out;
  };

  const improve = (cur: Placed[]) => {
    let best = value(cur);
    for (let round = 0; round < 12; round++) {
      let changed = false;
      for (let i = 0; i < cur.length; i++) {
        const used = new Set(cur.filter((s, j) => j !== i && s.card).map((s) => norm(s.card!.name)));
        for (const c of cands) {
          if (used.has(norm(c.name)) || c.id === cur[i]!.card?.id || !fits(c, cur[i]!.position)) continue;
          const next = cur.map((s, j) => (j === i ? { ...s, card: c } : s));
          const v = value(next);
          if (v < best) { best = v; cur = next; changed = true; }
        }
      }
      if (chemMatters) for (let a = 0; a < cur.length; a++) for (let b = a + 1; b < cur.length; b++) {
        const A = cur[a]!, B = cur[b]!;
        if (!A.card || !B.card || !plays(A.card, B.position) || !plays(B.card, A.position)) continue;
        const next = cur.map((s, j) => (j === a ? { ...s, card: B.card } : j === b ? { ...s, card: A.card } : s));
        const v = value(next);
        if (v < best) { best = v; cur = next; changed = true; }
      }
      if (!changed) break;
    }
    return { slots: cur, value: best };
  };

  let winner = improve(start(0));
  for (let v = 1; v <= 3 && winner.value >= W; v++) {
    const r = improve(start(v));
    if (r.value < winner.value) winner = r;
  }
  const { checks, team_rating, chemistry } = checkSquad(formation, winner.slots, reqs, rules);
  const cards = winner.slots.map((s) => s.card).filter((c): c is SbcCard => !!c);
  const buy_cost = cards.filter((c) => c.source === "buy").reduce((a, c) => a + (c.price ?? 0), 0);
  const tradeable_value = cards.filter((c) => c.source === "owned" && !c.untradeable).reduce((a, c) => a + Math.floor((c.price ?? 0) * (1 - EA_TAX)), 0);
  const feasible = checks.every((c) => c.ok);
  const notes: string[] = [];
  if (!feasible) notes.push(opts.buy === false ? "Your club can't complete this on its own. Allow buying cards to see what's missing." : "No squad found that meets every requirement from your club and the cheapest market cards. Check the requirements, or try again after the next price refresh.");
  if (cards.some((c) => c.price === null)) notes.push("Some club cards have no FUT.GG price, so their value is a guess from their rating.");
  notes.push("Team rating and chemistry are GafferBot's estimates. EA's own numbers show when you build it in the Web App.");
  return {
    formation, feasible, slots: winner.slots, checks, team_rating, chemistry, buy_cost, tradeable_value, total_cost: buy_cost + tradeable_value,
    counts: {
      spare: cards.filter((c) => c.source === "spare").length, untradeable: cards.filter((c) => c.source === "owned" && c.untradeable).length,
      tradeable: cards.filter((c) => c.source === "owned" && !c.untradeable).length, buy: cards.filter((c) => c.source === "buy").length,
    },
    notes,
  };
}

// ------------------------------------------------------------------ worth it?

export type WorthVerdict = "do_it" | "close" | "skip" | "unknown" | "free";

/** Compares what the squad costs you with what the reward is worth (pack typical value or player price). */
export function worthIt(totalCost: number, reward: { value: number | null; label: string | null }): { verdict: WorthVerdict; why: string } {
  const c = (n: number) => n.toLocaleString("en-US");
  if (totalCost <= 0) return { verdict: "free", why: "Your spare and untradeable cards cover it, so it costs you no coins." };
  if (reward.value === null) return { verdict: "unknown", why: `It costs you about ${c(totalCost)} coins. GafferBot doesn't know what the reward is worth yet; enter it to compare.` };
  const ratio = reward.value / totalCost;
  if (ratio >= 1.1) return { verdict: "do_it", why: `${reward.label ?? "The reward"} is worth about ${c(reward.value)} coins and the squad costs you about ${c(totalCost)}. Do it.` };
  if (ratio >= 0.9) return { verdict: "close", why: `About even: the reward is worth about ${c(reward.value)} coins and the squad costs you about ${c(totalCost)}. Do it if you want the reward itself.` };
  return { verdict: "skip", why: `The squad costs you about ${c(totalCost)} coins and the reward is worth about ${c(reward.value)}. Skip it unless you want the reward for its own sake.` };
}

/** Several challenges in a row (a set), never using one card twice. Earlier challenges get first pick. */
export function solveMany(list: { name: string; formation: string; requirements: Requirement[] }[], pool: SbcCard[], rules: ChemistryRules | null, opts: SolveOptions = {}) {
  const used = new Set(opts.exclude ?? []);
  const out: (SolveResult & { name: string })[] = [];
  for (const ch of list) {
    const r = solveSbc(ch.formation, ch.requirements, pool, rules, { ...opts, exclude: [...used] });
    // Owned cards are gone once handed in; market cards could be bought again but not as the same card.
    for (const s of r.slots) if (s.card) used.add(s.card.id);
    out.push({ name: ch.name, ...r });
  }
  return { challenges: out, total_cost: out.reduce((a, r) => a + r.total_cost, 0), buy_cost: out.reduce((a, r) => a + r.buy_cost, 0), feasible: out.every((r) => r.feasible) };
}
