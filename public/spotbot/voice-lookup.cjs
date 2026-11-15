// Who is in which voice channel, from the bot's gateway cache (the GuildVoiceStates intent keeps it
// current). Fill from voice on the website (announce-lineup) uses this in-process through
// globalThis.__gafferbotVoice instead of one Discord REST call per player, which ran into rate limits.

function createVoiceLookup({ getClient }) {
  return {
    // [{ id, name, user_ids }] for the given players, or null when this server isn't in the cache
    channelsFor(guildId, userIds) {
      const guild = getClient()?.guilds?.cache?.get(guildId);
      if (!guild || guild.available === false || !guild.voiceStates?.cache) return null;
      const want = new Set(userIds);
      const byChannel = new Map();
      for (const state of guild.voiceStates.cache.values()) {
        if (!state.channelId || !want.has(state.id)) continue;
        if (!byChannel.has(state.channelId)) {
          byChannel.set(state.channelId, { id: state.channelId, name: state.channel?.name || 'Voice', user_ids: [] });
        }
        byChannel.get(state.channelId).user_ids.push(state.id);
      }
      return [...byChannel.values()];
    },
    // Discord user IDs of the members with this role, or null unless every member of the server is
    // cached (role.members only sees cached members); the caller then pages the members list instead
    membersWithRole(guildId, roleId) {
      const guild = getClient()?.guilds?.cache?.get(guildId);
      if (!guild || guild.available === false) return null;
      if (!guild.memberCount || (guild.members?.cache?.size || 0) < guild.memberCount) return null;
      const role = guild.roles?.cache?.get(roleId);
      if (!role?.members) return null;
      return [...role.members.keys()];
    },
  };
}

module.exports = { createVoiceLookup };
