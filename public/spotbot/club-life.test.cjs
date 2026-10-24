// Club Life: badges and careers, the Chronicle's memory and quiet-day features, Wrapped, Awards Night,
// coach goals, card frames, the Fun Zone's voices and the graphics, all from plain match objects.
const test = require('node:test');
const assert = require('node:assert');

const player = (name, extra = {}) => ({ ea_username: name, position: 'forward', goals: 0, assists: 0, rating: 7, seconds_played: 5400, ...extra });
let seq = 0;
function game(result, sf, sa, players, { at = new Date(Date.UTC(2026, 9, 10, 1, 0)), opponent = 'Rivals FC' } = {}) {
  seq += 1;
  return { id: `g${seq}`, result, scoreFor: sf, scoreAgainst: sa, opponent, playedAt: at, players };
}
const hoursAgo = (h, base = Date.UTC(2026, 9, 20, 2)) => new Date(base - h * 3600000);

test('a match unlocks badges once each, with the right tiers', () => {
  const { applyMatch, BADGES } = require('./career.cjs');
  const careers = new Map();
  const have = new Map();
  const first = applyMatch(careers, have, game('win', 4, 0, [player('Striker', { goals: 3 }), player('Keeper', { position: 'goalkeeper', goals: 1, rating: 10 })]), 'UTC');
  const got = (name) => first.filter((e) => e.name === name).map((e) => e.badge).sort();
  assert.deepEqual(got('Striker'), ['first_goal', 'hat_trick']);
  assert.ok(got('Keeper').includes('keeper_goal') && got('Keeper').includes('perfect_ten') && got('Keeper').includes('shut_out'));
  assert.equal(BADGES.keeper_goal.tier, 'legendary');
  // The same feat again earns nothing new
  const again = applyMatch(careers, have, game('win', 3, 1, [player('Striker', { goals: 3 })]), 'UTC');
  assert.ok(!again.some((e) => e.badge === 'hat_trick'));
  assert.equal(careers.get('striker').hat_tricks, 2);
  assert.equal(careers.get('striker').apps, 2);
});

test('super sub, iron curtain, 3 AM games, every line and milestones', () => {
  const { applyMatch } = require('./career.cjs');
  const careers = new Map();
  const have = new Map();
  const all = [];
  const run = (m) => all.push(...applyMatch(careers, have, m, 'America/Chicago'));
  // 3:15 AM Central is 08:15 UTC in October
  run(game('win', 1, 0, [player('Sub', { goals: 1, seconds_played: 1200 }), player('Full', { seconds_played: 5400, position: 'defender' })], { at: new Date(Date.UTC(2026, 9, 10, 8, 15)) }));
  run(game('win', 2, 0, [player('Full', { position: 'defender' })]));
  run(game('draw', 0, 0, [player('Full', { position: 'goalkeeper' })]));
  run(game('loss', 0, 1, [player('Full', { position: 'midfielder' })]));
  run(game('loss', 1, 2, [player('Full', { position: 'forward' })]));
  run(game('loss', 0, 1, [player('Full', { position: 'defender' })]));
  const badges = (n) => all.filter((e) => e.name === n).map((e) => e.badge);
  assert.ok(badges('Sub').includes('super_sub'));
  assert.ok(badges('Sub').includes('night_owl'));
  assert.ok(badges('Full').includes('iron_curtain'));
  assert.ok(badges('Full').includes('utility'));
  assert.equal(careers.get('full').cs_streak, 0, 'a goal conceded resets the clean sheet run');
  // Milestones come from the running totals
  const c = new Map([['ace', { player_name: 'Ace', apps: 49, goals: 10, assists: 0, motm: 0, lines: {} }]]);
  const h = new Map();
  const m50 = applyMatch(c, h, game('win', 1, 0, [player('Ace')]), 'UTC');
  assert.ok(m50.some((e) => e.badge === 'apps50'));
});

