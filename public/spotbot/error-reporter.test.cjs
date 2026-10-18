const test = require('node:test');
const assert = require('node:assert');
const { createErrorReporter, interactionContext, signatureOf } = require('./error-reporter.cjs');

function setup() {
  const posts = [];
  let t = 0;
  const reporter = createErrorReporter({
    webhookUrl: 'https://discord.test/hook',
    fetchImpl: async (url, init) => { posts.push(JSON.parse(init.body)); return { ok: true }; },
    now: () => t,
    log: { warn() {} },
  });
  return { reporter, posts, advance: (ms) => { t += ms; } };
}

test('each distinct error posts once, repeats are counted into the next window', async () => {
  const { reporter, posts, advance } = setup();
  const err = new Error('boom');
  assert.equal(await reporter.report(err, { source: 'interaction', action: 'gs_render' }), true);
  assert.equal(await reporter.report(err, { source: 'interaction', action: 'gs_render' }), false);
  assert.equal(await reporter.report(err, { source: 'interaction', action: 'gs_render' }), false);
  assert.equal(posts.length, 1);
  assert.match(posts[0].content, /Bot error/);
  assert.match(posts[0].content, /gs_render/);
  assert.deepEqual(posts[0].allowed_mentions, { parse: [] });

  advance(61 * 60 * 1000);
  assert.equal(await reporter.report(err, { source: 'interaction', action: 'gs_render' }), true);
  assert.match(posts[1].content, /3 times in the previous hour/);
});

test('ids in messages do not make every error look new', () => {
  const fail = (id) => new Error(`Unknown guild ${id}`);
  const a = signatureOf(fail('1529555651762851930'));
  const b = signatureOf(fail('1111111111111111111'));
  assert.equal(a, b);
});

test('a flood of different errors stops at the hourly post cap', async () => {
  const { reporter, posts } = setup();
  for (let i = 0; i < 50; i++) await reporter.report(new Error(`different ${'x'.repeat(i)}`));
  assert.equal(posts.length, 30);
});

test('without a webhook it never posts', async () => {
  const calls = [];
  const reporter = createErrorReporter({ webhookUrl: '', fetchImpl: async () => calls.push(1) });
  assert.equal(await reporter.report(new Error('x')), false);
  assert.equal(calls.length, 0);
  assert.equal(reporter.enabled, false);
});

test('interaction context names the action and server, never content', () => {
  const ctx = interactionContext({ guildId: '42', customId: 'lineup_move:abc:def', __webPanel: true });
  assert.deepEqual(ctx, { source: 'interaction', guild: '42', action: 'lineup_move', via: 'Control Room' });
  const slash = interactionContext({ guildId: '42', commandName: 'manager', options: { getSubcommand: () => null } });
  assert.equal(slash.action, '/manager');
});
