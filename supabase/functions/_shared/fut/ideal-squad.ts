// Squad Builder's ideal squad (Jeff, 2026-11-12: "i want squad builder to find the ideal formation tactics and players
// for me based on my playstyle i talk about and based on the community consensus choices").
// The user describes how they like to play. That is read into traits (Claude when there is a key, a word reader
// otherwise), then every candidate formation is scored on three things that are shown to the user:
//   community  what the Knowledge Bank says about it (buzz x sentiment, from knowledge-team.ts)
//   style      how many of the playstyle's traits the shape has (two strikers, wingers, two CDMs...)
//   club       how strong an XI the user's own club cards make in it
// The best one becomes the plan's formation; the XI is built from the club (cards the community rates and cards that
// suit the playstyle get a small lift), and the Knowledge Bank team plan supplies tactics, player instructions, buy
// targets for each position and the price read. Nothing is saved until the user presses Save in Squad Builder.
import type { ChemistryRules } from "./xilab/chemistry/index.ts";
import { FORMATIONS, type Squad, type WorkspaceCard } from "./xilab/workspace/index.ts";
import { bestSquadFor, type BestSquad } from "./squad-suggest.ts";
import { callClaude } from "./squad-import.ts";
import { fold, formationName, teamPlan, type FormationPick, type StatPicker, type TeamContext, type TeamPlan } from "./knowledge-team.ts";

type Env = (k: string) => string | undefined;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message?: string } | null }> };

export const MAX_PLAYSTYLE = 600;
const DEFAULT_MODEL = "claude-opus-5-5";

// ---------------------------------------------------------------- reading the playstyle

type Shape = Record<string, number>;
const shapeOf = (formation: string): Shape => {
  const out: Shape = {};
  for (const s of FORMATIONS[formation] ?? []) out[s.position] = (out[s.position] ?? 0) + 1;
  return out;
};
const n = (s: Shape, ...ps: string[]) => ps.reduce((a, p) => a + (s[p] ?? 0), 0);

