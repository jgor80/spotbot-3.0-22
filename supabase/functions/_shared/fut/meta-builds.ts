// Community meta builds (Jeff, 2026-11-15: "extend the knowledge bank to meta builds and tell people what the community
// is saying is the best build for each position"). Part of the Knowledge Bank's scheduled run (knowledge.ts):
//   1. Collect Pro Clubs build posts and videos: r/ProClubs (and build searches in r/EASportsFC) through Reddit's public
//      RSS feeds, and Pro Clubs build videos through the YouTube Data API on the YouTube hours. Same official feeds as
//      the rest of the bank, nothing scraped. These sources are stored with area 'proclubs'.
//   2. Read: Claude writes down each build a source recommends (position, archetype, height, weight, skill moves, weak
//      foot, PlayStyles, the attributes to max) into fut.kb_builds. Build links in the text (Pro Clubs Builder or
//      GafferBot share links) are decoded here, not guessed, and give exact points.
// The community meta build per position is worked out in src/lib/metaBuilds.ts and shown on the Knowledge Bank's
// Pro Clubs builds tab, the public Build lab (gafferbot.app/build, "Load community meta build") and the MCP tool.
import { ARCHETYPES, ATTRIBUTES, PLAYSTYLES, canonStyle, decodeBuild, importProClubsBuilder, type Build } from "../../../../src/lib/proBuild.ts";
import { META_POSITION_KEYS, metaBuilds, type BuildRow } from "../../../../src/lib/metaBuilds.ts";
import { FutError } from "./service.ts";
import { callClaude } from "./squad-import.ts";
import { collectRedditRss, ReaderUnavailable, youtubeSources, ytJson, type CollectedSource } from "./knowledge.ts";

type Env = (k: string) => string | undefined;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message?: string } | null }> };

const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_BUILD_QUERIES = ["FC 27 Pro Clubs best striker build", "FC 27 Pro Clubs best winger CAM build", "FC 27 Pro Clubs best CDM CM build",
  "FC 27 Pro Clubs best CB fullback goalkeeper build"];
const squash = (s: unknown, max: number) => typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";

export const buildsFeedOn = (env: Env) => env("FUT_KB_BUILDS") !== "off";

// ---------------------------------------------------------------- collecting

