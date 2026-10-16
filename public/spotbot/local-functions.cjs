// Runs bundled backend functions (local-functions/*.cjs) inside the bot process and serves them
// over HTTP for the web app, so a self-hosted server needs no edge runtime or Lovable Cloud.
// AI calls written for the Lovable AI gateway are routed to the server's own OpenAI/Gemini/Claude keys.
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
  LOVABLE_API_KEY: () => process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || 'self-hosted',
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

// Lovable AI gateway → your own keys, routed for quality per cost:
//  - images (Graphics Studio, player cards): OpenAI gpt-image-1, best likeness edits; AI_IMAGE_QUALITY (default medium),
//    reference edits at AI_IMAGE_FIDELITY (default high)
//  - vision with strict JSON (pro-photo checks): OpenAI Responses, AI_VISION_MODEL (default gpt-5-mini)
//  - plain chat text (match analysis): Gemini Flash when GEMINI_API_KEY is set (cheapest), else Claude Haiku, else OpenAI
const GATEWAY = 'https://ai.gateway.lovable.dev';
function need(name) { const v = process.env[name]; if (!v) throw new Error(`${name} is not set on the server`); return v; }
function jsonBody(init) { try { return JSON.parse(init.body); } catch { return null; } }

async function claudeChat(j, init) {
  const system = (j.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
  const res = await originalFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: init.signal,
    headers: { 'x-api-key': need('CLAUDE_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.AI_CLAUDE_MODEL || 'claude-haiku-4-5', max_tokens: j.max_tokens || j.max_completion_tokens || 2048,
      system: system || undefined, messages: (j.messages || []).filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return new Response(JSON.stringify(out), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return new Response(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
}

async function routeAi(url, init = {}) {
  const pathPart = url.slice(GATEWAY.length);
  const headers = new Headers(init.headers || {});
  headers.delete('Lovable-API-Key'); headers.delete('X-Lovable-AIG-SDK');
  let body = init.body;

  if (pathPart.startsWith('/v1/images/')) {
    headers.set('Authorization', `Bearer ${need('OPENAI_API_KEY')}`);
    const model = process.env.AI_IMAGE_MODEL || 'gpt-image-1';
    const quality = process.env.AI_IMAGE_QUALITY || 'medium';
    // Edits from a player's uploads ask for high input fidelity so the face, hair, beard and glasses
    // stay as close to the reference as the model allows (AI_IMAGE_FIDELITY=low to save cost).
    const fidelity = process.env.AI_IMAGE_FIDELITY || 'high';
    const isEdit = pathPart.startsWith('/v1/images/edits');
    if (body && typeof body.set === 'function') {
      body.set('model', model);
      if (!body.get('quality')) body.set('quality', quality);
      if (isEdit && fidelity !== 'off' && !body.get('input_fidelity')) body.set('input_fidelity', fidelity);
    } else { const j = jsonBody(init) || {}; j.model = model; j.quality ??= quality; body = JSON.stringify(j); }
    let res = await originalFetch('https://api.openai.com' + pathPart, { ...init, headers, body });
    // Models without input_fidelity reject it; retry once without rather than failing the graphic.
    if (res.status === 400 && body && typeof body.delete === 'function' && body.get('input_fidelity')
      && /input_fidelity/i.test(await res.clone().text().catch(() => ''))) {
      body.delete('input_fidelity');
      res = await originalFetch('https://api.openai.com' + pathPart, { ...init, headers, body });
    }
    if (!res.ok) {
      const detail = await res.clone().text().catch(() => '');
      console.warn(`[ai] OpenAI ${pathPart} ${res.status} (model ${model}): ${detail.slice(0, 300)}`);
    }
    return res;
  }

  if (pathPart.startsWith('/v1/chat/completions')) {
    const j = jsonBody(init) || {};
    if (process.env.GEMINI_API_KEY) {
      j.model = process.env.AI_GEMINI_MODEL || 'gemini-2.5-flash';
      delete j.reasoning_effort;
      headers.set('Authorization', `Bearer ${process.env.GEMINI_API_KEY}`);
      return originalFetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', { ...init, headers, body: JSON.stringify(j) });
    }
    if (process.env.CLAUDE_API_KEY && !j.stream && !j.tools) return claudeChat(j, init);
    j.model = process.env.AI_TEXT_MODEL || 'gpt-5-mini';
    headers.set('Authorization', `Bearer ${need('OPENAI_API_KEY')}`);
    return originalFetch('https://api.openai.com' + pathPart, { ...init, headers, body: JSON.stringify(j) });
  }

  // Responses API (strict JSON vision): OpenAI only.
  const j = jsonBody(init);
  if (j) { j.model = process.env.AI_VISION_MODEL || 'gpt-5-mini'; body = JSON.stringify(j); }
  headers.set('Authorization', `Bearer ${need('OPENAI_API_KEY')}`);
  return originalFetch('https://api.openai.com' + pathPart, { ...init, headers, body });
}

function wrapFetch(supabaseUrl) {
  if (fetchWrapped) return;
  fetchWrapped = true;
  originalFetch = globalThis.fetch;
  const base = `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/`;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (url && url.startsWith(GATEWAY)) return routeAi(url, init);
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
