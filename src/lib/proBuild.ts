// Virtual Pro build planner for EA FC 27 Clubs: archetype, level, body, the attribute points you add and your
// PlayStyles, priced and unlocked the way the game does it (rules and data in proClubsData.ts), saved in a short
// share code (gafferbot.app/build?b=...). Builds from Pro Clubs Builder share links can be imported.
import {
  ACCELERATE_HEIGHT_SPLIT, AP_BY_LEVEL, ARCHETYPE_RULES, ATTRIBUTE_KEYS, BODY, BODY_EFFECTS, CAPS, COST_BANDS, COST_TIERS,
  LEVEL_CAP, MASTERIES, PLAYSTYLE_DEFS, PLAYSTYLE_SLOT_LEVELS, SIGNATURE_PLUS_LEVELS, SPECIALIZATIONS, START_VALUES,
  type AttrKey, type PlayStyleDef, type Specialization, type StyleGroup,
} from "./proClubsData.ts";

export { AP_BY_LEVEL, ARCHETYPE_RULES, BODY, LEVEL_CAP, PLAYSTYLE_DEFS, PLAYSTYLE_SLOT_LEVELS, SPECIALIZATIONS, type AttrKey, type PlayStyleDef, type Specialization, type StyleGroup };

export type Line = "GK" | "DEF" | "MID" | "FWD";

export interface Archetype {
  key: string;
  name: string;
  line: Line;
  blurb: string;
  focus: AttrGroup[]; // groups this archetype is built around, used for suggestions
}

export const ARCHETYPES: Archetype[] = [
  { key: "shotstopper", name: "Shot Stopper", line: "GK", blurb: "Reflexes and positioning on the line.", focus: ["goalkeeping"] },
  { key: "sweeperkeeper", name: "Sweeper Keeper", line: "GK", blurb: "Comes off the line and plays out from the back.", focus: ["goalkeeping", "passing"] },
  { key: "progressor", name: "Progressor", line: "DEF", blurb: "A defender who moves the ball forward.", focus: ["defending", "passing"] },
  { key: "boss", name: "Boss", line: "DEF", blurb: "Strong, aerial, wins duels.", focus: ["defending", "physical"] },
  { key: "marauder", name: "Marauder", line: "DEF", blurb: "Gets up and down the flank.", focus: ["pace", "defending"] },
  { key: "disruptor", name: "Disruptor", line: "MID", blurb: "Breaks up play in midfield.", focus: ["defending", "physical"] },
  { key: "recycler", name: "Recycler", line: "MID", blurb: "Keeps the ball moving and the shape tidy.", focus: ["passing", "defending"] },
  { key: "maestro", name: "Maestro", line: "MID", blurb: "Controls tempo with range of passing.", focus: ["passing", "dribbling"] },
  { key: "creator", name: "Creator", line: "MID", blurb: "Unlocks defences in the final third.", focus: ["passing", "dribbling"] },
  { key: "spark", name: "Spark", line: "FWD", blurb: "Pace and tricks out wide.", focus: ["pace", "dribbling"] },
  { key: "magician", name: "Magician", line: "FWD", blurb: "Close control and invention.", focus: ["dribbling", "shooting"] },
  { key: "finisher", name: "Finisher", line: "FWD", blurb: "Lives in the box and scores.", focus: ["shooting", "pace"] },
  { key: "target", name: "Target", line: "FWD", blurb: "Holds it up and wins headers.", focus: ["physical", "shooting"] },
];

export type AttrGroup = "pace" | "shooting" | "passing" | "dribbling" | "defending" | "physical" | "goalkeeping";

export const ATTR_GROUPS: { key: AttrGroup; label: string }[] = [
  { key: "pace", label: "Pace" },
  { key: "shooting", label: "Shooting" },
  { key: "passing", label: "Passing" },
  { key: "dribbling", label: "Dribbling" },
  { key: "defending", label: "Defending" },
  { key: "physical", label: "Physical" },
  { key: "goalkeeping", label: "Goalkeeping" },
];

export interface Attribute {
  key: string; // also the key in share codes
  label: string;
  group: AttrGroup;
  aliases?: string[]; // other spellings accepted on import
}