const BUILD_POST = /\b(builds?|archetypes?|playstyles?\+?|height|weight|\d{3}\s?cm|\d'\d{1,2}|skill points|attribute points|perks?|meta (st|cb|cdm|cm|cam|winger|striker|keeper|gk|lb|rb)|best (st|cb|cdm|cm|cam|lw|rw|winger|striker|keeper|gk|fullback|full-back|lb|rb|position)|finisher|target man|spark|magician|maestro|creator|recycler|disruptor|marauder|progressor|boss|shot stopper|sweeper keeper|proclubsbuilder)\b/i;
export const isBuildPost = (p: { title?: string; selftext?: string }) => BUILD_POST.test(`${p.title ?? ""} ${(p.selftext ?? "").slice(0, 2000)}`);

/** Pro Clubs build posts and (on YouTube hours) build videos, tagged area 'proclubs'. */
export async function collectBuildSources(env: Env, fetchFn: Fetch, known: (ids: string[]) => Promise<Set<string>>, use: { reddit: boolean; youtube: boolean }, now = Date.now()): Promise<CollectedSource[]> {
  const out: CollectedSource[] = [];
  let failure: Error | null = null;
  if (use.reddit) {
    const feeds = [
      { sub: "ProClubs", url: "https://www.reddit.com/r/ProClubs/top/.rss?t=week&limit=40" },
      { sub: "ProClubs", url: "https://www.reddit.com/r/ProClubs/search.rss?q=build&restrict_sr=on&sort=top&t=month&limit=25" },
      { sub: "EASportsFC", url: "https://www.reddit.com/r/EASportsFC/search.rss?q=%22pro+clubs%22+build&restrict_sr=on&sort=top&t=month&limit=25" },
    ];
    try {
      out.push(...await collectRedditRss(env, fetchFn, known, { feeds, filter: isBuildPost, threads: Number(env("FUT_KB_BUILD_THREADS_PER_RUN") ?? 4) }));
    } catch (e) { failure = e as Error; }
  }
  if (use.youtube) {
    try {
      const queries = (env("FUT_KB_BUILD_QUERIES") ?? "").split("|").map((q) => q.trim()).filter(Boolean);
      // Build videos come out less often than meta videos: look back two weeks
      const after = new Date(now - 14 * 86_400_000).toISOString();
      const ids = new Set<string>();
      for (const q of queries.length ? queries.slice(0, 6) : DEFAULT_BUILD_QUERIES) {
        const found = await ytJson("search", { part: "snippet", type: "video", order: "viewCount", maxResults: "8", publishedAfter: after, q, relevanceLanguage: "en" }, env, fetchFn);
        for (const item of (found.items ?? []) as { id?: { videoId?: string } }[]) if (item.id?.videoId) ids.add(item.id.videoId);
      }
      const seen = ids.size ? await known([...ids]).catch(() => new Set<string>()) : new Set<string>();
      out.push(...await youtubeSources([...ids].filter((id) => !seen.has(id)).slice(0, 30), env, fetchFn, Number(env("FUT_KB_BUILD_MIN_VIEWS")) || 1000));
    } catch (e) { failure ??= e as Error; }
  }
  if (!out.length && failure) throw failure;
  // One row per post or video (a post can be in more than one feed)
  const unique = new Map<string, CollectedSource & { area: "proclubs" }>();
  for (const s of out) if (!unique.has(`${s.kind}:${s.external_id}`)) unique.set(`${s.kind}:${s.external_id}`, { ...s, area: "proclubs" });
  return [...unique.values()];
}

// ---------------------------------------------------------------- build links in the text

export interface LinkedBuild { link: string; build: Build }

/** Pro Clubs Builder (proclubsbuilder.co.uk/b/...) and GafferBot (gafferbot.app/build?b=...) share links in a source, decoded. */
export function extractBuildLinks(text: string): LinkedBuild[] {
  const out: LinkedBuild[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?proclubsbuilder\.co\.uk\/b\/[A-Za-z0-9_\-+/=%]{8,}/gi)) {
    const link = decodeURIComponent(m[0]).replace(/[).,\]]+$/, "");
    if (seen.has(link)) continue;
    const r = importProClubsBuilder(link);
    if (r) { seen.add(link); out.push({ link, build: r.build }); }
  }
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?gafferbot\.app\/build\?(?:[^\s]*&)?b=([A-Za-z0-9_-]{8,})/gi)) {
    if (seen.has(m[1]!)) continue;
    const b = decodeBuild(m[1]!);
    if (b) { seen.add(m[1]!); out.push({ link: m[0], build: b }); }
  }
  return out.slice(0, 10);
}

