// Disboard bump reminders. Listing sites like Disboard rank servers by recent bumps, and a server can be
// bumped once every 2 hours with Disboard's own /bump command. Automating /bump breaks Disboard's rules,
// so instead: when Disboard confirms a bump in a channel, GafferBot thanks the bumper and, 2 hours later,
// posts "bump is ready" in the same channel, pinging a role called "Bumper" (or "Bump", "Bumpers") if the
// server has one. No setup: it only runs in servers that use Disboard. The next due time is kept in a
// small file so restarts don't lose it.

const fs = require('fs');
const path = require('path');

const DISBOARD_ID = '302050872383242240';
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const STATE_FILE = process.env.BUMP_STATE_FILE || path.join(__dirname, '.bump-state.json');
const ROLE_NAMES = ['bumper', 'bumpers', 'bump', 'bump squad'];

/** Disboard's success reply to /bump ("Bump done! :thumbsup: ..."). */
function isBumpDone(message) {
  if (message.author?.id !== DISBOARD_ID) return false;
  const text = [message.content, ...(message.embeds || []).map((e) => `${e.title || ''} ${e.description || ''}`)].join(' ');
  return /bump done/i.test(text);
}

const bumperRole = (guild) => guild.roles.cache.find((r) => ROLE_NAMES.includes(r.name.toLowerCase().trim())) || null;

function reminderPayload(guild) {
  const role = bumperRole(guild);
  return {
    content: `${role ? `<@&${role.id}> ` : ''}⏰ The Disboard bump is ready. Type **/bump** to keep the server near the top of Disboard.`,
    allowedMentions: { parse: [], roles: role ? [role.id] : [] },
  };
}

function createBumpReminder({ client, stateFile = STATE_FILE, now = () => Date.now() } = {}) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {}; } catch { state = {}; }
  const timers = new Map();
  const save = () => { try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch (e) { console.warn('[bump] save failed:', e.message); } };

  async function remind(guildId) {
    timers.delete(guildId);
    const entry = state[guildId];
    if (!entry || entry.reminded) return;
    entry.reminded = true;
    save();
    const guild = client.guilds.cache.get(guildId);
    const channel = guild && (await guild.channels.fetch(entry.channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return;
    await channel.send(reminderPayload(guild)).catch((e) => console.warn('[bump] reminder failed:', e.message));
  }

  function schedule(guildId) {
    clearTimeout(timers.get(guildId));
    const entry = state[guildId];
    if (!entry || entry.reminded) return;
    const wait = Math.max(0, entry.due - now());
    timers.set(guildId, setTimeout(() => remind(guildId).catch(() => {}), wait));
  }

  async function onMessage(message) {
    if (!message.guild || !isBumpDone(message)) return;
    const guildId = message.guild.id;
    state[guildId] = { channelId: message.channelId, due: now() + COOLDOWN_MS, reminded: false };
    save();
    schedule(guildId);
    const who = message.interaction?.user || message.interactionMetadata?.user;
    if (who) {
      await message.channel.send({ content: `Thanks for the bump, <@${who.id}>! I'll ping here when the next one is ready.`, allowedMentions: { parse: [] } }).catch(() => {});
    }
  }

  function start() {
    for (const guildId of Object.keys(state)) schedule(guildId);
  }

  return { onMessage, start, _state: () => state };
}

module.exports = { createBumpReminder, isBumpDone, reminderPayload, DISBOARD_ID, COOLDOWN_MS };
