// FUT player stats shared by the web app (Player Ratings page) and fut-api (search, the player finder chat and the
// FUT.GG attribute download), so a stat key means the same thing everywhere.
// Keys are snake_case. Face stats are columns on fut.card_attributes; the rest live in its `detail` JSON.

export type StatGroup = "Face" | "Pace" | "Shooting" | "Passing" | "Dribbling" | "Defending" | "Physical" | "Goalkeeping" | "Card";

export interface StatDef { key: string; label: string; short: string; group: StatGroup; /** FUT.GG's field on a card definition */ futgg?: string }

export const FACE_STATS: StatDef[] = [
  { key: "pac", label: "Pace", short: "PAC", group: "Face", futgg: "facePace" },
  { key: "sho", label: "Shooting", short: "SHO", group: "Face", futgg: "faceShooting" },
  { key: "pas", label: "Passing", short: "PAS", group: "Face", futgg: "facePassing" },
  { key: "dri", label: "Dribbling", short: "DRI", group: "Face", futgg: "faceDribbling" },
  { key: "def", label: "Defending", short: "DEF", group: "Face", futgg: "faceDefending" },
  { key: "phy", label: "Physical", short: "PHY", group: "Face", futgg: "facePhysicality" },
];

/** The in-game attributes (EA's 29 outfield + 5 goalkeeping), plus the goalkeeper face stat for speed. */
export const DETAIL_STATS: StatDef[] = [
  { key: "acceleration", label: "Acceleration", short: "ACC", group: "Pace", futgg: "attributeAcceleration" },
  { key: "sprint_speed", label: "Sprint Speed", short: "SPD", group: "Pace", futgg: "attributeSprintSpeed" },
  { key: "positioning", label: "Positioning", short: "POS", group: "Shooting", futgg: "attributePositioning" },
  { key: "finishing", label: "Finishing", short: "FIN", group: "Shooting", futgg: "attributeFinishing" },
  { key: "shot_power", label: "Shot Power", short: "SPW", group: "Shooting", futgg: "attributeShotPower" },
  { key: "long_shots", label: "Long Shots", short: "LSH", group: "Shooting", futgg: "attributeLongShots" },
  { key: "volleys", label: "Volleys", short: "VOL", group: "Shooting", futgg: "attributeVolleys" },
  { key: "penalties", label: "Penalties", short: "PEN", group: "Shooting", futgg: "attributePenalties" },
  { key: "vision", label: "Vision", short: "VIS", group: "Passing", futgg: "attributeVision" },
  { key: "crossing", label: "Crossing", short: "CRO", group: "Passing", futgg: "attributeCrossing" },
  { key: "fk_accuracy", label: "Free Kick Accuracy", short: "FKA", group: "Passing", futgg: "attributeFkAccuracy" },
  { key: "short_passing", label: "Short Passing", short: "SPA", group: "Passing", futgg: "attributeShortPassing" },
  { key: "long_passing", label: "Long Passing", short: "LPA", group: "Passing", futgg: "attributeLongPassing" },
  { key: "curve", label: "Curve", short: "CUR", group: "Passing", futgg: "attributeCurve" },
  { key: "agility", label: "Agility", short: "AGI", group: "Dribbling", futgg: "attributeAgility" },
  { key: "balance", label: "Balance", short: "BAL", group: "Dribbling", futgg: "attributeBalance" },
  { key: "reactions", label: "Reactions", short: "REA", group: "Dribbling", futgg: "attributeReactions" },
  { key: "ball_control", label: "Ball Control", short: "BCO", group: "Dribbling", futgg: "attributeBallControl" },
  { key: "dribbling", label: "Dribbling", short: "DRB", group: "Dribbling", futgg: "attributeDribbling" },
  { key: "composure", label: "Composure", short: "COM", group: "Dribbling", futgg: "attributeComposure" },
  { key: "interceptions", label: "Interceptions", short: "INT", group: "Defending", futgg: "attributeInterceptions" },
  { key: "heading_accuracy", label: "Heading Accuracy", short: "HEA", group: "Defending", futgg: "attributeHeadingAccuracy" },
  { key: "defensive_awareness", label: "Defensive Awareness", short: "DAW", group: "Defending", futgg: "attributeDefensiveAwareness" },
  { key: "standing_tackle", label: "Standing Tackle", short: "STA", group: "Defending", futgg: "attributeStandingTackle" },
  { key: "sliding_tackle", label: "Sliding Tackle", short: "SLI", group: "Defending", futgg: "attributeSlidingTackle" },
  { key: "jumping", label: "Jumping", short: "JUM", group: "Physical", futgg: "attributeJumping" },
  { key: "stamina", label: "Stamina", short: "STA", group: "Physical", futgg: "attributeStamina" },
  { key: "strength", label: "Strength", short: "STR", group: "Physical", futgg: "attributeStrength" },
  { key: "aggression", label: "Aggression", short: "AGG", group: "Physical", futgg: "attributeAggression" },
  { key: "gk_diving", label: "GK Diving", short: "DIV", group: "Goalkeeping", futgg: "attributeGkDiving" },
  { key: "gk_handling", label: "GK Handling", short: "HAN", group: "Goalkeeping", futgg: "attributeGkHandling" },
  { key: "gk_kicking", label: "GK Kicking", short: "KIC", group: "Goalkeeping", futgg: "attributeGkKicking" },
  { key: "gk_reflexes", label: "GK Reflexes", short: "REF", group: "Goalkeeping", futgg: "attributeGkReflexes" },
  { key: "gk_positioning", label: "GK Positioning", short: "POS", group: "Goalkeeping", futgg: "attributeGkPositioning" },
  { key: "gk_speed", label: "GK Speed", short: "SPD", group: "Goalkeeping", futgg: "gkFaceSpeed" },
];

