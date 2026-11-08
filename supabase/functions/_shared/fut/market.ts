// XI Lab Market Lab on the `fut` schema: Postgres adapters for XI Lab's market service (./xilab/market, copied from
// jgor80/11-lab), used by both the fut-api routes and the MCP FUT market tools. No market maths happens here.
// Prices are the caller's own imports (owner_user_id), shared rows from an authorised feed, and FUT.GG's bulk files.
// Baskets are built from catalogue cards only (the FUT.GG card list, futgg-catalogue.ts), so a user's private cards
// never enter a shared index.
import {
  createMarketService, DEFAULT_BASKETS,
  type BasketMembership, type CaptureHoldStore, type CardCategory, type MarketCard, type MarketCardSource, type MarketRules, type MembershipStore,
  type Platform, type PriceObservation, type PriceQuery, type PriceSource, type PriceStore, type UnmatchedCapture, type WatchItem, type WatchlistStore,
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
export const MAX_HELD_CAPTURES_PER_USER = 20_000;

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

/** Catalogue cards Market Lab analyses: the FUT.GG card list's cards priced at 1,000+ coins (market_tracked). */
export function trackedCatalogue(db: FutDb): () => Promise<Row[]> {
  let cached: Promise<Row[]> | null = null;
  return () => (cached ??= allPages(() => db.from("player_cards")
    .select("id,player_name,version,overall,positions,club,league,nation,is_icon,is_hero,source_id,source_card_key,price,updated_at")
    .is("owner_user_id", null).eq("source_id", "futgg_catalogue").eq("market_tracked", true).order("id", { ascending: true })));
}
const eaKey = (v: unknown) => (/^[1-9]\d{0,9}$/.test(String(v ?? "")) ? Number(v) : null);

/** A catalogue row as a card (no face stats or PlayStyles in the FUT.GG card list; never owned). */
const catalogueCard = (r: Row): Card => ({
  id: String(r.id), source: String(r.source_id), player_name: String(r.player_name), version: (r.version as string) ?? null,
  overall: Number(r.overall), positions: r.positions as string[], club: (r.club as string) ?? null, league: (r.league as string) ?? null,
  nation: (r.nation as string) ?? null, is_icon: r.is_icon === true, is_hero: r.is_hero === true, skill_moves: null, weak_foot: null,
  stats: {}, playstyles: [], playstyles_plus: [], evidence: "game_data", notes: null, owned: false, tradeable: null, purchase_price: null,
  price: (r.price as number) ?? null, ea_item_id: eaKey(r.source_card_key), updated_at: String(r.updated_at),
});

export class PgPriceStore implements PriceStore {
  constructor(private db: FutDb, private futggEnabled = false, private catalogue: () => Promise<Row[]> = () => Promise.resolve([])) {}
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
    return [...rows.map(toObs), ...(this.futggEnabled ? await this.futggHistory(owner, q) : [])];
  }
  private async futggHistory(owner: string, q: PriceQuery): Promise<PriceObservation[]> {
    // Map public EA item IDs only onto this caller's card UUIDs. Never enumerate other users' inventories.
    const cards = await allPages(() => {
      let x = this.db.from("player_cards").select("id,source_card_key").eq("owner_user_id", owner);
      if (q.card_ids?.length) x = x.in("id", q.card_ids);
      return x.order("id", { ascending: true });
    });
    const byEa = new Map<number, string[]>();
    for (const card of cards) {
      const key = String(card.source_card_key ?? "");
      if (!/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(Number(key))) continue;
      byEa.set(Number(key), [...(byEa.get(Number(key)) ?? []), String(card.id)]);
    }
    // Market-wide catalogue cards take the same quotes, unless the caller has their own card for that item.
    const wanted = q.card_ids?.length ? new Set(q.card_ids) : null;
    for (const row of await this.catalogue()) {
      const key = eaKey(row.source_card_key);
      if (key === null || byEa.has(key) || (wanted && !wanted.has(String(row.id)))) continue;
      byEa.set(key, [String(row.id)]);
    }
    const ids = [...byEa.keys()], out: PriceObservation[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const quotes = await allPages(() => {
        let x = this.db.from("futgg_prices").select("*").eq("game_year", 27).in("ea_item_id", ids.slice(i, i + 100)).gte("price", 1);
        if (q.platform) x = x.eq("platform", q.platform);
        if (q.since) x = x.gte("published_at", q.since);
        return x.lte("received_at", q.as_of).lte("published_at", q.as_of).order("published_at", { ascending: true }).order("ea_item_id", { ascending: true }).order("platform", { ascending: true });
      });
      for (const quote of quotes) for (const cardId of byEa.get(Number(quote.ea_item_id)) ?? []) {
        out.push({ card_id: cardId, platform: quote.platform as Platform, price: Number(quote.price),
          observed_at: iso(quote.published_at)!, received_at: iso(quote.received_at)!, season: "FC27",
          source_id: "futgg_bulk", evidence: "estimate", kind: "lowest_bin",
          quality: ["FUT.GG dataset publication time; individual quote update time is unavailable."] });
      }
      if (out.length >= 200_000) throw new FutError("Too much bulk price history to analyse at once.", 413);
    }
    return out;
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

export class PgCaptureHoldStore implements CaptureHoldStore {
  constructor(private db: FutDb) {}
  async hold(owner: string, rows: UnmatchedCapture[]) {
    const have = new Set((await this.list(owner)).map(holdKey));
    const fresh = [...new Map(rows.filter((r) => !have.has(holdKey(r))).map((r) => [holdKey(r), r])).values()];
    if (have.size + fresh.length > MAX_HELD_CAPTURES_PER_USER) throw new FutError(`You can keep up to ${MAX_HELD_CAPTURES_PER_USER.toLocaleString("en-US")} captured prices for cards you haven't added yet. Add those cards or link them first.`);
    for (let i = 0; i < fresh.length; i += 500)
      fail((await this.db.from("market_capture_holds").insert(fresh.slice(i, i + 500).map((r) => ({
        user_id: owner, ea_item_id: r.ea_item_id, asset_id: r.asset_id, rating: r.rating, platform: r.observation.platform,
        observed_at: r.observation.observed_at, details: r.details ?? null, observation: r.observation,
      })))).error);
    return { held: fresh.length, skipped: rows.length - fresh.length };
  }
  async list(owner: string): Promise<UnmatchedCapture[]> {
    const out: UnmatchedCapture[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db.from("market_capture_holds").select("*").eq("user_id", owner).order("observed_at", { ascending: true }).range(from, from + PAGE - 1);
      fail(error);
      const rows = (data ?? []) as Row[];
      for (const r of rows)
        out.push({
          ea_item_id: Number(r.ea_item_id), asset_id: r.asset_id === null || r.asset_id === undefined ? null : Number(r.asset_id),
          rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
          ...(r.details ? { details: r.details as UnmatchedCapture["details"] } : {}),
          observation: r.observation as PriceObservation,
        });
      if (rows.length < PAGE) return out;
    }
  }
  async release(owner: string, rows: UnmatchedCapture[]) {
    for (const r of rows)
      fail((await this.db.from("market_capture_holds").delete().eq("user_id", owner).eq("ea_item_id", r.ea_item_id).eq("platform", r.observation.platform).eq("observed_at", r.observation.observed_at)).error);
  }
}
const holdKey = (h: UnmatchedCapture) => `${h.ea_item_id}|${h.observation.platform}|${new Date(h.observation.observed_at).toISOString()}`;

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
  ...(c.ea_item_id ? { ea_item_id: c.ea_item_id } : {}),
});

