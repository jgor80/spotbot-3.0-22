// Squad Builder helpers built on XI Lab's chemistry engine: the best XI from the user's club for a formation (by
// overall or by chemistry), ranked picks for one open slot, and each squad card's FC 27 player roles (+ / ++).
// Everything here only reads; nothing is saved until the user presses Save.
import { computeSquadChemistry, type ChemistryRules } from "./xilab/chemistry/index.ts";
import { FORMATIONS, type Squad, type WorkspaceCard, type WorkspaceSlot } from "./xilab/workspace/index.ts";
import { fail, type FutDb } from "./service.ts";

export type SuggestBy = "ovr" | "chem";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const plays = (card: WorkspaceCard, position: string) => card.positions.some((p) => p.toUpperCase() === position.toUpperCase());

/** Chemistry total and rating sum of the filled slots. */
function evaluate(formation: string, slots: WorkspaceSlot[], manager: Squad["manager"], rules: ChemistryRules) {
  const filled = slots.filter((s) => s.card);
  const chem = computeSquadChemistry({
    formation,
    ...(manager ? { manager: { nation: manager.nation ?? undefined, league: manager.league ?? undefined } } : {}),
    slots: filled.map((s) => ({ slot: s.slot, position: s.position, card: s.card! })),
  }, rules);
  const rating = filled.reduce((a, s) => a + (s.card!.rating ?? 0), 0);
  return { chem, total: chem.total, rating, filled: filled.length };
}

/** One number to maximise. Filling a slot always wins; then overall or chemistry first, the other breaks ties. */
function score(e: { total: number; rating: number; filled: number }, by: SuggestBy) {
  return e.filled * 1e7 + (by === "ovr" ? e.rating * 100 + e.total : e.total * 1e4 + e.rating);
}

/** The best squad's numbers, for the formation list. */
export interface BestSquad {
  formation: string;
  squad: Squad;
  chemistry: number;
  /** Average overall of the filled slots. */
  rating: number;
  filled: number;
  empty: string[];
}

/** One version per player: the game allows one, and the engine warns on two. */
function pickPool(pool: WorkspaceCard[], taken: Set<string>) {
  return pool.filter((c) => !taken.has(norm(c.name)));
}

/**
 * The best XI for one formation from the given cards. Locked slots keep their card. by "ovr": highest total overall
 * (everyone in position), chemistry breaks ties. by "chem": highest team chemistry, overall breaks ties. A greedy start
 * (plus, for chemistry, one start per big club/league/nation group) improved by single replacements and slot swaps.
 */
