// Objectives planner: reading player requirements from objective wording, and one XI that covers several at once.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";
import { parseRequirement } from "../_shared/fut/objectives.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}
const META = { leagues: ["Premier League", "LALIGA EA SPORTS"], nations: ["Brazil", "England"], clubs: ["Unity FC"], versions: ["Rare", "TOTW"] };

Deno.test("parseRequirement: counts, leagues, demonyms, starting XI, and lines it can't read", () => {
  const a = parseRequirement("Win 2 matches with at least 3 players from the Premier League in your starting XI in Squad Battles", META).req!;
  assert(a.count === 3 && a.kind === "league" && a.value === "Premier League" && a.starting, JSON.stringify(a));
  const b = parseRequirement("Score a goal using a Brazilian player", META).req!;
  assert(b.count === 1 && b.kind === "nation" && b.value === "Brazil", JSON.stringify(b));
  const c = parseRequirement("Play a match with two Icons", META).req!;
  assert(c.count === 2 && c.kind === "icon", JSON.stringify(c));
  const d = parseRequirement("Win 3 Rivals matches", META);
  assert(d.req === null && d.reason === null, JSON.stringify(d));
  const e = parseRequirement("Play with 2 Bundesliga players", META);
  assert(e.req === null && /Bundesliga/.test(e.reason ?? ""), JSON.stringify(e));
});

Deno.test("POST /objectives/plan: one XI covering several objectives, short ones explained", async () => {
  const db = futMemoryDb(seededRules());
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const XI: string[][] = [["GK"], ["LB"], ["CB"], ["CB"], ["RB"], ["CM"], ["CM"], ["CM"], ["LW"], ["ST"], ["RW"]];
  for (const [i, positions] of XI.entries()) await call("POST", "/v1/cards", { player_name: `Star ${i}`, overall: 88, positions, club: `Club ${i}`, league: "LALIGA EA SPORTS", nation: "Spain", evidence: "game_data", owned: true });
  // Bench: two Premier League English players (CB, ST) and one Brazilian winger, all rated lower.
  await call("POST", "/v1/cards", { player_name: "Bench CB", overall: 80, positions: ["CB"], club: "Unity FC", league: "Premier League", nation: "England", evidence: "game_data", owned: true });
  await call("POST", "/v1/cards", { player_name: "Bench ST", overall: 79, positions: ["ST"], club: "Unity FC", league: "Premier League", nation: "England", evidence: "game_data", owned: true });
  await call("POST", "/v1/cards", { player_name: "Samba", overall: 78, positions: ["LW"], club: "Other", league: "Serie A", nation: "Brazil", evidence: "game_data", owned: true });
  const empty = await call("POST", "/v1/objectives/plan", {});
  assert(empty.status === 200 && empty.data.data.objectives.length === 0 && /No objectives from the helper/.test(empty.data.data.headline), JSON.stringify(empty.data));
  db.tables.account_state = [{ user_id: ME, platform: "console", objectives_at: "2026-11-10T05:00:00Z", objectives: [
    { name: "Win a match with 2 Premier League players in your starting XI in Squad Battles", done: false, end_at: "2026-11-12T18:00:00Z", xp: 500 },
    { name: "Score a goal using a Brazilian player in Squad Battles", done: false, end_at: "2026-11-13T18:00:00Z", xp: 300 },
    { name: "Play with 3 English players", done: false, end_at: "2026-11-14T18:00:00Z", xp: 200 },
    { name: "Win 3 Rivals matches", done: false, end_at: null, xp: 100 },
    { name: "Already done with 1 Icon", done: true },
  ] }];
  const r = await call("POST", "/v1/objectives/plan", { formation: "4-3-3" });
  assert(r.status === 200, JSON.stringify(r.data));
  const d = r.data.data;
  const by = Object.fromEntries(d.objectives.map((o: { name: string; status: string }) => [o.name.split(" ").slice(0, 3).join(" "), o]));
  assert(by["Win a match"].status === "covered" && by["Score a goal"].status === "covered" && by["Score a goal"].mode === "Squad Battles", JSON.stringify(d.objectives));
  assert(by["Play with 3"].status === "short" && /2 England cards; it needs 3/.test(by["Play with 3"].note), by["Play with 3"].note);
  assert(by["Win 3 Rivals"].status === "no_requirement" && d.covered === 2 && d.done === 1, JSON.stringify(d).slice(0, 400));
  const names = d.squad.slots.map((s: { card: { name: string } | null }) => s.card?.name);
  assert(names.includes("Bench CB") && names.includes("Bench ST") && names.includes("Samba"), names.join());
  const pasted = await call("POST", "/v1/objectives/plan", { text: "1. Play a match with 2 Premier League players\n- nothing" });
  assert(pasted.data.data.source === "text" && pasted.data.data.covered === 1, JSON.stringify(pasted.data).slice(0, 300));
  assert((await call("POST", "/v1/objectives/plan", { formation: "9-9-9" })).status === 400, "bad formation");
});
