// The Scouting page scouts a club by name: the function finds the club on EA and returns real stats
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const KEY = 'service-key-'.padEnd(40, 'k');
function load() {
  const writes = [];
  const q = (name) => {
    const chain = new Proxy({}, { get: (_t, k) => {
      if (k === 'then') return (res) => res({ data: [], error: null });
      if (k === 'maybeSingle') return async () => ({ data: null, error: null });
      if (k === 'insert' || k === 'update') return (v) => { writes.push([name, v]); return chain; };
      return () => chain;
    } });
    return chain;
  };
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => ({ from: q, rpc: async () => ({ data: null }) }) } };
  const file = path.join(__dirname, 'local-functions', 'scout-opponent-club.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: KEY })[k] ?? '' }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  return { handler, writes };
}

test('a club name is looked up on EA, preferring the exact name', async () => {
  const { handler, writes } = load();
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/clubs/search')) return Response.json([{ clubId: 1, name: 'Rovers Reserve' }, { clubId: 42, name: 'Rovers' }]);
    if (String(url).includes('/clubs/info')) return Response.json([{ clubId: 42, name: 'Rovers' }]);
    if (String(url).includes('/members/stats')) return Response.json({ members: [{ name: 'Striker9', gamesPlayed: '20', goals: '15', assists: '3', ratingAve: '7.8', favoritePosition: 'forward' }] });
    return new Response('{}', { status: 404 });
  };
  try {
    const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ guild_id: '123456789012345678', club_name: 'rovers', platform: 'ps5' }) }));
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ea_club_id, '42');
    assert.strictEqual(body.club_name, 'Rovers');
    assert.deepStrictEqual(body.players.map((p) => [p.name, p.goals]), [['Striker9', 15]]);
    assert.ok(urls.some((u) => u.includes('members/stats') && u.includes('clubId=42')));
    assert.strictEqual(writes.filter(([t]) => t === 'scouted_players').length, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('a name EA has never heard of is a clear 404', async () => {
  const { handler } = load();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  try {
    const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ guild_id: '123456789012345678', club_name: 'Nobody FC', platform: 'ps5' }) }));
    assert.strictEqual(res.status, 404);
    assert.match((await res.json()).error, /Nobody FC/);
  } finally { globalThis.fetch = realFetch; }
});
