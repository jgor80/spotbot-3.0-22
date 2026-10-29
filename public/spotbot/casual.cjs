// Casual Play: for clubs that play smalls, friendlies and BYOTs until they're ready for league.
//   Casual mode   one switch per club. The Manager Hub swaps Call Session for Who's On? and shows Smalls,
//                 Friendly and BYOT records; league-only buttons leave the menus when every club is
//                 casual; new events default to Friendly; short-handed friendlies are tagged Smalls
//                 (match-tags.cjs); and the club's spot board fills itself from voice.
//   Who's On?     anyone can call it: pings the opt-in "Up for a Game" role with a live card showing who
//                 is in voice and which spot they're on, plus I'm in / 10 min / Not tonight buttons. The
//                 bot calls it by itself when the club voice channel reaches N people.
//   Spot board    in casual mode everyone in the linked voice channel gets a spot (position preferences
//                 first, any open outfield spot otherwise), longest-waiting first. After each EA game,
//                 when more people are in voice than there are spots, the ones who played the most games
//                 in a row sit out and the waiting players come in.
// Settings and the live card live on the club (guild_settings.clubs[].casual), so no new tables.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { missingChannelPerms } = require('./perm-check.cjs');
const { clubAccent } = require('./club-colors.cjs');
const { DEFAULT_SMALLS_MAX, smallsMax } = require('./match-tags.cjs');

const GREEN = 0x2ecc71;
const ROLE_NAME = 'Up for a Game';
const FULL_XI = 11;
const DEFAULT_CALL_AT = 3;
const CARD_LIVE_MS = 6 * 60 * 60 * 1000;     // a call's card keeps updating this long
const MANUAL_COOLDOWN_MS = 20 * 60 * 1000;   // a new manual call within this just bumps the open one
const AUTO_COOLDOWN_MS = 3 * 60 * 60 * 1000; // the bot calls by itself at most this often
const VOICE_SETTLE_MS = 4000;                // wait for the spot board's own auto-assign first
const MAX_LIST = 10;

const CASUAL_COMMANDS = [
  {
    name: 'casual',
    description: 'Casual Play: Who\'s On? calls, game pings, casual mode and the self-filling spot board.',
    options: [
      { type: 1, name: 'call', description: 'Who\'s On? Ping everyone up for a game and post a live card of who is in voice.' },
      { type: 1, name: 'pings', description: 'Turn Who\'s On? pings on or off for yourself.' },
      { type: 1, name: 'settings', description: 'Casual mode, the ping role, auto calls, bench rotation and what counts as smalls.' },
      { type: 1, name: 'fill', description: 'Give everyone in the club voice channel a spot on the board now.' },
      { type: 1, name: 'rotate', description: 'Sit out whoever played most games in a row and bring in the players waiting.' },
    ],
  },
];

// ---------- Pure helpers ----------

const isCasual = (club) => !!club?.casual?.on;
const callAt = (club) => {
  const n = Number(club?.casual?.call_at);
  return Number.isFinite(n) && n >= 2 && n <= FULL_XI ? n : DEFAULT_CALL_AT;
};
const autoCallOn = (club) => club?.casual?.auto_call !== false;
const rotateOn = (club) => club?.casual?.rotate !== false;

// Short label for how many humans are playing
function squadLine(humans, club) {
  if (!humans) return 'Nobody in voice yet';
  if (humans >= FULL_XI) return `${humans} in voice: full XI`;
  const max = smallsMax({ casual: { on: true, ...(club?.casual || {}) } }) || DEFAULT_SMALLS_MAX;
  const ai = FULL_XI - humans;
  return humans <= max ? `Smalls: ${humans} player${humans === 1 ? '' : 's'}, AI fills the other ${ai}` : `${humans} players, AI fills ${ai}`;
}

// Who sits out next: the most games in a row first, ties broken by rng (so nobody always sits)
function pickRest(onBoard, streaks, count, rng = Math.random) {
  return onBoard
    .map((id) => ({ id, n: streaks?.[id] || 0, r: rng() }))
    .sort((a, b) => b.n - a.n || a.r - b.r)
    .slice(0, Math.max(0, count))
    .map((x) => x.id);
}

