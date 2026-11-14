// Pickup draft nights for Social Hub servers: two captains draft two teams from whoever is online.
//   Start        Pickup draft on the hub board (anyone in a lobby voice channel). The pool is everyone
//                in the hub's lobby and team voice channels (bots and the deafened left out). The
//                presser captains one side, the highest-level other player the other.
//   Picks        captains take turns in the draft message (posted in the presser's lobby chat), from a
//                menu of the pool with each player's main position and level. 60 seconds a pick, then
//                the best available (highest level) goes automatically. Picks alternate A, B, B, A, A...
//                so the second captain isn't always behind.
//   Done         the result posts as a lineup graphic (graphics-club-life draftPoster), and Split into
//                lobbies moves the second team into an empty lobby (needs Move Members).
// Nothing pings anyone: names show as mentions with pings off.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const CL = require('./graphics-club-life.cjs');
const { levelFor } = require('./hub-xp.cjs');

const F = PermissionsBitField.Flags;
const ORANGE = 0xe67e22;
const NO_PINGS = { parse: [] };
const PICK_MS = 60 * 1000;
const MIN_POOL = 4;
const MAX_POOL = 24;

// ---------- Pure ----------

// Pick order for n picks: A, B, B, A, A, B, B, ... (snake)
function pickOrder(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor((i + 1) / 2) % 2 === 0 ? 0 : 1);
  return out;
}

// The second captain: the highest-level other player
function pickCaptains(starter, pool, levelOf) {
  const others = pool.filter((id) => id !== starter).sort((a, b) => (levelOf(b) || 0) - (levelOf(a) || 0));
  return others.length ? [starter, others[0]] : null;
}

// Best available for an auto pick: highest level, then the first in the pool
function autoPick(remaining, levelOf) {
  return [...remaining].sort((a, b) => (levelOf(b) || 0) - (levelOf(a) || 0))[0] || null;
}

