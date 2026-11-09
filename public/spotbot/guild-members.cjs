// Who is in each server, for the website's row-level security (`guild_members`).
// The functions check server access live through Discord, but Postgres can't, so without this the
// SQL helpers (user_has_guild_access, my_guild_ids) only counted players with recorded matches:
// server owners, non-playing managers and new members couldn't see their own server on the website.
// The bot keeps the table current: a full sync per server at startup, then joins, leaves and the
// bot leaving a server. Only ids are stored; the table is service-role only.
const CHUNK = 500;

function createGuildMembers({ supabase, log = console }) {
  async function upsert(guildId, ids, at) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const rows = ids.slice(i, i + CHUNK).map((discord_user_id) => ({ guild_id: guildId, discord_user_id, updated_at: at }));
      const { error } = await supabase.from('guild_members').upsert(rows, { onConflict: 'guild_id,discord_user_id' });
      if (error) throw new Error(`guild_members upsert failed: ${error.message}`);
    }
  }

  // Replace a server's list with who is in it now. Rows not seen in this sync are removed afterwards,
  // so a failed fetch never empties the list.
  async function syncGuild(guild) {
    const members = await guild.members.fetch();
    const ids = [...new Set([...members.values()].filter((m) => !m.user?.bot).map((m) => m.id))];
    if (!ids.length) return 0;
    const at = new Date().toISOString();
    await upsert(guild.id, ids, at);
    const { error } = await supabase.from('guild_members').delete().eq('guild_id', guild.id).lt('updated_at', at);
    if (error) throw new Error(`guild_members cleanup failed: ${error.message}`);
    return ids.length;
  }

  // One server at a time: member list requests are rate-limited per gateway connection
  async function syncAll(guilds) {
    let n = 0;
    for (const guild of guilds) {
      n += await syncGuild(guild).catch((err) => {
        log.warn(`[guild-members] ${guild.name || guild.id}: ${err.message}`);
        return 0;
      });
    }
    return n;
  }

  async function memberJoined(member) {
    if (member.user?.bot) return;
    await upsert(member.guild.id, [member.id], new Date().toISOString());
  }

  async function memberLeft(member) {
    const { error } = await supabase.from('guild_members').delete().eq('guild_id', member.guild.id).eq('discord_user_id', member.id);
    if (error) throw new Error(`guild_members delete failed: ${error.message}`);
  }

  async function botLeft(guild) {
    const { error } = await supabase.from('guild_members').delete().eq('guild_id', guild.id);
    if (error) throw new Error(`guild_members delete failed: ${error.message}`);
  }

  return { syncGuild, syncAll, memberJoined, memberLeft, botLeft };
}

module.exports = { createGuildMembers };
