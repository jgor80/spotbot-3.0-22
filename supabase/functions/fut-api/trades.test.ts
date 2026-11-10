// Trade log routes: an account upload records buys and sales, the page sums them, the user can add a buy price.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

Deno.test("account uploads fill the trade log, GET /trades sums it, POST /trades/buy-price sets a buy", async () => {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  db.rpc = (fn, args) => Promise.resolve(fn === "account_item_prices"
    ? { data: { published_at: "2026-11-10T06:00:00Z", items: (args.p_ids as number[]).map((i) => ({ ea_item_id: i, player_name: `P${i}`, price: 3000 })) }, error: null }
    : { data: null, error: { message: "?" } });
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), isBot: () => Promise.resolve(false), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const t = (state: string, p: Record<string, unknown>) => ({ item_id: p.item_id, ea_item_id: p.ea_item_id ?? 500, rating: 85, state, ...p });
  const upload = (at: string, tradepile: unknown[], watchlist: unknown[]) => ({
    format: "xilab-account-capture", version: 1, platform: "console", captured_at: at,
    tradepile: { seen_at: at, data: tradepile }, watchlist: { seen_at: at, data: watchlist },
  });
  const a = await call("POST", "/v1/helper/account", upload("2026-11-01T08:00:00Z", [], [t("won", { item_id: 11, current_bid: 2000 })]));
  assert(a.status === 200 && a.data.data.trades === 1, JSON.stringify(a.data));
  await call("POST", "/v1/helper/account", upload("2026-11-01T10:00:00Z", [t("sold", { item_id: 11, current_bid: 3000 }), t("sold", { item_id: 12, ea_item_id: 501, current_bid: 1000 })], []));
  const g = await call("GET", "/v1/trades?platform=console");
  assert(g.status === 200 && g.data.data.totals.flips === 1 && g.data.data.totals.profit === 850, JSON.stringify(g.data.data.totals));
  assert(g.data.data.flips[0].name === "P500" && g.data.data.sales_without_buy[0].item_id === 12, JSON.stringify(g.data.data));
  const b = await call("POST", "/v1/trades/buy-price", { platform: "console", item_id: 12, price: 600 });
  assert(b.status === 200 && b.data.data.bought_for === 600, JSON.stringify(b.data));
  const g2 = await call("GET", "/v1/trades?platform=console");
  assert(g2.data.data.totals.flips === 2 && g2.data.data.totals.profit === 850 + 350 && g2.data.data.totals.sales_without_buy === 0, JSON.stringify(g2.data.data.totals));
  assert((await call("POST", "/v1/trades/buy-price", { platform: "console", item_id: 99, price: 1 })).status === 404, "unknown item");
  assert((await call("POST", "/v1/trades/buy-price", { platform: "console", item_id: 12, price: -5 })).status === 400, "bad price");
});
