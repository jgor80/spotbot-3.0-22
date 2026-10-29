const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const { createCasual, allCasual, pickRest, waitOrder, fallbackSlot, nextStreaks, squadLine } = require('./casual.cjs');
const { humanCount, smallsMax, tagForEvent, DEFAULT_SMALLS_MAX } = require('./match-tags.cjs');
const { matchCompetition, isSeparateCompetition } = require('./club-insights.cjs');
const { areaMenu } = require('./panels.cjs');

const slots = (labels, taken = {}) => labels.map((label, i) => ({ label, open: !taken[i], takenBy: taken[i] || null }));

test('pickRest sits out the longest runs first', () => {
  const rest = pickRest(['a', 'b', 'c'], { a: 1, b: 3, c: 2 }, 2, () => 0);
  assert.deepEqual(rest, ['b', 'c']);
  assert.deepEqual(pickRest(['a'], {}, 0), []);
});

test('waitOrder puts the longest wait first and new arrivals last', () => {
  const since = { b: '2026-10-29T01:00:00Z', c: '2026-10-29T00:00:00Z' };
  assert.deepEqual(waitOrder(['a', 'b', 'c'], since), ['c', 'b', 'a']);
});

test('fallbackSlot avoids the keeper until nothing else is open', () => {
  assert.equal(fallbackSlot(slots(['GK', 'CB', 'ST'], { 2: 'x' })), 1);
  assert.equal(fallbackSlot(slots(['GK', 'CB'], { 1: 'x' })), 0);
  assert.equal(fallbackSlot(slots(['GK'], { 0: 'x' })), -1);
});

test('nextStreaks counts games in a row and resets whoever sat out', () => {
  assert.deepEqual(nextStreaks({ a: 2, c: 4 }, ['a', 'b'], ['c']), { a: 3, b: 1, c: 0 });
});

test('squadLine says how many humans and how many AI', () => {
  assert.equal(squadLine(4, { casual: { smalls_max: 6 } }), 'Smalls: 4 players, AI fills the other 7');
  assert.equal(squadLine(8, { casual: { smalls_max: 6 } }), '8 players, AI fills 3');
  assert.equal(squadLine(11, {}), '11 in voice: full XI');
});

test('smalls: only casual clubs, and only short-handed games', () => {
  assert.equal(smallsMax({}), null);
  assert.equal(smallsMax({ casual: { on: true } }), DEFAULT_SMALLS_MAX);
  assert.equal(smallsMax({ casual: { on: true, smalls_max: 4 } }), 4);
  assert.equal(humanCount({ player_stats: [{}, {}, {}] }), 3);
  assert.equal(tagForEvent({ title: 'Smalls night', event_type: 'friendly' }), 'smalls');
  // Smalls stay in the regular stats
  assert.equal(matchCompetition({ match_type: 'friendly', match_data: { _tag: 'smalls' } }), 'smalls');
  assert.equal(isSeparateCompetition('smalls'), false);
});

test('league-only buttons leave the menus when every club is casual', () => {
  const ids = (m) => m.components.flatMap((r) => r.toJSON().components.map((c) => c.custom_id));
  assert.ok(ids(areaMenu('events')).includes('gp:a:ev_quick_league'));
  assert.ok(!ids(areaMenu('events', { casual: true })).includes('gp:a:ev_quick_league'));
  assert.equal(allCasual({ clubs: [{ key: 'a', enabled: true, casual: { on: true } }] }), true);
  assert.equal(allCasual({ clubs: [{ key: 'a', enabled: true, casual: { on: true } }, { key: 'b', enabled: true }] }), false);
});

// A server with one casual club, a linked voice channel and a 3-spot board
function world(voiceIds, taken = {}) {
  const club = { key: 'main', name: 'Palermo', enabled: true, casual: { on: true } };
  const state = {
    clubs: [club],
    boardState: { main: { formation: 'x', slots: slots(['GK', 'CM', 'ST'], taken) } },
    clubVcLinks: { main: 'vc1' },
  };
  const members = new Collection(voiceIds.map((id) => [id, { id, user: { id, bot: false } }]));
  const guild = { id: 'g1', channels: { cache: new Collection([['vc1', { id: 'vc1', members }]]) } };
  const prefs = { a: 'ST' };
  const casual = createCasual({
    getGuildState: async () => state,
    saveGuildSettings: async () => {},
    canManageClub: async () => true,
    refreshClubPanels: async () => {},
    handleSlotOpened: async () => {},
    // Like index.cjs: only players with preferences are placed by it
    autoAssignPlayer: async (_g, id, key, st) => {
      const board = st.boardState[key];
      const i = board.slots.findIndex((s) => s.open && s.label === prefs[id]);
      if (i < 0) return { assigned: false };
      board.slots[i].open = false;
      board.slots[i].takenBy = id;
      return { assigned: true, position: board.slots[i].label };
    },
    client: () => null,
  });
  return { club, state, guild, casual };
}

test('fillFromVoice gives everyone in voice a spot, preferences first, keeper last', async () => {
  const { state, guild, club, casual } = world(['b', 'a', 'c', 'd']);
  const r = await casual.fillFromVoice(guild, club, { refresh: false });
  const board = state.boardState.main.slots;
  assert.equal(board[2].takenBy, 'a'); // ST by preference
  assert.equal(board[1].takenBy, 'b'); // first open outfield spot
  assert.equal(board[0].takenBy, 'c'); // keeper only when nothing else is open
  assert.deepEqual(r.waiting, ['d']);
  assert.ok(club.casual.waiting_since.d);
});

test('rotate sits out the longest run and brings the waiting player in', async () => {
  const { state, guild, club, casual } = world(['a', 'b', 'c', 'd'], { 0: 'a', 1: 'b', 2: 'c' });
  club.casual.streaks = { a: 1, b: 3, c: 1 };
  const r = await casual.rotate(guild, club, { gamesPlayed: 1 });
  assert.deepEqual(r.out, ['b']);
  assert.deepEqual(r.in.map((p) => p.id), ['d']);
  assert.equal(state.boardState.main.slots[1].takenBy, 'd');
  assert.equal(club.casual.streaks.b, 0);
  assert.ok(club.casual.waiting_since.b);
});

test('rotate does nothing when nobody is waiting', async () => {
  const { guild, club, casual } = world(['a', 'b'], { 1: 'a', 2: 'b' });
  const r = await casual.rotate(guild, club, { gamesPlayed: 2 });
  assert.deepEqual(r, { in: [], out: [], waiting: [] });
  assert.deepEqual(club.casual.streaks, { a: 2, b: 2 });
});
