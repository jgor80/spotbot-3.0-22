// Real PostgreSQL (WASM, in memory) for the Champs tracker tables: checks, cascade and service-role-only access.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }
const U = "00000000-0000-0000-0000-000000000001";

Deno.test("ut_runs / ut_games: score and mode checks, games go with their run, web roles locked out", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
      CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated; INSERT INTO auth.users VALUES ('${U}');`);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261111010000_fut_champs_tracker.sql", import.meta.url)));
    await db.exec("SET ROLE service_role");
    const run = (await db.query<{ id: string }>(`INSERT INTO fut.ut_runs(user_id, platform, mode, name, games_allowed) VALUES ('${U}', 'console', 'champs', 'W1', 15) RETURNING id`)).rows[0]!.id;
    await db.exec(`INSERT INTO fut.ut_games(run_id, user_id, goals_for, goals_against, opponent_formation) VALUES ('${run}', '${U}', 2, 1, '4-2-3-1')`);
    const bad = async (sql: string) => { try { await db.exec(sql); return false; } catch { return true; } };
    assert(await bad(`INSERT INTO fut.ut_games(run_id, user_id, goals_for, goals_against) VALUES ('${run}', '${U}', -1, 0)`), "negative goals refused");
    assert(await bad(`INSERT INTO fut.ut_runs(user_id, platform, mode, name) VALUES ('${U}', 'console', 'draft', 'x')`), "unknown mode refused");
    await db.exec(`DELETE FROM fut.ut_runs WHERE id = '${run}'`);
    assert((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM fut.ut_games")).rows[0]!.n === 0, "games deleted with the run");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    assert(await bad("SELECT * FROM fut.ut_games"), "web roles can't read it");
  } finally { await db.close(); }
});
