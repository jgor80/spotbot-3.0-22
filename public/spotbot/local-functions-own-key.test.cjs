// A player's or server's own OpenAI key (x-ai-own-key from club-art) replaces the server key for that call only,
// stays on OpenAI, and is never sent anywhere else.
const test = require('node:test');
const assert = require('node:assert');

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), headers: new Headers(init.headers || {}) });
  return new Response(JSON.stringify({ data: [{ b64_json: 'x' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
process.env.OPENAI_API_KEY = 'sk-server-key';
process.env.GEMINI_API_KEY = 'gemini-server-key';
console.warn = () => {};
const lf = require('./local-functions.cjs');
lf.wrapFetch('http://127.0.0.1:1');

const GATEWAY = 'https://ai.gateway.lovable.dev';

test('image calls use the own key when one is sent, the server key otherwise', async () => {
  calls.length = 0;
  await fetch(`${GATEWAY}/v1/images/generations`, { method: 'POST', headers: { 'x-ai-own-key': 'sk-player-own', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'p' }) });
  await fetch(`${GATEWAY}/v1/images/generations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'p' }) });
  assert.strictEqual(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.strictEqual(calls[0].headers.get('authorization'), 'Bearer sk-player-own');
  assert.strictEqual(calls[0].headers.has('x-ai-own-key'), false);
  assert.strictEqual(calls[1].headers.get('authorization'), 'Bearer sk-server-key');
});

test('the quality check (Responses API) runs on the own key too', async () => {
  calls.length = 0;
  await fetch(`${GATEWAY}/v1/responses`, { method: 'POST', headers: { 'x-ai-own-key': 'sk-player-own' }, body: JSON.stringify({ model: 'x', input: [] }) });
  assert.strictEqual(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.strictEqual(calls[0].headers.get('authorization'), 'Bearer sk-player-own');
});

test('chat on an own key stays on OpenAI instead of the server Gemini key', async () => {
  calls.length = 0;
  await fetch(`${GATEWAY}/v1/chat/completions`, { method: 'POST', headers: { 'x-ai-own-key': 'sk-player-own' }, body: JSON.stringify({ messages: [] }) });
  assert.strictEqual(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(calls[0].headers.get('authorization'), 'Bearer sk-player-own');
});

test('an own key header is stripped from any call that is not for the AI router', async () => {
  calls.length = 0;
  await fetch('https://example.com/elsewhere', { headers: { 'x-ai-own-key': 'sk-player-own', 'x-other': '1' } });
  assert.strictEqual(calls[0].headers.has('x-ai-own-key'), false);
  assert.strictEqual(calls[0].headers.get('x-other'), '1');
});
