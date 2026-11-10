// Metaratings data: one card's stats from the FUT.GG catalogue copy (or the user's own card), and the best cards for a
// position and role, pre-ranked by the player search's weighted fit and then scored in full here.
import { FutError, getCard, type FutDb } from "./service.ts";
import { cleanPlayerQuery } from "./stats.ts";
import { searchPlayers } from "./player-finder.ts";
import { META_POSITIONS, metaRate, roleWeights, rolesFor, type MetaCard } from "./meta.ts";

type Row = Record<string, unknown>;
type Platform = "console" | "pc";
const nums = (o: unknown): Record<string, number> => Object.fromEntries(Object.entries((o ?? {}) as Row).filter(([, v]) => typeof v === "number")) as Record<string, number>;

/** A row from the player search as a MetaCard. */
export const fromSearch = (c: Row): MetaCard => ({
  name: String(c.player_name), rating: Number(c.overall), positions: [String(c.position), ...((c.alt_positions ?? []) as string[])].filter(Boolean),
  stats: nums(c.stats), playstyles: (c.playstyles ?? []) as string[], playstyles_plus: (c.playstyles_plus ?? []) as string[],
  height_cm: (c.height_cm as number | null) ?? null, accelerate_type: (c.accelerate_type as string | null) ?? null,
  weak_foot: (c.weak_foot as number | null) ?? null, skill_moves: (c.skill_moves as number | null) ?? null,
});

/** One card (the user's own or a catalogue card) with full stats borrowed from the catalogue copy of the same EA item. */
export async function loadMetaCard(db: FutDb, userId: string, cardId: string) {
  const card = await getCard(db, userId, cardId);
  if (!card) throw new FutError("Card not found.", 404);
  let source = card.id, alt: string[] = [], height: number | null = null, accel: string | null = null, stats: Record<string, number> = { ...card.stats } as Record<string, number>;
  let ps = card.playstyles, psp = card.playstyles_plus;
  if (card.ea_item_id) {
    const { data, error } = await db.from("player_cards").select("id").eq("source_id", "futgg_catalogue").is("owner_user_id", null).eq("source_card_key", String(card.ea_item_id)).limit(1);
    if (error) throw new FutError(`Card stats are unavailable: ${error.message}`, 500);
    const cat = ((data ?? []) as Row[])[0]?.id as string | undefined;
    if (cat) source = cat;
  }
  const [a, s] = await Promise.all([db.from("card_attributes").select("*").eq("card_id", source).maybeSingle(), db.from("card_playstyles").select("*").eq("card_id", source)]);
  if (a.error || s.error) throw new FutError(`Card stats are unavailable: ${(a.error ?? s.error).message}`, 500);
  const attr = (a.data ?? null) as Row | null;
  if (attr) {
    stats = { ...nums(attr.detail), ...Object.fromEntries(["pac", "sho", "pas", "dri", "def", "phy"].filter((k) => typeof attr[k] === "number").map((k) => [k, attr[k] as number])), ...stats };
    alt = Array.isArray(attr.alt_positions) ? attr.alt_positions as string[] : [];
    height = (attr.height_cm as number | null) ?? null; accel = (attr.accelerate_type as string | null) ?? null;
  }
  const styles = (s.data ?? []) as Row[];
  if (!ps.length && !psp.length && styles.length) { ps = styles.filter((x) => !x.is_plus).map((x) => x.name as string); psp = styles.filter((x) => x.is_plus).map((x) => x.name as string); }
  const meta: MetaCard = { name: card.player_name, rating: card.overall, positions: [...new Set([...card.positions, ...alt])], stats, playstyles: ps, playstyles_plus: psp, height_cm: height, accelerate_type: accel, weak_foot: card.weak_foot, skill_moves: card.skill_moves };
  return { card, meta };
}

export async function metaForCard(db: FutDb, userId: string, cardId: string) {
  const { card, meta } = await loadMetaCard(db, userId, cardId);
  return { card_id: card.id, name: card.player_name, rating: card.overall, positions: meta.positions, ...metaRate(meta), note: NOTE, verified: false as const };
}

const NOTE = "GafferBot's own estimate from in-game attributes, PlayStyles, height, AcceleRATE, weak foot and skill moves under the best chem style. Chem style boosts follow recent games and aren't confirmed for FC 27.";

/** The best cards for one position (and role), within a budget, scored in full. */
export async function metaTop(db: FutDb, userId: string, b: Row) {
  const position = String(b.position ?? "").toUpperCase();
  if (!META_POSITIONS.includes(position)) throw new FutError(`position must be one of ${META_POSITIONS.join(", ")}.`);
  const roles = rolesFor(position), role = typeof b.role === "string" && b.role ? roles.find((r) => r.role.toLowerCase() === String(b.role).toLowerCase()) : undefined;
  if (b.role && !role) throw new FutError(`role must be one of ${roles.map((r) => r.role).join(", ")}.`);
  const platform: Platform = b.platform === "pc" ? "pc" : "console";
  const maxPrice = b.max_price === undefined || b.max_price === null || b.max_price === "" ? null : Number(b.max_price);
  if (maxPrice !== null && (!Number.isInteger(maxPrice) || maxPrice < 0)) throw new FutError("max_price must be whole coins.");
  const query = cleanPlayerQuery({ positions: [position === "CF" ? "ST" : position === "LWB" ? "LB" : position === "RWB" ? "RB" : position], weights: roleWeights(position, role?.role), max_price: maxPrice, priced_only: maxPrice !== null, owned_only: b.owned_only === true, sort: "fit" });
  const res = await searchPlayers(db, userId, query, { platform, limit: 100 });
  const cards = res.cards.map((c) => {
    const m = fromSearch(c);
    const r = metaRate(m, [position]);
    const pick = role ? r.roles.find((x) => x.role === role.role) ?? r.best : r.best;
    return { card_id: String(c.id), ea_item_id: (c.ea_item_id as number | null) ?? null, name: m.name, rating: m.rating, version: (c.version as string | null) ?? null, position: String(c.position), owned: c.owned === true, price: (c.price as number | null) ?? null, meta: pick };
  }).filter((c) => c.meta).sort((a, b) => b.meta!.score - a.meta!.score || (a.price ?? Infinity) - (b.price ?? Infinity));
  return { platform, position, role: role?.role ?? null, roles: roles.map((r) => r.role), max_price: maxPrice, published_at: res.published_at, cards: cards.slice(0, 30), with_stats: res.with_stats, note: NOTE, verified: false as const };
}
