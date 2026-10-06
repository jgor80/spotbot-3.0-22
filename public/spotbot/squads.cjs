// Squads and club leaders: link a club to a web team (First XI, Academy...), name its captain and
// managers, and /lfg so clubs on the same server can find friendlies.
// On a server where nobody has been named, any manager role can run every club (the old behaviour).

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { resolveClub, activeClubs } = require('./manager-hub.cjs');
const { isServerAdmin } = require('./perm-check.cjs');
const T = require('./event-time.cjs');

const SQUAD_COMMANDS = [
  {
    name: 'squad',
    description: 'Link this club to a squad and name its captain and managers.',
    options: [
      {
        type: 1,
        name: 'link',
        description: 'Link the club for your voice channel (or the current club) to a squad.',
        options: [{ name: 'team', description: 'Squad name, e.g. First XI or Academy. Created if it does not exist.', type: 3, required: true }],
      },
      {
        type: 1,
        name: 'captain',
        description: "Set the club's captain (server admins only).",
        options: [{ name: 'user', description: 'The captain.', type: 6, required: true }],
      },
      {
        type: 1,
        name: 'manager',
        description: 'Add or remove a club manager (admins or the captain).',
        options: [{ name: 'user', description: 'The manager to add or remove.', type: 6, required: true }],
      },
      { type: 1, name: 'info', description: "Show the club's squad, captain and managers." },
    ],
  },
  {
    name: 'lfg',
    description: 'Look for a friendly or scrim against another club on this server.',
    options: [
      { name: 'when', description: 'When you want to play, e.g. "9pm", "thu 21:00" or "now". Shown in each reader\'s local time.', type: 3, required: false },
      { name: 'note', description: 'Anything else, e.g. "need a GK" or "best of 3".', type: 3, required: false },
    ],
  },
];


