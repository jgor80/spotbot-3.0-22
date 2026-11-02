// Club sync: imports the club file the XI Lab browser helper saves when the user opens their own club in the EA
// Web App (format "xilab-club-capture", jgor80/11-lab src/club/capture.ts). Nothing here talks to EA: the user
// uploads a file they made. Cards land as the user's own cards (source user_entered, evidence game_data, since
// they were copied from the game), keyed by EA's item id so a later sync updates them and Market Lab price
// captures find them.
//
// UNVERIFIED: the capture's EA field names have not been checked on FC 27 yet. Anything that doesn't fit is
// skipped and counted, never guessed. Names come only from the Web App's own name files; an id without one gets
// a stable placeholder ("EA club 243") so synced cards still link to each other for chemistry.
import { ensureAccount, FutDbError, FutError, MAX_CARDS_PER_USER, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};

export const MAX_CLUB_ITEMS = 5000;
const FACE = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
const POSITION = /^[A-Z]{2,3}$/;
const BATCH = 200;

export interface ClubImportResult {
  added: number;
  updated: number;
  managers_added: number;
  skipped: { reason: string; count: number }[];
  over_limit: number;
  verified: false;
  note: string;
}

interface Parsed {
  ea_item_id: number;
  asset_id: number | null;
  rating: number;
  positions: string[];
  team_id: number | null;
  league_id: number | null;
  nation_id: number | null;
  rare_flag: number | null;
  untradeable: boolean;
  stats: number[] | null;
  weak_foot: number | null;
}

const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2 ** 31 ? v : null);
const inRange = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n).trim() : s);

function nameMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (/^\d{1,10}$/.test(k) && typeof n === "string" && n.trim()) out[k] = clip(n.trim().replace(/\s+/g, " "));
  }
  return out;
}

/** Checks the file's shape; the caller gets a plain message for anything that isn't a club file. */
export function parseClubExport(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FutError("Send the club file from the XI Lab helper (a JSON object).");
  const b = body as Row;
  if (b.format !== "xilab-club-capture") throw new FutError('That isn\'t a club file. In the XI Lab helper, use "Download club file".');
  if (b.version !== 1) throw new FutError("This club file is from a newer helper. Update the site or the helper.");
  if (!Array.isArray(b.items)) throw new FutError("The club file has no items.");
  if (b.items.length > MAX_CLUB_ITEMS) throw new FutError(`A club file can hold at most ${MAX_CLUB_ITEMS} items.`);
  const names = (b.names && typeof b.names === "object" ? b.names : {}) as Row;
  return {
    items: b.items as unknown[],
    names: { players: nameMap(names.players), teams: nameMap(names.teams), leagues: nameMap(names.leagues), nations: nameMap(names.nations) },
  };
}

