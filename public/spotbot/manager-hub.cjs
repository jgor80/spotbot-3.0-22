// Manager hub: /manager, /insights, Call Session roll calls and the hub buttons.
// Kept out of index.cjs; index.cjs passes in the helpers it already has.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const {
  toInsightMatches,
  computeOverview,
  computeCombos,
  computeFormations,
  computeWinLossGaps,
  generateInsights,
  playerKey,
  winPct,
} = require('./club-insights.cjs');
const { areaSelect } = require('./panels.cjs');

const HUB_COLOR = 0x5865f2;
const MATCH_LIMIT = 200;
const FORM_EMOJI = { win: '🟢', draw: '⚪', loss: '🔴' };
const SESSION_RESPONSES = {
  in: { value: 'yes', label: 'In', emoji: '✅', style: ButtonStyle.Success },
  late: { value: 'maybe', label: 'Late', emoji: '🕒', style: ButtonStyle.Secondary },
  out: { value: 'no', label: 'Out', emoji: '❌', style: ButtonStyle.Danger },
};
const LEADERBOARD_TYPES = [
  { value: 'goals', label: 'Goals', emoji: '⚽' },
  { value: 'assists', label: 'Assists', emoji: '🎯' },
  { value: 'overall', label: 'Ratings', emoji: '⭐' },
  { value: 'form', label: 'Form', emoji: '📈' },
];

const HUB_COMMANDS = [
  { name: 'manager', description: 'Manager Hub: roll call, team sheet, sync and stats, plus every club tool by area.' },
  { name: 'insights', description: 'Show pairing chemistry, formation win rates and win vs. loss gaps for your club.' },
];

function activeClubs(state) {
  return (state?.clubs || []).filter((c) => c.enabled !== false);
}

// Pick the club a command is about: explicit key, then the caller's linked voice channel,
// then the server's current club. A server with one club never needs to choose.
function resolveClub(state, member, explicitKey) {
  const clubs = activeClubs(state);
  if (explicitKey) {
    const club = clubs.find((c) => c.key === explicitKey);
    if (club) return club;
  }
  if (clubs.length === 1) return clubs[0];

  const vcId = member?.voice?.channelId;
  if (vcId && state?.clubVcLinks) {
    const linked = Object.entries(state.clubVcLinks).find(([, id]) => id === vcId);
    const club = linked && clubs.find((c) => c.key === linked[0]);
    if (club) return club;
  }

  return clubs.find((c) => c.key === state?.currentClubKey) || clubs[0] || null;
}

