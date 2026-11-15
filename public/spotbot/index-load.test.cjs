// The whole bot file must load top to bottom. A module-level error (like using `client` before it is
// declared) is caught by the uncaught-exception guard, so the functions server keeps answering while
// Discord never logs in and every button fails. Load it with dummy settings and check it reaches the end.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

test('index.cjs loads without a module-level error', () => {
  const r = spawnSync(process.execPath, ['-e', "require('./index.cjs'); console.log('INDEX_LOADED'); process.exit(0)"], {
    cwd: __dirname,
    env: {
      ...process.env,
      BOT_TOKEN: 'test',
      SUPABASE_URL: 'http://127.0.0.1:9',
      SUPABASE_SERVICE_ROLE_KEY: 'test',
      FUNCTIONS_PORT: '0',
      BOT_PROXY_SECRET: '',
    },
    encoding: 'utf8',
    timeout: 60000,
  });
  const out = `${r.stdout}\n${r.stderr}`;
  assert.ok(!/Uncaught exception/.test(out), out.slice(0, 2000));
  assert.match(r.stdout, /INDEX_LOADED/, out.slice(0, 2000));
});
