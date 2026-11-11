// Card compare (Jeff, 2026-11-10): two to four cards side by side with full in-game stats, a chem style applied to
// each, the PlayStyles they share and don't, each card's best metarating at the positions they share, and FUT.GG price
// per rating point. Any card: the user's own or one from FUT.GG's card list. Read-only.
import { FutError, type FutDb } from "./service.ts";
import { ALL_STATS } from "./stats.ts";
import { CHEM_STYLES, GK_CHEM_STYLES, metaRate, type MetaCard } from "./meta.ts";
import { loadMetaCard } from "./meta-data.ts";

type Row = Record<string, unknown>;
export interface CompareInput { id: string; meta: MetaCard; price: number | null; chem_style: string | null; ea_item_id: number | null; version: string | null; owned: boolean }

const SHOWN = ALL_STATS.filter((s) => !["overall", "total_stats", "total_igs"].includes(s.key)).map((s) => ({ key: s.key, label: s.label, group: s.group }));

/** Pure: the side-by-side table, leaders per stat, PlayStyles diff, metaratings and value. */
export function compareTable(cards: CompareInput[]) {
  const positions = cards.map((c) => c.meta.positions).reduce((a, b) => a.filter((p) => b.includes(p)));
  const boosted = cards.map((c) => {
    const styles = c.meta.positions[0] === "GK" ? GK_CHEM_STYLES : CHEM_STYLES;
    const boost = c.chem_style ? styles[c.chem_style] ?? {} : {};
    const stats: Record<string, number> = { ...c.meta.stats };
    for (const [k, v] of Object.entries(boost)) if (typeof stats[k] === "number") stats[k] = Math.min(99, stats[k]! + v);
    return { ...c.meta, stats };
  });
  const rows = SHOWN.map((s) => {
    const values = boosted.map((m) => s.key === "weak_foot" ? m.weak_foot : s.key === "skill_moves" ? m.skill_moves : s.key === "height_cm" ? m.height_cm : m.stats[s.key] ?? null);
    const known = values.filter((v): v is number => typeof v === "number");
    const best = known.length >= 2 ? Math.max(...known) : null;
    return { ...s, values, leaders: best === null || known.every((v) => v === best) ? [] : values.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0) };
  }).filter((r) => r.values.some((v) => v !== null));
  const all = (c: MetaCard) => [...c.playstyles_plus.map((p) => `${p}+`), ...c.playstyles.filter((p) => !c.playstyles_plus.includes(p))];
  const sets = cards.map((c) => new Set([...c.meta.playstyles, ...c.meta.playstyles_plus]));
  const shared = [...sets[0]!].filter((p) => sets.every((s) => s.has(p))).sort();
  const results = cards.map((c, i) => {
    // Scored from the card's own stats with the chosen chem style (or the best one), never boosted twice.
    const best = metaRate(c.meta, positions.length ? positions : c.meta.positions, c.chem_style).best;
    return {
      id: c.id, name: c.meta.name, rating: c.meta.rating, version: c.version, positions: c.meta.positions, ea_item_id: c.ea_item_id, owned: c.owned,
      chem_style: c.chem_style, price: c.price, playstyles: all(c.meta), only_this: [...sets[i]!].filter((p) => !shared.includes(p)).sort(),
      meta: best, wins: rows.filter((row) => row.leaders.length === 1 && row.leaders[0] === i).length,
      price_per_rating: c.price && c.meta.rating ? Math.round(c.price / c.meta.rating) : null,
      price_per_meta: c.price && best ? Math.round(c.price / best.score) : null,
    };
  });
  const scored = results.filter((r) => r.meta);
  const top = scored.length ? scored.reduce((a, b) => (b.meta!.score > a.meta!.score ? b : a)) : null;
  const cheapest = results.filter((r) => r.price).sort((a, b) => a.price! - b.price!)[0] ?? null;
  const summary = !top ? "Not enough stats to compare."
    : `${top.name} plays best${positions.length ? ` at ${top.meta!.position}` : ""} (${top.meta!.role}, ${top.meta!.score})` + (cheapest && cheapest.id !== top.id && top.price && cheapest.price ? `; ${cheapest.name} is ${Math.round((1 - cheapest.price / top.price) * 100)}% cheaper at ${cheapest.meta?.score ?? "?"}.` : ".");
  return { shared_positions: positions, shared_playstyles: shared, cards: results, rows, summary };
}

export async function compareAnyCards(db: FutDb, userId: string, b: Row) {
  const ids = Array.isArray(b.card_ids) ? [...new Set(b.card_ids.map(String))] : [];
  if (ids.length < 2 || ids.length > 4) throw new FutError("card_ids must list 2 to 4 different cards.");
  const styles = (b.chem_styles ?? {}) as Record<string, unknown>;
  const platform = b.platform === "pc" ? "pc" : "console";
  const loaded = await Promise.all(ids.map((id) => loadMetaCard(db, userId, id)));
  const eaIds = [...new Set(loaded.map((l) => l.card.ea_item_id).filter((x): x is number => !!x))];
  const prices = new Map<number, number>();
  if (eaIds.length) {
    const { data, error } = await db.rpc("account_item_prices", { p_platform: platform, p_ids: eaIds });
    if (error) throw new FutError(`Card prices are unavailable: ${error.message}`, 500);
    for (const i of ((data as Row | null)?.items ?? []) as Row[]) if (typeof i.price === "number") prices.set(Number(i.ea_item_id), i.price);
  }
  const inputs: CompareInput[] = loaded.map(({ card, meta }) => {
    const want = styles[card.id], gk = meta.positions[0] === "GK";
    const list = gk ? GK_CHEM_STYLES : CHEM_STYLES;
    if (want !== undefined && want !== null && want !== "" && !(typeof want === "string" && want in list)) throw new FutError(`Unknown chem style for ${card.player_name}. Use one of ${Object.keys(list).join(", ")}.`);
    return { id: card.id, meta, version: card.version, owned: card.owned, ea_item_id: card.ea_item_id, price: card.ea_item_id ? prices.get(card.ea_item_id) ?? null : card.price, chem_style: typeof want === "string" && want ? want : null };
  });
  return { platform, ...compareTable(inputs), chem_styles: { outfield: Object.keys(CHEM_STYLES), gk: Object.keys(GK_CHEM_STYLES) }, note: "Chem style boosts and metaratings are GafferBot's estimates (FC 27's chem style numbers aren't confirmed). Prices are FUT.GG's.", verified: false as const };
}
