// XI Lab website API: sign-in and the FUT switch, per-user isolation, card and squad storage, and chemistry
// computed by XI Lab's engine (including multi-swap previews that recalculate every starter).
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup(env: Record<string, string> = { FUT_ENABLED: "true" }) {
  const db = futMemoryDb({ ...seededRules() });
  const deps: Deps = {
    db,
    userFor: (req) => Promise.resolve(req.headers.get("x-test-user")),
    env: (k) => env[k],
  };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, user: string | null = ME): Promise<{ status: number; data: any }> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (user) headers["x-test-user"] = user;
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: res.status === 204 ? null : await res.json() };
  };
  return { db, call };
}

// Fictional cards: real FC 27 card details are entered by the user from the game, never invented here.
const card = (name: string, positions: string[], league: string, nation: string, club = `${name} FC`, extra: Record<string, unknown> = {}) =>
  ({ player_name: name, overall: 85, positions, club, league, nation, evidence: "game_data", ...extra });

Deno.test("fut-api is hidden while FUT_ENABLED is off and needs a signed-in user", async () => {
  const off = setup({});
  assert((await off.call("GET", "/v1/health")).status === 404, "should 404 while off");
  const on = setup();
  assert((await on.call("GET", "/v1/health", undefined, null)).status === 401, "should need sign-in");
  assert((await on.call("GET", "/v1/health")).status === 200, "health");
  assert((await on.call("GET", "/v2/cards")).status === 404, "unknown version");
});

Deno.test("cards: add, search, edit, delete; nothing typed in is ever 'verified'", async () => {
  const { call, db } = setup();
  const added = await call("POST", "/v1/cards", card("Test Keeper", ["GK"], "Alpha League", "Nation A", undefined,
    { stats: { pac: 50, def: 30 }, playstyles: ["Far Reach"], playstyles_plus: ["Footwork"], purchase_price: 12000 }));
  assert(added.status === 201, `add ${added.status} ${JSON.stringify(added.data)}`);
  const c = added.data.data;
  assert(c.source === "user_entered" && c.owned && c.purchase_price === 12000 && c.stats.pac === 50, "stored card");
  assert(c.playstyles_plus[0] === "Footwork" && c.playstyles[0] === "Far Reach", "playstyles");
  assert(db.tables.accounts.length === 1, "account created on first card");
  assert((await call("GET", "/v1/cards?q=keeper")).data.count === 1, "search by name");
  assert((await call("GET", "/v1/cards?position=st")).data.count === 0, "search by position");
  const edited = await call("PUT", `/v1/cards/${c.id}`, card("Test Keeper", ["GK"], "Alpha League", "Nation A", undefined, { overall: 88, owned: false }));
  assert(edited.data.data.overall === 88 && !edited.data.data.owned && edited.data.data.stats.pac === undefined, "edit replaces the card");
  assert((await call("POST", "/v1/cards", card("X", ["ST"], "L", "N", undefined, { evidence: "verified" }))).status === 400, "verified refused");
  assert((await call("DELETE", `/v1/cards/${c.id}`)).status === 200, "delete");
  assert((await call("GET", `/v1/cards/${c.id}`)).status === 404, "gone");
});

Deno.test("bad card input gets a message the user or AI can act on", async () => {
  const { call } = setup();
  for (const bad of [{ overall: 100 }, { positions: [] }, { positions: ["Centre back"] }, { player_name: "" }, { stats: { pac: 0 } }, { skill_moves: 6 }]) {
    const r = await call("POST", "/v1/cards", { ...card("Bad", ["CB"], "L", "N"), ...bad });
    assert(r.status === 400 && typeof r.data.error === "string", `expected 400 for ${JSON.stringify(bad)}`);
  }
});

