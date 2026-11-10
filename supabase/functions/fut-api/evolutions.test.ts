// Evolutions routes: the helper's evolutions matched to club cards, and a pasted evolution.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup() {
  const db = futMemoryDb(seededRules());
  db.tables.account_state = [{ user_id: ME, platform: "console", evolutions_at: "2026-11-10T04:00:00Z", shape: { evolution: ["academyId", "name"] }, evolutions: [
    { evo_id: 31, name: "Maestro", description: null, end_at: null, coins: 15000, points: null, status: null,
      requirements: [{ type: "OVR", values: [82], scope: "LOWER" }, { type: "POSITION", values: ["CM"], scope: null }],
      levels: [{ upgrades: [{ type: "OVR", values: [3], scope: null }] }] },
    { evo_id: 32, name: "Ended", description: null, end_at: "2020-01-01T00:00:00Z", coins: null, points: null, status: null, requirements: [], levels: [{ upgrades: [{ type: "OVR", values: [1], scope: null }] }] },
  ] }];
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { call };
}

Deno.test("GET /evolutions matches live evolutions to club cards; POST /evolutions/check reads pasted text", async () => {
  const { call } = setup();
  await call("POST", "/v1/cards", { player_name: "Mid One", overall: 81, positions: ["CM"], evidence: "game_data", owned: true });
  await call("POST", "/v1/cards", { player_name: "Too Good", overall: 86, positions: ["CM"], evidence: "game_data", owned: true });
  const r = await call("GET", "/v1/evolutions?platform=console");
  assert(r.status === 200, JSON.stringify(r.data));
  const d = r.data.data;
  assert(d.evolutions.length === 1 && d.evolutions[0].name === "Maestro", "ended evolution dropped");
  assert(d.evolutions[0].matches.length === 1 && d.evolutions[0].matches[0].card.name === "Mid One" && d.evolutions[0].matches[0].after.overall === 84, JSON.stringify(d.evolutions[0].matches));
  assert(d.evolutions[0].rule_lines.includes("Overall: Max. 82"), JSON.stringify(d.evolutions[0].rule_lines));
  const p = await call("POST", "/v1/evolutions/check", { name: "Pasted", requirements: "Overall: Max 90", upgrades: "+1 OVR" });
  assert(p.status === 200 && p.data.data.evolution.matches.length === 2, JSON.stringify(p.data));
  assert((await call("POST", "/v1/evolutions/check", { requirements: "", upgrades: "" })).status === 400, "empty");
});
