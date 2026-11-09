// Player Ratings search and the player finder chat. The user describes the player they want ("fast CB under 50k
// with good passing"); Claude turns that into a structured search (positions, price, hard limits and stat weights),
// and the database ranks every card on the market-wide list by fit. Without an API key a simple word reader handles
// common requests. The search itself never uses AI.
import {
  ACCELERATE_TYPES, ALL_STATS, cleanPlayerQuery, DETAIL_STATS, describeQuery, FACE_STATS, PLAYER_POSITIONS, PLAYSTYLES,
  type PlayerQuery, type StatWeight,
} from "./stats.ts";
import { FutError, type FutDb } from "./service.ts";
import { callClaude } from "./squad-import.ts";

export const MAX_FINDER_TEXT = 600;
const DEFAULT_MODEL = "claude-opus-5-5";

export interface SearchPage { platform?: string; limit?: number; offset?: number }

/** Runs a cleaned search. Throws FutError on a bad platform; anything unknown in the query is already dropped. */
export async function searchPlayers(db: FutDb, userId: string, query: PlayerQuery, page: SearchPage = {}): Promise<PlayerSearchResult> {
  const platform = page.platform === "pc" ? "pc" : "console";
  const { data, error } = await db.rpc("futgg_player_search", {
    p_query: { ...query, platform, limit: page.limit ?? 50, offset: page.offset ?? 0 },
    p_user: userId,
  });
  if (error) throw new FutError(`Player search is unavailable: ${error.message}`, 500);
  return data as PlayerSearchResult;
}

export interface PlayerSearchResult {
  platform: string; published_at: string | null; sort: string; direction: string;
  catalogue_cards: number; with_stats: number; total: number; cards: Record<string, unknown>[];
}

// ---------------------------------------------------------------- reading a request without AI

const WORD_POSITIONS: [RegExp, string[]][] = [
  [/\b(goal ?keepers?|keepers?|gks?)\b/, ["GK"]],
  [/\b(centre[- ]?backs?|center[- ]?backs?|cbs?)\b/, ["CB"]],
  [/\b(full[- ]?backs?|wing[- ]?backs?)\b/, ["LB", "RB"]],
  [/\b(left[- ]?backs?|lbs?|lwbs?)\b/, ["LB"]],
  [/\b(right[- ]?backs?|rbs?|rwbs?)\b/, ["RB"]],
  [/\b(cdms?|defensive mid(fielder)?s?|holding mid(fielder)?s?|anchors?)\b/, ["CDM"]],
  [/\b(cms?|central mid(fielder)?s?|box[- ]to[- ]box)\b/, ["CM"]],
  [/\b(cams?|attacking mid(fielder)?s?|number 10s?|playmakers?)\b/, ["CAM"]],
  [/\b(wingers?|wide (players?|men))\b/, ["LW", "RW", "LM", "RM"]],
  [/\b(lws?|left wingers?)\b/, ["LW"]], [/\b(rws?|right wingers?)\b/, ["RW"]],
  [/\b(lms?|left mid(fielder)?s?)\b/, ["LM"]], [/\b(rms?|right mid(fielder)?s?)\b/, ["RM"]],
  [/\b(sts?|strikers?|forwards?|cfs?|number 9s?)\b/, ["ST"]],
];

const WORD_WEIGHTS: [RegExp, StatWeight[]][] = [
  [/\b(fast|pacey|pacy|quick|rapid|speed(y)?|pace)\b/, [{ stat: "pac", weight: 5 }]],
  [/\b(passing|passer|playmak\w*|vision|distribut\w*)\b/, [{ stat: "pas", weight: 4 }]],
  [/\b(shoot\w*|finish\w*|clinical|goal ?scor\w*|shot)\b/, [{ stat: "sho", weight: 5 }]],
  [/\b(dribbl\w*|skill(ful|ed)|tricky|agile|on the ball)\b/, [{ stat: "dri", weight: 4 }]],
  [/\b(defend\w*|tackl\w*|defensive|solid at the back)\b/, [{ stat: "def", weight: 5 }]],
  [/\b(strong|physical|strength|bully|tank|hard)\b/, [{ stat: "phy", weight: 4 }]],
  [/\b(stamina|engine|work ?rate|relentless)\b/, [{ stat: "stamina", weight: 3 }]],
  [/\b(aerial|header|heading|in the air|tall|height)\b/, [{ stat: "heading_accuracy", weight: 3 }, { stat: "jumping", weight: 2 }, { stat: "height_cm", weight: 3 }]],
  [/\b(cross\w*)\b/, [{ stat: "crossing", weight: 4 }]],
  [/\b(long shots?|from distance|outside the box)\b/, [{ stat: "long_shots", weight: 4 }]],
  [/\b(free ?kicks?|set pieces?|dead ball)\b/, [{ stat: "fk_accuracy", weight: 4 }, { stat: "curve", weight: 2 }]],
  [/\b(composed|composure)\b/, [{ stat: "composure", weight: 3 }]],
  [/\b(shot ?stopp\w*|reflex\w*|diving|saves?)\b/, [{ stat: "gk_reflexes", weight: 4 }, { stat: "gk_diving", weight: 4 }]],
  [/\b(sweeper keeper|rushes out|good with (his|her|their) feet)\b/, [{ stat: "gk_kicking", weight: 3 }, { stat: "gk_speed", weight: 3 }]],
];

