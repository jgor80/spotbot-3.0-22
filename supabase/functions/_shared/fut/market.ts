// XI Lab Market Lab on the `fut` schema: Postgres adapters for XI Lab's market service (./xilab/market, copied from
// jgor80/11-lab), used by both the fut-api routes and the MCP FUT market tools. No market maths happens here.
// Prices are the caller's own imports (owner_user_id) plus shared rows from an authorised feed (none exists yet).
// Baskets are built from catalogue cards only, so a user's private cards never enter a shared index.
import {
  createMarketService, DEFAULT_BASKETS,
  type BasketMembership, type CardCategory, type MarketCard, type MarketCardSource, type MarketRules, type MembershipStore,
  type Platform, type PriceObservation, type PriceQuery, type PriceSource, type PriceStore, type WatchItem, type WatchlistStore,
} from "./xilab/market/index.ts";
import { activeRules, FutDbError, FutError, isUuid, searchMyCards, toWorkspaceCard, type Card, type FutDb } from "./service.ts";

type Row = Record<string, unknown>;
const fail = (error: { message?: string } | null) => {
  if (error) throw new FutDbError(`fut db: ${error.message ?? "error"}`);
};
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
const PAGE = 1000;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_PRICE_ROWS_PER_USER = 50_000;

/** Fetch every page of a query (PostgREST caps a response at ~1000 rows). */
async function allPages(make: () => { range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: { message?: string } | null }> }): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    fail(error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
    if (out.length >= 200_000) throw new FutError("Too much price history to analyse at once.", 413);
  }
}

const toObs = (r: Row): PriceObservation => ({
  card_id: String(r.card_id),
  platform: r.platform as Platform,
  price: Number(r.price),
  kind: r.kind as PriceObservation["kind"],
  observed_at: iso(r.observed_at)!,
  received_at: iso(r.received_at)!,
  event_at: iso(r.event_at),
  season: String(r.season ?? "FC27"),
  source_id: String(r.source_id),
  evidence: r.evidence as PriceObservation["evidence"],
  ...(Array.isArray(r.quality) ? { quality: r.quality as string[] } : {}),
});

export class PgPriceStore implements PriceStore {
  constructor(private db: FutDb) {}
  async query(owner: string, q: PriceQuery): Promise<PriceObservation[]> {
    const base = (shared: boolean) => () => {
      let x = this.db.from("market_price_observations").select("*");
      x = shared ? x.is("owner_user_id", null) : x.eq("owner_user_id", owner);
      if (q.platform) x = x.eq("platform", q.platform);
      if (q.card_ids?.length) x = x.in("card_id", q.card_ids);
      if (q.since) x = x.gte("observed_at", q.since);
      return x.lte("received_at", q.as_of).lte("observed_at", q.as_of).order("observed_at", { ascending: true });
    };
    const rows = [...(await allPages(base(true))), ...(await allPages(base(false)))];
    return rows.map(toObs);
  }
  async insert(owner: string | null, rows: PriceObservation[]) {
    if (!rows.length) return { inserted: 0, skipped: 0 };
    if (owner === null) throw new FutError("Shared prices come only from an authorised feed.", 403);
    // Skip rows already stored (same source, card, platform and time) so re-importing a file is harmless.
    const ids = [...new Set(rows.map((r) => r.card_id))];
    const existing = await allPages(() => this.db.from("market_price_observations").select("card_id, platform, observed_at, source_id").eq("owner_user_id", owner).in("card_id", ids));
    const have = new Set(existing.map((r) => `${r.source_id}|${r.card_id}|${r.platform}|${iso(r.observed_at)}`));
    const fresh = rows.filter((r) => !have.has(`${r.source_id}|${r.card_id}|${r.platform}|${iso(r.observed_at)}`));
    const { count, error } = await this.db.from("market_price_observations").select("id", { count: "exact", head: true }).eq("owner_user_id", owner);
    fail(error);
    if ((count ?? 0) + fresh.length > MAX_PRICE_ROWS_PER_USER) throw new FutError(`You can keep up to ${MAX_PRICE_ROWS_PER_USER.toLocaleString("en-US")} price rows.`);
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500).map((r) => ({
        card_id: r.card_id, platform: r.platform, price: r.price, kind: r.kind ?? "lowest_bin", observed_at: r.observed_at, received_at: r.received_at,
        event_at: r.event_at ?? null, season: r.season, source_id: r.source_id, owner_user_id: owner, evidence: r.evidence, quality: r.quality ?? null,
      }));
      fail((await this.db.from("market_price_observations").insert(chunk)).error);
    }
    return { inserted: fresh.length, skipped: rows.length - fresh.length };
  }
}