test('session and month badges: marathon, last orders, ever present', () => {
  const { sessionBadges, everPresent } = require('./career.cjs');
  const session = Array.from({ length: 10 }, (_, i) => game(i === 9 ? 'win' : 'loss', i === 9 ? 2 : 0, 1, [player('Iron', { goals: i === 9 ? 1 : 0 }), player('Late')], { at: hoursAgo(10 - i * 0.3) }));
  const earned = sessionBadges(session, new Map());
  assert.ok(earned.some((e) => e.name === 'Iron' && e.badge === 'marathon'));
  assert.ok(earned.some((e) => e.name === 'Iron' && e.badge === 'last_orders'));
  assert.ok(!earned.some((e) => e.name === 'Late' && e.badge === 'last_orders'), 'only scorers get Last Orders');
  const nights = [0, 2, 4, 6].map((d) => game('win', 1, 0, [player('Always'), ...(d === 4 ? [] : [player('Mostly')])], { at: hoursAgo(d * 24) }));
  assert.deepEqual(everPresent(nights).map((p) => p.name), ['Always']);
  assert.deepEqual(everPresent(nights.slice(0, 3)), [], 'needs 4+ sessions');
});

test('milestones in reach read naturally', () => {
  const { milestonesInReach } = require('./career.cjs');
  const out = milestonesInReach([{ player_key: 'a', player_name: 'Ace', apps: 98, goals: 49, assists: 0, motm: 9 }]);
  assert.match(out[0].text, /Ace\*\* is 1 goal from 50|Ace\*\* is 1 Man of the Match award from 10/);
  assert.ok(out.every((m) => m.gap > 0));
});

test('the Chronicle leads with a fresh story and skips the one it just led with', () => {
  const { angleList, pickLead, buildChronicle } = require('./chronicle.cjs');
  const { memoryFrom } = require('./press-log.cjs');
  const history = Array.from({ length: 6 }, (_, i) => game('loss', 0, 1, [player('Dry', { goals: i === 5 ? 2 : 0 })], { at: hoursAgo(100 + i), opponent: 'Rivals FC' }));
  const today = [game('win', 5, 0, [player('Dry', { goals: 3 }), player('Mate', { assists: 2 })], { at: hoursAgo(1), opponent: 'Rivals FC' })];
  const season = [...today, ...history];
  const angles = angleList(today, season);
  const lead = pickLead(angles);
  assert.ok(lead && lead.weight >= 7, `lead: ${lead?.key}`);
  const memory = memoryFrom([{ printed_at: hoursAgo(20).toISOString(), lead_key: lead.key, story_keys: [lead.key], phrase_keys: [], headline: 'X' }]);
  assert.notEqual(pickLead(angles, memory)?.key, lead.key, 'the same lead is not printed twice in a row');
  const club = { name: 'Calcio Roma', identity: { voice: 'plain' } };
  const msg = buildChronicle({ club, edition: 'overnight', matches: today, seasonMatches: season, now: hoursAgo(0), memory });
  assert.ok(msg.press.lead_key && msg.press.story_keys.length && msg.press.player_keys.includes('dry'));
  const json = msg.embeds[0].toJSON();
  assert.ok(json.fields.find((f) => f.name.includes('THE ANGLE')).value.startsWith('🔥'));
  assert.ok(json.fields.some((f) => f.name.includes('ANALYSIS')), 'the columnist signs the verdict');
  assert.doesNotMatch(JSON.stringify(json), /espresso|cannoli|Forza/i);
});

test('drought watch is printed, then paid off when the scorer ends it', () => {
  const { angleList } = require('./chronicle.cjs');
  const { memoryFrom } = require('./press-log.cjs');
  const old = Array.from({ length: 5 }, (_, i) => game('win', 2, 0, [player('Nine', { goals: 2 })], { at: hoursAgo(300 + i) }));
  const dry = Array.from({ length: 6 }, (_, i) => game('draw', 0, 0, [player('Nine')], { at: hoursAgo(100 + i) }));
  const today = [game('draw', 0, 0, [player('Nine')], { at: hoursAgo(1) })];
  const watch = angleList(today, [...today, ...dry, ...old]).find((a) => a.key === 'drought:nine');
  assert.ok(watch, 'a proven scorer on a long run gets a drought watch');
  const memory = memoryFrom([{ printed_at: hoursAgo(30).toISOString(), story_keys: ['drought:nine'], phrase_keys: [] }]);
  const scored = [game('win', 1, 0, [player('Nine', { goals: 1 })], { at: hoursAgo(1) })];
  const payoff = angleList(scored, [...scored, ...dry, ...old], memory).find((a) => a.key === 'drought-end:nine');
  assert.ok(payoff && /had been counting/.test(payoff.text) && payoff.weight >= 9);
});

