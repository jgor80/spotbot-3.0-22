// Champs tracker routes: create a run, log games, read the summary, finish, delete; nobody else's runs.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222", OTHER = "33333333-3333-4333-8333-333333333333";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

Deno.test("champs routes: runs, games, summary, limits and ownership", async () => {
  const db = futMemoryDb({});
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, user = ME): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const run = await call("POST", "/v1/champs/runs", { mode: "champs", name: "Weekend 1", games_allowed: 3, target_wins: 2, platform: "console" });
  assert(run.status === 201 && run.data.data.id, JSON.stringify(run.data));
  const id = run.data.data.id;
  assert((await call("POST", `/v1/champs/runs/${id}/games`, { goals_for: 2, goals_against: 1, opponent_formation: "4-2-3-1" })).status === 201, "game 1");
  assert((await call("POST", `/v1/champs/runs/${id}/games`, { goals_for: 1, goals_against: 1, penalties: "won" })).status === 201, "game 2");
  assert((await call("POST", `/v1/champs/runs/${id}/games`, { goals_for: 1, goals_against: 2, penalties: "won" })).status === 400, "penalties need a draw");
  assert((await call("POST", `/v1/champs/runs/${id}/games`, { goals_for: 1, goals_against: 0, opponent_formation: "9-9-9" })).status === 400, "unknown formation");
  const third = await call("POST", `/v1/champs/runs/${id}/games`, { goals_for: 0, goals_against: 3 });
  assert(third.status === 201, "game 3");
  assert((await call("POST", `/v1/champs/runs/${id}/games`, { goals_for: 1, goals_against: 0 })).status === 400, "run is full");
  assert((await call("POST", `/v1/champs/runs/${id}/games`, { goals_for: 1, goals_against: 0 }, OTHER)).status === 404, "not your run");
  const o = await call("GET", "/v1/champs?platform=console");
  const r = o.data.data.runs[0];
  assert(o.status === 200 && r.summary.w === 2 && r.summary.l === 1 && r.summary.target.status === "reached" && /2W 0D 1L from 3 of 3/.test(r.recap), JSON.stringify(r.summary));
  assert(o.data.data.by_mode[0].mode === "champs" && o.data.data.by_mode[0].games === 3, JSON.stringify(o.data.data.by_mode));
  assert((await call("GET", "/v1/champs?platform=console", undefined, OTHER)).data.data.runs.length === 0, "others see nothing");
  assert((await call("DELETE", `/v1/champs/games/${third.data.data.id}`)).status === 200, "delete a game");
  const fin = await call("POST", `/v1/champs/runs/${id}`, { finished: true, target_wins: 3 });
  assert(fin.data.data.finished_at && fin.data.data.target_wins === 3, JSON.stringify(fin.data));
  assert((await call("DELETE", `/v1/champs/runs/${id}`, undefined, OTHER)).status === 404, "can't delete others' runs");
  assert((await call("DELETE", `/v1/champs/runs/${id}`)).status === 200 && (await call("GET", "/v1/champs?platform=console")).data.data.runs.length === 0, "deleted");
});
