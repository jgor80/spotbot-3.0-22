// XI Lab (FUT) services: the one implementation behind both the fut-api function (website) and the MCP FUT
// tools, so a squad's chemistry is the same number wherever it is asked for. Every function takes the
// caller's auth user id and only ever reads or writes that user's rows (plus catalogue/reference rows).
// Chemistry comes from XI Lab's engine (./xilab, copied by scripts/sync-xilab.mjs), never from estimates.
import {
  computeSquadChemistry, diffSquadChemistry, RulesError, SquadInputError,
  type ChemistryRules, type SquadCard, type SquadInput,
} from "./xilab/chemistry/index.ts";

// deno-lint-ignore no-explicit-any
export type FutDb = any;

/** The service-role client scoped to the `fut` schema. */
// deno-lint-ignore no-explicit-any
export const futDb = (admin: any): FutDb => admin.schema("fut");

/** The whole FUT side (website API, MCP tools) is off unless FUT_ENABLED=true. */
export const futEnabled = (env: (k: string) => string | undefined = (k) => Deno.env.get(k)) => env("FUT_ENABLED") === "true";

/** A problem the caller can fix (bad input, not found): shown to the user or the AI as is. */
export class FutError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export const MAX_CARDS_PER_USER = 300;
export const MAX_SQUADS_PER_USER = 50;
const FACE = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
type Face = (typeof FACE)[number];
const POSITION = /^[A-Z]{2,3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_EVIDENCE = ["game_data", "estimate", "hypothesis"] as const;
export type Evidence = "verified" | "game_data" | "estimate" | "hypothesis";

const fail = (error: { message?: string } | null) => {
  if (error) throw new Error(`fut db: ${error.message ?? "error"}`);
};

// ---------------------------------------------------------------- input checks

function text(v: unknown, field: string, max: number, required = false): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new FutError(`${field} is required.`);
    return null;
  }
  if (typeof v !== "string") throw new FutError(`${field} must be text.`);
  const s = v.trim().replace(/\s+/g, " ");
  if (!s && required) throw new FutError(`${field} is required.`);
  if (s.length > max) throw new FutError(`${field} must be at most ${max} characters.`);
  return s || null;
}

