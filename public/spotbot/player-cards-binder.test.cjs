// The card binder only shows cards for a verified Discord link, never for a claim typed on the website
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function fakeDb(tables) {
  return {
    auth: { getUser: async (jwt) => ({ data: { user: jwt === 'userJwt' ? { id: 'attacker-auth' } : null }, error: null }) },
    storage: { from: () => ({ createSignedUrl: async (p) => ({ data: { signedUrl: `signed:${p}` } }) }) },
    from(name) {
      const filters = [];
      const q = {
        select: () => q,
        eq: (k, v) => { filters.push((r) => r[k] === v); return q; },
        in: (k, vs) => { filters.push((r) => vs.includes(r[k])); return q; },
        order: () => q,
        limit: () => q,
        then: (res, rej) => Promise.resolve({ data: (tables[name] || []).filter((r) => filters.every((f) => f(r))), error: null }).then(res, rej),
      };
      return q;
    },
  };
}

function load(db) {
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => db } };
  const file = path.join(__dirname, 'local-functions', 'player-cards.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: () => '' }, serve: (h) => { handler = h; } };
  require(file);
  return handler;
}

const binder = (handler) => handler(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer userJwt' }, body: JSON.stringify({ action: 'binder' }) }))
  .then((r) => r.json());

test('an unverified link to someone else shows none of their cards', async () => {
  const handler = load(fakeDb({
    user_discord_links: [{ auth_user_id: 'attacker-auth', discord_user_id: '111111111111111111', verified: false }],
    player_cards: [{ id: 'c1', discord_user_id: '111111111111111111', storage_path: 'front.png', back_path: 'back.png' }],
  }));
  assert.deepStrictEqual((await binder(handler)).cards, []);
});

test('a verified link shows the member their own cards', async () => {
  const handler = load(fakeDb({
    user_discord_links: [{ auth_user_id: 'attacker-auth', discord_user_id: '111111111111111111', verified: true }],
    player_cards: [{ id: 'c1', discord_user_id: '111111111111111111', storage_path: 'front.png', back_path: 'back.png' }],
  }));
  const { cards } = await binder(handler);
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].front_url, 'signed:front.png');
});
