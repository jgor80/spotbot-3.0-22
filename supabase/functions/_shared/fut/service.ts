// XI Lab (FUT) services: the one implementation behind both the fut-api function (website) and the MCP FUT
// tools, so a squad's chemistry is the same number wherever it is asked for. Every function takes the
// caller's auth user id and only ever reads or writes that user's rows (plus catalogue/reference rows).
// Squads, chemistry, the Chemistry Surgeon and the optimizer are XI Lab's squad workspace service
// (./xilab, copied from jgor80/11-lab by scripts/sync-xilab.mjs); this file adds the cards, managers and the
// Postgres `fut` storage adapters it runs on. No link maths happens here.
import { RulesError, SquadInputError, type ChemistryRules } from "./xilab/chemistry/index.ts";
import {
  createWorkspaceService, filterCards, NotFoundError,
  type CardQuery, type CardSource, type Manager, type Squad, type SquadStore, type WorkspaceCard,
} from "./xilab/workspace/index.ts";

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

/** A database failure: never shown to the user as is. */
export class FutDbError extends Error {}
const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
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
  /** Coins to buy it (a target card), as the user last saw it. */
  price: number | null;
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
  const paid = b.purchase_price;
  const price = b.price;
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
    purchase_price: paid === undefined || paid === null ? null : rating(paid, "purchase_price", 0, 100_000_000),
    price: price === undefined || price === null ? null : rating(price, "price", 0, 100_000_000),
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
  price: number | null;
  /** EA's item id when the card's source key is one (cards from EA's feed). Lets Web App price captures find it. */
  ea_item_id: number | null;
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
      price: (r.price as number) ?? null,
      ea_item_id: /^\d{1,10}$/.test(String(r.source_card_key ?? "")) ? Number(r.source_card_key) : null,
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

export interface CardSearch { q?: string; position?: string; min_overall?: number; owned_only?: boolean; limit?: number; /** internal: every card, no page cap */ all?: boolean }

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
  return s.all ? cards : cards.slice(0, Math.min(100, Math.max(1, s.limit ?? 25)));
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
  evidence: c.evidence, notes: c.notes, price: c.price,
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

// ---------------------------------------------------------------- managers

export interface ManagerInput { name: string; nation: string | null; league: string | null; price: number | null; owned: boolean }

export function parseManagerInput(body: unknown): ManagerInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FutError("Send the manager as a JSON object.");
  const b = body as Record<string, unknown>;
  const nation = text(b.nation, "nation", 60);
  const league = text(b.league, "league", 60);
  if (!nation && !league) throw new FutError("A manager needs a nation or a league (that is all chemistry uses).");
  return {
    name: text(b.name, "name", 60, true)!, nation, league, owned: b.owned !== false,
    price: b.price === undefined || b.price === null ? null : rating(b.price, "price", 0, 100_000_000),
  };
}

const toManager = (r: Row): Manager => ({
  id: r.id as string, name: r.name as string, nation: (r.nation as string) ?? null, league: (r.league as string) ?? null,
  price: (r.price as number) ?? null, owned: r.owned === true, source: "user",
});

export async function listManagers(db: FutDb, userId: string): Promise<Manager[]> {
  const { data, error } = await db.from("user_managers").select("*").eq("user_id", userId).order("name", { ascending: true }).limit(100);
  fail(error);
  return ((data ?? []) as Row[]).map(toManager);
}

export async function addManager(db: FutDb, userId: string, m: ManagerInput): Promise<Manager> {
  const { count, error } = await db.from("user_managers").select("id", { count: "exact", head: true }).eq("user_id", userId);
  fail(error);
  if ((count ?? 0) >= 100) throw new FutError("You can keep up to 100 managers.");
  const ins = await db.from("user_managers").insert({ ...m, user_id: userId }).select("*").single();
  fail(ins.error);
  return toManager(ins.data);
}

export async function deleteManager(db: FutDb, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await db.from("user_managers").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  fail(error);
  if (!data) return false;
  fail((await db.from("user_managers").delete().eq("id", id).eq("user_id", userId)).error);
  return true;
}

// ---------------------------------------------------------------- rules

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

// ---------------------------------------------------------------- the workspace's storage, on the fut schema

