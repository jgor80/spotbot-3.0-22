// Under the hub's umbrella: hub teams taking on competitions beyond the hub, as the hub.
//   Competitions  the board's Competitions button lists leagues and BYOTs run elsewhere that captains
//                 or admins added (name, link, platform, when), the hub's own league and cup, and
//                 the hub teams entering each one ("representing <hub>"). A captain presses We're in
//                 to list their team; the feed hears about it. Listings expire after 60 days; the
//                 poster or an admin can remove one sooner.
//   Next steps    each captain gets a checklist for their team: EA club linked (results, stats and
//                 lineups then track themselves, and Network BYOTs need it), the hub on the GafferBot
//                 Network (Network Friendlies, BYOTs, Need a Player, the leaderboard), the hub
//                 league and cup, and the outside competitions they're in, with where to press.
//   Own server    a team that outgrows the hub can copy itself to its own server (where the captain has
//                 Manage Server and GafferBot is added): name, EA link, kit and history (matches, club
//                 and player stats, division history) come along; the hub copy stays, marked 🎓, and
//                 the team still shows here as representing the hub.
// Table hub_outside_comps. Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { isServerAdmin } = require('./perm-check.cjs');

const TEAL = 0x1abc9c;
const NO_PINGS = { parse: [] };
const MAX_LISTED = 15;
const SITE = process.env.PUBLIC_SITE_URL || 'https://gafferbot.app';

// ---------- Pure ----------

