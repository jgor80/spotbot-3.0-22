// Market Lab on Gaffer Bot: the /v1/market routes and the MCP market tools run XI Lab's market service on the
// fut schema, with each user's imported prices private to them. Fictional cards and prices only.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";
import { handleBody } from "../gafferbot-mcp/protocol.ts";
import { FUT_TOOLS, type FutCtx } from "../gafferbot-mcp/fut.ts";
import { memoryDb } from "../gafferbot-mcp/test-db.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DISCORD = "111111111111111111";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

/** The rows 20261102030000_fut_market.sql seeds (the parts the service reads). */
function seededMarket() {
  const perm = (on: boolean) => ({ commercial_use: false, storage: on, retention_days: null, display: on, derived_analytics: on, model_training: false, redistribution: false, attribution: null });
  return {
    market_price_sources: [
      { id: "user_import", name: "Your imported price history", kind: "user_import", status: "enabled", is_demo: false, status_note: "Yours.", permissions: perm(true), evidence: "estimate" },
      { id: "web_app_capture", name: "Your Web App captures", kind: "browser_capture", status: "enabled", is_demo: false, status_note: "Yours.", permissions: perm(true), evidence: "game_data" },
      { id: "futbin", name: "FUTBIN", kind: "licensed_feed", status: "not_authorized", is_demo: false, status_note: "No licence.", permissions: perm(false), evidence: "game_data" },
      { id: "xilab_demo", name: "XI Lab demo dataset", kind: "demo", status: "disabled", is_demo: true, status_note: "Browser only.", permissions: perm(true), evidence: "hypothesis" },
    ],
    market_rule_versions: [{
      id: "fc27-market-v1", status: "unverified", is_active: true, notes: "community",
      body: { transfer_tax_rate: 0.05, price_steps: [{ from: 0, step: 50 }, { from: 1000, step: 100 }, { from: 10000, step: 250 }, { from: 50000, step: 500 }, { from: 100000, step: 1000 }], min_price: 200, stale_after_hours: 6, min_points: 6, thresholds: { relative_strength_pp: 3, regime_trend_24h: 2, regime_trend_7d: 4, high_volatility: 2.5, sbc_spread_pp: 4, priced_in_72h: 25, mean_reversion_z: -1.5 } },
    }],
  };
}

function setup() {
  const db = futMemoryDb({ ...seededRules(), ...seededMarket() });
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => (k === "FUT_ENABLED" ? "true" : undefined) };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, user: string = ME): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { db, call };
}

const H = 3_600_000;
const csv = (id: string, prices: number[]) =>
  ["card_id,platform,price,observed_at", ...prices.map((p, i) => `${id},console,${p},${new Date(Date.now() - (prices.length - i) * H).toISOString()}`)].join("\n");

async function cardWithHistory(call: ReturnType<typeof setup>["call"], prices: number[], user = ME, name = "Test Winger") {
  const c = await call("POST", "/v1/cards", { player_name: name, overall: 86, positions: ["RM"], league: "Alpha League", nation: "N1", club: "C1", evidence: "game_data", stats: { pac: 90, sho: 80, pas: 82, dri: 88, def: 50, phy: 70 } }, user);
  const id = c.data.data.id as string;
  const text = csv(id, prices);
  const imp = await call("POST", "/v1/market/prices/import", { text }, user);
  assert(imp.status === 200, JSON.stringify(imp.data));
  return { id, imp: imp.data.data, text };
}

Deno.test("market: import is validated and private; Card Intelligence uses only your prices", async () => {
  const { call, db } = setup();
  const prices = Array.from({ length: 30 }, (_, i) => 10_000 + i * 100);
  const { id, imp, text } = await cardWithHistory(call, prices);
  assert(imp.accepted === 30 && imp.inserted === 30 && imp.rejected.length === 0, JSON.stringify(imp));
  const again = (await call("POST", "/v1/market/prices/import", { text })).data.data;
  assert(again.inserted === 0, "re-import stores nothing new");
  assert(db.tables.market_price_observations!.every((r) => r.owner_user_id === ME), "rows are the importer's");
  const bad = (await call("POST", "/v1/market/prices/import", { text: "card_id,platform,price,observed_at\nnot-mine,console,1000,2026-11-01T00:00:00Z" })).data.data;
  assert(bad.rejected[0].reason.includes("Unknown card_id"), JSON.stringify(bad));

  const ci = await call("GET", `/v1/market/cards/${id}`);
  assert(ci.status === 200, JSON.stringify(ci.data));
  assert(ci.data.data.price.latest === 12_900 && ci.data.data.price.freshness.status === "fresh", JSON.stringify(ci.data.data.price.freshness));
  assert(ci.data.data.provenance.demo === false, "not demo");
  // Someone else can't see the card or its prices.
  const other = await call("GET", `/v1/market/cards/${id}`, undefined, OTHER);
  assert(other.status === 400 || other.status === 404, `other user: ${other.status}`);
});

