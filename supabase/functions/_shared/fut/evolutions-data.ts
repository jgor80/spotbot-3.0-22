// Evolutions finder data: the user's club cards (face stats and PlayStyles borrowed from the FUT.GG catalogue card
// with the same EA item id when the club file lacks them), the evolutions the helper saw, and the latest squad.
import { fail, FutError, latestSquadId, searchMyCards, workspaceFor, type FutDb } from "./service.ts";
import { fromEa, matchEvolution, parseEvolutionText, describeRule, describeUpgrade, type EaEvolution, type EvoCard, type Evolution, type SquadSlotLite } from "./evolutions.ts";

type Row = Record<string, unknown>;
type Platform = "console" | "pc";
const FACE = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
const CHUNK = 100;

/** Club cards as evolution cards, filling face stats and PlayStyles from the catalogue copy of the same EA item. */
export async function evoCards(db: FutDb, userId: string): Promise<EvoCard[]> {
  const mine = await searchMyCards(db, userId, { all: true, owned_only: true });
  const keys = [...new Set(mine.map((c) => c.ea_item_id).filter((x): x is number => !!x).map(String))];
  const catBy = new Map<string, string>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const { data, error } = await db.from("player_cards").select("id, source_card_key").eq("source_id", "futgg_catalogue").is("owner_user_id", null).in("source_card_key", keys.slice(i, i + CHUNK));
    fail(error);
    for (const r of (data ?? []) as Row[]) catBy.set(String(r.source_card_key), r.id as string);
  }
  const catIds = [...new Set(catBy.values())];
  const attrs = new Map<string, Row>(), styles = new Map<string, Row[]>();
  for (let i = 0; i < catIds.length; i += CHUNK) {
    const part = catIds.slice(i, i + CHUNK);
    const [a, s] = await Promise.all([db.from("card_attributes").select("*").in("card_id", part), db.from("card_playstyles").select("*").in("card_id", part)]);
    fail(a.error); fail(s.error);
    for (const r of (a.data ?? []) as Row[]) attrs.set(r.card_id as string, r);
    for (const r of (s.data ?? []) as Row[]) styles.set(r.card_id as string, [...(styles.get(r.card_id as string) ?? []), r]);
  }
  return mine.map((c) => {
    const cat = c.ea_item_id ? catBy.get(String(c.ea_item_id)) : undefined;
    const a = cat ? attrs.get(cat) : undefined, st = cat ? styles.get(cat) ?? [] : [];
    const stats: EvoCard["stats"] = { ...c.stats };
    if (a) for (const k of FACE) if (stats[k] === undefined && typeof a[k] === "number") stats[k] = a[k] as number;
    return {
      id: c.id, name: c.player_name, version: c.version, overall: c.overall, positions: c.positions, league: c.league, nation: c.nation, club: c.club,
      is_icon: c.is_icon, is_hero: c.is_hero, stats, skill_moves: c.skill_moves, weak_foot: c.weak_foot,
      playstyles: c.playstyles.length || c.playstyles_plus.length ? c.playstyles : st.filter((x) => !x.is_plus).map((x) => x.name as string),
      playstyles_plus: c.playstyles.length || c.playstyles_plus.length ? c.playstyles_plus : st.filter((x) => x.is_plus).map((x) => x.name as string),
      ea_item_id: c.ea_item_id, untradeable: c.tradeable === false,
    };
  });
}

async function squadSlots(db: FutDb, userId: string): Promise<{ name: string | null; slots: SquadSlotLite[] }> {
  const id = await latestSquadId(db, userId);
  if (!id) return { name: null, slots: [] };
  const squad = await (await workspaceFor(db)).getSquad(userId, id);
  return { name: squad.name ?? null, slots: squad.slots.map((s) => ({ slot: s.slot, position: s.position, rating: s.card?.rating ?? null, card_id: s.card?.id ?? null })) };
}

