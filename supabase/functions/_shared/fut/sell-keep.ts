// Sell or keep (Jeff, 2026-11-10): for every tradeable card in the user's synced club, a plain verdict with the reason:
// keep the cards that start in a saved squad or gain the most from a live evolution, hold cheap high-rated cards as SBC
// fodder, sell cards nobody uses while their FUT.GG price is falling or near its two-week high, and wait on cards
// that are still rising. Prices are FUT.GG's; nothing here lists or sells anything.
import { FutError, searchMyCards, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
type Platform = "console" | "pc";
export const EA_TAX = 0.05;
const afterTax = (v: number) => Math.floor(v * (1 - EA_TAX));

export type Verdict = "keep" | "keep_evo" | "hold_fodder" | "sell_now" | "sell_high" | "wait" | "sell" | "no_price";
export interface Trend { price: number | null; d1: number | null; d3: number | null; d7: number | null; low14: number | null; high14: number | null; points: number }
export interface KeepInput {
  id: string; name: string; rating: number; version: string | null; positions: string[]; ea_item_id: number | null;
  purchase_price: number | null; trend: Trend | null; squads: string[]; evo: { name: string; gain: number } | null; floor: number | null;
}
export interface Advice extends KeepInput {
  verdict: Verdict; reason: string; price: number | null; after_tax: number | null; change_3d: number | null; change_7d: number | null; profit: number | null;
}

/** Percent change from `then` to `now`, one decimal, or null. */
export const pct = (now: number | null, then: number | null) => (now && then ? Math.round(((now - then) / then) * 1000) / 10 : null);
const c = (n: number) => n.toLocaleString("en-US");

/** The verdict for one card. Pure. Order matters: squad use beats everything, then evolutions, then SBC fodder, then the price trend. */
export function adviseCard(x: KeepInput): Advice {
  const t = x.trend, price = t?.price ?? null;
  const ch3 = pct(price, t?.d3 ?? t?.d1 ?? null), ch7 = pct(price, t?.d7 ?? null);
  const base = { ...x, price, after_tax: price === null ? null : afterTax(price), change_3d: ch3, change_7d: ch7, profit: price !== null && x.purchase_price !== null ? afterTax(price) - x.purchase_price : null };
  const out = (verdict: Verdict, reason: string): Advice => ({ ...base, verdict, reason });
  if (x.squads.length) return out("keep", `Starts in ${x.squads.slice(0, 2).join(" and ")}${x.squads.length > 2 ? ` and ${x.squads.length - 2} more` : ""}.`);
  if (x.evo && x.evo.gain > 0) return out("keep_evo", `Best use: the ${x.evo.name} evolution would make it start (+${x.evo.gain} in your squad).`);
  if (price === null) return out("no_price", "No FUT.GG price yet.");
  const fodder = x.floor !== null && x.rating >= 83 && price <= x.floor * 1.25;
  if (fodder) return out("hold_fodder", `${x.rating}-rated at about the cheapest price for its rating (${c(x.floor!)}): worth more as SBC fodder than the ${c(afterTax(price))} it sells for.`);
  const falling = (ch3 !== null && ch3 <= -4) || (ch7 !== null && ch7 <= -8);
  const nearHigh = t?.high14 && t.low14 && t.high14 > t.low14 * 1.1 && price >= t.high14 * 0.95;
  const rising = ch3 !== null && ch3 >= 4 && !nearHigh;
  if (falling) return out("sell_now", `Not in a saved squad and falling (${ch3 !== null ? `${ch3}% in 3 days` : `${ch7}% in 7 days`}). Selling now gets ${c(afterTax(price))} after tax.`);
  if (nearHigh) return out("sell_high", `Not in a saved squad and near its two-week high (${c(t!.low14!)} to ${c(t!.high14!)}): a good moment to sell for ${c(afterTax(price))} after tax.`);
  if (rising) return out("wait", `Not in a saved squad but still rising (+${ch3}% in 3 days). Wait for it to level off, then sell.`);
  return out("sell", `Not in a saved squad and the price is steady. Selling frees ${c(afterTax(price))} after tax.`);
}

const ORDER: Record<Verdict, number> = { sell_now: 0, sell_high: 1, sell: 2, wait: 3, hold_fodder: 4, keep_evo: 5, keep: 6, no_price: 7 };

/** Every card's advice, sell-first and most valuable first, with totals. Pure. */
export function adviseClub(cards: KeepInput[]) {
  const advice = cards.map(adviseCard).sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (b.price ?? 0) - (a.price ?? 0));
  const of = (v: Verdict[]) => advice.filter((a) => v.includes(a.verdict));
  const coins = (l: Advice[]) => l.reduce((n, a) => n + (a.after_tax ?? 0), 0);
  const sell = of(["sell_now", "sell_high", "sell"]);
  const counts = Object.fromEntries(Object.keys(ORDER).map((k) => [k, advice.filter((a) => a.verdict === k).length])) as Record<Verdict, number>;
  return {
    totals: { cards: advice.length, counts, sell_now_coins: coins(of(["sell_now", "sell_high"])), sell_all_coins: coins(sell), keep_value: coins(of(["keep", "keep_evo"])), fodder_value: coins(of(["hold_fodder"])) },
    advice,
  };
}

