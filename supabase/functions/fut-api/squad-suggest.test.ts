// Squad Builder suggestions: best XI from the user's club cards by overall or chemistry (one formation or all),
// ranked picks for an open slot, and each squad card's FC 27 player roles.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

const XI: [string, string[]][] = [["GK", ["GK"]], ["LB", ["LB"]], ["CB", ["CB"]], ["CB", ["CB"]], ["RB", ["RB"]], ["CM", ["CM"]], ["CM", ["CM", "CDM"]], ["CM", ["CM", "CAM"]], ["LW", ["LW", "LM"]], ["ST", ["ST"]], ["RW", ["RW", "RM"]]];

function setup() {
  const db = futMemoryDb(seededRules());
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { db, call };
}

/** Two fictional XIs: "Star" players are rated higher but share nothing; "Unity" players are lower rated, one club. */
async function club(call: ReturnType<typeof setup>["call"]) {
  for (const [i, [, positions]] of XI.entries()) {
    await call("POST", "/v1/cards", { player_name: `Star ${i}`, overall: 88, positions, club: `Star Club ${i}`, league: `Star League ${i}`, nation: `Starland ${i}`, evidence: "game_data" });
    await call("POST", "/v1/cards", { player_name: `Unity ${i}`, overall: 80, positions, club: "Unity FC", league: "Unity League", nation: "Unityland", evidence: "game_data" });
  }
}

// deno-lint-ignore no-explicit-any
const names = (squad: any) => squad.slots.map((s: any) => s.card?.name ?? "-");

Deno.test("best squad: by overall picks the highest rated, by chemistry the linked XI", async () => {
  const { call } = setup();
  await club(call);
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  const ovr = await call("POST", "/v1/squads/best", { squad, by: "ovr" });
  assert(ovr.status === 200, `ovr ${JSON.stringify(ovr.data)}`);
  const o = ovr.data.data.results[0];
  assert(o.formation === "4-3-3" && o.filled === 11 && o.rating === 88, `ovr result ${JSON.stringify({ ...o, squad: names(o.squad) })}`);
  assert(names(o.squad).every((n: string) => n.startsWith("Star")), "all stars");

  const chem = (await call("POST", "/v1/squads/best", { squad, by: "chem" })).data.data.results[0];
  assert(chem.chemistry > o.chemistry && chem.chemistry === 33, `chem ${chem.chemistry} vs ${o.chemistry}`);
  assert(names(chem.squad).every((n: string) => n.startsWith("Unity")), `unity ${names(chem.squad)}`);

  // A locked player stays.
  const locked = { ...squad, slots: squad.slots.map((s: { slot: string }) => s.slot === "ST" ? { ...s, card: o.squad.slots.find((x: { slot: string }) => x.slot === "ST").card, locked: true } : s) };
  const kept = (await call("POST", "/v1/squads/best", { squad: locked, by: "chem" })).data.data.results[0];
  assert(kept.squad.slots.find((s: { slot: string }) => s.slot === "ST").card.name === "Star 9", "locked ST kept");
});

Deno.test("best squad for every formation, best first; bad input is refused", async () => {
  const { call } = setup();
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  assert((await call("POST", "/v1/squads/best", { squad, by: "ovr" })).status === 400, "no club cards");
  await club(call);
  const all = (await call("POST", "/v1/squads/best", { squad, by: "chem", formation: "all" })).data.data;
  assert(all.results.length === 28 && all.owned_cards === 22, `28 formations ${all.results.length}`);
  assert(all.results[0].filled === 11 && all.results[0].chemistry === 33, `a full 33 first ${all.results[0].formation}`);
  assert(all.results.find((r: { formation: string }) => r.formation === "4-3-3").chemistry === 33, "4-3-3 reaches 33");
  for (let i = 1; i < all.results.length; i++) assert(all.results[i - 1].filled >= all.results[i].filled, "sorted");
  assert((await call("POST", "/v1/squads/best", { squad, by: "pace" })).status === 400, "unknown by");
  assert((await call("POST", "/v1/squads/best", { squad, formation: "4-4-1-1" })).status === 400, "unknown formation");
});