test('a day without games prints a feature, not the storyline again, and rotates', () => {
  const { buildChronicle } = require('./chronicle.cjs');
  const { memoryFrom } = require('./press-log.cjs');
  const club = { name: 'Calcio Roma', identity: { voice: 'british' } };
  const season = Array.from({ length: 8 }, (_, i) => game(i % 2 ? 'win' : 'loss', 3, 1, [player('Ace', { goals: 1 }), player('Bee')], { at: hoursAgo(48 + i * 30), opponent: i % 3 ? 'Rivals FC' : 'Other XI' }));
  const first = buildChronicle({ club, edition: 'overnight', matches: [], seasonMatches: season, now: hoursAgo(0), extras: { belts: [{ label: 'Golden Boot', name: 'Ace', days: 9 }] } });
  const json = first.embeds[0].toJSON();
  assert.ok(!json.fields.some((f) => f.name.includes('STORYLINE')), 'no storyline rerun on a quiet day');
  assert.ok(first.press.lead_key.startsWith('feature:'));
  const memory = memoryFrom([{ printed_at: hoursAgo(24).toISOString(), lead_key: first.press.lead_key, story_keys: first.press.story_keys, phrase_keys: first.press.phrase_keys }]);
  const second = buildChronicle({ club, edition: 'overnight', matches: [], seasonMatches: season, now: hoursAgo(0), memory, extras: { belts: [{ label: 'Golden Boot', name: 'Ace', days: 9 }] } });
  assert.notEqual(second.press.lead_key, first.press.lead_key, 'the next quiet day runs a different feature');
  assert.equal(buildChronicle({ club, edition: 'overnight', matches: [], seasonMatches: [], now: hoursAgo(0) }), null, 'nothing at all to print');
});

test('Overheard prints a real voice-chat quote from this week', () => {
  const { buildChronicle } = require('./chronicle.cjs');
  const club = { name: 'Calcio Roma', identity: { voice: 'american' } };
  const quotes = [{ text: 'I was onside by a mile', who: '123456789012345678', at: new Date().toISOString() }];
  const msg = buildChronicle({ club, edition: 'overnight', matches: [game('win', 2, 1, [player('Ace', { goals: 2 })], { at: new Date() })], seasonMatches: [], now: new Date(), extras: { quotes } });
  const notebook = msg.embeds[0].toJSON().fields.find((f) => f.name.includes('NOTEBOOK'));
  assert.match(notebook.value, /onside by a mile/);
  assert.ok(msg.press.phrase_keys.some((k) => k.startsWith('quote:')), 'a printed quote is remembered');
});

test('Club Wrapped: title, best night, favourite partner and rival', () => {
  const { wrappedFor, wrappedTiles, seasonJustEnded } = require('./wrapped.cjs');
  const games = Array.from({ length: 6 }, (_, i) => game(i < 4 ? 'win' : 'loss', 2, 1, [player('Ace', { goals: 2, rating: 8 }), player('Pal', { assists: 1 }), player('Other')], { at: hoursAgo(i * 0.4 + (i > 2 ? 48 : 0)) }));
  const d = wrappedFor('ace', games);
  assert.equal(d.games, 6);
  assert.equal(d.title.key, 'goals');
  assert.match(d.title.text, /top scorer/);
  assert.ok(d.bestNight && d.partner && d.rival.opponent === 'Rivals FC');
  assert.ok(wrappedTiles(d).length <= 6);
  assert.equal(wrappedFor('ace', games.slice(0, 2)), null, 'needs 3+ games');
  const ended = seasonJustEnded([{ code: 'fc26', label: 'FC 26', starts_at: '2025-09-26' }, { code: 'fc27', label: 'FC 27', starts_at: '2026-09-25' }], new Date('2026-09-28'));
  assert.equal(ended.key, 'fc26');
  assert.equal(seasonJustEnded([{ code: 'fc26', starts_at: '2025-09-26' }, { code: 'fc27', starts_at: '2026-09-25' }], new Date('2026-10-20')), null);
});

