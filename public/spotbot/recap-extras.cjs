// Home-focused recap flavour, all from real match numbers (InsightMatch from club-insights.cjs):
// a Gazzetta-style headline, a dressing-room mood line, unit badges and fantasy points.
// Pure functions so recaps, the Chronicle and trophies can share them.

const { lineOf, num } = require('./player-season.cjs');

const name = (p) => String(p?.ea_username || '').trim();

// Fantasy points per match line. Simple and public so members can check the maths.
function fantasyPoints(p, match) {
  const line = lineOf(p.position);
  let pts = 2; // turned up
  pts += num(p.goals) * (line === 'DEF' || line === 'GK' ? 6 : 4);
  pts += num(p.assists) * 3;
  if ((line === 'GK' || line === 'DEF') && num(match.scoreAgainst) === 0) pts += 4;
  pts += Math.floor(num(p.saves) / 3);
  pts += (num(p.tackles) + num(p.interceptions)) * 0.5;
  pts += Math.floor(num(p.possessions_won) / 5);
  if (num(p.pass_attempts) >= 10 && num(p.passes_made) / num(p.pass_attempts) >= 0.85) pts += 2;
  if (p.motm) pts += 3;
  if (match.result === 'win') pts += 1;
  return Math.round(pts * 10) / 10;
}

// Deterministic pick so a recap reads the same if reposted
function pick(list, seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function headline(match, club) {
  const players = match.players || [];
  const top = [...players].sort((a, b) => num(b.goals) * 3 + num(b.assists) * 2 + num(b.rating) - (num(a.goals) * 3 + num(a.assists) * 2 + num(a.rating)))[0];
  const keeper = players.find((p) => lineOf(p.position) === 'GK');
  const diff = num(match.scoreFor) - num(match.scoreAgainst);
  const seed = `${match.id}`;
  const club_ = club?.name || 'The club';
  if (match.result === 'win' && num(top?.goals) >= 3) return `🎩 ${name(top)} hat-trick sinks ${match.opponent}`;
  if (match.result === 'win' && keeper && num(match.scoreAgainst) === 0 && num(keeper.saves) >= 4)
    return `🧱 ${name(keeper)} shuts the door: ${num(keeper.saves)} saves, nothing past him`;
  if (match.result === 'win' && diff >= 3) return pick([`🔥 ${club_} run riot against ${match.opponent}`, `🌋 Etna erupts: ${club_} bury ${match.opponent}`], seed);
  if (match.result === 'win' && diff === 1) return pick([`😮‍💨 Nerves of steel: ${club_} edge ${match.opponent}`, `🫀 ${club_} hang on by a thread`], seed);
  if (match.result === 'win' && top) return `⭐ ${name(top)} masterclass lifts ${club_}`;
  if (match.result === 'draw') return pick([`🤝 Honours even with ${match.opponent}`, `⚖️ ${club_} and ${match.opponent} cancel each other out`], seed);
  if (diff <= -3) return pick([`🌧️ A night to forget against ${match.opponent}`, `🕯️ Light a candle: ${club_} flattened by ${match.opponent}`], seed);
  return pick([`💔 Heartbreak for ${club_} against ${match.opponent}`, `😤 ${club_} fall short, but the fight was there`], seed);
}

function mood(match) {
  const diff = num(match.scoreFor) - num(match.scoreAgainst);
  if (match.result === 'win' && diff >= 3) return '🎉 Dressing room: music on, shirts off. Total control.';
  if (match.result === 'win' && num(match.scoreAgainst) === 0) return '🔒 Dressing room: quiet pride. The back line did the work.';
  if (match.result === 'win') return '😁 Dressing room: buzzing, three points banked.';
  if (match.result === 'draw') return '😐 Dressing room: shrugs and "we should have won that".';
  if (diff <= -3) return '🥶 Dressing room: silence. Someone is hiding in the showers.';
  return '😣 Dressing room: frustrated, but nobody gave up.';
}

// Unit badges: credit the back line and the midfield as groups
function unitBadges(match) {
  const players = match.players || [];
  const out = [];
  const back = players.filter((p) => ['GK', 'DEF'].includes(lineOf(p.position)));
  if (back.length && num(match.scoreAgainst) === 0) {
    const ti = back.reduce((s, p) => s + num(p.tackles) + num(p.interceptions) + num(p.clearances), 0);
    out.push(`🧱 **Defensive Wall** clean sheet · ${back.map(name).join(', ')}${ti ? ` · ${ti} tackles/interceptions/clearances` : ''}`);
  }
  const mids = players.filter((p) => lineOf(p.position) === 'MID');
  const made = mids.reduce((s, p) => s + num(p.passes_made), 0);
  const att = mids.reduce((s, p) => s + num(p.pass_attempts), 0);
  if (mids.length && att >= 30 && made / att >= 0.85) out.push(`⚙️ **Engine Room** ${Math.round((100 * made) / att)}% passing · ${mids.map(name).join(', ')}`);
  return out;
}

function fantasyTop(match, n = 3) {
  return (match.players || [])
    .map((p) => ({ name: name(p), pts: fantasyPoints(p, match) }))
    .filter((x) => x.name)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, n);
}

module.exports = { fantasyPoints, headline, mood, unitBadges, fantasyTop };