function rating(v: unknown, field: string, min = 1, max = 99): number {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new FutError(`${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

function list(v: unknown, field: string, maxItems: number, maxLen = 40): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new FutError(`${field} must be a list.`);
  if (v.length > maxItems) throw new FutError(`${field} can have at most ${maxItems} entries.`);
  return [...new Set(v.map((x, i) => text(x, `${field}[${i}]`, maxLen, true)!))];
}

function positionCode(v: unknown, field: string): string {
  const p = text(v, field, 3, true)!.toUpperCase();
  if (!POSITION.test(p)) throw new FutError(`"${p}" is not a position code (e.g. ST, CAM, LB).`);
  return p;
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export interface CardInput {
  player_name: string;
  version: string | null;
  overall: number;
  positions: string[];
  club: string | null;
  league: string | null;
  nation: string | null;
  is_icon: boolean;
  is_hero: boolean;
  skill_moves: number | null;
  weak_foot: number | null;
  stats: Partial<Record<Face, number>>;
  playstyles: string[];
  playstyles_plus: string[];
  evidence: (typeof USER_EVIDENCE)[number];
  notes: string | null;
  owned: boolean;
  tradeable: boolean | null;
  purchase_price: number | null;
}

export function parseCardInput(body: unknown): CardInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FutError("Send the card as a JSON object.");
  const b = body as Record<string, unknown>;
  const positions = list(b.positions, "positions", 5, 3).map((p, i) => positionCode(p, `positions[${i}]`));
  if (!positions.length) throw new FutError('positions needs at least one position code, primary first (e.g. ["CB", "RB"]).');
  const raw = b.stats ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new FutError('stats must be an object like { "pac": 90 }.');
  const stats: CardInput["stats"] = {};
  for (const k of FACE) {
    const v = (raw as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== "") stats[k] = rating(v, `stats.${k}`);
  }
  const evidence = b.evidence ?? "estimate";
  if (!USER_EVIDENCE.includes(evidence as CardInput["evidence"])) {
    throw new FutError(`evidence must be one of ${USER_EVIDENCE.join(", ")} (game_data means copied from the game screen).`);
  }
  const plus = list(b.playstyles_plus, "playstyles_plus", 3);
  const price = b.purchase_price;
  return {
    player_name: text(b.player_name ?? b.name, "player_name", 60, true)!,
    version: text(b.version, "version", 40),
    overall: rating(b.overall, "overall"),
    positions,
    club: text(b.club, "club", 60),
    league: text(b.league, "league", 60),
    nation: text(b.nation, "nation", 60),
    is_icon: b.is_icon === true,
    is_hero: b.is_hero === true,
    skill_moves: b.skill_moves === undefined || b.skill_moves === null ? null : rating(b.skill_moves, "skill_moves", 1, 5),
    weak_foot: b.weak_foot === undefined || b.weak_foot === null ? null : rating(b.weak_foot, "weak_foot", 1, 5),
    stats,
    playstyles: list(b.playstyles, "playstyles", 12).filter((p) => !plus.includes(p)),
    playstyles_plus: plus,
    evidence: evidence as CardInput["evidence"],
    notes: text(b.notes, "notes", 280),
    owned: b.owned !== false,
    tradeable: typeof b.tradeable === "boolean" ? b.tradeable : null,
    purchase_price: price === undefined || price === null ? null : rating(price, "purchase_price", 0, 100_000_000),
  };
}

// ---------------------------------------------------------------- cards

export interface Card {
  id: string;
  source: "user_entered" | string;
  player_name: string;
  version: string | null;
  overall: number;
  positions: string[];
  club: string | null;
  league: string | null;
  nation: string | null;
  is_icon: boolean;
  is_hero: boolean;
  skill_moves: number | null;
  weak_foot: number | null;
  stats: Partial<Record<Face, number>>;
  playstyles: string[];
  playstyles_plus: string[];
  evidence: Evidence;
  notes: string | null;
  owned: boolean;
  tradeable: boolean | null;
  purchase_price: number | null;
  updated_at: string;
}

type Row = Record<string, unknown>;

async function hydrate(db: FutDb, userId: string, rows: Row[]): Promise<Card[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const [attrs, styles, inv] = await Promise.all([
    db.from("card_attributes").select("*").in("card_id", ids),
    db.from("card_playstyles").select("*").in("card_id", ids),
    db.from("club_inventory").select("*").eq("user_id", userId).in("card_id", ids),
  ]);
  fail(attrs.error); fail(styles.error); fail(inv.error);
  const attrBy = new Map(((attrs.data ?? []) as Row[]).map((a) => [a.card_id, a]));
  const invBy = new Map(((inv.data ?? []) as Row[]).map((i) => [i.card_id, i]));
  return rows.map((r) => {
    const a = attrBy.get(r.id) ?? {};
    const stats: Card["stats"] = {};
    for (const k of FACE) if (a[k] !== null && a[k] !== undefined) stats[k] = Number(a[k]);
    const mine = ((styles.data ?? []) as Row[]).filter((s) => s.card_id === r.id);
    const owned = invBy.get(r.id);
    return {
      id: r.id as string,
      source: r.source_id as string,
      player_name: r.player_name as string,
      version: (r.version as string) ?? null,
      overall: Number(r.overall),
      positions: r.positions as string[],
      club: (r.club as string) ?? null,
      league: (r.league as string) ?? null,
      nation: (r.nation as string) ?? null,
      is_icon: r.is_icon === true,
      is_hero: r.is_hero === true,
      skill_moves: (r.skill_moves as number) ?? null,
      weak_foot: (r.weak_foot as number) ?? null,
      stats,
      playstyles: mine.filter((s) => !s.is_plus).map((s) => s.name as string),
      playstyles_plus: mine.filter((s) => s.is_plus).map((s) => s.name as string),
      evidence: r.evidence as Evidence,
      notes: (r.notes as string) ?? null,
      owned: !!owned,
      tradeable: (owned?.tradeable as boolean) ?? null,
      purchase_price: (owned?.purchase_price as number) ?? null,
      updated_at: r.updated_at as string,
    };
  });
}

/** One of the caller's own cards or a catalogue card; null if it doesn't exist or belongs to someone else. */
export async function getCard(db: FutDb, userId: string, id: string): Promise<Card | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from("player_cards").select("*").eq("id", id).maybeSingle();
  fail(error);
  if (!data || (data.owner_user_id !== null && data.owner_user_id !== userId)) return null;
  return (await hydrate(db, userId, [data]))[0]!;
}

export interface CardSearch { q?: string; position?: string; min_overall?: number; owned_only?: boolean; limit?: number }

/** The caller's own cards (catalogue search arrives when a licensed catalogue exists). */
export async function searchMyCards(db: FutDb, userId: string, s: CardSearch = {}): Promise<Card[]> {
  const { data, error } = await db.from("player_cards").select("*").eq("owner_user_id", userId)
    .order("overall", { ascending: false }).limit(MAX_CARDS_PER_USER);
  fail(error);
  const q = s.q?.trim().toLowerCase();
  const pos = s.position ? positionCode(s.position, "position") : undefined;
  const rows = ((data ?? []) as Row[]).filter((r) =>
    (!q || [r.player_name, r.club, r.league, r.nation, r.version].some((v) => typeof v === "string" && v.toLowerCase().includes(q))) &&
    (!pos || (r.positions as string[]).includes(pos)) &&
    (s.min_overall === undefined || Number(r.overall) >= s.min_overall));
  let cards = await hydrate(db, userId, rows);
  if (s.owned_only) cards = cards.filter((c) => c.owned);
  return cards.slice(0, Math.min(100, Math.max(1, s.limit ?? 25)));
}

async function writeCardDetails(db: FutDb, userId: string, cardId: string, c: CardInput) {
  for (const t of ["card_attributes", "card_playstyles"]) fail((await db.from(t).delete().eq("card_id", cardId)).error);
  fail((await db.from("card_attributes").insert({ card_id: cardId, ...c.stats })).error);
  const styles = [...c.playstyles.map((name) => ({ card_id: cardId, name, is_plus: false })),
    ...c.playstyles_plus.map((name) => ({ card_id: cardId, name, is_plus: true }))];
  if (styles.length) fail((await db.from("card_playstyles").insert(styles)).error);
  fail((await db.from("club_inventory").delete().eq("user_id", userId).eq("card_id", cardId)).error);
  if (c.owned) {
    fail((await db.from("club_inventory").insert({ user_id: userId, card_id: cardId, tradeable: c.tradeable, purchase_price: c.purchase_price })).error);
  }
}

const cardRow = (c: CardInput) => ({
  player_name: c.player_name, version: c.version, overall: c.overall, positions: c.positions, club: c.club, league: c.league,
  nation: c.nation, is_icon: c.is_icon, is_hero: c.is_hero, skill_moves: c.skill_moves, weak_foot: c.weak_foot,
  evidence: c.evidence, notes: c.notes,
});

export async function ensureAccount(db: FutDb, userId: string) {
  const { data, error } = await db.from("accounts").select("user_id").eq("user_id", userId).maybeSingle();
  fail(error);
  if (!data) fail((await db.from("accounts").insert({ user_id: userId })).error);
}

export async function addCard(db: FutDb, userId: string, c: CardInput): Promise<Card> {
  const { count, error } = await db.from("player_cards").select("id", { count: "exact", head: true }).eq("owner_user_id", userId);
  fail(error);
  if ((count ?? 0) >= MAX_CARDS_PER_USER) throw new FutError(`You can keep up to ${MAX_CARDS_PER_USER} cards. Delete some before adding more.`);
  await ensureAccount(db, userId);
  const ins = await db.from("player_cards").insert({ ...cardRow(c), owner_user_id: userId, source_id: "user_entered" }).select("*").single();
  fail(ins.error);
  await writeCardDetails(db, userId, ins.data.id, c);
  return (await getCard(db, userId, ins.data.id))!;
}

async function ownCardRow(db: FutDb, userId: string, id: string): Promise<Row | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from("player_cards").select("*").eq("id", id).eq("owner_user_id", userId).maybeSingle();
  fail(error);
  return data ?? null;
}

export async function updateCard(db: FutDb, userId: string, id: string, c: CardInput): Promise<Card | null> {
  if (!(await ownCardRow(db, userId, id))) return null;
  fail((await db.from("player_cards").update({ ...cardRow(c), updated_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", userId)).error);
  await writeCardDetails(db, userId, id, c);
  return getCard(db, userId, id);
}

export async function deleteCard(db: FutDb, userId: string, id: string): Promise<boolean> {
  if (!(await ownCardRow(db, userId, id))) return false;
  fail((await db.from("player_cards").delete().eq("id", id).eq("owner_user_id", userId)).error);
  return true;
}

// Weakest first: a result is only as trustworthy as the least trustworthy input in it.
const TRUST: Evidence[] = ["hypothesis", "estimate", "game_data", "verified"];
export const weakestEvidence = (labels: Evidence[]): Evidence =>
  labels.reduce((w, e) => (TRUST.indexOf(e) < TRUST.indexOf(w) ? e : w), "verified" as Evidence);

/** Side-by-side numbers for 2 to 4 cards. Arithmetic only: who has the higher number, not who plays better. */
export async function compareCards(db: FutDb, userId: string, ids: unknown) {
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4) throw new FutError("card_ids must list 2 to 4 card ids.");
  const cards: Card[] = [];
  for (const id of [...new Set(ids.map(String))]) {
    const c = await getCard(db, userId, id);
    if (!c) throw new FutError(`Card ${id} wasn't found among your cards.`, 404);
    cards.push(c);
  }
  if (cards.length < 2) throw new FutError("Pick at least two different cards.");
  const fields = ["overall", ...FACE] as const;
  const value = (c: Card, f: (typeof fields)[number]) => (f === "overall" ? c.overall : c.stats[f]);
  const leaders: Record<string, { best: number; card_ids: string[] } | null> = {};
  for (const f of fields) {
    const known = cards.filter((c) => value(c, f) !== undefined);
    if (known.length < 2) { leaders[f] = null; continue; }
    const best = Math.max(...known.map((c) => value(c, f)!));
    leaders[f] = { best, card_ids: known.filter((c) => value(c, f) === best).map((c) => c.id) };
  }
  const shared = (k: "club" | "league" | "nation") => {
    const v = cards[0]![k];
    return v !== null && cards.every((c) => c[k]?.toLowerCase() === v.toLowerCase()) ? v : null;
  };
  return {
    cards,
    leaders,
    shared_positions: cards.map((c) => c.positions).reduce((a, b) => a.filter((p) => b.includes(p))),
    shared: { club: shared("club"), league: shared("league"), nation: shared("nation") },
    evidence: weakestEvidence(cards.map((c) => c.evidence)),
    note: "Compares the numbers entered for each card. It shows who has the higher number, not who plays better in a match; missing numbers are left out, never guessed.",
  };
}