test('Awards Night nominations and the count', () => {
  const { nominations, tally } = require('./awards.cjs');
  const start = hoursAgo(30 * 24);
  const end = hoursAgo(0);
  const games = Array.from({ length: 8 }, (_, i) => game('win', 2, 1, [player('Star', { goals: 1, rating: 8.5 }), player('New', { rating: i < 4 ? 6 : 8 }), player('Old', { rating: 7 })], { at: hoursAgo(700 - i * 80) }));
  const careers = [{ player_key: 'new', first_match_at: hoursAgo(600).toISOString() }, { player_key: 'star', first_match_at: hoursAgo(400).toISOString() }, { player_key: 'old', first_match_at: hoursAgo(5000).toISOString() }];
  const clips = [{ url: 'https://discord.com/x/1', name: 'Star', at: hoursAgo(100).toISOString(), goals: 1, line: 'W 2-1' }, { url: 'https://discord.com/x/2', name: 'New', at: hoursAgo(50).toISOString(), goals: 1, line: 'W 2-1' }];
  const cats = nominations(games, { careers, clips, period: { kind: 'month', start, end } });
  const keys = cats.map((c) => c.key);
  assert.deepEqual(keys, ['player', 'breakout', 'goal', 'comeback'].filter((k) => keys.includes(k)));
  assert.ok(keys.includes('player') && keys.includes('breakout') && keys.includes('goal'));
  assert.equal(cats.find((c) => c.key === 'player').nominees[0].name, 'Star');
  const results = tally(cats, [{ category: 'player', choice: 'old' }, { category: 'player', choice: 'old' }, { category: 'player', choice: 'star' }]);
  assert.equal(results.player.winner, 'old');
  assert.equal(results.breakout.winner, null, 'no votes, no winner');
});

test('coach goals target the weakest area for the line and are judged fairly', () => {
  const { chooseGoal, evaluate } = require('./dev-goals.cjs');
  const t = (key, line, pm, pa) => ({ key, name: key, line, games: 4, passesMade: pm, passAttempts: pa, tackles: 5, tackleAttempts: 10, shots: 0, goals: 0, saves: 0, conceded: 0, rated: 4, avgRating: 7 });
  const me = t('me', 'MID', 60, 100);
  const goal = chooseGoal(me, [me, t('a', 'MID', 85, 100), t('b', 'MID', 88, 100)]);
  assert.equal(goal.metric, 'pass_pct');
  assert.equal(goal.target, 64);
  assert.equal(evaluate(goal, { ...me, passesMade: 70 }).status, 'met');
  assert.equal(evaluate(goal, undefined).status, 'no_games');
});

test('card frames, card editions and club life graphics render', () => {
  const { addFrame } = require('./card-layout.cjs');
  const framed = addFrame('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434"><rect/></svg>', { name: 'Hat-trick Hero', tier: 'rare' });
  assert.match(framed, /HAT-TRICK HERO/);
  assert.match(framed, /<\/g><\/svg>$/);
  const GL = require('./graphics-club-life.cjs');
  const G = require('./graphics.cjs');
  const isPng = (b) => Buffer.isBuffer(b) && b.slice(1, 4).toString() === 'PNG';
  assert.ok(isPng(GL.badgeStrip({ entries: [{ playerName: 'Ace', name: 'Hat-trick Hero', glyph: '3G', tier: 'rare', rarity: '2 of 14 players' }], clubName: 'Calcio Roma' })));
  assert.ok(isPng(GL.wrappedCard({ playerName: 'Ace', clubName: 'Calcio Roma', periodLabel: 'October 2026', headline: "You were the club's top scorer", tiles: [{ label: 'Games', value: '12', sub: '8W 4L' }], badges: [{ glyph: '3G', tier: 'rare' }] })));
  assert.ok(isPng(GL.awardsPoster({ clubName: 'Calcio Roma', periodLabel: 'October 2026', winners: [{ category: 'Player of the Month', name: 'Ace', votes: 5, line: '9G' }] })));
  assert.ok(isPng(GL.divisionPoster({ clubName: 'Calcio Roma', kind: 'promoted', from: 4, to: 3 })));
  assert.ok(isPng(G.cardSheet({ cards: [{ name: 'Ace', position: 'ST', overall: 80, stats: [['GLS', 9]], edition: 'potn', editionNote: '8.9' }], title: 'Calcio Roma' })));
  assert.equal(G.tierFor(60, false, 'upgrade'), 'upgrade');
});

