// Hourly FUT.GG check for price charts: off unless FUTGG_HOURLY=on, and it uses the bot's fut schema client.
const test = require('node:test');
const assert = require('node:assert');
const { futggHourly, JOBS } = require('./scheduler.cjs');

test('futgg-hourly runs only with FUT_ENABLED=true and FUTGG_HOURLY=on', async () => {
  const saved = { a: process.env.FUT_ENABLED, b: process.env.FUTGG_HOURLY };
  try {
    const calls = [];
    const supabase = { schema: (s) => { calls.push(s); return { schema: s }; } };
    const syncFutggHot = async (db) => { calls.push(db.schema); return { unchanged: true, requests: 1 }; };
    process.env.FUT_ENABLED = 'true'; delete process.env.FUTGG_HOURLY;
    assert.strictEqual(await futggHourly({ supabase, syncFutggHot }), null);
    process.env.FUTGG_HOURLY = 'on';
    assert.deepStrictEqual(await futggHourly({ supabase, syncFutggHot }), { unchanged: true, requests: 1 });
    assert.deepStrictEqual(calls, ['fut', 'fut']);
    const job = JOBS.find((j) => j.name === 'futgg-hourly');
    assert.ok(job && job.minute === 20 && !job.hours, 'every hour at :20');
  } finally {
    if (saved.a === undefined) delete process.env.FUT_ENABLED; else process.env.FUT_ENABLED = saved.a;
    if (saved.b === undefined) delete process.env.FUTGG_HOURLY; else process.env.FUTGG_HOURLY = saved.b;
  }
});
