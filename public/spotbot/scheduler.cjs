// Self-hosted replacement for the cloud's scheduled jobs (times in UTC, checked once a minute).
// Each job runs one at a time; a run that is still going skips the next tick instead of overlapping.
const EA_SLICES = 12;

function eaSyncBody({ activeClubs, date }) {
  if (!activeClubs) return { trigger: 'cron' };
  return { trigger: 'cron', active: activeClubs(), slice: Math.floor(date.getUTCMinutes() / 5) % EA_SLICES, slices: EA_SLICES };
}

const JOBS = [
  // Every 5 minutes: the clubs playing now (ea-activity.cjs) plus one twelfth of the rest, so every
  // idle club is still fully synced (matches and member stats) once an hour
  { name: 'sync-ea-stats', every: 5, fn: 'sync-ea-stats', body: eaSyncBody },
  { name: 'refresh-discord-standings', every: 5, rpc: ['refresh_discord_standings'] },
  { name: 'advanced-stats-refresh', minute: 15, rpc: ['backfill_advanced_player_stats', 'refresh_player_season_archive'] },
  { name: 'season-card-archive-nightly', hour: 6, minute: 30, rpc: ['refresh_player_season_archive'] },
  { name: 'monthly-archive-cleanup', day: 1, hour: 3, minute: 0, rpc: ['archive_old_global_league_matches', 'cleanup_old_event_occurrences', 'cleanup_mcp_oauth'] },
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
  const running = new Set();
  const warned = new Set();
  let lastMinute = -1;
  const run = async (job, date) => {
    if (running.has(job.name)) return;
    running.add(job.name);
    try {
      for (const name of job.rpc || []) {
        const { error } = await supabase.rpc(name);
        if (error && !warned.has(name)) { warned.add(name); console.error(`⏰ ${job.name}: ${name} failed (logged once):`, error.message); }
        else if (!error) warned.delete(name);
      }
      if (job.fn) {
        const body = typeof job.body === 'function' ? job.body({ activeClubs, date }) : job.body;
        const { error } = await callFunction(job.fn, body, 280000);
        if (error) console.error(`⏰ ${job.name} failed:`, error);
      }
    } catch (e) {
      console.error(`⏰ ${job.name} crashed:`, e.message);
    } finally {
      running.delete(job.name);
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

module.exports = { startScheduler, JOBS, due, eaSyncBody, EA_SLICES };
