const test = require('node:test');
const assert = require('node:assert');
const { guard, isEphemeral } = require('./ack-guard.cjs');

const quiet = { warn() {} };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal stand-in for a discord.js interaction that records the API calls and enforces ack order
function fake({ component = false } = {}) {
  const calls = [];
  const i = {
    deferred: false,
    replied: false,
    customId: component ? 'btn' : undefined,
    commandName: component ? undefined : 'manager',
    isAutocomplete: () => false,
    isRepliable: () => true,
    isMessageComponent: () => component,
    async reply(o) { if (this.deferred || this.replied) throw new Error('already acked'); this.replied = true; calls.push(['reply', o]); },
    async deferReply(o) { if (this.deferred || this.replied) throw new Error('already acked'); this.deferred = true; calls.push(['deferReply', o]); },
    async deferUpdate() { if (this.deferred || this.replied) throw new Error('already acked'); this.deferred = true; calls.push(['deferUpdate']); },
    async update(o) { if (this.deferred || this.replied) throw new Error('already acked'); this.replied = true; calls.push(['update', o]); },
    async showModal(m) { if (this.deferred || this.replied) throw new Error('already acked'); this.replied = true; calls.push(['showModal', m]); },
    async editReply(o) { if (!this.deferred && !this.replied) throw new Error('not acked'); calls.push(['editReply', o]); return { id: 'orig' }; },
    async followUp(o) { if (!this.deferred && !this.replied) throw new Error('not acked'); calls.push(['followUp', o]); return { id: 'f1' }; },
    async deleteReply(id) { calls.push(['deleteReply', id]); },
  };
  return { i, calls };
}

test('fast handlers are untouched', async () => {
  const { i, calls } = fake();
  const release = guard(i, { delay: 20, log: quiet });
  await i.reply({ content: 'hi', flags: 64 });
  release();
  await wait(40);
  assert.deepStrictEqual(calls.map((c) => c[0]), ['reply']);
});

test('slow command: public reply becomes an edit of the deferred reply', async () => {
  const { i, calls } = fake();
  guard(i, { delay: 10, log: quiet });
  await wait(30);
  await i.reply({ content: 'done', fetchReply: true });
  assert.deepStrictEqual(calls, [['deferReply', undefined], ['editReply', { content: 'done' }]]);
});

test('slow command: ephemeral reply is sent privately and the thinking message removed', async () => {
  const { i, calls } = fake();
  guard(i, { delay: 10, log: quiet });
  await wait(30);
  await i.reply({ content: 'secret', flags: 64 });
  assert.deepStrictEqual(calls.map((c) => c[0]), ['deferReply', 'followUp', 'deleteReply']);
  assert.strictEqual(calls[1][1].flags, 64);
});

test('slow command: handler deferReply(ephemeral) then editReply goes to a private follow-up', async () => {
  const { i, calls } = fake();
  guard(i, { delay: 10, log: quiet });
  await wait(30);
  await i.deferReply({ flags: 64 });
  await i.editReply({ content: 'one' });
  await i.editReply({ content: 'two' });
  assert.deepStrictEqual(calls.map((c) => c[0]), ['deferReply', 'followUp', 'deleteReply', 'editReply']);
  assert.deepStrictEqual(calls[3][1], { content: 'two', message: 'f1' });
});

test('slow button: update edits the message, reply becomes a follow-up', async () => {
  const { i, calls } = fake({ component: true });
  guard(i, { delay: 10, log: quiet });
  await wait(30);
  await i.update({ content: 'new', components: [] });
  await i.reply({ content: 'note', ephemeral: true });
  assert.deepStrictEqual(calls.map((c) => c[0]), ['deferUpdate', 'editReply', 'followUp']);
});

test('slow button: modal can no longer open, user is told to press again', async () => {
  const { i, calls } = fake({ component: true });
  guard(i, { delay: 10, log: quiet });
  await wait(30);
  await i.showModal({});
  assert.deepStrictEqual(calls.map((c) => c[0]), ['deferUpdate', 'followUp']);
});

test('panel proxies inherit the guard', async () => {
  const { i, calls } = fake();
  guard(i, { delay: 10, log: quiet });
  const proxy = Object.create(i);
  await wait(30);
  await proxy.reply({ content: 'x' });
  assert.strictEqual(proxy.replied, true);
  assert.deepStrictEqual(calls.map((c) => c[0]), ['deferReply', 'editReply']);
});

test('a handler call racing the auto-defer waits for it', async () => {
  const { i, calls } = fake();
  guard(i, { delay: 5, log: quiet });
  await wait(6);
  await i.reply({ content: 'late' });
  assert.ok(['reply', 'deferReply'].includes(calls[0][0]));
  assert.ok(calls.length <= 2);
});

test('autocomplete is never deferred', async () => {
  const { i, calls } = fake();
  i.isAutocomplete = () => true;
  guard(i, { delay: 5, log: quiet });
  await wait(20);
  assert.strictEqual(calls.length, 0);
});

test('isEphemeral reads flags in every form', () => {
  assert.ok(isEphemeral({ flags: 64 }));
  assert.ok(isEphemeral({ ephemeral: true }));
  assert.ok(isEphemeral({ flags: ['Ephemeral'] }));
  assert.ok(!isEphemeral({ content: 'x' }));
  assert.ok(!isEphemeral('text'));
});
