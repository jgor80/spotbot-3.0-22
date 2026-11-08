// Market-wide card list: pure builder, the download/save flow (mocked HTTP and RPC), and the SQL in real PostgreSQL (PGlite).
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
import { basePlayerId, buildCatalogue, eaPlayersUrl, syncFutggCatalogue } from "./futgg-catalogue.ts";
import { PgMarketCardSource, PgPriceStore } from "./market.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

// Three cards: Joe Cole base (27), Iniesta TOTW (50331648 + 41 = special version of base id 41), an unknown id.
const index = { v: 2, id0: 27, d: [50331648 + 41 - 27, 1] };
const ids = [27, 50331648 + 41, 50331648 + 42];
const pool = { v: 1, n: 3, id0: 27, idn: ids[2], o: [87, 92, 80], r: [12, 3, 1], g: [0, 0, 0], pos: [14, 18, 25], nat: [14, 45, 14], lg: [13, 2118, 13], cl: [11, 112658, 11], e: [3, 3, 3] };
const core = {
  rarities: [{ eaId: 12, name: "Base Icon" }, { eaId: 3, name: "Team of the week" }, { eaId: 1, name: "Rare" }],
  clubs: [{ eaId: 11, name: "Man Utd" }], nations: [{ eaId: 14, name: "England" }, { eaId: 45, name: "Spain" }], leagues: [{ eaId: 13, name: "Premier League" }],
};
const filler = Array.from({ length: 1200 }, (_, i) => ({ id: 1_000_000 + i, f: "A", l: `Player${i}`, r: 60 }));
const players = { Players: [{ id: 27, f: "Joe", l: "Cole", r: 87 }, ...filler], LegendsPlayers: [{ id: 41, f: "Andrés", l: "Iniesta Luján", c: "Iniesta", r: 92 }] };

Deno.test("card list: ids, names (common name first), positions and card types line up", () => {
  assert(basePlayerId(50331648 + 41) === 41);
  const cards = buildCatalogue({ index, pool, core, players, publishedAt: "2026-11-08T06:00:00.000Z" });
  assert(cards.length === 2, "unknown player is skipped, not guessed");
  const [cole, iniesta] = cards;
  assert(cole.ea_item_id === 27 && cole.name === "Joe Cole" && cole.position === "CM" && cole.club === "Man Utd" && cole.is_icon);
  assert(iniesta.ea_item_id === ids[1] && iniesta.name === "Iniesta" && iniesta.position === "CAM" && iniesta.version === "Team of the week" && !iniesta.is_icon);
  let threw = false;
  try { buildCatalogue({ index, pool: { ...pool, n: 4 }, core, players }); } catch { threw = true; }
  assert(threw, "a pool that doesn't match the index is refused");
});

Deno.test("card list: EA player file address comes from the Web App page", () => {
  const url = eaPlayersUrl(`window.fut_guid = "27A3C9F1-6B2E-4D7A-8C1F-2E9B5A4D6C7E";\nwindow.fut_year = "2027";`);
  assert(url === "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/27A3C9F1-6B2E-4D7A-8C1F-2E9B5A4D6C7E/2027/fut/items/web/players.json", url);
});

Deno.test("card list: downloads public files only, saves in batches, then marks tracked cards", async () => {
  const manifest = { _version: 1, "player-prices-index": "aa", "streamlined-pool": "bb", "fc-core-data": "cc", _published_at: { "streamlined-pool": 1794100000 } };
  const urls: string[] = [];
  const fetcher = (url: string) => {
    urls.push(url);
    const body = url.endsWith("manifest.json") ? manifest : url.includes("player-prices-index") ? index : url.includes("streamlined-pool") ? pool
      : url.includes("fc-core-data") ? core : url.endsWith("players.json") ? players : null;
    if (body) return Promise.resolve(new Response(JSON.stringify(body)));
    return Promise.resolve(new Response(`<script>window.fut_guid = "ABCDEF12-0000";window.fut_year = "2027";</script>`));
  };
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = { rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return Promise.resolve({ data: name === "refresh_futgg_tracked" ? 1 : (args.p_cards as unknown[]).length, error: null }); } };
  const r = await syncFutggCatalogue(db, fetcher);
  assert(r.cards === 2 && r.written === 2 && r.tracked === 1 && r.skipped === 1, JSON.stringify(r));
  assert(urls.length === 6 && urls.every((u) => u.startsWith("https://r2.fut.gg/27/") || u.startsWith("https://www.ea.com/ea-sports-fc/ultimate-team/web-app/")));
  assert(calls[0].name === "upsert_futgg_catalogue" && calls.at(-1)!.name === "refresh_futgg_tracked");
});

