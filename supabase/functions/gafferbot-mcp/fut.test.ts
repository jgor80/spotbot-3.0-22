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
  const squad = await web("POST", "/v1/squads", { name: "Test XI", formation: "3-5-2", is_active: true,
    slots: [{ slot: "LS", position: "ST", card_id: a }, { slot: "RS", position: "ST", card_id: b }, { slot: "CAM", position: "CAM", card_id: c }] });
  const webChem = await web("POST", "/v1/chemistry", { squad_id: squad.id });
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
  return { fut, call, ids: { a, b, c }, squad, webChem };
}

Deno.test("FUT tools are all read-only and say fut in their names", async () => {
  // deno-lint-ignore no-explicit-any
  const reply: any = await handleBody({ jsonrpc: "2.0", id: 1, method: "tools/list" }, FUT_TOOLS, {} as FutCtx);
  for (const t of reply.result.tools) {
    assert(t.name.includes("fut"), `${t.name} needs fut in its name`);
    assert(t.annotations.readOnlyHint === true, `${t.name} must be read-only`);
  }
  assert(reply.result.tools.length === 5, "five Phase 1 tools");
});

Deno.test("calculate_fut_chemistry matches the website's numbers exactly", async () => {
  const { call, webChem, squad } = await setup();
  const r = await call("calculate_fut_chemistry", {});
  assert(!r.isError, r.text);
  assert(r.data.squad.id === squad.id, "active squad");
  assert(JSON.stringify(r.data.chemistry) === JSON.stringify(webChem.chemistry), "same result as the website");
  assert(r.data.chemistry.rule_status === "unverified" && r.data.rules_note, "unverified rules are flagged");
});

Deno.test("swap previews through MCP never change the saved squad", async () => {
  const { call, fut, ids } = await setup();
  const before = JSON.stringify(fut.tables.squad_slots);
  const r = await call("calculate_fut_chemistry", { swaps: [{ slot: "CAM", card_id: null }] });
  assert(!r.isError && r.data.diff.delta < 0, r.text);
  assert(JSON.stringify(fut.tables.squad_slots) === before, "squad untouched");
  const writes = fut.calls.length;
  await call("get_my_fut_inventory", {});
  await call("compare_fut_cards", { card_ids: [ids.a, ids.b] });
  await call("get_my_fut_squad", { list: true });
  assert(fut.tables.player_cards.length === 3 && fut.calls.length > writes, "reads only");
});

Deno.test("inventory, card, squad and compare tools return the player's own data", async () => {
  const { call, ids } = await setup();
  assert((await call("get_my_fut_inventory", { position: "ST" })).data.count === 2, "inventory filter");
  assert((await call("get_fut_card", { card_id: ids.c })).data.card.player_name === "Alpha Three", "card");
  assert((await call("get_my_fut_squad", {})).data.squad.slots.length === 3, "squad");
  const cmp = (await call("compare_fut_cards", { card_ids: [ids.a, ids.c] })).data;
  assert(cmp.shared.league === "Alpha League" && cmp.evidence === "game_data", "compare");
  assert((await call("get_fut_card", { card_id: "not-an-id" })).isError, "bad id is a tool error");
});

Deno.test("a Discord account with no website account is told to sign in, and sees nothing", async () => {
  const { call } = await setup();
  for (const name of ["get_my_fut_squad", "get_my_fut_inventory", "calculate_fut_chemistry"]) {
    const r = await call(name, {}, STRANGER);
    assert(r.isError && r.text.includes("gafferbot.app/fut"), `${name}: ${r.text}`);
  }
});
