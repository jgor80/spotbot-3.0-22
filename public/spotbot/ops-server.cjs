// =======================
// OPS SERVER — lets the Lovable agent run whitelisted maintenance tasks on this
// server over HTTPS (proxied by the Cloudflare Worker at /api/ops/*).
// Auth: every request must send header `x-ops-secret` equal to OPS_SECRET.
// Set OPS_PORT=0 (or OPS_SECRET empty) to keep it off. Never runs raw shell from
// the request — every command is a fixed handler with sanitized, clamped args.
// =======================
const http = require('http');
const { execFile } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const ROOT = process.env.OPS_ROOT || path.resolve(__dirname, '..', '..');
const MAX_OUTPUT = 16000;
const DEFAULT_TIMEOUT = 120000;

function safeEqual(a, b) {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, {
      cwd: opts.cwd || ROOT,
      timeout: opts.timeout || DEFAULT_TIMEOUT,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, ...(opts.env || {}) }
    }, (err, stdout, stderr) => {
      let out = (stdout || '') + (stderr ? `\n[stderr]\n${stderr}` : '');
      if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT) + `\n...[truncated ${out.length} chars total]`;
      resolve({ ok: !err, error: err ? (err.message || String(err)) : null, output: out.trim() });
    });
  });
}

async function pm2jlist() {
  const r = await run('pm2', ['jlist'], { timeout: 30000 });
  if (!r.ok) return r;
  try {
    const procs = JSON.parse(r.output.replace(/^[^\[]*/, ''));
    return {
      ok: true, error: null,
      output: procs.map(p => ({
        name: p.name, status: p.pm2_env?.status, restarts: p.pm2_env?.restart_time,
        uptime_s: p.pm2_env?.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000) : null,
        mem_mb: p.monit ? Math.round(p.monit.memory / 1048576) : null, cpu: p.monit?.cpu ?? null
      }))
    };
  } catch (e) { return { ok: false, error: 'pm2 jlist parse failed: ' + e.message, output: r.output }; }
}