Deno.test("market: thesis does the tax arithmetic, watchlist and scanner work, overview is honest", async () => {
  const { call } = setup();
  const { id } = await cardWithHistory(call, Array.from({ length: 30 }, () => 5_000));
  const t = await call("POST", "/v1/market/thesis", { card_id: id, platform: "console", quantity: 1, buy_price: 5_000, target_price: 6_200, downside_price: 4_500 });
  assert(t.status === 200 && t.data.data.profit_at_target === 890, JSON.stringify(t.data));
  assert((await call("POST", "/v1/market/thesis", { card_id: id, platform: "xbox", quantity: 1, buy_price: 1, target_price: 2, downside_price: 0 })).status === 400, "bad platform rejected");

  const w = await call("POST", "/v1/market/watchlist", { card_id: id, platform: "console", target_sell: 6_000 });
  assert(w.status === 201 && w.data.data.price_at_add === 5_000, JSON.stringify(w.data));
  assert((await call("GET", "/v1/market/watchlist")).data.data.items.length === 1, "listed");
  assert((await call("GET", "/v1/market/watchlist", undefined, OTHER)).data.data.items.length === 0, "private");
  await call("DELETE", `/v1/market/watchlist/${id}?platform=console`);
  assert((await call("GET", "/v1/market/watchlist")).data.data.items.length === 0, "removed");

  const scan = await call("GET", "/v1/market/opportunities");
  assert(scan.status === 200 && scan.data.data.items[0].card_id === id, JSON.stringify(scan.data).slice(0, 300));
  const o = await call("GET", "/v1/market/overview");
  assert(o.status === 200 && o.data.data.upcoming_events.items.length === 0, "no invented events");
  // Private cards never enter shared baskets, so indexes say there isn't enough data.
  assert(o.data.data.indexes.every((i: { trend: string }) => i.trend === "insufficient_data"), "no shared index from private cards");
  const src = (await call("GET", "/v1/market/sources")).data.data;
  assert(src.find((s: { id: string }) => s.id === "futbin").status === "not_authorized", "unauthorised provider listed as such");
});

Deno.test("market: Compare in My Squad respects locks and uses the chemistry engine", async () => {
  const { call } = setup();
  const { id } = await cardWithHistory(call, Array.from({ length: 10 }, () => 12_000));
  const squad = (await call("POST", "/v1/squads/new", { formation: "3-5-2", name: "XI" })).data.data;
  squad.slots = squad.slots.map((s: { slot: string }) => ({ ...s, locked: s.slot === "LM" }));
  const r = await call("POST", "/v1/market/compare-squad", { card_id: id, squad });
  assert(r.status === 200, JSON.stringify(r.data));
  assert(r.data.data.options.some((o: { slot: string }) => o.slot === "RM"), "RM offered");
  assert(r.data.data.rule_version === "fc27-community-v1", "chemistry rules from the db");
});

