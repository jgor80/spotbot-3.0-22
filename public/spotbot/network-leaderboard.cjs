// GafferBot Network leaderboard: every listed club across all network servers, ranked by EA skill
// rating (EA's own number, so the board never disagrees with EA), with this season's record and the
// record in games against other network clubs. The servers view rolls clubs up per server, naming only
// servers that chose to show their name.

const { EmbedBuilder } = require('discord.js');
const { clubLine } = require('./network.cjs');

const SEASON_START = process.env.FC_SEASON_START || '2026-09-25T00:00:00Z';
const TOP = 20;

// Each club's W-D-L against other network clubs, keyed guild:club
function networkRecords(clubs, matches) {
  const byEa = new Map(clubs.map((c) => [c.eaClubId, c]));
  const out = new Map();
  for (const m of matches || []) {
    const opp = byEa.get(String(m.opponent_club_id));
    if (!opp || (opp.guildId === m.guild_id && opp.key === m.club_key)) continue;
    const key = `${m.guild_id}:${m.club_key}`;
    const r = out.get(key) || { w: 0, d: 0, l: 0 };
    if (m.result === 'win') r.w++;
    else if (m.result === 'draw') r.d++;
    else if (m.result === 'loss') r.l++;
    out.set(key, r);
  }
  return out;
}

// Highest EA skill rating first; then more wins; unrated clubs last
function rankClubs(clubs) {
  return [...clubs].sort((a, b) => (b.skill || 0) - (a.skill || 0) || (b.stats?.wins || 0) - (a.stats?.wins || 0) || a.name.localeCompare(b.name));
}

// Clubs rolled up per server; servers that hide their name are counted but not named
function rankServers(clubs) {
  const by = new Map();
  for (const c of clubs) {
    const s = by.get(c.guildId) || { guildId: c.guildId, name: c.serverName, clubs: 0, best: 0, w: 0, d: 0, l: 0 };
    s.clubs++;
    s.best = Math.max(s.best, c.skill || 0);
    s.w += c.stats?.wins || 0;
    s.d += c.stats?.draws || 0;
    s.l += c.stats?.losses || 0;
    by.set(c.guildId, s);
  }
  return [...by.values()].sort((a, b) => b.best - a.best || b.w - a.w);
}

function createNetworkLeaderboard(deps) {
  const { supabase, network } = deps;

  async function handleLeaderboard(interaction) {
    await interaction.deferReply();
    if (!(await network.isListed(interaction.guildId))) {
      return interaction.editReply({ content: '⚪ This server isn\'t on the GafferBot Network. A server admin can join with **/manager → Admin → Network Setup**; the leaderboard shows once you\'re listed too.' });
    }
    const view = interaction.options.getString('view') || 'clubs';
    const platform = interaction.options.getString('platform');
    const region = interaction.options.getString('region');
    const servers = [await network.serverRow(interaction.guildId), ...(await network.visibleServers(interaction.guildId))];
    let clubs = await network.clubDirectory(interaction.client, servers);
    if (platform) clubs = clubs.filter((c) => c.platform === platform);
    if (region) clubs = clubs.filter((c) => c.region === region);
    const filters = [platform === 'nx' ? 'Switch' : platform ? 'PS5 / Xbox Series / PC' : null, region].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder().setColor(0xf1c40f).setTimestamp(new Date());
    if (view === 'servers') {
      const ranked = rankServers(clubs);
      const named = ranked.filter((s) => s.name || s.guildId === interaction.guildId);
      const lines = named.slice(0, TOP).map((s) => {
        const pos = ranked.indexOf(s) + 1;
        const me = s.guildId === interaction.guildId;
        return `${pos}. ${me ? '⭐ ' : ''}**${s.name || interaction.guild?.name || 'This server'}** · best SR ${s.best || '–'} · ${s.clubs} club${s.clubs === 1 ? '' : 's'} · ${s.w}W ${s.d}D ${s.l}L`;
      });
      const hidden = ranked.length - named.length;
      embed
        .setTitle('🏆 GafferBot Network: servers')
        .setDescription((lines.join('\n') || 'No servers yet.') + (hidden ? `\n\n…plus ${hidden} server${hidden === 1 ? '' : 's'} that keep their name private.` : ''))
        .setFooter({ text: `Ranked by each server's best EA skill rating${filters ? ` · ${filters}` : ''}` });
      return interaction.editReply({ embeds: [embed] });
    }

    const ranked = rankClubs(clubs);
    const { data: matches } = clubs.length
      ? await supabase
          .from('club_matches')
          .select('guild_id, club_key, opponent_club_id, result')
          .in('guild_id', [...new Set(clubs.map((c) => c.guildId))])
          .in('opponent_club_id', clubs.map((c) => c.eaClubId))
          .gte('created_at', SEASON_START)
          .limit(5000)
      : { data: [] };
    const vs = networkRecords(clubs, matches);
    const line = (c, i) => {
      const r = vs.get(`${c.guildId}:${c.key}`);
      const mine = c.guildId === interaction.guildId;
      return `${i + 1}. ${mine ? '⭐ ' : ''}${clubLine({ ...c, region: null })}${r ? ` · vs network ${r.w}-${r.d}-${r.l}` : ''}`;
    };
    const lines = ranked.slice(0, TOP).map(line);
    const ownBelow = ranked.map((c, i) => [c, i]).filter(([c, i]) => c.guildId === interaction.guildId && i >= TOP);
    if (ownBelow.length) lines.push('…', ...ownBelow.slice(0, 3).map(([c, i]) => line(c, i)));
    embed
      .setTitle('🏆 GafferBot Network leaderboard')
      .setDescription(lines.join('\n') || 'No clubs match yet.')
      .setFooter({ text: `${ranked.length} club${ranked.length === 1 ? '' : 's'} · ranked by EA skill rating · "vs network" = this season against other network clubs${filters ? ` · ${filters}` : ''}` });
    return interaction.editReply({ embeds: [embed] });
  }

  network.addSubcommand('leaderboard', handleLeaderboard);
  return { handleLeaderboard };
}

module.exports = { createNetworkLeaderboard, networkRecords, rankClubs, rankServers };