function createHubDraft(deps) {
  const { supabase, hubOf, getGuildState, getUserPrefs } = deps;
  const drafts = new Map(); // messageId -> draft

  async function levels(guildId, ids) {
    if (!ids.length) return new Map();
    const { data } = await supabase.from('hub_players').select('discord_user_id, xp').eq('guild_id', guildId).in('discord_user_id', ids);
    return new Map((data || []).map((r) => [r.discord_user_id, levelFor(r.xp)]));
  }

  async function mainPositions(guildId, ids) {
    const out = new Map();
    await Promise.all(ids.map(async (id) => out.set(id, String(((await getUserPrefs?.(guildId, id).catch(() => [])) || [])[0] || '').toUpperCase() || null)));
    return out;
  }

  // Everyone in a hub voice channel (lobbies and teams)
  async function online(guild) {
    const state = await getGuildState(guild.id);
    const hub = await hubOf(guild.id);
    const keys = [...(hub.lobbies || []), ...(hub.teams || [])];
    const ids = [];
    for (const key of keys) {
      const vc = guild.channels.cache.get(state.clubVcLinks?.[key]);
      for (const m of vc?.members?.values?.() || []) if (!m.user?.bot && !m.voice?.selfDeaf) ids.push(m.id);
    }
    return { ids: [...new Set(ids)], state, hub };
  }

  // ---------- Message ----------

  function label(d, id) {
    const pos = d.pos.get(id);
    return `<@${id}>${pos ? ` ${pos}` : ''} · L${d.lvl.get(id) || 1}`;
  }

  function view(d) {
    const turn = d.done ? null : d.order[d.picks];
    const embed = new EmbedBuilder()
      .setTitle(d.done ? '🏁 Pickup draft: teams are in' : `📝 Pickup draft · pick ${d.picks + 1} of ${d.order.length}`)
      .setColor(ORANGE)
      .setDescription(d.done ? 'Good luck! Press **Split into lobbies** to send the second team to its own lobby.' : `<@${d.captains[turn]}> is on the clock: pick from the menu. Auto pick <t:${Math.floor(d.deadline / 1000)}:R>.`)
      .addFields(
        { name: `🟠 Team ${d.names[0]}`, value: d.teams[0].map((id, i) => `${i === 0 ? '👑 ' : ''}${label(d, id)}`).join('\n') || '—', inline: true },
        { name: `🔵 Team ${d.names[1]}`, value: d.teams[1].map((id, i) => `${i === 0 ? '👑 ' : ''}${label(d, id)}`).join('\n') || '—', inline: true }
      );
    if (!d.done && d.pool.size) embed.addFields({ name: `Still to pick (${d.pool.size})`, value: [...d.pool].map((id) => label(d, id)).join(' · ').slice(0, 1024) });
    const rows = [];
    if (!d.done && d.pool.size) {
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('pd_pick')
          .setPlaceholder('Captain: pick a player')
          .addOptions([...d.pool].slice(0, 25).map((id) => ({ label: `${d.display.get(id) || 'Player'}`.slice(0, 100), description: `${d.pos.get(id) || 'Any position'} · level ${d.lvl.get(id) || 1}`, value: id })))
      ));
      rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pd_cancel').setLabel('Cancel draft').setStyle(ButtonStyle.Secondary)));
    } else if (d.done) {
      rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pd_split').setLabel('Split into lobbies').setEmoji('🔀').setStyle(ButtonStyle.Primary)));
    }
    return { embeds: [embed], components: rows, allowedMentions: NO_PINGS };
  }

  async function finish(d, message) {
    d.done = true;
    clearTimeout(d.timer);
    const team = (i) => d.teams[i].map((id) => ({ name: d.display.get(id) || 'Player', position: d.pos.get(id) || '', captain: id === d.captains[i] }));
    const png = CL.draftPoster({ serverName: d.guildName, teams: [{ name: d.names[0], players: team(0) }, { name: d.names[1], players: team(1) }] });
    await message.edit({ ...view(d), files: [new AttachmentBuilder(png, { name: 'pickup-draft.png' })] }).catch(() => {});
  }

  async function pick(d, message, id) {
    if (!d.pool.has(id) || d.done) return;
    d.teams[d.order[d.picks]].push(id);
    d.pool.delete(id);
    d.picks += 1;
    clearTimeout(d.timer);
    if (!d.pool.size || d.picks >= d.order.length) {
      // Anyone left over (odd numbers) joins the smaller side
      for (const rest of d.pool) d.teams[d.teams[0].length <= d.teams[1].length ? 0 : 1].push(rest);
      d.pool.clear();
      return finish(d, message);
    }
    d.deadline = Date.now() + PICK_MS;
    d.timer = setTimeout(() => pick(d, message, autoPick(d.pool, (x) => d.lvl.get(x))).catch(() => {}), PICK_MS);
    d.timer.unref?.();
    await message.edit(view(d)).catch(() => {});
  }

  async function start(interaction) {
    const guild = interaction.guild;
    const vcId = interaction.member?.voice?.channelId;
    const { ids, state, hub } = await online(guild);
    if (!vcId || !ids.includes(interaction.user.id)) return { content: '🔊 Join a lobby voice channel first: the draft pool is everyone in the hub\'s voice channels.' };
    if (ids.length < MIN_POOL) return { content: `👥 A draft needs at least ${MIN_POOL} people in the hub's voice channels (${ids.length} now).` };
    const pool = ids.slice(0, MAX_POOL);
    const [lvl, pos] = await Promise.all([levels(guild.id, pool), mainPositions(guild.id, pool)]);
    const captains = pickCaptains(interaction.user.id, pool, (x) => lvl.get(x));
    const display = new Map();
    for (const id of pool) display.set(id, guild.members.cache.get(id)?.displayName || 'Player');
    const d = {
      guildId: guild.id,
      guildName: guild.name,
      captains,
      names: captains.map((c) => display.get(c)),
      teams: [[captains[0]], [captains[1]]],
      pool: new Set(pool.filter((x) => !captains.includes(x))),
      order: pickOrder(pool.length - 2),
      picks: 0,
      lvl,
      pos,
      display,
      done: false,
      vcId,
      lobbies: hub.lobbies || [],
      state,
      deadline: Date.now() + PICK_MS,
    };
    const vc = guild.channels.cache.get(vcId);
    const channel = vc?.send ? vc : interaction.channel;
    const message = await channel.send(view(d)).catch(() => null);
    if (!message) return { content: '❌ I couldn\'t post the draft in your lobby\'s chat.' };
    drafts.set(message.id, d);
    d.timer = setTimeout(() => pick(d, message, autoPick(d.pool, (x) => d.lvl.get(x))).catch(() => {}), PICK_MS);
    d.timer.unref?.();
    return { content: `📝 Draft started in <#${channel.id}>: you captain against <@${captains[1]}>.` };
  }

  // Move the second team to an empty lobby
  async function split(interaction, d) {
    const guild = interaction.guild;
    if (!guild.members.me?.permissions?.has(F.MoveMembers)) return '❌ I need **Move Members** to split the teams. Join the empty lobby yourselves instead.';
    const state = await getGuildState(guild.id);
    const empty = d.lobbies.map((k) => guild.channels.cache.get(state.clubVcLinks?.[k])).find((vc) => vc && vc.id !== d.vcId && !vc.members?.size);
    if (!empty) return '😮 Every other lobby has people in it. Split up yourselves.';
    let moved = 0;
    for (const id of d.teams[1]) {
      const m = await guild.members.fetch(id).catch(() => null);
      if (m?.voice?.channelId) moved += await m.voice.setChannel(empty, 'Pickup draft').then(() => 1).catch(() => 0);
    }
    return `🔀 Moved ${moved} of Team ${d.names[1]} to <#${empty.id}>.`;
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('pd_') || !interaction.guildId) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;
    if (id === 'pd_new') {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ ...(await start(interaction)), allowedMentions: NO_PINGS });
      return true;
    }
    const d = drafts.get(interaction.message?.id);
    if (!d) {
      await interaction.reply({ content: '⏱️ This draft has ended (or the bot restarted). Start a new one from the hub board.', flags: 64 });
      return true;
    }
    if (id === 'pd_pick') {
      const turn = d.order[d.picks];
      if (interaction.user.id !== d.captains[turn]) {
        await interaction.reply({ content: `It's <@${d.captains[turn]}>'s pick.`, flags: 64, allowedMentions: NO_PINGS });
        return true;
      }
      await interaction.deferUpdate();
      await pick(d, interaction.message, interaction.values?.[0]);
      return true;
    }
    if (id === 'pd_cancel') {
      if (!d.captains.includes(interaction.user.id)) {
        await interaction.reply({ content: 'Only the captains can cancel the draft.', flags: 64 });
        return true;
      }
      clearTimeout(d.timer);
      drafts.delete(interaction.message.id);
      await interaction.update({ content: '❌ Draft cancelled.', embeds: [], components: [] });
      return true;
    }
    if (id === 'pd_split') {
      await interaction.reply({ content: await split(interaction, d), flags: 64, allowedMentions: NO_PINGS });
      return true;
    }
    return false;
  }

  return { handleInteraction, start, drafts };
}

module.exports = { createHubDraft, pickOrder, pickCaptains, autoPick };
