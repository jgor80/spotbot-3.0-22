// Runs bundled backend functions (local-functions/*.cjs) inside the bot process and serves them
// over HTTP for the web app, so a self-hosted server needs no edge runtime or Lovable Cloud.
// AI calls written for the Lovable AI gateway are rewritten to OpenAI with the server's own key.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const DIR = path.join(__dirname, 'local-functions');
const handlers = new Map();
// Bot-only functions check x-bot-secret; in-process calls get this per-boot secret, never exposed.
const INTERNAL_SECRET = crypto.randomBytes(32).toString('hex');
let fetchWrapped = false;
let originalFetch = globalThis.fetch;

const ENV_MAP = {
  BOT_PROXY_SECRET: () => INTERNAL_SECRET,
  LOVABLE_API_KEY: () => process.env.OPENAI_API_KEY,
  DISCORD_BOT_TOKEN: () => process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN,
};
const denoEnv = { get: (k) => (ENV_MAP[k] ? ENV_MAP[k]() : process.env[k]) };

function names() {
  try { return fs.readdirSync(DIR).filter(f => f.endsWith('.cjs')).map(f => f.slice(0, -4)); } catch { return []; }
}
function hasLocal(name) { return names().includes(name); }

function load(name) {
  if (handlers.has(name)) return handlers.get(name);
  if (!/^[a-z0-9-]+$/.test(name) || !hasLocal(name)) return null;
  let captured = null;
  globalThis.Deno = { env: denoEnv, serve: (h) => { captured = typeof h === 'function' ? h : h?.handler; } };
  try { require(path.join(DIR, `${name}.cjs`)); } finally {
    globalThis.Deno = { env: denoEnv, serve: () => {} };
  }
  if (captured) handlers.set(name, captured);
  return captured;
}

// Lovable AI gateway → OpenAI. Override models with AI_TEXT_MODEL / AI_IMAGE_MODEL.
const GATEWAY = 'https://ai.gateway.lovable.dev';
function mapModel(m) {
  if (typeof m !== 'string') return m;
  if (/image/i.test(m)) return process.env.AI_IMAGE_MODEL || 'gpt-image-1';
  return process.env.AI_TEXT_MODEL || 'gpt-5-mini';
}
function rewriteAi(url, init = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set on the server');
  const target = (process.env.AI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '') + url.slice(GATEWAY.length);
  const headers = new Headers(init.headers || {});
  headers.delete('Lovable-API-Key'); headers.delete('X-Lovable-AIG-SDK');
  headers.set('Authorization', `Bearer ${key}`);
  let body = init.body;
  if (typeof body === 'string') {
    try { const j = JSON.parse(body); if (j.model) j.model = mapModel(j.model); body = JSON.stringify(j); } catch { /* not JSON */ }
  } else if (body && typeof body.set === 'function' && typeof body.get === 'function') {
    if (body.get('model')) body.set('model', mapModel(body.get('model')));
  }
  return [target, { ...init, headers, body }];
}

function wrapFetch(supabaseUrl) {
  if (fetchWrapped) return;
  fetchWrapped = true;
  originalFetch = globalThis.fetch;
  const base = `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/`;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (url && url.startsWith(GATEWAY)) return originalFetch(...rewriteAi(url, init));
    if (url && url.startsWith(base)) {
      const name = url.slice(base.length).split(/[/?]/)[0];
      const h = load(name);
      if (h) {
        const req = new Request(input, init);
        const headers = new Headers(req.headers);
        headers.set('x-bot-secret', INTERNAL_SECRET);
        return h(new Request(req, { headers }));
      }
    }
    return originalFetch(input, init);
  };
}

async function invokeLocal(name, body, { supabaseUrl, serviceKey }) {
  wrapFetch(supabaseUrl);
  const h = load(name);
  if (!h) throw new Error(`No local handler for ${name}`);
  const res = await h(new Request(`http://local/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'x-bot-secret': INTERNAL_SECRET },
    body: JSON.stringify(body ?? {}),
  }));
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, data };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

// Public HTTP endpoint for the web app (via the Cloudflare Worker) and external webhooks.
// Incoming requests never receive the internal bot secret, so bot-only functions stay locked.
function startServer({ port, supabaseUrl }) {
  wrapFetch(supabaseUrl);
  const server = http.createServer(async (req, res) => {
    try {
      const m = req.url.match(/^\/functions\/v1\/([a-z0-9-]+)(.*)$/);
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
      const h = m && load(m[1]);
      if (!h) { res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' }); return res.end('{"error":"Function not found"}'); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (k !== 'x-bot-secret' && v != null) headers.set(k, Array.isArray(v) ? v.join(',') : v);
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
      const out = await h(new Request(`http://local${req.url}`, { method: req.method, headers, body }));
      const outHeaders = { ...CORS };
      out.headers.forEach((v, k) => { outHeaders[k] = v; });
      delete outHeaders['content-length']; delete outHeaders['content-encoding'];
      res.writeHead(out.status, outHeaders);
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (err) {
      console.error('❌ Functions server error:', err);
      if (!res.headersSent) res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
      res.end('{"error":"Internal error"}');
    }
  });
  server.listen(port, '0.0.0.0', () => console.log(`⚙️  Backend functions served locally on :${port} (${names().length} functions)`));
  return server;
}

module.exports = { hasLocal, invokeLocal, names, startServer, wrapFetch };
