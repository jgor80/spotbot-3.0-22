// EA FC 27 Clubs (Pro Clubs) Virtual Pro rules, Season 2 (from the 22 October 2026 update, level cap 55).
//
// Where these numbers come from: EA doesn't publish Attribute Point (AP) prices, starting values or unlock
// thresholds. Everything below was measured by the community (Pro Clubs HQ's AP cost and requirement guides
// and PRO11's archetype tables, all updated for Season 2) and cross-checked: the AP prices reproduce every
// worked example those sites give (e.g. 90 Crossing = 92 AP on a Marauder, 194 on a Boss; Finisher+ = 308 AP).
// EA's own notes (19 Oct 2026 archetypes update) confirm the 13 archetypes, that each archetype prices each
// attribute differently, and the reset. Anything still unconfirmed is marked UNCONFIRMED and the planner says so.
// When EA changes prices, edit COST_TIERS / COST_BANDS here and the whole planner follows.
//
// Every number the game decides lives in this file. Pages and the rules in proBuild.ts read it and never
// repeat a level, a threshold or a cap of their own, so a new season is an edit here:
//   - higher level cap: append the new levels' AP to AP_GAINS (LEVEL_CAP follows), then add any new
//     PlayStyle slot, PlayStyle+, Signature Perk or Mastery level to the lists further down;
//   - new prices or ceilings: COST_TIERS, COST_BANDS, CAPS;
//   - then bump RULESET and run the tests (pro-build.test.ts checks the tables against each other).

// Which version of the game these tables describe (shown on the page).
export const RULESET = { game: "FC 27", season: 2, updated: "22 October 2026" } as const;

// The attribute scale
export const ATTR_MIN = 1;
export const ATTR_MAX = 99;

export const ATTRIBUTE_KEYS = [
  "acceleration", "sprintSpeed", "positioning", "finishing", "shotPower", "longShots", "volleys", "penalties",
  "vision", "crossing", "fkAccuracy", "shortPassing", "longPassing", "curve", "agility", "balance", "reactions",
  "ballControl", "dribbling", "composure", "interceptions", "headingAccuracy", "defAware", "standingTackle",
  "slidingTackle", "jumping", "stamina", "strength", "aggression", "gkDiving", "gkHandling", "gkKicking",
  "gkPositioning", "gkReflexes",
] as const;
export type AttrKey = (typeof ATTRIBUTE_KEYS)[number];

// Starting attribute values at level 1 (before any Attribute Points), in ATTRIBUTE_KEYS order. 0 = not a
// keeper archetype (GK attributes can't be trained).
export const START_VALUES: Record<string, number[]> = {
  shotstopper: [75, 55, 50, 40, 50, 40, 40, 40, 65, 40, 40, 65, 65, 40, 50, 65, 75, 65, 45, 55, 65, 40, 40, 40, 50, 65, 65, 65, 65, 75, 75, 65, 75, 75],
  sweeperkeeper: [75, 65, 50, 40, 50, 45, 40, 55, 75, 40, 40, 50, 75, 40, 65, 70, 75, 65, 65, 75, 75, 65, 40, 50, 65, 75, 75, 70, 75, 75, 65, 75, 75, 75],
  progressor: [70, 72, 70, 50, 65, 50, 50, 65, 75, 50, 45, 75, 75, 50, 70, 70, 65, 70, 65, 75, 75, 75, 75, 75, 75, 75, 65, 70, 65, 0, 0, 0, 0, 0],
  boss: [70, 70, 75, 45, 70, 60, 60, 65, 55, 45, 50, 65, 65, 50, 65, 75, 60, 65, 60, 65, 75, 75, 75, 75, 75, 75, 70, 75, 75, 0, 0, 0, 0, 0],
  marauder: [75, 75, 65, 55, 65, 60, 65, 65, 60, 75, 60, 65, 65, 75, 70, 65, 70, 70, 70, 65, 70, 65, 70, 70, 75, 60, 75, 60, 72, 0, 0, 0, 0, 0],
  disruptor: [75, 70, 70, 50, 70, 65, 65, 65, 65, 65, 50, 75, 70, 65, 68, 75, 70, 65, 65, 70, 75, 65, 70, 70, 75, 65, 75, 75, 70, 0, 0, 0, 0, 0],
  recycler: [70, 70, 70, 55, 70, 65, 65, 65, 75, 65, 50, 70, 75, 65, 68, 75, 65, 65, 65, 72, 75, 60, 75, 75, 75, 65, 72, 72, 75, 0, 0, 0, 0, 0],
  maestro: [70, 65, 80, 65, 70, 70, 65, 70, 75, 75, 75, 75, 75, 70, 75, 70, 65, 75, 65, 75, 75, 50, 65, 72, 50, 60, 65, 65, 65, 0, 0, 0, 0, 0],
  creator: [70, 65, 80, 65, 72, 72, 72, 75, 75, 75, 75, 75, 75, 75, 72, 65, 75, 75, 75, 72, 55, 50, 50, 65, 50, 60, 65, 65, 55, 0, 0, 0, 0, 0],
  spark: [75, 75, 80, 65, 65, 65, 72, 75, 75, 75, 65, 75, 65, 75, 75, 75, 75, 75, 75, 72, 55, 50, 50, 55, 45, 55, 65, 65, 50, 0, 0, 0, 0, 0],
  magician: [75, 70, 80, 75, 70, 65, 72, 75, 75, 65, 65, 75, 50, 75, 72, 75, 75, 75, 75, 72, 50, 65, 45, 40, 40, 60, 65, 65, 55, 0, 0, 0, 0, 0],
  finisher: [75, 70, 80, 75, 75, 60, 75, 75, 65, 55, 65, 70, 50, 70, 72, 75, 75, 75, 70, 75, 60, 75, 55, 50, 40, 65, 65, 70, 65, 0, 0, 0, 0, 0],
  target: [70, 65, 80, 72, 75, 65, 72, 75, 65, 50, 65, 75, 50, 55, 70, 75, 75, 70, 70, 72, 50, 75, 50, 45, 40, 75, 60, 75, 65, 0, 0, 0, 0, 0],
};