// ---------------------------------------------------------------- squads

export interface SlotInput { slot: string; position: string; card_id: string | null; locked: boolean; chemistry_style: string | null; role: string | null; focus: string | null }
export interface SquadSave { name: string; formation: string; manager_nation: string | null; manager_league: string | null; is_active: boolean; slots: SlotInput[]; based_on_squad_id: string | null }

export function parseSquadInput(body: unknown): SquadSave {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FutError("Send the squad as a JSON object.");
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.slots) || b.slots.length > 11) throw new FutError("slots must list up to 11 players.");
  const seen = new Set<string>();
  const slots = (b.slots as Record<string, unknown>[]).map((s, i) => {
    const slot = text(s?.slot, `slots[${i}].slot`, 8, true)!.toUpperCase();
    if (seen.has(slot)) throw new FutError(`Slot ${slot} is used twice.`);
    seen.add(slot);
    const cardId = s.card_id === undefined || s.card_id === null || s.card_id === "" ? null : String(s.card_id);
    if (cardId !== null && !isUuid(cardId)) throw new FutError(`slots[${i}].card_id must be a card id.`);
    return {
      slot, position: positionCode(s.position, `slots[${i}].position`), card_id: cardId, locked: s.locked === true,
      chemistry_style: text(s.chemistry_style, `slots[${i}].chemistry_style`, 30), role: text(s.role, `slots[${i}].role`, 40),
      focus: text(s.focus, `slots[${i}].focus`, 40),
    };
  });
  const m = (b.manager ?? {}) as Record<string, unknown>;
  const based = b.based_on_squad_id;
  return {
    name: text(b.name, "name", 60, true)!,
    formation: text(b.formation, "formation", 20, true)!,
    manager_nation: text(m.nation, "manager.nation", 60),
    manager_league: text(m.league, "manager.league", 60),
    is_active: b.is_active === true,
    slots,
    based_on_squad_id: isUuid(based) ? based : null,
  };
}