// ------------------------------------------------------------------ data

async function squadUse(db: FutDb, userId: string): Promise<Map<string, string[]>> {
  const { data: sq, error } = await db.from("squads").select("id, name").eq("user_id", userId).limit(200);
  if (error) throw new FutError(`Squads are unavailable: ${error.message}`, 500);
  const names = new Map(((sq ?? []) as Row[]).map((r) => [r.id as string, r.name as string]));
  const use = new Map<string, string[]>();
  const ids = [...names.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error: e } = await db.from("squad_slots").select("squad_id, card_id").in("squad_id", ids.slice(i, i + 100));
    if (e) throw new FutError(`Squads are unavailable: ${e.message}`, 500);
    for (const r of (data ?? []) as Row[]) {
      if (!r.card_id) continue;
      const list = use.get(r.card_id as string) ?? [];
      const n = names.get(r.squad_id as string);
      if (n && !list.includes(n)) use.set(r.card_id as string, [...list, n]);
    }
  }
  return use;
}

/**
 * The user's tradeable club cards with a verdict each. `bestEvo` gives the best live evolution per card id (from the
 * Evolutions finder); it's optional so a failing evolution read never hides the sell list.
 */
export async function sellOrKeep(db: FutDb, userId: string, platform: Platform, bestEvo?: () => Promise<Map<string, { name: string; gain: number }>>) {
  const club = await searchMyCards(db, userId, { all: true, owned_only: true });
  const mine = club.filter((c) => c.tradeable !== false);
  const [use, evo] = await Promise.all([squadUse(db, userId), bestEvo ? bestEvo().catch(() => new Map()) : Promise.resolve(new Map())]);
  const ids = [...new Set(mine.map((c) => c.ea_item_id).filter((x): x is number => !!x))].slice(0, 2000);
  let trends = new Map<number, Trend>(), floors: Record<string, number> = {}, prices_at: string | null = null;
  if (ids.length) {
    const { data, error } = await db.rpc("card_price_trend", { p_platform: platform, p_ids: ids });
    if (error) throw new FutError(`Card prices are unavailable: ${error.message}`, 500);
    const d = (data ?? {}) as Row;
    prices_at = (d.published_at as string | null) ?? null;
    floors = (d.floors ?? {}) as Record<string, number>;
    trends = new Map(((d.items ?? []) as Row[]).map((r) => [Number(r.ea_item_id), {
      price: (r.price as number | null) ?? null, d1: (r.d1 as number | null) ?? null, d3: (r.d3 as number | null) ?? null, d7: (r.d7 as number | null) ?? null,
      low14: (r.low14 as number | null) ?? null, high14: (r.high14 as number | null) ?? null, points: Number(r.points ?? 0),
    }]));
  }
  const inputs: KeepInput[] = mine.map((c) => ({
    id: c.id, name: c.player_name, rating: c.overall, version: c.version, positions: c.positions, ea_item_id: c.ea_item_id, purchase_price: c.purchase_price,
    trend: c.ea_item_id ? trends.get(c.ea_item_id) ?? null : null, squads: use.get(c.id) ?? [], evo: evo.get(c.id) ?? null,
    floor: typeof floors[String(c.overall)] === "number" ? floors[String(c.overall)]! : null,
  }));
  return {
    platform, prices_at, ...adviseClub(inputs), untradeable_skipped: club.length - mine.length,
    note: "Verdicts use your saved squads, live evolutions the helper saw and FUT.GG's price trend over the last two weeks. Untradeable cards are left out. Nothing here lists or sells.",
    verified: false as const,
  };
}
