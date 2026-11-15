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

test('membersWithRole reads the cache only when every member is cached', () => {
  const role = { members: new Map([[A, {}], [B, {}]]) };
  const full = { available: true, memberCount: 3, members: { cache: { size: 3 } }, roles: { cache: new Map([['r1', role]]) } };
  const partial = { ...full, members: { cache: { size: 2 } } };
  const lookup = (g) => createVoiceLookup({ getClient: () => ({ guilds: { cache: new Map([[GUILD, g]]) } }) });
  assert.deepStrictEqual(lookup(full).membersWithRole(GUILD, 'r1'), [A, B]);
  assert.strictEqual(lookup(partial).membersWithRole(GUILD, 'r1'), null);
  assert.strictEqual(lookup(full).membersWithRole(GUILD, 'nope'), null);
});

test('announce-lineup signed finds the signed role and pages members when not cached', async () => {
  const KEY = 'service-key-'.padEnd(40, 'k');
  const q = new Proxy({}, { get: (_t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : k === 'maybeSingle' ? async () => ({ data: null }) : () => q) });
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => ({ from: () => q, rpc: async () => ({ data: null }) }) } };
  const file = path.join(__dirname, 'local-functions', 'announce-lineup.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_SERVICE_ROLE_KEY: KEY, DISCORD_BOT_TOKEN: 'tok' })[k] ?? '' }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/roles')) return Response.json([{ id: 'r0', name: '@everyone' }, { id: 'r9', name: 'Signed Players' }]);
    if (u.includes('/members?')) return Response.json([{ user: { id: A }, roles: ['r9'] }, { user: { id: B }, roles: [] }, { user: { id: C }, roles: ['r9'] }]);
    return new Response('{}', { status: 404 });
  };
  try {
    const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ action: 'signed', guild_id: GUILD }) }));
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(body, { role: { id: 'r9', name: 'Signed Players' }, user_ids: [A, C] });
  } finally { globalThis.fetch = realFetch; }
});
