// Runs bundled backend functions (local-functions/*.cjs) inside the bot process.
// Self-hosted servers then need no edge runtime for drafts, ratings, profiles, etc.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'local-functions');
const handlers = new Map();
let fetchWrapped = false;

function names() {
  try { return fs.readdirSync(DIR).filter(f => f.endsWith('.cjs')).map(f => f.slice(0, -4)); } catch { return []; }
}

function ensureEnv() {
  if (!process.env.DISCORD_BOT_TOKEN && process.env.BOT_TOKEN) process.env.DISCORD_BOT_TOKEN = process.env.BOT_TOKEN;
}

function load(name) {
  if (handlers.has(name)) return handlers.get(name);
  if (!names().includes(name)) return null;
  ensureEnv();
  let captured = null;
  const prev = globalThis.Deno;
  globalThis.Deno = { env: { get: (k) => process.env[k] }, serve: (h) => { captured = typeof h === 'function' ? h : h?.handler; } };
  try { require(path.join(DIR, `${name}.cjs`)); } finally {
    globalThis.Deno = { env: { get: (k) => process.env[k] }, serve: () => {} };
    if (prev) globalThis.Deno = prev;
  }
  if (captured) handlers.set(name, captured);
  return captured;
}

// Functions that call each other over HTTP are routed back in-process.
function wrapFetch(supabaseUrl) {
  if (fetchWrapped) return;
  fetchWrapped = true;
  const base = `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/`;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url && url.startsWith(base)) {
      const name = url.slice(base.length).split(/[/?]/)[0];
      const h = load(name);
      if (h) return h(new Request(input, init));
    }
    return original(input, init);
  };
}

function hasLocal(name) { return names().includes(name); }

async function invokeLocal(name, body, { supabaseUrl, serviceKey }) {
  wrapFetch(supabaseUrl);
  const h = load(name);
  if (!h) throw new Error(`No local handler for ${name}`);
  const req = new Request(`http://local/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    body: JSON.stringify(body ?? {}),
  });
  const res = await h(req);
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, data };
}

module.exports = { hasLocal, invokeLocal, names };
