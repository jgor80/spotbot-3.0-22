const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHubXp, applyActivity, blankRow, levelFor, xpForLevel, tierFor, weekKeyOf, challengesFor, HUB_BADGES, CHALLENGES, TIERS, XP } = require('./hub-xp.cjs');

const MON = new Date('2026-11-09T12:00:00Z');

test('levels follow the curve and tiers follow the level', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(xpForLevel(2) - 1), 1);
  assert.equal(levelFor(xpForLevel(2)), 2);
  assert.equal(levelFor(xpForLevel(10)), 10);
  assert.equal(tierFor(1).key, 'rookie');
  assert.equal(tierFor(9).key, 'regular');
  assert.equal(tierFor(10).key, 'starter');
  assert.equal(tierFor(40).key, 'legend');
});

test('weeks start on Monday UTC and every week has three different challenges', () => {
  assert.equal(weekKeyOf(new Date('2026-11-15T23:00:00Z')), '2026-11-09');
  assert.equal(weekKeyOf(MON), '2026-11-09');
  for (let i = 0; i < 20; i++) {
    const week = weekKeyOf(new Date(MON.getTime() + i * 7 * 86400000));
    const c = challengesFor(week);
    assert.equal(new Set(c).size, 3);
    for (const k of c) assert.ok(CHALLENGES[k]);
    assert.ok(['games', 'wins'].includes(c[1]));
  }
});

test('a game earns XP, counts mates and lobbies, and starts a streak', () => {
  const { row, gained } = applyActivity(blankRow('g', 'a'), { games: 1, wins: 1, goals: 2, mates: ['b', 'c'], lobby: 'club1' }, { now: MON });
  assert.equal(gained, XP.game + XP.win + 2 * XP.goal);
  assert.equal(row.games, 1);
  assert.deepEqual(row.mates, ['b', 'c']);
  assert.deepEqual(row.lobbies, ['club1']);
  assert.equal(row.streak, 1);
  assert.equal(row.week_key, '2026-11-09');
  assert.equal(row.week_xp, gained);
});

test('day streaks grow on consecutive days and reset after a gap', () => {
  let row = blankRow('g', 'a');
  for (let d = 0; d < 3; d++) row = applyActivity(row, { minutes: 5 }, { now: new Date(MON.getTime() + d * 86400000) }).row;
  assert.equal(row.streak, 3);
  assert.ok(row.badges.includes('streak3'));
  row = applyActivity(row, { minutes: 5 }, { now: new Date(MON.getTime() + 5 * 86400000) }).row;
  assert.equal(row.streak, 1);
  assert.equal(row.best_streak, 3);
});

test('finishing a weekly challenge pays once, and all three pay a bonus and Clean Sweep', () => {
  const week = weekKeyOf(MON);
  const keys = challengesFor(week);
  const big = { games: 10, wins: 10, goals: 10, assists: 10, minutes: 500, mates: Array.from({ length: 12 }, (_, i) => `m${i}`), positions: ['ST', 'CM', 'CB'], lobby: 'club1' };
  let r = applyActivity(blankRow('g', 'a'), big, { now: MON });
  // days and lobbies need more than one burst; finish those with a few more days in another lobby
  for (let d = 1; d < 3; d++) r = applyActivity(r.row, { minutes: 5, lobby: 'club2' }, { now: new Date(MON.getTime() + d * 86400000) });
  assert.deepEqual(new Set(r.row.week.done), new Set(keys));
  assert.ok(r.row.badges.includes('full_week'));
  const again = applyActivity(r.row, { games: 1 }, { now: new Date(MON.getTime() + 3 * 86400000) });
  assert.deepEqual(again.challengesDone, []);
  // A new week starts fresh
  const next = applyActivity(r.row, { games: 1 }, { now: new Date(MON.getTime() + 7 * 86400000) });
  assert.equal(next.row.week_key, '2026-11-16');
  assert.equal(next.row.week.games, 1);
});

