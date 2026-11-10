// Real PostgreSQL (WASM, in memory) for the club sharing tables: defaults off, rating checks, service-role-only access.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }
const U = "00000000-0000-0000-0000-000000000001";

Deno.test("club_share: off by default, min rating 75-99, posts per pull, web roles locked out", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
      CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated; INSERT INTO auth.users VALUES ('${U}');`);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261111020000_fut_club_share.sql", import.meta.url)));
    await db.exec("SET ROLE service_role");
    await db.exec(`INSERT INTO fut.club_share(user_id) VALUES ('${U}')`);
    const row = (await db.query<{ share_pulls: boolean; share_board: boolean; min_pull_rating: number }>("SELECT * FROM fut.club_share")).rows[0]!;
    assert(!row.share_pulls && !row.share_board && row.min_pull_rating === 86, JSON.stringify(row));
    const bad = async (sql: string) => { try { await db.exec(sql); return false; } catch { return true; } };
    assert(await bad(`UPDATE fut.club_share SET min_pull_rating = 60`), "rating below 75 refused");
    await db.exec(`INSERT INTO fut.club_pull_posts(user_id, item_id) VALUES ('${U}', 5)`);
    assert(await bad(`INSERT INTO fut.club_pull_posts(user_id, item_id) VALUES ('${U}', 5)`), "a pull is posted once");
    await db.exec("RESET ROLE; DELETE FROM auth.users; SET ROLE service_role");
    assert((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM fut.club_pull_posts")).rows[0]!.n === 0, "removed with the account");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    assert(await bad("SELECT * FROM fut.club_share"), "web roles can't read it");
  } finally { await db.close(); }
});
