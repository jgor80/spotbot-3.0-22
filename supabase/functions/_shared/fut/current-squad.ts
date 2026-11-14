// Squad Builder's "my current squad" and its advisor (Jeff, 2026-11-14: "show my current squad and suggest players at
// each position based on skill or chem ... suggest formations and player arrangements for my players and ideals to
// try to go for").
//
// The current squad comes from the squad the user opened in the EA Web App, which the XI Lab helper (0.13.0+) copies
// inside the club file: EA's formation code and which item is in which place. UNVERIFIED for FC 27: the formation
// codes below and the order of the places follow earlier seasons. So the code is only trusted when the eleven
// actually fit that shape, and players are put where they play rather than by EA's place number. Without a capture
// it falls back to the newest saved squad, then to the best eleven from the club, and says which it used.
import type { ChemistryRules } from "./xilab/chemistry/index.ts";
import { createSquad, FORMATIONS, type Squad, type WorkspaceCard } from "./xilab/workspace/index.ts";
import { activeRules, FutDbError, PgSquadStore, searchMyCards, toWorkspaceCard, type FutDb } from "./service.ts";
import { bestSquadFor, bestSquads, evaluate, suggestForSlot, type BestSquad, type SuggestBy } from "./squad-suggest.ts";
import { metaTop } from "./meta-data.ts";

