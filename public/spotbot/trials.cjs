// Trials: the audition lifecycle. A prospect runs /apply (or taps the Apply button in #welcome),
// gives their gamertag, platform and positions, and joins the roster as a Trial with the
// trialist role. Every tryout event DMs the club's trialists. After a tryout closes (and its EA
// matches have had time to sync) the managers get a report card per trialist: their stats from
// those games, a chemistry read on their teammates, and Promote / Second trial / Release buttons.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { resolveClub } = require('./manager-hub.cjs');
const { missingChannelPerms } = require('./perm-check.cjs');

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const REPORT_DELAY_MS = 45 * 60 * 1000; // after a tryout closes, give the EA sync time to catch up
const INVITE_CHECK_MS = 5 * 60 * 1000;
const BASELINE_MATCHES = 30;
const CHEM_DELTA = 0.2;
const MIN_MATCHES = 1;

const TRIAL_COMMANDS = [{ name: 'apply', description: 'Apply to trial for this server\'s club: gamertag, platform and positions.' }];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parsePositions(text) {
  const found = [];
  for (const token of String(text || '').toUpperCase().split(/[^A-Z]+/)) {
    if (POSITIONS.includes(token) && !found.includes(token)) found.push(token);
  }
  return found.slice(0, 3);
}

function parsePlatform(text) {
  const t = String(text || '').toLowerCase();
  if (/ps|play\s*station/.test(t)) return 'ps5';
  if (/xb|xbox|series/.test(t)) return 'xbox-series-xs';
  if (/switch|nintendo/.test(t)) return 'switch';
  if (/pc|steam|ea app|origin/.test(t)) return 'pc';
  return null;
}

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const unix = (d) => Math.floor(new Date(d).getTime() / 1000);

