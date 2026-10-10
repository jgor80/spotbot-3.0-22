// Self-hosted replacement for the cloud's scheduled jobs (times in UTC, checked once a minute).
// Each job runs one at a time; a run that is still going skips the next tick instead of overlapping.
const JOBS = [
  { name: 'sync-ea-stats', every: 5, fn: 'sync-ea-stats', body: { trigger: 'cron' } },
  { name: 'refresh-discord-standings', every: 5, rpc: ['refresh_discord_standings'] },
  { name: 'advanced-stats-refresh', minute: 15, rpc: ['backfill_advanced_player_stats', 'refresh_player_season_archive'] },
  { name: 'ea-member-stats-morning', hour: 8, minute: 0, fn: 'sync-ea-stats', body: { sync_type: 'member_stats' } },
  { name: 'ea-member-stats-evening', hour: 20, minute: 0, fn: 'sync-ea-stats', body: { sync_type: 'member_stats' } },
  { name: 'season-card-archive-nightly', hour: 6, minute: 30, rpc: ['refresh_player_season_archive'] },
  { name: 'monthly-archive-cleanup', day: 1, hour: 3, minute: 0, rpc: ['archive_old_global_league_matches', 'cleanup_old_event_occurrences'] },
];

function due(job, d) {
  const m = d.getUTCMinutes();
  if (job.every) return m % job.every === 0;
  if (job.minute !== undefined && m !== job.minute) return false;
  if (job.hour !== undefined && d.getUTCHours() !== job.hour) return false;
  if (job.day !== undefined && d.getUTCDate() !== job.day) return false;
  return true;
}

function startScheduler({ supabase, callFunction }) {
  if (process.env.SCHEDULER === 'off') return;
  const running = new Set();
  const warned = new Set();
  let lastMinute = -1;
  const run = async (job) => {
    if (running.has(job.name)) return;
    running.add(job.name);
    try {
      for (const name of job.rpc || []) {
        const { error } = await supabase.rpc(name);
        if (error && !warned.has(name)) { warned.add(name); console.error(`⏰ ${job.name}: ${name} failed (logged once):`, error.message); }
        else if (!error) warned.delete(name);
      }
      if (job.fn) {
        const { error } = await callFunction(job.fn, job.body, 280000);
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
    for (const job of JOBS) if (due(job, d)) run(job);
  }, 15000);
  console.log(`⏰ Scheduler running ${JOBS.length} jobs on this server`);
}

module.exports = { startScheduler, JOBS, due };
