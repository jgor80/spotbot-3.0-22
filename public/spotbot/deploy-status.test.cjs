// /health/deploy passes on what the server's auto-deploy last did (status.json), so the GitHub
// "Deploy check" workflow can tell whether a merge reached the server. Only whitelisted fields go out.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

console.log = () => {};
console.warn = () => {};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-status-'));
const file = path.join(dir, 'status.json');
process.env.DEPLOY_STATUS_FILE = file;
process.env.FUNCTIONS_ORIGIN_SECRET = 'origin-secret';
const lf = require('./local-functions.cjs');

function get(port, url) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; }).on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('deploy status: 404 before any deploy, then only the known fields, without the origin secret', async (t) => {
  const server = lf.startServer({ port: 0, host: '127.0.0.1', supabaseUrl: 'http://127.0.0.1:1' });
  t.after(() => server.close());
  await new Promise((r) => server.listening ? r() : server.once('listening', r));
  const { port } = server.address();

  assert.strictEqual((await get(port, '/health/deploy')).status, 404);

  fs.writeFileSync(file, JSON.stringify({ state: 'ok', commit: 'abc', running_commit: 'abc', migrations: ['x.sql'], at: '2026-11-16T22:00:00Z', secret: 'nope' }));
  const res = await get(port, '/health/deploy');
  assert.strictEqual(res.status, 200);
  const body = JSON.parse(res.body);
  assert.deepStrictEqual(body, { state: 'ok', commit: 'abc', running_commit: 'abc', migrations: ['x.sql'], at: '2026-11-16T22:00:00Z' });
});