export const ATTRIBUTES: Attribute[] = [
  { key: "acceleration", label: "Acceleration", group: "pace" },
  { key: "sprintSpeed", label: "Sprint Speed", group: "pace" },
  { key: "positioning", label: "Att. Positioning", group: "shooting", aliases: ["attPosition", "attackPositioning", "attPositioning"] },
  { key: "finishing", label: "Finishing", group: "shooting" },
  { key: "shotPower", label: "Shot Power", group: "shooting" },
  { key: "longShots", label: "Long Shots", group: "shooting" },
  { key: "volleys", label: "Volleys", group: "shooting" },
  { key: "penalties", label: "Penalties", group: "shooting" },
  { key: "vision", label: "Vision", group: "passing" },
  { key: "crossing", label: "Crossing", group: "passing" },
  { key: "fkAccuracy", label: "FK Accuracy", group: "passing", aliases: ["freeKick", "freeKickAccuracy", "fkAcc"] },
  { key: "shortPassing", label: "Short Passing", group: "passing" },
  { key: "longPassing", label: "Long Passing", group: "passing" },
  { key: "curve", label: "Curve", group: "passing" },
  { key: "agility", label: "Agility", group: "dribbling" },
  { key: "balance", label: "Balance", group: "dribbling" },
  { key: "reactions", label: "Reactions", group: "dribbling" },
  { key: "ballControl", label: "Ball Control", group: "dribbling" },
  { key: "dribbling", label: "Dribbling", group: "dribbling" },
  { key: "composure", label: "Composure", group: "dribbling" },
  { key: "interceptions", label: "Interceptions", group: "defending" },
  { key: "headingAccuracy", label: "Heading Acc.", group: "defending", aliases: ["heading", "headingAcc"] },
  { key: "defAware", label: "Def. Awareness", group: "defending", aliases: ["defensiveAwareness", "defAwareness", "marking"] },
  { key: "standingTackle", label: "Standing Tackle", group: "defending" },
  { key: "slidingTackle", label: "Sliding Tackle", group: "defending" },
  { key: "jumping", label: "Jumping", group: "physical" },
  { key: "stamina", label: "Stamina", group: "physical" },
  { key: "strength", label: "Strength", group: "physical" },
  { key: "aggression", label: "Aggression", group: "physical" },
  { key: "gkDiving", label: "GK Diving", group: "goalkeeping", aliases: ["diving"] },
  { key: "gkHandling", label: "GK Handling", group: "goalkeeping", aliases: ["handling"] },
  { key: "gkKicking", label: "GK Kicking", group: "goalkeeping", aliases: ["kicking"] },
  { key: "gkPositioning", label: "GK Positioning", group: "goalkeeping", aliases: ["gkPosition"] },
  { key: "gkReflexes", label: "GK Reflexes", group: "goalkeeping", aliases: ["reflexes"] },
];

const ATTR_BY_ANY = new Map<string, Attribute>();
for (const a of ATTRIBUTES) for (const k of [a.key, ...(a.aliases ?? [])]) ATTR_BY_ANY.set(k.toLowerCase(), a);

const KEY_INDEX = new Map<string, number>(ATTRIBUTE_KEYS.map((k, i) => [k, i]));

// ---------- PlayStyles ----------
export const PLAYSTYLES: { name: string; group: StyleGroup }[] = PLAYSTYLE_DEFS.map(({ name, group }) => ({ name, group }));
export const STYLE_GROUPS: { key: StyleGroup; label: string }[] = [
  { key: "shooting", label: "Shooting" },
  { key: "passing", label: "Passing" },
  { key: "ballControl", label: "Ball control" },
  { key: "defending", label: "Defending" },
  { key: "physical", label: "Physical" },
  { key: "goalkeeping", label: "Goalkeeping" },
];
// Regular PlayStyle slots at the level cap (Signatures come on top)
export const MAX_PLAYSTYLES = PLAYSTYLE_SLOT_LEVELS.length;
// Older names, and PlayStyles that aren't in FC 27
const STYLE_ALIASES: Record<string, string> = { "Game Changer": "Gamechanger", "Game changer": "Gamechanger", "1v1 Close down": "1v1 Close Down" };
export const canonStyle = (name: string) => STYLE_ALIASES[name] ?? name;

export const LEVEL_MAX = LEVEL_CAP;
export const HEIGHT_RANGE: [number, number] = [162, 200];
export const WEIGHT_RANGE: [number, number] = [60, 100];
export const POINTS_MAX_PER_ATTR = 59;

export interface Build {
  name: string;
  archetype: string; // ARCHETYPES key
  level: number; // 1..55
  heightCm: number;
  weightKg: number;
  skillMoves: number; // 1-5
  weakFoot: number; // 1-5
  points: Record<string, number>; // attribute key -> points added above the archetype's starting value
  playstyles: string[]; // regular PlayStyles picked for the slots (Signatures are automatic)
  specialization: string | null; // SPECIALIZATIONS key
  budget: number | null; // kept for old links; the game decides AP by level now
}

