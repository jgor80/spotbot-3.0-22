// Draft simulator and pack opener (Jeff, 2026-11-10): for fun, with real FC 27 cards from FUT.GG's card list.
// Draft: a formation and a code (seed); every slot offers 5 cards for its position, the same 5 for everyone with the
// same code, so a Discord server can hold a draft night and compare scores (rating + chemistry). Pack opener:
// simulated packs with made-up odds (not EA's), valued at FUT.GG prices. Nothing touches anyone's EA account.
import type { ChemistryRules } from "./xilab/chemistry/index.ts";
import type { WorkspaceCard, WorkspaceSlot } from "./xilab/workspace/index.ts";
import { FORMATIONS } from "./xilab/workspace/formations.ts";
import { evaluate } from "./squad-suggest.ts";
import { teamRating } from "./sbc.ts";
import { activeRules, fail, FutError, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
export const OPTIONS = 5;
export interface DraftCard { id: string; name: string; overall: number; positions: string[]; club: string | null; league: string | null; nation: string | null; is_icon: boolean; is_hero: boolean; version: string | null; ea_item_id: number | null }

export const newSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const seedOf = (v: unknown) => {
  if (v === undefined || v === null || v === "") return newSeed();
  const s = String(v).toLowerCase().trim();
  if (!/^[a-z0-9]{6,16}$/.test(s)) throw new FutError("A draft code is 6 to 16 letters and numbers.");
  return s;
};

async function randomCards(db: FutDb, seed: string, count: number, min: number, max: number, position: string | null, power: number): Promise<DraftCard[]> {
  const { data, error } = await db.rpc("random_cards", { p_seed: seed, p_count: count, p_min: min, p_max: max, p_position: position, p_power: power });
  if (error) throw new FutError(`The card list is unavailable: ${error.message}`, 500);
  return ((data ?? []) as Row[]).map((c) => ({
    id: String(c.id), name: String(c.name), overall: Number(c.overall), positions: (c.positions as string[]) ?? [], club: (c.club as string) ?? null, league: (c.league as string) ?? null,
    nation: (c.nation as string) ?? null, is_icon: c.is_icon === true, is_hero: c.is_hero === true, version: (c.version as string) ?? null, ea_item_id: c.ea_item_id ? Number(c.ea_item_id) : null,
  }));
}

/** The 5 options for every slot of the formation under this code. Deterministic. */
export async function draftOptions(db: FutDb, formationIn: unknown, seedIn: unknown) {
  const formation = typeof formationIn === "string" && FORMATIONS[formationIn] ? formationIn : formationIn === undefined ? "4-3-3" : null;
  if (!formation) throw new FutError(`formation must be one of: ${Object.keys(FORMATIONS).join(", ")}.`);
  const seed = seedOf(seedIn);
  const layout = FORMATIONS[formation]!;
  const slots = await Promise.all(layout.map(async (l) => ({ slot: l.slot, position: l.position, options: await randomCards(db, `${seed}:${formation}:${l.slot}`, OPTIONS, 75, 99, l.position, 2) })));
  if (slots.some((s) => !s.options.length)) throw new FutError("Not enough cards on FUT.GG's card list yet to run a draft.", 503);
  return { seed, formation, slots, rules: "Pick one card per slot. Score = team rating + team chemistry. Same code, same options, so friends can compare." };
}

const toWorkspace = (c: DraftCard): WorkspaceCard => ({ id: c.id, name: c.name, club: c.club, league: c.league, nation: c.nation, positions: c.positions, is_icon: c.is_icon, is_hero: c.is_hero, rating: c.overall, source: "database" });

/** Score a finished draft: every pick must be one of that slot's options, one version per player. Pure. */
export function scorePicks(options: { slot: string; position: string; options: DraftCard[] }[], picks: Record<string, unknown>, formation: string, rules: ChemistryRules) {
  const names = new Set<string>();
  const slots: WorkspaceSlot[] = options.map((s) => {
    const id = picks[s.slot];
    const card = s.options.find((c) => c.id === id);
    if (!card) throw new FutError(`Pick one of the ${OPTIONS} options for ${s.slot}.`);
    const n = card.name.toLowerCase();
    if (names.has(n)) throw new FutError(`${card.name} is in the XI twice; pick someone else for ${s.slot}.`);
    names.add(n);
    return { slot: s.slot, position: s.position, card: toWorkspace(card), locked: false };
  });
  const chem = evaluate(formation, slots, null, rules).total;
  const rating = teamRating(slots.map((s) => s.card!.rating ?? 0));
  return { rating, chemistry: chem, score: rating + chem, slots };
}

export async function finishDraft(db: FutDb, userId: string, b: Row) {
  const opts = await draftOptions(db, b.formation, b.seed ?? "missing!");
  const picks = b.picks && typeof b.picks === "object" && !Array.isArray(b.picks) ? b.picks as Record<string, unknown> : {};
  const s = scorePicks(opts.slots, picks, opts.formation, await activeRules(db));
  const { data: had, error: e1 } = await db.from("draft_scores").select("score").eq("user_id", userId).eq("seed", opts.seed).maybeSingle();
  fail(e1);
  const best = !had || Number((had as Row).score) < s.score;
  if (best) {
    fail((await db.from("draft_scores").upsert({ user_id: userId, seed: opts.seed, formation: opts.formation, rating: s.rating, chemistry: s.chemistry, score: s.score, squad: s.slots.map((x) => ({ slot: x.slot, name: x.card!.name, overall: x.card!.rating })), finished_at: new Date().toISOString() }, { onConflict: "user_id,seed" })).error);
  }
  return { seed: opts.seed, formation: opts.formation, rating: s.rating, chemistry: s.chemistry, score: s.score, personal_best: best, previous_best: had ? Number((had as Row).score) : null };
}

/** Best score per player on one code, for the given website users (a Discord server's members). */
export async function draftBoard(db: FutDb, seedIn: unknown, userIds: unknown) {
  const seed = seedOf(seedIn);
  if (!Array.isArray(userIds)) throw new FutError("user_ids must be a list.");
  const ids = userIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!ids.length) return { seed, rows: [] };
  const { data, error } = await db.from("draft_scores").select("user_id, formation, rating, chemistry, score, finished_at").eq("seed", seed).in("user_id", ids).order("score", { ascending: false }).limit(50);
  fail(error);
  return { seed, rows: (data ?? []) as Row[] };
}

