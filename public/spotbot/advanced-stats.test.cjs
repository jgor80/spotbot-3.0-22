// Deep stats from EA's per-player event counts: src/lib/advancedStats.ts (bundled in club-insights.cjs)
// and the Discord Deep Stats view in club-stats.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toInsightMatches, computeAdvancedPlayers, computeSessionFatigue, computePressing, computePartnerships,
  generateAdvancedInsights, generateInsights, deriveStats, decisionScore, positionalDiscipline, passStyle, roleOf,
} = require('./club-insights.cjs');
const { statsFromCounts } = require('./ea-events.cjs');
const { createClubStats } = require('./club-stats.cjs');

const agg = (counts) => Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(',');

// One club_matches row: our club 1 vs club 2, players as [name, pos, rating, eventCounts]
// Four games a night, 20 minutes apart, one night per day
function matchRow(i, { result = 'win', players }) {
  const ts = Math.floor((Date.UTC(2026, 10, 1, 19) + Math.floor(i / 4) * 86400000 + (i % 4) * 20 * 60000) / 1000);
  const ours = Object.fromEntries(players.map(([name, pos, , counts], j) => [`p${j}`, { playername: name, pos, match_event_aggregate_0: agg(counts) }]));
  return {
    id: `m${i}`,
    result,
    score_for: result === 'win' ? 2 : 0,
    score_against: result === 'win' ? 0 : 2,
    match_type: 'leagueMatch',
    created_at: new Date(ts * 1000).toISOString(),
    opponent_club_name: 'Rivals',
    match_data: { timestamp: ts, players: { 1: ours, 2: { x: { playername: 'Opponent', pos: 'forward', match_event_aggregate_0: '110:9' } } } },
    player_stats: players.map(([name, pos, rating]) => ({ ea_username: name, position: pos, rating })),
  };
}

const defA = { 111: 30, 219: 2, 177: 4, 176: 4, 182: 1, 215: 20, 216: 5, 30: 8, 32: 6, 34: 6, 0: 3, 1: 1, 266: 2, 108: 2 };
const midB = { 111: 15, 219: 6, 177: 1, 176: 3, 182: 4, 212: 2, 215: 30, 216: 10, 30: 18, 32: 6, 34: 6, 110: 1, 106: 2 };
const fwdC = { 111: 10, 219: 3, 177: 2, 176: 2, 182: 2, 217: 3, 218: 1, 13: 2, 18: 1, 14: 1, 214: 1, 131: 1, 110: 2, 265: 2 };

test('decodes the extra research stats', () => {
  const s = statsFromCounts({ 13: 2, 18: 1, 14: 1, 19: 0, 229: 2, 230: 1, 99: 1, 102: 2, 103: 1, 219: 4, 95: 1, 213: 1 });
  assert.equal(s.shotsOnTargetInBox, 2);
  assert.equal(s.shotsOnTargetOutsideBox, 1);
  assert.equal(s.standingTacklesWon, 2);
  assert.equal(s.slidingTacklesWon, 1);
  assert.equal(s.outOfPositionSevere, 3);
  assert.equal(s.yellowCards, 2);
});

test('decision score and positional discipline are shares of EA feedback', () => {
  assert.equal(decisionScore(statsFromCounts({ 177: 3, 176: 3, 182: 2, 212: 2 })), 60);
  assert.equal(positionalDiscipline(statsFromCounts({ 111: 9, 219: 1 })), 90);
  assert.equal(decisionScore(statsFromCounts({})), null);
});

test('pass style uses the FC27 quartile cut-offs', () => {
  assert.equal(passStyle(70), 'Progressive');
  assert.equal(passStyle(50), 'Balanced');
  assert.equal(passStyle(40), 'Recycler');
  assert.equal(passStyle(null), null);
  const d = deriveStats(statsFromCounts(defA), 1);
  assert.equal(Math.round(d.forwardShare), 40); // 8 of 20 completed passes went forward
  assert.equal(d.passStyle, 'Recycler');
  assert.equal(d.tackleSuccess, 75);
});

test('roles map from EA words and position codes', () => {
  assert.equal(roleOf('defender'), 'DEF');
  assert.equal(roleOf('CDM'), 'MID');
  assert.equal(roleOf('ST'), 'FWD');
  assert.equal(roleOf('goalkeeper'), 'GK');
  assert.equal(roleOf(''), null);
});

test('toInsightMatches attaches EA events from our club only', () => {
  const [m] = toInsightMatches([matchRow(0, { players: [['Alpha', 'defender', 7, defA]] })]);
  assert.deepEqual(m.players[0].events[111], 30);
  assert.equal(m.players.length, 1);
});

function season() {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    // Alpha plays midfield in the first 4 games (rated lower), then defence
    const alphaPos = i < 4 ? 'midfielder' : 'defender';
    const alphaRating = i < 4 ? 6.2 : 7.8;
    rows.push(matchRow(i, {
      result: i % 3 === 0 ? 'loss' : 'win',
      players: [['Alpha', alphaPos, alphaRating, defA], ['Bravo', 'midfielder', 7, midB], ['Charlie', 'forward', 7.5, fwdC]],
    }));
  }
  return toInsightMatches(rows);
}