function money(raw: string, unit: string | undefined): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const u = (unit ?? "").toLowerCase();
  return Math.round(u.startsWith("m") ? n * 1_000_000 : u.startsWith("k") ? n * 1000 : n);
}

/** Pure: reads common requests without AI. Starts from the previous search when the user is refining it. */
export function quickParse(message: string, previous: PlayerQuery | null = null): { query: PlayerQuery; understood: boolean } {
  const t = ` ${message.toLowerCase()} `;
  const q: PlayerQuery = previous ? { ...previous, weights: [...(previous.weights ?? [])], minimums: [...(previous.minimums ?? [])] } : {};
  let understood = false;
  const positions = new Set<string>();
  for (const [re, ps] of WORD_POSITIONS) if (re.test(t)) ps.forEach((p) => positions.add(p));
  // A code typed on its own ("ST", "CDM") counts too
  for (const p of PLAYER_POSITIONS) if (new RegExp(`\\b${p.toLowerCase()}s?\\b`).test(t)) positions.add(p);
  if (positions.size) { q.positions = [...positions]; understood = true; }

  const under = t.match(/\b(?:under|below|less than|max(?:imum)?|up to|budget(?: of)?|<)\s*([\d.,]+)\s*(k|m|mil\w*|coins?)?\b/);
  if (under) { const v = money(under[1]!, under[2]); if (v !== null) { q.max_price = v; understood = true; } }
  const over = t.match(/\b(?:over|above|more than|at least|min(?:imum)?)\s*([\d.,]+)\s*(k|m|mil\w*)\b/);
  if (over) { const v = money(over[1]!, over[2]); if (v !== null) { q.min_price = v; understood = true; } }
  if (/\b(cheap|budget|bargain)\b/.test(t) && q.max_price == null) { q.max_price = 10_000; understood = true; }
  if (/\b(cheaper)\b/.test(t) && previous?.max_price) { q.max_price = Math.round(previous.max_price * 0.6); understood = true; }

  const rated = t.match(/\b([4-9]\d)\s*(?:\+|plus|or (?:higher|above|more)|rated|ovr|overall)/);
  if (rated) { q.min_rating = Number(rated[1]); understood = true; }
  const wf = t.match(/\b([2-5])\s*(?:\*|star|stars|☆|★)?\s*(?:weak ?foot|wf)\b/) ?? t.match(/\b(?:weak ?foot|wf)\s*([2-5])\b/);
  if (wf) { q.minimums = [...(q.minimums ?? []).filter((b) => b.stat !== "weak_foot"), { stat: "weak_foot", value: Number(wf[1]) }]; understood = true; }
  const sm = t.match(/\b([2-5])\s*(?:\*|star|stars|☆|★)?\s*(?:skill(?:s| moves)?|sm)\b/) ?? t.match(/\b(?:skill moves|skills|sm)\s*([2-5])\b/);
  if (sm) { q.minimums = [...(q.minimums ?? []).filter((b) => b.stat !== "skill_moves"), { stat: "skill_moves", value: Number(sm[1]) }]; understood = true; }
  if (/\bleft[- ]?(foot(ed)?|footer)\b/.test(t)) { q.foot = "left"; understood = true; }
  if (/\bright[- ]?(foot(ed)?|footer)\b/.test(t)) { q.foot = "right"; understood = true; }
  if (/\bicons?\b/.test(t)) { q.card_type = "icon"; understood = true; }
  else if (/\bheroe?s?\b/.test(t)) { q.card_type = "hero"; understood = true; }
  if (/\b(my club|i own|my cards|already have)\b/.test(t)) { q.owned_only = true; understood = true; }
  if (/\bexplosive\b/.test(t)) { q.accelerate_types = ["EXPLOSIVE", "MOSTLY_EXPLOSIVE", "CONTROLLED_EXPLOSIVE"]; understood = true; }
  if (/\blengthy\b/.test(t)) { q.accelerate_types = ["LENGTHY", "MOSTLY_LENGTHY", "CONTROLLED_LENGTHY"]; understood = true; }
  for (const p of PLAYSTYLES) {
    const name = p.toLowerCase();
    if (t.includes(` ${name}+`) || t.includes(`${name} plus`)) { q.playstyles_plus = [...new Set([...(q.playstyles_plus ?? []), p])]; understood = true; }
    else if (t.includes(` ${name} `) || t.includes(` ${name},`) || t.includes(` ${name}.`)) { q.playstyles = [...new Set([...(q.playstyles ?? []), p])]; understood = true; }
  }

  const weights = new Map((q.weights ?? []).map((w) => [w.stat, w.weight]));
  for (const [re, ws] of WORD_WEIGHTS) if (re.test(t)) { for (const w of ws) weights.set(w.stat, Math.max(weights.get(w.stat) ?? 0, w.weight)); understood = true; }
  // "Good" alone usually means the card should simply be strong overall
  if (weights.size) { q.weights = [...weights].map(([stat, weight]) => ({ stat, weight })); q.sort = "fit"; }
  return { query: cleanPlayerQuery(q), understood };
}

