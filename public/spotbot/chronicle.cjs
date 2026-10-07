// The Club Chronicle: a twice-daily newspaper-style digest written like a club beat reporter.
//   afternoon  3:00 PM Central: the morning's results plus tonight's slate
//   overnight  midnight Central: the full day's results, three stars and the wire
// Prose is template-driven (no AI key needed on the bot host) and picks phrasing from the day's numbers.

const { EmbedBuilder } = require('discord.js');

const CHRONICLE_TZ = 'America/Chicago';
const EDITIONS = {
  afternoon: { hour: 15, label: 'AFTERNOON EDITION', emoji: '☀️', windowH: 15 },
  overnight: { hour: 0, label: 'FINAL EDITION', emoji: '🌙', windowH: 24 },
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

// Sum each player's line across the day's matches
function playerTotals(matches) {
  const map = new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const key = nm(p).toLowerCase();
      const t = map.get(key) || { name: nm(p), apps: 0, goals: 0, assists: 0, ratingSum: 0, rated: 0, motm: 0, tackles: 0, saves: 0, cleanSheets: 0 };
      t.apps += 1;
      t.goals += n(p.goals);
      t.assists += n(p.assists);
      if (n(p.rating) > 0) {
        t.ratingSum += n(p.rating);
        t.rated += 1;
      }
      if (p.motm) t.motm += 1;
      t.tackles += n(p.tackles ?? p.tacklesmade);
      t.saves += n(p.saves);
      if (m.scoreAgainst === 0) t.cleanSheets += 1;
      map.set(key, t);
    }
  }
  for (const t of map.values()) t.avg = t.rated ? t.ratingSum / t.rated : 0;
  return [...map.values()];
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

