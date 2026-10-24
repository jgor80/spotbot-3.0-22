// The Club Chronicle: a newspaper-style digest written like a club beat reporter.
//   overnight  after midnight in the server's timezone (held until the club's voice session ends, up to
//              3 AM): the whole day's results, three stars, the lead story and the wire
//   session    printed by autopilot when a club's voice session of 2+ games ends
// The paper remembers what it printed (press-log.cjs): it leads with the freshest story, follows running
// storylines (drought watch) to their payoff, rotates its stock lines, and on days without games prints a
// feature (a player profile, a rivalry, the archive, the belts, milestones or badges) instead of reruns.
// Prose is template-driven (no AI key needed on the bot host) and picks phrasing from the day's numbers.

const { EmbedBuilder } = require('discord.js');
const { lineOf } = require('./player-season.cjs');
const P = require('./press-copy.cjs');
const { nameJoke } = P;
const { identityOf } = require('./club-identity.cjs');
const { competitionLabel } = require('./club-insights.cjs');
const { EMPTY_MEMORY } = require('./press-log.cjs');

// League / Tournament / BYOT (a manager's tag) or EA's own type, in words
const kindOf = (m) => (m.competition ? competitionLabel(m.competition) : m.matchType || '');

// Used when a server never set a timezone
const CHRONICLE_TZ = 'America/Chicago';
const EDITIONS = {
  overnight: { hour: 0, label: 'FINAL EDITION', emoji: '🌙', windowH: 24 },
  // Printed by autopilot when a club's voice session ends, covering exactly that session's games
  session: { label: 'SESSION EDITION', emoji: '🎙️' },
};
// The midnight paper waits for a voice session still running, but never past this hour
const HOLD_UNTIL_HOUR = 3;

const n = (v) => Number(v) || 0;
const nm = (p) => (p.ea_username || p.name || 'Unknown').trim();
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const clip = (t, max = 1024) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

function seedOf(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

// Picks stock lines the paper hasn't printed lately. recent: phrase keys from the last editions.
// Deterministic for the same seed and memory, so the embed and the front-page image always agree.
function makePen(seed, recent = new Set()) {
  const used = [];
  return {
    used,
    pick(prefix, arr, salt = 0) {
      const start = Math.abs(seed + salt) % arr.length;
      for (let i = 0; i < arr.length; i++) {
        const k = (start + i) % arr.length;
        const key = `${prefix}:${k}`;
        if (!recent.has(key) || i === arr.length - 1) {
          used.push(key);
          return arr[k];
        }
      }
      return arr[start];
    },
  };
}
const choose = (pen, key, arr, seed) => (pen ? pen.pick(key, arr, seed) : pick(arr, seed));

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

function headline(club, matches, seed, pen) {
  if (!matches.length) return choose(pen, 'hl:quiet', [`QUIET DAY AT ${club.toUpperCase()} AS SQUAD RESTS UP`, `NO WHISTLES TODAY: ${club.toUpperCase()} SHARPENS FOR WHAT'S NEXT`], seed);
  const w = matches.filter((m) => m.result === 'win').length;
  const l = matches.filter((m) => m.result === 'loss').length;
  const biggest = [...matches].sort((a, b) => b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst))[0];
  const margin = biggest.scoreFor - biggest.scoreAgainst;
  if (w === matches.length && matches.length >= 3) return `${club.toUpperCase()} PERFECT: ${w}-FOR-${w} DAY SENDS A MESSAGE`;
  if (margin >= 4) return `${club.toUpperCase()} ROUTS ${biggest.opponent.toUpperCase()} ${biggest.scoreFor}-${biggest.scoreAgainst}`;
  if (l === matches.length) return choose(pen, 'hl:lost', [`ROUGH DAY AT THE OFFICE FOR ${club.toUpperCase()}`, `${club.toUpperCase()} WINLESS, QUESTIONS MOUNT`, `NO JOY FOR ${club.toUpperCase()}`], seed);
  if (w > l) return choose(pen, 'hl:winday', [`${club.toUpperCase()} GRINDS OUT A WINNING DAY`, `${club.toUpperCase()} BANKS POINTS, KEEPS MOMENTUM`, `MORE WINS THAN WOES FOR ${club.toUpperCase()}`, `${club.toUpperCase()} COMES OUT AHEAD`], seed);
  if (w === l) return `${club.toUpperCase()} SPLITS THE DAY ${w}-${l}`;
  return `${club.toUpperCase()} DROPS MORE THAN IT TAKES`;
}