Deno.test("suggestions for an open slot rank club cards by overall or by chemistry", async () => {
  const { call } = setup();
  await club(call);
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  const best = (await call("POST", "/v1/squads/best", { squad, by: "chem" })).data.data.results[0].squad;
  const open = { ...best, slots: best.slots.map((s: { slot: string }) => s.slot === "ST" ? { ...s, card: null } : s) };
  const byOvr = await call("POST", "/v1/squads/suggest", { squad: open, slot: "ST", by: "ovr" });
  assert(byOvr.status === 200, `suggest ${JSON.stringify(byOvr.data)}`);
  const so = byOvr.data.data;
  assert(so.position === "ST" && so.suggestions[0].card.name === "Star 9", `ovr first ${JSON.stringify(so.suggestions.map((x: { card: { name: string } }) => x.card.name))}`);
  assert(so.suggestions.every((x: { card: { positions: string[] } }) => x.card.positions.includes("ST")), "only STs");
  const sc = (await call("POST", "/v1/squads/suggest", { squad: open, slot: "ST", by: "chem" })).data.data;
  assert(sc.suggestions[0].card.name === "Unity 9" && sc.suggestions[0].team_chemistry === 33 && sc.suggestions[0].change > 0, `chem first ${JSON.stringify(sc.suggestions[0])}`);
  // Players already in the squad aren't offered for another slot.
  const cm = (await call("POST", "/v1/squads/suggest", { squad: best, slot: "LCM", by: "ovr" })).data.data;
  assert(!cm.suggestions.some((x: { card: { name: string } }) => best.slots.some((s: { slot: string; card: { name: string } | null }) => s.slot !== "LCM" && s.card?.name === x.card.name)), "no duplicates");
  assert((await call("POST", "/v1/squads/suggest", { squad: open, slot: "LWB", by: "ovr" })).status === 400, "unknown slot");
});

Deno.test("roles: a card's + / ++ roles for its slot, club cards borrow the catalogue card's", async () => {
  const { db, call } = setup();
  const cat = crypto.randomUUID(), mine = crypto.randomUUID();
  await db.from("player_cards").insert([
    { id: cat, owner_user_id: null, source_id: "futgg_catalogue", source_card_key: "5001", season: "FC27", player_name: "Role Player", version: "Rare", overall: 85, positions: ["ST"], club: "A", league: "B", nation: "C", is_icon: false, is_hero: false, evidence: "game_data" },
    { id: mine, owner_user_id: ME, source_id: "user_entered", source_card_key: "5001", season: "FC27", player_name: "Role Player", version: "Rare", overall: 85, positions: ["ST", "CAM"], club: "A", league: "B", nation: "C", is_icon: false, is_hero: false, evidence: "game_data" },
  ]);
  await db.from("card_roles").insert([
    { card_id: cat, position_code: "ST", role: "Advanced Forward", level: "plus" },
    { card_id: cat, position_code: "ST", role: "Poacher", level: "plusplus" },
    { card_id: cat, position_code: "CAM", role: "Playmaker", level: "plus" },
  ]);
  const squad = (await call("POST", "/v1/squads/new", { formation: "4-3-3" })).data.data;
  const card = { id: mine, name: "Role Player", club: "A", league: "B", nation: "C", positions: ["ST", "CAM"], rating: 85 };
  const filled = { ...squad, slots: squad.slots.map((s: { slot: string }) => s.slot === "ST" ? { ...s, card } : s) };
  const r = await call("POST", "/v1/squads/roles", { squad: filled });
  assert(r.status === 200, `roles ${JSON.stringify(r.data)}`);
  const st = r.data.data.ST;
  assert(st.position === "ST" && st.roles.length === 2 && st.roles[0].role === "Poacher" && st.roles[0].level === "plusplus", `ST roles ${JSON.stringify(st)}`);
  assert(r.data.data.GK.roles.length === 0, "empty slot has none");
});