function gameStory(m, i, seed) {
  const top = [...m.players].sort((a, b) => n(b.goals) * 3 + n(b.assists) * 2 + n(b.rating) - (n(a.goals) * 3 + n(a.assists) * 2 + n(a.rating)))[0];
  const score = `${m.scoreFor}-${m.scoreAgainst}`;
  const verb = m.result === 'win'
    ? pick([`beat ${m.opponent} ${score}`, `got past ${m.opponent} ${score}`, `took care of ${m.opponent}, ${score}`], seed + i)
    : m.result === 'loss'
      ? pick([`fell ${score} to ${m.opponent}`, `came up short against ${m.opponent}, ${score}`], seed + i)
      : `drew ${score} with ${m.opponent}`;
  const margin = m.scoreFor - m.scoreAgainst;
  const flavor = margin >= 3 ? ' It was never in doubt.' : margin === 1 ? ' It went down to the wire.' : margin <= -3 ? ' A night to forget.' : m.result === 'draw' ? ' Neither side could find the winner.' : '';
  let who = '';
  if (top && (n(top.goals) || n(top.assists) || n(top.rating) >= 7.5)) {
    const bits = [n(top.goals) && `${n(top.goals)} goal${n(top.goals) > 1 ? 's' : ''}`, n(top.assists) && `${n(top.assists)} assist${n(top.assists) > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    who = ` **${nm(top)}** led the way${bits ? ` with ${bits}` : ''}${n(top.rating) ? ` and ${/^8/.test(n(top.rating).toFixed(1)) ? 'an' : 'a'} ${n(top.rating).toFixed(1)} rating` : ''}.`;
  }
  const opener = i === 0 ? pick(['The day opened as', 'First up,', 'It started when'], seed) : pick(['Next,', 'Then', 'Later,', 'After that,'], seed + i);
  return `${opener} the club ${verb}.${flavor}${who}`;
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

function seasonArc(club, matches, seasonMatches) {
  if (!seasonMatches.length) return '';
  const sorted = [...seasonMatches].sort((a, b) => b.playedAt - a.playedAt);
  const w = sorted.filter((m) => m.result === 'win').length;
  const d = sorted.filter((m) => m.result === 'draw').length;
  const l = sorted.length - w - d;
  let streak = 0;
  const kind = sorted[0].result;
  for (const m of sorted) { if (m.result === kind) streak += 1; else break; }
  const streakText = streak >= 3 ? (kind === 'win' ? `They've now won ${streak} straight, and the confidence shows.` : kind === 'loss' ? `That's ${streak} losses in a row, and the next session matters.` : `${streak} draws in a row: close, but not quite.`) : '';
  const last10 = sorted.slice(0, 10);
  const prev10 = sorted.slice(10, 20);
  const pct = (arr) => (arr.length ? arr.filter((m) => m.result === 'win').length / arr.length : 0);
  let trend = '';
  if (prev10.length >= 5) {
    const diff = pct(last10) - pct(prev10);
    trend = diff >= 0.2 ? 'The club is clearly trending up compared to the stretch before.' : diff <= -0.2 ? 'The form has dipped compared to the stretch before, something for the staff to fix.' : 'The form is holding steady.';
  }
  const scorers = playerTotals(sorted).sort((a, b) => b.goals - a.goals);
  const lead = scorers[0]?.goals ? `**${scorers[0].name}** leads the club with ${scorers[0].goals} goals in the matches on record.` : '';
  return [`${club} sits at ${w}-${d}-${l} across ${sorted.length} matches on record.`, streakText, trend, lead].filter(Boolean).join(' ');
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
function storyFacts({ club, matches, seasonMatches }) {
  const games = [...matches].sort((a, b) => a.playedAt - b.playedAt).map((m) => {
    const players = m.players.map((p) => {
      const pass = pct(n(p.passes_made), n(p.pass_attempts));
      return `${nm(p)}${p.position ? ` (${p.position})` : ''} ${n(p.goals)}G ${n(p.assists)}A ${n(p.shots)}sh${pass != null ? ` ${pass}%pass` : ''} ${n(p.tackles)}tkl${n(p.saves) ? ` ${n(p.saves)}sv` : ''} ${n(p.rating) ? n(p.rating).toFixed(1) : '-'}${p.motm ? ' MOTM' : ''}${p.red_cards ? ' RED' : ''}`;
    });
    return `${m.result.toUpperCase()} ${m.scoreFor}-${m.scoreAgainst} vs ${m.opponent}${m.matchType ? ` [${m.matchType}]` : ''}; ${players.join(', ')}`;
  });
  const angles = storyAngles(matches, seasonMatches);
  return `Club: ${club.name}\nToday's games (in order):\n${games.join('\n') || 'none'}\nStory angles (verified from the record):\n${angles.map((a) => `- ${a}`).join('\n') || '- none'}\nSeason context: ${seasonArc(club.name, matches, seasonMatches)}`;
}

// Build the edition embed. upcoming = [{ title, scheduled_at, yes }] events still ahead.
function buildChronicle({ club, edition, matches, upcoming = [], seasonMatches = [], now = new Date(), logoUrl, story }) {
  const ed = EDITIONS[edition];
  const dateText = new Date(now.getTime() - (edition === 'overnight' ? 3600000 : 0)).toLocaleDateString('en-US', { timeZone: CHRONICLE_TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const seed = seedOf(`${club.name}${dateText}${edition}`);
  const totals = playerTotals(matches);
  const stars = [...totals].sort((a, b) => b.goals * 3 + b.assists * 2 + b.avg + b.motm * 2 - (a.goals * 3 + a.assists * 2 + a.avg + a.motm * 2)).slice(0, 3);

  const embed = new EmbedBuilder()
    .setAuthor({ name: `📰 THE ${club.name.toUpperCase()} CHRONICLE · ${ed.emoji} ${ed.label}` })
    .setTitle(headline(club.name, matches, seed))
    .setDescription(`*${dateText} · From the beat desk*\n\n${lede(club.name, matches, stars, seed)}`)
    .setColor(edition === 'overnight' ? 0x2b2d31 : 0xe8d9b5)
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
  const gameText = story || [...matches].sort((a, b) => a.playedAt - b.playedAt).slice(0, 6).map((m, i) => gameStory(m, i, seed)).join(' ');
  if (gameText) embed.addFields({ name: '✍️ THE STORY', value: clip(gameText) });
  const feature = !story && spotlight(stars, seed);
  if (feature) embed.addFields({ name: '🔦 PLAYER SPOTLIGHT', value: clip(feature) });
  const angles = storyAngles(matches, seasonMatches).filter((a) => !/^Team (passing|tackling)|^Finishing/.test(a));
  if (angles.length) embed.addFields({ name: '🔎 THE ANGLE', value: clip(angles.slice(0, 5).map((a) => `• ${a}`).join('\n')) });
  const arc = seasonArc(club.name, matches, seasonMatches);
  if (arc) embed.addFields({ name: '📖 THE STORYLINE', value: clip(arc) });

  if (stars.length) {
    const medals = ['⭐', '⭐⭐', '⭐⭐⭐'];
    const lines = stars.map((s, i) => {
      const bits = [s.goals && `${s.goals}G`, s.assists && `${s.assists}A`, s.avg && `${s.avg.toFixed(1)} avg`, s.motm && `${s.motm}× MOTM`].filter(Boolean).join(', ');
      return `${medals[i]} **${s.name}** (${bits || `${s.apps} apps`})`;
    });
    embed.addFields({ name: '🏅 THREE STARS', value: lines.join('\n') });
  }

  // Notebook: small talking points a beat writer drops at the bottom
  const notes = [];
  const wall = totals.filter((t) => t.cleanSheets > 0).sort((a, b) => b.cleanSheets - a.cleanSheets)[0];
  if (wall) notes.push(`🧱 ${wall.cleanSheets} clean sheet${wall.cleanSheets > 1 ? 's' : ''} today, with **${wall.name}** on the pitch for it.`);
  const ironman = [...totals].sort((a, b) => b.apps - a.apps)[0];
  if (ironman && ironman.apps >= 3) notes.push(`🔁 **${ironman.name}** played every minute the club asked: ${ironman.apps} appearances.`);
  const cold = totals.filter((t) => t.rated >= 2 && t.avg < 6.3)[0];
  if (cold) notes.push(`📉 A quiet one for **${cold.name}** (${cold.avg.toFixed(1)} avg). Expect a bounce back.`);
  if (seasonMatches.length) {
    const form = seasonMatches.slice(0, 5).map((m) => (m.result === 'win' ? '🟢' : m.result === 'loss' ? '🔴' : '⚪')).reverse().join('');
    notes.push(`📈 Form guide, last 5: ${form}`);
  }
  if (notes.length) embed.addFields({ name: "🗒️ REPORTER'S NOTEBOOK", value: clip(notes.join('\n')) });

  if (upcoming.length) {
    const slate = upcoming.slice(0, 5).map((e) => `• **${e.title}** <t:${Math.floor(new Date(e.scheduled_at).getTime() / 1000)}:t>${e.yes != null ? ` · ${e.yes} in` : ''}`);
    embed.addFields({ name: edition === 'afternoon' ? "🗓️ TONIGHT'S SLATE" : '🗓️ ON DECK', value: clip(slate.join('\n')) });
  } else if (edition === 'afternoon') {
    embed.addFields({ name: "🗓️ TONIGHT'S SLATE", value: 'Nothing on the schedule yet. Managers: post a session with /manager.' });
  }

  embed.setFooter({ text: 'The Chronicle prints at 3 PM and midnight Central. /autopilot to change where it runs.' });
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

module.exports = { storyAngles, storyFacts, buildChronicle, EDITIONS, CHRONICLE_TZ };