/** What a way of playing asks of a formation's shape. */
export const SHAPE_TRAITS: Record<string, { label: string; words: RegExp; fits: (s: Shape) => boolean }> = {
  two_strikers: { label: "two strikers", words: /\b(two|2|pair of|both) (strikers?|sts?|up ?top|forwards?)\b|\bstrike partner|\bstriker partnership|\b2 up top/, fits: (s) => n(s, "ST") >= 2 },
  lone_striker: { label: "one striker", words: /\b(lone|one|single|1) (striker|st|up ?top)\b|\btarget man\b/, fits: (s) => n(s, "ST") === 1 },
  wingers: { label: "wingers", words: /\bwingers?\b|\bwing play\b|\bdown the wings?\b|\bcut(ting)? inside\b|\b(lw|rw)\b|\bwide forwards?\b/, fits: (s) => n(s, "LW", "RW") >= 2 },
  wide_mids: { label: "wide midfielders", words: /\bwide mid(fielder)?s?\b|\b(lm|rm)\b|\bcross(es|ing)?\b|\bwidth\b|\bstretch\b|\bout wide\b/, fits: (s) => n(s, "LM", "RM", "LW", "RW") >= 2 },
  narrow: { label: "narrow, through the middle", words: /\bnarrow\b|\bthrough the middle\b|\bcentral(ly)?\b|\bno wingers\b|\btiki[- ]?taka\b/, fits: (s) => n(s, "LM", "RM", "LW", "RW") === 0 },
  cam: { label: "a number 10", words: /\bcams?\b|\bnumber 10\b|\bno\.? ?10\b|\bplaymaker\b|\bbehind the striker/, fits: (s) => n(s, "CAM") >= 1 },
  two_cdms: { label: "two holding midfielders", words: /\b(two|2|double) (cdms?|holding|pivots?|defensive mid\w*)\b|\bdouble pivot\b/, fits: (s) => n(s, "CDM") >= 2 },
  possession: { label: "possession", words: /\bpossession\b|\bkeep the ball\b|\bpatient\b|\bbuild[- ]?up\b|\bpass(ing)? (game|it around)\b|\bshort pass\w*\b|\bcontrol (the )?(game|midfield)\b/, fits: (s) => n(s, "CM", "CDM", "CAM") >= 3 && n(s, "CM", "CAM") >= 2 },
  counter: { label: "counter attacks", words: /\bcounter\w*\b|\bon the break\b|\bfast break\b|\bdirect\b|\bthrough balls?\b|\bin behind\b|\bpace\b|\bfast\b|\bquick\b/, fits: (s) => n(s, "CDM") >= 1 && n(s, "LW", "RW", "LM", "RM") >= 2 },
  attacking: { label: "all-out attack", words: /\battack(ing)?\b|\baggressive\b|\boverload\b|\bscore (a lot|lots|goals)\b|\bgoals\b|\bhigh press\b|\bpress(ing)? high\b/, fits: (s) => n(s, "ST", "LW", "RW", "CAM") >= 4 },
  defensive: { label: "solid at the back", words: /\bdefen[cs]ive\b|\bsolid\b|\bcompact\b|\bpark the bus\b|\bsit (back|deep)\b|\bdon'?t concede\b|\bclean sheets?\b|\bprotect\b|\bsafe\b/, fits: (s) => n(s, "CDM") >= 2 || n(s, "CB") >= 3 },
  back_five: { label: "three centre-backs", words: /\b(5|five|three|3) at the back\b|\bback (5|five|3|three)\b|\bwing[- ]?backs?\b|\b3 cbs?\b|\bthree (centre|center)[- ]?backs?\b/, fits: (s) => n(s, "CB") >= 3 },
  midfield_three: { label: "three central midfielders", words: /\b(three|3)[- ](man )?midfield\b|\bmidfield (three|3)\b|\b(three|3) (cms?|central mid\w*)\b|\bbox[- ]to[- ]box\b/, fits: (s) => n(s, "CM") >= 3 || (n(s, "CM") >= 2 && n(s, "CDM") >= 1) },
};
const SOFT = new Set(["possession", "counter", "attacking", "defensive"]);
/** What it asks of the players: the face stat that gets a lift when building the XI. */
export const PLAYER_TRAITS: Record<string, { label: string; words: RegExp; stat: "pac" | "sho" | "pas" | "dri" | "def" | "phy" }> = {
  pace: { label: "pace", words: /\bpace\b|\bpacey\b|\bfast\b|\bquick\b|\bspeed\b|\brapid\b|\bin behind\b|\bcounter\w*\b/, stat: "pac" },
  passing: { label: "passing", words: /\bpass(ing|es)?\b|\bpossession\b|\btiki[- ]?taka\b|\bbuild[- ]?up\b|\bthrough balls?\b|\bplaymak\w*\b/, stat: "pas" },
  dribbling: { label: "dribbling", words: /\bdribbl\w*\b|\bskill(s| moves)?\b|\bskillers?\b|\b1v1\b|\btake (players|defenders|people) on\b|\bleft stick\b|\bagile\b/, stat: "dri" },
  shooting: { label: "shooting", words: /\bshoot\w*\b|\bfinesse\b|\blong shots?\b|\bfinish\w*\b|\bclinical\b|\bpower shots?\b/, stat: "sho" },
  defending: { label: "defending", words: /\bdefen[cs]ive\b|\btackl\w*\b|\bintercept\w*\b|\bsolid\b|\bcompact\b|\bclean sheets?\b/, stat: "def" },
  physical: { label: "strength", words: /\bphysical\b|\bstrong\b|\bstrength\b|\bbully\b|\bheaders?\b|\baerial\b|\btarget man\b|\bcross(es|ing)?\b/, stat: "phy" },
};

export interface Playstyle { text: string; shape: string[]; players: string[]; summary: string; via: "ai" | "words" }

/** The playstyle's traits from its words. Pure. */
export function readPlaystyleWords(text: string): Playstyle {
  const t = ` ${text.toLowerCase()} `;
  const named = formationName(text);
  const shape = Object.entries(SHAPE_TRAITS).filter(([, v]) => v.words.test(t)).map(([k]) => k);
  const players = Object.entries(PLAYER_TRAITS).filter(([, v]) => v.words.test(t)).map(([k]) => k);
  const labels = [...shape.map((k) => SHAPE_TRAITS[k]!.label), ...players.map((k) => PLAYER_TRAITS[k]!.label)];
  return { text, shape, players, via: "words", summary: labels.length ? `You like ${[...new Set(labels)].join(", ")}${named ? `, and you named ${named}` : ""}.` : named ? `You named ${named}.` : "" };
}

const STYLE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["shape", "players", "summary"],
  properties: {
    shape: { type: "array", items: { type: "string", enum: Object.keys(SHAPE_TRAITS) } },
    players: { type: "array", items: { type: "string", enum: Object.keys(PLAYER_TRAITS) } },
    summary: { type: "string" },
  },
};

