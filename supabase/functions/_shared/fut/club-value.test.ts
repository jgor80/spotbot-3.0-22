// Club trade value (fut.club_trade_value) in real PostgreSQL (PGlite): tradeable copies, FUT.GG vs own captures, tax.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";

function assert(ok: unknown, msg = "assertion failed"): asserts ok {
  if (!ok) throw new Error(msg);
}
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const sql = (name: string) => Deno.readTextFile(new URL(`../../../migrations/${name}`, import.meta.url));

Deno.test("club value SQL: tradeable vs untradeable, newest price wins, after-tax totals, own cards only", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS 'SELECT NULL::uuid';");
    await pg.exec(await sql("20261102020000_fut_schema.sql"));
    await pg.exec(await sql("20261102030000_fut_market.sql"));
    // Per-owner card keys from the club sync migration (two users can own the same card version).
    for (const stmt of (await sql("20261102090000_fut_club_sync.sql")).match(/(DROP INDEX[^;]*;|CREATE UNIQUE INDEX[^;]*;)/g) ?? []) await pg.exec(stmt);
    await pg.exec(await sql("20261108030000_futgg_bulk_prices.sql"));
    await pg.exec(await sql("20261109210000_fut_club_trade_value.sql"));
    await pg.query("INSERT INTO auth.users(id) VALUES ($1), ($2)", [ME, OTHER]);
    const card = async (owner: string, ea: number, name: string, synced: string) =>
      (await pg.query<{ id: string }>(`INSERT INTO fut.player_cards (owner_user_id, season, player_name, overall, positions, evidence, source_id, source_card_key, source_updated_at)
        VALUES ($1, 'FC27', $2, 85, ARRAY['ST'], 'game_data', 'user_entered', $3, $4) RETURNING id`, [owner, name, String(ea), synced])).rows[0].id;
    const sync = "2026-11-09T10:00:00Z";
    const a = await card(ME, 101, "Two copies", sync);      // 1 tradeable of 2, FUT.GG 10,000
    const b = await card(ME, 102, "Untradeable", sync);     // untradeable, FUT.GG 50,000
    const c = await card(ME, 103, "Captured", sync);        // tradeable, FUT.GG 2,000 but a newer capture of 3,000
    const d = await card(ME, 104, "No price", "2026-11-01T10:00:00Z"); // tradeable, unpriced, not in the last sync
    const o = await card(OTHER, 101, "Someone else's", sync);
    const inv = (user: string, id: string, tradeable: boolean, quantity: number, tq: number | null) =>
      pg.query("INSERT INTO fut.club_inventory (user_id, card_id, tradeable, quantity, tradeable_quantity) VALUES ($1, $2, $3, $4, $5)", [user, id, tradeable, quantity, tq]);
    await inv(ME, a, false, 2, 1); await inv(ME, b, false, 1, 0); await inv(ME, c, true, 1, null); await inv(ME, d, true, 1, 1); await inv(OTHER, o, true, 1, 1);
    const published = "2026-11-09T06:00:00Z";
    await pg.query("INSERT INTO fut.futgg_snapshots (game_year, platform, published_at, card_count, priced_count, payload_hash) VALUES (27, 'console', $1, 3, 3, 'x')", [published]);
    for (const [ea, price] of [[101, 10000], [102, 50000], [103, 2000]])
      await pg.query("INSERT INTO fut.futgg_prices (game_year, platform, ea_item_id, published_at, received_at, price, status_code) VALUES (27, 'console', $1, $2, $2, $3, 0)", [ea, published, price]);
    await pg.query(`INSERT INTO fut.market_price_observations (card_id, platform, price, kind, observed_at, received_at, source_id, owner_user_id, evidence)
      VALUES ($1, 'console', 3000, 'lowest_bin', '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z', 'web_app_capture', $2, 'game_data'),
             ($1, 'console', 1500, 'lowest_bin', '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z', 'web_app_capture', $2, 'game_data')`, [c, ME]);

    type Out = { totals: Record<string, number>; cards: { player_name: string; price: number | null; price_source: string | null; value: number | null; value_after_tax: number | null; tradeable_quantity: number; missing_from_last_sync: boolean }[] };
    const r = (await pg.query<{ r: Out }>("SELECT fut.club_trade_value($1, 'console') AS r", [ME])).rows[0].r;
    const by = (n: string) => r.cards.find((x) => x.player_name === n)!;
    assert(r.cards.length === 4 && !r.cards.some((x) => x.player_name === "Someone else's"), JSON.stringify(r.cards));
    assert(by("Two copies").value === 10000 && by("Two copies").value_after_tax === 9500 && by("Two copies").price_source === "futgg");
    assert(by("Captured").price === 3000 && by("Captured").price_source === "web_app_capture" && by("Captured").tradeable_quantity === 1);
    assert(by("Untradeable").value === 0 && by("No price").price === null && by("No price").missing_from_last_sync && !by("Captured").missing_from_last_sync);
    const t = r.totals;
    assert(t.tradeable_cards === 3 && t.untradeable_cards === 1 && t.priced_tradeable === 2 && t.unpriced_tradeable === 1, JSON.stringify(t));
    assert(t.value === 13000 && t.value_after_tax === 9500 + 2850 && t.untradeable_value === 60000, JSON.stringify(t));
    assert(r.cards[0].player_name === "Two copies", "most valuable tradeable card first");
    const pc = (await pg.query<{ r: Out }>("SELECT fut.club_trade_value($1, 'pc') AS r", [ME])).rows[0].r;
    assert(pc.totals.value === 0 && pc.cards.every((x) => x.price === null), "no PC prices");
  } finally { await pg.close(); }
});
