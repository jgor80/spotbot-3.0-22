// Game nights: two to four games on the same night, usually back to back. Each game is its own
// event (own board, answers, lineup, check-in and reminders) and the games share a night_id, so the
// night pings once, reminds each player once and lets a manager copy or auto-fill lineups across it.
// Pure helpers live here; events.cjs, event-lineup.cjs and matchnight.cjs do the Discord side.

const T = require('./event-time.cjs');

const MIN_GAMES = 2;
const MAX_GAMES = 4;
const DEFAULT_GAMES = 3;
const DEFAULT_GAP_MINUTES = 30;
const GAP_CHOICES = [20, 25, 30, 35, 40, 45, 60, 75, 90];
const MIN_GAP_MINUTES = 15;
const MAX_NIGHT_HOURS = 8;
const LAST_GAME_MINUTES = 60;
const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

// "21:45, 22:30" / "9:45pm 10:30pm" / "+40, +40" -> tokens
function splitTimes(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const parts = t.split(/\s*(?:[,;|/]|\band\b|\bthen\b)\s*/i).filter(Boolean);
  if (parts.length > 1) return parts;
  // One chunk: "21:45 22:30" or "9:45pm 10:30pm"; "9 pm" stays one time
  const words = t.split(/\s+/);
  if (words.length > 1 && words.every((w) => /^\+\d+m?$/i.test(w) || T.parseTimeOfDay(w))) return words;
  return [t];
}

// The kick-off of each game: the first one, then either `times` (later kick-offs on the same
// night, as clock times or "+40" minutes after the game before) or `games` games `gap` minutes apart.
// A clock time earlier than the game before rolls past midnight. Returns { kickoffs } or { error }.
function planKickoffs({ first, games, gapMinutes, times, tz = 'UTC' }) {
  if (!(first instanceof Date) || Number.isNaN(first.getTime())) return { error: 'I need the first kick-off.' };
  const kickoffs = [first];
  const later = splitTimes(times);
  if (later.length) {
    for (const token of later) {
      const prev = kickoffs[kickoffs.length - 1];
      const plus = token.match(/^\+\s*(\d{1,3})\s*m?(?:ins?|inutes?)?$/i);
      if (plus) {
        kickoffs.push(new Date(prev.getTime() + Number(plus[1]) * 60000));
        continue;
      }
      const clock = T.parseTimeOfDay(token);
      if (!clock) return { error: `I couldn't read the kick-off "${token}". Use times like 21:45, 9:45pm or +40.` };
      const day = T.localParts(first, tz);
      let at = T.zonedToUtc(day.year, day.month, day.day, clock.hour, clock.minute, tz);
      while (at <= prev) at = T.addLocalDays(at, 1, tz);
      kickoffs.push(at);
    }
  } else {
    const n = Math.round(Number(games) || DEFAULT_GAMES);
    const gap = Math.round(Number(gapMinutes) || DEFAULT_GAP_MINUTES);
    if (n < MIN_GAMES || n > MAX_GAMES) return { error: `A night can have ${MIN_GAMES} to ${MAX_GAMES} games.` };
    for (let i = 1; i < n; i++) kickoffs.push(new Date(first.getTime() + i * gap * 60000));
  }
  if (kickoffs.length < MIN_GAMES) return { error: `Add at least one more kick-off: a night has ${MIN_GAMES} to ${MAX_GAMES} games.` };
  if (kickoffs.length > MAX_GAMES) return { error: `A night can have up to ${MAX_GAMES} games.` };
  for (let i = 1; i < kickoffs.length; i++) {
    const gap = (kickoffs[i] - kickoffs[i - 1]) / 60000;
    if (gap < MIN_GAP_MINUTES) return { error: `Games need at least ${MIN_GAP_MINUTES} minutes between kick-offs (game ${i + 1} is ${Math.round(gap)} after game ${i}).` };
  }
  if (kickoffs[kickoffs.length - 1] - first > MAX_NIGHT_HOURS * 3600000) return { error: `Keep a night within ${MAX_NIGHT_HOURS} hours, or post the late games as their own night.` };
  return { kickoffs };
}

// Minutes each game runs: until the next kick-off, the last one an hour
function durations(kickoffs) {
  return kickoffs.map((k, i) => (i < kickoffs.length - 1 ? Math.max(MIN_GAP_MINUTES, Math.round((kickoffs[i + 1] - k) / 60000)) : LAST_GAME_MINUTES));
}

function gameTitle(base, i, n) {
  const suffix = ` · Game ${i + 1} of ${n}`;
  return `${String(base).slice(0, 100 - suffix.length)}${suffix}`;
}

// The night's running order for a board or DM: "1️⃣ <t:..:t> · 2️⃣ <t:..:t> ...", current game in bold
function scheduleLine(games, currentId = null) {
  return games
    .map((g, i) => {
      const label = `${NUMBERS[i] || `${i + 1}.`} <t:${T.unix(g.scheduled_at)}:t>${g.cancelled ? ' ~~cancelled~~' : ''}`;
      return g.id === currentId ? `**${label}**` : label;
    })
    .join(' · ');
}

// Which games of the night each waiting player still has to answer: Map<userId, game[]>
function waitingByPlayer(perGame) {
  const out = new Map();
  for (const { game, waiting } of perGame) {
    for (const id of waiting) {
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(game);
    }
  }
  return out;
}

// A player's games in one lineup DM: "1️⃣ 21:00 · ST", in night order
function lineupDmLines(entries) {
  return entries.map(({ game, index, slot }) => {
    const where = slot ? (slot.is_substitute ? 'bench' : `starting at **${slot.position}**`) : 'not in this one';
    return `${NUMBERS[index] || `${index + 1}.`} <t:${T.unix(game.scheduled_at)}:t> · ${where}`;
  });
}

module.exports = {
  MIN_GAMES,
  MAX_GAMES,
  DEFAULT_GAMES,
  DEFAULT_GAP_MINUTES,
  GAP_CHOICES,
  NUMBERS,
  splitTimes,
  planKickoffs,
  durations,
  gameTitle,
  scheduleLine,
  waitingByPlayer,
  lineupDmLines,
};
