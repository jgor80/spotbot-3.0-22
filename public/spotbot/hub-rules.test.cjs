const test = require('node:test');
const assert = require('node:assert');
const { createHubRules, rulesText, cleanRules, DEFAULT_RULES, AGREED_ROLE } = require('./hub-rules.cjs');

test('rulesText uses the server\'s own text or the default, with the server name filled in', () => {
  assert.match(rulesText({}, 'The Spot'), /Welcome to \*\*The Spot\*\*/);
  assert.ok(!rulesText({}, 'The Spot').includes('{server}'));
  assert.equal(rulesText({ rules_text: 'Be nice at {server}.' }, 'The Spot'), 'Be nice at The Spot.');
  assert.ok(DEFAULT_RULES.length < 4000);
});

test('cleanRules stops @everyone and @here pings and keeps the length an embed holds', () => {
  assert.ok(!/@everyone|@here/.test(cleanRules('hi @everyone and @here')));
  assert.equal(cleanRules('x'.repeat(5000)).length, 4000);
});

test('I agree gives the Rules agreed role once, making it if needed', async () => {
  const created = [];
  const added = [];
  const guild = { roles: { cache: { size: 0 }, fetch: async () => ({ find: () => null }), create: async (o) => { const r = { id: 'r1', ...o }; created.push(r); return r; } } };
  const rules = createHubRules({ hubOf: async () => ({ on: true }), saveHub: async () => {} });
  const member = { roles: { cache: { has: () => false }, add: async (r) => added.push(r.id) } };
  assert.match(await rules.agree(guild, member), /Thanks/);
  assert.equal(created[0].name, AGREED_ROLE);
  assert.equal(created[0].mentionable, false);
  assert.deepEqual(added, ['r1']);
  const post = rules.rulesPost({ name: 'The Spot' }, {});
  assert.deepEqual(post.allowedMentions, { parse: [] });
  assert.deepEqual(post.components[0].components.map((b) => b.data.custom_id), ['rl_ok', 'rl_edit']);
});
