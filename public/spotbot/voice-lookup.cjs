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
  };
}

module.exports = { createVoiceLookup };
