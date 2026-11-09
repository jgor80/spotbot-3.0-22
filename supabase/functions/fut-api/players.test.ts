// Player Ratings: the FUT.GG card-stats download (parsing, the job loop, the SQL in real PostgreSQL via PGlite),
// the player search and the finder chat (words without AI, Claude faked), through the fut-api routes.
import { PGlite } from "npm:@electric-sql/pglite@0.5.15";
import { handle, type Deps } from "./handler.ts";
import { buildNames, parseCardDefinition, syncFutggAttributes } from "../_shared/fut/futgg-attributes.ts";
import { quickParse } from "../_shared/fut/player-finder.ts";
import { cleanPlayerQuery, describeQuery } from "../_shared/fut/stats.ts";

function assert(ok: unknown, msg = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(msg);
}
const ME = "11111111-1111-4111-8111-111111111111";

// Trimmed FUT.GG files in the shapes they're published in (fictional players).
const playstyles = [{ eaId: 0, name: "Finesse Shot" }, { eaId: 17, name: "Rapid" }, { eaId: 22, name: "Quick Step" }, { eaId: 12, name: "Intercept" }];
const core = { roles: [
  { eaId: 138, positionName: "ST", cleanName: "Advanced Forward", name: "Advanced Forward++", isPlus: false, isPlusPlus: true },
  { eaId: 40, positionName: "CB", cleanName: "Defender", name: "Defender+", isPlus: true, isPlusPlus: false },
  { eaId: null, positionName: "CB", cleanName: "Defender", name: "Defender", isPlus: false, isPlusPlus: false },
] };
const names = buildNames(playstyles, core);
const striker = { data: {
  eaId: 84000001, position: 25, alternativePositionIds: [27, 25], overall: 92, foot: 1, weakFoot: 4, skillMoves: 5, height: 182,
  accelerateType: "EXPLOSIVE", hasDynamic: true, totalIgs: 2255, playstyles: [0, 17, 22, 99], playstylesPlus: [22], rolesPlus: [], rolesPlusPlus: [138, 999],
  facePace: 97, faceShooting: 92, facePassing: 81, faceDribbling: 93, faceDefending: 31, facePhysicality: 78,
  attributeAcceleration: 98, attributeSprintSpeed: 97, attributeFinishing: 96, attributeShortPassing: 88, attributeStandingTackle: 36,
  attributeGkDiving: 13, gkFaceSpeed: 0,
} };
const keeper = { data: { eaId: 488, position: 0, foot: 2, weakFoot: 3, skillMoves: 1, height: 188, facePace: 58, faceShooting: 20, facePassing: 33,
  faceDribbling: 30, faceDefending: 16, facePhysicality: 68, attributeGkDiving: 93, attributeGkReflexes: 95, gkFaceSpeed: 57 } };

Deno.test("a FUT.GG card definition becomes stored stats", () => {
  const s = parseCardDefinition(striker, names)!;
  assert(s.ea_item_id === 84000001 && s.found && s.pac === 97 && s.def === 31, JSON.stringify(s));
  assert(s.detail!.acceleration === 98 && s.detail!.finishing === 96 && s.detail!.gk_diving === 13 && !("gk_speed" in s.detail!), "0 is not a stat");
  assert(s.foot === "right" && s.weak_foot === 4 && s.skill_moves === 5 && s.height_cm === 182 && s.accelerate_type === "EXPLOSIVE" && s.is_dynamic);
  assert(JSON.stringify(s.alt_positions) === '["LW"]', "alt positions without the main one");
  assert(JSON.stringify(s.playstyles) === '["Finesse Shot","Rapid"]' && JSON.stringify(s.playstyles_plus) === '["Quick Step"]', "plus not listed twice; unknown ids dropped");
  assert(JSON.stringify(s.roles) === '[{"position":"ST","role":"Advanced Forward","level":"plusplus"}]', JSON.stringify(s.roles));
  const k = parseCardDefinition(keeper, names)!;
  assert(k.foot === "left" && k.detail!.gk_speed === 57 && k.detail!.gk_reflexes === 95 && k.pac === 58, JSON.stringify(k));
  assert(parseCardDefinition({ data: null }, names) === null && parseCardDefinition("nope", names) === null);
});

