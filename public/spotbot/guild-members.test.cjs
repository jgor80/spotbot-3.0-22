const test = require('node:test');
const assert = require('node:assert');
const { createGuildMembers } = require('./guild-members.cjs');

// A tiny in-memory stand-in for the guild_members table
function fakeDb() {
  const rows = new Map();
  const key = (r) => `${r.guild_id}:${r.discord_user_id}`;
  return {
    rows,
    from() {
      const filters = [];
      const q = {
        upsert: async (list) => { for (const r of list) rows.set(key(r), { ...r }); return { error: null }; },
        delete() { q.del = true; return q; },
        eq(col, v) { filters.push((r) => r[col] === v); return q; },
        lt(col, v) { filters.push((r) => r[col] < v); return q; },
        then(resolve) {
          for (const [k, r] of rows) if (filters.every((f) => f(r))) rows.delete(k);
          resolve({ error: null });
        },
      };
      return q;
    },
  };
}

const member = (id, bot = false) => ({ id, user: { bot } });
const guildWith = (id, list) => ({ id, name: id, members: { fetch: async () => new Map(list.map((m) => [m.id, m])) } });

test('a sync stores every human member and drops people who left', async () => {
  const db = fakeDb();
  const gm = createGuildMembers({ supabase: db });
  db.rows.set('g1:gone', { guild_id: 'g1', discord_user_id: 'gone', updated_at: '2020-01-01T00:00:00.000Z' });
  db.rows.set('g2:other', { guild_id: 'g2', discord_user_id: 'other', updated_at: '2020-01-01T00:00:00.000Z' });
  assert.strictEqual(await gm.syncGuild(guildWith('g1', [member('owner'), member('newbie'), member('bot', true)])), 2);
  assert.deepStrictEqual([...db.rows.keys()].sort(), ['g1:newbie', 'g1:owner', 'g2:other']);
});

test('a failed member fetch leaves the list alone', async () => {
  const db = fakeDb();
  const gm = createGuildMembers({ supabase: db, log: { warn() {} } });
  db.rows.set('g1:a', { guild_id: 'g1', discord_user_id: 'a', updated_at: '2020-01-01T00:00:00.000Z' });
  const broken = { id: 'g1', members: { fetch: async () => { throw new Error('rate limited'); } } };
  assert.strictEqual(await gm.syncAll([broken]), 0);
  assert.ok(db.rows.has('g1:a'));
});

test('joins and leaves update one row; the bot leaving clears the server', async () => {
  const db = fakeDb();
  const gm = createGuildMembers({ supabase: db });
  await gm.memberJoined({ id: 'p1', guild: { id: 'g1' }, user: { bot: false } });
  await gm.memberJoined({ id: 'p2', guild: { id: 'g1' }, user: { bot: false } });
  await gm.memberJoined({ id: 'b', guild: { id: 'g1' }, user: { bot: true } });
  assert.deepStrictEqual([...db.rows.keys()].sort(), ['g1:p1', 'g1:p2']);
  await gm.memberLeft({ id: 'p1', guild: { id: 'g1' } });
  assert.deepStrictEqual([...db.rows.keys()], ['g1:p2']);
  await gm.botLeft({ id: 'g1' });
  assert.strictEqual(db.rows.size, 0);
});
