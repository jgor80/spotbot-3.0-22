const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionsBitField, OverwriteType } = require('discord.js');
const { createChannelSetup, planChannels, overwritesFor, FEATURES } = require('./channel-setup.cjs');

const F = PermissionsBitField.Flags;
const T = ChannelType.GuildText;

const ch = (id, name, type = T, parentId = null) => ({ id, name, type, parentId });
const ctxFor = (club, recruit = null) => ({ state: { clubs: [club], clubVcLinks: {} }, club, recruit });

test('a fresh server gets every channel created', () => {
  const club = { key: 'c1', name: 'Leeds Lads' };
  const { plan, categoryName, category } = planChannels({ channels: [ch('1', 'general')], club, ctx: ctxFor(club), multiClub: false });
  assert.equal(categoryName, 'GafferBot');
  assert.equal(category, null);
  assert.equal(plan.length, FEATURES.length);
  assert.ok(plan.every((p) => p.action === 'create'));
  assert.deepEqual(plan.map((p) => p.name).slice(0, 3), ['matchday', 'results', 'chronicle']);
});

test('existing channels are kept or reused by name, never duplicated', () => {
  const club = { key: 'c1', name: 'Leeds Lads', stats_channel_id: '2', autopilot: { chronicle_channel_id: 'gone' } };
  const channels = [ch('2', 'general'), ch('3', '📸・pro-photos'), ch('4', 'Highlights'), ch('5', 'Matchday', ChannelType.GuildVoice), ch('6', 'matchday')];
  const ctx = ctxFor(club, { channel_id: null });
  const { plan } = planChannels({ channels, club, ctx, multiClub: false });
  const by = Object.fromEntries(plan.map((p) => [p.feature.key, p]));
  assert.equal(by.results.action, 'keep');
  assert.equal(by.results.channel.id, '2');
  assert.equal(by.photos.action, 'reuse');
  assert.equal(by.photos.channel.id, '3');
  assert.equal(by.clips.channel.id, '4');
  assert.equal(by.voice.channel.id, '5', 'voice matches the voice channel');
  assert.equal(by.events.channel.id, '6', 'text matches the text channel');
  assert.equal(by.chronicle.action, 'create', 'a deleted channel is replaced');
});

test('with several clubs only that club’s category is searched', () => {
  const club = { key: 'c2', name: 'Reserves' };
  const channels = [ch('10', 'GafferBot', ChannelType.GuildCategory), ch('11', 'results', T, '10'), ch('20', 'Reserves', ChannelType.GuildCategory), ch('21', 'matchday', T, '20'), ch('30', 'recruitment')];
  const { plan, categoryName, category } = planChannels({ channels, club, ctx: ctxFor(club), multiClub: true });
  const by = Object.fromEntries(plan.map((p) => [p.feature.key, p]));
  assert.equal(categoryName, 'Reserves');
  assert.equal(category.id, '20');
  assert.equal(by.results.action, 'create', "another club's results channel is not taken");
  assert.equal(by.events.channel.id, '21');
  assert.equal(by.recruit.channel.id, '30', 'server-wide recruitment is shared');
});

test('feeds are read-only, staff channels hidden, and the bot only grants what it has', () => {
  const me = { id: 'bot', permissions: new PermissionsBitField([F.ViewChannel, F.SendMessages, F.EmbedLinks, F.ReadMessageHistory]) };
  const roles = new Map([
    ['g', { id: 'g', name: '@everyone', managed: false, position: 0 }],
    ['r1', { id: 'r1', name: 'Club Manager', managed: false, position: 3 }],
    ['r2', { id: 'r2', name: 'Players', managed: false, position: 2 }],
  ]);
  const guild = { id: 'g', roles: { everyone: { id: 'g' }, cache: roles } };
  const feed = overwritesFor(FEATURES.find((f) => f.key === 'results'), guild, me);
  assert.deepEqual(feed[0], { id: 'bot', type: OverwriteType.Member, allow: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.ReadMessageHistory] });
  assert.deepEqual(feed[1], { id: 'g', type: OverwriteType.Role, deny: [F.SendMessages] });
  const staff = overwritesFor(FEATURES.find((f) => f.key === 'desk'), guild, me);
  assert.deepEqual(staff.slice(1).map((o) => o.id), ['g', 'r1']);
  assert.deepEqual(staff[1].deny, [F.ViewChannel]);
  const open = overwritesFor(FEATURES.find((f) => f.key === 'clips'), guild, me);
  assert.equal(open.length, 1);
});

function fakeGuild({ manageChannels = true, channels = [] } = {}) {
  const cache = new Map(channels.map((c) => [c.id, c]));
  let next = 100;
  const me = { id: 'bot', permissions: new PermissionsBitField(manageChannels ? [F.Administrator] : [F.ViewChannel, F.SendMessages]) };
  const created = [];
  const sent = [];
  const guild = {
    id: 'g',
    members: { me },
    roles: { everyone: { id: 'g' }, cache: new Map() },
    channels: {
      cache,
      fetch: async (id) => (id ? cache.get(id) || null : cache),
      create: async (opts) => {
        const c = { id: String(next++), name: opts.name, type: opts.type, parentId: opts.parent || null, opts, guildId: 'g',
          permissionsFor: () => ({ has: () => true }), send: async (m) => sent.push([c.name, m]) };
        cache.set(c.id, c);
        created.push(c);
        return c;
      },
    },
  };
  return { guild, created, sent };
}

