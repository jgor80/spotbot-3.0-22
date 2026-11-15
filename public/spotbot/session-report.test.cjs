// Match model and session report: src/lib/matchPerformance.ts (bundled in club-insights.cjs) and the
// Discord embed in session-report.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toInsightMatches, matchPerformance, summarisePerformance, sessionReport, groupSessions, expectedPoints, outcomeOdds,
  verdictFor, quantileScore, grade, pointsVerdict, sideTotals, GOAL_MODEL,
} = require('./club-insights.cjs');
const { sessionReportEmbed, reportFor, createSessionReport } = require('./session-report.cjs');

const agg = (counts) => Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(',');

// Our forward: 5 on target in the box (13), 1 outside (18), passes 215/216, possession lost 106, tackles 0
const fwd = { 217: 6, 13: 5, 18: 1, 214: 2, 215: 20, 216: 5, 106: 3, 0: 1, 6: 1 };
const mid = { 215: 40, 216: 6, 106: 2, 0: 4, 6: 2, 115: 1 };
const theirFwd = { 217: 1, 13: 1, 215: 15, 216: 8, 106: 6 };

// Game i: nights of three games 20 minutes apart, one night per day
function row(i, { result = 'win', sf = 2, sa = 0, ours = [['Striker', 'forward', 8.1, fwd], ['Mid', 'midfielder', 7.2, mid]], theirs = [['Them', 'forward', 6.2, theirFwd]] } = {}) {
  const ts = Math.floor((Date.UTC(2026, 10, 1, 19) + Math.floor(i / 3) * 86400000 + (i % 3) * 20 * 60000) / 1000);
  const side = (list) => Object.fromEntries(list.map(([name, pos, rating, counts], j) => [`p${j}`, { playername: name, pos, rating, goals: counts[214] || 0, match_event_aggregate_0: agg(counts) }]));
  return {
    id: `m${i}`,
    result,
    score_for: sf,
    score_against: sa,
    match_type: 'leagueMatch',
    created_at: new Date(ts * 1000).toISOString(),
    opponent_club_name: `Opp ${i}`,
    match_data: { timestamp: ts, players: { 1: side(ours), 2: side(theirs) } },
    player_stats: ours.map(([name, pos, rating, counts]) => ({ ea_username: name, position: pos, rating, goals: counts[214] || 0, assists: 0 })),
  };
}

test('modelled goals weight shots on target by inside / outside the box', () => {
  const s = sideTotals(toInsightMatches([row(0)])[0].players);
  assert.ok(Math.abs(s.modelledGoals - (5 * GOAL_MODEL.onTargetInBox + GOAL_MODEL.onTargetOutsideBox)) < 1e-9);
  assert.equal(Math.round(s.passCompletion), Math.round((60 / 71) * 100));
  assert.equal(s.lostPerPlayer, 2.5);
  // No event data: falls back to shots
  const plain = sideTotals([{ ea_username: 'A', shots: 4, rating: 7 }]);
  assert.ok(Math.abs(plain.modelledGoals - 4 * GOAL_MODEL.perShot) < 1e-9);
  assert.equal(plain.lostPerPlayer, null);
});

test('expected points are a proper Poisson split', () => {
  const o = outcomeOdds(1.5, 1.5);
  assert.ok(Math.abs(o.win - o.loss) < 1e-9);
  assert.ok(Math.abs(o.win + o.draw + o.loss - 1) < 1e-9);
  assert.ok(expectedPoints(3, 0.5) > 2.3);
  assert.ok(expectedPoints(0.5, 3) < 0.4);
});

test('verdicts read the result against the modelled goals', () => {
  assert.equal(verdictFor('win', 2.5, 0.8), 'Deserved win');
  assert.equal(verdictFor('win', 0.6, 2.0), 'Smash and grab');
  assert.equal(verdictFor('loss', 2.2, 0.7), 'Hard luck');
  assert.equal(verdictFor('draw', 1.1, 1.0), 'Fair draw');
});

test('quantile scores interpolate and flip for lower-is-better', () => {
  const q = Array.from({ length: 21 }, (_, i) => i);
  assert.equal(quantileScore(q, 10), 50);
  assert.equal(quantileScore(q, 5, false), 75);
  assert.equal(quantileScore(q, -1), 0);
  assert.equal(quantileScore(q, 99), 100);
  assert.equal(quantileScore(q, null), null);
});

