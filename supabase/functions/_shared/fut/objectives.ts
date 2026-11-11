// Objectives planner (Jeff, 2026-11-10): from the objectives the helper captured (or pasted text), read the player
// requirements ("with at least 3 Premier League players in your starting XI", "using a Brazilian player") and
// suggest one XI from the user's club that covers as many of them at once as possible, so a few Squad Battles or
// Rivals games tick off several objectives together. EA's FC 27 objective wording is unverified: lines GafferBot
// can't read are listed as such, never guessed. Read-only: nothing is played or claimed.
import type { ChemistryRules } from "./xilab/chemistry/index.ts";
import type { Squad, WorkspaceCard } from "./xilab/workspace/index.ts";
import { bestSquadFor, evaluate } from "./squad-suggest.ts";
import { teamRating } from "./sbc.ts";
import { activeRules, fail, FutError, latestSquadId, searchMyCards, toWorkspaceCard, workspaceFor, type FutDb } from "./service.ts";
import { FORMATIONS } from "./xilab/workspace/formations.ts";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11 };

/** Common demonyms → nation names as EA spells them. */
const DEMONYMS: Record<string, string> = {
  english: "England", french: "France", german: "Germany", spanish: "Spain", italian: "Italy", brazilian: "Brazil", argentine: "Argentina", argentinian: "Argentina",
  portuguese: "Portugal", dutch: "Netherlands", belgian: "Belgium", croatian: "Croatia", scottish: "Scotland", welsh: "Wales", irish: "Republic of Ireland",
  american: "United States", mexican: "Mexico", japanese: "Japan", korean: "Korea Republic", nigerian: "Nigeria", senegalese: "Senegal", moroccan: "Morocco",
  egyptian: "Egypt", ghanaian: "Ghana", ivorian: "Côte d'Ivoire", cameroonian: "Cameroon", algerian: "Algeria", uruguayan: "Uruguay", colombian: "Colombia",
  chilean: "Chile", ecuadorian: "Ecuador", turkish: "Türkiye", polish: "Poland", swedish: "Sweden", norwegian: "Norway", danish: "Denmark", swiss: "Switzerland",
  austrian: "Austria", czech: "Czechia", serbian: "Serbia", ukrainian: "Ukraine", canadian: "Canada", australian: "Australia", greek: "Greece", hungarian: "Hungary",
};
const MODES: [RegExp, string][] = [[/squad battles?/i, "Squad Battles"], [/rivals?/i, "Rivals"], [/champions|champs/i, "Champions"], [/friendl(y|ies)|live events?/i, "Friendlies"], [/draft/i, "Draft"]];

export type ReqKind = "league" | "nation" | "club" | "icon" | "hero" | "version";
export interface PlayerReq { count: number; kind: ReqKind; value: string; starting: boolean }
export interface ObjectiveIn { id?: number | null; name: string; group?: string | null; progress?: number | null; target?: number | null; done?: boolean; end_at?: string | null; xp?: number | null }
export interface Meta { leagues: string[]; nations: string[]; clubs: string[]; versions: string[] }

/** Match a phrase from an objective to a league, nation, club or version the user's cards have. */
function resolve(phrase: string, meta: Meta): { kind: ReqKind; value: string } | null {
  const p = norm(phrase).replace(/\b(the|players?|from|cards?)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!p) return null;
  if (/^icons?$/.test(p)) return { kind: "icon", value: "Icon" };
  if (/^heroes?$/.test(p)) return { kind: "hero", value: "Hero" };
  const demonym = DEMONYMS[p];
  if (demonym) return { kind: "nation", value: demonym };
  const find = (list: string[]) => list.find((x) => norm(x) === p) ?? list.find((x) => p.length >= 3 && (norm(x).includes(p) || p.includes(norm(x))));
  for (const [kind, list] of [["league", meta.leagues], ["nation", meta.nations], ["club", meta.clubs], ["version", meta.versions]] as const) {
    const hit = find(list);
    if (hit) return { kind, value: hit };
  }
  return null;
}