/** The playstyle's traits read by Claude (falls back to the word reader on any failure). */
export async function readPlaystyle(text: string, env: Env, fetchFn: Fetch): Promise<Playstyle> {
  const words = readPlaystyleWords(text);
  if (!text.trim() || !(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY"))) return words;
  try {
    const res = await callClaude(env, fetchFn as typeof fetch, {
      model: env("FUT_KB_MODEL") || DEFAULT_MODEL, max_tokens: 1200,
      output_config: { effort: "low", format: { type: "json_schema", schema: STYLE_SCHEMA } },
      system: [
        "An EA SPORTS FC 27 Ultimate Team player describes how they like to play. Turn it into traits. Return JSON only.",
        `shape: what their style asks of a formation. ${Object.entries(SHAPE_TRAITS).map(([k, v]) => `${k} = ${v.label}`).join("; ")}. Pick every one their words imply (a player who loves crossing wants wide players and usually two strikers; one who sits deep and breaks wants counter and often defensive), but none they contradict.`,
        `players: what it asks of the players. ${Object.entries(PLAYER_TRAITS).map(([k, v]) => `${k} = ${v.label}`).join("; ")}.`,
        "summary: one plain sentence, addressed to them as \"you\", saying how you read their style (under 30 words).",
      ].join("\n"),
      messages: [{ role: "user", content: text.slice(0, MAX_PLAYSTYLE) }],
    });
    const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[]; stop_reason?: string } | null;
    if (!res.ok || out?.stop_reason === "refusal") return words;
    const o = JSON.parse((out?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")) as Record<string, unknown>;
    const list = (v: unknown, known: Record<string, unknown>) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x in known))] : [];
    const shape = list(o.shape, SHAPE_TRAITS), players = list(o.players, PLAYER_TRAITS);
    if (!shape.length && !players.length) return words;
    return { text, shape, players, via: "ai", summary: typeof o.summary === "string" ? o.summary.replace(/\s+/g, " ").trim().slice(0, 300) : words.summary };
  } catch (e) {
    console.error("[fut-api] ideal squad playstyle:", (e as Error).message);
    return words;
  }
}

// ---------------------------------------------------------------- scoring formations

export interface FormationOption {
  formation: string;
  /** 0-100: style 50, community 30, club 20 (the weights move to what is known when a part is missing). */
  score: number;
  community: { score: number; net: number | null; claims: number; topic_key: string | null } | null;
  style: { fit: number; matched: string[]; missed: string[] } | null;
  club: { rating: number; chemistry: number; filled: number; empty: string[] } | null;
  why: string;
}

/** How well a formation's shape fits the playstyle: the share of its traits the shape has. Pure. */
export function styleFit(formation: string, style: Playstyle): FormationOption["style"] {
  if (!style.shape.length) return null;
  const s = shapeOf(formation);
  const matched = style.shape.filter((k) => SHAPE_TRAITS[k]!.fits(s)), missed = style.shape.filter((k) => !SHAPE_TRAITS[k]!.fits(s));
  // Things they asked for outright (two strikers, wingers, a back five) count double the softer leanings (possession, counters)
  const w = (k: string) => SOFT.has(k) ? 1 : 2;
  const sum = (ks: string[]) => ks.reduce((a, k) => a + w(k), 0);
  return { fit: Math.round((sum(matched) / sum(style.shape)) * 100) / 100, matched: matched.map((k) => SHAPE_TRAITS[k]!.label), missed: missed.map((k) => SHAPE_TRAITS[k]!.label) };
}

/** Club cards with a small lift for players the community rates and players who suit the playstyle (used for picking only). */
export function liftPool(pool: WorkspaceCard[], style: Playstyle, rated: Map<string, number>): WorkspaceCard[] {
  return pool.map((c) => {
    let lift = rated.get(fold(c.name)) ?? 0;
    for (const k of style.players) {
      const v = c.stats?.[PLAYER_TRAITS[k]!.stat];
      if (typeof v === "number") lift += Math.max(-1.5, Math.min(1.5, (v - 80) / 6));
    }
    return lift ? { ...c, rating: (c.rating ?? 0) + Math.max(-3, Math.min(4, lift)) } : c;
  });
}

