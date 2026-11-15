// Dressing room banter: src/lib/banter.ts (bundled in club-insights.cjs) and the embeds in dressing-room.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { toInsightMatches, banterWindow, banterRankings, superlatives, betterWithout, betterTogether, whoGetsTheShirt, headToHead } = require('./club-insights.cjs');
const { rankingsEmbed, superlativesEmbed, receiptEmbed, playerPicker, dressingRoomButtons, createDressingRoom } = require('./dressing-room.cjs');

const agg = (counts) => Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(',');

// 215 passes completed, 216 failed, 13 shots on target in the box, 217 shots, 106 tackles won, 0 interceptions
const BUSY = { 215: 30, 216: 4, 217: 3, 13: 1, 106: 3, 0: 2 };
const QUIET = { 215: 6, 216: 2, 106: 0 };

// Hog scores every goal and never assists; Ghost barely touches it; the squad loses when Jonah plays.
// Night 1 (games 0-3, newest) is close games; older games include blowouts where Hog pads his numbers.
function game(i, { jonah, blowout }) {
  // Four games a night, game 0 newest
  const ts = Math.floor((Date.UTC(2026, 10, 20, 19) - Math.floor(i / 4) * 2 * 86400000 + (3 - (i % 4)) * 30 * 60000) / 1000);
  const sf = blowout ? 5 : jonah ? 0 : 2;
  const sa = jonah ? 2 : blowout ? 0 : 1;
  const result = sf > sa ? 'win' : sf < sa ? 'loss' : 'draw';
  const list = [
    ['Hog', 'forward', 8.4, BUSY, { goals: sf }],
    ['Ghost', 'forward', 6.2, QUIET, {}],
    ['Mid', 'midfielder', 7.1, BUSY, { assists: 1 }],
    ['Def', 'defender', 7.0, BUSY, {}],
    jonah ? ['Jonah', 'defender', 7.6, BUSY, {}] : ['Sub', 'defender', 6.9, BUSY, {}],
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
    match_data: { timestamp: ts, players: { 1: side } },
    player_stats: list.map(([name, pos, rating, , extra]) => ({ ea_username: name, position: pos, rating, goals: extra.goals || 0, assists: extra.assists || 0, motm: name === 'Hog' })),
  };
}

const season = () => toInsightMatches(Array.from({ length: 16 }, (_, i) => game(i, { jonah: i % 4 === 1, blowout: i >= 4 && i % 2 === 0 })));

test('windows: tonight is the latest night, all is everything', () => {
  const ms = season();
  assert.equal(banterWindow(ms, 'all').length, 16);
  assert.equal(banterWindow(ms, 'session').length, 4);
  assert.ok(banterWindow(ms, 'week').length >= 4);
});

test('rankings name the right culprits with their numbers', () => {
  const rankings = banterRankings(season(), 3);
  const by = Object.fromEntries(rankings.map((r) => [r.key, r]));
  assert.equal(by.mainCharacter.entries[0].name, 'Hog');
  assert.match(by.mainCharacter.entries[0].line, /100% of the goals/);
  assert.equal(by.invisible.entries[0].name, 'Ghost');
  assert.equal(by.lossMagnet.entries[0].name, 'Jonah');
  assert.match(by.lossMagnet.entries[0].line, /Different games/);
  assert.equal(by.statPadder.entries[0].name, 'Hog');
  assert.equal(by.ballHog.entries[0].name, 'Hog');
  // Jonah is rated above the squad's defenders but loses: a paper tiger
  assert.equal(by.paperTiger.entries[0].name, 'Jonah');
});

test('superlatives and receipts', () => {
  const ms = season();
  const sup = Object.fromEntries(superlatives(ms, 3).map((s) => [s.key, s]));
  assert.equal(sup.score.name, 'Hog');
  assert.equal(sup.architect.name, 'Mid');
  assert.equal(sup.star.name, 'Hog');
  const w = betterWithout(ms, 'jonah');
  assert.equal(w.with.games, 4);
  assert.equal(w.with.wins, 0);
  assert.match(w.headline, /better off/);
  assert.match(betterWithout(ms, 'Hog').headline, /every game/);
  assert.equal(betterWithout(ms, 'nobody'), null);
  const t = betterTogether(ms, 'Jonah', 'Def');
  assert.equal(t.together.games, 4);
  assert.equal(t.onlyA.games, 0);
  assert.equal(betterTogether(ms, 'Def', 'def'), null);
  const shirt = whoGetsTheShirt(ms, 'Jonah', 'Sub');
  assert.equal(shirt.role, 'DEF');
  assert.equal(shirt.winner, 'Sub');
  const h = headToHead(ms, 'Hog', 'Ghost');
  const goals = h.rows.find((r) => r.label === 'Goals a game');
  assert.equal(goals.better, 0);
  assert.equal(headToHead(ms, 'Hog', 'Hog'), null);
});

test('embeds and the private flow', async () => {
  const club = { key: 'a', name: 'Test FC' };
  const ms = season();
  const rank = rankingsEmbed(club, ms, 'all').toJSON();
  assert.match(rank.title, /Dressing Room/);
  assert.ok(rank.fields.some((f) => f.name.includes('Main Character') && f.value.includes('Hog')));
  assert.match(rankingsEmbed(club, [], 'session').toJSON().description, /Nobody/);
  assert.match(superlativesEmbed(club, ms, 'all').toJSON().description, /Most likely to score/);
  assert.match(receiptEmbed(club, ms, 'h2h', ['hog', 'ghost']).toJSON().title, /Hog vs Ghost/);
  assert.match(receiptEmbed(club, ms, 'shirt', ['jonah', 'sub']).toJSON().description, /Sub gets the shirt in defence/);
  const picker = playerPicker(ms, 'together');
  const menu = picker.components[0].toJSON().components[0];
  assert.equal(menu.min_values, 2);
  assert.equal(menu.options.length, 6);
  assert.deepEqual(dressingRoomButtons().map((b) => b.toJSON().custom_id), ['dr:open:rank', 'dr:open:sup', 'dr:open:receipts']);

  const dr = createDressingRoom({ getGuildState: async () => ({ clubs: [club] }), loadMatches: async () => ms });
  const calls = [];
  const press = (customId, extra = {}) => ({
    guildId: 'g',
    customId,
    member: { displayName: 'Jeff' },
    user: { username: 'jeff' },
    isButton: () => true,
    isStringSelectMenu: () => false,
    reply: async (v) => calls.push(['reply', v]),
    update: async (v) => calls.push(['update', v]),
    ...extra,
  });
  assert.equal(await dr.handleInteraction(press('fun_panel:roast')), false);
  assert.equal(await dr.handleInteraction(press('dr:open:rank')), true);
  assert.equal(calls[0][0], 'reply');
  assert.equal(calls[0][1].flags, 64);
  assert.match(calls[0][1].embeds[0].toJSON().title, /Tonight/);
  await dr.handleInteraction(press('dr:rank:all'));
  assert.equal(calls[1][0], 'update');
  await dr.handleInteraction(press('dr:sel:without', { isButton: () => false, isStringSelectMenu: () => true, values: ['jonah'] }));
  assert.match(calls[2][1].embeds[0].toJSON().title, /Better without Jonah/);
  const sent = [];
  await dr.handleInteraction(press('dr:post', { channel: { send: async (v) => sent.push(v) }, message: { embeds: [calls[2][1].embeds[0].toJSON()] } }));
  assert.equal(sent.length, 1);
  assert.match(sent[0].embeds[0].toJSON().footer.text, /posted by Jeff/);
});