Deno.test("market MCP tools: read-only, fut in the name, same numbers as the website", async () => {
  const { call, db: fut } = setup();
  const { id } = await cardWithHistory(call, Array.from({ length: 30 }, (_, i) => 10_000 + i * 100));
  const db = memoryDb({ user_discord_links: [{ discord_user_id: DISCORD, auth_user_id: ME, verified: true }] });
  const ctx: FutCtx = { db, discordUserId: DISCORD, futDb: fut };
  // deno-lint-ignore no-explicit-any
  const tool = async (name: string, args: Record<string, unknown> = {}): Promise<{ isError?: boolean; data: any; text: string }> => {
    // deno-lint-ignore no-explicit-any
    const reply: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, FUT_TOOLS, ctx);
    const text = reply.result.content[0].text;
    let data = null;
    try { data = JSON.parse(text); } catch { /* error */ }
    return { isError: reply.result.isError, data, text };
  };
  const ci = await tool("get_fut_card_market_intelligence", { card_id: id });
  assert(!ci.isError && ci.data.price.latest === 12_900 && ci.data.price.history.length <= 24, ci.text.slice(0, 300));
  const t = await tool("analyze_fut_trade_thesis", { card_id: id, buy_price: 5_000, target_price: 6_200, downside_price: 4_500 });
  assert(!t.isError && t.data.profit_at_target === 890, t.text.slice(0, 300));
  assert(!(await tool("find_fut_market_opportunities", {})).isError, "scan");
  assert(!(await tool("get_fut_market_overview", {})).isError, "overview");
  assert(!(await tool("compare_fut_card_relative_value", { card_id: id })).isError, "relative value");
  assert((await tool("get_fut_market_data_sources")).data.sources.length === 4, "sources");
  assert((await tool("get_fut_card_market_intelligence", { card_id: "nope" })).isError, "bad id is a tool error");
});

Deno.test("market: a Web App capture file is matched on EA item ids and stored as your captures", async () => {
  const { call, db } = setup();
  const c = await call("POST", "/v1/cards", { player_name: "Captured Striker", overall: 88, positions: ["ST"], evidence: "game_data" });
  const id = c.data.data.id as string;
  await db.from("player_cards").update({ source_card_key: "239085" }).eq("id", id); // as a card from EA's feed would carry
  const rows = Array.from({ length: 8 }, (_, i) => `239085,239085,88,console,${20_000 + i * 250},${new Date(Date.now() - (8 - i) * H).toISOString()},lowest_bin,4`);
  const text = ["ea_item_id,asset_id,rating,platform,price,observed_at,kind,listings", ...rows, `999999,,,console,500,${new Date(Date.now() - H).toISOString()},lowest_bin,1`].join("\n");
  const imp = await call("POST", "/v1/market/prices/import", { text });
  assert(imp.status === 200 && imp.data.data.accepted === 8 && imp.data.data.held === 1 && imp.data.data.rejected.length === 0, JSON.stringify(imp.data));
  const intel = await call("GET", `/v1/market/cards/${id}`);
  assert(intel.data.data.price.latest === 21_750, JSON.stringify(intel.data.data.price));
  const other = await call("GET", `/v1/market/cards/${id}`, undefined, OTHER);
  assert(other.status === 404 || other.data.data?.price?.latest == null, "captures stay private");
});

Deno.test("market: captures for cards you don't have yet are held, listed, and linked later", async () => {
  const { call, db } = setup();
  const HDR = "ea_item_id,asset_id,rating,platform,price,observed_at,kind,listings,rare_flag,team_id,league_id,nation_id,position";
  const rows = Array.from({ length: 8 }, (_, i) => `50570001,570001,91,console,${90_000 + i * 1_000},${new Date(Date.now() - (8 - i) * H).toISOString()},lowest_bin,3,3,10,13,14,ST`);
  const imp = await call("POST", "/v1/market/prices/import", { text: [HDR, ...rows].join("\n") });
  assert(imp.status === 200 && imp.data.data.held === 8 && imp.data.data.accepted === 0, JSON.stringify(imp.data));
  const held = await call("GET", "/v1/market/held");
  assert(held.data.data.items.length === 1 && held.data.data.items[0].special_version === true && held.data.data.items[0].latest_price === 97_000, JSON.stringify(held.data));
  assert((await call("GET", "/v1/market/held", undefined, OTHER)).data.data.items.length === 0, "held captures are private");

  // Linked automatically once a card carries that EA item id.
  const c = await call("POST", "/v1/cards", { player_name: "Promo Striker", overall: 91, positions: ["ST"], version: "TOTW", evidence: "game_data" });
  const id = c.data.data.id as string;
  await db.from("player_cards").update({ source_card_key: "50570001" }).eq("id", id);
  const rl = await call("POST", "/v1/market/held/relink", {});
  assert(rl.status === 200 && rl.data.data.linked === 8 && rl.data.data.still_held === 0, JSON.stringify(rl.data));
  const intel = await call("GET", `/v1/market/cards/${id}`);
  assert(intel.data.data.price.latest === 97_000, JSON.stringify(intel.data.data.price));

  // Or by hand, only to a card with the same rating.
  const more = rows.map((r) => r.replace("50570001,570001", "50570002,570002"));
  await call("POST", "/v1/market/prices/import", { text: [HDR, ...more].join("\n") });
  const low = await call("POST", "/v1/cards", { player_name: "Wrong Card", overall: 85, positions: ["ST"], evidence: "game_data" });
  const bad = await call("POST", "/v1/market/held/link", { ea_item_id: 50570002, card_id: low.data.data.id });
  assert(bad.status === 400 && /rated 91/.test(bad.data.error ?? JSON.stringify(bad.data)), JSON.stringify(bad.data));
  const hand = await call("POST", "/v1/cards", { player_name: "Other Promo", overall: 91, positions: ["ST"], evidence: "game_data" });
  const ok = await call("POST", "/v1/market/held/link", { ea_item_id: 50570002, card_id: hand.data.data.id });
  assert(ok.status === 200 && ok.data.data.linked === 8, JSON.stringify(ok.data));
  assert((await call("POST", "/v1/market/held/link", { ea_item_id: "x", card_id: hand.data.data.id })).status === 400, "bad ea id");
});

