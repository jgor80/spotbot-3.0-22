// Your own Claude API key on the profile: checked with Anthropic, stored encrypted and tied to you, shown again only
// to you, and used by the AI features in place of the server key (with no hourly cap).
import { handle, type Deps } from "./handler.ts";
import { futMemoryDb, seededRules } from "../_shared/fut/test-db.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GOOD = "sk-ant-api03-" + "a".repeat(40) + "WXYZ";
const BAD = "sk-ant-api03-" + "b".repeat(40) + "NOPE";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

function setup(env: Record<string, string> = {}) {
  const all: Record<string, string> = { FUT_ENABLED: "true", SUPABASE_SERVICE_ROLE_KEY: "test-secret", ...env };
  // Player searches and knowledge status go through rpc; an empty answer is enough here.
  const db = Object.assign(futMemoryDb(seededRules()), { rpc: () => Promise.resolve({ data: { cards: [], total: 0 }, error: null }) });
  const sent: { url: string; key: string | null }[] = [];
  const deps: Deps = {
    db,
    userFor: (req) => Promise.resolve(req.headers.get("x-test-user")),
    env: (k) => all[k],
    fetch: ((url: string, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("x-api-key");
      sent.push({ url: String(url), key });
      if (String(url).includes("/v1/models")) return Promise.resolve(new Response(JSON.stringify(key === BAD ? { error: {} } : { data: [] }), { status: key === BAD ? 401 : 200 }));
      const text = JSON.stringify({ query: { position: "CB" }, reply: "Looking for CBs." });
      return Promise.resolve(new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }] }), { status: 200 }));
    }) as unknown as Deps["fetch"],
  };
  // deno-lint-ignore no-explicit-any
  const call = async (method: string, path: string, body?: unknown, user = ME): Promise<{ status: number; data: any }> => {
    const res = await handle(new Request(`http://local/functions/v1/fut-api${path}`, { method, headers: { "content-type": "application/json", "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) }), deps);
    return { status: res.status, data: await res.json() };
  };
  return { db, call, sent };
}

Deno.test("Claude key: checked, saved encrypted, shown only to its owner, removable", async () => {
  const { db, call, sent } = setup();
  const empty = (await call("GET", "/v1/ai-key")).data.data;
  assert(!empty.saved && empty.using === "none", JSON.stringify(empty));
  assert((await call("PUT", "/v1/ai-key", { key: "hello" })).status === 400, "not a key shape");
  const refused = await call("PUT", "/v1/ai-key", { key: BAD });
  assert(refused.status === 422 && sent.length === 1, `Anthropic refused ${JSON.stringify(refused.data)}`);
  assert(!(db.tables.user_ai_keys ?? []).length, "a refused key isn't stored");

  const saved = await call("PUT", "/v1/ai-key", { key: `  ${GOOD} ` });
  assert(saved.status === 200 && saved.data.data.saved && saved.data.data.using === "yours" && saved.data.data.key_hint === "WXYZ", JSON.stringify(saved.data));
  const rows = db.tables.user_ai_keys as { key_encrypted: string; user_id: string }[];
  assert(rows.length === 1 && rows[0]!.key_encrypted.startsWith("v1:") && !JSON.stringify(rows).includes(GOOD), "encrypted, never plain");
  assert(!JSON.stringify(saved.data).includes(GOOD), "status never carries the key");
  assert((await call("GET", "/v1/ai-key/reveal")).data.data.key === GOOD, "owner sees it again");
  assert((await call("GET", "/v1/ai-key/reveal", undefined, OTHER)).data.data.key === null, "someone else sees nothing");
  rows[0]!.user_id = OTHER;
  assert((await call("GET", "/v1/ai-key/reveal", undefined, OTHER)).data.data.key === null, "ciphertext is tied to its owner");
  rows[0]!.user_id = ME;

  const gone = (await call("DELETE", "/v1/ai-key")).data.data;
  assert(!gone.saved && gone.using === "none" && !(db.tables.user_ai_keys ?? []).length, "removed");
});

Deno.test("Claude key: AI features use your key instead of the server's, without the hourly cap", async () => {
  const { call, sent } = setup({ ANTHROPIC_API_KEY: "server-key", FUT_FINDER_AI_PER_HOUR: "1" });
  assert((await call("GET", "/v1/ai-key")).data.data.using === "server", "server key by default");
  await call("POST", "/v1/players/find", { message: "fast CB" });
  assert(sent.at(-1)!.key === "server-key", "server key used before you add one");
  assert((await call("POST", "/v1/players/find", { message: "fast CB" })).status === 429, "server key is capped");

  assert((await call("PUT", "/v1/ai-key", { key: GOOD })).status === 200, "saved");
  for (let i = 0; i < 3; i++) {
    const r = await call("POST", "/v1/players/find", { message: "fast CB" });
    assert(r.status === 200, `own key not capped ${JSON.stringify(r.data)}`);
    assert(sent.at(-1)!.key === GOOD, "your key is used");
  }
  const status = (await call("GET", "/v1/knowledge/status")).data.data;
  assert(status.feeds.reader === true, "knowledge reader on with your key");
});

Deno.test("Claude key: works with no server key, and a changed server secret asks you to save it again", async () => {
  const { db, call, sent } = setup();
  assert((await call("PUT", "/v1/ai-key", { key: GOOD })).status === 200, "saved");
  const r = await call("POST", "/v1/players/find", { message: "fast CB" });
  assert(r.status === 200 && r.data.data.via === "ai" && sent.at(-1)!.key === GOOD, `AI on with only your key ${JSON.stringify(r.data)}`);
  const changed = setup({ AI_KEY_SECRET: "rotated" });
  changed.db.tables.user_ai_keys = db.tables.user_ai_keys;
  const s = (await changed.call("GET", "/v1/ai-key")).data.data;
  assert(!s.saved && s.unreadable && s.using === "none", `unreadable after the secret changed ${JSON.stringify(s)}`);
});