export interface Squad {
  id: string;
  name: string;
  formation: string;
  manager: { nation: string | null; league: string | null };
  is_active: boolean;
  based_on_squad_id: string | null;
  slots: (SlotInput & { card: Card | null })[];
  updated_at: string;
}

export async function listSquads(db: FutDb, userId: string) {
  const { data, error } = await db.from("squads").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(MAX_SQUADS_PER_USER);
  fail(error);
  return ((data ?? []) as Row[]).map((s) => ({ id: s.id, name: s.name, formation: s.formation, is_active: s.is_active === true, updated_at: s.updated_at }));
}

export async function getSquad(db: FutDb, userId: string, id: string): Promise<Squad | null> {
  if (!isUuid(id)) return null;
  const { data: s, error } = await db.from("squads").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  fail(error);
  if (!s) return null;
  const slots = await db.from("squad_slots").select("*").eq("squad_id", id).order("sort_order", { ascending: true });
  fail(slots.error);
  const rows = (slots.data ?? []) as Row[];
  const cards = new Map<string, Card>();
  for (const r of rows) {
    if (r.card_id && !cards.has(r.card_id as string)) {
      const c = await getCard(db, userId, r.card_id as string);
      if (c) cards.set(c.id, c);
    }
  }
  return {
    id: s.id, name: s.name, formation: s.formation, is_active: s.is_active === true, based_on_squad_id: s.based_on_squad_id ?? null,
    manager: { nation: s.manager_nation ?? null, league: s.manager_league ?? null }, updated_at: s.updated_at,
    slots: rows.map((r) => ({
      slot: r.slot as string, position: r.position_code as string, card_id: (r.card_id as string) ?? null, locked: r.locked === true,
      chemistry_style: (r.chemistry_style as string) ?? null, role: (r.role as string) ?? null, focus: (r.focus as string) ?? null,
      card: r.card_id ? cards.get(r.card_id as string) ?? null : null,
    })),
  };
}