// ---------------------------------------------------------------- reading a request with Claude

const STAT_ENUM = ALL_STATS.map((s) => s.key);
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const bound = { type: "object", additionalProperties: false, required: ["stat", "value"], properties: { stat: { type: "string", enum: STAT_ENUM }, value: { type: "integer" } } };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "text", "positions", "card_type", "min_rating", "max_rating", "min_price", "max_price", "priced_only", "minimums", "maximums",
    "foot", "playstyles", "playstyles_plus", "accelerate_types", "league", "nation", "club", "owned_only", "weights"],
  properties: {
    reply: { type: "string" },
    text: nullable({ type: "string" }),
    positions: { type: "array", items: { type: "string", enum: [...PLAYER_POSITIONS] } },
    card_type: nullable({ type: "string", enum: ["icon", "hero", "promo", "base"] }),
    min_rating: nullable({ type: "integer" }), max_rating: nullable({ type: "integer" }),
    min_price: nullable({ type: "integer" }), max_price: nullable({ type: "integer" }),
    priced_only: { type: "boolean" },
    minimums: { type: "array", items: bound }, maximums: { type: "array", items: bound },
    foot: nullable({ type: "string", enum: ["left", "right"] }),
    playstyles: { type: "array", items: { type: "string", enum: [...PLAYSTYLES] } },
    playstyles_plus: { type: "array", items: { type: "string", enum: [...PLAYSTYLES] } },
    accelerate_types: { type: "array", items: { type: "string", enum: [...ACCELERATE_TYPES] } },
    league: nullable({ type: "string" }), nation: nullable({ type: "string" }), club: nullable({ type: "string" }),
    owned_only: { type: "boolean" },
    weights: { type: "array", items: { type: "object", additionalProperties: false, required: ["stat", "weight"], properties: { stat: { type: "string", enum: STAT_ENUM }, weight: { type: "integer" } } } },
  },
};

function systemPrompt(previous: PlayerQuery | null): string {
  const stats = [...FACE_STATS, ...DETAIL_STATS].map((s) => `${s.key} (${s.label})`).join(", ");
  return [
    "You turn an EA SPORTS FC 27 Ultimate Team player request into a search over every FUT card. Return JSON only.",
    `Stats you can use (1-99): ${stats}. Card numbers: overall, weak_foot (1-5 stars), skill_moves (1-5 stars), height_cm, total_stats, total_igs.`,
    `Position codes: ${PLAYER_POSITIONS.join(", ")}. A card matches a position if it's the card's main or alternative position.`,
    "weights rank the results: list the 2 to 6 stats that matter most for what the user describes, weight 1 (nice to have) to 5 (essential). Use face stats (pac, sho, pas, dri, def, phy) for broad wishes and in-game attributes for specific ones (e.g. acceleration for quick off the mark, short_passing for tiki-taka, heading_accuracy and jumping for aerial threat, interceptions and defensive_awareness for reading the game). Goalkeepers: gk_diving, gk_handling, gk_kicking, gk_reflexes, gk_positioning, gk_speed.",
    "minimums and maximums are hard limits: only use them when the user states a number (\"at least 85 pace\", \"4 star weak foot\", \"under 185cm\") or a must-have; otherwise prefer weights so there are always results.",
    "Prices are in coins: 50k = 50000, 1.2m = 1200000. \"Under 50k\" sets max_price 50000. \"Cheap\" with no number: max_price 10000. Set priced_only when the user wants to buy the card.",
    "card_type: icon, hero, promo (any special card) or base (gold/silver/bronze rare or common), only when asked. foot only when asked. owned_only when they mean cards they already own (\"in my club\").",
    "playstyles must be on the card (plain or plus); playstyles_plus only when they ask for the plus version. accelerate_types only when they mention AcceleRATE (explosive, controlled, lengthy).",
    "text is a name, club, nation, league or card version to look for, only when they name one that isn't a league, nation or club field.",
    previous
      ? `The user's current search is ${JSON.stringify(previous)}. If the new message refines it (\"cheaper\", \"left footed only\", \"what about strikers\"), return the whole updated search, keeping what they didn't change. If it's a new request, start fresh.`
      : "This is a new search.",
    "reply is one or two short, friendly sentences telling the user what you're looking for (e.g. \"Looking for quick centre-backs under 50k who can pass, ranked on pace, defending and passing.\"). Don't list players and don't promise results.",
    "If the message isn't about finding a FUT player, keep the current search and say in reply what you can help with.",
  ].join("\n");
}

