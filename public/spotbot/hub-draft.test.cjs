const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');
const { createHubDraft, pickOrder, pickCaptains, autoPick } = require('./hub-draft.cjs');
const CL = require('./graphics-club-life.cjs');

test('picks snake so neither captain is always behind', () => {
  assert.deepEqual(pickOrder(6), [0, 1, 1, 0, 0, 1]);
});

test('the second captain is the highest level other player, and auto picks take the best left', () => {
  const lvl = { a: 3, b: 9, c: 5 };
  assert.deepEqual(pickCaptains('a', ['a', 'b', 'c'], (x) => lvl[x]), ['a', 'b']);
  assert.equal(autoPick(new Set(['a', 'c']), (x) => lvl[x]), 'c');
});

test('the draft poster renders', () => {
  const png = CL.draftPoster({ serverName: 'The Spot', teams: [{ name: 'Kev', players: [{ name: 'Kev', position: 'GK', captain: true }, { name: 'Bo', position: 'ST' }] }, { name: 'Dave', players: [{ name: 'Dave', position: 'CB', captain: true }] }] });
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('a draft runs from start to teams, captains only, without pings', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const members = new Collection(ids.map((id) => [id, { id, user: { bot: false }, voice: {}, displayName: id.toUpperCase() }]));
  const sent = [];
  const message = { id: 'm1', edit: async (m) => sent.push(m) };
  const vc = { id: 'vc1', members, send: async (m) => (sent.push(m), message) };
  const guild = { id: 'g', name: 'The Spot', channels: { cache: new Collection([['vc1', vc]]) }, members: { cache: members } };
  const draft = createHubDraft({
    supabase: { from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [{ discord_user_id: 'e', xp: 5000 }] }) }) }) }) },
    hubOf: async () => ({ on: true, lobbies: ['club1'] }),
    getGuildState: async () => ({ clubVcLinks: { club1: 'vc1' } }),
    getUserPrefs: async (g, id) => (id === 'c' ? ['GK'] : []),
  });
  const replies = [];
  const ix = (user, customId, values) => ({ guildId: 'g', guild, customId, values, user: { id: user }, member: { voice: { channelId: 'vc1' } }, message, deferReply: async () => {}, deferUpdate: async () => {}, editReply: async (m) => replies.push(m), reply: async (m) => replies.push(m) });
  await draft.handleInteraction(ix('a', 'pd_new'));
  assert.match(replies.at(-1).content, /you captain against <@e>/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
  await draft.handleInteraction(ix('e', 'pd_pick', ['c']));
  assert.match(replies.at(-1).content, /<@a>'s pick/);
  await draft.handleInteraction(ix('a', 'pd_pick', ['c']));
  await draft.handleInteraction(ix('e', 'pd_pick', ['b']));
  await draft.handleInteraction(ix('e', 'pd_pick', ['d']));
  const last = sent.at(-1);
  assert.equal(last.files.length, 1);
  const e = last.embeds[0].toJSON();
  assert.match(e.fields[0].value, /<@c> GK/);
  assert.match(e.fields[1].value, /<@b>[\s\S]*<@d>/);
  clearTimeout(draft.drafts.get('m1').timer);
});
