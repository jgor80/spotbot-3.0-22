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

// Same opt-in as XI Lab (FUT_ENABLED=true); FUTGG_SYNC=off pauses just this job
const futggOn = () => process.env.FUT_ENABLED === 'true' && process.env.FUTGG_SYNC !== 'off';
const FUTGG_STALE_MS = 12 * 60 * 60 * 1000;
async function futggPrices({ supabase, callFunction, syncFutggPrices = require('./futgg-sync.cjs').syncFutggPrices }) {
  if (!futggOn()) return;
  const result = await syncFutggPrices(supabase.schema('fut'));
  console.log('⏰ futgg-prices:', JSON.stringify(result));
  // Then the market-wide card list (names from EA's Web App file) and Market Lab's baskets (fut-api job).
  if (!callFunction) return;
  const { data, error } = await callFunction('fut-api', { job: 'futgg-catalogue' }, 280000);
  if (error) throw new Error(`futgg-catalogue: ${error?.message || error}`);
  console.log('⏰ futgg-catalogue:', JSON.stringify(data?.data ?? data));
}
async function futggStale({ supabase }, now = Date.now()) {
  if (!futggOn()) return false;
  const { data, error } = await supabase.schema('fut').from('market_provider_runs').select('finished_at')
    .eq('source_id', 'futgg_bulk').eq('status', 'succeeded').order('finished_at', { ascending: false }).limit(1);
  if (error) return false;
  if (!data?.[0] || now - Date.parse(data[0].finished_at) > FUTGG_STALE_MS) return true;
  // Also right after the market-wide card list first ships: no catalogue cards yet
  const { count, error: countError } = await supabase.schema('fut').from('player_cards').select('id', { count: 'exact', head: true })
    .is('owner_user_id', null).eq('source_id', 'futgg_catalogue');
  return !countError && count === 0;
}

const JOBS = [
  // Every 5 minutes: the clubs playing now (ea-activity.cjs) plus one twelfth of the rest, so every
  // idle club is still fully synced (matches and member stats) once an hour
  { name: 'sync-ea-stats', every: 5, fn: 'sync-ea-stats', body: eaSyncBody, catchUp: true },
  { name: 'advanced-stats-refresh', minute: 15, rpc: ['backfill_advanced_player_stats', 'refresh_player_season_archive'] },
  // Image reservations left behind by a render that never finished, and previews nobody answered
  { name: 'image-reservation-cleanup', minute: 45, rpc: ['settle_stale_image_reservations'] },
  // FUT.GG bulk market prices (Market Lab). Runs here, not on Cloudflare: FUT.GG answers 403 to requests
  // from Cloudflare Workers. After a restart it also runs once if the last good refresh is over 12 hours old or the
  // market-wide card list is still empty.
  { name: 'futgg-prices', hours: [6, 18], minute: 0, task: futggPrices, onStart: futggStale },
  { name: 'season-card-archive-nightly', hour: 6, minute: 30, rpc: ['refresh_player_season_archive'] },
  { name: 'monthly-archive-cleanup', day: 1, hour: 3, minute: 0, rpc: ['archive_old_global_league_matches', 'cleanup_old_event_occurrences', 'cleanup_mcp_oauth', 'cleanup_logs'] },
];

function due(job, d) {
  const m = d.getUTCMinutes();
  if (job.every) return m % job.every === 0;
  if (job.minute !== undefined && m !== job.minute) return false;
  if (job.hour !== undefined && d.getUTCHours() !== job.hour) return false;
  if (job.hours && !job.hours.includes(d.getUTCHours())) return false;
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
      if (job.task) await job.task({ supabase, callFunction, date });
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
    for (const job of JOBS) if (due(job, d) && (!job.when || job.when())) run(job, d);
  }, 15000);
  // Jobs with onStart catch up shortly after a restart when their data is stale
  setTimeout(() => {
    for (const job of JOBS) if (job.onStart) Promise.resolve(job.onStart({ supabase })).then((stale) => stale && run(job, new Date())).catch(() => {});
  }, 2 * 60 * 1000).unref?.();
  console.log(`⏰ Scheduler running ${JOBS.length} jobs on this server`);
}

module.exports = { startScheduler, JOBS, due, eaSyncBody, futggStale, EA_SLICES, STUCK_MS };