type Row = Record<string, unknown>;
const fail = (error: { message?: string } | null) => { if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`); };

// ---------------------------------------------------------------- storing what the helper sent

export const MAX_GAME_SQUADS = 12;
const posInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

/** The `squads` part of a club file. Anything that doesn't fit is skipped, never guessed. */
export function parseGameSquads(body: unknown): { squad_key: string; name: string | null; formation_code: string | null; active: boolean; seen_at: string; players: { index: number; ea_item_id: number }[]; fields: string[] }[] {
  const list = body && typeof body === "object" && Array.isArray((body as Row).squads) ? (body as Row).squads as unknown[] : [];
  const out = new Map<string, ReturnType<typeof parseGameSquads>[number]>();
  for (const raw of list.slice(0, MAX_GAME_SQUADS)) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Row;
    const key = typeof s.key === "string" && /^(active|[0-9]{1,6})$/.test(s.key) ? s.key : null;
    const seen = typeof s.seen_at === "string" && !Number.isNaN(Date.parse(s.seen_at)) ? new Date(s.seen_at).toISOString() : null;
    if (!key || !seen || !Array.isArray(s.players)) continue;
    const players: { index: number; ea_item_id: number }[] = [];
    const used = new Set<number>();
    for (const p of s.players as Row[]) {
      const index = typeof p?.index === "number" && Number.isInteger(p.index) && p.index >= 0 && p.index <= 22 ? p.index : null;
      const ea_item_id = posInt(p?.ea_item_id);
      if (index === null || !ea_item_id || used.has(index)) continue;
      used.add(index);
      players.push({ index, ea_item_id });
    }
    if (!players.length) continue;
    const had = out.get(key);
    if (had && had.seen_at >= seen) continue;
    out.set(key, {
      squad_key: key, name: typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 60) : null,
      formation_code: typeof s.formation === "string" && /^[a-z0-9]{2,16}$/.test(s.formation) ? s.formation : null,
      active: key === "active", seen_at: seen, players: players.sort((a, b) => a.index - b.index),
      fields: Array.isArray(s.fields) ? (s.fields as unknown[]).filter((f): f is string => typeof f === "string" && /^[A-Za-z0-9_]{1,40}$/.test(f)).slice(0, 40) : [],
    });
  }
  return [...out.values()];
}

/** Saves the squads in a club file (after the club itself is imported). Returns how many were stored. */
export async function importGameSquads(db: FutDb, userId: string, body: unknown): Promise<number> {
  const squads = parseGameSquads(body);
  if (!squads.length) return 0;
  const now = new Date().toISOString();
  fail((await db.from("game_squads").upsert(squads.map((s) => ({ user_id: userId, ...s, updated_at: now })), { onConflict: "user_id,squad_key" })).error);
  return squads.length;
}

// ---------------------------------------------------------------- EA formation codes

/** EA's formation codes from earlier seasons → our FC 27 formation names. UNVERIFIED on FC 27. */
export const FORMATION_CODES: Record<string, string> = {
  f3142: "3-1-4-2", f3412: "3-4-1-2", f3421: "3-4-2-1", f343: "3-4-3", f352: "3-5-2",
  f41212: "4-1-2-1-2", f41212a: "4-1-2-1-2 (2)", f4132: "4-1-3-2", f4141: "4-1-4-1", f4213: "4-2-1-3", f4222: "4-2-2-2",
  f4231: "4-2-3-1", f4231a: "4-2-3-1 (2)", f424: "4-2-4", f4312: "4-3-1-2", f4321: "4-3-2-1",
  f433: "4-3-3", f433a: "4-3-3 (2)", f433b: "4-3-3 (3)", f433c: "4-3-3 (4)", f442: "4-4-2", f442a: "4-4-2 (2)",
  f451: "4-5-1", f451a: "4-5-1 (2)", f5212: "5-2-1-2", f523: "5-2-3", f532: "5-3-2", f541: "5-4-1",
};
const digits = (s: string) => s.replace(/\(.*\)/, "").replace(/\D/g, "");
/** How many players stand in their main position (a winger on the wing, not at wide midfield). */
const natural = (b: BestSquad) => b.squad.slots.filter((s) => s.card && s.card.positions[0] === s.position).length;

/**
 * The formation a captured eleven is in: the code's formation when everyone fits it, else a variant with the same
 * numbers that fits better ("4-3-3 (2)" for a holding 4-3-3), else whichever formation fits the players best.
 */
export function formationFor(code: string | null, eleven: WorkspaceCard[], rules: ChemistryRules): { formation: string; sure: boolean; best: BestSquad } {
  const fit = (f: string) => bestSquadFor(createSquad({ formation: f }), f, eleven, rules, "chem");
  const better = (a: BestSquad, b: BestSquad) => a.filled - b.filled || a.chemistry - b.chemistry || natural(a) - natural(b);
  const named = code ? FORMATION_CODES[code] ?? null : null;
  const base = code ? digits(code) : "";
  const family = base ? Object.keys(FORMATIONS).filter((f) => digits(f) === base) : [];
  const first = named && FORMATIONS[named] ? fit(named) : null;
  if (first && first.filled >= Math.min(11, eleven.length)) return { formation: named!, sure: true, best: first };
  const tried = [...(first ? [first] : []), ...family.filter((f) => f !== named).map(fit)];
  if (tried.length) {
    const top = tried.reduce((a, b) => (better(b, a) > 0 ? b : a));
    if (top.filled >= Math.min(11, eleven.length)) return { formation: top.formation, sure: top.formation === named || family.length === 1, best: top };
  }
  const all = [...tried, ...Object.keys(FORMATIONS).filter((f) => !tried.some((t) => t.formation === f)).map(fit)];
  const top = all.reduce((a, b) => (better(b, a) > 0 ? b : a));
  // Nothing fits everyone: keep EA's formation when we know it, so the shape on screen matches the game
  return first && top.filled <= first.filled ? { formation: named!, sure: true, best: first } : { formation: top.formation, sure: false, best: top };
}

// ---------------------------------------------------------------- my current squad

export interface CurrentSquad {
  /** game: the squad opened in the Web App; saved: the newest saved squad; club: the best eleven from the club; none: no cards at all. */
  source: "game" | "saved" | "club" | "none";
  squad: Squad | null;
  note: string;
  seen_at: string | null;
  formation_code: string | null;
  /** False when the formation was worked out from where the players play (EA's code was missing or unknown). */
  formation_sure: boolean;
  /** Starters the capture named that aren't in the synced club. */
  missing: number;
  bench: { id: string; name: string; rating: number; positions: string[] }[];
}

const HOW = "To load your real one, update the XI Lab helper (0.13.0 or newer) and open your squad in the EA Web App.";

export async function currentSquad(db: FutDb, userId: string, rules?: ChemistryRules, pool?: WorkspaceCard[]): Promise<CurrentSquad> {
  const [r, mine, captured] = await Promise.all([
    rules ?? activeRules(db), pool ?? searchMyCards(db, userId, { all: true, owned_only: true }).then((cs) => cs.map(toWorkspaceCard)),
    db.from("game_squads").select("*").eq("user_id", userId).order("seen_at", { ascending: false }).limit(MAX_GAME_SQUADS),
  ]);
  fail(captured.error);
  const rows = (captured.data ?? []) as Row[];
  const row = rows.find((x) => x.active === true) ?? rows[0];
  if (row) {
    // Club cards are keyed by EA's item id (the card version), which is what the capture carries
    const cards = await searchMyCards(db, userId, { all: true, owned_only: true });
    const byEa = new Map(cards.filter((c) => c.ea_item_id).map((c) => [c.ea_item_id!, toWorkspaceCard(c)]));
    const players = (Array.isArray(row.players) ? row.players : []) as { index: number; ea_item_id: number }[];
    const starters = players.filter((p) => p.index <= 10), eleven = starters.flatMap((p) => byEa.get(p.ea_item_id) ?? []);
    if (eleven.length) {
      const f = formationFor((row.formation_code as string | null) ?? null, eleven, r);
      const missing = starters.length - eleven.length, left = eleven.length - f.best.filled;
      const base = createSquad({ formation: f.formation, name: (row.name as string | null) || "My current squad", owner_id: userId });
      return {
        source: "game", squad: { ...base, slots: f.best.squad.slots }, seen_at: row.seen_at as string, formation_code: (row.formation_code as string | null) ?? null, formation_sure: f.sure, missing,
        bench: players.filter((p) => p.index > 10).flatMap((p) => { const c = byEa.get(p.ea_item_id); return c ? [{ id: c.id, name: c.name, rating: c.rating ?? 0, positions: c.positions }] : []; }),
        note: [
          `Your ${row.active ? "active squad" : "squad"} from the EA Web App.`,
          f.sure ? "" : "The formation was worked out from where your players play, so check it.",
          missing ? `${missing} starter${missing === 1 ? " isn't" : "s aren't"} in your synced club yet: open your Club in the Web App to sync ${missing === 1 ? "it" : "them"}.` : "",
          left ? `${left} player${left === 1 ? "" : "s"} couldn't be placed in a position they play.` : "",
        ].filter(Boolean).join(" "),
      };
    }
  }
  const none = { seen_at: null, formation_code: null, formation_sure: true, missing: 0, bench: [] };
  const saved = (await new PgSquadStore(db).list(userId)).filter((s) => s.slots.some((x) => x.card));
  if (saved.length) {
    const s = [...saved].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0]!;
    return { ...none, source: "saved", squad: s, note: `Your in-game squad hasn't been captured yet, so this is your newest saved squad, "${s.name}". ${HOW}` };
  }
  if (mine.length) {
    const best = bestSquads(createSquad({ formation: "4-2-3-1" }), "all", mine, r, "ovr")[0]!;
    const base = createSquad({ formation: best.formation, name: "My current squad", owner_id: userId });
    return { ...none, source: "club", squad: { ...base, slots: best.squad.slots }, formation_sure: false, note: `Your in-game squad hasn't been captured yet, so this is the strongest eleven your club can field. ${HOW}` };
  }
  return { ...none, source: "none", squad: null, note: "You have no club cards yet. Sync your club with the XI Lab helper, or add cards on My cards." };
}

