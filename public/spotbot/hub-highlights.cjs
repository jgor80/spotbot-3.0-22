// Highlight of the Week for Social Hub servers.
//   Post       anyone posts a clip in #highlights (made by Set Up Social Hub): an uploaded video, or a
//              YouTube, Twitch, Medal, Streamable, Xbox or PlayStation link. The bot adds a ⭐ so voting
//              is one tap.
//   Vote       ⭐ reactions all week (the bot's own and the poster's don't count).
//   Winner     on Monday (UTC) the clip with the most votes from last week wins: it's posted in
//              #hub-feed, and the poster gets +150 XP and the Highlight Reel badge (hub-xp). Ties go to
//              the earlier clip. Guarded by social_hub.highlight_posted, so it runs once a week.
// Nothing here pings anyone.

const { EmbedBuilder } = require('discord.js');
const { weekKeyOf } = require('./hub-xp.cjs');

const STAR = '⭐';
const NO_PINGS = { parse: [] };
const VIDEO_URL_RE = /https?:\/\/\S*(youtu\.?be|twitch\.tv|medal\.tv|streamable|xbox\.com|gamerdvr|xboxclips|playstation)\S*/i;
const TICK_MS = 15 * 60 * 1000;
const MAX_SCAN = 500;

const isVideo = (a) => /^video\//.test(a?.contentType || '') || /\.(mp4|mov|webm|mkv)$/i.test(a?.name || '');
function clipOf(message) {
  const file = [...(message.attachments?.values?.() || [])].find(isVideo);
  if (file) return file.url;
  return String(message.content || '').match(VIDEO_URL_RE)?.[0] || null;
}

// Votes on one clip: ⭐ reactors other than the bot and the poster
function votesOf(reactors, botId, authorId) {
  return [...reactors].filter((id) => id !== botId && id !== authorId).length;
}

// The winner among scored clips: most votes, then the earliest posted
function pickWinner(clips) {
  return [...clips].filter((c) => c.votes > 0).sort((a, b) => b.votes - a.votes || a.at - b.at)[0] || null;
}

function createHubHighlights(deps) {
  const { hubOf, saveHub } = deps;
  const xp = () => deps.xp?.();
  const client = () => deps.client();

  async function onMessage(message) {
    if (!message.guildId || message.author?.bot) return;
    const hub = await hubOf(message.guildId).catch(() => ({}));
    if (!hub.on || message.channelId !== hub.highlights_channel_id) return;
    if (clipOf(message)) await message.react(STAR).catch(() => {});
  }

  // Every clip posted in a time window, newest pages first
  async function clipsBetween(channel, from, to) {
    const out = [];
    let before;
    for (let scanned = 0; scanned < MAX_SCAN; ) {
      const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
      if (!page?.size) break;
      for (const m of page.values()) {
        scanned += 1;
        if (m.createdTimestamp >= from && m.createdTimestamp < to && !m.author?.bot && clipOf(m)) out.push(m);
      }
      const oldest = [...page.values()].reduce((a, b) => (a.createdTimestamp < b.createdTimestamp ? a : b));
      if (oldest.createdTimestamp < from) break;
      before = oldest.id;
    }
    return out;
  }

  async function weeklyWinner(guild) {
    const hub = await hubOf(guild.id);
    if (!hub.on || !hub.highlights_channel_id) return null;
    const thisWeek = weekKeyOf();
    const last = weekKeyOf(new Date(Date.now() - 7 * 86400000));
    if (hub.highlight_posted === last) return null;
    await saveHub(guild.id, { ...hub, highlight_posted: last });
    const channel = await guild.channels.fetch(hub.highlights_channel_id).catch(() => null);
    if (!channel?.messages) return null;
    const from = new Date(`${last}T00:00:00Z`).getTime();
    const to = new Date(`${thisWeek}T00:00:00Z`).getTime();
    const clips = [];
    for (const m of await clipsBetween(channel, from, to)) {
      const reaction = m.reactions?.cache?.get(STAR);
      if (!reaction) continue;
      const users = await reaction.users.fetch().catch(() => null);
      clips.push({ message: m, author: m.author.id, at: m.createdTimestamp, votes: votesOf(users ? users.keys() : [], guild.members.me?.id, m.author.id) });
    }
    const win = pickWinner(clips);
    if (!win) return null;
    await xp()?.record(guild.id, new Map([[win.author, { highlights: 1 }]]));
    const feed = hub.feed_channel_id ? await guild.channels.fetch(hub.feed_channel_id).catch(() => null) : null;
    if (feed?.send) {
      await feed
        .send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎬 Highlight of the Week')
              .setColor(0xf1c40f)
              .setDescription(`<@${win.author}>'s clip won with **${win.votes}** ⭐ vote${win.votes === 1 ? '' : 's'}: +150 XP and the **Highlight Reel** badge.\n[Watch it](${win.message.url}) · Post yours in <#${hub.highlights_channel_id}> and vote with ⭐.`),
          ],
          allowedMentions: NO_PINGS,
        })
        .catch(() => {});
    }
    return win;
  }

  async function tick() {
    for (const guild of client()?.guilds?.cache?.values?.() || []) {
      await weeklyWinner(guild).catch((err) => console.warn(`[highlights] weekly winner failed for ${guild.id}: ${err.message}`));
    }
  }
  const timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  timer.unref?.();

  return { onMessage, weeklyWinner, tick };
}

module.exports = { createHubHighlights, clipOf, votesOf, pickWinner };