test('the Fun Zone talks in the club voice, asks about the real result and rests last night\'s roast', () => {
  const { roastAwards, pressQuestionsFor, pressAnswersFor } = require('./fun-zone.cjs');
  const night = [game('loss', 0, 3, [player('Wasteful', { shots: 6 }), player('Other', { shots: 5 })])];
  const first = roastAwards(night, { name: 'X' });
  assert.equal(first[0].name, 'Wasteful');
  const next = roastAwards(night, { name: 'X' }, ['Wasteful']);
  assert.equal(next[0].name, 'Other', 'last night\'s roast gets a night off');
  const qs = pressQuestionsFor(night[0]);
  assert.ok(qs.some((q) => q.includes('Rivals FC') && q.includes('0-3')));
  const british = JSON.stringify(pressAnswersFor({ name: 'X', identity: { voice: 'british' } }));
  assert.doesNotMatch(british, /pasta|Mondello/);
  assert.match(JSON.stringify(pressAnswersFor({ name: 'X' })), /Mondello/, 'the Italian voice keeps its own');
});

test('matchday programme: head to head from the title and a challenge', () => {
  const { rivalFrom, challengeFor } = require('./matchday-programme.cjs');
  const history = [game('win', 2, 0, [], { opponent: 'Rivals FC' }), game('loss', 0, 1, [], { opponent: 'Rivals FC' }), game('win', 1, 0, [], { opponent: 'Other' })];
  assert.match(rivalFrom('League night vs Rivals FC', history), /2 meetings with \*\*Rivals FC\*\*: 1W 0D 1L/);
  assert.equal(rivalFrom('Training', history), null);
  assert.match(challengeFor([game('loss', 1, 4, []), game('loss', 0, 3, []), game('win', 2, 1, [])]), /concede fewer than 2/);
});

test('the Network Wire ranks SR risers and spots promotions', () => {
  const { wireMovers } = require('./network-wire.cjs');
  const clubs = [{ guildId: 'g1', key: 'c1', name: 'One' }, { guildId: 'g2', key: 'c2', name: 'Two' }];
  const now = Date.parse('2026-10-20T12:00:00Z');
  const history = [
    { guild_id: 'g1', club_key: 'c1', captured_on: '2026-10-14', skill_rating: 900, current_division: 5 },
    { guild_id: 'g1', club_key: 'c1', captured_on: '2026-10-20', skill_rating: 960, current_division: 4 },
    { guild_id: 'g2', club_key: 'c2', captured_on: '2026-10-14', skill_rating: 800, current_division: 3 },
    { guild_id: 'g2', club_key: 'c2', captured_on: '2026-10-20', skill_rating: 790, current_division: 3 },
  ];
  const { risers, moves } = wireMovers(clubs, history, now);
  assert.deepEqual(risers.map((r) => [r.club.name, r.gain]), [['One', 60]]);
  assert.deepEqual(moves.map((m) => [m.club.name, m.up]), [['One', true]]);
});

test('the website badge catalogue matches the bot', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { BADGES } = require('./career.cjs');
  const web = fs.readFileSync(path.join(__dirname, '../../src/lib/clubLife.ts'), 'utf8');
  for (const [key, b] of Object.entries(BADGES)) {
    assert.ok(web.includes(`${key}: { name: "${b.name}", glyph: "${b.glyph}", tier: "${b.tier}"`), `src/lib/clubLife.ts is missing or differs on ${key}`);
  }
  const { BELTS } = require('./stat-roles.cjs');
  for (const key of BELTS) assert.ok(web.includes(`  ${key}: { name:`), `belt ${key} missing on the website`);
});
