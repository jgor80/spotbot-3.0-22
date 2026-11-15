const test = require('node:test');
const assert = require('node:assert');
const addBot = require('./add-bot.cjs');

test('add-bot link uses the live app id, bot scopes and permissions', () => {
  addBot.setAppId('123');
  assert.equal(addBot.addBotUrl(), 'https://discord.com/oauth2/authorize?client_id=123&permissions=309591534673&scope=bot%20applications.commands');
  const b = addBot.addBotButton().toJSON();
  assert.equal(b.url, addBot.addBotUrl());
  assert.equal(b.style, 5);
});

test('profile Add App button is only set when the app has none', async () => {
  const calls = [];
  const client = (installParams) => ({ application: { fetch: async () => ({ id: '9', installParams }) }, rest: { patch: async (route, opts) => calls.push([route, opts.body]) } });
  assert.equal(await addBot.ensureInstallLink(client({ scopes: ['bot'] })), false);
  assert.equal(calls.length, 0);
  assert.equal(await addBot.ensureInstallLink(client(null)), true);
  assert.deepEqual(calls[0], ['/applications/@me', { install_params: { scopes: ['bot', 'applications.commands'], permissions: '309591534673' } }]);
});
