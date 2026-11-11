// Squad import for the Squad Builder: the user types their squad ("ST Mbappe 91, CAM ..."), pastes a list or CSV,
// or uploads a screenshot of their squad. Claude reads free text and screenshots into player lines; a plain list
// is read here without any AI call. Each line is matched to the user's own synced cards first, then the FUT.GG
// market card list, and the matches are placed into the squad's slots. Nothing is saved: the edited squad comes
// back for the user to check and save.
import { FutError, searchMyCards, toWorkspaceCard, type Card, type FutDb } from "./service.ts";
import { FORMATIONS, setFormation, type Squad, type WorkspaceCard } from "./xilab/workspace/index.ts";

export interface ImportEntry { slot?: string | null; position?: string | null; name: string; rating?: number | null; version?: string | null }
export interface ParsedSquad { formation?: string | null; entries: ImportEntry[]; clear_slots?: string[]; note?: string | null; via: "list" | "ai" }

export type Confidence = "sure" | "likely" | "check";
export interface MatchOption { card: WorkspaceCard; version: string | null; score: number }
export interface ImportRow {
  input: ImportEntry;
  slot: string | null;
  card: WorkspaceCard | null;
  version: string | null;
  confidence: Confidence | "missing";
  options: MatchOption[];
  reason?: string;
}
export interface ImportResult { squad: Squad; rows: ImportRow[]; formation_changed: string | null; cleared: string[]; via: ParsedSquad["via"]; note: string | null }

const POSITIONS = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"];
/** Positions FC 27 still shows on older cards or that people type, mapped to the builder's codes. */
const ALIASES: Record<string, string> = { RWB: "RB", LWB: "LB", CF: "ST", RF: "RW", LF: "LW", GOALKEEPER: "GK", STRIKER: "ST", KEEPER: "GK" };
const SLOT_POSITION = new Map(Object.values(FORMATIONS).flatMap((f) => f.map((s) => [s.slot, s.position] as const)));
const SLOT_NAMES = new Set(SLOT_POSITION.keys());

export const MAX_IMPORT_TEXT = 4000;
export const MAX_IMPORT_ENTRIES = 30;

/** Lowercase, accents off ("Mbappé" → "mbappe", "Ødegaard" → "odegaard"), punctuation to spaces. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/[đð]/g, "d").replace(/ł/g, "l").replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function positionOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const p = v.trim().toUpperCase();
  if (POSITIONS.includes(p)) return p;
  return ALIASES[p] ?? SLOT_POSITION.get(p) ?? null;
}

/** "4-3-3", "4-3-3 (2)", "4-3-3(2)" → the builder's formation name, or null when FC 27 has no such formation. */
export function formationName(shape: string, variant?: string | null): string | null {
  const name = variant && variant !== "1" ? `${shape} (${variant})` : shape;
  return FORMATIONS[name] ? name : null;
}

const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Validate entries from any source (AI output or our own parser) into the shape the matcher trusts. */
export function cleanEntries(raw: unknown): ImportEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportEntry[] = [];
  for (const r of raw.slice(0, MAX_IMPORT_ENTRIES)) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    const name = clean(e.name, 60);
    if (!name || !normalize(name)) continue;
    const rating = Number(e.rating);
    const slot = clean(e.slot, 8)?.toUpperCase() ?? null;
    out.push({
      name,
      slot: slot && SLOT_NAMES.has(slot) ? slot : null,
      position: positionOf(e.position) ?? (slot ? positionOf(slot) : null),
      rating: Number.isInteger(rating) && rating >= 40 && rating <= 99 ? rating : null,
      version: clean(e.version, 40),
    });
  }
  return out;
}

const POS_RE = "(GK|RB|CB|LB|CDM|CM|CAM|RM|LM|RW|LW|ST|RWB|LWB|CF|RF|LF|LCB|RCB|LCM|RCM|LCDM|RCDM|LCAM|RCAM|LST|RST)";
const LINE = new RegExp(`^${POS_RE}\\s*[:\\-–.)]?\\s+(.+?)\\s*$`, "i");
const LINE_REVERSED = new RegExp(`^(.+?)\\s*[:\\-–(,]\\s*${POS_RE}\\)?\\s*$`, "i");

