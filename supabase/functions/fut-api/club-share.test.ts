// Club FUT layer: opt-in settings, the big-pulls job (once each, recent only, best first), the club board and
// "who has this card" for the members the bot passes (only those sharing).
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222", MATE = "33333333-3333-4333-8333-333333333333";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup() {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  db.rpc = (fn, args) => {
    if (fn === "account_item_prices") return Promise.resolve({ data: { items: (args.p_ids as number[]).map((id) => ({ ea_item_id: id, player_name: `Player ${id}`, price: id * 1000 })) }, error: null });
    if (fn === "club_trade_value") return Promise.resolve({ data: { totals: { cards: 40, value_after_tax: args.p_user === ME ? 1_250_000 : 300_000 } }, error: null });
    return Promise.resolve({ data: null, error: { message: "not mocked" } });
  };
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), isBot: (req) => Promise.resolve(req.headers.get("x-bot") === "1"), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, user: string | null = ME): Promise<{ status: number; data: any }> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (user) headers["x-test-user"] = user; else headers["x-bot"] = "1";
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const job = (body: Record<string, unknown>) => call("POST", "", body, null);
  return { db, call, job };
}

Deno.test("club sharing: off by default, settings validated", async () => {
  const { call } = setup();
  const d = (await call("GET", "/v1/club-share")).data.data;
  assert(!d.share_pulls && !d.share_board && d.min_pull_rating === 86, JSON.stringify(d));
  assert((await call("PUT", "/v1/club-share", { min_pull_rating: 70 })).status === 400, "rating too low");
  assert((await call("PUT", "/v1/club-share", { share_pulls: "yes" })).status === 400, "boolean only");
  const on = (await call("PUT", "/v1/club-share", { share_pulls: true, min_pull_rating: 88 })).data.data;
  assert(on.share_pulls && !on.share_board && on.min_pull_rating === 88, JSON.stringify(on));
});

Deno.test("club-pulls job: recent big pulls once each, best first; old ones skipped", async () => {
  const { db, call, job } = setup();
  assert((await call("POST", "", { job: "club-pulls" })).status === 401, "only the bot");
  await call("PUT", "/v1/club-share", { share_pulls: true, min_pull_rating: 86 });
  const now = Date.now(), ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  db.tables.pack_pulls = [
    { user_id: ME, platform: "console", item_id: 1, ea_item_id: 101, rating: 91, untradeable: false, opened_at: ago(1) },
    { user_id: ME, platform: "console", item_id: 2, ea_item_id: 102, rating: 87, untradeable: true, opened_at: ago(2) },
    { user_id: ME, platform: "console", item_id: 3, ea_item_id: 103, rating: 84, untradeable: false, opened_at: ago(1) },
    { user_id: ME, platform: "console", item_id: 4, ea_item_id: 104, rating: 90, untradeable: false, opened_at: ago(30) },
    { user_id: MATE, platform: "console", item_id: 9, ea_item_id: 109, rating: 95, untradeable: false, opened_at: ago(1) },
  ];
  const first = (await job({ job: "club-pulls" })).data.data;
  const got = first.deliveries.map((d: { item_id: number }) => d.item_id);
  assert(JSON.stringify(got) === "[1,2]", JSON.stringify(first));
  assert(first.deliveries[0].text.includes("Player 101") && first.deliveries[0].text.includes("91") && first.deliveries[1].text.includes("untradeable"), first.deliveries[0].text);
  assert(first.skipped === 1, "the 30-hour-old 90 is skipped");
  assert((await job({ job: "club-pulls" })).data.data.deliveries.length === 0, "nothing twice");
});

Deno.test("club-board and club-whohas only include members who share", async () => {
  const { db, call, job } = setup();
  await call("PUT", "/v1/club-share", { share_board: true });
  await call("POST", "/v1/cards", { player_name: "Kylian Testé", overall: 91, positions: ["ST"], evidence: "game_data", owned: true });
  await call("POST", "/v1/cards", { player_name: "Kylian Testé", overall: 89, positions: ["ST"], evidence: "game_data", owned: true }, MATE); // MATE doesn't share
  const now = Date.now();
  db.tables.trade_log = [{ user_id: ME, platform: "console", item_id: 7, ea_item_id: 107, rating: 85, bought_for: 10_000, bought_at: new Date(now - 3 * 86_400_000).toISOString(), sold_for: 20_000, sold_at: new Date(now - 86_400_000).toISOString(), listed_for: null }];
  const board = (await job({ job: "club-board", user_ids: [ME, MATE, "not-a-uuid"] })).data.data;
  assert(board.rows.length === 1 && board.rows[0].user_id === ME && board.rows[0].club_value === 1_250_000 && board.rows[0].trade_profit_week === 9_000, JSON.stringify(board));
  const who = (await job({ job: "club-whohas", user_ids: [ME, MATE], query: "kylian" })).data.data;
  assert(who.owners.length === 1 && who.owners[0].user_id === ME && who.owners[0].cards[0].rating === 91, JSON.stringify(who));
  assert((await job({ job: "club-whohas", user_ids: [ME], query: "k" })).status === 400, "query too short");
  assert((await job({ job: "club-board", user_ids: "x" })).status === 400, "user_ids must be a list");
});