const archOf = (key: string) => ARCHETYPES.find((a) => a.key === key) ?? ARCHETYPES[ARCHETYPES.length - 2];
export const isKeeper = (archetype: string) => archOf(archetype).line === "GK";

export const emptyBuild = (archetype = "finisher"): Build => ({
  name: "",
  archetype,
  level: 1,
  heightCm: BODY[archetype]?.startH ?? 180,
  weightKg: BODY[archetype]?.startW ?? 75,
  skillMoves: 3,
  weakFoot: 3,
  points: {},
  playstyles: [],
  specialization: null,
  budget: null,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};

// ---------- Attribute values and prices ----------
export const startValue = (archetype: string, key: string) => START_VALUES[archetype]?.[KEY_INDEX.get(key) ?? -1] ?? 0;
export const trainable = (archetype: string, key: string) => startValue(archetype, key) > 0;
export const attrCap = (archetype: string, key: string) => (trainable(archetype, key) ? (CAPS[archetype]?.[key as AttrKey] ?? 99) : 0);
export const capConfirmed = (archetype: string, key: string) => CAPS[archetype]?.[key as AttrKey] !== undefined;
export const costTier = (archetype: string, key: string) => COST_TIERS[archetype]?.[KEY_INDEX.get(key) ?? -1] ?? 0;

// AP for one point that takes the attribute up to `value`
export function pointCost(archetype: string, key: string, value: number): number {
  const tier = costTier(archetype, key);
  if (!tier) return Infinity;
  const band = COST_BANDS.find((b) => value <= b[0]) ?? COST_BANDS[COST_BANDS.length - 1];
  return band[tier];
}

// AP to raise an attribute from one value to another
export function costBetween(archetype: string, key: string, from: number, to: number): number {
  let t = 0;
  for (let v = from + 1; v <= to; v++) t += pointCost(archetype, key, v);
  return t;
}

export const trainedValue = (b: Build, key: string) => (trainable(b.archetype, key) ? startValue(b.archetype, key) + (b.points[key] ?? 0) : 0);

// Mastery from levelling this archetype (other archetypes' masteries aren't known here)
export function masteryBonus(b: Build, key: string): number {
  const pair = MASTERIES[b.archetype];
  if (!pair) return 0;
  const [first, second] = pair;
  let n = 0;
  if (key === first) n += (b.level >= 10 ? 1 : 0) + (b.level >= 55 ? 1 : 0);
  if (key === second) n += (b.level >= 10 ? 1 : 0) + (b.level >= 30 ? 1 : 0);
  return n;
}

// What the attributes screen shows: trained value plus mastery
export const menuValue = (b: Build, key: string) => (trainable(b.archetype, key) ? Math.min(99, trainedValue(b, key) + masteryBonus(b, key)) : 0);

const steps = (diff: number, per: number) => Math.sign(diff) * Math.ceil(Math.abs(diff) / per);
// Height/weight shifts, applied in matches only
export function bodyEffects(b: Build): Partial<Record<AttrKey, number>> {
  const body = BODY[b.archetype];
  const fx = isKeeper(b.archetype) ? BODY_EFFECTS.keeper : BODY_EFFECTS.outfield;
  const out: Partial<Record<AttrKey, number>> = {};
  const add = (keys: readonly AttrKey[], n: number) => keys.forEach((k) => (out[k] = (out[k] ?? 0) + n));
  if (!body) return out;
  const h = steps(b.heightCm - body.startH, 4);
  const w = steps(b.weightKg - body.startW, 8);
  add(fx.taller.up, h);
  add(fx.taller.down, -h);
  add(fx.heavier.up, w);
  add(fx.heavier.down, -w);
  for (const k of Object.keys(out) as AttrKey[]) if (!out[k] || !trainable(b.archetype, k)) delete out[k];
  return out;
}

export const matchValue = (b: Build, key: string, fx = bodyEffects(b)) =>
  trainable(b.archetype, key) ? clamp(menuValue(b, key) + (fx[key as AttrKey] ?? 0), 1, 99) : 0;

export const accelerateType = (b: Build) => (b.heightCm <= ACCELERATE_HEIGHT_SPLIT ? "Explosive or Controlled" : "Lengthy or Controlled");

// ---------- AP ----------
export const apAtLevel = (level: number) => AP_BY_LEVEL[clamp(Math.round(level), 1, LEVEL_CAP)];
export function apSpent(b: Build): number {
  let t = 0;
  for (const [k, p] of Object.entries(b.points)) if (p > 0) t += costBetween(b.archetype, k, startValue(b.archetype, k), startValue(b.archetype, k) + p);
  return t;
}
// Lowest level whose AP covers what the build spends (null if more than the cap allows)
export function levelNeeded(spent: number): number | null {
  const lvl = AP_BY_LEVEL.findIndex((ap, i) => i >= 1 && ap >= spent);
  return lvl === -1 ? null : lvl;
}

// ---------- Unlocks ----------
export interface Missing { key: string; need: number; have: number }
// Points to add so every requirement is met; null when one is above the archetype's cap
function raisePlan(b: Build, req: [string, number][]): { missing: Missing[]; ap: number | null } {
  const missing: Missing[] = [];
  let ap = 0;
  for (const [k, need] of req) {
    const have = menuValue(b, k);
    if (have >= need) continue;
    missing.push({ key: k, need, have });
    if (!trainable(b.archetype, k) || need - masteryBonus(b, k) > attrCap(b.archetype, k)) {
      ap = NaN;
      continue;
    }
    const from = trainedValue(b, k);
    ap += costBetween(b.archetype, k, from, need - masteryBonus(b, k));
  }
  return { missing, ap: Number.isNaN(ap) ? null : ap };
}

// Raise attributes just enough to meet requirements (what the "unlock" buttons do)
export function raiseFor(b: Build, req: [string, number][]): Build {
  const points = { ...b.points };
  for (const [k, need] of req) {
    if (!trainable(b.archetype, k)) continue;
    const target = Math.min(attrCap(b.archetype, k), need - masteryBonus(b, k));
    points[k] = Math.max(points[k] ?? 0, target - startValue(b.archetype, k));
  }
  return normaliseBuild({ ...b, points });
}

export interface StyleStatus { def: PlayStyleDef; available: boolean; unlocked: boolean; missing: Missing[]; apToUnlock: number | null; signature: 0 | 1 | 2; plus: boolean }
export function playstyleStatus(b: Build): StyleStatus[] {
  const keeper = isKeeper(b.archetype);
  const sigs = ARCHETYPE_RULES[b.archetype]?.signatures ?? ["", ""];
  return PLAYSTYLE_DEFS.map((def) => {
    const sig = sigs[0] === def.name ? 1 : sigs[1] === def.name ? 2 : 0;
    const available = !def.keeperOnly || keeper;
    const { missing, ap } = raisePlan(b, Object.entries(def.req) as [string, number][]);
    return {
      def,
      available,
      unlocked: available && (sig > 0 || missing.length === 0),
      missing: sig ? [] : missing,
      apToUnlock: sig ? 0 : available ? ap : null,
      signature: sig as 0 | 1 | 2,
      plus: sig > 0 && b.level >= SIGNATURE_PLUS_LEVELS[sig - 1],
    };
  });
}

export const playstyleSlots = (level: number) => PLAYSTYLE_SLOT_LEVELS.filter((l) => level >= l).length;
export const nextSlotLevel = (level: number) => PLAYSTYLE_SLOT_LEVELS.find((l) => level < l) ?? null;

export interface SpecStatus { spec: Specialization; met: boolean; missing: Missing[]; apToReach: number | null }
export function specializationStatus(b: Build): SpecStatus[] {
  return SPECIALIZATIONS.filter((s) => s.archetype === b.archetype).map((spec) => {
    const { missing, ap } = raisePlan(b, spec.req);
    return { spec, met: missing.length === 0, missing, apToReach: ap };
  });
}

// ---------- Normalise ----------
export function normaliseBuild(b: Partial<Build>): Build {
  const archetype = ARCHETYPES.some((a) => a.key === b.archetype) ? b.archetype! : "finisher";
  const base = emptyBuild(archetype);
  const body = BODY[archetype];
  const points: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.points ?? {})) {
    const a = ATTR_BY_ANY.get(k.toLowerCase());
    if (!a || !trainable(archetype, a.key)) continue;
    const n = int(v, 0, attrCap(archetype, a.key) - startValue(archetype, a.key), 0);
    if (n) points[a.key] = n;
  }
  const known = new Set(PLAYSTYLE_DEFS.filter((p) => !p.keeperOnly || isKeeper(archetype)).map((p) => p.name));
  const sigs = new Set(ARCHETYPE_RULES[archetype]?.signatures ?? []);
  const spec = SPECIALIZATIONS.find((s) => s.key === b.specialization && s.archetype === archetype);
  return {
    name: String(b.name ?? "").replace(/[|~\n\r]/g, " ").trim().slice(0, 40),
    archetype,
    level: int(b.level, 1, LEVEL_CAP, 1),
    heightCm: int(b.heightCm, body.h[0], body.h[1], base.heightCm),
    weightKg: int(b.weightKg, body.w[0], body.w[1], base.weightKg),
    skillMoves: int(b.skillMoves, 1, 5, 3),
    weakFoot: int(b.weakFoot, 1, 5, 3),
    points,
    playstyles: [...new Set((b.playstyles ?? []).map(canonStyle).filter((p) => known.has(p) && !sigs.has(p)))].slice(0, MAX_PLAYSTYLES),
    specialization: spec ? spec.key : null,
    budget: null,
  };
}