test('a dominant match scores high in every area', () => {
  const p = matchPerformance(toInsightMatches([row(0)])[0]);
  assert.equal(p.verdict, 'Deserved win');
  assert.ok(p.fullData);
  for (const v of Object.values(p.areas)) assert.ok(v !== null && v >= 0 && v <= 1000);
  assert.ok(p.areas.attack > 600, `attack ${p.areas.attack}`);
  assert.ok(p.control > 550, `control ${p.control}`);
});

test('sessions split on a 90-minute gap, newest night first', () => {
  const matches = toInsightMatches([0, 1, 2, 3, 4, 5].map((i) => row(i)));
  const nights = groupSessions(matches);
  assert.equal(nights.length, 2);
  assert.deepEqual(nights[0].map((m) => m.id), ['m3', 'm4', 'm5']);
});

test('session report grades the night against the usual', () => {
  const weak = { ours: [['Striker', 'forward', 6.0, { 217: 1, 18: 1, 215: 10, 216: 10, 106: 9 }], ['Mid', 'midfielder', 6.1, { 215: 12, 216: 10, 106: 8 }]], theirs: [['Them', 'forward', 7.9, { 217: 6, 13: 5, 215: 30, 216: 3, 106: 1 }]] };
  const rows = [
    ...[0, 1, 2, 3, 4, 5].map((i) => row(i)),
    row(6, { result: 'loss', sf: 0, sa: 3, ...weak }),
    row(7, { result: 'loss', sf: 0, sa: 2, ...weak }),
    row(8, { result: 'win', sf: 1, sa: 0, ...weak }),
  ];
  const matches = toInsightMatches(rows);
  const nights = groupSessions(matches);
  const report = sessionReport(nights[0], nights.slice(1).flat());
  assert.equal(report.games, 3);
  assert.equal(report.points, 3);
  assert.ok(report.control < report.usualControl);
  assert.ok(['C', 'D', 'F'].includes(report.grade), report.grade);
  assert.ok(report.fixFirst && report.fixFirst.delta < 0);
  assert.ok(report.matches.some((m) => m.verdict === 'Smash and grab'));
  assert.equal(report.players.length, 2);
  assert.ok(report.players.every((p) => p.line && p.usualRating !== null));

  const embed = sessionReportEmbed(report, { name: 'Test FC' }).toJSON();
  assert.match(embed.title, /Front office report · Test FC/);
  assert.match(embed.description, /Grade/);
  assert.ok(embed.fields.some((f) => f.name.startsWith('Team scores')));
  assert.ok(embed.fields.some((f) => f.name === 'Results vs performance'));
  // Same thing through reportFor (latest night)
  assert.equal(reportFor(matches).games, 3);
});

test('summary and points verdict', () => {
  const s = summarisePerformance(toInsightMatches([0, 1, 2].map((i) => row(i))));
  assert.equal(s.games, 3);
  assert.equal(s.points, 9);
  assert.ok(s.strongest);
  assert.match(pointsVerdict(9, 4, 3), /more than the chances deserved/);
  assert.match(pointsVerdict(3, 3.2, 3), /matched/);
  assert.equal(grade(850), 'A+');
  assert.equal(grade(null), '–');
});

test('autopilot hook adds the report only when the feature is on', async () => {
  let hook = null;
  const autopilot = { onSessionEnd: (fn) => (hook = fn), isOn: (club) => !(club.autopilot?.off || []).includes('report') };
  createSessionReport({ autopilot, loadMatches: async () => [], events: { serverPrefs: async () => ({}) } });
  const all = toInsightMatches([0, 1, 2, 3, 4, 5].map((i) => row(i)));
  const night = groupSessions(all)[0];
  const on = await hook({ guildId: 'g', club: { name: 'A', key: 'a' }, matches: night, allMatches: all });
  assert.equal(on.embeds.length, 1);
  const off = await hook({ guildId: 'g', club: { name: 'A', key: 'a', autopilot: { off: ['report'] } }, matches: night, allMatches: all });
  assert.equal(off, null);
});