function nameAndRating(rest: string): { name: string; rating: number | null; version: string | null } {
  let s = rest.replace(/[()[\]]/g, " ").trim();
  let rating: number | null = null;
  let version: string | null = null;
  const num = s.match(/(?:^|\s)(\d{2})(?:\s|$)/);
  if (num) { rating = Number(num[1]); s = s.replace(num[0], " ").trim(); }
  // "Mbappe TOTW", "Mbappe - Icon": a version word after a dash or comma.
  const parts = s.split(/\s+[-–,|]\s+|,\s*/);
  if (parts.length > 1) { s = parts[0]!.trim(); version = parts.slice(1).join(" ").trim() || null; }
  return { name: s.replace(/\s+/g, " "), rating: rating && rating >= 40 && rating <= 99 ? rating : null, version };
}

/**
 * A plain squad list read without AI: one player per line (or comma-separated on one line) as
 * "ST Mbappe 91", "GK: Courtois", "Saka - RW", or a CSV with a header naming position/name/rating/version columns.
 * Returns null when the text isn't such a list (a chat sentence, say), so it goes to Claude instead.
 */
export function parseSquadList(text: string): ParsedSquad | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  let formation: string | null = null;
  const first = lines[0]!.match(/^(?:formation\s*[:\-]?\s*)?(\d(?:-\d){2,4})\s*(?:\(\s*(\d)\s*\))?\s*$/i);
  if (first) { formation = formationName(first[1]!, first[2]); lines.shift(); }

  // CSV with a header row
  const header = lines[0]?.toLowerCase().split(/[,;\t]/).map((h) => h.trim());
  if (header && header.includes("name") && lines.length > 1) {
    const col = (k: string[]) => header.findIndex((h) => k.includes(h));
    const ci = { name: col(["name", "player", "player_name"]), pos: col(["position", "pos", "slot"]), rating: col(["rating", "overall", "ovr"]), version: col(["version", "card", "type"]) };
    const entries = cleanEntries(lines.slice(1).map((l) => {
      const c = l.split(/[,;\t]/).map((x) => x.trim());
      const pos = ci.pos >= 0 ? c[ci.pos] : null;
      return { name: c[ci.name], position: pos, slot: pos, rating: ci.rating >= 0 ? c[ci.rating] : null, version: ci.version >= 0 ? c[ci.version] : null };
    }));
    return entries.length ? { formation, entries, via: "list" } : null;
  }

  const items = lines.length === 1 ? lines[0]!.split(/\s*[,;]\s*(?=(?:GK|RB|CB|LB|CDM|CM|CAM|RM|LM|RW|LW|ST|RWB|LWB|CF|LCB|RCB|LCM|RCM|LCDM|RCDM|LCAM|RCAM|LST|RST)\b)/i) : lines;
  const raw: Record<string, unknown>[] = [];
  for (const item of items) {
    const m = item.match(LINE);
    const r = m ? null : item.match(LINE_REVERSED);
    if (!m && !r) return null; // not a list: let Claude read it
    const pos = (m ? m[1] : r![2])!.toUpperCase();
    const rest = m ? m[2]! : r![1]!;
    // "put Saka at RW" reads as a sentence, not a list line.
    if (/\b(put|swap|move|replace|add|remove|change|with|instead|bench|sub)\b/i.test(rest)) return null;
    const { name, rating, version } = nameAndRating(rest);
    raw.push({ name, position: pos, slot: pos, rating, version });
  }
  const entries = cleanEntries(raw);
  return entries.length ? { formation, entries, via: "list" } : null;
}

// ---------------------------------------------------------------- reading text and screenshots with Claude

export interface ImportImage { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string }

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-5-5";

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ anyOf: [{ type, ...extra }, { type: "null" }] });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["formation", "players", "clear_slots", "note"],
  properties: {
    formation: nullable("string"),
    players: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slot", "position", "name", "rating", "version"],
        properties: { slot: nullable("string"), position: nullable("string"), name: { type: "string" }, rating: nullable("integer"), version: nullable("string") },
      },
    },
    clear_slots: { type: "array", items: { type: "string" } },
    note: nullable("string"),
  },
};

function systemPrompt(squad: Squad) {
  const slots = squad.slots.map((s) => `${s.slot} (${s.position}): ${s.card ? `${s.card.name} ${s.card.rating ?? ""}`.trim() : "empty"}`).join("\n");
  return [
    "You read EA SPORTS FC 27 Ultimate Team squads for a squad builder and return the players as JSON.",
    `The builder has every FC 27 Ultimate Team formation, named as in the game: ${Object.keys(FORMATIONS).join(", ")}. Position codes (FC 27 has only these 12): ${POSITIONS.join(", ")}.`,
    `The squad is currently ${squad.formation}, with these slots:\n${slots}`,
    "For each player the user names or the screenshot shows on the pitch, give: slot (one of the slot names above when you can tell which one, else null), position (a position code, else null), name (the player's name as shown on the card, keeping accents), rating (overall, else null), version (the card type such as TOTW, Icon, Hero, Rare or a promo name, else null).",
    "Only list starting players, not substitutes or reserves, unless the user says to put one in a slot.",
    "If the user asks for a formation the builder has, set formation; otherwise null. If they ask to empty slots, list them in clear_slots.",
    "Never invent players. If a name is unreadable, leave that player out and say so in note. note is one short sentence for the user, or null.",
  ].join("\n");
}

