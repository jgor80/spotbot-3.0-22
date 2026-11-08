// Link invites are one-time and never take over someone else's verified website link.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Tiny in-memory stand-in for the Supabase client: just the filters the function uses
function fakeDb(tables, users) {
  const match = (row, filters) => filters.every((f) => f(row));
  function from(name) {
    const rows = tables[name] || (tables[name] = []);
    const filters = [];
    let op = 'select', payload = null, wantRows = false;
    const q = {
      select() { wantRows = true; return q; },
      update(v) { op = 'update'; payload = v; return q; },
      insert(v) { op = 'insert'; payload = v; return q; },
      delete() { op = 'delete'; return q; },
      eq(k, v) { filters.push((r) => r[k] === v); return q; },
      neq(k, v) { filters.push((r) => r[k] !== v); return q; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return q; },
      gt(k, v) { filters.push((r) => r[k] > v); return q; },
      ilike(k, v) { const lit = String(v).replace(/\\([\\%_])/g, '$1').toLowerCase(); filters.push((r) => String(r[k] ?? '').toLowerCase() === lit); return q; },
      limit() { return q; },
      maybeSingle() { return run().then(({ data, error }) => ({ data: Array.isArray(data) ? data[0] ?? null : data, error })); },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        if (name === 'user_discord_links' && list.some((n) => rows.some((r) => r.auth_user_id === n.auth_user_id || r.discord_user_id === n.discord_user_id))) {
          return { data: null, error: { message: 'duplicate key' } };
        }
        rows.push(...list.map((r) => ({ ...r })));
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => match(r, filters));
      if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
      if (op === 'delete') hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { data: op === 'select' || wantRows ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    return q;
  }
  return { from, auth: { getUser: async (jwt) => ({ data: { user: users[jwt] ?? null } }) } };
}

function load(db) {
  const sb = require.resolve('@supabase/supabase-js');
  require.cache[sb] = { id: sb, filename: sb, loaded: true, exports: { createClient: () => db } };
  const file = path.join(__dirname, 'local-functions', 'redeem-link-invite.cjs');
  delete require.cache[file];
  let handler = null;
  globalThis.Deno = { env: { get: () => '' }, serve: (h) => { handler = h; } };
  require(file);
  return handler;
}

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const future = new Date(Date.now() + 86400000).toISOString();
function setup(links = []) {
  const tables = {
    link_invites: [{ token: TOKEN, discord_user_id: '111111111111111111', discord_username: 'victim', guild_id: 'g1', expires_at: future, used_at: null }],
    profiles: [], guild_settings: [], player_stats: [],
    user_discord_links: links,
  };
  const db = fakeDb(tables, { victimJwt: { id: 'victim-auth' }, attackerJwt: { id: 'attacker-auth' } });
  return { tables, handler: load(db) };
}
const redeem = (handler, jwt) => handler(new Request('http://x', {
  method: 'POST',
  headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
  body: JSON.stringify({ action: 'redeem', token: TOKEN, ea_username: 'AceStriker', ea_platform: 'ps5' }),
})).then(async (r) => ({ status: r.status, body: await r.json() }));

test('an invite works once, then refuses every later use', async () => {
  const { tables, handler } = setup();
  const first = await redeem(handler, 'victimJwt');
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.website_linked, true);
  const again = await redeem(handler, 'attackerJwt');
  assert.strictEqual(again.status, 410);
  assert.deepStrictEqual(tables.user_discord_links.map((l) => l.auth_user_id), ['victim-auth']);
});

test('a leaked invite cannot take over a verified Discord link', async () => {
  const { tables, handler } = setup([{ auth_user_id: 'victim-auth', discord_user_id: '111111111111111111', verified: true }]);
  const res = await redeem(handler, 'attackerJwt');
  assert.strictEqual(res.body.website_linked, false);
  assert.match(res.body.website_note, /another website account/);
  assert.deepStrictEqual(tables.user_discord_links, [{ auth_user_id: 'victim-auth', discord_user_id: '111111111111111111', verified: true }]);
});

test('an account verified to another Discord ID is left alone', async () => {
  const { tables, handler } = setup([{ auth_user_id: 'attacker-auth', discord_user_id: '222222222222222222', verified: true }]);
  const res = await redeem(handler, 'attackerJwt');
  assert.strictEqual(res.body.website_linked, false);
  assert.strictEqual(tables.user_discord_links.length, 1);
  assert.strictEqual(tables.user_discord_links[0].discord_user_id, '222222222222222222');
});

test('an unverified claim on the Discord ID is replaced by the invite holder', async () => {
  const { tables, handler } = setup([{ auth_user_id: 'attacker-auth', discord_user_id: '111111111111111111', verified: false }]);
  const res = await redeem(handler, 'victimJwt');
  assert.strictEqual(res.body.website_linked, true);
  assert.deepStrictEqual(tables.user_discord_links.map((l) => [l.auth_user_id, l.verified]), [['victim-auth', true]]);
});

test('stats move off every placeholder for the gamertag, whatever its ID spelling', async () => {
  const { tables, handler } = setup();
  tables.profiles.push({ discord_user_id: 'ea_acestriker', ea_username: 'acestriker' }, { discord_user_id: 'ea_AceStriker', ea_username: 'AceStriker' });
  tables.player_stats.push({ discord_user_id: 'ea_acestriker', guild_id: 'g1' }, { discord_user_id: 'ea_AceStriker', guild_id: 'g2' });
  const res = await redeem(handler, null);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(tables.player_stats.map((r) => r.discord_user_id), ['111111111111111111', '111111111111111111']);
  assert.deepStrictEqual(tables.profiles.map((p) => p.discord_user_id), ['111111111111111111']);
});
