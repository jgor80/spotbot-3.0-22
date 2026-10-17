// Channel moderation for AI apps connected with manage access (gafferbot-mcp/moderation.ts): read a
// channel's recent messages, delete chosen messages (any age), or clear a whole channel.
//
// The player's own Discord permissions decide what they can do, exactly as in Discord: reading needs
// View Channel + Read Message History for them in that channel, deleting needs Manage Messages there
// (and a club leader, checked by the MCP side). The bot needs the same permissions and is told so
// plainly when it lacks them.
//
// Discord only bulk deletes messages under 14 days old, so newer ones go 100 at a time and older ones
// one by one (discord.js queues them under Discord's rate limits). Deletes run as a background job the
// caller polls, since an old channel can take minutes. Pinned messages and GafferBot's own panels
// (sticky stats/manager panels and other bot messages with buttons) are kept unless asked for.
//
// Reached in-process through globalThis.__gafferbotModeration.

const crypto = require('crypto');
const { PermissionsBitField, ChannelType, GatewayIntentBits } = require('discord.js');

const F = PermissionsBitField.Flags;
const DISCORD_EPOCH = 1420070400000n;
// Bulk delete refuses anything 14 days or older; keep a margin so a slow batch never crosses it
const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000;
const READ_MAX = 100;
const DELETE_IDS_MAX = 100;
// A preview counts at most this many messages; a clear deletes at most CLEAR_MAX per job
const SCAN_MAX = 2000;
const CLEAR_MAX = 10000;
const WAIT_MS = 15000;
const JOB_TTL_MS = 60 * 60 * 1000;
const TEXT_MAX = 1500;
const DM_TYPES = [ChannelType.DM, ChannelType.GroupDM];

class ModerationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());
const SNOWFLAKE = /^\d{17,20}$/;