function fakeSupabase(store) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: store.recruit || null }) }) }),
      upsert: async (row) => {
        store.recruit = row;
        return { error: null };
      },
    }),
  };
}

test('the button flow plans, waits for confirmation, then creates and wires everything once', async () => {
  const club = { key: 'c1', name: 'Leeds Lads' };
  const state = { clubs: [club], clubVcLinks: {} };
  const store = {};
  let saves = 0;
  const panels = [];
  const setup = createChannelSetup({
    supabase: fakeSupabase(store), getGuildState: async () => state, saveGuildSettings: async () => { saves += 1; },
    currentClubOf: (s) => s.clubs[0], activeClubs: (s) => s.clubs,
    hooks: () => ({ graphicsPanel: async (c) => panels.push(['graphics', c.name]), deskPanel: async (c) => panels.push(['desk', c.name]), recruitChanged: () => panels.push(['recruit']) }),
  });
  const { guild, created, sent } = fakeGuild();
  const views = [];
  const press = (customId, extra = {}) => setup.handleInteraction({
    customId, guild, guildId: 'g', user: { username: 'jeff' }, member: { permissions: new PermissionsBitField([F.ManageGuild]) },
    isButton: () => true, deferReply: async () => {}, deferUpdate: async () => {}, reply: async (m) => views.push(m), editReply: async (m) => views.push(m), ...extra,
  });

  assert.equal(await press('setupw:channels'), true);
  assert.match(views.at(-1).embeds[0].toJSON().description, /Matchday\*\*: not set/);
  await press('setupw:chplan');
  assert.equal(created.length, 0, 'nothing is created before the admin confirms');
  assert.match(views.at(-1).components[0].toJSON().components[0].label, /create 10/);

  await press('setupw:chgo');
  assert.equal(created.filter((c) => c.type === ChannelType.GuildCategory).length, 1);
  assert.equal(created.length, FEATURES.length + 1);
  assert.ok(created.filter((c) => c.type !== ChannelType.GuildCategory).every((c) => c.parentId === created[0].id));
  assert.ok(club.events_channel_id && club.stats_channel_id && club.pro_photos_channel_id && club.graphics_channel_id && club.manager_desk_channel_id);
  assert.ok(club.autopilot.chronicle_channel_id && club.autopilot.hof_channel_id && club.autopilot.clips_channel_id);
  assert.equal(guild.channels.cache.get(state.clubVcLinks.c1).type, ChannelType.GuildVoice);
  assert.equal(store.recruit.channel_id, guild.channels.cache.get(store.recruit.channel_id).id);
  assert.equal(sent.length, FEATURES.length - 1, 'an intro in every new text channel');
  assert.deepEqual(panels.map((p) => p[0]).sort(), ['desk', 'graphics', 'recruit']);
  assert.ok(saves >= 1);

  // Running it again only fills gaps
  const before = created.length;
  await press('setupw:chplan');
  assert.match(views.at(-1).content, /Nothing to create/);
  await press('setupw:chgo');
  assert.equal(created.length, before);
});

test('without Manage Channels the create option is off and picking still works', async () => {
  const club = { key: 'c1', name: 'Leeds Lads' };
  const state = { clubs: [club], clubVcLinks: {} };
  const setup = createChannelSetup({ supabase: fakeSupabase({}), getGuildState: async () => state, saveGuildSettings: async () => {}, currentClubOf: (s) => s.clubs[0], activeClubs: (s) => s.clubs });
  const text = { id: '7', name: 'news', type: T, permissionsFor: () => ({ has: () => true }) };
  const { guild, created } = fakeGuild({ manageChannels: false, channels: [text] });
  const views = [];
  const press = (customId, extra = {}) => setup.handleInteraction({
    customId, guild, guildId: 'g', member: { permissions: new PermissionsBitField([F.ManageGuild]) },
    deferReply: async () => {}, deferUpdate: async () => {}, reply: async (m) => views.push(m), editReply: async (m) => views.push(m), ...extra,
  });
  await press('setupw:channels');
  const view = views.at(-1);
  assert.match(view.embeds[0].toJSON().description, /Manage Channels/);
  assert.equal(view.components[0].toJSON().components[0].disabled, true);
  await press('setupw:chgo');
  assert.equal(created.length, 0);
  await press('setupw:chset:chronicle', { values: ['7'] });
  assert.equal(club.autopilot.chronicle_channel_id, '7');
  assert.match(views.at(-1).content, /Chronicle now uses <#7>/);
  await press('setupw:chclr:chronicle');
  assert.equal(club.autopilot.chronicle_channel_id, undefined);
});

test('only server admins can use it', async () => {
  const setup = createChannelSetup({ supabase: fakeSupabase({}), getGuildState: async () => ({ clubs: [] }), saveGuildSettings: async () => {}, currentClubOf: () => null, activeClubs: () => [] });
  const replies = [];
  await setup.handleInteraction({ customId: 'setupw:chgo', member: { permissions: new PermissionsBitField([]) }, reply: async (m) => replies.push(m) });
  assert.match(replies[0].content, /Only server admins/);
});
