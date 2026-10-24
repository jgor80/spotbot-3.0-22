// Awards Night: nominations drawn from the period's EA stats, a squad vote in Discord, then a ceremony.
//   Player of the Month / Season   best all-round numbers (3+ games)
//   Breakout Signing              newest players: first game for the club in the last 90 days
//   Goal of the Month / Season     clips logged from games where that player scored (clips.cjs)
//   Comeback Player               biggest rise in average rating from the first half of the period to the second
// A category with fewer than two nominees is left out. Voting runs 72 hours (or until a leader closes it),
// one vote per member per category, changeable until the close; votes stay private (service role only)
// and only the totals are copied onto the ballot. The ceremony posts a poster with each winner's own
// Studio art in the Hall of Fame channel. Pure helpers here; Discord wiring lives in club-life.cjs.

const { seasonTotals } = require('./player-season.cjs');

const VOTE_HOURS = 72;
const MAX_NOMINEES = 4;
const BREAKOUT_DAYS = 90;

const allRound = (t) => t.avgRating + Math.min(t.games, 12) * 0.04 + ((t.goals + t.assists) / Math.max(t.games, 1)) * 0.35 + t.motm * 0.08;
const line = (t) => [t.goals && `${t.goals}G`, t.assists && `${t.assists}A`, t.avgRating && `${t.avgRating.toFixed(1)} avg`, `${t.games} games`].filter(Boolean).join(' · ');

// Pure: categories with nominees. matches = the period's games; careers = player_career rows;
// clips = club.autopilot.clip_log entries; period = { kind, start, end }
function nominations(matches, { careers = [], clips = [], period }) {
  const label = period.kind === 'season' ? 'Season' : 'Month';
  const totals = [...seasonTotals(matches).values()].filter((t) => t.games >= 3 && t.rated);
  const cats = [];
  const nominee = (t, extra = {}) => ({ key: t.key, name: t.name, line: line(t), ...extra });

  const potm = [...totals].sort((a, b) => allRound(b) - allRound(a)).slice(0, MAX_NOMINEES);
  if (potm.length >= 2) cats.push({ key: 'player', label: `Player of the ${label}`, emoji: '🌟', nominees: potm.map((t) => nominee(t)) });

  const firstSeen = new Map(careers.map((c) => [c.player_key, c.first_match_at ? Date.parse(c.first_match_at) : null]));
  const breakout = totals
    .filter((t) => {
      const first = firstSeen.get(t.key);
      return first && first >= period.end.getTime() - BREAKOUT_DAYS * 86400000;
    })
    .sort((a, b) => allRound(b) - allRound(a))
    .slice(0, MAX_NOMINEES);
  if (breakout.length >= 2) cats.push({ key: 'breakout', label: 'Breakout Signing', emoji: '🌱', nominees: breakout.map((t) => nominee(t)) });

  const inPeriod = (at) => {
    const t = Date.parse(at);
    return t >= period.start.getTime() && t < period.end.getTime() + 3 * 86400000;
  };
  const goalClips = clips.filter((c) => c.url && inPeriod(c.at) && (c.goals == null || c.goals > 0)).slice(-MAX_NOMINEES);
  if (goalClips.length >= 2) {
    cats.push({
      key: 'goal',
      label: `Goal of the ${label}`,
      emoji: '🎯',
      nominees: goalClips.map((c, i) => ({ key: `clip${i}`, name: c.name || 'Club player', line: c.line, url: c.url, discord_user_id: c.discord_user_id || null })),
    });
  }

  // Comeback: second-half average minus first-half average, 2+ rated games in each half
  const mid = period.start.getTime() + (period.end.getTime() - period.start.getTime()) / 2;
  const half = (early) => seasonTotals(matches.filter((m) => (m.playedAt.getTime() < mid) === early));
  const first = half(true);
  const second = half(false);
  const comeback = [...second.values()]
    .filter((t) => t.rated >= 2 && (first.get(t.key)?.rated || 0) >= 2)
    .map((t) => ({ t, rise: t.avgRating - first.get(t.key).avgRating, from: first.get(t.key).avgRating }))
    .filter((x) => x.rise >= 0.3)
    .sort((a, b) => b.rise - a.rise)
    .slice(0, MAX_NOMINEES);
  if (comeback.length >= 2) {
    cats.push({ key: 'comeback', label: 'Comeback Player', emoji: '📈', nominees: comeback.map(({ t, rise, from }) => ({ key: t.key, name: t.name, line: `${from.toFixed(1)} → ${t.avgRating.toFixed(1)} average (+${rise.toFixed(1)})` })) });
  }
  return cats.slice(0, 4);
}

// Pure: results from votes [{ category, choice }]. Ties go to the nominee listed first (the stronger
// numbers, since nominees are sorted best first). A category with no votes has no winner.
function tally(categories, votes) {
  const results = {};
  for (const c of categories) {
    const counts = Object.fromEntries(c.nominees.map((n) => [n.key, 0]));
    for (const v of votes) if (v.category === c.key && v.choice in counts) counts[v.choice]++;
    const max = Math.max(0, ...Object.values(counts));
    const winner = max > 0 ? c.nominees.find((n) => counts[n.key] === max) : null;
    results[c.key] = { winner: winner ? winner.key : null, votes: counts };
  }
  return results;
}

module.exports = { nominations, tally, VOTE_HOURS, MAX_NOMINEES };