export async function callClaude(env: (k: string) => string | undefined, fetchFn: typeof fetch, body: Record<string, unknown>): Promise<Response> {
  const key = env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY");
  if (!key) throw new FutError("Reading free text and screenshots needs a Claude API key: add yours on your profile. Typed lists like \"ST Mbappe 91\" still work.", 503);
  const send = (b: Record<string, unknown>, beta: boolean) => fetchFn(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(beta ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}) },
    body: JSON.stringify(b),
  });
  // Server-side fallback reruns a declined request on another model; if the account can't use it, send without.
  let res = await send({ ...body, fallbacks: "default" }, true);
  if (res.status === 400 && /fallback/i.test(await res.clone().text().catch(() => ""))) res = await send(body, false);
  return res;
}

/** Ask Claude to read a chat message and/or a screenshot into player lines, with the current squad as context. */
export async function readWithClaude(
  squad: Squad, input: { text?: string | null; image?: ImportImage | null },
  env: (k: string) => string | undefined, fetchFn: typeof fetch = fetch,
): Promise<ParsedSquad> {
  const content: Record<string, unknown>[] = [];
  if (input.image) content.push({ type: "image", source: { type: "base64", media_type: input.image.media_type, data: input.image.data } });
  content.push({ type: "text", text: input.text?.trim() || "Read my squad from this screenshot." });
  const res = await callClaude(env, fetchFn, {
    model: env("FUT_IMPORT_MODEL") || DEFAULT_MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: systemPrompt(squad),
    messages: [{ role: "user", content }],
  });
  const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } } | null;
  if (!res.ok) {
    console.error("[fut-api] squad import AI:", res.status, out?.error?.message);
    throw new FutError(res.status === 429 || res.status >= 500 ? "The squad reader is busy. Try again in a minute." : "The squad reader couldn't read that. Try typing the squad as a list.", 502);
  }
  if (out?.stop_reason === "refusal") throw new FutError("The squad reader declined that request. Try typing the squad as a list.", 422);
  const text = (out?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { throw new FutError("The squad reader returned something unreadable. Try again.", 502); }
  const fm = typeof parsed.formation === "string" ? parsed.formation.match(/^\s*(\d(?:-\d){2,4})\s*(?:\(\s*(\d)\s*\))?\s*$/) : null;
  const formation = fm ? formationName(fm[1]!, fm[2]) : null;
  const clear_slots = Array.isArray(parsed.clear_slots) ? parsed.clear_slots.filter((s): s is string => typeof s === "string").map((s) => s.toUpperCase()).filter((s) => SLOT_NAMES.has(s)) : [];
  return { formation, entries: cleanEntries(parsed.players), clear_slots, note: clean(parsed.note, 300), via: "ai" };
}

// ---------------------------------------------------------------- matching players to cards

type Row = Record<string, unknown>;
interface Candidate { card: WorkspaceCard; version: string | null; key: string }

function editSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[b.length]! / Math.max(a.length, b.length);
}

/** How well a typed name fits a card name, 0 (no) to 100 (same name). */
export function nameScore(typed: string, cardName: string): number {
  const q = normalize(typed), c = normalize(cardName);
  if (!q || !c) return 0;
  if (q === c) return 100;
  const qt = q.split(" "), ct = c.split(" ");
  if (qt.every((t) => ct.includes(t))) return 90; // "mbappe" → "kylian mbappe"
  if (ct.every((t) => qt.includes(t))) return 85; // "kylian mbappe" → "mbappe"
  if (q.replace(/ /g, "") === c.replace(/ /g, "")) return 85;
  if (qt.every((t) => t.length >= 3 && ct.some((x) => x.startsWith(t)))) return 70;
  const last = editSimilarity(qt[qt.length - 1]!, ct[ct.length - 1]!);
  if (last >= 0.8 && qt[qt.length - 1]!.length >= 4) return Math.round(50 + last * 15);
  const whole = editSimilarity(q, c);
  return whole >= 0.8 ? Math.round(45 + whole * 15) : 0;
}