// Waiting players, longest wait first (new arrivals last, in the order given)
function waitOrder(ids, since) {
  const at = (id) => (since?.[id] ? new Date(since[id]).getTime() : Infinity);
  return ids.map((id, i) => ({ id, i, t: at(id) })).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.id);
}

// An open spot for someone without matching preferences: outfield first (attack end of the board),
// the keeper's spot only when nothing else is left
function fallbackSlot(slots) {
  for (let i = slots.length - 1; i >= 0; i--) if (slots[i].open && String(slots[i].label).toUpperCase() !== 'GK') return i;
  for (let i = slots.length - 1; i >= 0; i--) if (slots[i].open) return i;
  return -1;
}

// Bump the games-in-a-row count for players who just played, reset it for those who sat out
function nextStreaks(streaks, played, sat) {
  const out = {};
  for (const id of played) out[id] = (streaks?.[id] || 0) + 1;
  for (const id of sat) out[id] = 0;
  return out;
}

function createCasual(deps) {
  const { getGuildState, saveGuildSettings, canManageClub, autopilot, autoAssignPlayer, refreshClubPanels, handleSlotOpened, buildSpotEmbed } = deps;
  const client = () => deps.client();
  const timers = new Map();
  const lastCount = new Map();

  // ---------- State ----------

  function casualOf(club) {
    if (!club.casual) club.casual = {};
    return club.casual;
  }

  async function clubByKey(guildId, key) {
    const state = await getGuildState(guildId);
    return { state, club: (state?.clubs || []).find((c) => c.key === key && c.enabled !== false) || null };
  }

  function voiceOf(guild, state, club) {
    const vcId = state?.clubVcLinks?.[club.key];
    const vc = vcId ? guild.channels.cache.get(vcId) : null;
    const humans = vc?.members ? [...vc.members.values()].filter((m) => !m.user?.bot).map((m) => m.id) : [];
    return { vcId, vc, humans };
  }

  function boardOf(state, club) {
    const board = state.boardState?.[club.key];
    return board?.slots ? board : null;
  }

  // ---------- Spot board from voice ----------

  // Give the first players in line (as many as there are open spots) a spot: everyone's preferred
  // positions first, then any open spot for the rest, so a player without preferences can't take a
  // striker's spot before the striker is placed
  async function place(guildId, state, club, board, inLine) {
    const eligible = inLine.slice(0, board.slots.filter((s) => s.open).length);
    const placed = [];
    for (const id of eligible) {
      const r = await autoAssignPlayer(guildId, id, club.key, state).catch(() => ({ assigned: false }));
      if (r?.assigned) placed.push({ id, position: r.position });
    }
    for (const id of eligible) {
      if (placed.some((p) => p.id === id)) continue;
      const idx = fallbackSlot(board.slots);
      if (idx < 0) break;
      board.slots[idx].open = false;
      board.slots[idx].takenBy = id;
      placed.push({ id, position: board.slots[idx].label });
    }
    return placed;
  }

  // Everyone in the club voice channel gets a spot while one is open, longest-waiting first
  async function fillFromVoice(guild, club, { refresh = true } = {}) {
    const state = await getGuildState(guild.id);
    const board = boardOf(state, club);
    const { vcId, humans } = voiceOf(guild, state, club);
    if (!board || !vcId) return { placed: [], waiting: humans, humans };
    const c = casualOf(club);
    const onBoard = new Set(board.slots.filter((s) => !s.open && s.takenBy).map((s) => s.takenBy));
    const placed = await place(guild.id, state, club, board, waitOrder(humans.filter((h) => !onBoard.has(h)), c.waiting_since));
    const nowOn = new Set(board.slots.filter((s) => !s.open && s.takenBy).map((s) => s.takenBy));
    const waiting = humans.filter((h) => !nowOn.has(h));
    const since = {};
    const now = new Date().toISOString();
    for (const id of waiting) since[id] = c.waiting_since?.[id] || now;
    c.waiting_since = since;
    await saveGuildSettings(guild.id, state);
    if (refresh && placed.length) await refreshClubPanels(guild.id, club.key).catch(() => {});
    return { placed, waiting, humans };
  }

  // After a game: when people are waiting, the longest streaks sit out and the waiting players come in
  async function rotate(guild, club, { gamesPlayed = 1, force = false } = {}) {
    const state = await getGuildState(guild.id);
    const board = boardOf(state, club);
    const { humans } = voiceOf(guild, state, club);
    if (!board || !humans.length) return null;
    const c = casualOf(club);
    if (!c.streaks) c.streaks = {};
    const inVoice = new Set(humans);
    const playing = board.slots.filter((s) => !s.open && inVoice.has(s.takenBy)).map((s) => s.takenBy);
    const waiting = waitOrder(humans.filter((h) => !playing.includes(h)), c.waiting_since);
    if (!force) {
      let streaks = c.streaks || {};
      for (let g = 0; g < Math.max(1, gamesPlayed); g++) streaks = nextStreaks(streaks, playing, waiting);
      c.streaks = streaks;
    }
    if (!waiting.length) {
      await saveGuildSettings(guild.id, state);
      return { in: [], out: [], waiting: [] };
    }
    const rest = pickRest(playing, c.streaks, Math.min(waiting.length, playing.length));
    const freed = [];
    board.slots.forEach((s, idx) => {
      if (!s.open && rest.includes(s.takenBy)) {
        s.open = true;
        s.takenBy = null;
        freed.push(idx);
      }
    });
    const came = await place(guild.id, state, club, board, waiting);
    for (const idx of freed) if (board.slots[idx].open) handleSlotOpened(guild.id, club.key, idx).catch(() => {});
    const now = new Date().toISOString();
    const since = {};
    const nowOn = new Set(board.slots.filter((s) => !s.open && s.takenBy).map((s) => s.takenBy));
    for (const id of humans) if (!nowOn.has(id)) since[id] = rest.includes(id) ? now : c.waiting_since?.[id] || now;
    c.waiting_since = since;
    for (const id of rest) c.streaks[id] = 0;
    await saveGuildSettings(guild.id, state);
    await refreshClubPanels(guild.id, club.key).catch(() => {});
    return { in: came, out: rest.filter((id) => !nowOn.has(id)), waiting: humans.filter((h) => !nowOn.has(h)) };
  }

  function rotationText(club, r) {
    const ins = r.in.map((p) => `<@${p.id}> (${p.position})`).join(', ');
    const outs = r.out.map((id) => `<@${id}>`).join(', ');
    return `🔁 **${club.name}: next game**\nIn: ${ins || 'nobody new'}\nSitting this one out: ${outs || 'nobody'}\nEveryone in voice gets a turn; the longest run of games sits out first.`;
  }

  // ---------- Who's On? card ----------

  async function postChannelFor(guild, club) {
    const id = club.casual?.channel_id;
    if (id) {
      const ch = await guild.channels.fetch(id).catch(() => null);
      if (ch?.send && !missingChannelPerms(ch, guild.members.me).length) return ch;
    }
    return autopilot?.postChannel ? autopilot.postChannel(guild.id, club) : null;
  }

  function cardFor(guild, state, club) {
    const c = club.casual || {};
    const call = c.call || {};
    const { vcId, humans } = voiceOf(guild, state, club);
    const board = boardOf(state, club);
    const spotOf = new Map((board?.slots || []).filter((s) => !s.open && s.takenBy).map((s) => [s.takenBy, s.label]));
    const playing = humans.filter((h) => spotOf.has(h));
    const waiting = humans.filter((h) => !spotOf.has(h));
    const list = (ids, fmt) => {
      const shown = ids.slice(0, MAX_LIST).map(fmt);
      if (ids.length > MAX_LIST) shown.push(`…and ${ids.length - MAX_LIST} more`);
      return shown.join('\n');
    };
    const coming = [...(call.in || []), ...(call.soon || [])].filter((id) => !humans.includes(id));
    const opener = call.auto
      ? `**${humans.length} in voice: games are on.**`
      : call.by
        ? `<@${call.by}> is on and looking for a game.`
        : 'Who is up for a game?';
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Who's On? ${club.name}`)
      .setColor(clubAccent(club, null, GREEN))
      .setDescription(`${opener}\n${vcId ? `Jump in <#${vcId}>: you get a spot on the board as soon as you join.` : 'No voice channel is linked to this club yet, so spots fill by hand.'}`)
      .addFields({
        name: `In voice (${humans.length})`,
        value: humans.length ? list([...playing, ...waiting], (id) => (spotOf.has(id) ? `**${spotOf.get(id)}** <@${id}>` : `🪑 <@${id}> (next in)`)) : 'Nobody yet. Be the first!',
      })
      .setFooter({ text: `${squadLine(humans.length, club)} • Press "Game pings" to get these calls` })
      .setTimestamp(new Date());
    if (coming.length) {
      embed.addFields({ name: 'On the way', value: list(coming, (id) => `${(call.soon || []).includes(id) ? '⏱️' : '✅'} <@${id}>`) });
    }
    const outs = (call.out || []).filter((id) => !humans.includes(id));
    if (outs.length) embed.addFields({ name: 'Not tonight', value: list(outs, (id) => `<@${id}>`) });
    const k = club.key;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cw_in:${k}`).setLabel("I'm in").setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cw_soon:${k}`).setLabel('10 min').setEmoji('⏱️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cw_out:${k}`).setLabel('Not tonight').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cw_ping:${k}`).setLabel('Game pings').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cw_spots:${k}`).setLabel('Spot board').setEmoji('📋').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const liveCall = (club) => {
    const call = club.casual?.call;
    return call?.message_id && Date.now() - new Date(call.at).getTime() < CARD_LIVE_MS ? call : null;
  };

  async function refreshCard(guild, club) {
    const call = liveCall(club);
    if (!call) return;
    const state = await getGuildState(guild.id);
    const ch = await guild.channels.fetch(call.channel_id).catch(() => null);
    const msg = ch?.messages ? await ch.messages.fetch(call.message_id).catch(() => null) : null;
    if (!msg) return;
    await msg.edit(cardFor(guild, state, club)).catch(() => {});
  }

  // Ping the role and post the card. Returns { message } or { error }.
  async function postCall(guild, club, { by = null, auto = false } = {}) {
    const state = await getGuildState(guild.id);
    const ch = await postChannelFor(guild, club);
    if (!ch) return { error: `I have no channel I can post in for **${club.name}**. Pick one in **/manager → Casual Play → Casual Settings**.` };
    const c = casualOf(club);
    if (isCasual(club)) await fillFromVoice(guild, club).catch(() => {});
    c.call = { channel_id: ch.id, message_id: null, at: new Date().toISOString(), by, auto, in: by ? [by] : [], soon: [], out: [] };
    const role = c.role_id ? guild.roles.cache.get(c.role_id) : null;
    const msg = await ch.send({
      content: role ? `<@&${role.id}>` : undefined,
      allowedMentions: { roles: role ? [role.id] : [] },
      ...cardFor(guild, state, club),
    });
    c.call.message_id = msg.id;
    await saveGuildSettings(guild.id, state);
    return { message: msg };
  }

  // ---------- Ping role ----------

  async function ensureRole(guild, club) {
    const c = casualOf(club);
    let role = c.role_id ? guild.roles.cache.get(c.role_id) : null;
    if (!role) role = guild.roles.cache.find((r) => r.name === ROLE_NAME) || null;
    if (!role && guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
      role = await guild.roles.create({ name: ROLE_NAME, mentionable: true, reason: 'GafferBot Casual Play: Who\'s On? pings' }).catch(() => null);
    }
    if (role) c.role_id = role.id;
    return role;
  }

  async function togglePings(interaction, club) {
    const guild = interaction.guild;
    const state = await getGuildState(guild.id);
    const role = await ensureRole(guild, club);
    if (!role) return `❌ There's no **${ROLE_NAME}** role and I can't make one. Ask an admin to give me **Manage Roles**.`;
    await saveGuildSettings(guild.id, state);
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.roles) return '❌ I could not find you on this server.';
    const has = member.roles.cache.has(role.id);
    const done = await (has ? member.roles.remove(role) : member.roles.add(role)).then(() => true).catch(() => false);
    if (!done) return `❌ I can't change **${role.name}**. Move my role above it in Server Settings → Roles.`;
    return has ? `🔕 Game pings off. You won't be pinged by **Who's On?** calls.` : `🔔 Game pings on. You'll be pinged when someone calls **Who's On?** for ${club.name}.`;
  }

  // ---------- Settings panel ----------

  function settingsPanel(guild, club) {
    const c = club.casual || {};
    const on = isCasual(club);
    const role = c.role_id ? guild?.roles?.cache?.get(c.role_id) : null;
    const k = club.key;
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Casual Play: ${club.name}`)
      .setColor(on ? GREEN : 0x95a5a6)
      .setDescription(
        'For clubs that play smalls, friendlies and BYOTs until they\'re ready for league. Casual mode puts **Who\'s On?** on the Manager Hub, ' +
          'fills the spot board from voice, sits out the longest runs when people are waiting, tags short-handed friendlies **Smalls** and makes new events friendlies.'
      )
      .addFields(
        { name: 'Casual mode', value: on ? '✅ On' : '⛔ Off', inline: true },
        { name: 'Ping role', value: role ? `<@&${role.id}>` : 'Made when you turn casual mode on', inline: true },
        { name: 'Calls post in', value: c.channel_id ? `<#${c.channel_id}>` : 'The recap channel', inline: true },
        { name: 'Auto call', value: autoCallOn(club) ? `✅ When ${callAt(club)} are in voice (at most every 3 hours)` : '⛔ Off', inline: true },
        { name: 'Bench rotation', value: rotateOn(club) ? '✅ After every game' : '⛔ Off', inline: true },
        { name: 'Smalls', value: `Friendlies with ${smallsMax({ casual: { ...c, on: true } })} or fewer players`, inline: true }
      );
    const btn = (id, label, emoji, onState) =>
      new ButtonBuilder().setCustomId(`${id}:${k}`).setLabel(label).setEmoji(emoji).setStyle(onState ? ButtonStyle.Success : ButtonStyle.Secondary);
    const rows = [
      new ActionRowBuilder().addComponents(
        btn('cw_mode', on ? 'Casual mode on' : 'Turn casual mode on', '🎮', on),
        btn('cw_auto', 'Auto call', '📣', autoCallOn(club)),
        btn('cw_rot', 'Bench rotation', '🔁', rotateOn(club)),
        new ButtonBuilder().setCustomId(`cw_call:${k}`).setLabel("Who's On? now").setEmoji('🙋').setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`cw_smax:${k}`)
          .setPlaceholder('What counts as smalls')
          .addOptions([3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ label: `Smalls: ${n} or fewer players`, value: String(n), default: n === smallsMax({ casual: { ...c, on: true } }) })))
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`cw_at:${k}`)
          .setPlaceholder('Auto call when this many are in voice')
          .addOptions([2, 3, 4, 5, 6, 8].map((n) => ({ label: `Auto call at ${n} in voice`, value: String(n), default: n === callAt(club) })))
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(`cw_chan:${k}`).setPlaceholder('Where Who\'s On? calls post').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
    ];
    return { embeds: [embed], components: rows };
  }

  async function setMode(guild, club, on) {
    const state = await getGuildState(guild.id);
    const c = casualOf(club);
    c.on = on;
    let note = '';
    if (on) {
      // The spot board fills itself: auto-assign on for this club, then place whoever is already in voice
      if (!state.autoAssign) state.autoAssign = {};
      state.autoAssign[club.key] = true;
      const role = await ensureRole(guild, club);
      if (!role) note = `\n⚠️ I couldn't make the **${ROLE_NAME}** role: give me **Manage Roles** so players can opt in to pings.`;
      if (!state.clubVcLinks?.[club.key]) note += '\n⚠️ Link a voice channel to this club (Spots Panel → Club Tools) so spots fill from voice.';
    }
    await saveGuildSettings(guild.id, state);
    if (on) await fillFromVoice(guild, club).catch(() => {});
    else await refreshClubPanels(guild.id, club.key).catch(() => {});
    return note;
  }

  // ---------- Voice ----------

  // Called on every voice change; settles for a moment so the spot board's own auto-assign runs first
  function onVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild || oldState.channelId === newState.channelId) return;
    if (newState.member?.user?.bot) return;
    const key = guild.id;
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        settle(guild, [oldState.channelId, newState.channelId]).catch((err) => console.warn(`[casual] voice update failed: ${err.message}`));
      }, VOICE_SETTLE_MS)
    );
  }

  async function settle(guild, channelIds) {
    const state = await getGuildState(guild.id);
    for (const club of activeClubs(state || {})) {
      if (!isCasual(club)) continue;
      const vcId = state.clubVcLinks?.[club.key];
      if (!vcId) continue;
      const touched = channelIds.includes(vcId);
      const { humans } = voiceOf(guild, state, club);
      const countKey = `${guild.id}:${club.key}`;
      const before = lastCount.get(countKey) ?? 0;
      lastCount.set(countKey, humans.length);
      if (!touched) continue;
      await fillFromVoice(guild, club);
      const last = club.casual?.call?.at ? new Date(club.casual.call.at).getTime() : 0;
      if (autoCallOn(club) && humans.length >= callAt(club) && before < callAt(club) && Date.now() - last > AUTO_COOLDOWN_MS) {
        await postCall(guild, club, { auto: true });
      } else {
        await refreshCard(guild, club);
      }
    }
  }

  // ---------- After each game ----------

  async function onNewMatches(guildId, club, recent) {
    if (!isCasual(club) || !rotateOn(club) || !recent?.length) return;
    const guild = client()?.guilds.cache.get(guildId);
    if (!guild) return;
    const { club: live } = await clubByKey(guildId, club.key);
    if (!live) return;
    const r = await rotate(guild, live, { gamesPlayed: recent.length });
    if (!r || (!r.in.length && !r.out.length)) return;
    const ch = await postChannelFor(guild, live);
    if (ch) await ch.send({ content: rotationText(live, r), allowedMentions: { users: [...r.in.map((p) => p.id), ...r.out] } }).catch(() => {});
    await refreshCard(guild, live);
  }

  // ---------- Interactions ----------

  async function leaderOrDeny(interaction, club) {
    if (await canManageClub(interaction.member, club)) return true;
    await interaction.reply({ content: `❌ Only ${club.name}'s leaders can change Casual Play.`, flags: 64 });
    return false;
  }

  async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand(false) || 'call';
    const guild = interaction.guild;
    const state = await getGuildState(guild.id);
    const club = resolveClub(state, interaction.member);
    if (!club) return interaction.reply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.', flags: 64 });

    if (sub === 'pings') return interaction.reply({ content: await togglePings(interaction, club), flags: 64 });

    if (sub === 'call') {
      // On a casual club anyone can call; otherwise it's for leaders
      if (!isCasual(club) && !(await canManageClub(interaction.member, club))) {
        return interaction.reply({ content: `❌ **Who's On?** is for casual clubs. ${club.name}'s leaders can turn casual mode on in **/manager → Casual Play → Casual Settings**.`, flags: 64 });
      }
      return callFromButton(interaction, club);
    }

    if (!(await leaderOrDeny(interaction, club))) return;
    if (sub === 'settings') return interaction.reply({ ...settingsPanel(guild, club), flags: 64 });
    if (sub === 'fill') {
      if (!state.clubVcLinks?.[club.key]) return interaction.reply({ content: `❌ ${club.name} has no linked voice channel. Link one in the Spots Panel (Club Tools) first.`, flags: 64 });
      const r = await fillFromVoice(guild, club);
      await refreshCard(guild, club);
      const placed = r.placed.map((p) => `**${p.position}** <@${p.id}>`).join(', ');
      return interaction.reply({
        content: `📋 ${placed ? `Placed ${placed}.` : 'Everyone in voice already has a spot.'}${r.waiting.length ? ` Waiting for a spot: ${r.waiting.map((id) => `<@${id}>`).join(', ')}.` : ''}`,
        allowedMentions: { users: [] },
        flags: 64,
      });
    }
    if (sub === 'rotate') {
      const r = await rotate(guild, club, { force: true });
      if (!r || (!r.in.length && !r.out.length)) return interaction.reply({ content: '🔁 Nobody is waiting for a spot, so nobody needs to sit out.', flags: 64 });
      await refreshCard(guild, club);
      return interaction.reply({ content: rotationText(club, r), allowedMentions: { users: [] } });
    }
    return interaction.reply({ content: 'Unknown Casual Play action.', flags: 64 });
  }

  async function callFromButton(interaction, club) {
    const guild = interaction.guild;
    const call = liveCall(club);
    if (call && Date.now() - new Date(call.at).getTime() < MANUAL_COOLDOWN_MS) {
      const c = casualOf(club);
      if (!c.call.in.includes(interaction.user.id)) c.call.in.push(interaction.user.id);
      const state = await getGuildState(guild.id);
      await saveGuildSettings(guild.id, state);
      await refreshCard(guild, club);
      return interaction.reply({ content: `🙋 There's already a call from <t:${Math.floor(new Date(call.at).getTime() / 1000)}:R>: https://discord.com/channels/${guild.id}/${call.channel_id}/${call.message_id}\nYou're on it as **I'm in**.`, flags: 64 });
    }
    const r = await postCall(guild, club, { by: interaction.user.id });
    if (r.error) return interaction.reply({ content: `❌ ${r.error}`, flags: 64 });
    return interaction.reply({ content: `📣 Called in ${r.message.url}\nWant to be pinged when someone else calls? Press **Game pings** on the card.`, flags: 64 });
  }

  async function handleComponent(interaction) {
    const [action, key] = interaction.customId.split(':');
    const guild = interaction.guild;
    const { state, club } = await clubByKey(guild.id, key);
    if (!club) return interaction.reply({ content: 'That club no longer exists.', flags: 64 });
    const c = casualOf(club);
    const me = interaction.user.id;

    if (['cw_in', 'cw_soon', 'cw_out'].includes(action)) {
      if (!liveCall(club)) return interaction.reply({ content: 'This call has ended. Start a new one with **/me → Who\'s On?**', flags: 64 });
      const field = { cw_in: 'in', cw_soon: 'soon', cw_out: 'out' }[action];
      for (const f of ['in', 'soon', 'out']) c.call[f] = (c.call[f] || []).filter((id) => id !== me);
      c.call[field].push(me);
      await saveGuildSettings(guild.id, state);
      return interaction.update(cardFor(guild, state, club));
    }
    if (action === 'cw_ping') return interaction.reply({ content: await togglePings(interaction, club), flags: 64 });
    if (action === 'cw_spots') {
      if (!buildSpotEmbed) return interaction.reply({ content: 'The spot board is not available.', flags: 64 });
      return interaction.reply({ embeds: [buildSpotEmbed(guild.id, club.key, state)], flags: 64 });
    }
    if (action === 'cw_call') return callFromButton(interaction, club);

    if (!(await leaderOrDeny(interaction, club))) return;
    if (action === 'cw_set') return interaction.reply({ ...settingsPanel(guild, club), flags: 64 });
    if (action === 'cw_mode') {
      const note = await setMode(guild, club, !isCasual(club));
      await interaction.update(settingsPanel(guild, club));
      if (note) await interaction.followUp({ content: note.trim(), flags: 64 }).catch(() => {});
      return;
    }
    if (action === 'cw_auto') c.auto_call = !autoCallOn(club);
    else if (action === 'cw_rot') c.rotate = !rotateOn(club);
    else if (action === 'cw_smax') c.smalls_max = Number(interaction.values[0]);
    else if (action === 'cw_at') c.call_at = Number(interaction.values[0]);
    else if (action === 'cw_chan') {
      const ch = guild.channels.cache.get(interaction.values[0]);
      const missing = ch ? missingChannelPerms(ch, guild.members.me) : ['View Channel'];
      if (missing.length) return interaction.reply({ content: `❌ I can't post in <#${interaction.values[0]}>: missing ${missing.join(', ')}.`, flags: 64 });
      c.channel_id = ch.id;
    } else return interaction.reply({ content: 'Unknown Casual Play button.', flags: 64 });
    await saveGuildSettings(guild.id, state);
    return interaction.update(settingsPanel(guild, club));
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'casual') {
      await handleCommand(interaction);
      return true;
    }
    const id = interaction.customId || '';
    if ((interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isChannelSelectMenu?.()) && id.startsWith('cw_')) {
      await handleComponent(interaction);
      return true;
    }
    return false;
  }

  if (autopilot?.onNewMatches) autopilot.onNewMatches((guildId, club, recent) => onNewMatches(guildId, club, recent));

  return { handleInteraction, onVoiceStateUpdate, fillFromVoice, rotate, postCall, settingsPanel, cardFor, setMode };
}

// Every active club on the server is casual (league-only menu buttons are hidden then)
function allCasual(state) {
  const clubs = activeClubs(state || {});
  return clubs.length > 0 && clubs.every(isCasual);
}

module.exports = { createCasual, CASUAL_COMMANDS, isCasual, allCasual, pickRest, waitOrder, fallbackSlot, nextStreaks, squadLine, ROLE_NAME };
