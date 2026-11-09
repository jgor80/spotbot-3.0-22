// XI Lab website API: sign-in and the FUT switch, per-user isolation, card and manager storage, and XI Lab's
// squad workspace (builder, Chemistry Surgeon, swap preview, optimizer, compare) on the fut schema.
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

type Call = ReturnType<typeof setup>["call"];
// deno-lint-ignore no-explicit-any
type Json = any;

/** Builds a squad the way the website does: new blank squad, assign cards into slots, save. */
async function buildSquad(call: Call, picks: [string, string | null][], user = ME, locked: string[] = []) {
  let squad: Json = (await call("POST", "/v1/squads/new", { formation: "3-5-2", name: "Test XI", budget: 50000 }, user)).data.data;
  for (const [slot, card_id] of picks) {
    const r = await call("POST", "/v1/squads/assign", { squad, slot, card_id }, user);
    assert(r.status === 200, `assign ${slot}: ${JSON.stringify(r.data)}`);
    squad = r.data.data;
  }
  squad.slots = squad.slots.map((s: Json) => ({ ...s, locked: locked.includes(s.slot) }));
  const saved = await call("POST", "/v1/squads", squad, user);
  assert(saved.status === 200, `save ${JSON.stringify(saved.data)}`);
  return saved.data.data;
}

async function alphaSquad(call: Call) {
  const add = async (c: Record<string, unknown>) => (await call("POST", "/v1/cards", c)).data.data.id as string;
  // Five Alpha League players in position: league count 5 -> 2 points each. One Beta League player on 0.
  const ids = {
    a1: await add(card("Alpha One", ["ST"], "Alpha League", "Nation A1")),
    a2: await add(card("Alpha Two", ["ST"], "Alpha League", "Nation A2")),
    a3: await add(card("Alpha Three", ["CAM"], "Alpha League", "Nation A3")),
    a4: await add(card("Alpha Four", ["CDM"], "Alpha League", "Nation A4")),
    a5: await add(card("Alpha Five", ["CDM"], "Alpha League", "Nation A5")),
    b1: await add(card("Beta One", ["LM"], "Beta League", "Nation B")),
    b2: await add(card("Beta Two", ["CAM"], "Beta League", "Nation B")),
  };
  const squad = await buildSquad(call, [["LST", ids.a1], ["RST", ids.a2], ["CAM", ids.a3], ["LCDM", ids.a4], ["RCDM", ids.a5], ["LM", ids.b1]], ME, ["LST"]);
  return { ids, squad };
}

Deno.test("fut-api is hidden while FUT_ENABLED is off and needs a signed-in user", async () => {
  const off = setup({});
  assert((await off.call("GET", "/v1/health")).status === 404, "should 404 while off");
  const on = setup();
  assert((await on.call("GET", "/v1/health", undefined, null)).status === 401, "should need sign-in");
  const health = await on.call("GET", "/v1/health");
  assert(health.status === 200 && health.data.card_images?.faces === false, "health, EA faces off by default");
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
  const edited = await call("PUT", `/v1/cards/${c.id}`, card("Test Keeper", ["GK"], "Alpha League", "Nation A", undefined, { overall: 88, owned: false, price: 9000 }));
  assert(edited.data.data.overall === 88 && !edited.data.data.owned && edited.data.data.price === 9000 && edited.data.data.stats.pac === undefined, "edit replaces the card");
  assert((await call("POST", "/v1/cards", card("X", ["ST"], "L", "N", undefined, { evidence: "verified" }))).status === 400, "verified refused");
  assert((await call("DELETE", `/v1/cards/${c.id}`)).status === 200, "delete");
  assert((await call("GET", `/v1/cards/${c.id}`)).status === 404, "gone");
});

Deno.test("bad card and squad input gets a message the user or AI can act on", async () => {
  const { call } = setup();
  for (const bad of [{ overall: 100 }, { positions: [] }, { positions: ["Centre back"] }, { player_name: "" }, { stats: { pac: 0 } }, { skill_moves: 6 }]) {
    const r = await call("POST", "/v1/cards", { ...card("Bad", ["CB"], "L", "N"), ...bad });
    assert(r.status === 400 && typeof r.data.error === "string", `expected 400 for ${JSON.stringify(bad)}`);
  }
  assert((await call("POST", "/v1/squads/new", { formation: "9-9-9" })).status === 400, "unknown formation");
  assert((await call("POST", "/v1/squads", { name: "x" })).status === 400, "not a squad");
  const blank = (await call("POST", "/v1/squads/new", { formation: "3-5-2" })).data.data;
  assert((await call("POST", "/v1/squads", { ...blank, slots: [{ slot: "GK", position: "G1", card: null, locked: false }] })).status === 400, "bad position");
  assert((await call("POST", "/v1/squads", { ...blank, slots: [blank.slots[0], blank.slots[0]] })).status === 400, "duplicate slot");
  assert((await call("POST", "/v1/squads/chemistry", { squad: blank.id })).status === 404, "unsaved id");
});