const archName = (key: string) => ARCHETYPES.find((a) => a.key === key)?.name ?? key;
const attrLabel = (key: string) => ATTRIBUTES.find((a) => a.key === key)?.label ?? key;
export function describeLinked(l: LinkedBuild, i: number): string {
  const b = l.build;
  const pts = Object.entries(b.points).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${attrLabel(k)} ${v}`).join(", ");
  return `[L${i + 1}] ${b.name ? `"${b.name}", ` : ""}${archName(b.archetype)}, level ${b.level}, ${b.heightCm} cm, ${b.weightKg} kg, ${b.skillMoves}★ skill moves, ${b.weakFoot}★ weak foot${pts ? `; points: ${pts}` : ""}`;
}

// ---------------------------------------------------------------- reading with Claude

export interface ReadBuild {
  position: string; archetype: string | null; height_cm: number | null; weight_kg: number | null; skill_moves: number | null; weak_foot: number | null;
  level: number | null; playstyles: string[]; key_attrs: string[]; points: Record<string, number> | null; stance: -1 | 0 | 1; strength: 1 | 2 | 3; statement: string;
}
export interface BuildReading { relevant: boolean; summary: string; builds: ReadBuild[] }

const ARCH_KEYS = ARCHETYPES.map((a) => a.key);
const STYLE_NAMES = PLAYSTYLES.map((p) => p.name);
const ATTR_KEYS = ATTRIBUTES.map((a) => a.key);

const BUILD_SCHEMA = {
  type: "object", additionalProperties: false, required: ["relevant", "summary", "builds"],
  properties: {
    relevant: { type: "boolean" },
    summary: { type: "string" },
    builds: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["position", "archetype", "height_cm", "weight_kg", "skill_moves", "weak_foot", "playstyles", "key_attributes", "link", "stance", "strength", "statement"],
      properties: {
        position: { type: "string", enum: [...META_POSITION_KEYS] },
        archetype: { type: "string", enum: [...ARCH_KEYS, "none"] },
        height_cm: { type: "integer" },
        weight_kg: { type: "integer" },
        skill_moves: { type: "integer" },
        weak_foot: { type: "integer" },
        playstyles: { type: "array", items: { type: "string", enum: STYLE_NAMES } },
        key_attributes: { type: "array", items: { type: "string", enum: ATTR_KEYS } },
        link: { type: "integer" },
        stance: { type: "string", enum: ["for", "against", "mixed"] },
        strength: { type: "integer", enum: [1, 2, 3] },
        statement: { type: "string" },
      } } },
  },
};

function buildReaderPrompt(): string {
  return [
    "You read EA SPORTS FC 27 Pro Clubs (Clubs) community posts, video descriptions and their comments, and write down the Virtual Pro builds people recommend or warn against, for a knowledge bank that shows the community's meta build for each position. Return JSON only.",
    "",
    "relevant: false when the source has no Pro Clubs build in it (Ultimate Team, career mode, memes, complaints with no build); then builds is empty.",
    "summary: one plain sentence on what the source is about (under 25 words).",
    "builds: up to 12, one per build per position the source describes:",
    `- position: ST (striker, CF), W (winger: LW, RW, LM, RM), CAM, CM (box-to-box), CDM, FB (full-back or wing-back), CB, GK.`,
    `- archetype: the FC 27 archetype, one of ${ARCHETYPES.map((a) => `${a.key} (${a.name})`).join(", ")}; none when not stated.`,
    "- height_cm, weight_kg: as stated, converted to cm and kg (6'2\" = 188 cm, 180 lb = 82 kg); 0 when not stated.",
    "- skill_moves, weak_foot: stars 1-5; 0 when not stated.",
    "- playstyles: only PlayStyles the source picks for this build, spelled as in the list allowed (PlayStyle+ counts as the PlayStyle).",
    "- key_attributes: the attributes the source says to max or prioritise first, most important first (at most 8).",
    "- link: when the build is one of the shared build links listed under <links>, its number (1 for [L1]); otherwise 0. The link's numbers are exact, so don't copy them into other fields.",
    "- stance: for = recommended, meta, the best; against = people say it's bad, nerfed or a trap; mixed = it depends, or a build shown without a view.",
    "- strength: 3 = the main build of the post or video, or echoed by many upvoted comments; 2 = clearly argued; 1 = a passing mention.",
    "- statement: why, in your own plain words, under 30 words (what it's good at, how it plays, the trade-off). Never copy long passages and never include usernames.",
    "- When commenters push back or offer a different build for the same position, record that as its own build. Never invent numbers or PlayStyles the source doesn't give.",
  ].join("\n");
}

const intIn = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

export function cleanBuildReading(raw: unknown, links: LinkedBuild[] = []): BuildReading {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const builds: ReadBuild[] = [];
  for (const c of Array.isArray(o.builds) ? o.builds.slice(0, 16) : []) {
    const x = c && typeof c === "object" ? c as Record<string, unknown> : {};
    const position = String(x.position ?? "");
    if (!(META_POSITION_KEYS as string[]).includes(position)) continue;
    const statement = squash(x.statement, 300);
    if (statement.length < 3) continue;
    const linked = links[(intIn(x.link, 1, links.length) ?? 0) - 1]?.build ?? null;
    const archetype = linked?.archetype ?? (ARCH_KEYS.includes(String(x.archetype)) ? String(x.archetype) : null);
    const styles = [...new Set((Array.isArray(x.playstyles) ? x.playstyles : []).map((p) => canonStyle(String(p))).filter((p) => STYLE_NAMES.includes(p)))].slice(0, 15);
    const attrs = [...new Set((Array.isArray(x.key_attributes) ? x.key_attributes : []).map(String).filter((a) => ATTR_KEYS.includes(a)))].slice(0, 8);
    builds.push({
      position, archetype,
      height_cm: linked?.heightCm ?? intIn(x.height_cm, 150, 210),
      weight_kg: linked?.weightKg ?? intIn(x.weight_kg, 45, 115),
      skill_moves: linked?.skillMoves ?? intIn(x.skill_moves, 1, 5),
      weak_foot: linked?.weakFoot ?? intIn(x.weak_foot, 1, 5),
      level: linked ? linked.level : null,
      playstyles: styles.length ? styles : linked?.playstyles ?? [],
      key_attrs: attrs.length ? attrs : linked ? Object.entries(linked.points).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k) : [],
      points: linked && Object.keys(linked.points).length ? linked.points : null,
      stance: x.stance === "for" ? 1 : x.stance === "against" ? -1 : 0,
      strength: [1, 2, 3].includes(Number(x.strength)) ? Number(x.strength) as 1 | 2 | 3 : 1,
      statement,
    });
  }
  return { relevant: o.relevant !== false && builds.length > 0, summary: squash(o.summary, 300), builds };
}

/** Read one Pro Clubs source into the builds it recommends. */
export async function readBuildSource(text: string, env: Env, fetchFn: Fetch): Promise<BuildReading> {
  const links = extractBuildLinks(text);
  const res = await callClaude(env, fetchFn as typeof fetch, {
    model: env("FUT_KB_MODEL") || DEFAULT_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: { type: "json_schema", schema: BUILD_SCHEMA } },
    system: buildReaderPrompt(),
    messages: [{ role: "user", content: [{ type: "text", text: `<source>\n${text.slice(0, 14_000)}\n</source>${links.length ? `\n<links>\n${links.map(describeLinked).join("\n")}\n</links>` : ""}` }] }],
  });
  const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } } | null;
  if (!res.ok) {
    const why = out?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /credit balance|billing/i.test(why))) throw new ReaderUnavailable(why);
    throw new FutError(res.status === 429 || res.status >= 500 ? "The reader is busy. Try again in a minute." : `The reader couldn't read that source (${why}).`, 502);
  }
  if (out?.stop_reason === "refusal") return { relevant: false, summary: "The reader declined this source.", builds: [] };
  const body = (out?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  try { return cleanBuildReading(JSON.parse(body), links); } catch { throw new FutError("The reader returned something unreadable.", 502); }
}

export async function saveBuildReading(db: Rpc, id: string, reading: BuildReading): Promise<number> {
  const { data, error } = await db.rpc("kb_save_builds", { p_source: id, p_status: reading.relevant ? "read" : "skipped", p_note: reading.summary || null, p_builds: reading.builds });
  if (error) throw new FutError(`The knowledge bank is unavailable: ${error.message ?? "error"}`, 500);
  return Number(data) || 0;
}

// ---------------------------------------------------------------- the meta builds

export async function loadMetaBuilds(db: Rpc, days = 180, now = Date.now()) {
  const { data, error } = await db.rpc("kb_meta_build_rows", { p_days: days });
  if (error) throw new FutError(`The knowledge bank is unavailable: ${error.message ?? "error"}`, 500);
  const rows = (Array.isArray(data) ? data : []) as BuildRow[];
  return { days, builds: rows.length, positions: metaBuilds(rows, now) };
}
