// Club Wrapped: each player's month (on the 1st) and season (when EA's next season starts) as a story:
// games and record, best night, favourite partner, most-faced opponent, badges unlocked and the one thing
// they were the club's best at. Saved to player_wrapped for the website's /wrapped page; the club gets one
// post with a "Get my Wrapped" button that hands each player their own card (drawn locally, no AI), with a
// button to share it. Switch off with /manager → Club Life → Settings (club.autopilot.off has 'wrapped').

const { seasonTotals, num, LEAVER_RATING } = require('./player-season.cjs');
const { playerKey } = require('./club-insights.cjs');
const { toSessions } = require('./coach.cjs');

const MIN_GAMES = 3;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// What a player can be "the club's ..." for, best first. value(t) from seasonTotals; min games to count.
const TITLES = [
  { key: 'goals', title: 'top scorer', value: (t) => t.goals, show: (t) => `${t.goals} goals` },
  { key: 'assists', title: 'chief creator', value: (t) => t.assists, show: (t) => `${t.assists} assists` },
  { key: 'motm', title: 'main character', value: (t) => t.motm, show: (t) => `${t.motm}× Man of the Match` },
  { key: 'rating', title: 'most consistent performer', value: (t) => (t.games >= 5 ? t.avgRating : 0), show: (t) => `${t.avgRating.toFixed(2)} average` },
  { key: 'saves', title: 'last line of defence', value: (t) => t.saves, show: (t) => `${t.saves} saves` },
  { key: 'stops', title: 'brick wall', value: (t) => t.tackles + t.interceptions + t.clearances, show: (t) => `${t.tackles + t.interceptions + t.clearances} defensive stops` },
  { key: 'passing', title: 'metronome', value: (t) => (t.passAttempts >= 100 ? t.passPct : 0), show: (t) => `${Math.round(t.passPct)}% passing` },
  { key: 'apps', title: 'ever-present', value: (t) => t.games, show: (t) => `${t.games} appearances` },
];

const pctOf = (w, n) => (n ? Math.round((100 * w) / n) : 0);

// Pure: one player's Wrapped from the period's matches (any order). badges: [{ name, tier, glyph }]
function wrappedFor(key, matches, { badges = [] } = {}) {
  const all = [...seasonTotals(matches).values()];
  const t = all.find((x) => x.key === key);
  if (!t || t.games < MIN_GAMES) return null;
  const mine = matches.filter((m) => m.players.some((p) => playerKey(p) === key)).sort((a, b) => a.playedAt - b.playedAt);
  const w = mine.filter((m) => m.result === 'win').length;
  const d = mine.filter((m) => m.result === 'draw').length;

  // Best night: the session with their best average rating (2+ games), else their best single game
  let bestNight = null;
  for (const s of toSessions(mine)) {
    const lines = s.map((m) => m.players.find((p) => playerKey(p) === key)).filter(Boolean);
    const rated = lines.filter((p) => num(p.rating) > LEAVER_RATING);
    if (!rated.length) continue;
    const avg = rated.reduce((x, p) => x + num(p.rating), 0) / rated.length;
    const night = { at: s[0].playedAt.toISOString(), games: s.length, goals: lines.reduce((x, p) => x + num(p.goals), 0), assists: lines.reduce((x, p) => x + num(p.assists), 0), avg: Math.round(avg * 100) / 100, wins: s.filter((m) => m.result === 'win').length };
    if (!bestNight || night.avg + night.goals * 0.2 > bestNight.avg + bestNight.goals * 0.2) bestNight = night;
  }

  // Favourite partner: the teammate they won most with (3+ games together), else played most with
  const together = new Map();
  for (const m of mine) for (const p of m.players) {
    const k = playerKey(p);
    if (!k || k === key) continue;
    const r = together.get(k) || { name: String(p.ea_username).trim(), games: 0, wins: 0 };
    r.games++;
    if (m.result === 'win') r.wins++;
    together.set(k, r);
  }
  const partners = [...together.values()];
  const partner = partners.filter((r) => r.games >= 3).sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)[0] || partners.sort((a, b) => b.games - a.games)[0] || null;

  // Most-faced opponent
  const opps = new Map();
  for (const m of mine) {
    if (!m.opponent || m.opponent === 'Unknown') continue;
    const r = opps.get(m.opponent) || { opponent: m.opponent, games: 0, wins: 0, losses: 0 };
    r.games++;
    if (m.result === 'win') r.wins++;
    if (m.result === 'loss') r.losses++;
    opps.set(m.opponent, r);
  }
  const rival = [...opps.values()].sort((a, b) => b.games - a.games)[0] || null;

  // "You were the club's ...": the first title where they lead the club (ties count)
  let title = null;
  for (const T of TITLES) {
    const v = T.value(t);
    if (!v) continue;
    const best = Math.max(...all.map(T.value));
    if (v >= best) {
      title = { key: T.key, text: `You were the club's ${T.title}`, stat: T.show(t) };
      break;
    }
  }
  if (!title) {
    const rank = [...all].sort((a, b) => b.games - a.games).findIndex((x) => x.key === key) + 1;
    title = { key: 'squad', text: `You were one of ${all.length} players to pull on the shirt`, stat: `${t.games} games, #${rank} for appearances` };
  }

  return {
    name: t.name,
    games: t.games,
    wins: w,
    draws: d,
    losses: t.games - w - d,
    winPct: pctOf(w, t.games),
    goals: t.goals,
    assists: t.assists,
    motm: t.motm,
    avgRating: t.avgRating ? Math.round(t.avgRating * 100) / 100 : null,
    cleanSheets: t.cleanSheets,
    line: t.line,
    bestNight,
    partner: partner ? { name: partner.name, games: partner.games, winPct: pctOf(partner.wins, partner.games) } : null,
    rival,
    badges,
    title,
  };
}

