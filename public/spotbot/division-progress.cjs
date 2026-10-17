// Division progress in Discord: the Manager Hub's Division line and its Divisions view.
// The numbers come from club_division_history (saved by the EA sync) through summarizeDivision
// in src/lib/divisionProgress.ts, the same code the website uses.

const { EmbedBuilder } = require('discord.js');
const { summarizeDivision, divisionLabel, signed } = require('./club-insights.cjs');

const HISTORY_DAYS = 120;
const SPARK = '▁▂▃▄▅▆▇█';

async function loadDivisionHistory(supabase, guildId, clubKey) {
  const { data, error } = await supabase
    .from('club_division_history')
    .select('captured_on, captured_at, current_division, best_division, skill_rating, promotions, relegations, season_points, season_wins, season_draws, season_losses, season_rank, alltime_rank, leaderboard_checked')
    .eq('guild_id', guildId)
    .eq('club_key', clubKey)
    .order('captured_on', { ascending: false })
    .limit(HISTORY_DAYS);
  if (error) throw new Error(error.message);
  return data || [];
}

function sparkline(values) {
  const nums = values.filter((v) => typeof v === 'number');
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return nums.map((v) => SPARK[max === min ? 3 : Math.round(((v - min) / (max - min)) * (SPARK.length - 1))]).join('');
}

function rankText(s) {
  if (s.seasonRank) {
    const move = s.seasonRankChange ? ` (${s.seasonRankChange > 0 ? '▲' : '▼'}${Math.abs(s.seasonRankChange)})` : '';
    return `#${s.seasonRank} this season${move}`;
  }
  return s.leaderboardChecked ? 'Outside the top 100' : 'Not checked yet';
}

function shortDate(iso) {
  return `<t:${Math.floor(Date.parse(iso) / 1000)}:d>`;
}

// One line for the hub embed, or null before the first snapshot
function hubDivisionLine(s) {
  if (!s || (s.division === null && s.skillRating === null)) return null;
  const parts = [divisionLabel(s.division)];
  if (s.skillRating !== null) parts.push(`${s.skillRating} SR${s.srChange7d ? ` (${signed(s.srChange7d)} this week)` : ''}`);
  if (s.seasonRank) parts.push(`#${s.seasonRank} on EA`);
  return parts.join(' · ');
}

function buildDivisionEmbed(club, s) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${club.name}: division progress`)
    .setColor(0xf59e0b);

  if (!s || !s.trackedSince) {
    return embed.setDescription(
      club.ea_club_id
        ? "No division data yet. It's saved on each EA sync, so check back after the next one (or press Sync Matches on the hub)."
        : 'This club is not linked to EA yet. Run **/manager → Admin → Link EA Club** first.'
    );
  }

  const since = s.sinceRecord;
  const sinceLabel = s.changes.length ? `Since reaching ${divisionLabel(s.division)} (${shortDate(s.inDivisionSince)})` : `Division games since tracking began (${shortDate(s.trackedSince)})`;
  embed
    .setDescription(`Saved from EA every day since ${shortDate(s.trackedSince)}.`)
    .addFields(
      { name: 'Division', value: divisionLabel(s.division), inline: true },
      { name: 'Best division', value: divisionLabel(s.bestDivision), inline: true },
      { name: 'Skill rating', value: s.skillRating !== null ? String(s.skillRating) : '–', inline: true },
      { name: 'SR last 7 days', value: s.srChange7d !== null ? signed(s.srChange7d) : '–', inline: true },
      { name: 'SR last 30 days', value: s.srChange30d !== null ? signed(s.srChange30d) : '–', inline: true },
      { name: 'Promotions / relegations', value: s.promotions !== null || s.relegations !== null ? `${s.promotions ?? 0} / ${s.relegations ?? 0}` : '–', inline: true },
      { name: 'EA season leaderboard', value: rankText(s), inline: true },
      { name: 'EA all-time leaderboard', value: s.alltimeRank ? `#${s.alltimeRank}` : s.leaderboardChecked ? 'Outside the top 100' : 'Not checked yet', inline: true }
    );
  if (s.seasonPoints !== null || s.seasonRecord) {
    const rec = s.seasonRecord ? `${s.seasonRecord.wins}W ${s.seasonRecord.draws}D ${s.seasonRecord.losses}L` : '';
    embed.addFields({ name: "EA's season so far", value: [s.seasonPoints !== null ? `${s.seasonPoints} pts` : '', rec].filter(Boolean).join(' · '), inline: true });
  }
  embed.addFields({
    name: sinceLabel,
    value: since.played ? `${since.wins}W ${since.draws}D ${since.losses}L · ${since.points} pts from ${since.played} games` : 'No division games synced since then.',
  });

  const recent = s.trend.slice(-30);
  const srLine = sparkline(recent.map((p) => p.skillRating));
  if (srLine) {
    const first = recent.find((p) => p.skillRating !== null);
    embed.addFields({ name: `Skill rating, last ${recent.length} days`, value: `\`${srLine}\` ${first.skillRating} → ${s.skillRating}` });
  }
  if (s.changes.length) {
    embed.addFields({
      name: 'Division moves',
      value: s.changes
        .slice(0, 8)
        .map((c) => `${c.kind === 'promoted' ? '⬆️ Promoted' : '⬇️ Relegated'} to ${divisionLabel(c.to)} ${shortDate(c.on)}`)
        .join('\n'),
    });
  }
  return embed.setFooter({ text: "From EA's club stats and leaderboards. EA only publishes each leaderboard's top 100." });
}

async function buildDivisionView(supabase, guildId, club, matches = []) {
  const history = await loadDivisionHistory(supabase, guildId, club.key);
  const summary = history.length ? summarizeDivision(history, matches) : null;
  return { embeds: [buildDivisionEmbed(club, summary)] };
}

module.exports = { loadDivisionHistory, buildDivisionEmbed, buildDivisionView, hubDivisionLine, sparkline };