Deno.test("one user never sees or changes another user's cards, managers or squads", async () => {
  const { call } = setup();
  const id = (await call("POST", "/v1/cards", card("Mine", ["ST"], "L", "N"))).data.data.id;
  const mgr = (await call("POST", "/v1/managers", { name: "Boss", nation: "N" })).data.data.id;
  const sq = await buildSquad(call, [["LST", id]]);
  assert((await call("GET", "/v1/cards", undefined, OTHER)).data.count === 0, "list");
  assert((await call("GET", `/v1/cards/${id}`, undefined, OTHER)).status === 404, "get card");
  assert((await call("PUT", `/v1/cards/${id}`, card("Stolen", ["ST"], "L", "N"), OTHER)).status === 404, "edit card");
  assert((await call("DELETE", `/v1/cards/${id}`, undefined, OTHER)).status === 404, "delete card");
  assert((await call("GET", "/v1/managers", undefined, OTHER)).data.data.length === 0, "managers");
  assert((await call("DELETE", `/v1/managers/${mgr}`, undefined, OTHER)).status === 404, "delete manager");
  assert((await call("GET", "/v1/squads", undefined, OTHER)).data.data.length === 0, "list squads");
  assert((await call("GET", `/v1/squads/${sq.id}`, undefined, OTHER)).status === 404, "get squad");
  assert((await call("POST", "/v1/squads/chemistry", { squad: sq.id }, OTHER)).status === 404, "chemistry");
  assert((await call("DELETE", `/v1/squads/${sq.id}`, undefined, OTHER)).status === 404, "delete squad");
  // Re-saving my squad's id as someone else answers like a missing squad and leaves mine alone.
  assert((await call("POST", "/v1/squads", { ...sq, name: "Hijack" }, OTHER)).status === 404, "overwrite squad");
  assert((await call("GET", `/v1/squads/${sq.id}`)).data.data.name === "Test XI", "mine untouched");
  assert((await call("POST", "/v1/squads/assign", { squad: sq, slot: "RST", card_id: id }, OTHER)).status === 404, "use my card");
  assert((await call("POST", "/v1/cards/compare", { card_ids: [id, id] }, OTHER)).status === 404, "compare");
});

Deno.test("compare cards: numbers only, labelled by the weakest card", async () => {
  const { call } = setup();
  const a = (await call("POST", "/v1/cards", card("A", ["CB"], "Alpha League", "Nation A", "Same FC", { overall: 90, stats: { pac: 80, def: 91 } }))).data.data.id;
  const b = (await call("POST", "/v1/cards", card("B", ["CB", "RB"], "Alpha League", "Nation B", "Same FC", { overall: 86, stats: { pac: 85 }, evidence: "estimate" }))).data.data.id;
  const r = (await call("POST", "/v1/cards/compare", { card_ids: [a, b] })).data.data;
  assert(r.leaders.overall.card_ids[0] === a && r.leaders.pac.card_ids[0] === b && r.leaders.def === null, "leaders, nothing guessed");
  assert(r.shared.club === "Same FC" && r.shared.nation === null && r.shared_positions.join() === "CB", "shared");
  assert(r.evidence === "estimate", "weakest evidence");
});

Deno.test("chemistry comes from XI Lab's engine with the rule version and its unverified status", async () => {
  const { call } = setup();
  const { squad } = await alphaSquad(call);
  const saved = (await call("POST", "/v1/squads/chemistry", { squad: squad.id })).data.data;
  const unsaved = (await call("POST", "/v1/squads/chemistry", { squad })).data.data;
  assert(JSON.stringify(saved.chemistry) === JSON.stringify(unsaved.chemistry), "by id and by object agree");
  const chem = saved.chemistry;
  assert(saved.rule_version === "fc27-community-v1" && saved.rule_status === "unverified", "labels");
  assert(saved.fit.evidence === "estimate", "tactical fit is a separate estimate");
  const by = Object.fromEntries(chem.players.map((p: { slot: string; chemistry: number }) => [p.slot, p.chemistry]));
  assert(by.LST === 2 && by.CAM === 2 && by.LM === 0 && chem.total === 10, `chemistry ${JSON.stringify(by)} total ${chem.total}`);
});

Deno.test("a manager adds one to their nation's count (rule v1), not a direct point", async () => {
  const { call } = setup();
  const { squad } = await alphaSquad(call);
  const mgr = (await call("POST", "/v1/managers", { name: "Coach B", nation: "Nation B" })).data.data;
  // Beta One alone has 1 Nation B player; with the manager the count is 2 -> 1 point.
  const r = (await call("POST", "/v1/squads/chemistry", { squad: { ...squad, manager: mgr } })).data.data;
  const lm = r.chemistry.players.find((p: { slot: string }) => p.slot === "LM");
  assert(lm.chemistry === 1 && r.chemistry.total === 11, `LM ${lm.chemistry} total ${r.chemistry.total}`);
});

