// Real PostgreSQL (WASM, in memory) for fut.random_cards (seeded, weighted, filtered) and fut.draft_scores.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }
const U = "00000000-0000-0000-0000-000000000001";

Deno.test("random_cards: same seed same cards, filters by rating and main position; draft_scores checks", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${U}'); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;
      CREATE TABLE fut.player_cards(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id UUID, source_id TEXT, source_card_key TEXT, player_name TEXT, overall SMALLINT, positions TEXT[], club TEXT, league TEXT, nation TEXT, is_icon BOOLEAN DEFAULT false, is_hero BOOLEAN DEFAULT false, version TEXT);
      GRANT SELECT ON ALL TABLES IN SCHEMA fut TO service_role;
      INSERT INTO fut.player_cards(owner_user_id, source_id, source_card_key, player_name, overall, positions)
        SELECT NULL, 'futgg_catalogue', (1000 + g)::text, 'P' || g, 70 + (g % 25), CASE WHEN g % 2 = 0 THEN ARRAY['ST'] ELSE ARRAY['CB', 'ST'] END FROM generate_series(1, 400) g;`);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261111050000_fut_draft.sql", import.meta.url)));
    await db.exec("SET ROLE service_role");
    type C = { id: string; overall: number; positions: string[] };
    const pick = async (seed: string, pos: string | null, min = 75, power = 2) => (await db.query<{ r: C[] }>("SELECT fut.random_cards($1, 5, $2, 99, $3, $4) AS r", [seed, min, pos, power])).rows[0]!.r;
    const a = await pick("abc123:ST", "ST"), b = await pick("abc123:ST", "ST"), c = await pick("zzz999:ST", "ST");
    assert(a.length === 5 && JSON.stringify(a) === JSON.stringify(b), "same seed, same cards");
    assert(JSON.stringify(a) !== JSON.stringify(c), "another seed, other cards");
    assert(a.every((x) => x.overall >= 75 && x.positions[0] === "ST"), JSON.stringify(a));
    // Weighting: over many seeds, the average pick is above the pool's average (75-94 → 84.5).
    let sum = 0, n = 0;
    for (let i = 0; i < 40; i++) for (const x of await pick(`seed${i}`, null)) { sum += x.overall; n++; }
    assert(sum / n > 86, `weighted towards higher ratings: ${sum / n}`);
    await db.exec(`INSERT INTO fut.draft_scores(user_id, seed, formation, rating, chemistry, score, squad) VALUES ('${U}', 'abc123', '4-3-3', 85, 30, 115, '[]')`);
    let bad = false;
    try { await db.exec(`INSERT INTO fut.draft_scores(user_id, seed, formation, rating, chemistry, score, squad) VALUES ('${U}', 'BAD CODE', '4-3-3', 85, 30, 115, '[]')`); } catch { bad = true; }
    assert(bad, "draft codes are lowercase letters and numbers");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let refused = false;
    try { await db.query("SELECT fut.random_cards('abc123', 5, 75, 99)"); } catch { refused = true; }
    assert(refused, "web roles can't call it");
  } finally { await db.close(); }
});