const BASE = new Set(["", "rare", "common", "gold", "silver", "bronze", "non rare"]);

function score(e: ImportEntry, cand: Candidate): number {
  const n = nameScore(e.name, cand.card.name);
  if (!n) return 0;
  let s = n;
  if (e.rating) s += cand.card.rating === e.rating ? 25 : -4 * Math.abs((cand.card.rating ?? 0) - e.rating);
  const v = normalize(cand.version ?? "");
  if (e.version) {
    const want = normalize(e.version);
    const icon = /\bicon\b/.test(want) && cand.card.is_icon, hero = /\bhero\b/.test(want) && cand.card.is_hero;
    s += icon || hero || (want && v && (v.includes(want) || want.includes(v))) ? 15 : -5;
  } else if (BASE.has(v)) s += 3;
  if (cand.card.owned) s += 20;
  if (e.position && cand.card.positions.includes(e.position)) s += 8;
  return s;
}

/** A pattern for ilike that ignores accents: vowels and letters that often carry one become "_". */
function likePattern(name: string): string | null {
  const tokens = normalize(name).split(" ").filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  const t = tokens.sort((a, b) => b.length - a.length)[0];
  return t ? `%${t.replace(/[aeiouycnszgl]/g, "_")}%` : null;
}

const catalogueCard = (r: Row): Candidate => ({
  key: String(r.source_card_key ?? r.id),
  version: (r.version as string) ?? null,
  card: {
    id: String(r.id), name: String(r.player_name), club: (r.club as string) ?? null, league: (r.league as string) ?? null,
    nation: (r.nation as string) ?? null, positions: (r.positions as string[]) ?? [], is_icon: r.is_icon === true, is_hero: r.is_hero === true,
    rating: Number(r.overall), price: (r.price as number) ?? null, owned: false, stats: {}, source: "database",
  },
});

/** Each line's best cards: the user's own cards (owned ones first) and the FUT.GG market card list. */
export async function matchEntries(db: FutDb, userId: string, entries: ImportEntry[]): Promise<{ entry: ImportEntry; options: MatchOption[] }[]> {
  const mine: Candidate[] = (await searchMyCards(db, userId, { all: true })).map((c: Card) => ({ card: toWorkspaceCard(c), version: c.version, key: c.ea_item_id ? String(c.ea_item_id) : c.id }));
  const out: { entry: ImportEntry; options: MatchOption[] }[] = [];
  const looked = new Map<string, Candidate[]>();
  for (const entry of entries) {
    const pattern = likePattern(entry.name);
    let market: Candidate[] = [];
    if (pattern) {
      if (!looked.has(pattern)) {
        const { data, error } = await db.from("player_cards")
          .select("id,player_name,version,overall,positions,club,league,nation,is_icon,is_hero,source_card_key,price")
          .is("owner_user_id", null).eq("source_id", "futgg_catalogue").ilike("player_name", pattern)
          .order("overall", { ascending: false }).limit(200);
        if (error) throw new FutError(`Card list is unavailable: ${error.message}`, 500);
        looked.set(pattern, ((data ?? []) as Row[]).map(catalogueCard));
      }
      market = looked.get(pattern)!;
    }
    // A market card the user already has as their own card (same EA item) shows once, as theirs.
    const ownKeys = new Set(mine.map((c) => c.key));
    const pool = [...mine, ...market.filter((c) => !ownKeys.has(c.key))];
    const options = pool.map((c) => ({ card: c.card, version: c.version, score: score(entry, c) }))
      .filter((o) => o.score > 0).sort((a, b) => b.score - a.score || (b.card.rating ?? 0) - (a.card.rating ?? 0)).slice(0, 6);
    out.push({ entry, options });
  }
  return out;
}

function confidence(options: MatchOption[]): Confidence | "missing" {
  const [a, b] = options;
  if (!a) return "missing";
  if (a.score >= 110 && (!b || a.score - b.score >= 10)) return "sure";
  if (a.score >= 85 && (!b || a.score - b.score >= 5)) return "likely";
  return "check";
}

// ---------------------------------------------------------------- placing the matches into the squad