export interface FinderTurn { role: "user" | "assistant"; text: string }

export async function readRequestWithClaude(
  message: string, previous: PlayerQuery | null, history: FinderTurn[], env: (k: string) => string | undefined, fetchFn: typeof fetch = fetch,
): Promise<{ query: PlayerQuery; reply: string }> {
  const messages = [
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.text.slice(0, MAX_FINDER_TEXT) })),
    { role: "user", content: message },
  ];
  // The API wants turns to alternate, starting with the user
  while (messages.length && messages[0]!.role !== "user") messages.shift();
  const merged: { role: string; content: string }[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`; else merged.push({ ...m });
  }
  const res = await callClaude(env, fetchFn, {
    model: env("FUT_FINDER_MODEL") || env("FUT_IMPORT_MODEL") || DEFAULT_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: systemPrompt(previous),
    messages: merged,
  });
  const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } } | null;
  if (!res.ok) {
    console.error("[fut-api] player finder AI:", res.status, out?.error?.message);
    throw new FutError(res.status === 429 || res.status >= 500 ? "The player finder is busy. Try again in a minute." : "The player finder couldn't read that. Try saying it another way.", 502);
  }
  if (out?.stop_reason === "refusal") throw new FutError("The player finder declined that request.", 422);
  const text = (out?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { throw new FutError("The player finder returned something unreadable. Try again.", 502); }
  const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim().slice(0, 400) : "Here are the best fits I found.";
  const query = cleanPlayerQuery(parsed);
  if (query.weights?.length) query.sort = "fit";
  return { query, reply };
}

// ---------------------------------------------------------------- one chat turn

export interface FinderResult {
  reply: string; query: PlayerQuery; summary: string[]; via: "ai" | "words"; relaxed: string | null; result: PlayerSearchResult;
}

export async function findPlayers(
  db: FutDb, userId: string,
  input: { message: string; previous: PlayerQuery | null; history: FinderTurn[]; platform?: string },
  env: (k: string) => string | undefined, fetchFn: typeof fetch = fetch, hooks: { beforeAi?: () => void } = {},
): Promise<FinderResult> {
  const message = input.message.trim().slice(0, MAX_FINDER_TEXT);
  if (!message) throw new FutError("Tell me what kind of player you're looking for.");
  let query: PlayerQuery, reply: string, via: FinderResult["via"];
  if (env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY")) {
    hooks.beforeAi?.();
    ({ query, reply } = await readRequestWithClaude(message, input.previous, input.history, env, fetchFn));
    via = "ai";
  } else {
    const quick = quickParse(message, input.previous);
    if (!quick.understood) throw new FutError("I couldn't tell what you're after. Try something like \"fast CB under 50k with good passing\".", 422);
    query = quick.query; via = "words";
    reply = `Looking for ${describeQuery(query).join(", ") || "the best cards"}.`;
  }
  let result = await searchPlayers(db, userId, query, { platform: input.platform, limit: 50 });
  let relaxed: string | null = null;
  // Hard limits can rule everything out; try once more ranking on them instead
  if (result.total === 0 && (query.minimums?.length || query.maximums?.length || query.playstyles?.length || query.accelerate_types?.length)) {
    const extra: StatWeight[] = (query.minimums ?? []).map((b) => ({ stat: b.stat, weight: 3 }));
    const looser = cleanPlayerQuery({ ...query, minimums: [], maximums: [], playstyles: [], playstyles_plus: [], accelerate_types: [], weights: [...(query.weights ?? []), ...extra], sort: "fit" });
    const second = await searchPlayers(db, userId, looser, { platform: input.platform, limit: 50 });
    if (second.total > 0) { result = second; query = looser; relaxed = "Nothing matched every must-have, so these are the closest fits without the hard limits."; }
  }
  return { reply, query, summary: describeQuery(query), via, relaxed, result };
}