export const pointsSpent = (b: Build) => Object.values(b.points).reduce((t, v) => t + v, 0);

// Points added per attribute group
export function groupTotals(b: Build): Record<AttrGroup, number> {
  const out = Object.fromEntries(ATTR_GROUPS.map((g) => [g.key, 0])) as Record<AttrGroup, number>;
  for (const a of ATTRIBUTES) out[a.group] += b.points[a.key] || 0;
  return out;
}

// In-match average per group (what the radar draws)
export function groupAverages(b: Build): Record<AttrGroup, number> {
  const fx = bodyEffects(b);
  const out = {} as Record<AttrGroup, number>;
  for (const g of ATTR_GROUPS) {
    const vals = ATTRIBUTES.filter((a) => a.group === g.key && trainable(b.archetype, a.key)).map((a) => matchValue(b, a.key, fx));
    out[g.key] = vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : 0;
  }
  return out;
}

export interface BuildSummary {
  spent: number; // AP
  available: number; // AP at this level
  remaining: number;
  levelNeeded: number | null;
  slots: number;
  focus: { group: AttrGroup; label: string; share: number }[]; // where the AP went
  notes: string[];
}
export function buildSummary(b: Build): BuildSummary {
  const spent = apSpent(b);
  const available = apAtLevel(b.level);
  const byGroup = Object.fromEntries(ATTR_GROUPS.map((g) => [g.key, 0])) as Record<AttrGroup, number>;
  for (const a of ATTRIBUTES) {
    const p = b.points[a.key];
    if (p) byGroup[a.group] += costBetween(b.archetype, a.key, startValue(b.archetype, a.key), startValue(b.archetype, a.key) + p);
  }
  const focus = ATTR_GROUPS.map((g) => ({ group: g.key, label: g.label, share: spent ? byGroup[g.key] / spent : 0 }))
    .filter((f) => f.share > 0)
    .sort((x, y) => y.share - x.share);
  const notes: string[] = [];
  const need = levelNeeded(spent);
  if (spent > available) notes.push(need ? `${spent - available} AP over what level ${b.level} gives you: this build needs level ${need}.` : `${spent - available} AP over: more than even level ${LEVEL_CAP} gives (${apAtLevel(LEVEL_CAP)} AP).`);
  const slots = playstyleSlots(b.level);
  if (b.playstyles.length > slots) notes.push(`Level ${b.level} has ${slots} PlayStyle slot${slots === 1 ? "" : "s"}; ${b.playstyles.length} are picked.`);
  const status = new Map(playstyleStatus(b).map((s) => [s.def.name, s]));
  const locked = b.playstyles.filter((p) => !status.get(p)?.unlocked);
  if (locked.length) notes.push(`Not unlocked yet: ${locked.join(", ")}.`);
  const spec = specializationStatus(b).find((s) => s.spec.key === b.specialization);
  if (spec && !spec.met) notes.push(`${spec.spec.name} isn't reached yet.`);
  return { spent, available, remaining: available - spent, levelNeeded: need, slots, focus, notes };
}