Deno.test("one user never sees or changes another user's cards or squads", async () => {
  const { call } = setup();
  const id = (await call("POST", "/v1/cards", card("Mine", ["ST"], "L", "N"))).data.data.id;
  const sq = (await call("POST", "/v1/squads", { name: "Mine", formation: "3-5-2", slots: [{ slot: "LS", position: "ST", card_id: id }] })).data.data.id;
  assert((await call("GET", "/v1/cards", undefined, OTHER)).data.count === 0, "list");
  assert((await call("GET", `/v1/cards/${id}`, undefined, OTHER)).status === 404, "get card");
  assert((await call("PUT", `/v1/cards/${id}`, card("Stolen", ["ST"], "L", "N"), OTHER)).status === 404, "edit card");
  assert((await call("DELETE", `/v1/cards/${id}`, undefined, OTHER)).status === 404, "delete card");
  assert((await call("GET", `/v1/squads/${sq}`, undefined, OTHER)).status === 404, "get squad");
  assert((await call("POST", "/v1/chemistry", { squad_id: sq }, OTHER)).status === 404, "chemistry");
  const theirs = await call("POST", "/v1/squads", { name: "Theirs", formation: "3-5-2", slots: [{ slot: "LS", position: "ST", card_id: id }] }, OTHER);
  assert(theirs.status === 404, "can't put someone else's card in a squad");
  assert((await call("POST", "/v1/cards/compare", { card_ids: [id, id] }, OTHER)).status === 404, "compare");
});

Deno.test("compare: numbers only, labelled by the weakest card", async () => {
  const { call } = setup();
  const a = (await call("POST", "/v1/cards", card("A", ["CB"], "Alpha League", "Nation A", "Same FC", { overall: 90, stats: { pac: 80, def: 91 } }))).data.data.id;
  const b = (await call("POST", "/v1/cards", card("B", ["CB", "RB"], "Alpha League", "Nation B", "Same FC", { overall: 86, stats: { pac: 85 }, evidence: "estimate" }))).data.data.id;
  const r = (await call("POST", "/v1/cards/compare", { card_ids: [a, b] })).data.data;
  assert(r.leaders.overall.card_ids[0] === a && r.leaders.pac.card_ids[0] === b && r.leaders.def === null, "leaders, nothing guessed");
  assert(r.shared.club === "Same FC" && r.shared.nation === null && r.shared_positions.join() === "CB", "shared");
  assert(r.evidence === "estimate", "weakest evidence");
});

async function alphaSquad(call: ReturnType<typeof setup>["call"]) {
  const add = async (c: Record<string, unknown>) => (await call("POST", "/v1/cards", c)).data.data.id as string;
  // Five Alpha League strikers/mids in position: league count 5 -> 2 points each. One Beta League player on 0.
  const ids = {
    a1: await add(card("Alpha One", ["ST"], "Alpha League", "Nation A1")),
    a2: await add(card("Alpha Two", ["ST"], "Alpha League", "Nation A2")),
    a3: await add(card("Alpha Three", ["CAM"], "Alpha League", "Nation A3")),
    a4: await add(card("Alpha Four", ["CDM"], "Alpha League", "Nation A4")),
    a5: await add(card("Alpha Five", ["CDM"], "Alpha League", "Nation A5")),
    b1: await add(card("Beta One", ["LM"], "Beta League", "Nation B")),
    b2: await add(card("Beta Two", ["CAM"], "Beta League", "Nation B")),
  };
  const squad = await call("POST", "/v1/squads", {
    name: "Test XI", formation: "3-5-2", is_active: true, slots: [
      { slot: "LS", position: "ST", card_id: ids.a1, locked: true }, { slot: "RS", position: "ST", card_id: ids.a2 },
      { slot: "CAM", position: "CAM", card_id: ids.a3 }, { slot: "LCDM", position: "CDM", card_id: ids.a4 },
      { slot: "RCDM", position: "CDM", card_id: ids.a5 }, { slot: "LM", position: "LM", card_id: ids.b1 },
      { slot: "GK", position: "GK", card_id: null },
    ],
  });
  assert(squad.status === 201, `save squad ${JSON.stringify(squad.data)}`);
  return { ids, squadId: squad.data.data.id as string };
}

