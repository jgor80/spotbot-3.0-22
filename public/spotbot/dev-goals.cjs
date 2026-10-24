// The assistant coach's weekly development goals: every Monday each regular gets one measurable goal for
// the week, picked from the part of their game furthest below the club's average for their line, and last
// week's goal is marked met or missed from their EA match stats. Goals live in player_goals; the Monday
// digest lists them, /me → Career shows a player their own, and the website's profile shows it too.
// Switch off with /manager → Club Life → Settings (club.autopilot.off has 'goals').

const { seasonTotals } = require('./player-season.cjs');

const DAY = 24 * 60 * 60 * 1000;
const MIN_GAMES = 3; // in the last two weeks, to get a goal
const MIN_ATTEMPTS = { pass_pct: 15, tackle_pct: 6, conversion: 5, save_pct: 6 };

const METRICS = {
  pass_pct: { label: (x) => `Complete ${x}% of your passes`, unit: '%', step: 4, max: 95, lines: ['DEF', 'MID', 'FWD'] },
  tackle_pct: { label: (x) => `Win ${x}% of your tackles`, unit: '%', step: 5, max: 90, lines: ['DEF', 'MID'] },
  conversion: { label: (x) => `Score with ${x}% of your shots`, unit: '%', step: 5, max: 60, lines: ['MID', 'FWD'] },
  save_pct: { label: (x) => `Save ${x}% of the shots you face`, unit: '%', step: 4, max: 90, lines: ['GK'] },
  rating: { label: (x) => `Average a ${x} match rating`, unit: '', step: 0.3, max: 9.5, lines: ['GK', 'DEF', 'MID', 'FWD'] },
};

// A player's value for a metric from seasonTotals numbers (null when there's too little to judge)
function metricValue(t, metric) {
  if (!t) return null;
  if (metric === 'pass_pct') return t.passAttempts >= MIN_ATTEMPTS.pass_pct ? (100 * t.passesMade) / t.passAttempts : null;
  if (metric === 'tackle_pct') return t.tackleAttempts >= MIN_ATTEMPTS.tackle_pct ? (100 * t.tackles) / t.tackleAttempts : null;
  if (metric === 'conversion') return t.shots >= MIN_ATTEMPTS.conversion ? (100 * t.goals) / t.shots : null;
  if (metric === 'save_pct') return t.saves + t.conceded >= MIN_ATTEMPTS.save_pct ? (100 * t.saves) / (t.saves + t.conceded) : null;
  if (metric === 'rating') return t.rated ? t.avgRating : null;
  return null;
}

const round = (metric, v) => (metric === 'rating' ? Math.round(v * 10) / 10 : Math.round(v));

// Pure: the goal for one player. t = their last-two-weeks totals, peers = everyone's (same window).
// Picks the metric where they trail their line's average the most; rating when nothing else applies.
function chooseGoal(t, peers) {
  let best = null;
  for (const [metric, m] of Object.entries(METRICS)) {
    if (!m.lines.includes(t.line)) continue;
    const mine = metricValue(t, metric);
    if (mine == null) continue;
    const others = peers.filter((p) => p.line === t.line && p.key !== t.key).map((p) => metricValue(p, metric)).filter((v) => v != null);
    const avg = others.length ? others.reduce((s, v) => s + v, 0) / others.length : mine;
    // How far below the line average, as a share of the metric's step (rating counts a bit less)
    const gap = (avg - mine) / m.step - (metric === 'rating' ? 0.5 : 0);
    if (!best || gap > best.gap) best = { metric, mine, gap };
  }
  if (!best) return null;
  const m = METRICS[best.metric];
  const target = round(best.metric, Math.min(m.max, best.mine + m.step));
  if (target <= best.mine) return null;
  return { metric: best.metric, label: m.label(target), target, baseline: round(best.metric, best.mine) };
}