/** A stored card as the workspace places it. Owned cards cost nothing; a target's price is what the user entered. */
export const toWorkspaceCard = (c: Card): WorkspaceCard => ({
  id: c.id, name: c.player_name, club: c.club, league: c.league, nation: c.nation, positions: c.positions,
  is_icon: c.is_icon, is_hero: c.is_hero, rating: c.overall, price: c.owned ? 0 : c.price, owned: c.owned,
  stats: c.stats, source: c.source === "user_entered" ? "user" : "database",
});

/** The caller's own cards and managers, the optimizer's candidate pool. */
export class PgCardSource implements CardSource {
  constructor(private db: FutDb) {}
  async search(owner: string, q: CardQuery): Promise<WorkspaceCard[]> {
    const mine = await searchMyCards(this.db, owner, { limit: MAX_CARDS_PER_USER, all: true });
    return filterCards(mine.map(toWorkspaceCard), q);
  }
  managers(owner: string): Promise<Manager[]> {
    return listManagers(this.db, owner);
  }
}

/** Saved squads in fut.squads / fut.squad_slots, always scoped to the owner. */
export class PgSquadStore implements SquadStore {
  constructor(private db: FutDb) {}

  private async load(owner: string, rows: Row[]): Promise<Squad[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id as string);
    const slots = await this.db.from("squad_slots").select("*").in("squad_id", ids).order("sort_order", { ascending: true });
    fail(slots.error);
    const slotRows = (slots.data ?? []) as Row[];
    // Stored cards are read fresh (edits show up); a card that's gone or not the owner's falls back to the saved copy.
    const cardIds = [...new Set(slotRows.map((s) => s.card_id).filter(isUuid))];
    const fresh = new Map<string, WorkspaceCard>();
    if (cardIds.length) {
      const { data, error } = await this.db.from("player_cards").select("*").in("id", cardIds);
      fail(error);
      const visible = ((data ?? []) as Row[]).filter((r) => r.owner_user_id === null || r.owner_user_id === owner);
      for (const c of await hydrate(this.db, owner, visible)) fresh.set(c.id, toWorkspaceCard(c));
    }
    return rows.map((r) => ({
      id: r.id as string,
      owner_id: owner,
      name: r.name as string,
      formation: r.formation as string,
      ...(r.platform ? { platform: r.platform as string } : {}),
      manager: (r.manager as Manager) ?? null,
      budget: Number(r.budget ?? 0),
      parent_id: (r.parent_id as string) ?? null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      slots: slotRows.filter((s) => s.squad_id === r.id).map((s) => ({
        slot: s.slot as string,
        position: s.position_code as string,
        card: (isUuid(s.card_id) && fresh.get(s.card_id)) || ((s.card as WorkspaceCard) ?? null),
        locked: s.locked === true,
      })),
    }));
  }

  async list(owner: string): Promise<Squad[]> {
    const { data, error } = await this.db.from("squads").select("*").eq("user_id", owner)
      .order("updated_at", { ascending: false }).limit(MAX_SQUADS_PER_USER);
    fail(error);
    return this.load(owner, (data ?? []) as Row[]);
  }

  async get(owner: string, id: string): Promise<Squad | null> {
    const { data, error } = await this.db.from("squads").select("*").eq("id", id).eq("user_id", owner).maybeSingle();
    fail(error);
    return data ? (await this.load(owner, [data]))[0]! : null;
  }

  async save(squad: Squad): Promise<Squad> {
    const owner = squad.owner_id;
    for (const s of squad.slots) {
      if (!/^[A-Z]{2,4}$/.test(s.position.trim().toUpperCase())) throw new FutError(`"${s.position}" is not a position code (e.g. ST, CAM, LB).`);
    }
    if (new Set(squad.slots.map((s) => s.slot.trim().toUpperCase())).size !== squad.slots.length) throw new FutError("Each slot name can only appear once.");
    const { data: existing, error } = await this.db.from("squads").select("id, user_id").eq("id", squad.id).maybeSingle();
    fail(error);
    // Someone else's id answers exactly like a missing squad.
    if (existing && existing.user_id !== owner) throw new NotFoundError(`No squad ${squad.id}`);
    const parent = squad.parent_id && squad.parent_id !== squad.id && (await this.get(owner, squad.parent_id)) ? squad.parent_id : null;
    const row = {
      name: squad.name, formation: squad.formation, platform: squad.platform ?? null, manager: squad.manager ?? null,
      budget: squad.budget, parent_id: parent, updated_at: squad.updated_at,
    };
    if (existing) {
      fail((await this.db.from("squads").update(row).eq("id", squad.id).eq("user_id", owner)).error);
      fail((await this.db.from("squad_slots").delete().eq("squad_id", squad.id)).error);
    } else {
      const { count, error: e } = await this.db.from("squads").select("id", { count: "exact", head: true }).eq("user_id", owner);
      fail(e);
      if ((count ?? 0) >= MAX_SQUADS_PER_USER) throw new FutError(`You can keep up to ${MAX_SQUADS_PER_USER} squads. Delete one first.`);
      await ensureAccount(this.db, owner);
      fail((await this.db.from("squads").insert({ ...row, id: squad.id, user_id: owner, created_at: squad.created_at })).error);
    }
    const slots = [];
    for (const [i, s] of squad.slots.entries()) {
      // Link the stored card only when it really is the owner's (or a catalogue card); otherwise keep just the copy.
      const linked = s.card && isUuid(s.card.id) && (await getCard(this.db, owner, s.card.id)) ? s.card.id : null;
      slots.push({
        squad_id: squad.id, slot: s.slot.trim().toUpperCase(), position_code: s.position.trim().toUpperCase(), card_id: linked,
        card: s.card ?? null, locked: s.locked === true, sort_order: i,
      });
    }
    if (slots.length) fail((await this.db.from("squad_slots").insert(slots)).error);
    return (await this.get(owner, squad.id))!;
  }

  async delete(owner: string, id: string): Promise<void> {
    fail((await this.db.from("squads").delete().eq("id", id).eq("user_id", owner)).error);
  }
}

