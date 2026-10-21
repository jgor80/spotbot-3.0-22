// Event lineups: a captain builds the XI from an event's Available/Maybe answers right in Discord,
// publishes it (posted in the event channel + a DM to every player asking them to confirm), and
// the bot sends a "join the voice channel" DM 30 minutes before and at kick-off to anyone not
// already in voice.

const { EmbedBuilder, ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { FORMATION_SLOTS, autofillLineup } = require('./lineup-autofill.cjs');
const { splitPositions } = require('./event-board.cjs');

const DEFAULT_FORMATION = '4-3-3 FLAT';
const BENCH_OFFSET = 100;
const VC_LEAD_MS = 30 * 60 * 1000;
const VC_LATE_MS = 15 * 60 * 1000;

function createEventLineup(deps) {
  const { supabase, events, isManager, canManageClub, getUserPrefs, getGuildState } = deps;
  const drafts = new Map(); // `${eventId}:${userId}` -> { formation, slots: Map<idx, userId>, pool, selectedSlot }

  async function isLeader(interaction, event) {
    const club = event.club_key ? await events.clubFor(event.guild_id, event.club_key) : null;
    return club && canManageClub ? canManageClub(interaction.member, club) : isManager(interaction.member);
  }

  // Available first, then Maybe, each with the positions shown on the availability board:
  // what they signed up for (position sign-up events), then primary, secondary and emergency.
  async function poolFor(event) {
    const responses = (await events.loadResponses(event.id)).filter((r) => r.response === 'yes' || r.response === 'maybe');
    const known = events.playerPositions ? await events.playerPositions(event, responses.map((r) => r.discord_user_id)).catch(() => new Map()) : new Map();
    const entry = (r) => {
      const usual = known.get(r.discord_user_id);
      const signed = splitPositions(r.response === 'yes' ? r.position : null);
      const positions = [...new Set([...signed, usual?.primary, ...(usual?.secondary || []), ...(usual?.emergency || [])].filter(Boolean))];
      // A sign-up position counts as their comp position for this event
      const tiers = signed.length ? { primary: signed[0], secondary: signed.slice(1), emergency: usual?.emergency || [] } : usual || null;
      return { id: r.discord_user_id, answer: r.response, note: r.note, positions, tiers };
    };
    return [...responses.filter((r) => r.response === 'yes').map(entry), ...responses.filter((r) => r.response === 'maybe').map(entry)];
  }

  function posLabel(p) {
    return p?.positions?.length ? p.positions.slice(0, 3).join('/') : '';
  }

  async function autofill(event, formation, pool) {
    const slotPositions = FORMATION_SLOTS[formation];
    const players = [];
    for (const p of pool) {
      players.push({
        discord_user_id: p.id,
        overall_rating: 70,
        maybe: p.answer === 'maybe',
        tiers: p.tiers,
        preferences: [...new Set([...(p.positions || []), ...(getUserPrefs ? await getUserPrefs(event.guild_id, p.id).catch(() => []) : [])])],
      });
    }
    return autofillLineup(slotPositions, players, []);
  }

  function nameOf(guild, id) {
    const m = guild?.members.cache.get(id);
    return (m?.displayName || m?.user?.username || id).slice(0, 80);
  }

  function render(event, d, guild) {
    const positions = FORMATION_SLOTS[d.formation];
    const used = new Set(d.slots.values());
    const bench = d.pool.filter((p) => !used.has(p.id));
    const answerIcon = (id) => (d.pool.find((p) => p.id === id)?.answer === 'maybe' ? ' ❓' : '');
    const lines = positions.map((pos, i) => {
      const id = d.slots.get(i);
      const mark = d.selectedSlot === i ? '👉 ' : '';
      return `${mark}\`${pos.padEnd(3)}\` ${id ? `<@${id}>${answerIcon(id)}` : '*empty*'}`;
    });
    const embed = new EmbedBuilder()
      .setTitle(`📋 Lineup · ${event.title}`)
      .setColor(0x3b82f6)
      .setDescription(`📐 **${d.formation}** · ${d.slots.size}/${positions.length} filled\n\n${lines.join('\n')}`)
      .addFields({ name: `🪑 Bench (${bench.length})`, value: bench.map((p) => `<@${p.id}>${posLabel(p) ? ` · ${posLabel(p)}` : ''}${p.answer === 'maybe' ? ' ❓' : ''}${p.note ? ` 📝 *${p.note.slice(0, 50)}*` : ''}`).join('\n').slice(0, 1024) || '–' })
      .setFooter({ text: 'Pick a position, then a player. ❓ = answered Maybe. Publish posts it and DMs everyone.' });

    const fNames = Object.keys(FORMATION_SLOTS);
    const fOptions = [d.formation, ...fNames.filter((n) => n !== d.formation)].slice(0, 25);
    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`evl_form:${event.id}`)
          .setPlaceholder('Formation')
          .addOptions(fOptions.map((n) => ({ label: n, value: n, default: n === d.formation })))
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`evl_slot:${event.id}`)
          .setPlaceholder('Pick a position to change')
          .addOptions(positions.map((pos, i) => ({ label: `${pos} — ${d.slots.get(i) ? nameOf(guild, d.slots.get(i)) : 'empty'}`.slice(0, 100), value: String(i), default: d.selectedSlot === i })))
      ),
    ];
    if (d.selectedSlot != null) {
      // Players who list this position come first, best fit (primary) at the top
      const slotPos = positions[d.selectedSlot];
      const fit = (p) => {
        const i = (p.positions || []).indexOf(slotPos);
        return i === -1 ? 99 : i;
      };
      const ordered = [...d.pool].sort((x, y) => fit(x) - fit(y));
      const opts = [{ label: '— Leave empty —', value: 'none' }, ...ordered.map((p) => ({ label: `${nameOf(guild, p.id)}${posLabel(p) ? ` · ${posLabel(p)}` : ''}${p.answer === 'maybe' ? ' (maybe)' : ''}${used.has(p.id) ? ' · in XI' : ''}`.slice(0, 100), value: p.id }))].slice(0, 25);
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`evl_player:${event.id}`).setPlaceholder(`Who plays ${positions[d.selectedSlot]}?`).addOptions(opts)));
    }
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`evl_publish:${event.id}`).setLabel('Publish & DM players').setEmoji('📣').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`evl_auto:${event.id}`).setLabel('Auto-fill again').setEmoji('🪄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`evl_cancel:${event.id}`).setLabel('Discard').setStyle(ButtonStyle.Danger)
      )
    );
    return { embeds: [embed], components: rows };
  }

  async function startBuild(interaction, eventId) {
    const event = await events.loadEvent(eventId);
    if (!event || event.closed) return interaction.reply({ content: '❌ That event is closed.', flags: 64 });
    if (!(await isLeader(interaction, event))) return interaction.reply({ content: '❌ Only captains and managers can build the lineup.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    await interaction.guild?.members.fetch().catch(() => {});
    const pool = await poolFor(event);
    if (!pool.length) return interaction.editReply({ content: 'Nobody has answered Available or Maybe yet.' });
    const formation = FORMATION_SLOTS[event.formation] ? event.formation : DEFAULT_FORMATION;
    const d = { formation, pool, slots: await autofill(event, formation, pool), selectedSlot: null };
    drafts.set(`${eventId}:${interaction.user.id}`, d);
    return interaction.editReply(render(event, d, interaction.guild));
  }

  async function withDraft(interaction, eventId, fn) {
    const d = drafts.get(`${eventId}:${interaction.user.id}`);
    const event = await events.loadEvent(eventId);
    if (!d || !event) return interaction.update({ content: 'This lineup draft expired. Tap **Build Lineup** on the event again.', embeds: [], components: [] });
    await fn(d, event);
    return interaction.update(render(event, d, interaction.guild));
  }

  async function publish(interaction, eventId) {
    const d = drafts.get(`${eventId}:${interaction.user.id}`);
    const event = await events.loadEvent(eventId);
    if (!d || !event) return interaction.update({ content: 'This lineup draft expired.', embeds: [], components: [] });
    await interaction.deferUpdate();
    const positions = FORMATION_SLOTS[d.formation];
    const used = new Set(d.slots.values());
    const bench = d.pool.filter((p) => !used.has(p.id)).map((p) => p.id);

    const { data: lineup, error } = await supabase
      .from('lineups')
      .insert({ guild_id: event.guild_id, event_id: event.id, team_id: event.team_id || null, name: event.title, formation: d.formation, created_by_discord_id: interaction.user.id, channel_id: event.channel_id })
      .select()
      .single();
    if (error) return interaction.editReply({ content: `❌ Could not save the lineup: ${error.message}`, embeds: [], components: [] });
    const slotRows = [
      ...[...d.slots.entries()].map(([i, id]) => ({ lineup_id: lineup.id, discord_user_id: id, position: positions[i], slot_index: i, is_substitute: false })),
      ...bench.map((id, k) => ({ lineup_id: lineup.id, discord_user_id: id, position: 'SUB', slot_index: BENCH_OFFSET + k, is_substitute: true })),
    ];
    if (slotRows.length) await supabase.from('lineup_slots').insert(slotRows);
    await supabase.from('availability_events').update({ formation: d.formation }).eq('id', event.id);

    const posted = await postLineup(lineup.id);
    let dmOk = 0, dmFail = 0;
    for (const row of slotRows) {
      const ok = await dmPlayer(event, lineup, row).catch(() => false);
      ok ? dmOk++ : dmFail++;
      await new Promise((r) => setTimeout(r, 800));
    }
    drafts.delete(`${eventId}:${interaction.user.id}`);
    return interaction.editReply({
      content: `✅ Lineup published${posted ? ` in <#${event.channel_id}>` : ''}. DMed **${dmOk}** player(s)${dmFail ? `, **${dmFail}** have DMs closed (they can confirm on the post)` : ''}. I'll invite everyone to voice 30 min before and at kick-off.`,
      embeds: [],
      components: [],
    });
  }

  async function loadLineup(lineupId) {
    const { data: lineup } = await supabase.from('lineups').select('*').eq('id', lineupId).maybeSingle();
    if (!lineup) return null;
    const { data: slots } = await supabase.from('lineup_slots').select('*').eq('lineup_id', lineupId).order('slot_index');
    return { ...lineup, slots: slots || [] };
  }

  function lineupEmbed(event, lineup) {
    const status = (s) => (s.confirmed_at ? '✅' : s.declined_at ? '❌' : '⏳');
    const xi = lineup.slots.filter((s) => !s.is_substitute);
    const subs = lineup.slots.filter((s) => s.is_substitute);
    const confirmed = xi.filter((s) => s.confirmed_at).length;
    const kick = Math.floor(new Date(event.scheduled_at).getTime() / 1000);
    return new EmbedBuilder()
      .setTitle(`📣 Lineup · ${event.title}`)
      .setColor(0x22c55e)
      .setDescription(`🗓️ <t:${kick}:F> (<t:${kick}:R>) · 📐 **${lineup.formation}**\n\n${xi.map((s) => `${status(s)} \`${s.position.padEnd(3)}\` <@${s.discord_user_id}>`).join('\n') || '*No starters*'}`)
      .addFields(
        { name: '🪑 Bench', value: subs.map((s) => `${status(s)} <@${s.discord_user_id}>`).join(' ') || '–' },
        { name: 'Confirmed', value: `${confirmed}/${xi.length} starters` }
      )
      .setFooter({ text: '✅ confirmed · ⏳ waiting · ❌ can\'t make it' });
  }

  function confirmRow(lineupId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`evl_ok:${lineupId}`).setLabel("I'm in, I'll be there").setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`evl_no:${lineupId}`).setLabel("Can't make it").setEmoji('❌').setStyle(ButtonStyle.Danger)
    );
  }

  async function postLineup(lineupId) {
    const lineup = await loadLineup(lineupId);
    const event = lineup && (await events.loadEvent(lineup.event_id));
    const client = events.getClient();
    if (!lineup || !event || !client || !event.channel_id) return false;
    const channel = await client.channels.fetch(event.channel_id).catch(() => null);
    if (!channel?.send) return false;
    const mentions = lineup.slots.map((s) => `<@${s.discord_user_id}>`).join(' ');
    // The pitch image (player cards, bench) from lineup-board.cjs; the post goes out without it if it can't be drawn
    const png = deps.lineupImage ? await deps.lineupImage(lineup.id, { subtitle: event.title }) : null;
    const embed = lineupEmbed(event, lineup);
    if (png) embed.setImage('attachment://lineup.png');
    const msg = await channel.send({ content: mentions.slice(0, 1900), embeds: [embed], components: [confirmRow(lineup.id)], files: png ? [new AttachmentBuilder(png, { name: 'lineup.png' })] : [], allowedMentions: { users: lineup.slots.map((s) => s.discord_user_id) } }).catch(() => null);
    if (!msg) return false;
    await supabase.from('lineups').update({ message_id: msg.id, channel_id: channel.id }).eq('id', lineup.id);
    return true;
  }

  async function refreshLineupPost(lineupId) {
    const lineup = await loadLineup(lineupId);
    const event = lineup && (await events.loadEvent(lineup.event_id));
    const client = events.getClient();
    if (!lineup?.message_id || !event || !client) return;
    const channel = await client.channels.fetch(lineup.channel_id).catch(() => null);
    const msg = await channel?.messages?.fetch(lineup.message_id).catch(() => null);
    if (!msg) return;
    const embed = lineupEmbed(event, lineup);
    // Redraw the pitch image the post went out with, so names and swaps stay current; if it can't be
    // drawn the old one stays
    const hadImage = msg.attachments?.some?.((a) => a.name === 'lineup.png');
    const png = hadImage && deps.lineupImage ? await deps.lineupImage(lineup.id, { subtitle: event.title }).catch(() => null) : null;
    if (hadImage) embed.setImage('attachment://lineup.png');
    const files = png ? { files: [new AttachmentBuilder(png, { name: 'lineup.png' })], attachments: [] } : {};
    await msg.edit({ embeds: [embed], components: [confirmRow(lineup.id)], ...files }).catch(() => {});
  }

  async function dmPlayer(event, lineup, row) {
    const user = await events.getClient()?.users.fetch(row.discord_user_id).catch(() => null);
    if (!user) return false;
    const kick = Math.floor(new Date(event.scheduled_at).getTime() / 1000);
    const role = row.is_substitute ? 'on the **bench**' : `starting at **${row.position}**`;
    await user.send({
      content: `📣 You're ${role} for **${event.title}** · <t:${kick}:F> (<t:${kick}:R>).\nPlease confirm you'll be there:`,
      components: [confirmRow(lineup.id)],
    });
    return true;
  }

  async function answer(interaction, lineupId, ok) {
    const lineup = await loadLineup(lineupId);
    const slot = lineup?.slots.find((s) => s.discord_user_id === interaction.user.id);
    if (!slot) return interaction.reply({ content: "You're not in this lineup.", flags: 64 });
    const now = new Date().toISOString();
    await supabase.from('lineup_slots').update(ok ? { confirmed_at: now, declined_at: null } : { declined_at: now, confirmed_at: null }).eq('id', slot.id);
    await interaction.reply({ content: ok ? "✅ Confirmed — see you there. I'll send a voice invite before kick-off." : "❌ Got it. I've told the captain so they can find a sub.", flags: 64 });
    await refreshLineupPost(lineupId);
    if (!ok) {
      const event = await events.loadEvent(lineup.event_id);
      const channel = event?.channel_id && (await events.getClient()?.channels.fetch(event.channel_id).catch(() => null));
      const who = lineup.created_by_discord_id ? `<@${lineup.created_by_discord_id}> ` : '';
      await channel?.send({ content: `⚠️ ${who}<@${interaction.user.id}> can't make **${event.title}** (${slot.position}). Use **/manager → Match Night → Find a Sub**.`, allowedMentions: { users: lineup.created_by_discord_id ? [lineup.created_by_discord_id] : [] } }).catch(() => {});
    }
  }

  // ---------- Voice invites: 30 min before and at kick-off ----------

  async function vcInvites(now) {
    const client = events.getClient();
    if (!client) return;
    const soon = new Date(now.getTime() + VC_LEAD_MS).toISOString();
    const { data: due } = await supabase
      .from('availability_events')
      .select('*')
      .eq('closed', false)
      .eq('cancelled', false)
      .lte('scheduled_at', soon)
      .or('vc_invite_30_sent.eq.false,vc_invite_0_sent.eq.false')
      .limit(20);
    for (const event of due || []) {
      const kickoff = new Date(event.scheduled_at).getTime();
      const late = now.getTime() > kickoff + VC_LATE_MS;
      const update = {};
      let stage = null;
      if (!event.vc_invite_30_sent) { update.vc_invite_30_sent = true; if (!late && now.getTime() < kickoff) stage = 'soon'; }
      if (!event.vc_invite_0_sent && now.getTime() >= kickoff) { update.vc_invite_0_sent = true; stage = late ? null : 'now'; }
      if (!Object.keys(update).length) continue;
      await supabase.from('availability_events').update(update).eq('id', event.id);
      if (stage) await sendVcInvite(event, stage).catch((err) => console.warn(`[event-lineup] vc invite ${event.id}: ${err.message}`));
    }
  }

  async function sendVcInvite(event, stage) {
    const client = events.getClient();
    const guild = client.guilds.cache.get(event.guild_id);
    if (!guild) return;
    await guild.members.fetch().catch(() => {});
    const state = await getGuildState(event.guild_id);
    const vcId = state?.clubVcLinks?.[event.club_key] || null;
    const vcLink = vcId ? `https://discord.com/channels/${guild.id}/${vcId}` : null;

    // Everyone in the lineup + everyone expected/answering, minus people who said no
    const ids = new Set();
    const { data: lineups } = await supabase.from('lineups').select('id').eq('event_id', event.id).order('created_at', { ascending: false }).limit(1);
    if (lineups?.[0]) {
      const { data: slots } = await supabase.from('lineup_slots').select('discord_user_id, declined_at').eq('lineup_id', lineups[0].id);
      (slots || []).filter((s) => !s.declined_at).forEach((s) => ids.add(s.discord_user_id));
    }
    const responses = await events.loadResponses(event.id);
    const no = new Set(responses.filter((r) => r.response === 'no').map((r) => r.discord_user_id));
    responses.filter((r) => r.response !== 'no').forEach((r) => ids.add(r.discord_user_id));
    const { expected } = await events.expectedPlayers(event);
    expected.forEach((id) => { if (!no.has(id)) ids.add(id); });

    const kick = Math.floor(new Date(event.scheduled_at).getTime() / 1000);
    const text = stage === 'soon'
      ? `⏰ **${event.title}** kicks off <t:${kick}:R>. Hop in voice${vcLink ? `: ${vcLink}` : ''}`
      : `⚽ **${event.title}** is starting now! Join voice${vcLink ? `: ${vcLink}` : ''}`;
    for (const id of ids) {
      if (!/^\d{17,19}$/.test(id)) continue;
      const member = guild.members.cache.get(id);
      if (!member || member.user.bot) continue;
      if (member.voice?.channelId) continue; // already in voice — don't DM
      await member.send({ content: text }).catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // ---------- Routing ----------

  async function handleInteraction(interaction) {
    if (!(interaction.isButton() || interaction.isStringSelectMenu())) return false;
    const [action, id] = interaction.customId.split(':');
    if (!action.startsWith('evl_')) return false;
    if (action === 'evl_build') await startBuild(interaction, id);
    else if (action === 'evl_ok') await answer(interaction, id, true);
    else if (action === 'evl_no') await answer(interaction, id, false);
    else if (action === 'evl_publish') await publish(interaction, id);
    else if (action === 'evl_cancel') {
      drafts.delete(`${id}:${interaction.user.id}`);
      await interaction.update({ content: 'Lineup discarded.', embeds: [], components: [] });
    } else if (action === 'evl_form') {
      await withDraft(interaction, id, async (d, event) => {
        d.formation = interaction.values[0];
        d.selectedSlot = null;
        d.slots = await autofill(event, d.formation, d.pool);
      });
    } else if (action === 'evl_auto') {
      await withDraft(interaction, id, async (d, event) => {
        d.pool = await poolFor(event);
        d.selectedSlot = null;
        d.slots = await autofill(event, d.formation, d.pool);
      });
    } else if (action === 'evl_slot') {
      await withDraft(interaction, id, async (d) => { d.selectedSlot = Number(interaction.values[0]); });
    } else if (action === 'evl_player') {
      await withDraft(interaction, id, async (d) => {
        const pick = interaction.values[0];
        if (pick === 'none') d.slots.delete(d.selectedSlot);
        else {
          for (const [i, u] of d.slots) if (u === pick) d.slots.delete(i); // move, don't duplicate
          d.slots.set(d.selectedSlot, pick);
        }
        d.selectedSlot = null;
      });
    } else return false;
    return true;
  }

  events.onTick(vcInvites);
  return { handleInteraction };
}

module.exports = { createEventLineup };
