// Player scores: src/lib/playerScores.ts (bundled in club-insights.cjs) and the embeds in player-scores.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { toInsightMatches, playerLines, playerScores, scorePlayer, roleScore, powerRankings, clutchRatings, carryScores, defendingSummary } = require('./club-insights.cjs');
const { playerScoresEmbed, digestFields, createPlayerScores } = require('./player-scores.cjs');

const agg = (counts) => Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(',');

// A strong striker, a busy midfielder, a solid defender and a keeper
const STRIKER = { 214: 3, 11: 1, 217: 4, 13: 3, 18: 1, 215: 12, 216: 4, 106: 3, 174: 3, 0: 1, 1: 1, 6: 0, 108: 1 };
const MID = { 11: 1, 115: 1, 215: 45, 216: 5, 106: 2, 174: 2, 0: 3, 1: 1, 6: 2, 108: 4 };
const DEF = { 215: 30, 216: 3, 106: 1, 0: 4, 1: 1, 6: 4, 108: 6 };

// i: game number (newest = highest i); result / margin vary so there are close and comfortable games
function row(i, { result = 'win', sf = 2, sa = 1, players } = {}) {
  const ts = Math.floor((Date.UTC(2026, 10, 1, 19) + i * 3 * 3600000) / 1000);
  const list = players || [
    ['Striker', 'forward', 8.2, STRIKER, { goals: 3, assists: 1 }],
    ['Mid', 'midfielder', 7.4, MID, { goals: 0, assists: 1 }],
    ['Def', 'defender', 7.0, DEF, {}],
    ['Keeper', 'goalkeeper', 6.8, {}, { saves: 4 }],
  ];
  const side = Object.fromEntries(list.map(([name, pos, rating, counts], j) => [`p${j}`, { playername: name, pos, rating, match_event_aggregate_0: agg(counts) }]));
  return {
    id: `m${i}`,
    result,
    score_for: sf,
    score_against: sa,
    match_type: 'leagueMatch',
    created_at: new Date(ts * 1000).toISOString(),
    opponent_club_name: `Opp ${i}`,
    match_data: { timestamp: ts, players: { 1: side, 2: { x: { playername: 'Them', pos: 'forward', rating: 6.5, match_event_aggregate_0: agg({ 217: 2, 13: 2 }) } } } },
    player_stats: list.map(([name, pos, rating, , extra]) => ({ ea_username: name, position: pos, rating, goals: extra.goals || 0, assists: extra.assists || 0, saves: extra.saves || 0, motm: name === 'Striker' })),
  };
}

const season = () => toInsightMatches(Array.from({ length: 12 }, (_, i) => row(i, i % 3 === 0 ? { result: 'win', sf: 4, sa: 0 } : i % 3 === 1 ? { result: 'loss', sf: 1, sa: 2 } : {})));

test('player lines tally per-game stats and main role', () => {
  const lines = playerLines(season());
  const s = lines.find((l) => l.name === 'Striker');
  assert.equal(s.role, 'FWD');
  assert.equal(s.games, 12);
  assert.equal(s.perGame.goalsPerGame, 3);
  assert.equal(s.perGame.shotsOnTargetPerGame, 4);
  assert.equal(s.motm, 12);
  const k = lines.find((l) => l.name === 'Keeper');
  assert.equal(k.role, 'GK');
  assert.equal(k.perGame.savesPerGame, 4);
  assert.ok(Math.abs(k.perGame.cleanSheetRate - (4 / 12) * 100) < 1e-9);
});

test('scores are 0-1000 against the same role, lower-is-better flipped', () => {
  assert.ok(roleScore('FWD', 'goalsPerGame', 2) > 850);
  assert.ok(roleScore('FWD', 'goalsPerGame', 0) < 100);
  assert.ok(roleScore('MID', 'lostPerGame', 0) > roleScore('MID', 'lostPerGame', 20));
  assert.equal(roleScore('MID', 'goalsPerGame', null), null);
});

test('everyone gets an overall score with a tag; the striker leads on attack', () => {
  const scores = playerScores(season(), 3);
  assert.equal(scores.length, 4);
  for (const s of scores) assert.ok(s.overall >= 0 && s.overall <= 1000, `${s.name} ${s.overall}`);
  const striker = scores.find((s) => s.name === 'Striker');
  assert.ok(striker.areas.attack > 800, `attack ${striker.areas.attack}`);
  assert.equal(striker.tag, 'Finisher');
  const keeper = scores.find((s) => s.name === 'Keeper');
  assert.equal(keeper.role, 'GK');
  assert.ok(['Keeper', 'Shot-stopper'].includes(keeper.tag));
  assert.equal(scorePlayer({ ...playerLines(season()).find((l) => l.name === 'Mid'), role: null }), null);
});

test('power rankings compare the last five games with the five before', () => {
  const matches = season();
  // Def plays out of his skin lately: give him the top rating in the last five games
  for (const m of matches.slice(0, 5)) m.players.find((p) => p.ea_username === 'Def').rating = 9.5;
  const ranks = powerRankings(matches);
  assert.equal(ranks[0].name, 'Def');
  assert.ok(ranks[0].move > 0);
});

test('clutch, carry and defending', () => {
  const matches = season();
  const clutch = clutchRatings(matches, 3);
  assert.ok(clutch.length >= 1);
  assert.ok(clutch.every((c) => ['Ice cold', 'Steady', 'Shrinks'].includes(c.label)));
  const carry = carryScores(matches, 3);
  assert.equal(carry[0].name, 'Striker');
  assert.ok(carry.every((c) => c.score >= 0 && c.score <= 1000));
  const d = defendingSummary(matches, 3);
  assert.ok(d.players.some((p) => p.name === 'Def'));
  assert.ok(d.pairs.some((p) => p.names.includes('Def') && p.names.includes('Keeper')));
});

test('discord embed and digest fields', () => {
  const embed = playerScoresEmbed({ name: 'Test FC' }, season()).toJSON();
  assert.match(embed.title, /player scores/);
  assert.match(embed.description, /Striker/);
  assert.ok(embed.fields.some((f) => f.name.startsWith('📈 Power rankings')));
  assert.equal(digestFields(season()).length, 1);
  assert.deepEqual(digestFields([]), []);
  const empty = playerScoresEmbed({ name: 'Test FC' }, []).toJSON();
  assert.match(empty.description, /Needs players/);
  let hook = null;
  createPlayerScores({ autopilot: { onDigest: (fn) => (hook = fn) }, loadMatches: async () => season() });
  return hook('g', { key: 'a' }).then((fields) => assert.equal(fields.length, 1));
});
