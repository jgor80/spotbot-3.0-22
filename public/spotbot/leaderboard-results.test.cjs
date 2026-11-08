// get-leaderboard: friendlies count on a club's board, draws aren't losses, two tracked clubs playing
// each other don't swap results, and big servers aren't cut off at a row cap
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const KEY = 'service-key-'.padEnd(40, 'k');
const GUILD = '123456789012345678', P1 = '111111111111111111', P2 = '222222222222222222';

function fakeDb(tables) {
  return {
    rpc: async () => ({ data: null, error: null }),
    from(name) {
      const filters = []; let head = false, from = 0, to = Infinity;
      const rows = () => (tables[name] || []).filter((r) => filters.every((f) => f(r)));
      const q = {
        select: (_c, opts) => { head = !!opts?.head; return q; },
        eq: (k, v) => { filters.push((r) => r[k] === v); return q; },
        in: (k, vs) => { filters.push((r) => vs.includes(r[k])); return q; },
        range: (a, b) => { from = a; to = b; return q; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res) => {
          const all = rows();
          if (head) return res({ count: all.length, data: null, error: null });
          // Like the real server: never more than 1,000 rows per request
          return res({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null });
        },
      };
      for (const k of ['order', 'limit', 'or', 'not', 'gte', 'lte', 'lt', 'gt', 'neq', 'is', 'ilike', 'filter']) q[k] = () => q;
      return q;
    },
  };
}

function setup() {
  let id = 0;
  const ps = (user, match, match_type, won) => ({ id: ++id, guild_id: GUILD, discord_user_id: user, ea_match_id: match, match_type, won, goals: 0, assists: 0 });
  const cm = (club_key, match, match_type, result) => ({ id: ++id, guild_id: GUILD, club_key, ea_match_id: match, match_type, result });
  const tables = {
    guild_settings: [{ guild_id: GUILD, clubs: [{ key: 'a', name: 'A', enabled: true }, { key: 'b', name: 'B', enabled: true }] }],
    club_matches: [cm('a', 'm1', 'league', 'win'), cm('b', 'm1', 'league', 'loss'), cm('a', 'm2', 'friendly', 'draw')],
    player_stats: [ps(P1, 'm1', 'club', true), ps(P2, 'm1', 'club', false), ps(P1, 'm2', 'friendly', false)],
  };
  for (let i = 0; i < 1100; i++) {
    tables.club_matches.push(cm('a', `l${i}`, 'league', 'loss'));
    tables.player_stats.push(ps(P1, `l${i}`, 'club', false));
  }
  return tables;
}

async function board(body) {
  const tables = setup();
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => fakeDb(tables) } };
  const file = path.join(__dirname, 'local-functions', 'get-leaderboard.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: KEY })[k] ?? '' }, serve: (h) => { handler = typeof h === 'function' ? h : h?.handler; } };
  require(file);
  const res = await handler(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body: JSON.stringify({ guild_id: GUILD, limit: 10, ...body }) }));
  const json = await res.json();
  assert.strictEqual(res.status, 200, JSON.stringify(json));
  return new Map(json.entries.map((e) => [e.discord_user_id, [e.wins, e.draws, e.losses]]));
}

test("a club's board counts friendlies, draws and every page of games", async () => {
  const entries = await board({ club_key: 'a', stats_source: 'games' });
  assert.deepStrictEqual(entries.get(P1), [1, 1, 1100]);
});

test('two tracked clubs playing each other keep their own results', async () => {
  const entries = await board({ stats_source: 'games' });
  assert.deepStrictEqual(entries.get(P1), [1, 1, 1100]);
  assert.deepStrictEqual(entries.get(P2), [0, 0, 1]);
});