test('badges unlock once and pay their tier XP', () => {
  const row = { ...blankRow('g', 'a'), games: 24, xp: 0 };
  const r = applyActivity(row, { games: 1 }, { now: MON });
  assert.deepEqual(r.newBadges, ['regular']);
  assert.equal(applyActivity(r.row, { games: 1 }, { now: MON }).newBadges.length, 0);
  const hop = applyActivity({ ...blankRow('g', 'a'), lobbies: ['club1', 'club2'] }, { minutes: 5, lobby: 'club3' }, { now: MON, lobbyKeys: ['club1', 'club2', 'club3'] });
  assert.ok(hop.newBadges.includes('lobby_hopper'));
});

test('level-ups and tier changes are reported', () => {
  const r = applyActivity({ ...blankRow('g', 'a'), xp: xpForLevel(5) - 10, level: 4 }, { games: 1 }, { now: MON });
  assert.equal(r.levelUp, 5);
  assert.equal(r.tierUp.key, 'regular');
});

test('the website lists the same tiers, badges and challenges', () => {
  const web = fs.readFileSync(path.join(__dirname, '../../src/lib/hubXp.ts'), 'utf8');
  for (const t of TIERS) assert.ok(web.includes(`{ level: ${t.level}, key: "${t.key}", name: "${t.name}", emoji: "${t.emoji}" }`), `tier ${t.key} differs on the website`);
  for (const [k, b] of Object.entries(HUB_BADGES)) assert.ok(web.includes(`${k}: { name: "${b.name}", tier: "${b.tier}", help: "${b.help}" }`), `badge ${k} differs on the website`);
  for (const [k, c] of Object.entries(CHALLENGES)) assert.ok(web.includes(`${k}: { target: ${c.target}, text: "${c.text}" }`), `challenge ${k} differs on the website`);
});

// A fake hub_players table
function fakeDb(rows = []) {
  const table = new Map(rows.map((r) => [r.discord_user_id, r]));
  const q = () => {
    const filters = [];
    const api = {
      select: () => api,
      eq: (k, v) => (filters.push((r) => r[k] === v), api),
      in: (k, vs) => (filters.push((r) => vs.includes(r[k])), api),
      gt: (k, v) => (filters.push((r) => r[k] > v), api),
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: [...table.values()].find((r) => filters.every((f) => f(r))) || null }),
      then: (res) => res({ data: [...table.values()].filter((r) => filters.every((f) => f(r))), error: null }),
      upsert: async (list) => {
        for (const r of list) table.set(r.discord_user_id, r);
        return { error: null };
      },
    };
    return api;
  };
  return { table, from: () => q() };
}

test('record saves rows and posts unlocks in the feed without pings', async () => {
  const db = fakeDb();
  const sent = [];
  const guild = { id: 'g', channels: { fetch: async () => ({ send: async (m) => sent.push(m) }) }, members: { me: { permissions: { has: () => false } } }, roles: { cache: new Map() } };
  const xp = createHubXp({
    supabase: db,
    hubOf: async () => ({ on: true, lobbies: ['club1'], feed_channel_id: 'feed' }),
    saveHub: async () => {},
    getGuildState: async () => ({ clubs: [] }),
    client: () => ({ guilds: { cache: new Map([['g', guild]]) } }),
  });
  await xp.onGame('g', { key: 'club1' }, ['a', 'b']);
  assert.equal(db.table.get('a').games, 1);
  assert.deepEqual(db.table.get('a').mates, ['b']);
  await xp.onGame('g', { key: 'club2', ea_club_id: '123' }, ['a']);
  assert.equal(db.table.get('a').games, 1, 'EA-linked clubs count through the EA sync instead');
  db.table.set('a', { ...db.table.get('a'), games: 24 });
  await xp.onGame('g', { key: 'club1' }, ['a']);
  assert.match(sent.at(-1).content, /Drop-in Regular/);
  assert.deepEqual(sent.at(-1).allowedMentions, { parse: [] });
});
