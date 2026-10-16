// Match night: check-ins before kick-off, live squad status (who is here, late, out, missing),
// sub requests that the first taker fills (swapping them into the lineup), and reliability
// scores built from real check-ins once the event closes.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { missingChannelPerms } = require('./perm-check.cjs');
const T = require('./event-time.cjs');
const { typeInfo } = require('./events.cjs');
const { createProgramme } = require('./matchday-programme.cjs');

const CHECKIN_LEAD_MS = 30 * 60 * 1000;
const CHECKINS = {
  in: { label: "I'm here", emoji: '🟢', style: ButtonStyle.Success, title: 'Checked in' },
  late: { label: 'Running late', emoji: '🕒', style: ButtonStyle.Secondary, title: 'Running late' },
  out: { label: "Can't make it", emoji: '🔴', style: ButtonStyle.Danger, title: 'Dropped out' },
};
const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const RELIABILITY_WINDOW = 20;
const RELIABILITY_MIN_EVENTS = 3;

const MATCHNIGHT_COMMANDS = [
  {
    name: 'checkin',
    description: 'Open check-in now for the next event (managers), or check yourself in.',
  },
  {
    name: 'sub',
    description: 'Ask the server for a sub for the next event.',
    options: [
      { name: 'position', description: 'Position to cover.', type: 3, required: false, choices: POSITIONS.map((p) => ({ name: p, value: p })) },
      { name: 'replacing', description: 'Who they replace (swapped out of the lineup).', type: 6, required: false },
      { name: 'note', description: 'e.g. "kick-off in 10, lobby code in VC".', type: 3, required: false },
    ],
  },
  {
    name: 'reliability',
    description: 'Show-up rates from check-ins: who turns up when they say they will.',
    options: [{ name: 'player', description: 'One player (defaults to the whole club).', type: 6, required: false }],
  },
];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function createMatchNight(deps) {
  const { supabase, events, isManager, callEdgeFunction, getGuildState } = deps;
  const canManageClub = deps.canManageClub || (async (member) => isManager(member));
  const positionTiers = deps.positionTiers || null;
  const programme = createProgramme({ supabase, typeInfo });

  // ---------- Data ----------

  // The lineup for this event: one saved against it, else the club's latest lineup from the last day
  async function lineupFor(event) {
    const { data: linked } = await supabase
      .from('lineups')
      .select('id, name, formation, team_id, created_at')
      .eq('event_id', event.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let lineup = linked;
    if (!lineup) {
      const since = new Date(new Date(event.scheduled_at).getTime() - 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('lineups')
        .select('id, name, formation, team_id, created_at')
        .eq('guild_id', event.guild_id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
      if (event.team_id) query = query.eq('team_id', event.team_id);
      const { data } = await query.maybeSingle();
      lineup = data;
    }
    if (!lineup) return null;
    const { data: slots } = await supabase
      .from('lineup_slots')
      .select('id, discord_user_id, position, slot_index, is_substitute')
      .eq('lineup_id', lineup.id)
      .order('slot_index');
    return { ...lineup, slots: slots || [] };
  }

  async function loadCheckins(eventId) {
    const { data } = await supabase.from('event_checkins').select('discord_user_id, status, checked_in_at').eq('event_id', eventId).order('checked_in_at');
    return data || [];
  }

  // Who we expect tonight: the starting XI when there is a lineup, else everyone who said yes or maybe
  async function expectedTonight(event) {
    const lineup = await lineupFor(event);
    if (lineup) {
      const starters = lineup.slots.filter((s) => !s.is_substitute && /^\d{17,19}$/.test(s.discord_user_id));
      return { lineup, ids: starters.map((s) => s.discord_user_id), positionOf: new Map(starters.map((s) => [s.discord_user_id, s.position])) };
    }
    const responses = await events.loadResponses(event.id);
    const ids = responses.filter((r) => r.response === 'yes' || r.response === 'maybe').map((r) => r.discord_user_id);
    return { lineup: null, ids, positionOf: new Map(responses.filter((r) => r.position).map((r) => [r.discord_user_id, r.position.split(',')[0]])) };
  }

  // ---------- Check-in post ----------

  async function buildCheckin(event) {
    const { lineup, ids, positionOf } = await expectedTonight(event);
    const checkins = await loadCheckins(event.id);
    const byUser = new Map(checkins.map((c) => [c.discord_user_id, c.status]));
    const kickoff = T.unix(event.scheduled_at);
    const tag = (id) => `<@${id}>${positionOf.get(id) ? ` ${positionOf.get(id)}` : ''}`;

    const embed = new EmbedBuilder()
      .setTitle(`🟢 Check-in: ${event.title}`.slice(0, 256))
      .setColor(0x57f287)
      .setDescription(
        event.closed
          ? 'Check-in closed.'
          : `Kick-off <t:${kickoff}:t> (<t:${kickoff}:R>). Tap **I'm here** when you're on and ready.` +
              (lineup ? `\nLineup: **${lineup.name || lineup.formation}**` : '')
      );

    for (const [key, c] of Object.entries(CHECKINS)) {
      const list = checkins.filter((x) => x.status === key).map((x) => x.discord_user_id);
      embed.addFields({ name: `${c.emoji} ${c.title} (${list.length})`, value: truncate(list.map(tag).join('\n') || '–'), inline: true });
    }
    const missing = ids.filter((id) => !byUser.has(id));
    if (missing.length) embed.addFields({ name: `❔ Not checked in yet (${missing.length})`, value: truncate(missing.map(tag).join(' ')) });

    const { data: openSubs } = await supabase.from('sub_requests').select('position, replacing_discord_id, filled_by_discord_id, status').eq('event_id', event.id).neq('status', 'cancelled');
    if (openSubs?.length) {
      embed.addFields({
        name: '🆘 Subs',
        value: truncate(
          openSubs
            .map((s) => `${s.status === 'filled' ? '✅' : '⏳'} ${s.position || 'Any'}${s.replacing_discord_id ? ` for <@${s.replacing_discord_id}>` : ''}${s.filled_by_discord_id ? `: <@${s.filled_by_discord_id}>` : ''}`)
            .join('\n')
        ),
      });
    }

    const ready = checkins.filter((c) => c.status === 'in').length;
    embed.setFooter({ text: `${ready} ready${ids.length ? ` of ${ids.length} expected` : ''}` });

    const components = event.closed
      ? []
      : [
          new ActionRowBuilder().addComponents(
            ...Object.entries(CHECKINS).map(([key, c]) => new ButtonBuilder().setCustomId(`ck:${key}:${event.id}`).setLabel(c.label).setEmoji(c.emoji).setStyle(c.style)),
            new ButtonBuilder().setCustomId(`sub_new:${event.id}`).setLabel('Request sub').setEmoji('🆘').setStyle(ButtonStyle.Primary)
          ),
        ];
    return { embeds: [embed], components };
  }

  async function checkinMessage(event) {
    if (!event.checkin_message_id) return null;
    const client = events.getClient();
    const channel = await client.channels.fetch(event.channel_id).catch(() => null);
    return channel?.messages?.fetch(event.checkin_message_id).catch(() => null) || null;
  }

  async function refreshCheckin(event) {
    const message = await checkinMessage(event);
    if (message) await message.edit(await buildCheckin(event)).catch(() => {});
  }

  async function openCheckin(event) {
    const client = events.getClient();
    const channel = await client.channels.fetch(event.channel_id).catch(() => null);
    if (!channel?.send) return null;
    if (missingChannelPerms(channel, channel.guild.members.me).length) return null;
    const { ids, lineup } = await expectedTonight(event);
    const board = await events.fetchBoardMessage(event);
    // Matchday Programme goes up once, just before check-in opens
    const prog = await programme.build(event, lineup).catch((err) => console.warn(`[matchnight] programme: ${err.message}`));
    if (prog) await (board ? board.reply({ embeds: [prog], allowedMentions: { parse: [] } }) : channel.send({ embeds: [prog], allowedMentions: { parse: [] } })).catch(() => {});
    const payload = {
      content: ids.length ? `🟢 Check-in is open for **${event.title}**: ${ids.map((id) => `<@${id}>`).join(' ')}` : `🟢 Check-in is open for **${event.title}**.`,
      ...(await buildCheckin(event)),
      allowedMentions: { users: ids.slice(0, 100) },
    };
    const message = board ? await board.reply(payload) : await channel.send(payload);
    const openedAt = new Date().toISOString();
    await supabase.from('availability_events').update({ checkin_message_id: message.id, checkin_opened_at: openedAt }).eq('id', event.id);
    return { ...event, checkin_message_id: message.id, checkin_opened_at: openedAt };
  }

  async function handleCheckinButton(interaction, status, eventId) {
    const event = await events.loadEvent(eventId);
    if (!event || event.closed) return interaction.reply({ content: '❌ Check-in is closed.', flags: 64 });
    await interaction.deferUpdate();
    await supabase
      .from('event_checkins')
      .upsert({ event_id: event.id, discord_user_id: interaction.user.id, status, checked_in_at: new Date().toISOString() }, { onConflict: 'event_id,discord_user_id' });
    await interaction.editReply(await buildCheckin(event));

    if (status === 'out') {
      // Dropping out of the starting XI asks the server for cover straight away
      const { lineup, positionOf } = await expectedTonight(event);
      if (lineup && positionOf.has(interaction.user.id)) {
        const { data: existing } = await supabase
          .from('sub_requests')
          .select('id')
          .eq('event_id', event.id)
          .eq('replacing_discord_id', interaction.user.id)
          .neq('status', 'cancelled')
          .maybeSingle();
        if (!existing) {
          await postSubRequest(interaction.channel, event, {
            position: positionOf.get(interaction.user.id),
            replacing: interaction.user.id,
            requestedBy: interaction.user.id,
            lineupId: lineup.id,
          });
          await interaction.followUp({ content: `🆘 Thanks for the heads-up. I've asked the server for a ${positionOf.get(interaction.user.id)} to cover you.`, flags: 64 });
          await interaction.editReply(await buildCheckin(event));
        }
      }
    }
  }

  // ---------- Subs ----------

  // Players worth pinging for a sub: the bench, anyone who said maybe, and players who play the
  // position (comp position first, then those who play it well, then emergency cover, then a
  // /positionpanel role or a saved preference). Never starters, anyone who dropped out or said no,
  // and at most 25 so a sub call is never a mass ping. `cover` gets the tier groups when asked.
  async function subCandidates(event, lineup, position, cover = null) {
    const responses = await events.loadResponses(event.id);
    const checkins = await loadCheckins(event.id);
    const skip = new Set([
      ...checkins.filter((c) => c.status === 'out').map((c) => c.discord_user_id),
      ...responses.filter((r) => r.response === 'no').map((r) => r.discord_user_id),
      ...(lineup?.slots || []).filter((s) => !s.is_substitute).map((s) => s.discord_user_id),
    ]);
    const ids = [
      ...(lineup?.slots || []).filter((s) => s.is_substitute).map((s) => s.discord_user_id),
      ...responses.filter((r) => r.response === 'yes' || r.response === 'maybe').map((r) => r.discord_user_id),
    ];
    if (position) {
      const guild = events.getClient()?.guilds.cache.get(event.guild_id);
      let emergencyIds = [];
      if (positionTiers) {
        const groups = await positionTiers.covering(event.guild_id, position).catch(() => null);
        if (groups) {
          const inServer = (id) => !guild || guild.members.cache.has(id);
          for (const tier of ['primary', 'secondary', 'emergency']) groups[tier] = groups[tier].filter((id) => inServer(id) && !skip.has(id));
          if (cover) Object.assign(cover, groups);
          ids.push(...groups.primary, ...groups.secondary);
          // Emergency cover goes after everyone who actually plays the position
          emergencyIds = groups.emergency;
        }
      }
      const role = guild?.roles.cache.find((r) => r.name.toUpperCase() === position);
      if (role) ids.push(...role.members.filter((m) => !m.user.bot).map((m) => m.id));
      const { data: prefs } = await supabase.from('position_preferences').select('user_id, preferences').eq('guild_id', event.guild_id).contains('preferences', [position]);
      // Keep it to players who list it in their top three, and who are still on the server
      ids.push(...(prefs || []).filter((p) => (p.preferences || []).slice(0, 3).includes(position) && (!guild || guild.members.cache.has(p.user_id))).map((p) => p.user_id));
      ids.push(...emergencyIds);
    }
    return [...new Set(ids)].filter((id) => /^\d{17,19}$/.test(id) && !skip.has(id)).slice(0, 25);
  }

  async function postSubRequest(channel, event, { position, replacing, requestedBy, lineupId, note }) {
    const { data: request, error } = await supabase
      .from('sub_requests')
      .insert({
        guild_id: event.guild_id,
        event_id: event.id,
        lineup_id: lineupId || null,
        position: position || null,
        replacing_discord_id: replacing || null,
        requested_by_discord_id: requestedBy,
        status: 'open',
        channel_id: channel.id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const lineup = await lineupFor(event);
    const cover = {};
    const pingIds = (await subCandidates(event, lineup, position, cover)).filter((id) => id !== replacing);
    const pinged = new Set(pingIds);
    const coverLine = (tier, label) => {
      const list = (cover[tier] || []).filter((id) => pinged.has(id)).slice(0, 10);
      return list.length ? `\n${label}: ${list.map((id) => `<@${id}>`).join(' ')}` : '';
    };
    const coverText = position
      ? coverLine('primary', `⭐ ${position} is their comp position`) + coverLine('secondary', `✅ Plays ${position} well`) + coverLine('emergency', '🆘 Can cover in an emergency')
      : '';
    const rolePing = !pingIds.length && event.ping_role_id ? event.ping_role_id : null;
    const kickoff = T.unix(event.scheduled_at);
    const embed = new EmbedBuilder()
      .setTitle(`🆘 Sub needed${position ? `: ${position}` : ''}`)
      .setColor(0xed4245)
      .setDescription(
        `**${event.title}** kicks off <t:${kickoff}:t> (<t:${kickoff}:R>).` +
          (replacing ? `\nCovering for <@${replacing}>.` : '') +
          (note ? `\n${note}` : '') +
          coverText +
          '\nFirst to tap **I can cover** gets the spot.'
      );
    const message = await channel.send({
      content: pingIds.length ? pingIds.map((id) => `<@${id}>`).join(' ') : rolePing ? `<@&${rolePing}>` : undefined,
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`sub_take:${request.id}`).setLabel('I can cover').setEmoji('🙋').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`sub_cancel:${request.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        ),
      ],
      allowedMentions: { users: pingIds.slice(0, 100), roles: rolePing ? [rolePing] : [] },
    });
    await supabase.from('sub_requests').update({ message_id: message.id }).eq('id', request.id);
    return request;
  }

  async function takeSub(interaction, requestId) {
    const { data: request } = await supabase.from('sub_requests').select('*').eq('id', requestId).maybeSingle();
    if (!request || request.status !== 'open') {
      return interaction.reply({ content: request?.status === 'filled' ? `Already covered by <@${request.filled_by_discord_id}>. Thanks though!` : '❌ This request is closed.', flags: 64 });
    }
    if (request.replacing_discord_id === interaction.user.id) return interaction.reply({ content: "❌ You can't cover your own spot.", flags: 64 });

    // Claim it only if still open, so two quick taps can't both win
    const { data: claimed } = await supabase
      .from('sub_requests')
      .update({ status: 'filled', filled_by_discord_id: interaction.user.id, filled_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('status', 'open')
      .select();
    if (!claimed?.length) return interaction.reply({ content: 'Someone just beat you to it. Thanks though!', flags: 64 });

    let swapped = false;
    if (request.lineup_id && request.replacing_discord_id) {
      const { data: slot } = await supabase
        .from('lineup_slots')
        .select('id')
        .eq('lineup_id', request.lineup_id)
        .eq('discord_user_id', request.replacing_discord_id)
        .maybeSingle();
      if (slot) {
        // If the sub was on the bench, free that slot first
        await supabase.from('lineup_slots').delete().eq('lineup_id', request.lineup_id).eq('discord_user_id', interaction.user.id).eq('is_substitute', true);
        await supabase.from('lineup_slots').update({ discord_user_id: interaction.user.id }).eq('id', slot.id);
        swapped = true;
      }
    }
    // Update the published team sheet so everyone sees the swap
    if (swapped && callEdgeFunction) {
      const { data: lineup } = await supabase.from('lineups').select('channel_id, message_id').eq('id', request.lineup_id).maybeSingle();
      if (lineup?.message_id) {
        await callEdgeFunction('announce-lineup', { action: 'announce', lineup_id: request.lineup_id, channel_id: lineup.channel_id, mention_players: true }, 30000);
      }
    }
    if (request.event_id) {
      await supabase
        .from('event_checkins')
        .upsert({ event_id: request.event_id, discord_user_id: interaction.user.id, status: 'in', checked_in_at: new Date().toISOString() }, { onConflict: 'event_id,discord_user_id' });
    }

    const original = interaction.message.embeds[0];
    await interaction.update({
      embeds: [
        EmbedBuilder.from(original)
          .setTitle(`✅ Sub found${request.position ? `: ${request.position}` : ''}`)
          .setColor(0x57f287)
          .addFields({ name: 'Covering', value: `<@${interaction.user.id}>${swapped ? ' (swapped into the lineup)' : ''}` }),
      ],
      components: [],
    });
    // Ping the sub with where to go: the club voice channel and the event's details (lobby code etc.)
    const event = request.event_id ? await events.loadEvent(request.event_id) : null;
    const state = event?.club_key && getGuildState ? await getGuildState(event.guild_id) : null;
    const vcId = state?.clubVcLinks?.[event.club_key];
    const botId = events.getClient()?.user?.id;
    const notify = [interaction.user.id, request.requested_by_discord_id].filter((id) => id && id !== botId);
    await interaction.followUp({
      content:
        `🙌 <@${interaction.user.id}> is covering${request.position ? ` ${request.position}` : ''}.` +
        (request.requested_by_discord_id !== botId ? ` <@${request.requested_by_discord_id}>` : '') +
        (vcId ? `\n🎧 Jump in <#${vcId}> for the lobby.` : '') +
        (event?.description ? `\n📌 ${event.description.slice(0, 500)}` : ''),
      allowedMentions: { users: [...new Set(notify)] },
    });
    if (event) await refreshCheckin(event);
  }

  async function cancelSub(interaction, requestId) {
    const { data: request } = await supabase.from('sub_requests').select('*').eq('id', requestId).maybeSingle();
    if (!request || request.status !== 'open') return interaction.reply({ content: '❌ This request is already closed.', flags: 64 });
    if (interaction.user.id !== request.requested_by_discord_id && !isManager(interaction.member)) {
      return interaction.reply({ content: '❌ Only whoever asked (or a manager) can cancel this.', flags: 64 });
    }
    await supabase.from('sub_requests').update({ status: 'cancelled' }).eq('id', request.id);
    const original = interaction.message.embeds[0];
    await interaction.update({ embeds: [EmbedBuilder.from(original).setTitle(`~~${original.title}~~ (cancelled)`).setColor(0x99aab5)], components: [] });
  }

  // "Request sub" on the check-in post: pick who to replace, or a position
  async function subPicker(interaction, eventId) {
    const event = await events.loadEvent(eventId);
    if (!event || event.closed) return interaction.reply({ content: '❌ This event is closed.', flags: 64 });
    const { lineup } = await expectedTonight(event);
    const checkins = await loadCheckins(event.id);
    const status = new Map(checkins.map((c) => [c.discord_user_id, c.status]));
    const options = [];
    for (const s of lineup?.slots.filter((x) => !x.is_substitute) || []) {
      const member = interaction.guild.members.cache.get(s.discord_user_id);
      const flag = status.get(s.discord_user_id);
      if (flag === 'in') continue;
      options.push({
        label: `${s.position}: replace ${member?.displayName || 'player'}`.slice(0, 100),
        description: flag === 'out' ? 'Dropped out' : flag === 'late' ? 'Running late' : 'Not checked in',
        value: `r:${s.discord_user_id}:${s.position}`,
      });
    }
    for (const p of POSITIONS) if (options.length < 25) options.push({ label: `Any ${p}`, value: `p:${p}` });
    return interaction.reply({
      content: `🆘 Who needs covering for **${event.title}**?`,
      components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`sub_pick:${event.id}`).setPlaceholder('Pick a player or position').addOptions(options.slice(0, 25)))],
      flags: 64,
    });
  }

  async function subPicked(interaction, eventId) {
    const event = await events.loadEvent(eventId);
    if (!event || event.closed) return interaction.update({ content: '❌ This event is closed.', components: [] });
    const club = event.club_key ? await events.clubFor(event.guild_id, event.club_key) : null;
    const [kind, a, b] = interaction.values[0].split(':');
    const lineup = await lineupFor(event);
    const replacing = kind === 'r' ? a : null;
    if (replacing && replacing !== interaction.user.id && !(club ? await canManageClub(interaction.member, club) : isManager(interaction.member))) {
      return interaction.update({ content: '❌ Only club leaders can replace someone else.', components: [] });
    }
    await interaction.update({ content: '🆘 Asking the server for a sub…', components: [] });
    await postSubRequest(interaction.channel, event, {
      position: kind === 'r' ? b : a,
      replacing,
      requestedBy: interaction.user.id,
      lineupId: lineup?.id,
    });
    await refreshCheckin(event);
    await interaction.editReply({ content: '✅ Sub request posted.' });
  }

  // ---------- Commands ----------

  async function nextEvent(guildId, member) {
    const upcoming = await supabase
      .from('availability_events')
      .select('*')
      .eq('guild_id', guildId)
      .eq('closed', false)
      .not('club_key', 'is', null)
      .gte('scheduled_at', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10);
    const list = upcoming.data || [];
    // Prefer an event the member said yes to, then the soonest
    if (member) {
      const { data: mine } = await supabase.from('player_availability').select('event_id').eq('discord_user_id', member.id).in('event_id', list.map((e) => e.id)).eq('response', 'yes');
      const ids = new Set((mine || []).map((r) => r.event_id));
      const preferred = list.find((e) => ids.has(e.id));
      if (preferred) return preferred;
    }
    return list[0] || null;
  }

  async function handleCheckinCommand(interaction) {
    const event = await nextEvent(interaction.guildId, interaction.member);
    if (!event) return interaction.reply({ content: 'No upcoming event to check in for. Create one with **/manager → Events → New Event**.', flags: 64 });
    const club = event.club_key ? await events.clubFor(event.guild_id, event.club_key) : null;
    const leader = club ? await canManageClub(interaction.member, club) : isManager(interaction.member);

    if (!event.checkin_message_id) {
      if (!leader) return interaction.reply({ content: `Check-in for **${event.title}** opens <t:${T.unix(new Date(event.scheduled_at).getTime() - CHECKIN_LEAD_MS)}:R>.`, flags: 64 });
      await interaction.deferReply({ flags: 64 });
      const opened = await openCheckin(event);
      return interaction.editReply({ content: opened ? `✅ Check-in is open for **${event.title}**.` : "❌ I couldn't post the check-in. Run `/setup` to check my permissions." });
    }

    await supabase
      .from('event_checkins')
      .upsert({ event_id: event.id, discord_user_id: interaction.user.id, status: 'in', checked_in_at: new Date().toISOString() }, { onConflict: 'event_id,discord_user_id' });
    await refreshCheckin(event);
    return interaction.reply({ content: `🟢 You're checked in for **${event.title}**.`, flags: 64 });
  }

  async function handleSubCommand(interaction) {
    const event = await nextEvent(interaction.guildId);
    if (!event) return interaction.reply({ content: 'No upcoming event. Create one with **/manager → Events → New Event**.', flags: 64 });
    const replacing = interaction.options.getUser('replacing');
    const club = event.club_key ? await events.clubFor(event.guild_id, event.club_key) : null;
    if (replacing && replacing.id !== interaction.user.id && !(club ? await canManageClub(interaction.member, club) : isManager(interaction.member))) {
      return interaction.reply({ content: '❌ Only club leaders can replace someone else.', flags: 64 });
    }
    const missing = missingChannelPerms(interaction.channel, interaction.guild.members.me);
    if (missing.length) return interaction.reply({ content: `❌ I'm missing **${missing.join('**, **')}** here. Run \`/setup\` to check.`, flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const lineup = await lineupFor(event);
    let position = interaction.options.getString('position');
    if (!position && replacing) position = lineup?.slots.find((s) => s.discord_user_id === replacing.id)?.position || null;
    await postSubRequest(interaction.channel, event, {
      position,
      replacing: replacing?.id,
      requestedBy: interaction.user.id,
      lineupId: lineup?.id,
      note: interaction.options.getString('note')?.slice(0, 300),
    });
    await refreshCheckin(event);
    return interaction.editReply({ content: `✅ Sub request posted for **${event.title}**.` });
  }

  async function handleReliability(interaction) {
    const player = interaction.options.getUser('player');
    let query = supabase.from('player_reliability').select('*').eq('guild_id', interaction.guildId);
    if (player) query = query.eq('discord_user_id', player.id);
    const { data } = await query;
    const rows = (data || []).filter((r) => r.events_available > 0);
    const embed = new EmbedBuilder().setTitle('📈 Show-up rates').setColor(0x5865f2);
    if (!rows.length) {
      embed.setDescription(
        player
          ? `No check-in history for <@${player.id}> yet.`
          : 'No history yet. Rates build up from check-ins: when someone says they are available, do they check in?'
      );
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
    rows.sort((a, b) => b.reliability_score - a.reliability_score || b.events_available - a.events_available);
    const line = (r) => {
      const score = Math.round(Number(r.reliability_score));
      const icon = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴';
      return `${icon} <@${r.discord_user_id}> **${score}%** (showed ${r.events_showed} of ${r.events_available}${r.events_no_showed ? `, ${r.events_no_showed} no-show` : ''})`;
    };
    embed.setDescription(truncate(rows.slice(0, 30).map(line).join('\n'), 4000)).setFooter({ text: `Last ${RELIABILITY_WINDOW} events with a check-in` });
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }

  // ---------- Scheduler hooks ----------

  async function openDueCheckins(now) {
    const { data } = await supabase
      .from('availability_events')
      .select('*')
      .eq('closed', false)
      .is('checkin_message_id', null)
      .not('club_key', 'is', null)
      .lte('scheduled_at', new Date(now.getTime() + CHECKIN_LEAD_MS).toISOString())
      .gt('scheduled_at', new Date(now.getTime() - 15 * 60 * 1000).toISOString());
    for (const event of data || []) {
      if (!events.getClient().guilds.cache.has(event.guild_id)) continue;
      await openCheckin(event).catch((err) => console.warn(`[matchnight] check-in ${event.id} failed: ${err.message}`));
    }
  }

  // After an event with a check-in closes: record who showed and refresh show-up rates
  async function recordAttendance(event) {
    if (!event.checkin_message_id || event.cancelled) return;
    await refreshCheckin(event);
    const responses = await events.loadResponses(event.id);
    const checkins = await loadCheckins(event.id);
    const showed = new Set(checkins.filter((c) => c.status === 'in' || c.status === 'late').map((c) => c.discord_user_id));
    // Dropping out on the check-in counts as notice given, not a no-show
    const excused = new Set(checkins.filter((c) => c.status === 'out').map((c) => c.discord_user_id));
    const said = new Map(responses.map((r) => [r.discord_user_id, r.response]));
    const people = new Set([...said.keys(), ...showed]);
    const { data: already } = await supabase.from('attendance_records').select('discord_user_id').eq('event_id', event.id);
    const recorded = new Set((already || []).map((r) => r.discord_user_id));
    const rows = [...people]
      .filter((id) => !recorded.has(id))
      .map((id) => ({
        guild_id: event.guild_id,
        event_id: event.id,
        discord_user_id: id,
        // Only a firm yes counts as a promise to play; maybe is no commitment
        said_available: said.get(id) === 'yes' && !excused.has(id),
        actually_showed: showed.has(id),
        recorded_by_discord_id: null,
      }));
    if (rows.length) await supabase.from('attendance_records').insert(rows);
    for (const id of people) await recomputeReliability(event.guild_id, id);
  }

  async function recomputeReliability(guildId, userId) {
    const { data: records } = await supabase
      .from('attendance_records')
      .select('said_available, actually_showed, recorded_at')
      .eq('guild_id', guildId)
      .eq('discord_user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(RELIABILITY_WINDOW);
    const list = records || [];
    const available = list.filter((r) => r.said_available);
    const showed = available.filter((r) => r.actually_showed).length;
    const row = {
      guild_id: guildId,
      discord_user_id: userId,
      total_events: list.length,
      events_available: available.length,
      events_showed: list.filter((r) => r.actually_showed).length,
      events_no_showed: available.length - showed,
      reliability_score: available.length ? Math.round((showed / available.length) * 1000) / 10 : 100,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('player_reliability').upsert(row, { onConflict: 'guild_id,discord_user_id' });
  }

  // Players whose show-up rate is low enough to flag on the event board
  async function lowReliability(guildId, userIds) {
    if (!userIds.length) return new Map();
    const { data } = await supabase
      .from('player_reliability')
      .select('discord_user_id, reliability_score, events_available')
      .eq('guild_id', guildId)
      .in('discord_user_id', userIds);
    return new Map(
      (data || [])
        .filter((r) => r.events_available >= RELIABILITY_MIN_EVENTS && Number(r.reliability_score) < 75)
        .map((r) => [r.discord_user_id, Math.round(Number(r.reliability_score))])
    );
  }

  events.onTick(openDueCheckins);
  events.onClose(recordAttendance);

  // ---------- Routing ----------

  async function handleCommand(interaction, cmd) {
    if (cmd === 'checkin') await handleCheckinCommand(interaction);
    else if (cmd === 'sub') await handleSubCommand(interaction);
    else if (cmd === 'reliability') await handleReliability(interaction);
    else return false;
    return true;
  }

  async function handleComponent(interaction) {
    const [action, a, b] = interaction.customId.split(':');
    if (action === 'ck' && CHECKINS[a]) await handleCheckinButton(interaction, a, b);
    else if (action === 'sub_new') await subPicker(interaction, a);
    else if (action === 'sub_pick') await subPicked(interaction, a);
    else if (action === 'sub_take') await takeSub(interaction, a);
    else if (action === 'sub_cancel') await cancelSub(interaction, a);
    else return false;
    return true;
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if (interaction.isChatInputCommand()) return handleCommand(interaction, interaction.commandName);
    if (interaction.isButton() || interaction.isStringSelectMenu()) return handleComponent(interaction);
    return false;
  }

  events.setReliabilityLookup(lowReliability);

  return { commands: MATCHNIGHT_COMMANDS, handleInteraction, lowReliability, openCheckin, lineupFor, loadCheckins, refreshCheckin, postSubRequest };
}

module.exports = { createMatchNight, MATCHNIGHT_COMMANDS };