function lede(club, matches, stars, seed, pen) {
  if (!matches.length) return `No EA matches crossed the wire today for ${club}. The beat desk will be watching the next session closely.`;
  const gf = matches.reduce((s, m) => s + m.scoreFor, 0);
  const ga = matches.reduce((s, m) => s + m.scoreAgainst, 0);
  const top = stars[0];
  const opener = choose(
    pen,
    'lede:open',
    [
      `${club} took the pitch ${matches.length} time${matches.length > 1 ? 's' : ''} today, scoring ${gf} and conceding ${ga}.`,
      `Across ${matches.length} match${matches.length > 1 ? 'es' : ''}, ${club} put up ${gf} goals against ${ga} allowed.`,
      `${matches.length} game${matches.length > 1 ? 's' : ''}, ${gf} goals for, ${ga} against: that was the day at ${club}.`,
    ],
    seed
  );
  if (!top) return opener;
  const line = [top.goals && `${top.goals} goal${top.goals > 1 ? 's' : ''}`, top.assists && `${top.assists} assist${top.assists > 1 ? 's' : ''}`, top.avg && `${/^8/.test(top.avg.toFixed(1)) ? 'an' : 'a'} ${top.avg.toFixed(1)} average`].filter(Boolean).join(', ');
  const quip = choose(
    pen,
    'lede:quip',
    [`The headline belongs to **${top.name}**, who finished with ${line}.`, `Ask anyone in the room and they'll name **${top.name}**: ${line}.`, `**${top.name}** was the story, posting ${line}.`, `Top of the class: **${top.name}**, with ${line}.`],
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

function spotlight(stars, seed, pen) {
  const s = stars[0];
  if (!s) return '';
  const lines = [];
  if (s.goals >= 3) lines.push(`${s.goals} goals in a day is the kind of output that changes a dressing room's mood.`);
  else if (s.assists >= 3) lines.push(`${s.assists} assists says it all: everything good went through them.`);
  else if (s.avg >= 8) lines.push(`A ${s.avg.toFixed(1)} average across ${s.apps} appearance${s.apps > 1 ? 's' : ''} is as steady as it gets.`);
  else lines.push(`${s.apps} appearance${s.apps > 1 ? 's' : ''}, and the numbers kept adding up.`);
  if (s.motm) lines.push(`Man of the match ${s.motm > 1 ? `${s.motm} times` : 'once'}, too.`);
  const second = stars[1];
  if (second) lines.push(choose(pen, 'spot:second', [`**${second.name}** deserves a mention as well.`, `Don't overlook **${second.name}**, who was right behind.`, `Honourable mention: **${second.name}**.`], seed));
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

// Each angle: { key, text, weight, head(club) }. key names the story so the paper can tell what it has
// already led with or followed (press-log memory); weight is how newsworthy it is; head is its headline.
// Stat lines (passing, tackling, finishing) have weight 0 and never lead.
function angleList(matches, seasonMatches, memory = EMPTY_MEMORY) {
  const angles = [];
  if (!matches.length) return angles;
  const add = (key, weight, text, head) => angles.push({ key, weight, text, head });
  const U = (s) => String(s).toUpperCase();
  const todayIds = new Set(matches.map((m) => m.id));
  const earlier = seasonMatches.filter((m) => !todayIds.has(m.id) && matches.every((t) => m.playedAt < t.playedAt));
  const priorTotals = new Map(playerTotals(earlier).map((t) => [t.name.toLowerCase(), t]));
  const today = playerTotals(matches);

  // Season-best results
  const margin = (m) => m.scoreFor - m.scoreAgainst;
  const bestEarlier = earlier.length ? Math.max(...earlier.map(margin)) : null;
  const bestToday = [...matches].sort((a, b) => margin(b) - margin(a))[0];
  if (bestEarlier != null && earlier.length >= 5 && margin(bestToday) > bestEarlier && margin(bestToday) > 0) {
    add(`record:margin:${bestToday.id}`, 8, `Biggest win on record: ${bestToday.scoreFor}-${bestToday.scoreAgainst} over ${bestToday.opponent}.`, (c) => `RECORD ROUT: ${U(c)} ${bestToday.scoreFor}-${bestToday.scoreAgainst} ${U(bestToday.opponent)}`);
  }
  const mostGoalsEarlier = earlier.length ? Math.max(...earlier.map((m) => m.scoreFor)) : null;
  const mostToday = Math.max(...matches.map((m) => m.scoreFor));
  if (mostGoalsEarlier != null && earlier.length >= 5 && mostToday > mostGoalsEarlier) add(`record:goals:${mostToday}`, 6, `${mostToday} goals in one game is the club's highest total on record.`, (c) => `${U(c)} HITS ${mostToday}: A CLUB RECORD`);

  // Hat-tricks
  for (const m of matches) for (const p of m.players) {
    if (n(p.goals) >= 3) add(`hattrick:${nm(p).toLowerCase()}:${m.id}`, 8, `**${nm(p)}** scored ${n(p.goals) >= 4 ? n(p.goals) : 'a hat-trick'} against ${m.opponent}.`, () => `${U(nm(p))} ${n(p.goals) >= 4 ? `SCORES ${n(p.goals)}` : 'HAT-TRICK'} ${m.result === 'win' ? `SINKS ${U(m.opponent)}` : `IN VAIN VS ${U(m.opponent)}`}`);
  }

  // Rematches and grudges
  for (const m of matches) {
    const past = earlier.filter((e) => e.opponent && e.opponent === m.opponent && e.opponent !== 'Unknown');
    if (!past.length) continue;
    const pw = past.filter((e) => e.result === 'win').length;
    const pl = past.filter((e) => e.result === 'loss').length;
    const opp = m.opponent.toLowerCase();
    if (pl > pw && m.result === 'win') add(`revenge:${opp}`, 7, `Revenge: beat ${m.opponent} after going ${pw}-${pl} against them before.`, (c) => `REVENGE! ${U(c)} FINALLY GETS ${U(m.opponent)}`);
    else if (pw > pl && m.result === 'loss') add(`upset:${opp}`, 6, `Upset: ${m.opponent} had lost ${pw} of ${past.length} earlier meetings but won this one.`, (c) => `${U(m.opponent)} STUNS ${U(c)}`);
    else add(`rematch:${opp}`, 2, `Rematch with ${m.opponent}: now ${pw + (m.result === 'win' ? 1 : 0)}-${pl + (m.result === 'loss' ? 1 : 0)} all-time on record.`);
  }

  // Player milestones, breakthroughs and droughts
  const sortedEarlier = [...earlier].sort((a, b) => b.playedAt - a.playedAt);
  const dryRun = (name, list) => {
    let dry = 0;
    for (const m of list) {
      const p = m.players.find((x) => nm(x).toLowerCase() === name.toLowerCase());
      if (!p) continue;
      if (n(p.goals)) break;
      dry += 1;
    }
    return dry;
  };
  for (const t of today) {
    const key = t.name.toLowerCase();
    const prior = priorTotals.get(key);
    const before = prior?.goals || 0;
    for (const mark of [10, 25, 50, 100]) {
      if (before < mark && before + t.goals >= mark) add(`milestone:goals:${key}:${mark}`, mark >= 50 ? 9 : 7, `Milestone: **${t.name}** reached ${mark} goals on record.`, () => `${U(t.name)} BRINGS UP ${mark}`);
    }
    const appsBefore = prior?.apps || 0;
    for (const mark of [25, 50, 100]) {
      if (appsBefore < mark && appsBefore + t.apps >= mark) add(`milestone:apps:${key}:${mark}`, 5, `Milestone: **${t.name}** made appearance #${mark}.`, () => `${mark} NOT OUT FOR ${U(t.name)}`);
    }
    if (!prior && t.apps) add(`debut:${key}`, t.goals ? 6 : 3, `Debut on record for **${t.name}**${t.goals ? `, and scored right away` : ''}.`, t.goals ? () => `DREAM DEBUT FOR ${U(t.name)}` : undefined);
    else if (prior && before === 0 && t.goals && prior.apps >= 3) add(`firstgoal:${key}`, 6, `First goal on record for **${t.name}** after ${prior.apps} appearances.`, () => `${U(t.name)} FINALLY OFF THE MARK`);
    if (prior && t.goals) {
      const dry = dryRun(t.name, sortedEarlier);
      // The paper had been counting: a drought it printed pays off with a bigger story
      const counted = memory.stories.has(`drought:${key}`);
      if (dry >= 5 && before > 0) add(`drought-end:${key}`, counted ? 9 : 6, `**${t.name}** ended a ${dry}-game scoring drought.${counted ? ' The Chronicle had been counting.' : ''}`, () => `${U(t.name)} ENDS ${dry}-GAME DROUGHT`);
    }
    // Drought watch: a proven scorer who played today and still didn't score, reprinted at most every 3 days
    if (prior && before >= 5 && !t.goals) {
      const dry = dryRun(t.name, [...matches].sort((a, b) => b.playedAt - a.playedAt).concat(sortedEarlier));
      const last = memory.storyAt.get(`drought:${key}`);
      if (dry >= 6 && (!last || Date.now() - last.getTime() > 3 * 86400000)) add(`drought:${key}`, 3, `Drought watch: **${t.name}** (${before} goals on record) has now gone ${dry} games without scoring.`, () => `DROUGHT WATCH: ${U(t.name)} STILL WAITING`);
    }
    if (prior && prior.rated >= 5 && t.rated) {
      const diff = t.avg - prior.avg;
      if (diff >= 1) add(`form:up:${key}`, 3, `**${t.name}** played well above their usual level (${t.avg.toFixed(1)} vs ${prior.avg.toFixed(1)} average).`);
      else if (diff <= -1.2) add(`form:down:${key}`, 1, `An off day for **${t.name}** (${t.avg.toFixed(1)} vs their usual ${prior.avg.toFixed(1)}).`);
    }
  }

  // Streaks through today
  const run = [...seasonMatches].sort((a, b) => b.playedAt - a.playedAt);
  if (run.length && todayIds.has(run[0].id)) {
    let streak = 0;
    const kind = run[0].result;
    for (const m of run) { if (m.result === kind) streak += 1; else break; }
    if (streak >= 3 && kind === 'win') add(`streak:win:${streak}`, 5 + Math.min(streak, 10) / 2, `${streak} wins in a row.`, (c) => `${U(c)} MAKES IT ${streak} STRAIGHT`);
    if (streak >= 3 && kind === 'loss') add(`streak:loss:${streak}`, 5, `${streak} defeats in a row.`, (c) => `${streak} AND COUNTING: ${U(c)}'S SLIDE GOES ON`);
  }

  // How the games were won: passing, tackling, keeping
  const sum = (k) => matches.reduce((s, m) => s + m.players.reduce((x, p) => x + n(p[k]), 0), 0);
  const passPct = pct(sum('passes_made'), sum('pass_attempts'));
  const tacklePct = pct(sum('tackles'), sum('tackle_attempts'));
  const shots = sum('shots');
  const goals = matches.reduce((s, m) => s + m.scoreFor, 0);
  if (passPct != null) add('stat:passing', 0, `Team passing: ${passPct}% completed.`);
  if (tacklePct != null) add('stat:tackling', 0, `Team tackling: ${tacklePct}% of tackles won.`);
  if (shots >= 5) add('stat:finishing', 0, `Finishing: ${goals} goals from ${shots} shots (${pct(goals, shots)}% conversion).`);
  const keeper = today.filter((t) => t.saves > 0).sort((a, b) => b.saves - a.saves)[0];
  if (keeper && keeper.saves >= 4) add(`saves:${keeper.name.toLowerCase()}`, keeper.saves >= 8 ? 5 : 3, `**${keeper.name}** made ${keeper.saves} saves.`, keeper.saves >= 8 ? () => `${U(keeper.name)} STANDS TALL WITH ${keeper.saves} SAVES` : undefined);

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
  if (duo && duo[1] >= 2) add(`duo:${duo[0].toLowerCase()}`, 4, `Partnership: ${duo[0]} both contributed in ${duo[1]} of today's games.`);

  return angles;
}

// Kept for callers that only want the sentences
function storyAngles(matches, seasonMatches, memory) {
  return angleList(matches, seasonMatches, memory).map((a) => a.text).slice(0, 10);
}

// The lead story: the most newsworthy angle the paper hasn't just led with. Leading with the same story
// (or the same family, like another day of the same win streak) costs it weight.
function pickLead(angles, memory = EMPTY_MEMORY) {
  const family = (k) => k.split(':').slice(0, 2).join(':');
  const recentFamilies = new Set([...memory.leads].map(family));
  let best = null;
  for (const a of angles) {
    if (!a.head) continue;
    const w = a.weight - (memory.leads.has(a.key) ? 10 : 0) - (recentFamilies.has(family(a.key)) ? 2 : 0);
    if (w >= 4 && (!best || w > best.w)) best = { ...a, w };
  }
  return best;
}

// Plain facts handed to the AI writer, if the bot has one.
// single: one postgame story, so only that game's own numbers go in (no run, season or history)
function storyFacts({ club, matches, seasonMatches, single = false, memory = EMPTY_MEMORY }) {
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
  const list = angleList(matches, seasonMatches, memory);
  const lead = pickLead(list, memory);
  const run = recentRun(seasonMatches, new Date(Math.max(...matches.map((m) => +m.playedAt), 0) || Date.now()));
  const recent = memory.headlines.length ? `\nRecent headlines in this paper (do not repeat their angle or wording): ${memory.headlines.slice(0, 5).join(' | ')}` : '';
  return `Club: ${club.name}\nToday's games (in order):\n${games.join('\n') || 'none'}\n${lead ? `Lead story (open with this): ${lead.text.replace(/\*/g, '')}\n` : ''}Story angles (verified from the record):\n${list.slice(0, 10).map((a) => `- ${a.text}`).join('\n') || '- none'}\nRecent run (newest first): ${run.map((m) => `${m.result[0].toUpperCase()} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent}`).join(', ') || 'none'}\nSeason context: ${seasonArc(club.name, matches, seasonMatches).replace(/\*/g, '')}${jokes.length ? `\nOptional name gags (use one only if it lands, or write a better one): ${jokes.join(' | ')}` : ''}${recent}`;
}

const starScore = (t) => t.goals * 3 + t.assists * 2 + t.avg + t.motm * 2;
const RUN_LENGTH = 10;

// The recent run: the last games on record up to now, newest first
function recentRun(seasonMatches, now = new Date(), n = RUN_LENGTH) {
  return [...seasonMatches].filter((m) => m.playedAt <= now).sort((a, b) => b.playedAt - a.playedAt).slice(0, n);
}

// ---------- Quiet days: a feature instead of yesterday's storyline again ----------
// extras (all optional, from autopilot): careers (player_career rows), belts [{ label, name, days }],
// badges [{ name, badge, tier }] earned lately, milestones [{ text }] in reach.

const shortDate = (d, tz) => new Date(d).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });

