// Club sync: the XI Lab helper's club file becomes the caller's own cards, keyed by EA item id; a re-sync updates
// them in place. Ids and names below are made up (no real FC 27 card data).
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

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

const item = (ea: number, extra: Record<string, unknown> = {}) => ({
  item_id: ea * 10, ea_item_id: ea, asset_id: ea + 1000, kind: "player", rating: 80, position: "ST", positions: ["ST", "CF"],
  team_id: 1, league_id: 2, nation_id: 3, rare_flag: 1, untradeable: false, loan: false, stats: [80, 81, 70, 75, 40, 70],
  skill_moves: 3, weak_foot: 4, seen_in: "club", ...extra,
});
const file = (items: unknown[], names: Record<string, unknown> = {}) => ({
  format: "xilab-club-capture", version: 1, verified: false, captured_at: "2026-11-02T08:00:00Z", items,
  names: { players: { "1101": "Test Striker" }, teams: { "1": "Test Town" }, leagues: { "2": "Test League" }, nations: { "3": "Testland" }, ...names },
});

Deno.test("club import: cards, names, placeholders, skips and managers", async () => {
  const { call } = setup();
  const r = await call("POST", "/v1/club/import", file([
    item(101),
    item(102, { team_id: 99, untradeable: true, stats: null }),
    item(103, { loan: true }),
    item(104, { positions: [], position: null }),
    item(101, { untradeable: true }),
    { kind: "manager", ea_item_id: 500, nation_id: 3, league_id: 2 },
  ]));
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.data)}`);
  const d = r.data.data;
  assert(d.added === 2 && d.updated === 0 && d.managers_added === 1 && d.verified === false, JSON.stringify(d));
  assert(d.skipped.some((s: { reason: string }) => s.reason === "loan item"), "loan skipped");
  assert(d.skipped.some((s: { reason: string }) => s.reason === "no position"), "no position skipped");

  const cards = (await call("GET", "/v1/cards?limit=100")).data.data;
  const a = cards.find((c: { ea_item_id: number }) => c.ea_item_id === 101);
  assert(a && a.player_name === "Test Striker" && a.club === "Test Town" && a.league === "Test League" && a.nation === "Testland", JSON.stringify(a));
  assert(a.evidence === "game_data" && a.owned === true && a.tradeable === false && a.stats.pac === 80 && a.weak_foot === 4 && a.skill_moves === 4, "fields (EA skill moves count from 0)");
  const b = cards.find((c: { ea_item_id: number }) => c.ea_item_id === 102);
  assert(b.player_name === "EA player 1102" && b.club === "EA club 99" && b.tradeable === false, JSON.stringify(b));
  const ms = (await call("GET", "/v1/managers")).data.data;
  assert(ms.length === 1 && ms[0].nation === "Testland" && ms[0].league === "Test League", JSON.stringify(ms));
});

Deno.test("club import: a re-sync updates in place and keeps the user's edits", async () => {
  const { call } = setup();
  await call("POST", "/v1/club/import", file([item(101)]));
  const first = (await call("GET", "/v1/cards")).data.data[0];
  // The user marks it a Hero by hand.
  await call("PUT", `/v1/cards/${first.id}`, { ...first, is_hero: true, playstyles: ["Finesse Shot"] });
  const r = (await call("POST", "/v1/club/import", file([item(101, { rating: 84 }), item(105)]))).data.data;
  assert(r.added === 1 && r.updated === 1, JSON.stringify(r));
  const again = (await call("GET", "/v1/cards")).data.data.find((c: { id: string }) => c.id === first.id);
  assert(again.overall === 84 && again.is_hero === true && again.playstyles.includes("Finesse Shot"), JSON.stringify(again));
});

Deno.test("club import: per user, and rejects other files", async () => {
  const { call } = setup();
  await call("POST", "/v1/club/import", file([item(101)]));
  const other = (await call("POST", "/v1/club/import", file([item(101)]), OTHER)).data.data;
  assert(other.added === 1, "the same card version can be in two clubs");
  assert((await call("GET", "/v1/cards", undefined, OTHER)).data.data.length === 1, "other sees only theirs");
  const bad = await call("POST", "/v1/club/import", { format: "something-else" });
  assert(bad.status === 400 && /club file/.test(bad.data.error), JSON.stringify(bad.data));
});

Deno.test("club import: goalkeepers keep no outfield stats", async () => {
  const { call } = setup();
  await call("POST", "/v1/club/import", file([item(301, { position: "GK", positions: ["GK"] })]));
  const c = (await call("GET", "/v1/cards")).data.data[0];
  assert(c.positions[0] === "GK" && Object.keys(c.stats).length === 0, JSON.stringify(c));
});

Deno.test("club import: Icons league marks Icons", async () => {
  const { call } = setup();
  await call("POST", "/v1/club/import", file([item(201, { league_id: 7 })], { leagues: { "7": "Icons" } }));
  const c = (await call("GET", "/v1/cards")).data.data[0];
  assert(c.is_icon === true, JSON.stringify(c));
});

Deno.test("club import: names the file lacks come from the reference tables", async () => {
  const { call, db } = setup();
  db.tables.clubs = [{ id: 1, ea_id: 99, name: "Reference Rovers" }];
  db.tables.leagues = [{ id: 1, ea_id: 7, name: "Reference League" }];
  await call("POST", "/v1/club/import", file([item(401, { team_id: 99, league_id: 7 }), item(402, { team_id: 98 })]));
  const cards = (await call("GET", "/v1/cards")).data.data;
  const a = cards.find((c: { ea_item_id: number }) => c.ea_item_id === 401);
  const b = cards.find((c: { ea_item_id: number }) => c.ea_item_id === 402);
  assert(a.club === "Reference Rovers" && a.league === "Reference League", JSON.stringify(a));
  assert(b.club === "EA club 98" && b.league === "Test League", JSON.stringify(b));
});

Deno.test("club import: a league without an EA id is named through its club", async () => {
  const { call, db } = setup();
  db.tables.leagues = [{ id: 5, ea_id: null, name: "Club-Linked League" }];
  db.tables.clubs = [{ id: 1, ea_id: 77, name: "Linked FC", league_id: 5 }];
  await call("POST", "/v1/club/import", file([item(501, { team_id: 77, league_id: 13 })], { leagues: {} }));
  const c = (await call("GET", "/v1/cards")).data.data[0];
  assert(c.club === "Linked FC" && c.league === "Club-Linked League", JSON.stringify(c));
});