function filesFetcher(cards: Record<number, unknown>, status: Record<number, number> = {}) {
  const urls: string[] = [];
  const fetcher = (url: string) => {
    urls.push(url);
    if (url.endsWith("manifest.json")) return Promise.resolve(new Response(JSON.stringify({ _version: 1, "play-styles": "abc1", "fc-core-data": "def2" })));
    if (url.includes("play-styles.v1.abc1")) return Promise.resolve(new Response(JSON.stringify(playstyles)));
    if (url.includes("fc-core-data.v1.def2")) return Promise.resolve(new Response(JSON.stringify(core)));
    const id = Number(url.match(/\/27\/(\d+)\/$/)?.[1]);
    if (status[id]) return Promise.resolve(new Response("x", { status: status[id] }));
    return Promise.resolve(cards[id] ? new Response(JSON.stringify(cards[id])) : new Response("not found", { status: 404 }));
  };
  return { urls, fetcher };
}

Deno.test("the stats job fetches the queue, saves found and missing cards, and stops when FUT.GG says no", async () => {
  const saved: unknown[][] = [];
  const db = { rpc: (name: string, args: Record<string, unknown>) => {
    if (name === "futgg_attribute_queue") return Promise.resolve({ data: { waiting: 4, ids: [84000001, 488, 5, 6] }, error: null });
    saved.push(args.p_cards as unknown[]);
    return Promise.resolve({ data: (args.p_cards as unknown[]).length, error: null });
  } };
  const { urls, fetcher } = filesFetcher({ 84000001: striker, 488: keeper }, { 6: 429 });
  const r = await syncFutggAttributes(db, fetcher, { concurrency: 1, pauseMs: 0 });
  assert(r.queued === 4 && r.fetched === 2 && r.missing === 1 && r.saved === 3 && r.stopped === "FUT.GG answered HTTP 429" && r.remaining === 1, JSON.stringify(r));
  assert(urls.filter((u) => u.startsWith("https://www.fut.gg/api/fut/player-item-definitions/27/")).length === 4);
  assert(JSON.stringify(saved[0]!.map((c) => (c as { ea_item_id: number; found: boolean }).found)) === "[true,true,false]");

  // An empty queue doesn't download anything
  const idle = filesFetcher({});
  const none = await syncFutggAttributes({ rpc: () => Promise.resolve({ data: { waiting: 0, ids: [] }, error: null }) }, idle.fetcher);
  assert(none.queued === 0 && idle.urls.length === 0);
  // Out of time: stops before the next card
  let t = 0;
  const slow = await syncFutggAttributes(db, filesFetcher({ 84000001: striker }).fetcher, { concurrency: 1, pauseMs: 0, budgetMs: 10, now: () => (t += 6) });
  assert(slow.stopped === "time" && slow.fetched + slow.missing < 4, JSON.stringify(slow));
});