function createSquads(deps) {
  const { supabase, getGuildState, saveGuildSettings, isManager } = deps;

  async function loadTeam(club) {
    if (!club?.team_id) return null;
    const { data } = await supabase
      .from('teams')
      .select('id, name, captain_discord_id, manager_discord_ids')
      .eq('id', club.team_id)
      .maybeSingle();
    return data;
  }

  function leaders(team) {
    return [team?.captain_discord_id, ...(team?.manager_discord_ids || [])].filter(Boolean);
  }

  // Can this member run match night for this club? Admins always can. Once a club has a named
  // captain or managers, only they can; otherwise any manager role can.
  async function canManageClub(member, club) {
    if (isServerAdmin(member)) return true;
    const team = await loadTeam(club);
    const named = leaders(team);
    if (named.length) return named.includes(member?.id || member?.user?.id);
    return isManager(member);
  }

  // ---------- /squad ----------

  async function squadInfoEmbed(club, team) {
    const embed = new EmbedBuilder().setTitle(`🛡️ ${club.name}`).setColor(0x5865f2);
    if (!team) {
      return embed.setDescription('Not linked to a squad yet. Run `/squad link` to link it, then name a captain with `/squad captain`.');
    }
    return embed.addFields(
      { name: 'Squad', value: team.name, inline: true },
      { name: 'Captain', value: team.captain_discord_id ? `<@${team.captain_discord_id}>` : 'None yet', inline: true },
      { name: 'Managers', value: (team.manager_discord_ids || []).map((id) => `<@${id}>`).join(' ') || 'None yet', inline: true }
    );
  }

  async function handleSquad(interaction) {
    const sub = interaction.options.getSubcommand();
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club) {
      await interaction.reply({ content: '❌ No club is set up yet. Run `/setclub` first.', flags: 64 });
      return;
    }
    const team = await loadTeam(club);

    if (sub === 'info') {
      await interaction.reply({ embeds: [await squadInfoEmbed(club, team)], flags: 64 });
      return;
    }

    if (sub === 'link') {
      if (!isServerAdmin(interaction.member) && !(await canManageClub(interaction.member, club))) {
        await interaction.reply({ content: '❌ Only server admins or this club\'s leaders can link it.', flags: 64 });
        return;
      }
      const name = interaction.options.getString('team').trim().slice(0, 60);
      let { data: target } = await supabase
        .from('teams')
        .select('id, name, captain_discord_id, manager_discord_ids')
        .eq('guild_id', interaction.guildId)
        .ilike('name', name)
        .limit(1)
        .maybeSingle();
      if (!target) {
        const { data: created, error } = await supabase
          .from('teams')
          .insert({ guild_id: interaction.guildId, name, team_type: 'comp', active: true, manager_discord_ids: [] })
          .select('id, name, captain_discord_id, manager_discord_ids')
          .single();
        if (error) {
          await interaction.reply({ content: `❌ Could not create the squad: ${error.message}`, flags: 64 });
          return;
        }
        target = created;
      }
      const other = activeClubs(state).find((c) => c.team_id === target.id && c.key !== club.key);
      if (other) {
        await interaction.reply({ content: `❌ **${target.name}** is already linked to ${other.name}.`, flags: 64 });
        return;
      }
      club.team_id = target.id;
      await saveGuildSettings(interaction.guildId, state);
      await interaction.reply({
        content: `✅ ${club.name} is now the **${target.name}** squad. Its lineups, team sheet and leaders follow this link.`,
        embeds: [await squadInfoEmbed(club, target)],
        flags: 64,
      });
      return;
    }

    if (!team) {
      await interaction.reply({ content: '❌ Link this club to a squad first with `/squad link`.', flags: 64 });
      return;
    }
    const user = interaction.options.getUser('user');

    if (sub === 'captain') {
      if (!isServerAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ Only server admins can set the captain.', flags: 64 });
        return;
      }
      const { data: updated, error } = await supabase
        .from('teams')
        .update({ captain_discord_id: user.id })
        .eq('id', team.id)
        .select('id, name, captain_discord_id, manager_discord_ids')
        .single();
      if (error) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
        return;
      }
      await interaction.reply({ content: `✅ <@${user.id}> is captain of ${club.name}.`, embeds: [await squadInfoEmbed(club, updated)], flags: 64 });
      return;
    }

    if (sub === 'manager') {
      const callerId = interaction.user.id;
      if (!isServerAdmin(interaction.member) && team.captain_discord_id !== callerId) {
        await interaction.reply({ content: '❌ Only server admins or the captain can change managers.', flags: 64 });
        return;
      }
      const current = team.manager_discord_ids || [];
      const removing = current.includes(user.id);
      const next = removing ? current.filter((id) => id !== user.id) : [...current, user.id].slice(0, 10);
      const { data: updated, error } = await supabase
        .from('teams')
        .update({ manager_discord_ids: next })
        .eq('id', team.id)
        .select('id, name, captain_discord_id, manager_discord_ids')
        .single();
      if (error) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
        return;
      }
      await interaction.reply({
        content: removing ? `✅ <@${user.id}> is no longer a manager of ${club.name}.` : `✅ <@${user.id}> is now a manager of ${club.name}.`,
        embeds: [await squadInfoEmbed(club, updated)],
        flags: 64,
      });
    }
  }

  // ---------- /lfg ----------

  async function handleLfg(interaction) {
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club) {
      await interaction.reply({ content: '❌ No club is set up yet. Run `/setclub` first.', flags: 64 });
      return;
    }
    if (!(await canManageClub(interaction.member, club))) {
      await interaction.reply({ content: `❌ Only ${club.name}'s leaders can look for games.`, flags: 64 });
      return;
    }
    const whenText = interaction.options.getString('when') || 'now';
    // Show a parsed time as a Discord timestamp so every server sees it in their own timezone
    const { data: prefs } = await supabase.from('guild_settings').select('timezone').eq('guild_id', interaction.guildId).maybeSingle();
    const at = whenText.trim().toLowerCase() === 'now' ? null : T.parseWhen(whenText, T.isValidTimeZone(prefs?.timezone) ? prefs.timezone : 'UTC');
    const when = at ? `<t:${T.unix(at)}:F> (<t:${T.unix(at)}:R>)` : whenText.slice(0, 100);
    const note = interaction.options.getString('note');

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${club.name} is looking for a friendly`)
      .setColor(0xeb459e)
      .addFields({ name: 'When', value: when, inline: true }, { name: 'Contact', value: `<@${interaction.user.id}>`, inline: true })
      .setTimestamp(new Date());
    if (note) embed.setDescription(note.slice(0, 500));

    await interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`lfg_accept:${club.key}:${interaction.user.id}`).setLabel('Accept').setEmoji('🤝').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`lfg_cancel:${club.key}:${interaction.user.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        ),
      ],
    });
  }

  async function handleLfgButton(interaction, action, clubKey, posterId) {
    const state = await getGuildState(interaction.guildId);
    const posting = activeClubs(state).find((c) => c.key === clubKey);
    const original = interaction.message.embeds[0];

    if (action === 'lfg_cancel') {
      if (interaction.user.id !== posterId && !isServerAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ Only the person who posted this can cancel it.', flags: 64 });
        return;
      }
      await interaction.update({
        embeds: [EmbedBuilder.from(original).setTitle(`~~${original.title}~~ (cancelled)`).setColor(0x99aab5)],
        components: [],
      });
      return;
    }

    const opponent = resolveClub(state, interaction.member);
    if (!opponent || opponent.key === clubKey) {
      await interaction.reply({
        content: '❌ Join your own club\'s voice channel first so I know which club is accepting.',
        flags: 64,
      });
      return;
    }
    if (!(await canManageClub(interaction.member, opponent))) {
      await interaction.reply({ content: `❌ Only ${opponent.name}'s leaders can accept for them.`, flags: 64 });
      return;
    }

    await interaction.update({
      embeds: [
        EmbedBuilder.from(original)
          .setTitle(`✅ Friendly on: ${posting?.name || 'Club'} vs ${opponent.name}`)
          .setColor(0x57f287)
          .addFields({ name: 'Accepted by', value: `<@${interaction.user.id}> (${opponent.name})`, inline: true }),
      ],
      components: [],
    });
    await interaction.followUp({
      content: `🤝 <@${posterId}> <@${interaction.user.id}>: ${posting?.name || 'your club'} vs ${opponent.name} is on. Sort out the invite in DMs. After the game, \`/syncclub\` pulls in the stats.`,
      allowedMentions: { users: [posterId, interaction.user.id] },
    });
  }

  async function handleCommand(interaction, cmd) {
    if (cmd === 'squad') {
      await handleSquad(interaction);
      return true;
    }
    if (cmd === 'lfg') {
      await handleLfg(interaction);
      return true;
    }
    return false;
  }

  async function handleButton(interaction) {
    const [action, clubKey, posterId] = interaction.customId.split(':');
    if (action !== 'lfg_accept' && action !== 'lfg_cancel') return false;
    await handleLfgButton(interaction, action, clubKey, posterId);
    return true;
  }

  return { commands: SQUAD_COMMANDS, handleCommand, handleButton, canManageClub, loadTeam };
}

module.exports = { createSquads, SQUAD_COMMANDS };