// Price tier of each attribute per archetype, in ATTRIBUTE_KEYS order: 1 cheapest .. 4 most expensive, 0 = can't train.
export const COST_TIERS: Record<string, number[]> = {
  shotstopper: [3, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 3, 3, 2, 4, 3, 1, 3, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 3, 3, 4, 4, 3],
  sweeperkeeper: [4, 4, 2, 4, 3, 3, 2, 2, 2, 3, 2, 4, 2, 2, 4, 3, 2, 2, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 3, 4, 3, 3, 4],
  progressor: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 2, 2, 4, 3, 2, 2, 4, 2, 4, 3, 2, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  boss: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 3, 2, 4, 3, 2, 3, 4, 3, 4, 2, 3, 4, 3, 1, 2, 2, 1, 0, 0, 0, 0, 0],
  marauder: [4, 3, 2, 4, 3, 3, 2, 2, 3, 2, 2, 4, 3, 2, 4, 3, 2, 3, 4, 3, 4, 3, 3, 4, 2, 2, 1, 3, 2, 0, 0, 0, 0, 0],
  disruptor: [3, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 3, 2, 4, 3, 2, 3, 4, 3, 4, 3, 3, 3, 3, 2, 1, 3, 1, 0, 0, 0, 0, 0],
  recycler: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 3, 3, 2, 4, 3, 2, 3, 4, 3, 3, 3, 2, 4, 3, 2, 2, 2, 2, 0, 0, 0, 0, 0],
  maestro: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 2, 2, 3, 3, 1, 2, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  creator: [4, 4, 2, 4, 3, 2, 2, 2, 2, 3, 2, 4, 3, 1, 4, 3, 2, 3, 3, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  spark: [4, 3, 2, 4, 3, 3, 2, 2, 2, 3, 2, 4, 3, 2, 3, 3, 2, 3, 3, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  magician: [3, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 3, 3, 1, 4, 3, 2, 2, 4, 3, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  finisher: [4, 4, 2, 3, 3, 3, 1, 2, 3, 3, 2, 4, 3, 2, 4, 3, 1, 3, 4, 2, 4, 3, 3, 4, 3, 2, 2, 3, 2, 0, 0, 0, 0, 0],
  target: [4, 4, 2, 4, 3, 3, 2, 2, 3, 3, 2, 4, 3, 2, 4, 2, 2, 3, 4, 3, 4, 2, 3, 4, 3, 1, 2, 2, 2, 0, 0, 0, 0, 0],
};

// AP per point by the value you raise the attribute TO, per tier (cheapest, cheap, expensive, most expensive).
// [upTo, t1, t2, t3, t4]: raising to any value <= upTo (and above the previous band) costs this per point.
export const COST_BANDS: [number, number, number, number, number][] = [
  [60, 1, 1, 1, 2],
  [63, 1, 1, 2, 3],
  [66, 1, 2, 3, 4],
  [69, 1, 2, 3, 5],
  [74, 2, 3, 4, 6],
  [79, 3, 4, 6, 8],
  [84, 3, 5, 7, 10],
  [89, 6, 8, 11, 15],
  [92, 8, 11, 15, 20],
  [94, 10, 15, 20, 25],
  [95, 15, 20, 25, 30],
  [96, 20, 25, 30, 35],
  [97, 25, 30, 35, 40],
  [98, 30, 35, 40, 45],
  [99, 35, 40, 45, 50],
];

export const TIER_LABELS = ["", "Cheapest", "Cheap", "Expensive", "Most expensive"] as const;

// Total AP you have at each level (index = level). Level 1 starts with 100.
const AP_GAINS = [0, 100, 9, 9, 9, 19, 10, 10, 10, 10, 38, 13, 13, 13, 13, 25, 13, 13, 13, 13, 44, 19, 19, 19, 19, 38, 25, 25, 25, 25, 63, 25, 25, 25, 25, 38, 25, 25, 25, 25, 50, 25, 25, 25, 25, 44, 25, 25, 25, 25, 63, 25, 25, 25, 25, 50];
export const AP_BY_LEVEL: number[] = AP_GAINS.reduce<number[]>((acc, g, i) => (acc.push((acc[i - 1] ?? 0) + g), acc), []);
// The level cap is the last level AP_GAINS has a row for.
export const LEVEL_CAP = AP_GAINS.length - 1;

// Highest value each attribute can be trained to (its ceiling), per archetype, in ATTRIBUTE_KEYS order.
// 0 = can't train. From Pro Clubs HQ's ceiling tables (read in game; PRO11 republishes the same set), so
// this is one source: it does reproduce every "which archetypes can reach this PlayStyle" list they publish.
export const CAPS: Record<string, number[]> = {
  shotstopper: [92, 85, 85, 75, 75, 60, 60, 70, 92, 82, 75, 92, 90, 75, 90, 90, 96, 85, 75, 90, 90, 75, 75, 75, 70, 96, 90, 96, 92, 99, 99, 99, 99, 99],
  sweeperkeeper: [92, 88, 85, 75, 75, 60, 60, 80, 99, 85, 75, 92, 96, 75, 90, 90, 96, 90, 85, 92, 96, 90, 75, 85, 90, 99, 92, 96, 96, 99, 99, 99, 99, 99],
  progressor: [92, 92, 90, 85, 92, 85, 75, 92, 92, 92, 90, 96, 96, 85, 92, 92, 99, 96, 92, 96, 96, 96, 99, 99, 96, 99, 92, 96, 96, 0, 0, 0, 0, 0],
  boss: [90, 90, 90, 82, 96, 85, 80, 92, 90, 90, 90, 92, 90, 75, 90, 90, 99, 92, 88, 92, 96, 99, 96, 96, 99, 99, 92, 99, 99, 0, 0, 0, 0, 0],
  marauder: [95, 95, 92, 90, 92, 90, 96, 96, 92, 99, 95, 92, 92, 96, 95, 92, 99, 96, 92, 92, 96, 90, 96, 96, 96, 92, 96, 92, 96, 0, 0, 0, 0, 0],
  disruptor: [92, 92, 90, 90, 92, 85, 90, 92, 90, 96, 95, 96, 92, 90, 92, 96, 99, 92, 92, 92, 92, 90, 92, 92, 92, 92, 99, 96, 96, 0, 0, 0, 0, 0],
  recycler: [90, 90, 90, 90, 96, 96, 90, 92, 96, 92, 99, 96, 96, 90, 92, 92, 99, 96, 92, 99, 99, 90, 99, 96, 92, 90, 96, 96, 96, 0, 0, 0, 0, 0],
  maestro: [90, 90, 96, 96, 96, 96, 96, 99, 99, 92, 99, 96, 99, 96, 99, 96, 99, 99, 96, 99, 92, 85, 90, 90, 90, 90, 92, 92, 92, 0, 0, 0, 0, 0],
  creator: [92, 92, 99, 96, 96, 99, 96, 99, 99, 96, 99, 96, 96, 99, 99, 96, 99, 96, 96, 96, 85, 85, 85, 90, 90, 90, 92, 92, 92, 0, 0, 0, 0, 0],
  spark: [99, 95, 96, 96, 92, 92, 96, 99, 96, 99, 99, 96, 92, 96, 99, 96, 99, 96, 99, 96, 85, 85, 85, 80, 75, 85, 92, 90, 92, 0, 0, 0, 0, 0],
  magician: [95, 95, 96, 99, 92, 96, 96, 99, 96, 92, 99, 96, 92, 99, 99, 99, 99, 96, 96, 96, 82, 85, 82, 75, 75, 85, 92, 90, 92, 0, 0, 0, 0, 0],
  finisher: [95, 95, 99, 99, 99, 96, 99, 99, 92, 92, 99, 92, 92, 96, 99, 96, 99, 96, 96, 99, 85, 96, 85, 75, 75, 92, 92, 92, 96, 0, 0, 0, 0, 0],
  target: [90, 92, 96, 96, 99, 96, 96, 99, 92, 90, 99, 96, 92, 90, 92, 92, 99, 92, 92, 96, 82, 99, 82, 75, 75, 96, 92, 99, 92, 0, 0, 0, 0, 0],
};

// Skill move and weak foot stars: each archetype starts on `start` stars and can buy up to `max`, paid in AP
// from the same budget as attributes. `cost[i]` is the AP for the (i+1)th extra star. Totals for all 13 are
// published (PRO11 archetype pages, Pro Clubs HQ); the star-by-star split is published for the Finisher,
// Magician, Spark, Maestro and Disruptor, and every other split with two or more stars follows the same two
// price ladders. Splits marked "inferred" add up to the published total but weren't published star by star.
export interface StarRule { start: number; max: number; cost: number[]; inferred?: boolean }
export const STARS: Record<string, { skillMoves: StarRule; weakFoot: StarRule }> = {
  shotstopper: { skillMoves: { start: 1, max: 2, cost: [5] }, weakFoot: { start: 1, max: 3, cost: [10, 20], inferred: true } },
  sweeperkeeper: { skillMoves: { start: 1, max: 3, cost: [5, 10], inferred: true }, weakFoot: { start: 1, max: 4, cost: [8, 15, 25], inferred: true } },
  progressor: { skillMoves: { start: 2, max: 4, cost: [10, 20] }, weakFoot: { start: 3, max: 4, cost: [25] } },
  boss: { skillMoves: { start: 2, max: 3, cost: [10] }, weakFoot: { start: 2, max: 4, cost: [20, 35], inferred: true } },
  marauder: { skillMoves: { start: 2, max: 5, cost: [10, 20, 35] }, weakFoot: { start: 3, max: 5, cost: [25, 40] } },
  disruptor: { skillMoves: { start: 2, max: 4, cost: [10, 20] }, weakFoot: { start: 3, max: 5, cost: [35, 50] } },
  recycler: { skillMoves: { start: 2, max: 4, cost: [8, 15], inferred: true }, weakFoot: { start: 3, max: 5, cost: [25, 40] } },
  maestro: { skillMoves: { start: 2, max: 5, cost: [10, 20, 35] }, weakFoot: { start: 3, max: 5, cost: [25, 40] } },
  creator: { skillMoves: { start: 2, max: 5, cost: [10, 20, 35] }, weakFoot: { start: 3, max: 5, cost: [25, 40] } },
  spark: { skillMoves: { start: 3, max: 5, cost: [15, 25] }, weakFoot: { start: 3, max: 5, cost: [25, 40] } },
  magician: { skillMoves: { start: 3, max: 5, cost: [20, 35] }, weakFoot: { start: 3, max: 5, cost: [25, 40] } },
  finisher: { skillMoves: { start: 3, max: 5, cost: [15, 25] }, weakFoot: { start: 3, max: 5, cost: [35, 50] } },
  target: { skillMoves: { start: 2, max: 5, cost: [10, 20, 35] }, weakFoot: { start: 2, max: 5, cost: [20, 35, 50], inferred: true } },
};

// Height (cm) and weight (kg): allowed range and the default each archetype starts at.
export const BODY: Record<string, { h: [number, number]; w: [number, number]; startH: number; startW: number }> = {
  finisher: { h: [164, 190], w: [70, 90], startH: 177, startW: 80 },
  magician: { h: [162, 188], w: [60, 80], startH: 175, startW: 70 },
  spark: { h: [162, 188], w: [60, 80], startH: 175, startW: 70 },
  target: { h: [177, 195], w: [80, 100], startH: 186, startW: 90 },
  creator: { h: [162, 188], w: [65, 85], startH: 175, startW: 75 },
  maestro: { h: [162, 188], w: [65, 85], startH: 175, startW: 75 },
  disruptor: { h: [168, 188], w: [65, 85], startH: 178, startW: 75 },
  recycler: { h: [172, 192], w: [65, 85], startH: 182, startW: 75 },
  marauder: { h: [168, 188], w: [65, 85], startH: 178, startW: 75 },
  boss: { h: [180, 196], w: [80, 100], startH: 188, startW: 90 },
  progressor: { h: [177, 195], w: [75, 95], startH: 186, startW: 85 },
  shotstopper: { h: [179, 197], w: [80, 100], startH: 188, startW: 90 },
  sweeperkeeper: { h: [184, 200], w: [80, 100], startH: 192, startW: 90 },
};

// Body changes apply in matches only (the menu shows trained values). Each BODY_STEP.heightCm from the
// archetype's default height moves the listed attributes by 1 (1-4 cm = 1, 5-8 = 2, ...); each
// BODY_STEP.weightKg from default weight by 1. These are FC 26's shifts, which the community reports carried
// into FC 27 unchanged (not re-measured attribute by attribute).
export const BODY_STEP = { heightCm: 4, weightKg: 8 } as const;
export const BODY_EFFECTS = {
  outfield: {
    taller: { up: ["jumping", "sprintSpeed", "strength"], down: ["acceleration", "agility", "balance"] },
    heavier: { up: ["balance", "jumping", "strength"], down: ["acceleration", "agility", "sprintSpeed"] },
  },
  keeper: {
    taller: { up: ["gkDiving", "gkReflexes", "sprintSpeed", "strength"], down: ["gkHandling", "acceleration"] },
    heavier: { up: ["gkHandling", "strength"], down: ["gkDiving", "gkReflexes", "acceleration", "sprintSpeed"] },
  },
} as const satisfies Record<string, Record<string, { up: readonly AttrKey[]; down: readonly AttrKey[] }>>;

// AcceleRATE (community-measured for FC 27, men's heights; uses in-match values): Explosive needs all of
// height <= 182 cm, Agility 65+, Agility at least 10 above Strength, Acceleration 80+. Lengthy needs all of
// height >= 183 cm, Strength 65+, Strength at least 4 above Agility, Acceleration 40+. Everything else is
// Controlled. Lengthy's minimum height is disputed: 183 cm (FC 27 guide) vs 185 cm (an FC 26 change some
// sources still quote), so the planner uses 183 and says so.
export const ACCELERATE = {
  explosive: { maxHeight: 182, agility: 65, agilityOverStrength: 10, acceleration: 80 },
  lengthy: { minHeight: 183, strength: 65, strengthOverAgility: 4, acceleration: 40 },
} as const;

// Masteries: levelling an archetype adds +1 to a pair of attributes on every archetype you own (the pairs
// are EA's own table). MASTERY_MILESTONES says which of the pair each milestone level raises: at level 10
// both get +1, level 30 the second gets +1 more, level 55 the first. A new milestone is one more row.
export const MASTERY_MILESTONES: { level: number; first: number; second: number }[] = [
  { level: 10, first: 1, second: 1 },
  { level: 30, first: 0, second: 1 },
  { level: 55, first: 1, second: 0 },
];
export const MASTERIES: Record<string, [AttrKey, AttrKey]> = {
  shotstopper: ["gkPositioning", "gkReflexes"],
  sweeperkeeper: ["gkHandling", "gkDiving"],
  progressor: ["longPassing", "standingTackle"],
  boss: ["aggression", "strength"],
  marauder: ["slidingTackle", "sprintSpeed"],
  disruptor: ["stamina", "interceptions"],
  recycler: ["defAware", "shortPassing"],
  maestro: ["reactions", "ballControl"],
  creator: ["fkAccuracy", "vision"],
  spark: ["crossing", "dribbling"],
  magician: ["curve", "acceleration"],
  finisher: ["composure", "finishing"],
  target: ["balance", "jumping"],
};

export type StyleGroup = "shooting" | "passing" | "ballControl" | "defending" | "physical" | "goalkeeping";
export interface PlayStyleDef { name: string; group: StyleGroup; req: Partial<Record<AttrKey, number>>; keeperOnly?: boolean; unconfirmed?: boolean }

// All 36 PlayStyles and the attribute values that unlock them (both community sources agree on every outfield row;
// the six keeper ones carry over FC 26 values and are UNCONFIRMED for FC 27).
// Keep this order: share codes store PlayStyles by their index here (only ever append).
export const PLAYSTYLE_DEFS: PlayStyleDef[] = [
  { name: "Acrobatic", group: "shooting", req: { agility: 80, reactions: 80, volleys: 75 } },
  { name: "Chip Shot", group: "shooting", req: { reactions: 75, composure: 80, ballControl: 80 } },
  { name: "Dead Ball", group: "shooting", req: { crossing: 80, fkAccuracy: 75, shotPower: 80 } },
  { name: "Finesse Shot", group: "shooting", req: { vision: 80, finishing: 75, curve: 80 } },
  { name: "Gamechanger", group: "shooting", req: { composure: 80, finishing: 75, curve: 80 } },
  { name: "Low Driven Shot", group: "shooting", req: { composure: 80, finishing: 75, shotPower: 80 } },
  { name: "Power Shot", group: "shooting", req: { finishing: 80, shotPower: 75, longShots: 80 } },
  { name: "Precision Header", group: "shooting", req: { jumping: 80, aggression: 80, headingAccuracy: 75 } },
  { name: "Incisive Pass", group: "passing", req: { vision: 75, longPassing: 80, curve: 80 } },
  { name: "Inventive", group: "passing", req: { composure: 80, longPassing: 75, curve: 80 } },
  { name: "Long Ball Pass", group: "passing", req: { vision: 85, longPassing: 80 } },
  { name: "Pinged Pass", group: "passing", req: { longPassing: 85, shortPassing: 80 } },
  { name: "Tiki Taka", group: "passing", req: { reactions: 80, ballControl: 80, shortPassing: 75 } },
  { name: "Whipped Pass", group: "passing", req: { crossing: 80, longPassing: 75 } },
  { name: "First Touch", group: "ballControl", req: { composure: 80, ballControl: 75 } },
  { name: "Press Proven", group: "ballControl", req: { strength: 75, composure: 80, ballControl: 80 } },
  { name: "Rapid", group: "ballControl", req: { acceleration: 75, sprintSpeed: 80, dribbling: 80 } },
  { name: "Technical", group: "ballControl", req: { balance: 80, ballControl: 75, dribbling: 80 } },
  { name: "Trickster", group: "ballControl", req: { acceleration: 80, agility: 75, dribbling: 80 } },
  { name: "Aerial Fortress", group: "defending", req: { jumping: 75, headingAccuracy: 75 } },
  { name: "Anticipate", group: "defending", req: { balance: 80, defAware: 75, standingTackle: 80 } },
  { name: "Block", group: "defending", req: { agility: 80, strength: 75, reactions: 80 } },
  { name: "Intercept", group: "defending", req: { aggression: 80, interceptions: 80 } },
  { name: "Jockey", group: "defending", req: { agility: 75, defAware: 80, standingTackle: 80 } },
  { name: "Slide Tackle", group: "defending", req: { aggression: 80, slidingTackle: 75 } },
  { name: "Bruiser", group: "physical", req: { strength: 75, aggression: 80, defAware: 80 } },
  { name: "Enforcer", group: "physical", req: { balance: 80, strength: 75, ballControl: 80 } },
  { name: "Long Throw", group: "physical", req: { strength: 80, vision: 75 } },
  { name: "Quick Step", group: "physical", req: { acceleration: 75, sprintSpeed: 80, stamina: 80 } },
  { name: "Relentless", group: "physical", req: { agility: 80, stamina: 80 } },
  { name: "1v1 Close Down", group: "goalkeeping", req: { acceleration: 80, agility: 75, aggression: 80 }, keeperOnly: true, unconfirmed: true },
  { name: "Cross Claimer", group: "goalkeeping", req: { jumping: 80, strength: 80, gkPositioning: 75 }, keeperOnly: true, unconfirmed: true },
  { name: "Deflector", group: "goalkeeping", req: { strength: 75, gkDiving: 80, gkReflexes: 75 }, keeperOnly: true, unconfirmed: true },
  { name: "Far Reach", group: "goalkeeping", req: { agility: 80, reactions: 80, gkDiving: 75 }, keeperOnly: true, unconfirmed: true },
  { name: "Far Throw", group: "goalkeeping", req: { vision: 75, longPassing: 75, gkKicking: 80 }, keeperOnly: true, unconfirmed: true },
  { name: "Footwork", group: "goalkeeping", req: { agility: 80, balance: 80, gkReflexes: 75 }, keeperOnly: true, unconfirmed: true },
];

// Regular PlayStyle slots open at these levels (one slot per entry). Signatures don't use a slot.
export const PLAYSTYLE_SLOT_LEVELS = [5, 15, 40, 55];
// Signature 1 becomes PlayStyle+ at 20, Signature 2 at 55. Signature Perks at 10 and 45.
export const SIGNATURE_PLUS_LEVELS: [number, number] = [20, 55];
export const SIGNATURE_PERK_LEVELS: [number, number] = [10, 45];

export interface ArchetypeRules {
  signatures: [string, string];
  perk45: { name: string; trigger: string; boosts: string };
}
export const ARCHETYPE_RULES: Record<string, ArchetypeRules> = {
  shotstopper: { signatures: ["Far Reach", "Deflector"], perk45: { name: "Ready to Act", trigger: "jockey a dribbler in your attacking third", boosts: "Diving, Balance, Reflexes" } },
  sweeperkeeper: { signatures: ["Footwork", "Cross Claimer"], perk45: { name: "Rush Specialist", trigger: "rush a dribbler in the box", boosts: "Acceleration, Aggression, Reactions" } },
  progressor: { signatures: ["Long Ball Pass", "Anticipate"], perk45: { name: "Goalkeeper's Favourite", trigger: "take a pass from your keeper in the defensive third", boosts: "Long Passing, Short Passing, Vision" } },
  boss: { signatures: ["Bruiser", "Aerial Fortress"], perk45: { name: "Box Controller", trigger: "clear the ball from your box", boosts: "Heading, Jumping, Reactions" } },
  marauder: { signatures: ["Quick Step", "Whipped Pass"], perk45: { name: "Tackle and Run", trigger: "win a standing tackle on your defensive wing", boosts: "Acceleration, Agility, Sprint Speed" } },
  disruptor: { signatures: ["Jockey", "Relentless"], perk45: { name: "Presser", trigger: "win the ball in your half", boosts: "Short Passing, Vision, Balance" } },
  recycler: { signatures: ["Intercept", "Press Proven"], perk45: { name: "Physical Passer", trigger: "shield the ball in your half", boosts: "Balance, Short Passing, Aggression" } },
  maestro: { signatures: ["Pinged Pass", "Long Ball Pass"], perk45: { name: "Eagle Eyes", trigger: "receive a pass in your half", boosts: "Long Passing, Vision, Ball Control" } },
  creator: { signatures: ["Incisive Pass", "Inventive"], perk45: { name: "Bullseye Passer", trigger: "precise passes in the middle third", boosts: "Curve, Long Passing, Short Passing" } },
  spark: { signatures: ["Trickster", "Rapid"], perk45: { name: "Cut Back Specialist", trigger: "pass after entering the box from the wing", boosts: "Short Passing, Crossing, Vision" } },
  magician: { signatures: ["Technical", "Finesse Shot"], perk45: { name: "Ankle Breaker", trigger: "fake a shot to beat a man in the final third", boosts: "Balance, Ball Control, Dribbling" } },
  finisher: { signatures: ["Low Driven Shot", "First Touch"], perk45: { name: "1v1 Master", trigger: "go one on one with the keeper", boosts: "Ball Control, Agility, Balance" } },
  target: { signatures: ["Precision Header", "Enforcer"], perk45: { name: "Physical Shooter", trigger: "shield off a defender then shoot in the box", boosts: "Strength, Shot Power, Balance" } },
};

// Specializations: three per archetype. Reach the first attribute at SPECIALIZATION_TARGETS.main and the
// others at .other and you can swap either Signature for the listed PlayStyle+ (one Specialization at a
// time, free to swap back). EA removed Attacking Positioning from every requirement on 22 October 2026
// without naming replacements, which leaves four open: see the `unconfirmed` notes below.
export const SPECIALIZATION_TARGETS = { main: 92, other: 90 } as const;
export interface Specialization { key: string; archetype: string; name: string; plus: string; req: [AttrKey, number][]; unconfirmed?: string }
const spec = (archetype: string, name: string, plus: string, a: AttrKey, b: AttrKey, c: AttrKey | null, unconfirmed?: string): Specialization => ({
  key: `${archetype}.${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
  archetype,
  name,
  plus,
  req: [[a, SPECIALIZATION_TARGETS.main], [b, SPECIALIZATION_TARGETS.other], ...(c ? ([[c, SPECIALIZATION_TARGETS.other]] as [AttrKey, number][]) : [])],
  ...(unconfirmed ? { unconfirmed } : {}),
});
export const SPECIALIZATIONS: Specialization[] = [
  spec("shotstopper", "Shot Stopper+", "Cross Claimer", "gkHandling", "jumping", "gkPositioning"),
  spec("shotstopper", "Octopus", "Deflector", "gkDiving", "strength", "gkPositioning"),
  spec("shotstopper", "Spider", "1v1 Close Down", "gkReflexes", "acceleration", "agility"),
  spec("sweeperkeeper", "Sweeper Keeper+", "Far Throw", "gkDiving", "vision", "gkKicking"),
  spec("sweeperkeeper", "Launcher", "Long Ball Pass", "gkKicking", "longPassing", "gkReflexes"),
  spec("sweeperkeeper", "Extra", "Press Proven", "gkPositioning", "shortPassing", "composure"),
  spec("progressor", "Progressor+", "Jockey", "standingTackle", "longPassing", "defAware"),
  spec("progressor", "Pioneer", "Pinged Pass", "dribbling", "shortPassing", "longPassing"),
  spec("progressor", "Janitor", "Quick Step", "acceleration", "sprintSpeed", "slidingTackle"),
  spec("boss", "Boss+", "Slide Tackle", "slidingTackle", "strength", "aggression"),
  spec("boss", "Capitano", "Block", "defAware", "agility", "reactions"),
  spec("boss", "Enforcer", "Press Proven", "composure", "vision", "ballControl"),
  spec("marauder", "Marauder+", "Slide Tackle", "sprintSpeed", "slidingTackle", "aggression"),
  spec("marauder", "Athlete", "Bruiser", "strength", "defAware", "aggression"),
  spec("marauder", "Speedster", "Rapid", "sprintSpeed", "acceleration", "dribbling"),
  spec("disruptor", "Disruptor+", "Intercept", "interceptions", "balance", "reactions"),
  spec("disruptor", "Destroyer", "Slide Tackle", "strength", "sprintSpeed", "slidingTackle"),
  spec("disruptor", "Anchor", "Bruiser", "shortPassing", "ballControl", "dribbling"),
  spec("recycler", "Recycler+", "Pinged Pass", "shortPassing", "longPassing", "strength"),
  spec("recycler", "Thief", "Anticipate", "standingTackle", "interceptions", "defAware"),
  spec("recycler", "Driver", "Enforcer", "balance", "sprintSpeed", "strength"),
  spec("maestro", "Heartbeat", "Relentless", "agility", "stamina", "aggression"),
  spec("maestro", "Crasher", "First Touch", "composure", "ballControl", "finishing"),
  spec("maestro", "Maestro+", "Technical", "vision", "balance", "dribbling"),
  spec("creator", "Creator+", "Whipped Pass", "vision", "crossing", "longPassing"),
  spec("creator", "Architect", "Dead Ball", "crossing", "shotPower", "fkAccuracy"),
  spec("creator", "Sniper", "Power Shot", "shotPower", "finishing", "longShots"),
  spec("spark", "Joker", "Whipped Pass", "crossing", "longPassing", null, "EA dropped its Att. Positioning target; no replacement confirmed"),
  spec("spark", "Spark+", "Quick Step", "agility", "acceleration", "sprintSpeed"),
  spec("spark", "Ace", "Chip Shot", "finishing", "reactions", "ballControl"),
  spec("magician", "Invader", "Incisive Pass", "longPassing", "vision", null, "EA dropped its Att. Positioning target; no replacement confirmed"),
  spec("magician", "Magician+", "First Touch", "ballControl", "acceleration", "composure"),
  spec("magician", "Hotshot", "Power Shot", "shotPower", "finishing", "longShots"),
  spec("finisher", "Finisher+", "Chip Shot", "composure", "reactions", "ballControl"),
  spec("finisher", "Hunter", "Gamechanger", "curve", "finishing", "balance", "Balance replaced Att. Positioning according to one player report"),
  spec("finisher", "Presser", "Relentless", "stamina", "agility", "aggression"),
  spec("target", "Target+", "Acrobatic", "jumping", "agility", "volleys"),
  spec("target", "Runner", "Enforcer", "sprintSpeed", "strength", "aggression", "Aggression replaced Att. Positioning according to one player report"),
  spec("target", "Roamer", "Incisive Pass", "shortPassing", "vision", "longPassing"),
];

// Club facilities boost attributes in matches. EA publishes no FC 27 facility numbers, so players type in
// what their club has; this is the most the planner accepts per attribute (our own limit, not the game's).
export const FACILITY_BOOST_MAX = 10;

// What we still don't know, shown on the page
export const UNCONFIRMED_NOTES = [
  "Attribute ceilings come from one community source (Pro Clubs HQ, read in game).",
  "Goalkeeper PlayStyle requirements (FC 26 values; a keeper's list hasn't been read in FC 27).",
  "The third requirement of Joker and Invader, and one requirement each of Hunter and Runner, since EA removed Attacking Positioning.",
  "The star-by-star split of some skill move and weak foot prices (the totals are published).",
  "AP prices for keepers' Long Shots and Volleys.",
  "Lengthy AcceleRATE's minimum height: 183 cm here; some sources say 185 cm for FC 27.",
  "Height and weight shifts are FC 26's, reported unchanged in FC 27.",
  "Whether Mastery points count towards PlayStyle and Specialization targets, and whether they can pass a ceiling (the planner assumes yes, up to 99).",
  "Club facility boost sizes: type in what your club has.",
  "Amps (timed boosts, PlayStyles and PlayStyle+) aren't modelled.",
];
