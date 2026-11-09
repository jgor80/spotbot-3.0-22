// FUT.GG bulk prices run on the bot (FUT.GG answers 403 to Cloudflare Workers).
const test = require('node:test');
const assert = require('node:assert');
const { JOBS, due, futggStale } = require('./scheduler.cjs');
const { syncFutggPrices } = require('./futgg-sync.cjs');

const job = JOBS.find((j) => j.name === 'futgg-prices');

test('futgg-prices runs at 06:00 and 18:00 UTC only', () => {
  assert.ok(job && job.task && job.onStart);
  assert.ok(due(job, new Date('2026-11-08T06:00:00Z')));
  assert.ok(due(job, new Date('2026-11-08T18:00:30Z')));
  assert.ok(!due(job, new Date('2026-11-08T06:01:00Z')));
  assert.ok(!due(job, new Date('2026-11-08T12:00:00Z')));
});

const fakeDb = (rows, catalogue = 5) => ({ schema: () => ({ from: () => {
  const q = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => Promise.resolve({ data: rows, error: null }),
    then: (resolve) => resolve({ count: catalogue, error: null }) };
  return q;
} }) });

test('a restart catches up only when the last good refresh is over 12 hours old', async () => {
  const before = process.env.FUT_ENABLED;
  process.env.FUT_ENABLED = 'true';
  try {
    const now = Date.parse('2026-11-08T15:00:00Z');
    assert.strictEqual(await futggStale({ supabase: fakeDb([]) }, now), true);
    assert.strictEqual(await futggStale({ supabase: fakeDb([{ finished_at: '2026-11-08T06:00:00Z' }]) }, now), false);
    assert.strictEqual(await futggStale({ supabase: fakeDb([{ finished_at: '2026-11-08T06:00:00Z' }], 0) }, now), true, 'empty card list');
    assert.strictEqual(await futggStale({ supabase: fakeDb([{ finished_at: '2026-11-07T18:00:00Z' }]) }, now), true);
    process.env.FUT_ENABLED = 'false';
    assert.strictEqual(await futggStale({ supabase: fakeDb([]) }, now), false);
  } finally {
    if (before === undefined) delete process.env.FUT_ENABLED; else process.env.FUT_ENABLED = before;
  }
});

test('the bundled sync records a failed run and stops on an HTTP error', async () => {
  const runs = [];
  const db = { rpc: (name, args) => { runs.push([name, args.p_status]); return Promise.resolve({ data: null, error: null }); } };
  await assert.rejects(syncFutggPrices(db, () => Promise.resolve(new Response('no', { status: 403 }))), /HTTP 403/);
  assert.deepStrictEqual(runs, [['record_futgg_run', 'failed']]);
});

test('after prices, the job asks fut-api to refresh the market-wide card list', async () => {
  const before = process.env.FUT_ENABLED;
  process.env.FUT_ENABLED = 'true';
  const syncFutggPrices = async () => ({ console: {}, pc: {} });
  try {
    const calls = [];
    await job.task({ supabase: { schema: () => ({}) }, syncFutggPrices, callFunction: async (name, body) => { calls.push([name, body]); return { data: { data: { cards: 1 } }, error: null }; } });
    assert.deepStrictEqual(calls, [['fut-api', { job: 'futgg-catalogue' }]]);
    await assert.rejects(job.task({ supabase: { schema: () => ({}) }, syncFutggPrices, callFunction: async () => ({ data: null, error: 'boom' }) }), /futgg-catalogue: boom/);
  } finally {
    if (before === undefined) delete process.env.FUT_ENABLED; else process.env.FUT_ENABLED = before;
  }
});

test('futgg-attributes asks fut-api for card stats every 15 minutes, off the hour, and can be paused', async () => {
  const stats = JOBS.find((j) => j.name === 'futgg-attributes');
  assert.ok(stats && stats.task);
  assert.ok(due(stats, new Date('2026-11-08T06:07:00Z')) && due(stats, new Date('2026-11-08T13:52:10Z')));
  assert.ok(!due(stats, new Date('2026-11-08T06:00:00Z')) && !due(stats, new Date('2026-11-08T06:08:00Z')));
  const before = { f: process.env.FUT_ENABLED, a: process.env.FUTGG_ATTRIBUTES };
  try {
    process.env.FUT_ENABLED = 'true';
    const calls = [];
    const callFunction = async (fn, body) => { calls.push([fn, body]); return { data: { data: { queued: 0 } }, error: null }; };
    await stats.task({ callFunction });
    assert.deepStrictEqual(calls, [['fut-api', { job: 'futgg-attributes' }]]);
    await assert.rejects(stats.task({ callFunction: async () => ({ data: null, error: 'boom' }) }), /futgg-attributes: boom/);
    process.env.FUTGG_ATTRIBUTES = 'off';
    await stats.task({ callFunction });
    assert.strictEqual(calls.length, 1, 'paused');
  } finally {
    for (const [k, v] of [['FUT_ENABLED', before.f], ['FUTGG_ATTRIBUTES', before.a]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
