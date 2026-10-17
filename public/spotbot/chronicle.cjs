// The Club Chronicle: a twice-daily newspaper-style digest written like a club beat reporter.
//   afternoon  3:00 PM Central: the morning's results plus tonight's slate
//   overnight  midnight Central: the full day's results, three stars and the wire
// Prose is template-driven (no AI key needed on the bot host) and picks phrasing from the day's numbers.

const { EmbedBuilder } = require('discord.js');
const { lineOf } = require('./player-season.cjs');
const P = require('./press-copy.cjs');
const { nameJoke } = P;
const { identityOf } = require('./club-identity.cjs');
const { competitionLabel } = require('./club-insights.cjs');

// League / Tournament / BYOT (a manager's tag) or EA's own type, in words
const kindOf = (m) => (m.competition ? competitionLabel(m.competition) : m.matchType || '');

const CHRONICLE_TZ = 'America/Chicago';
const EDITIONS = {
  afternoon: { hour: 15, label: 'AFTERNOON EDITION', emoji: '☀️', windowH: 15 },
  overnight: { hour: 0, label: 'FINAL EDITION', emoji: '🌙', windowH: 24 },
  // Printed by autopilot when a club's voice session ends, covering exactly that session's games
  session: { label: 'SESSION EDITION', emoji: '🎙️' },
};

const n = (v) => Number(v) || 0;
const nm = (p) => (p.ea_username || p.name || 'Unknown').trim();
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const clip = (t, max = 1024) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

function seedOf(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

// Sum each player's line across the day's matches. Clean sheets only count for keepers and defenders
// (by the position EA logged for that match), so a striker never gets credit for the back line's work.
function playerTotals(matches) {
  const map = new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const key = nm(p).toLowerCase();
      const t = map.get(key) || { name: nm(p), apps: 0, goals: 0, assists: 0, shots: 0, ratingSum: 0, rated: 0, motm: 0, tackles: 0, saves: 0, interceptions: 0, clearances: 0, passesMade: 0, passAttempts: 0, chances: 0, hockey: 0, cleanSheets: 0, lines: {} };
      const line = lineOf(p.position);
      if (line) t.lines[line] = (t.lines[line] || 0) + 1;
      t.apps += 1;
      t.goals += n(p.goals);
      t.assists += n(p.assists);
      t.shots += n(p.shots);
      if (n(p.rating) > 0) {
        t.ratingSum += n(p.rating);
        t.rated += 1;
      }
      if (p.motm) t.motm += 1;
      t.tackles += n(p.tackles ?? p.tacklesmade);
      t.saves += n(p.saves);
      t.interceptions += n(p.interceptions);
      t.clearances += n(p.clearances);
      t.passesMade += n(p.passes_made);
      t.passAttempts += n(p.pass_attempts);
      t.chances += n(p.chances_created);
      t.hockey += n(p.hockey_assists);
      if (m.scoreAgainst === 0 && (line === 'GK' || line === 'DEF')) t.cleanSheets += 1;
      map.set(key, t);
    }
  }
  for (const t of map.values()) {
    t.avg = t.rated ? t.ratingSum / t.rated : 0;
    t.line = Object.entries(t.lines).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    t.stops = t.tackles + t.interceptions + t.clearances;
  }
  return [...map.values()];
}

// What kind of game it was, read from the scoreline and the defensive/keeping numbers
function matchScript(m) {
  const margin = m.scoreFor - m.scoreAgainst;
  const total = m.scoreFor + m.scoreAgainst;
  const saves = m.players.reduce((s, p) => s + n(p.saves), 0);
  if (margin >= 4) return 'demolition';
  if (m.result === 'win' && m.scoreAgainst === 0 && total <= 2) return 'lockdown';
  if (total >= 7) return 'shootout';
  if (Math.abs(margin) === 1 && m.result === 'win') return saves >= 4 ? 'smash-and-grab' : 'arm-wrestle';
  if (Math.abs(margin) === 1 && m.result === 'loss') return 'heartbreaker';
  if (m.result === 'draw') return total === 0 ? 'stalemate' : 'trade-off';
  if (margin <= -3) return 'collapse';
  return m.result;
}

function headline(club, matches, seed) {
  if (!matches.length) return pick([`QUIET DAY AT ${club.toUpperCase()} AS SQUAD RESTS UP`, `NO WHISTLES TODAY: ${club.toUpperCase()} SHARPENS FOR WHAT'S NEXT`], seed);
  const w = matches.filter((m) => m.result === 'win').length;
  const l = matches.filter((m) => m.result === 'loss').length;
  const biggest = [...matches].sort((a, b) => b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst))[0];
  const margin = biggest.scoreFor - biggest.scoreAgainst;
  if (w === matches.length && matches.length >= 3) return `${club.toUpperCase()} PERFECT: ${w}-FOR-${w} DAY SENDS A MESSAGE`;
  if (margin >= 4) return `${club.toUpperCase()} ROUTS ${biggest.opponent.toUpperCase()} ${biggest.scoreFor}-${biggest.scoreAgainst}`;
  if (l === matches.length) return pick([`ROUGH DAY AT THE OFFICE FOR ${club.toUpperCase()}`, `${club.toUpperCase()} WINLESS, QUESTIONS MOUNT`], seed);
  if (w > l) return pick([`${club.toUpperCase()} GRINDS OUT A WINNING DAY`, `${club.toUpperCase()} BANKS POINTS, KEEPS MOMENTUM`], seed);
  if (w === l) return `${club.toUpperCase()} SPLITS THE DAY ${w}-${l}`;
  return `${club.toUpperCase()} DROPS MORE THAN IT TAKES`;
}

