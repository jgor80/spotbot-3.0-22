// Squad Builder's "my current squad" (from the squad the helper captured in the club file) and the squad advisor:
// picks for every place by skill or chemistry, market targets, the same players in other shapes, the club's best
// eleven per shape. Ids and names are made up (no real FC 27 card data).
import { handle, type Deps } from "./handler.ts";
import { currentSquad, FORMATION_CODES, formationFor, parseGameSquads, squadAdvice, type TargetPicker } from "../_shared/fut/current-squad.ts";
import { activeRules, searchMyCards, toWorkspaceCard } from "../_shared/fut/service.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";
import { FORMATIONS, type Squad } from "../_shared/fut/xilab/workspace/index.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function assert(ok: unknown, msg = "Assertion failed"): asserts ok { if (!ok) throw new Error(msg); }

function setup() {
  const db = futMemoryDb({ ...seededRules() });
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => (k === "FUT_ENABLED" ? "true" : undefined) };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, user = ME): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, {
      method, headers: { "content-type": "application/json", "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body),
    }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { db, call };
}

// A 4-3-3 (holding) eleven, three on the bench, all one club so chemistry links. EA ids 101-114.
const ELEVEN: [number, string, string[], number][] = [
  [101, "Keeper", ["GK"], 84], [102, "Right Back", ["RB"], 83], [103, "Centre Back A", ["CB"], 86], [104, "Centre Back B", ["CB"], 85], [105, "Left Back", ["LB"], 82],
  [106, "Holder", ["CDM"], 85], [107, "Mid A", ["CM"], 84], [108, "Mid B", ["CM", "CAM"], 86], [109, "Right Wing", ["RW", "RM"], 87], [110, "Striker", ["ST"], 88], [111, "Left Wing", ["LW", "LM"], 85],
];
const BENCH: [number, string, string[], number][] = [[112, "Super Sub", ["ST"], 91], [113, "Spare Mid", ["CM", "CDM"], 80], [114, "Spare Keeper", ["GK"], 78]];
const item = ([ea, , positions, rating]: [number, string, string[], number]) => ({
  item_id: ea * 10, ea_item_id: ea, asset_id: ea + 1000, kind: "player", rating, position: positions[0], positions,
  team_id: 1, league_id: 2, nation_id: 3, rare_flag: 1, untradeable: false, loan: false, stats: positions[0] === "GK" ? null : [80, 81, 70, 75, 40, 70], skill_moves: 3, weak_foot: 4, seen_in: "club",
});
const gameSquad = (formation: string | null, eas: number[], extra: Record<string, unknown> = {}) => ({
  key: "active", ea_id: 0, name: "Rivals XI", formation, active: true, seen_at: "2026-11-14T05:00:00.000Z", fields: ["formation", "players", "bad field!"],
  players: eas.map((ea, index) => ({ index, item_id: ea * 10, ea_item_id: ea })), ...extra,
});
const file = (squads?: unknown[]) => ({
  format: "xilab-club-capture", version: 1, verified: false, captured_at: "2026-11-14T05:00:00Z", items: [...ELEVEN, ...BENCH].map(item),
  names: { players: Object.fromEntries([...ELEVEN, ...BENCH].map(([ea, name]) => [String(ea + 1000), name])), teams: { "1": "Test Town" }, leagues: { "2": "Test League" }, nations: { "3": "Testland" } },
  ...(squads ? { squads } : {}),
});
// deno-lint-ignore no-explicit-any
const names = (squad: any) => Object.fromEntries(squad.slots.map((s: any) => [s.slot, s.card?.name ?? null]));

Deno.test("current squad: what the helper sends is checked, and every formation code names a real formation", () => {
  assert(Object.values(FORMATION_CODES).every((f) => FORMATIONS[f]) && new Set(Object.values(FORMATION_CODES)).size === Object.keys(FORMATIONS).length, "one code per FC 27 formation");
  const parsed = parseGameSquads({ squads: [
    gameSquad("f433a", [101, 102]), { ...gameSquad("F433", [103]), seen_at: "2026-11-13T00:00:00Z" }, // an older copy of the same squad loses
    { ...gameSquad("f4-4-2", [104]), key: "3" }, { ...gameSquad("f442", [105]), key: "../etc" }, { ...gameSquad("f442", [106]), seen_at: "yesterday" },
    { key: "4", seen_at: "2026-11-14T00:00:00Z", players: [{ index: 23, ea_item_id: 1 }, { index: 0, ea_item_id: -4 }, { index: 1.5, ea_item_id: 9 }] }, null, "squad",
  ] });
  assert(parsed.length === 2 && parsed[0]!.squad_key === "active" && parsed[0]!.formation_code === "f433a" && parsed[0]!.players.length === 2 && parsed[0]!.active, JSON.stringify(parsed));
  assert(JSON.stringify(parsed[0]!.fields) === '["formation","players"]' && parsed[1]!.squad_key === "3" && parsed[1]!.formation_code === null && !parsed[1]!.active, JSON.stringify(parsed[1]));
  assert(parseGameSquads({}).length === 0 && parseGameSquads(null).length === 0 && parseGameSquads({ squads: "x" }).length === 0);
});

