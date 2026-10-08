// Per-player totals from synced matches (InsightMatch objects from club-insights.cjs).
// Shared by the FUT cards, Team of the Week, stat trophies and the assistant coach.

const LINES = { goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD', attacker: 'FWD' };

const LEAVER_RATING = 3;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// EA's broad position for a match line: GK, DEF, MID or FWD (null when unknown)
function lineOf(position) {
  const p = String(position || '').toLowerCase();
  if (LINES[p]) return LINES[p];
  if (/^(gk)$/.test(p)) return 'GK';
  if (/^(cb|lb|rb|lwb|rwb|lcb|rcb)$/.test(p)) return 'DEF';
  if (/^(cdm|cm|cam|lm|rm|ldm|rdm|lcm|rcm)$/.test(p)) return 'MID';
  if (/^(st|cf|lw|rw|ls|rs|lf|rf)$/.test(p)) return 'FWD';
  return null;
}

function emptyLine(name) {
  return {
    name,
    key: name.toLowerCase(),
    games: 0,
    wins: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    passesMade: 0,
    passAttempts: 0,
    tackles: 0,
    tackleAttempts: 0,
    saves: 0,
    interceptions: 0,
    clearances: 0,
    conceded: 0,
    cleanSheets: 0,
    motm: 0,
    ratingSum: 0,
    rated: 0,
    lines: {},
    ratings: [], // newest first
  };
}

// matches: newest first. Returns Map(lowercase name -> totals)
function seasonTotals(matches) {
  const totals = new Map();
  for (const m of matches) {
    for (const p of m.players || []) {
      const name = String(p.ea_username || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!totals.has(key)) totals.set(key, emptyLine(name));
      const t = totals.get(key);
      const line = lineOf(p.position);
      t.games++;
      if (m.result === 'win') t.wins++;
      t.goals += num(p.goals);
      t.assists += num(p.assists);
      t.shots += num(p.shots);
      t.passesMade += num(p.passes_made);
      t.passAttempts += num(p.pass_attempts);
      t.tackles += num(p.tackles);
      t.tackleAttempts += num(p.tackle_attempts);
      t.saves += num(p.saves);
      t.interceptions += num(p.interceptions);
      t.clearances += num(p.clearances);
      if (line === 'GK') t.conceded += m.scoreAgainst;
      // A clean sheet counts for keepers and defenders, like EA's own cleansheetsdef/gk
      if ((line === 'GK' || line === 'DEF') && m.scoreAgainst === 0) t.cleanSheets++;
      if (p.motm) t.motm++;
      // EA gives 3.0 to players who left early; leave those out of averages
      if (num(p.rating) > LEAVER_RATING) {
        t.ratingSum += num(p.rating);
        t.rated++;
        t.ratings.push(num(p.rating));
      }
      if (line) t.lines[line] = (t.lines[line] || 0) + 1;
    }
  }
  for (const t of totals.values()) {
    t.avgRating = t.rated ? t.ratingSum / t.rated : 0;
    t.passPct = t.passAttempts ? (100 * t.passesMade) / t.passAttempts : null;
    t.line = Object.entries(t.lines).sort((a, b) => b[1] - a[1])[0]?.[0] || 'MID';
    t.recentAvg = (n) => {
      const r = t.ratings.slice(0, n);
      return r.length ? r.reduce((s, x) => s + x, 0) / r.length : 0;
    };
  }
  return totals;
}

// Highest by a value; ties all come back. [] when the best is 0.
function leaders(list, value) {
  let best = 0;
  let top = [];
  for (const t of list) {
    const v = value(t);
    if (v > best) {
      best = v;
      top = [t];
    } else if (v === best && v > 0) top.push(t);
  }
  return top;
}

module.exports = { seasonTotals, lineOf, leaders, num, LEAVER_RATING };
