// Pregame Matchday Programme: a printed-programme style embed posted when check-in opens.
// Everything comes from saved data: event title/type, lineup, recent club results and ratings.

const { EmbedBuilder } = require('discord.js');
const { toInsightMatches } = require('./club-insights.cjs');
const { seasonTotals } = require('./player-season.cjs');

const RES = { win: '🟢', draw: '🟡', loss: '🔴' };

// Pure: programme sections from recent matches (newest first)
function programmeNotes(matches) {
  const form = matches.slice(0, 5).reverse().map((m) => RES[m.result] || '⚪').join('');
  const totals = [...seasonTotals(matches.slice(0, 5)).values()];
  const hot = totals.filter((t) => t.rated >= 2).sort((a, b) => b.recentAvg(5) - a.recentAvg(5))[0];
  const scorer = totals.filter((t) => t.goals > 0).sort((a, b) => b.goals - a.goals)[0];
  const last = matches[0];
  return {
    form,
    last: last ? `${last.scoreFor}-${last.scoreAgainst} vs ${last.opponent}` : null,
    hot: hot ? `${hot.name} (${hot.recentAvg(5).toFixed(1)} avg, last 5)` : null,
    scorer: scorer ? `${scorer.name} (${scorer.goals} in the last 5)` : null,
  };
}

function createProgramme({ supabase, typeInfo }) {
  async function build(event, lineup, clubName) {
    let q = supabase.from('club_matches').select('id, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type').eq('guild_id', event.guild_id).order('created_at', { ascending: false }).limit(10);
    if (event.club_key) q = q.eq('club_key', event.club_key);
    const { data } = await q;
    const n = programmeNotes(toInsightMatches(data || []));
    const kind = typeInfo ? typeInfo(event.event_type, event.title) : { label: 'Match', emoji: '⚽' };
    const kick = Math.floor(new Date(event.scheduled_at).getTime() / 1000);
    const embed = new EmbedBuilder()
      .setTitle(`📖 Matchday Programme · ${event.title}`)
      .setColor(0xf4a6c6)
      .setDescription(`${kind.emoji} **${kind.label}**${clubName ? ` · ${clubName}` : ''}\nKick-off <t:${kick}:t> (<t:${kick}:R>)`);
    if (lineup?.slots?.length) {
      const xi = lineup.slots.filter((s) => !s.is_substitute).map((s) => `\`${(s.position || '').padEnd(3)}\` ${/^\d{17,19}$/.test(s.discord_user_id) ? `<@${s.discord_user_id}>` : s.discord_user_id || '—'}`);
      embed.addFields({ name: `📋 Team sheet${lineup.formation ? ` · ${lineup.formation}` : ''}`, value: xi.join('\n').slice(0, 1024) || '—' });
    }
    if (n.form) embed.addFields({ name: '📈 Form (last 5)', value: n.form, inline: true });
    if (n.last) embed.addFields({ name: '⏮️ Last time out', value: n.last, inline: true });
    if (n.hot) embed.addFields({ name: '🔥 One to watch', value: n.hot, inline: true });
    if (n.scorer) embed.addFields({ name: '⚽ In front of goal', value: n.scorer, inline: true });
    embed.setFooter({ text: 'Programme notes come from synced EA matches. Forza!' });
    return embed;
  }
  return { build };
}

module.exports = { createProgramme, programmeNotes };
