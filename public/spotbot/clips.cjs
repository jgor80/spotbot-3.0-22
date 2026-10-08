// Clips & Highlights: posts players' EA FC clips that were recorded during a club match.
// - Xbox: after new matches sync, pull linked players' FC clips (xbox-clips function) and post the ones
//   recorded inside a match window, tagged with that match.
// - Any platform (PS5 shares, YouTube/Twitch/Medal links, uploaded videos): when posted in the clips
//   channel, the bot replies with the club match it was played in, if one lines up.
const { EmbedBuilder } = require('discord.js');
const { activeClubs } = require('./squads.cjs');

const NAME_RE = /clips?|highlights?/i;
const VIDEO_URL_RE = /https?:\/\/\S*(youtu\.?be|twitch\.tv|medal\.tv|streamable|xbox\.com|gamerdvr|xboxclips|playstation)\S*/i;
const BEFORE_MS = 20 * 60 * 1000; // EA stamps the match at full time; a game runs ~15 min plus stoppage
const AFTER_MS = 5 * 60 * 1000;
const MAX_REMEMBERED = 300;

function matchFor(matches, at) {
  const t = at.getTime();
  return matches.find((m) => t >= m.playedAt.getTime() - BEFORE_MS && t <= m.playedAt.getTime() + AFTER_MS) || null;
}

function matchLine(m) {
  const tag = m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D';
  return `**${tag} ${m.scoreFor}-${m.scoreAgainst}** vs ${m.opponent}${m.matchType ? ` · ${m.matchType}` : ''}`;
}

function playerLine(m, name) {
  const p = name && m.players.find((x) => String(x.ea_username || x.name || '').toLowerCase() === String(name).toLowerCase());
  if (!p) return null;
  const bits = [Number(p.goals) && `${p.goals}G`, Number(p.assists) && `${p.assists}A`, Number(p.rating) && `${Number(p.rating).toFixed(1)}`].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

function createClips({ supabaseUrl, secret, getGuildState, updateClub, loadMatches, client }) {
  function clipsChannel(guild, club) {
    const id = club.autopilot?.clips_channel_id;
    if (id) return guild.channels.cache.get(id) || null;
    return guild.channels.cache.find((c) => c.isTextBased?.() && NAME_RE.test(c.name)) || null;
  }

  async function fetchXboxClips(guildId, since) {
    if (!secret) return [];
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/xbox-clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ guild_id: guildId, since: since.toISOString() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[clips] xbox lookup failed ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      return [];
    }
    return body.clips || [];
  }

  // newMatchHooks signature: (guildId, club, recentMatches, rows)
  async function onNewMatches(guildId, club, recent) {
    if (club.autopilot?.clips_off) return;
    const guild = client().guilds.cache.get(guildId);
    const channel = guild && clipsChannel(guild, club);
    if (!channel || !recent.length) return;
    // Clips upload a few minutes after recording; also re-check on the next sync via the posted list
    const oldest = Math.min(...recent.map((m) => m.playedAt.getTime()));
    const clips = await fetchXboxClips(guildId, new Date(oldest - BEFORE_MS - 6 * 3600e3));
    if (!clips.length) return;
    const matches = loadMatches ? await loadMatches(guildId, club.key).catch(() => recent) : recent;
    const posted = new Set(club.autopilot?.clips_posted || []);
    const fresh = [];
    for (const c of clips) {
      if (posted.has(c.id)) continue;
      const m = matchFor(matches, new Date(c.recorded_at));
      if (!m) continue; // not from a club game
      fresh.push({ c, m });
    }
    for (const { c, m } of fresh.slice(0, 8)) {
      const stat = playerLine(m, c.ea_username);
      const embed = new EmbedBuilder()
        .setColor(0x107c10)
        .setAuthor({ name: `🎥 Highlight · ${c.gamertag || c.ea_username || 'Club player'}` })
        .setDescription([`<@${c.discord_user_id}> in ${matchLine(m)}`, stat && `Match line: ${stat}`, `Recorded <t:${Math.floor(new Date(c.recorded_at).getTime() / 1000)}:t>`].filter(Boolean).join('\n'))
        .setFooter({ text: 'Auto-posted from Xbox game clips recorded during a club match' });
      if (c.thumbnail_url) embed.setImage(c.thumbnail_url);
      await channel.send({ content: c.video_url, embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => console.warn(`[clips] post failed: ${err.message}`));
      posted.add(c.id);
    }
    if (fresh.length) {
      await updateClub(guildId, club.key, (ap) => {
        ap.clips_posted = [...posted].slice(-MAX_REMEMBERED);
      });
    }
  }

  // Manual shares (PS5, YouTube, Medal, uploads) in the clips channel get tagged with the match they came from
  async function onMessage(message) {
    if (!message.guild || message.author?.bot) return;
    const hasVideo = [...(message.attachments?.values() || [])].some((a) => /^video\//.test(a.contentType || '') || /\.(mp4|mov|webm)$/i.test(a.name || ''));
    if (!hasVideo && !VIDEO_URL_RE.test(message.content || '')) return;
    const state = await getGuildState(message.guild.id);
    const clubs = activeClubs(state);
    const club = clubs.find((c) => clipsChannel(message.guild, c)?.id === message.channelId);
    if (!club || !loadMatches) return;
    const matches = await loadMatches(message.guild.id, club.key).catch(() => []);
    // A clip shared within ~2 hours of a game is assumed to be from the most recent one before it
    const at = message.createdTimestamp;
    const m = matches.find((x) => x.playedAt.getTime() <= at && at - x.playedAt.getTime() <= 2 * 3600e3);
    if (!m) return;
    await message.reply({ content: `🎥 Tagged: ${matchLine(m)}. Nice one.`, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }

  return { onNewMatches, onMessage, matchFor };
}

module.exports = { createClips, matchFor };
