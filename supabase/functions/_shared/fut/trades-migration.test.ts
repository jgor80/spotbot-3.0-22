// Real PostgreSQL (WASM, in memory) for the trade log migration: one row per item, service role only.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const SETUP = `CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;`;
const U = "00000000-0000-0000-0000-000000000001";

Deno.test("trade_log: keyed by user, platform and EA item id; big ids fit; web roles can't read it", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261110220000_fut_trade_log.sql", import.meta.url)));
    await db.exec(`INSERT INTO auth.users VALUES ('${U}'); SET ROLE service_role;
      INSERT INTO fut.trade_log(user_id, platform, item_id, ea_item_id, bought_for, bought_source) VALUES ('${U}', 'console', 400123456789, 50331648, 1000, 'watchlist');
      INSERT INTO fut.trade_log(user_id, platform, item_id, ea_item_id, sold_for) VALUES ('${U}', 'console', 400123456789, 50331648, 2000)
        ON CONFLICT (user_id, platform, item_id) DO UPDATE SET sold_for = excluded.sold_for;`);
    const r = await db.query<{ n: number; bought_for: number; sold_for: number }>("SELECT count(*)::int AS n, max(bought_for) AS bought_for, max(sold_for) AS sold_for FROM fut.trade_log");
    assert(r.rows[0]!.n === 1 && r.rows[0]!.bought_for === 1000 && r.rows[0]!.sold_for === 2000, JSON.stringify(r.rows));
    let bad = false; try { await db.exec(`INSERT INTO fut.trade_log(user_id, platform, item_id, ea_item_id, bought_source) VALUES ('${U}', 'console', 2, 1, 'search')`); } catch { bad = true; }
    assert(bad, "bought_source is checked");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT * FROM fut.trade_log"); } catch { denied = true; } assert(denied, "web roles can't read it");
  } finally { await db.close(); }
});
