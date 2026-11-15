// Player scores in Discord: contribution out of 1000 against FC27 players of the same role, power
// rankings, clutch, carry and defending. The maths is src/lib/playerScores.ts (bundled in
// club-insights.cjs); this file only builds the embeds.
//   Club Stats panel → Player Scores   the full view, just for the person who pressed it
//   Monday digest                      the power rankings with the week's biggest riser and faller
const { EmbedBuilder } = require('discord.js');
const { playerScores, powerRankings, clutchRatings, carryScores, defendingSummary } = require('./club-insights.cjs');

const ROLE_SHORT = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' };

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const r0 = (v) => (v === null || v === undefined ? '–' : String(Math.round(v)));
const one = (v) => (v === null || v === undefined ? '–' : v.toFixed(1));

function moveText(move) {
  if (move === null) return '🆕';
  if (move > 0) return `⬆️${move}`;
  if (move < 0) return `⬇️${-move}`;
  return '➖';
}

function rankingLines(ranks, max = 10) {
  return ranks.slice(0, max).map((r) => `**${r.rank}.** ${r.name} ${moveText(r.move)} · ${one(r.avgRating)} · ${r.goals}G ${r.assists}A${r.streak >= 3 ? ` · 🔥${r.streak}W` : ''}`);
}

// matches: InsightMatch[] newest first
function playerScoresEmbed(club, matches) {
  const embed = new EmbedBuilder().setTitle(`🧮 ${club.name}: player scores`).setColor(0x0ea5e9);
  const minGames = matches.length >= 40 ? 5 : 3;
  const scores = playerScores(matches, minGames);
  if (!scores.length) return embed.setDescription(`Needs players with ${minGames}+ synced games. Play a few more and check back.`);
  embed.setDescription(
    truncate(
      scores
        .slice(0, 15)
        .map((s, i) => {
          const parts = s.role === 'GK' ? [] : [`ATT ${r0(s.areas.attack)}`, `POS ${r0(s.areas.possession)}`, `WIN ${r0(s.areas.ballWinning)}`];
          return `**${i + 1}. ${s.name}** ${ROLE_SHORT[s.role]} · **${r0(s.overall)}** · ${s.tag}${parts.length ? ` · ${parts.join(' ')}` : ''}`;
        })
        .join('\n'),
      4000
    )
  );
  const ranks = powerRankings(matches);
  if (ranks.length) embed.addFields({ name: '📈 Power rankings (last 5 games)', value: truncate(rankingLines(ranks, 8).join('\n')) });
  const carry = carryScores(matches, minGames);
  if (carry.length) {
    const top = carry.slice(0, 3).map((c) => `🎒 **${c.name}** ${c.score} · ${c.label}`);
    const passenger = carry.filter((c) => c.label === 'Passenger').slice(-1).map((c) => `🧳 ${c.name} ${c.score}`);
    embed.addFields({ name: 'Who carries who', value: truncate([...top, ...passenger].join('\n')), inline: true });
  }
  const clutch = clutchRatings(matches, Math.max(3, minGames - 1));
  if (clutch.length) {
    const cold = clutch.filter((c) => c.label === 'Ice cold').slice(0, 2).map((c) => `🧊 **${c.name}** ${one(c.closeRating)} in ${c.closeGames} close games (${c.edge >= 0 ? '+' : ''}${one(c.edge)})`);
    const shrink = clutch.filter((c) => c.label === 'Shrinks').slice(0, 1).map((c) => `🫠 ${c.name} ${one(c.edge)} in close games`);
    const lines = [...cold, ...shrink];
    if (!lines.length) lines.push(`Top in close games: **${clutch[0].name}** ${one(clutch[0].closeRating)}`);
    embed.addFields({ name: 'Clutch (one-goal games)', value: truncate(lines.join('\n')), inline: true });
  }
  const d = defendingSummary(matches, minGames);
  const defLines = [];
  if (d.pairs[0]) defLines.push(`🤝 **${d.pairs[0].names.join(' & ')}**: ${Math.round(d.pairs[0].cleanSheetRate)}% clean sheets, ${d.pairs[0].concededPerGame.toFixed(1)} conceded a game (${d.pairs[0].games} together)`);
  if (d.trend === 'Tightening') defLines.push(`📉 Conceding less lately: ${d.recent.concededPerGame.toFixed(1)} a game vs ${d.earlier.concededPerGame.toFixed(1)} before`);
  if (d.trend === 'Leaking') defLines.push(`📈 Leaking more lately: ${d.recent.concededPerGame.toFixed(1)} a game vs ${d.earlier.concededPerGame.toFixed(1)} before`);
  if (defLines.length) embed.addFields({ name: 'Defending', value: truncate(defLines.join('\n')) });
  embed.setFooter({ text: `Scores out of 1000 vs FC27 players of the same role (community research data). ATT attack · POS possession · WIN ball-winning. ${matches.length} matches, ${minGames}+ games to qualify.` });
  return embed;
}

// Monday digest fields: the power rankings and who moved most
function digestFields(matches) {
  const ranks = powerRankings(matches);
  if (ranks.length < 3) return [];
  const moved = ranks.filter((r) => r.move !== null);
  const riser = [...moved].sort((a, b) => b.move - a.move)[0];
  const faller = [...moved].sort((a, b) => a.move - b.move)[0];
  const extra = [];
  if (riser && riser.move > 0) extra.push(`🚀 Biggest riser: **${riser.name}** up ${riser.move}`);
  if (faller && faller.move < 0) extra.push(`📉 Biggest faller: **${faller.name}** down ${-faller.move}`);
  return [{ name: '📈 Power rankings', value: truncate([...rankingLines(ranks, 5), ...extra].join('\n')) }];
}

function createPlayerScores({ autopilot, loadMatches }) {
  if (autopilot?.onDigest && loadMatches) {
    autopilot.onDigest(async (guildId, club) => digestFields(await loadMatches(guildId, club.key).catch(() => [])));
  }
  return { digestFields };
}

module.exports = { playerScoresEmbed, digestFields, createPlayerScores };
