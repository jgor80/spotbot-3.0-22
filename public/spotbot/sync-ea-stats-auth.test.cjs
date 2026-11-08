// sync-ea-stats refuses anonymous calls, whether or not CRON_SECRET is set
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function load(env) {
  const calls = [];
  const empty = (name) => {
    const q = new Proxy({}, { get: (_t, k) => {
      if (k === 'then') return (res) => { calls.push(name); return res({ data: [], error: null }); };
      if (k === 'maybeSingle' || k === 'single') return async () => { calls.push(name); return { data: null, error: null }; };
      return () => q;
    } });
    return q;
  };
  const db = { from: empty, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null }, error: { message: 'bad jwt' } }) } };
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => db } };
  const file = path.join(__dirname, 'local-functions', 'sync-ea-stats.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: (k) => env[k] ?? '' }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  return { handler, calls };
}

for (const [label, env] of [['CRON_SECRET unset', {}], ['CRON_SECRET set', { CRON_SECRET: 'x'.repeat(32) }]]) {
  test(`an anonymous full sync is refused (${label})`, async () => {
    const { handler, calls } = load({ SUPABASE_SERVICE_ROLE_KEY: 'service-key-'.padEnd(40, 'k'), ...env });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('no network in tests'); };
    try {
      const res = await handler(new Request('http://x', { method: 'POST', body: JSON.stringify({ sync_type: 'full' }) }));
      assert.strictEqual(res.status, 401);
      assert.ok(!calls.includes('guild_settings'), 'read guild settings before refusing');
    } finally { globalThis.fetch = realFetch; }
  });
}

test('the bot (service key) is let through', async () => {
  const key = 'service-key-'.padEnd(40, 'k');
  const { handler } = load({ SUPABASE_SERVICE_ROLE_KEY: key });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('no network in tests'); };
  try {
    const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ sync_type: 'full' }) }));
    assert.notStrictEqual(res.status, 401);
  } finally { globalThis.fetch = realFetch; }
});
