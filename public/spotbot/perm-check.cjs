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

function missingPermsMessage(channel, missing) {
  return (
    `❌ I can't post in <#${channel.id}>. I'm missing **${missing.join('**, **')}** there.\n` +
    'Give my role those permissions in the channel settings (or the server role), then try again. `/setup` checks every channel I use.'
  );
}

module.exports = { missingChannelPerms, canPingRole, missingPermsMessage, POST_PERMS };
