// Real PostgreSQL (WASM, in memory) for hourly hot prices and the price history chart.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
CREATE TABLE fut.market_price_sources(id TEXT PRIMARY KEY, status TEXT); INSERT INTO fut.market_price_sources VALUES ('futgg_bulk', 'enabled');
CREATE TABLE fut.player_cards(id UUID PRIMARY KEY, owner_user_id UUID, source_id TEXT, source_card_key TEXT, player_name TEXT, overall SMALLINT, market_tracked BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE fut.market_watchlist(user_id UUID, card_id UUID, platform TEXT, PRIMARY KEY (user_id, card_id, platform));
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER, PRIMARY KEY (game_year, platform, ea_item_id, published_at));
GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`;

Deno.test("ingest_futgg_hot keeps only hot cards once per publication; card_price_history merges full + hourly with crash markers", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261111000000_fut_price_history.sql", import.meta.url)));
    // ids 100, 110, 130: 100 is market-tracked, 110 is on a watchlist, 130 is nobody's.
    await db.exec(`INSERT INTO fut.player_cards VALUES ('00000000-0000-0000-0000-00000000000a', NULL, 'futgg_catalogue', '100', 'Hot', 85, true),
      ('00000000-0000-0000-0000-00000000000b', NULL, 'futgg_catalogue', '110', 'Watched', 84, false), ('00000000-0000-0000-0000-00000000000c', NULL, 'futgg_catalogue', '130', 'Cold', 70, false);
      INSERT INTO fut.market_watchlist VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'console');
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '13 hours'), (27, 'console', now() - interval '25 hours');
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 100, published_at, CASE WHEN published_at > now() - interval '20 hours' THEN 9000 ELSE 10000 END FROM fut.futgg_snapshots;
      INSERT INTO fut.player_cards SELECT gen_random_uuid(), NULL, 'futgg_catalogue', (1000 + g)::text, 'Tracked', 84, true FROM generate_series(1, 60) g;
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 1000 + g, s.published_at, CASE WHEN s.published_at > now() - interval '20 hours' THEN 900 ELSE 1000 END FROM generate_series(1, 60) g CROSS JOIN fut.futgg_snapshots s;
      SET ROLE service_role;`);
    const idx = { v: 2, id0: 100, d: [10, 20] }, pr = { v: 2, p: [9500, 2000, 300], s: [0, 0, 0] };
    const call = (at: string) => db.query<{ r: { unchanged: boolean; kept?: number } }>("SELECT fut.ingest_futgg_hot('console', 27, $1::timestamptz, $2::jsonb, $3::jsonb) AS r", [at, JSON.stringify(idx), JSON.stringify(pr)]);
    const at = new Date(Date.now() - 3600_000).toISOString();
    const r1 = (await call(at)).rows[0]!.r;
    assert(r1.unchanged === false && r1.kept === 2, `tracked + watched kept, cold dropped: ${JSON.stringify(r1)}`);
    assert((await call(at)).rows[0]!.r.unchanged === true, "same publication twice is a no-op");
    const older = (await call(new Date(Date.now() - 7200_000).toISOString())).rows[0]!.r;
    assert(older.unchanged === true, "older than what we hold is skipped");
    const latest = await db.query<{ t: string }>("SELECT fut.futgg_latest_published('console')::text AS t");
    assert(Date.parse(latest.rows[0]!.t) === Date.parse(at), "latest publication includes hourly runs");
    const h = (await db.query<{ r: { points: { price: number; kind: string }[]; market_drops: unknown[] } }>("SELECT fut.card_price_history('console', 100, 7) AS r")).rows[0]!.r;
    assert(h.points.map((p) => p.price).join() === "10000,9000,9500" && h.points[2]!.kind === "hourly", JSON.stringify(h.points));
    const drops = h.market_drops as { median_move: number; cards: number }[];
    assert(drops.length === 1 && drops[0]!.median_move === -10 && drops[0]!.cards === 61, `the 10% market-wide fall is marked: ${JSON.stringify(drops)}`);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT fut.card_price_history('console', 100, 7)"); } catch { denied = true; } assert(denied, "web roles can't call it");
  } finally { await db.close(); }
});