Deno.test("searches are cleaned: unknown stats, positions and PlayStyles are dropped and numbers clamped", () => {
  const q = cleanPlayerQuery({
    positions: ["cb", "XX", "CB"], max_price: "50,000", min_rating: 120, weights: [{ stat: "pac", weight: 9 }, { stat: "drop table", weight: 3 }],
    minimums: [{ stat: "sprint_speed", value: 80 }, { stat: "nope", value: 1 }], playstyles: ["rapid", "Made Up"], playstyles_plus: ["Quick Step+"],
    accelerate_types: ["explosive", "warp"], sort: "fit", foot: "both", owned_only: "yes",
  });
  assert(JSON.stringify(q.positions) === '["CB"]' && q.max_price === 50000 && q.min_rating === 99, JSON.stringify(q));
  assert(JSON.stringify(q.weights) === '[{"stat":"pac","weight":5}]' && JSON.stringify(q.minimums) === '[{"stat":"sprint_speed","value":80}]');
  assert(JSON.stringify(q.playstyles) === '["Rapid"]' && JSON.stringify(q.playstyles_plus) === '["Quick Step"]' && JSON.stringify(q.accelerate_types) === '["EXPLOSIVE"]');
  assert(q.sort === "fit" && q.foot === null && q.owned_only === false);
  assert(cleanPlayerQuery({ sort: "fit" }).sort === null, "fit needs weights");
  assert(cleanPlayerQuery("junk").positions!.length === 0);
  assert(describeQuery(q).join(" | ") === "CB | 99+ rated | under 50k | Sprint Speed 80+ | Rapid | Quick Step+ | Explosive | best for pace", describeQuery(q).join(" | "));
});

Deno.test("common requests are read without AI, and a follow-up refines the last search", () => {
  const a = quickParse("fast CB under 50k with good passing");
  assert(a.understood && JSON.stringify(a.query.positions) === '["CB"]' && a.query.max_price === 50000 && a.query.sort === "fit", JSON.stringify(a.query));
  assert(a.query.weights!.some((w) => w.stat === "pac" && w.weight === 5) && a.query.weights!.some((w) => w.stat === "pas"), JSON.stringify(a.query.weights));
  const b = quickParse("left footed please, 4 star weak foot", a.query);
  assert(b.query.foot === "left" && b.query.max_price === 50000 && b.query.minimums!.some((m) => m.stat === "weak_foot" && m.value === 4), JSON.stringify(b.query));
  const c = quickParse("cheaper", b.query);
  assert(c.query.max_price === 30000, String(c.query.max_price));
  const d = quickParse("85+ striker with 5* skills and finesse shot+ under 1.5m");
  assert(d.query.min_rating === 85 && JSON.stringify(d.query.positions) === '["ST"]' && d.query.max_price === 1_500_000, JSON.stringify(d.query));
  assert(d.query.minimums!.some((m) => m.stat === "skill_moves" && m.value === 5) && JSON.stringify(d.query.playstyles_plus) === '["Finesse Shot"]', JSON.stringify(d.query));
  assert(JSON.stringify(quickParse("tall 190cm keeper").query.positions) === '["GK"]', "cm isn't CM");
  assert(!quickParse("hello there").understood);
});