Deno.test("chemistry comes from XI Lab's engine with the rule version and its unverified status", async () => {
  const { call } = setup();
  const { squadId } = await alphaSquad(call);
  const r = (await call("POST", "/v1/chemistry", {})).data.data; // no id: the active squad
  assert(r.squad.id === squadId && r.squad.empty_slots.join() === "GK", "active squad, empty slot listed");
  const chem = r.chemistry;
  assert(chem.rule_version === "fc27-community-v1" && chem.rule_status === "unverified" && chem.evidence === "hypothesis", "labels");
  assert(!chem.full_chemistry_verified && typeof r.rules_note === "string", "never claims verified");
  const by = Object.fromEntries(chem.players.map((p: { slot: string; chemistry: number }) => [p.slot, p.chemistry]));
  assert(by.LS === 2 && by.CAM === 2 && by.LM === 0 && chem.total === 10, `chemistry ${JSON.stringify(by)} total ${chem.total}`);
});

Deno.test("a swap that lifts one player but costs teammates shows up as a net loss", async () => {
  const { call } = setup();
  const { ids, squadId } = await alphaSquad(call);
  const r = (await call("POST", "/v1/chemistry", { squad_id: squadId, swaps: [{ slot: "CAM", card_id: ids.b2 }] })).data.data;
  assert(r.diff.total_before === 10 && r.diff.total_after === 6 && r.diff.delta === -4, `diff ${JSON.stringify(r.diff)}`);
  const lm = r.diff.changes.find((c: { slot: string }) => c.slot === "LM");
  assert(lm && lm.delta === 1, "Beta One gains a nation link");
  assert(r.diff.changes.filter((c: { delta: number }) => c.delta < 0).length >= 4, "Alpha players lose");
  assert((await call("GET", `/v1/squads/${squadId}`)).data.data.slots.find((s: { slot: string }) => s.slot === "CAM").card_id === ids.a3, "preview never saves");
});

Deno.test("swaps: several at once, locked slots refused, no card twice", async () => {
  const { call } = setup();
  const { ids, squadId } = await alphaSquad(call);
  const two = await call("POST", "/v1/chemistry", { squad_id: squadId, swaps: [{ slot: "CAM", card_id: ids.b2 }, { slot: "RS", card_id: null }] });
  assert(two.status === 200 && two.data.data.after.players.length === 5, "two swaps recalculated together");
  assert((await call("POST", "/v1/chemistry", { squad_id: squadId, swaps: [{ slot: "LS", card_id: ids.b2 }] })).status === 400, "locked");
  assert((await call("POST", "/v1/chemistry", { squad_id: squadId, swaps: [{ slot: "CAM", card_id: ids.a1 }] })).status === 400, "duplicate card");
  assert((await call("POST", "/v1/chemistry", { squad_id: squadId, swaps: [{ slot: "XX", card_id: ids.b2 }] })).status === 400, "unknown slot");
});

Deno.test("squads: save as new keeps the original; one active squad", async () => {
  const { call } = setup();
  const { squadId } = await alphaSquad(call);
  const original = (await call("GET", `/v1/squads/${squadId}`)).data.data;
  const copy = await call("POST", "/v1/squads", { ...original, name: "Test XI v2", is_active: true, based_on_squad_id: squadId,
    manager: { nation: "Nation B" }, slots: original.slots.slice(0, 3) });
  assert(copy.status === 201 && copy.data.data.based_on_squad_id === squadId, "copy");
  const list = (await call("GET", "/v1/squads")).data.data;
  assert(list.length === 2 && list.filter((s: { is_active: boolean }) => s.is_active).length === 1, "one active");
  assert((await call("GET", `/v1/squads/${squadId}`)).data.data.slots.length === 7, "original untouched");
  assert((await call("POST", "/v1/squads", { name: "Dup", formation: "3-5-2", slots: [{ slot: "LS", position: "ST" }, { slot: "LS", position: "ST" }] })).status === 400, "duplicate slot");
});
