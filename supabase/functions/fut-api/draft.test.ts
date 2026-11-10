// Draft simulator and pack opener routes, with the seeded card RPC mocked deterministically.
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "22222222-2222-4222-8222-222222222222";
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup() {
  const db = futMemoryDb(seededRules()) as ReturnType<typeof futMemoryDb> & { rpc: (fn: string, a: Record<string, unknown>) => Promise<unknown> };
  db.rpc = (fn, a) => {
    if (fn === "random_cards") {
      // Five cards per call; ids from the seed so the same code gives the same options.
      const pos = (a.p_position as string | null) ?? "ST", min = a.p_min as number;
      const cards = Array.from({ length: a.p_count as number }, (_, i) => ({ id: `${a.p_seed}#${i}`, name: `${a.p_seed} ${i}`, overall: Math.min(99, min + 10 - i), positions: [pos], club: i === 0 ? "Same FC" : `Club ${a.p_seed}${i}`, league: i === 0 ? "Same League" : `League ${a.p_seed}${i}`, nation: i === 0 ? "Sameland" : `Land ${a.p_seed}${i}`, is_icon: false, is_hero: false, version: "Rare", ea_item_id: 100 + i }));
      return Promise.resolve({ data: cards, error: null });
    }
    if (fn === "account_item_prices") return Promise.resolve({ data: { items: (a.p_ids as number[]).map((id) => ({ ea_item_id: id, price: 1000 })) }, error: null });
    return Promise.resolve({ data: null, error: { message: "not mocked" } });
  };
  const deps: Deps = { db, userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), isBot: (req) => Promise.resolve(req.headers.get("x-bot") === "1"), env: (k) => ({ FUT_ENABLED: "true" } as Record<string, string>)[k] };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, bot = false): Promise<{ status: number; data: any }> => {
    const headers: Record<string, string> = { "content-type": "application/json", ...(bot ? { "x-bot": "1" } : { "x-test-user": ME }) };
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { call };
}

Deno.test("draft: same code same options, picks validated, best score kept, board for the bot", async () => {
  const { call } = setup();
  const d = (await call("GET", "/v1/draft?formation=4-3-3&seed=night01")).data.data;
  assert(d.seed === "night01" && d.slots.length === 11 && d.slots.every((s: { options: unknown[] }) => s.options.length === 5), JSON.stringify(d).slice(0, 200));
  const again = (await call("GET", "/v1/draft?formation=4-3-3&seed=night01")).data.data;
  assert(JSON.stringify(again.slots) === JSON.stringify(d.slots), "deterministic");
  assert((await call("GET", "/v1/draft?seed=NO!")).status === 400 && (await call("GET", "/v1/draft?formation=1-1-1")).status === 400, "bad code/formation");
  const fresh = (await call("GET", "/v1/draft")).data.data;
  assert(/^[a-z0-9]{6}$/.test(fresh.seed) && fresh.formation === "4-3-3", fresh.seed);
  // deno-lint-ignore no-explicit-any
  const pick = (i: number) => Object.fromEntries(d.slots.map((s: any) => [s.slot, s.options[i].id]));
  const low = await call("POST", "/v1/draft/finish", { seed: "night01", formation: "4-3-3", picks: pick(4) });
  assert(low.status === 200 && low.data.data.personal_best && low.data.data.score === low.data.data.rating + low.data.data.chemistry, JSON.stringify(low.data));
  const high = (await call("POST", "/v1/draft/finish", { seed: "night01", formation: "4-3-3", picks: pick(0) })).data.data;
  assert(high.score > low.data.data.score && high.personal_best && high.chemistry > low.data.data.chemistry, JSON.stringify(high));
  const worse = (await call("POST", "/v1/draft/finish", { seed: "night01", formation: "4-3-3", picks: pick(4) })).data.data;
  assert(!worse.personal_best && worse.previous_best === high.score, JSON.stringify(worse));
  assert((await call("POST", "/v1/draft/finish", { seed: "night01", formation: "4-3-3", picks: { ...pick(0), ST: "someone-else" } })).status === 400, "not an option");
  const board = (await call("POST", "", { job: "draft-board", seed: "night01", user_ids: [ME] }, true)).data.data;
  assert(board.rows.length === 1 && board.rows[0].score === high.score, JSON.stringify(board));
});

Deno.test("pack opener: made-up packs, right size, valued at FUT.GG prices", async () => {
  const { call } = setup();
  const r = (await call("POST", "/v1/packs/simulate", { pack: "rare" })).data.data;
  assert(r.cards.length === 12 && r.value === r.cards.filter((c: { price: number | null }) => c.price).length * 1000 && /made-up odds/.test(r.note), JSON.stringify(r).slice(0, 300));
  assert(r.cards[0].overall >= r.cards.at(-1).overall, "best first");
  assert((await call("POST", "/v1/packs/simulate", { pack: "mystery" })).status === 400, "unknown pack");
});
