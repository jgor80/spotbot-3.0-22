// Optional fallback for when EA blocks the server's IP: with EA_PROXY_URL set (e.g.
// http://user:pass@host:port, a residential or other non-datacenter proxy), every request to EA's
// Pro Clubs API goes through it. That covers the bot's axios calls and the in-process backend
// functions (sync-ea-stats, scouting), which use fetch. Unset, nothing changes.

const EA_HOSTS = new Set(['proclubs.ea.com']);

function hrefOf(input, base) {
  if (typeof input === 'string') return new URL(input, base).href;
  if (input instanceof URL) return input.href;
  return input?.url;
}

function isEaUrl(input, base) {
  try {
    return EA_HOSTS.has(new URL(hrefOf(input, base)).hostname);
  } catch {
    return false;
  }
}

// Credentials stay out of the logs
function maskProxy(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(invalid EA_PROXY_URL)';
  }
}

function createEaProxy({ getProxyUrl = () => String(process.env.EA_PROXY_URL || '').trim(), loadUndici = () => require('undici') } = {}) {
  let cached = null;
  const active = () => !!getProxyUrl();

  function client() {
    const url = getProxyUrl();
    if (!cached || cached.url !== url) {
      const undici = loadUndici();
      cached = { url, undici, dispatcher: new undici.ProxyAgent(url) };
    }
    return cached;
  }

  // undici's own fetch is used with its ProxyAgent, so a Request from Node's built-in fetch is
  // passed on as a URL plus its method and headers (EA calls are plain GETs).
  function eaFetch(input, init = {}) {
    const { undici, dispatcher } = client();
    if (typeof input === 'string' || input instanceof URL) return undici.fetch(input, { ...init, dispatcher });
    return undici.fetch(input.url, { method: input.method, headers: input.headers, signal: input.signal, ...init, dispatcher });
  }

  // Wraps globalThis.fetch so EA requests take the proxy and everything else is untouched.
  function installFetch(target = globalThis) {
    const original = target.fetch;
    target.fetch = (input, init) => (active() && isEaUrl(input) ? eaFetch(input, init) : original(input, init));
  }

  // Gives axios's EA requests an adapter that calls the proxied fetch. axios still parses the body
  // (transformResponse) and the EA retry interceptor still sees the same statuses and errors.
  function installAxios(axios) {
    const { AxiosError } = require('axios');
    const adapter = async (config) => {
      const timeout = config.timeout ? AbortSignal.timeout(config.timeout) : null;
      const signal = config.signal && timeout ? AbortSignal.any([config.signal, timeout]) : config.signal || timeout || undefined;
      const headers = typeof config.headers?.toJSON === 'function' ? config.headers.toJSON() : { ...(config.headers || {}) };
      let res;
      try {
        res = await eaFetch(axios.getUri(config), { method: String(config.method || 'get').toUpperCase(), headers, signal });
      } catch (err) {
        const timedOut = timeout?.aborted;
        throw new AxiosError(timedOut ? `timeout of ${config.timeout}ms exceeded` : err.message, timedOut ? 'ECONNABORTED' : 'ERR_NETWORK', config);
      }
      const response = { data: await res.text(), status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers), config, request: null };
      const ok = !config.validateStatus || config.validateStatus(res.status);
      if (!ok) throw new AxiosError(`Request failed with status code ${res.status}`, res.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, null, response);
      return response;
    };
    axios.interceptors.request.use((config) => {
      if (active() && isEaUrl(config.url, config.baseURL)) config.adapter = adapter;
      return config;
    });
  }

  return { active, eaFetch, installFetch, installAxios };
}

function installEaProxy(axios, log = console) {
  const proxy = createEaProxy();
  proxy.installFetch();
  proxy.installAxios(axios);
  if (proxy.active()) log.log(`🛰️  EA requests go through the proxy at ${maskProxy(process.env.EA_PROXY_URL)}`);
  return proxy;
}

module.exports = { createEaProxy, installEaProxy, isEaUrl, maskProxy };