export async function importClub(db: FutDb, userId: string, body: unknown): Promise<ClubImportResult> {
  const { items, names } = parseClubExport(body);
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

  const players = new Map<number, Parsed>();
  const managers = new Map<string, { nation: string | null; league: string | null; name: string }>();
  const label = (map: Record<string, string>, id: number | null, kind: string) => (id === null ? null : map[String(id)] ?? `EA ${kind} ${id}`);

  for (const raw of items) {
    if (!raw || typeof raw !== "object") { skip("not an item"); continue; }
    const it = raw as Row;
    if (it.loan === true) { skip("loan item"); continue; }
    const ea_item_id = posInt(it.ea_item_id);
    if (!ea_item_id) { skip("no EA item id"); continue; }
    const nation_id = posInt(it.nation_id);
    const league_id = posInt(it.league_id);
    if (it.kind === "manager") {
      const nation = label(names.nations, nation_id, "nation");
      const league = label(names.leagues, league_id, "league");
      if (!nation && !league) { skip("manager without nation or league"); continue; }
      const key = `${nation ?? ""}|${league ?? ""}`;
      if (!managers.has(key)) managers.set(key, { nation, league, name: clip(`Manager (${[nation, league].filter(Boolean).join(", ")})`) });
      continue;
    }
    if (it.kind !== "player") { skip("not a player or manager"); continue; }
    const rating = inRange(it.rating, 1, 99);
    if (!rating) { skip("no rating"); continue; }
    const list = Array.isArray(it.positions) ? it.positions : [];
    const positions = [...new Set([it.position, ...list].filter((p): p is string => typeof p === "string" && POSITION.test(p)))].slice(0, 5);
    if (!positions.length) { skip("no position"); continue; }
    const stats = Array.isArray(it.stats) && it.stats.length === 6 && it.stats.every((s) => inRange(s, 1, 99) !== null) ? (it.stats as number[]) : null;
    const p: Parsed = {
      ea_item_id, asset_id: posInt(it.asset_id), rating, positions, team_id: posInt(it.team_id), league_id, nation_id,
      rare_flag: inRange(it.rare_flag, 0, 255), untradeable: it.untradeable === true, stats, weak_foot: inRange(it.weak_foot, 1, 5),
    };
    const had = players.get(ea_item_id);
    // Two copies of one card version: keep one card, untradeable if either copy is.
    if (had) { had.untradeable ||= p.untradeable; skip("duplicate copy"); continue; }
    players.set(ea_item_id, p);
  }

  await ensureAccount(db, userId);

  // The user's cards already synced from the club, by EA item id.
  const { data: mine, error } = await db.from("player_cards").select("id, source_card_key, is_hero, notes").eq("owner_user_id", userId);
  fail(error);
  const all = (mine ?? []) as Row[];
  const existing = new Map(all.filter((r) => /^\d{1,10}$/.test(String(r.source_card_key ?? ""))).map((r) => [Number(r.source_card_key), r]));
  let room = MAX_CARDS_PER_USER - all.length;

  // Highest rated first, so a club bigger than the limit keeps its best cards.
  const ordered = [...players.values()].sort((a, b) => b.rating - a.rating);
  const rows: Row[] = [];
  const attrs: Row[] = [];
  const inv: Row[] = [];
  let added = 0, updated = 0, over = 0;
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  for (const p of ordered) {
    const had = existing.get(p.ea_item_id);
    if (!had) {
      if (room <= 0) { over++; continue; }
      room--;
    }
    const id = (had?.id as string) ?? crypto.randomUUID();
    const league = label(names.leagues, p.league_id, "league");
    const isIcon = !!league && /^icons?$/i.test(league);
    rows.push({
      id, owner_user_id: userId, source_id: "user_entered", source_card_key: String(p.ea_item_id), evidence: "game_data",
      player_name: clip(label(names.players, p.asset_id ?? p.ea_item_id, "player")!),
      version: p.rare_flag === null ? null : p.rare_flag === 0 ? "Common" : p.rare_flag === 1 ? "Rare" : `Special (EA rareflag ${p.rare_flag})`,
      overall: p.rating, positions: p.positions,
      club: label(names.teams, p.team_id, "club"), league, nation: label(names.nations, p.nation_id, "nation"),
      is_icon: isIcon,
      // Heroes can't be told apart reliably from the capture: keep whatever the user set.
      is_hero: had ? had.is_hero === true : false,
      weak_foot: p.weak_foot,
      notes: had?.notes ?? `Synced from your EA Web App club on ${day} (format not yet verified on FC 27).`,
      source_updated_at: now, updated_at: now,
    });
    if (p.stats) attrs.push({ card_id: id, ...Object.fromEntries(FACE.map((k, i) => [k, p.stats![i]])) });
    inv.push({ user_id: userId, card_id: id, tradeable: !p.untradeable });
    if (had) updated++; else added++;
  }

  for (let i = 0; i < rows.length; i += BATCH) fail((await db.from("player_cards").upsert(rows.slice(i, i + BATCH), { onConflict: "id" })).error);
  for (let i = 0; i < attrs.length; i += BATCH) fail((await db.from("card_attributes").upsert(attrs.slice(i, i + BATCH), { onConflict: "card_id" })).error);
  for (let i = 0; i < inv.length; i += BATCH) fail((await db.from("club_inventory").upsert(inv.slice(i, i + BATCH), { onConflict: "user_id,card_id" })).error);

  // Managers: add the nation/league pairs the user doesn't have yet (chemistry only uses nation and league).
  let managers_added = 0;
  if (managers.size) {
    const { data: ms, error: me } = await db.from("user_managers").select("nation, league").eq("user_id", userId);
    fail(me);
    const have = new Set(((ms ?? []) as Row[]).map((m) => `${m.nation ?? ""}|${m.league ?? ""}`));
    const add = [...managers.entries()].filter(([k]) => !have.has(k)).slice(0, Math.max(0, 100 - have.size))
      .map(([, m]) => ({ user_id: userId, name: m.name, nation: m.nation, league: m.league, owned: true }));
    if (add.length) fail((await db.from("user_managers").insert(add)).error);
    managers_added = add.length;
  }

  return {
    added, updated, managers_added,
    skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })),
    over_limit: over,
    verified: false,
    note: "Read from your own club file, not checked by EA. Cards missing from this file are kept (you may not have paged through everything). " +
      "Heroes aren't detected: mark them on the card. Skill moves aren't imported yet.",
  };
}
