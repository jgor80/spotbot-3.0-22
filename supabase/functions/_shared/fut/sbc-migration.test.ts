// Real PostgreSQL (WASM, in memory) for the SBC Solver migration: the challenges column and the market card pool.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
-- Only the columns sbc_card_pool reads (the real tables come from earlier migrations).
CREATE TABLE fut.player_cards(id SERIAL PRIMARY KEY, owner_user_id UUID, source_id TEXT, source_card_key TEXT, player_name TEXT, version TEXT,
  overall SMALLINT, positions TEXT[], club TEXT, league TEXT, nation TEXT, is_icon BOOLEAN NOT NULL DEFAULT false, is_hero BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER,
  PRIMARY KEY (game_year, platform, ea_item_id, published_at));
GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`;

Deno.test("sbc_card_pool: cheapest per rating, named groups, specials and owned item details; service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261109230000_fut_account_capture.sql", import.meta.url)));
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261110180000_fut_sbc_solver.sql", import.meta.url)));
    await db.exec(`INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, player_name, version, overall, positions, club, league, nation, is_icon)
      SELECT NULL, 'futgg_catalogue', i::TEXT, 'Card ' || i, CASE WHEN i = 30 THEN 'Team of the Week' ELSE 'Rare' END, 80 + (i % 3), '{CM}',
        'Club ' || (i % 5), CASE WHEN i % 10 = 0 THEN 'Serie A' ELSE 'Premier League' END, 'England', false
      FROM generate_series(1, 40) i;
      INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, player_name, overall, positions) VALUES (NULL, 'futgg_catalogue', '99', 'No Price', 70, '{ST}');
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '1 hour');
      INSERT INTO fut.futgg_prices SELECT 27, 'console', i, now() - interval '1 hour', 1000 + i * 10 FROM generate_series(1, 40) i;`);
    await db.exec("SET ROLE service_role");
    const r = await db.query<{ result: { market: { ea_item_id: number; price: number; overall: number; league: string }[]; items: { ea_item_id: number; price: number | null }[] } }>(
      "SELECT fut.sbc_card_pool('console', ARRAY[99, 1]::BIGINT[], ARRAY['serie a'], 2) AS result");
    const { market, items } = r.rows[0]!.result;
    const ids = new Set(market.map((m) => Number(m.ea_item_id)));
    for (const id of [3, 1, 2]) assert(ids.has(id), `cheapest at each rating includes ${id}: ${[...ids]}`);
    for (const id of [10, 20, 30, 40]) assert(ids.has(id), `every Serie A card (named) ${id}`);
    assert(ids.has(30), "special card");
    assert(!ids.has(99), "no unpriced market cards");
    assert(items.length === 2 && items.some((i) => Number(i.ea_item_id) === 99 && i.price === null), `owned item details even without a price: ${JSON.stringify(items)}`);
    await db.exec("RESET ROLE");
    await db.exec("INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'); INSERT INTO fut.account_state(user_id, platform, sbc_challenges, sbc_challenges_at) VALUES ('00000000-0000-0000-0000-000000000001', 'console', '[]', now())");
    await db.exec("SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT fut.sbc_card_pool('console')"); } catch { denied = true; } assert(denied, "web roles can't call it");
  } finally { await db.close(); }
});