async function ratingsDb() {
  const pg = new PGlite();
  const read = (f: string) => Deno.readTextFile(new URL(`../../migrations/${f}`, import.meta.url));
  await pg.exec("CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS 'SELECT NULL::uuid';");
  await pg.exec(await read("20261102020000_fut_schema.sql"));
  const base = await read("20261102030000_fut_market.sql");
  for (const name of ["market_price_sources", "market_provider_runs"]) {
    const sql = base.match(new RegExp(`CREATE TABLE fut\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0];
    assert(sql); await pg.exec(sql);
  }
  await pg.exec(await read("20261108030000_futgg_bulk_prices.sql"));
  await pg.exec(await read("20261108160000_futgg_catalogue.sql"));
  for (const stmt of (await read("20261102090000_fut_club_sync.sql")).match(/(DROP INDEX[^;]*;|CREATE UNIQUE INDEX[^;]*;)/g) ?? []) await pg.exec(stmt);
  await pg.exec(await read("20261109090000_futgg_market_cards.sql"));
  await pg.exec(await read("20261110090000_fut_player_ratings.sql"));
  const card = (ea_item_id: number, name: string, overall: number, position: string, version = "Rare") =>
    ({ ea_item_id, name, version, overall, position, club: `${name} FC`, league: "Test League", nation: "Testland", is_icon: false, is_hero: false });
  await pg.query("SELECT fut.upsert_futgg_catalogue($1)", [JSON.stringify([
    card(101, "Quick Passer", 84, "CB"), card(102, "Slow Rock", 88, "CB"), card(103, "Wing Back", 86, "LB", "TOTW"), card(104, "No Stats", 90, "ST"),
  ])]);
  return pg;
}
const stats = (id: number, pac: number, pas: number, def: number, extra: Record<string, unknown> = {}) => ({
  ea_item_id: id, found: true, pac, sho: 50, pas, dri: 70, def, phy: 80,
  detail: { acceleration: pac, sprint_speed: pac, short_passing: pas, standing_tackle: def, bogus: "x" },
  skill_moves: 2, weak_foot: 3, foot: "right", height_cm: 188, accelerate_type: "CONTROLLED", alt_positions: [], total_igs: 1800, is_dynamic: false,
  playstyles: ["Block"], playstyles_plus: ["Intercept"], roles: [{ position: "CB", role: "Defender", level: "plus" }, { position: "ZZ", role: "Bad", level: "plus" }], ...extra,
});

Deno.test("stats SQL: queue order, saving, and the search's filters, sorts and fit ranking", async () => {
  const pg = await ratingsDb();
  try {
    const queue = async () => (await pg.query<{ r: { waiting: number; ids: number[] } }>("SELECT fut.futgg_attribute_queue(10) AS r")).rows[0]!.r;
    const q1 = await queue();
    assert(q1.waiting === 4 && q1.ids[0] === 104, JSON.stringify(q1));
    const save = async (cards: unknown[]) => Number((await pg.query<{ n: number }>("SELECT fut.upsert_futgg_attributes($1) AS n", [JSON.stringify(cards)])).rows[0]!.n);
    assert(await save([stats(101, 85, 80, 84), stats(102, 60, 65, 90, { foot: "left" }), stats(103, 92, 75, 78, { alt_positions: ["CB", "XX"] }), { ea_item_id: 104, found: false }, { ea_item_id: 999, found: true }]) === 4);
    assert(await save([stats(101, 85, 80, 84)]) === 1, "saving again replaces");
    assert((await queue()).waiting === 0, "nothing left to fetch");
    const count = async (sql: string) => Number((await pg.query<{ n: number }>(sql)).rows[0]!.n);
    assert(await count("SELECT count(*) AS n FROM fut.card_playstyles") === 6 && await count("SELECT count(*) AS n FROM fut.card_roles") === 3, "styles and roles replaced, bad position dropped");
    assert(await count("SELECT weak_foot AS n FROM fut.player_cards WHERE source_card_key = '101'") === 3, "weak foot on the card");
    await pg.query("SELECT fut.ingest_futgg_snapshot('console',27,$1,$2,$3)", [new Date(Date.now() - 60_000).toISOString(), { v: 2, id0: 101, d: [1, 1, 1] }, { v: 2, p: [40000, 120000, 30000, 0], s: [0, 0, 0, 0] }]);

    // deno-lint-ignore no-explicit-any
    const search = async (q: Record<string, unknown>, user: string | null = null) => (await pg.query<{ r: any }>("SELECT fut.futgg_player_search($1, $2) AS r", [JSON.stringify(q), user])).rows[0]!.r;
    // deno-lint-ignore no-explicit-any
    const names = (r: any) => r.cards.map((c: any) => c.player_name).join();
    let r = await search({});
    assert(r.total === 4 && r.with_stats === 3 && r.catalogue_cards === 4 && r.cards[0].player_name === "No Stats" && r.sort === "overall", "everything, by overall");
    const top = r.cards.find((c: { player_name: string }) => c.player_name === "Slow Rock");
    assert(top.stats.standing_tackle === 90 && top.stats.total_stats === 415 && !("bogus" in top.stats) && top.price === 120000 && top.foot === "left", JSON.stringify(top));
    assert(JSON.stringify(top.playstyles) === '["Block"]' && JSON.stringify(top.playstyles_plus) === '["Intercept"]' && top.roles.length === 1);
    r = await search({ positions: ["CB"], max_price: 50000, weights: [{ stat: "pac", weight: 5 }, { stat: "pas", weight: 3 }, { stat: "def", weight: 3 }] });
    assert(names(r) === "Wing Back,Quick Passer" && r.sort === "fit" && r.cards[0].fit > r.cards[1].fit, `fast CB under 50k, alt positions count: ${names(r)}`);
    assert((await search({ positions: ["CB"], include_alt_positions: false })).total === 2, "main position only");
    r = await search({ sort: "sprint_speed" });
    assert(r.cards[0].player_name === "Wing Back" && r.cards.at(-1).player_name === "No Stats", "any attribute sorts; no stats last");
    assert((await search({ sort: "price" })).cards[0].price === 30000, "price sorts cheapest first");
    assert((await search({ sort: "pac", direction: "asc" })).cards[0].player_name === "Slow Rock");
    assert(names(await search({ minimums: [{ stat: "standing_tackle", value: 85 }] })) === "Slow Rock");
    assert((await search({ maximums: [{ stat: "height_cm", value: 180 }] })).total === 0);
    assert((await search({ foot: "left" })).total === 1 && (await search({ accelerate_types: ["EXPLOSIVE"] })).total === 0);
    assert((await search({ playstyles: ["Block", "Intercept"] })).total === 3 && (await search({ playstyles_plus: ["Block"] })).total === 0, "PlayStyles, plus only when asked");
    assert((await search({ text: "totw" })).total === 1 && (await search({ card_type: "promo" })).total === 1);
    r = await search({ weights: [{ stat: "weak_foot", weight: 1 }] });
    assert(r.total === 3 && Number(r.cards[0].fit) === 60, "stars count 20 each; cards without stats aren't ranked by fit");
    assert((await search({ sort: "name", limit: 1, offset: 1 })).cards[0].player_name === "Quick Passer", "paging");
    await pg.query(`INSERT INTO auth.users VALUES ('${ME}')`);
    await pg.query(`INSERT INTO fut.player_cards (owner_user_id, player_name, overall, positions, evidence, source_id, source_card_key) VALUES ('${ME}','Quick Passer',84,'{CB}','game_data','user_entered','101')`);
    r = await search({ owned_only: true }, ME);
    assert(r.total === 1 && r.cards[0].owned === true, "cards in my club");
    assert((await search({ owned_only: true })).total === 4, "no user, no club filter");
    assert((await search({ weights: [{ stat: "nope", weight: 5 }] })).sort === "overall", "unknown weights ignored");
    let threw = false;
    try { await search({ sort: "1; drop table x" }); } catch { threw = true; }
    assert(threw, "unknown sort refused");
  } finally { await pg.close(); }
});

Deno.test("routes: search and the finder chat (words without a key, Claude with one, relaxed when nothing matches)", async () => {
  const pg = await ratingsDb();
  try {
    await pg.query("SELECT fut.upsert_futgg_attributes($1)", [JSON.stringify([stats(101, 85, 80, 84), stats(102, 60, 65, 90), stats(103, 92, 75, 78, { alt_positions: ["CB"] })])]);
    await pg.query("SELECT fut.ingest_futgg_snapshot('console',27,$1,$2,$3)", [new Date(Date.now() - 60_000).toISOString(), { v: 2, id0: 101, d: [1, 1, 1] }, { v: 2, p: [40000, 120000, 30000, 0], s: [0, 0, 0, 0] }]);
    const rpcs: Record<string, unknown>[] = [];
    const db = { rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, ...args });
      try { return { data: (await pg.query<{ r: unknown }>(`SELECT fut.${name}($1, $2) AS r`, [JSON.stringify(args.p_query), args.p_user])).rows[0]!.r, error: null }; }
      catch (e) { return { data: null, error: { message: String(e) } }; }
    } };
    let ai: unknown = null;
    const sent: Record<string, unknown>[] = [];
    const deps = (env: Record<string, string>): Deps => ({
      db: db as unknown as Deps["db"],
      userFor: (req) => Promise.resolve(req.headers.get("x-test-user")),
      env: (k) => ({ FUT_ENABLED: "true", ...env })[k],
      fetch: ((_url: string, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)));
        return Promise.resolve(new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(ai) }] })));
      }) as unknown as Deps["fetch"],
    });
    // deno-lint-ignore no-explicit-any
    const call = async (path: string, body: unknown, env: Record<string, string> = {}): Promise<{ status: number; data: any }> => {
      const res = await handle(new Request(`http://local/functions/v1/fut-api/v1${path}`, { method: "POST", headers: { "content-type": "application/json", "x-test-user": ME }, body: JSON.stringify(body) }), deps(env));
      return { status: res.status, data: await res.json() };
    };

    const s = await call("/players/search", { query: { positions: ["CB"], sort: "def", bogus: 1 }, platform: "console", limit: 2 });
    assert(s.status === 200 && s.data.data.cards.length === 2 && s.data.data.cards[0].player_name === "Slow Rock" && s.data.data.total === 3, JSON.stringify(s.data));
    assert(rpcs.at(-1)!.p_user === ME && (rpcs.at(-1)!.p_query as Record<string, unknown>).limit === 2, "caller and paging passed on");

    const words = await call("/players/find", { message: "fast CB with good passing" });
    assert(words.status === 200 && words.data.data.via === "words" && words.data.data.result.cards[0].player_name === "Wing Back", JSON.stringify(words.data).slice(0, 400));
    assert(words.data.data.summary.includes("CB") && sent.length === 0, "no AI without a key");
    assert((await call("/players/find", { message: "hmm" })).status === 422);
    assert((await call("/players/find", { message: "" })).status === 400);

    ai = { reply: "Quick centre-backs who can pass.", text: null, positions: ["CB"], card_type: null, min_rating: null, max_rating: null, min_price: null,
      max_price: 50000, priced_only: true, minimums: [], maximums: [], foot: null, playstyles: [], playstyles_plus: [], accelerate_types: [], league: null,
      nation: null, club: null, owned_only: false, weights: [{ stat: "pac", weight: 5 }, { stat: "pas", weight: 3 }, { stat: "made_up", weight: 2 }] };
    const viaAi = await call("/players/find", { message: "rapid CB, can pass, 50k max", history: [{ role: "assistant", text: "hi" }, { role: "user", text: "earlier" }, { role: "bot", text: "x" }] }, { ANTHROPIC_API_KEY: "k" });
    assert(viaAi.status === 200 && viaAi.data.data.via === "ai" && viaAi.data.data.reply === "Quick centre-backs who can pass.", JSON.stringify(viaAi.data).slice(0, 300));
    assert(viaAi.data.data.query.weights.length === 2 && viaAi.data.data.query.sort === "fit" && viaAi.data.data.result.cards[0].player_name === "Wing Back");
    const req = sent.at(-1)! as { messages: { role: string; content: string }[]; output_config: { format: { type: string } } };
    assert(req.messages[0]!.role === "user" && req.messages.at(-1)!.content.includes("50k max") && req.output_config.format.type === "json_schema", JSON.stringify(req.messages));

    // A must-have nobody meets: ranked on it instead, and the user is told
    ai = { ...ai as object, max_price: null, minimums: [{ stat: "pac", value: 99 }] };
    const relaxed = await call("/players/find", { message: "99 pace CB", previous: { positions: ["CB"] } }, { ANTHROPIC_API_KEY: "k" });
    assert(relaxed.data.data.relaxed && relaxed.data.data.result.total > 0 && relaxed.data.data.query.minimums.length === 0, JSON.stringify(relaxed.data).slice(0, 300));
    assert(String(sent.at(-1)!.system).includes('"positions":["CB"]'), "the current search goes to Claude for follow-ups");
  } finally { await pg.close(); }
});
