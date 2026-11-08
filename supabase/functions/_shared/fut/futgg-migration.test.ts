// Real PostgreSQL (WASM, in memory): no production database, Docker or credentials needed.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

Deno.test("FUT.GG SQL ingestion is atomic, idempotent and service-role-only", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role,authenticated;");
    const base = await Deno.readTextFile(new URL("../../../migrations/20261102030000_fut_market.sql", import.meta.url));
    for (const name of ["market_price_sources", "market_provider_runs"]) {
      const sql = base.match(new RegExp(`CREATE TABLE fut\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0];
      assert(sql); await db.exec(sql);
    }
    await db.exec("GRANT ALL ON fut.market_price_sources,fut.market_provider_runs TO service_role; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA fut TO service_role;");
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261108030000_futgg_bulk_prices.sql", import.meta.url)));
    const published = new Date(Date.now() - 60_000).toISOString();
    const index = { v: 2, id0: 100, d: [10, 20, 30] }, blob = { v: 2, p: [1000, 0, 5000, 0], s: [0, 0, 1, 2] };
    const ingest = (prices = blob, time = published, platform = "console") => db.query("SELECT fut.ingest_futgg_snapshot($1,27,$2,$3,$4) AS result", [platform, time, index, prices]);
    await db.exec("SET ROLE service_role");
    await ingest();
    const first = await db.query<{ ea_item_id: number; price: number | null }>("SELECT ea_item_id,price FROM fut.futgg_prices ORDER BY ea_item_id");
    assert(first.rows.length === 4 && Number(first.rows[0].ea_item_id) === 100 && first.rows[0].price === 1000);
    assert(first.rows[2].price === null, "SBC cost is not a market quote");
    await ingest();
    assert(Number((await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM fut.futgg_prices")).rows[0].n) === 4);
    for (const attempt of [() => ingest({ ...blob, s: [0, 0, 9, 2] }, new Date(Date.now() - 30_000).toISOString()),
      () => ingest({ ...blob, p: [2000, 0, 5000, 0] }), () => ingest(blob, new Date(Date.now() - 120_000).toISOString())]) {
      let failed = false; try { await attempt(); } catch { failed = true; } assert(failed);
    }
    assert(Number((await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM fut.futgg_prices")).rows[0].n) === 4, "Failed snapshots must roll back entirely");
    await ingest(blob, published, "pc");
    assert(Number((await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM fut.futgg_prices")).rows[0].n) === 8);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT * FROM fut.futgg_prices"); } catch { denied = true; } assert(denied);
    denied = false; try { await ingest(); } catch { denied = true; } assert(denied, "Web roles cannot invoke ingestion");
    await db.exec("RESET ROLE; SET ROLE service_role");
    const largeIndex = { v: 2, id0: 1, d: Array(1499).fill(1) };
    const largePrices = { v: 2, p: Array(1500).fill(1000), s: Array(1500).fill(0) };
    const newer = new Date(Date.now() - 1000).toISOString();
    await db.query("SELECT fut.ingest_futgg_snapshot('console',27,$1,$2,$3)", [newer, largeIndex, largePrices]);
    const large = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM fut.futgg_prices WHERE platform='console' AND published_at=$1", [newer]);
    assert(Number(large.rows[0].n) === 1500, "Ingestion must retain entries beyond the REST page limit");
  } finally { await db.close(); }
});
