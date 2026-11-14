const test = require('node:test');
const assert = require('node:assert');
const { createHubTournament, nextStart, makeTeams, firstRound, nextRound, roundName } = require('./hub-tournament.cjs');

test('kick-off is the next weekday and hour in UTC', () => {
  const fri = new Date('2026-11-13T12:00:00Z');
  assert.equal(nextStart(fri, 6, 19).toISOString(), '2026-11-14T19:00:00.000Z');
  assert.equal(nextStart(new Date('2026-11-14T20:00:00Z'), 6, 19).toISOString(), '2026-11-21T19:00:00.000Z');
});

test('teams are even, capped at 8, with leftovers as subs', () => {
  const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
  const r = makeTeams(ids, 3, (id) => 1000 + Number(id.slice(1)) * 10);
  assert.equal(r.teams.length, 3);
  assert.ok(r.teams.every((t) => t.length === 3));
  assert.equal(r.subs.length, 2);
  assert.equal(makeTeams(['a', 'b', 'c'], 2, () => 1000), null);
});

test('brackets give byes to top seeds and run to a final', () => {
  const r1 = firstRound(3);
  assert.deepEqual(r1.map((m) => [m.a, m.b, m.winner]), [[0, null, 0], [1, 2, null]]);
  r1[1].winner = 2;
  const final = nextRound(r1);
  assert.deepEqual(final, [{ a: 0, b: 2, winner: null }]);
  final[0].winner = 0;
  assert.equal(nextRound(final), null);
  assert.equal(roundName(1), 'Final');
  assert.equal(roundName(2), 'Semi-finals');
});

test('a whole tournament: sign up, draw, report, champions get the role and XP, no pings', async () => {
  let hub = { on: true, feed_channel_id: 'feed' };
  const sent = [];
  const records = [];
  const roleMembers = new Map();
  const role = { id: 'champ', name: '🏆 Hub Champion', members: roleMembers };
  const member = (id) => ({ id, displayName: id.toUpperCase(), roles: { add: async () => roleMembers.set(id, member(id)), remove: async () => roleMembers.delete(id) } });
  const feed = { send: async (m) => (sent.push(m), { id: `msg${sent.length}` }), messages: { fetch: async () => ({ edit: async () => {} }) } };
  const guild = {
    id: 'g',
    roles: { cache: { find: () => role }, create: async () => role },
    members: { me: { permissions: { has: () => true } }, fetch: async (id) => member(id) },
    channels: { fetch: async () => feed },
  };
  const t = createHubTournament({
    supabase: { from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }) },
    hubOf: async () => hub,
    saveHub: async (g, h) => (hub = h),
    xp: () => ({ record: async (g, m) => records.push([...m.keys()]) }),
    client: () => ({ guilds: { cache: new Map([['g', guild]]) } }),
    undoMs: 0,
  });
  await t.tick();
  assert.equal(hub.tournament.state, 'signup');
  const ix = (user, customId) => ({ guildId: 'g', guild, customId, user: { id: user }, member: {}, reply: async () => {}, update: async () => {} });
  for (const id of ['a', 'b', 'c', 'd']) await t.handleInteraction(ix(id, 'ht_join'));
  assert.equal(hub.tournament.players.length, 4);
  hub = { ...hub, tournament: { ...hub.tournament, starts_at: Date.now() - 1, size: 2 } };
  await t.tick();
  assert.equal(hub.tournament.state, 'playing');
  const { teams } = hub.tournament;
  assert.equal(teams.length, 2);
  await t.handleInteraction(ix('zz', 'ht_win:0:0:0'));
  assert.equal(hub.tournament.rounds[0][0].winner, null, 'only captains report');
  await t.handleInteraction(ix(teams[1][0], 'ht_win:0:0:1'));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(hub.tournament.state, 'done');
  assert.deepEqual(hub.tournament.champions, teams[1]);
  assert.deepEqual(records, [teams[1]]);
  assert.deepEqual([...roleMembers.keys()].sort(), [...teams[1]].sort());
  assert.ok(sent.every((m) => m.allowedMentions?.parse?.length === 0));
});
