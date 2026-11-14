const test = require('node:test');
const assert = require('node:assert/strict');
const { inLobbyWindow, extendWindows, createHubLobbyClub, GAP_MS } = require('./hub-lobby-club.cjs');

const match = (atMs, names, club = '77') => ({ timestamp: Math.floor(atMs / 1000), players: { [club]: Object.fromEntries(names.map((n, i) => [i, { playername: n }])) } });

test('only games inside a lobby window with someone from voice count', () => {
  const t = Date.UTC(2026, 10, 14, 20);
  const windows = [{ from: t, to: t + 60 * 60e3, tags: ['night owl'] }];
  assert.equal(inLobbyWindow(windows, match(t + 30 * 60e3, ['Night Owl', 'Rando']), '77'), true);
  assert.equal(inLobbyWindow(windows, match(t + 30 * 60e3, ['Rando']), '77'), false, 'nobody from voice played');
  assert.equal(inLobbyWindow(windows, match(t + 5 * 60 * 60e3, ['Night Owl']), '77'), false, 'played later, outside the lobby');
  assert.equal(inLobbyWindow([{ from: t, to: t, tags: [] }], match(t + 10 * 60e3, ['Anyone']), '77'), true, 'no linked gamertags: time decides');
  assert.equal(inLobbyWindow(null, match(t, ['x']), '77'), false);
});

test('windows extend while play continues and split after a gap', () => {
  let w = extendWindows([], 1000, ['A']);
  w = extendWindows(w, 1000 + 60e3, ['b', 'a']);
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].tags, ['a', 'b']);
  w = extendWindows(w, 1000 + 60e3 + GAP_MS + 1, []);
  assert.equal(w.length, 2);
});

test('setting a lobby club marks it lobby-only, starts tracking and clears cleanly', async () => {
  const state = { clubs: [{ key: 'club2', name: 'Lobby 2', enabled: true }] };
  let started = null;
  const lc = createHubLobbyClub({ supabase: {}, getGuildState: async () => state, saveGuildSettings: async () => {}, hubOf: async () => ({ on: true, lobbies: ['club2'] }), eaVersion: () => 'fc27', startMonitoring: (g, k) => { started = k; } });
  const club = await lc.setClub('g', 'club2', { clubId: 123, name: 'Sunday FC' }, 'common-gen5');
  assert.equal(club.ea_club_id, '123');
  assert.equal(club.lobby_only, true);
  assert.equal(club.ea_fc_version, 'fc27');
  assert.equal(started, 'club2');
  const cleared = await lc.setClub('g', 'club2', null);
  assert.equal(cleared.ea_club_id, null);
  assert.equal(cleared.monitoring_enabled, false);
});