/** Deletes one of the caller's squads; false when there is no such squad of theirs. */
export async function deleteSquad(db: FutDb, userId: string, id: string): Promise<boolean> {
  const store = new PgSquadStore(db);
  if (!(await store.get(userId, id))) return false;
  await store.delete(userId, id);
  return true;
}

/** The squad an AI means when it names none: the one the player edited most recently. */
export async function latestSquadId(db: FutDb, userId: string): Promise<string | null> {
  const { data, error } = await db.from("squads").select("id").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1);
  fail(error);
  return ((data ?? []) as Row[])[0]?.id as string ?? null;
}

/** XI Lab's squad workspace (builder, Chemistry Surgeon, optimizer) on the caller's data and the active rules. */
export async function workspaceFor(db: FutDb) {
  return createWorkspaceService({ rules: await activeRules(db), store: new PgSquadStore(db), cards: new PgCardSource(db) });
}

/**
 * Runs a workspace call and turns its errors into ones the user or AI can act on. The workspace is pure code,
 * so anything it throws is about the request (unknown slot, formation, bad squad JSON); database failures and
 * our own bugs stay 500s.
 */
export async function runWorkspace<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FutError || e instanceof FutDbError) throw e;
    if (e instanceof NotFoundError) throw new FutError("Squad not found.", 404);
    if (e instanceof RulesError) throw new FutError(`The chemistry rules are incomplete: ${e.message}`, 503);
    if (e instanceof SquadInputError) throw new FutError(e.message);
    if (e && typeof e === "object" && (e as { name?: string }).name === "ZodError") {
      const issues = ((e as { issues?: { path: (string | number)[]; message: string }[] }).issues ?? []).slice(0, 5);
      throw new FutError(`The squad isn't valid: ${issues.map((i) => `${i.path.join(".") || "squad"}: ${i.message}`).join("; ")}`);
    }
    if (e instanceof Error && !(e instanceof TypeError) && !(e instanceof RangeError) && !(e instanceof ReferenceError)) {
      throw new FutError(e.message);
    }
    throw e;
  }
}

/** Every optimizer run is kept with the engine and rule versions that produced it, so a result can be audited later. */
export async function logRun(db: FutDb, userId: string, run: {
  squad: unknown; kind: "optimize" | "chemistry" | "swap_preview"; input: unknown; result: { engine_version?: string; rule_version?: string }; via: "web" | "mcp";
}) {
  const squadId = typeof run.squad === "string" ? run.squad : null;
  const { error } = await db.from("optimization_runs").insert({
    user_id: userId, squad_id: squadId, kind: run.kind, engine_version: run.result.engine_version ?? "unknown",
    rule_version_id: run.result.rule_version ?? null, input: run.input, result: run.result, via: run.via,
  });
  // Auditing must never cost the user their answer.
  if (error) console.error("[fut] could not log run:", error.message);
}
