// Front office report (the session report): the club's management view of a night, where the Chronicle
// is the press view. After a night's games, a grade, five team scores out of 1000 against real FC27 clubs,
// the main strength and what to fix first (both against the club's usual), points vs expected points,
// a player of the session and one line per player. The maths is src/lib/matchPerformance.ts (bundled
// in club-insights.cjs); this file only turns it into a Discord embed.
//   Autopilot  added to the session recap when the club's voice channel empties (feature "report")
//   On demand  Club Stats panel → Session Report shows the latest night
const { EmbedBuilder } = require('discord.js');
const { sessionReport, groupSessions, AREA_FIX } = require('./club-insights.cjs');
const { clubAccent } = require('./club-colors.cjs');

const HISTORY_MATCHES = 60;
const MAX_PLAYER_LINES = 12;
const GRADE_COLOR = { A: 0x22c55e, B: 0x84cc16, C: 0xeab308, D: 0xf97316, F: 0xef4444 };

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function bar(score) {
  if (score === null || score === undefined) return '░░░░░░░░░░';
  const filled = Math.max(0, Math.min(10, Math.round(score / 100)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function signed(n) {
  return `${n >= 0 ? '+' : ''}${Math.round(n)}`;
}

// report: sessionReport(); club: { name, ... }; prefs: server prefs (branding)
function sessionReportEmbed(report, club, prefs = {}) {
  const color = GRADE_COLOR[report.grade[0]] || clubAccent(club, prefs.branding, 0x5865f2);
  const usual = report.usualControl !== null ? ` · ${signed(report.control - report.usualControl)} on your usual` : '';
  const lines = [
    `**Grade ${report.grade}** · match control ${report.control === null ? '–' : report.control.toFixed(0)}/1000${report.control === null ? '' : usual}`,
    `**${report.wins}W ${report.draws}D ${report.losses}L** · goals ${report.goalsFor}-${report.goalsAgainst}`,
    report.pointsLine,
  ];
  if (report.strength) lines.push(`📈 **What's working:** ${report.strength.label}${report.strength.delta !== null ? ` (${signed(report.strength.delta)} on your usual)` : ''}`);
  if (report.fixFirst) lines.push(`📌 **Priority to address:** ${report.fixFirst.label}${report.fixFirst.delta !== null ? ` (${signed(report.fixFirst.delta)} on your usual)` : ''}. ${AREA_FIX[report.fixFirst.key]}`);
  if (report.playerOfSession) lines.push(`⭐ **Standout performer: ${report.playerOfSession.name}** ${report.playerOfSession.avgRating !== null ? `(${report.playerOfSession.avgRating.toFixed(1)})` : ''}: ${report.playerOfSession.line}`);

  const embed = new EmbedBuilder()
    .setTitle(`🗂️ Front office report · ${club.name}`)
    .setColor(color)
    .setDescription(truncate(lines.join('\n'), 4000));

  const areaLines = report.areas.map((a) => `\`${bar(a.score)}\` **${a.label}** ${a.score === null ? '–' : Math.round(a.score)}${a.delta !== null ? ` (${signed(a.delta)})` : ''}`);
  embed.addFields({ name: 'Team scores (out of 1000 vs real FC27 clubs)', value: truncate(areaLines.join('\n')) });

  const games = report.matches
    .slice()
    .sort((a, b) => a.playedAt - b.playedAt)
    .map((m) => `${m.result === 'win' ? '🟢' : m.result === 'draw' ? '⚪' : '🔴'} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent} · modelled ${m.modelledFor.toFixed(1)}-${m.modelledAgainst.toFixed(1)} · **${m.verdict}**`);
  if (games.length) embed.addFields({ name: 'Results vs performance', value: truncate(games.join('\n')) });

  const players = report.players.slice(0, MAX_PLAYER_LINES).map((p) => `**${p.name}**${p.avgRating !== null ? ` ${p.avgRating.toFixed(1)}` : ''}: ${p.line}`);
  if (players.length) embed.addFields({ name: 'Squad notes', value: truncate(players.join('\n')) });

  embed.setFooter({ text: 'Front office analysis, not the press. Modelled goals use shots on target inside and outside the box, fitted on 14,240 FC27 games. They are not EA xG and say nothing about finishing.' });
  return embed;
}

// The latest night (or the given one) with everything before it as history
function reportFor(matches, nightIndex = 0) {
  const nights = groupSessions(matches);
  const night = nights[nightIndex];
  if (!night) return null;
  const history = nights.slice(nightIndex + 1).flat().slice(0, HISTORY_MATCHES);
  return sessionReport(night, history);
}

function createSessionReport({ autopilot, loadMatches, events }) {
  async function onSessionEnd({ guildId, club, matches, allMatches }) {
    if (!autopilot.isOn(club, 'report') || !matches?.length) return null;
    const ids = new Set(matches.map((m) => m.id));
    const history = (allMatches || []).filter((m) => !ids.has(m.id)).slice(0, HISTORY_MATCHES);
    const report = sessionReport(matches, history);
    if (!report) return null;
    const prefs = events ? await events.serverPrefs(guildId).catch(() => ({})) : {};
    return { embeds: [sessionReportEmbed(report, club, prefs)] };
  }

  async function latestView(guildId, club) {
    const matches = loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
    const report = reportFor(matches);
    if (!report) return { embeds: [new EmbedBuilder().setTitle(`🗂️ Front office report · ${club.name}`).setColor(0x5865f2).setDescription('No synced matches yet. Play a session and it appears here.')] };
    const prefs = events ? await events.serverPrefs(guildId).catch(() => ({})) : {};
    return { embeds: [sessionReportEmbed(report, club, prefs)] };
  }

  if (autopilot?.onSessionEnd) autopilot.onSessionEnd((ctx) => onSessionEnd(ctx).catch((err) => {
    console.warn(`[session-report] failed: ${err.message}`);
    return null;
  }));

  return { onSessionEnd, latestView };
}

module.exports = { createSessionReport, sessionReportEmbed, reportFor };
