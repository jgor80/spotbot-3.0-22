// Knowledge Bank for my team (Jeff, 2026-11-12: "make it so i can see how these knowledge base articles would apply to
// my team and take the overall knowledge bank sentiment and give me ideal formation, tactic and players the community
// is talking about ... a list of players at each position").
//   applyToTeam  one topic or one source (an "article") against the user's squad and club: a quick check that needs
//                no AI (your formation, players you own, PlayStyles your players have) and, with a Claude key, a short
//                read of what it means for this team and what to try.
//   teamPlan     the bank's overall view as a game plan: the formation the community rates most, the tactics and
//                PlayStyles people recommend (and warn against), and the players people talk about, listed by position
//                with the card's price and whether the user owns it. With a Claude key, Claude turns the claims into
//                concrete settings, player instructions and notes for this team (citing the claims), but the formation
//                and the player lists always come from the numbers, so it can't invent a meta.
// SQL: 20261112090000_fut_kb_team.sql. The team comes from the user's own squads, club cards and coins.
import { FutError, PgSquadStore, searchMyCards, type FutDb } from "./service.ts";
import { callClaude } from "./squad-import.ts";
import { FORMATIONS } from "./xilab/workspace/index.ts";
import { PLAYSTYLES } from "./stats.ts";

type Env = (k: string) => string | undefined;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message?: string } | null }> };

const DEFAULT_MODEL = "claude-opus-5-5";
const POSITION_ORDER = ["GK", "LB", "CB", "RB", "CDM", "CM", "LM", "RM", "CAM", "LW", "RW", "ST"];
const posRank = (p: string) => { const i = POSITION_ORDER.indexOf(p); return i < 0 ? 99 : i; };

async function rpcData<T>(db: Rpc, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new FutError(`The knowledge bank is unavailable: ${error.message ?? "error"}`, 500);
  return data as T;
}
const squash = (s: unknown, max: number) => typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Lower case, no accents, same as SQL fut.kb_fold. */
export function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/ø/g, "o").replace(/ł/g, "l").replace(/đ/g, "d").replace(/ı/g, "i").replace(/ß/g, "ss");
}

// ---------------------------------------------------------------- the user's team

export interface TeamCard { name: string; rating: number; positions: string[]; version: string | null; playstyles: string[]; playstyles_plus: string[] }
export interface TeamContext {
  squad: { id: string; name: string; formation: string; xi: { slot: string; position: string; name: string | null; rating: number | null }[] } | null;
  squads: { id: string; name: string; formation: string }[];
  /** Club cards, best first. */
  club: TeamCard[];
  coins: number | null;
}
export const EMPTY_TEAM: TeamContext = { squad: null, squads: [], club: [], coins: null };

/** The user's squad (the one asked for, else the latest saved), club cards and coins. Each part is optional. */
export async function loadTeam(db: FutDb, userId: string, squadId: string | null, platform: "console" | "pc" = "console"): Promise<TeamContext> {
  const team: TeamContext = { squad: null, squads: [], club: [], coins: null };
  try {
    const squads = await new PgSquadStore(db).list(userId);
    team.squads = squads.map((s) => ({ id: s.id, name: s.name, formation: s.formation }));
    const s = (squadId ? squads.find((x) => x.id === squadId) : null) ?? squads[0];
    if (s) team.squad = { id: s.id, name: s.name, formation: s.formation, xi: s.slots.map((x) => ({ slot: x.slot, position: x.position, name: x.card?.name ?? null, rating: x.card?.rating ?? null })) };
  } catch (e) { console.error("[fut-api] knowledge team squads:", e); }
  try {
    const cards = await searchMyCards(db, userId, { all: true, owned_only: true });
    team.club = cards.map((c) => ({ name: c.player_name, rating: c.overall, positions: c.positions, version: c.version, playstyles: c.playstyles, playstyles_plus: c.playstyles_plus }));
  } catch (e) { console.error("[fut-api] knowledge team cards:", e); }
  try {
    const { data } = await db.from("account_state").select("balance").eq("user_id", userId).eq("platform", platform).maybeSingle();
    const coins = Number((data as { balance?: { coins?: unknown } } | null)?.balance?.coins);
    team.coins = Number.isFinite(coins) ? coins : null;
  } catch (e) { console.error("[fut-api] knowledge team coins:", e); }
  return team;
}

