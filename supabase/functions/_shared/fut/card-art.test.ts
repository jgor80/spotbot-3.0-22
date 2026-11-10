// Card art addresses: the address check, the import, and the SQL (real PostgreSQL in WASM).
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
import { cleanArtUrl, importCardArt } from "./card-art.ts";
import type { FutDb } from "./service.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

const C = "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/X/2027/fut/items/images/backgrounds/itemBGs/large";

Deno.test("card art: only https EA image addresses, without query strings", () => {
  assert(cleanArtUrl(`${C}/cards_bg_e_1_3_0.png?x=1`) === `${C}/cards_bg_e_1_3_0.png`, "kept");
  for (const bad of ["http://www.ea.com/a.png", "https://evil.com/a.png", "https://www.ea.com.evil.com/a.png", "https://www.ea.com/a.json", "https://u:p@www.ea.com/a.png", 5, "x".repeat(500)])
    assert(cleanArtUrl(bad) === null, `refused ${String(bad).slice(0, 40)}`);
});

Deno.test("card art: import checks the file and records each address once", async () => {
  let sent: string[] = [];
  const db = { rpc: (_: string, a: { p_urls: string[] }) => { sent = a.p_urls; return Promise.resolve({ data: 1, error: null }); } } as unknown as FutDb;
  const r = await importCardArt(db, { format: "xilab-image-addresses", images: [{ url: `${C}/a.png` }, { url: `${C}/a.png?v=2` }, { url: "https://evil.com/b.png" }] });
  assert(r.kept === 1 && r.new_addresses === 1 && sent.length === 1, JSON.stringify(r));
  let refused = false; try { await importCardArt(db, { images: [] }); } catch { refused = true; } assert(refused, "wrong format refused");
});

Deno.test("card art SQL: new addresses counted, sightings added, service role only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA fut; GRANT USAGE ON SCHEMA fut TO service_role, authenticated;`);
    await db.exec(await Deno.readTextFile(new URL("../../../migrations/20261110150000_fut_card_art_addresses.sql", import.meta.url)));
    await db.exec("SET ROLE service_role");
    const one = await db.query<{ n: number }>(`SELECT fut.record_card_art(ARRAY['${C}/a.png', '${C}/b.png', '${C}/a.png']) AS n`);
    assert(one.rows[0]!.n === 2, `first ${one.rows[0]!.n}`);
    const two = await db.query<{ n: number }>(`SELECT fut.record_card_art(ARRAY['${C}/a.png', '${C}/c.png']) AS n`);
    assert(two.rows[0]!.n === 1, `second ${two.rows[0]!.n}`);
    const a = await db.query<{ sightings: number }>(`SELECT sightings FROM fut.ea_card_art WHERE url = '${C}/a.png'`);
    assert(a.rows[0]!.sightings === 2, "sighting added");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    let denied = false; try { await db.query("SELECT * FROM fut.ea_card_art"); } catch { denied = true; } assert(denied, "web roles can't read it");
    denied = false; try { await db.query("SELECT fut.record_card_art(ARRAY['x'])"); } catch { denied = true; } assert(denied, "web roles can't write it");
  } finally { await db.close(); }
});