// Pure: how a goal went. t = the player's totals for the goal's week (undefined when they didn't play).
function evaluate(goal, t) {
  if (!t || !t.games) return { status: 'no_games', result: null, games: 0 };
  const v = metricValue(t, goal.metric);
  if (v == null) return { status: 'no_games', result: null, games: t.games };
  return { status: v >= Number(goal.target) ? 'met' : 'missed', result: round(goal.metric, v), games: t.games };
}

function fmt(metric, v) {
  return v == null ? '–' : `${v}${METRICS[metric]?.unit || ''}`;
}

function createDevGoals({ supabase, autopilot, loadMatches, linkedIds }) {
  const weekStart = (date) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d;
  };
  const iso = (d) => d.toISOString().slice(0, 10);

  // Mark last week's goals and set this week's; returns digest fields
  async function weekly(guildId, club, now = new Date()) {
    if (!autopilot.isOn(club, 'goals')) return [];
    const thisWeek = weekStart(now);
    const lastWeek = new Date(thisWeek.getTime() - 7 * DAY);
    const matches = await loadMatches(guildId, club.key).catch(() => []);
    const between = (a, b) => matches.filter((m) => m.playedAt >= a && m.playedAt < b);
    const lastTotals = seasonTotals(between(lastWeek, thisWeek));
    const recent = [...seasonTotals(between(new Date(thisWeek.getTime() - 14 * DAY), thisWeek)).values()];

    // Last week's goals
    const { data: open } = await supabase.from('player_goals').select('*').eq('guild_id', guildId).eq('club_key', club.key).eq('week_start', iso(lastWeek)).eq('status', 'open');
    const results = [];
    for (const g of open || []) {
      const r = evaluate(g, lastTotals.get(g.player_key));
      await supabase.from('player_goals').update({ status: r.status, result: r.result, games: r.games }).eq('id', g.id);
      results.push({ ...g, ...r });
    }

    // This week's
    const { data: existing } = await supabase.from('player_goals').select('player_key').eq('guild_id', guildId).eq('club_key', club.key).eq('week_start', iso(thisWeek));
    const have = new Set((existing || []).map((r) => r.player_key));
    const regulars = recent.filter((t) => t.games >= MIN_GAMES && !have.has(t.key));
    const ids = linkedIds ? await linkedIds(regulars.map((t) => t.name)).catch(() => new Map()) : new Map();
    const rows = [];
    for (const t of regulars) {
      const goal = chooseGoal(t, recent);
      if (goal) rows.push({ guild_id: guildId, club_key: club.key, player_key: t.key, player_name: t.name, discord_user_id: ids.get(t.key) || null, week_start: iso(thisWeek), ...goal });
    }
    if (rows.length) await supabase.from('player_goals').upsert(rows, { onConflict: 'guild_id,club_key,player_key,week_start', ignoreDuplicates: true });

    const fields = [];
    if (results.length) {
      const icon = { met: '✅', missed: '❌', no_games: '➖' };
      fields.push({ name: "🎯 Last week's goals", value: results.slice(0, 15).map((r) => `${icon[r.status]} **${r.player_name}**: ${r.label} (${r.status === 'no_games' ? 'not enough games' : `got ${fmt(r.metric, r.result)}`})`).join('\n') });
    }
    if (rows.length) fields.push({ name: "🎯 This week's goals", value: rows.slice(0, 15).map((r) => `**${r.player_name}**: ${r.label} (last two weeks: ${fmt(r.metric, r.baseline)})`).join('\n') });
    return fields;
  }

  // The latest goal for one player (by Discord id), for /me → Career
  async function currentFor(guildId, discordUserId) {
    const { data } = await supabase.from('player_goals').select('*').eq('guild_id', guildId).eq('discord_user_id', discordUserId).order('week_start', { ascending: false }).limit(4);
    return data || [];
  }

  autopilot.onDigest((guildId, club) => weekly(guildId, club));

  return { weekly, currentFor };
}

module.exports = { createDevGoals, chooseGoal, evaluate, metricValue, METRICS, fmt };
