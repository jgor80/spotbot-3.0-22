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

// Announcing: a server member who isn't a leader can't post a lineup that has no squad or no squad leaders
const GUILD = '123456789012345678', ME = '223456789012345678', LINEUP = '11111111-1111-4111-8111-111111111111';
function tableDb(tables) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'me-auth' } }, error: null }) },
    rpc: async () => ({ data: false, error: null }),
    from(name) {
      const filters = [];
      const rows = () => (tables[name] || []).filter((r) => filters.every((f) => f(r)));
      const q = { select: () => q, eq: (k, v) => { filters.push((r) => r[k] === v); return q; }, in: () => q, order: () => q, limit: () => q, not: () => q, neq: () => q, gte: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }), then: (res) => res({ data: rows(), error: null }) };
      return q;
    },
  };
}
async function announceAs(team) {
  const tables = {
    user_discord_links: [{ auth_user_id: 'me-auth', discord_user_id: ME, verified: true }],
    player_stats: [{ id: 1, guild_id: GUILD, discord_user_id: ME }], // a member through played matches
    web_admins: [],
    lineups: [{ id: LINEUP, guild_id: GUILD, team_id: team ? 'team-1' : null }],
    teams: team ? [{ id: 'team-1', ...team }] : [],
  };
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => tableDb(tables) } };
  const file = path.join(__dirname, 'local-functions', 'announce-lineup.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: (k) => (k === 'DISCORD_BOT_TOKEN' ? 'test-token' : '') }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response('{}', { status: 404 }); }; // not a Discord leader
  try {
    const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer userJwt' },
      body: JSON.stringify({ action: 'announce', lineup_id: LINEUP, channel_id: '323456789012345678' }) }));
    return { status: res.status, channels: calls.filter((u) => u.includes('/channels/')) };
  } finally { globalThis.fetch = realFetch; }
}

test('announce: a plain member is refused for a lineup with no squad', async () => {
  const res = await announceAs(null);
  assert.strictEqual(res.status, 403);
  assert.deepStrictEqual(res.channels, []);
});

test('announce: a plain member is refused for a squad with no leaders yet', async () => {
  const res = await announceAs({ captain_discord_id: null, manager_discord_ids: [] });
  assert.strictEqual(res.status, 403);
});

test("announce: the squad's captain gets through to the channel check", async () => {
  const res = await announceAs({ captain_discord_id: ME, manager_discord_ids: [] });
  assert.strictEqual(res.status, 400); // the fake Discord can't see the channel, so it stops there
  assert.strictEqual(res.channels.length, 1);
});