// ---------- Pack opener ----------

export interface SimPack { key: string; label: string; parts: { count: number; min: number; max: number; power: number }[] }
/** Made-up packs for fun. Not EA's odds. */
export const SIM_PACKS: SimPack[] = [
  { key: "gold", label: "Gold Players Pack", parts: [{ count: 12, min: 75, max: 99, power: 0.6 }] },
  { key: "rare", label: "Rare Players Pack", parts: [{ count: 11, min: 75, max: 99, power: 1 }, { count: 1, min: 83, max: 99, power: 1 }] },
  { key: "x10_84", label: "84+ x10 Pack", parts: [{ count: 10, min: 84, max: 99, power: 1.5 }] },
  { key: "x5_87", label: "87+ x5 Pack", parts: [{ count: 5, min: 87, max: 99, power: 2 }] },
];

export async function openSimPack(db: FutDb, b: Row) {
  const pack = SIM_PACKS.find((p) => p.key === b.pack);
  if (!pack) throw new FutError(`pack must be one of: ${SIM_PACKS.map((p) => p.key).join(", ")}.`);
  const platform = b.platform === "pc" ? "pc" : "console";
  const seed = newSeed();
  const seen = new Set<string>();
  const cards: DraftCard[] = [];
  for (const [i, part] of pack.parts.entries()) {
    let taken = 0;
    for (const c of await randomCards(db, `${seed}:${i}`, part.count + 4, part.min, part.max, null, part.power)) {
      if (taken >= part.count) break;
      if (seen.has(c.id)) continue;
      seen.add(c.id); cards.push(c); taken++;
    }
  }
  const total = pack.parts.reduce((n, p) => n + p.count, 0);
  const items = cards.slice(0, total).sort((a, b) => b.overall - a.overall);
  const ids = items.map((c) => c.ea_item_id).filter((x): x is number => !!x);
  const price = new Map<number, number | null>();
  if (ids.length) {
    const { data, error } = await db.rpc("account_item_prices", { p_platform: platform, p_ids: ids });
    if (!error) for (const i of (((data as Row | null)?.items ?? []) as Row[])) price.set(Number(i.ea_item_id), (i.price as number | null) ?? null);
  }
  const out = items.map((c) => ({ ...c, price: c.ea_item_id ? price.get(c.ea_item_id) ?? null : null }));
  return {
    pack: pack.key, label: pack.label, platform, cards: out, best: out[0] ?? null,
    value: out.reduce((n, c) => n + (c.price ?? 0), 0),
    note: "Simulated for fun with made-up odds (not EA's), from FUT.GG's card list and prices. Nothing is opened in your club.",
  };
}
