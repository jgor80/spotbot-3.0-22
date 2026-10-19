const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const lf = require('./local-functions.cjs');

// The server logs when it starts; quiet it so the output doesn't mix into the test runner's own stream
console.log = () => {};
console.warn = () => {};

async function withServer(opts, fn) {
  const server = lf.startServer({ port: 0, supabaseUrl: 'http://127.0.0.1:1', host: '127.0.0.1', ...opts });
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally {
    // Keep-alive sockets would hold close() open
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test('with an origin secret, requests that skip the Worker are refused but health still answers', async () => {
  await withServer({ originSecret: 'worker-secret-123' }, async (base) => {
    assert.strictEqual((await fetch(`${base}/health`)).status, 200);
    assert.strictEqual((await fetch(`${base}/functions/v1/get-leaderboard`, { method: 'POST' })).status, 403);
    const wrong = await fetch(`${base}/functions/v1/get-leaderboard`, { method: 'POST', headers: { 'x-origin-secret': 'nope' } });
    assert.strictEqual(wrong.status, 403);
    const ok = await fetch(`${base}/functions/v1/no-such-function`, { method: 'POST', headers: { 'x-origin-secret': 'worker-secret-123' } });
    assert.strictEqual(ok.status, 404);
  });
});

test('oversized bodies are refused before they are buffered', async () => {
  await withServer({ originSecret: '' }, async (base) => {
    const status = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/functions/v1/get-leaderboard`, { method: 'POST', headers: { 'content-length': String(17 * 1024 * 1024) } }, (res) => {
        res.resume();
        req.destroy();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.write('x');
    });
    assert.strictEqual(status, 413);
  });
});
