const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cardStats } = require('./card-stats.cjs');
const club = { key: 'club1', ea_club_id: 14047 };
const baseline = { club_key: 'club1', ea_club_id: 14047, baseline_synced: true, games_played: 187, goals: 82, assists: 114, wins: 0, losses: 0, draws: 187, passes_made: 2740, pass_attempts: 0, avg_match_rating: 7.3 };
test('actual EA member totals never become an invented all-draw record or pass percentage', () => {
  const d = cardStats([baseline], club);
  assert.deepEqual(d.stats, [['GAMES', 187], ['GOALS', 82], ['ASSISTS', 114], ['RATING', '7.3']]);
  assert.equal(d.tagline, '');
  assert.equal(d.seasonLabel, 'EA CLUB TOTALS');
});
test('other clubs, old EA baselines and missing data never produce fallback zeros', () => {
  for (const row of [{ ...baseline, club_key: 'other' }, { ...baseline, ea_club_id: 99 }, { ...baseline, games_played: null }]) assert.deepEqual(cardStats([row], club).stats, []);
});
test('tracked record must match appearances and ratios must be valid', () => {
  const row = { ...baseline, baseline_synced: false, games_played: 5, wins: 3, draws: 1, losses: 1, passes_made: 80, pass_attempts: 100 };
  assert.equal(cardStats([row], club).tagline, '3W 1D 1L · tracked matches');
  assert.ok(cardStats([row], club).stats.some(([l, v]) => l === 'PASS' && v === '80%'));
  const bad = cardStats([{ ...row, wins: 9, passes_made: 110, avg_match_rating: 11 }], club);
  assert.equal(bad.tagline, '');
  assert.ok(bad.stats.every(([l]) => !['PASS', 'RATING'].includes(l)));
});
test('keeper cards show saves instead of goals and preserve genuine zero values', () => {
  const d = cardStats([{ ...baseline, baseline_synced: false, primary_position: 'GK', saves: 12, clean_sheets: 0, man_of_match: 1 }], club);
  assert.ok(d.stats.some(([l, v]) => l === 'SAVES' && v === 12));
  assert.ok(d.stats.some(([l, v]) => l === 'CLEAN SH.' && v === 0));
  assert.ok(d.stats.every(([l]) => l !== 'GOALS'));
});