// Real PostgreSQL (WASM, in memory) for fut.market_steps: median step move per rating band of tracked cards.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

Deno.test("market_steps: per-band median moves between refreshes, tracked cards only, service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
      CREATE TABLE fut.player_cards(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id UUID, source_id TEXT, source_card_key TEXT, overall SMALLINT, market_tracked BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
      CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER, PRIMARY KEY (game_year, platform, ea_item_id, published_at));
      GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261111030000_fut_market_calendar.sql", import.meta.url)));
    await db.exec(`INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, overall, market_tracked)
        SELECT NULL, 'futgg_catalogue', (1000 + g)::text, CASE WHEN g <= 20 THEN 86 ELSE 89 END, g <= 40 FROM generate_series(1, 50) g;
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '13 hours'), (27, 'console', now() - interval '25 hours');
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 1000 + g, s.published_at,
        CASE WHEN s.published_at > now() - interval '20 hours' THEN CASE WHEN g <= 20 THEN 900 ELSE 1100 END ELSE 1000 END
        FROM generate_series(1, 50) g CROSS JOIN fut.futgg_snapshots s;
      SET ROLE service_role;`);
    const r = (await db.query<{ r: { steps: { band: string; move: number; cards: number }[] } }>("SELECT fut.market_steps('console', 30) AS r")).rows[0]!.r;
    const by = Object.fromEntries(r.steps.map((s) => [s.band, s]));
    assert(Number(by["85-87"]!.move) === -10 && Number(by["88-90"]!.move) === 10 && by["88-90"]!.cards === 20, JSON.stringify(r.steps));
    assert(by.all!.cards === 40, "untracked cards left out");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let refused = false;
    try { await db.query("SELECT fut.market_steps('console', 30)"); } catch { refused = true; }
    assert(refused, "web roles can't call it");
  } finally { await db.close(); }
});
