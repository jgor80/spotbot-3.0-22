const test = require('node:test');
const assert = require('node:assert');
const { roundRobin, leagueTable, parseGoals, tieWinner } = require('./hub-league.cjs');

test('roundRobin: everyone plays everyone once, nobody twice in a round', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const keys = Array.from({ length: n }, (_, i) => `club${i + 1}`);
    const rounds = roundRobin(keys);
    const seen = new Set();
    for (const games of rounds) {
      const inRound = games.flat();
      assert.equal(new Set(inRound).size, inRound.length);
      for (const [a, b] of games) seen.add([a, b].sort().join('-'));
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
    assert.equal(rounds.flat().length, (n * (n - 1)) / 2);
  }
});

test('leagueTable: 3 points a win, 1 a draw, then goal difference; only confirmed games count', () => {
  const teams = [{ key: 'a', name: 'Alpha' }, { key: 'b', name: 'Bravo' }, { key: 'c', name: 'Charlie' }];
  const m = (h, a, hg, ag, status = 'confirmed') => ({ home_key: h, away_key: a, home_goals: hg, away_goals: ag, status });
  const table = leagueTable(teams, [m('a', 'b', 3, 0), m('b', 'c', 1, 1), m('c', 'a', 2, 1), m('a', 'c', 9, 0, 'reported')]);
  assert.deepEqual(table.map((r) => [r.key, r.pts]), [['c', 4], ['a', 3], ['b', 1]]);
  assert.equal(table[1].gf - table[1].ga, 2);
});

test('parseGoals takes whole numbers 0 to 99 only', () => {
  assert.equal(parseGoals(' 3 '), 3);
  assert.equal(parseGoals('0'), 0);
  assert.equal(parseGoals('-1'), null);
  assert.equal(parseGoals('2.5'), null);
  assert.equal(parseGoals('100'), null);
});

test('tieWinner: the higher score, the home side on a walkover, nobody on a draw', () => {
  assert.equal(tieWinner({ home_key: 'a', away_key: 'b', home_goals: 1, away_goals: 2, status: 'confirmed' }), 'b');
  assert.equal(tieWinner({ home_key: 'a', away_key: 'b', status: 'walkover' }), 'a');
  assert.equal(tieWinner({ home_key: 'a', away_key: 'b', home_goals: 1, away_goals: 1, status: 'confirmed' }), null);
  assert.equal(tieWinner({ home_key: 'a', away_key: 'b', status: 'scheduled' }), null);
});