/** The team in a few lines, for Claude. */
export function describeTeam(team: TeamContext): string {
  const lines: string[] = [];
  if (team.squad) {
    const xi = team.squad.xi.map((x) => `${x.slot} ${x.name ? `${x.name}${x.rating ? ` ${x.rating}` : ""}` : "(empty)"}`).join(", ");
    lines.push(`Squad "${team.squad.name}" in ${team.squad.formation}: ${xi}`);
  } else lines.push("No saved squad.");
  if (team.club.length) {
    const inXi = new Set((team.squad?.xi ?? []).map((x) => x.name && fold(x.name)).filter(Boolean));
    const bench = team.club.filter((c) => !inXi.has(fold(c.name))).slice(0, 40);
    const card = (c: TeamCard) => `${c.name} (${c.positions.join("/")} ${c.rating}${c.version ? ` ${c.version}` : ""}${c.playstyles_plus.length ? `; PS+ ${c.playstyles_plus.join(", ")}` : ""})`;
    const xiCards = team.club.filter((c) => inXi.has(fold(c.name)));
    if (xiCards.length) lines.push(`Squad players' cards: ${xiCards.map(card).join("; ")}`);
    lines.push(`Other club cards (best ${bench.length} of ${team.club.length}): ${bench.map(card).join("; ") || "none"}`);
  } else lines.push("No club cards synced.");
  if (team.coins != null) lines.push(`Coins: ${team.coins.toLocaleString("en")}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- reading names out of claims

/** "4-2-3-1 (2)", "4231 wide", "4-3-3 holding" → the formation's in-game name, or null. */
export function formationName(text: string): string | null {
  const m = text.match(/(?<![\d-])([3-5])-?([1-5])-?([1-5])(?:-?([1-5]))?(?:-?([1-5]))?(?![\d-])\s*(?:\((\d)\))?\s*([a-z ]{0,20})/i);
  if (!m) return null;
  const parts = m.slice(1, 6).filter(Boolean);
  if (parts.reduce((a, b) => a + Number(b), 0) !== 10) return null;
  const base = parts.join("-");
  const variant = m[6] ?? null;
  const word = (m[7] ?? "").toLowerCase();
  if (variant && FORMATIONS[`${base} (${variant})`]) return `${base} (${variant})`;
  const WORDS: Record<string, [RegExp, string][]> = {
    "4-2-3-1": [[/\bwide\b/, " (2)"], [/\bnarrow\b/, ""]],
    "4-1-2-1-2": [[/\bnarrow\b/, " (2)"], [/\bwide\b/, ""]],
    "4-4-2": [[/\bholding\b/, " (2)"], [/\bflat\b/, ""]],
    "4-5-1": [[/\bflat\b/, " (2)"], [/\battack/, ""]],
    "4-3-3": [[/\bholding\b/, " (2)"], [/\bdefen[cs]/, " (3)"], [/\battack/, " (4)"]],
  };
  for (const [re, suffix] of WORDS[base] ?? []) if (re.test(word) && FORMATIONS[`${base}${suffix}`]) return `${base}${suffix}`;
  return FORMATIONS[base] ? base : null;
}

const sameFormation = (a: string, b: string) => a === b;
const baseOf = (f: string) => f.replace(/\s*\(\d\)$/, "");

function wordIn(haystack: string, needle: string): boolean {
  if (needle.length < 3) return false;
  const i = haystack.indexOf(needle);
  if (i < 0) return false;
  const ok = (ch: string | undefined) => !ch || !/[a-z0-9]/.test(ch);
  for (let at = i; at >= 0; at = haystack.indexOf(needle, at + 1)) if (ok(haystack[at - 1]) && ok(haystack[at + needle.length])) return true;
  return false;
}

/** Does this text talk about this player? Full name, or a surname of 4+ letters as a whole word. */
export function mentions(text: string, name: string): boolean {
  const t = fold(text), n = fold(name).trim();
  if (wordIn(t, n)) return true;
  const last = n.split(/\s+/).at(-1) ?? "";
  return last.length >= 4 && last !== n ? wordIn(t, last) : n.length >= 4 && !n.includes(" ") && wordIn(t, n);
}

export function playstylesIn(text: string): { name: string; plus: boolean }[] {
  const out: { name: string; plus: boolean }[] = [];
  const t = text.toLowerCase();
  for (const p of PLAYSTYLES) {
    const n = p.toLowerCase();
    const i = t.indexOf(n);
    if (i < 0 || !wordIn(t, n)) continue;
    out.push({ name: p, plus: t.slice(i + n.length, i + n.length + 1) === "+" || /\bplus\b/.test(t.slice(i + n.length, i + n.length + 6)) });
  }
  return out;
}

// ---------------------------------------------------------------- "how does this apply to my team"

export interface ApplyClaim { topic: string; category: string; statement: string; stance: number }
export interface QuickMatch { kind: "formation" | "player" | "playstyle"; text: string; players: string[] }

/** What the claims mention that the team has (or doesn't): no AI. */
export function quickApply(claims: ApplyClaim[], team: TeamContext): QuickMatch[] {
  const out: QuickMatch[] = [];
  const text = claims.map((c) => `${c.topic}. ${c.statement}`).join("\n");
  const formations = [...new Set(claims.flatMap((c) => [formationName(c.topic), ...[...`${c.statement}`.matchAll(/[3-5]-?[1-5]-?[1-5](?:-?[1-5]){0,2}(?:\s*\(\d\))?(?:\s+[a-z]+)?/gi)].map((m) => formationName(m[0]))]).filter((f): f is string => !!f))];
  // "Wide 4231" read as 4-2-3-1 next to the 4-2-3-1 (2) topic: keep the variant only
  for (let i = formations.length - 1; i >= 0; i--) if (formations.some((f) => f !== formations[i] && baseOf(f) === formations[i])) formations.splice(i, 1);
  if (formations.length) {
    const mine = team.squad?.formation;
    if (!mine) out.push({ kind: "formation", text: `This is about ${formations.join(", ")}. Save a squad in Squad Builder to compare it with yours.`, players: [] });
    else if (formations.some((f) => sameFormation(f, mine))) out.push({ kind: "formation", text: `You play ${mine}, so this is about your formation.`, players: [] });
    else if (formations.some((f) => baseOf(f) === baseOf(mine))) out.push({ kind: "formation", text: `This is about ${formations.join(", ")}; you play ${mine}, a variant of the same shape.`, players: [] });
    else out.push({ kind: "formation", text: `This is about ${formations.join(", ")}; you play ${mine}.`, players: [] });
  }
  const xi = new Set((team.squad?.xi ?? []).map((x) => x.name ? fold(x.name) : "").filter(Boolean));
  const seen = new Set<string>();
  for (const c of team.club) {
    const key = fold(c.name);
    if (seen.has(key) || !mentions(text, c.name)) continue;
    seen.add(key);
    out.push({ kind: "player", text: `You own ${c.name} (${c.rating}${c.version ? ` ${c.version}` : ""})${xi.has(key) ? ", in your squad" : ""}.`, players: [c.name] });
    if (seen.size >= 8) break;
  }
  for (const ps of playstylesIn(text).slice(0, 4)) {
    const has = team.club.filter((c) => (ps.plus ? c.playstyles_plus : [...c.playstyles, ...c.playstyles_plus]).some((s) => s.toLowerCase() === ps.name.toLowerCase()));
    const inXi = has.filter((c) => xi.has(fold(c.name)));
    const label = `${ps.name}${ps.plus ? "+" : ""}`;
    out.push({
      kind: "playstyle",
      text: has.length
        ? `${has.length} of your players ${has.length === 1 ? "has" : "have"} ${label}${inXi.length ? `, ${inXi.length} in your squad` : ""}.`
        : team.club.length ? `None of your club cards has ${label}.` : `This is about ${label}. Sync your club to see who has it.`,
      players: (inXi.length ? inXi : has).slice(0, 6).map((c) => c.name),
    });
  }
  return out;
}

export interface TeamAdvice { fit: "high" | "some" | "low"; headline: string; points: string[]; actions: string[] }
const APPLY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["fit", "headline", "points", "actions"],
  properties: {
    fit: { type: "string", enum: ["high", "some", "low"] },
    headline: { type: "string" },
    points: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
  },
};

async function claudeJson<T>(env: Env, fetchFn: Fetch, system: string, user: string, schema: unknown, maxTokens: number): Promise<T | null> {
  const res = await callClaude(env, fetchFn as typeof fetch, {
    model: env("FUT_KB_MODEL") || DEFAULT_MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } } | null;
  if (!res.ok) {
    console.error("[fut-api] knowledge team Claude:", res.status, out?.error?.message);
    return null;
  }
  if (out?.stop_reason === "refusal") return null;
  try { return JSON.parse((out?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")) as T; } catch { return null; }
}

export function cleanAdvice(raw: unknown): TeamAdvice | null {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (!o) return null;
  const list = (v: unknown, n: number) => Array.isArray(v) ? v.map((x) => squash(x, 300)).filter(Boolean).slice(0, n) : [];
  const headline = squash(o.headline, 300);
  if (!headline) return null;
  return { fit: o.fit === "high" || o.fit === "low" ? o.fit : "some", headline, points: list(o.points, 5), actions: list(o.actions, 4) };
}

interface SourceClaims { source: { id: string; kind: string; url: string | null; title: string | null; community: string | null; note: string | null }; claims: (ApplyClaim & { id: number })[] }
interface TopicDetail { key: string; topic: string; category: string; statements: { statement: string; stance: number; source: { url: string | null } }[] }

export interface ApplyResult {
  about: { kind: "topic" | "source"; key: string; title: string; url: string | null; claims: number };
  team: { squad: { name: string; formation: string } | null; club_size: number };
  matches: QuickMatch[];
  advice: TeamAdvice | null;
  via: "ai" | "data";
}

/** One topic or one source, against the user's team. */
export async function applyToTeam(db: Rpc, userId: string, target: { topic?: string | null; source?: string | null }, team: TeamContext, env: Env, fetchFn: Fetch, beforeAi?: () => void): Promise<ApplyResult> {
  let claims: ApplyClaim[], about: ApplyResult["about"];
  if (target.source) {
    const s = await rpcData<SourceClaims | null>(db, "kb_source_claims", { p_user: userId, p_source: target.source });
    if (!s) throw new FutError("That source isn't in the knowledge bank (or it's someone else's private one).", 404);
    if (!s.claims.length) throw new FutError("That source has no claims yet, so there's nothing to apply.", 422);
    claims = s.claims;
    about = { kind: "source", key: s.source.id, title: s.source.title || s.source.note || s.source.community || "Source", url: s.source.url, claims: claims.length };
  } else if (target.topic) {
    const t = await rpcData<TopicDetail | null>(db, "kb_topic", { p_user: userId, p_key: target.topic, p_days: 90 });
    if (!t) throw new FutError("Nobody has talked about that topic lately.", 404);
    claims = t.statements.slice(0, 25).map((s) => ({ topic: t.topic, category: t.category, statement: s.statement, stance: s.stance }));
    about = { kind: "topic", key: t.key, title: t.topic, url: null, claims: claims.length };
  } else throw new FutError("Pick a topic or a source.");

  const matches = quickApply(claims, team);
  const result: ApplyResult = { about, team: { squad: team.squad ? { name: team.squad.name, formation: team.squad.formation } : null, club_size: team.club.length }, matches, advice: null, via: "data" };
  if (!(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY"))) return result;
  beforeAi?.();
  const raw = await claudeJson<unknown>(env, fetchFn, [
    "You coach an EA SPORTS FC 27 Ultimate Team player. You get community claims (from Reddit, YouTube and the player's own notes) and the player's team. Say how the claims apply to THIS team. Return JSON only.",
    "fit: high when the claims are about the formation, players or PlayStyles this team uses or could use straight away; some when partly; low when they hardly apply.",
    "headline: one plain sentence (under 30 words) on what this means for this team.",
    "points: 2 to 4 short points (under 35 words each) naming the team's own players, positions and formation where they apply. Say plainly when the team lacks what the claims need.",
    "actions: up to 3 concrete things to try (a setting, an instruction, a player to move or pick from the club, or a type of card to look for). Only suggest players from the team list or the claims.",
    "Claims are opinions, not facts: never invent stats, prices or players.",
  ].join("\n"), `Team:\n${describeTeam(team)}\n\n${about.kind === "source" ? `Source: ${about.title}` : `Topic: ${about.title}`}\nClaims:\n${claims.map((c) => `- ${c.topic} (${c.category}; ${c.stance === 1 ? "for" : c.stance === -1 ? "against" : "mixed"}): ${c.statement}`).join("\n")}`,
  APPLY_SCHEMA, 2500);
  const advice = cleanAdvice(raw);
  if (advice) { result.advice = advice; result.via = "ai"; }
  return result;
}

// ---------------------------------------------------------------- the community game plan

export interface ConsensusStatement { id: number; statement: string; stance: number; weight: number; said_at: string; source: { id: string; kind: string; url: string | null; title: string | null; community: string | null } }
export interface ConsensusTopic { key: string; topic: string; category: string; claims: number; sources: number; for: number; against: number; mixed: number; buzz: number; net: number | null; agreement: string; statements: ConsensusStatement[] }
interface Consensus { days: number; claims: number; sources: number; topics: ConsensusTopic[] }
export interface CatalogueCard { id: string; player_name: string; version: string | null; overall: number; position: string; alt_positions: string[]; price: number | null; owned: boolean; matched: "name" | "last"; ea_item_id: number | null }

export interface Pick { key: string; topic: string; net: number | null; buzz: number; agreement: string; claims: number; for: number; against: number; said: string | null; cite: number | null }
export interface FormationPick extends Pick { formation: string; score: number }
export interface PlayerPick extends Pick {
  verdict: "rated" | "overrated" | "mixed";
  position: string | null;
  /** The card the user owns, else the best one on the market list. */
  card: CatalogueCard | null;
  /** Other versions of the player. */
  versions: CatalogueCard[];
  owned: boolean;
  /** The club's own card when the market list doesn't have it. */
  owned_card: { name: string; rating: number; version: string | null } | null;
}
export interface PositionGroup { position: string; in_formation: number; community: PlayerPick[]; yours: { name: string; rating: number; version: string | null; in_squad: boolean }[] }
export interface AiTactic { setting: string; value: string; why: string; cites: number[] }
export interface AiInstruction { position: string; instruction: string; why: string; cites: number[] }
export interface TeamPlan {
  days: number; claims: number; sources: number; generated_at: string; via: "ai" | "data";
  team: { squad: { id: string; name: string; formation: string } | null; squads: { id: string; name: string; formation: string }[]; club_size: number; coins: number | null };
  formation: { recommended: FormationPick | null; ranked: FormationPick[]; yours: FormationPick | null; positions: string[] };
  tactics: { recommended: Pick[]; avoid: Pick[] };
  playstyles: { recommended: Pick[]; avoid: Pick[] };
  positions: PositionGroup[];
  summary: string | null;
  formation_why: string | null;
  settings: AiTactic[];
  instructions: AiInstruction[];
  for_your_team: string[];
  citations: { n: number; kind: string; url: string | null; title: string | null; community: string | null }[];
}

/** One formation per in-game name: topics that name the same formation are added together. */
export function rankFormations(topics: ConsensusTopic[], cite: (t: ConsensusTopic) => number | null): FormationPick[] {
  const by = new Map<string, FormationPick & { w: number }>();
  for (const t of topics) {
    if (t.category !== "formations") continue;
    const f = formationName(t.topic);
    if (!f) continue;
    const prev = by.get(f);
    const net = t.net ?? 0;
    if (!prev) {
      by.set(f, { ...pickOf(t, cite), formation: f, score: 0, w: t.buzz * net });
    } else {
      // Weighted by buzz: the bigger thread decides the stance, the counts add up
      prev.w += t.buzz * net;
      prev.buzz += t.buzz; prev.claims += t.claims; prev.for += t.for; prev.against += t.against;
      prev.net = prev.buzz ? Math.round((prev.w / prev.buzz) * 1000) / 1000 : prev.net;
      if (t.buzz > (prev.buzz - t.buzz)) { prev.key = t.key; prev.topic = t.topic; prev.agreement = t.agreement; prev.said = t.statements[0]?.statement ?? prev.said; prev.cite = cite(t) ?? prev.cite; }
    }
  }
  return [...by.values()].map(({ w, ...p }) => ({ ...p, buzz: Math.round(p.buzz * 100) / 100, score: Math.round(w * 100) / 100 }))
    .sort((a, b) => b.score - a.score || b.buzz - a.buzz);
}

function pickOf(t: ConsensusTopic, cite: (t: ConsensusTopic) => number | null): Pick {
  const lead = t.statements.find((s) => Math.sign(s.stance) === Math.sign(t.net ?? 0)) ?? t.statements[0];
  return { key: t.key, topic: t.topic, net: t.net, buzz: t.buzz, agreement: t.agreement, claims: t.claims, for: t.for, against: t.against, said: lead?.statement ?? null, cite: cite(t) };
}

/** Recommended (net for) and avoid (net against) topics of a category, most talked about first. */
function sides(topics: ConsensusTopic[], category: string, cite: (t: ConsensusTopic) => number | null, n = 8) {
  const list = topics.filter((t) => t.category === category);
  const score = (t: ConsensusTopic) => t.buzz * Math.abs(t.net ?? 0);
  return {
    recommended: list.filter((t) => (t.net ?? 0) > 0.15).sort((a, b) => score(b) - score(a)).slice(0, n).map((t) => pickOf(t, cite)),
    avoid: list.filter((t) => (t.net ?? 0) < -0.15).sort((a, b) => score(b) - score(a)).slice(0, Math.ceil(n / 2)).map((t) => pickOf(t, cite)),
  };
}

/** A player topic → the name to look up ("TOTW Mbappé" → "mbappe"; versions and ratings dropped). */
export function playerLookup(topic: string): { name: string; last: string } | null {
  const cleaned = fold(topic)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(totw|tots|toty|fut|base|gold|rare|icon|hero|heroes|evo(lution)?s?|sbc|objective|promo|card|version|special|future stars|fantasy|road to the knockouts|rttk|ucl|uel|uecl|team of the (week|season|year)|winter wildcards|thunderstruck|centurions|trailblazers|flashback|showdown|ones to watch|otw|[0-9]{2}\s*(ovr|rated)?)\b/g, " ")
    .replace(/[^a-z' -]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 3) return null;
  const words = cleaned.split(" ").filter((w) => w.length > 1);
  const last = words.at(-1) ?? "";
  return { name: cleaned, last: words.length > 1 && /^[a-z]{4,}$/.test(last) ? last : "" };
}

/** The positions a formation uses, in pitch order, with how many slots each. */
export function formationPositions(formation: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of FORMATIONS[formation] ?? []) out.set(s.position, (out.get(s.position) ?? 0) + 1);
  return new Map([...out].sort((a, b) => POSITION_ORDER.indexOf(a[0]) - POSITION_ORDER.indexOf(b[0])));
}

const PLAN_SCHEMA = {
  type: "object", additionalProperties: false, required: ["summary", "formation_why", "settings", "instructions", "for_your_team", "player_positions"],
  properties: {
    summary: { type: "string" },
    formation_why: { type: "string" },
    settings: { type: "array", items: { type: "object", additionalProperties: false, required: ["setting", "value", "why", "cites"], properties: {
      setting: { type: "string" }, value: { type: "string" }, why: { type: "string" }, cites: { type: "array", items: { type: "integer" } } } } },
    instructions: { type: "array", items: { type: "object", additionalProperties: false, required: ["position", "instruction", "why", "cites"], properties: {
      position: { type: "string" }, instruction: { type: "string" }, why: { type: "string" }, cites: { type: "array", items: { type: "integer" } } } } },
    for_your_team: { type: "array", items: { type: "string" } },
    player_positions: { type: "array", items: { type: "object", additionalProperties: false, required: ["topic", "position"], properties: {
      topic: { type: "string" }, position: { type: "string", enum: POSITION_ORDER } } } },
  },
};

const cache = new Map<string, { at: number; plan: TeamPlan }>();
const CACHE_MS = 6 * 3_600_000;

/** The knowledge bank's view as a game plan for this team. */
export async function teamPlan(db: Rpc, userId: string, opts: { days: number; platform: "console" | "pc"; refresh?: boolean }, team: TeamContext, env: Env, fetchFn: Fetch, beforeAi?: () => void): Promise<TeamPlan> {
  const consensus = await rpcData<Consensus>(db, "kb_consensus", { p_user: userId, p_days: opts.days, p_per: 60, p_statements: 4 });
  const topics = consensus?.topics ?? [];
  const useAi = !!(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY")) && topics.length > 0;
  const cacheKey = JSON.stringify([userId, opts.days, opts.platform, team.squad?.id ?? null, team.squad?.formation ?? null, team.club.length, consensus?.claims ?? 0, useAi]);
  const hit = cache.get(cacheKey);
  if (hit && !opts.refresh && Date.now() - hit.at < CACHE_MS) return hit.plan;

  // Citations: every claim shown or sent to Claude gets a number per source
  const citations: TeamPlan["citations"] = [];
  const bySource = new Map<string, number>();
  const citeSource = (s: ConsensusStatement["source"]) => {
    let n = bySource.get(s.id);
    if (!n) { n = citations.length + 1; bySource.set(s.id, n); citations.push({ n, kind: s.kind, url: s.url, title: s.title, community: s.community }); }
    return n;
  };
  const cite = (t: ConsensusTopic) => {
    const lead = t.statements.find((s) => Math.sign(s.stance) === Math.sign(t.net ?? 0)) ?? t.statements[0];
    return lead ? citeSource(lead.source) : null;
  };

  const ranked = rankFormations(topics, cite);
  const recommended = ranked.find((f) => (f.net ?? 0) > 0) ?? null;
  const yours = team.squad ? ranked.find((f) => f.formation === team.squad!.formation) ?? null : null;
  const tactics = sides(topics, "tactics", cite);
  const playstyles = sides(topics, "playstyles", cite, 6);

  // Players people talk about, matched to the market-wide card list
  const playerTopics = topics.filter((t) => t.category === "players").slice(0, 60);
  const lookups = playerTopics.map((t) => ({ t, q: playerLookup(t.topic) })).filter((x): x is { t: ConsensusTopic; q: { name: string; last: string } } => !!x.q);
  const cards = lookups.length
    ? await rpcData<Record<string, CatalogueCard[]>>(db, "kb_player_cards", { p_user: userId, p_names: lookups.map(({ t, q }) => ({ key: t.key, name: q.name, last: q.last })), p_platform: opts.platform }) ?? {}
    : {};
  const players: PlayerPick[] = lookups.map(({ t }) => {
    let list = cards[t.key] ?? [];
    // A name that finds several different players ("Silva") is too unsure to show, unless one is that exact name
    if (new Set(list.map((c) => fold(c.player_name))).size > 1) {
      const q = playerLookup(t.topic)!.name;
      list = list.filter((c) => fold(c.player_name) === q);
    }
    const ownedClub = team.club.find((c) => mentions(t.topic, c.name) || (list[0] && fold(c.name) === fold(list[0].player_name)));
    const card = list.find((c) => c.owned) ?? list[0] ?? null;
    const net = t.net ?? 0;
    return {
      ...pickOf(t, cite), verdict: net > 0.15 ? "rated" : net < -0.15 ? "overrated" : "mixed",
      position: card?.position ?? ownedClub?.positions[0] ?? null,
      card, versions: list.filter((c) => c !== card), owned: !!card?.owned || !!ownedClub,
      owned_card: ownedClub ? { name: ownedClub.name, rating: ownedClub.rating, version: ownedClub.version } : null,
    };
  });

  const plan: TeamPlan = {
    days: consensus?.days ?? opts.days, claims: consensus?.claims ?? 0, sources: consensus?.sources ?? 0, generated_at: new Date().toISOString(), via: "data",
    team: { squad: team.squad ? { id: team.squad.id, name: team.squad.name, formation: team.squad.formation } : null, squads: team.squads, club_size: team.club.length, coins: team.coins },
    formation: { recommended, ranked: ranked.slice(0, 8), yours, positions: [] },
    tactics, playstyles, positions: [], summary: null, formation_why: null, settings: [], instructions: [], for_your_team: [], citations,
  };

  if (useAi) {
    beforeAi?.();
    // Number every claim by its source, so Claude's citations line up with the page's
    const notes = topics.flatMap((t) => t.statements.slice(0, t.category === "players" ? 2 : 4).map((s) =>
      `[${citeSource(s.source)}] ${t.topic} (${t.category}; ${s.stance === 1 ? "for" : s.stance === -1 ? "against" : "mixed"}): ${s.statement}`)).join("\n");
    const raw = await claudeJson<Record<string, unknown>>(env, fetchFn, [
      "You turn what the EA SPORTS FC 27 Ultimate Team community says (claims from Reddit, YouTube and the player's own notes, numbered by source) into a game plan for one player's team. Return JSON only.",
      `The formation is decided already: ${recommended ? recommended.formation : "none has enough support yet"}. Formation ranking (score = buzz x sentiment): ${ranked.slice(0, 6).map((f) => `${f.formation} ${f.score}`).join(", ") || "none"}.`,
      "summary: 2 or 3 plain sentences: the community's current view and what it means for this team.",
      "formation_why: one or two sentences on why people rate that formation, from the claims (empty if none).",
      "settings: up to 8 custom tactics settings people recommend for it or in general (e.g. Defensive approach: Balanced; Line height: 60; Build-up style: Counter; Width; Players in box; Corners and free kicks), each with a short why and the claim numbers. Only settings the claims support; values as people state them.",
      "instructions: up to 8 player instructions by position (e.g. CDM: Stay back while attacking; ST: Get in behind), from the claims, with why and claim numbers.",
      "for_your_team: up to 4 short points comparing the plan with this team: their formation, which of their own players fit the recommended roles, gaps to fill. Name their players.",
      "player_positions: for each player topic listed below that you can place, the FC 27 position people use them in (GK, LB, CB, RB, CDM, CM, LM, RM, CAM, LW, RW, ST).",
      "Claims are opinions: never invent settings, numbers or players that aren't in the claims or the team.",
    ].join("\n"),
    `Team:\n${describeTeam(team)}\n\nPlayer topics: ${playerTopics.map((t) => t.topic).join("; ") || "none"}\n\nClaims:\n${notes}`, PLAN_SCHEMA, 6000);
    if (raw) {
      const valid = (cites: unknown) => Array.isArray(cites) ? [...new Set(cites.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= citations.length))].slice(0, 6) : [];
      const rows = (v: unknown) => Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : [];
      plan.summary = squash(raw.summary, 800) || null;
      plan.formation_why = squash(raw.formation_why, 500) || null;
      plan.settings = rows(raw.settings).map((r) => ({ setting: squash(r.setting, 60), value: squash(r.value, 80), why: squash(r.why, 240), cites: valid(r.cites) })).filter((r) => r.setting && r.value).slice(0, 8);
      plan.instructions = rows(raw.instructions).map((r) => ({ position: squash(r.position, 12).toUpperCase(), instruction: squash(r.instruction, 80), why: squash(r.why, 240), cites: valid(r.cites) })).filter((r) => r.position && r.instruction).slice(0, 8);
      plan.for_your_team = Array.isArray(raw.for_your_team) ? raw.for_your_team.map((x) => squash(x, 300)).filter(Boolean).slice(0, 4) : [];
      const placed = new Map(rows(raw.player_positions).map((r) => [fold(squash(r.topic, 80)), squash(r.position, 4).toUpperCase()]));
      for (const p of players) if (!p.position) { const pos = placed.get(fold(p.topic)); if (pos && POSITION_ORDER.includes(pos)) p.position = pos; }
      plan.via = "ai";
    }
  }

  // Players by position: the recommended formation's positions first, then any other position people talk about
  const shape = formationPositions(recommended?.formation ?? team.squad?.formation ?? "");
  plan.formation.positions = [...shape.keys()];
  const xi = new Set((team.squad?.xi ?? []).map((x) => x.name ? fold(x.name) : "").filter(Boolean));
  const groups = new Map<string, PositionGroup>();
  const group = (pos: string) => {
    let g = groups.get(pos);
    if (!g) { g = { position: pos, in_formation: shape.get(pos) ?? 0, community: [], yours: [] }; groups.set(pos, g); }
    return g;
  };
  for (const pos of shape.keys()) group(pos);
  for (const p of players) group(p.position ?? "Other").community.push(p);
  for (const g of groups.values()) {
    g.community.sort((a, b) => (a.verdict === "overrated" ? 1 : 0) - (b.verdict === "overrated" ? 1 : 0) || b.buzz * (b.net ?? 0) - a.buzz * (a.net ?? 0));
    if (g.position === "Other") continue;
    g.yours = team.club.filter((c) => c.positions.includes(g.position)).slice(0, 3)
      .map((c) => ({ name: c.name, rating: c.rating, version: c.version, in_squad: xi.has(fold(c.name)) }));
  }
  plan.positions = [...groups.values()].filter((g) => g.in_formation || g.community.length)
    .sort((a, b) => (b.in_formation ? 1 : 0) - (a.in_formation ? 1 : 0) || posRank(a.position) - posRank(b.position));

  // Only the sources the page or the AI cites are listed
  const used = new Set<number>([
    ...[recommended, ...plan.formation.ranked, ...tactics.recommended, ...tactics.avoid, ...playstyles.recommended, ...playstyles.avoid, ...players].map((p) => p?.cite ?? 0),
    ...plan.settings.flatMap((s) => s.cites), ...plan.instructions.flatMap((s) => s.cites),
  ]);
  plan.citations = citations.filter((c) => used.has(c.n));
  cache.set(cacheKey, { at: Date.now(), plan });
  if (cache.size > 500) cache.clear();
  return plan;
}