/** Card-level numbers that can be sorted, filtered and weighted like stats. */
export const CARD_STATS: StatDef[] = [
  { key: "overall", label: "Overall", short: "OVR", group: "Card" },
  { key: "weak_foot", label: "Weak Foot", short: "WF", group: "Card" },
  { key: "skill_moves", label: "Skill Moves", short: "SM", group: "Card" },
  { key: "height_cm", label: "Height (cm)", short: "HT", group: "Card" },
  { key: "total_stats", label: "Face stat total", short: "TOT", group: "Card" },
  { key: "total_igs", label: "In-game stat total", short: "IGS", group: "Card" },
];

export const ALL_STATS: StatDef[] = [...FACE_STATS, ...DETAIL_STATS, ...CARD_STATS];
export const STAT_KEYS = new Set(ALL_STATS.map((s) => s.key));
export const statDef = (key: string): StatDef | undefined => ALL_STATS.find((s) => s.key === key);
export const statLabel = (key: string): string => statDef(key)?.label ?? key.replace(/_/g, " ");

/** Goalkeepers show these six on the front of the card in place of PAC..PHY. */
export const GK_FACE: { key: string; short: string }[] = [
  { key: "gk_diving", short: "DIV" }, { key: "gk_handling", short: "HAN" }, { key: "gk_kicking", short: "KIC" },
  { key: "gk_reflexes", short: "REF" }, { key: "gk_speed", short: "SPD" }, { key: "gk_positioning", short: "POS" },
];

export const PLAYER_POSITIONS = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"] as const;

/** FC 27 PlayStyles (FUT.GG's list). Names match what the attribute download stores. */
export const PLAYSTYLES = [
  "Finesse Shot", "Chip Shot", "Power Shot", "Dead Ball", "Precision Header", "Acrobatic", "Low Driven Shot", "Gamechanger",
  "Incisive Pass", "Pinged Pass", "Long Ball Pass", "Tiki Taka", "Whipped Pass", "Inventive",
  "Jockey", "Block", "Intercept", "Anticipate", "Slide Tackle", "Bruiser", "Aerial Fortress", "Enforcer",
  "Technical", "Rapid", "First Touch", "Trickster", "Press Proven", "Quick Step", "Relentless", "Long Throw",
  "Far Throw", "Footwork", "Cross Claimer", "1v1 Close Down", "Far Reach", "Deflector",
] as const;

export const ACCELERATE_TYPES = ["EXPLOSIVE", "MOSTLY_EXPLOSIVE", "CONTROLLED_EXPLOSIVE", "CONTROLLED", "CONTROLLED_LENGTHY", "MOSTLY_LENGTHY", "LENGTHY"] as const;
export const accelerateLabel = (v: string | null | undefined) => v ? v.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "–";

// ---------------------------------------------------------------- the search a page or the finder chat sends

export type CardType = "icon" | "hero" | "promo" | "base";
export interface StatBound { stat: string; value: number }
export interface StatWeight { stat: string; weight: number }

/** One player search. Everything is optional; an empty search lists every card by overall. */
export interface PlayerQuery {
  text?: string | null;
  positions?: string[];
  /** Match a card's alternative positions too (default true). */
  include_alt_positions?: boolean;
  card_type?: CardType | null;
  min_rating?: number | null;
  max_rating?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  /** Leave out cards with no price (SBC, objective and untradeable cards). */
  priced_only?: boolean;
  minimums?: StatBound[];
  maximums?: StatBound[];
  foot?: "left" | "right" | null;
  playstyles?: string[];
  playstyles_plus?: string[];
  accelerate_types?: string[];
  league?: string | null;
  nation?: string | null;
  club?: string | null;
  /** Only cards in the user's synced club. */
  owned_only?: boolean;
  /** Ranks by fit: a weighted average of these stats. */
  weights?: StatWeight[];
  /** A stat key, "fit", "price" or "name". Default: fit when there are weights, else overall. */
  sort?: string | null;
  direction?: "asc" | "desc" | null;
}

export const SORT_EXTRAS = ["fit", "price", "name"] as const;
export const MAX_QUERY_PRICE = 15_000_000;