// ---------------------------------------------------------------- the advisor

export interface Target { card_id: string; ea_item_id: number | null; name: string; rating: number; version: string | null; price: number | null; score: number; role: string; why: string; affordable: boolean | null }
/** The best cards on the market for a position, best first (Metaratings); injectable for tests. */
export type TargetPicker = (position: string, maxPrice: number | null) => Promise<(Omit<Target, "affordable"> & { owned: boolean })[]>;

export interface SlotAdvice {
  slot: string; position: string;
  current: { id: string; name: string; rating: number; chemistry: number; in_position: boolean } | null;
  /** Club cards for this place, best first by the chosen measure; `better` when it beats who is there now. */
  picks: { id: string; name: string; rating: number; positions: string[]; chemistry: number; team_chemistry: number; change: number; rating_change: number | null; better: boolean }[];
  /** Who to aim for from the market: the best you can afford now, and the best there is. */
  target: Target | null;
  dream: Target | null;
}
export interface FormationAdvice { formation: string; chemistry: number; rating: number; filled: number; empty: string[]; squad: Squad; changes: number; current: boolean }
export interface SquadAdvice {
  by: SuggestBy; owned_cards: number; coins: number | null;
  now: { formation: string; chemistry: number; rating: number; filled: number };
  slots: SlotAdvice[];
  /** The same players in other shapes (who goes where), best first. */
  rearrange: FormationAdvice[];
  /** The best eleven from the whole club in each shape, best first. */
  club: FormationAdvice[];
}

const rating = (slots: Squad["slots"]) => { const f = slots.filter((s) => s.card); return f.length ? Math.round(f.reduce((a, s) => a + (s.card!.rating ?? 0), 0) / f.length) : 0; };
const defaultTargets = (db: FutDb, userId: string, platform: "console" | "pc"): TargetPicker => async (position, maxPrice) => {
  const top = await metaTop(db, userId, { position, platform, max_price: maxPrice });
  return top.cards.map((c) => ({
    card_id: c.card_id, ea_item_id: c.ea_item_id, name: c.name, rating: c.rating, version: c.version, price: c.price, owned: c.owned, score: c.meta!.score, role: c.meta!.role,
    why: [c.meta!.strengths.slice(0, 2).join(", "), c.meta!.playstyles.slice(0, 2).join(", ")].filter(Boolean).join("; "),
  }));
};

