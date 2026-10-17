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

test('match report is a short piece about this one game, with the real numbers', () => {
  const { embeds, allowedMentions } = buildMatchReport({ club, match });
  const e = embeds[0].toJSON();
  assert.deepEqual(allowedMentions, { parse: [] });
  assert.match(e.author.name, /THE CALCIO ROMA CHRONICLE · 🏁 FULL-TIME EXTRA/);
  assert.equal(e.color, 0xe8d9b5);
  assert.match(e.title, /RIVALS FC/);
  assert.match(e.description, /Calcio Roma .*3-1/);
  assert.match(e.description, /\*\*Maestro\*\*.*a goal and 2 assists \(8\.1\)/);
  // Short: one paragraph under the dateline, one compact field
  const prose = e.description.split('\n\n')[1];
  assert.ok(prose.length < 650, prose);
  assert.equal(e.fields.length, 1);
  const box = e.fields[0].value;
  assert.match(box, /\*\*W 3-1\*\* vs Rivals FC/);
  assert.match(box, /⚽ Striker9 ×2, Maestro  🎯 Maestro ×2/);
  assert.match(box, /📊 Striker9 8\.6⭐ · Maestro 8\.1 · Wall 7\.2 · Gloves 6\.9/);
});

test('AI copy replaces the template lede but the box score stays factual', () => {
  const e = buildMatchReport({ club, match, story: 'A written story.' }).embeds[0].toJSON();
  assert.match(e.description, /A written story\.$/);
  assert.match(e.fields[0].value, /W 3-1/);
});

test('match reports never bring in other games, form or the season', () => {
  const older = [1, 2, 3, 4, 5, 6].map((h) => game(`o${h}`, h * 24, 'loss', 0, 2));
  const e = buildMatchReport({ club, match, seasonMatches: [match, ...older] }).embeds[0].toJSON();
  const text = JSON.stringify(e);
  assert.ok(!/STORYLINE|ANGLE|Form|Revenge|Rematch|record|streak|THREE STARS/i.test(text.replace(/the run and the storyline are in/i, '')), text);
  const { storyFacts } = require('./chronicle.cjs');
  const facts = storyFacts({ club, matches: [match], seasonMatches: [match, ...older], single: true });
  assert.ok(!/Recent run|Season context|Revenge|Rematch/.test(facts), facts);
  assert.match(facts, /WIN 3-1 vs Rivals FC/);
});