/** The active squad, else the most recently changed one. */
export async function currentSquad(db: FutDb, userId: string): Promise<Squad | null> {
  const all = await listSquads(db, userId);
  const pick = all.find((s) => s.is_active) ?? all[0];
  return pick ? getSquad(db, userId, pick.id as string) : null;
}

async function checkSlotCards(db: FutDb, userId: string, slots: SlotInput[]) {
  const used = new Set<string>();
  for (const s of slots) {
    if (!s.card_id) continue;
    if (used.has(s.card_id)) throw new FutError(`The same card is in two slots (${s.slot}).`);
    used.add(s.card_id);
    if (!(await getCard(db, userId, s.card_id))) throw new FutError(`Slot ${s.slot}: that card wasn't found among your cards.`, 404);
  }
}

/** Creates a squad, or replaces one the caller owns (id given). Saving "as new" with based_on_squad_id never touches the original. */
export async function saveSquad(db: FutDb, userId: string, input: SquadSave, id?: string): Promise<Squad> {
  await checkSlotCards(db, userId, input.slots);
  const row = {
    name: input.name, formation: input.formation, manager_nation: input.manager_nation, manager_league: input.manager_league,
    is_active: input.is_active, updated_at: new Date().toISOString(),
  };
  if (input.is_active) fail((await db.from("squads").update({ is_active: false }).eq("user_id", userId).eq("is_active", true)).error);
  let squadId: string;
  if (id) {
    if (!(await getSquad(db, userId, id))) throw new FutError("Squad not found.", 404);
    fail((await db.from("squads").update(row).eq("id", id).eq("user_id", userId)).error);
    fail((await db.from("squad_slots").delete().eq("squad_id", id)).error);
    squadId = id;
  } else {
    const { count, error } = await db.from("squads").select("id", { count: "exact", head: true }).eq("user_id", userId);
    fail(error);
    if ((count ?? 0) >= MAX_SQUADS_PER_USER) throw new FutError(`You can keep up to ${MAX_SQUADS_PER_USER} squads.`);
    await ensureAccount(db, userId);
    const based = input.based_on_squad_id && (await getSquad(db, userId, input.based_on_squad_id)) ? input.based_on_squad_id : null;
    const ins = await db.from("squads").insert({ ...row, user_id: userId, based_on_squad_id: based }).select("*").single();
    fail(ins.error);
    squadId = ins.data.id;
  }
  if (input.slots.length) {
    fail((await db.from("squad_slots").insert(input.slots.map((s, i) => ({
      squad_id: squadId, slot: s.slot, position_code: s.position, card_id: s.card_id, locked: s.locked,
      chemistry_style: s.chemistry_style, role: s.role, focus: s.focus, sort_order: i,
    })))).error);
  }
  return (await getSquad(db, userId, squadId))!;
}