function featureCandidates({ club, seasonMatches, memory, extras = {}, tz }) {
  const U = (s) => String(s).toUpperCase();
  const fresh = (key) => !memory.stories.has(key);
  const out = {};
  const sorted = [...seasonMatches].sort((a, b) => b.playedAt - a.playedAt);

  // Player profile: a regular from the last month the paper hasn't profiled lately
  const monthAgo = (sorted[0]?.playedAt?.getTime?.() || Date.now()) - 30 * 86400000;
  const regulars = playerTotals(sorted.filter((m) => m.playedAt.getTime() >= monthAgo)).filter((t) => t.apps >= 3).sort((a, b) => b.apps - a.apps);
  const subject = regulars.find((t) => fresh(`feature:profile:${t.name.toLowerCase()}`));
  if (subject) {
    const key = subject.name.toLowerCase();
    const career = (extras.careers || []).find((c) => c.player_key === key);
    const all = playerTotals(sorted).find((t) => t.name.toLowerCase() === key) || subject;
    const lines = { GK: 'in goal', DEF: 'at the back', MID: 'in midfield', FWD: 'up front' };
    const apps = career?.apps ?? all.apps;
    const bits = [`**${subject.name}** has ${apps} appearance${apps === 1 ? '' : 's'} on record`, `${career?.goals ?? all.goals} goals`, `${career?.assists ?? all.assists} assists`];
    const text = [`${bits.join(', ')}${all.avg ? `, averaging ${all.avg.toFixed(1)}` : ''}${all.line ? `, mostly ${lines[all.line]}` : ''}.`];
    text.push(`This past month: ${subject.apps} games, ${subject.goals}G ${subject.assists}A${subject.avg ? `, ${subject.avg.toFixed(1)} average` : ''}.`);
    if (career?.best_rating) text.push(`Best night on record: a ${Number(career.best_rating).toFixed(1)}${career.best_match_at ? ` on ${shortDate(career.best_match_at, tz)}` : ''}.`);
    if (career?.motm) text.push(`Man of the Match ${career.motm} time${career.motm === 1 ? '' : 's'}.`);
    const theirs = (extras.badgesHeld || []).filter((b) => b.player_key === key).slice(0, 4).map((b) => b.name);
    if (theirs.length) text.push(`Badges: ${theirs.join(', ')}.`);
    out.profile = { key: `feature:profile:${key}`, title: `🔍 IN PROFILE · ${subject.name}`, text: text.join(' '), headline: `IN PROFILE: ${U(subject.name)}`, players: [key] };
  }

  // Rivalry: the side met most often
  const vs = new Map();
  for (const m of sorted) {
    if (!m.opponent || m.opponent === 'Unknown') continue;
    if (!vs.has(m.opponent)) vs.set(m.opponent, []);
    vs.get(m.opponent).push(m);
  }
  const rival = [...vs.entries()].filter(([o, list]) => list.length >= 2 && fresh(`feature:rivalry:${o.toLowerCase()}`)).sort((a, b) => b[1].length - a[1].length)[0];
  if (rival) {
    const [opp, list] = rival;
    const w = list.filter((m) => m.result === 'win').length;
    const l = list.filter((m) => m.result === 'loss').length;
    const last = list[0];
    const best = [...list].sort((a, b) => b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst))[0];
    const text = `${list.length} meetings with **${opp}** on record: ${w}W ${list.length - w - l}D ${l}L. Last time (${shortDate(last.playedAt, tz)}): ${last.result === 'win' ? 'won' : last.result === 'loss' ? 'lost' : 'drew'} ${last.scoreFor}-${last.scoreAgainst}.${best.scoreFor > best.scoreAgainst ? ` Best day against them: ${best.scoreFor}-${best.scoreAgainst} on ${shortDate(best.playedAt, tz)}.` : ''} ${w > l ? 'The upper hand is ours, for now.' : l > w ? 'A score still waiting to be settled.' : 'Dead level. The next one decides it.'}`;
    out.rivalry = { key: `feature:rivalry:${opp.toLowerCase()}`, title: `⚔️ RIVALS · ${opp}`, text, headline: `RIVALS: ${U(club.name)} VS ${U(opp)}, THE STORY SO FAR` };
  }

  // From the archive: a big win from at least two weeks back
  const cutoff = (sorted[0]?.playedAt?.getTime?.() || Date.now()) - 14 * 86400000;
  const archive = sorted
    .filter((m) => m.playedAt.getTime() < cutoff && m.result === 'win' && fresh(`feature:archive:${m.id}`))
    .sort((a, b) => b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst) || b.scoreFor - a.scoreFor)[0];
  if (archive) {
    const scorers = archive.players.filter((p) => n(p.goals) > 0).map((p) => `${nm(p)}${n(p.goals) > 1 ? ` ×${n(p.goals)}` : ''}`);
    const motm = archive.players.find((p) => p.motm);
    const text = `${shortDate(archive.playedAt, tz)}: ${club.name} ${archive.scoreFor}-${archive.scoreAgainst} ${archive.opponent}.${scorers.length ? ` Goals from ${scorers.join(', ')}.` : ''}${motm ? ` Man of the Match: **${nm(motm)}**.` : ''} Who was there?`;
    out.archive = { key: `feature:archive:${archive.id}`, title: '📼 FROM THE ARCHIVE', text, headline: `FROM THE ARCHIVE: ${U(club.name)} ${archive.scoreFor}-${archive.scoreAgainst} ${U(archive.opponent)}`, players: archive.players.map((p) => nm(p).toLowerCase()) };
  }

  if (extras.belts?.length && fresh('feature:belts')) {
    out.belts = { key: 'feature:belts', title: '🏆 WHO HOLDS THE BELTS', text: extras.belts.slice(0, 6).map((b) => `• ${b.label}: **${b.name}**${b.days ? `, held ${b.days} day${b.days === 1 ? '' : 's'}` : ''}`).join('\n'), headline: `WHO HOLDS THE BELTS AT ${U(club.name)}` };
  }
  if (extras.milestones?.length && fresh('feature:milestones')) {
    out.milestones = { key: 'feature:milestones', title: '🎯 MILESTONE WATCH', text: extras.milestones.slice(0, 5).map((m) => `• ${m.text}`).join('\n'), headline: `MILESTONE WATCH AT ${U(club.name)}` };
  }
  if (extras.badges?.length && fresh('feature:badges')) {
    out.badges = { key: 'feature:badges', title: '🏅 BADGE ROUND-UP', text: extras.badges.slice(0, 6).map((b) => `• **${b.name}**: ${b.badge}${b.tier && b.tier !== 'common' ? ` (${b.tier})` : ''}`).join('\n'), headline: `BADGE ROUND-UP AT ${U(club.name)}` };
  }
  return out;
}

