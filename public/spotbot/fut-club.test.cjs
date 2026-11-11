// Club FUT layer: board lines and highlights, and the pull feed posting only to servers the player is in, no pings.
const test = require('node:test');
const assert = require('node:assert');
const { createFutClub, boardLines, boardHighlights } = require('./fut-club.cjs');

test('board: best club value first, highlights for trading, record and pull', () => {
  const rows = [
    { user_id: 'a', club_value: 300000, trade_profit_week: -2000, flips_week: 3, champs: { w: 2, d: 0, l: 1 }, best_pull: null },
    { user_id: 'b', club_value: 1250000, trade_profit_week: 45000, flips_week: 12, champs: null, best_pull: { rating: 91, name: 'Star' } },
  ];
  const names = { a: 'Ann', b: 'Bo' };
  const lines = boardLines(rows, (id) => names[id]);
  assert.match(lines[0], /^\*\*1\. Bo\*\* · club 1\.3M · trading \+45k \(12 flips\) · best pull Star 91/);
  assert.match(lines[1], /trading −2k .* 2W 0D 1L/);
  const h = boardHighlights(rows, (id) => names[id]).join('\n');
  assert.match(h, /Top trader: \*\*Bo\*\* \+45k/);
  assert.match(h, /Best record: \*\*Ann\*\* 2W 0D 1L/);
  assert.match(h, /Pull of the week: \*\*Bo\*\* · Star 91/);
});

test('pull feed: posts in servers where the player is a member, with the club feature on, without pings', async () => {
  process.env.FUT_ENABLED = 'true';
  const sent = [];
  const guild = (id, members) => ({ id, name: id, members: { fetch: async (u) => (typeof u === 'string' ? (members.includes(u) ? { id: u } : null) : new Map()) , cache: new Map() } });
  const guilds = new Map([['g1', guild('g1', ['d1'])], ['g2', guild('g2', [])], ['g3', guild('g3', ['d1'])]]);
  const club = (on) => ({ key: 'main', name: 'Club', autopilot: on ? {} : { off: ['fut'] } });
  const channel = { send: async (m) => { sent.push(m); } };
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [{ auth_user_id: 'u1', discord_user_id: 'd1' }], error: null }) }) }) }) };
  const fc = createFutClub({
    supabase,
    callFunction: async (_fn, body) => ({ data: { data: body.job === 'club-pulls' ? { deliveries: [{ user_id: 'u1', text: 'pulled **Star** **91**' }, { user_id: 'nobody', text: 'x' }] } : {} } }),
    autopilot: { isOn: (c, k) => !(c.autopilot?.off || []).includes(k), postChannel: async () => channel },
    events: { getClient: () => ({ guilds: { cache: guilds } }), onTick: () => {}, serverPrefs: async () => ({}) },
    getGuildState: async (gid) => ({ clubs: [gid === 'g3' ? club(false) : club(true)] }),
  });
  const r = await fc.postPulls();
  assert.strictEqual(r.posted, 1, 'only g1: g2 lacks the member, g3 has FUT off');
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].embeds[0].data.description, /^<@d1> pulled \*\*Star\*\* \*\*91\*\*$/);
  assert.deepStrictEqual(sent[0].allowedMentions, { parse: [] });
});

test('draft night: post has the code, a website link and a Results button; results list members by score', async () => {
  process.env.FUT_ENABLED = 'true';
  const guild = { id: 'g1', members: { fetch: async () => new Map([['d1', {}], ['d2', {}]]), cache: new Map() } };
  const fc = createFutClub({
    supabase: { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [{ auth_user_id: 'u1', discord_user_id: 'd1' }, { auth_user_id: 'u2', discord_user_id: 'd2' }], error: null }) }) }) }) },
    callFunction: async (_fn, body) => ({ data: { data: body.job === 'draft-board' ? { rows: [{ user_id: 'u2', score: 120, rating: 87, chemistry: 33, formation: '4-3-3' }, { user_id: 'u1', score: 110, rating: 84, chemistry: 26, formation: '4-4-2' }] } : {} } }),
    autopilot: { isOn: () => true }, events: { getClient: () => null, onTick: () => {}, serverPrefs: async () => ({}) }, getGuildState: async () => ({ clubs: [] }), dashboardUrl: 'https://example.test',
  });
  const post = fc.draftNightPost({ name: 'Club' }, 'abc234');
  const buttons = post.components[0].toJSON().components;
  assert.strictEqual(buttons[0].url, 'https://example.test/fut/draft?seed=abc234');
  assert.strictEqual(buttons[1].custom_id, 'fd_res:abc234');
  const res = await fc.draftResults(guild, 'abc234');
  assert.match(res.embeds[0].data.description, /^🥇 <@d2> · \*\*120\*\*.*\n🥈 <@d1> · \*\*110\*\*/);
});
