// Game posts ping a role, never players one by one: league games ping the signed-players role,
// other games ping @everyone or the game's role. Leader alerts are the only individual pings.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const B = require('./event-board.cjs');
const { DEFAULT_ALLOWED_MENTIONS } = require('./ping-policy.cjs');

test('pingContent: role or @everyone up front, player tags never notify', () => {
  const role = B.pingContent({ kind: 'role', roleId: '10' }, '⏰ I couldn\'t DM <@223456789012345678>');
  assert.strictEqual(role.content, '<@&10> ⏰ I couldn\'t DM <@223456789012345678>');
  assert.deepStrictEqual(role.allowedMentions, { parse: [], users: [], roles: ['10'], repliedUser: false });

  const everyone = B.pingContent({ kind: 'everyone' }, 'Kick-off moved');
  assert.strictEqual(everyone.content, '@everyone Kick-off moved');
  assert.deepStrictEqual(everyone.allowedMentions, { parse: ['everyone'], users: [], roles: [], repliedUser: false });

  const none = B.pingContent({ kind: 'none' }, 'Answers close soon');
  assert.strictEqual(none.content, 'Answers close soon');
  assert.deepStrictEqual(none.allowedMentions.users, []);
  assert.deepStrictEqual(none.allowedMentions.roles, []);
  assert.strictEqual(B.pingContent({ kind: 'none' }, '').content, undefined);
});

test('league follow-ups use the signed role even when another role or @everyone was picked', () => {
  const plan = B.choosePing({ pingRoleId: '7', league: true, signedRoleId: '10' });
  const msg = B.pingContent(plan, 'Check-in is open');
  assert.deepStrictEqual(msg.allowedMentions.roles, ['10']);
  assert.deepStrictEqual(msg.allowedMentions.parse, []);
  assert.deepStrictEqual(msg.allowedMentions.users, []);
});

test('the bot client never pings users unless a message asks to', () => {
  assert.deepStrictEqual(DEFAULT_ALLOWED_MENTIONS.parse.includes('users'), false);
  assert.strictEqual(DEFAULT_ALLOWED_MENTIONS.repliedUser, false);
  const index = fs.readFileSync(path.join(__dirname, 'index.cjs'), 'utf8');
  assert.match(index, /new Client\(\{[^\n]*allowedMentions: \{ \.\.\.DEFAULT_ALLOWED_MENTIONS/);
});

// Every allowedMentions that names users in the game modules must be a leader alert on this list
test('game posts never ping players one by one', () => {
  const leaderAlerts = {
    'events.cjs': [],
    'casual.cjs': [],
    'event-lineup.cjs': ['created_by_discord_id'], // the captain is told a starter dropped out
    'matchnight.cjs': ['[...new Set(notify)]'], // whoever asked for a sub is told who covers
  };
  for (const [file, allowed] of Object.entries(leaderAlerts)) {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const userLists = [...src.matchAll(/users:\s*([^,}\n]+)/g)].map((m) => m[1].trim()).filter((v) => v !== '[]');
    for (const list of userLists) {
      assert.ok(allowed.some((a) => list.includes(a)), `${file} pings users ${list}`);
    }
  }
});

// The website / MCP / Control Room team sheet goes through announce-lineup
const GUILD = '123456789012345678';
const LINEUP = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';
const P1 = '323456789012345678', P2 = '423456789012345678';
function tableDb(tables) {
  return {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async () => ({ data: false, error: null }),
    from(name) {
      const filters = [];
      let excluded = false;
      const rows = () => (excluded ? [] : (tables[name] || []).filter((r) => filters.every((f) => f(r))));
      const q = {
        select: () => q, update: () => q, upsert: () => q, insert: () => q,
        eq: (k, v) => { filters.push((r) => r[k] === undefined || r[k] === v); return q; },
        neq: () => { excluded = true; return q; },
        in: () => q, order: () => q, limit: () => q, not: () => q, gte: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res) => res({ data: rows(), error: null }),
      };
      return q;
    },
  };
}

async function announce({ event, roles, club = {} }) {
  const tables = {
    lineups: [{ id: LINEUP, guild_id: GUILD, team_id: null, event_id: event ? EVENT : null, formation: '4-3-3', name: null, message_id: null, channel_id: null, announced_slots: null }],
    lineup_slots: [
      { discord_user_id: P1, position: 'ST', slot_index: 0, is_substitute: false },
      { discord_user_id: P2, position: 'GK', slot_index: 1, is_substitute: false },
    ],
    availability_events: event ? [{ id: EVENT, scheduled_at: new Date(Date.now() + 3600e3).toISOString(), ...event }] : [],
    guild_settings: [{ guild_id: GUILD, branding: {}, clubs: [{ key: 'club1', name: 'Test FC', ...club }] }],
  };
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => tableDb(tables) } };
  const file = path.join(__dirname, 'local-functions', 'announce-lineup.cjs');
  delete require.cache[file];
  let handler = null;
  const SECRET = 'x'.repeat(32);
  globalThis.Deno = { env: { get: (k) => (k === 'DISCORD_BOT_TOKEN' ? 'test-token' : k === 'BOT_PROXY_SECRET' ? SECRET : '') }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  const posts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith(`/channels/${GUILD.replace('1', '9')}`)) return Response.json({ id: GUILD.replace('1', '9'), guild_id: GUILD });
    if (u.endsWith(`/guilds/${GUILD}/roles`)) return Response.json(roles);
    if (init.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return Response.json({ id: '999999999999999999' });
    }
    return new Response('{}', { status: 404 });
  };
  try {
    const res = await handler(new Request('http://x', {
      method: 'POST',
      headers: { 'x-bot-secret': SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'announce', lineup_id: LINEUP, channel_id: GUILD.replace('1', '9'), mention_players: true }),
    }));
    assert.strictEqual(res.status, 200, await res.clone().text());
  } finally {
    globalThis.fetch = realFetch;
  }
  return posts;
}