// Pure: the image tiles for a Wrapped
function wrappedTiles(d) {
  const tiles = [
    { label: 'Games', value: `${d.games}`, sub: `${d.wins}W ${d.draws}D ${d.losses}L · ${d.winPct}% won` },
    { label: 'Goals + assists', value: `${d.goals} + ${d.assists}`, sub: d.motm ? `${d.motm}× Man of the Match` : d.avgRating ? `${d.avgRating.toFixed(2)} average rating` : null },
  ];
  if (d.bestNight) tiles.push({ label: 'Best night', value: `${d.bestNight.avg.toFixed(1)} avg`, sub: `${new Date(d.bestNight.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.bestNight.games} games, ${d.bestNight.goals}G ${d.bestNight.assists}A` });
  if (d.partner) tiles.push({ label: 'Favourite partner', value: d.partner.name, sub: `${d.partner.games} games together · ${d.partner.winPct}% won` });
  if (d.rival) tiles.push({ label: 'Most-faced opponent', value: d.rival.opponent, sub: `${d.rival.games} meetings · ${d.rival.wins}W ${d.rival.losses}L` });
  tiles.push({ label: 'The stat', value: d.title.stat, sub: d.title.key === 'squad' ? null : 'Best in the club' });
  return tiles.slice(0, 6);
}

// Period helpers. Month: { key: '2026-10', label: 'October 2026', start, end } in the club's timezone.
function monthPeriod(year, month, zonedToUtc, tz) {
  const start = zonedToUtc(year, month, 1, 0, 0, tz);
  const end = month === 12 ? zonedToUtc(year + 1, 1, 1, 0, 0, tz) : zonedToUtc(year, month + 1, 1, 0, 0, tz);
  return { key: `${year}-${String(month).padStart(2, '0')}`, label: `${MONTHS[month - 1]} ${year}`, kind: 'month', start, end };
}

// The season that just ended, when the newest EA season started in the last week
function seasonJustEnded(seasons, now = new Date()) {
  const sorted = [...(seasons || [])].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const started = sorted.filter((s) => Date.parse(s.starts_at) <= now.getTime());
  const current = started[started.length - 1];
  const prev = started[started.length - 2];
  if (!current || !prev || now.getTime() - Date.parse(current.starts_at) > 7 * 86400000) return null;
  return { key: prev.code, label: prev.label, kind: 'season', start: new Date(prev.starts_at), end: new Date(current.starts_at) };
}

module.exports = { wrappedFor, wrappedTiles, monthPeriod, seasonJustEnded, TITLES, MIN_GAMES, MONTHS };
