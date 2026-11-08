// One player's deep stats (EA's hidden per-player event data, src/lib/advancedStats.ts) for the surfaces
// that show a single player: the /me profile, player cards and the Discord Deep Stats breakdown.

const {
  toInsightMatches, computeAdvancedPlayers, computeFormTrends, benchRole, benchmarkPlayer, percentileText, ROLE_LABELS, MIN_ROLE_GAMES,
} = require('./club-insights.cjs');

const MATCH_WINDOW = 100;
const ROLE_SHORT = { GK: 'GKS', DEF: 'DEFS', MID: 'MIDS', FWD: 'FWDS' };

const signedPts = (v) => (v === null || v === undefined ? '–' : `${Math.round(v) > 0 ? '+' : ''}${Math.round(v)} pts`);

// "🟢 Decisions: top 12% of FC27 midfielders" lines (clear strengths and weaknesses only) plus the form trend
function benchmarkLines(player, trend, limit = 4) {
  const role = benchRole(player);
  const lines = role
    ? benchmarkPlayer(player)
      .filter((b) => b.percentile >= 60 || b.percentile <= 25)
      .slice(0, limit)
      .map((b) => `${b.percentile >= 50 ? '🟢' : '🔴'} ${b.label}: ${percentileText(b.percentile, role)}`)
    : [];
  if (trend) {
    const icon = trend.trend === 'Improving' ? '📈' : trend.trend === 'Dipping' ? '📉' : '➖';
    lines.push(`${icon} ${trend.trend}: last ${trend.recentGames} games decisions ${signedPts(trend.decisionChange)}, positioning ${signedPts(trend.positioningChange)}`);
  }
  return lines;
}

// The player's best FC27 percentile (75th or better) as short card text: "TOP 12% FC27 MIDS: DECISIONS"
function cardBadge(player) {
  const role = benchRole(player);
  if (!role) return null;
  const best = benchmarkPlayer(player)[0];
  if (!best || best.percentile < 75) return null;
  return `TOP ${Math.max(1, Math.round(100 - best.percentile))}% FC27 ${ROLE_SHORT[role]}: ${best.label.toUpperCase()}`;
}

function createDeepStats({ supabase }) {
  // Matches with event data the EA name played in, across every club in the server
  async function loadFor(guildId, eaName) {
    const key = String(eaName || '').trim().toLowerCase();
    if (!key) return null;
    const { data: rows } = await supabase
      .from('club_matches')
      .select('id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, match_data')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(MATCH_WINDOW);
    const matches = toInsightMatches(rows || []).filter((m) => m.players.some((p) => p.events && String(p.ea_username || '').trim().toLowerCase() === key));
    if (matches.length < MIN_ROLE_GAMES) return null;
    const player = computeAdvancedPlayers(matches, MIN_ROLE_GAMES).find((p) => p.key === key);
    if (!player) return null;
    return { player, trend: computeFormTrends(matches).find((t) => t.key === key) || null };
  }

  async function eaNameOf(discordUserId) {
    const { data } = await supabase.from('profiles').select('ea_username').eq('discord_user_id', discordUserId).maybeSingle();
    return data?.ea_username || null;
  }

  // Embed field for the profile, or null when there isn't enough event data yet
  async function profileField(guildId, discordUserId) {
    const found = await loadFor(guildId, await eaNameOf(discordUserId));
    if (!found) return null;
    const { player, trend } = found;
    const d = player.derived;
    const pct = (v) => (v === null ? '–' : `${Math.round(v)}%`);
    const head = `Decisions ${pct(d.decisionScore)} · positioning ${pct(d.positionalDiscipline)}${d.passStyle ? ` · ${d.passStyle} passer` : ''}${player.bestRole ? ` · best as ${ROLE_LABELS[player.bestRole].toLowerCase()}` : ''}`;
    const value = [head, ...benchmarkLines(player, trend, 3)].join('\n').slice(0, 1024);
    return { name: `🧠 Deep stats (${player.games} games)`, value, inline: false };
  }

  async function badgeFor(guildId, discordUserId) {
    const found = await loadFor(guildId, await eaNameOf(discordUserId));
    return found ? cardBadge(found.player) : null;
  }

  return { loadFor, profileField, badgeFor };
}

module.exports = { createDeepStats, benchmarkLines, cardBadge, signedPts };
