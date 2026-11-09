// My Account: the helper's account upload, newest-section-wins storage, balance history, prices and tips.
// Fictional accounts, cards and prices only.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";
import { accountTips, parseAccountUpload, tradepileSummary } from "../_shared/fut/account.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const H = 3_600_000;

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

const iso = (ms: number) => new Date(ms).toISOString();
const trade = (item_id: number, ea_item_id: number, state: string, extra: Record<string, unknown> = {}) => ({
  item_id, ea_item_id, item_type: "player", rating: 84, rare_flag: 1, untradeable: false, trade_id: String(item_id * 10), state,
  buy_now: 10_000, current_bid: null, starting_bid: 9_000, expires_at: null, last_sale_price: null, ...extra,
});

function file(seen: number, coins = 50_000) {
  const seen_at = iso(seen);
  return {
    format: "xilab-account-capture", version: 1, verified: false, platform: "console", captured_at: seen_at,
    balance: { seen_at, data: { coins, points: 1050, draft_tokens: 1, currencies: [{ name: "COINS", funds: coins }, { name: "POINTS", funds: 1050 }, { name: "bad name!", funds: 3 }] } },
    profile: { seen_at, data: { club_name: "Gaffer United", won: 10, lost: 2, draw: 1, tradepile_max: 5, personaId: 99 } },
    tradepile: { seen_at, data: [
      trade(1, 501, "sold", { current_bid: 20_000 }), trade(2, 502, "expired"), trade(3, 501, "listed", { buy_now: 40_000, expires_at: iso(seen + H) }),
      trade(4, 503, "unlisted"), trade(5, 501, "bogus"),
    ] },
    watchlist: { seen_at, data: [trade(6, 502, "won", { current_bid: 3000 }), trade(7, 502, "winning", { current_bid: 4000 }), trade(8, 503, "outbid")] },
    unassigned: { seen_at, data: [{ item_id: 9, ea_item_id: 501, rating: 84, untradeable: true, duplicate: true }, { item_id: 10, ea_item_id: 999 }] },
    sbcs: { seen_at, data: [
      { set_id: 1, name: "Daily Upgrade", challenges: 1, completed: 0, repeatable: true, end_at: iso(seen + 5 * H) },
      { set_id: 2, name: "Done Once", challenges: 1, completed: 1, times_completed: 1, repeatable: false },
      { set_id: 3, name: "Later", challenges: 4, completed: 1, end_at: iso(seen + 72 * H) },
    ] },
    objectives: { seen_at, data: [{ name: "Win 2", group: "Daily", progress: 1, target: 2, done: false, end_at: iso(seen + 2 * H), xp: 300 }, { name: "Done", progress: 1, target: 1, done: true }] },
    season: { seen_at, data: { seasonLevel: 12, "bad key!": 1 } },
    shape: { massinfo: ["userInfo", "pileSizeClientData"], tradepile: ["auctionInfo", "credits"] },
  };
}

Deno.test("upload parsing keeps known fields only and drops anything odd", () => {
  const now = Date.now();
  const u = parseAccountUpload(file(now), now);
  const b = u.sections.balance!.data as { currencies: { name: string }[] };
  assert(b.currencies.length === 2, "bad currency names dropped");
  assert(!JSON.stringify(u.sections.profile).includes("personaId"), "unknown profile fields dropped");
  assert((u.sections.tradepile!.data as unknown[]).length === 4, "unknown trade state dropped");
  assert(JSON.stringify(u.sections.season!.data) === JSON.stringify({ seasonLevel: 12 }), "season keys checked");
  assert(!parseAccountUpload({ ...file(now + 3 * H) }, now).sections.balance, "a section from the future is ignored");
  let threw = false;
  try { parseAccountUpload({ format: "xilab-store-capture", version: 1 }); } catch { threw = true; }
  assert(threw, "wrong format refused");
});

