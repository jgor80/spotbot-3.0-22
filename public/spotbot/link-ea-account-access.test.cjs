// link-ea-account: changing someone else's gamertag needs leader rights in that server, and a gamertag
// another real member holds can't be taken
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ME = '111111111111111111', VICTIM = '222222222222222222', OTHER = '333333333333333333', GUILD = '444444444444444444';

function fakeDb(tables, writes) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'me-auth' } }, error: null }) },
    rpc: async () => ({ data: false, error: null }),
    from(name) {
      const filters = [];
      let op = 'select';
      const rows = () => (tables[name] || []).filter((r) => filters.every((f) => f(r)));
      const q = {
        select: () => q,
        update: () => { op = 'update'; return q; },
        insert: () => { writes.push(name); return Promise.resolve({ error: null }); },
        delete: () => { op = 'delete'; return q; },
        eq: (k, v) => { filters.push((r) => r[k] === v); return q; },
        in: (k, vs) => { filters.push((r) => vs.includes(r[k])); return q; },
        ilike: (k, v) => { const lit = String(v).replace(/\\([\\%_])/g, '$1').toLowerCase(); filters.push((r) => String(r[k] ?? '').toLowerCase() === lit); return q; },
        limit: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res, rej) => { if (op !== 'select') writes.push(name); return Promise.resolve({ data: rows(), error: null }).then(res, rej); },
      };
      return q;
    },
  };
}

async function call(body, tables) {
  const writes = [];
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => fakeDb(tables, writes) } };
  const file = path.join(__dirname, 'local-functions', 'link-ea-account.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: () => '' }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 }); // Discord: not a member, not a leader
  try {
    const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json(), writes };
  } finally { globalThis.fetch = realFetch; }
}

const base = () => ({ user_discord_links: [{ auth_user_id: 'me-auth', discord_user_id: ME, verified: true }], web_admins: [], profiles: [], player_stats: [] });

test("a leader of some other server can't rewrite a player's gamertag", async () => {
  const res = await call({ guild_id: GUILD, discord_user_id: VICTIM, ea_username: 'Hijacked' }, base());
  assert.strictEqual(res.status, 403);
  assert.deepStrictEqual(res.writes, []);
});

test("a gamertag another real member holds can't be taken", async () => {
  const t = base();
  t.profiles.push({ discord_user_id: OTHER, ea_username: 'AceStriker' });
  const res = await call({ guild_id: GUILD, discord_user_id: ME, ea_username: 'acestriker' }, t);
  assert.strictEqual(res.status, 409);
  assert.deepStrictEqual(res.writes, []);
});

test('a member can still link their own free gamertag', async () => {
  const res = await call({ guild_id: GUILD, discord_user_id: ME, ea_username: 'FreeName' }, base());
  assert.strictEqual(res.status, 200);
  assert.ok(res.writes.includes('profiles'));
});