async function eaNames(db: FutDb, evos: EaEvolution[]) {
  const want = { leagues: new Set<number>(), nations: new Set<number>(), clubs: new Set<number>() };
  for (const e of evos) for (const r of e.requirements) {
    const t = /LEAGUE/.test(r.type) ? "leagues" : /NATION/.test(r.type) ? "nations" : /CLUB|TEAM/.test(r.type) ? "clubs" : null;
    if (t) for (const v of r.values) if (typeof v === "number") want[t].add(v);
  }
  const out = { leagues: new Map<number, string>(), nations: new Map<number, string>(), clubs: new Map<number, string>() };
  for (const t of ["leagues", "nations", "clubs"] as const) {
    const ids = [...want[t]].slice(0, 200);
    if (!ids.length) continue;
    const { data, error } = await db.from(t).select("ea_id, name").in("ea_id", ids);
    fail(error);
    for (const r of (data ?? []) as Row[]) if (typeof r.name === "string") out[t].set(Number(r.ea_id), r.name);
  }
  return out;
}

const present = (evo: Evolution, cards: EvoCard[], slots: SquadSlotLite[]) => ({
  ...evo, rule_lines: evo.rules.map(describeRule), level_lines: evo.levels.map((l) => l.map(describeUpgrade)),
  ...matchEvolution(evo, cards, slots),
});

/** Every live evolution the helper saw, with the user's best club cards for each. */
export async function evolutionsOverview(db: FutDb, userId: string, platform: Platform, now = Date.now()) {
  const { data, error } = await db.from("account_state").select("evolutions, evolutions_at, shape").eq("user_id", userId).eq("platform", platform).maybeSingle();
  fail(error);
  const raw = (((data as Row | null)?.evolutions ?? []) as EaEvolution[]).filter((e) => !e.end_at || Date.parse(e.end_at) > now);
  const [cards, squad, names] = await Promise.all([evoCards(db, userId), squadSlots(db, userId), eaNames(db, raw)]);
  const evos = raw.map((e) => present(fromEa(e, names), cards, squad.slots));
  // Best evolution for each card that gains a starting place, so "what should I evolve?" has one answer per card.
  const byCard = new Map<string, { card_id: string; name: string; evolution: string; gain: number; after: number; slot: string | null }>();
  for (const e of evos) for (const m of e.matches) {
    if (m.eligible !== true || m.squad.gain <= 0) continue;
    const had = byCard.get(m.card.id);
    if (!had || m.squad.gain > had.gain) byCard.set(m.card.id, { card_id: m.card.id, name: m.card.name, evolution: e.name, gain: m.squad.gain, after: m.after.overall, slot: m.squad.slot });
  }
  const shape = ((data as Row | null)?.shape ?? {}) as Record<string, string[]>;
  return {
    platform, seen_at: ((data as Row | null)?.evolutions_at as string | null) ?? null, club_cards: cards.length, squad: squad.name,
    evolutions: evos.sort((a, b) => (b.matches[0]?.squad.gain ?? 0) - (a.matches[0]?.squad.gain ?? 0) || b.eligible - a.eligible),
    best_upgrades: [...byCard.values()].sort((a, b) => b.gain - a.gain).slice(0, 10),
    shape: Object.fromEntries(Object.entries(shape).filter(([k]) => /^evolution|^academy/.test(k))),
    verified: false as const,
  };
}

/** One evolution the user pasted (requirements and upgrades as text), matched to their club. */
export async function checkPastedEvolution(db: FutDb, userId: string, b: Row) {
  const rules = typeof b.requirements === "string" ? b.requirements.slice(0, 4000) : "";
  const ups = typeof b.upgrades === "string" ? b.upgrades.slice(0, 4000) : "";
  if (!rules.trim() && !ups.trim()) throw new FutError("Paste the evolution's requirements and upgrades.");
  const evo = parseEvolutionText(typeof b.name === "string" ? b.name : "", rules, ups);
  if (!evo.rules.length && !evo.levels.length) throw new FutError("Couldn't read any requirements or upgrades from that text.");
  const [cards, squad] = await Promise.all([evoCards(db, userId), squadSlots(db, userId)]);
  return { club_cards: cards.length, squad: squad.name, evolution: present(evo, cards, squad.slots), verified: false as const };
}
