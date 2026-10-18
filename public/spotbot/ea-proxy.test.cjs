const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { createEaProxy, isEaUrl, maskProxy } = require('./ea-proxy.cjs');

// Stand-in for undici: records each proxied call and answers with a canned status
function fakeUndici(status = 200, body = { ok: 1 }) {
  const calls = [];
  return {
    calls,
    ProxyAgent: class { constructor(url) { this.url = url; } },
    fetch: async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status }); },
  };
}

test('only EA hosts count as EA requests', () => {
  assert.equal(isEaUrl('https://proclubs.ea.com/api/fc/clubs/info?clubIds=1'), true);
  assert.equal(isEaUrl(new URL('https://proclubs.ea.com/x')), true);
  assert.equal(isEaUrl('/api/fc/clubs/info', 'https://proclubs.ea.com'), true);
  assert.equal(isEaUrl('https://discord.com/api'), false);
  assert.equal(isEaUrl('not a url'), false);
});

test('proxy credentials never reach the log line', () => {
  assert.equal(maskProxy('http://user:secret@proxy.example:8080'), 'http://proxy.example:8080');
});

test('fetch sends EA requests through the proxy and leaves the rest alone', async () => {
  const undici = fakeUndici();
  const target = { fetch: async () => 'direct' };
  createEaProxy({ getProxyUrl: () => 'http://proxy.example:8080', loadUndici: () => undici }).installFetch(target);
  assert.equal(await target.fetch('https://discord.com/api'), 'direct');
  const res = await target.fetch('https://proclubs.ea.com/api/fc/clubs/info?clubIds=1', { headers: { a: 'b' } });
  assert.equal(res.status, 200);
  assert.equal(undici.calls.length, 1);
  assert.equal(undici.calls[0].init.dispatcher.url, 'http://proxy.example:8080');
});

test('without EA_PROXY_URL nothing is proxied', async () => {
  const undici = fakeUndici();
  const target = { fetch: async () => 'direct' };
  createEaProxy({ getProxyUrl: () => '', loadUndici: () => undici }).installFetch(target);
  assert.equal(await target.fetch('https://proclubs.ea.com/api/fc/clubs/info'), 'direct');
  assert.equal(undici.calls.length, 0);
});

test('axios EA calls go through the proxy with params, parsed JSON and the usual errors', async () => {
  const undici = fakeUndici();
  const ax = axios.create();
  createEaProxy({ getProxyUrl: () => 'http://proxy.example:8080', loadUndici: () => undici }).installAxios(ax);
  const res = await ax.get('https://proclubs.ea.com/api/fc/clubs/info', { params: { platform: 'common-gen5', clubIds: '7' }, headers: { 'User-Agent': 'x' } });
  assert.deepEqual(res.data, { ok: 1 });
  assert.equal(undici.calls[0].url, 'https://proclubs.ea.com/api/fc/clubs/info?platform=common-gen5&clubIds=7');
  assert.equal(undici.calls[0].init.headers['User-Agent'], 'x');

  const blocked = fakeUndici(403);
  const ax2 = axios.create();
  createEaProxy({ getProxyUrl: () => 'http://proxy.example:8080', loadUndici: () => blocked }).installAxios(ax2);
  await assert.rejects(ax2.get('https://proclubs.ea.com/api/fc/clubs/info'), (err) => err.response?.status === 403);
  const lenient = await ax2.get('https://proclubs.ea.com/api/fc/clubs/info', { validateStatus: () => true });
  assert.equal(lenient.status, 403);
});