const HANDLERS = {
  async ping() {
    return { ok: true, error: null, output: `ops ready · root=${ROOT} · node ${process.version}` };
  },

  async status() {
    const [procs, head, disk, gitStat] = await Promise.all([
      pm2jlist(),
      run('git', ['-C', ROOT, 'log', '--oneline', '-3']),
      run('df', ['-h', '/']),
      run('git', ['-C', ROOT, 'status', '--porcelain=v1', '-b'])
    ]);
    const envFlags = ['SCHEDULER', 'LOCAL_FUNCTIONS', 'ALLOWED_GUILD_IDS', 'OPS_SECRET', 'DATABASE_URL', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'CLAUDE_API_KEY']
      .map(k => `${k}=${process.env[k] ? 'set' : 'MISSING'}`).join(' ');
    return {
      ok: true, error: null,
      output: [
        `node ${process.version} · uptime ${Math.floor(process.uptime())}s`,
        envFlags,
        `pm2: ${JSON.stringify(procs.output, null, 1)}`,
        `git:\n${head.output}\n${gitStat.output}`,
        `disk:\n${disk.output}`
      ].join('\n')
    };
  },

  async logs(args) {
    const lines = Math.min(Math.max(parseInt(args.lines, 10) || 100, 10), 500);
    const r = await run('pm2', ['logs', 'spotbot', '--lines', String(lines), '--nostream']);
    if (args.grep && typeof args.grep === 'string' && args.grep.length < 200) {
      const re = new RegExp(args.grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const filtered = r.output.split('\n').filter(l => re.test(l)).join('\n');
      return { ...r, output: filtered || '(no matching lines)' };
    }
    return r;
  },

  async 'git-status'() {
    const [head, stat, remote] = await Promise.all([
      run('git', ['-C', ROOT, 'log', '--oneline', '-5']),
      run('git', ['-C', ROOT, 'status', '--porcelain=v1', '-b']),
      run('git', ['-C', ROOT, 'remote', '-v'])
    ]);
    return { ok: head.ok, error: head.error, output: `${head.output}\n${stat.output}\n${remote.output}` };
  },

  async 'git-pull'() {
    const fetchR = await run('git', ['-C', ROOT, 'fetch', 'origin']);
    const pullR = await run('git', ['-C', ROOT, 'pull', '--ff-only']);
    return { ok: pullR.ok, error: pullR.error, output: `${fetchR.output}\n${pullR.output}` };
  },

  async restart() {
    return run('pm2', ['restart', 'spotbot', '--update-env']);
  },

  async 'rebuild-functions'() {
    const build = await run('node', ['scripts/build-local-functions.mjs'], { timeout: 300000 });
    if (!build.ok) return build;
    const restart = await run('pm2', ['restart', 'spotbot', '--update-env']);
    return { ok: restart.ok, error: restart.error, output: `${build.output}\n${restart.output}` };
  },

  // Read-only SQL: single SELECT/WITH/EXPLAIN statement, no semicolons except a trailing one.
  async sql(args) {
    const q = String(args.query || '').trim().replace(/;+\s*$/, '');
    if (!/^(select|with|explain)\b/i.test(q)) return { ok: false, error: 'Only SELECT/WITH/EXPLAIN allowed', output: '' };
    if (q.includes(';')) return { ok: false, error: 'Only a single statement allowed', output: '' };
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) return { ok: false, error: 'DATABASE_URL not set in .env — add the Postgres connection string to enable SQL reads', output: '' };
    return run('psql', [url, '--no-psqlrc', '-X', '-P', 'pager=off', '-c', q], { timeout: 60000 });
  },

  // Bot creates a Discord webhook in the given channel and saves it as ALERT_WEBHOOK_URL
  // in /etc/spotbot-ops.env. The URL is never returned in the response.
  async 'create-alert-webhook'(args) {
    const channel = String(args.channel_id || '');
    if (!/^\d{15,22}$/.test(channel)) return { ok: false, error: 'channel_id must be a Discord snowflake', output: '' };
    const token = process.env.BOT_TOKEN;
    if (!token) return { ok: false, error: 'BOT_TOKEN not set', output: '' };
    const res = await fetch(`https://discord.com/api/v10/channels/${channel}/webhooks`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Server Alerts' })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Discord ${res.status}: ${body.message || ''}`, output: '' };
    const url = `https://discord.com/api/webhooks/${body.id}/${body.token}`;
    const fs = require('fs');
    const file = process.env.OPS_ENV_FILE || '/etc/spotbot-ops.env';
    try {
      let txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      txt = /^ALERT_WEBHOOK_URL=.*$/m.test(txt)
        ? txt.replace(/^ALERT_WEBHOOK_URL=.*$/m, `ALERT_WEBHOOK_URL=${url}`)
        : `${txt}${txt && !txt.endsWith('\n') ? '\n' : ''}ALERT_WEBHOOK_URL=${url}\n`;
      fs.writeFileSync(file, txt, { mode: 0o600 });
    } catch (e) {
      return { ok: false, error: `Webhook ${body.id} created but could not write ${file}: ${e.message}`, output: '' };
    }
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '✅ Server alerts are connected. Health check problems will be posted here.' }) }).catch(() => {});
    return { ok: true, error: null, output: `Webhook ${body.id} created and saved to ${file}` };
  }
};

function startOpsServer({ port } = {}) {
  const secret = process.env.OPS_SECRET;
  const listenPort = port ?? Number(process.env.OPS_PORT || 9001);
  if (!secret) {
    console.log('⚠️  OPS_SECRET not set — ops server disabled (add OPS_SECRET to .env to enable remote maintenance)');
    return null;
  }
  const server = http.createServer(async (req, res) => {
    const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (!safeEqual(req.headers['x-ops-secret'], secret)) return reply(401, { error: 'Unauthorized' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'POST' || url.pathname !== '/run') return reply(404, { error: 'Not found' });
      const raw = await new Promise((resolve, reject) => {
        let data = ''; req.on('data', c => { data += c; if (data.length > 65536) reject(new Error('Body too large')); });
        req.on('end', () => resolve(data)); req.on('error', reject);
      });
      const body = raw ? JSON.parse(raw) : {};
      const handler = HANDLERS[body.cmd];
      if (!handler) return reply(400, { error: `Unknown command. Available: ${Object.keys(HANDLERS).join(', ')}` });
      console.log(`🛠️  ops: ${body.cmd}`);
      const result = await handler(body.args || {});
      return reply(result.ok ? 200 : 500, { cmd: body.cmd, ...result });
    } catch (err) {
      return reply(500, { error: err.message });
    }
  });
  server.listen(listenPort, '0.0.0.0', () => console.log(`🛠️  Ops server listening on :${listenPort} (whitelisted maintenance commands)`));
  return server;
}

module.exports = { startOpsServer, HANDLERS };
