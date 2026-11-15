import {
  checkOpenAiKey, cleanKey, decryptKey, encryptKey, imageKeyFor, KeyError, keyStatus, ownKeyProblem, ownKeysEnabled, saveKey,
} from "./ai-provider-keys.ts";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

const ME = "111111111111111111";
const GUILD = "222222222222222222";
const env = (extra: Record<string, string> = {}) => (k: string) => ({ AI_KEY_SECRET: "test-secret", GAFFERBOT_SELF_HOSTED: "1", ...extra } as Record<string, string>)[k];

// A tiny stand-in for the one table these helpers touch
function fakeDb() {
  const rows: Record<string, unknown>[] = [];
  const db = {
    rows,
    from: () => {
      const filters: [string, unknown][] = [];
      let patch: Record<string, unknown> | null = null;
      let del = false;
      const match = (r: Record<string, unknown>) => filters.every(([k, v]) => r[k] === v);
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        maybeSingle: () => Promise.resolve({ data: rows.find(match) ?? null, error: null }),
        upsert: (r: Record<string, unknown>) => {
          const i = rows.findIndex((x) => x.scope === r.scope && x.owner_id === r.owner_id && x.provider === r.provider);
          if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ ...r });
          return Promise.resolve({ error: null });
        },
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        delete: () => { del = true; return q; },
        then: (ok: (v: unknown) => void) => {
          if (patch) for (const r of rows.filter(match)) Object.assign(r, patch);
          if (del) for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
          ok({ error: null });
        },
      };
      return q;
    },
  };
  return db;
}

const okFetch = (status = 200) => (() => Promise.resolve(new Response("{}", { status }))) as unknown as typeof fetch;

Deno.test("a key only decrypts for the owner, scope and provider it was saved for", async () => {
  const sealed = await encryptKey(env(), "user", ME, "openai", "sk-proj-abcdefghijklmnopqrstuvwxyz");
  assert(!sealed.includes("abcdefghij"), "stored text must not contain the key");
  assert(await decryptKey(env(), "user", ME, "openai", sealed) === "sk-proj-abcdefghijklmnopqrstuvwxyz", "owner decrypts");
  assert(await decryptKey(env(), "user", GUILD, "openai", sealed) === null, "another owner can't");
  assert(await decryptKey(env(), "server", ME, "openai", sealed) === null, "another scope can't");
  assert(await decryptKey(env({ AI_KEY_SECRET: "other" }), "user", ME, "openai", sealed) === null, "another secret can't");
});

Deno.test("keys are shape-checked and checked with OpenAI before saving", async () => {
  for (const bad of ["", "hello", "sk-ant-api03-not-openai but spaces"]) {
    let threw = false;
    try { cleanKey(bad); } catch (e) { threw = e instanceof KeyError; }
    assert(threw, `"${bad}" should be refused`);
  }
  let refused = false;
  try { await checkOpenAiKey("sk-proj-abcdefghijklmnopqrstuvwxyz", okFetch(401)); } catch (e) { refused = e instanceof KeyError && e.status === 422; }
  assert(refused, "a key OpenAI refuses is not saved");
  await checkOpenAiKey("sk-proj-abcdefghijklmnopqrstuvwxyz", okFetch(429)); // busy, not refused
});

Deno.test("status never includes the key, only its last 4 characters", async () => {
  const db = fakeDb();
  const s = await saveKey(db, env(), "user", ME, " sk-proj-abcdefghijklmnopqrstuvwxyz ", ME, "openai", okFetch());
  assert(s.saved && s.key_hint === "wxyz", "saved with hint");
  assert(!JSON.stringify(await keyStatus(db, env(), "user", ME)).includes("abcdefghij"), "status has no key");
  assert(!JSON.stringify(db.rows).includes("abcdefghij"), "row has no plain key");
});

Deno.test("images use the requester's own key, then the server's, else GafferBot's", async () => {
  const db = fakeDb();
  assert(await imageKeyFor(db, env(), { userId: ME, guildId: GUILD }) === null, "no keys: GafferBot pays");
  await saveKey(db, env(), "server", GUILD, "sk-server-abcdefghijklmnopqrstuvwxyz", ME, "openai", okFetch());
  assert((await imageKeyFor(db, env(), { userId: ME, guildId: GUILD }))?.source === "server", "server key");
  await saveKey(db, env(), "user", ME, "sk-mine-abcdefghijklmnopqrstuvwxyz", ME, "openai", okFetch());
  const mine = await imageKeyFor(db, env(), { userId: ME, guildId: GUILD });
  assert(mine?.source === "yours" && mine.key === "sk-mine-abcdefghijklmnopqrstuvwxyz", "own key first");
  assert((await imageKeyFor(db, env(), { userId: null, guildId: GUILD }))?.source === "server", "no requester: never someone's own key");
  assert(await imageKeyFor(db, env({ GAFFERBOT_SELF_HOSTED: "" }), { userId: ME, guildId: GUILD }) === null, "off unless self-hosted");
  assert(!ownKeysEnabled(env({ AI_OWN_KEYS: "off" })), "AI_OWN_KEYS=off turns it off");
});

Deno.test("OpenAI problems on an own key say whose key and what to do", () => {
  assert(ownKeyProblem(401, "", "yours").startsWith("Your OpenAI key was refused"), "refused");
  assert(ownKeyProblem(429, "You exceeded your current quota", "server").includes("This server's OpenAI key is out of OpenAI credit"), "credit");
  assert(ownKeyProblem(403, "Your organization must be verified to use the model", "yours").includes("verified"), "verification");
  assert(ownKeyProblem(400, "bad prompt", "yours") === "", "other errors keep OpenAI's own message");
});
