// Real PostgreSQL (WASM, in memory) for the price alerts migration: candidates join watchlist targets to FUT.GG prices.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
CREATE TABLE fut.player_cards(id UUID PRIMARY KEY, owner_user_id UUID, source_id TEXT, source_card_key TEXT, player_name TEXT, overall SMALLINT);
CREATE TABLE fut.market_watchlist(user_id UUID, card_id UUID, platform TEXT, target_buy INTEGER, target_sell INTEGER, PRIMARY KEY (user_id, card_id, platform));
CREATE TABLE fut.futgg_snapshots(game_year INTEGER, platform TEXT, published_at TIMESTAMPTZ, PRIMARY KEY (game_year, platform, published_at));
CREATE TABLE fut.futgg_prices(game_year INTEGER, platform TEXT, ea_item_id BIGINT, published_at TIMESTAMPTZ, price INTEGER, PRIMARY KEY (game_year, platform, ea_item_id, published_at));
GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;`;
const U = "00000000-0000-0000-0000-000000000001", U2 = "00000000-0000-0000-0000-000000000002";
const A = "10000000-0000-0000-0000-000000000001", B = "10000000-0000-0000-0000-000000000002";

Deno.test("price_alert_candidates: watched cards with targets or move alerts, latest and previous price; service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261110210000_fut_price_alerts.sql", import.meta.url)));
    await db.exec(`INSERT INTO auth.users VALUES ('${U}'), ('${U2}');
      INSERT INTO fut.player_cards VALUES ('${A}', NULL, 'futgg_catalogue', '501', 'Star', 88), ('${B}', NULL, 'futgg_catalogue', '502', 'Other', 80);
      INSERT INTO fut.market_watchlist VALUES ('${U}', '${A}', 'console', 9000, NULL), ('${U}', '${B}', 'console', NULL, NULL), ('${U2}', '${B}', 'console', NULL, NULL);
      INSERT INTO fut.alert_settings(user_id, dm, move_pct) VALUES ('${U2}', true, 10);
      INSERT INTO fut.futgg_snapshots VALUES (27, 'console', now() - interval '12 hours'), (27, 'console', now() - interval '1 minute');
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 501, published_at, CASE WHEN published_at > now() - interval '1 hour' THEN 8800 ELSE 9500 END FROM fut.futgg_snapshots;
      INSERT INTO fut.futgg_prices SELECT 27, 'console', 502, published_at, CASE WHEN published_at > now() - interval '1 hour' THEN 2000 ELSE 2500 END FROM fut.futgg_snapshots;`);
    await db.exec("SET ROLE service_role");
    const r = await db.query<{ result: { user_id: string; card_id: string; price: number; previous_price: number; move_pct: number | null }[] }>("SELECT fut.price_alert_candidates() AS result");
    const rows = r.rows[0]!.result;
    assert(rows.length === 2, `U's targeted card and U2's move-alert card, not U's untargeted one: ${JSON.stringify(rows)}`);
    const a = rows.find((x) => x.card_id === A)!, b = rows.find((x) => x.user_id === U2)!;
    assert(a.price === 8800 && a.previous_price === 9500, JSON.stringify(a));
    assert(b.move_pct === 10 && b.price === 2000, JSON.stringify(b));
    await db.exec(`RESET ROLE; UPDATE fut.alert_settings SET dm = false WHERE user_id = '${U2}'; SET ROLE service_role`);
    const off = await db.query<{ result: unknown[] }>("SELECT fut.price_alert_candidates() AS result");
    assert(off.rows[0]!.result.length === 1, "DMs off means no candidates");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT fut.price_alert_candidates()"); } catch { denied = true; } assert(denied, "web roles can't call it");
  } finally { await db.close(); }
});