export class PgMembershipStore implements MembershipStore {
  constructor(private db: FutDb) {}
  async list(basket_id?: string): Promise<BasketMembership[]> {
    const rows = await allPages(() => {
      const x = this.db.from("market_basket_members").select("*");
      return basket_id ? x.eq("basket_id", basket_id) : x;
    });
    return rows.map((r) => ({ basket_id: String(r.basket_id), card_id: String(r.card_id), effective_from: iso(r.effective_from)!, effective_to: iso(r.effective_to), ...(r.backfilled ? { backfilled: true } : {}) }));
  }
  async replace(basket_id: string, rows: BasketMembership[]) {
    const def = DEFAULT_BASKETS.find((b) => b.id === basket_id);
    if (def) {
      const { data, error } = await this.db.from("market_baskets").select("id").eq("id", basket_id).maybeSingle();
      fail(error);
      if (!data) fail((await this.db.from("market_baskets").insert({ id: def.id, label: def.label, grp: def.group, description: def.description, rule: def.rule })).error);
    }
    fail((await this.db.from("market_basket_members").delete().eq("basket_id", basket_id)).error);
    if (rows.length) fail((await this.db.from("market_basket_members").insert(rows.map((m) => ({ ...m, backfilled: !!m.backfilled })))).error);
  }
}

export class PgWatchlistStore implements WatchlistStore {
  constructor(private db: FutDb) {}
  async list(owner: string): Promise<WatchItem[]> {
    const { data, error } = await this.db.from("market_watchlist").select("*").eq("user_id", owner).order("added_at", { ascending: true }).limit(200);
    fail(error);
    return ((data ?? []) as Row[]).map((r) => ({
      card_id: String(r.card_id), platform: r.platform as Platform, added_at: iso(r.added_at)!, note: (r.note as string | null) ?? null,
      target_buy: (r.target_buy as number | null) ?? null, target_sell: (r.target_sell as number | null) ?? null,
      price_at_add: (r.price_at_add as number | null) ?? null, price_at_add_observed_at: iso(r.price_at_add_observed_at),
    }));
  }
  async upsert(owner: string, w: WatchItem) {
    const { count, error } = await this.db.from("market_watchlist").select("card_id", { count: "exact", head: true }).eq("user_id", owner);
    fail(error);
    fail((await this.db.from("market_watchlist").delete().eq("user_id", owner).eq("card_id", w.card_id).eq("platform", w.platform)).error);
    if ((count ?? 0) >= 200) throw new FutError("Your watchlist can hold up to 200 cards.");
    fail((await this.db.from("market_watchlist").insert({ ...w, user_id: owner })).error);
    return w;
  }
  async remove(owner: string, card_id: string, platform: Platform) {
    fail((await this.db.from("market_watchlist").delete().eq("user_id", owner).eq("card_id", card_id).eq("platform", platform)).error);
  }
}

const categoryOf = (c: Card): CardCategory => {
  if (c.is_icon) return "icon";
  if (c.is_hero) return "hero";
  const v = (c.version ?? "").toLowerCase();
  if (!v || v === "base" || v.includes("gold") || v.includes("rare")) return "base";
  if (v.includes("evo")) return "evolution";
  return "promo";
};

export const toMarketCard = (c: Card): MarketCard => ({
  ...toWorkspaceCard(c),
  rating: c.overall,
  category: categoryOf(c),
  version: c.version ?? undefined,
  tradeable: c.tradeable ?? true,
});

/** The caller's own cards. The catalogue (shared baskets) stays empty until a licensed card catalogue exists. */
export class PgMarketCardSource implements MarketCardSource {
  constructor(private db: FutDb) {}
  async list(owner: string): Promise<MarketCard[]> {
    return (await searchMyCards(this.db, owner, { all: true })).map(toMarketCard);
  }
  catalogue(): Promise<MarketCard[]> {
    return Promise.resolve([]);
  }
}

export async function marketSources(db: FutDb): Promise<PriceSource[]> {
  const { data, error } = await db.from("market_price_sources").select("*").order("id", { ascending: true });
  fail(error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id), name: String(r.name), kind: r.kind as PriceSource["kind"], status: r.status as PriceSource["status"], is_demo: !!r.is_demo,
    status_note: String(r.status_note), permissions: r.permissions as PriceSource["permissions"], evidence: r.evidence as PriceSource["evidence"],
  }));
}

export async function marketRules(db: FutDb): Promise<MarketRules> {
  const { data, error } = await db.from("market_rule_versions").select("*").eq("is_active", true).maybeSingle();
  fail(error);
  if (!data) throw new FutError("Market rules aren't set up yet.", 503);
  return { id: String(data.id), status: data.status, notes: String(data.notes), ...(data.body as object) } as MarketRules;
}

/** XI Lab's market service on the caller's data, the active market rules and the active chemistry rules. */
export async function marketFor(db: FutDb, now?: () => string) {
  const [rules, sources, chemistry] = await Promise.all([marketRules(db), marketSources(db), activeRules(db)]);
  return createMarketService({
    prices: new PgPriceStore(db), memberships: new PgMembershipStore(db), watchlists: new PgWatchlistStore(db),
    cards: new PgMarketCardSource(db), sources, rules, chemistry, ...(now ? { now } : {}),
  });
}

/** Card ids reaching the market service must be the caller's card UUIDs. */
export function marketCardId(v: unknown): string {
  if (!isUuid(v)) throw new FutError("card_id must be one of your card ids.");
  return v;
}

export const platformParam = (v: unknown): Platform => {
  if (v === undefined || v === null || v === "") return "console";
  if (v === "console" || v === "pc") return v;
  throw new FutError("platform must be console or pc.");
};
