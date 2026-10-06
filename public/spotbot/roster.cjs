// /roster: who is in the club, their positions and status (active, injured, away, trial, inactive).
// The roster drives the event board's "No answer yet" list and reminders. `/roster view` groups
// players by position so a manager can see who covers what at a glance.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { resolveClub } = require('./manager-hub.cjs');
const { toInsightMatches } = require('./club-insights.cjs');
const { aggregate } = require('./club-stats.cjs');

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const LINES = [
  { label: '🧤 Goalkeepers', positions: ['GK'] },
  { label: '🛡️ Defenders', positions: ['LB', 'CB', 'RB', 'LWB', 'RWB'] },
  { label: '⚙️ Midfielders', positions: ['CDM', 'CM', 'CAM', 'LM', 'RM'] },
  { label: '⚡ Attackers', positions: ['LW', 'RW', 'CF', 'ST'] },
];
const STATUSES = {
  active: { label: 'Active', emoji: '🟢' },
  trial: { label: 'Trial', emoji: '🧪' },
  injured: { label: 'Injured', emoji: '🚑' },
  away: { label: 'Away', emoji: '✈️' },
  inactive: { label: 'Inactive', emoji: '💤' },
};
const ROLES = { player: 'Player', sub: 'Sub', captain: 'Captain', manager: 'Manager' };
const MAX_IMPORT = 60;

const positionChoices = POSITIONS.map((p) => ({ name: p, value: p }));
const statusChoices = Object.entries(STATUSES).map(([value, s]) => ({ name: s.label, value }));

const ROSTER_COMMANDS = [
  {
    name: 'roster',
    description: "Manage your club's roster: players, positions and status.",
    options: [
      {
        type: 1,
        name: 'view',
        description: 'Show the roster grouped by position (or by status).',
        options: [
          {
            name: 'by',
            description: 'How to group it.',
            type: 3,
            required: false,
            choices: [
              { name: 'Position', value: 'position' },
              { name: 'Status', value: 'status' },
            ],
          },
          { name: 'position', description: 'Only players who play this position.', type: 3, required: false, choices: positionChoices },
        ],
      },
      {
        type: 1,
        name: 'add',
        description: 'Add a player (or update their positions).',
        options: [
          { name: 'user', description: 'The player.', type: 6, required: true },
          { name: 'position', description: 'Main position.', type: 3, required: false, choices: positionChoices },
          { name: 'secondary', description: 'Second position.', type: 3, required: false, choices: positionChoices },
          {
            name: 'role',
            description: 'Squad role.',
            type: 3,
            required: false,
            choices: Object.entries(ROLES).map(([value, name]) => ({ name, value })),
          },
          { name: 'status', description: 'Status (default Active).', type: 3, required: false, choices: statusChoices },
        ],
      },
      {
        type: 1,
        name: 'remove',
        description: 'Move a player to Inactive (keeps their history), or delete them from the roster.',
        options: [
          { name: 'user', description: 'The player.', type: 6, required: true },
          { name: 'delete', description: 'Delete them from the roster instead of setting Inactive.', type: 5, required: false },
        ],
      },
      {
        type: 1,
        name: 'player',
        description: "Leaders only: a player's roster details, EA stats and recent answers.",
        options: [{ name: 'user', description: 'The player.', type: 6, required: true }],
      },
      {
        type: 1,
        name: 'status',
        description: "Set a player's status, e.g. injured or away.",
        options: [
          { name: 'user', description: 'The player.', type: 6, required: true },
          { name: 'status', description: 'New status.', type: 3, required: true, choices: statusChoices },
          { name: 'note', description: 'e.g. "back next week".', type: 3, required: false },
        ],
      },
      {
        type: 1,
        name: 'import',
        description: 'Add everyone with a role to the roster (their position roles fill in positions).',
        options: [{ name: 'role', description: 'Role to import, e.g. @First Team.', type: 8, required: true }],
      },
    ],
  },
];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const { isServerAdmin } = require('./perm-check.cjs');

