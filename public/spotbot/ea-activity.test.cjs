const test = require('node:test');
const assert = require('node:assert/strict');
const { createEaActivity, clubsInSession, QUIET_MS } = require('./ea-activity.cjs');
const { eaSyncBody, JOBS } = require('./scheduler.cjs');

const member = (id, bot = false) => [id, { id, user: { bot } }];
const voice = (id, people) => [id, { id, isVoiceBased: () => true, members: new Map(people) }];
const guildWith = (id, channels) => ({ id, channels: { cache: new Map(channels) } });
const club = (key, extra = {}) => ({ key, ea_club_id: '1', ea_platform: 'common-gen5', monitoring_enabled: true, ...extra });

test('a club is playing when 2+ people are in its linked voice channel', () => {
  const state = { clubs: [club('a'), club('b')], clubVcLinks: { a: 'vc1', b: 'vc2' } };
  const guild = guildWith('g', [voice('vc1', [member('u1'), member('u2')]), voice('vc2', [member('u3'), member('bot', true)])]);
  assert.deepEqual(clubsInSession(guild, state), ['a']);
});

test('a club with no linked voice channel counts any busy voice channel in its server', () => {
  const state = { clubs: [club('a')] };
  assert.deepEqual(clubsInSession(guildWith('g', [voice('vc', [member('u1'), member('u2')])]), state), ['a']);
  assert.deepEqual(clubsInSession(guildWith('g', [voice('vc', [member('u1')])]), state), []);
});

test('held spots and live events count; clubs without EA monitoring never do', () => {
  const state = {
    clubs: [club('a'), club('b'), club('c', { monitoring_enabled: false })],
    clubVcLinks: { a: 'vc1', b: 'vc1', c: 'vc1' },
    boardState: { a: { slots: [{ open: false, takenBy: 'u1' }] }, c: { slots: [{ open: false, takenBy: 'u1' }] } },
  };
  const guild = guildWith('g', [voice('vc1', [])]);
  assert.deepEqual(clubsInSession(guild, state, new Set(['b', 'c'])), ['a', 'b']);
});

test('a club stays active for the quiet period after voice empties', async () => {
  let clock = 1_000_000;
  const people = new Map([member('u1'), member('u2')]);
  const guild = { id: 'g', channels: { cache: new Map([['vc1', { isVoiceBased: () => true, members: people }]]) } };
  const db = { from: () => { const q = { select: () => q, eq: () => q, not: () => q, gte: () => q, lte: () => Promise.resolve({ data: [] }) }; return q; } };
  const activity = createEaActivity({
    client: () => ({ guilds: { cache: new Map([['g', guild]]) } }),
    getGuildState: async () => ({ clubs: [club('a')], clubVcLinks: { a: 'vc1' } }),
    supabase: db,
    now: () => clock,
  });
  await activity.sweep();
  assert.equal(activity.isActive('g', 'a'), true);
  people.clear();
  clock += QUIET_MS - 1000;
  await activity.sweep();
  assert.deepEqual(activity.activeKeys(), ['g:a']);
  clock += 2000;
  assert.equal(activity.isActive('g', 'a'), false);
  assert.deepEqual(activity.activeKeys(), []);
});

test('the 5-minute EA job sends active clubs plus a rotating sweep slice', () => {
  const at = (minute) => new Date(Date.UTC(2026, 9, 17, 20, minute));
  assert.deepEqual(eaSyncBody({ activeClubs: () => ['g:a'], date: at(35) }), { trigger: 'cron', active: ['g:a'], slice: 7, slices: 12 });
  const slices = new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => eaSyncBody({ activeClubs: () => [], date: at(m) }).slice));
  assert.equal(slices.size, 12);
  // Without the bot's activity tracker every club is synced, as before
  assert.deepEqual(eaSyncBody({ date: at(0) }), { trigger: 'cron' });
  assert.ok(!JOBS.some((j) => j.body?.sync_type === 'member_stats'), 'the hourly sweep replaces the twice-daily member stats runs');
});
