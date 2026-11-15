// Virtual Pro build planner: archetype, level, body, skill moves / weak foot, the attribute points you
// add and your PlayStyles, saved in a short share code (gafferbot.app/build?b=...).
// EA doesn't publish FC27's point costs, caps or PlayStyle thresholds, so nothing here pretends to know
// them: you enter the points your in-game screen says you have, and the planner tracks what's left.
// Archetype names, attributes and PlayStyles are EA's in-game names; edit the lists below when EA
// changes them. Builds from the Pro Clubs Builder share links can be imported (their own format).

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

export const PLAYSTYLES: { name: string; group: AttrGroup | "goalkeeping" }[] = [
  ...["Finesse Shot", "Chip Shot", "Power Shot", "Dead Ball", "Precision Header", "Acrobatic", "Low Driven Shot", "Power Header", "Game Changer"].map((name) => ({ name, group: "shooting" as const })),
  ...["Incisive Pass", "Pinged Pass", "Long Ball Pass", "Tiki Taka", "Whipped Pass", "Inventive"].map((name) => ({ name, group: "passing" as const })),
  ...["Technical", "Rapid", "First Touch", "Trickster", "Press Proven", "Flair"].map((name) => ({ name, group: "dribbling" as const })),
  ...["Jockey", "Block", "Intercept", "Anticipate", "Slide Tackle", "Aerial Fortress"].map((name) => ({ name, group: "defending" as const })),
  ...["Quick Step", "Relentless", "Long Throw", "Bruiser", "Enforcer"].map((name) => ({ name, group: "physical" as const })),
  ...["Far Throw", "Footwork", "Cross Claimer", "Rush Out", "Far Reach", "Deflector"].map((name) => ({ name, group: "goalkeeping" as const })),
];
export const MAX_PLAYSTYLES = 10;

export const LEVEL_MAX = 100;
export const HEIGHT_RANGE: [number, number] = [150, 210];
export const WEIGHT_RANGE: [number, number] = [45, 115];
export const POINTS_MAX_PER_ATTR = 60;

export interface Build {
  name: string;
  archetype: string; // ARCHETYPES key
  level: number;
  heightCm: number;
  weightKg: number;
  skillMoves: number; // 1-5
  weakFoot: number; // 1-5
  points: Record<string, number>; // attribute key -> points added
  playstyles: string[];
  budget: number | null; // points available, typed in from the game screen
}

export const emptyBuild = (archetype = "finisher"): Build => ({
  name: "",
  archetype,
  level: 1,
  heightCm: 180,
  weightKg: 75,
  skillMoves: 3,
  weakFoot: 3,
  points: {},
  playstyles: [],
  budget: null,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};

export function normaliseBuild(b: Partial<Build>): Build {
  const base = emptyBuild();
  const points: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.points ?? {})) {
    const a = ATTR_BY_ANY.get(k.toLowerCase());
    const n = int(v, 0, POINTS_MAX_PER_ATTR, 0);
    if (a && n) points[a.key] = n;
  }
  const known = new Set(PLAYSTYLES.map((p) => p.name));
  return {
    name: String(b.name ?? "").replace(/[|\n\r]/g, " ").trim().slice(0, 40),
    archetype: ARCHETYPES.some((a) => a.key === b.archetype) ? b.archetype! : base.archetype,
    level: int(b.level, 1, LEVEL_MAX, 1),
    heightCm: int(b.heightCm, ...HEIGHT_RANGE, base.heightCm),
    weightKg: int(b.weightKg, ...WEIGHT_RANGE, base.weightKg),
    skillMoves: int(b.skillMoves, 1, 5, 3),
    weakFoot: int(b.weakFoot, 1, 5, 3),
    points,
    playstyles: [...new Set((b.playstyles ?? []).filter((p) => known.has(p)))].slice(0, MAX_PLAYSTYLES),
    budget: b.budget === null || b.budget === undefined || b.budget === ("" as unknown) ? null : int(b.budget, 0, 5000, 0),
  };
}

export const pointsSpent = (b: Build) => Object.values(b.points).reduce((t, v) => t + v, 0);

export function groupTotals(b: Build): Record<AttrGroup, number> {
  const out = Object.fromEntries(ATTR_GROUPS.map((g) => [g.key, 0])) as Record<AttrGroup, number>;
  for (const a of ATTRIBUTES) out[a.group] += b.points[a.key] || 0;
  return out;
}

// Plain-English read of where the points went
export function buildSummary(b: Build): { spent: number; remaining: number | null; focus: { group: AttrGroup; label: string; share: number }[]; notes: string[] } {
  const spent = pointsSpent(b);
  const totals = groupTotals(b);
  const focus = ATTR_GROUPS.map((g) => ({ group: g.key, label: g.label, share: spent ? totals[g.key] / spent : 0 }))
    .filter((f) => f.share > 0)
    .sort((x, y) => y.share - x.share);
  const arch = ARCHETYPES.find((a) => a.key === b.archetype)!;
  const notes: string[] = [];
  if (b.budget !== null && spent > b.budget) notes.push(`${spent - b.budget} points over the ${b.budget} you have.`);
  if (spent && arch.line !== "GK" && totals.goalkeeping) notes.push("Goalkeeping points do nothing for an outfield player.");
  if (spent && arch.line === "GK" && totals.goalkeeping / spent < 0.5) notes.push("Most keeper points usually go into goalkeeping.");
  const top = focus[0];
  if (top && !arch.focus.includes(top.group)) notes.push(`Most points are in ${top.label.toLowerCase()}, which isn't what a ${arch.name} is built around (${arch.focus.join(" and ")}).`);
  if (b.playstyles.length > MAX_PLAYSTYLES) notes.push(`Only ${MAX_PLAYSTYLES} PlayStyles fit.`);
  return { spent, remaining: b.budget === null ? null : b.budget - spent, focus, notes };
}

// ---------- Share codes ----------
// gb1~archetype~level~height~weight~skill~weakfoot~budget~attrIndex.points,...~playstyle index list~name
// (indexes into ATTRIBUTES and PLAYSTYLES: only ever append to those lists, never reorder)
// base64url so it survives chat apps; ~ and . never appear in our keys or numbers.

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
  const styles = b.playstyles.map((p) => PLAYSTYLES.findIndex((s) => s.name === p)).filter((i) => i >= 0).join(",");
  return b64urlEncode(["gb1", b.archetype, b.level, b.heightCm, b.weightKg, b.skillMoves, b.weakFoot, b.budget ?? "", attrs, styles, b.name].join("~"));
}

export function decodeBuild(code: string): Build | null {
  try {
    const parts = b64Decode(code).split("~");
    if (parts[0] !== "gb1" || parts.length < 11) return null;
    const [, archetype, level, h, w, sm, wf, budget, attrs, styles, ...name] = parts;
    const points: Record<string, number> = {};
    for (const pair of attrs ? attrs.split(",") : []) {
      const [k, v] = pair.split(".");
      const a = ATTRIBUTES[Number(k)];
      if (a) points[a.key] = Number(v);
    }
    return normaliseBuild({
      archetype,
      level: Number(level),
      heightCm: Number(h),
      weightKg: Number(w),
      skillMoves: Number(sm),
      weakFoot: Number(wf),
      budget: budget === "" ? null : Number(budget),
      points,
      playstyles: (styles ? styles.split(",") : []).map((i) => PLAYSTYLES[Number(i)]?.name).filter(Boolean) as string[],
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
