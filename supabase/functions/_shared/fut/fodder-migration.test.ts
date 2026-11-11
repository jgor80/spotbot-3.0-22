// Real PostgreSQL (WASM, in memory) for fut.fodder_index: average of the 5 cheapest cards per rating per refresh.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

Deno.test("fodder_index: floor = mean of the 5 cheapest, ratings 81-91 only, service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
      CREATE TABLE fut.player_cards(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id UUID, source_id TEXT, source_card_key TEXT, overall SMALLINT);
      CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER, PRIMARY KEY (game_year, platform, ea_item_id, published_at));
      GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261111040000_fut_fodder_index.sql", import.meta.url)));
    // Ten 84s priced 1000..1900, and three 75s that must be ignored.
    await db.exec(`INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, overall) SELECT NULL, 'futgg_catalogue', (100 + g)::text, 84 FROM generate_series(1, 10) g;
      INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, overall) SELECT NULL, 'futgg_catalogue', (200 + g)::text, 75 FROM generate_series(1, 3) g;
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 100 + g, now() - interval '6 hours', 900 + g * 100 FROM generate_series(1, 10) g;
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 200 + g, now() - interval '6 hours', 200 FROM generate_series(1, 3) g;
      SET ROLE service_role;`);
    const r = (await db.query<{ r: { points: { rating: number; floor: number; n: number }[] } }>("SELECT fut.fodder_index('console', 7) AS r")).rows[0]!.r;
    assert(r.points.length === 1 && r.points[0]!.rating === 84 && Number(r.points[0]!.floor) === 1200 && Number(r.points[0]!.n) === 10, JSON.stringify(r.points));
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let refused = false;
    try { await db.query("SELECT fut.fodder_index('console', 7)"); } catch { refused = true; }
    assert(refused, "web roles can't call it");
  } finally { await db.close(); }
});
