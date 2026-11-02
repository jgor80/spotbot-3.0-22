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
  assert((await tool("get_fut_market_data_sources")).data.sources.length === 3, "sources");
  assert((await tool("get_fut_card_market_intelligence", { card_id: "nope" })).isError, "bad id is a tool error");
});
