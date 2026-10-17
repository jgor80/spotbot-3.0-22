const test = require('node:test');
const assert = require('node:assert');
const { summarizeDivision, parseDivision } = require('./club-insights.cjs');
const { buildDivisionEmbed, hubDivisionLine, sparkline } = require('./division-progress.cjs');

const snap = (captured_on, current_division, skill_rating, extra = {}) => ({
  captured_on,
  current_division,
  best_division: 2,
  skill_rating,
  promotions: 3,
  relegations: 1,
  season_points: null,
  season_wins: null,
  season_draws: null,
  season_losses: null,
  season_rank: null,
  alltime_rank: null,
  leaderboard_checked: true,
  ...extra,
});

test('parseDivision reads numbers and text', () => {
  assert.strictEqual(parseDivision('3'), 3);
  assert.strictEqual(parseDivision('Division 4'), 4);
  assert.strictEqual(parseDivision(2), 2);
  assert.strictEqual(parseDivision(''), null);
  assert.strictEqual(parseDivision(null), null);
});

test('summarizeDivision finds moves, SR change and the record since the last move', () => {
  const history = [
    snap('2026-10-01', 5, 900),
    snap('2026-10-05', 5, 950),
    snap('2026-10-08', 4, 1010, { season_rank: 90 }),
    snap('2026-10-12', 4, 1040, { season_rank: 70 }),
  ].reverse(); // the bot reads newest first
  const matches = [
    { result: 'win', playedAt: new Date('2026-10-09T20:00:00Z'), matchType: 'division' },
    { result: 'draw', playedAt: new Date('2026-10-10T20:00:00Z'), matchType: 'leagueMatch' },
    { result: 'loss', playedAt: new Date('2026-10-10T21:00:00Z'), matchType: 'friendly' },
    { result: 'win', playedAt: new Date('2026-10-07T20:00:00Z'), matchType: 'division' },
  ];
  const s = summarizeDivision(history, matches);
  assert.strictEqual(s.division, 4);
  assert.strictEqual(s.skillRating, 1040);
  assert.deepStrictEqual(s.changes, [{ on: '2026-10-08', from: 5, to: 4, kind: 'promoted' }]);
  assert.strictEqual(s.inDivisionSince, '2026-10-08');
  assert.deepStrictEqual(s.sinceRecord, { wins: 1, draws: 1, losses: 0, points: 4, played: 2 });
  assert.strictEqual(s.srChange7d, 1040 - 950);
  assert.strictEqual(s.seasonRank, 70);
  assert.strictEqual(s.seasonRankChange, 20);
  assert.strictEqual(s.trackedSince, '2026-10-01');
  assert.strictEqual(s.trend.length, 4);
});

test('a relegation is recorded as one', () => {
  const s = summarizeDivision([snap('2026-10-01', 3, 1200), snap('2026-10-02', 4, 1100)]);
  assert.strictEqual(s.changes[0].kind, 'relegated');
});

test('hub line and embed render with and without data', () => {
  const s = summarizeDivision([snap('2026-10-01', 5, 900), snap('2026-10-09', 4, 1000, { season_rank: 12 })]);
  assert.match(hubDivisionLine(s), /Division 4 · 1000 SR \(\+100 this week\) · #12 on EA/);
  const embed = buildDivisionEmbed({ name: 'Palermo', ea_club_id: '1' }, s).toJSON();
  assert.ok(embed.fields.some((f) => f.name === 'Division moves'));
  assert.ok(embed.fields.length <= 25);
  const empty = buildDivisionEmbed({ name: 'Palermo', ea_club_id: '1' }, null).toJSON();
  assert.match(empty.description, /No division data yet/);
  assert.strictEqual(hubDivisionLine(null), null);
});

test('unranked clubs say outside the top 100 only once EA answered', () => {
  const checked = buildDivisionEmbed({ name: 'X', ea_club_id: '1' }, summarizeDivision([snap('2026-10-01', 6, 700)])).toJSON();
  assert.ok(checked.fields.some((f) => f.value === 'Outside the top 100'));
  const unchecked = buildDivisionEmbed({ name: 'X', ea_club_id: '1' }, summarizeDivision([snap('2026-10-01', 6, 700, { leaderboard_checked: false })])).toJSON();
  assert.ok(!unchecked.fields.some((f) => f.value === 'Outside the top 100'));
});

test('sparkline needs two points', () => {
  assert.strictEqual(sparkline([5]), null);
  assert.strictEqual(sparkline([1, 8]).length, 2);
});
