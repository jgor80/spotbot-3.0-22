// Premium: the streamer kit.
//   /premium overlay   the OBS browser-source link for a club: XI on a mini pitch, ratings updating as
//                      EA matches land (served by the web app at /overlay/<token>, data from the
//                      stream-overlay edge function)
//   big moments        after a synced match: hat-tricks, perfect 10s, thrashings and win streaks get a
//                      shout-out in the recap channel, with links to anyone in the server live on Twitch;
//                      the newest moment is pinned and the previous one unpinned
// EA match data has no event times, so "90th-minute winner" style moments can't be detected.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { num } = require('./player-season.cjs');

// twitch_notifications.is_live is only set by stream.online, so trust it for a few hours at most
const LIVE_TRUST_MS = 6 * 60 * 60 * 1000;
const BIG_WIN_MARGIN = 5;
const STREAK = 5;
const DEFAULT_DASHBOARD = 'https://squadiq.lovable.app';

const OVERLAY_SUBCOMMAND = {
  type: 1,
  name: 'overlay',
  description: 'OBS browser-source link: your XI on a live pitch with ratings from tonight.',
  options: [
    { name: 'club', description: 'Club name (if the server has more than one).', type: 3, required: false },
    { name: 'new_link', description: 'Make a new link and stop the old one working.', type: 5, required: false },
  ],
};

// Pure: what's worth shouting about in a match (history is newest first and starts with this match)
function momentsIn(match, history) {
  const out = [];
  const name = (p) => String(p.ea_username || '').trim();
  for (const p of match.players || []) {
    const goals = num(p.goals);
    if (goals >= 4) out.push({ kind: 'haul', text: `🔥 **${name(p)}** scored **${goals}** against ${match.opponent}!` });
    else if (goals === 3) out.push({ kind: 'hattrick', text: `🎩 Hat-trick for **${name(p)}** against ${match.opponent}!` });
    if (num(p.rating) >= 10) out.push({ kind: 'perfect', text: `💯 A perfect **10.0** match rating for **${name(p)}**.` });
  }
  if (match.result === 'win' && match.scoreFor - match.scoreAgainst >= BIG_WIN_MARGIN) {
    out.push({ kind: 'thrashing', text: `💥 **${match.scoreFor}-${match.scoreAgainst}** demolition of ${match.opponent}.` });
  }
  let streak = 0;
  for (const m of history) {
    if (m.result !== 'win') break;
    streak++;
  }
  if (streak >= STREAK && streak % STREAK === 0) out.push({ kind: 'streak', text: `📈 **${streak} wins in a row.**` });
  return out;
}

function createStreamKit(deps) {
  const { supabase, premium, events, autopilot, getGuildState, canManageClub, loadMatches } = deps;
  const dashboard = (deps.dashboardUrl || DEFAULT_DASHBOARD).replace(/\/+$/, '');

  // ---------- Overlay link ----------

  async function handleOverlay(interaction) {
    await interaction.deferReply({ flags: 64 });
    if (!(await premium.gate(interaction, 'The stream overlay'))) return;
    const state = await getGuildState(interaction.guildId);
    const wanted = (interaction.options.getString('club') || '').trim().toLowerCase();
    const club =
      (wanted && activeClubs(state).find((c) => c.key === wanted || (c.name || '').toLowerCase() === wanted)) || resolveClub(state, interaction.member);
    if (!club) return interaction.editReply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.' });
    if (!(await canManageClub(interaction.member, club))) return interaction.editReply({ content: `❌ Only ${club.name}'s leaders can get the overlay link.` });
    const token = await premium.overlayToken(interaction.guildId, interaction.options.getBoolean('new_link') === true);
    if (!token) return interaction.editReply({ content: '❌ The overlay needs the premium_servers table. Ask the bot owner to apply the Premium migration.' });
    const url = `${dashboard}/overlay/${token}?club=${encodeURIComponent(club.key)}`;
    const embed = new EmbedBuilder()
      .setTitle(`📺 ${club.name} stream overlay`)
      .setColor(0x9146ff)
      .setDescription(
        `Add this as a **Browser Source** in OBS or Streamlabs (1920×1080, transparent background):\n\`\`\`${url}\`\`\`` +
          "It shows your latest team sheet on a mini pitch and updates every 30 seconds as EA matches sync: tonight's rating, goals and assists per player, and the session score.\n\n" +
          'Treat the link like a password. **/manager → Premium → Stream Overlay** with New link set to Yes makes a new one and stops this one working.',
      );
    return interaction.editReply({ embeds: [embed] });
  }

  // ---------- Big moments ----------

  async function liveStreams(guildId) {
    const { data } = await supabase
      .from('twitch_notifications')
      .select('twitch_username, is_live, last_notified_at')
      .eq('guild_id', guildId)
      .eq('is_live', true);
    const now = Date.now();
    return (data || []).filter((s) => s.last_notified_at && now - new Date(s.last_notified_at).getTime() < LIVE_TRUST_MS).map((s) => s.twitch_username);
  }

  async function announceMoments(guildId, club, recent) {
    if (!autopilot.isOn(club, 'moments') || !(await premium.isPremium(guildId))) return;
    const history = loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
    const lines = [];
    for (const match of recent) {
      const idx = history.findIndex((m) => m.id === match.id);
      lines.push(...momentsIn(match, idx >= 0 ? history.slice(idx) : [match]).map((m) => m.text));
    }
    if (!lines.length) return;
    const channel = await autopilot.postChannel(guildId, club);
    if (!channel) return;
    const prefs = await events.serverPrefs(guildId);
    const streams = await liveStreams(guildId);
    const embed = new EmbedBuilder()
      .setTitle(`📣 ${club.name}: big moment`)
      .setColor(Number(prefs.branding?.color) || 0xf97316)
      .setDescription(lines.slice(0, 6).join('\n'));
    if (streams.length) embed.addFields({ name: '🔴 Live now', value: streams.map((u) => `[twitch.tv/${u}](https://twitch.tv/${u})`).join('\n') });
    const components = streams.length
      ? [
          new ActionRowBuilder().addComponents(
            streams.slice(0, 5).map((u) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(`https://twitch.tv/${u}`).setLabel(`Watch ${u}`.slice(0, 80))),
          ),
        ]
      : [];
    const sent = await channel.send({ embeds: [embed], components }).catch((err) => console.warn(`[stream-kit] moment failed: ${err.message}`));
    if (!sent) return;

    // Keep one pinned moment per club: pin this, unpin the last
    const previous = club.autopilot?.moment_pin;
    const pinned = await sent
      .pin()
      .then(() => true)
      .catch(() => false);
    if (!pinned) return;
    if (previous?.message_id && previous.channel_id) {
      const old = await channel.client.channels.fetch(previous.channel_id).catch(() => null);
      const msg = old ? await old.messages.fetch(previous.message_id).catch(() => null) : null;
      if (msg?.pinned) await msg.unpin().catch(() => {});
    }
    await autopilot.updateClub(guildId, club.key, (ap) => {
      ap.moment_pin = { channel_id: sent.channelId, message_id: sent.id };
    });
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guildId || interaction.commandName !== 'premium') return false;
    if (interaction.options.getSubcommand(false) !== 'overlay') return false;
    await handleOverlay(interaction);
    return true;
  }

  autopilot.onNewMatches(announceMoments);

  return { handleInteraction, announceMoments };
}

module.exports = { createStreamKit, OVERLAY_SUBCOMMAND, momentsIn };