test('postgame copy varies from game to game', () => {
  const { matchLede } = require('./chronicle.cjs');
  const ledes = new Set();
  for (let i = 0; i < 12; i++) ledes.add(matchLede('Calcio Roma', { ...match, id: `v${i}` }, i).split('.')[0]);
  assert.ok(ledes.size >= 4, [...ledes].join(' | '));
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

test('opponent names get a cheeky line only when a word in them gives one', () => {
  const { nameJoke } = require('./chronicle.cjs');
  assert.match(nameJoke('Hard Knocks FC', 'win'), /came in hard and finished early/);
  assert.match(nameJoke('Big Balls FC', 'loss'), /bigger balls/);
  assert.equal(nameJoke('Eagles XI', 'loss'), null); // no losing line, so no joke
  assert.match(nameJoke('Hard Knocks FC', 'win', 'other-seed'), /Hard Knocks FC (came in hard|talked hard)/);
  assert.equal(nameJoke('Rivals FC', 'win'), null);
  assert.equal(nameJoke('Unknown', 'win'), null);
});

test('match reports read Italian: kicker over the headline, a gag and a sign-off', () => {
  const m = game('w1', 0, 'win', 5, 0, 'Wolves Town', []);
  const e = buildMatchReport({ club, match: m }).embeds[0].toJSON();
  assert.match(e.title, /^(MAMMA MIA!|CHE SPETTACOLO!) /);
  assert.match(e.description, /Wolves Town (turned up as lapdogs|howled at kick-off)/);
  assert.match(e.description, /\*[^*]*Calcio Roma[^*]*\*$/);
});

test('stat puns fit the numbers they joke about', () => {
  const { statPun } = require('./press-copy.cjs');
  const hat = game('h', 0, 'win', 3, 0, 'X', [player('Ace', 'ST', { goals: 3 })]);
  assert.match(statPun(hat, 'h'), /\*\*Ace\*\*.*(hat|three)/i);
  assert.equal(statPun(game('q', 0, 'draw', 0, 0, 'X', [player('Quiet', 'CM')]), 'q'), null);
});

test('editions cover the run of games and the storyline, and carry the front page when given', () => {
  const { buildChronicle, editionCover } = require('./chronicle.cjs');
  const now = new Date(Date.UTC(2026, 9, 10, 5));
  const season = [match, ...[1, 2, 3].map((h) => game(`r${h}`, h * 24, 'loss', 0, 1, 'Wolves Town'))];
  const cover = editionCover({ club, edition: 'overnight', matches: [match], seasonMatches: season, now });
  assert.equal(cover.record, '1-0-3');
  assert.equal(cover.run[0].id, 'm1');
  assert.equal(cover.coverStars[0].name, 'Striker9');
  const msg = buildChronicle({ club, edition: 'overnight', matches: [match], seasonMatches: season, now, image: Buffer.from('png') });
  const e = msg.embeds[0].toJSON();
  const run = e.fields.find((f) => f.name.startsWith('🏃 THE RUN'));
  assert.equal(run.name, '🏃 THE RUN · 1-0-3 in the last 4');
  assert.match(run.value, /^🟢 W 3-1 Rivals FC\n🔴 L 0-1 Wolves Town/);
  assert.ok(e.fields.some((f) => f.name.includes('STORYLINE')));
  assert.equal(e.image.url, 'attachment://chronicle.png');
  assert.equal(msg.files[0].name, 'chronicle.png');
  // Quiet day: the cover still features the run's best performers
  const quiet = editionCover({ club, edition: 'afternoon', matches: [], seasonMatches: season, now });
  assert.equal(quiet.stars.length, 0);
  assert.ok(quiet.coverStars.length > 0);
});

test('postgame copy keeps Italian lines to the Italian voice', () => {
  const { matchLede } = require('./chronicle.cjs');
  const { identityOf } = require('./club-identity.cjs');
  const plain = identityOf({ name: 'X', identity: { voice: 'plain' } });
  const british = identityOf({ name: 'X', identity: { voice: 'british', name_jokes: false } });
  const scripts = [game('a', 0, 'win', 5, 0, 'Wolves Town'), game('b', 0, 'loss', 1, 2, 'Rivals FC'), game('c', 0, 'win', 1, 0, 'Rivals FC'), game('d', 0, 'loss', 0, 4, 'Rivals FC'), match];
  for (let i = 0; i < 40; i++) {
    const m = { ...scripts[i % scripts.length], id: `p${i}` };
    assert.doesNotMatch(matchLede('Calcio Roma', m, i, plain), /mamma|catenaccio|espresso|cannoli|lasagne|tifosi|forza|nonna|pasta/i);
    assert.doesNotMatch(matchLede('Calcio Roma', m, i, british), /lapdogs|howled/);
  }
});

test('a voice session prints its own edition, and the midnight paper skips games it covered', async () => {
  const { createAutopilot } = require('./autopilot.cjs');
  const db = { from: () => { const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }) }; return q; } };
  const early = game('e1', 3, 'loss', 0, 2, 'Wolves Town');
  const session = [game('s1', 1, 'win', 2, 0), game('s2', 0.5, 'draw', 1, 1)];
  const ap = createAutopilot({
    supabase: db,
    events: { getClient: () => null, serverPrefs: async () => ({}), onTick: () => {}, onClose: () => {} },
    loadMatches: async () => [early, ...session],
  });
  const at = new Date(Date.UTC(2026, 9, 10, 2));
  const paper = await ap.buildEdition('g1', club, 'session', at, session);
  const e = paper.embeds[0].toJSON();
  assert.match(e.author.name, /SESSION EDITION/);
  assert.match(e.footer.text, /voice channel emptied/);
  const covered = { ...club, autopilot: { chronicle_covered_ids: ['s1', 's2'] } };
  const midnight = await ap.buildEdition('g1', covered, 'overnight', new Date(at.getTime() + 3600000));
  const box = midnight.embeds[0].toJSON().fields.find((f) => f.name.includes('BOX SCORES'));
  assert.ok(box && !/Rivals FC/.test(box.value) && /Wolves Town/.test(box.value), 'only the game before the session is printed again');
  const allCovered = { ...club, autopilot: { chronicle_covered_ids: ['e1', 's1', 's2'] } };
  assert.equal(await ap.buildEdition('g1', allCovered, 'overnight', new Date(at.getTime() + 3600000)), null);
});