test('announce-lineup: a league team sheet pings the signed role only', async () => {
  const posts = await announce({
    event: { title: 'League night', event_type: 'league', ping_role_id: '7' },
    roles: [{ id: '7', name: 'Everyone Else' }, { id: '10', name: 'Signed Players' }],
  });
  assert.strictEqual(posts.length, 1);
  assert.match(posts[0].content, /^<@&10> Starting XI: /);
  assert.deepStrictEqual(posts[0].allowed_mentions, { parse: [], roles: ['10'], users: [] });
});

test('announce-lineup: the club\'s picked signed role wins over a name match', async () => {
  const posts = await announce({
    event: { title: 'Week 3', event_type: 'league' },
    roles: [{ id: '10', name: 'Signed Players' }, { id: '11', name: 'First Team' }],
    club: { signed_role_id: '11' },
  });
  assert.deepStrictEqual(posts[0].allowed_mentions.roles, ['11']);
  assert.deepStrictEqual(posts[0].allowed_mentions.users, []);
});

test('announce-lineup: a league game with no signed role pings nobody, never @everyone', async () => {
  const posts = await announce({ event: { title: 'League night', event_type: 'league' }, roles: [] });
  assert.deepStrictEqual(posts[0].allowed_mentions, { parse: [], roles: [], users: [] });
  assert.doesNotMatch(posts[0].content, /@everyone/);
});

test('announce-lineup: other games ping the game\'s role, else @everyone', async () => {
  let posts = await announce({ event: { title: 'Friendly', event_type: 'friendly', ping_role_id: '7' }, roles: [{ id: '7', name: 'Squad' }, { id: '10', name: 'Signed Players' }] });
  assert.deepStrictEqual(posts[0].allowed_mentions, { parse: [], roles: ['7'], users: [] });
  posts = await announce({ event: { title: 'Friendly', event_type: 'friendly' }, roles: [{ id: '10', name: 'Signed Players' }] });
  assert.deepStrictEqual(posts[0].allowed_mentions, { parse: ['everyone'], roles: [], users: [] });
  assert.match(posts[0].content, /^@everyone /);
});
