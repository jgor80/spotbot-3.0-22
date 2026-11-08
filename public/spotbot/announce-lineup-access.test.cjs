// announce-lineup's channel and voice lookups call Discord as the bot, so they must check the caller's server first
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// A signed-in user with no verified Discord link and no admin rights: no access to any server
function fakeDb() {
  const empty = () => {
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, not: () => q,
      maybeSingle: async () => ({ data: null, error: null }), then: (res) => res({ data: [], error: null }) };
    return q;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'stranger' } }, error: null }) },
    from: empty,
    rpc: async () => ({ data: false, error: null }),
  };
}

function load() {
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => fakeDb() } };
  const file = path.join(__dirname, 'local-functions', 'announce-lineup.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: () => '' }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  return handler;
}

for (const body of [
  { action: 'channels', guild_id: '123456789012345678' },
  { action: 'voice', guild_id: '123456789012345678', user_ids: ['223456789012345678'] },
]) {
  test(`${body.action}: a signed-in stranger is refused before any Discord call`, async () => {
    const handler = load();
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => { calls.push(String(url)); return new Response('[]', { status: 200 }); };
    try {
      const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer userJwt' }, body: JSON.stringify(body) }));
      assert.strictEqual(res.status, 403);
      assert.deepStrictEqual(calls.filter((u) => u.includes('discord.com')), []);
    } finally { globalThis.fetch = realFetch; }
  });
}