export async function squadAdvice(
  db: FutDb, userId: string, squad: Squad, pool: WorkspaceCard[], rules: ChemistryRules,
  opts: { by: SuggestBy; platform: "console" | "pc" }, targets?: TargetPicker,
): Promise<SquadAdvice> {
  const { by } = opts;
  const now = evaluate(squad.formation, squad.slots, squad.manager, rules);
  const chemOf = (slot: string) => now.chem.players.find((p) => p.slot === slot);
  let coins: number | null = null;
  try {
    const { data } = await db.from("account_state").select("balance").eq("user_id", userId).eq("platform", opts.platform).maybeSingle();
    const n = Number((data as { balance?: { coins?: unknown } } | null)?.balance?.coins);
    coins = Number.isFinite(n) ? n : null;
  } catch (e) { console.error("[fut-api] squad advisor coins:", e); }

  // Who to aim for, once per position (never a player already in the squad or the club)
  const pick = targets ?? defaultTargets(db, userId, opts.platform);
  const inSquad = new Set(squad.slots.flatMap((s) => (s.card ? [s.card.name.toLowerCase()] : [])));
  const positions = [...new Set(squad.slots.map((s) => s.position))];
  const market = new Map<string, { target: Target | null; dream: Target | null }>();
  await Promise.all(positions.map(async (position) => {
    try {
      const fresh = (list: Awaited<ReturnType<TargetPicker>>) => list.filter((c) => !c.owned && !inSquad.has(c.name.toLowerCase()));
      const asTarget = (c: Awaited<ReturnType<TargetPicker>>[number] | undefined): Target | null => c ? { card_id: c.card_id, ea_item_id: c.ea_item_id, name: c.name, rating: c.rating, version: c.version, price: c.price, score: c.score, role: c.role, why: c.why, affordable: coins === null || c.price === null ? null : c.price <= coins } : null;
      const [afford, all] = await Promise.all([coins !== null ? pick(position, coins) : Promise.resolve([]), pick(position, null)]);
      const dream = asTarget(fresh(all)[0]), target = asTarget(fresh(afford)[0]);
      market.set(position, { target, dream: dream && dream.card_id !== target?.card_id ? dream : null });
    } catch (e) { console.error(`[fut-api] squad advisor targets ${position}:`, (e as Error).message); market.set(position, { target: null, dream: null }); }
  }));
  // Two places with the same position get different targets
  const handed = new Map<string, number>();

  const slots: SlotAdvice[] = squad.slots.map((s) => {
    const c = s.card, mine = chemOf(s.slot);
    const picks = suggestForSlot(squad, s.slot, pool, rules, by, 4).suggestions.map((x) => ({
      id: x.card.id, name: x.card.name, rating: x.card.rating ?? 0, positions: x.card.positions, chemistry: x.chemistry, team_chemistry: x.team_chemistry, change: x.change,
      rating_change: c ? (x.card.rating ?? 0) - (c.rating ?? 0) : null,
      better: !c || (by === "ovr" ? (x.card.rating ?? 0) > (c.rating ?? 0) || ((x.card.rating ?? 0) === (c.rating ?? 0) && x.change > 0) : x.change > 0 || (x.change === 0 && (x.card.rating ?? 0) > (c.rating ?? 0))),
    }));
    const m = market.get(s.position) ?? { target: null, dream: null };
    const nth = handed.get(s.position) ?? 0;
    handed.set(s.position, nth + 1);
    return {
      slot: s.slot, position: s.position,
      current: c ? { id: c.id, name: c.name, rating: c.rating ?? 0, chemistry: mine?.chemistry ?? 0, in_position: mine?.in_position !== false } : null,
      picks, target: nth === 0 ? m.target : null, dream: nth === 0 ? m.dream : null,
    };
  });

  const eleven = squad.slots.flatMap((s) => (s.card ? [s.card] : []));
  const ids = new Set(eleven.map((c) => c.id));
  const shape = (b: BestSquad): FormationAdvice => ({
    formation: b.formation, chemistry: b.chemistry, rating: rating(b.squad.slots), filled: b.filled, empty: b.empty, squad: { ...squad, formation: b.formation, slots: b.squad.slots },
    changes: b.squad.slots.filter((s) => s.card && !ids.has(s.card.id)).length, current: b.formation === squad.formation,
  });
  const unlocked = { ...squad, slots: squad.slots.map((s) => ({ ...s, locked: false })) };
  // The same players in every shape: only shapes that hold all of them, most chemistry first
  const rearrange = eleven.length >= 2 ? bestSquads(unlocked, "all", eleven, rules, "chem").filter((b) => b.filled === eleven.length)
    .sort((a, b) => b.chemistry - a.chemistry || Number(b.formation === squad.formation) - Number(a.formation === squad.formation) || natural(b) - natural(a)).slice(0, 5).map(shape) : [];
  const club = pool.length ? bestSquads(squad, "all", pool, rules, by).slice(0, 5).map(shape) : [];
  return {
    by, owned_cards: pool.length, coins,
    now: { formation: squad.formation, chemistry: now.total, rating: rating(squad.slots), filled: eleven.length },
    slots, rearrange, club,
  };
}

