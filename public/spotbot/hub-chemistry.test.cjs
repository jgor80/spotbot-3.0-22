const test = require('node:test');
const assert = require('node:assert');
const { createHubChemistry, pairsOf, chemistryScore, addGroup, buildSquad, squadChemistry, chemLabel } = require('./hub-chemistry.cjs');

test('pairs are every two players once, smaller id first', () => {
  assert.deepEqual(pairsOf(['c', 'a', 'b', 'a']), [['a', 'b'], ['a', 'c'], ['b', 'c']]);
  assert.deepEqual(pairsOf(['a']), []);
});

test('chemistry rises with wins together and time together', () => {
  const fresh = chemistryScore({ games: 0, rated_games: 0, wins: 0, minutes: 0 });
  const winners = chemistryScore({ games: 10, rated_games: 10, wins: 8, minutes: 300 });
  const losers = chemistryScore({ games: 10, rated_games: 10, wins: 2, minutes: 300 });
  const friends = chemistryScore({ games: 15, rated_games: 0, wins: 0, minutes: 600 });
  assert.equal(fresh, 33);
  assert.ok(winners > friends && friends > losers, `${winners} ${friends} ${losers}`);
  assert.equal(chemLabel(winners), '🔥');
});

test('groups add games, minutes and results to every pair in them', () => {
  const rows = new Map();
  addGroup(rows, 'g', { ids: ['a', 'b', 'c'], games: 1, result: 'win' });
  addGroup(rows, 'g', { ids: ['a', 'b'], minutes: 5 });
  const ab = rows.get('a:b');
  assert.equal(ab.games, 1);
  assert.equal(ab.rated_games, 1);
  assert.equal(ab.wins, 1);
  assert.equal(ab.minutes, 5);
  assert.equal(rows.get('b:c').minutes, 0);
  assert.equal(rows.size, 3);
});

test('a squad covers every line and prefers the players with the best chemistry', () => {
  const prefs = { me: ['ST'], gk1: ['GK'], gk2: ['GK'], cb1: ['CB'], cb2: ['LB'], cm1: ['CM'], cm2: ['CAM'], st2: ['ST'] };
  const chem = { 'gk2:me': 80, 'gk1:me': 50, 'cb1:me': 70 };
  const chemOf = (a, b) => chem[[a, b].sort().join(':')] ?? null;
  const { squad, missing } = buildSquad('me', Object.keys(prefs), 6, chemOf, (id) => prefs[id]);
  const ids = squad.map((s) => s.id);
  assert.equal(ids[0], 'me');
  assert.equal(ids.length, 6);
  assert.ok(ids.includes('gk2') && !ids.includes('gk1'), 'the keeper you click with');
  assert.ok(!ids.includes('st2'), 'attack is already covered by the captain');
  assert.deepEqual(missing, []);
  assert.equal(squadChemistry(['me', 'gk2', 'cb1'], chemOf), 75);
  assert.equal(squadChemistry(['x', 'y'], chemOf), null);
});

test('a short pool says which lines are still missing', () => {
  const { squad, missing } = buildSquad('me', ['a'], 6, () => null, (id) => (id === 'me' ? ['ST'] : ['CM']));
  assert.equal(squad.length, 2);
  assert.deepEqual(missing, ['1 GK', '2 DEF', '1 MID']);
});

function fakeDb() {
  const rows = new Map();
  const q = () => {
    const filters = [];
    const api = {
      select: () => api,
      eq: (k, v) => (filters.push((r) => r[k] === v), api),
      in: (k, vs) => (filters.push((r) => vs.includes(r[k])), api),
      gte: (k, v) => (filters.push((r) => r[k] >= v), api),
      order: () => api,
      limit: () => api,
      then: (res) => res({ data: [...rows.values()].filter((r) => filters.every((f) => f(r))), error: null }),
      upsert: async (list) => {
        for (const r of list) rows.set(`${r.user_a}:${r.user_b}`, { ...r });
        return { error: null };
      },
    };
    return api;
  };
  return { rows, from: () => q() };
}

test('record saves pairs and the chemistry card ranks partners without pinging', async () => {
  const db = fakeDb();
  const ch = createHubChemistry({ supabase: db, hubOf: async () => ({ on: true }), getUserPrefs: async () => [], client: () => null, socialHub: () => null });
  assert.equal(await ch.record('g', [{ ids: ['a', 'b', 'c'], games: 1, result: 'win' }, { ids: ['a'], minutes: 5 }]), 3);
  assert.equal(await ch.record('g', [{ ids: ['a', 'b'], games: 1, result: 'win' }]), 0);
  assert.equal(db.rows.get('a:b').games, 2);
  const card = await ch.chemistryCard('g', 'a');
  const e = card.embeds[0].toJSON();
  assert.match(e.fields[0].value.split('\n')[0], /<@b>/);
  assert.deepEqual(card.allowedMentions, { parse: [] });
});
