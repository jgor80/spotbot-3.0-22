// Real PostgreSQL (WASM, in memory) for the My Account migration: tables, privacy and the item price lookup.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
-- Only the columns account_item_prices reads (the real tables come from earlier migrations).
CREATE TABLE fut.player_cards(id SERIAL PRIMARY KEY, owner_user_id UUID, source_id TEXT, source_card_key TEXT, player_name TEXT, version TEXT,
  overall SMALLINT, positions TEXT[]);
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER,
  PRIMARY KEY (game_year, platform, ea_item_id, published_at));
GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`;

Deno.test("account_item_prices names and prices pile items from the catalogue, service role only; account tables are private", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261109230000_fut_account_capture.sql", import.meta.url)));
    await db.exec(`INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
      INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, player_name, version, overall, positions) VALUES
        (NULL, 'futgg_catalogue', '501', 'Star Striker', 'rare', 86, '{ST}'), (NULL, 'futgg_catalogue', '502', 'Solid Back', 'rare', 82, '{CB}'),
        ('00000000-0000-0000-0000-000000000001', 'user_entered', '503', 'Mine Only', 'rare', 80, '{CM}');
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '1 day'), (27, 'console', now() - interval '1 hour');
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 501, published_at, CASE WHEN published_at > now() - interval '2 hours' THEN 30000 ELSE 25000 END FROM fut.futgg_snapshots;
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 504, max(published_at), 900 FROM fut.futgg_snapshots;
      INSERT INTO fut.account_state(user_id, platform, balance, balance_at) VALUES ('00000000-0000-0000-0000-000000000001', 'console', '{"coins":1}', now());`);
    await db.exec("SET ROLE service_role");
    const r = await db.query<{ result: { published_at: string; items: { ea_item_id: number; player_name: string | null; price: number | null }[] } }>(
      "SELECT fut.account_item_prices('console', ARRAY[501, 502, 503, 504, 999]::BIGINT[]) AS result");
    const items = r.rows[0]!.result.items;
    assert(items.map((i) => i.ea_item_id).join() === "501,502,504", JSON.stringify(items));
    assert(items[0]!.player_name === "Star Striker" && items[0]!.price === 30000, "latest refresh price");
    assert(items[1]!.price === null && items[2]!.player_name === null && items[2]!.price === 900, "name without price, price without name");
    const empty = await db.query<{ result: { items: unknown[] } }>("SELECT fut.account_item_prices('pc', ARRAY[501]::BIGINT[]) AS result");
    assert(empty.rows[0]!.result.items.length === 1 && (empty.rows[0]!.result.items[0] as { price: number | null }).price === null, "no pc prices");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT fut.account_item_prices('console', ARRAY[501]::BIGINT[])"); } catch { denied = true; } assert(denied, "web roles can't call it");
    denied = false; try { await db.query("SELECT * FROM fut.account_state"); } catch { denied = true; } assert(denied, "web roles can't read accounts");
  } finally { await db.close(); }
});
