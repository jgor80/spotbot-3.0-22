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
//   Balanced     Balanced teams skips the draft: the pool is split into two even sides by hub rating.
//   Rating       after the game a captain reports the result (once; the other captain can undo it for
//                10 minutes) and every player's hub rating (hub_players.rating, Elo from 1000) moves.
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
const START_RATING = 1000;
const K = 32;
const UNDO_MS = 10 * 60 * 1000;

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

// Elo for two teams by their average rating; scoreA is 1 (A won), 0.5 (draw) or 0 (B won).
// Returns the points each player on A gains (B loses the same).
function eloDelta(ratingsA, ratingsB, scoreA) {
  const avg = (l) => l.reduce((n, x) => n + x, 0) / Math.max(1, l.length);
  const expected = 1 / (1 + 10 ** ((avg(ratingsB) - avg(ratingsA)) / 400));
  return Math.round(K * (scoreA - expected));
}

// Two even sides by rating: snake by rating, then swap pairs while it narrows the gap
function balance(ids, ratingOf) {
  const sorted = [...ids].sort((a, b) => ratingOf(b) - ratingOf(a));
  const teams = [[], []];
  sorted.forEach((id, i) => teams[[0, 1, 1, 0][i % 4]].push(id));
  const sum = (t) => t.reduce((n, id) => n + ratingOf(id), 0) / Math.max(1, t.length);
  let gap = Math.abs(sum(teams[0]) - sum(teams[1]));
  for (let improved = true, rounds = 0; improved && rounds < 50; rounds++) {
    improved = false;
    for (let i = 0; i < teams[0].length; i++) {
      for (let j = 0; j < teams[1].length; j++) {
        [teams[0][i], teams[1][j]] = [teams[1][j], teams[0][i]];
        const g = Math.abs(sum(teams[0]) - sum(teams[1]));
        if (g + 0.01 < gap) {
          gap = g;
          improved = true;
        } else [teams[0][i], teams[1][j]] = [teams[1][j], teams[0][i]];
      }
    }
  }
  return { teams, gap: Math.round(gap) };
}

