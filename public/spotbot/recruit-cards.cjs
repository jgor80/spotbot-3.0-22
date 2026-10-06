// Recruitment cards and squad gaps.
// /recruit gaps: the positional gap radar (positions the squad is thin at, weighted by how often
//   those players actually turn up). /roster view shows the same warnings.
// /recruit post: a branded "we're recruiting" poster with record, match nights, open positions
//   and an invite, plus a plain-text copy for league Discords and Reddit.
// /lfc: a player's resume card of verified GafferBot stats, with a code anyone can check.

const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { missingChannelPerms } = require('./perm-check.cjs');
const { resolveClub } = require('./manager-hub.cjs');

// What a squad needs in each area: `need` to field a side, `want` to cope with absences
const GROUPS = [
  { label: 'GK', noun: 'goalkeeper', positions: ['GK'], need: 1, want: 2 },
  { label: 'CB', noun: 'centre-back', positions: ['CB'], need: 2, want: 3 },
  { label: 'Full-back', noun: 'full-back', positions: ['LB', 'RB', 'LWB', 'RWB'], need: 2, want: 3 },
  { label: 'CDM', noun: 'defensive midfielder', positions: ['CDM'], need: 1, want: 2 },
  { label: 'CM/CAM', noun: 'central midfielder', positions: ['CM', 'CAM'], need: 2, want: 3 },
  { label: 'Winger', noun: 'winger', positions: ['LM', 'RM', 'LW', 'RW'], need: 2, want: 3 },
  { label: 'Striker', noun: 'striker', positions: ['ST', 'CF'], need: 1, want: 2 },
];
const DEFAULT_RELIABILITY = 0.85; // for players with fewer than 3 tracked events
const MIN_RELIABILITY_EVENTS = 3;
const RESUME_MATCHES = 100;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const LFC_COMMANDS = [
  {
    name: 'lfc',
    description: 'Looking for a club: your verified GafferBot resume card.',
    options: [
      {
        type: 1,
        name: 'card',
        description: 'Post your resume: goals, assists, match rating, defending and passing from synced EA matches.',
        options: [{ name: 'private', description: 'Only show it to you (to copy elsewhere).', type: 5, required: false }],
      },
      {
        type: 1,
        name: 'verify',
        description: 'Check a resume code from a GafferBot card.',
        options: [{ name: 'code', description: 'The code on the card, e.g. K7Q2M9XA.', type: 3, required: true, max_length: 12 }],
      },
    ],
  },
];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function makeCode() {
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

function createRecruitCards(deps) {
  const { supabase, getGuildState, recruitment } = deps;

  // ---------- Gap radar ----------

  async function gapRadar(guildId, club) {
    if (!club?.team_id) return { noRoster: true, gaps: [] };
    const { data: roster } = await supabase
      .from('team_rosters')
      .select('discord_user_id, status, primary_position, secondary_position')
      .eq('team_id', club.team_id);
    const active = (roster || []).filter((r) => (r.status || 'active') === 'active');
    const trial = (roster || []).filter((r) => r.status === 'trial');
    const ids = active.map((r) => r.discord_user_id);
    const { data: rel } = ids.length
      ? await supabase.from('player_reliability').select('discord_user_id, reliability_score, events_available').eq('guild_id', guildId).in('discord_user_id', ids)
      : { data: [] };
    const relOf = new Map(
      (rel || []).filter((r) => r.events_available >= MIN_RELIABILITY_EVENTS).map((r) => [r.discord_user_id, Number(r.reliability_score) / 100])
    );
    const reliability = (id) => (relOf.has(id) ? relOf.get(id) : DEFAULT_RELIABILITY);

    const now = new Date();
    let upcomingQuery = supabase
      .from('availability_events')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('closed', false)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString());
    if (club.key) upcomingQuery = upcomingQuery.eq('club_key', club.key);
    const { count: upcoming } = await upcomingQuery;

    const gaps = [];
    for (const g of GROUPS) {
      const main = active.filter((r) => g.positions.includes(r.primary_position));
      const cover = active.filter((r) => !g.positions.includes(r.primary_position) && g.positions.includes(r.secondary_position));
      const expected = main.reduce((s, r) => s + reliability(r.discord_user_id), 0) + 0.5 * cover.reduce((s, r) => s + reliability(r.discord_user_id), 0);
      const trialists = trial.filter((r) => g.positions.includes(r.primary_position) || g.positions.includes(r.secondary_position)).length;
      const short = main.length < g.want || expected < g.need;
      if (!short) continue;
      const target = Math.max(g.want - main.length, Math.ceil(g.need - expected), 1);
      const avgRel = main.length ? main.reduce((s, r) => s + reliability(r.discord_user_id), 0) / main.length : null;
      const severity = expected < g.need ? (main.length < g.need ? 'critical' : 'risky') : 'thin';
      gaps.push({ group: g, main, cover, expected, trialists, target, avgRel, severity, hasHistory: main.some((r) => relOf.has(r.discord_user_id)) });
    }
    const order = { critical: 0, risky: 1, thin: 2 };
    gaps.sort((a, b) => order[a.severity] - order[b.severity]);
    return { gaps, upcoming: upcoming || 0, activeCount: active.length };
  }

  function gapLine(gap) {
    const { group: g, main, cover, avgRel, trialists, target, severity, hasHistory } = gap;
    const icon = severity === 'critical' ? '🚨' : severity === 'risky' ? '⚠️' : '🟡';
    let text;
    if (!main.length) {
      text = `${icon} **${g.label}**: nobody plays here${cover.length ? ` (${cover.length} can cover)` : ''}.`;
    } else {
      const who = main.length === 1 ? `only 1 active ${g.noun}` : `${main.length} active ${g.noun}s`;
      const rel = hasHistory && avgRel != null ? `, with ${Math.round(avgRel * 100)}% attendance reliability${main.length > 1 ? ' on average' : ''}` : '';
      text = `${icon} **${g.label}**: ${who}${rel}${cover.length ? ` (+${cover.length} cover)` : ''}.`;
    }
    text += ` Suggested target: recruit ${target} ${g.noun}${target === 1 ? '' : 's'}.`;
    if (trialists) text += ` 🧪 ${trialists} trialist${trialists === 1 ? '' : 's'} here.`;
    return text;
  }

  async function gapFields(guildId, club) {
    const radar = await gapRadar(guildId, club);
    if (radar.noRoster || !radar.activeCount) return [];
    if (!radar.gaps.length) return [{ name: '✅ Squad gaps', value: 'No gaps: every area has enough reliable cover.' }];
    return [{ name: '⚠️ Squad gaps', value: truncate(radar.gaps.slice(0, 5).map(gapLine).join('\n')) }];
  }

  async function handleGaps(interaction, club) {
    if (!club) return interaction.reply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.', flags: 64 });
    if (!(await recruitment.canRecruit(interaction.member, club))) return interaction.reply({ content: '❌ Only managers can see the gap radar.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const radar = await gapRadar(interaction.guildId, club);
    const embed = new EmbedBuilder().setTitle(`📡 Gap radar: ${club.name}`).setColor(0xe67e22);
    if (radar.noRoster || !radar.activeCount) {
      embed.setDescription('No active roster yet. Add players with **/manager → Roster & Squad → Add Player** or **/manager → Roster & Squad → Import Role** and I can spot the gaps.');
      return interaction.editReply({ embeds: [embed] });
    }
    embed.setDescription(
      (radar.gaps.length ? radar.gaps.map(gapLine).join('\n') : '✅ No gaps: every area has enough reliable cover.') +
        `\n\n${radar.activeCount} active players · ${radar.upcoming} event${radar.upcoming === 1 ? '' : 's'} in the next 2 weeks`
    );
    embed.setFooter({ text: 'Main position counts fully, second position as half. Reliability comes from check-ins (/manager → Match Night → Reliability).' });
    const components = radar.gaps.length
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`rx_gsearch:${radar.gaps[0].group.positions[0]}`)
              .setLabel(`Search free agents: ${radar.gaps[0].group.label}`)
              .setEmoji('🔍')
              .setStyle(ButtonStyle.Primary)
          ),
        ]
      : [];
    return interaction.editReply({ embeds: [embed], components });
  }

  // ---------- Recruitment poster ----------

  async function matchNights(guildId, club) {
    let query = supabase.from('event_series').select('next_at, timezone, interval_weeks, event_type').eq('guild_id', guildId).eq('active', true);
    if (club?.key) query = query.eq('club_key', club.key);
    const { data } = await query;
    const nights = (data || []).filter((s) => s.event_type !== 'training' && s.event_type !== 'tryout');
    if (!nights.length) return null;
    const parts = nights.map((s) => {
      const tz = s.timezone || 'UTC';
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      return { at: new Date(s.next_at), text: fmt.format(new Date(s.next_at)) + (s.interval_weeks > 1 ? ` (every ${s.interval_weeks} weeks)` : '') };
    });
    parts.sort((a, b) => a.at.getDay() - b.at.getDay());
    return [...new Set(parts.map((p) => p.text))].join(' · ');
  }

  async function handlePost(interaction, club) {
    if (!club) return interaction.reply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.', flags: 64 });
    if (!(await recruitment.canRecruit(interaction.member, club))) return interaction.reply({ content: '❌ Only managers can post a recruitment poster.', flags: 64 });
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const missing = missingChannelPerms(channel, interaction.guild.members.me);
    if (missing.length) return interaction.reply({ content: `❌ I can't post in ${channel}. I'm missing **${missing.join('**, **')}** there.`, flags: 64 });
    await interaction.deferReply({ flags: 64 });

    const typed = interaction.options.getString('positions');
    const notes = interaction.options.getString('notes');
    let positions = typed;
    if (!positions) {
      const radar = await gapRadar(interaction.guildId, club);
      positions = radar.gaps.length ? radar.gaps.slice(0, 3).map((g) => g.group.label).join(', ') : 'All positions';
    }
    const [{ data: settings }, { data: stats }, nights, invite] = await Promise.all([
      supabase.from('guild_settings').select('branding').eq('guild_id', interaction.guildId).maybeSingle(),
      supabase.from('club_stats').select('*').eq('guild_id', interaction.guildId).eq('club_key', club.key).maybeSingle(),
      matchNights(interaction.guildId, club),
      recruitment.inviteFor(interaction.guild, { maxAge: 0, maxUses: 0, unique: false, reason: 'GafferBot recruitment poster' }),
    ]);
    const branding = settings?.branding || {};
    const record = stats && stats.wins != null ? `${stats.wins}W ${stats.draws ?? 0}D ${stats.losses ?? 0}L` : null;
    const division = stats?.current_division ? `Division ${stats.current_division}${stats.best_division ? ` (best ${stats.best_division})` : ''}` : null;
    const form = Array.isArray(stats?.last_5_results) && stats.last_5_results.length ? stats.last_5_results.join(' ') : null;

    const embed = new EmbedBuilder()
      .setTitle(`📣 ${club.name} are recruiting`)
      .setColor(Number.isInteger(branding.color) ? branding.color : 0x22c55e)
      .setDescription(`**Looking for: ${positions}**${notes ? `\n${notes}` : ''}`)
      .setFooter({ text: `${branding.footer || 'GafferBot'} · Free agents: list yourself with /me → Free Agent` });
    const logo = branding.logo_url || interaction.guild.iconURL();
    if (logo) embed.setThumbnail(logo);
    if (division) embed.addFields({ name: 'Division', value: division, inline: true });
    if (record) embed.addFields({ name: 'Record', value: record, inline: true });
    if (form) embed.addFields({ name: 'Form', value: form, inline: true });
    if (nights) embed.addFields({ name: 'Match nights', value: nights });
    if (invite) embed.addFields({ name: 'Join us', value: invite });
    const components = invite ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(invite).setLabel('Join the server'))] : [];
    const posted = await channel.send({ embeds: [embed], components }).catch((err) => ({ error: err }));
    if (posted?.error) return interaction.editReply({ content: `❌ Couldn't post: ${posted.error.message}` });

    const text = [
      `📣 **${club.name} are recruiting**`,
      `Looking for: ${positions}`,
      division,
      record ? `Record: ${record}` : null,
      nights ? `Match nights: ${nights}` : null,
      notes,
      invite ? `Join: ${invite}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return interaction.editReply({
      content:
        `✅ Poster posted in ${channel}.${invite ? '' : " I couldn't make an invite (I need **Create Invite**; set an invite channel in **/manager → Recruiting → Recruiting Setup**)."}` +
        `\nCopy this for league Discords or Reddit:\n\`\`\`\n${text.replace(/\*\*/g, '')}\n\`\`\``,
    });
  }

  // ---------- /lfc resume ----------

  async function resumeStats(userId) {
    const { data } = await supabase
      .from('player_stats')
      .select('goals, assists, ea_match_rating, tackles, interceptions, defensive_actions, passes_made, pass_attempts, man_of_match, won, position_played, clean_sheet, saves_diving, saves_reflex, saves_parry, saves_punch, saves_cross, guild_id, recorded_at')
      .eq('discord_user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(RESUME_MATCHES);
    const rows = data || [];
    if (!rows.length) return null;
    const sum = (f) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
    const rated = rows.filter((r) => Number(r.ea_match_rating) > 0);
    const passAttempts = sum((r) => r.pass_attempts);
    const posCount = new Map();
    for (const r of rows) if (r.position_played) posCount.set(r.position_played, (posCount.get(r.position_played) || 0) + 1);
    const position = [...posCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const isGk = /^g/i.test(position || '');
    const defActions = sum((r) => (r.defensive_actions != null ? r.defensive_actions : (Number(r.tackles) || 0) + (Number(r.interceptions) || 0)));
    return {
      games: rows.length,
      position,
      goals: sum((r) => r.goals),
      assists: sum((r) => r.assists),
      amr: rated.length ? rated.reduce((s, r) => s + Number(r.ea_match_rating), 0) / rated.length : null,
      defPerGame: defActions / rows.length,
      passPct: passAttempts ? (100 * sum((r) => r.passes_made)) / passAttempts : null,
      motm: rows.filter((r) => r.man_of_match).length,
      winPct: (100 * rows.filter((r) => r.won).length) / rows.length,
      cleanSheets: isGk ? rows.filter((r) => r.clean_sheet).length : null,
      saves: isGk ? sum((r) => (r.saves_diving || 0) + (r.saves_reflex || 0) + (r.saves_parry || 0) + (r.saves_punch || 0) + (r.saves_cross || 0)) : null,
      clubs: new Set(rows.map((r) => r.guild_id)).size,
      since: rows[rows.length - 1].recorded_at,
    };
  }

  function resumeEmbed(name, s, code, issuedAt, verifiedTag) {
    const per = (n) => (n / s.games).toFixed(2);
    const embed = new EmbedBuilder()
      .setTitle(`🧾 ${name}: Pro Clubs resume`)
      .setColor(0x5865f2)
      .setDescription(`${s.position ? `**${String(s.position).toUpperCase()}** · ` : ''}${s.games} synced EA matches · ${Math.round(s.winPct)}% won`)
      .addFields(
        { name: 'Goals / game', value: per(s.goals), inline: true },
        { name: 'Assists / game', value: per(s.assists), inline: true },
        { name: 'Avg match rating', value: s.amr ? s.amr.toFixed(2) : '–', inline: true },
        { name: 'Defensive actions / game', value: s.defPerGame.toFixed(1), inline: true },
        { name: 'Pass completion', value: s.passPct != null ? `${Math.round(s.passPct)}%` : '–', inline: true },
        { name: 'Man of the Match', value: String(s.motm), inline: true }
      )
      .setFooter({
        text: `${verifiedTag ? '✅ Verified by GafferBot' : '⚠️ Gamertag not linked'} · code ${code} · check it with /me → Check a Resume · issued ${new Date(issuedAt).toISOString().slice(0, 10)}`,
      });
    if (s.cleanSheets != null) embed.addFields({ name: 'Goalkeeping', value: `${s.cleanSheets} clean sheets · ${s.saves} saves`, inline: true });
    return embed;
  }

  async function handleLfc(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'verify') {
      const code = interaction.options.getString('code').trim().toUpperCase();
      const { data, error } = await supabase.from('player_resumes').select('*').eq('code', code).maybeSingle();
      if (recruitment.tablesMissing(error)) return interaction.reply({ content: recruitment.NOT_READY, flags: 64 });
      if (!data) return interaction.reply({ content: `❌ No GafferBot resume has code \`${code}\`. The card may be fake or mistyped.`, flags: 64 });
      const embed = resumeEmbed(data.ea_username || 'Player', data.stats, data.code, data.created_at, data.stats.verified);
      return interaction.reply({
        content: `✅ \`${code}\` is a real GafferBot resume. These are the numbers it was issued with; compare them with the card you were shown.`,
        embeds: [embed],
        flags: 64,
      });
    }

    const priv = interaction.options.getBoolean('private') || !interaction.guildId;
    await interaction.deferReply(priv ? { flags: 64 } : {});
    const userId = interaction.user.id;
    const [stats, { data: profile }] = await Promise.all([
      resumeStats(userId),
      supabase.from('profiles').select('ea_username').eq('discord_user_id', userId).maybeSingle(),
    ]);
    if (!stats) {
      return interaction.editReply({
        content: "I don't have any synced EA matches for you yet. Link your gamertag with **/me → Link EA** and play with a GafferBot club; your resume fills in from there.",
      });
    }
    const name = profile?.ea_username || interaction.user.username;
    const verified = !!profile?.ea_username;
    const code = makeCode();
    const now = new Date().toISOString();
    const { error } = await supabase.from('player_resumes').insert({ code, discord_user_id: userId, ea_username: name, stats: { ...stats, verified }, created_at: now });
    if (error) return interaction.editReply({ content: recruitment.tablesMissing(error) ? recruitment.NOT_READY : `❌ ${error.message}` });
    const embed = resumeEmbed(name, stats, code, now, verified);
    const [listing] = await recruitment.findListings({ discordIds: [userId] });
    if (listing) embed.addFields({ name: '📣 Free agent', value: `${recruitment.positionsText(listing)} · managers can reach out via **/manager → Recruiting → Search Free Agents**` });
    await interaction.editReply({ embeds: [embed] });
    if (!listing) {
      await interaction.followUp({ content: 'Looking for a club? **/me → Free Agent** lists you in the free agent pool every GafferBot server can search.', flags: 64 }).catch(() => {});
    }
  }

  // ---------- Routing ----------

  recruitment.addSubcommand('gaps', (interaction, club) => handleGaps(interaction, club));
  recruitment.addSubcommand('post', (interaction, club) => handlePost(interaction, club));
  recruitment.addComponent('rx_gsearch', async (interaction, position) => {
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!(await recruitment.canRecruit(interaction.member, club))) return interaction.reply({ content: '❌ Only managers can search free agents.', flags: 64 });
    return recruitment.search(interaction, club, { position });
  });

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === 'lfc') {
      await handleLfc(interaction);
      return true;
    }
    return false;
  }

  return { commands: LFC_COMMANDS, handleInteraction, gapRadar, gapFields, resumeStats };
}

module.exports = { createRecruitCards, LFC_COMMANDS, GROUPS };
