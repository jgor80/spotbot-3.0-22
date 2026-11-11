// Card compare route: two cards (one mine, one from the card list) with prices and a chem style.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

Deno.test("POST /compare/cards compares any two cards with prices and chem styles", async () => {
  const db = futMemoryDb({}) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  db.rpc = (fn, args) => Promise.resolve(fn === "account_item_prices" ? { data: { items: (args.p_ids as number[]).map((i) => ({ ea_item_id: i, price: i === 1 ? 50_000 : 10_000 })) }, error: null } : { data: null, error: { message: "?" } });
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": ME }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  const a = (await call("POST", "/v1/cards", { player_name: "Mine", overall: 86, positions: ["ST"], evidence: "game_data", owned: true, stats: { pac: 90, sho: 85 } })).data.data.id;
  const b = (await call("POST", "/v1/cards", { player_name: "Other", overall: 84, positions: ["ST"], evidence: "game_data", stats: { pac: 80, sho: 88 } })).data.data.id;
  const rows = db.tables.player_cards as Record<string, unknown>[];
  rows.find((r) => r.id === a)!.source_card_key = "1";
  Object.assign(rows.find((r) => r.id === b)!, { source_card_key: "2", source_id: "futgg_catalogue", owner_user_id: null });
  const r = await call("POST", "/v1/compare/cards", { card_ids: [a, b], chem_styles: { [b]: "Hunter" } });
  assert(r.status === 200, JSON.stringify(r.data));
  const d = r.data.data;
  assert(d.cards[0].price === 50_000 && d.cards[1].price === 10_000 && d.cards[1].chem_style === "Hunter" && d.shared_positions[0] === "ST", JSON.stringify(d.cards));
  assert(d.rows.find((x: { key: string }) => x.key === "pac").values.join() === "90,80", "face stats shown");
  assert((await call("POST", "/v1/compare/cards", { card_ids: [a] })).status === 400, "one card");
  assert((await call("POST", "/v1/compare/cards", { card_ids: [a, b], chem_styles: { [a]: "Nope" } })).status === 400, "unknown chem style");
});