const cleanText = (raw, max) => String(raw || '').replace(/[@<>*_`~|\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// A link people can open: https only, no spaces, no Discord mentions
function cleanUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    u.protocol = 'https:';
    return u.toString().slice(0, 300);
  } catch {
    return null;
  }
}

// What a team still has to do to compete beyond the hub
function nextSteps({ eaLinked, onNetwork, inLeague, inCup, outside, ownServer = null }) {
  return [
    { done: eaLinked, text: eaLinked ? 'EA club linked: results, stats and lineups track themselves.' : 'Link your EA club: in your desk, **/manager → Admin → Link EA Club**. Results, stats and lineups then track themselves, and Network BYOTs need it.' },
    { done: onNetwork, text: onNetwork ? 'The hub is on the GafferBot Network: **Network Friendly**, **Network BYOT** and **Need a Player** are in **/manager → Casual Play**.' : 'The hub isn\'t on the GafferBot Network yet. A server admin turns it on with **/manager → Admin → Network Setup**; then you can play Network Friendlies and enter GafferBot BYOTs.' },
    { done: inLeague || inCup, text: inLeague || inCup ? `In the hub ${[inLeague && 'league', inCup && 'cup'].filter(Boolean).join(' and ')}.` : 'Enter the hub league or cup: **Hub League** on the board.' },
    { done: outside.length > 0, text: outside.length ? `Representing the hub in ${outside.join(', ')}.` : 'Find an outside league or BYOT under **Competitions** and press **We\'re in**.' },
    { done: !!ownServer, optional: true, text: ownServer ? `Your own server: **${ownServer}**. You still represent the hub.` : 'Optional: outgrown the hub? **Move to our own server** copies the team, its EA link and its history to a server you run. You stay part of the hub.' },
  ];
}

// ---------- Module ----------

function createHubUmbrella(deps) {
  const { supabase, hubOf, getGuildState } = deps;
  const client = () => deps.client?.();
  const socialHub = () => deps.socialHub?.();

  async function teamsOf(guildId) {
    const [hub, state] = await Promise.all([hubOf(guildId), getGuildState(guildId)]);
    return (hub.teams || []).map((k) => state.clubs.find((c) => c.key === k && c.enabled)).filter(Boolean);
  }

  const isCaptainOf = (member, club) => !!member && !!club && (club.captain_id === member.id || (club.captain_role_id && member.roles?.cache?.has?.(club.captain_role_id)));

  async function listed(guildId) {
    const { data } = await supabase.from('hub_outside_comps').select('*').eq('guild_id', guildId).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(MAX_LISTED);
    return data || [];
  }

  async function hubComps(guildId) {
    const { data } = await supabase.from('hub_competitions').select('kind, name, status, teams').eq('guild_id', guildId).in('status', ['signup', 'running']);
    return data || [];
  }

  async function feedPost(guild, content) {
    const hub = await hubOf(guild.id);
    const ch = hub.feed_channel_id ? await guild.channels.fetch(hub.feed_channel_id).catch(() => null) : null;
    if (ch?.send) await ch.send({ content, allowedMentions: NO_PINGS }).catch(() => {});
  }

  // ---------- Views ----------

  async function listCard(guild, member) {
    const [comps, own, teams] = await Promise.all([listed(guild.id), hubComps(guild.id), teamsOf(guild.id)]);
    const mine = teams.filter((t) => isCaptainOf(member, t));
    const admin = isServerAdmin(member);
    const embed = new EmbedBuilder()
      .setTitle(`🌍 Competitions: representing ${guild.name}`.slice(0, 256))
      .setColor(TEAL)
      .setDescription('Leagues and BYOTs hub teams can enter, here and beyond. Captains: press **We\'re in** to play under the hub\'s name. Anyone who knows a good one can ask a captain or admin to add it.');
    if (own.length) {
      embed.addFields({ name: '🏟️ In the hub', value: own.map((c) => `**${c.name}** (${c.status === 'signup' ? 'sign-ups open' : 'under way'}) · ${c.teams.length} team${c.teams.length === 1 ? '' : 's'}`).join('\n') });
    }
    for (const c of comps) {
      embed.addFields({
        name: `${c.platform ? `[${c.platform}] ` : ''}${c.name}`.slice(0, 256),
        value: [
          [c.starts ? `📅 ${c.starts}` : null, c.url ? `[Sign up / rules](${c.url})` : null].filter(Boolean).join(' · ') || null,
          c.note || null,
          c.teams.length ? `🛡️ ${c.teams.map((t) => `**${t.name}**`).join(', ')}` : 'No hub teams in yet.',
        ].filter(Boolean).join('\n').slice(0, 1024),
      });
    }
    if (!comps.length) embed.addFields({ name: 'Outside competitions', value: 'None listed yet. Captains and admins can add one.' });

    const rows = [];
    if (mine.length && comps.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('hu_in')
            .setPlaceholder(`We're in: list ${mine.length === 1 ? mine[0].name : 'your team'} for…`.slice(0, 150))
            .addOptions(comps.map((c) => ({ label: c.name.slice(0, 100), value: c.id, description: (c.starts || c.platform || 'Outside competition').slice(0, 100) })))
        )
      );
    }
    const removable = comps.filter((c) => admin || c.posted_by === member?.id);
    if (removable.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('hu_del').setPlaceholder('Remove a listing').addOptions(removable.map((c) => ({ label: c.name.slice(0, 100), value: c.id })))
        )
      );
    }
    const buttons = [];
    if (mine.length || admin) buttons.push(new ButtonBuilder().setCustomId('hu_add').setLabel('Add a competition').setEmoji('➕').setStyle(ButtonStyle.Primary));
    for (const t of mine.slice(0, 3)) buttons.push(new ButtonBuilder().setCustomId(`hu_team:${t.key}`).setLabel(`${t.name}: next steps`.slice(0, 80)).setEmoji('🧭').setStyle(ButtonStyle.Secondary));
    // Handled by hub-league.cjs
    buttons.push(new ButtonBuilder().setCustomId('hl_open').setLabel('Hub League').setEmoji('🏟️').setStyle(ButtonStyle.Secondary));
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(0, 5)));
    return { embeds: [embed], components: rows, allowedMentions: NO_PINGS };
  }

  async function teamCard(guild, key) {
    const club = (await teamsOf(guild.id)).find((t) => t.key === key);
    if (!club) return { content: '❌ This team is gone.', embeds: [], components: [] };
    const [{ data: net }, own, comps] = await Promise.all([
      supabase.from('network_servers').select('enabled, suspended_at').eq('guild_id', guild.id).maybeSingle(),
      hubComps(guild.id),
      listed(guild.id),
    ]);
    const steps = nextSteps({
      eaLinked: !!club.ea_club_id,
      onNetwork: !!net?.enabled && !net?.suspended_at,
      inLeague: own.some((c) => c.kind === 'league' && c.teams.some((t) => t.key === key)),
      inCup: own.some((c) => c.kind === 'cup' && c.teams.some((t) => t.key === key)),
      outside: comps.filter((c) => c.teams.some((t) => t.key === key)).map((c) => c.name),
      ownServer: (await hubOf(guild.id)).alumni?.[key]?.guild_name || null,
    });
    const embed = new EmbedBuilder()
      .setTitle(`🧭 ${club.name}: take the team further`)
      .setColor(TEAL)
      .setDescription(`${steps.map((s) => `${s.done ? '✅' : s.optional ? '➖' : '⬜'} ${s.text}`).join('\n\n')}\n\nYou stay part of **${guild.name}** wherever you play.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hu_list').setLabel('Competitions').setEmoji('🌍').setStyle(ButtonStyle.Secondary),
      // Handled by hub-league.cjs
      new ButtonBuilder().setCustomId('hl_open').setLabel('Hub League').setEmoji('🏟️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`hu_move:${key}`).setLabel('Move to our own server').setEmoji('🎓').setStyle(ButtonStyle.Secondary)
    );
    return { content: '', embeds: [embed], components: [row], allowedMentions: NO_PINGS };
  }

  // ---------- Changes ----------

  async function add(guild, member, fields) {
    const name = cleanText(fields.name, 80);
    if (name.length < 3) return '❌ Give it a name of at least 3 letters.';
    const url = fields.url ? cleanUrl(fields.url) : null;
    if (fields.url && !url) return '❌ That link doesn\'t look right. Paste the full https:// link, or leave it empty.';
    const row = { guild_id: guild.id, name, url, platform: cleanText(fields.platform, 20) || null, starts: cleanText(fields.starts, 60) || null, note: cleanText(fields.note, 200) || null, posted_by: member.id };
    const { error } = await supabase.from('hub_outside_comps').insert(row);
    if (error) return `❌ ${error.message}`;
    await feedPost(guild, `🌍 New competition for hub teams: **${name}**${row.platform ? ` [${row.platform}]` : ''}${row.starts ? `, ${row.starts}` : ''}. Captains: **Competitions** on the hub board → **We're in**.`);
    return `✅ **${name}** is listed.`;
  }

  async function weAreIn(guild, member, id) {
    const mine = (await teamsOf(guild.id)).filter((t) => isCaptainOf(member, t));
    if (!mine.length) return '❌ Only team captains can enter a team.';
    const { data: c } = await supabase.from('hub_outside_comps').select('*').eq('guild_id', guild.id).eq('id', id).maybeSingle();
    if (!c) return '❌ That listing is gone.';
    const have = new Set(c.teams.map((t) => t.key));
    const added = mine.filter((t) => !have.has(t.key));
    if (!added.length) return `✅ You're already listed for **${c.name}**.`;
    await supabase.from('hub_outside_comps').update({ teams: [...c.teams, ...added.map((t) => ({ key: t.key, name: t.name }))] }).eq('id', id);
    await feedPost(guild, `🛡️ **${added.map((t) => t.name).join(', ')}** will represent **${guild.name}** in **${c.name}**. Good luck!`);
    return `🛡️ **${added.map((t) => t.name).join(', ')}** listed for **${c.name}**.`;
  }

  async function remove(guild, member, id) {
    const { data: c } = await supabase.from('hub_outside_comps').select('id, name, posted_by').eq('guild_id', guild.id).eq('id', id).maybeSingle();
    if (!c) return '❌ That listing is gone.';
    if (c.posted_by !== member.id && !isServerAdmin(member)) return '❌ Only whoever added it or a server admin can remove it.';
    await supabase.from('hub_outside_comps').delete().eq('id', id);
    return `🗑️ Removed **${c.name}**.`;
  }

  // ---------- Own server ----------

  // Servers with GafferBot where this player has Manage Server (not the hub itself)
  async function ownServers(guild, userId) {
    const out = [];
    for (const g of [...(client()?.guilds?.cache?.values?.() || [])].slice(0, 200)) {
      if (g.id === guild.id) continue;
      const m = await g.members.fetch(userId).catch(() => null);
      if (m && isServerAdmin(m)) out.push(g);
      if (out.length >= 25) break;
    }
    return out;
  }

  async function moveCard(guild, member, key) {
    const club = (await teamsOf(guild.id)).find((t) => t.key === key);
    if (!club) return { content: '❌ This team is gone.', embeds: [], components: [] };
    const servers = await ownServers(guild, member.id);
    const lines = [
      `🎓 **Move ${club.name} to your own server**`,
      'The team, its EA club link, kit and history (matches, club and player stats, division history) are copied to your server. Nothing is deleted here: the hub copy stays, marked 🎓, and you still represent the hub in its league, cup and competitions.',
      servers.length
        ? 'Pick your server. You need **Manage Server** there.'
        : `I can't see a server where you have **Manage Server** and GafferBot is added. Add GafferBot to your server first (**Add to Discord** on ${SITE}), then press this again.`,
    ];
    const rows = servers.length
      ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`hu_move_to:${key}`).setPlaceholder('Your server').addOptions(servers.map((g) => ({ label: g.name.slice(0, 100), value: g.id }))))]
      : [];
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`hu_team:${key}`).setLabel('Back').setStyle(ButtonStyle.Secondary)));
    return { content: lines.join('\n\n'), embeds: [], components: rows, allowedMentions: NO_PINGS };
  }

  async function doMove(guild, member, key, targetId) {
    const target = client()?.guilds?.cache?.get(targetId);
    if (!target) return '❌ I\'m not in that server any more.';
    const r = await socialHub().moveTeam(guild, member, key, target).catch((err) => ({ error: err.message }));
    if (r.error) return `❌ ${r.error}`;
    const games = r.copied?.club_matches || 0;
    await feedPost(guild, `🎓 **${r.club.name}** now has its own server, **${target.name}**, and still represents **${guild.name}**. Good luck!`);
    return `🎓 **${r.club.name}** is set up in **${target.name}** with ${games} game${games === 1 ? '' : 's'} of history. In **${target.name}**, run **/setup** to give it channels, then **/manager** to run it. You're still in the hub's league, cup and competitions.`;
  }

  // ---------- Interactions ----------

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('hu_') || !interaction.guildId) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;
    const guild = interaction.guild;
    const member = interaction.member?.roles?.cache ? interaction.member : await guild.members.fetch(interaction.user.id).catch(() => null);
    const fromCard = interaction.message?.flags?.has?.(64);
    const [action, arg] = id.split(':');

    if (action === 'hu_list' || action === 'hu_team') {
      if (action === 'hu_team') {
        const club = (await teamsOf(guild.id)).find((t) => t.key === arg);
        if (!isCaptainOf(member, club) && !isServerAdmin(member)) {
          await interaction.reply({ content: '❌ Only the team\'s captains can see this.', flags: 64 });
          return true;
        }
      }
      if (fromCard) await interaction.deferUpdate();
      else await interaction.deferReply({ flags: 64 });
      await interaction.editReply(action === 'hu_list' ? await listCard(guild, member) : await teamCard(guild, arg));
      return true;
    }
    if (action === 'hu_move' || action === 'hu_move_to') {
      const club = (await teamsOf(guild.id)).find((t) => t.key === arg);
      if (!isCaptainOf(member, club)) {
        await interaction.reply({ content: '❌ Only the team\'s captains can move it.', flags: 64 });
        return true;
      }
      if (action === 'hu_move') {
        if (fromCard) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: 64 });
        await interaction.editReply(await moveCard(guild, member, arg));
        return true;
      }
      await interaction.deferUpdate();
      await interaction.editReply({ content: '🎓 Copying the team and its history…', embeds: [], components: [] });
      await interaction.editReply({ content: await doMove(guild, member, arg, interaction.values[0]), components: [] });
      return true;
    }
    if (action === 'hu_add' && interaction.isButton?.()) {
      const captain = (await teamsOf(guild.id)).some((t) => isCaptainOf(member, t));
      if (!captain && !isServerAdmin(member)) {
        await interaction.reply({ content: '❌ Team captains and server admins can add competitions.', flags: 64 });
        return true;
      }
      const field = (fid, label, max, required, placeholder) =>
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(fid).setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(max).setRequired(required).setPlaceholder(placeholder));
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId('hu_add_m')
          .setTitle('Add a competition')
          .addComponents(
            field('name', 'Name', 80, true, 'e.g. VPG Division 4, Friday BYOT Cup'),
            field('url', 'Link to sign up or the rules', 300, false, 'https://…'),
            field('platform', 'Platform', 20, false, 'e.g. PS5, Xbox, Crossplay'),
            field('starts', 'When', 60, false, 'e.g. Sign-ups close 20 Nov, Fridays 8pm UK'),
            field('note', 'Anything else', 200, false, 'e.g. 6v6, no entry fee')
          )
      );
      return true;
    }
    if (action === 'hu_add_m' && interaction.isModalSubmit?.()) {
      await interaction.deferReply({ flags: 64 });
      const get = (k) => interaction.fields.getTextInputValue(k);
      await interaction.editReply({ content: await add(guild, member, { name: get('name'), url: get('url'), platform: get('platform'), starts: get('starts'), note: get('note') }) });
      return true;
    }
    if (action === 'hu_in' && interaction.isStringSelectMenu?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: await weAreIn(guild, member, interaction.values[0]) });
      return true;
    }
    if (action === 'hu_del' && interaction.isStringSelectMenu?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: await remove(guild, member, interaction.values[0]) });
      return true;
    }
    return false;
  }

  return { handleInteraction, listCard, teamCard, moveCard, add, weAreIn, remove };
}

module.exports = { createHubUmbrella, cleanUrl, cleanText, nextSteps };