function createdAt(id) {
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

const bulkable = (id, now = Date.now()) => now - createdAt(id) < BULK_MAX_AGE_MS;

// GafferBot's own panels: messages the bot posted that carry buttons or menus (the sticky stats and
// manager panels, event boards, setup panels). Clearing them would break those features until reposted.
function isPanel(message, botId) {
  return message.author?.id === botId && (message.components?.length || 0) > 0;
}

// Why a message is kept by default, or null when it goes
function keepReason(message, botId, includeKept) {
  if (includeKept) return null;
  if (message.pinned) return 'pinned';
  if (isPanel(message, botId)) return 'gafferbot_panel';
  return null;
}

function messageInfo(message, botId, contentHidden) {
  let text = message.content || '';
  if (!text && contentHidden && !message.author?.bot) text = '(text hidden: the bot runs without the Message Content intent)';
  for (const e of message.embeds || []) {
    const bits = [e.title, e.description].filter(Boolean).join(' - ');
    if (bits) text += `${text ? '\n' : ''}[embed] ${bits}`;
  }
  if (text.length > TEXT_MAX) text = `${text.slice(0, TEXT_MAX)}…`;
  return {
    id: message.id,
    author: message.member?.displayName || message.author?.globalName || message.author?.username || 'unknown',
    author_id: message.author?.id || null,
    bot: !!message.author?.bot,
    created_at: new Date(createdAt(message.id)).toISOString(),
    text,
    ...(message.attachments?.size ? { attachments: [...message.attachments.values()].map((a) => a.name) } : {}),
    ...(message.pinned ? { pinned: true } : {}),
    ...(isPanel(message, botId) ? { gafferbot_panel: true } : {}),
    ...(message.editedTimestamp ? { edited: true } : {}),
  };
}

function createChannelModeration({ getClient }) {
  const jobs = new Map();
  const busyChannels = new Set();

  setInterval(() => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, j] of jobs) if (j.done && j.finishedAt < cutoff) jobs.delete(id);
  }, 5 * 60 * 1000).unref?.();

  function contentHidden(client) {
    try {
      return !client.options?.intents?.has?.(GatewayIntentBits.MessageContent);
    } catch {
      return false;
    }
  }

  // The player's member and the channel, after checking both their and the bot's permissions
  async function channelFor({ guildId, userId, channelId }, write) {
    const client = getClient();
    const guild = client?.guilds?.cache.get(guildId);
    if (!guild) throw new ModerationError(404, 'GafferBot is not in that server (or is still starting up).');
    if (!SNOWFLAKE.test(String(channelId || ''))) throw new ModerationError(400, 'channel_id must be a Discord channel ID.');
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) throw new ModerationError(403, "Your Discord account isn't a member of that server.");
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || channel.guildId !== guild.id || DM_TYPES.includes(channel.type) || !channel.isTextBased?.() || !channel.messages) {
      throw new ModerationError(400, 'Pick a text channel in this server.');
    }
    const name = `#${channel.name}`;
    const mine = channel.permissionsFor(member);
    if (!mine?.has([F.ViewChannel, F.ReadMessageHistory])) throw new ModerationError(403, `You can't read the history of ${name} in Discord, so GafferBot won't read it for you.`);
    if (write && !mine.has(F.ManageMessages)) throw new ModerationError(403, `You need Manage Messages in ${name} to delete messages there.`);
    const me = guild.members.me;
    const botPerms = channel.permissionsFor(me);
    const need = [[F.ViewChannel, 'View Channel'], [F.ReadMessageHistory, 'Read Message History']];
    if (write) need.push([F.ManageMessages, 'Manage Messages']);
    const missing = need.filter(([flag]) => !botPerms?.has(flag)).map(([, n]) => n);
    if (missing.length) {
      throw new ModerationError(403, `GafferBot is missing ${missing.join(', ')} in ${name}. Give its role those permissions in the channel settings, then try again.`);
    }
    return { client, guild, channel, botId: client.user?.id };
  }

  // ---------- Reading ----------

  // Text channels whose history the player can read, with whether they could delete there
  async function channels({ guildId, userId }) {
    const client = getClient();
    const guild = client?.guilds?.cache.get(guildId);
    if (!guild) throw new ModerationError(404, 'GafferBot is not in that server (or is still starting up).');
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) throw new ModerationError(403, "Your Discord account isn't a member of that server.");
    const me = guild.members.me;
    const out = [];
    for (const c of guild.channels.cache.values()) {
      if (!c.isTextBased?.() || !c.messages || DM_TYPES.includes(c.type)) continue;
      const mine = c.permissionsFor(member);
      if (!mine?.has([F.ViewChannel, F.ReadMessageHistory])) continue;
      const bot = c.permissionsFor(me);
      out.push({
        id: c.id,
        name: c.name,
        ...(c.parent?.name ? { category: c.parent.name } : {}),
        you_can_delete: !!mine.has(F.ManageMessages),
        bot_can_read: !!bot?.has([F.ViewChannel, F.ReadMessageHistory]),
        bot_can_delete: !!bot?.has([F.ViewChannel, F.ReadMessageHistory, F.ManageMessages]),
        position: (c.parent?.rawPosition ?? -1) * 1000 + (c.rawPosition ?? 0),
      });
    }
    return { channels: out.sort((a, b) => a.position - b.position).map(({ position, ...c }) => c).slice(0, 200) };
  }

  async function read(args) {
    const { client, channel, botId } = await channelFor(args, false);
    const limit = Math.min(READ_MAX, Math.max(1, Number(args.limit) || 50));
    const opts = { limit };
    if (SNOWFLAKE.test(String(args.before || ''))) opts.before = String(args.before);
    const list = await channel.messages.fetch(opts);
    const hidden = contentHidden(client);
    const messages = [...list.values()].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1)).map((m) => messageInfo(m, botId, hidden));
    return {
      channel: { id: channel.id, name: channel.name },
      messages,
      older: messages.length === limit ? messages[messages.length - 1].id : null,
    };
  }

  // ---------- Picking what to delete ----------

  async function fetchByIds(channel, ids) {
    const found = [];
    const missing = [];
    for (const id of ids) {
      const m = await channel.messages.fetch(id).catch(() => null);
      if (m) found.push(m);
      else missing.push(id);
    }
    return { found, missing };
  }

  function tally(messages, botId, includeKept, now = Date.now()) {
    const out = { deletable: [], kept: { pinned: 0, gafferbot_panel: 0 } };
    for (const m of messages) {
      const why = keepReason(m, botId, includeKept);
      if (why) out.kept[why] += 1;
      else out.deletable.push(m.id);
    }
    const recent = out.deletable.filter((id) => bulkable(id, now)).length;
    return { ...out, recent, older: out.deletable.length - recent };
  }

  function cleanIds(list) {
    const ids = [...new Set((Array.isArray(list) ? list : []).map(String).filter((id) => SNOWFLAKE.test(id)))];
    if (!ids.length) throw new ModerationError(400, 'Give the message IDs to delete (from read_channel_messages).');
    if (ids.length > DELETE_IDS_MAX) throw new ModerationError(400, `At most ${DELETE_IDS_MAX} messages per call; use clear_channel for more.`);
    return ids;
  }

  // What a delete or clear would do, without deleting anything
  async function plan(args) {
    const { channel, botId } = await channelFor(args, true);
    const includeKept = !!args.includeKept;
    if (args.mode === 'clear') {
      const scanned = [];
      let before;
      while (scanned.length < SCAN_MAX) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!batch.size) break;
        scanned.push(...batch.values());
        before = [...batch.keys()].reduce((a, b) => (BigInt(a) < BigInt(b) ? a : b));
        if (batch.size < 100) break;
      }
      const t = tally(scanned, botId, includeKept);
      return {
        channel: { id: channel.id, name: channel.name },
        mode: 'clear',
        will_delete: t.deletable.length,
        recent_bulk: t.recent,
        older_one_by_one: t.older,
        kept: t.kept,
        more_than_counted: scanned.length >= SCAN_MAX,
        max_per_run: CLEAR_MAX,
      };
    }
    const ids = cleanIds(args.messageIds);
    const { found, missing } = await fetchByIds(channel, ids);
    const t = tally(found, botId, includeKept);
    return {
      channel: { id: channel.id, name: channel.name },
      mode: 'delete',
      will_delete: t.deletable.length,
      recent_bulk: t.recent,
      older_one_by_one: t.older,
      kept: t.kept,
      not_found: missing,
      messages: found.filter((m) => t.deletable.includes(m.id)).map((m) => messageInfo(m, botId, false)).slice(0, 20),
    };
  }

  // ---------- Deleting (background job) ----------

  async function deleteIds(job, channel, ids) {
    const now = Date.now();
    const recent = ids.filter((id) => bulkable(id, now));
    const older = ids.filter((id) => !bulkable(id, now));
    for (let i = 0; i < recent.length && !job.stopped; i += 100) {
      const chunk = recent.slice(i, i + 100);
      try {
        if (chunk.length === 1) {
          await channel.messages.delete(chunk[0]);
          job.deleted += 1;
        } else {
          const gone = await channel.bulkDelete(chunk, true);
          job.deleted += gone.size;
          // Anything bulk delete skipped (it aged past 14 days mid-run) goes one by one
          for (const id of chunk) if (!gone.has(id)) older.push(id);
        }
      } catch (err) {
        job.failed += chunk.length;
        job.lastError = err.message;
      }
    }
    for (const id of older) {
      if (job.stopped) break;
      try {
        await channel.messages.delete(id);
        job.deleted += 1;
      } catch (err) {
        // Already gone counts as done
        if (err.code === 10008) job.deleted += 1;
        else {
          job.failed += 1;
          job.lastError = err.message;
        }
      }
    }
  }

  async function runJob(job, channel, work) {
    try {
      await work();
    } catch (err) {
      job.lastError = err.message;
    } finally {
      job.done = true;
      job.finishedAt = Date.now();
      busyChannels.delete(channel.id);
    }
  }

  async function clearAll(job, channel, botId) {
    let before;
    while (!job.stopped && job.deleted + job.failed < CLEAR_MAX) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      before = [...batch.keys()].reduce((a, b) => (BigInt(a) < BigInt(b) ? a : b));
      const t = tally([...batch.values()], botId, job.includeKept);
      job.kept.pinned += t.kept.pinned;
      job.kept.gafferbot_panel += t.kept.gafferbot_panel;
      const room = CLEAR_MAX - job.deleted - job.failed;
      await deleteIds(job, channel, t.deletable.slice(0, room));
      if (batch.size < 100) break;
    }
    if (!job.stopped && job.deleted + job.failed >= CLEAR_MAX) job.limitReached = true;
  }

  function jobView(job) {
    return {
      job_id: job.id,
      channel: { id: job.channelId, name: job.channelName },
      mode: job.mode,
      done: job.done,
      deleted: job.deleted,
      failed: job.failed,
      kept: job.kept,
      ...(job.stopped ? { stopped: true } : {}),
      ...(job.limitReached ? { limit_reached: `Stopped after ${CLEAR_MAX} messages; run clear_channel again for the rest.` } : {}),
      ...(job.lastError ? { last_error: job.lastError } : {}),
    };
  }

  async function startJob(args, mode) {
    const { channel, botId } = await channelFor(args, true);
    if (busyChannels.has(channel.id)) throw new ModerationError(409, `A cleanup is already running in #${channel.name}. Check on it with its job_id.`);
    const job = {
      id: crypto.randomBytes(9).toString('base64url'),
      guildId: args.guildId,
      userId: args.userId,
      channelId: channel.id,
      channelName: channel.name,
      mode,
      includeKept: !!args.includeKept,
      deleted: 0,
      failed: 0,
      kept: { pinned: 0, gafferbot_panel: 0 },
      stopped: false,
      done: false,
    };
    let work;
    if (mode === 'clear') work = () => clearAll(job, channel, botId);
    else {
      const ids = cleanIds(args.messageIds);
      const { found } = await fetchByIds(channel, ids);
      const t = tally(found, botId, job.includeKept);
      job.kept = t.kept;
      work = () => deleteIds(job, channel, t.deletable);
    }
    busyChannels.add(channel.id);
    jobs.set(job.id, job);
    job.promise = runJob(job, channel, work);
    await Promise.race([job.promise, sleep(WAIT_MS)]);
    return jobView(job);
  }

  async function status({ guildId, userId, jobId, stop }) {
    const job = jobs.get(String(jobId || ''));
    if (!job || job.guildId !== guildId || job.userId !== userId) throw new ModerationError(404, 'That cleanup has expired or is not yours.');
    if (stop && !job.done) job.stopped = true;
    if (!job.done) await Promise.race([job.promise, sleep(WAIT_MS)]);
    return jobView(job);
  }

  async function handle(op, args) {
    if (!SNOWFLAKE.test(String(args?.guildId || '')) || !SNOWFLAKE.test(String(args?.userId || ''))) throw new ModerationError(400, 'Pick a server');
    if (op === 'channels') return channels(args);
    if (op === 'read') return read(args);
    if (op === 'plan') return plan(args);
    if (op === 'delete') return startJob(args, 'delete');
    if (op === 'clear') return startJob(args, 'clear');
    if (op === 'status') return status(args);
    throw new ModerationError(400, 'Unknown request');
  }

  return { handle };
}

module.exports = { createChannelModeration, ModerationError, createdAt, bulkable, isPanel, keepReason, BULK_MAX_AGE_MS, CLEAR_MAX };
