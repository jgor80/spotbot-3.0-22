// Channel permission checks, so "the bot can't post" turns into a message naming what to fix.

const { PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;

const POST_PERMS = [
  [F.ViewChannel, 'View Channel'],
  [F.SendMessages, 'Send Messages'],
  [F.EmbedLinks, 'Embed Links'],
  [F.ReadMessageHistory, 'Read Message History'],
];

// Names of the permissions the bot is missing in a channel ([] when it can post there)
function missingChannelPerms(channel, me, extra = []) {
  if (!channel || !me) return ['View Channel'];
  const perms = channel.permissionsFor(me);
  if (!perms) return ['View Channel'];
  const needed = [...POST_PERMS, ...extra];
  if (channel.isThread?.()) needed.push([F.SendMessagesInThreads, 'Send Messages in Threads']);
  return needed.filter(([flag]) => !perms.has(flag)).map(([, name]) => name);
}

// Can the bot ping this role here? Needs the role to be mentionable or Mention @everyone.
function canPingRole(channel, me, role) {
  if (!role) return true;
  if (role.mentionable) return true;
  return !!channel?.permissionsFor(me)?.has(F.MentionEveryone);
}

// Bot owners (built-in AirDangus23 + BOT_OWNER_IDS env) get full bot permissions in every server.
const BUILTIN_OWNER_IDS = ['501557839932948490'];
function ownerIds() {
  const envIds = String(process.env.BOT_OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...BUILTIN_OWNER_IDS, ...envIds])];
}
function isBotOwner(userId) {
  return !!userId && ownerIds().includes(userId);
}

// Is this member a server admin (Administrator or Manage Server)? Works for cached members and for
// the raw interaction member Discord sends when the guild isn't cached (permissions is a bitfield string).
function isServerAdmin(member) {
  if (isBotOwner(member?.id || member?.user?.id)) return true;
  const perms = member?.permissions;
  if (!perms) return false;
  try {
    if (typeof perms.has === 'function') return perms.has(F.Administrator) || perms.has(F.ManageGuild);
    const bits = BigInt(perms);
    return (bits & F.Administrator) !== 0n || (bits & F.ManageGuild) !== 0n;
  } catch {
    return false;
  }
}

function missingPermsMessage(channel, missing) {
  return (
    `❌ I can't post in <#${channel.id}>. I'm missing **${missing.join('**, **')}** there.\n` +
    'Give my role those permissions in the channel settings (or the server role), then try again. `/setup` checks every channel I use.'
  );
}

module.exports = { missingChannelPerms, canPingRole, missingPermsMessage, isServerAdmin, isBotOwner, ownerIds, POST_PERMS };