const intIn = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[,\s]/g, "")) : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
};
const textOr = (v: unknown, max: number): string | null => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const listOf = (v: unknown, ok: (s: string) => string | null, max: number): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) { const s = typeof x === "string" ? ok(x) : null; if (s && !out.includes(s)) out.push(s); }
  return out.slice(0, max);
};
const posOf = (s: string) => { const p = s.trim().toUpperCase(); return (PLAYER_POSITIONS as readonly string[]).includes(p) ? p : null; };
const playstyleOf = (s: string) => PLAYSTYLES.find((p) => p.toLowerCase() === s.trim().toLowerCase().replace(/\+$/, "")) ?? null;
const accelOf = (s: string) => { const a = s.trim().toUpperCase().replace(/[\s-]+/g, "_"); return (ACCELERATE_TYPES as readonly string[]).includes(a) ? a : null; };
const bounds = (v: unknown, max: number): StatBound[] => {
  if (!Array.isArray(v)) return [];
  const out = new Map<string, number>();
  for (const b of v as Record<string, unknown>[]) {
    const stat = typeof b?.stat === "string" ? b.stat.trim().toLowerCase() : "";
    const value = intIn(b?.value, 0, 300);
    if (STAT_KEYS.has(stat) && value !== null) out.set(stat, value);
  }
  return [...out].slice(0, max).map(([stat, value]) => ({ stat, value }));
};

/** Cleans a search from the browser or from Claude: unknown stats, positions and PlayStyles are dropped, numbers clamped. */
export function cleanPlayerQuery(raw: unknown): PlayerQuery {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const weights = new Map<string, number>();
  if (Array.isArray(r.weights)) for (const w of r.weights as Record<string, unknown>[]) {
    const stat = typeof w?.stat === "string" ? w.stat.trim().toLowerCase() : "";
    const weight = intIn(w?.weight, 1, 5);
    if (STAT_KEYS.has(stat) && weight !== null) weights.set(stat, weight);
  }
  const type = typeof r.card_type === "string" && ["icon", "hero", "promo", "base"].includes(r.card_type) ? r.card_type as CardType : null;
  const sortRaw = typeof r.sort === "string" ? r.sort.trim().toLowerCase() : "";
  const sort = STAT_KEYS.has(sortRaw) || (SORT_EXTRAS as readonly string[]).includes(sortRaw) ? sortRaw : null;
  const foot = r.foot === "left" || r.foot === "right" ? r.foot : null;
  return {
    text: textOr(r.text, 60),
    positions: listOf(r.positions, posOf, 12),
    include_alt_positions: r.include_alt_positions !== false,
    card_type: type,
    min_rating: intIn(r.min_rating, 1, 99), max_rating: intIn(r.max_rating, 1, 99),
    min_price: intIn(r.min_price, 0, MAX_QUERY_PRICE), max_price: intIn(r.max_price, 0, MAX_QUERY_PRICE),
    priced_only: r.priced_only === true,
    minimums: bounds(r.minimums, 12), maximums: bounds(r.maximums, 12),
    foot,
    playstyles: listOf(r.playstyles, playstyleOf, 6), playstyles_plus: listOf(r.playstyles_plus, playstyleOf, 4),
    accelerate_types: listOf(r.accelerate_types, accelOf, 7),
    league: textOr(r.league, 60), nation: textOr(r.nation, 60), club: textOr(r.club, 60),
    owned_only: r.owned_only === true,
    weights: [...weights].slice(0, 12).map(([stat, weight]) => ({ stat, weight })),
    sort: sort === "fit" && !weights.size ? null : sort,
    direction: r.direction === "asc" ? "asc" : r.direction === "desc" ? "desc" : null,
  };
}

/** A one-line description of a search, for the chat and the active-filter chips. */
export function describeQuery(q: PlayerQuery): string[] {
  const out: string[] = [];
  if (q.positions?.length) out.push(q.positions.join("/"));
  if (q.card_type) out.push({ icon: "Icons", hero: "Heroes", promo: "Promo cards", base: "Base cards" }[q.card_type]);
  if (q.min_rating != null || q.max_rating != null) out.push(q.min_rating != null && q.max_rating != null ? `${q.min_rating}-${q.max_rating} rated` : q.min_rating != null ? `${q.min_rating}+ rated` : `up to ${q.max_rating} rated`);
  if (q.max_price != null) out.push(`under ${coins(q.max_price)}`);
  if (q.min_price != null) out.push(`over ${coins(q.min_price)}`);
  for (const b of q.minimums ?? []) out.push(`${statLabel(b.stat)} ${b.value}+`);
  for (const b of q.maximums ?? []) out.push(`${statLabel(b.stat)} up to ${b.value}`);
  if (q.foot) out.push(`${q.foot} footed`);
  for (const p of q.playstyles ?? []) out.push(p);
  for (const p of q.playstyles_plus ?? []) out.push(`${p}+`);
  if (q.accelerate_types?.length) out.push(q.accelerate_types.map(accelerateLabel).join(" or "));
  for (const k of ["league", "nation", "club"] as const) if (q[k]) out.push(q[k]!);
  if (q.owned_only) out.push("in my club");
  if (q.text) out.push(`"${q.text}"`);
  if (q.weights?.length) out.push(`best for ${[...q.weights].sort((a, b) => b.weight - a.weight).map((w) => statLabel(w.stat).toLowerCase()).join(", ")}`);
  return out;
}

export function coins(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return String(n);
}
