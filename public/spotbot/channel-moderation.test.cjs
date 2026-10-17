const test = require('node:test');
const assert = require('node:assert');
const { Collection, PermissionsBitField, ChannelType, GatewayIntentBits, IntentsBitField } = require('discord.js');
const { createChannelModeration, bulkable, createdAt } = require('./channel-moderation.cjs');

const F = PermissionsBitField.Flags;
const GUILD = '222222222222222222';
const ME = '111111111111111111';
const BOT = '999999999999999999';
const CHANNEL = '555555555555555555';
const DISCORD_EPOCH = 1420070400000n;
const DAY = 24 * 60 * 60 * 1000;

const idAt = (ms, n = 0) => String(((BigInt(ms) - DISCORD_EPOCH) << 22n) + BigInt(n));

function fakeWorld({ userPerms = [F.ViewChannel, F.ReadMessageHistory, F.ManageMessages], botPerms = [F.ViewChannel, F.ReadMessageHistory, F.ManageMessages] } = {}) {
  const now = Date.now();
  const msgs = new Map();
  const add = (ageDays, n, extra = {}) => {
    const id = idAt(now - ageDays * DAY, n);
    msgs.set(id, { id, content: `m${n}`, author: { id: ME, username: 'striker' }, components: [], embeds: [], attachments: new Collection(), pinned: false, ...extra });
    return id;
  };
  for (let i = 0; i < 5; i++) add(1, i);
  for (let i = 5; i < 8; i++) add(30, i);
  const pinned = add(2, 8, { pinned: true });
  const panel = add(3, 9, { author: { id: BOT, username: 'GafferBot', bot: true }, components: [{ type: 1 }] });
  const log = { bulk: [], single: [] };
  const sorted = () => [...msgs.values()].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
  const channel = {
    id: CHANNEL,
    guildId: GUILD,
    name: 'general',
    type: ChannelType.GuildText,
    isTextBased: () => true,
    permissionsFor: (who) => new PermissionsBitField(who.id === BOT ? botPerms : userPerms),
    bulkDelete: async (ids) => {
      log.bulk.push(ids);
      const gone = new Collection();
      for (const id of ids) if (bulkable(id)) { gone.set(id, msgs.get(id)); msgs.delete(id); }
      return gone;
    },
    messages: {
      fetch: async (opts) => {
        if (typeof opts === 'string') {
          if (!msgs.has(opts)) throw new Error('Unknown Message');
          return msgs.get(opts);
        }
        let list = sorted();
        if (opts.before) list = list.filter((m) => BigInt(m.id) < BigInt(opts.before));
        return new Collection(list.slice(0, opts.limit).map((m) => [m.id, m]));
      },
      delete: async (id) => {
        log.single.push(id);
        msgs.delete(id);
      },
    },
  };
  const member = { id: ME };
  const guild = {
    id: GUILD,
    members: { fetch: async (id) => (id === ME ? member : null), me: { id: BOT } },
    channels: { cache: new Collection([[CHANNEL, channel]]), fetch: async () => null },
  };
  const client = {
    user: { id: BOT },
    options: { intents: new IntentsBitField([GatewayIntentBits.Guilds]) },
    guilds: { cache: new Collection([[GUILD, guild]]) },
  };
  const mod = createChannelModeration({ getClient: () => client });
  return { mod, msgs, log, pinned, panel };
}

const args = (extra = {}) => ({ guildId: GUILD, userId: ME, channelId: CHANNEL, ...extra });

test('message ids carry their creation time', () => {
  const t = Date.now() - 20 * DAY;
  assert.ok(Math.abs(createdAt(idAt(t)) - t) < 2);
  assert.equal(bulkable(idAt(Date.now() - DAY)), true);
  assert.equal(bulkable(idAt(Date.now() - 15 * DAY)), false);
});

test('read lists newest first, flags panels and pins, and pages', async () => {
  const { mod, panel, pinned } = fakeWorld();
  const r = await mod.handle('read', args({ limit: 4 }));
  assert.equal(r.messages.length, 4);
  assert.ok(BigInt(r.messages[0].id) > BigInt(r.messages[1].id));
  assert.equal(r.older, r.messages[3].id);
  const all = await mod.handle('read', args({ limit: 100 }));
  assert.ok(all.messages.find((m) => m.id === panel).gafferbot_panel);
  assert.ok(all.messages.find((m) => m.id === pinned).pinned);
});

test('clear plan counts recent and old, keeping pins and panels', async () => {
  const { mod, msgs } = fakeWorld();
  const p = await mod.handle('plan', args({ mode: 'clear' }));
  assert.equal(p.will_delete, 8);
  assert.equal(p.recent_bulk, 5);
  assert.equal(p.older_one_by_one, 3);
  assert.deepEqual(p.kept, { pinned: 1, gafferbot_panel: 1 });
  assert.equal(msgs.size, 10, 'plan deleted something');
});

test('clear bulk deletes recent, deletes old one by one, keeps pins and panels', async () => {
  const { mod, msgs, log, pinned, panel } = fakeWorld();
  const j = await mod.handle('clear', args());
  assert.equal(j.done, true);
  assert.equal(j.deleted, 8);
  assert.equal(log.bulk.length, 1);
  assert.equal(log.bulk[0].length, 5);
  assert.equal(log.single.length, 3);
  assert.deepEqual([...msgs.keys()].sort(), [pinned, panel].sort());
  const again = await mod.handle('status', { guildId: GUILD, userId: ME, jobId: j.job_id });
  assert.equal(again.deleted, 8);
});

test('delete by id includes pins and panels only when asked', async () => {
  const { mod, msgs, pinned, panel } = fakeWorld();
  const kept = await mod.handle('delete', args({ messageIds: [pinned, panel] }));
  assert.equal(kept.deleted, 0);
  assert.equal(msgs.size, 10);
  const gone = await mod.handle('delete', args({ messageIds: [pinned, panel], includeKept: true }));
  assert.equal(gone.deleted, 2);
  assert.equal(msgs.size, 8);
});

test('missing permissions are named for the player and the bot', async () => {
  const noManage = fakeWorld({ userPerms: [F.ViewChannel, F.ReadMessageHistory] });
  await noManage.mod.handle('read', args());
  await assert.rejects(noManage.mod.handle('clear', args()), /Manage Messages/);
  const botless = fakeWorld({ botPerms: [F.ViewChannel, F.ReadMessageHistory] });
  await assert.rejects(botless.mod.handle('plan', args({ mode: 'clear' })), /GafferBot is missing Manage Messages/);
  const blind = fakeWorld({ botPerms: [F.ViewChannel] });
  await assert.rejects(blind.mod.handle('read', args()), /Read Message History/);
});