Deno.test("Chemistry Surgeon and swap preview: a swap that lifts one player but costs teammates is a net loss", async () => {
  const { call } = setup();
  const { ids, squad } = await alphaSquad(call);
  const dx = await call("POST", "/v1/squads/diagnose", { squad: squad.id, slot: "LM" });
  assert(dx.status === 200 && dx.data.data.rule_version === "fc27-community-v1", `diagnose ${JSON.stringify(dx.data)}`);
  const r = (await call("POST", "/v1/squads/preview", { squad: squad.id, slot: "CAM", card_id: ids.b2 })).data.data;
  assert(r.total_before === 10 && r.total_after === 6 && r.diff.delta === -4, `diff ${JSON.stringify(r.diff)}`);
  const lm = r.diff.changes.find((c: { slot: string }) => c.slot === "LM");
  assert(lm && lm.delta === 1, "Beta One gains a nation link");
  const after = (await call("GET", `/v1/squads/${squad.id}`)).data.data;
  assert(after.slots.find((s: { slot: string }) => s.slot === "CAM").card.id === ids.a3, "preview never saves");
  assert((await call("POST", "/v1/squads/preview", { squad: squad.id, slot: "CAM", card_id: ids.a1 })).status === 400, "same card twice");
  assert((await call("POST", "/v1/squads/preview", { squad: squad.id, slot: "XX", card_id: ids.b2 })).status === 400, "unknown slot");
});

Deno.test("optimizer: finds the cheap fix from the user's cards, keeps locks, and logs the run", async () => {
  const { call, db } = setup();
  const { ids, squad } = await alphaSquad(call);
  const six = (await call("POST", "/v1/cards", card("Alpha Six", ["LM"], "Alpha League", "Nation A6"))).data.data.id;
  const r = await call("POST", "/v1/squads/optimize", { squad: squad.id, goal: { total_target: 12 }, options: { max_swaps: 2 } });
  assert(r.status === 200 && r.data.data.status === "solutions", `optimize ${JSON.stringify(r.data).slice(0, 400)}`);
  const best = r.data.data.solutions[0];
  assert(best.total_after >= 12 && best.total_before === 10 && best.cost === 0, `best ${JSON.stringify(best).slice(0, 300)}`);
  assert(best.squad.slots.find((s: { slot: string }) => s.slot === "LM").card.id === six, "Alpha Six goes in");
  for (const sol of r.data.data.solutions) {
    assert(sol.squad.slots.find((s: { slot: string }) => s.slot === "LST").card.id === ids.a1, "locked LST never moves");
  }
  assert(db.tables.optimization_runs.length === 1 && db.tables.optimization_runs[0]!.rule_version_id === "fc27-community-v1", "run logged");
  // Save the solution as a new squad; the original stays as it was.
  const copy = await call("POST", "/v1/squads/save-as", { squad: best.squad, name: "Test XI fixed" });
  assert(copy.status === 201 && copy.data.data.parent_id === squad.id && copy.data.data.id !== squad.id, `save-as ${JSON.stringify(copy.data)}`);
  const list = (await call("GET", "/v1/squads")).data.data;
  assert(list.length === 2, "two squads");
  const original = (await call("GET", `/v1/squads/${squad.id}`)).data.data;
  assert(original.slots.find((s: { slot: string }) => s.slot === "LM").card.id === ids.b1, "original untouched");
  const cmp = await call("POST", "/v1/squads/compare", { a: squad.id, b: copy.data.data.id });
  assert(cmp.status === 200 && cmp.data.data.b.total > cmp.data.data.a.total, "compare");
  assert((await call("DELETE", `/v1/squads/${copy.data.data.id}`)).status === 200, "delete");
});

Deno.test("stored cards are read fresh; a deleted card falls back to the squad's saved copy", async () => {
  const { call } = setup();
  const { ids, squad } = await alphaSquad(call);
  await call("PUT", `/v1/cards/${ids.b1}`, card("Beta One", ["LM"], "Alpha League", "Nation B"));
  const fresh = (await call("POST", "/v1/squads/chemistry", { squad: squad.id })).data.data;
  assert(fresh.chemistry.players.find((p: { slot: string }) => p.slot === "LM").chemistry === 2, "edit shows up");
  await call("DELETE", `/v1/cards/${ids.a2}`);
  const kept = (await call("GET", `/v1/squads/${squad.id}`)).data.data;
  assert(kept.slots.find((s: { slot: string }) => s.slot === "RST").card.name === "Alpha Two", "saved copy kept");
});
