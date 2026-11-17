// MCP FUT tools: same numbers as the website (shared services), the player's own data only, read-only,
// and a clear "sign in first" when the Discord account has no GafferBot website account.
import { handleBody } from "./protocol.ts";
import { FUT_TOOLS, type FutCtx } from "./fut.ts";
import { memoryDb } from "./test-db.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";
import { handle } from "../fut-api/handler.ts";

const DISCORD = "111111111111111111";
const STRANGER = "333333333333333333";
const USER = "11111111-1111-4111-8111-111111111111";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

async function setup() {
  const fut = futMemoryDb({ ...seededRules() });
  const db = memoryDb({ user_discord_links: [{ discord_user_id: DISCORD, auth_user_id: USER, verified: true }] });
  // Build the squad through the website API, exactly as a player would.
  const web = async (method: string, path: string, body?: unknown) => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
      { db: fut, userFor: () => Promise.resolve(USER), env: () => "true" });
    return (await res.json()).data;
  };
  const add = async (name: string, pos: string, league: string, nation: string) =>
    (await web("POST", "/v1/cards", { player_name: name, overall: 85, positions: [pos], club: `${name} FC`, league, nation, evidence: "game_data" })).id as string;
  const a = await add("Alpha One", "ST", "Alpha League", "N1");
  const b = await add("Alpha Two", "ST", "Alpha League", "N2");
  const c = await add("Alpha Three", "CAM", "Alpha League", "N3");
  const six = await add("Alpha Six", "LM", "Alpha League", "N6");
  let squad = await web("POST", "/v1/squads/new", { formation: "3-5-2", name: "Test XI" });
  for (const [slot, card_id] of [["LST", a], ["RST", b], ["CAM", c]]) squad = await web("POST", "/v1/squads/assign", { squad, slot, card_id });
  squad = await web("POST", "/v1/squads", squad);
  const webChem = await web("POST", "/v1/squads/chemistry", { squad: squad.id });
  // deno-lint-ignore no-explicit-any
  const call = async (name: string, args: Record<string, unknown> = {}, discordUserId = DISCORD): Promise<{ text: string; isError?: boolean; data: any }> => {
    const ctx: FutCtx = { db, discordUserId, futDb: fut };
    // deno-lint-ignore no-explicit-any
    const reply: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, FUT_TOOLS, ctx);
    const text = reply.result.content[0].text;
    let data = null;
    try { data = JSON.parse(text); } catch { /* error text */ }
    return { text, isError: reply.result.isError, data };
  };
  return { fut, call, ids: { a, b, c, six }, squad, webChem };
}

Deno.test("FUT tools are all read-only and say fut in their names", async () => {
  // deno-lint-ignore no-explicit-any
  const reply: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/list" }, FUT_TOOLS, {} as FutCtx);
  for (const t of reply.result.tools) {
    assert(t.name.includes("fut"), `${t.name} needs fut in its name`);
    assert(t.annotations.readOnlyHint === true, `${t.name} must be read-only`);
  }
  assert(reply.result.tools.length === 44, `forty-four tools (every FUT page has one), got ${reply.result.tools.length}`);
  for (const name of ["search_fut_players", "search_fut_market_cards", "get_fut_price_history", "compare_any_fut_cards", "get_my_fut_club_value", "get_fut_coach_plan",
    "get_fut_daily_strategy", "get_fut_pack_advice", "get_my_fut_account", "get_my_fut_watchlist", "get_my_current_fut_squad", "fut_squad_advisor", "fut_squad_upgrades",
    "fut_ideal_squad", "get_fut_meta_formations", "get_fut_squad_roles", "get_fut_team_plan"]) {
    assert(reply.result.tools.some((t: { name: string }) => t.name === name), `${name} is listed`);
  }
});

Deno.test("calculate_fut_chemistry matches the website's numbers exactly", async () => {
  const { call, webChem } = await setup();
  const r = await call("calculate_fut_chemistry", {});
  assert(!r.isError, r.text);
  assert(JSON.stringify(r.data) === JSON.stringify(webChem), "same result as the website");
  assert(r.data.rule_status === "unverified" && r.data.rule_version === "fc27-community-v1", "unverified rules are flagged");
});

Deno.test("previews, diagnoses and optimizer runs never change the saved squad", async () => {
  const { call, fut, ids, squad } = await setup();
  const before = JSON.stringify(fut.tables.squad_slots);
  const p = await call("preview_fut_swap", { slot: "CAM", card_id: null });
  assert(!p.isError && p.data.diff.delta < 0, p.text);
  const d = await call("diagnose_fut_chemistry", { slot: "LST" });
  assert(!d.isError && d.data.rule_version === "fc27-community-v1", d.text);
  const o = await call("optimize_fut_squad", { squad_id: squad.id, total_target: 4 });
  assert(!o.isError && o.data.status === "solutions", o.text.slice(0, 300));
  assert(o.data.solutions[0].squad.slots.some((s: { card: { id: string } | null }) => s.card?.id === ids.six), "uses the player's own card");
  assert(fut.tables.optimization_runs.length === 1 && fut.tables.optimization_runs[0]!.via === "mcp", "run logged for audit");
  assert(JSON.stringify(fut.tables.squad_slots) === before && fut.tables.squads.length === 1, "squad untouched");
  assert((await call("optimize_fut_squad", {})).isError, "needs a goal");
});

