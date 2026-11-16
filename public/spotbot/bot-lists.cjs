// Server counts for the bot listing sites (top.gg, discordbotlist.com, discord.bots.gg). A listing that
// shows a live server count ranks better and looks alive. Each site is only posted to when its token is
// set in the bot's .env, so nothing happens until GafferBot is listed there:
//   TOPGG_TOKEN           top.gg → your bot → Webhooks / API → token
//   DISCORDBOTLIST_TOKEN  discordbotlist.com → your bot → Admin → token
//   DISCORD_BOTS_GG_TOKEN discord.bots.gg → API → token
// Counts go up every 30 minutes and once a minute after startup.

const EVERY_MS = 30 * 60 * 1000;

const SITES = [
  {
    name: 'top.gg',
    env: 'TOPGG_TOKEN',
    url: (id) => `https://top.gg/api/bots/${id}/stats`,
    body: ({ guilds }) => ({ server_count: guilds }),
  },
  {
    name: 'discordbotlist.com',
    env: 'DISCORDBOTLIST_TOKEN',
    url: (id) => `https://discordbotlist.com/api/v1/bots/${id}/stats`,
    body: ({ guilds, users }) => ({ guilds, users }),
  },
  {
    name: 'discord.bots.gg',
    env: 'DISCORD_BOTS_GG_TOKEN',
    url: (id) => `https://discord.bots.gg/api/v1/bots/${id}/stats`,
    body: ({ guilds }) => ({ guildCount: guilds }),
  },
];

function counts(client) {
  const guilds = client.guilds.cache.size;
  const users = [...client.guilds.cache.values()].reduce((n, g) => n + (g.memberCount || 0), 0);
  return { guilds, users };
}

/** Posts the current counts to every site with a token. Returns [{ site, ok, status|error }]. */
async function postStats(client, { env = process.env, fetchImpl = fetch } = {}) {
  const id = client.user?.id;
  if (!id) return [];
  const c = counts(client);
  const out = [];
  for (const s of SITES) {
    const token = env[s.env];
    if (!token) continue;
    try {
      const res = await fetchImpl(s.url(id), {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(s.body(c)),
      });
      if (!res.ok) console.warn(`[bot-lists] ${s.name} answered ${res.status}`);
      out.push({ site: s.name, ok: res.ok, status: res.status });
    } catch (e) {
      console.warn(`[bot-lists] ${s.name} failed:`, e.message);
      out.push({ site: s.name, ok: false, error: e.message });
    }
  }
  return out;
}

function start(client) {
  if (!SITES.some((s) => process.env[s.env])) return;
  const run = () => postStats(client).catch(() => {});
  setTimeout(run, 60 * 1000);
  setInterval(run, EVERY_MS).unref?.();
}

module.exports = { start, postStats, counts, SITES };