Deno.test("current squad: from the Web App capture, then the newest saved squad, then the club's best eleven", async () => {
  const { db, call } = setup();
  const none = (await call("GET", "/v1/squads/current")).data.data;
  assert(none.source === "none" && none.squad === null && none.note.includes("no club cards"), JSON.stringify(none));

  // Club synced by an older helper (no squads in the file): the strongest eleven the club can field, and it says so
  const first = (await call("POST", "/v1/club/import", file())).data.data;
  assert(first.added === 14 && first.squads_saved === 0, JSON.stringify(first));
  const guess = (await call("GET", "/v1/squads/current")).data.data;
  assert(guess.source === "club" && guess.squad.slots.every((s: { card: unknown }) => s.card) && Object.values(names(guess.squad)).includes("Super Sub") && guess.note.includes("0.13.0") && !guess.formation_sure, JSON.stringify([guess.source, guess.note]));

  // A saved squad is closer to the truth than a guess
  const blank = (await call("POST", "/v1/squads/new", { formation: "4-4-2", name: "Saved XI" })).data.data;
  const best = (await call("POST", "/v1/squads/best", { squad: blank, by: "ovr" })).data.data.results[0];
  const saved = await call("POST", "/v1/squads", { ...blank, slots: best.squad.slots });
  assert(saved.status === 200, JSON.stringify(saved.data));
  const fromSaved = (await call("GET", "/v1/squads/current")).data.data;
  assert(fromSaved.source === "saved" && fromSaved.squad.name === "Saved XI" && fromSaved.squad.formation === "4-4-2" && fromSaved.note.includes('"Saved XI"'), JSON.stringify([fromSaved.source, fromSaved.note]));

  // The real thing: the helper's capture. EA's place order isn't trusted: players go where they play.
  const eas = [...ELEVEN.map((p) => p[0]), ...BENCH.map((p) => p[0])];
  const synced = (await call("POST", "/v1/club/import", file([gameSquad("f433a", eas), { ...gameSquad("f442", [110, 112]), key: "2", name: "Old", seen_at: "2026-11-14T06:00:00Z" }]))).data.data;
  assert(synced.squads_saved === 2 && synced.updated === 14, JSON.stringify(synced));
  const cur = (await call("GET", "/v1/squads/current")).data.data;
  assert(cur.source === "game" && cur.squad.formation === "4-3-3 (2)" && cur.formation_sure && cur.formation_code === "f433a" && cur.squad.name === "Rivals XI" && cur.missing === 0, JSON.stringify([cur.source, cur.squad?.formation, cur.note]));
  const xi = names(cur.squad);
  assert(xi.GK === "Keeper" && xi.CDM === "Holder" && xi.ST === "Striker" && xi.LW === "Left Wing" && xi.RW === "Right Wing" && xi.LB === "Left Back" && !Object.values(xi).includes("Super Sub"), `the active squad wins over a newer one, starters only: ${JSON.stringify(xi)}`);
  assert(JSON.stringify(cur.bench.map((b: { name: string }) => b.name)) === '["Super Sub","Spare Mid","Spare Keeper"]' && cur.seen_at === "2026-11-14T05:00:00.000Z" && cur.note.startsWith("Your active squad from the EA Web App."), JSON.stringify([cur.bench, cur.note]));
  assert((await call("GET", "/v1/squads/current", undefined, OTHER)).data.data.source === "none", "another user sees none of it");

  // Wrong or missing formation codes: the shape is worked out from the players, and the note says to check it
  const rules = await activeRules(db as never), cards = (await searchMyCards(db as never, ME, { all: true, owned_only: true })).map(toWorkspaceCard);
  const eleven = cards.filter((c) => ELEVEN.some((p) => p[1] === c.name));
  assert(formationFor("f433a", eleven, rules).formation === "4-3-3 (2)" && formationFor("f433a", eleven, rules).sure);
  const flat = formationFor("f433", eleven, rules); // EA said flat 4-3-3, but the holder only plays CDM
  assert(flat.formation === "4-3-3 (2)" && flat.best.filled === 11 && !flat.sure, `${flat.formation} ${flat.best.filled}`);
  const unknown = formationFor("f9z", eleven, rules), missing = formationFor(null, eleven, rules);
  assert(unknown.best.filled === 11 && !unknown.sure && missing.best.filled === 11 && !missing.sure && missing.formation === "4-3-3 (2)", `${unknown.formation} ${missing.formation}`);
  await call("POST", "/v1/club/import", file([gameSquad(null, eas, { seen_at: "2026-11-14T07:00:00Z" })]));
  const worked = (await call("GET", "/v1/squads/current")).data.data;
  assert(worked.squad.formation === "4-3-3 (2)" && !worked.formation_sure && worked.note.includes("worked out from where your players play"), worked.note);
  // A starter that isn't in the synced club is counted, not invented
  await call("POST", "/v1/club/import", file([gameSquad("f433a", [999, ...eas.slice(1)], { seen_at: "2026-11-14T08:00:00Z" })]));
  const short = (await call("GET", "/v1/squads/current")).data.data;
  assert(short.missing === 1 && short.squad.slots.filter((s: { card: unknown }) => s.card).length === 10 && names(short.squad).GK === null && short.note.includes("1 starter isn't in your synced club"), short.note);
  const direct = await currentSquad(db as never, ME);
  assert(direct.source === "game" && direct.squad!.owner_id === ME);
});

