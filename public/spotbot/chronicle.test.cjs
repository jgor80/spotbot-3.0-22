const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildMatchReport, reportHeadline } = require('./chronicle.cjs');

const club = { key: 'c1', name: 'Calcio Roma' };
const player = (ea_username, position, extra = {}) => ({ ea_username, position, goals: 0, assists: 0, rating: 7, ...extra });
const game = (id, hoursAgo, result, scoreFor, scoreAgainst, opponent = 'Rivals FC', players) => ({
  id,
  result,
  scoreFor,
  scoreAgainst,
  opponent,
  playedAt: new Date(Date.UTC(2026, 9, 10, 2) - hoursAgo * 3600000),
  players: players || [player('Striker9', 'ST', { goals: scoreFor })],
});

const match = game('m1', 0, 'win', 3, 1, 'Rivals FC', [
  player('Striker9', 'ST', { goals: 2, shots: 5, rating: 8.6, motm: true, passes_made: 10, pass_attempts: 12 }),
  player('Maestro', 'CAM', { goals: 1, assists: 2, shots: 2, rating: 8.1, passes_made: 30, pass_attempts: 34 }),
  player('Wall', 'CB', { rating: 7.2, tackles: 5, tackle_attempts: 7, interceptions: 3 }),
  player('Gloves', 'GK', { rating: 6.9, saves: 4 }),
]);

test('match report uses the Chronicle masthead and real match numbers', () => {
  const { embeds, allowedMentions } = buildMatchReport({ club, match, seasonMatches: [match] });
  const e = embeds[0].toJSON();
  assert.deepEqual(allowedMentions, { parse: [] });
  assert.match(e.author.name, /THE CALCIO ROMA CHRONICLE · 🏁 FULL-TIME EXTRA/);
  assert.equal(e.color, 0xe8d9b5);
  assert.match(e.title, /RIVALS FC/);
  assert.match(e.description, /From the beat desk/);
  assert.match(e.description, /Calcio Roma .*3-1/);
  assert.match(e.description, /\*\*Maestro\*\* led the way with a goal and 2 assists \(8\.1\)/);
  assert.match(e.description, /completed 87% of their passes, won 71% of their tackles and turned 3 of 7 shots into goals/);
  const field = (name) => e.fields.find((f) => f.name.includes(name))?.value;
  assert.match(field('BOX SCORE'), /\*\*W 3-1\*\* vs Rivals FC/);
  assert.match(field('BOX SCORE'), /⚽ Striker9 ×2, Maestro/);
  assert.match(field('BOX SCORE'), /🎯 Maestro ×2/);
  // Ratings best first, with the player's own line
  const ratings = field('RATINGS').split('\n');
  assert.match(ratings[0], /`8.6` \*\*Striker9\*\* \(ST\) · 2G MOTM/);
  assert.match(ratings[3], /Gloves.*4 sv/);
  assert.match(field('THREE STARS'), /⭐ \*\*Striker9\*\*/);
});

test('AI copy replaces the template lede but the box score stays factual', () => {
  const e = buildMatchReport({ club, match, story: 'A written story.' }).embeds[0].toJSON();
  assert.match(e.description, /A written story\.$/);
  assert.ok(!/led the way/.test(e.description));
  assert.match(e.fields[0].value, /W 3-1/);
});

test('without enough history nobody is called a debutant and no storyline is printed', () => {
  const e = buildMatchReport({ club, match, seasonMatches: [] }).embeds[0].toJSON();
  assert.ok(!e.fields.some((f) => /Debut/.test(f.value)));
  assert.ok(!e.fields.some((f) => f.name.includes('STORYLINE')));
});

test('storyline only counts games up to this one', () => {
  const older = [1, 2, 3, 4, 5, 6].map((h) => game(`o${h}`, h * 24, 'loss', 0, 2));
  const later = game('later', -5, 'win', 9, 0);
  const e = buildMatchReport({ club, match, seasonMatches: [later, match, ...older] }).embeds[0].toJSON();
  const story = e.fields.find((f) => f.name.includes('STORYLINE')).value;
  assert.match(story, /Form guide, last 5: 🔴🔴🔴🔴🟢/);
  assert.match(story, /\*\*1-0-6\*\* across 7 matches/);
  assert.match(e.fields.find((f) => f.name.includes('ANGLE')).value, /Revenge: beat Rivals FC after going 0-6/);
});

test('headlines follow the game script', () => {
  assert.match(reportHeadline('Calcio Roma', game('a', 0, 'win', 5, 0, 'Minnows', []), 1), /ROMA (ROUTS MINNOWS 5-0|RUNS RIOT: MINNOWS BURIED 5-0)/);
  assert.equal(reportHeadline('Calcio Roma', game('b', 0, 'draw', 0, 0, 'Wall FC', []), 1), 'CALCIO ROMA AND WALL FC PLAY OUT GOALLESS DRAW');
  assert.match(reportHeadline('Calcio Roma', game('c', 0, 'loss', 1, 2, 'Big FC'), 1), /CALCIO ROMA EDGED 1-2 BY BIG FC|ONE GOAL SHORT/);
  const hat = game('d', 0, 'win', 3, 1, 'Big FC', [player('Ace', 'ST', { goals: 3 })]);
  assert.equal(reportHeadline('Calcio Roma', hat, 1), 'ACE HAT-TRICK SINKS BIG FC 3-1');
});

test('autopilot prints a match report in the Chronicle channel only when one is picked and the job is on', async () => {
  const { createAutopilot } = require('./autopilot.cjs');
  const sent = [];
  const channel = { id: 'news', isTextBased: () => true, send: async (msg) => sent.push(msg) };
  const guild = { channels: { fetch: async (id) => (id === 'news' ? channel : null) } };
  const ap = createAutopilot({
    events: { getClient: () => ({ guilds: { cache: new Map([['g1', guild]]) } }), serverPrefs: async () => ({}), onTick: () => {}, onClose: () => {} },
    loadMatches: async () => [match],
  });
  await ap.postMatchReports('g1', { ...club, autopilot: {} }, [match]);
  assert.equal(sent.length, 0);
  await ap.postMatchReports('g1', { ...club, autopilot: { chronicle_channel_id: 'news', off: ['press'] } }, [match]);
  assert.equal(sent.length, 0);
  await ap.postMatchReports('g1', { ...club, autopilot: { chronicle_channel_id: 'news' } }, [match]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].embeds[0].toJSON().author.name, /FULL-TIME EXTRA/);
});