const FEATURE_ORDER = ['profile', 'rivalry', 'archive', 'belts', 'milestones', 'badges'];

// One feature for a day without games, rotated by the date so the kinds take turns
function quietFeature(opts, seed) {
  const cands = featureCandidates(opts);
  const start = Math.abs(seed) % FEATURE_ORDER.length;
  for (let i = 0; i < FEATURE_ORDER.length; i++) {
    const f = cands[FEATURE_ORDER[(start + i) % FEATURE_ORDER.length]];
    if (f) return f;
  }
  return null;
}

// What an edition is about, shared by the embed and the front-page image so they always agree.
// Cover players are today's stars, or the run's best performers on a quiet day.
function editionCover({ club, edition, matches, seasonMatches = [], now = new Date(), memory = EMPTY_MEMORY, extras = {}, tz = CHRONICLE_TZ }) {
  const ed = EDITIONS[edition] || EDITIONS.overnight;
  const dateText = new Date(now.getTime() - (edition === 'overnight' ? 3 * 3600000 : 0)).toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const seed = seedOf(`${club.name}${dateText}${edition}`);
  const pen = makePen(seed, memory.phrases);
  const totals = playerTotals(matches);
  const stars = [...totals].sort((a, b) => starScore(b) - starScore(a)).slice(0, 3);
  const run = recentRun(seasonMatches, now);
  const runStars = [...playerTotals(run)].sort((a, b) => starScore(b) - starScore(a)).slice(0, 3);
  const w = run.filter((m) => m.result === 'win').length;
  const d = run.filter((m) => m.result === 'draw').length;
  const angles = angleList(matches, seasonMatches, memory);
  const lead = pickLead(angles, memory);
  const feature = matches.length ? null : quietFeature({ club, seasonMatches, memory, extras, tz }, seed);
  // Storyline in plain sentences for the image: record, streak and pace, without the markdown
  const storyline = (feature ? feature.text : seasonArc(club.name, matches, seasonMatches, seed)).replace(/\*/g, '');
  return {
    ed, dateText, seed, pen, totals, stars, run, angles, lead, feature,
    coverStars: stars.length ? stars : runStars,
    headline: lead ? lead.head(club.name) : feature ? feature.headline : headline(club.name, matches, seed, pen),
    record: run.length ? `${w}-${d}-${run.length - w - d}` : null,
    storyline,
  };
}

