// Self-hosted replacement for the cloud's scheduled jobs (times in UTC, checked once a minute).
// Each job runs one at a time; a run that is still going skips the next tick instead of overlapping.
const { reportError } = require('./error-reporter.cjs');
const EA_SLICES = 12;
const WARN_AGAIN_MS = 24 * 60 * 60 * 1000;
// A run still going after this frees its slot so a hung call can't stop the job for good
const STUCK_MS = 15 * 60 * 1000;

const sliceAt = (date) => Math.floor(date.getUTCMinutes() / 5) % EA_SLICES;

// `skipped`: ticks that passed while the previous sync was still running. Their slices ride along
// (also_slices) so those idle clubs aren't left waiting another hour.
function eaSyncBody({ activeClubs, date, skipped = [] }) {
  if (!activeClubs) return { trigger: 'cron' };
  const slice = sliceAt(date);
  const also = [...new Set(skipped.map(sliceAt))].filter((s) => s !== slice);
  return { trigger: 'cron', active: activeClubs(), slice, slices: EA_SLICES, ...(also.length ? { also_slices: also } : {}) };
}

const JOBS = [
  // Every 5 minutes: the clubs playing now (ea-activity.cjs) plus one twelfth of the rest, so every
  // idle club is still fully synced (matches and member stats) once an hour
  { name: 'sync-ea-stats', every: 5, fn: 'sync-ea-stats', body: eaSyncBody, catchUp: true },
  { name: 'refresh-discord-standings', every: 5, rpc: ['refresh_discord_standings'] },
  { name: 'advanced-stats-refresh', minute: 15, rpc: ['backfill_advanced_player_stats', 'refresh_player_season_archive'] },
  // Image reservations left behind by a render that never finished, and previews nobody answered
  { name: 'image-reservation-cleanup', minute: 45, rpc: ['settle_stale_image_reservations'] },
  { name: 'season-card-archive-nightly', hour: 6, minute: 30, rpc: ['refresh_player_season_archive'] },
  { name: 'monthly-archive-cleanup', day: 1, hour: 3, minute: 0, rpc: ['archive_old_global_league_matches', 'cleanup_old_event_occurrences', 'cleanup_mcp_oauth', 'cleanup_logs'] },
];

function due(job, d) {
  const m = d.getUTCMinutes();
  if (job.every) return m % job.every === 0;
  if (job.minute !== undefined && m !== job.minute) return false;
  if (job.hour !== undefined && d.getUTCHours() !== job.hour) return false;
  if (job.day !== undefined && d.getUTCDate() !== job.day) return false;
  return true;
}

function startScheduler({ supabase, callFunction, activeClubs }) {
  if (process.env.SCHEDULER === 'off') return;
  const running = new Map();
  const warned = new Map();
  const missed = new Map();
  let lastMinute = -1;
  const run = async (job, date) => {
    const since = running.get(job.name);
    if (since && Date.now() - since < STUCK_MS) {
      if (job.catchUp) missed.set(job.name, [...(missed.get(job.name) || []), date].slice(-EA_SLICES));
      return;
    }
    if (since) {
      console.error(`⏰ ${job.name} has been running for ${Math.round((Date.now() - since) / 60000)} minutes; starting a new run`);
      reportError(new Error(`${job.name} stuck`), { source: 'scheduler', action: job.name });
    }
    const token = Date.now();
    running.set(job.name, token);
    const skipped = missed.get(job.name) || [];
    missed.delete(job.name);
    try {
      for (const name of job.rpc || []) {
        const { error } = await supabase.rpc(name);
        // A job that keeps failing alerts again once a day, so it never goes quiet for good
        if (error && Date.now() - (warned.get(name) || 0) > WARN_AGAIN_MS) { warned.set(name, Date.now()); console.error(`⏰ ${job.name}: ${name} failed (logged once a day):`, error.message); reportError(new Error(error.message), { source: 'scheduler', action: `${job.name} ${name}` }); }
        else if (!error) warned.delete(name);
      }
      if (job.fn) {
        const body = typeof job.body === 'function' ? job.body({ activeClubs, date, skipped }) : job.body;
        const { error } = await callFunction(job.fn, body, 280000);
        if (error) { console.error(`⏰ ${job.name} failed:`, error); reportError(error instanceof Error ? error : new Error(String(error?.message || error)), { source: 'scheduler', action: job.name }); }
      }
    } catch (e) {
      console.error(`⏰ ${job.name} crashed:`, e.message);
      reportError(e, { source: 'scheduler', action: job.name });
    } finally {
      // A stuck run that finally ends must not free the slot of the run that replaced it
      if (running.get(job.name) === token) running.delete(job.name);
    }
  };
  setInterval(() => {
    const d = new Date();
    const key = Math.floor(d.getTime() / 60000);
    if (key === lastMinute) return;
    lastMinute = key;
    for (const job of JOBS) if (due(job, d)) run(job, d);
  }, 15000);
  console.log(`⏰ Scheduler running ${JOBS.length} jobs on this server`);
}

module.exports = { startScheduler, JOBS, due, eaSyncBody, EA_SLICES, STUCK_MS };
