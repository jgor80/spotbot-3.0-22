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

test('guides: one forum post each, valid tags, banners and links', () => {
  const { guides, GUIDE_TAGS } = require('./hub-guides.cjs');
  const all = guides({ ch: (k) => `<#${k}>` });
  assert.ok(all.length >= 15);
  assert.ok(GUIDE_TAGS.length <= 20);
  assert.equal(new Set(all.map((g) => g.key)).size, all.length);
  const keys = new Set(CATEGORIES.flatMap((c) => c.channels.map((ch) => ch.key)));
  for (const g of all) {
    assert.ok(g.title.length <= 100, `${g.key} title fits a forum post name`);
    assert.ok(g.body.length < 4000, `${g.key} fits an embed`);
    assert.ok(g.tags.length >= 1 && g.tags.length <= 5);
    for (const t of g.tags) assert.ok(GUIDE_TAGS.includes(t), `${g.key} tag ${t}`);
    for (const m of g.body.matchAll(/<#(\w+)>/g)) assert.ok(keys.has(m[1]), `${g.key} links #${m[1]}`);
    assert.ok(g.banner.headline && g.banner.line);
  }
  const posts = hqPosts({ inviteUrl: 'https://x', ch: (k) => `<#${k}>`, hubName: 'The Spot' }).filter((p) => p.channel === 'guides');
  assert.equal(posts.length, all.length);
  assert.equal(posts.at(-1).key, 'guide_start', 'Start here goes up last so it sits on top');
  assert.equal(posts.filter((p) => p.pin).length, 1);
  assert.ok(CATEGORIES[0].channels.find((c) => c.key === 'guides').forum);
});

test('every guide banner renders', () => {
  const { guides } = require('./hub-guides.cjs');
  for (const g of guides()) assert.deepEqual([...banner(g.banner).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('tag names map to forum tag ids; saved posts map to their channel', () => {
  const { tagIds, postChannelKey } = require('./hub-hq.cjs');
  assert.deepEqual(tagIds({ availableTags: [{ id: '1', name: 'Players' }, { id: '2', name: 'Stats' }] }, ['Stats', 'Nope', 'Players']), ['2', '1']);
  assert.deepEqual(tagIds(null, ['Stats']), []);
  assert.equal(postChannelKey('guide_stats'), 'guides');
  assert.equal(postChannelKey('support_guide'), 'support');
  assert.equal(postChannelKey('pricing'), 'pricing');
});