// The run in one line per game, newest first, for the embed
function runLines(run) {
  return run.map((m) => `${m.result === 'win' ? '🟢 W' : m.result === 'loss' ? '🔴 L' : '⚪ D'} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent}`);
}

// Overheard: a real line someone saved from voice chat this week, else colour in the club's voice
function overheard(id, matches, extras, pen, seed) {
  const quote = (extras.quotes || []).find((q) => q?.text && Date.now() - new Date(q.at).getTime() < 7 * 86400000 && !pen.used.includes(`quote:${q.at}`) && !(extras.usedQuotes || new Set()).has(`quote:${q.at}`));
  if (quote) {
    pen.used.push(`quote:${quote.at}`);
    return `🎧 Overheard in voice: “${clip(quote.text, 200)}”${quote.who ? ` — <@${quote.who}>` : ''}`;
  }
  if (!matches.length) return null;
  const w = matches.filter((m) => m.result === 'win').length;
  const mood = w === matches.length ? 'win' : w === 0 ? 'loss' : 'mixed';
  const pool = id.def.overheard?.[mood];
  return pool?.length ? `🗣️ Overheard: ${pen.pick(`heard:${mood}`, pool, seed >> 5)} *(Colour, not fact.)*` : null;
}

// Build the edition embed. upcoming = [{ title, scheduled_at, yes }] events still ahead.
// image: optional front-page PNG (Buffer) drawn from the same cover. memory: what the paper printed lately
// (press-log.cjs). extras: careers, belts, badges, milestones, quotes and "around the club" lines.
// The returned message carries `press` (headline, lead and story keys) for the press log; strip it
// before sending (press-log.splitPress).
function buildChronicle({ club, edition, matches, upcoming = [], seasonMatches = [], now = new Date(), logoUrl, story, image, memory = EMPTY_MEMORY, extras = {}, tz = CHRONICLE_TZ }) {
  const cover = editionCover({ club, edition, matches, seasonMatches, now, memory, extras, tz });
  const { ed, dateText, seed, pen, totals, stars, run, record, angles, lead, feature } = cover;
  const id = identityOf(club);
  if (!matches.length && !feature && !seasonMatches.length) return null;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `📰 ${id.paper.toUpperCase()} · ${ed.emoji} ${ed.label}` })
    .setTitle(cover.headline.slice(0, 256))
    .setColor(0x2b2d31)
    .setTimestamp(now);
  if (logoUrl) embed.setThumbnail(logoUrl);
  const storyKeys = [];
  const playerKeys = new Set(totals.map((t) => t.name.toLowerCase()));

  if (!matches.length) {
    // A day without games: one feature, the form line and what's next. No storyline rerun.
    embed.setDescription(`*${dateText} · From the beat desk*\n\n${choose(pen, 'quiet:lede', ['No games today, so the desk went digging.', 'A day off the pitch. The notebook stays open.', 'No whistles today. Here is something from the files instead.'], seed)}`);
    if (feature) {
      embed.addFields({ name: feature.title, value: clip(feature.text) });
      storyKeys.push(feature.key);
      for (const k of feature.players || []) playerKeys.add(k);
    }
    if (run.length >= 3) embed.addFields({ name: `🏃 FORM · ${record} in the last ${run.length}`, value: run.slice(0, 5).map((m) => (m.result === 'win' ? '🟢' : m.result === 'loss' ? '🔴' : '⚪')).reverse().join('') });
  } else {
    embed.setDescription(`*${dateText} · From the beat desk*\n\n${lede(club.name, matches, stars, seed, pen)}`);
    const box = [...matches]
      .sort((a, b) => a.playedAt - b.playedAt)
      .map((m) => {
        const tag = m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D';
        const scorers = m.players.filter((p) => n(p.goals) > 0).map((p) => `${nm(p)}${n(p.goals) > 1 ? ` ×${n(p.goals)}` : ''}`).join(', ');
        return `**${tag} ${m.scoreFor}-${m.scoreAgainst}** vs ${m.opponent}${scorers ? ` · ⚽ ${scorers}` : ''}`;
      });
    embed.addFields({ name: '📋 BOX SCORES', value: clip(box.join('\n')) });

    // The prose: game stories, player feature and the club storyline
    const gameText = story || [...matches].sort((a, b) => a.playedAt - b.playedAt).slice(0, 6).map((m, i) => gameStory(m, i, seed, undefined, id)).join(' ');
    if (gameText) embed.addFields({ name: '✍️ THE STORY', value: clip(gameText) });
    const spot = !story && spotlight(stars, seed, pen);
    if (spot) embed.addFields({ name: '🔦 PLAYER SPOTLIGHT', value: clip(spot) });
    // The lead story first, then the rest; stat lines stay out of the angle box
    const shown = [...(lead ? [lead] : []), ...angles.filter((a) => a.weight > 0 && a.key !== lead?.key).sort((a, b) => b.weight - a.weight)].slice(0, 5);
    if (shown.length) embed.addFields({ name: '🔎 THE ANGLE', value: clip(shown.map((a, i) => `${i === 0 && lead ? '🔥' : '•'} ${a.text}`).join('\n')) });
    storyKeys.push(...shown.map((a) => a.key));
    // The run of games, then where it leaves the season, with the verdict in the columnist's own words
    if (run.length >= 2) embed.addFields({ name: `🏃 THE RUN · ${record} in the last ${run.length}`, value: clip(runLines(run).join('\n')) });
    const arc = seasonArc(club.name, matches, seasonMatches, seed);
    const verdict = arc.match(/ ?\*Verdict: (.+)\*$/);
    const body = verdict ? arc.slice(0, verdict.index) : arc;
    if (body) embed.addFields({ name: '📖 THE STORYLINE', value: clip(body) });
    if (verdict && id.def.columnist) embed.addFields({ name: `🖋️ ${id.def.columnist.title.toUpperCase()}`, value: clip(`“${verdict[1]}”\n— *${id.def.columnist.name}*`) });
  }

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
  if (engine && engine.pp >= 0.82) notes.push(`🎼 Engine room: **${engine.name}** completed ${Math.round(engine.pp * 100)}% of ${engine.passAttempts} passes. ${choose(pen, 'note:engine', ['Metronome stuff.', 'Tidy is an understatement.', 'Pass, move, repeat.'], seed)}`);
  const sniper = totals.filter((t) => t.goals >= 2 && t.shots > 0).sort((a, b) => b.goals / b.shots - a.goals / a.shots)[0];
  if (sniper && sniper.goals / sniper.shots >= 0.5) notes.push(`🎯 **${sniper.name}**: ${sniper.goals} goals from ${sniper.shots} shots. ${choose(pen, 'note:sniper', ['Ruthless.', 'Clinical.', 'No wasted ammo.'], seed)}`);
  else {
    const wasteful = totals.filter((t) => t.shots >= 6 && t.goals === 0).sort((a, b) => b.shots - a.shots)[0];
    if (wasteful) notes.push(`🥅 **${wasteful.name}** fired ${wasteful.shots} shots without scoring. ${choose(pen, 'note:wasteful', ['The crossbar has filed a complaint.', 'The goal frame is still shaking.', 'Shooting practice is pencilled in.'], seed)}`);
  }
  const creator = totals.filter((t) => t.chances >= 4).sort((a, b) => b.chances - a.chances)[0];
  if (creator) notes.push(`🧠 **${creator.name}** created about ${creator.chances} chances (estimate from EA match events).`);
  const workhorse = [...totals].sort((a, b) => b.apps - a.apps)[0];
  if (workhorse && workhorse.apps >= 3 && workhorse.apps === matches.length) notes.push(`🔁 **${workhorse.name}** featured in all ${workhorse.apps} games. ${choose(pen, 'note:workhorse', ['Somebody get them an ice bath.', 'The legs will feel it tomorrow.', 'Iron lungs.'], seed)}`);
  const cold = totals.filter((t) => t.rated >= 2 && t.avg < 6.3).sort((a, b) => a.avg - b.avg)[0];
  if (cold) notes.push(`📉 A day to forget for **${cold.name}** (${cold.avg.toFixed(1)} avg). Form is temporary.`);
  if (seasonMatches.length && matches.length) {
    const form = [...seasonMatches].sort((a, b) => b.playedAt - a.playedAt).slice(0, 5).map((m) => (m.result === 'win' ? '🟢' : m.result === 'loss' ? '🔴' : '⚪')).reverse().join('');
    notes.push(`📈 Form guide, last 5: ${form}`);
  }
  const heard = overheard(id, matches, extras, pen, seed);
  if (heard) notes.push(heard);
  if (notes.length) embed.addFields({ name: "🗒️ REPORTER'S NOTEBOOK", value: clip(notes.join('\n')) });

  // Around the club: badges, belt handovers and awards since the last edition
  if (extras.around?.length) embed.addFields({ name: '📣 AROUND THE CLUB', value: clip(extras.around.slice(0, 8).map((l) => `• ${l}`).join('\n')) });

  if (upcoming.length) {
    const slate = upcoming.slice(0, 5).map((e) => `• **${e.title}** <t:${Math.floor(new Date(e.scheduled_at).getTime() / 1000)}:t>${e.yes != null ? ` · ${e.yes} in` : ''}`);
    embed.addFields({ name: '🗓️ ON DECK', value: clip(slate.join('\n')) });
  }

  embed.setFooter({ text: edition === 'session'
    ? 'Session edition: printed when the club voice channel emptied. /autopilot to change where it runs.'
    : 'The Chronicle prints after midnight, server time. Every edition is on the website under Newspaper.' });
  const press = { headline: cover.headline, lead_key: lead?.key || feature?.key || null, story_keys: storyKeys, phrase_keys: pen.used, player_keys: [...playerKeys] };
  if (image) {
    embed.setImage('attachment://chronicle.png');
    return { embeds: [embed], files: [{ attachment: image, name: 'chronicle.png' }], allowedMentions: { parse: [] }, press };
  }
  return { embeds: [embed], allowedMentions: { parse: [] }, press };
}

