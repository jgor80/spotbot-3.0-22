// Fill from voice reads the bot's gateway cache instead of one Discord call per player
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { createVoiceLookup } = require('./voice-lookup.cjs');

const GUILD = '123456789012345678';
const A = '200000000000000001', B = '200000000000000002', C = '200000000000000003', D = '200000000000000004';
const states = new Map([
  [A, { id: A, channelId: 'v1', channel: { name: 'Match Night' } }],
  [B, { id: B, channelId: 'v1', channel: { name: 'Match Night' } }],
  [C, { id: C, channelId: 'v2', channel: { name: 'Chill' } }],
  [D, { id: D, channelId: null }],
]);
const client = { guilds: { cache: new Map([[GUILD, { available: true, voiceStates: { cache: states } }]]) } };

test('groups the asked-for players by voice channel', () => {
  const lookup = createVoiceLookup({ getClient: () => client });
  assert.deepStrictEqual(lookup.channelsFor(GUILD, [A, B, D]), [{ id: 'v1', name: 'Match Night', user_ids: [A, B] }]);
  assert.strictEqual(lookup.channelsFor('999999999999999999', [A]), null);
});

test('announce-lineup voice uses the cache and makes no per-player Discord calls', async () => {
  const KEY = 'service-key-'.padEnd(40, 'k');
  const q = new Proxy({}, { get: (_t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : k === 'maybeSingle' ? async () => ({ data: null }) : () => q) });
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => ({ from: () => q, rpc: async () => ({ data: null }) }) } };
  const file = path.join(__dirname, 'local-functions', 'announce-lineup.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_SERVICE_ROLE_KEY: KEY, DISCORD_BOT_TOKEN: 'tok' })[k] ?? '' }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  globalThis.__gafferbotVoice = createVoiceLookup({ getClient: () => client });
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response('{}', { status: 404 }); };
  try {
    const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ action: 'voice', guild_id: GUILD, user_ids: [A, B, C] }) }));
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(body.channels.map((c) => [c.name, c.user_ids.length]), [['Match Night', 2], ['Chill', 1]]);
    assert.deepStrictEqual(calls.filter((u) => u.includes('voice-states')), []);
  } finally { globalThis.fetch = realFetch; delete globalThis.__gafferbotVoice; }
});
