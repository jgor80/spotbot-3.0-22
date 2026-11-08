// Live frames for posted Twitch links: when someone posts a twitch.tv/<channel> link and that channel is
// live, the bot replies with a card showing the stream's current frame (Twitch's live preview image),
// title, game and viewers. The card refreshes every few minutes while the stream runs and turns into a
// "stream ended" card when it stops. Discord can't play live video from a bot, so the preview image is the
// closest thing; its URL is cache-busted on every refresh so Discord fetches a fresh frame.
//
// Linked players (profiles.twitch_username, set by Admin → Import Twitch) get the same card posted on its
// own when they go live, in the channel a server picks with Admin → Player Live Cards
// (guild_settings.twitch_live_channel_id). Only players still in that server are posted there.
//
// Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (the same app the live alerts use). Without them it is off.
// Cards being refreshed are kept in memory only: after a restart old cards stay as they were, and the first
// check after a restart only posts streams that started recently, so a restart doesn't repost everyone.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { extractTwitchLogins } = require('./twitch-links.cjs');

const TWITCH_PURPLE = 0x9146ff;
const REFRESH_MS = 3 * 60 * 1000;
const MAX_TRACK_MS = 12 * 60 * 60 * 1000;
const MAX_LOGINS_PER_MESSAGE = 3;
const MAX_TRACKED = 200;
const POLL_MS = 3 * 60 * 1000;
// After a restart, streams older than this are taken as already posted
const FRESH_START_MS = 15 * 60 * 1000;
const MAX_POSTED = 2000;

function frameUrl(stream, now = Date.now()) {
  if (!stream?.thumbnail_url) return null;
  return `${stream.thumbnail_url.replace('{width}', '1280').replace('{height}', '720')}?t=${now}`;
}

function liveFor(startedAt, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  if (!Number.isFinite(mins)) return null;
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

function watchRow(login) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Watch on Twitch').setURL(`https://twitch.tv/${login}`),
  );
}

function liveEmbed(stream, user, now = Date.now()) {
  const name = stream.user_name || user?.display_name || stream.user_login;
  const e = new EmbedBuilder()
    .setColor(TWITCH_PURPLE)
    .setTitle(`🔴 ${name} is live`)
    .setURL(`https://twitch.tv/${stream.user_login}`)
    .setDescription(String(stream.title || 'Live on Twitch').slice(0, 300))
    .addFields(
      ...(stream.game_name ? [{ name: 'Playing', value: stream.game_name, inline: true }] : []),
      { name: 'Viewers', value: String(stream.viewer_count ?? 0), inline: true },
      ...(liveFor(stream.started_at, now) ? [{ name: 'Live for', value: liveFor(stream.started_at, now), inline: true }] : []),
    )
    .setFooter({ text: 'Live frame refreshes every few minutes' })
    .setTimestamp(new Date(now));
  const img = frameUrl(stream, now);
  if (img) e.setImage(img);
  if (user?.profile_image_url) e.setThumbnail(user.profile_image_url);
  return e;
}

function endedEmbed(card, now = Date.now()) {
  const e = new EmbedBuilder()
    .setColor(0x4f545c)
    .setTitle(`⚫ ${card.name} was live`)
    .setURL(`https://twitch.tv/${card.login}`)
    .setDescription(`${String(card.title || 'Stream').slice(0, 250)}\n\nStream ended${card.startedAt ? ` after ${liveFor(card.startedAt, now)}` : ''}.`)
    .setTimestamp(new Date(now));
  if (card.avatar) e.setThumbnail(card.avatar);
  return e;
}

