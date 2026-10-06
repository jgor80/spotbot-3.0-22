// Date parsing for events: "thu 9pm", "tomorrow 20:00", "2026-10-08 21:30", "in 2h", Discord
// <t:...> timestamps. Plain dates are read in the server's timezone, so "9pm" means 9pm there.

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

function isValidTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function allTimeZones() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

// Wall-clock parts of a moment in a timezone
function localParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday.toLowerCase().slice(0, 3)),
  };
}

function offsetMs(date, tz) {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The moment when the clock in tz reads year-month-day hour:minute
function zonedToUtc(year, month, day, hour, minute, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - offsetMs(new Date(guess), tz);
  // Second pass settles DST edges
  result = guess - offsetMs(new Date(result), tz);
  return new Date(result);
}

// Same wall-clock time, n days later (stays at 9pm across DST changes)
function addLocalDays(date, days, tz) {
  const p = localParts(date, tz);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day) + days * DAY_MS);
  return zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), p.hour, p.minute, tz);
}

// "21:00", "9pm", "9:30 pm", "2130" -> { hour, minute }
function parseTimeOfDay(text) {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (m[3] === 'pm' && hour !== 12) hour += 12;
    if (m[3] === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  }
  m = t.match(/^(\d{1,2})[:.h](\d{2})$/) || t.match(/^(\d{2})(\d{2})$/);
  if (m) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

function formatTimeOfDay({ hour, minute }) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseWeekday(word) {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return WEEKDAYS.findIndex((d) => w.startsWith(d));
}

// Next time the clock in tz reads weekday at hour:minute, after `now`
function nextWeekdayAt(weekday, time, tz, now = new Date()) {
  const today = localParts(now, tz);
  let ahead = (weekday - today.weekday + 7) % 7;
  let at = addDaysAt(today, ahead, time, tz);
  if (at <= now) at = addDaysAt(today, ahead + 7, time, tz);
  return at;
}

function addDaysAt(parts, days, time, tz) {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS);
  return zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), time.hour, time.minute, tz);
}

// Parse a kickoff time. Returns a Date or null.
function parseWhen(input, tz = 'UTC', now = new Date()) {
  if (!input) return null;
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '');
  if (!text) return null;

  // Discord timestamp or raw unix seconds
  let m = text.match(/^<t:(\d{9,11})(?::[a-z])?>$/) || text.match(/^(\d{10})$/);
  if (m) return new Date(Number(m[1]) * 1000);

  if (text === 'now') return new Date(now.getTime());

  // "in 2h", "in 90m", "in 1h30m", "in 2 days"
  m = text.match(/^in (\d+)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)(?: ?(\d+)\s*(m|mins?|minutes?))?$/);
  if (m) {
    const unit = m[2][0];
    let ms = Number(m[1]) * (unit === 'm' ? 60000 : unit === 'h' ? 3600000 : DAY_MS);
    if (m[3]) ms += Number(m[3]) * 60000;
    return new Date(now.getTime() + ms);
  }

  // ISO-ish date: 2026-10-08 21:00 / 2026-10-08T21:00 / 2026-10-08 9pm
  m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t](.+))?$/);
  if (m) {
    const time = m[4] ? parseTimeOfDay(m[4]) : { hour: 20, minute: 0 };
    if (!time) return null;
    const d = zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), time.hour, time.minute, tz);
    return isNaN(d.getTime()) ? null : d;
  }

  // Day/month: 8/10 21:00 is ambiguous across regions, so ask for ISO or a weekday instead
  const today = localParts(now, tz);
  const [first, ...rest] = text.split(' ');
  const restText = rest.join(' ');

  if (first === 'today' || first === 'tonight' || first === 'tomorrow' || first === 'tmrw' || first === 'tmr') {
    const time = restText ? parseTimeOfDay(restText) : first === 'tonight' ? { hour: 21, minute: 0 } : null;
    if (!time) return null;
    const isTomorrow = first !== 'today' && first !== 'tonight';
    return addDaysAt(today, isTomorrow ? 1 : 0, time, tz);
  }

  const weekday = parseWeekday(first);
  if (weekday !== -1 && restText) {
    const time = parseTimeOfDay(restText.replace(/^at /, ''));
    if (!time) return null;
    return nextWeekdayAt(weekday, time, tz, now);
  }
  if (first === 'next' && rest.length >= 2) {
    const wd = parseWeekday(rest[0]);
    const time = parseTimeOfDay(rest.slice(1).join(' ').replace(/^at /, ''));
    if (wd === -1 || !time) return null;
    return nextWeekdayAt(wd, time, tz, now);
  }

  // Just a time: today if still ahead, otherwise tomorrow
  const time = parseTimeOfDay(text.replace(/^at /, ''));
  if (time) {
    const at = addDaysAt(today, 0, time, tz);
    return at > now ? at : addDaysAt(today, 1, time, tz);
  }
  return null;
}

// "2h", "90m", "1d", "2h before", "30 mins" -> minutes. null if not an offset.
function parseOffsetMinutes(input) {
  if (!input) return null;
  const m = input
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)(?: ?(\d+)\s*(m|mins?|minutes?))?(?: before(?: kick-?off)?)?$/);
  if (!m) return null;
  const unit = m[2][0];
  let minutes = Number(m[1]) * (unit === 'm' ? 1 : unit === 'h' ? 60 : 1440);
  if (m[3]) minutes += Number(m[3]);
  return minutes;
}

// Deadline is an offset before kickoff ("2h") or its own time ("wed 6pm").
function parseDeadline(input, kickoff, tz, now = new Date()) {
  const offset = parseOffsetMinutes(input);
  if (offset !== null) return new Date(kickoff.getTime() - offset * 60000);
  return parseWhen(input, tz, now);
}

function describeOffset(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes > 60) return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
  return `${minutes}m`;
}

function unix(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

module.exports = {
  WEEKDAYS,
  isValidTimeZone,
  allTimeZones,
  localParts,
  zonedToUtc,
  addLocalDays,
  parseTimeOfDay,
  formatTimeOfDay,
  parseWeekday,
  nextWeekdayAt,
  parseWhen,
  parseOffsetMinutes,
  parseDeadline,
  describeOffset,
  unix,
};