function fmtPct(n) {
  return `${Math.round(n)}%`;
}

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function createManagerHub(deps) {
  const {
    supabase,
    callEdgeFunction,
    getGuildState,
    isManager,
    syncClubHistory,
    buildLeaderboardEmbed,
    dashboardUrl,
    buildEventList,
  } = deps;
  // Squad leaders when the club has them, otherwise any manager role
  const canManageClub = deps.canManageClub || (async (member) => isManager(member));

  async function loadMatches(guildId, clubKey) {
    const [{ data: rows, error }, { data: lineups }] = await Promise.all([
      supabase
        .from('club_matches')
        .select('id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, match_data')
        .eq('guild_id', guildId)
        .eq('club_key', clubKey)
        .order('created_at', { ascending: false })
        .limit(MATCH_LIMIT),
      supabase
        .from('lineups')
        .select('formation, created_at')
        .eq('guild_id', guildId)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    if (error) throw new Error(error.message);
    return toInsightMatches(rows || [], lineups || []);
  }

  function clubPicker(customId, clubs, selectedKey) {
    if (clubs.length < 2) return null;
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('Switch club')
        .addOptions(
          clubs.slice(0, 25).map((c) => ({
            label: c.name.slice(0, 100),
            value: c.key,
            default: c.key === selectedKey,
          }))
        )
    );
  }

  // ---------- Hub ----------

  async function buildHub(guildId, state, club) {
    const matches = await loadMatches(guildId, club.key).catch(() => []);
    const o = computeOverview(matches);
    const last = matches[0];

    const embed = new EmbedBuilder()
      .setTitle(`🧭 ${club.name} Manager Hub`)
      .setColor(HUB_COLOR)
      .setDescription(
        'Run match night from here: call the session, publish the team sheet, sync EA matches and check what is working. Everything else is in the **More tools** menu at the bottom.'
      )
      .addFields(
        { name: 'Record', value: o.played ? `${o.wins}W ${o.draws}D ${o.losses}L (${fmtPct(o.winPct)})` : 'No matches synced yet', inline: true },
        { name: 'Form', value: o.form.slice(0, 5).map((r) => FORM_EMOJI[r]).join('') || '–', inline: true },
        { name: 'Clean sheets', value: `${o.cleanSheets}`, inline: true }
      )
      .setFooter({ text: 'Updated' })
      .setTimestamp(new Date());

    if (last) {
      embed.addFields({
        name: 'Last match',
        value: `${FORM_EMOJI[last.result]} ${last.scoreFor}-${last.scoreAgainst} vs ${last.opponent} (<t:${Math.floor(last.playedAt.getTime() / 1000)}:R>)`,
      });
    }
    if (!club.ea_club_id) {
      embed.addFields({ name: 'EA link', value: 'Not linked yet. Run **/manager → Admin → Link EA Club** with your EA club name.' });
    }

    const k = club.key;
    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hub_call:${k}`).setLabel('Call Session').setEmoji('📞').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`hub_sheet:${k}`).setLabel('Team Sheet').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`hub_sync:${k}`).setLabel('Sync Matches').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hub_stats:${k}`).setLabel('Club Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`hub_ins:${k}`).setLabel('Tactical Insights').setEmoji('💡').setStyle(ButtonStyle.Secondary)
      ),
    ];
    const more = [];
    if (buildEventList) {
      more.push(new ButtonBuilder().setCustomId(`hub_events:${k}`).setLabel('Events').setEmoji('📅').setStyle(ButtonStyle.Secondary));
    }
    // Handled by autopilot.cjs
    more.push(new ButtonBuilder().setCustomId(`ap_panel:${k}`).setLabel('Autopilot').setEmoji('🤖').setStyle(ButtonStyle.Secondary));
    rows.push(new ActionRowBuilder().addComponents(more));
    const picker = clubPicker('hub_club', activeClubs(state), k);
    if (picker) rows.push(picker);
    // Every other club tool, by area (panels.cjs)
    rows.push(areaSelect());

    return { embeds: [embed], components: rows };
  }

  // ---------- Club stats ----------

  function topPerformers(matches) {
    const totals = new Map();
    for (const m of matches) {
      for (const p of m.players) {
        const key = playerKey(p);
        if (!key) continue;
        const t = totals.get(key) || { name: p.ea_username.trim(), games: 0, goals: 0, assists: 0, ratingSum: 0, rated: 0 };
        t.games++;
        t.goals += Number(p.goals) || 0;
        t.assists += Number(p.assists) || 0;
        const r = Number(p.rating);
        if (r > 0) {
          t.ratingSum += r;
          t.rated++;
        }
        totals.set(key, t);
      }
    }
    const all = Array.from(totals.values());
    const top = (score, fmt) =>
      all
        .filter((t) => score(t) > 0)
        .sort((a, b) => score(b) - score(a))
        .slice(0, 3)
        .map((t, i) => `${['🥇', '🥈', '🥉'][i]} ${t.name} ${fmt(t)}`)
        .join('\n') || '–';
    return {
      goals: top((t) => t.goals, (t) => `**${t.goals}**`),
      assists: top((t) => t.assists, (t) => `**${t.assists}**`),
      rating: top(
        (t) => (t.rated >= 3 ? t.ratingSum / t.rated : 0),
        (t) => `**${(t.ratingSum / t.rated).toFixed(1)}** (${t.rated} games)`
      ),
    };
  }

  async function buildStats(guildId, club) {
    const matches = await loadMatches(guildId, club.key);
    const o = computeOverview(matches);
    const top = topPerformers(matches);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${club.name} Club Stats`)
      .setColor(0x57f287)
      .setDescription(o.played ? `Last ${o.played} synced matches` : 'No matches synced yet. Press Sync Matches on the hub or run **/manager → Stats & Scouting → Sync Matches**.')
      .addFields(
        { name: 'Record', value: `${o.wins}W ${o.draws}D ${o.losses}L`, inline: true },
        { name: 'Win rate', value: fmtPct(o.winPct), inline: true },
        { name: 'Goals', value: `${o.goalsFor} for, ${o.goalsAgainst} against`, inline: true },
        { name: 'Clean sheets', value: `${o.cleanSheets}`, inline: true },
        { name: 'Possession', value: o.avgPossession !== null ? fmtPct(o.avgPossession) : '–', inline: true },
        { name: 'Pass completion', value: o.passCompletion !== null ? fmtPct(o.passCompletion) : '–', inline: true },
        { name: 'Form (last 10)', value: o.form.map((r) => FORM_EMOJI[r]).join('') || '–' },
        { name: 'Top scorers', value: top.goals, inline: true },
        { name: 'Top assisters', value: top.assists, inline: true },
        { name: 'Best match rating', value: top.rating, inline: true }
      );

    return { embeds: [embed], components: [leaderboardPicker(club.key)] };
  }

  function leaderboardPicker(clubKey, selected) {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`hub_lb:${clubKey}`)
        .setPlaceholder('Show a leaderboard')
        .addOptions(
          LEADERBOARD_TYPES.map((t) => ({ label: t.label, value: t.value, emoji: t.emoji, default: t.value === selected }))
        )
    );
  }

  // ---------- Insights ----------

  async function buildInsights(guildId, club) {
    const matches = await loadMatches(guildId, club.key);
    const embed = new EmbedBuilder().setTitle(`💡 ${club.name} Tactical Insights`).setColor(0xfee75c);

    if (matches.length < 5) {
      embed.setDescription(`Only ${matches.length} synced matches so far. Insights start after 5.`);
      return { embeds: [embed] };
    }

    const takeaways = generateInsights(matches);
    embed.setDescription(
      takeaways.length
        ? takeaways.map((i) => `${i.tone === 'good' ? '✅' : i.tone === 'bad' ? '⚠️' : '•'} ${i.text}`).join('\n')
        : `Based on ${matches.length} matches. No standout patterns yet.`
    );

    const comboLine = (c) =>
      `**${c.names.join(' + ')}**: ${fmtPct(winPct(c.together))} in ${c.together.games} together` +
      (c.apart.games ? ` (${fmtPct(winPct(c.apart))} apart)` : '');
    const duos = computeCombos(matches, 2).slice(0, 3);
    const trios = computeCombos(matches, 3).slice(0, 2);
    if (duos.length) embed.addFields({ name: 'Best duos', value: truncate(duos.map(comboLine).join('\n')) });
    if (trios.length) embed.addFields({ name: 'Best trios', value: truncate(trios.map(comboLine).join('\n')) });

    const formations = computeFormations(matches).slice(0, 4);
    if (formations.length) {
      embed.addFields({
        name: 'Formations',
        value: truncate(
          formations
            .map(
              (f) =>
                `**${f.formation}**: ${fmtPct(winPct(f.record))} in ${f.record.games}, ` +
                `${f.goalsForPerGame.toFixed(1)} scored and ${f.goalsAgainstPerGame.toFixed(1)} conceded per game`
            )
            .join('\n')
        ),
      });
    }

    const gaps = computeWinLossGaps(matches).slice(0, 3);
    if (gaps.length) {
      const fmt = (n, unit) => (unit === '%' ? fmtPct(n) : n.toFixed(1));
      embed.addFields({
        name: 'Wins vs. losses',
        value: gaps.map((g) => `${g.label}: ${fmt(g.inWins, g.unit)} in wins, ${fmt(g.inLosses, g.unit)} in losses`).join('\n'),
      });
    }

    embed.setFooter({ text: `Last ${matches.length} synced matches` });
    return { embeds: [embed] };
  }

  // ---------- Call Session ----------

  async function sessionEmbed(event) {
    const { data: responses } = await supabase
      .from('player_availability')
      .select('discord_user_id, response, responded_at')
      .eq('event_id', event.id)
      .order('responded_at', { ascending: true });

    const embed = new EmbedBuilder()
      .setTitle(`📞 ${event.title}`)
      .setColor(HUB_COLOR)
      .setDescription(event.closed ? 'Roll call closed.' : 'Tap In, Late or Out so the manager can pick the XI.')
      .setFooter({ text: `Session ${event.id.slice(0, 8)}` })
      .setTimestamp(new Date(event.scheduled_at));

    for (const r of Object.values(SESSION_RESPONSES)) {
      const ids = (responses || []).filter((x) => x.response === r.value).map((x) => `<@${x.discord_user_id}>`);
      embed.addFields({ name: `${r.emoji} ${r.label} (${ids.length})`, value: truncate(ids.join(' ') || '–'), inline: true });
    }
    return embed;
  }

  function sessionButtons(eventId) {
    return new ActionRowBuilder().addComponents(
      Object.entries(SESSION_RESPONSES).map(([key, r]) =>
        new ButtonBuilder().setCustomId(`sess_${key}:${eventId}`).setLabel(r.label).setEmoji(r.emoji).setStyle(r.style)
      )
    );
  }

  async function callSession(interaction, club) {
    const { data: event, error } = await supabase
      .from('availability_events')
      .insert({
        guild_id: interaction.guildId,
        title: `${club.name} session tonight`,
        event_type: 'practice',
        scheduled_at: new Date().toISOString(),
        created_by_discord_id: interaction.user.id,
        channel_id: interaction.channelId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const message = await interaction.channel.send({
      content: `@here roll call for **${club.name}** tonight.`,
      embeds: [await sessionEmbed(event)],
      components: [sessionButtons(event.id)],
      allowedMentions: { parse: ['everyone'] },
    });
    await supabase.from('availability_events').update({ message_id: message.id }).eq('id', event.id);
  }

  // ---------- Team Sheet ----------

  async function buildTeamSheet(guildId, club) {
    let query = supabase
      .from('lineups')
      .select('id, name, formation, created_at, team_avg_rating')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (club.team_id) query = query.eq('team_id', club.team_id);
    const { data: lineup } = await query.maybeSingle();

    const embed = new EmbedBuilder().setTitle(`📋 ${club.name} Team Sheet`).setColor(HUB_COLOR);
    const buttons = [];

    if (lineup) {
      const { count } = await supabase
        .from('lineup_slots')
        .select('id', { count: 'exact', head: true })
        .eq('lineup_id', lineup.id)
        .eq('is_substitute', false);
      embed.setDescription(
        `Latest lineup: **${lineup.name || 'Untitled'}** (${lineup.formation}), saved <t:${Math.floor(new Date(lineup.created_at).getTime() / 1000)}:R>.\n` +
          `${count ?? 0} starters picked${lineup.team_avg_rating ? `, average rating ${Math.round(lineup.team_avg_rating)}` : ''}.`
      );
      buttons.push(
        new ButtonBuilder().setCustomId(`hub_announce:${lineup.id}:${club.key}`).setLabel('Announce Lineup').setEmoji('📢').setStyle(ButtonStyle.Success)
      );
    } else {
      embed.setDescription(
        club.team_id
          ? 'No lineup saved for this squad yet. In the Lineup Builder, pick this squad when you save.'
          : 'No saved lineup yet. Build one in the Lineup Builder, using Fill from Voice to place everyone in your voice channel.'
      );
    }
    if (dashboardUrl) {
      buttons.push(
        new ButtonBuilder().setURL(`${dashboardUrl.replace(/\/$/, '')}/teams`).setLabel('Open Lineup Builder').setStyle(ButtonStyle.Link)
      );
    }
    return { embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [] };
  }

  async function announceLineup(interaction, lineupId, club) {
    // Post where the club last announced; fall back to this channel
    let query = supabase
      .from('lineups')
      .select('channel_id')
      .eq('guild_id', interaction.guildId)
      .not('channel_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (club.team_id) query = query.eq('team_id', club.team_id);
    const { data: previous } = await query.maybeSingle();
    const channelId = previous?.channel_id || interaction.channelId;

    const { error, data } = await callEdgeFunction(
      'announce-lineup',
      { action: 'announce', lineup_id: lineupId, channel_id: channelId, mention_players: true, dm_players: false, message: '' },
      30000
    );
    if (error || !data?.success) throw new Error(error || data?.error || 'unknown error');
    return channelId;
  }

  // ---------- Routing ----------

  async function withClub(interaction, explicitKey) {
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member, explicitKey);
    return { state, club };
  }

  const managerOnly = (interaction, club) =>
    interaction.reply({ content: `❌ Only ${club ? `${club.name}'s` : 'club'} leaders can do that.`, flags: 64 });

  async function handleCommand(interaction, cmd) {
    if (cmd !== 'manager' && cmd !== 'insights') return false;
    const { state, club } = await withClub(interaction);
    if (!club) {
      await interaction.reply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.', flags: 64 });
      return true;
    }

    if (cmd === 'manager') {
      if (!(await canManageClub(interaction.member, club))) {
        await managerOnly(interaction, club);
        return true;
      }
      await interaction.deferReply();
      const message = await interaction.editReply(await buildHub(interaction.guildId, state, club));
      await message.pin().catch(() => {});
      return true;
    }

    await interaction.deferReply();
    try {
      await interaction.editReply(await buildInsights(interaction.guildId, club));
    } catch (err) {
      await interaction.editReply({ content: `❌ Could not load insights: ${err.message}` });
    }
    return true;
  }

  async function handleButton(interaction) {
    const id = interaction.customId;
    const [action, arg, extra] = id.split(':');

    if (action.startsWith('sess_')) {
      const choice = SESSION_RESPONSES[action.slice(5)];
      if (!choice || !arg) return false;
      await interaction.deferUpdate();
      const { error } = await callEdgeFunction('availability-response', {
        event_id: arg,
        discord_user_id: interaction.user.id,
        response: choice.value,
      });
      if (error) {
        await interaction.followUp({ content: `❌ ${error}`, flags: 64 });
        return true;
      }
      const { data: event } = await supabase.from('availability_events').select('*').eq('id', arg).maybeSingle();
      if (event) {
        await interaction.message.edit({ embeds: [await sessionEmbed(event)], components: [sessionButtons(event.id)] });
      }
      return true;
    }

    if (!action.startsWith('hub_')) return false;

    if (action === 'hub_announce') {
      const { club } = await withClub(interaction, extra);
      if (!club || !(await canManageClub(interaction.member, club))) return managerOnly(interaction, club).then(() => true);
      await interaction.deferReply({ flags: 64 });
      try {
        const channelId = await announceLineup(interaction, arg, club);
        await interaction.editReply({ content: `✅ Lineup posted in <#${channelId}> and the starting XI pinged.` });
      } catch (err) {
        await interaction.editReply({ content: `❌ Could not post the lineup: ${err.message}` });
      }
      return true;
    }

    const { state, club } = await withClub(interaction, arg);
    if (!club) {
      await interaction.reply({ content: '❌ That club no longer exists. Run `/manager` again.', flags: 64 });
      return true;
    }

    switch (action) {
      case 'hub_call': {
        if (!(await canManageClub(interaction.member, club))) return managerOnly(interaction, club).then(() => true);
        await interaction.deferReply({ flags: 64 });
        try {
          await callSession(interaction, club);
          await interaction.editReply({ content: '✅ Roll call posted.' });
        } catch (err) {
          await interaction.editReply({ content: `❌ Could not start the roll call: ${err.message}` });
        }
        return true;
      }
      case 'hub_sheet':
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply(await buildTeamSheet(interaction.guildId, club));
        return true;
      case 'hub_sync': {
        if (!(await canManageClub(interaction.member, club))) return managerOnly(interaction, club).then(() => true);
        if (!club.ea_club_id) {
          await interaction.reply({ content: '❌ This club is not linked to EA. Run **/manager → Admin → Link EA Club** first.', flags: 64 });
          return true;
        }
        await interaction.deferUpdate();
        const result = await syncClubHistory(interaction.guildId, club.key);
        await interaction.editReply(await buildHub(interaction.guildId, state, club));
        await interaction.followUp({
          content: result.error
            ? `❌ Sync failed: ${result.error}`
            : `✅ Synced ${club.name}: ${result.synced} new, ${result.skipped} already recorded.`,
          flags: 64,
        });
        return true;
      }
      case 'hub_stats':
        await interaction.deferReply({ flags: 64 });
        try {
          await interaction.editReply(await buildStats(interaction.guildId, club));
        } catch (err) {
          await interaction.editReply({ content: `❌ Could not load stats: ${err.message}` });
        }
        return true;
      case 'hub_events':
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply(await buildEventList(interaction.guildId));
        return true;
      case 'hub_ins':
        await interaction.deferReply({ flags: 64 });
        try {
          await interaction.editReply(await buildInsights(interaction.guildId, club));
        } catch (err) {
          await interaction.editReply({ content: `❌ Could not load insights: ${err.message}` });
        }
        return true;
      default:
        return false;
    }
  }

  async function handleSelect(interaction) {
    const [action, arg] = interaction.customId.split(':');

    if (action === 'hub_club') {
      const { state, club } = await withClub(interaction, interaction.values[0]);
      if (!club) return false;
      await interaction.deferUpdate();
      await interaction.editReply(await buildHub(interaction.guildId, state, club));
      return true;
    }

    if (action === 'hub_lb') {
      const type = interaction.values[0];
      await interaction.deferUpdate();
      const { error, data } = await callEdgeFunction('get-leaderboard', { guild_id: interaction.guildId, type, limit: 10 });
      if (error) {
        await interaction.followUp({ content: `❌ Failed to fetch leaderboard: ${error}`, flags: 64 });
        return true;
      }
      await interaction.editReply({
        embeds: [buildLeaderboardEmbed(data.players || [], type, interaction.guild.name)],
        components: [leaderboardPicker(arg, type)],
      });
      return true;
    }

    return false;
  }

  return { commands: HUB_COMMANDS, handleCommand, handleButton, handleSelect, buildStats, resolveClub, loadMatches };
}

module.exports = { createManagerHub, resolveClub, activeClubs, HUB_COMMANDS };
