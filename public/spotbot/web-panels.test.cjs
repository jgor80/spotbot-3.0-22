const test = require('node:test');
const assert = require('node:assert');
const { Collection, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { createWebPanels, serialize } = require('./web-panels.cjs');

const GUILD = '111111111111111111';
const USER = '222222222222222222';
const CHAN = '333333333333333333';
const ALL = new PermissionsBitField(PermissionsBitField.All);

// A server with one text channel the user can post in; channel.send records what was posted
function fakeServer({ manager = true } = {}) {
  const sent = [];
  const user = { id: USER, username: 'gaffer', bot: false };
  const member = { id: USER, user, displayName: 'Gaffer', permissions: manager ? ALL : new PermissionsBitField(0n), roles: { cache: new Collection() }, voice: {}, displayAvatarURL: () => '' };
  const me = { id: '999999999999999999', permissions: ALL };
  const channel = {
    id: CHAN,
    name: 'general',
    type: ChannelType.GuildText,
    isTextBased: () => true,
    isThread: () => false,
    permissionsFor: () => ALL,
    send: async (opts) => {
      const msg = { id: String(444444444444444444n + BigInt(sent.length)), opts, edit: async (o) => sent.push(['edit', o]) };
      sent.push(['send', opts]);
      return msg;
    },
    messages: { fetch: async () => null },
  };
  const guild = {
    id: GUILD,
    name: 'Test FC',
    members: { me, fetch: async (id) => (id === USER ? member : null), cache: new Collection([[USER, member]]) },
    channels: { cache: new Collection([[CHAN, channel]]), fetch: async (id) => (id === CHAN ? channel : null) },
    roles: { cache: new Collection() },
    iconURL: () => null,
    client: { users: { cache: new Collection() } },
  };
  const client = { user: { id: me.id }, application: { id: me.id }, guilds: { cache: new Collection([[GUILD, guild]]) } };
  return { client, sent, member };
}

const schemas = [
  { name: 'event', options: [{ type: 1, name: 'list', options: [] }, { type: 1, name: 'new', options: [{ type: 3, name: 'when', required: true }, { type: 3, name: 'title' }] }] },
  { name: 'mystats', options: [] },
  { name: 'autopilot', options: [] },
];

function bridge(server, dispatch) {
  return createWebPanels({ getClient: () => server.client, schemas, isManager: (m) => m.permissions.has(PermissionsBitField.Flags.Administrator), timezoneFor: async () => 'UTC', graphicsPanel: async () => ({ content: 'studio' }), dispatch }).handle;
}

test('a private reply comes back to the page and its buttons can be pressed', async () => {
  const server = fakeServer();
  let toggled = false;
  const handle = bridge(server, async (ix) => {
    if (ix.isChatInputCommand() && ix.commandName === 'autopilot') {
      return ix.reply({ embeds: [new EmbedBuilder().setTitle('Autopilot')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ap_t:recaps:c1').setLabel('Recaps').setStyle(ButtonStyle.Success))], flags: 64 });
    }
    if (ix.isButton() && ix.customId === 'ap_t:recaps:c1') {
      toggled = true;
      assert.equal(ix.message.embeds[0].title, 'Autopilot');
      return ix.update({ embeds: [new EmbedBuilder().setTitle('Autopilot (recaps off)')] });
    }
  });
  const first = await handle('run', { guildId: GUILD, userId: USER, actionId: 'mn_autopilot', values: {}, channelId: CHAN });
  assert.equal(first.done, true);
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].ephemeral, true);
  assert.equal(first.messages[0].payload.embeds[0].title, 'Autopilot');
  assert.equal(server.sent.length, 0, 'nothing posted publicly');

  const second = await handle('click', { guildId: GUILD, userId: USER, messageId: first.messages[0].id, customId: 'ap_t:recaps:c1' });
  assert.ok(toggled);
  assert.equal(second.messages[0].id, first.messages[0].id, 'update edits the same reply');
  assert.equal(second.messages[0].payload.embeds[0].title, 'Autopilot (recaps off)');
  assert.equal(second.messages[0].payload.components.length, 1, 'components kept when the update leaves them out');

  await assert.rejects(handle('click', { guildId: GUILD, userId: USER, messageId: first.messages[0].id, customId: 'ap_t:made_up' }), /no longer on the panel/);
});

test('form values reach the handler as slash command options; public replies post in the channel', async () => {
  const server = fakeServer();
  const handle = bridge(server, async (ix) => {
    assert.equal(ix.options.getSubcommand(), 'new');
    assert.equal(ix.options.getString('when'), '2026-10-12 20:00');
    assert.equal(ix.options.getString('type'), 'league');
    await ix.deferReply();
    await ix.editReply({ content: 'Posted' });
  });
  const res = await handle('run', { guildId: GUILD, userId: USER, actionId: 'ev_quick_league', values: { when: '2026-10-12 20:00' }, channelId: CHAN });
  assert.equal(res.messages[0].ephemeral, false);
  assert.equal(server.sent.length, 1);
  assert.equal(server.sent[0][1].content, 'Posted');
  await assert.rejects(handle('run', { guildId: GUILD, userId: USER, actionId: 'ev_quick_league', values: {}, channelId: CHAN }), /Fill in/);
});

test('manager areas are refused for players, like in Discord', async () => {
  const server = fakeServer({ manager: false });
  const handle = bridge(server, async () => assert.fail('should not run'));
  await assert.rejects(handle('run', { guildId: GUILD, userId: USER, actionId: 'ev_list', values: {}, channelId: CHAN }), (err) => err.status === 403);
  const ctx = await handle('context', { guildId: GUILD, userId: USER });
  assert.equal(ctx.leader, false);
  assert.ok(ctx.areas.find((a) => a.key === 'events').actions.every((a) => a.denied));
  assert.ok(ctx.player.actions.find((a) => a.id === 'mystats').denied === null);
});

test('a form opened by a handler is answered as a modal submit', async () => {
  const server = fakeServer();
  const handle = bridge(server, async (ix) => {
    if (ix.isChatInputCommand()) {
      const modal = new ModalBuilder().setCustomId('setup_modal').setTitle('Setup').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('club').setLabel('Club').setStyle(TextInputStyle.Short)));
      return ix.showModal(modal);
    }
    if (ix.isModalSubmit()) return ix.reply({ content: `Saved ${ix.fields.getTextInputValue('club')}`, flags: 64 });
  });
  const opened = await handle('run', { guildId: GUILD, userId: USER, actionId: 'mystats', values: {}, channelId: CHAN });
  assert.equal(opened.modal.json.custom_id, 'setup_modal');
  await assert.rejects(handle('submit', { guildId: GUILD, userId: USER, runId: opened.runId, values: {} }), /Fill in/);
  const done = await handle('submit', { guildId: GUILD, userId: USER, runId: opened.runId, values: { club: 'Test FC' } });
  assert.equal(done.messages[0].payload.content, 'Saved Test FC');
  await assert.rejects(handle('submit', { guildId: GUILD, userId: USER, runId: opened.runId, values: { club: 'Again' } }), /expired/);
});

test('serialize keeps images as data URLs and merges updates', () => {
  const first = serialize({ content: 'hi', files: [{ attachment: Buffer.from('png'), name: 'card.png' }] });
  assert.match(first.files[0].url, /^data:image\/png;base64,/);
  const next = serialize({ embeds: [] }, first);
  assert.equal(next.content, 'hi');
  assert.equal(next.files.length, 1);
  assert.equal(serialize({ attachments: [] }, first).files.length, 0);
});
