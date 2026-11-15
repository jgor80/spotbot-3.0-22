// Community meta builds (Jeff, 2026-11-15): what the Pro Clubs community says is the best Virtual Pro build for each
// position, read from Reddit posts and YouTube videos into the Knowledge Bank (supabase/functions/_shared/fut/meta-builds.ts).
// This file turns the builds people described into one "community meta build" per position, the same way everywhere:
// the public meta-builds function, the MCP tool, the Knowledge Bank tab and the Build lab's "Load community meta build".
// Nothing here is invented: every field comes from builds people described, and a position nobody covered stays empty.
import { ARCHETYPES, ATTRIBUTES, MAX_PLAYSTYLES, PLAYSTYLES, encodeBuild, normaliseBuild, type Build, type Line } from "./proBuild.ts";

export const META_POSITIONS = [
  { key: "ST", label: "Striker", line: "FWD", aliases: ["ST", "CF"] },
  { key: "W", label: "Winger", line: "FWD", aliases: ["LW", "RW", "LM", "RM"] },
  { key: "CAM", label: "Attacking mid", line: "MID", aliases: ["CAM"] },
  { key: "CM", label: "Central mid", line: "MID", aliases: ["CM", "box-to-box"] },
  { key: "CDM", label: "Defensive mid", line: "MID", aliases: ["CDM"] },
  { key: "FB", label: "Full-back", line: "DEF", aliases: ["LB", "RB", "LWB", "RWB"] },
  { key: "CB", label: "Centre-back", line: "DEF", aliases: ["CB"] },
  { key: "GK", label: "Goalkeeper", line: "GK", aliases: ["GK"] },
] as const satisfies readonly { key: string; label: string; line: Line; aliases: readonly string[] }[];
export type MetaPosition = typeof META_POSITIONS[number]["key"];
export const META_POSITION_KEYS = META_POSITIONS.map((p) => p.key) as MetaPosition[];
export const isMetaPosition = (v: unknown): v is MetaPosition => typeof v === "string" && (META_POSITION_KEYS as string[]).includes(v);

/** One build someone described in a source, as the bank stores it (fut.kb_builds joined with its source). */
export interface BuildRow {
  position: string;
  archetype: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  skill_moves: number | null;
  weak_foot: number | null;
  playstyles: string[];
  key_attrs: string[];
  /** Exact attribute points, only when the source shared a build link (Pro Clubs Builder or GafferBot). */
  points: Record<string, number> | null;
  level: number | null;
  stance: number; // 1 recommended, 0 mixed or how-to, -1 warned against
  strength: number; // 1-3
  statement: string;
  said_at: string;
  weight: number; // fut.kb_weight: strength lifted for popular sources
  source: { id: string; kind: string; url: string | null; title: string | null; community: string | null; score: number; published_at: string };
}

export interface Share { name: string; share: number; builds: number }
export interface MetaSource { id: string; kind: string; url: string | null; title: string | null; community: string | null; published_at: string; statement: string }
export type Agreement = "agreed" | "leaning" | "split" | "early";

export interface MetaBuild {
  position: MetaPosition;
  label: string;
  builds: number; // builds people recommended for this position
  sources: number;
  agreement: Agreement;
  archetype: { key: string; name: string; share: number } | null;
  alternatives: Share[]; // other archetypes people back, with their share
  heightCm: number | null;
  weightKg: number | null;
  skillMoves: number | null;
  weakFoot: number | null;
  playstyles: Share[];
  attributes: Share[]; // attributes people say to max first (attribute labels)
  /** The exact points come from this shared build, when anyone shared one with the chosen archetype. */
  pointsFrom: MetaSource | null;
  warnings: { statement: string; source: MetaSource }[]; // what people warn against for this position
  build: Build | null; // ready for the Build lab
  code: string | null; // its share code: gafferbot.app/build?b=<code>
  topSources: MetaSource[];
  latest: string | null;
}

