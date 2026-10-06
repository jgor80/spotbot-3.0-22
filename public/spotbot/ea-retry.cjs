// Retries EA Pro Clubs requests that fail because EA is throttling or blocking us
// (403/429/5xx or a dropped connection), with exponential backoff.
// Keep in sync with eaFetch in supabase/functions/sync-ea-stats/index.ts.

const EA_HOST = 'proclubs.ea.com';
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const DEFAULT_DELAYS_MS = [1000, 3000, 7000];
const THROTTLE_MEMORY_MS = 2 * 60 * 1000;

let lastThrottledAt = 0;

function isEaRequest(config) {
  try {
    return new URL(config.url, config.baseURL).hostname === EA_HOST;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// True when an EA request ran out of retries in the last couple of minutes.
function eaRecentlyThrottled() {
  return Date.now() - lastThrottledAt < THROTTLE_MEMORY_MS;
}

const EA_THROTTLED_MESSAGE = 'EA servers are throttling requests right now. Try again in a minute.';

// Adds the retry to every axios request to proclubs.ea.com, whether the caller
// treats non-200 as an error or reads the status itself (validateStatus: () => true).
function installEaRetry(axios, { delaysMs = DEFAULT_DELAYS_MS } = {}) {
  async function retry(config, reason) {
    const attempt = config.__eaAttempt || 0;
    if (attempt >= delaysMs.length) {
      lastThrottledAt = Date.now();
      console.warn(`[EA] Giving up on ${config.url} after ${attempt + 1} tries (${reason})`);
      return null;
    }
    const delay = delaysMs[attempt] + Math.floor(Math.random() * 500);
    console.warn(`[EA] ${reason} from ${config.url}; retrying in ${delay}ms`);
    await sleep(delay);
    return axios.request({ ...config, __eaAttempt: attempt + 1 });
  }

  axios.interceptors.response.use(
    async (res) => {
      if (!res.config || !isEaRequest(res.config) || !RETRY_STATUSES.has(res.status)) return res;
      return (await retry(res.config, `HTTP ${res.status}`)) || res;
    },
    async (err) => {
      const config = err.config;
      if (!config || !isEaRequest(config)) throw err;
      const status = err.response?.status;
      // No response means a reset or timeout; a response only retries on throttling statuses.
      if (status && !RETRY_STATUSES.has(status)) throw err;
      const res = await retry(config, status ? `HTTP ${status}` : err.code || err.message);
      if (!res) throw err;
      return res;
    }
  );
}

module.exports = { installEaRetry, eaRecentlyThrottled, EA_THROTTLED_MESSAGE };