/** The player requirement in one objective line, or null with the reason. Pure. */
export function parseRequirement(name: string, meta: Meta): { req: PlayerReq | null; reason: string | null } {
  const text = name.replace(/\s+/g, " ").trim();
  const starting = /starting (xi|11|lineup|line-up|eleven)|in your lineup|in your xi/i.test(text);
  const count = (s: string | undefined) => (s === undefined ? 1 : /^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()] ?? 1);
  const patterns: RegExp[] = [
    /(?:with|using|have|has|field|include)\s+(?:at least\s+|a minimum of\s+|min\.?\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven)?\s*players?\s+from\s+(?:the\s+)?(.+?)(?=\s+(?:in|on|across|during|while|to)\b|[,.;]|$)/i,
    /(?:with|using|have|has|field|include)\s+(?:at least\s+|a minimum of\s+|min\.?\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven)?\s*(.+?)\s+players?\b/i,

    /(?:with|using|have|has|field|include)\s+(?:at least\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven)?\s*(icons?|heroes?)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = count(m[1]);
    const r = resolve(m[2]!, meta);
    if (r && n >= 1 && n <= 11) return { req: { count: n, ...r, starting }, reason: null };
    if (!r) return { req: null, reason: `GafferBot couldn't match "${m[2]!.trim()}" to a league, nation, club or card type in your club.` };
  }
  return { req: null, reason: /players?/i.test(text) ? "No player requirement GafferBot can read in this objective." : null };
}

export const modeOf = (o: ObjectiveIn) => MODES.find(([re]) => re.test(`${o.name} ${o.group ?? ""}`))?.[1] ?? null;

export interface PoolCard { card: WorkspaceCard; version: string | null }
export const meets = (c: PoolCard, r: PlayerReq) =>
  r.kind === "icon" ? c.card.is_icon === true : r.kind === "hero" ? c.card.is_hero === true
    : norm(String((r.kind === "version" ? c.version : c.card[r.kind]) ?? "")) === norm(r.value);
const plays = (c: WorkspaceCard, position: string) => c.positions.some((p) => p.toUpperCase() === position.toUpperCase());

export interface PlannedObjective { name: string; group: string | null; mode: string | null; end_at: string | null; xp: number | null; requirement: PlayerReq | null; status: "covered" | "short" | "no_requirement" | "unreadable"; players: string[]; note: string }

/**
 * One XI that covers as many readable player requirements as possible: start from the best-overall XI, then for each
 * requirement (soonest ending first) swap in matching cards where they cost the least overall, never removing a card
 * another covered requirement needs. Pure.
 */
export function planObjectives(objectives: ObjectiveIn[], pool: PoolCard[], formation: string, rules: ChemistryRules, base: Squad) {
  const meta: Meta = {
    leagues: [...new Set(pool.map((c) => c.card.league).filter((x): x is string => !!x))],
    nations: [...new Set(pool.map((c) => c.card.nation).filter((x): x is string => !!x))],
    clubs: [...new Set(pool.map((c) => c.card.club).filter((x): x is string => !!x))],
    versions: [...new Set(pool.map((c) => c.version).filter((x): x is string => !!x))],
  };
  const open = objectives.filter((o) => !o.done);
  const parsed = open.map((o) => ({ o, ...parseRequirement(o.name, meta) }))
    .sort((a, b) => (a.o.end_at ?? "~").localeCompare(b.o.end_at ?? "~") || (b.o.xp ?? 0) - (a.o.xp ?? 0));
  const byId = new Map(pool.map((c) => [c.card.id, c]));
  const start = bestSquadFor(base, formation, pool.map((c) => c.card), rules, "ovr");
  const slots = start.squad.slots.map((s) => ({ ...s }));
  const protectedIds = new Set<string>();
  const results = new Map<ObjectiveIn, PlannedObjective>();
  const inXi = () => new Set(slots.filter((s) => s.card).map((s) => s.card!.id));
  const names = () => new Set(slots.filter((s) => s.card).map((s) => norm(s.card!.name)));

  for (const p of parsed) {
    const base0 = { name: p.o.name, group: p.o.group ?? null, mode: modeOf(p.o), end_at: p.o.end_at ?? null, xp: p.o.xp ?? null, requirement: p.req };
    if (!p.req) { results.set(p.o, { ...base0, status: p.reason ? "unreadable" : "no_requirement", players: [], note: p.reason ?? "Nothing about which players to use: any XI works." }); continue; }
    const req = p.req;
    const matching = () => slots.filter((s) => s.card && byId.get(s.card.id) && meets(byId.get(s.card.id)!, req));
    const snapshot = slots.map((s) => ({ ...s }));
    const added: string[] = [];
    while (matching().length < req.count) {
      const taken = inXi(), takenNames = names();
      let best: { i: number; c: PoolCard; loss: number } | null = null;
      for (const c of pool) {
        if (!meets(c, req) || taken.has(c.card.id) || takenNames.has(norm(c.card.name))) continue;
        slots.forEach((s, i) => {
          if (s.locked || !plays(c.card, s.position)) return;
          if (s.card && (protectedIds.has(s.card.id) || meets(byId.get(s.card.id) ?? { card: s.card, version: null }, req))) return;
          const loss = (s.card?.rating ?? 0) - (c.card.rating ?? 0);
          if (!best || loss < best.loss) best = { i, c, loss };
        });
      }
      if (!best) break;
      const b = best as { i: number; c: PoolCard; loss: number };
      slots[b.i] = { ...slots[b.i]!, card: b.c.card };
      added.push(b.c.card.name);
    }
    const have = matching();
    if (have.length >= req.count) {
      for (const s of have.slice(0, req.count)) protectedIds.add(s.card!.id);
      results.set(p.o, { ...base0, status: "covered", players: have.slice(0, req.count).map((s) => s.card!.name), note: added.length ? `Swapped in ${added.join(", ")}.` : "Your best XI already has them." });
    } else {
      slots.splice(0, slots.length, ...snapshot);
      const total = pool.filter((c) => meets(c, req)).length;
      results.set(p.o, { ...base0, status: "short", players: [], note: total < req.count ? `You have ${total} ${req.value} card${total === 1 ? "" : "s"}; it needs ${req.count}.` : `Your ${req.value} cards don't fit this formation's positions alongside the other objectives.` });
    }
  }
  const e = evaluate(formation, slots, base.manager, rules);
  const ratings = slots.filter((s) => s.card).map((s) => s.card!.rating ?? 0);
  const planned = parsed.map((p) => results.get(p.o)!);
  const covered = planned.filter((x) => x.status === "covered");
  const modes = [...new Set(covered.map((x) => x.mode ?? "any mode"))];
  return {
    formation, squad: { ...base, formation, slots },
    rating: teamRating(ratings), chemistry: e.total,
    covered: covered.length, open: open.length, done: objectives.length - open.length,
    headline: covered.length ? `This XI covers ${covered.length} objective${covered.length === 1 ? "" : "s"} at once${modes.length ? ` (${modes.join(", ")})` : ""}.` : open.length ? "None of your open objectives has a player requirement GafferBot can cover from your club." : "No open objectives.",
    objectives: planned,
  };
}

