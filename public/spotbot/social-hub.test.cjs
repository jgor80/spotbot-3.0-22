const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const { createSocialHub, pickLobby, liveQueue, isDefaultName, cleanTeamName, freeTeamSlot, lobbySlots, publicSlug, publicSnapshot, MAX_CLUBS } = require('./social-hub.cjs');

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

test('team names lose mentions and markdown and need 2 to 40 characters', () => {
  assert.equal(cleanTeamName('  <@123> Sunday   *Legends*  '), '123 Sunday Legends');
  assert.equal(cleanTeamName('@everyone'), 'everyone');
  assert.equal(cleanTeamName('x'), null);
  assert.equal(cleanTeamName('a'.repeat(60)).length, 40);
});

test('a new team takes a free slot that is not a lobby, else adds one up to the limit', () => {
  const clubs = [{ key: 'club1', enabled: false }, { key: 'club2', enabled: false }, { key: 'club3', enabled: true }];
  assert.equal(freeTeamSlot(clubs, ['club1']).club.key, 'club2');
  const full = [{ key: 'club1', enabled: true }, { key: 'club2', enabled: false }];
  const r = freeTeamSlot(full, ['club2']);
  assert.equal(r.added, true);
  assert.equal(r.club.key, 'club3');
  const max = Array.from({ length: MAX_CLUBS }, (_, i) => ({ key: `club${i + 1}`, enabled: true }));
  assert.equal(freeTeamSlot(max, []), null);
});

test('lobbies keep their slots and never take a team slot', () => {
  const clubs = [
    { key: 'club1', name: 'Lobby 1', enabled: true },
    { key: 'club2', name: 'Night Owls', enabled: true, team_id: 't1' },
    { key: 'club3', name: 'Club 3', enabled: false },
    { key: 'club4', name: 'Club 4', enabled: false },
  ];
  const keys = lobbySlots(clubs, { lobbies: ['club1'], teams: ['club2'] }, 3).map((c) => c.key);
  assert.deepEqual(keys, ['club1', 'club3', 'club4']);
});

test('Start a team makes the club, roles and channels and wires the club features', async () => {
  const made = [];
  const roles = [];
  let saved = null;
  let n = 0;
  const added = [];
  const guild = {
    id: 'g1',
    roles: { everyone: { id: 'everyone' }, create: async (o) => { const r = { id: `r${roles.length + 1}`, ...o }; roles.push(r); return r; } },
    members: { me: { id: 'bot', permissions: { has: () => true } } },
    channels: { create: async (o) => { const c = { id: `c${++n}`, ...o, send: async () => {} }; made.push(c); return c; } },
  };
  const state = { clubs: [{ key: 'club1', name: 'Lobby 1', enabled: true }, { key: 'club2', name: 'Club 2', enabled: false }], boardState: {}, clubVcLinks: { club1: 'vc1' } };
  let hubSaved = null;
  const hub = createSocialHub({
    supabase: {
      from: (t) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { social_hub: { on: true, lobbies: ['club1'] } } }) }) }),
        update: (v) => { hubSaved = v.social_hub; return { eq: async () => ({}) }; },
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'team-1' } }) }) }),
      }),
    },
    getGuildState: async () => state,
    saveGuildSettings: async (g, s) => { saved = s; },
    casual: {},
    createBoard: () => ({ slots: [] }),
    client: () => null,
  });
  const member = { id: 'cap', roles: { add: async (r) => added.push(...r) } };
  const r = await hub.createTeam(guild, member, 'Night Owls');
  assert.ok(!r.error, r.error);
  const club = saved.clubs.find((c) => c.key === 'club2');
  assert.equal(club.name, 'Night Owls');
  assert.equal(club.enabled, true);
  assert.equal(club.team_id, 'team-1');
  assert.ok(club.events_channel_id && club.stats_channel_id && club.manager_desk_channel_id);
  assert.ok(saved.clubVcLinks.club2);
  assert.deepEqual(roles.map((x) => x.name), ['Night Owls', 'Night Owls Captain']);
  assert.equal(added.length, 2);
  assert.deepEqual(hubSaved.teams, ['club2']);
  const desk = made.find((c) => c.id === club.manager_desk_channel_id);
  assert.ok(desk.permissionOverwrites.some((o) => o.id === 'everyone' && o.deny));
  assert.match((await hub.createTeam(guild, { id: 'x', roles: { add: async () => {} } }, 'night owls')).error, /already a team/);
});

test('publicSlug makes a url-safe name and adds the server id tail when taken', () => {
  assert.equal(publicSlug('The Spot!! FC', '1518804786105942188'), 'the-spot-fc');
  assert.equal(publicSlug('The Spot', '1518804786105942188', true), 'the-spot-42188');
  assert.equal(publicSlug('⚽⚽', '123'), 'hub');
  assert.ok(publicSlug('x'.repeat(80), '1').length <= 40);
});

test('publicSnapshot shows counts and open positions, never who is playing', () => {
  const lobbies = [
    { club: { name: 'Lobby 1' }, humans: 3, live: true, openLabels: ['ST', 'CB'], members: ['secret'] },
    { club: { name: 'Lobby 2' }, humans: 0, live: false, openLabels: ['GK'] },
  ];
  const snap = publicSnapshot(lobbies, [{ name: 'Ann', xp: 10 }]);
  assert.equal(snap.playing, 3);
  assert.deepEqual(snap.lobbies, [
    { name: 'Lobby 1', humans: 3, live: true, open: ['ST', 'CB'] },
    { name: 'Lobby 2', humans: 0, live: false, open: [] },
  ]);
  assert.ok(!JSON.stringify(snap).includes('secret'));
});
