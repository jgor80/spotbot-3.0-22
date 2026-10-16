const test = require('node:test');
const assert = require('node:assert/strict');
const { stillInGuild, recentGames, activePool, pickGroup, ACTIVE_POOL } = require('./art-players.cjs');

const guild = (members) => ({ members: { fetch: async (id) => { if (!members.includes(id)) throw new Error('Unknown Member'); return { id }; } } });

function fakeDb(tables) {
  return { from(table) {
    const q = { select: () => q, in: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => q,
      then: (resolve) => Promise.resolve({ data: tables[table] || [] }).then(resolve) };
    return q;
  } };
}

test('players who have left the server are never pictured', async () => {
  assert.deepEqual(await stillInGuild(guild(['1', '3']), ['1', '2', '3']), ['1', '3']);
  assert.deepEqual(await stillInGuild(guild([]), ['1']), []);
});

test('games played in recent club matches rank the group pool, capped to the most active', async () => {
  const db = fakeDb({
    profiles: [{ discord_user_id: 'a', ea_username: 'Alpha' }, { discord_user_id: 'b', ea_username: 'bravo' }, { discord_user_id: 'c', ea_username: 'Charlie' }],
    club_matches: [
      { player_stats: [{ ea_username: 'alpha' }, { ea_username: 'Bravo' }] },
      { player_stats: [{ ea_username: 'Bravo' }] },
      { player_stats: [{ ea_username: 'BRAVO' }, { ea_username: 'Stranger' }] },
    ],
  });
  const games = await recentGames(db, 'g', { key: 'club' }, ['a', 'b', 'c']);
  assert.deepEqual([...games], [['a', 1], ['b', 3], ['c', 0]]);
  // Charlie has not played recently, so is left out while others have
  assert.deepEqual(activePool(['a', 'b', 'c'], games), ['b', 'a']);
  const many = Array.from({ length: 12 }, (_, i) => `p${i}`);
  assert.equal(activePool(many, new Map(many.map((id, i) => [id, i + 1]))).length, ACTIVE_POOL);
  // Off-season: nobody has played, so the eligible roster is used
  assert.deepEqual(activePool(['a', 'c'], new Map()), ['a', 'c']);
});

test('group picks hold at most five and keep an active lead in front', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const group = pickGroup(pool, 'f');
  assert.equal(group.length, 5);
  assert.equal(group[0], 'f');
  assert.ok(!pickGroup(['a', 'b'], 'gone').includes('gone'));
});