function lede(club, matches, stars, seed) {
  if (!matches.length) return `No EA matches crossed the wire today for ${club}. The beat desk will be watching the next session closely.`;
  const gf = matches.reduce((s, m) => s + m.scoreFor, 0);
  const ga = matches.reduce((s, m) => s + m.scoreAgainst, 0);
  const top = stars[0];
  const opener = pick(
    [
      `${club} took the pitch ${matches.length} time${matches.length > 1 ? 's' : ''} today, scoring ${gf} and conceding ${ga}.`,
      `Across ${matches.length} match${matches.length > 1 ? 'es' : ''}, ${club} put up ${gf} goals against ${ga} allowed.`,
    ],
    seed
  );
  if (!top) return opener;
  const line = [top.goals && `${top.goals} goal${top.goals > 1 ? 's' : ''}`, top.assists && `${top.assists} assist${top.assists > 1 ? 's' : ''}`, top.avg && `${/^8/.test(top.avg.toFixed(1)) ? 'an' : 'a'} ${top.avg.toFixed(1)} average`].filter(Boolean).join(', ');
  const quip = pick(
    [`The headline belongs to **${top.name}**, who finished with ${line}.`, `Ask anyone in the room and they'll name **${top.name}**: ${line}.`, `**${top.name}** was the story, posting ${line}.`],
    seed >> 3
  );
  return `${opener} ${quip}`;
}

// ---------- Storyline prose: game stories, player features and the club's season arc ----------

