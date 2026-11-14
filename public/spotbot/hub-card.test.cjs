const test = require('node:test');
const assert = require('node:assert');
const { createHubCard, glyphOf, topBadges, usedInvite } = require('./hub-card.cjs');
const { applyActivity, blankRow } = require('./hub-xp.cjs');
const CL = require('./graphics-club-life.cjs');

test('badge glyphs and the rarest badges first', () => {
  assert.equal(glyphOf('Player of the Week'), 'PW');
  assert.equal(glyphOf('Connector'), 'CO');
  assert.deepEqual(topBadges(['regular', 'streak30', 'connector', 'nope']).map((b) => b.key), ['streak30', 'connector', 'regular']);
});

test('the invite whose uses went up is the one they joined with', () => {
  const saved = [{ user_id: 'a', code: 'x', uses: 2 }, { user_id: 'b', code: 'y', uses: 0 }];
  assert.equal(usedInvite(saved, new Map([['x', 2], ['y', 1]])).user_id, 'b');
  assert.equal(usedInvite(saved, new Map([['x', 2], ['y', 0]])), null);
});

test('referrals pay XP and unlock Recruiter, then Talent Scout at five', () => {
  let r = applyActivity(blankRow('g', 'a'), { referrals: 1 }).row;
  assert.equal(r.referrals, 1);
  assert.ok(r.badges.includes('recruiter'));
  for (let i = 0; i < 4; i++) r = applyActivity(r, { referrals: 1 }).row;
  assert.ok(r.badges.includes('talent_scout'));
});

test('the hub card renders as a PNG', () => {
  const png = CL.hubCard({ playerName: 'Pro Nine', serverName: 'The Spot', level: 7, tierName: 'Regular', xp: 2200, into: 100, span: 700, tiles: [{ label: 'Games', value: '40' }], partners: [{ name: 'Keeper', score: 81 }], badges: [{ glyph: 'CO', tier: 'rare' }], invite: 'discord.gg/abc' });
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

function world() {
  const tables = { hub_invites: [{ guild_id: 'g', user_id: 'inviter', code: 'abc', uses: 0 }], hub_referrals: [] };
  const from = (t) => {
    const filters = [];
    let patch = null;
    const api = {
      select: () => api,
      eq: (k, v) => (filters.push((r) => r[k] === v), api),
      in: (k, vs) => (filters.push((r) => vs.includes(r[k])), api),
      is: (k, v) => (filters.push((r) => (r[k] ?? null) === v), api),
      update: (p) => ((patch = p), api),
      upsert: async (row) => {
        if (!tables[t].some((r) => r.guild_id === row.guild_id && r.invitee_id === row.invitee_id)) tables[t].push({ ...row });
        return {};
      },
      then: (res) => {
        const hits = tables[t].filter((r) => filters.every((f) => f(r)));
        if (patch) hits.forEach((r) => Object.assign(r, patch));
        return res({ data: hits, error: null });
      },
    };
    return api;
  };
  const records = [];
  const sent = [];
  const guild = {
    id: 'g',
    members: { me: { permissions: { has: () => true } } },
    invites: { fetch: async () => new Map([['abc', { code: 'abc', uses: 1 }]]) },
    channels: { fetch: async () => ({ send: async (m) => sent.push(m) }) },
  };
  const card = createHubCard({
    supabase: { from },
    hubOf: async () => ({ on: true, feed_channel_id: 'feed' }),
    xp: () => ({ record: async (g, m) => records.push([...m.entries()]) }),
    client: () => ({ guilds: { cache: new Map([['g', guild]]) } }),
  });
  return { card, guild, tables, records, sent };
}

test('a friend who joins with your invite and plays a game rewards you once, without pings', async () => {
  const w = world();
  assert.equal(await w.card.onMemberJoin({ id: 'new', user: {}, guild: w.guild }), 'inviter');
  assert.equal(w.tables.hub_invites[0].uses, 1);
  await w.card.onFirstGame('g', ['new']);
  await w.card.onFirstGame('g', ['new']);
  assert.deepEqual(w.records, [[['inviter', { referrals: 1 }]]]);
  assert.match(w.sent[0].content, /brought <@new>/);
  assert.deepEqual(w.sent[0].allowedMentions, { parse: [] });
});
