// Matchday Picks scoring and the Player of the Night vote, and rivalries' head-to-head lines, from plain match objects.
const test = require('node:test');
const assert = require('node:assert');

const player = (name, extra = {}) => ({ ea_username: name, position: 'forward', goals: 0, assists: 0, rating: 7, seconds_played: 5400, ...extra });
let seq = 0;
const at = (h) => new Date(Date.UTC(2026, 10, 10, 1) + h * 3600000);
function game(result, sf, sa, players, { h = 0, opponent = 'Rivals FC' } = {}) {
  seq += 1;
  return { id: `g${seq}`, result, scoreFor: sf, scoreAgainst: sa, opponent, playedAt: at(h), players };
}

test('the night decides the verdict, top scorers (ties count) and each line', () => {
  const { outcomeOf } = require('./matchday-picks.cjs');
  const night = [
    game('win', 3, 1, [player('Ace', { goals: 2, rating: 8.5 }), player('Mate', { goals: 1, assists: 2 })]),
    game('loss', 0, 1, [player('Ace'), player('Mate')], { h: 0.5 }),
    game('win', 2, 0, [player('Ace'), player('Mate', { goals: 1, motm: true, rating: 9 })], { h: 1 }),
  ];
  const o = outcomeOf(night);
  assert.equal(o.verdict, 'win');
  assert.deepEqual([o.wins, o.draws, o.losses], [2, 0, 1]);
  assert.deepEqual(o.topScorers.sort(), ['ace', 'mate']);
  assert.equal(o.players.mate.assists, 2);
  assert.equal(outcomeOf([game('draw', 1, 1, [player('Ace')])]).verdict, 'even');
});

test('picks score the verdict, the scorer and the captain, and late picks score nothing', () => {
  const { outcomeOf, scorePick, POINTS } = require('./matchday-picks.cjs');
  const o = outcomeOf([game('loss', 1, 2, [player('Ace', { goals: 1, assists: 0 }), player('Mate', { assists: 1 })])]);
  const pick = { verdict: 'loss', scorer: 'ace', captain: 'ace', picked_at: at(-1).toISOString() };
  const s = scorePick(pick, o, at(-0.25).toISOString());
  assert.deepEqual(s.breakdown, { verdict: POINTS.verdict, scorer: POINTS.scorer, captain: POINTS.captainGoal });
  assert.equal(s.points, POINTS.verdict + POINTS.scorer + POINTS.captainGoal);
  const late = scorePick({ ...pick, picked_at: at(0).toISOString() }, o, at(-0.25).toISOString());
  assert.equal(late.points, 0);
  assert.ok(late.late);
  assert.equal(scorePick({ verdict: 'win', captain: 'nobody' }, o).points, 0, 'a wrong call and an absent captain score 0');
});

test("the fans' shortlist prefers regulars and the vote breaks ties on rating", () => {
  const { outcomeOf, potnShortlist, potnWinner } = require('./matchday-picks.cjs');
  const o = outcomeOf([
    game('win', 2, 0, [player('Ace', { rating: 8 }), player('Mate', { rating: 7.5 }), player('Cameo', { rating: 9.9 })]),
    game('win', 1, 0, [player('Ace', { rating: 8 }), player('Mate', { rating: 7.5 })], { h: 0.5 }),
  ]);
  const list = potnShortlist(o);
  assert.deepEqual(list.map((x) => x.key), ['ace', 'mate'], 'one-game cameos sit out when regulars exist');
  assert.equal(potnWinner(list, [{ choice: 'mate' }, { choice: 'ace' }]).winner, 'ace');
  assert.equal(potnWinner(list, [{ choice: 'mate' }, { choice: 'mate' }, { choice: 'ace' }]).winner, 'mate');
  assert.equal(potnWinner(list, [{ choice: 'stranger' }]).winner, null);
});

