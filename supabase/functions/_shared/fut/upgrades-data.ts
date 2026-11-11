// Upgrade path data: market candidates per position (FUT.GG card list, priced within budget), the user's unused club
// cards, metaratings for both sides, and what the current cards sell for.
import { activeRules, FutError, searchMyCards, toWorkspaceCard, type FutDb } from "./service.ts";
import { cleanPlayerQuery } from "./stats.ts";
import { searchPlayers } from "./player-finder.ts";
import { metaRate } from "./meta.ts";
import { fromSearch, loadMetaCard } from "./meta-data.ts";
import { EA_TAX, planUpgrades, type Candidate } from "./upgrades.ts";
import type { Squad, WorkspaceCard } from "./xilab/workspace/index.ts";

type Row = Record<string, unknown>;
export const MAX_BUDGET = 15_000_000;
const PER_POSITION = 40;

export async function upgradeOptions(db: FutDb, userId: string, squad: Squad, b: Row) {
  const budget = Number(b.budget);
  if (!Number.isInteger(budget) || budget < 0 || budget > MAX_BUDGET) throw new FutError(`budget must be whole coins from 0 to ${MAX_BUDGET.toLocaleString("en-US")}.`);
  const platform = b.platform === "pc" ? "pc" : "console";
  if (!squad.slots.some((s) => s.card)) throw new FutError("Put some cards in the squad first.");
  const positions = [...new Set(squad.slots.filter((s) => !s.locked).map((s) => s.position.toUpperCase()))];
  const [rules, mine] = await Promise.all([activeRules(db), searchMyCards(db, userId, { all: true, owned_only: true })]);
  const inSquad = new Set(squad.slots.filter((s) => s.card).map((s) => s.card!.id));
  const candidates = new Map<string, Candidate>();
  // Market cards: for each position, the highest-rated priced cards within budget, rated at least the weakest card there.
  for (const pos of positions) {
    const weakest = Math.min(...squad.slots.filter((s) => s.position.toUpperCase() === pos).map((s) => s.card?.rating ?? 0));
    const query = cleanPlayerQuery({ positions: [pos], priced_only: true, max_price: Math.max(budget, 1), min_rating: weakest > 0 ? weakest : null, sort: "overall" });
    const res = await searchPlayers(db, userId, query, { platform, limit: PER_POSITION });
    for (const c of res.cards) {
      if (candidates.has(String(c.id)) || typeof c.price !== "number") continue;
      const m = fromSearch(c);
      const meta = Object.fromEntries(m.positions.map((p) => [p.toUpperCase(), metaRate(m, [p]).best?.score ?? 0]).filter(([, v]) => v));
      const card: WorkspaceCard = { id: String(c.id), name: m.name, club: (c.club as string) ?? null, league: (c.league as string) ?? null, nation: (c.nation as string) ?? null, positions: m.positions, is_icon: c.is_icon === true, is_hero: c.is_hero === true, rating: m.rating, price: c.price as number, owned: c.owned === true, stats: {}, source: "database" };
      candidates.set(card.id, { card, cost: c.owned === true ? 0 : c.price as number, meta });
    }
  }
  // The user's own cards not in the squad cost nothing (metarating from the face stats they have).
  for (const c of mine) {
    if (inSquad.has(c.id) || !c.positions.some((p) => positions.includes(p.toUpperCase()))) continue;
    const m = { name: c.player_name, rating: c.overall, positions: c.positions, stats: { ...c.stats } as Record<string, number>, playstyles: c.playstyles, playstyles_plus: c.playstyles_plus, height_cm: null, accelerate_type: null, weak_foot: c.weak_foot, skill_moves: c.skill_moves };
    candidates.set(c.id, { card: toWorkspaceCard(c), cost: 0, meta: Object.fromEntries(c.positions.map((p) => [p.toUpperCase(), metaRate(m, [p]).best?.score ?? 0])) });
  }
  // The current cards: metarating at their slot, and what a tradeable club card would sell for.
  const currentMeta: Record<string, number | null> = {}, sellValue: Record<string, number> = {};
  const owned = new Map(mine.map((c) => [c.id, c]));
  const eaIds: number[] = [];
  await Promise.all(squad.slots.map(async (s) => {
    if (!s.card) return;
    try { const { meta } = await loadMetaCard(db, userId, s.card.id); currentMeta[s.slot] = metaRate(meta, [s.position]).best?.score ?? null; } catch { currentMeta[s.slot] = null; }
    const o = owned.get(s.card.id);
    if (o && o.tradeable !== false && o.ea_item_id) eaIds.push(o.ea_item_id);
  }));
  if (eaIds.length) {
    const { data, error } = await db.rpc("account_item_prices", { p_platform: platform, p_ids: [...new Set(eaIds)] });
    if (!error) {
      const price = new Map((((data as Row | null)?.items ?? []) as Row[]).map((i) => [Number(i.ea_item_id), i.price as number | null]));
      for (const s of squad.slots) {
        const o = s.card ? owned.get(s.card.id) : undefined;
        const p = o?.ea_item_id ? price.get(o.ea_item_id) : null;
        if (o && o.tradeable !== false && typeof p === "number") sellValue[o.id] = Math.floor(p * (1 - EA_TAX));
      }
    }
  }
  return {
    platform, candidates: candidates.size, ...planUpgrades({ squad, rules, budget, candidates: [...candidates.values()], currentMeta, sellValue }),
    note: "Market cards at FUT.GG's latest prices; your unused club cards cost nothing. Team rating uses the community formula, metaratings are GafferBot's estimates. Nothing is bought.",
    verified: false as const,
  };
}