Deno.test("market: fc27-market pull imports third-party prices for your synced cards only", async () => {
  const db = futMemoryDb({ ...seededRules(), ...seededMarket() });
  const perm = { commercial_use: false, storage: true, retention_days: null, display: true, derived_analytics: true, model_training: false, redistribution: false, attribution: "fc27-market" };
  (db.tables.market_price_sources as unknown[]).push({ id: "fc27_market", name: "fc27-market", kind: "user_import", status: "enabled", is_demo: false, status_note: "Third party.", permissions: perm, evidence: "estimate" });
  const urls: string[] = [];
  const updated = new Date(Math.floor((Date.now() - 2 * H) / 60_000) * 60_000);
  const t = (d: Date) => Math.floor(d.getTime() / 60_000);
  const fake = (url: string) => {
    urls.push(url);
    const body = url.endsWith("/latest")
      ? { updated: updated.toISOString(), groups: { gold: [{ eaId: 101, name: "X", rating: 85, price: 12_750 }, { eaId: 999, price: 5_000 }] } }
      : url.endsWith("/history/101") ? { t: [t(new Date(updated.getTime() - H)), t(updated)], p: [13_000, 12_750] } : { t: [], p: [] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => (k === "FUT_ENABLED" ? "true" : undefined), fetch: fake };
  const call = async (method: string, path: string, body?: unknown, user = ME) => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  // A synced club card (EA item id 101) and a typed-in card without an EA id.
  await call("POST", "/v1/club/import", { format: "xilab-club-capture", version: 1, verified: false, captured_at: "x", names: {}, items: [
    { item_id: 1, ea_item_id: 101, asset_id: 101, kind: "player", rating: 85, position: "CB", positions: ["CB"], team_id: 1, league_id: 2, nation_id: 3, rare_flag: 0, untradeable: false, loan: false, stats: null, skill_moves: null, weak_foot: null, seen_in: "club" },
  ] });
  await call("POST", "/v1/cards", { player_name: "Typed", overall: 80, positions: ["ST"], evidence: "game_data" });
  const r = await call("POST", "/v1/market/import/fc27-market");
  assert(r.status === 200, JSON.stringify(r.data));
  const d = r.data.data;
  assert(d.matched === 1 && d.observations === 2 && d.import.inserted === 2, JSON.stringify(d));
  assert(urls.every((u) => u.startsWith("https://fc27-market.val.run/")) && urls.length === 2, JSON.stringify(urls));
  const rows = db.tables.market_price_observations as { source_id: string; owner_user_id: string; platform: string }[];
  assert(rows.length === 2 && rows.every((x) => x.source_id === "fc27_market" && x.owner_user_id === ME && x.platform === "console"), JSON.stringify(rows));
  // Pulling again stores nothing new.
  const again = (await call("POST", "/v1/market/import/fc27-market")).data.data;
  assert(again.import.inserted === 0, JSON.stringify(again));
});

Deno.test("market: community pool is opt-in, give-to-get, pooled by median, and leaves when you stop sharing", async () => {
  const { db, call } = setup();
  const perm = { commercial_use: false, storage: true, retention_days: 30, display: true, derived_analytics: true, model_training: false, redistribution: false, attribution: "XI Lab community" };
  (db.tables.market_price_sources as unknown[]).push({ id: "community_pool", name: "XI Lab community", kind: "browser_capture", status: "enabled", is_demo: false, status_note: "Pooled.", permissions: perm, evidence: "estimate" });
  const THIRD = "33333333-3333-4333-8333-333333333333";
  const club = (user: string) => call("POST", "/v1/club/import", { format: "xilab-club-capture", version: 1, verified: false, captured_at: "x", names: {}, items: [
    { item_id: 1, ea_item_id: 101, asset_id: 101, kind: "player", rating: 85, position: "CB", positions: ["CB"], team_id: 1, league_id: 2, nation_id: 3, rare_flag: 0, untradeable: false, loan: false, stats: null, skill_moves: null, weak_foot: null, seen_in: "club" },
  ] }, user);
  const hour = new Date(Math.floor((Date.now() - 3 * H) / H) * H);
  const at = (mins: number) => new Date(hour.getTime() + mins * 60_000).toISOString();
  const capture = (rows: string[]) => ["ea_item_id,asset_id,rating,platform,price,observed_at,kind,listings", ...rows].join("\n");

  // Not sharing: importing a capture adds nothing to the pool, and pulling is refused.
  await club(ME);
  let r = await call("POST", "/v1/market/prices/import", { text: capture([`101,101,85,console,10000,${at(5)},lowest_bin,3`]) });
  assert(r.status === 200 && r.data.data.shared_with_community === 0, JSON.stringify(r.data));
  assert(!(db.tables.market_community_observations ?? []).length, "nothing pooled without opting in");
  r = await call("POST", "/v1/market/import/community");
  assert(r.status === 403, JSON.stringify(r.data));

  // Two others share; one has a typo price that is dropped as an outlier. Lowest price per hour per person is kept.
  for (const u of [OTHER, THIRD]) {
    await club(u);
    assert((await call("POST", "/v1/market/sharing", { sharing: true }, u)).data.data.sharing === true, "opt in");
  }
  r = await call("POST", "/v1/market/prices/import", { text: capture([`101,101,85,console,10400,${at(10)},lowest_bin,2`, `101,101,85,console,10200,${at(20)},lowest_bin,4`, `101,101,85,pc,9000,${at(10)},lowest_bin,1`]) }, OTHER);
  assert(r.data.data.shared_with_community === 2, JSON.stringify(r.data));
  await call("POST", "/v1/market/prices/import", { text: capture([`101,101,85,console,10600,${at(30)},lowest_bin,1`, `101,101,85,console,99,${at(31)},lowest_bin,1`]) }, THIRD);
  const pool = db.tables.market_community_observations as { contributor_user_id: string; price: number; platform: string }[];
  assert(pool.length === 3 && pool.find((x) => x.contributor_user_id === OTHER && x.platform === "console")!.price === 10200, JSON.stringify(pool));

  // I opt in and pull: one console hour (median of 10200 and 10600) and one PC hour.
  await call("POST", "/v1/market/sharing", { sharing: true });
  r = await call("POST", "/v1/market/import/community");
  assert(r.status === 200, JSON.stringify(r.data));
  const d = r.data.data;
  assert(d.cards_with_community_prices === 1 && d.observations === 2 && d.import.inserted === 2 && d.sharers === 3 && d.max_contributors === 2, JSON.stringify(d));
  const mine = (db.tables.market_price_observations as { owner_user_id: string; source_id: string; price: number; platform: string }[]).filter((x) => x.owner_user_id === ME && x.source_id === "community_pool");
  assert(mine.some((x) => x.platform === "console" && x.price === 10400) && mine.some((x) => x.platform === "pc" && x.price === 9000), JSON.stringify(mine));

  // Stopping deletes what you contributed.
  const off = (await call("POST", "/v1/market/sharing", { sharing: false }, OTHER)).data.data;
  assert(off.sharing === false && off.deleted === 2 && off.your_contributions === 0, JSON.stringify(off));
  assert((db.tables.market_community_observations as { contributor_user_id: string }[]).every((x) => x.contributor_user_id !== OTHER), "contributions removed");
});
