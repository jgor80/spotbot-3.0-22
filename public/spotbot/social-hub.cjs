// Social Hub: an open drop-in server where anyone can find a game any time. It runs on the classic spot
// board: every lobby is one of the server's club slots, linked to its own voice channel, in casual mode
// (casual.cjs), so spots fill from voice and the bench rotates.
//   Setup        one press (/manager → Casual Play → Set Up Social Hub) makes a lobby category with N
//                voice channels, links each to a club slot with casual mode on, makes a read-only
//                #whos-playing channel and the Up for a Game role, and posts the live board.
//   Live board   who is playing where: every lobby, who is on which spot, who is waiting, the open spots
//                and whether a game is on. It refreshes itself as people move around voice.
//   Play now     anyone: puts you in the lobby that needs your position (moves you there when you're in
//                another voice channel). With every lobby empty you join a queue, and once enough are
//                waiting the bot calls a game by pinging Up for a Game.
//   Next game    anyone in a lobby: the longest runs sit out and the waiting players come in, for lobbies
//                with no EA club linked (linked ones also rotate when EA brings the game in).
// Nothing here pings a player: the board and lobby messages show names without mentions, and the only
// ping is the Up for a Game role on a game call. Settings live in guild_settings.social_hub.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const { isServerAdmin } = require('./perm-check.cjs');

const F = PermissionsBitField.Flags;
const GREEN = 0x2ecc71;
const FULL_XI = 11;
const MAX_LOBBIES = 10;
const DEFAULT_LOBBIES = 4;
const DEFAULT_CALL_AT = 3;
const BOARD_SETTLE_MS = 5000;              // batch voice moves into one board edit
const QUEUE_TTL_MS = 45 * 60 * 1000;       // a Play now with nobody on stays in the queue this long
const NEXT_COOLDOWN_MS = 5 * 60 * 1000;    // Next game once per lobby per 5 minutes
const NO_PINGS = { parse: [] };
const CATEGORY_NAME = '🎮 Drop-in Lobbies';
const BOARD_NAME = 'whos-playing';

const HUB_COMMANDS = [
  {
    name: 'hub',
    description: 'Social Hub: drop-in lobbies with a live who\'s-playing-where board.',
    options: [
      {
        type: 1,
        name: 'setup',
        description: 'Make (or top up) the lobby voice channels, the #whos-playing board and the Up for a Game role.',
        options: [{ name: 'lobbies', description: 'How many lobbies (2 to 10, default 4).', type: 4, required: false, min_value: 2, max_value: MAX_LOBBIES }],
      },
      { type: 1, name: 'board', description: 'Post the live who\'s-playing-where board here again.' },
      { type: 1, name: 'play', description: 'Play now: get put in the lobby that needs your position.' },
      { type: 1, name: 'next', description: 'Next game in your lobby: the longest runs sit out and the waiting players come in.' },
    ],
  },
];

// ---------- Pure helpers ----------

// Best lobby for a player: a game already going beats an empty lobby, a spot in their position beats
// any spot, then the fullest lobby (so games fill up rather than spread thin). Full lobbies are skipped.
function pickLobby(lobbies) {
  const open = lobbies.filter((l) => l.openSlots > 0 && l.humans < FULL_XI);
  if (!open.length) return null;
  return open.sort((a, b) => (b.humans > 0) - (a.humans > 0) || (b.fits ? 1 : 0) - (a.fits ? 1 : 0) || b.humans - a.humans || a.index - b.index)[0];
}

// Queue entries younger than the TTL
function liveQueue(queue, now = Date.now()) {
  const out = new Map();
  for (const [id, at] of queue || []) if (now - at < QUEUE_TTL_MS) out.set(id, at);
  return out;
}

const callAtOf = (club) => {
  const n = Number(club?.casual?.call_at);
  return Number.isFinite(n) && n >= 2 && n <= FULL_XI ? n : DEFAULT_CALL_AT;
};

const isDefaultName = (name) => /^Club \d+$/.test(String(name || ''));