/** Put matched cards into slots: the slot or position the user gave, then a slot the card plays, then any empty slot. */
export function placeMatches(start: Squad, parsed: ParsedSquad, matches: { entry: ImportEntry; options: MatchOption[] }[]): ImportResult {
  let squad = start;
  let formation_changed: string | null = null;
  if (parsed.formation && FORMATIONS[parsed.formation] && parsed.formation !== squad.formation) {
    squad = setFormation(squad, parsed.formation);
    formation_changed = parsed.formation;
  }
  const slots = squad.slots.map((s) => ({ ...s }));
  const cleared: string[] = [];
  for (const name of parsed.clear_slots ?? []) {
    const s = slots.find((x) => x.slot === name);
    if (s?.card) { s.card = null; s.locked = false; cleared.push(s.slot); }
  }
  const full = matches.length >= 11;
  const taken = new Set<string>(); // slots this import filled
  const rows: ImportRow[] = matches.map(({ entry, options }) => {
    const best = options[0];
    return { input: entry, slot: null, card: best?.card ?? null, version: best?.version ?? null, confidence: confidence(options), options };
  });
  const free = (s: typeof slots[number], explicit: boolean) => !taken.has(s.slot) && (explicit || !s.locked);
  const put = (row: ImportRow, s: typeof slots[number]) => { row.slot = s.slot; taken.add(s.slot); };

  const usedNames = new Set<string>();
  for (const row of rows) {
    if (!row.card) { row.reason = "No card with that name in your club or the market card list."; continue; }
    const n = normalize(row.card.name);
    if (usedNames.has(n)) { row.reason = "This player is already in the import."; row.card = null; row.confidence = "missing"; continue; }
    usedNames.add(n);
  }
  const live = rows.filter((r) => r.card);
  // 1. the exact slot the user named (LCB, RST)
  for (const row of live) {
    const s = row.input.slot ? slots.find((x) => x.slot === row.input.slot && free(x, true)) : undefined;
    if (s) put(row, s);
  }
  // 2. a slot asking for the position the user gave
  for (const row of live.filter((r) => !r.slot && r.input.position)) {
    const s = slots.find((x) => x.position === row.input.position && free(x, false) && (full || !x.card)) ?? slots.find((x) => x.position === row.input.position && free(x, false));
    if (s) put(row, s);
  }
  // 3. a slot the card itself plays, empty slots first
  for (const row of live.filter((r) => !r.slot)) {
    const plays = (x: typeof slots[number]) => row.card!.positions.includes(x.position) && free(x, false);
    const s = slots.find((x) => plays(x) && !x.card) ?? (full ? slots.find(plays) : undefined);
    if (s) put(row, s);
  }
  // 4. a full squad fills whatever is left (out of position); a chat message only uses empty slots
  for (const row of live.filter((r) => !r.slot)) {
    const s = slots.find((x) => free(x, false) && (full || !x.card));
    if (s) put(row, s);
    else row.reason = "No free slot for this player. Name the slot (e.g. \"RW Saka\") to replace someone.";
  }
  for (const row of live) {
    if (!row.slot) continue;
    const target = slots.find((x) => x.slot === row.slot)!;
    // The same player already elsewhere in the squad moves rather than appearing twice.
    for (const other of slots) if (other !== target && !taken.has(other.slot) && other.card && normalize(other.card.name) === normalize(row.card!.name)) { other.card = null; other.locked = false; }
    target.card = row.card;
  }
  return { squad: { ...squad, slots, updated_at: new Date().toISOString() }, rows, formation_changed, cleared, via: parsed.via, note: parsed.note ?? null };
}

/** Read, match and place: the whole import for one chat message or upload. */
export async function importSquad(
  db: FutDb, userId: string, squad: Squad,
  input: { text?: string | null; image?: ImportImage | null },
  env: (k: string) => string | undefined, fetchFn: typeof fetch = fetch,
  hooks: { beforeAi?: () => void } = {},
): Promise<ImportResult> {
  const text = input.text?.trim() ?? "";
  if (text.length > MAX_IMPORT_TEXT) throw new FutError(`Keep it under ${MAX_IMPORT_TEXT} characters.`);
  if (!text && !input.image) throw new FutError("Type your squad or upload a screenshot or list.");
  let parsed = input.image ? null : parseSquadList(text);
  if (!parsed) {
    hooks.beforeAi?.();
    parsed = await readWithClaude(squad, { text, image: input.image }, env, fetchFn);
  }
  if (!parsed.entries.length && !parsed.formation && !parsed.clear_slots?.length) {
    throw new FutError(parsed.note || "No players found in that. Try a list like \"ST Mbappe 91\", one player per line.", 422);
  }
  const matches = await matchEntries(db, userId, parsed.entries);
  return placeMatches(squad, parsed, matches);
}