Deno.test("squad advisor: picks by skill or chem, targets to aim for, other shapes for the same players and for the club", async () => {
  const { db, call } = setup();
  const eas = [...ELEVEN.map((p) => p[0]), ...BENCH.map((p) => p[0])];
  // A second, higher-rated striker from another club: better on skill, worse for chemistry
  const outsider = { ...item([120, "Outsider", ["ST"], 93]), team_id: 9, league_id: 8, nation_id: 7 };
  const f = file([gameSquad("f433a", eas)]);
  await call("POST", "/v1/club/import", { ...f, items: [...f.items, outsider], names: { ...f.names, players: { ...f.names.players, "1120": "Outsider" }, teams: { "1": "Test Town", "9": "Far City" }, leagues: { "2": "Test League", "8": "Far League" }, nations: { "3": "Testland", "7": "Farland" } } });
  const squad = (await call("GET", "/v1/squads/current")).data.data.squad as Squad;
  const rules = await activeRules(db as never), pool = (await searchMyCards(db as never, ME, { all: true, owned_only: true })).map(toWorkspaceCard);
  await (db as never as { from: (t: string) => { upsert: (r: unknown, o: unknown) => Promise<unknown> } }).from("account_state").upsert({ user_id: ME, platform: "console", balance: { coins: 50_000 } }, { onConflict: "user_id,platform" });
  const asked: [string, number | null][] = [];
  const targets: TargetPicker = (position, maxPrice) => {
    asked.push([position, maxPrice]);
    const all = [
      { card_id: "m1", ea_item_id: 9001, name: "Dream Striker", rating: 95, version: "TOTY", price: 4_000_000, owned: false, score: 97, role: "Advanced Forward", why: "99 pace" },
      { card_id: "m0", ea_item_id: 110, name: "Striker", rating: 88, version: "Rare", price: 20_000, owned: false, score: 90, role: "Poacher", why: "in your squad" },
      { card_id: "m2", ea_item_id: 9002, name: "Budget Striker", rating: 86, version: "Rare", price: 30_000, owned: false, score: 89, role: "Poacher", why: "90 finishing" },
      { card_id: "m3", ea_item_id: 9003, name: "Owned Striker", rating: 85, version: "Rare", price: 10_000, owned: true, score: 88, role: "Poacher", why: "" },
    ];
    if (position === "CB") return Promise.resolve([{ card_id: "cb1", ea_item_id: 9010, name: "Cheap Rock", rating: 84, version: "Rare", price: 9_000, owned: false, score: 85, role: "Stopper", why: "88 defending" }]);
    if (position === "GK") return Promise.reject(new Error("meta down"));
    return Promise.resolve(position === "ST" ? all.filter((c) => maxPrice === null || c.price <= maxPrice) : []);
  };

  const skill = await squadAdvice(db as never, ME, squad, pool, rules, { by: "ovr", platform: "console" }, targets);
  assert(skill.by === "ovr" && skill.owned_cards === 15 && skill.coins === 50_000 && skill.now.formation === "4-3-3 (2)" && skill.now.filled === 11 && skill.now.chemistry === 33 && skill.slots.length === 11, JSON.stringify(skill.now));
  const st = skill.slots.find((s) => s.slot === "ST")!;
  assert(st.current?.name === "Striker" && st.current.chemistry === 3 && st.current.in_position && JSON.stringify(st.picks.map((p) => p.name)) === '["Outsider","Super Sub"]', JSON.stringify(st));
  assert(st.picks[0]!.better && st.picks[0]!.rating_change === 5 && st.picks[0]!.change < 0 && st.picks[1]!.better && st.picks[1]!.change === 0, "by skill the highest rated comes first, even at a chemistry cost");
  assert(st.target?.name === "Budget Striker" && st.target.affordable === true && st.dream?.name === "Dream Striker" && st.dream.affordable === false, `affordable target and the dream one, never a player you have: ${JSON.stringify([st.target, st.dream])}`);
  const cbs = skill.slots.filter((s) => s.position === "CB");
  assert(cbs[0]!.target?.name === "Cheap Rock" && cbs[0]!.dream === null && cbs[1]!.target === null, "one target per position, not repeated on the second centre back");
  assert(skill.slots.find((s) => s.slot === "GK")!.target === null && skill.slots.find((s) => s.slot === "GK")!.picks[0]!.name === "Spare Keeper" && !skill.slots.find((s) => s.slot === "GK")!.picks[0]!.better, "a failed target lookup only loses that target");
  assert(asked.some(([p, m]) => p === "ST" && m === 50_000) && asked.some(([p, m]) => p === "ST" && m === null) && asked.filter(([p]) => p === "CB").length === 2, JSON.stringify(asked));

  const chem = await squadAdvice(db as never, ME, squad, pool, rules, { by: "chem", platform: "console" }, targets);
  const stChem = chem.slots.find((s) => s.slot === "ST")!;
  assert(JSON.stringify(stChem.picks.map((p) => p.name)) === '["Super Sub","Outsider"]' && stChem.picks[0]!.better && !stChem.picks[1]!.better, `by chem the linked player comes first: ${JSON.stringify(stChem.picks)}`);

  // The same eleven in other shapes: every one holds all eleven; the club list may bring in other players
  assert(skill.rearrange.length >= 1 && skill.rearrange.every((r) => r.filled === 11 && r.changes === 0) && skill.rearrange[0]!.current && skill.rearrange[0]!.chemistry === 33, JSON.stringify(skill.rearrange.map((r) => [r.formation, r.chemistry, r.changes])));
  assert(skill.club.length === 5 && skill.club[0]!.rating >= skill.now.rating && skill.club[0]!.changes >= 1 && Object.values(names(skill.club[0]!.squad)).includes("Outsider"), JSON.stringify(skill.club.map((r) => [r.formation, r.rating, r.changes])));
  assert(chem.club[0]!.chemistry === 33 && !Object.values(names(chem.club[0]!.squad)).includes("Outsider"), "by chem the club's best eleven keeps the links");
  // An empty place: everything that plays there is a pick and counts as better
  const gap = { ...squad, slots: squad.slots.map((s) => (s.slot === "ST" ? { ...s, card: null } : s)) };
  const open = await squadAdvice(db as never, ME, gap, pool, rules, { by: "ovr", platform: "console" }, targets);
  const openSt = open.slots.find((s) => s.slot === "ST")!;
  assert(openSt.current === null && openSt.picks.length === 3 && openSt.picks.every((p) => p.better && p.rating_change === null) && open.now.filled === 10 && open.rearrange.every((r) => r.filled === 10), JSON.stringify(openSt));

  // The route: same answer shape, input checked, targets fail soft without the market tables
  const r = await call("POST", "/v1/squads/advisor", { squad, by: "chem" });
  assert(r.status === 200 && r.data.data.by === "chem" && r.data.data.slots.length === 11 && r.data.data.slots.every((s: { target: unknown }) => s.target === null) && r.data.data.club.length === 5, JSON.stringify(r.data).slice(0, 400));
  assert((await call("POST", "/v1/squads/advisor", { squad, by: "vibes" })).status === 400 && (await call("POST", "/v1/squads/advisor", { by: "ovr" })).status === 400);
});
