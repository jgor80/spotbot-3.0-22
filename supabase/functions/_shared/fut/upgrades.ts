// Upgrade path for my budget (Jeff, 2026-11-10): "I have 120k, what's the best upgrade?" For each slot of the squad,
// market cards within budget (FUT.GG prices) and the user's own unused club cards (free), scored by the change in
// team rating, team chemistry and metarating at that position; then the best pairs of swaps tried together, since
// chemistry links change when two cards move. Read-only: nothing is bought or saved.
import type { ChemistryRules } from "./xilab/chemistry/index.ts";
import type { Squad, WorkspaceCard } from "./xilab/workspace/index.ts";
import { evaluate } from "./squad-suggest.ts";
import { teamRating } from "./sbc.ts";

export const EA_TAX = 0.05;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const plays = (c: WorkspaceCard, position: string) => c.positions.some((p) => p.toUpperCase() === position.toUpperCase());

export interface Candidate { card: WorkspaceCard; cost: number; meta: Record<string, number> }
export interface Swap { slot: string; position: string; out: { id: string | null; name: string | null; rating: number | null; meta: number | null; sells_for: number | null }; in: { id: string; name: string; rating: number | null; owned: boolean; meta: number | null; card: WorkspaceCard }; cost: number }
export interface Plan { swaps: Swap[]; cost: number; net_cost: number; rating_before: number; rating_after: number; chem_before: number; chem_after: number; meta_gain: number | null; gain: number; per_10k: number | null }

/** One number to rank by: team rating counts most, then chemistry, then how much better the new cards play there,
 * then the raw overall points added (so a +4 card counts even when the rounded team rating doesn't move). */
export const gainOf = (dRating: number, dChem: number, dMeta: number | null, dOverall = 0) => Math.round((dRating * 8 + dChem * 1.5 + (dMeta ?? 0) * 0.6 + dOverall * 0.25) * 10) / 10;

export interface UpgradeInput {
  squad: Squad; rules: ChemistryRules; budget: number; candidates: Candidate[];
  /** Metarating of each current squad card at its slot (by slot), when its stats are known. */
  currentMeta: Record<string, number | null>;
  /** What each current card sells for after tax (by card id), when it's a tradeable club card with a price. */
  sellValue: Record<string, number>;
}

/** Single swaps and the best pairs within budget, best gain first. Pure. */
export function planUpgrades(x: UpgradeInput, limits = { singles: 15, pairs: 10, pairPool: 30 }) {
  const { squad, rules, budget } = x;
  const ratings = (slots: Squad["slots"]) => slots.filter((s) => s.card).map((s) => s.card!.rating ?? 0);
  const base = evaluate(squad.formation, squad.slots, squad.manager, rules);
  const before = { rating: teamRating(ratings(squad.slots)), chem: base.total };
  const apply = (swaps: { i: number; c: Candidate }[]): Plan | null => {
    const slots = squad.slots.map((s, i) => { const w = swaps.find((x) => x.i === i); return w ? { ...s, card: w.c.card } : s; });
    const names = slots.filter((s) => s.card).map((s) => norm(s.card!.name));
    if (new Set(names).size !== names.length) return null; // one version per player
    const e = evaluate(squad.formation, slots, squad.manager, rules);
    const after = { rating: teamRating(ratings(slots)), chem: e.total };
    const out: Swap[] = swaps.map(({ i, c }) => {
      const s = squad.slots[i]!;
      return {
        slot: s.slot, position: s.position, cost: c.cost,
        out: { id: s.card?.id ?? null, name: s.card?.name ?? null, rating: s.card?.rating ?? null, meta: x.currentMeta[s.slot] ?? null, sells_for: s.card ? x.sellValue[s.card.id] ?? null : null },
        in: { id: c.card.id, name: c.card.name, rating: c.card.rating ?? null, owned: c.card.owned === true, meta: c.meta[s.position] ?? null, card: c.card },
      };
    });
    const metaKnown = out.every((w) => w.in.meta !== null && (w.out.meta !== null || w.out.id === null));
    const metaGain = metaKnown ? out.reduce((n, w) => n + (w.in.meta! - (w.out.meta ?? 0)), 0) : null;
    const cost = out.reduce((n, w) => n + w.cost, 0);
    const dOverall = out.reduce((n, w) => n + (w.in.rating ?? 0) - (w.out.rating ?? 0), 0);
    const gain = gainOf(after.rating - before.rating, after.chem - before.chem, metaGain, dOverall);
    return {
      swaps: out, cost, net_cost: Math.max(0, cost - out.reduce((n, w) => n + (w.out.sells_for ?? 0), 0)),
      rating_before: before.rating, rating_after: after.rating, chem_before: before.chem, chem_after: after.chem, meta_gain: metaGain, gain,
      per_10k: cost > 0 ? Math.round((gain / cost) * 10_000 * 10) / 10 : null,
    };
  };
  const singles: (Plan & { key: { i: number; c: Candidate } })[] = [];
  squad.slots.forEach((s, i) => {
    if (s.locked) return;
    for (const c of x.candidates) {
      if (c.cost > budget || c.card.id === s.card?.id || !plays(c.card, s.position)) continue;
      const p = apply([{ i, c }]);
      if (p && p.gain > 0) singles.push({ ...p, key: { i, c } });
    }
  });
  const rank = (a: Plan, b: Plan) => b.gain - a.gain || a.cost - b.cost;
  singles.sort(rank);
  // Pairs from the strongest singles: two different slots, two different players, within budget.
  const pool = singles.slice(0, limits.pairPool), pairs: Plan[] = [];
  for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) {
    const p1 = pool[a]!.key, p2 = pool[b]!.key;
    if (p1.i === p2.i || norm(p1.c.card.name) === norm(p2.c.card.name) || p1.c.cost + p2.c.cost > budget) continue;
    const p = apply([p1, p2]);
    if (p && p.gain > Math.max(pool[a]!.gain, pool[b]!.gain)) pairs.push(p);
  }
  pairs.sort(rank);
  const strip = ({ key: _k, ...p }: Plan & { key?: unknown }) => p as Plan;
  // One line per slot in the singles list: the best option there, plus the best free (club) option if different.
  const seen = new Map<string, number>(), shown: Plan[] = [];
  for (const p of singles) { const k = p.swaps[0]!.slot; const n = seen.get(k) ?? 0; if (n < 2) { shown.push(strip(p)); seen.set(k, n + 1); } if (shown.length >= limits.singles) break; }
  const best = [...pairs.slice(0, 1), ...shown.slice(0, 1)].sort(rank)[0] ?? null;
  const free = singles.filter((p) => p.cost === 0).slice(0, 5).map(strip);
  return { before, budget, best, singles: shown, pairs: pairs.slice(0, limits.pairs), free };
}