export async function deleteSquad(db: FutDb, userId: string, id: string): Promise<boolean> {
  if (!(await getSquad(db, userId, id))) return false;
  fail((await db.from("squads").delete().eq("id", id).eq("user_id", userId)).error);
  return true;
}

// ---------------------------------------------------------------- chemistry

/** The active chemistry rule version for a season, from the database (never from code). */
export async function activeRules(db: FutDb, season = "FC27"): Promise<ChemistryRules> {
  const { data: v, error } = await db.from("chemistry_rule_versions").select("*").eq("season", season).eq("is_active", true).maybeSingle();
  fail(error);
  if (!v) throw new FutError(`No chemistry rules are loaded for ${season} yet.`, 503);
  const [t, m] = await Promise.all([
    db.from("chemistry_thresholds").select("*").eq("rule_version_id", v.id).order("points", { ascending: true }),
    db.from("chemistry_modifiers").select("*").eq("rule_version_id", v.id),
  ]);
  fail(t.error); fail(m.error);
  const thresholds: ChemistryRules["thresholds"] = { club: [], league: [], nation: [] };
  for (const r of (t.data ?? []) as Row[]) thresholds[r.link_type as "club"].push(Number(r.players_required));
  const modifiers = Object.fromEntries(((m.data ?? []) as Row[]).map((r) => [r.key, Number(r.value)]));
  return { id: v.id, season: v.season, status: v.status, thresholds, modifiers };
}

const asSquadCard = (c: Card): SquadCard => ({
  id: c.id, name: c.player_name, club: c.club, league: c.league, nation: c.nation, positions: c.positions, is_icon: c.is_icon, is_hero: c.is_hero,
});

