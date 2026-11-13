const test = require('node:test');
const assert = require('node:assert');
const { placeSticky, SUPPRESS_NOTIFICATIONS } = require('./sticky-post.cjs');
const { MessageFlags } = require('discord.js');

const BOT = 'bot1';
function fakeChannel(history) {
  const log = { sent: [], edited: [], deleted: [] };
  const msgs = history.map((h, i) => ({
    id: `m${i}`, createdTimestamp: 1000 + i, author: { id: h.author }, panel: !!h.panel,
    edit: async (p) => { log.edited.push({ id: `m${i}`, p }); return { id: `m${i}` }; },
    delete: async () => { log.deleted.push(`m${i}`); },
  }));
  const channel = {
    client: { user: { id: BOT } },
    messages: {
      fetch: async () => new Map(msgs.map((m) => [m.id, m])),
      delete: async (id) => { log.deleted.push(id); },
    },
    send: async (p) => { log.sent.push(p); return { id: 'new' }; },
  };
  return { channel, log };
}
const isOurs = (m) => m.panel;
const payload = { embeds: [{ title: 'Panel' }], components: [] };

test('flag matches discord.js SuppressNotifications', () => {
  assert.strictEqual(SUPPRESS_NOTIFICATIONS, MessageFlags.SuppressNotifications);
});

test('after a restart, a panel still at the bottom is edited in place, nothing is posted', async () => {
  const { channel, log } = fakeChannel([{ author: BOT, panel: true }, { author: 'u1' }, { author: BOT, panel: true }]);
  const sent = await placeSticky(channel, payload, { isOurs });
  assert.strictEqual(sent.id, 'm2');
  assert.strictEqual(log.sent.length, 0);
  assert.deepStrictEqual(log.edited.map((e) => e.id), ['m2']);
  assert.deepStrictEqual(log.deleted, ['m0']);
  assert.deepStrictEqual(log.edited[0].p.allowedMentions, { parse: [] });
});

test('after a restart, a buried panel is replaced by a silent post', async () => {
  const { channel, log } = fakeChannel([{ author: BOT, panel: true }, { author: 'u1' }]);
  await placeSticky(channel, payload, { isOurs });
  assert.deepStrictEqual(log.deleted, ['m0']);
  assert.strictEqual(log.sent.length, 1);
  assert.strictEqual(log.sent[0].flags, SUPPRESS_NOTIFICATIONS);
  assert.deepStrictEqual(log.sent[0].allowedMentions, { parse: [] });
});

test('moving the panel down during a session deletes the old one and posts silently', async () => {
  const { channel, log } = fakeChannel([]);
  await placeSticky(channel, payload, { knownId: 'old', isOurs });
  assert.deepStrictEqual(log.deleted, ['old']);
  assert.strictEqual(log.sent[0].flags, SUPPRESS_NOTIFICATIONS);
});