function createHubDraft(deps) {
  const { supabase, hubOf, getGuildState, getUserPrefs } = deps;
  const drafts = new Map(); // messageId -> draft

  async function playerRows(guildId, ids) {
    if (!ids.length) return { lvl: new Map(), rating: new Map() };
    const { data } = await supabase.from('hub_players').select('discord_user_id, xp, rating').eq('guild_id', guildId).in('discord_user_id', ids);
    return {
      lvl: new Map((data || []).map((r) => [r.discord_user_id, levelFor(r.xp)])),
      rating: new Map((data || []).map((r) => [r.discord_user_id, r.rating ?? START_RATING])),
    };
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

  const ratingOf = (d, id) => d.rating.get(id) ?? START_RATING;
  function label(d, id) {
    const pos = d.pos.get(id);
    return `<@${id}>${pos ? ` ${pos}` : ''} · L${d.lvl.get(id) || 1} · ${ratingOf(d, id)}`;
  }
  const teamRating = (d, i) => Math.round(d.teams[i].reduce((n, id) => n + ratingOf(d, id), 0) / Math.max(1, d.teams[i].length));

  function view(d) {
    const turn = d.done ? null : d.order[d.picks];
    const embed = new EmbedBuilder()
      .setTitle(d.done ? `🏁 ${d.balanced ? 'Balanced teams' : 'Pickup draft'}: teams are in` : `📝 Pickup draft · pick ${d.picks + 1} of ${d.order.length}`)
      .setColor(ORANGE)
      .setDescription(
        d.result
          ? d.result.text
          : d.done
            ? 'Good luck! **Split into lobbies** sends the second team to its own lobby. After the game, a captain reports the result and everyone\'s hub rating moves.'
            : `<@${d.captains[turn]}> is on the clock: pick from the menu. Auto pick <t:${Math.floor(d.deadline / 1000)}:R>.`
      )
      .addFields(
        { name: `🟠 Team ${d.names[0]} · ${teamRating(d, 0)}`, value: d.teams[0].map((id) => `${id === d.captains[0] ? '👑 ' : ''}${label(d, id)}`).join('\n') || '—', inline: true },
        { name: `🔵 Team ${d.names[1]} · ${teamRating(d, 1)}`, value: d.teams[1].map((id) => `${id === d.captains[1] ? '👑 ' : ''}${label(d, id)}`).join('\n') || '—', inline: true }
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
    } else if (d.done && !d.result) {
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pd_split').setLabel('Split into lobbies').setEmoji('🔀').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pd_res:0').setLabel(`${d.names[0]} won`.slice(0, 80)).setEmoji('🟠').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pd_res:1').setLabel(`${d.names[1]} won`.slice(0, 80)).setEmoji('🔵').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pd_res:d').setLabel('Draw').setStyle(ButtonStyle.Secondary)
      ));
    } else if (d.result && Date.now() - d.result.at < UNDO_MS) {
      rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pd_undo').setLabel('Undo result').setStyle(ButtonStyle.Secondary)));
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

  async function start(interaction, balanced = false) {
    const guild = interaction.guild;
    const vcId = interaction.member?.voice?.channelId;
    const { ids, state, hub } = await online(guild);
    if (!vcId || !ids.includes(interaction.user.id)) return { content: '🔊 Join a lobby voice channel first: the draft pool is everyone in the hub\'s voice channels.' };
    if (ids.length < MIN_POOL) return { content: `👥 A draft needs at least ${MIN_POOL} people in the hub's voice channels (${ids.length} now).` };
    const pool = ids.slice(0, MAX_POOL);
    const [{ lvl, rating }, pos] = await Promise.all([playerRows(guild.id, pool), mainPositions(guild.id, pool)]);
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
      rating,
      pos,
      display,
      done: false,
      vcId,
      lobbies: hub.lobbies || [],
      state,
      deadline: Date.now() + PICK_MS,
    };
    if (balanced) {
      const { teams } = balance(pool, (x) => rating.get(x) ?? START_RATING);
      d.teams = teams;
      // The highest rated on each side captains it (they report the result)
      d.captains = teams.map((t) => [...t].sort((a, b) => (rating.get(b) ?? START_RATING) - (rating.get(a) ?? START_RATING))[0]);
      d.names = d.captains.map((c) => display.get(c));
      d.pool = new Set();
      d.done = true;
      d.balanced = true;
    }
    const vc = guild.channels.cache.get(vcId);
    const channel = vc?.send ? vc : interaction.channel;
    const message = await channel.send(view(d)).catch(() => null);
    if (!message) return { content: '❌ I couldn\'t post the teams in your lobby\'s chat.' };
    drafts.set(message.id, d);
    if (balanced) return { content: `⚖️ Balanced teams are up in <#${channel.id}>.` };
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

  // Save every player's new rating; sign is +1 to apply, -1 to undo
  async function applyRatings(d, deltaA, sign) {
    const ids = [...d.teams[0], ...d.teams[1]];
    const { data } = await supabase.from('hub_players').select('discord_user_id, rating, rated_games').eq('guild_id', d.guildId).in('discord_user_id', ids);
    const rows = new Map((data || []).map((r) => [r.discord_user_id, r]));
    for (const [i, team] of d.teams.entries()) {
      for (const id of team) {
        const r = rows.get(id) || {};
        const rating = (r.rating ?? START_RATING) + sign * (i === 0 ? deltaA : -deltaA);
        const rated = Math.max(0, (r.rated_games || 0) + sign);
        d.rating.set(id, rating);
        const { error } = await supabase.from('hub_players').upsert({ guild_id: d.guildId, discord_user_id: id, rating, rated_games: rated }, { onConflict: 'guild_id,discord_user_id' });
        if (error) console.warn(`[hub-draft] rating save failed: ${error.message}`);
      }
    }
  }

  async function report(d, who, which) {
    const scoreA = which === '0' ? 1 : which === '1' ? 0 : 0.5;
    const before = [0, 1].map((i) => d.teams[i].map((id) => ratingOf(d, id)));
    const delta = eloDelta(before[0], before[1], scoreA);
    await applyRatings(d, delta, 1);
    const winner = scoreA === 0.5 ? null : d.names[scoreA === 1 ? 0 : 1];
    d.result = {
      at: Date.now(),
      by: who,
      delta,
      text: `${winner ? `🏆 **Team ${winner} won.**` : '🤝 **Draw.**'} Ratings moved ${Math.abs(delta)} point${Math.abs(delta) === 1 ? '' : 's'} (reported by <@${who}>; the other captain can undo it for 10 minutes).`,
    };
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('pd_') || !interaction.guildId) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;
    if (id === 'pd_new' || id === 'pd_bal') {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ ...(await start(interaction, id === 'pd_bal')), allowedMentions: NO_PINGS });
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
    if (id.startsWith('pd_res:') || id === 'pd_undo') {
      if (!d.captains.includes(interaction.user.id)) {
        await interaction.reply({ content: 'Only the two captains can report the result.', flags: 64 });
        return true;
      }
      if (id === 'pd_undo') {
        if (!d.result || interaction.user.id === d.result.by || Date.now() - d.result.at > UNDO_MS) {
          await interaction.reply({ content: 'Only the other captain can undo a result, within 10 minutes.', flags: 64 });
          return true;
        }
        await interaction.deferUpdate();
        await applyRatings(d, d.result.delta, -1);
        d.result = null;
        await interaction.message.edit(view(d)).catch(() => {});
        return true;
      }
      if (d.result) {
        await interaction.reply({ content: 'The result is already in.', flags: 64 });
        return true;
      }
      await interaction.deferUpdate();
      await report(d, interaction.user.id, id.split(':')[1]);
      await interaction.message.edit(view(d)).catch(() => {});
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

module.exports = { createHubDraft, pickOrder, pickCaptains, autoPick, eloDelta, balance, START_RATING };
