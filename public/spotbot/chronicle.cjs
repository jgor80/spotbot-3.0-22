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
    who = ` **${nm(top)}** led the way${bits ? ` with ${bits}` : ''}${n(top.rating) ? ` and a ${n(top.rating).toFixed(1)} rating` : ''}.`;
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

// Plain facts handed to the AI writer, if the bot has one.
function storyFacts({ club, matches, seasonMatches }) {
  const games = [...matches].sort((a, b) => a.playedAt - b.playedAt).map((m) => `${m.result.toUpperCase()} ${m.scoreFor}-${m.scoreAgainst} vs ${m.opponent}; ${m.players.map((p) => `${nm(p)} ${n(p.goals)}G ${n(p.assists)}A ${n(p.rating) ? n(p.rating).toFixed(1) : '-'}${p.motm ? ' MOTM' : ''}`).join(', ')}`);
  return `Club: ${club.name}\nToday's games:\n${games.join('\n') || 'none'}\nSeason context: ${seasonArc(club.name, matches, seasonMatches)}`;
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

module.exports = { storyFacts, buildChronicle, EDITIONS, CHRONICLE_TZ };