// ---------- Share codes ----------
// gb2~archetype~level~height~weight~skill~weakfoot~attrIndex.points,...~playstyle index list~specialization~name
// Indexes into ATTRIBUTES and PLAYSTYLE_DEFS: only ever append to those lists, never reorder.
// gb1 (first version) is still read: its PlayStyle indexes use LEGACY_STYLES.
const LEGACY_STYLES = [
  "Finesse Shot", "Chip Shot", "Power Shot", "Dead Ball", "Precision Header", "Acrobatic", "Low Driven Shot", "Power Header", "Game Changer",
  "Incisive Pass", "Pinged Pass", "Long Ball Pass", "Tiki Taka", "Whipped Pass", "Inventive",
  "Technical", "Rapid", "First Touch", "Trickster", "Press Proven", "Flair",
  "Jockey", "Block", "Intercept", "Anticipate", "Slide Tackle", "Aerial Fortress",
  "Quick Step", "Relentless", "Long Throw", "Bruiser", "Enforcer",
  "Far Throw", "Footwork", "Cross Claimer", "Rush Out", "Far Reach", "Deflector",
];

const b64urlEncode = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64Decode = (s: string) => {
  const norm = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeBuild(input: Build): string {
  const b = normaliseBuild(input);
  const attrs = ATTRIBUTES.map((a, i) => (b.points[a.key] ? `${i}.${b.points[a.key]}` : "")).filter(Boolean).join(",");
  const styles = b.playstyles.map((p) => PLAYSTYLE_DEFS.findIndex((s) => s.name === p)).filter((i) => i >= 0).join(",");
  const spec = b.specialization ? SPECIALIZATIONS.findIndex((s) => s.key === b.specialization) : -1;
  return b64urlEncode(["gb2", b.archetype, b.level, b.heightCm, b.weightKg, b.skillMoves, b.weakFoot, attrs, styles, spec >= 0 ? spec : "", b.name].join("~"));
}

export function decodeBuild(code: string): Build | null {
  try {
    const parts = b64Decode(code).split("~");
    const v2 = parts[0] === "gb2";
    if (!(v2 || parts[0] === "gb1") || parts.length < (v2 ? 11 : 11)) return null;
    const [, archetype, level, h, w, sm, wf] = parts;
    const [attrs, styles, specIdx, ...name] = v2 ? parts.slice(7) : [parts[8], parts[9], "", ...parts.slice(10)];
    const points: Record<string, number> = {};
    for (const pair of attrs ? attrs.split(",") : []) {
      const [k, v] = pair.split(".");
      const a = ATTRIBUTES[Number(k)];
      if (a) points[a.key] = Number(v);
    }
    const list = v2 ? PLAYSTYLE_DEFS.map((p) => p.name) : LEGACY_STYLES;
    return normaliseBuild({
      archetype,
      level: Number(level),
      heightCm: Number(h),
      weightKg: Number(w),
      skillMoves: Number(sm),
      weakFoot: Number(wf),
      points,
      playstyles: (styles ? styles.split(",") : []).map((i) => list[Number(i)]).filter(Boolean),
      specialization: specIdx !== "" && specIdx !== undefined ? SPECIALIZATIONS[Number(specIdx)]?.key ?? null : null,
      name: name.join("~"),
    });
  } catch {
    return null;
  }
}

export const buildPath = (b: Build) => `/build?b=${encodeBuild(b)}`;

// ---------- Import from a Pro Clubs Builder share link ----------
// Their link ends in /b/<base64 of "version|archetype|level|height|weight|skill|weakFoot|attr:points,...|||name|">.
// Archetype numbers follow the order on their page (1 = Shot Stopper ... 13 = Target), which is the
// order of ARCHETYPES above.
export function importProClubsBuilder(linkOrCode: string): { build: Build; skipped: string[] } | null {
  let code = linkOrCode.trim().replace(/[?#].*$/, "");
  const at = code.lastIndexOf("/b/");
  if (at >= 0) code = code.slice(at + 3);
  code = code.replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_\-+/=]{8,}$/.test(code)) return null;
  let text: string;
  try {
    text = b64Decode(code);
  } catch {
    return null;
  }
  const f = text.split("|");
  if (f.length < 8 || !/^\d+$/.test(f[0])) return null;
  const arch = ARCHETYPES[Number(f[1]) - 1];
  if (!arch) return null;
  const points: Record<string, number> = {};
  const skipped: string[] = [];
  for (const pair of f[7] ? f[7].split(",") : []) {
    const [k, v] = pair.split(":");
    const a = ATTR_BY_ANY.get(String(k).toLowerCase());
    if (a) points[a.key] = Number(v);
    else if (k) skipped.push(k);
  }
  const name = f.slice(8).filter(Boolean).pop() ?? "";
  return {
    build: normaliseBuild({ archetype: arch.key, level: Number(f[2]), heightCm: Number(f[3]), weightKg: Number(f[4]), skillMoves: Number(f[5]), weakFoot: Number(f[6]), points, name }),
    skipped,
  };
}
