// Date parsing for events: "thu 9pm", "tomorrow 20:00", "21/09/26 1800", "21 sep 8pm",
// "2026-10-08 21:30", "in 2h", Discord <t:...> timestamps. Plain dates are read in the server's
// timezone, so "9pm" means 9pm there. Numeric dates are day-first unless the server's timezone is
// in the Americas (month-first), and either way when one number can only be the day.

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DEFAULT_TIME = { hour: 20, minute: 0 };

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
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(/^(at|@)/, '');
  if (t === 'noon' || t === 'midday') return { hour: 12, minute: 0 };
  if (t === 'midnight') return { hour: 0, minute: 0 };
  let m = t.match(/^(\d{1,2})(?:[:.]?(\d{2}))?([ap])\.?m?\.?$/);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (m[3] === 'p' && hour !== 12) hour += 12;
    if (m[3] === 'a' && hour === 12) hour = 0;
    return { hour, minute };
  }
  m = t.match(/^(\d{1,2})h$/);
  if (m && Number(m[1]) <= 23) return { hour: Number(m[1]), minute: 0 };
  m = t.match(/^(\d{1,2})[:.h](\d{2})(?:hrs?)?$/) || t.match(/^(\d{2})(\d{2})(?:hrs?)?$/) || t.match(/^(\d)(\d{2})$/);
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

// Month-first only for US-style regions; everyone else writes the day first.
function monthFirst(tz) {
  return /^America\//.test(tz || '') && !/^America\/(Sao_Paulo|Argentina|Montevideo|Santiago|Bogota|Lima|Caracas|Asuncion|La_Paz)/.test(tz);
}

function parseMonthName(word) {
  const w = String(word || '').toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  const i = MONTHS.findIndex((mo) => w.startsWith(mo));
  return i === -1 ? -1 : i + 1;
}

function fullYear(y) {
  if (y === undefined) return null;
  const n = Number(y);
  return y.length <= 2 ? 2000 + n : n;
}

function validDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// "21/09/26", "21/09/2026", "21-09", "9/21" (Americas), "21 sep", "sep 21st", "21st september 2026".
// Returns { date: {year, month, day}, rest } with the leftover text (the time), or null.
function parseCalendarDate(text, tz, today) {
  let m = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?(?=\s|$)\s*(.*)$/);
  let day, month, year;
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) [day, month] = [a, b];
    else if (b > 12 && a <= 12) [day, month] = [b, a];
    else if (monthFirst(tz)) [day, month] = [b, a];
    else [day, month] = [a, b];
    year = fullYear(m[3]);
    text = m[4];
  } else {
    m = text.match(/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+\.?)(?: (\d{4}))?(?=\s|$)\s*(.*)$/);
    if (m && parseMonthName(m[2]) !== -1) {
      day = Number(m[1]);
      month = parseMonthName(m[2]);
      year = m[3] ? Number(m[3]) : null;
      text = m[4];
    } else {
      m = text.match(/^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?(?=\s|$)\s*(.*)$/);
      if (!m || parseMonthName(m[1]) === -1) return null;
      month = parseMonthName(m[1]);
      day = Number(m[2]);
      year = m[3] ? Number(m[3]) : null;
      text = m[4];
    }
  }
  if (!year) {
    // No year: this year, unless that date is months gone ("05/01" typed in December)
    year = today.year;
    const daysAgo = (Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(year, month - 1, day)) / DAY_MS;
    if (daysAgo > 60) year += 1;
  }
  if (!validDate(year, month, day)) return null;
  return { date: { year, month, day }, rest: text.trim() };
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
  m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ t](.+))?$/);
  if (m) {
    if (!validDate(Number(m[1]), Number(m[2]), Number(m[3]))) return null;
    const time = m[4] ? parseTimeOfDay(m[4]) : DEFAULT_TIME;
    if (!time) return null;
    const d = zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), time.hour, time.minute, tz);
    return isNaN(d.getTime()) ? null : d;
  }

  const today = localParts(now, tz);

  // Time first, date after: "8pm 21/09", "1800 on 21/09/26", "20:00 tomorrow"
  m = text.match(/^(\S+(?: ?[ap]\.?m\.?)?) (?:on )?(.+)$/);
  if (m && parseTimeOfDay(m[1]) && !parseTimeOfDay(m[2])) {
    const flipped = parseWhen(`${m[2]} ${m[1]}`, tz, now);
    if (flipped) return flipped;
  }

  // Calendar dates: "21/09/26 1800", "21/09/2026 at 18:00", "21 sep 8pm", "sep 21"
  const cal = parseCalendarDate(text, tz, today);
  if (cal) {
    const time = cal.rest ? parseTimeOfDay(cal.rest) : DEFAULT_TIME;
    if (!time) return null;
    return zonedToUtc(cal.date.year, cal.date.month, cal.date.day, time.hour, time.minute, tz);
  }

  const [first, ...rest] = text.split(' ');
  const restText = rest.join(' ');

  if (first === 'today' || first === 'tonight' || first === 'tomorrow' || first === 'tmrw' || first === 'tmr' || first === 'tmrrw' || first === 'tomoz') {
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
  parseCalendarDate,
  parseOffsetMinutes,
  parseDeadline,
  describeOffset,
  unix,
};
