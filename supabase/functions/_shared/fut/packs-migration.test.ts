// Real PostgreSQL (WASM, in memory) for the Pack Advisor migration: tables and the price-band function.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
-- Only the columns pack_value_bands reads (the real tables come from earlier migrations).
CREATE TABLE fut.player_cards(id SERIAL PRIMARY KEY, owner_user_id UUID, source_id TEXT, source_card_key TEXT, overall SMALLINT,
  version TEXT, is_icon BOOLEAN NOT NULL DEFAULT false, is_hero BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER,
  PRIMARY KEY (game_year, platform, ea_item_id, published_at));
GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`;

async function packBandsFixture(db: PGlite, migration: string) {
  await db.exec(SETUP);
  await db.exec(migration);
  await db.exec(`INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, overall, version, is_icon) VALUES
    (NULL, 'futgg_catalogue', '1', 84, 'rare', false), (NULL, 'futgg_catalogue', '2', 84, 'rare', false),
    (NULL, 'futgg_catalogue', '3', 75, 'common', false), (NULL, 'futgg_catalogue', '4', 88, 'Icon', true),
    (NULL, 'futgg_catalogue', '5', 84, 'rare', false), ('00000000-0000-0000-0000-000000000001', 'user_entered', '1', 84, 'rare', false);
    INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '20 days'), (27, 'console', now() - interval '2 days'), (27, 'console', now() - interval '1 hour');
    INSERT INTO fut.futgg_prices SELECT 27, 'console', id, s.published_at, CASE id WHEN 1 THEN 1000 WHEN 2 THEN 3000 WHEN 3 THEN 300 WHEN 4 THEN 900000 END
      FROM generate_series(1, 5) id, fut.futgg_snapshots s;`);
}

Deno.test("pack_value_bands groups FUT.GG prices by rating and kind for the last week, service role only", async () => {
  const db = new PGlite();
  try {
    await packBandsFixture(db, await Deno.readTextFile(new URL("../../../migrations/20261109200000_fut_pack_advisor.sql", import.meta.url)));
    await db.exec("INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001')");
    await db.exec(`INSERT INTO fut.pack_offers(user_id, platform, pack_id, coins, odds, seen_at) VALUES ('00000000-0000-0000-0000-000000000001', 'console', 101, 7500, '[]', now())`);
    await db.exec("SET ROLE service_role");
    const r = await db.query<{ result: { snapshots: { published_at: string; bands: [number, string, number, number, number, number][] }[] } }>("SELECT fut.pack_value_bands('console', 8) AS result");
    const snaps = r.rows[0]!.result.snapshots;
    assert(snaps.length === 2, `the 20-day-old refresh is outside the window, got ${snaps.length}`);
    const bands = snaps.at(-1)!.bands;
    const rare84 = bands.find((b) => b[0] === 84 && b[1] === "rare");
    assert(rare84 && rare84[2] === 2 && rare84[4] === 2000 && rare84[5] === 2000, `84 rare: two priced cards (card 5 has no price), median 2000: ${JSON.stringify(rare84)}`);
    assert(bands.some((b) => b[0] === 88 && b[1] === "special" && b[4] === 900000), "Icons count as special");
    assert(bands.some((b) => b[0] === 75 && b[1] === "common" && b[4] === 300), "common cards are their own kind");
    const empty = await db.query<{ result: { snapshots: unknown[] } }>("SELECT fut.pack_value_bands('pc', 8) AS result");
    assert(empty.rows[0]!.result.snapshots.length === 0);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT fut.pack_value_bands('console', 8)"); } catch { denied = true; } assert(denied, "web roles can't call it");
    denied = false; try { await db.query("SELECT * FROM fut.pack_offers"); } catch { denied = true; } assert(denied, "web roles can't read packs");
  } finally { await db.close(); }
});