/** Scores the candidate formations. Pure apart from building each XI. */
export function scoreFormations(base: Squad, pool: WorkspaceCard[], rules: ChemistryRules, ranked: FormationPick[], style: Playstyle, current: string | null): { options: FormationOption[]; squads: Map<string, BestSquad> } {
  const named = formationName(style.text);
  const fits = Object.keys(FORMATIONS).map((f) => ({ f, fit: styleFit(f, style)?.fit ?? 0 })).sort((a, b) => b.fit - a.fit);
  // Candidates: everything the community talks about, the best shapes for the style, the one they named and the one they play
  const candidates = [...new Set([
    ...ranked.map((r) => r.formation), ...(style.shape.length ? fits.filter((x) => x.fit >= (fits[0]?.fit ?? 0) - 0.01).slice(0, 6).map((x) => x.f) : []),
    ...(named ? [named] : []), ...(current && FORMATIONS[current] ? [current] : []), "4-2-3-1",
  ])].filter((f) => FORMATIONS[f]).slice(0, 14);
  const maxScore = Math.max(0, ...ranked.map((r) => r.score));
  const minScore = Math.min(0, ...ranked.map((r) => r.score));
  const squads = new Map<string, BestSquad>();
  const built = pool.length ? candidates.map((f) => { const b = bestSquadFor(base, f, pool, rules, "ovr"); squads.set(f, b); return b; }) : [];
  const ratings = built.filter((b) => b.filled).map((b) => (b.rating * b.filled) / 11);
  const hi = Math.max(...ratings, 0), lo = Math.min(...ratings, hi);
  const mine = current && FORMATIONS[current] ? shapeOf(current) : null;
  const near = (f: string) => mine ? Object.entries(shapeOf(f)).reduce((a, [p, c]) => a + Math.min(c, mine[p] ?? 0), 0) : 0;
  const options = candidates.map((f): FormationOption => {
    const r = ranked.find((x) => x.formation === f) ?? null;
    const community = r ? { score: r.score, net: r.net, claims: r.claims, topic_key: r.key } : null;
    // -1..1: the most backed formation is 1, the most criticised -1, one nobody mentions 0
    const c = !r ? 0 : r.score >= 0 ? (maxScore ? r.score / maxScore : 0) : (minScore ? -r.score / minScore : 0);
    const style_ = styleFit(f, style);
    const b = squads.get(f) ?? null;
    const club = b ? { rating: b.rating, chemistry: b.chemistry, filled: b.filled, empty: b.empty } : null;
    const clubFit = b && b.filled ? (hi > lo ? ((b.rating * b.filled) / 11 - lo) / (hi - lo) : 1) : 0;
    // Weights go to what is known: no playstyle given, no formation talk in the bank, or no club cards
    const w = { community: ranked.length ? 30 : 0, style: style_ ? 50 : 0, club: club ? 20 : 0 };
    const total = w.community + w.style + w.club || 1;
    let score = (w.community * ((c + 1) / 2) + w.style * (style_?.fit ?? 0) + w.club * clubFit) / total * 100;
    if (named === f) score += 15; // they asked for it by name
    const why = [
      named === f ? "you named it" : null,
      community ? (community.score > 0 ? `the community backs it (${community.claims} claim${community.claims === 1 ? "" : "s"})` : community.score < 0 ? "the community is cool on it" : "the community is split on it") : ranked.length ? "nobody in the bank is talking about it" : null,
      style_ ? (style_.matched.length ? `it gives you ${style_.matched.join(", ")}${style_.missed.length ? ` but not ${style_.missed.join(", ")}` : ""}` : `it doesn't give you ${style_.missed.join(", ")}`) : null,
      club ? (club.empty.length ? `your club leaves ${club.empty.length} slot${club.empty.length === 1 ? "" : "s"} empty in it` : `your club makes an ${club.rating}-rated XI in it`) : null,
    ].filter(Boolean).join("; ");
    return { formation: f, score: Math.round(Math.min(100, score)), community, style: style_, club, why: why ? why[0]!.toUpperCase() + why.slice(1) + "." : "" };
    // Level on points: the one the community backs more, then better chemistry, then the shape nearest the one they play
  }).sort((a, b) => b.score - a.score || (b.community?.score ?? 0) - (a.community?.score ?? 0) || (b.club?.chemistry ?? 0) - (a.club?.chemistry ?? 0)
    || near(b.formation) - near(a.formation) || a.formation.localeCompare(b.formation));
  return { options, squads };
}

