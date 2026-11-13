const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const { createSocialHub, pickLobby, liveQueue, isDefaultName } = require('./social-hub.cjs');

const lobby = (index, humans, openSlots, fits = false) => ({ index, humans, openSlots, fits, club: { key: `club${index + 1}` } });

test('pickLobby joins a game in progress before an empty lobby, then your position, then the fullest', () => {
  assert.equal(pickLobby([lobby(0, 0, 11), lobby(1, 3, 8)]).index, 1);
  assert.equal(pickLobby([lobby(0, 5, 6), lobby(1, 3, 8, true)]).index, 1);
  assert.equal(pickLobby([lobby(0, 3, 8), lobby(1, 5, 6)]).index, 1);
  assert.equal(pickLobby([lobby(0, 0, 11), lobby(1, 0, 11)]).index, 0);
  assert.equal(pickLobby([lobby(0, 11, 0)]), null);
});

test('liveQueue drops stale Play now presses', () => {
  const now = Date.now();
  const q = liveQueue(new Map([['a', now - 1000], ['b', now - 2 * 60 * 60 * 1000]]), now);
  assert.deepEqual([...q.keys()], ['a']);
});

test('only default club names get renamed to lobbies', () => {
  assert.equal(isDefaultName('Club 3'), true);
  assert.equal(isDefaultName('Palermo FC'), false);
});

// A hub with two lobbies: lobby 1 has a and b on spots and c waiting, lobby 2 is empty
function world() {
  const members = (ids) => new Collection(ids.map((id) => [id, { id, user: { id, bot: false } }]));
  const vcs = new Collection([
    ['vc1', { id: 'vc1', members: members(['a', 'b', 'c']), send: async () => {} }],
    ['vc2', { id: 'vc2', members: members([]) }],
  ]);
  const state = {
    clubs: [
      { key: 'club1', name: 'Lobby 1', enabled: true, casual: { on: true } },
      { key: 'club2', name: 'Lobby 2', enabled: true, casual: { on: true } },
    ],
    boardState: {
      club1: { slots: [{ label: 'GK', open: true }, { label: 'CB', open: false, takenBy: 'b' }, { label: 'ST', open: false, takenBy: 'a' }] },
      club2: { slots: [{ label: 'GK', open: true }, { label: 'CB', open: true }, { label: 'ST', open: true }] },
    },
    clubVcLinks: { club1: 'vc1', club2: 'vc2' },
  };
  const calls = [];
  const rotations = [];
  const hub = createSocialHub({
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { social_hub: { on: true, lobbies: ['club1', 'club2'] } } }) }) }) }) },
    getGuildState: async () => state,
    saveGuildSettings: async () => {},
    casual: {
      postCall: async (guild, club) => { calls.push(club.key); return { message: {} }; },
      rotate: async (guild, club) => { rotations.push(club.key); return { in: [{ id: 'c', position: 'CB' }], out: ['b'] }; },
    },
    getUserPrefs: async (g, id) => (id === 'z' ? ['GK'] : []),
    getInferredMatch: (label, prefs) => ({ match: prefs.includes(label) }),
    createBoard: () => ({ slots: [] }),
    gameOn: (g, key) => key === 'club1',
    client: () => null,
  });
  const guild = { id: 'g1', channels: { cache: vcs }, members: { me: { permissions: { has: () => false } }, fetch: async () => null } };
  const ix = (userId, voiceId = null) => ({ guild, guildId: 'g1', user: { id: userId }, member: { id: userId, voice: { channelId: voiceId } } });
  return { hub, guild, ix, calls, rotations };
}

test('the board lists each lobby with spots, waiting players and open spots, and pings nobody', async () => {
  const { hub, guild } = world();
  const msg = await hub.board(guild);
  const e = msg.embeds[0].toJSON();
  assert.match(e.description, /3 playing in 1 lobby/);
  assert.match(e.fields[0].name, /Lobby 1 · 3\/11 · in a game/);
  assert.match(e.fields[0].value, /\*\*ST\*\* <@a>/);
  assert.match(e.fields[0].value, /🪑 <@c>/);
  assert.match(e.fields[0].value, /Open: GK/);
  assert.match(e.fields[1].value, /Empty/);
  assert.deepEqual(msg.allowedMentions, { parse: [] });
});

test('Play now sends you to the lobby with a game on', async () => {
  const { hub, ix } = world();
  const r = await hub.play(ix('z'));
  assert.match(r.content, /Lobby 1\*\* has a spot in your position/);
  assert.match(r.content, /<#vc1>/);
});

test('Play now knows when you are already in a lobby', async () => {
  const { hub, ix } = world();
  assert.match((await hub.play(ix('a'))).content, /already in \*\*Lobby 1\*\* on \*\*ST\*\*/);
});

test('Play now with nobody on queues players and calls the game when enough are waiting', async () => {
  const { hub, guild, ix, calls } = world();
  guild.channels.cache.get('vc1').members = new Collection();
  assert.match((await hub.play(ix('x'))).content, /queue \(1\/3\)/);
  assert.match((await hub.play(ix('y'))).content, /queue \(2\/3\)/);
  assert.match((await hub.play(ix('z'))).content, /called it/);
  assert.deepEqual(calls, ['club1']);
});

test('Next game rotates the lobby you are in, once per game', async () => {
  const { hub, ix, rotations } = world();
  assert.match((await hub.nextGame(ix('a'))).content, /Join the lobby/);
  const r = await hub.nextGame(ix('a', 'vc1'));
  assert.match(r.content, /In: <@c> \(CB\)/);
  assert.match(r.content, /Sitting this one out: <@b>/);
  assert.match((await hub.nextGame(ix('b', 'vc1'))).content, /rotated/);
  assert.deepEqual(rotations, ['club1']);
});
