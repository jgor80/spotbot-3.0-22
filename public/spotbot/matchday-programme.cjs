// Pregame Matchday Programme: a printed-programme style embed posted when check-in opens.
// Everything comes from saved data: event title/type, lineup, recent club results and ratings, the
// career milestones players are close to (player_career), the record against an opponent named in the
// event title, and a club challenge for the night.

const { EmbedBuilder } = require('discord.js');
const { toInsightMatches } = require('./club-insights.cjs');
const { seasonTotals } = require('./player-season.cjs');
const { milestonesInReach } = require('./career.cjs');

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
    challenge: challengeFor(matches.slice(0, 5)),
  };
}

// Pure: a target for the night from the last five games
function challengeFor(last5) {
  if (last5.length < 3) return null;
  const ga = last5.reduce((s, m) => s + m.scoreAgainst, 0) / last5.length;
  const gf = last5.reduce((s, m) => s + m.scoreFor, 0) / last5.length;
  const losses = last5.filter((m) => m.result === 'loss').length;
  if (ga >= 2.5) return `Tighten up: concede fewer than 2 in every game tonight (averaging ${ga.toFixed(1)} lately).`;
  if (gf < 1.5) return `Find the net: score 2 or more in a game tonight (averaging ${gf.toFixed(1)} lately).`;
  if (losses === 0) return `Unbeaten in the last ${last5.length}. Keep it that way tonight.`;
  if (last5.filter((m) => m.scoreAgainst === 0).length === 0) return 'Keep a clean sheet tonight. It has been a while.';
  return 'Win the first game of the night. Set the tone.';
}

// Pure: our record against an opponent named in the event title ("vs Rivals FC"), from past games
function rivalFrom(title, history) {
  const t = String(title || '').toLowerCase();
  const byOpp = new Map();
  for (const m of history) {
    const o = String(m.opponent || '').trim();
    if (o.length < 3 || o === 'Unknown' || !t.includes(o.toLowerCase())) continue;
    if (!byOpp.has(o)) byOpp.set(o, []);
    byOpp.get(o).push(m);
  }
  const [opp, games] = [...byOpp.entries()].sort((a, b) => b[0].length - a[0].length)[0] || [];
  if (!opp) return null;
  const w = games.filter((m) => m.result === 'win').length;
  const l = games.filter((m) => m.result === 'loss').length;
  const last = games[0];
  return `${games.length} meeting${games.length === 1 ? '' : 's'} with **${opp}**: ${w}W ${games.length - w - l}D ${l}L. Last time: ${last.scoreFor}-${last.scoreAgainst}.`;
}

function createProgramme({ supabase, typeInfo }) {
  async function build(event, lineup, clubName) {
    let q = supabase.from('club_matches').select('id, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type').eq('guild_id', event.guild_id).order('created_at', { ascending: false }).limit(10);
    if (event.club_key) q = q.eq('club_key', event.club_key);
    const { data } = await q;
    const n = programmeNotes(toInsightMatches(data || []));
    // Milestones in reach and the head-to-head need the club's longer record
    let milestones = [];
    let rival = null;
    if (event.club_key) {
      const [{ data: careers }, { data: older }] = await Promise.all([
        supabase.from('player_career').select('player_key, player_name, apps, goals, assists, motm').eq('guild_id', event.guild_id).eq('club_key', event.club_key).limit(500),
        supabase.from('club_matches').select('id, result, score_for, score_against, created_at, opponent_club_name, ts:match_data->timestamp').eq('guild_id', event.guild_id).eq('club_key', event.club_key).order('created_at', { ascending: false }).limit(300),
      ]).catch(() => [{}, {}]);
      milestones = milestonesInReach(careers || []).slice(0, 4);
      rival = rivalFrom(event.title, toInsightMatches((older || []).map((r) => ({ ...r, match_data: { timestamp: r.ts } }))));
    }
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
    if (rival) embed.addFields({ name: '⚔️ Head to head', value: rival });
    if (milestones.length) embed.addFields({ name: '🎯 Milestones in reach', value: milestones.map((m) => `• ${m.text}`).join('\n').slice(0, 1024) });
    if (n.challenge) embed.addFields({ name: "🏁 Tonight's challenge", value: n.challenge });
    embed.setFooter({ text: 'Programme notes come from synced EA matches and career records.' });
    return embed;
  }
  return { build };
}

module.exports = { createProgramme, programmeNotes, challengeFor, rivalFrom };