// ---------------------------------------------------------------- the ideal squad

export interface IdealSquad {
  playstyle: Playstyle;
  formation: string;
  options: FormationOption[];
  /** The XI from the club in the chosen formation, ready to drop into Squad Builder. */
  squad: Squad;
  chemistry: number; rating: number; empty: string[];
  /** Why each player is in: the community rates them, or they suit the style. */
  notes: Record<string, string>;
  plan: TeamPlan;
}

export async function idealSquad(
  db: Rpc, userId: string, base: Squad, pool: WorkspaceCard[], rules: ChemistryRules,
  input: { playstyle: string; formation?: string | null; days: number; platform: "console" | "pc" },
  team: TeamContext, env: Env, fetchFn: Fetch, beforeAi?: () => void, statPicker?: StatPicker,
): Promise<IdealSquad> {
  const text = input.playstyle.replace(/\s+/g, " ").trim().slice(0, MAX_PLAYSTYLE);
  if (env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY")) beforeAi?.();
  const style = await readPlaystyle(text, env, fetchFn);
  let options: FormationOption[] = [], squads = new Map<string, BestSquad>();
  const plan = await teamPlan(db, userId, {
    days: input.days, platform: input.platform, refresh: true, playstyle: text || null,
    pickFormation: (ranked) => {
      ({ options, squads } = scoreFormations(base, pool, rules, ranked, style, team.squad?.formation ?? base.formation));
      const pick = (input.formation && FORMATIONS[input.formation] ? options.find((o) => o.formation === input.formation) ?? { formation: input.formation, why: "You picked it." } : null) ?? options[0];
      return Promise.resolve(pick ? { formation: pick.formation, why: pick.why } : null);
    },
  }, team, env, fetchFn, undefined, statPicker);
  const formation = plan.formation.name;
  // The XI: club cards, with a lift for players the community rates and players who suit the style
  const rated = new Map<string, number>();
  for (const g of plan.positions) for (const p of g.community) {
    const name = p.card?.player_name ?? p.owned_card?.name;
    if (name && p.owned) rated.set(fold(name), p.verdict === "rated" ? 2 : p.verdict === "overrated" ? -1.5 : 0);
  }
  const byId = new Map(pool.map((c) => [c.id, c]));
  const best = pool.length ? bestSquadFor(base, formation, liftPool(pool, style, rated), rules, "ovr") : squads.get(formation) ?? null;
  // Hand back the real cards (the lift was only for choosing)
  const slots = (best?.squad.slots ?? (FORMATIONS[formation] ?? []).map((l) => ({ slot: l.slot, position: l.position, card: null, locked: false })))
    .map((s) => ({ ...s, card: s.card ? byId.get(s.card.id) ?? s.card : null }));
  const filled = slots.filter((s) => s.card);
  const notes: Record<string, string> = {};
  for (const s of filled) {
    const c = s.card!, lift = rated.get(fold(c.name)) ?? 0;
    const suits = style.players.filter((k) => (c.stats?.[PLAYER_TRAITS[k]!.stat] ?? 0) >= 85).map((k) => `${c.stats![PLAYER_TRAITS[k]!.stat]} ${PLAYER_TRAITS[k]!.label}`);
    const bits = [lift > 0 ? "the community rates him" : lift < 0 ? "people call him overrated, but he's your best here" : null, suits.length ? `suits your style (${suits.join(", ")})` : null].filter(Boolean);
    if (bits.length) notes[s.slot] = bits.join("; ");
  }
  // Shown: the best six, always with the one the plan is built on and the one the community backs most
  const shown = options.slice(0, 6);
  const backed = options.filter((o) => (o.community?.score ?? 0) > 0).sort((x, y) => y.community!.score - x.community!.score)[0];
  for (const must of [options.find((o) => o.formation === formation), backed]) {
    if (must && !shown.includes(must)) shown.splice(shown.findLastIndex((o) => o.formation !== formation && o !== backed), 1, must);
  }
  return {
    playstyle: style, formation, options: shown.sort((x, y) => options.indexOf(x) - options.indexOf(y)),
    squad: { ...base, formation, slots, updated_at: new Date().toISOString() },
    chemistry: best?.chemistry ?? 0, rating: filled.length ? Math.round(filled.reduce((a, s) => a + (s.card!.rating ?? 0), 0) / filled.length) : 0,
    empty: slots.filter((s) => !s.card).map((s) => s.slot), notes, plan,
  };
}
