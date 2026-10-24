// The Network Wire: a weekly paper for GafferBot Network servers, posted Monday evening in each listed
// server's network channel. Club-level only, like everything else on the Network (members never cross
// servers): the biggest skill-rating risers, promotions, results between network clubs and friendlies
// lined up. Each server sees only the servers it can see (blocks respected). Saved to club_press.

const { EmbedBuilder } = require('discord.js');
const { activeClubs } = require('./manager-hub.cjs');
const T = require('./event-time.cjs');

const DAY = 24 * 60 * 60 * 1000;
const WIRE_WEEKDAY = 1;
const WIRE_HOUR = 18;

// Pure: SR movers and division changes from club_division_history rows (any order)
function wireMovers(clubs, history, now = Date.now()) {
  const byClub = new Map();
  for (const r of history) {
    const k = `${r.guild_id}|${r.club_key}`;
    if (!byClub.has(k)) byClub.set(k, []);
    byClub.get(k).push(r);
  }
  const risers = [];
  const moves = [];
  for (const c of clubs) {
    const rows = (byClub.get(`${c.guildId}|${c.key}`) || []).sort((a, b) => String(a.captured_on).localeCompare(String(b.captured_on)));
    const week = rows.filter((r) => now - Date.parse(r.captured_on) <= 8 * DAY);
    if (week.length < 2) continue;
    const first = week[0];
    const last = week[week.length - 1];
    if (first.skill_rating != null && last.skill_rating != null && last.skill_rating - first.skill_rating > 0) risers.push({ club: c, gain: last.skill_rating - first.skill_rating, sr: last.skill_rating });
    if (first.current_division != null && last.current_division != null && first.current_division !== last.current_division) {
      moves.push({ club: c, up: last.current_division < first.current_division, from: first.current_division, to: last.current_division });
    }
  }
  return { risers: risers.sort((a, b) => b.gain - a.gain).slice(0, 5), moves };
}

function createNetworkWire({ supabase, network, getGuildState, autopilot, client, pressLog }) {
  async function buildWire(guildId) {
    const own = await network.serverRow(guildId);
    if (!own?.enabled) return null;
    const servers = [own, ...(await network.visibleServers(guildId))];
    const clubs = await network.clubDirectory(client(), servers);
    if (clubs.length < 2) return null;
    const ids = [...new Set(clubs.map((c) => c.guildId))];
    const since = new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10);
    const history = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from('club_division_history').select('guild_id, club_key, captured_on, skill_rating, current_division').in('guild_id', ids.slice(i, i + 100)).gte('captured_on', since).limit(5000);
      history.push(...(data || []));
    }
    const { risers, moves } = wireMovers(clubs, history);
    const visible = new Set(ids);
    const { data: fixtures } = await supabase
      .from('network_fixtures')
      .select('kind, from_guild_id, from_club_name, to_guild_id, to_club_name, status, kickoff_at, score_from, score_to, played_at')
      .in('status', ['played', 'accepted'])
      .gte('kickoff_at', new Date(Date.now() - 7 * DAY).toISOString())
      .lte('kickoff_at', new Date(Date.now() + 7 * DAY).toISOString())
      .limit(200);
    const mine = (fixtures || []).filter((f) => visible.has(f.from_guild_id) && visible.has(f.to_guild_id));
    const played = mine.filter((f) => f.status === 'played' && f.score_from != null);
    const coming = mine.filter((f) => f.status === 'accepted' && new Date(f.kickoff_at) > new Date());

    const embed = new EmbedBuilder().setTitle('📡 The Network Wire').setColor(0x0ea5e9).setTimestamp(new Date());
    embed.setDescription(`This week across ${clubs.length} clubs on the GafferBot Network.`);
    if (risers.length) embed.addFields({ name: '📈 Biggest risers', value: risers.map((r, i) => `${i + 1}. **${r.club.name}** +${r.gain} SR (now ${r.sr})`).join('\n') });
    const ups = moves.filter((m) => m.up);
    const downs = moves.filter((m) => !m.up);
    if (ups.length) embed.addFields({ name: '🚀 Promoted', value: ups.slice(0, 8).map((m) => `**${m.club.name}**: Division ${m.from} → ${m.to}`).join('\n') });
    if (downs.length) embed.addFields({ name: '🪂 Relegated', value: downs.slice(0, 5).map((m) => `**${m.club.name}**: Division ${m.from} → ${m.to}`).join('\n') });
    if (played.length) embed.addFields({ name: '🤝 Network results', value: played.slice(0, 8).map((f) => `**${f.from_club_name}** ${f.score_from}-${f.score_to} **${f.to_club_name}**`).join('\n') });
    if (coming.length) embed.addFields({ name: '🗓️ Coming up', value: coming.slice(0, 6).map((f) => `**${f.from_club_name}** vs **${f.to_club_name}** <t:${Math.floor(new Date(f.kickoff_at).getTime() / 1000)}:R>`).join('\n') });
    if (!risers.length && !moves.length && !played.length && !coming.length) return null;
    embed.setFooter({ text: 'Club-level news only: the Network never shares members between servers. /network leaderboard for the full table.' });
    return { embeds: [embed] };
  }

  // Monday from 18:00 in each listed server's timezone, once a week
  async function tick(now) {
    if (!network.isOn()) return;
    for (const guild of client()?.guilds.cache.values() || []) {
      const row = await network.serverRow(guild.id).catch(() => null);
      if (!row?.enabled || row.suspended_at) continue;
      const state = await getGuildState(guild.id);
      const lead = activeClubs(state)[0];
      if (!lead) continue;
      const { data: prefs } = await supabase.from('guild_settings').select('timezone').eq('guild_id', guild.id).maybeSingle();
      const local = T.localParts(now, T.isValidTimeZone(prefs?.timezone) ? prefs.timezone : 'UTC');
      if (local.weekday !== WIRE_WEEKDAY || local.hour < WIRE_HOUR) continue;
      const week = `${local.year}-${local.month}-${local.day}`;
      if (lead.autopilot?.wire_week === week || !autopilot.isOn(lead, 'wire')) continue;
      await autopilot.updateClub(guild.id, lead.key, (ap) => {
        ap.wire_week = week;
      });
      const wire = await buildWire(guild.id).catch((err) => console.warn(`[wire] ${guild.id} failed: ${err.message}`));
      if (!wire) continue;
      const sent = await network.postToChannel(client(), guild.id, wire);
      if (sent && pressLog) await pressLog.save(guild.id, lead.key, 'network_wire', wire, { headline: 'The Network Wire' });
    }
  }

  return { buildWire, tick };
}

module.exports = { createNetworkWire, wireMovers };