// ---------- Full-time extra: one match written up as a Chronicle story ----------
// Posted in the Chronicle's channel right after the regular recap, so every game gets a newspaper
// write-up beside the midnight edition. Same masthead, newsprint colour and beat-desk voice.

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
// season storyline belong to the editions.
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

function buildMatchReport({ club, match: m, logoUrl, story, tz = CHRONICLE_TZ }) {
  const at = m.playedAt instanceof Date ? m.playedAt : new Date(m.playedAt);
  const dateText = at.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
  const timeText = at.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const seed = seedOf(`${club.name}${m.id}`);
  const tag = m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D';
  const id = identityOf(club);
  const kick = kicker(id, m, seed).trim();

  const embed = new EmbedBuilder()
    .setAuthor({ name: `📰 ${id.paper.toUpperCase()} · 🏁 FULL-TIME EXTRA` })
    .setTitle(`${kick ? `${kick}${/[!?]$/.test(kick) ? '' : ' ·'} ` : ''}${reportHeadline(club.name, m, seed)}`.slice(0, 256))
    .setDescription(clip(`*${dateText}, ${timeText}*\n\n${story || matchLede(club.name, m, seed, id)}`, 1500))
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

  embed.setFooter({ text: 'Full-time extra. The run and the storyline are in the midnight edition.' });
  const title = embed.data.title;
  return { embeds: [embed], allowedMentions: { parse: [] }, press: { headline: title, story_keys: [`match:${m.id}`], player_keys: m.players.map((p) => nm(p).toLowerCase()), match_id: String(m.id) } };
}

module.exports = { matchScript, seasonArc, storyAngles, angleList, pickLead, makePen, quietFeature, featureCandidates, storyFacts, buildChronicle, editionCover, recentRun, buildMatchReport, matchLede, reportHeadline, nameJoke, playerTotals, EDITIONS, CHRONICLE_TZ, HOLD_UNTIL_HOUR };