function createTwitchLive({ getClient, supabase = null, clientId = process.env.TWITCH_CLIENT_ID?.trim(), clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim(), fetchImpl = (...a) => fetch(...a) } = {}) {
  const enabled = Boolean(clientId && clientSecret);
  let token = null;
  let tokenExpires = 0;
  const cards = new Map(); // `${channelId}:${login}` → { channelId, messageId, login, name, title, avatar, streamId, startedAt, postedAt }
  let timer = null;
  let pollTimer = null;
  let firstPoll = true;
  const posted = new Set(); // `${channelId}:${streamId}` already carded by the linked-player check

  async function appToken() {
    if (token && Date.now() < tokenExpires - 60000) return token;
    const res = await fetchImpl('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error(`twitch token ${res.status}`);
    token = body.access_token;
    tokenExpires = Date.now() + (Number(body.expires_in) || 3600) * 1000;
    return token;
  }

  // GET helix/streams?user_login=… or helix/users?login=…
  async function helix(path, param, logins) {
    if (!logins.length) return [];
    const url = `https://api.twitch.tv/helix/${path}?${logins.map((l) => `${param}=${encodeURIComponent(l)}`).join('&')}`;
    let res = await fetchImpl(url, { headers: { 'Client-ID': clientId, Authorization: `Bearer ${await appToken()}` } });
    if (res.status === 401) { token = null; res = await fetchImpl(url, { headers: { 'Client-ID': clientId, Authorization: `Bearer ${await appToken()}` } }); }
    if (!res.ok) throw new Error(`twitch ${path} ${res.status}`);
    return (await res.json().catch(() => ({}))).data || [];
  }

  // Live streams for these logins, keyed by lowercase login
  async function liveStreams(logins) {
    const out = new Map();
    for (let i = 0; i < logins.length; i += 100) {
      for (const s of await helix('streams', 'user_login', logins.slice(i, i + 100))) {
        if (s.type === 'live') out.set(String(s.user_login).toLowerCase(), s);
      }
    }
    return out;
  }

  async function onMessage(message) {
    if (!enabled || !message.guild || message.author?.bot || message.webhookId) return;
    const logins = extractTwitchLogins(message.content).slice(0, MAX_LOGINS_PER_MESSAGE);
    if (!logins.length) return;
    const live = await liveStreams(logins);
    if (!live.size) return;
    const users = new Map((await helix('users', 'login', [...live.keys()]).catch(() => [])).map((u) => [String(u.login).toLowerCase(), u]));
    for (const login of logins) {
      const stream = live.get(login);
      if (!stream) continue;
      const key = `${message.channelId}:${login}`;
      const existing = cards.get(key);
      // Same stream already has a live card in this channel: that one keeps refreshing, so don't post another
      if (existing && existing.streamId === stream.id) continue;
      const user = users.get(login);
      const sent = await message.reply({
        embeds: [liveEmbed(stream, user)],
        components: [watchRow(login)],
        allowedMentions: { repliedUser: false },
      }).catch((err) => { console.warn('[twitch-live] reply failed:', err.message); return null; });
      if (!sent) continue;
      if (cards.size >= MAX_TRACKED) cards.delete(cards.keys().next().value);
      cards.set(key, {
        channelId: message.channelId, messageId: sent.id, login,
        name: stream.user_name || user?.display_name || login, title: stream.title, avatar: user?.profile_image_url || null,
        streamId: stream.id, startedAt: stream.started_at, postedAt: Date.now(),
      });
      ensureTimer();
    }
  }

  async function editCard(card, payload) {
    const channel = await getClient()?.channels.fetch(card.channelId).catch(() => null);
    const msg = channel && await channel.messages.fetch(card.messageId).catch(() => null);
    if (!msg) return false;
    await msg.edit(payload);
    return true;
  }

  async function refresh() {
    if (!cards.size) return;
    const logins = [...new Set([...cards.values()].map((c) => c.login))];
    let live;
    try { live = await liveStreams(logins); } catch (err) { console.warn('[twitch-live] refresh failed:', err.message); return; }
    const now = Date.now();
    for (const [key, card] of cards) {
      const stream = live.get(card.login);
      try {
        if (stream && stream.id === card.streamId && now - card.postedAt < MAX_TRACK_MS) {
          card.title = stream.title;
          const ok = await editCard(card, { embeds: [liveEmbed(stream, { display_name: card.name, profile_image_url: card.avatar }, now)], components: [watchRow(card.login)] });
          if (!ok) cards.delete(key);
        } else {
          cards.delete(key);
          if (!stream || stream.id !== card.streamId) await editCard(card, { embeds: [endedEmbed(card, now)], components: [watchRow(card.login)] });
        }
      } catch (err) {
        console.warn('[twitch-live] card update failed:', err.message);
      }
    }
    if (!cards.size && timer) { clearInterval(timer); timer = null; }
  }

  // Who's linked, and which servers want their live cards: [{ discord_user_id, twitch_username }], [{ guild_id, twitch_live_channel_id }]
  async function linkedSetup() {
    const [{ data: servers, error: e1 }, { data: players, error: e2 }] = await Promise.all([
      supabase.from('guild_settings').select('guild_id, twitch_live_channel_id').not('twitch_live_channel_id', 'is', null),
      supabase.from('profiles').select('discord_user_id, twitch_username').not('twitch_username', 'is', null),
    ]);
    if (e1 || e2) throw new Error((e1 || e2).message);
    return { servers: servers || [], players: players || [] };
  }

  // Post a live card for every linked player who has gone live since the last check
  async function pollLinkedPlayers(now = Date.now()) {
    if (!enabled || !supabase) return 0;
    const client = getClient();
    if (!client) return 0;
    const { servers, players } = await linkedSetup();
    const wanted = servers.filter((s) => client.guilds.cache.has(s.guild_id));
    const fresh = firstPoll;
    firstPoll = false;
    if (!wanted.length || !players.length) return 0;
    const byLogin = new Map(players.map((p) => [String(p.twitch_username).toLowerCase(), p.discord_user_id]));
    const live = await liveStreams([...byLogin.keys()]);
    if (!live.size) return 0;
    let users = null;
    let count = 0;
    for (const [login, stream] of live) {
      // Right after a restart, a stream that's been going a while was most likely posted before it
      if (fresh && now - new Date(stream.started_at).getTime() > FRESH_START_MS) {
        for (const s of wanted) posted.add(`${s.twitch_live_channel_id}:${stream.id}`);
        continue;
      }
      const userId = byLogin.get(login);
      for (const s of wanted) {
        const channelId = s.twitch_live_channel_id;
        const key = `${channelId}:${stream.id}`;
        if (posted.has(key) || cards.get(`${channelId}:${login}`)?.streamId === stream.id) continue;
        posted.add(key);
        if (posted.size > MAX_POSTED) posted.delete(posted.values().next().value);
        const guild = client.guilds.cache.get(s.guild_id);
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.send) continue;
        if (!users) users = new Map((await helix('users', 'login', [...live.keys()]).catch(() => [])).map((u) => [String(u.login).toLowerCase(), u]));
        const user = users.get(login);
        const sent = await channel.send({
          content: `🔴 <@${userId}> just went live on Twitch`,
          embeds: [liveEmbed(stream, user, now)],
          components: [watchRow(login)],
          allowedMentions: { parse: [] },
        }).catch((err) => { console.warn('[twitch-live] post failed:', err.message); return null; });
        if (!sent) continue;
        count += 1;
        if (cards.size >= MAX_TRACKED) cards.delete(cards.keys().next().value);
        cards.set(`${channelId}:${login}`, {
          channelId, messageId: sent.id, login,
          name: stream.user_name || user?.display_name || login, title: stream.title, avatar: user?.profile_image_url || null,
          streamId: stream.id, startedAt: stream.started_at, postedAt: now,
        });
        ensureTimer();
      }
    }
    return count;
  }

  function start() {
    if (!enabled || !supabase || pollTimer) return;
    const run = () => pollLinkedPlayers().catch((err) => console.warn('[twitch-live] linked check failed:', err.message));
    run();
    pollTimer = setInterval(run, POLL_MS);
    pollTimer.unref?.();
  }

  function ensureTimer() {
    if (timer) return;
    timer = setInterval(() => refresh().catch(() => {}), REFRESH_MS);
    timer.unref?.();
  }

  return { enabled, onMessage, refresh, pollLinkedPlayers, start, cards };
}

module.exports = { createTwitchLive, liveEmbed, endedEmbed, frameUrl, liveFor };