Deno.test("inventory, card, squad and compare tools return the player's own data", async () => {
  const { call, ids, squad } = await setup();
  assert((await call("get_my_fut_inventory", { position: "ST" })).data.count === 2, "inventory filter");
  assert((await call("get_fut_card", { card_id: ids.c })).data.card.player_name === "Alpha Three", "card");
  assert((await call("get_my_fut_squad", {})).data.squad.id === squad.id, "squad edited last");
  assert((await call("get_my_fut_squad", { list: true })).data.squads[0].filled === 3, "list");
  const cmp = (await call("compare_fut_cards", { card_ids: [ids.a, ids.c] })).data;
  assert(cmp.shared.league === "Alpha League" && cmp.evidence === "game_data", "compare");
  assert(!(await call("compare_fut_squads", { squad_a: squad.id, squad_b: squad.id })).isError, "compare squads");
  assert((await call("get_fut_card", { card_id: "not-an-id" })).isError, "bad id is a tool error");
  assert((await call("get_my_fut_squad", { squad_id: "sq_nope" })).isError, "unknown squad is a tool error");
});

Deno.test("a Discord account with no website account is told to sign in, and sees nothing", async () => {
  const { call } = await setup();
  for (const name of ["get_my_fut_squad", "get_my_fut_inventory", "calculate_fut_chemistry", "optimize_fut_squad"]) {
    const r = await call(name, {}, STRANGER);
    assert(r.isError && r.text.includes("gafferbot.app/fut"), `${name}: ${r.text}`);
  }
});

Deno.test("get_fut_card carries every in-game attribute and FC 27 role", async () => {
  const { call, fut, ids } = await setup();
  const r0 = await call("get_fut_card", { card_id: ids.c });
  assert(!r0.isError && "attributes" in r0.data && Array.isArray(r0.data.roles), r0.text.slice(0, 300));
  const row = fut.tables.card_attributes!.find((x) => x.card_id === ids.a);
  if (row) Object.assign(row, { detail: { acceleration: 93, agility: 88, finishing: 90 }, foot: "right", height_cm: 182, accelerate_type: "EXPLOSIVE" });
  else fut.tables.card_attributes!.push({ card_id: ids.a, pac: 90, detail: { acceleration: 93, agility: 88, finishing: 90 }, foot: "right", height_cm: 182, accelerate_type: "EXPLOSIVE" });
  (fut.tables.card_roles ||= []).push({ card_id: ids.a, position_code: "ST", role: "Advanced Forward", level: "plusplus" });
  const r = await call("get_fut_card", { card_id: ids.a });
  assert(!r.isError && r.data.attributes.acceleration === 93 && r.data.attributes.finishing === 90 && r.data.attributes.accelerate_type === "EXPLOSIVE", r.text.slice(0, 300));
  assert(r.data.roles[0].role === "Advanced Forward" && r.data.roles[0].level === "plusplus", "roles");
});

Deno.test("market searches pass the AI's filters through and clamp the page size", async () => {
  const { call, fut } = await setup();
  const seen: [string, Record<string, unknown>][] = [];
  // deno-lint-ignore no-explicit-any
  (fut as any).rpc = (name: string, args: Record<string, unknown>) => { seen.push([name, args]); return Promise.resolve({ data: { cards: [], total: 0 }, error: null }); };
  const p = await call("search_fut_players", { text: "Mbappe", positions: ["ST"], minimums: [{ stat: "sprint_speed", value: 90 }], weights: [{ stat: "finishing", weight: 5 }], limit: 500 });
  assert(!p.isError, p.text);
  const [name, a] = seen[0]!;
  // deno-lint-ignore no-explicit-any
  const q = a.p_query as any;
  assert(name === "futgg_player_search" && q.text === "Mbappe" && q.positions[0] === "ST" && q.minimums[0].stat === "sprint_speed" && q.weights[0].weight === 5 && q.limit === 50 && a.p_user === USER, JSON.stringify(a));
  const m = await call("search_fut_market_cards", { query: "Rodri", sort: "change_asc" });
  assert(!m.isError && seen[1]![0] === "futgg_market_cards" && seen[1]![1].p_q === "Rodri" && seen[1]![1].p_sort === "change_asc" && seen[1]![1].p_limit === 20, JSON.stringify(seen[1]));
  assert((await call("search_fut_market_cards", { sort: "random" })).isError, "unknown sort is a tool error");
  const v = await call("get_my_fut_club_value", {});
  assert(!v.isError && seen[2]![0] === "club_trade_value" && seen[2]![1].p_user === USER, "club value is the caller's own");
});

Deno.test("squad helpers default to the squad the player plays now and change nothing", async () => {
  const { call, fut, squad } = await setup();
  const before = JSON.stringify(fut.tables.squad_slots);
  const cur = await call("get_my_current_fut_squad", {});
  assert(!cur.isError && cur.data.source === "saved" && cur.data.squad.id === squad.id, cur.text.slice(0, 300));
  const roles = await call("get_fut_squad_roles", {});
  assert(!roles.isError && roles.data.squad.id === squad.id, roles.text.slice(0, 300));
  assert((await call("fut_squad_upgrades", {})).isError, "needs a budget");
  assert((await call("fut_ideal_squad", { formation: "9-0-1" })).isError, "unknown formation is a tool error");
  assert(JSON.stringify(fut.tables.squad_slots) === before && fut.tables.squads.length === 1, "squad untouched");
});

Deno.test("the new FUT tools also need a website account", async () => {
  const { call } = await setup();
  for (const name of ["search_fut_players", "get_fut_coach_plan", "get_fut_daily_strategy", "get_my_fut_account", "get_fut_pack_advice", "get_my_current_fut_squad", "get_fut_team_plan"]) {
    const r = await call(name, {}, STRANGER);
    assert(r.isError && r.text.includes("gafferbot.app/fut"), `${name}: ${r.text}`);
  }
});