const DAY = 86_400_000;
/** Newer builds count more: full weight for the last 30 days, then fading to a third at 180 days (patches change the meta). */
export const recency = (saidAt: string, now: number) => {
  const age = Math.max(0, (now - Date.parse(saidAt)) / DAY);
  return age <= 30 ? 1 : Math.max(1 / 3, 1 - ((age - 30) / 150) * (2 / 3));
};

function weightedMedian(values: { v: number; w: number }[]): number | null {
  const xs = values.filter((x) => Number.isFinite(x.v) && x.v > 0 && x.w > 0).sort((a, b) => a.v - b.v);
  if (!xs.length) return null;
  const half = xs.reduce((t, x) => t + x.w, 0) / 2;
  let run = 0;
  for (const x of xs) { run += x.w; if (run >= half) return Math.round(x.v); }
  return Math.round(xs[xs.length - 1]!.v);
}

const archName = (key: string) => ARCHETYPES.find((a) => a.key === key)?.name ?? key;
const attrLabel = (key: string) => ATTRIBUTES.find((a) => a.key === key)?.label ?? key;
const toSource = (r: BuildRow): MetaSource => ({ id: r.source.id, kind: r.source.kind, url: r.source.url, title: r.source.title, community: r.source.community, published_at: r.source.published_at, statement: r.statement });

/** Weighted share of builds that mention each name; names below `min` share are dropped (unless they are all there is). */
function shares(rows: { r: BuildRow; w: number }[], pick: (r: BuildRow) => string[], total: number, min: number, max: number, label = (s: string) => s): Share[] {
  const score = new Map<string, { w: number; n: number }>();
  for (const { r, w } of rows) for (const name of new Set(pick(r))) {
    const s = score.get(name) ?? { w: 0, n: 0 };
    s.w += w; s.n += 1;
    score.set(name, s);
  }
  const all = [...score].map(([name, s]) => ({ name: label(name), share: total ? Math.round((s.w / total) * 100) / 100 : 0, builds: s.n }))
    .sort((a, b) => b.share - a.share || b.builds - a.builds || a.name.localeCompare(b.name));
  const kept = all.filter((s) => s.share >= min);
  return (kept.length ? kept : all).slice(0, max);
}

