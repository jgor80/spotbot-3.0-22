// SBC Solver routes: the SBCs the helper saw (requirements read from EA's capture), pasted text, and solving from
// the user's club with market cards to buy.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup() {
  const db = futMemoryDb({ ...seededRules(), leagues: [{ id: 1, name: "Premier League", ea_id: 13 }] }) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  const calls: Record<string, unknown>[] = [];
  db.rpc = (fn, args) => {
    calls.push({ fn, ...args });
    if (fn !== "sbc_card_pool") return Promise.resolve({ data: { items: [] }, error: null });
    const market = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`, ea_item_id: 1000 + i, player_name: `Market ${i}`, version: i === 0 ? "Team of the Week" : "Rare", overall: 86, positions: ["CM"],
      club: `Club ${i}`, league: "Premier League", nation: "England", is_icon: false, is_hero: false, price: 5000 + i * 100,
    }));
    return Promise.resolve({ data: { published_at: "2026-11-10T06:00:00Z", market, items: [{ ea_item_id: 501, player_name: "Spare One", version: "Rare", overall: 83, positions: ["ST"], league: "Serie A", nation: "Italy", club: "Inter", price: 800 }] }, error: null });
  };
  db.tables.account_state = [{
    user_id: ME, platform: "console", unassigned: [{ item_id: 1, ea_item_id: 501, item_type: "player", rating: 83, rare_flag: 1, untradeable: true, duplicate: true }],
    sbcs: [{ set_id: 7, name: "84+ Upgrade", category: "Upgrades", description: null, challenges: 1, completed: 0, times_completed: 0, repeat_limit: null, repeatable: true, end_at: null, awards: [{ type: "coins", value: 20000, count: 1, untradeable: false }] }],
    sbc_challenges: [{ set_id: 7, challenge_id: 70, name: "84 Squad", description: null, formation: "f433", status: null, operation: "AND", awards: [], end_at: null,
      requirements: [{ type: "TEAM_RATING", scope: "GREATER", values: [84], count: -1, slot: -1 }, { type: "LEAGUE_ID", scope: "GREATER", values: [13], count: 2, slot: null }] }],
    shape: {},
  }];
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { db, call, calls };
}

Deno.test("GET /sbc reads the helper's challenges into requirements with league names", async () => {
  const { call } = setup();
  const r = await call("GET", "/v1/sbc?platform=console");
  assert(r.status === 200, JSON.stringify(r.data));
  const ch = r.data.data.sets[0].challenges_seen[0];
  assert(ch.formation === "4-3-3", `formation ${ch.formation}`);
  assert(ch.lines.includes("Team rating: Min. 84") && ch.lines.includes("Min. 2 players from: Premier League"), JSON.stringify(ch.lines));
});

Deno.test("POST /sbc/parse turns pasted text into requirements", async () => {
  const { call } = setup();
  const r = await call("POST", "/v1/sbc/parse", { text: "Min. Team Rating: 84\nMin. 1 Players: Team of the Week\nwhat" });
  assert(r.status === 200 && r.data.data.requirements.length === 2 && r.data.data.unread[0] === "what", JSON.stringify(r.data));
  assert((await call("POST", "/v1/sbc/parse", { text: "" })).status === 400, "empty text");
});

Deno.test("POST /sbc/solve uses the spare duplicate, buys the rest, and values the set's reward", async () => {
  const { call, calls } = setup();
  const r = await call("POST", "/v1/sbc/solve", { platform: "console", set_id: 7, challenges: [{ name: "84 Squad", formation: "4-3-3", text: "Min. Team Rating: 84\nMin. 1 Players: Team of the Week" }] });
  assert(r.status === 200, JSON.stringify(r.data));
  const d = r.data.data;
  assert(d.feasible, JSON.stringify(d.challenges[0].checks));
  const ids = d.challenges[0].slots.map((s: { card: { source: string; name: string } }) => s.card.name);
  assert(ids.includes("Spare One") && ids.includes("Market 0"), `uses the spare and the TOTW: ${ids}`);
  assert(d.buy_cost > 0 && d.reward.value === 20000 && ["skip", "close", "do_it"].includes(d.worth.verdict), JSON.stringify({ cost: d.buy_cost, reward: d.reward, worth: d.worth }));
  assert(calls.some((c) => c.fn === "sbc_card_pool" && JSON.stringify(c.p_ids) === "[501]"), "asks for the spare's details");
  const bad = await call("POST", "/v1/sbc/solve", { challenges: [{ formation: "9-9-9", text: "Min. Team Rating: 84" }] });
  assert(bad.status === 400, "unknown formation");
  const none = await call("POST", "/v1/sbc/solve", { challenges: [{ text: "nothing useful" }] });
  assert(none.status === 400, "no requirements");
});