test('the season table and the EA season key', () => {
  const { seasonTable, seasonKeyFor } = require('./matchday-picks.cjs');
  const table = seasonTable([
    { discord_user_id: 'a', points: 4 },
    { discord_user_id: 'b', points: 9 },
    { discord_user_id: 'a', points: 6 },
  ]);
  assert.deepEqual(table.map((r) => [r.discord_user_id, r.points, r.rounds]), [['a', 10, 2], ['b', 9, 1]]);
  const seasons = [{ code: 's1', label: 'Season 1', starts_at: '2026-09-01T00:00:00Z' }, { code: 's2', label: 'Season 2', starts_at: '2026-11-01T00:00:00Z' }, { code: 's3', starts_at: '2027-01-01T00:00:00Z' }];
  assert.equal(seasonKeyFor(seasons, new Date('2026-11-10T00:00:00Z')).key, 's2');
  assert.equal(seasonKeyFor([], new Date('2026-11-10T00:00:00Z')).key, '2026-11');
});

test('rivals need three meetings and carry form, streaks and the biggest win', () => {
  const { rivalryTable, rivalsEmbed } = require('./rivalries.cjs');
  const games = [
    game('loss', 0, 2, [], { h: 0 }),
    game('win', 4, 0, [], { h: 1 }),
    game('win', 2, 1, [], { h: 2 }),
    game('win', 1, 0, [], { h: 3, opponent: 'Strangers' }),
    game('draw', 1, 1, [], { h: 4, opponent: 'Unknown' }),
  ];
  const table = rivalryTable(games);
  assert.equal(table.length, 1);
  const r = table[0];
  assert.deepEqual([r.opponent, r.games, r.wins, r.losses, r.gf, r.ga, r.form, r.level], ['Rivals FC', 3, 2, 1, 6, 3, 'LWW', 'rival']);
  assert.deepEqual(r.streak, { result: 'win', count: 2 });
  assert.equal(r.biggestWin.score, '4-0');
  const json = rivalsEmbed({ name: 'Calcio Roma' }, table).toJSON();
  assert.ok(json.fields.some((f) => f.name.includes('Favourite')));
});

test('a game against a rival gets one head-to-head line, with the story that fits', () => {
  const { rivalMoment } = require('./rivalries.cjs');
  const g1 = game('loss', 0, 1, [], { h: 0, opponent: 'Bogey FC' });
  const g2 = game('loss', 1, 2, [], { h: 1, opponent: 'Bogey FC' });
  assert.equal(rivalMoment(g2, [g1, g2]), null, 'two meetings is not a rivalry yet');
  const g3 = game('loss', 0, 3, [], { h: 2, opponent: 'Bogey FC' });
  assert.match(rivalMoment(g3, [g1, g2, g3]), /officially rivals/);
  const g4 = game('win', 2, 1, [], { h: 3, opponent: 'Bogey FC' });
  assert.match(rivalMoment(g4, [g1, g2, g3, g4]), /First ever win over \*\*Bogey FC\*\*/);
  const g5 = game('loss', 0, 1, [], { h: 4, opponent: 'Bogey FC' });
  const g6 = game('loss', 0, 1, [], { h: 5, opponent: 'Bogey FC' });
  const g7 = game('loss', 0, 1, [], { h: 6, opponent: 'Bogey FC' });
  const g8 = game('win', 1, 0, [], { h: 7, opponent: 'Bogey FC' });
  assert.match(rivalMoment(g8, [g1, g2, g3, g4, g5, g6, g7, g8]), /Hoodoo broken/);
  const h = [game('win', 1, 0, [], { h: 0, opponent: 'Even FC' }), game('win', 1, 0, [], { h: 1, opponent: 'Even FC' }), game('loss', 0, 1, [], { h: 2, opponent: 'Even FC' })];
  const level = game('loss', 0, 1, [], { h: 3, opponent: 'Even FC' });
  assert.match(rivalMoment(level, [...h, level]), /All square/);
  assert.equal(rivalMoment(game('win', 1, 0, [], { opponent: 'Unknown' }), []), null);
});

test('the website lists the same belts and the picks verdicts', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const web = fs.readFileSync(path.join(__dirname, '../../src/components/clublife/ClubLifeCabinet.tsx'), 'utf8');
  const { VERDICTS } = require('./matchday-picks.cjs');
  for (const k of Object.keys(VERDICTS)) assert.ok(web.includes(`${k}:`), `verdict ${k} missing on the website`);
});