Deno.test("card list SQL: upsert is idempotent, tracked follows latest prices, and Market Lab lists it", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS 'SELECT NULL::uuid';");
    await pg.exec(await Deno.readTextFile(new URL("../../../migrations/20261102020000_fut_schema.sql", import.meta.url)));
    const base = await Deno.readTextFile(new URL("../../../migrations/20261102030000_fut_market.sql", import.meta.url));
    for (const name of ["market_price_sources", "market_provider_runs"]) {
      const sql = base.match(new RegExp(`CREATE TABLE fut\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0];
      assert(sql); await pg.exec(sql);
    }
    await pg.exec(await Deno.readTextFile(new URL("../../../migrations/20261108030000_futgg_bulk_prices.sql", import.meta.url)));
    await pg.exec(await Deno.readTextFile(new URL("../../../migrations/20261108160000_futgg_catalogue.sql", import.meta.url)));
    const cards = buildCatalogue({ index, pool, core, players, publishedAt: "2026-11-08T06:00:00.000Z" });
    const upsert = async (c = cards) => Number((await pg.query<{ n: number }>("SELECT fut.upsert_futgg_catalogue($1) AS n", [JSON.stringify(c)])).rows[0].n);
    assert(await upsert() === 2);
    assert(await upsert() === 0, "unchanged cards aren't rewritten");
    assert(await upsert([{ ...cards[0], overall: 88 }]) === 1);
    const published = new Date(Date.now() - 60_000).toISOString();
    await pg.query("SELECT fut.ingest_futgg_snapshot('console',27,$1,$2,$3)", [published, index, { v: 2, p: [500, 25000, 900], s: [0, 0, 0] }]);
    const tracked = Number((await pg.query<{ n: number }>("SELECT fut.refresh_futgg_tracked() AS n")).rows[0].n);
    assert(tracked === 1, `only the 25,000-coin card is tracked, got ${tracked}`);

    // Market Lab adapters over a tiny PostgREST-like shim of this database.
    const tracker = (await pg.query<{ id: string }>("SELECT id FROM fut.player_cards WHERE market_tracked")).rows[0].id;
    const rows = (await pg.query("SELECT * FROM fut.player_cards WHERE market_tracked")).rows as Record<string, unknown>[];
    const source = new PgMarketCardSource({} as never, () => Promise.resolve(rows));
    const listed = await source.catalogue();
    assert(listed.length === 1 && listed[0].id === tracker && listed[0].name === "Iniesta" && listed[0].category === "promo", JSON.stringify(listed));
    const quotes = (await pg.query("SELECT * FROM fut.futgg_prices WHERE price IS NOT NULL")).rows as Record<string, unknown>[];
    const q = (data: unknown[]) => { const self = { select: () => self, eq: () => self, in: () => self, gte: () => self, lte: () => self, order: () => self, is: () => self, range: () => Promise.resolve({ data, error: null }) }; return self; };
    const fakeDb = { from: (t: string) => q(t === "futgg_prices" ? quotes : []) };
    const store = new PgPriceStore(fakeDb, true, () => Promise.resolve(rows));
    const obs = await store.query("00000000-0000-0000-0000-000000000001", { platform: "console", as_of: new Date().toISOString() });
    assert(obs.some((o) => o.card_id === tracker && o.price === 25000 && o.source_id === "futgg_bulk"), JSON.stringify(obs));
  } finally { await pg.close(); }
});
