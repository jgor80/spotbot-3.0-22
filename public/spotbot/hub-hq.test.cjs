const test = require('node:test');
const assert = require('node:assert');
const { createHubHq, banner, hqPosts, CATEGORIES } = require('./hub-hq.cjs');

test('every HQ post points at real channels and fits an embed', () => {
  const keys = new Set(CATEGORIES.flatMap((c) => c.channels.map((ch) => ch.key)));
  const posts = hqPosts({ inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1', ch: (k) => `<#${k}>`, hubName: 'The Spot' });
  for (const p of posts) {
    assert.ok(keys.has(p.channel), `${p.key} posts in a channel HQ makes`);
    assert.ok(p.description.length < 4000);
    for (const m of p.description.matchAll(/<#(\w+)>/g)) assert.ok(keys.has(m[1]), `${p.key} links #${m[1]}`);
    for (const [, url] of p.links || []) assert.match(url, /^https:\/\//);
  }
  assert.ok(posts.find((p) => p.key === 'welcome').description.includes('The Spot'));
});

test('banners render as PNG images', () => {
  const png = banner({ headline: 'Free for every club', line: 'Every feature.', chips: ['A & B', '<C>'] });
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('only bot owners can build HQ', async () => {
  const hq = createHubHq({ hubOf: async () => ({ on: true }), saveHub: async () => {}, client: () => null });
  let reply = null;
  const handled = await hq.handleInteraction({ customId: 'hq_setup', guildId: 'g', isButton: () => true, user: { id: 'someone' }, reply: async (r) => { reply = r; } });
  assert.equal(handled, true);
  assert.match(reply.content, /Only the GafferBot team/);
});