function createTrials(deps) {
  const { supabase, getGuildState, recruitment, roster, events } = deps;
  let client = null;
  let lastInviteCheck = 0;

  // ---------- Data ----------

  async function loadTrialist(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return null;
    const { data } = await supabase.from('trialists').select('*').eq('id', id).maybeSingle();
    return data;
  }

  async function setRosterStatus(teamId, userId, status, positions = []) {
    if (!teamId) return;
    const { data: current } = await supabase.from('team_rosters').select('id, status').eq('team_id', teamId).eq('discord_user_id', userId).maybeSingle();
    if (status === null) {
      if (current && current.status === 'trial') await supabase.from('team_rosters').delete().eq('id', current.id);
      return;
    }
    const update = { status };
    if (positions[0]) update.primary_position = positions[0];
    if (positions[1]) update.secondary_position = positions[1];
    if (current) await supabase.from('team_rosters').update(update).eq('id', current.id);
    else await supabase.from('team_rosters').insert({ team_id: teamId, discord_user_id: userId, role: 'player', ...update });
  }

  async function setTrialistRole(guild, userId, add) {
    const settings = await recruitment.getSettings(guild.id);
    if (!settings.trialist_role_id) return null;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return null;
    const ok = add
      ? await member.roles.add(settings.trialist_role_id, 'GafferBot: trialist').then(() => true).catch(() => false)
      : await member.roles.remove(settings.trialist_role_id, 'GafferBot: trial finished').then(() => true).catch(() => false);
    return ok;
  }

  async function dm(userId, payload) {
    if (!client) return false;
    const user = await client.users.fetch(userId).catch(() => null);
    return !!(user && (await user.send(payload).catch(() => null)));
  }

  // ---------- /apply ----------

  function applyModal(clubKey) {
    const field = (id, label, placeholder, required = true, style = TextInputStyle.Short, max = 40) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setRequired(required).setStyle(style).setMaxLength(max)
      );
    return new ModalBuilder()
      .setCustomId(`rx_applym:${clubKey || ''}`)
      .setTitle('Apply to trial')
      .addComponents(
        field('gamertag', 'EA gamertag', 'Exactly as it shows in Pro Clubs'),
        field('platform', 'Platform', 'PS5, Xbox, PC or Switch', true, TextInputStyle.Short, 20),
        field('positions', 'Positions (up to 3)', 'e.g. CDM, CB', true, TextInputStyle.Short, 30),
        field('notes', 'Anything else? (optional)', 'e.g. free Sun-Thu, played comp in VFL', false, TextInputStyle.Paragraph, 300)
      );
  }

  async function openApply(interaction, clubKey) {
    if (!interaction.guildId) return interaction.reply({ content: 'Run `/apply` in the server of the club you want to trial for.', flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member, clubKey || undefined);
    if (!club) return interaction.reply({ content: "❌ This server hasn't set up a club yet, so there's nothing to apply to.", flags: 64 });
    return interaction.showModal(applyModal(club.key));
  }

  async function submitApply(interaction, clubKey) {
    await interaction.deferReply({ flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member, clubKey || undefined);
    if (!club) return interaction.editReply({ content: "❌ This server hasn't set up a club yet." });
    const gamertag = interaction.fields.getTextInputValue('gamertag').trim();
    const platformText = interaction.fields.getTextInputValue('platform');
    const positions = parsePositions(interaction.fields.getTextInputValue('positions'));
    const notes = interaction.fields.getTextInputValue('notes')?.trim() || null;
    if (!positions.length) return interaction.editReply({ content: `❌ I didn't recognise any positions. Use codes like ${POSITIONS.slice(6, 9).join(', ')} or ST.` });

    const userId = interaction.user.id;
    let teamId;
    try {
      teamId = await roster.ensureTeam(interaction.guildId, state, club);
    } catch (err) {
      return interaction.editReply({ content: `❌ Could not set up the roster: ${err.message}` });
    }
    const { data: onRoster } = await supabase.from('team_rosters').select('status').eq('team_id', teamId).eq('discord_user_id', userId).maybeSingle();
    if (onRoster && onRoster.status !== 'trial') return interaction.editReply({ content: `You're already on ${club.name}'s roster, so there's no need to apply.` });

    const { data: trialist, error } = await supabase
      .from('trialists')
      .upsert(
        {
          guild_id: interaction.guildId,
          club_key: club.key,
          discord_user_id: userId,
          ea_username: gamertag,
          platform: parsePlatform(platformText),
          positions,
          notes,
          status: 'trial',
          decided_by_discord_id: null,
          decided_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guild_id,discord_user_id' }
      )
      .select('*')
      .single();
    if (error) return interaction.editReply({ content: recruitment.tablesMissing(error) ? recruitment.NOT_READY : `❌ ${error.message}` });
    await setRosterStatus(teamId, userId, 'trial', positions);
    const gotRole = await setTrialistRole(interaction.guild, userId, true);

    const embed = new EmbedBuilder()
      .setTitle(`🧪 New trialist: ${positions.join('/')}`)
      .setColor(0xe67e22)
      .setDescription(`<@${userId}> applied to trial for **${club.name}**.`)
      .addFields(
        { name: 'Gamertag', value: `\`${gamertag}\``, inline: true },
        { name: 'Platform', value: platformText.slice(0, 40) || '–', inline: true },
        { name: 'Positions', value: positions.join(', '), inline: true }
      )
      .setFooter({ text: 'They\'re on the roster as Trial and get a DM for every tryout event.' });
    if (notes) embed.addFields({ name: 'Notes', value: truncate(notes, 300) });
    await recruitment.postToGuild(interaction.guildId, { embeds: [embed], components: [decisionRow(trialist.id)] }, null);

    return interaction.editReply({
      content:
        `✅ You're signed up as a trialist for **${club.name}** (${positions.join('/')}, \`${gamertag}\`).` +
        `${gotRole ? ' You now have the trialist role.' : ''} I'll DM you when a tryout is posted; sign up on its board and play under that gamertag so your stats count.`,
    });
  }

  function decisionRow(trialistId, disabled = false) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rx_tp:${trialistId}`).setLabel('Promote to Active Roster').setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`rx_t2:${trialistId}`).setLabel('Schedule 2nd Trial').setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`rx_tr:${trialistId}`).setLabel('Release').setStyle(ButtonStyle.Danger).setDisabled(disabled)
    );
  }

  // ---------- Apply panel ----------

  async function postApplyPanel(interaction, club) {
    if (!(await recruitment.canRecruit(interaction.member, club))) {
      return interaction.reply({ content: '❌ Only managers can post the apply panel.', flags: 64 });
    }
    if (!club) return interaction.reply({ content: '❌ Set up a club first with `/setclub`.', flags: 64 });
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const missing = missingChannelPerms(channel, interaction.guild.members.me);
    if (missing.length) return interaction.reply({ content: `❌ I can't post in ${channel}. I'm missing **${missing.join('**, **')}** there.`, flags: 64 });
    const embed = new EmbedBuilder()
      .setTitle(`🧪 Trial for ${club.name}`)
      .setColor(0xe67e22)
      .setDescription('New here and want to play? Tap **Apply to trial** and tell us your EA gamertag, platform and positions. You\'ll get the trialist role and a DM for every tryout.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rx_apply:${club.key}`).setLabel('Apply to trial').setEmoji('📝').setStyle(ButtonStyle.Primary)
    );
    await channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: `✅ Apply panel posted in ${channel}.`, flags: 64 });
  }

  // ---------- Tryout invites ----------

  async function trialistsFor(guildId, clubKey) {
    const { data } = await supabase.from('trialists').select('*').eq('guild_id', guildId).eq('status', 'trial');
    return (data || []).filter((t) => !clubKey || !t.club_key || t.club_key === clubKey);
  }

  async function inviteToTryouts(now) {
    if (now.getTime() - lastInviteCheck < INVITE_CHECK_MS) return;
    lastInviteCheck = now.getTime();
    const { data: tryouts, error } = await supabase
      .from('availability_events')
      .select('id, guild_id, club_key, title, scheduled_at, channel_id, message_id, closed, cancelled')
      .eq('event_type', 'tryout')
      .eq('closed', false)
      .gte('scheduled_at', now.toISOString())
      .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
    if (error) return;
    for (const event of tryouts || []) {
      if (event.cancelled || !event.message_id) continue;
      const trialists = await trialistsFor(event.guild_id, event.club_key);
      if (!trialists.length) continue;
      const { data: done, error: invErr } = await supabase.from('trial_invites').select('discord_user_id').eq('event_id', event.id);
      if (invErr) return; // migration not applied yet
      const invited = new Set((done || []).map((d) => d.discord_user_id));
      const link = `https://discord.com/channels/${event.guild_id}/${event.channel_id}/${event.message_id}`;
      const guildName = client?.guilds.cache.get(event.guild_id)?.name || 'your club';
      for (const t of trialists.filter((x) => !invited.has(x.discord_user_id))) {
        await supabase.from('trial_invites').insert({ event_id: event.id, discord_user_id: t.discord_user_id });
        await dm(t.discord_user_id, {
          content:
            `🎯 You're invited to a tryout in **${guildName}**: **${event.title}**, <t:${unix(event.scheduled_at)}:F> (<t:${unix(event.scheduled_at)}:R>).\n` +
            `Sign up on the board so you're in the lineup: ${link}\nPlay under \`${t.ea_username || 'your EA gamertag'}\` so your stats make it into your report.`,
        });
      }
    }
  }

  // ---------- Report cards ----------

  async function queueReport(event) {
    if (event.event_type !== 'tryout' || event.cancelled) return;
    await supabase
      .from('trial_reports')
      .upsert({ event_id: event.id, guild_id: event.guild_id, due_at: new Date(Date.now() + REPORT_DELAY_MS).toISOString() }, { onConflict: 'event_id' });
  }

  async function sendDueReports(now) {
    const { data: due, error } = await supabase.from('trial_reports').select('*').is('sent_at', null).lte('due_at', now.toISOString()).limit(5);
    if (error) return;
    for (const r of due || []) {
      await supabase.from('trial_reports').update({ sent_at: now.toISOString() }).eq('event_id', r.event_id);
      try {
        const event = await events.loadEvent(r.event_id);
        if (event) await sendReports(event);
      } catch (err) {
        console.error(`[Trials] report for ${r.event_id} failed:`, err.message);
      }
    }
  }

  // Players marked Trial on the roster by hand get a trialist row (gamertag from /linkea) so they get reports too
  async function adoptRosterTrialists(event) {
    const club = event.club_key ? await events.clubFor(event.guild_id, event.club_key) : null;
    if (!club?.team_id) return;
    const { data: rows } = await supabase.from('team_rosters').select('discord_user_id, primary_position, secondary_position').eq('team_id', club.team_id).eq('status', 'trial');
    if (!rows?.length) return;
    const { data: known } = await supabase.from('trialists').select('discord_user_id').eq('guild_id', event.guild_id).in('discord_user_id', rows.map((r) => r.discord_user_id));
    const have = new Set((known || []).map((k) => k.discord_user_id));
    const missing = rows.filter((r) => !have.has(r.discord_user_id));
    if (!missing.length) return;
    const { data: profiles } = await supabase.from('profiles').select('discord_user_id, ea_username, ea_platform').in('discord_user_id', missing.map((r) => r.discord_user_id));
    const byId = new Map((profiles || []).map((p) => [p.discord_user_id, p]));
    await supabase.from('trialists').insert(
      missing.map((r) => ({
        guild_id: event.guild_id,
        club_key: club.key,
        discord_user_id: r.discord_user_id,
        ea_username: byId.get(r.discord_user_id)?.ea_username || null,
        platform: byId.get(r.discord_user_id)?.ea_platform || null,
        positions: [r.primary_position, r.secondary_position].filter(Boolean),
        status: 'trial',
      }))
    );
  }

  const lineOf = (pos) => {
    const p = String(pos || '').toLowerCase();
    if (p.startsWith('goal')) return 'goalkeeper';
    if (p.startsWith('def')) return 'defender';
    if (p.startsWith('mid')) return 'midfielder';
    if (p.startsWith('for') || p.startsWith('att')) return 'forward';
    return p;
  };

  // A trialist's games in the tryout, plus how their teammates played alongside them vs. normally
  function evaluate(trialist, games, baseline) {
    const key = String(trialist.ea_username || '').toLowerCase();
    const played = [];
    for (const m of games) {
      const list = Array.isArray(m.player_stats) ? m.player_stats : [];
      const me = list.find((p) => String(p.ea_username || '').toLowerCase() === key);
      if (me) played.push({ m, me, mates: list.filter((p) => p !== me) });
    }
    if (!key || !played.length) return { games: 0 };
    const n = (v) => Number(v) || 0;
    const passAttempts = played.reduce((s, g) => s + n(g.me.pass_attempts), 0);
    const result = {
      games: played.length,
      rating: avg(played.map((g) => n(g.me.rating)).filter(Boolean)),
      goals: played.reduce((s, g) => s + n(g.me.goals), 0),
      assists: played.reduce((s, g) => s + n(g.me.assists), 0),
      tackles: played.reduce((s, g) => s + n(g.me.tackles), 0),
      passPct: passAttempts ? (100 * played.reduce((s, g) => s + n(g.me.passes_made), 0)) / passAttempts : null,
      motm: played.filter((g) => g.me.motm).length,
      wins: played.filter((g) => g.m.result === 'win').length,
      draws: played.filter((g) => g.m.result === 'draw').length,
      line: lineOf(played[0].me.position),
    };

    // Each teammate's usual rating, from recent club matches without this trialist
    const usual = new Map();
    for (const m of baseline) {
      for (const p of Array.isArray(m.player_stats) ? m.player_stats : []) {
        const k = String(p.ea_username || '').toLowerCase();
        if (!k || k === key || !n(p.rating)) continue;
        if (!usual.has(k)) usual.set(k, []);
        usual.get(k).push(n(p.rating));
      }
    }
    const deltas = { defender: [], midfielder: [], all: [] };
    for (const g of played) {
      for (const mate of g.mates) {
        const k = String(mate.ea_username || '').toLowerCase();
        const base = usual.get(k);
        if (!base || base.length < 3 || !n(mate.rating)) continue;
        const d = n(mate.rating) - avg(base);
        deltas.all.push(d);
        const line = lineOf(mate.position);
        if (deltas[line]) deltas[line].push(d);
      }
    }
    result.chem = { defenders: avg(deltas.defender), midfielders: avg(deltas.midfielder), all: avg(deltas.all) };
    const baseResults = baseline.filter((m) => m.result);
    result.usualWinPct = baseResults.length ? (100 * baseResults.filter((m) => m.result === 'win').length) / baseResults.length : null;
    return result;
  }

  function chemLine(label, d) {
    if (d == null) return null;
    const icon = d >= CHEM_DELTA ? '🟢' : d <= -CHEM_DELTA ? '🔴' : '🟡';
    return `${icon} ${label} rated ${d >= 0 ? '+' : ''}${d.toFixed(2)} vs their usual`;
  }

  function reportEmbed(event, club, trialist, ev, signedUp) {
    const embed = new EmbedBuilder()
      .setTitle(`📋 Trial report: ${trialist.positions?.join('/') || 'Trialist'}${trialist.trial_count > 1 ? ` (trial ${trialist.trial_count})` : ''}`)
      .setColor(ev.games ? (ev.rating >= 7.5 ? 0x57f287 : ev.rating >= 6.5 ? 0xfee75c : 0xed4245) : 0x99aab5)
      .setDescription(`<@${trialist.discord_user_id}> \`${trialist.ea_username || 'no gamertag'}\` at **${event.title}** for ${club?.name || 'your club'}.`)
      .setFooter({ text: 'Private to managers · from the EA matches synced during the tryout' });
    if (!ev.games) {
      embed.addFields({
        name: 'No synced games found',
        value:
          `${signedUp ? 'They signed up' : "They didn't sign up on the board"}, but I found no games under \`${trialist.ea_username || '?'}\` in this tryout's synced matches. ` +
          'Check their gamertag, or press Sync Latest Matches in /manager and decide from what you saw.',
      });
      return embed;
    }
    const losses = ev.games - ev.wins - ev.draws;
    embed.addFields(
      { name: 'Games', value: `${ev.games} (${ev.wins}W ${ev.draws}D ${losses}L)`, inline: true },
      { name: 'Avg rating', value: ev.rating ? ev.rating.toFixed(1) : '–', inline: true },
      { name: 'G / A', value: `${ev.goals} / ${ev.assists}`, inline: true },
      { name: 'Passing', value: ev.passPct != null ? `${Math.round(ev.passPct)}%` : '–', inline: true },
      { name: 'Tackles', value: `${ev.tackles} (${(ev.tackles / ev.games).toFixed(1)}/game)`, inline: true },
      { name: 'MOTM', value: String(ev.motm), inline: true }
    );
    const chem = [chemLine('Defenders', ev.chem.defenders), chemLine('Midfielders', ev.chem.midfielders)].filter(Boolean);
    if (!chem.length && ev.chem.all != null) chem.push(chemLine('Teammates', ev.chem.all));
    if (ev.usualWinPct != null) chem.push(`Won ${Math.round((100 * ev.wins) / ev.games)}% with them (club usually ${Math.round(ev.usualWinPct)}%)`);
    embed.addFields({ name: '🧪 Chemistry', value: chem.length ? chem.join('\n') : 'Not enough history on your regulars yet.' });
    return embed;
  }

  async function sendReports(event) {
    await adoptRosterTrialists(event);
    const trialists = await trialistsFor(event.guild_id, event.club_key);
    if (!trialists.length) return;
    const club = event.club_key ? await events.clubFor(event.guild_id, event.club_key) : null;
    const start = new Date(new Date(event.scheduled_at).getTime() - 30 * 60 * 1000).toISOString();
    let gamesQuery = supabase
      .from('club_matches')
      .select('ea_match_id, result, player_stats, created_at')
      .eq('guild_id', event.guild_id)
      .gte('created_at', start)
      .order('created_at', { ascending: true })
      .limit(20);
    let baseQuery = supabase
      .from('club_matches')
      .select('result, player_stats')
      .eq('guild_id', event.guild_id)
      .lte('created_at', start)
      .order('created_at', { ascending: false })
      .limit(BASELINE_MATCHES);
    if (event.club_key) {
      gamesQuery = gamesQuery.eq('club_key', event.club_key);
      baseQuery = baseQuery.eq('club_key', event.club_key);
    }
    const [{ data: games }, { data: baseline }] = await Promise.all([gamesQuery, baseQuery]);
    const responses = await events.loadResponses(event.id);
    const yes = new Set(responses.filter((r) => r.response === 'yes' || r.response === 'maybe').map((r) => r.discord_user_id));

    for (const t of trialists) {
      const ev = evaluate(t, games || [], baseline || []);
      if (!ev.games && !yes.has(t.discord_user_id)) continue; // skipped this tryout
      const payload = { embeds: [reportEmbed(event, club, t, ev, yes.has(t.discord_user_id))], components: [decisionRow(t.id)] };
      await recruitment.postToGuild(event.guild_id, payload, event.created_by_discord_id);
    }
  }

  // ---------- Decisions ----------

  async function decide(interaction, action, trialistId) {
    if (!interaction.guildId) return interaction.reply({ content: 'Decide from your server.', flags: 64 });
    const trialist = await loadTrialist(trialistId);
    if (!trialist || trialist.guild_id !== interaction.guildId) return interaction.reply({ content: 'That trialist no longer exists.', flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member, trialist.club_key || undefined);
    if (!(await recruitment.canRecruit(interaction.member, club))) return interaction.reply({ content: '❌ Only managers can decide on trialists.', flags: 64 });
    if (trialist.status !== 'trial') return interaction.reply({ content: `<@${trialist.discord_user_id}> was already ${trialist.status}.`, flags: 64, allowedMentions: { parse: [] } });

    const now = new Date().toISOString();
    const who = `<@${trialist.discord_user_id}>`;
    const clubName = club?.name || interaction.guild.name;

    if (action === 'second') {
      await supabase.from('trialists').update({ trial_count: (trialist.trial_count || 1) + 1, updated_at: now }).eq('id', trialist.id);
      await dm(trialist.discord_user_id, { content: `🔁 **${clubName}** liked what they saw and want you back for a second trial. I'll DM you when the next tryout is posted.` });
      return interaction.reply({
        content: `🔁 ${who} is down for a second trial and has been told. Post the next tryout with \`/event new type:Tryout\`; trialists are invited automatically.`,
        flags: 64,
      });
    }

    const promote = action === 'promote';
    await supabase.from('trialists').update({ status: promote ? 'promoted' : 'released', decided_by_discord_id: interaction.user.id, decided_at: now, updated_at: now }).eq('id', trialist.id);
    await setRosterStatus(club?.team_id, trialist.discord_user_id, promote ? 'active' : null, trialist.positions || []);
    await setTrialistRole(interaction.guild, trialist.discord_user_id, false);
    await dm(trialist.discord_user_id, {
      content: promote
        ? `🎉 You've been promoted to **${clubName}**'s active roster. Welcome to the squad!`
        : `Thanks for trialling with **${clubName}**. They've decided not to take it further this time. Good luck, and \`/fa\` lists you for other clubs if you're still looking.`,
    });
    await interaction.update({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rx_tdone')
            .setLabel(`${promote ? 'Promoted' : 'Released'} by ${interaction.member?.displayName || interaction.user.username}`.slice(0, 80))
            .setStyle(promote ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(true)
        ),
      ],
    });
    return interaction.followUp({
      content: promote ? `⬆️ ${who} is now Active on ${clubName}'s roster.` : `${who} was released and taken off the roster.`,
      flags: 64,
      allowedMentions: { parse: [] },
    });
  }

  // ---------- Routing ----------

  recruitment.addSubcommand('applypanel', (interaction, club) => postApplyPanel(interaction, club));
  recruitment.addComponent('rx_apply', (interaction, clubKey) => openApply(interaction, clubKey));
  recruitment.addComponent('rx_applym', (interaction, clubKey) => submitApply(interaction, clubKey));
  recruitment.addComponent('rx_tp', (interaction, id) => decide(interaction, 'promote', id));
  recruitment.addComponent('rx_t2', (interaction, id) => decide(interaction, 'second', id));
  recruitment.addComponent('rx_tr', (interaction, id) => decide(interaction, 'release', id));
  events.onClose(queueReport);
  events.onTick(async (now) => {
    await inviteToTryouts(now).catch((err) => console.warn('[Trials] invites failed:', err.message));
    await sendDueReports(now).catch((err) => console.warn('[Trials] reports failed:', err.message));
  });

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === 'apply') {
      await openApply(interaction);
      return true;
    }
    return false;
  }

  function start(discordClient) {
    client = discordClient;
  }

  return { commands: TRIAL_COMMANDS, handleInteraction, start, evaluate, sendReports, inviteToTryouts, sendDueReports, queueReport };
}

module.exports = { createTrials, TRIAL_COMMANDS, parsePositions, parsePlatform };