test('advanced players: totals, derived stats and best role', () => {
  const players = computeAdvancedPlayers(season(), 3);
  const alpha = players.find((p) => p.name === 'Alpha');
  assert.equal(alpha.games, 12);
  assert.equal(alpha.totals.inPosition, 360);
  assert.equal(Math.round(alpha.derived.decisionScore), 89); // (4+4) / (4+4+1)
  assert.equal(alpha.bestRole, 'DEF');
  assert.equal(alpha.roles.find((r) => r.role === 'MID').games, 4);
  const bravo = players.find((p) => p.name === 'Bravo');
  assert.equal(bravo.bestRole, null); // only one role
  assert.equal(bravo.derived.outOfPositionPerGame, 6);
});

test('session fatigue buckets games by number in a session', () => {
  const lines = computeSessionFatigue(season());
  assert.deepEqual(lines.map((l) => l.games), [3, 3, 3, 3]); // 3 nights of 4 games
  assert.equal(lines[0].label, 'Game 1');
});

test('pressing splits games into bands by ball wins up front', () => {
  const matches = season().map((m, i) => ({ ...m, players: m.players.map((p) => ({ ...p, events: { ...p.events, 110: i % 3 } })) }));
  const bands = computePressing(matches);
  assert.deepEqual(bands.map((b) => b.band), ['Low', 'Medium', 'High']);
  assert.equal(bands.reduce((t, b) => t + b.games, 0), 12);
  assert.deepEqual(computePressing(matches.slice(0, 5)), []); // too few games
});

test('partnerships compare a pair together vs apart', () => {
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const together = i < 5;
    const players = [['Alpha', 'defender', 7, together ? { 219: 1 } : { 219: 4 }], ['Delta', 'defender', 7, together ? { 219: 1 } : { 219: 4 }]];
    rows.push(matchRow(i, { players: together ? players : [players[i % 2]] }));
  }
  rows.push(matchRow(8, { players: [['Delta', 'defender', 7, { 219: 4 }]] }));
  rows.push(matchRow(9, { players: [['Alpha', 'defender', 7, { 219: 4 }]] }));
  const [pair] = computePartnerships(toInsightMatches(rows), 5);
  assert.deepEqual(pair.names.sort(), ['Alpha', 'Delta']);
  assert.equal(pair.roles, 'DEF + DEF');
  assert.equal(pair.outOfPositionTogether, 2);
  assert.equal(pair.outOfPositionApart, 8);
});

test('advanced insights need event data and land in generateInsights', () => {
  const matches = season();
  const texts = generateAdvancedInsights(matches).map((i) => i.text);
  assert.ok(texts.some((t) => /makes the best calls/.test(t)), texts.join('\n'));
  assert.ok(texts.some((t) => /Bravo gets the most out-of-position warnings/.test(t)), texts.join('\n'));
  assert.ok(texts.some((t) => /Alpha mostly plays defender/.test(t)) === false);
  const all = generateInsights(matches).map((i) => i.text);
  assert.ok(texts.every((t) => all.includes(t)));
  const noEvents = matches.map((m) => ({ ...m, players: m.players.map(({ events, ...p }) => p) }));
  assert.deepEqual(generateAdvancedInsights(noEvents), []);
});

function fakeSupabase(rows) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: async () => ({ data: rows }),
  };
  return { from: () => chain };
}

test('Discord Deep Stats view and player breakdown', async () => {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(matchRow(i, { players: [['Alpha', 'defender', 7.5, defA], ['Bravo', 'midfielder', 7, midB], ['Charlie', 'forward', 7, fwdC]] }));
  const stats = createClubStats({ supabase: fakeSupabase(rows), getGuildState: async () => ({}) });
  const club = { key: 'main', name: 'Test FC' };
  const view = await stats.deepView('g1', club);
  const embed = view.embeds[0].toJSON();
  assert.match(embed.title, /deep stats/);
  assert.ok(embed.fields.find((f) => f.name === 'Best decisions').value.startsWith('Alpha 89%'));
  const menu = view.components[0].toJSON().components[0];
  assert.equal(menu.custom_id, 'statsp:deepsel:main');
  assert.deepEqual(menu.options.map((o) => o.label).sort(), ['Alpha', 'Bravo', 'Charlie']);

  const player = (await stats.deepPlayerView('g1', club, 'charlie')).embeds[0].toJSON();
  assert.match(player.title, /Charlie/);
  assert.match(player.fields.find((f) => f.name === 'Attacking').value, /Weak-foot 6/);

  const empty = await createClubStats({ supabase: fakeSupabase([]), getGuildState: async () => ({}) }).deepView('g1', club);
  assert.match(empty.embeds[0].toJSON().description, /at least 3 synced matches/);
});