// subject set (a club name) writes a single game as its own story instead of a line in the day's run
function gameStory(m, i, seed, subject, id = identityOf(null)) {
  const script = matchScript(m);
  const verb = P.verbFor(script, m, `${m.id}:${seed + i}`, id.voice);
  const top = [...m.players].sort((a, b) => n(b.goals) * 3 + n(b.assists) * 2 + n(b.rating) - (n(a.goals) * 3 + n(a.assists) * 2 + n(a.rating)))[0];
  const bits = [];
  if (top && (n(top.goals) || n(top.assists) || n(top.rating) >= 7.5)) {
    const line = [n(top.goals) && `${n(top.goals) >= 3 ? 'a hat-trick' : n(top.goals) === 2 ? 'a brace' : 'a goal'}`, n(top.assists) && `${n(top.assists)} assist${n(top.assists) > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    bits.push(`**${nm(top)}** led the way${line ? ` with ${line}` : ''}${n(top.rating) ? ` (${n(top.rating).toFixed(1)})` : ''}.`);
  }
  // The other half of the story: who held it together at the back, or who kept them in it
  const defenders = m.players.filter((p) => ['GK', 'DEF', 'MID'].includes(lineOf(p.position)) && p !== top);
  const anchor = defenders.sort((a, b) => n(b.tackles) + n(b.interceptions) + n(b.clearances) - (n(a.tackles) + n(a.interceptions) + n(a.clearances)))[0];
  const stops = anchor ? n(anchor.tackles) + n(anchor.interceptions) + n(anchor.clearances) : 0;
  const keeper = m.players.find((p) => lineOf(p.position) === 'GK' && n(p.saves) >= 3);
  if (keeper && (script === 'smash-and-grab' || script === 'heartbreaker' || m.scoreAgainst === 0)) bits.push(`**${nm(keeper)}** made ${n(keeper.saves)} saves${m.scoreAgainst === 0 ? ' to keep it clean' : ''}.`);
  else if (anchor && stops >= 5) bits.push(`**${nm(anchor)}** did the dirty work with ${stops} defensive stops.`);
  const flavor = ['demolition', 'lockdown', 'shootout', 'smash-and-grab', 'heartbreaker', 'collapse', 'stalemate'].includes(script) ? ` ${P.flavorFor(script, m, `${m.id}:${seed}`, id.voice)}` : '';
  const joke = id.nameJokes ? nameJoke(m.opponent, m.result, m.id) : null;
  if (joke) bits.push(joke);
  if (subject) return `${subject} ${verb}.${flavor} ${bits.join(' ')}`.trim();
  const opener = i === 0 ? pick(['The day opened as', 'First up,', 'It started when'], seed) : pick(['Next,', 'Then', 'Later,', 'After that,'], seed + i);
  return `${opener} the club ${verb}.${flavor} ${bits.join(' ')}`.trim();
}

function spotlight(stars, seed) {
  const s = stars[0];
  if (!s) return '';
  const lines = [];
  if (s.goals >= 3) lines.push(`${s.goals} goals in a day is the kind of output that changes a dressing room's mood.`);
  else if (s.assists >= 3) lines.push(`${s.assists} assists says it all: everything good went through them.`);
  else if (s.avg >= 8) lines.push(`A ${s.avg.toFixed(1)} average across ${s.apps} appearance${s.apps > 1 ? 's' : ''} is as steady as it gets.`);
  else lines.push(`${s.apps} appearance${s.apps > 1 ? 's' : ''}, and the numbers kept adding up.`);
  if (s.motm) lines.push(`Man of the match ${s.motm > 1 ? `${s.motm} times` : 'once'}, too.`);
  const second = stars[1];
  if (second) lines.push(pick([`**${second.name}** deserves a mention as well.`, `Don't overlook **${second.name}**, who was right behind.`], seed));
  return `**${s.name}**: ${lines.join(' ')}`;
}

function seasonArc(club, matches, seasonMatches, seed = 0) {
  if (!seasonMatches.length) return '';
  const sorted = [...seasonMatches].sort((a, b) => b.playedAt - a.playedAt);
  const rec = (arr) => {
    const w = arr.filter((m) => m.result === 'win').length;
    const d = arr.filter((m) => m.result === 'draw').length;
    return { w, d, l: arr.length - w - d, pts: w * 3 + d, gf: arr.reduce((s, m) => s + m.scoreFor, 0), ga: arr.reduce((s, m) => s + m.scoreAgainst, 0), games: arr.length };
  };
  const all = rec(sorted);
  const out = [`${club} sits at **${all.w}-${all.d}-${all.l}** across ${all.games} matches on record (${all.gf} scored, ${all.ga} conceded).`];

  // Streaks: same-result run, plus unbeaten / winless runs
  let streak = 0;
  const kind = sorted[0].result;
  for (const m of sorted) { if (m.result === kind) streak += 1; else break; }
  let unbeaten = 0;
  for (const m of sorted) { if (m.result !== 'loss') unbeaten += 1; else break; }
  let winless = 0;
  for (const m of sorted) { if (m.result !== 'win') winless += 1; else break; }
  if (streak >= 3 && kind === 'win') out.push(pick([`${streak} straight wins. Somebody check on the kit man, he hasn't stopped smiling.`, `That's ${streak} wins on the bounce, and the swagger is back.`], seed));
  else if (streak >= 3 && kind === 'loss') out.push(pick([`${streak} defeats in a row. The next session isn't just a game, it's a referendum.`, `That's ${streak} straight losses; the staff will want answers before kick-off.`], seed));
  else if (unbeaten >= 5) out.push(`Unbeaten in ${unbeaten}. Not always pretty, but hard to beat.`);
  else if (winless >= 4) out.push(`Now ${winless} without a win, and the pressure is building.`);

  // Points pace: last 5 vs the 5 before, goals per game vs the season baseline
  const last5 = rec(sorted.slice(0, 5));
  const prev5 = rec(sorted.slice(5, 10));
  if (last5.games === 5) {
    let pace = `**${last5.pts} of 15** points from the last five`;
    if (prev5.games === 5) pace += last5.pts > prev5.pts + 2 ? `, up from ${prev5.pts} the five before. The arrow points up.` : last5.pts < prev5.pts - 2 ? `, down from ${prev5.pts} the five before. Something has slipped.` : `, level with the stretch before.`;
    else pace += '.';
    out.push(pace);
  }
  if (all.games >= 10 && last5.games === 5) {
    const gfAll = all.gf / all.games, gaAll = all.ga / all.games;
    const gfNow = last5.gf / 5, gaNow = last5.ga / 5;
    if (gfNow >= gfAll + 0.8) out.push(`The attack is purring: ${gfNow.toFixed(1)} goals a game lately vs ${gfAll.toFixed(1)} on the season.`);
    else if (gfNow <= gfAll - 0.8) out.push(`The goals have dried up: ${gfNow.toFixed(1)} a game lately vs ${gfAll.toFixed(1)} on the season.`);
    if (gaNow <= gaAll - 0.8) out.push(`And the back line has tightened, conceding ${gaNow.toFixed(1)} a game lately (season ${gaAll.toFixed(1)}).`);
    else if (gaNow >= gaAll + 0.8) out.push(`The leak at the back is real: ${gaNow.toFixed(1)} conceded a game lately (season ${gaAll.toFixed(1)}).`);
  }

  // Who is carrying it, and the team they can't seem to beat
  const totals = playerTotals(sorted);
  const scorer = [...totals].sort((a, b) => b.goals - a.goals)[0];
  const creator = [...totals].sort((a, b) => b.assists - a.assists)[0];
  if (scorer?.goals) out.push(`**${scorer.name}** leads the scoring with ${scorer.goals}${creator?.assists && creator.name !== scorer.name ? `, while **${creator.name}** pulls the strings with ${creator.assists} assists` : ''}.`);
  const vs = new Map();
  for (const m of sorted) {
    if (!m.opponent || m.opponent === 'Unknown') continue;
    const r = vs.get(m.opponent) || { w: 0, l: 0, g: 0 };
    r.g += 1;
    if (m.result === 'win') r.w += 1;
    if (m.result === 'loss') r.l += 1;
    vs.set(m.opponent, r);
  }
  const nemesis = [...vs.entries()].filter(([, r]) => r.g >= 2 && r.l > r.w).sort((a, b) => b[1].l - a[1].l)[0];
  const bunny = [...vs.entries()].filter(([, r]) => r.g >= 2 && r.w === r.g).sort((a, b) => b[1].w - a[1].w)[0];
  if (nemesis) out.push(`Bogey team: **${nemesis[0]}** (${nemesis[1].w}-${nemesis[1].l} on record).`);
  else if (bunny) out.push(`Favourite opponent: **${bunny[0]}**, beaten all ${bunny[1].w} times.`);

  // The verdict
  const winRate = all.w / all.games;
  const verdict = last5.games === 5 && last5.pts >= 12 ? 'Verdict: this is a side that believes right now. Ride the wave.'
    : last5.games === 5 && last5.pts <= 3 ? 'Verdict: a reset is needed. Simple football, fewer heroics.'
    : winRate >= 0.6 ? 'Verdict: contenders, if they keep their heads.'
    : winRate <= 0.35 ? 'Verdict: still building. The bright spots are there; the consistency is not.'
    : 'Verdict: a coin-flip side for now. The next week decides which way it lands.';
  out.push(`*${verdict}*`);
  return out.join(' ');
}

// ---------- Story angles: the things a beat writer would notice from the record ----------
// Every angle is computed from saved matches, so the prose never claims anything the data doesn't show.
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

function storyAngles(matches, seasonMatches) {
  const angles = [];
  if (!matches.length) return angles;
  const todayIds = new Set(matches.map((m) => m.id));
  const earlier = seasonMatches.filter((m) => !todayIds.has(m.id) && matches.every((t) => m.playedAt < t.playedAt));
  const priorTotals = new Map(playerTotals(earlier).map((t) => [t.name.toLowerCase(), t]));
  const today = playerTotals(matches);

  // Season-best results
  const margin = (m) => m.scoreFor - m.scoreAgainst;
  const bestEarlier = earlier.length ? Math.max(...earlier.map(margin)) : null;
  const bestToday = [...matches].sort((a, b) => margin(b) - margin(a))[0];
  if (bestEarlier != null && earlier.length >= 5 && margin(bestToday) > bestEarlier && margin(bestToday) > 0) {
    angles.push(`Biggest win on record: ${bestToday.scoreFor}-${bestToday.scoreAgainst} over ${bestToday.opponent}.`);
  }
  const mostGoalsEarlier = earlier.length ? Math.max(...earlier.map((m) => m.scoreFor)) : null;
  const mostToday = Math.max(...matches.map((m) => m.scoreFor));
  if (mostGoalsEarlier != null && earlier.length >= 5 && mostToday > mostGoalsEarlier) angles.push(`${mostToday} goals in one game is the club's highest total on record.`);

  // Rematches and grudges
  for (const m of matches) {
    const past = earlier.filter((e) => e.opponent && e.opponent === m.opponent && e.opponent !== 'Unknown');
    if (!past.length) continue;
    const pw = past.filter((e) => e.result === 'win').length;
    const pl = past.filter((e) => e.result === 'loss').length;
    if (pl > pw && m.result === 'win') angles.push(`Revenge: beat ${m.opponent} after going ${pw}-${pl} against them before.`);
    else if (pw > pl && m.result === 'loss') angles.push(`Upset: ${m.opponent} had lost ${pw} of ${past.length} earlier meetings but won this one.`);
    else angles.push(`Rematch with ${m.opponent}: now ${pw + (m.result === 'win' ? 1 : 0)}-${pl + (m.result === 'loss' ? 1 : 0)} all-time on record.`);
  }

  // Player milestones, breakthroughs and droughts
  for (const t of today) {
    const prior = priorTotals.get(t.name.toLowerCase());
    const before = prior?.goals || 0;
    for (const mark of [10, 25, 50, 100]) {
      if (before < mark && before + t.goals >= mark) angles.push(`Milestone: **${t.name}** reached ${mark} goals on record.`);
    }
    const appsBefore = prior?.apps || 0;
    for (const mark of [25, 50, 100]) {
      if (appsBefore < mark && appsBefore + t.apps >= mark) angles.push(`Milestone: **${t.name}** made appearance #${mark}.`);
    }
    if (!prior && t.apps) angles.push(`Debut on record for **${t.name}**${t.goals ? `, and scored right away` : ''}.`);
    else if (prior && before === 0 && t.goals && prior.apps >= 3) angles.push(`First goal on record for **${t.name}** after ${prior.apps} appearances.`);
    if (prior && t.goals) {
      // Drought: games since last goal before today
      const sorted = [...earlier].sort((a, b) => b.playedAt - a.playedAt);
      let dry = 0;
      for (const m of sorted) {
        const p = m.players.find((x) => nm(x).toLowerCase() === t.name.toLowerCase());
        if (!p) continue;
        if (n(p.goals)) break;
        dry += 1;
      }
      if (dry >= 5 && before > 0) angles.push(`**${t.name}** ended a ${dry}-game scoring drought.`);
    }
    if (prior && prior.rated >= 5 && t.rated) {
      const diff = t.avg - prior.avg;
      if (diff >= 1) angles.push(`**${t.name}** played well above their usual level (${t.avg.toFixed(1)} vs ${prior.avg.toFixed(1)} average).`);
      else if (diff <= -1.2) angles.push(`An off day for **${t.name}** (${t.avg.toFixed(1)} vs their usual ${prior.avg.toFixed(1)}).`);
    }
  }

  // How the games were won: passing, tackling, keeping
  const sum = (k) => matches.reduce((s, m) => s + m.players.reduce((x, p) => x + n(p[k]), 0), 0);
  const passPct = pct(sum('passes_made'), sum('pass_attempts'));
  const tacklePct = pct(sum('tackles'), sum('tackle_attempts'));
  const shots = sum('shots');
  const goals = matches.reduce((s, m) => s + m.scoreFor, 0);
  if (passPct != null) angles.push(`Team passing: ${passPct}% completed.`);
  if (tacklePct != null) angles.push(`Team tackling: ${tacklePct}% of tackles won.`);
  if (shots >= 5) angles.push(`Finishing: ${goals} goals from ${shots} shots (${pct(goals, shots)}% conversion).`);
  const keeper = today.filter((t) => t.saves > 0).sort((a, b) => b.saves - a.saves)[0];
  if (keeper && keeper.saves >= 4) angles.push(`**${keeper.name}** made ${keeper.saves} saves.`);

  // Partnerships: players who scored and assisted in the same games
  const pairs = new Map();
  for (const m of matches) {
    const scorers = m.players.filter((p) => n(p.goals));
    const creators = m.players.filter((p) => n(p.assists));
    for (const s of scorers) for (const c of creators) {
      if (nm(s) === nm(c)) continue;
      const k = `${nm(c)} → ${nm(s)}`;
      pairs.set(k, (pairs.get(k) || 0) + 1);
    }
  }
  const duo = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0];
  if (duo && duo[1] >= 2) angles.push(`Partnership: ${duo[0]} both contributed in ${duo[1]} of today's games.`);

  return angles.slice(0, 10);
}

// Plain facts handed to the AI writer, if the bot has one.
// single: one postgame story, so only that game's own numbers go in (no run, season or history)
function storyFacts({ club, matches, seasonMatches, single = false }) {
  const games = [...matches].sort((a, b) => a.playedAt - b.playedAt).map((m) => {
    const players = m.players.map((p) => {
      const pass = pct(n(p.passes_made), n(p.pass_attempts));
      return `${nm(p)}${p.position ? ` (${p.position})` : ''} ${n(p.goals)}G ${n(p.assists)}A ${n(p.shots)}sh${pass != null ? ` ${pass}%pass` : ''} ${n(p.tackles)}tkl${n(p.saves) ? ` ${n(p.saves)}sv` : ''} ${n(p.rating) ? n(p.rating).toFixed(1) : '-'}${p.motm ? ' MOTM' : ''}${p.red_cards ? ' RED' : ''}${n(p.interceptions) ? ` ${n(p.interceptions)}int` : ''}${n(p.clearances) ? ` ${n(p.clearances)}clr` : ''}${n(p.chances_created) ? ` ${n(p.chances_created)}chances(est)` : ''}`;
    });
    return `${m.result.toUpperCase()} ${m.scoreFor}-${m.scoreAgainst} vs ${m.opponent}${kindOf(m) ? ` [${kindOf(m)}]` : ''} (script: ${matchScript(m)}); ${players.join(', ')}`;
  });
  const id = identityOf(club);
  const jokes = id.nameJokes ? [...new Set(matches.map((m) => nameJoke(m.opponent, m.result, m.id)).filter(Boolean))] : [];
  if (single) {
    const puns = matches.map((m) => P.statPun(m, m.id, [], id.voice)).filter(Boolean).map((x) => x.replace(/\*/g, ''));
    const game = storyAngles(matches, matches).filter((a) => /^Team (passing|tackling)|^Finishing|saves\.$/.test(a));
    return `Club: ${club.name}\nThe game:\n${games.join('\n')}\nThis game's numbers: ${game.join(' ') || 'none'}${puns.length || jokes.length ? `\nOptional gags (use at most one, only if it lands, or write a better one): ${[...puns, ...jokes].join(' | ')}` : ''}`;
  }
  const angles = storyAngles(matches, seasonMatches);
  const run = recentRun(seasonMatches, new Date(Math.max(...matches.map((m) => +m.playedAt), 0) || Date.now()));
  return `Club: ${club.name}\nToday's games (in order):\n${games.join('\n') || 'none'}\nStory angles (verified from the record):\n${angles.map((a) => `- ${a}`).join('\n') || '- none'}\nRecent run (newest first): ${run.map((m) => `${m.result[0].toUpperCase()} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent}`).join(', ') || 'none'}\nSeason context: ${seasonArc(club.name, matches, seasonMatches).replace(/\*/g, '')}${jokes.length ? `\nOptional name gags (use one only if it lands, or write a better one): ${jokes.join(' | ')}` : ''}`;
}