/** The community meta build for one position from the builds people described. */
export function metaBuildFor(position: MetaPosition, rows: BuildRow[], now = Date.now()): MetaBuild {
  const pos = META_POSITIONS.find((p) => p.key === position)!;
  const mine = rows.filter((r) => r.position === position);
  const backed = mine.filter((r) => r.stance >= 0).map((r) => ({ r, w: Math.max(0.1, Number(r.weight) || r.strength || 1) * recency(r.said_at, now) * (r.stance > 0 ? 1 : 0.5) }));
  const total = backed.reduce((t, x) => t + x.w, 0);

  // Archetype: the weighted vote among builds that name one
  const votes = new Map<string, number>();
  for (const { r, w } of backed) if (r.archetype && ARCHETYPES.some((a) => a.key === r.archetype)) votes.set(r.archetype, (votes.get(r.archetype) ?? 0) + w);
  const voteTotal = [...votes.values()].reduce((t, v) => t + v, 0);
  const ranked = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0];
  const archetype = top ? { key: top[0], name: archName(top[0]), share: Math.round((top[1] / voteTotal) * 100) / 100 } : null;
  const alternatives = ranked.slice(1, 4).map(([k, v]) => ({ name: archName(k), share: Math.round((v / voteTotal) * 100) / 100, builds: backed.filter((x) => x.r.archetype === k).length }));

  // Body and skills: the weighted median, from builds of the chosen archetype when at least two give a number
  const sameArch = archetype ? backed.filter((x) => x.r.archetype === archetype.key) : backed;
  const median = (get: (r: BuildRow) => number | null) => {
    const own = sameArch.filter((x) => (get(x.r) ?? 0) > 0);
    return weightedMedian((own.length >= 2 ? own : backed).map((x) => ({ v: get(x.r) ?? 0, w: x.w })));
  };
  const heightCm = median((r) => r.height_cm), weightKg = median((r) => r.weight_kg);
  const skillMoves = median((r) => r.skill_moves), weakFoot = median((r) => r.weak_foot);

  const known = new Set(PLAYSTYLES.map((p) => p.name));
  const playstyles = shares(backed, (r) => r.playstyles.filter((p) => known.has(p)), total, 0.25, MAX_PLAYSTYLES);
  const attrKeys = new Set(ATTRIBUTES.map((a) => a.key));
  const attributes = shares(backed, (r) => r.key_attrs.filter((a) => attrKeys.has(a)), total, 0.25, 8, attrLabel);

  // Exact points: the most-backed build someone shared as a link, with the chosen archetype
  const linked = sameArch.filter((x) => x.r.points && Object.keys(x.r.points).length).sort((a, b) => b.w - a.w)[0];

  const sources = new Map<string, number>();
  for (const { r, w } of backed) sources.set(r.source.id, (sources.get(r.source.id) ?? 0) + w);
  const topSources: MetaSource[] = [];
  for (const [id] of [...sources].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    const best = backed.filter((x) => x.r.source.id === id).sort((a, b) => b.w - a.w)[0]!;
    topSources.push(toSource(best.r));
  }
  const warnings = mine.filter((r) => r.stance < 0).sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0)).slice(0, 4)
    .map((r) => ({ statement: r.statement, source: toSource(r) }));

  const n = backed.length;
  const agreement: Agreement = n < 3 ? "early" : (archetype?.share ?? 0) >= 0.6 ? "agreed" : (archetype?.share ?? 0) >= 0.4 ? "leaning" : "split";
  const build = archetype || n
    ? normaliseBuild({
        name: `Community meta ${pos.key}`,
        archetype: archetype?.key ?? ARCHETYPES.find((a) => a.line === pos.line)!.key,
        level: linked?.r.level ?? 1,
        heightCm: heightCm ?? undefined,
        weightKg: weightKg ?? undefined,
        skillMoves: skillMoves ?? undefined,
        weakFoot: weakFoot ?? undefined,
        points: linked?.r.points ?? {},
        playstyles: playstyles.map((p) => p.name),
        budget: null,
      })
    : null;
  const latest = mine.reduce<string | null>((m, r) => (!m || r.said_at > m ? r.said_at : m), null);
  return {
    position, label: pos.label, builds: n, sources: sources.size, agreement, archetype, alternatives,
    heightCm, weightKg, skillMoves, weakFoot, playstyles, attributes,
    pointsFrom: linked ? toSource(linked.r) : null, warnings, build, code: build ? encodeBuild(build) : null, topSources, latest,
  };
}

/** Every position's community meta build. */
export const metaBuilds = (rows: BuildRow[], now = Date.now()) => META_POSITION_KEYS.map((p) => metaBuildFor(p, rows, now));

/** One line for an AI app or a Discord message. */
export function describeMetaBuild(m: MetaBuild): string {
  if (!m.builds) return `${m.label}: no community builds yet.`;
  const body = [m.heightCm && `${m.heightCm} cm`, m.weightKg && `${m.weightKg} kg`, m.skillMoves && `${m.skillMoves}★ skills`, m.weakFoot && `${m.weakFoot}★ weak foot`].filter(Boolean).join(", ");
  return `${m.label}: ${m.archetype ? `${m.archetype.name} (${Math.round(m.archetype.share * 100)}% of builds)` : "no archetype named"}${body ? `, ${body}` : ""}`
    + `${m.playstyles.length ? `; PlayStyles ${m.playstyles.map((p) => p.name).join(", ")}` : ""}${m.attributes.length ? `; max ${m.attributes.map((a) => a.name).join(", ")}` : ""}`
    + ` (${m.builds} build${m.builds === 1 ? "" : "s"} from ${m.sources} source${m.sources === 1 ? "" : "s"}, ${m.agreement}).`;
}
