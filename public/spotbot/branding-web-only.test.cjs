const test = require('node:test');
const assert = require('node:assert');
const { Collection, PermissionsBitField, ChannelType } = require('discord.js');
const { createClubSetup, SETUP_COMMANDS } = require('./club-setup.cjs');
const { ACTIONS, AREAS, areaMenu } = require('./panels.cjs');
const { createWebPanels } = require('./web-panels.cjs');
const { CONTROL_URL } = require('./web-only.cjs');

function harness() {
  const state = { currentClubKey: 'c', clubs: [{ key: 'c', name: 'Leeds Lads', kit: { primary: 'white' } }] };
  let saved = 0;
  const setup = createClubSetup({ supabase: {}, getGuildState: async () => state, events: {}, saveGuildSettings: async () => { saved += 1; } });
  const replies = [];
  const ix = (customId, { web = false, fields = null, command = null } = {}) => ({
    __webPanel: web, guildId: 'g', customId, commandName: command, member: { permissions: { has: () => true } },
    isButton: () => !fields && !command, isModalSubmit: () => !!fields, isStringSelectMenu: () => false, isChatInputCommand: () => !!command,
    showModal: async (m) => replies.push(['modal', m]), reply: async (m) => replies.push(['reply', m]),
    deferReply: async () => {}, editReply: async (m) => replies.push(['edit', m]),
    fields,
  });
  return { state, setup, replies, ix, saved: () => saved };
}

const linkOf = (reply) => reply.components[0].toJSON().components[0].url;

test('branding steps pressed in Discord point to the website and change nothing', async () => {
  const h = harness();
  for (const id of ['setupw:colors', 'setupw:identity', 'setupw:voice', 'setupw:paper']) {
    assert.equal(await h.setup.handleInteraction(h.ix(id)), true);
    const [kind, reply] = h.replies.at(-1);
    assert.equal(kind, 'reply', `${id} opens no form`);
    assert.match(reply.content, /set on the website/);
    assert.equal(linkOf(reply), CONTROL_URL);
  }
  await h.setup.handleInteraction(h.ix(null, { command: 'brand' }));
  assert.equal(linkOf(h.replies.at(-1)[1]), CONTROL_URL);
  assert.equal(h.saved(), 0);
});

test('Discord club setup asks only for the EA club; the web form still has the kit', async () => {
  const h = harness();
  await h.setup.handleInteraction(h.ix('setupw:start'));
  const discord = h.replies.at(-1)[1].toJSON();
  assert.deepEqual(discord.components.map((r) => r.components[0].custom_id), ['ea_name']);
  await h.setup.handleInteraction(h.ix('setupw:start', { web: true }));
  const web = h.replies.at(-1)[1].toJSON();
  assert.deepEqual(web.components.map((r) => r.components[0].custom_id), ['ea_name', 'kit_primary', 'kit_secondary', 'kit_description']);

  // A Discord submit with the EA name only leaves the kit alone and offers the website for the rest
  await h.setup.handleInteraction(h.ix('setupw:submit', { fields: { getTextInputValue: (k) => { if (k !== 'ea_name') throw new Error('no field'); return ''; } } }));
  const done = h.replies.at(-1)[1];
  assert.deepEqual(h.state.clubs[0].kit, { primary: 'white' });
  assert.equal(done.components[0].toJSON().components[0].url, CONTROL_URL);
});

test('Brand actions are hidden from the Discord Admin menu but stay on the web', () => {
  const admin = areaMenu('admin').components.flatMap((r) => r.toJSON().components.map((c) => c.custom_id));
  for (const id of ['ad_brand', 'ad_avatar', 'ad_brandreset']) {
    assert.ok(ACTIONS.get(id).web);
    assert.ok(!admin.includes(`gp:a:${id}`), `${id} not in Discord`);
    assert.ok(AREAS.find((a) => a.key === 'admin').actions.some((a) => a.id === id), `${id} still listed for the web`);
  }
  assert.ok(ACTIONS.get('ad_brand').fields.includes('crest_history'), 'era crests can be imported on the web');
});

test('the web Bot Avatar form takes a file and hands it to /brand as an attachment', async () => {
  const [G, U, C, B] = ['111111111111111111', '222222222222222222', '333333333333333333', '999999999999999999'];
  const brand = SETUP_COMMANDS.find((c) => c.name === 'brand');
  const user = { id: U, username: 'gaffer', bot: false };
  const ALL = new PermissionsBitField(PermissionsBitField.All);
  const member = { id: U, user, displayName: 'Gaffer', permissions: ALL, roles: { cache: new Collection() }, voice: {}, displayAvatarURL: () => '' };
  const channel = { id: C, name: 'general', type: ChannelType.GuildText, isTextBased: () => true, isThread: () => false, permissionsFor: () => ALL, send: async () => ({}), messages: { fetch: async () => null } };
  const guild = {
    id: G, name: 'Test FC', iconURL: () => null, roles: { cache: new Collection() }, client: { users: { cache: new Collection() } },
    members: { me: { id: B, permissions: ALL }, fetch: async (id) => (id === U ? member : null), cache: new Collection([[U, member]]) },
    channels: { cache: new Collection([[C, channel]]), fetch: async (id) => (id === C ? channel : null) },
  };
  const client = { user: { id: B }, application: { id: B }, guilds: { cache: new Collection([[G, guild]]) } };
  let got = null;
  const handle = createWebPanels({
    getClient: () => client, schemas: [brand], isManager: () => true, timezoneFor: async () => 'UTC', graphicsPanel: async () => null,
    dispatch: async (ix) => {
      got = ix.options.getAttachment('avatar');
      assert.ok(ix.__webPanel);
      await ix.reply({ content: 'ok', flags: 64 });
    },
  }).handle;
  const ctx = await handle('context', { guildId: G, userId: U });
  const avatar = ctx.areas.find((a) => a.key === 'admin').actions.find((a) => a.id === 'ad_avatar');
  assert.equal(avatar.discordOnly, null);
  assert.equal(avatar.fields[0].kind, 'file');
  const data = `data:image/png;base64,${Buffer.from('png').toString('base64')}`;
  await handle('run', { guildId: G, userId: U, actionId: 'ad_avatar', values: { avatar: data, avatar__name: 'bot.png' }, channelId: C });
  assert.equal(got.contentType, 'image/png');
  assert.equal(got.name, 'bot.png');
  assert.equal(got.url, data);
});