function createSocialHub(deps) {
  const { supabase, getGuildState, saveGuildSettings, casual, createBoard, getUserPrefs, getInferredMatch, gameOn } = deps;
  const client = () => deps.client();
  const hubs = new Map();     // guildId -> settings
  const queues = new Map();   // guildId -> Map(userId -> joinedAt)
  const timers = new Map();
  const lastNext = new Map();

  // ---------- Settings ----------

  async function hubOf(guildId) {
    if (hubs.has(guildId)) return hubs.get(guildId);
    const { data } = await supabase.from('guild_settings').select('social_hub').eq('guild_id', guildId).maybeSingle();
    const hub = data?.social_hub && typeof data.social_hub === 'object' ? data.social_hub : {};
    hubs.set(guildId, hub);
    return hub;
  }

  async function saveHub(guildId, hub) {
    hubs.set(guildId, hub);
    const { error } = await supabase.from('guild_settings').update({ social_hub: hub, updated_at: new Date().toISOString() }).eq('guild_id', guildId);
    if (error) console.warn(`[hub] save failed for ${guildId}: ${error.message}`);
  }

  function lobbyClubs(state, hub) {
    return (hub.lobbies || []).map((k) => (state?.clubs || []).find((c) => c.key === k && c.enabled)).filter(Boolean);
  }

  // ---------- Lobby snapshot ----------

  async function lobbiesOf(guild, state, hub, userId = null) {
    const prefs = userId && getUserPrefs ? ((await getUserPrefs(guild.id, userId).catch(() => [])) || []).map((p) => String(p).toUpperCase()) : [];
    return lobbyClubs(state, hub).map((club, index) => {
      const vcId = state.clubVcLinks?.[club.key];
      const vc = vcId ? guild.channels.cache.get(vcId) : null;
      const inVoice = vc?.members ? [...vc.members.values()].filter((m) => !m.user?.bot).map((m) => m.id) : [];
      const slots = state.boardState?.[club.key]?.slots || [];
      const openLabels = slots.filter((s) => s.open).map((s) => s.label);
      const fits = prefs.length > 0 && getInferredMatch ? openLabels.some((l) => getInferredMatch(l, prefs).match) : false;
      return { club, index, vc, vcId: vc ? vcId : null, inVoice, humans: inVoice.length, slots, openSlots: openLabels.length, openLabels, fits, live: gameOn ? gameOn(guild.id, club.key) : false };
    });
  }

  // ---------- Live board ----------

  function lobbyField(l) {
    const spotOf = new Map(l.slots.filter((s) => !s.open && s.takenBy).map((s) => [s.takenBy, s.label]));
    const playing = l.inVoice.filter((id) => spotOf.has(id)).map((id) => `**${spotOf.get(id)}** <@${id}>`);
    const waiting = l.inVoice.filter((id) => !spotOf.has(id)).map((id) => `🪑 <@${id}>`);
    const lines = [...playing, ...waiting];
    const open = l.humans ? `Open: ${l.openLabels.slice(0, 8).join(', ') || 'none'}` : 'Empty: jump in and start one';
    return {
      name: `${l.humans ? (l.live ? '🎮' : '🟢') : '⚪'} ${l.club.name} · ${l.humans}/${FULL_XI}${l.live ? ' · in a game' : ''}`.slice(0, 256),
      value: [l.vcId ? `<#${l.vcId}>` : '⚠️ voice channel missing', ...lines.slice(0, 11), open].join('\n').slice(0, 1024),
      inline: true,
    };
  }

  async function board(guild) {
    const state = await getGuildState(guild.id);
    const hub = await hubOf(guild.id);
    const lobbies = await lobbiesOf(guild, state, hub);
    const playing = lobbies.reduce((n, l) => n + l.humans, 0);
    const active = lobbies.filter((l) => l.humans).length;
    const open = lobbies.filter((l) => l.humans).reduce((n, l) => n + l.openSlots, 0);
    const queue = liveQueue(queues.get(guild.id));
    const embed = new EmbedBuilder()
      .setTitle("🎮 Who's playing where")
      .setColor(GREEN)
      .setDescription(
        [
          playing ? `**${playing} playing in ${active} lobb${active === 1 ? 'y' : 'ies'}** · ${open} open spot${open === 1 ? '' : 's'}` : '**Nobody on right now.** Press **Play now** and the next few players start a game.',
          queue.size ? `⏳ ${queue.size} waiting to play` : null,
          'Anyone can play: press **Play now** and I\'ll put you in the lobby that needs your position. You get a spot on the board as soon as you join a lobby.',
        ].filter(Boolean).join('\n')
      )
      .setFooter({ text: '🎮 in a game · 🟢 open · ⚪ empty · 🪑 next in · Turn on Game pings to hear when games start' })
      .setTimestamp(new Date());
    for (const l of lobbies) embed.addFields(lobbyField(l));
    const first = lobbies[0]?.club?.key || 'club1';
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sh_play').setLabel('Play now').setEmoji('⚽').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sh_next').setLabel('Next game').setEmoji('🔁').setStyle(ButtonStyle.Primary),
      // Handled by casual.cjs (the ping role is shared by every lobby)
      new ButtonBuilder().setCustomId(`cw_ping:${first}`).setLabel('Game pings').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
      // Handled by index.cjs: the position tiers editor
      new ButtonBuilder().setCustomId('posboard_setprefs').setLabel('My positions').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sh_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row], allowedMentions: NO_PINGS };
  }

  async function refreshBoard(guild) {
    const hub = await hubOf(guild.id);
    if (!hub.on || !hub.board_channel_id || !hub.board_message_id) return;
    const ch = await guild.channels.fetch(hub.board_channel_id).catch(() => null);
    const msg = ch?.messages ? await ch.messages.fetch(hub.board_message_id).catch(() => null) : null;
    if (!msg) return;
    await msg.edit(await board(guild)).catch((err) => console.warn(`[hub] board edit failed: ${err.message}`));
  }

  // Refresh the board shortly, batching bursts of voice moves and spot changes into one edit
  function touch(guildId) {
    if (!hubs.get(guildId)?.on || timers.has(guildId)) return;
    timers.set(
      guildId,
      setTimeout(() => {
        timers.delete(guildId);
        const guild = client()?.guilds.cache.get(guildId);
        if (guild) refreshBoard(guild).catch(() => {});
      }, BOARD_SETTLE_MS)
    );
  }

  async function postBoard(channel) {
    const guild = channel.guild;
    const hub = { ...(await hubOf(guild.id)) };
    const msg = await channel.send(await board(guild));
    hub.board_channel_id = channel.id;
    hub.board_message_id = msg.id;
    await saveHub(guild.id, hub);
    return msg;
  }

  // ---------- Setup ----------

  async function setup(guild, count) {
    const me = guild.members.me;
    const missing = ['ManageChannels', 'ManageRoles'].filter((p) => !me?.permissions?.has(F[p]));
    if (missing.length) return { error: `I need **${missing.join('** and **')}** to set up the hub. Give my role those permissions and press again.` };
    const n = Math.min(MAX_LOBBIES, Math.max(2, Number(count) || DEFAULT_LOBBIES));
    const state = await getGuildState(guild.id);
    const hub = { ...(await hubOf(guild.id)) };
    const made = [];

    let category = hub.category_id ? await guild.channels.fetch(hub.category_id).catch(() => null) : null;
    if (!category) {
      category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory, reason: 'GafferBot Social Hub' });
      made.push(`the **${CATEGORY_NAME}** category`);
    }

    let boardCh = hub.board_channel_id ? await guild.channels.fetch(hub.board_channel_id).catch(() => null) : null;
    if (!boardCh) {
      // Everyone can read it; only the bot posts, so the board stays at the top
      boardCh = await guild.channels.create({
        name: BOARD_NAME,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: "Who's playing where, live. Press Play now to jump into a game.",
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [F.ViewChannel, F.ReadMessageHistory], deny: [F.SendMessages] },
          { id: me.id, allow: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.ReadMessageHistory] },
        ],
        reason: 'GafferBot Social Hub board',
      });
      made.push(`<#${boardCh.id}>`);
    }

    if (!state.clubVcLinks) state.clubVcLinks = {};
    const lobbies = [];
    for (const club of state.clubs.slice(0, n)) {
      if (!club.enabled) {
        club.enabled = true;
        state.boardState[club.key] = createBoard();
      }
      if (!state.boardState[club.key]?.slots) state.boardState[club.key] = createBoard();
      if (isDefaultName(club.name)) club.name = `Lobby ${lobbies.length + 1}`;
      let vc = state.clubVcLinks[club.key] ? await guild.channels.fetch(state.clubVcLinks[club.key]).catch(() => null) : null;
      if (!vc) {
        vc = await guild.channels.create({ name: club.name, type: ChannelType.GuildVoice, parent: category.id, reason: 'GafferBot Social Hub lobby' });
        made.push(`🔊 ${club.name}`);
      }
      state.clubVcLinks[club.key] = vc.id;
      lobbies.push(club.key);
    }
    await saveGuildSettings(guild.id, state);
    // Casual mode on every lobby: spots fill from voice, the bench rotates, and the ping role exists
    let note = '';
    for (const key of lobbies) {
      const club = state.clubs.find((c) => c.key === key);
      if (!club.casual?.on) note = (await casual.setMode(guild, club, true)) || note;
    }

    hub.on = true;
    hub.category_id = category.id;
    hub.lobbies = lobbies;
    hub.board_channel_id = boardCh.id;
    await saveHub(guild.id, hub);
    // A fresh board message each setup, so it sits at the bottom of the channel
    await postBoard(boardCh);
    return { made, lobbies: lobbies.length, boardCh, note };
  }

  // ---------- Play now ----------

  async function play(interaction) {
    const guild = interaction.guild;
    const hub = await hubOf(guild.id);
    if (!hub.on) return { content: '❌ This server has no Social Hub yet. A server admin can set one up in **/manager → Casual Play → Set Up Social Hub**.' };
    const state = await getGuildState(guild.id);
    const member = await guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const lobbies = await lobbiesOf(guild, state, hub, interaction.user.id);
    const here = lobbies.find((l) => l.inVoice.includes(interaction.user.id));
    if (here) {
      const spot = here.slots.find((s) => s.takenBy === interaction.user.id)?.label;
      return { content: `You're already in **${here.club.name}**${spot ? ` on **${spot}**` : ' and next in for a spot'}. Have a good one!` };
    }
    const best = pickLobby(lobbies);
    if (best && best.humans > 0) {
      const where = `**${best.club.name}**${best.fits ? ' has a spot in your position' : ` has ${best.openSlots} open spot${best.openSlots === 1 ? '' : 's'}`}`;
      // Already in voice somewhere? Move them straight in
      if (member?.voice?.channelId && best.vc && guild.members.me?.permissions?.has(F.MoveMembers)) {
        const moved = await member.voice.setChannel(best.vc, 'Social Hub: Play now').then(() => true).catch(() => false);
        if (moved) return { content: `⚽ ${where}. I moved you in; your spot shows on the board in a moment.` };
      }
      return { content: `⚽ ${where}: join <#${best.vcId}> and you get a spot as soon as you're in.` };
    }
    if (!best) return { content: '😮 Every lobby is full. Ask an admin to add lobbies (Set Up Social Hub with a bigger number), or wait for a spot: you get one when someone leaves.' };

    // Nobody on: queue up, and call a game once enough are waiting
    const queue = liveQueue(queues.get(guild.id));
    queue.set(interaction.user.id, Date.now());
    queues.set(guild.id, queue);
    const need = callAtOf(best.club);
    if (queue.size >= need) {
      queues.set(guild.id, new Map());
      const r = await casual.postCall(guild, best.club, { auto: true }).catch((err) => ({ error: err.message }));
      touch(guild.id);
      if (r?.error) return { content: `⏳ ${queue.size} want to play. Join <#${best.vcId}> to start a game. (I couldn't post the call: ${r.error})` };
      return { content: `🎉 That's ${queue.size} wanting a game: I've called it. Join <#${best.vcId}> to kick off.` };
    }
    touch(guild.id);
    return { content: `⏳ You're in the queue (${queue.size}/${need}). When ${need - queue.size} more want to play I'll ping **Up for a Game** and start it in <#${best.vcId}>. Or just jump in now; others see you on the board.` };
  }

  // ---------- Next game ----------

  function rotationLine(club, r) {
    const ins = r.in.map((p) => `<@${p.id}> (${p.position})`).join(', ');
    const outs = r.out.map((id) => `<@${id}>`).join(', ');
    return `🔁 **${club.name}: next game**\nIn: ${ins || 'nobody new'}\nSitting this one out: ${outs || 'nobody'}`;
  }

  async function nextGame(interaction) {
    const guild = interaction.guild;
    const hub = await hubOf(guild.id);
    const state = await getGuildState(guild.id);
    const vcId = interaction.member?.voice?.channelId;
    const club = lobbyClubs(state, hub).find((c) => state.clubVcLinks?.[c.key] === vcId);
    if (!club) return { content: '🔊 Join the lobby you\'re playing in first, then press **Next game**.' };
    const key = `${guild.id}:${club.key}`;
    const last = lastNext.get(key) || 0;
    if (Date.now() - last < NEXT_COOLDOWN_MS) return { content: `⏱️ ${club.name} rotated <t:${Math.floor(last / 1000)}:R>. One rotation per game, please.` };
    lastNext.set(key, Date.now());
    const r = await casual.rotate(guild, club, { gamesPlayed: 1 });
    touch(guild.id);
    if (!r || (!r.in.length && !r.out.length)) return { content: `🔁 Nobody is waiting in **${club.name}**, so everyone stays on. Good game!` };
    const vc = guild.channels.cache.get(vcId);
    // The lobby's voice chat hears it, without pinging anyone
    if (vc?.send) await vc.send({ content: rotationLine(club, r), allowedMentions: NO_PINGS }).catch(() => {});
    return { content: rotationLine(club, r) };
  }

  // ---------- Voice and members ----------

  function onVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild || oldState.channelId === newState.channelId) return;
    const hub = hubs.get(guild.id);
    if (hub === undefined) {
      // First event for this server since start: load its settings, then handle the next one
      hubOf(guild.id).catch(() => {});
      return;
    }
    if (!hub.on) return;
    // Joining a lobby takes you out of the Play now queue
    if (newState.channelId) queues.get(guild.id)?.delete(newState.id);
    touch(guild.id);
  }

  async function onMemberJoin(member) {
    if (member.user?.bot) return;
    const hub = await hubOf(member.guild.id);
    if (!hub.on || !hub.board_channel_id) return;
    await member
      .send(
        `👋 Welcome to **${member.guild.name}**! Anyone can play here, any time.\n` +
          `• Head to <#${hub.board_channel_id}> to see who's playing where, and press **Play now** to get in a game.\n` +
          '• Press **My positions** there so you get the spots you like.\n' +
          '• Press **Game pings** to hear when a game is starting.'
      )
      .catch(() => {});
  }

  // ---------- Interactions ----------

  async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand(false) || 'play';
    const guild = interaction.guild;
    if (sub === 'setup') {
      if (!isServerAdmin(interaction.member)) return interaction.reply({ content: '❌ Only server admins can set up the Social Hub (it makes channels and a role).', flags: 64 });
      await interaction.deferReply({ flags: 64 });
      const r = await setup(guild, interaction.options.getInteger('lobbies')).catch((err) => ({ error: err.message }));
      if (r.error) return interaction.editReply({ content: `❌ ${r.error}` });
      return interaction.editReply({
        content:
          `✅ Social Hub is live with **${r.lobbies} lobbies**. The board is in <#${r.boardCh.id}>.` +
          (r.made.length ? `\nMade: ${r.made.join(', ')}.` : '') +
          '\nEvery lobby is in casual mode: spots fill from voice and the bench rotates. To get stats, recaps and Smalls tags, link each lobby to the EA club it plays in: join the lobby, select it on the Spots Panel, then **/manager → Admin → Link EA Club**.' +
          (r.note ? `\n${r.note.trim()}` : ''),
      });
    }
    if (sub === 'board') {
      if (!isServerAdmin(interaction.member)) return interaction.reply({ content: '❌ Only server admins can move the board.', flags: 64 });
      const hub = await hubOf(guild.id);
      if (!hub.on) return interaction.reply({ content: '❌ Set up the Social Hub first.', flags: 64 });
      const ch = interaction.channel;
      if (!ch?.send) return interaction.reply({ content: '❌ I can\'t post here.', flags: 64 });
      await postBoard(ch);
      return interaction.reply({ content: '📌 Board posted. It keeps itself up to date.', flags: 64 });
    }
    if (sub === 'play') return interaction.reply({ ...(await play(interaction)), allowedMentions: NO_PINGS, flags: 64 });
    if (sub === 'next') return interaction.reply({ ...(await nextGame(interaction)), allowedMentions: NO_PINGS, flags: 64 });
    return interaction.reply({ content: 'Unknown Social Hub action.', flags: 64 });
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'hub') {
      await handleCommand(interaction);
      return true;
    }
    if (!interaction.isButton?.()) return false;
    const id = interaction.customId;
    if (id === 'sh_play') {
      await interaction.reply({ ...(await play(interaction)), allowedMentions: NO_PINGS, flags: 64 });
      touch(interaction.guildId);
      return true;
    }
    if (id === 'sh_next') {
      await interaction.reply({ ...(await nextGame(interaction)), allowedMentions: NO_PINGS, flags: 64 });
      return true;
    }
    if (id === 'sh_refresh') {
      await interaction.update(await board(interaction.guild));
      return true;
    }
    return false;
  }

  return { handleInteraction, onVoiceStateUpdate, onMemberJoin, touch, setup, board, play, nextGame, hubOf };
}

module.exports = { createSocialHub, HUB_COMMANDS, pickLobby, liveQueue, isDefaultName };