// ---------- Data ----------

/** Objectives from the helper's capture (or pasted lines), the user's club cards, and one plan. */
export async function objectivesPlan(db: FutDb, userId: string, platform: "console" | "pc", b: Record<string, unknown>) {
  let objectives: ObjectiveIn[] = [], seenAt: string | null = null, source: "helper" | "text" = "helper";
  if (typeof b.text === "string" && b.text.trim()) {
    if (b.text.length > 20_000) throw new FutError("Paste at most 20,000 characters.");
    source = "text";
    objectives = b.text.split(/\r?\n/).map((l) => l.replace(/^[\s*•\-\d.)]+/, "").trim()).filter((l) => l.length >= 6).slice(0, 200).map((name) => ({ name }));
    if (!objectives.length) throw new FutError("Paste one objective per line.");
  } else {
    const { data, error } = await db.from("account_state").select("objectives, objectives_at").eq("user_id", userId).eq("platform", platform).maybeSingle();
    fail(error);
    objectives = Array.isArray((data as Record<string, unknown> | null)?.objectives) ? (data as { objectives: ObjectiveIn[] }).objectives.filter((o) => o && typeof o.name === "string") : [];
    seenAt = ((data as Record<string, unknown> | null)?.objectives_at as string | null) ?? null;
  }
  let formation = typeof b.formation === "string" ? b.formation : null;
  if (formation && !FORMATIONS[formation]) throw new FutError(`formation must be one of: ${Object.keys(FORMATIONS).join(", ")}.`);
  if (!formation) {
    const id = await latestSquadId(db, userId);
    formation = id ? (await (await workspaceFor(db)).getSquad(userId, id)).formation : "4-3-3";
  }
  const [rules, mine] = await Promise.all([activeRules(db), searchMyCards(db, userId, { all: true, owned_only: true })]);
  const base = { id: "objectives", owner_id: userId, name: "Objectives XI", formation, manager: null, slots: [], budget: 0 } as unknown as Squad;
  const note = "Requirements read from the objective's wording (EA's FC 27 wording is unverified); objectives about goals, wins or modes only need you to play. Your best-overall XI is the starting point. Nothing is played or claimed.";
  if (!objectives.length) return { platform, source, seen_at: seenAt, club_cards: mine.length, formation, squad: null, rating: null, chemistry: null, covered: 0, open: 0, done: 0, headline: source === "helper" ? "No objectives from the helper yet. Open Objectives in the EA Web App with the helper on, or paste them." : "No objectives.", objectives: [], note, verified: false as const };
  if (!mine.length) throw new FutError("You have no club cards yet. Sync your club first.");
  const plan = planObjectives(objectives, mine.map((c) => ({ card: toWorkspaceCard(c), version: c.version })), formation, rules, base);
  return { platform, source, seen_at: seenAt, club_cards: mine.length, ...plan, note, verified: false as const };
}