function engineInput(squad: Squad): SquadInput {
  return {
    formation: squad.formation,
    manager: { nation: squad.manager.nation ?? undefined, league: squad.manager.league ?? undefined },
    slots: squad.slots.filter((s) => s.card).map((s) => ({ slot: s.slot, position: s.position, card: asSquadCard(s.card!) })),
  };
}

export interface SwapInput { slot: string; card_id: string | null }

function parseSwaps(v: unknown): SwapInput[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 4) throw new FutError("swaps must list up to 4 { slot, card_id } changes (card_id null empties the slot).");
  return v.map((s, i) => {
    const slot = text((s as Row)?.slot, `swaps[${i}].slot`, 8, true)!.toUpperCase();
    const id = (s as Row).card_id;
    if (id !== null && !isUuid(id)) throw new FutError(`swaps[${i}].card_id must be one of your card ids, or null.`);
    return { slot, card_id: id as string | null };
  });
}

/**
 * Chemistry for one of the caller's squads (squad_id) or their current squad, with an optional set of up to four
 * simultaneous swaps. Every starter is recalculated after all swaps, so a swap that lifts one player but costs
 * others shows up as a net change.
 */
export async function squadChemistry(db: FutDb, userId: string, args: { squad_id?: unknown; swaps?: unknown }) {
  const squad = args.squad_id !== undefined && args.squad_id !== null && args.squad_id !== ""
    ? await getSquad(db, userId, String(args.squad_id))
    : await currentSquad(db, userId);
  if (!squad) throw new FutError(args.squad_id ? "Squad not found." : "You have no saved squads yet. Build one at gafferbot.app/fut first.", 404);
  const swaps = parseSwaps(args.swaps);
  const rules = await activeRules(db);
  const before = engineInput(squad);
  const evidenceOf = (cards: (Card | null)[]) => weakestEvidence(cards.filter((c): c is Card => !!c).map((c) => c.evidence));
  try {
    const result = computeSquadChemistry(before, rules);
    const base = {
      squad: { id: squad.id, name: squad.name, formation: squad.formation, empty_slots: squad.slots.filter((s) => !s.card).map((s) => s.slot) },
      chemistry: result,
      card_evidence: evidenceOf(squad.slots.map((s) => s.card)),
      rules_note: rules.status === "verified" ? null : `Chemistry rule version ${rules.id} is ${rules.status}: thresholds come from community guides, not confirmed by EA.`,
    };
    if (!swaps.length) return base;
    const slots = [...squad.slots];
    const swapped: (Card | null)[] = [];
    for (const sw of swaps) {
      const i = slots.findIndex((s) => s.slot === sw.slot);
      if (i < 0) throw new FutError(`There is no ${sw.slot} slot in ${squad.name}.`);
      if (slots[i]!.locked) throw new FutError(`${sw.slot} is locked. Unlock it before trying a swap there.`);
      const card = sw.card_id ? await getCard(db, userId, sw.card_id) : null;
      if (sw.card_id && !card) throw new FutError(`Card ${sw.card_id} wasn't found among your cards.`, 404);
      slots[i] = { ...slots[i]!, card_id: card?.id ?? null, card };
      swapped.push(card);
    }
    const ids = slots.filter((s) => s.card).map((s) => s.card!.id);
    if (new Set(ids).size !== ids.length) throw new FutError("A swap would put the same card in two slots.");
    const after = computeSquadChemistry(engineInput({ ...squad, slots }), rules);
    return {
      ...base,
      swaps,
      after: after,
      diff: diffSquadChemistry(result, after),
      card_evidence: evidenceOf([...squad.slots.map((s) => s.card), ...swapped]),
    };
  } catch (e) {
    if (e instanceof SquadInputError) throw new FutError(e.message);
    if (e instanceof RulesError) throw new FutError(`The chemistry rules are incomplete: ${e.message}`, 503);
    throw e;
  }
}