export function bestSquadFor(base: Squad, formation: string, pool: WorkspaceCard[], rules: ChemistryRules, by: SuggestBy, opts: { seeds?: number } = {}): BestSquad {
  const layout = FORMATIONS[formation];
  if (!layout) throw new Error(`Unknown formation "${formation}"`);
  // Locked cards stay, in a slot with the same name or else one they play.
  const locked = base.slots.filter((s) => s.locked && s.card);
  const slots: WorkspaceSlot[] = layout.map((l) => ({ slot: l.slot, position: l.position, card: null, locked: false }));
  for (const l of locked) {
    const at = slots.find((s) => !s.locked && s.slot === l.slot) ?? slots.find((s) => !s.locked && plays(l.card!, s.position)) ?? slots.find((s) => !s.locked);
    if (at) { at.card = l.card; at.locked = true; }
  }
  const taken = new Set(slots.filter((s) => s.card).map((s) => norm(s.card!.name)));
  const cards = pickPool(pool, taken);
  // Candidates per position, best first; capped so the search stays fast on a big club.
  const byPos = new Map<string, WorkspaceCard[]>();
  for (const s of slots) {
    if (byPos.has(s.position)) continue;
    byPos.set(s.position, cards.filter((c) => plays(c, s.position)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)));
  }
  const open = slots.filter((s) => !s.locked);
  // Scarce positions first, so a card that only plays there isn't used elsewhere.
  const order = [...open].sort((a, b) => byPos.get(a.position)!.length - byPos.get(b.position)!.length);

  const greedy = (prefer?: (c: WorkspaceCard) => boolean): WorkspaceSlot[] => {
    const out = slots.map((s) => ({ ...s }));
    const used = new Set(taken);
    for (const o of order) {
      const list = byPos.get(o.position)!;
      const pick = (prefer && list.find((c) => !used.has(norm(c.name)) && prefer(c))) || list.find((c) => !used.has(norm(c.name)));
      if (pick) { out.find((s) => s.slot === o.slot)!.card = pick; used.add(norm(pick.name)); }
    }
    return out;
  };

  const improve = (start: WorkspaceSlot[], limit: number): { slots: WorkspaceSlot[]; value: number } => {
    let cur = start;
    let best = score(evaluate(formation, cur, base.manager, rules), by);
    for (let round = 0; round < 6; round++) {
      let changed = false;
      for (const o of open) {
        const i = cur.findIndex((s) => s.slot === o.slot);
        const used = new Set(cur.filter((s, j) => j !== i && s.card).map((s) => norm(s.card!.name)));
        for (const c of byPos.get(o.position)!.slice(0, limit)) {
          if (used.has(norm(c.name)) || c.id === cur[i]!.card?.id) continue;
          const next = cur.map((s, j) => (j === i ? { ...s, card: c } : s));
          const v = score(evaluate(formation, next, base.manager, rules), by);
          if (v > best) { best = v; cur = next; changed = true; }
        }
      }
      // Two open slots trade cards when both still play their new position.
      for (let a = 0; a < cur.length; a++) for (let b = a + 1; b < cur.length; b++) {
        const A = cur[a]!, B = cur[b]!;
        if (A.locked || B.locked || !A.card || !B.card || !plays(A.card, B.position) || !plays(B.card, A.position)) continue;
        const next = cur.map((s, j) => (j === a ? { ...s, card: B.card } : j === b ? { ...s, card: A.card } : s));
        const v = score(evaluate(formation, next, base.manager, rules), by);
        if (v > best) { best = v; cur = next; changed = true; }
      }
      if (!changed) break;
    }
    return { slots: cur, value: best };
  };

  const starts: WorkspaceSlot[][] = [greedy()];
  if (by === "chem") {
    // Group starts: fill from the biggest leagues, nations and clubs first.
    const groups: { key: string; n: number; test: (c: WorkspaceCard) => boolean }[] = [];
    for (const t of ["league", "nation", "club"] as const) {
      const counts = new Map<string, number>();
      for (const c of cards) { const k = c[t]; if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
      for (const [k, n] of counts) if (n >= 3) groups.push({ key: `${t}:${k}`, n, test: (c) => c[t] === k });
    }
    groups.sort((a, b) => b.n - a.n);
    for (const g of groups.slice(0, opts.seeds ?? 8)) starts.push(greedy(g.test));
  }
  const limit = by === "chem" ? 40 : 25;
  let winner = improve(starts[0]!, limit);
  for (const s of starts.slice(1)) {
    const r = improve(s, limit);
    if (r.value > winner.value) winner = r;
  }
  const e = evaluate(formation, winner.slots, base.manager, rules);
  const squad: Squad = { ...base, formation, slots: winner.slots, updated_at: new Date().toISOString() };
  return {
    formation, squad, chemistry: e.total, rating: e.filled ? Math.round(e.rating / e.filled) : 0, filled: e.filled,
    empty: winner.slots.filter((s) => !s.card).map((s) => s.slot),
  };
}

/** The best squad for one formation, or for every formation (best first). */
export function bestSquads(base: Squad, formation: string | "all", pool: WorkspaceCard[], rules: ChemistryRules, by: SuggestBy): BestSquad[] {
  if (formation !== "all") return [bestSquadFor(base, formation, pool, rules, by)];
  const all = Object.keys(FORMATIONS).map((f) => bestSquadFor(base, f, pool, rules, by, { seeds: 4 }));
  const key = (b: BestSquad) => b.filled * 1e7 + (by === "ovr" ? b.rating * 1e3 + b.chemistry : b.chemistry * 1e4 + b.rating);
  return all.sort((a, b) => key(b) - key(a));
}

export interface SlotSuggestion {
  card: WorkspaceCard;
  /** Team chemistry with this card in the slot. */
  team_chemistry: number;
  /** The card's own chemistry there (0-3). */
  chemistry: number;
  change: number;
}

