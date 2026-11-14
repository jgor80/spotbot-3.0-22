const test = require('node:test');
const assert = require('node:assert');
const { chemWith, teamFit, rankTeams, rankPlayers, adLine, cleanNote, boardMark } = require('./hub-recruit.cjs');

const chemTable = { 'a:b': 80, 'a:c': 60, 'b:d': 30 };
const chemOf = (x, y) => chemTable[x < y ? `${x}:${y}` : `${y}:${x}`] ?? null;

test('chemWith averages known chemistry and is null with strangers', () => {
  assert.equal(chemWith('a', ['b', 'c'], chemOf), 70);
  assert.equal(chemWith('a', ['a', 'z'], chemOf), null);
});

test('teamFit rewards your line and recruiting teams, and marks full squads down', () => {
  const open = teamFit(['DEF'], { members: [], recruiting: { lines: ['DEF'] } }, 50);
  assert.deepEqual(open, { score: 85, lineMatch: true });
  assert.equal(teamFit(['DEF'], { members: [], recruiting: null }, null).score, 40);
  assert.equal(teamFit([], { members: Array(11).fill('x'), recruiting: null }, 50).score, 30);
});

test('rankTeams puts the best fit first and leaves out your own teams', () => {
  const teams = [
    { key: 'club1', name: 'Mine', members: ['a', 'x'] },
    { key: 'club2', name: 'Strangers', members: ['y'], recruiting: { lines: ['ATT'] } },
    { key: 'club3', name: 'Mates', members: ['b', 'c'] },
  ];
  const ranked = rankTeams('a', ['MID'], teams, chemOf);
  assert.deepEqual(ranked.map((t) => t.key), ['club3', 'club2']);
  assert.equal(ranked[0].chem, 70);
});

test('rankPlayers picks chemistry, then the lines a team needs', () => {
  const prefs = { c: ['CB'], d: ['ST'], e: ['ST'] };
  const out = rankPlayers(['b', 'c', 'd', 'e'], ['a', 'b'], ['ATT'], chemOf, (id) => prefs[id]);
  assert.deepEqual(out.map((p) => p.id), ['e', 'c', 'd']);
  assert.equal(out[0].fits, true);
});

test('ads and board marks read plainly and notes are cleaned', () => {
  assert.equal(adLine({ lines: ['GK', 'ATT'], note: 'Weeknights' }), 'needs Goalkeeper, Attack · "Weeknights"');
  assert.equal(adLine({ lines: [] }), 'recruiting');
  assert.equal(adLine(null), null);
  assert.equal(boardMark({ recruiting: { club2: { lines: ['DEF'] } } }, 'club2'), ' 📣 DEF');
  assert.equal(boardMark({}, 'club2'), '');
  assert.equal(cleanNote(' <@123> **8pm**   UK '), '123 8pm UK');
});
