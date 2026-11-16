const test = require('node:test');
const assert = require('node:assert');
const { postStats } = require('./bot-lists.cjs');

const client = { user: { id: '42' }, guilds: { cache: new Map([['a', { memberCount: 10 }], ['b', { memberCount: 5 }]]) } };

test('posts only to sites that have a token, with each site\'s own body', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const out = await postStats(client, { env: { TOPGG_TOKEN: 't1', DISCORD_BOTS_GG_TOKEN: 't3' }, fetchImpl });
  assert.deepEqual(out.map((o) => o.site), ['top.gg', 'discord.bots.gg']);
  assert.equal(calls[0].url, 'https://top.gg/api/bots/42/stats');
  assert.deepEqual(JSON.parse(calls[0].init.body), { server_count: 2 });
  assert.equal(calls[0].init.headers.Authorization, 't1');
  assert.deepEqual(JSON.parse(calls[1].init.body), { guildCount: 2 });
});

test('no tokens, no requests', async () => {
  let n = 0;
  await postStats(client, { env: {}, fetchImpl: async () => { n++; return { ok: true }; } });
  assert.equal(n, 0);
});