function createRoster(deps) {
  const { supabase, getGuildState, saveGuildSettings, isManager } = deps;
  const canManageClub = deps.canManageClub || (async (member) => isManager(member));
  // Extra fields under the by-position view, e.g. the recruitment gap radar
  let extraFields = null;

  // A roster belongs to the club's squad; create one named after the club the first time
  async function ensureTeam(guildId, state, club) {
    if (club.team_id) return club.team_id;
    const { data: existing } = await supabase.from('teams').select('id').eq('guild_id', guildId).ilike('name', club.name).limit(1).maybeSingle();
    let teamId = existing?.id;
    if (!teamId) {
      const { data: created, error } = await supabase
        .from('teams')
        .insert({ guild_id: guildId, name: club.name.slice(0, 60), team_type: 'comp', active: true, manager_discord_ids: [] })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      teamId = created.id;
    }
    club.team_id = teamId;
    await saveGuildSettings(guildId, state);
    return teamId;
  }

  async function loadRoster(teamId) {
    const { data } = await supabase
      .from('team_rosters')
      .select('discord_user_id, role, status, primary_position, secondary_position, note')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });
    return data || [];
  }

  // Position from the roster, else the player's position roles or /myprefs
  async function fallbackPositions(guild, userIds) {
    const result = new Map();
    if (!userIds.length) return result;
    const { data: prefs } = await supabase.from('position_preferences').select('user_id, preferences').eq('guild_id', guild.id).in('user_id', userIds);
    for (const p of prefs || []) {
      const list = (p.preferences || []).filter((x) => POSITIONS.includes(x));
      if (list.length) result.set(p.user_id, list);
    }
    for (const id of userIds) {
      if (result.has(id)) continue;
      const member = guild.members.cache.get(id);
      const fromRoles = member ? POSITIONS.filter((pos) => member.roles.cache.some((r) => r.name.toUpperCase() === pos)) : [];
      if (fromRoles.length) result.set(id, fromRoles);
    }
    return result;
  }

  function playerLine(r, positions) {
    const status = r.status && r.status !== 'active' ? ` ${STATUSES[r.status]?.emoji || ''}` : '';
    const role = r.role && r.role !== 'player' ? ` *${ROLES[r.role] || r.role}*` : '';
    const pos = positions.length ? ` · ${positions.join('/')}` : '';
    return `<@${r.discord_user_id}>${pos}${role}${status}`;
  }

  async function buildRosterView(guild, club, teamId, by, onlyPosition) {
    const roster = await loadRoster(teamId);
    const embed = new EmbedBuilder().setTitle(`📋 ${club.name} roster`).setColor(0x5865f2);
    if (!roster.length) {
      return embed.setDescription('Nobody on the roster yet. Add players with `/roster add`, or everyone with a role using `/roster import`.');
    }
    const missing = roster.filter((r) => !r.primary_position).map((r) => r.discord_user_id);
    const fallback = await fallbackPositions(guild, missing);
    const positionsOf = (r) => {
      const own = [r.primary_position, r.secondary_position].filter(Boolean);
      return own.length ? own : fallback.get(r.discord_user_id) || [];
    };

    const counts = Object.fromEntries(Object.keys(STATUSES).map((k) => [k, roster.filter((r) => (r.status || 'active') === k).length]));
    embed.setDescription(
      `${roster.length} players · ` +
        Object.entries(STATUSES)
          .filter(([k]) => counts[k])
          .map(([k, s]) => `${s.emoji} ${counts[k]} ${s.label.toLowerCase()}`)
          .join(' · ')
    );

    if (by === 'status') {
      for (const [key, s] of Object.entries(STATUSES)) {
        const list = roster.filter((r) => (r.status || 'active') === key);
        if (!list.length) continue;
        embed.addFields({
          name: `${s.emoji} ${s.label} (${list.length})`,
          value: truncate(list.map((r) => playerLine(r, positionsOf(r)) + (r.note ? ` (${r.note})` : '')).join('\n')),
        });
      }
      return embed;
    }

    // By position: a player shows under each position they cover
    const lines = onlyPosition ? [{ label: onlyPosition, positions: [onlyPosition] }] : LINES;
    const placed = new Set();
    for (const line of lines) {
      const parts = [];
      for (const pos of line.positions) {
        const players = roster.filter((r) => positionsOf(r).includes(pos));
        if (!players.length) continue;
        players.forEach((r) => placed.add(r.discord_user_id));
        const main = players.filter((r) => positionsOf(r)[0] === pos);
        const cover = players.filter((r) => positionsOf(r)[0] !== pos);
        parts.push(
          `**${pos}** (${main.length}${cover.length ? ` + ${cover.length} cover` : ''}): ` +
            [...main, ...cover].map((r) => `<@${r.discord_user_id}>${STATUSES[r.status] && r.status !== 'active' ? STATUSES[r.status].emoji : ''}`).join(' ')
        );
      }
      if (parts.length) embed.addFields({ name: line.label, value: truncate(parts.join('\n')) });
    }
    if (onlyPosition) {
      if (!placed.size) embed.addFields({ name: onlyPosition, value: 'Nobody plays here yet.' });
      return embed;
    }
    const unplaced = roster.filter((r) => !placed.has(r.discord_user_id));
    if (unplaced.length) {
      embed.addFields({ name: `❔ No position yet (${unplaced.length})`, value: truncate(unplaced.map((r) => `<@${r.discord_user_id}>`).join(' ')) });
    }
    const gaps = LINES.flatMap((l) => l.positions).filter((p) => ['GK', 'CB', 'CM', 'ST'].includes(p) && !roster.some((r) => positionsOf(r).includes(p)));
    if (gaps.length) embed.setFooter({ text: `Nobody covers ${gaps.join(', ')} yet` });
    return embed;
  }

  async function handleRoster(interaction) {
    const sub = interaction.options.getSubcommand();
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club) return interaction.reply({ content: '❌ No club is set up yet. Run `/setclub` first.', flags: 64 });

    if (sub === 'view') {
      if (!club.team_id) {
        return interaction.reply({ content: `${club.name} has no roster yet. Add players with \`/roster add\` or \`/roster import\`.`, flags: 64 });
      }
      await interaction.deferReply();
      const by = interaction.options.getString('by') || 'position';
      const embed = await buildRosterView(interaction.guild, club, club.team_id, by, interaction.options.getString('position'));
      if (extraFields && by === 'position' && !interaction.options.getString('position')) {
        const fields = await extraFields(interaction.guildId, club).catch(() => []);
        if (fields.length) embed.addFields(fields.slice(0, 25 - (embed.data.fields?.length || 0)));
      }
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (!(isServerAdmin(interaction.member) || (await canManageClub(interaction.member, club)))) {
      return interaction.reply({ content: `❌ Only ${club.name}'s leaders can change the roster.`, flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    let teamId;
    try {
      teamId = await ensureTeam(interaction.guildId, state, club);
    } catch (err) {
      return interaction.editReply({ content: `❌ Could not set up the roster: ${err.message}` });
    }

    if (sub === 'import') {
      const role = interaction.options.getRole('role');
      await interaction.guild.members.fetch().catch(() => {});
      const members = role.members.filter((m) => !m.user.bot).first(MAX_IMPORT);
      const existing = new Set((await loadRoster(teamId)).map((r) => r.discord_user_id));
      const fresh = members.filter((m) => !existing.has(m.id));
      if (!fresh.length) return interaction.editReply({ content: `Everyone in ${role} is already on the roster.` });
      const rows = fresh.map((m) => {
        const positions = POSITIONS.filter((pos) => m.roles.cache.some((r) => r.name.toUpperCase() === pos));
        return {
          team_id: teamId,
          discord_user_id: m.id,
          role: 'player',
          status: 'active',
          primary_position: positions[0] || null,
          secondary_position: positions[1] || null,
        };
      });
      const { error } = await supabase.from('team_rosters').insert(rows);
      if (error) return interaction.editReply({ content: `❌ ${error.message}` });
      const withPos = rows.filter((r) => r.primary_position).length;
      return interaction.editReply({
        content:
          `✅ Added ${rows.length} players from ${role} to ${club.name}` +
          `${withPos ? ` (${withPos} with positions from their position roles)` : ''}.` +
          `${role.members.size > MAX_IMPORT ? ` I stopped at ${MAX_IMPORT}; run it again for the rest.` : ''} See \`/roster view\`.`,
      });
    }

    const user = interaction.options.getUser('user');
    if (user.bot) return interaction.editReply({ content: '❌ Bots can\'t be on the roster.' });

    if (sub === 'remove') {
      if (interaction.options.getBoolean('delete')) {
        const { data } = await supabase.from('team_rosters').delete().eq('team_id', teamId).eq('discord_user_id', user.id).select('id');
        return interaction.editReply({ content: data?.length ? `✅ Deleted <@${user.id}> from ${club.name}'s roster.` : `<@${user.id}> wasn't on the roster.` });
      }
      const { data } = await supabase.from('team_rosters').update({ status: 'inactive' }).eq('team_id', teamId).eq('discord_user_id', user.id).select('id');
      return interaction.editReply({
        content: data?.length
          ? `💤 <@${user.id}> is now **Inactive** on ${club.name}: off the event boards and reminders, history kept. \`/roster status\` brings them back; \`delete:True\` removes them fully.`
          : `<@${user.id}> wasn't on the roster.`,
      });
    }

    if (sub === 'player') return interaction.editReply(await playerCard(interaction.guildId, club, teamId, user));

    const { data: current } = await supabase.from('team_rosters').select('*').eq('team_id', teamId).eq('discord_user_id', user.id).maybeSingle();

    if (sub === 'status') {
      const status = interaction.options.getString('status');
      const note = interaction.options.getString('note')?.slice(0, 100) || null;
      const row = { team_id: teamId, discord_user_id: user.id, status, note };
      const { error } = current
        ? await supabase.from('team_rosters').update({ status, note }).eq('id', current.id)
        : await supabase.from('team_rosters').insert({ ...row, role: 'player' });
      if (error) return interaction.editReply({ content: `❌ ${error.message}` });
      const s = STATUSES[status];
      const chase = status === 'injured' || status === 'away' || status === 'inactive' ? ' They won\'t be chased for availability until you set them back to Active.' : '';
      return interaction.editReply({ content: `${s.emoji} <@${user.id}> is now **${s.label}**${note ? ` (${note})` : ''}.${chase}` });
    }

    // add
    const position = interaction.options.getString('position');
    const secondary = interaction.options.getString('secondary');
    const role = interaction.options.getString('role');
    const status = interaction.options.getString('status');
    const update = {};
    if (position) update.primary_position = position;
    if (secondary) update.secondary_position = secondary === position ? null : secondary;
    if (role) update.role = role;
    if (status) update.status = status;
    const { error } = current
      ? await supabase.from('team_rosters').update(update).eq('id', current.id)
      : await supabase.from('team_rosters').insert({ team_id: teamId, discord_user_id: user.id, role: role || 'player', status: status || 'active', ...update });
    if (error) return interaction.editReply({ content: `❌ ${error.message}` });
    const pos = [update.primary_position || current?.primary_position, update.secondary_position || current?.secondary_position].filter(Boolean);
    return interaction.editReply({
      content: `✅ <@${user.id}> ${current ? 'updated on' : 'added to'} ${club.name}${pos.length ? ` (${pos.join('/')})` : ''}.`,
    });
  }

  // Leaders' private view of one player: roster entry, EA stats from saved matches, recent answers
  async function playerCard(guildId, club, teamId, user) {
    const [{ data: entry }, { data: profile }, { data: rows }, { data: events }] = await Promise.all([
      supabase.from('team_rosters').select('*').eq('team_id', teamId).eq('discord_user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('ea_username').eq('discord_user_id', user.id).maybeSingle(),
      supabase
        .from('club_matches')
        .select('id, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type')
        .eq('guild_id', guildId)
        .eq('club_key', club.key)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('availability_events')
        .select('id, title, scheduled_at')
        .eq('guild_id', guildId)
        .eq('club_key', club.key)
        .lte('scheduled_at', new Date(Date.now() + 14 * 86400000).toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(8),
    ]);
    const embed = new EmbedBuilder().setTitle(`🔎 ${user.displayName || user.username} · ${club.name}`).setColor(0x5865f2).setThumbnail(user.displayAvatarURL());
    if (entry) {
      const s = STATUSES[entry.status] || STATUSES.active;
      const pos = [entry.primary_position, entry.secondary_position].filter(Boolean).join(' / ') || 'not set';
      embed.addFields(
        { name: 'Status', value: `${s.emoji} ${s.label}${entry.note ? ` (${entry.note})` : ''}`, inline: true },
        { name: 'Positions', value: pos, inline: true },
        { name: 'Role', value: ROLES[entry.role] || entry.role || 'Player', inline: true }
      );
    } else {
      embed.setDescription(`Not on ${club.name}'s roster. Add them with \`/roster add\`.`);
    }
    const ea = profile?.ea_username;
    if (!ea) {
      embed.addFields({ name: 'EA stats', value: 'No EA name linked. They can run `/linkea` and pick their name.' });
    } else {
      const totals = aggregate(toInsightMatches(rows || [])).find((t) => t.name.toLowerCase() === ea.trim().toLowerCase());
      embed.addFields({
        name: `EA stats as ${ea} (last ${(rows || []).length} club matches)`,
        value: totals
          ? `${totals.games} GP · ${totals.goals} G · ${totals.assists} A · ${totals.rating ? totals.rating.toFixed(1) : '–'} Rtg · ${totals.motm} MOTM${totals.pass_attempts ? ` · ${Math.round((100 * totals.passes_made) / totals.pass_attempts)}% Pass` : ''}`
          : 'No club matches under this name yet. If they have played, the name may be misspelt.',
      });
    }
    if (events?.length) {
      const { data: answers } = await supabase
        .from('player_availability')
        .select('event_id, response')
        .eq('discord_user_id', user.id)
        .in('event_id', events.map((e) => e.id));
      const byEvent = new Map((answers || []).map((a) => [a.event_id, a.response]));
      const icon = { yes: '✅', maybe: '❓', no: '❌' };
      embed.addFields({
        name: 'Recent events',
        value: truncate(events.map((e) => `${icon[byEvent.get(e.id)] || '⬜'} ${e.title} · <t:${Math.floor(new Date(e.scheduled_at).getTime() / 1000)}:d>`).join('\n')),
      });
    }
    embed.setFooter({ text: 'Only you can see this · show-up rates: /reliability' });
    return { embeds: [embed], allowedMentions: { parse: [] } };
  }

  async function handleCommand(interaction, cmd) {
    if (cmd !== 'roster') return false;
    await handleRoster(interaction);
    return true;
  }

  return {
    commands: ROSTER_COMMANDS,
    handleCommand,
    ensureTeam,
    loadRoster,
    setExtraFields: (fn) => {
      extraFields = fn;
    },
  };
}

module.exports = { createRoster, ROSTER_COMMANDS };