Deno.test("tips: sold, expired, overpriced, full list, won and outbid, duplicates, ending SBCs and objectives", () => {
  const now = Date.now();
  const n = (t: ReturnType<typeof trade>, price: number | null) => ({ ...t, state: t.state as "sold", name: "X", version: null, position: null, price });
  const sum = tradepileSummary([n(trade(1, 1, "sold", { current_bid: 20_000 }), 1), n(trade(2, 1, "expired"), 8000), n(trade(3, 1, "listed", { buy_now: 40_000 }), 10_000)], 3);
  assert(sum.sold_for === 20_000 && sum.sold_after_tax === 19_000 && sum.idle_market_value === 8000 && sum.overpriced === 1, JSON.stringify(sum));
  const tips = accountTips({ now, trade: sum, watch: { total: 2, winning: 0, outbid: 1, won: 1, lost: 0, coins_in_bids: 0 },
    unassigned: [{ item_id: 1, ea_item_id: 1, item_type: null, rating: 80, rare_flag: null, untradeable: true, duplicate: true, name: "X", version: null, position: null, price: null }],
    sbcs: [{ set_id: 1, name: "Daily Upgrade", category: null, description: null, challenges: 1, completed: 0, times_completed: null, repeat_limit: null, repeatable: true, end_at: iso(now + 5 * H), awards: [] }],
    objectives: [{ id: null, name: "Win 2", group: null, progress: 1, target: 2, done: false, end_at: iso(now + 2 * H), xp: 300 }] });
  for (const re of [/sold.*20,000.*19,000/, /expired.*8,000/, /25%/, /3\/3 full/, /won item/, /outbid/, /1 duplicate \(1 untradeable/, /Daily Upgrade.*5 hours/, /objective/])
    assert(tips.some((t) => re.test(t)), `missing tip ${re}: ${JSON.stringify(tips)}`);
});

Deno.test("routes: the helper key uploads the account, the user sees it priced, newer sections win, nobody else sees it", async () => {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  const published = iso(Date.now() - 2 * H);
  let rpcIds: number[] = [];
  db.rpc = (fn, args) => {
    rpcIds = args.p_ids as number[];
    return Promise.resolve(fn === "account_item_prices" ? { data: { published_at: published, items: [
      { ea_item_id: 501, card_id: "c1", player_name: "Star Striker", version: "rare", overall: 86, position: "ST", price: 30_000 },
      { ea_item_id: 502, card_id: "c2", player_name: "Solid Back", version: "rare", overall: 82, position: "CB", price: 8_000 },
    ] }, error: null } : { data: null, error: { message: "unknown" } });
  };
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => (k === "FUT_ENABLED" ? "true" : undefined) };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = { "x-test-user": ME }): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const key = (await call("POST", "/v1/helper/connect")).data.data.key as string;
  const t0 = Date.now() - 3 * H;
  const up = await call("POST", "/v1/helper/account", file(t0), { authorization: `Bearer ${key}` });
  assert(up.status === 200 && up.data.data.updated.length === 8, JSON.stringify(up.data));
  assert((await call("GET", "/v1/account", undefined, { authorization: `Bearer ${key}` })).status === 403, "the key can't read the account");

  let a = (await call("GET", "/v1/account?platform=console")).data.data;
  assert(a.connected && a.balance.coins === 50_000 && a.balance.points === 1050 && a.profile.club_name === "Gaffer United", JSON.stringify(a.balance));
  assert(JSON.stringify(rpcIds.sort()) === JSON.stringify([501, 502, 503, 999]), `priced ids ${rpcIds}`);
  assert(a.tradepile.items[0].state === "sold" && a.tradepile.items[0].name === "Star Striker" && a.tradepile.summary.sold_for === 20_000, JSON.stringify(a.tradepile.items[0]));
  assert(a.tradepile.summary.idle_market_value === 8000 && a.tradepile.summary.max === 5, JSON.stringify(a.tradepile.summary));
  assert(a.tradepile.items.find((i: { ea_item_id: number }) => i.ea_item_id === 503).name === "Item 503", "unknown cards get a placeholder name");
  assert(a.watchlist.summary.won === 1 && a.watchlist.summary.coins_in_bids === 4000 && a.watchlist.items[0].state === "won", JSON.stringify(a.watchlist.summary));
  assert(a.unassigned.total === 2 && a.unassigned.duplicates === 1 && a.unassigned.tradeable_value === 0, JSON.stringify(a.unassigned));
  assert(a.sbcs.open === 2 && a.sbcs.items[0].name === "Daily Upgrade" && a.sbcs.items.at(-1).name === "Done Once", JSON.stringify(a.sbcs.items.map((s: { name: string }) => s.name)));
  assert(a.objectives.done === 1 && a.objectives.xp_left === 300 && a.prices_at === published, "objectives summary");
  assert(a.tips.some((t: string) => /Daily Upgrade/.test(t)) && a.shape.tradepile.includes("auctionInfo"), JSON.stringify(a.tips));
  assert(a.history.length === 1 && a.history[0].coins === 50_000, JSON.stringify(a.history));

  // An older upload doesn't overwrite; a newer balance adds a history point; an unchanged one an hour later doesn't.
  const older = await call("POST", "/v1/helper/account", { ...file(t0 - H, 1), tradepile: undefined }, { authorization: `Bearer ${key}` });
  assert(older.data.data.updated.length === 0, JSON.stringify(older.data));
  await call("POST", "/v1/helper/account", { format: "xilab-account-capture", version: 1, platform: "console", balance: file(t0 + H, 65_000).balance }, { authorization: `Bearer ${key}` });
  await call("POST", "/v1/helper/account", { format: "xilab-account-capture", version: 1, platform: "console", balance: file(t0 + 2 * H, 65_000).balance }, { authorization: `Bearer ${key}` });
  a = (await call("GET", "/v1/account")).data.data;
  assert(a.balance.coins === 65_000 && a.tradepile.items.length === 4 && a.history.map((h: { coins: number }) => h.coins).join() === "50000,65000", JSON.stringify(a.history));

  assert((await call("GET", "/v1/account", undefined, { "x-test-user": OTHER })).data.data.connected === false, "private to the uploader");
  assert((await call("GET", "/v1/account?platform=pc")).data.data.connected === false, "per platform");
  assert((await call("DELETE", "/v1/account?platform=console")).data.data.cleared === true, "clear");
  a = (await call("GET", "/v1/account")).data.data;
  assert(!a.connected && a.history.length === 0, "cleared");
});
