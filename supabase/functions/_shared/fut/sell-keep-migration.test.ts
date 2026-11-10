// Real PostgreSQL (WASM, in memory) for the sell-or-keep migration: price now, 1/3/7 days back, 14-day range, floors.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
CREATE TABLE fut.player_cards(id UUID PRIMARY KEY, owner_user_id UUID, source_id TEXT, source_card_key TEXT, player_name TEXT, overall SMALLINT);
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER, PRIMARY KEY (game_year, platform, ea_item_id, published_at));
GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`;

Deno.test("card_price_trend: latest, 1/3/7-day-old prices, 14-day low/high and per-overall floors; service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261110230000_fut_sell_or_keep.sql", import.meta.url)));
    // Twice-daily snapshots over 10 days; card 501's price falls 100 coins per snapshot from 12,000.
    await db.exec(`INSERT INTO fut.futgg_snapshots SELECT 27, 'console', timestamptz '2026-11-10 06:00Z' - make_interval(hours => 12 * g) FROM generate_series(0, 19) g;
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 501, published_at, 10000 + 100 * (EXTRACT(EPOCH FROM timestamptz '2026-11-10 06:00Z' - published_at) / 43200)::int FROM fut.futgg_snapshots;
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 502, published_at, 800 FROM fut.futgg_snapshots WHERE published_at = (SELECT max(published_at) FROM fut.futgg_snapshots);
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 503, published_at, 950 FROM fut.futgg_snapshots WHERE published_at = (SELECT max(published_at) FROM fut.futgg_snapshots);
      INSERT INTO fut.player_cards VALUES (gen_random_uuid(), NULL, 'futgg_catalogue', '501', 'Falling', 86), (gen_random_uuid(), NULL, 'futgg_catalogue', '502', 'Cheap 84', 84),
        (gen_random_uuid(), NULL, 'futgg_catalogue', '503', 'Other 84', 84), (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'futgg_catalogue', '502', 'Mine', 70);
      SET ROLE service_role;`);
    const r = await db.query<{ r: { items: { ea_item_id: number; price: number; d1: number; d3: number; d7: number; low14: number; high14: number; points: number }[]; floors: Record<string, number> } }>("SELECT fut.card_price_trend('console', ARRAY[501, 502]::BIGINT[]) AS r");
    const res = r.rows[0]!.r, a = res.items.find((i) => i.ea_item_id === 501)!;
    assert(a.price === 10_000 && a.d1 === 10_200 && a.d3 === 10_600 && a.d7 === 11_400, JSON.stringify(a));
    assert(a.low14 === 10_000 && a.high14 === 11_900 && a.points === 20, JSON.stringify(a));
    assert(res.items.length === 2 && res.floors["84"] === 800 && res.floors["86"] === 10_000 && !res.floors["70"], JSON.stringify(res.floors));
    let bad = false; try { await db.query("SELECT fut.card_price_trend('xbox', ARRAY[1]::BIGINT[])"); } catch { bad = true; } assert(bad, "platform checked");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT fut.card_price_trend('console', ARRAY[1]::BIGINT[])"); } catch { denied = true; } assert(denied, "web roles can't call it");
  } finally { await db.close(); }
});