const starScore = (t) => t.goals * 3 + t.assists * 2 + t.avg + t.motm * 2;
const RUN_LENGTH = 10;

// The recent run: the last games on record up to now, newest first
function recentRun(seasonMatches, now = new Date(), n = RUN_LENGTH) {
  return [...seasonMatches].filter((m) => m.playedAt <= now).sort((a, b) => b.playedAt - a.playedAt).slice(0, n);
}

// What an edition is about, shared by the embed and the front-page image so they always agree.
// Cover players are today's stars, or the run's best performers on a quiet day.
function editionCover({ club, edition, matches, seasonMatches = [], now = new Date() }) {
  const ed = EDITIONS[edition];
  const dateText = new Date(now.getTime() - (edition === 'overnight' ? 3600000 : 0)).toLocaleDateString('en-US', { timeZone: CHRONICLE_TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const seed = seedOf(`${club.name}${dateText}${edition}`);
  const totals = playerTotals(matches);
  const stars = [...totals].sort((a, b) => starScore(b) - starScore(a)).slice(0, 3);
  const run = recentRun(seasonMatches, now);
  const runStars = [...playerTotals(run)].sort((a, b) => starScore(b) - starScore(a)).slice(0, 3);
  const w = run.filter((m) => m.result === 'win').length;
  const d = run.filter((m) => m.result === 'draw').length;
  // Storyline in plain sentences for the image: record, streak and pace, without the markdown
  const storyline = seasonArc(club.name, matches, seasonMatches, seed).replace(/\*/g, '');
  return {
    ed, dateText, seed, totals, stars, run,
    coverStars: stars.length ? stars : runStars,
    headline: headline(club.name, matches, seed),
    record: run.length ? `${w}-${d}-${run.length - w - d}` : null,
    storyline,
  };
}

// The run in one line per game, newest first, for the embed
function runLines(run) {
  return run.map((m) => `${m.result === 'win' ? '🟢 W' : m.result === 'loss' ? '🔴 L' : '⚪ D'} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent}`);
}

// Build the edition embed. upcoming = [{ title, scheduled_at, yes }] events still ahead.
// image: optional front-page PNG (Buffer) drawn from the same cover.
function buildChronicle({ club, edition, matches, upcoming = [], seasonMatches = [], now = new Date(), logoUrl, story, image }) {
  const { ed, dateText, seed, totals, stars, run, record } = editionCover({ club, edition, matches, seasonMatches, now });
  const id = identityOf(club);

  const embed = new EmbedBuilder()
    .setAuthor({ name: `📰 ${id.paper.toUpperCase()} · ${ed.emoji} ${ed.label}` })
    .setTitle(headline(club.name, matches, seed))
    .setDescription(`*${dateText} · From the beat desk*\n\n${lede(club.name, matches, stars, seed)}`)
    .setColor(edition === 'afternoon' ? 0xe8d9b5 : 0x2b2d31)
    .setTimestamp(now);
  if (logoUrl) embed.setThumbnail(logoUrl);

  if (matches.length) {
    const box = [...matches]
      .sort((a, b) => a.playedAt - b.playedAt)
      .map((m) => {
        const tag = m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D';
        const scorers = m.players.filter((p) => n(p.goals) > 0).map((p) => `${nm(p)}${n(p.goals) > 1 ? ` ×${n(p.goals)}` : ''}`).join(', ');
        return `**${tag} ${m.scoreFor}-${m.scoreAgainst}** vs ${m.opponent}${scorers ? ` · ⚽ ${scorers}` : ''}`;
      });
    embed.addFields({ name: '📋 BOX SCORES', value: clip(box.join('\n')) });
  }

  // The prose: game stories, player feature and the club storyline
  const gameText = story || [...matches].sort((a, b) => a.playedAt - b.playedAt).slice(0, 6).map((m, i) => gameStory(m, i, seed, undefined, id)).join(' ');
  if (gameText) embed.addFields({ name: '✍️ THE STORY', value: clip(gameText) });
  const feature = !story && spotlight(stars, seed);
  if (feature) embed.addFields({ name: '🔦 PLAYER SPOTLIGHT', value: clip(feature) });
  const angles = storyAngles(matches, seasonMatches).filter((a) => !/^Team (passing|tackling)|^Finishing/.test(a));
  if (angles.length) embed.addFields({ name: '🔎 THE ANGLE', value: clip(angles.slice(0, 5).map((a) => `• ${a}`).join('\n')) });
  // The run of games, then where it leaves the season
  if (run.length >= 2) embed.addFields({ name: `🏃 THE RUN · ${record} in the last ${run.length}`, value: clip(runLines(run).join('\n')) });
  const arc = seasonArc(club.name, matches, seasonMatches, seed);
  if (arc) embed.addFields({ name: '📖 THE STORYLINE', value: clip(arc) });

  if (stars.length) {
    const medals = ['⭐', '⭐⭐', '⭐⭐⭐'];
    const lines = stars.map((s, i) => {
      const bits = [s.goals && `${s.goals}G`, s.assists && `${s.assists}A`, s.avg && `${s.avg.toFixed(1)} avg`, s.motm && `${s.motm}× MOTM`].filter(Boolean).join(', ');
      return `${medals[i]} **${s.name}** (${bits || `${s.apps} apps`})`;
    });
    embed.addFields({ name: '🏅 THREE STARS', value: lines.join('\n') });
  }

  // Notebook: position-aware talking points with a little colour
  const notes = [];
  const backLine = totals.filter((t) => t.cleanSheets > 0 && (t.line === 'GK' || t.line === 'DEF'));
  if (backLine.length) {
    const keeper = backLine.find((t) => t.line === 'GK');
    const rock = backLine.filter((t) => t.line === 'DEF').sort((a, b) => b.stops - a.stops)[0];
    const cs = Math.max(...backLine.map((t) => t.cleanSheets));
    const who = [keeper && `**${keeper.name}**${keeper.saves ? ` (${keeper.saves} saves)` : ''}`, rock && `**${rock.name}**${rock.stops ? ` (${rock.stops} stops)` : ''}`].filter(Boolean).join(' and ');
    notes.push(`🧱 ${cs} clean sheet${cs > 1 ? 's' : ''} today. Credit the back line: ${who}.`);
  } else {
    const rock = totals.filter((t) => t.line === 'DEF' || t.line === 'MID').sort((a, b) => b.stops - a.stops)[0];
    if (rock && rock.stops >= 8) notes.push(`🛡️ **${rock.name}** racked up ${rock.stops} defensive stops (tackles, interceptions, clearances). Unglamorous, essential.`);
  }
  const engine = totals.filter((t) => t.line === 'MID' && t.passAttempts >= 20).map((t) => ({ ...t, pp: t.passesMade / t.passAttempts })).sort((a, b) => b.pp - a.pp)[0];
  if (engine && engine.pp >= 0.82) notes.push(`🎼 Engine room: **${engine.name}** completed ${Math.round(engine.pp * 100)}% of ${engine.passAttempts} passes. Metronome stuff.`);
  const sniper = totals.filter((t) => t.goals >= 2 && t.shots > 0).sort((a, b) => b.goals / b.shots - a.goals / a.shots)[0];
  if (sniper && sniper.goals / sniper.shots >= 0.5) notes.push(`🎯 **${sniper.name}**: ${sniper.goals} goals from ${sniper.shots} shots. Ruthless.`);
  else {
    const wasteful = totals.filter((t) => t.shots >= 6 && t.goals === 0).sort((a, b) => b.shots - a.shots)[0];
    if (wasteful) notes.push(`🥅 **${wasteful.name}** fired ${wasteful.shots} shots without scoring. The crossbar has filed a complaint.`);
  }
  const creator = totals.filter((t) => t.chances >= 4).sort((a, b) => b.chances - a.chances)[0];
  if (creator) notes.push(`🧠 **${creator.name}** created about ${creator.chances} chances (estimate from EA match events).`);
  const workhorse = [...totals].sort((a, b) => b.apps - a.apps)[0];
  if (workhorse && workhorse.apps >= 3 && workhorse.apps === matches.length) notes.push(`🔁 **${workhorse.name}** featured in all ${workhorse.apps} games. Somebody get them an ice bath.`);
  const cold = totals.filter((t) => t.rated >= 2 && t.avg < 6.3).sort((a, b) => a.avg - b.avg)[0];
  if (cold) notes.push(`📉 A day to forget for **${cold.name}** (${cold.avg.toFixed(1)} avg). Form is temporary.`);
  if (seasonMatches.length) {
    const form = [...seasonMatches].sort((a, b) => b.playedAt - a.playedAt).slice(0, 5).map((m) => (m.result === 'win' ? '🟢' : m.result === 'loss' ? '🔴' : '⚪')).reverse().join('');
    notes.push(`📈 Form guide, last 5: ${form}`);
  }
  if (matches.length) {
    const w = matches.filter((m) => m.result === 'win').length;
    const mood = w === matches.length ? ['☕ Overheard: the espresso machine in the manager\'s office has been running non-stop.', '🎶 Overheard: someone is playing music way too loud in the dressing room. Nobody is complaining.']
      : w === 0 ? ['📼 Overheard: the video room is booked for a long session tomorrow.', '🥐 Overheard: nobody touched the post-match cannoli.']
      : ['🗣️ Overheard: "We take the points and we go again." Classic.', '📋 Overheard: the whiteboard in the tactics room has been wiped and redrawn twice.'];
    notes.push(`${pick(mood, seed >> 5)} *(Colour, not fact.)*`);
  }
  if (notes.length) embed.addFields({ name: "🗒️ REPORTER'S NOTEBOOK", value: clip(notes.join('\n')) });

  if (upcoming.length) {
    const slate = upcoming.slice(0, 5).map((e) => `• **${e.title}** <t:${Math.floor(new Date(e.scheduled_at).getTime() / 1000)}:t>${e.yes != null ? ` · ${e.yes} in` : ''}`);
    embed.addFields({ name: edition === 'afternoon' ? "🗓️ TONIGHT'S SLATE" : '🗓️ ON DECK', value: clip(slate.join('\n')) });
  } else if (edition === 'afternoon') {
    embed.addFields({ name: "🗓️ TONIGHT'S SLATE", value: 'Nothing on the schedule yet. Managers: post a session with /manager.' });
  }

  embed.setFooter({ text: edition === 'session'
    ? 'Session edition: printed when the club voice channel emptied. /autopilot to change where it runs.'
    : 'The Chronicle prints at 3 PM and midnight Central. /autopilot to change where it runs.' });
  if (image) {
    embed.setImage('attachment://chronicle.png');
    return { embeds: [embed], files: [{ attachment: image, name: 'chronicle.png' }], allowedMentions: { parse: [] } };
  }
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

// ---------- Full-time extra: one match written up as a Chronicle story ----------
// Posted in the Chronicle's channel right after the regular recap, so every game gets a newspaper
// write-up beside the 3 PM and midnight editions. Same masthead, newsprint colour and beat-desk voice.

// Kicker over the headline in the club's chosen voice, picked by the kind of game it was
function kicker(id, m, seed) {
  const k = id.def.kickers[matchScript(m)] || id.def.kickers.win;
  return k?.length ? `${pick(k, seed)} ` : '';
}

// A short sign-off for the bottom of a story, in the club's voice (none for straight news)
function signOff(id, club, m, seed) {
  const lines = id.def.signOff?.[m.result === 'win' ? 'win' : m.result === 'draw' ? 'draw' : 'loss'];
  return lines ? pick(lines(club), seed) : '';
}

function reportHeadline(club, m, seed) {
  const C = club.toUpperCase();
  const O = String(m.opponent || 'Unknown').toUpperCase();
  const score = `${m.scoreFor}-${m.scoreAgainst}`;
  const hatTrick = m.players.find((p) => n(p.goals) >= 3);
  if (hatTrick && m.result === 'win') return `${nm(hatTrick).toUpperCase()} HAT-TRICK SINKS ${O} ${score}`;
  const keeper = m.players.find((p) => lineOf(p.position) === 'GK' && n(p.saves) >= 4);
  return {
    demolition: pick([`${C} ROUTS ${O} ${score}`, `${C} RUNS RIOT: ${O} BURIED ${score}`], seed),
    lockdown: keeper ? `${nm(keeper).toUpperCase()} SLAMS THE DOOR AS ${C} BLANKS ${O}` : `${C} SHUTS OUT ${O} ${score}`,
    shootout: m.result === 'win' ? `${C} SURVIVES ${score} SHOOTOUT WITH ${O}` : m.result === 'loss' ? `${C} LOSES ${score} THRILLER TO ${O}` : `${score} CHAOS: ${C} AND ${O} SHARE THE SPOILS`,
    'smash-and-grab': `${C} SMASH-AND-GRABS ${score} WIN AT ${O}`,
    'arm-wrestle': pick([`${C} EDGES ${O} ${score}`, `NERVES OF STEEL: ${C} HOLDS ON ${score}`], seed),
    heartbreaker: pick([`${C} EDGED ${score} BY ${O}`, `ONE GOAL SHORT: ${C} FALLS TO ${O}`], seed),
    stalemate: `${C} AND ${O} PLAY OUT GOALLESS DRAW`,
    'trade-off': `${C} AND ${O} SPLIT THE POINTS ${score}`,
    collapse: pick([`${C} FLATTENED ${score} BY ${O}`, `NIGHT TO FORGET: ${O} TAKES ${C} APART`], seed),
    win: `${C} TAKES CARE OF ${O} ${score}`,
    loss: `${C} FALLS ${score} TO ${O}`,
  }[matchScript(m)] || `${C} ${score} ${O}`;
}

// How the game was won or lost, from the team's own passing, tackling and finishing
function howItWent(m) {
  const sum = (k) => m.players.reduce((x, p) => x + n(p[k]), 0);
  const passPct = pct(sum('passes_made'), sum('pass_attempts'));
  const tacklePct = pct(sum('tackles'), sum('tackle_attempts'));
  const shots = sum('shots');
  const bits = [];
  if (passPct != null) bits.push(`completed ${passPct}% of their passes`);
  if (tacklePct != null) bits.push(`won ${tacklePct}% of their tackles`);
  if (shots >= m.scoreFor && shots > 0) bits.push(`turned ${m.scoreFor} of ${shots} shot${shots > 1 ? 's' : ''} into goals`);
  if (!bits.length) return '';
  const last = bits.pop();
  return `By the numbers, the side ${bits.length ? `${bits.join(', ')} and ${last}` : last}.`;
}

// The postgame piece: a few sentences about this one game only. The run, streaks, records and the
// season storyline belong to the twice-daily editions.
function matchLede(club, m, seed, id = identityOf(null)) {
  const script = matchScript(m);
  const verb = P.verbFor(script, m, m.id, id.voice);
  const top = [...m.players].sort((a, b) => n(b.goals) * 3 + n(b.assists) * 2 + n(b.rating) - (n(a.goals) * 3 + n(a.assists) * 2 + n(a.rating)))[0];
  const out = [`${club} ${verb}.`];
  if (top && (n(top.goals) || n(top.assists) || n(top.rating) >= 7.5)) {
    const did = [n(top.goals) && (n(top.goals) >= 3 ? 'a hat-trick' : n(top.goals) === 2 ? 'a brace' : 'a goal'), n(top.assists) && `${n(top.assists)} assist${n(top.assists) > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    const r = n(top.rating) ? ` (${n(top.rating).toFixed(1)})` : '';
    const t = `**${nm(top)}**`;
    out.push(P.pickFrom(did
      ? [`${t} led the way with ${did}${r}.`, `${t} was the difference: ${did}${r}.`, `Take a bow, ${t}: ${did}${r}.`, `${t} ran the show with ${did}${r}.`, `Chief architect: ${t}, with ${did}${r}.`]
      : [`${t} was the pick of the bunch${r}.`, `${t} quietly ran the game${r}.`], m.id, 'top'));
  }
  // One gag at most: a pun on someone's numbers, else a joke on the opponent's name
  const gag = P.statPun(m, m.id, top ? [nm(top)] : [], id.voice) || (id.nameJokes && nameJoke(m.opponent, m.result, m.id)) || P.statPun(m, m.id, [], id.voice);
  if (gag) out.push(gag);
  const flavor = P.flavorFor(script, m, m.id, id.voice);
  if (flavor) out.push(flavor);
  const sign = signOff(id, club, m, seed);
  if (sign) out.push(`*${sign}*`);
  return out.join(' ');
}

function buildMatchReport({ club, match: m, logoUrl, story }) {
  const at = m.playedAt instanceof Date ? m.playedAt : new Date(m.playedAt);
  const dateText = at.toLocaleDateString('en-US', { timeZone: CHRONICLE_TZ, weekday: 'long', month: 'long', day: 'numeric' });
  const timeText = at.toLocaleTimeString('en-US', { timeZone: CHRONICLE_TZ, hour: 'numeric', minute: '2-digit' });
  const seed = seedOf(`${club.name}${m.id}`);
  const tag = m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D';
  const id = identityOf(club);
  const kick = kicker(id, m, seed).trim();

  const embed = new EmbedBuilder()
    .setAuthor({ name: `📰 ${id.paper.toUpperCase()} · 🏁 FULL-TIME EXTRA` })
    .setTitle(`${kick ? `${kick}${/[!?]$/.test(kick) ? '' : ' ·'} ` : ''}${reportHeadline(club.name, m, seed)}`.slice(0, 256))
    .setDescription(clip(`*${dateText}, ${timeText} Central*\n\n${story || matchLede(club.name, m, seed, id)}`, 1500))
    .setColor(0xe8d9b5)
    .setTimestamp(at);
  if (logoUrl) embed.setThumbnail(logoUrl);

  // Box score: result, scorers and the top five ratings in one compact field
  const scorers = m.players.filter((p) => n(p.goals) > 0).sort((a, b) => n(b.goals) - n(a.goals)).map((p) => `${nm(p)}${n(p.goals) > 1 ? ` ×${n(p.goals)}` : ''}`);
  const assists = m.players.filter((p) => n(p.assists) > 0).sort((a, b) => n(b.assists) - n(a.assists)).map((p) => `${nm(p)}${n(p.assists) > 1 ? ` ×${n(p.assists)}` : ''}`);
  const rated = m.players.filter((p) => n(p.rating) > 0).sort((a, b) => n(b.rating) - n(a.rating)).slice(0, 5);
  const box = [`**${tag} ${m.scoreFor}-${m.scoreAgainst}** vs ${m.opponent}${kindOf(m) ? ` · ${kindOf(m)}` : ''}`];
  if (scorers.length) box.push(`⚽ ${scorers.join(', ')}${assists.length ? `  🎯 ${assists.join(', ')}` : ''}`);
  if (rated.length) box.push(`📊 ${rated.map((p) => `${nm(p)} ${n(p.rating).toFixed(1)}${p.motm ? '⭐' : ''}`).join(' · ')}`);
  embed.addFields({ name: '📋 BOX SCORE', value: clip(box.join('\n')) });

  embed.setFooter({ text: 'Full-time extra. The run and the storyline are in the 3 PM and midnight editions.' });
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

module.exports = { matchScript, seasonArc, storyAngles, storyFacts, buildChronicle, editionCover, recentRun, buildMatchReport, matchLede, reportHeadline, nameJoke, EDITIONS, CHRONICLE_TZ };