/** Ranked cards for one slot, from cards that play its position and aren't already in the squad. */
export function suggestForSlot(squad: Squad, slot: string, pool: WorkspaceCard[], rules: ChemistryRules, by: SuggestBy, limit = 12): { slot: string; position: string; before: number; suggestions: SlotSuggestion[] } {
  const i = squad.slots.findIndex((s) => s.slot === slot);
  if (i < 0) throw new Error(`No slot "${slot}" in ${squad.formation}`);
  const target = squad.slots[i]!;
  const before = evaluate(squad.formation, squad.slots, squad.manager, rules).total;
  const taken = new Set(squad.slots.filter((s, j) => j !== i && s.card).map((s) => norm(s.card!.name)));
  const out: SlotSuggestion[] = [];
  for (const c of pickPool(pool, taken)) {
    if (!plays(c, target.position) || c.id === target.card?.id) continue;
    const next = squad.slots.map((s, j) => (j === i ? { ...s, card: c } : s));
    const e = evaluate(squad.formation, next, squad.manager, rules);
    out.push({ card: c, team_chemistry: e.total, chemistry: e.chem.players.find((p) => p.slot === slot)?.chemistry ?? 0, change: e.total - before });
  }
  out.sort((a, b) => by === "ovr"
    ? (b.card.rating ?? 0) - (a.card.rating ?? 0) || b.team_chemistry - a.team_chemistry
    : b.team_chemistry - a.team_chemistry || (b.card.rating ?? 0) - (a.card.rating ?? 0));
  return { slot, position: target.position, before, suggestions: out.slice(0, limit) };
}

export interface CardRole { position: string; role: string; level: "plus" | "plusplus" }

/**
 * FC 27 player roles (+ / ++) for each card in the squad, from FUT.GG's card data. A club card has no roles of its
 * own, so it borrows the catalogue card with the same EA item id.
 */
export async function squadRoles(db: FutDb, userId: string, squad: Squad): Promise<Record<string, { position: string; roles: CardRole[] }>> {
  const ids = [...new Set(squad.slots.flatMap((s) => (s.card && /^[0-9a-f-]{36}$/i.test(s.card.id) ? [s.card.id] : [])))];
  const out: Record<string, { position: string; roles: CardRole[] }> = {};
  for (const s of squad.slots) out[s.slot] = { position: s.position, roles: [] };
  if (!ids.length) return out;
  const { data: rows, error } = await db.from("player_cards").select("id, owner_user_id, source_id, source_card_key").in("id", ids);
  fail(error);
  const visible = ((rows ?? []) as Record<string, unknown>[]).filter((r) => r.owner_user_id === null || r.owner_user_id === userId);
  // Club cards → the catalogue row with the same EA item id.
  const keys = [...new Set(visible.filter((r) => r.source_id !== "futgg_catalogue" && /^\d{1,10}$/.test(String(r.source_card_key ?? ""))).map((r) => String(r.source_card_key)))];
  const catalogue = new Map<string, string>();
  if (keys.length) {
    const { data, error: e } = await db.from("player_cards").select("id, source_card_key").eq("source_id", "futgg_catalogue").is("owner_user_id", null).in("source_card_key", keys);
    fail(e);
    for (const r of (data ?? []) as Record<string, unknown>[]) catalogue.set(String(r.source_card_key), r.id as string);
  }
  const roleCard = new Map<string, string>();
  for (const r of visible) roleCard.set(r.id as string, r.source_id === "futgg_catalogue" ? r.id as string : catalogue.get(String(r.source_card_key)) ?? r.id as string);
  const lookup = [...new Set(roleCard.values())];
  const { data: roles, error: re } = await db.from("card_roles").select("card_id, position_code, role, level").in("card_id", lookup);
  fail(re);
  const byCard = new Map<string, CardRole[]>();
  for (const r of (roles ?? []) as Record<string, unknown>[]) {
    const list = byCard.get(r.card_id as string) ?? [];
    list.push({ position: r.position_code as string, role: r.role as string, level: r.level as CardRole["level"] });
    byCard.set(r.card_id as string, list);
  }
  for (const s of squad.slots) {
    if (!s.card) continue;
    const all = byCard.get(roleCard.get(s.card.id) ?? "") ?? [];
    out[s.slot] = {
      position: s.position,
      roles: all.filter((r) => r.position === s.position).sort((a, b) => (a.level === b.level ? a.role.localeCompare(b.role) : a.level === "plusplus" ? -1 : 1)),
    };
  }
  return out;
}