/** The caller's own cards plus the market-wide catalogue (FUT.GG card list, tracked cards only). */
export class PgMarketCardSource implements MarketCardSource {
  constructor(private db: FutDb, private rows: () => Promise<Row[]> = trackedCatalogue(db)) {}
  async list(owner: string): Promise<MarketCard[]> {
    const mine = (await searchMyCards(this.db, owner, { all: true })).map(toMarketCard);
    // The caller's own copy of an item wins, so a card isn't listed twice.
    const have = new Set(mine.flatMap((c) => (c.ea_item_id ? [c.ea_item_id] : [])));
    return [...mine, ...(await this.catalogue()).filter((c) => !c.ea_item_id || !have.has(c.ea_item_id))];
  }
  async catalogue(): Promise<MarketCard[]> {
    return (await this.rows()).map((r) => toMarketCard(catalogueCard(r)));
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
  const catalogue = trackedCatalogue(db);
  return createMarketService({
    prices: new PgPriceStore(db, sources.some((s) => s.id === "futgg_bulk" && s.status === "enabled"), catalogue), memberships: new PgMembershipStore(db), watchlists: new PgWatchlistStore(db),
    cards: new PgMarketCardSource(db, catalogue), holds: new PgCaptureHoldStore(db), sources, rules, chemistry, ...(now ? { now } : {}),
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
