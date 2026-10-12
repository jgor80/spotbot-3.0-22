// Autopilot: match-night jobs the bot runs on its own so a manager only has to supervise.
//   voice   joining the club's linked voice channel near kick-off checks a player in
//   lineup  10 minutes before kick-off, draft the XI from who is there and send it to leaders
//   recaps  post a recap as soon as a finished EA match lands in club_matches
//   subs    a starter out of voice for 3 minutes during the session gets a sub request
//   digest  Monday morning recap of formations, pairings and show-up rates
//   session a recap of every match played while the club's voice channel was busy, once it empties
//   press   a newspaper-style match report for each game in the Chronicle's channel
// Everything is on by default; /autopilot (or the hub's Autopilot button) switches parts off.
// Settings and cursors live on the club in guild_settings.clubs, so no new tables are needed.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const { missingChannelPerms } = require('./perm-check.cjs');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { toInsightMatches, computeOverview, computeCombos, computeFormations, playerKey, winPct } = require('./club-insights.cjs');
const { autofillLineup, FORMATION_SLOTS } = require('./lineup-autofill.cjs');
const { seasonTotals } = require('./player-season.cjs');
const T = require('./event-time.cjs');
const { PREMIUM_FREE } = require('./premium.cjs');
const { aiStyle } = require('./club-identity.cjs');
const { storyFacts, buildChronicle, buildMatchReport, editionCover, EDITIONS, CHRONICLE_TZ } = require('./chronicle.cjs');
const RX = require('./recap-extras.cjs');
const PRESS = require('./press-copy.cjs');

const FEATURES = {
  voice: { label: 'Voice check-ins', emoji: '🎧', help: 'Joining the club voice channel from 30 min before kick-off checks a player in.' },
  lineup: { label: 'Auto team sheet', emoji: '📋', help: '10 min before kick-off, draft the XI from who is in voice and send it to leaders to publish.' },
  recaps: { label: 'Match recaps', emoji: '🏁', help: 'Post a recap here as soon as EA records a finished match.' },
  subs: { label: 'Auto sub requests', emoji: '🆘', help: 'A starter out of voice for 3 min during the session gets a sub request.' },
  digest: { label: 'Monday digest', emoji: '🗞️', help: 'Formation win rates, best pairings and show-up rates every Monday morning.' },
  chronicle: { label: 'Daily Chronicle', emoji: '📰', help: 'A newspaper-style beat writer digest at 3 PM and midnight Central covering the day\'s matches, players and events.' },
  press: { label: 'Newspaper match reports', emoji: '🗞️', help: 'Every match also gets a Chronicle-style write-up in the Chronicle channel (set it with Print Chronicle here).' },
  session: { label: 'Session recap', emoji: '🧾', help: 'When the club voice channel empties, a recap of every match played since it filled up.' },
  ratings: { label: 'Teammate rating DMs', emoji: '⭐', help: 'After a match, players get a DM asking them to rate their teammates.' },
  // Premium: these only run when the server has GafferBot Premium (see premium.cjs)
  graphics: { label: 'Matchday graphics', emoji: '🖼️', premium: true, help: 'Recap images, a Team of the Week poster on Sunday night and squad cards on the 1st of the month.' },
  moments: { label: 'Big moments', emoji: '📣', premium: true, help: 'Hat-tricks, comebacks of form and big wins get a shout-out with links to anyone live on Twitch.' },
  trophies: { label: 'Stat trophies', emoji: '🏆', premium: true, help: 'Club Legend, Golden Boot, Playmaker, Golden Glove and In-Form roles move on their own after each match.' },
  coach: { label: 'Assistant coach', emoji: '🧠', premium: true, help: 'A session debrief 45 minutes after the last match of the night.' },
};

const VOICE_LEAD_MS = 30 * 60 * 1000;
const LINEUP_LEAD_MS = 10 * 60 * 1000;
const SUB_GRACE_MS = 3 * 60 * 1000;
const SUB_WATCH_FROM_MS = 10 * 60 * 1000;
const RECAP_MAX_AGE_MS = 3 * 60 * 60 * 1000;
// More than this many new games at once (a catch-up after downtime) get one summary line instead
const RECAPS_PER_TICK = 8;
// A session ends once the voice channel has been empty this long (EA's last match needs a sync or two to land)
const SESSION_SETTLE_MS = 15 * 60 * 1000;
// Matches EA stamps slightly before anyone joined voice (e.g. a quick rejoin) still count
const SESSION_EARLY_MS = 5 * 60 * 1000;
const SESSION_MAX_PLAYERS = 24;
const DIGEST_HOUR = 10;
const DEFAULT_FORMATION = '4-3-3 FLAT';
const MIN_FORMATION_GAMES = 3;
const EVENT_CACHE_MS = 60 * 1000;
const RESULT = {
  win: { label: 'WIN', emoji: '🟢', color: 0x57f287 },
  draw: { label: 'DRAW', emoji: '⚪', color: 0xfee75c },
  loss: { label: 'LOSS', emoji: '🔴', color: 0xed4245 },
};

const AUTOPILOT_COMMANDS = [
  { name: 'autopilot', description: 'See and switch the jobs the bot runs on its own (check-ins, team sheet, recaps, subs, digest).' },
];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function recordText({ wins, draws, losses }) {
  return draws ? `${wins}W-${draws}D-${losses}L` : `${wins}W-${losses}L`;
}

function record(list) {
  const count = (r) => list.filter((m) => m.result === r).length;
  return recordText({ wins: count('win'), draws: count('draw'), losses: count('loss') });
}

function eventEnd(event) {
  return new Date(event.scheduled_at).getTime() + (event.duration_minutes || 90) * 60000;
}

function createAutopilot(deps) {
  const { supabase, events, matchNight, getGuildState, saveGuildSettings, isManager, callEdgeFunction, loadMatches, loadTeam, dashboardUrl } = deps;
  const canManageClub = deps.canManageClub || (async (member) => isManager(member));
  const client = () => events.getClient();

  const eventCache = new Map();
  const subTimers = new Map();
  const drafted = new Set();
  const lineupPool = new Map();
  const startedAt = new Date().toISOString();
  const newMatchHooks = [];
  const sessionHooks = [];
  let recapImage = null;
  let editionImage = null;

  // ---------- Settings ----------

  function isOn(club, feature) {
    return !(club?.autopilot?.off || []).includes(feature);
  }

  // Change a club's autopilot settings in place and save them
  async function updateClub(guildId, clubKey, change) {
    const state = await getGuildState(guildId);
    const club = state?.clubs?.find((c) => c.key === clubKey);
    if (!club) return null;
    club.autopilot = { ...(club.autopilot || {}) };
    change(club.autopilot);
    await saveGuildSettings(guildId, state);
    return club;
  }

  // Where recaps and the digest go: the chosen channel, the club's stats channel, else where its events are posted
  async function postChannel(guildId, club) {
    const guild = client()?.guilds.cache.get(guildId);
    if (!guild) return null;
    let channelId = club.autopilot?.channel_id || club.stats_channel_id;
    if (!channelId) {
      const { data } = await supabase
        .from('availability_events')
        .select('channel_id')
        .eq('guild_id', guildId)
        .eq('club_key', club.key)
        .not('channel_id', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      channelId = data?.channel_id;
    }
    if (!channelId) return null;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.send || missingChannelPerms(channel, guild.members.me).length) return null;
    return channel;
  }

  async function leadersFor(club, event) {
    const team = loadTeam ? await loadTeam(club).catch(() => null) : null;
    const ids = [team?.captain_discord_id, ...(team?.manager_discord_ids || [])].filter(Boolean);
    if (!ids.length && event?.created_by_discord_id) ids.push(event.created_by_discord_id);
    return [...new Set(ids)];
  }

  // ---------- Events in play ----------

  // Open club events from 4h ago to 30 min ahead, cached for a minute per guild
  async function liveEvents(guildId) {
    const cached = eventCache.get(guildId);
    if (cached && Date.now() - cached.at < EVENT_CACHE_MS) return cached.list;
    const now = Date.now();
    const { data } = await supabase
      .from('availability_events')
      .select('*')
      .eq('guild_id', guildId)
      .eq('closed', false)
      .eq('cancelled', false)
      .not('club_key', 'is', null)
      .gte('scheduled_at', new Date(now - 4 * 60 * 60 * 1000).toISOString())
      .lte('scheduled_at', new Date(now + VOICE_LEAD_MS).toISOString())
      .order('scheduled_at', { ascending: true });
    const list = data || [];
    eventCache.set(guildId, { at: now, list });
    return list;
  }

  // The club's event whose window (kick-off minus lead, until the end) includes now
  async function eventInWindow(guildId, clubKey, leadMs) {
    const now = Date.now();
    const list = await liveEvents(guildId);
    return list.find((e) => e.club_key === clubKey && new Date(e.scheduled_at).getTime() - leadMs <= now && now < eventEnd(e)) || null;
  }

  function voiceMembers(guildId, vcId) {
    const channel = client()?.guilds.cache.get(guildId)?.channels.cache.get(vcId);
    return channel?.members ? [...channel.members.values()].filter((m) => !m.user.bot).map((m) => m.id) : [];
  }

  // ---------- 1. Voice check-ins ----------

  // Check in everyone in the linked voice channel who isn't checked in yet
  async function checkInFromVoice(event, userIds) {
    if (!userIds.length) return 0;
    const checkins = await matchNight.loadCheckins(event.id);
    const already = new Set(checkins.filter((c) => c.status === 'in').map((c) => c.discord_user_id));
    const fresh = userIds.filter((id) => !already.has(id));
    if (!fresh.length) return 0;
    const at = new Date().toISOString();
    await supabase
      .from('event_checkins')
      .upsert(fresh.map((id) => ({ event_id: event.id, discord_user_id: id, status: 'in', checked_in_at: at })), { onConflict: 'event_id,discord_user_id' });
    await matchNight.refreshCheckin(event);
    return fresh.length;
  }

  async function sweepVoice(now) {
    for (const guild of client().guilds.cache.values()) {
      const state = await getGuildState(guild.id);
      for (const club of activeClubs(state)) {
        const vcId = state.clubVcLinks?.[club.key];
        if (!vcId || !isOn(club, 'voice')) continue;
        const event = await eventInWindow(guild.id, club.key, VOICE_LEAD_MS);
        if (event && now.getTime() < eventEnd(event)) await checkInFromVoice(event, voiceMembers(guild.id, vcId));
      }
    }
  }

  // Called from index.cjs on every voice state change
  async function onVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    const userId = newState.id || oldState.id;
    if (!guildId || newState.member?.user?.bot) return;
    if (oldState.channelId === newState.channelId) return;
    const state = await getGuildState(guildId);
    if (!state?.clubVcLinks) return;
    const clubOf = (vcId) => (vcId ? activeClubs(state).find((c) => state.clubVcLinks[c.key] === vcId) : null);

    const joined = clubOf(newState.channelId);
    if (joined) {
      const event = await eventInWindow(guildId, joined.key, VOICE_LEAD_MS);
      if (event) {
        cancelSubTimer(event.id, userId);
        if (isOn(joined, 'voice')) await checkInFromVoice(event, [userId]);
      }
    }

    const left = clubOf(oldState.channelId);
    if (left && left !== joined && isOn(left, 'subs')) {
      const event = await eventInWindow(guildId, left.key, SUB_WATCH_FROM_MS);
      if (event) await watchDropout(event, left, userId, oldState.channelId);
    }
  }

  // ---------- 1b. Auto-drafted XI ----------

  // The formation the club wins most with (3+ games), else its last one, else the default
  function pickFormation(matches, lastFormation) {
    const ranked = computeFormations(matches)
      .filter((f) => f.record.games >= MIN_FORMATION_GAMES && FORMATION_SLOTS[f.formation])
      .sort((a, b) => winPct(b.record) - winPct(a.record) || b.record.games - a.record.games);
    if (ranked.length) return { formation: ranked[0].formation, stat: ranked[0] };
    if (lastFormation && FORMATION_SLOTS[lastFormation]) return { formation: lastFormation, stat: null };
    return { formation: DEFAULT_FORMATION, stat: null };
  }

  // Duos from the pool that win more together, as Discord id pairs
  async function chemistryPairs(guildId, matches, pool) {
    if (pool.length < 2) return [];
    const { data: profiles } = await supabase.from('profiles').select('discord_user_id, ea_username').in('discord_user_id', pool);
    const byKey = new Map((profiles || []).filter((p) => p.ea_username).map((p) => [p.ea_username.trim().toLowerCase(), p.discord_user_id]));
    return computeCombos(matches, 2, MIN_FORMATION_GAMES)
      .filter((c) => c.lift > 0)
      .map((c) => ({ ...c, ids: c.names.map((n) => byKey.get(n.trim().toLowerCase())) }))
      .filter((c) => c.ids.every(Boolean))
      .slice(0, 3);
  }

  // Place the pool into the formation like the Lineup Builder's Fill from Voice
  async function draft(event, club, pool, formationOverride) {
    const guildId = event.guild_id;
    const matches = loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
    let lastFormation = null;
    if (!formationOverride) {
      let q = supabase.from('lineups').select('formation').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(1);
      if (club.team_id) q = q.eq('team_id', club.team_id);
      lastFormation = (await q.maybeSingle()).data?.formation;
    }
    const pick = formationOverride ? { formation: formationOverride, stat: computeFormations(matches).find((f) => f.formation === formationOverride) || null } : pickFormation(matches, lastFormation);
    const slots = FORMATION_SLOTS[pick.formation];

    const [{ data: ratings }, { data: posRatings }, { data: prefs }, responses] = await Promise.all([
      supabase.from('player_ratings').select('discord_user_id, overall_rating').eq('guild_id', guildId).in('discord_user_id', pool),
      supabase.from('player_position_ratings').select('discord_user_id, position, rating').eq('guild_id', guildId).in('discord_user_id', pool),
      supabase.from('position_preferences').select('user_id, preferences').eq('guild_id', guildId).in('user_id', pool),
      events.loadResponses(event.id),
    ]);
    const rating = new Map((ratings || []).map((r) => [r.discord_user_id, Number(r.overall_rating) || 60]));
    const prefsBy = new Map((prefs || []).map((p) => [p.user_id, p.preferences || []]));
    const signedUp = new Map(responses.filter((r) => r.position).map((r) => [r.discord_user_id, r.position.split(',')]));

    // Players in the club's best pairings get a small nudge so they start together
    const pairs = await chemistryPairs(guildId, matches, pool);
    const boost = new Map();
    for (const p of pairs) for (const id of p.ids) boost.set(id, (boost.get(id) || 0) + 3);

    const players = pool.map((id) => ({
      discord_user_id: id,
      overall_rating: (rating.get(id) ?? 60) + (boost.get(id) || 0),
      preferences: signedUp.get(id) || prefsBy.get(id) || [],
    }));
    const picks = autofillLineup(slots, players, posRatings || []);
    const starters = new Set(picks.values());
    const bench = pool.filter((id) => !starters.has(id)).sort((a, b) => (rating.get(b) ?? 0) - (rating.get(a) ?? 0));
    const rows = [
      ...[...picks.entries()].map(([slot, id]) => ({ slot_index: slot, position: slots[slot], discord_user_id: id, is_substitute: false })),
      ...bench.map((id, i) => ({
        slot_index: slots.length + i,
        position: (signedUp.get(id) || prefsBy.get(id) || ['SUB'])[0],
        discord_user_id: id,
        is_substitute: true,
      })),
    ];
    const starterRatings = [...starters].map((id) => rating.get(id)).filter((r) => r != null);
    return {
      formation: pick.formation,
      stat: pick.stat,
      slots,
      rows,
      pairs: pairs.filter((p) => p.ids.every((id) => starters.has(id))),
      avgRating: starterRatings.length ? starterRatings.reduce((a, b) => a + b, 0) / starterRatings.length : null,
    };
  }

  function suggestionEmbed(event, club, lineupId, plan, inVoice) {
    const byIndex = new Map(plan.rows.filter((r) => !r.is_substitute).map((r) => [r.slot_index, r.discord_user_id]));
    const xi = plan.slots.map((pos, i) => `\`${pos.padEnd(3)}\` ${byIndex.has(i) ? `<@${byIndex.get(i)}>` : '*open*'}`);
    const bench = plan.rows.filter((r) => r.is_substitute).map((r) => `<@${r.discord_user_id}>`);
    const kickoff = T.unix(event.scheduled_at);
    const why = plan.stat
      ? `${plan.formation} has won ${Math.round(winPct(plan.stat.record))}% of your tracked games (${recordText(plan.stat.record)}).`
      : `${plan.formation} is your usual shape.`;
    const embed = new EmbedBuilder()
      .setTitle(`📋 Suggested XI: ${event.title}`)
      .setColor(0x5865f2)
      .setDescription(
        `**${inVoice}** player${inVoice === 1 ? '' : 's'} in voice for kick-off <t:${kickoff}:t> (<t:${kickoff}:R>). Here is the suggested **${plan.formation}**.\n${why}`
      )
      .addFields({ name: 'Starting XI', value: truncate(xi.join('\n')) });
    if (bench.length) embed.addFields({ name: 'Bench', value: truncate(bench.join(' ')) });
    if (plan.pairs.length) {
      embed.addFields({
        name: 'Chemistry',
        value: truncate(plan.pairs.map((p) => `<@${p.ids[0]}> + <@${p.ids[1]}>: ${Math.round(winPct(p.together))}% together in ${p.together.games}`).join('\n')),
      });
    }
    const open = plan.slots.length - byIndex.size;
    embed.setFooter({ text: `${open ? `${open} spot${open === 1 ? '' : 's'} open. ` : ''}Publish posts the team sheet and pings the XI.` });
    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ap_pub:${lineupId}`).setLabel('Publish').setEmoji('📢').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ap_tweak:${lineupId}`).setLabel('Tweak').setEmoji('🛠️').setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  async function saveDraft(event, club, plan, lineupId) {
    const fields = {
      formation: plan.formation,
      team_avg_rating: plan.avgRating,
      updated_at: new Date().toISOString(),
    };
    if (lineupId) {
      await supabase.from('lineups').update(fields).eq('id', lineupId);
      await supabase.from('lineup_slots').delete().eq('lineup_id', lineupId);
    } else {
      const { data, error } = await supabase
        .from('lineups')
        .insert({
          ...fields,
          guild_id: event.guild_id,
          event_id: event.id,
          team_id: club.team_id || event.team_id || null,
          name: `Auto XI: ${event.title}`.slice(0, 100),
          created_by_discord_id: client().user.id,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      lineupId = data.id;
    }
    if (plan.rows.length) {
      const { error } = await supabase.from('lineup_slots').insert(plan.rows.map((r) => ({ ...r, lineup_id: lineupId })));
      if (error) throw new Error(error.message);
    }
    return lineupId;
  }

  async function draftDue(now) {
    const { data } = await supabase
      .from('availability_events')
      .select('*')
      .eq('closed', false)
      .eq('cancelled', false)
      .not('club_key', 'is', null)
      .gt('scheduled_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString())
      .lte('scheduled_at', new Date(now.getTime() + LINEUP_LEAD_MS).toISOString());
    for (const event of data || []) {
      if (drafted.has(event.id) || !client().guilds.cache.has(event.guild_id)) continue;
      drafted.add(event.id);
      await autoDraft(event).catch((err) => console.warn(`[autopilot] draft for ${event.id} failed: ${err.message}`));
    }
  }

  async function autoDraft(event) {
    const club = await events.clubFor(event.guild_id, event.club_key);
    if (!club || !isOn(club, 'lineup')) return;
    // A manager already picked one (linked to the event, or saved in the last day)
    if (await matchNight.lineupFor(event)) return;

    const state = await getGuildState(event.guild_id);
    const vcId = state.clubVcLinks?.[club.key];
    const inVoice = vcId ? voiceMembers(event.guild_id, vcId) : [];
    const checkins = await matchNight.loadCheckins(event.id);
    // Everyone in voice, plus anyone checked in by button who isn't in voice yet
    const pool = [...new Set([...inVoice, ...checkins.filter((c) => c.status !== 'out').map((c) => c.discord_user_id)])];
    if (!pool.length) return;

    const plan = await draft(event, club, pool.slice(0, 30));
    const lineupId = await saveDraft(event, club, plan);
    lineupPool.set(lineupId, pool);

    const channel = await client().channels.fetch(event.channel_id).catch(() => null);
    if (!channel?.send || missingChannelPerms(channel, channel.guild.members.me).length) return;
    const leaders = await leadersFor(club, event);
    const payload = {
      content: leaders.length ? `${leaders.map((id) => `<@${id}>`).join(' ')} your team sheet is ready to publish.` : undefined,
      ...suggestionEmbed(event, club, lineupId, plan, inVoice.length || pool.length),
      allowedMentions: { users: leaders },
    };
    const checkinPost = event.checkin_message_id ? await channel.messages.fetch(event.checkin_message_id).catch(() => null) : null;
    await (checkinPost ? checkinPost.reply(payload) : channel.send(payload));
  }

  async function loadDraft(lineupId) {
    if (!/^[0-9a-f-]{36}$/i.test(lineupId || '')) return {};
    const { data: lineup } = await supabase.from('lineups').select('*').eq('id', lineupId).maybeSingle();
    const event = lineup?.event_id ? await events.loadEvent(lineup.event_id) : null;
    const club = event?.club_key ? await events.clubFor(event.guild_id, event.club_key) : null;
    return { lineup, event, club };
  }

  async function handlePublish(interaction, lineupId) {
    const { lineup, event, club } = await loadDraft(lineupId);
    if (!lineup || !event || !club) return interaction.reply({ content: '❌ This suggestion is no longer available.', flags: 64 });
    if (!(await canManageClub(interaction.member, club))) return interaction.reply({ content: `❌ Only ${club.name}'s leaders can publish.`, flags: 64 });
    await interaction.deferUpdate();
    const { error, data } = await callEdgeFunction(
      'announce-lineup',
      { action: 'announce', lineup_id: lineup.id, channel_id: lineup.channel_id || event.channel_id, mention_players: true, dm_players: false, message: '' },
      30000
    );
    if (error || !data?.success) {
      return interaction.followUp({ content: `❌ Could not publish: ${error || data?.error || 'unknown error'}`, flags: 64 });
    }
    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57f287).setFooter({ text: `Published by ${interaction.member.displayName}` });
    await interaction.editReply({ content: interaction.message.content || undefined, embeds: [embed], components: [] });
  }

  async function handleTweak(interaction, lineupId) {
    const { lineup, event, club } = await loadDraft(lineupId);
    if (!lineup || !event || !club) return interaction.reply({ content: '❌ This suggestion is no longer available.', flags: 64 });
    if (!(await canManageClub(interaction.member, club))) return interaction.reply({ content: `❌ Only ${club.name}'s leaders can change the lineup.`, flags: 64 });
    const matches = loadMatches ? await loadMatches(event.guild_id, club.key).catch(() => []) : [];
    const stats = new Map(computeFormations(matches).map((f) => [f.formation, f]));
    const names = Object.keys(FORMATION_SLOTS).sort((a, b) => (stats.get(b)?.record.games || 0) - (stats.get(a)?.record.games || 0));
    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ap_form:${lineup.id}:${interaction.message.id}`)
          .setPlaceholder('Redraft in another formation')
          .addOptions(
            names.slice(0, 25).map((f) => ({
              label: f,
              value: f,
              default: f === lineup.formation,
              description: stats.get(f) ? `${Math.round(winPct(stats.get(f).record))}% won in ${stats.get(f).record.games}` : undefined,
            }))
          )
      ),
    ];
    if (dashboardUrl) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setURL(`${dashboardUrl.replace(/\/$/, '')}/teams`).setLabel('Move players in the Lineup Builder').setStyle(ButtonStyle.Link)
        )
      );
    }
    return interaction.reply({ content: 'Pick a formation to redraft the same players, or move people around in the Lineup Builder and press Publish here.', components: rows, flags: 64 });
  }

  async function handleFormationPick(interaction, lineupId, messageId) {
    const { lineup, event, club } = await loadDraft(lineupId);
    if (!lineup || !event || !club) return interaction.update({ content: '❌ This suggestion is no longer available.', components: [] });
    if (!(await canManageClub(interaction.member, club))) return interaction.update({ content: '❌ Only club leaders can change the lineup.', components: [] });
    await interaction.update({ content: '🛠️ Redrafting…', components: [] });
    let pool = lineupPool.get(lineup.id);
    if (!pool) {
      const { data: slots } = await supabase.from('lineup_slots').select('discord_user_id').eq('lineup_id', lineup.id);
      pool = (slots || []).map((s) => s.discord_user_id);
    }
    const plan = await draft(event, club, pool, interaction.values[0]);
    await saveDraft(event, club, plan, lineup.id);
    const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (message) await message.edit(suggestionEmbed(event, club, lineup.id, plan, pool.length));
    // Already published: update the team sheet in place too
    if (lineup.message_id) {
      await callEdgeFunction('announce-lineup', { action: 'announce', lineup_id: lineup.id, channel_id: lineup.channel_id, mention_players: true }, 30000);
    }
    await interaction.editReply({ content: `✅ Redrafted in **${plan.formation}**.${lineup.message_id ? ' The published team sheet was updated too.' : ''}` });
  }

  // ---------- 2. Match recaps ----------

  // One line that says something the scoreline doesn't
  function statNugget(match) {
    const players = match.players;
    const name = (p) => (p.ea_username || '').trim();
    const hatTrick = players.find((p) => (Number(p.goals) || 0) >= 3);
    if (hatTrick) return `🎩 Hat-trick for **${name(hatTrick)}** (${hatTrick.goals} goals).`;

    let best = null;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const total = (Number(a.goals) || 0) + (Number(a.assists) || 0) + (Number(b.goals) || 0) + (Number(b.assists) || 0);
        const bothInvolved = (Number(a.goals) || Number(a.assists)) && (Number(b.goals) || Number(b.assists));
        if (bothInvolved && total >= 3 && (!best || total > best.total)) best = { a, b, total };
      }
    }
    if (best) return `🤝 **${name(best.a)}** and **${name(best.b)}** combined for ${best.total} goals and assists.`;

    // Clean sheet and keeper heroics from this game alone; streaks and droughts belong to the Chronicle
    const keeper = players.find((p) => /^(gk|goalkeeper)$/i.test(String(p.position)) && (Number(p.saves) || 0) >= 4);
    if (match.scoreAgainst === 0 && keeper) return `🧤 Clean sheet, with **${name(keeper)}** making ${keeper.saves} saves.`;
    if (match.scoreAgainst === 0) return '🧤 Clean sheet.';
    return null;
  }

  async function buildRecap(row, club) {
    const prefs = await events.serverPrefs(row.guild_id);
    const { data: recent } = await supabase
      .from('club_matches')
      .select('id, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type')
      .eq('guild_id', row.guild_id)
      .eq('club_key', row.club_key)
      .order('created_at', { ascending: false })
      .limit(20);
    const history = toInsightMatches(recent || []);
    const idx = history.findIndex((m) => m.id === row.id);
    const match = idx >= 0 ? history[idx] : toInsightMatches([row])[0];
    const upTo = idx >= 0 ? history.slice(idx) : [match];
    const r = RESULT[match.result];
    const name = (p) => (p.ea_username || '').trim();
    const count = (n) => (n > 1 ? ` ×${n}` : '');

    const scorers = match.players.filter((p) => Number(p.goals) > 0).sort((a, b) => b.goals - a.goals);
    const assisters = match.players.filter((p) => Number(p.assists) > 0).sort((a, b) => b.assists - a.assists);
    const rated = match.players.filter((p) => Number(p.rating) > 0).sort((a, b) => b.rating - a.rating);
    const motm = match.players.find((p) => p.motm) || rated[0];

    const nugget = statNugget(match);
    // Story lines about this game only (the run, records and head-to-head live in the Chronicle editions):
    // a pun on someone's numbers or the opponent's name, the catalyst, and a gentle roast on defeats
    const story = [];
    const gag = PRESS.statPun(match, match.id) || PRESS.nameJoke(match.opponent, match.result, match.id);
    if (gag && gag !== nugget) story.push(`😂 ${gag}`);
    const cat = RX.catalyst(match);
    if (cat) story.push(cat);
    const flop = RX.flop(match);
    if (flop) story.push(flop);

    const embed = new EmbedBuilder()
      .setTitle(`${r.emoji} ${r.label} · ${club.name} ${match.scoreFor}-${match.scoreAgainst} ${match.opponent}`)
      .setColor(r.color)
      .setTimestamp(match.playedAt);
    if (prefs.branding?.footer) embed.setFooter({ text: prefs.branding.footer });
    // With the recap image, the text only adds what the image can't show: the image already carries the
    // headline, scoreline, ratings table, Man of the Match and talking point.
    if (recapImage && isOn(club, 'graphics')) {
      const png = await recapImage({ row, club, match, history: upTo, prefs, talkingPoint: nugget, headline: RX.headline(match, club) }).catch((err) => {
        console.warn(`[autopilot] recap image ${row.id} failed: ${err.message}`);
        return null;
      });
      if (png) {
        if (story.length) embed.setDescription(truncate(story.slice(0, 3).join('\n'), 600));
        embed.setImage('attachment://recap.png');
        return { embeds: [embed], files: [{ attachment: png, name: 'recap.png' }] };
      }
    }
    // No image: one compact card with the headline, who scored and the Man of the Match
    const facts = [
      scorers.length && `⚽ ${scorers.map((p) => `${name(p)}${count(p.goals)}`).join(', ')}`,
      assisters.length && `🎯 ${assisters.map((p) => `${name(p)}${count(p.assists)}`).join(', ')}`,
      motm && `⭐ ${name(motm)}${Number(motm.rating) > 0 ? ` (${Number(motm.rating).toFixed(1)})` : ''}`,
    ].filter(Boolean);
    embed.setDescription(
      truncate([`📰 ${RX.headline(match, club)}`, facts.join(' · '), ...[nugget, ...story].filter(Boolean).slice(0, 2)].filter(Boolean).join('\n'), 1000)
    );
    if (prefs.branding?.logo_url) embed.setThumbnail(prefs.branding.logo_url);
    return { embeds: [embed] };
  }

  // Recap every new club_matches row once. The cursor is the created_at of the last row seen;
  // a club without one starts from when the bot started, so old history is never replayed.
  async function postRecaps(now) {
    const { data } = await supabase
      .from('club_matches')
      .select('id, guild_id, club_key, created_at, result, score_for, score_against, opponent_club_name, player_stats, match_data, match_type')
      .gte('created_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(300);
    // Newest first so a big history backfill can't push this tick's games out of the page
    const byClub = new Map();
    for (const row of (data || []).reverse()) {
      if (!client().guilds.cache.has(row.guild_id)) continue;
      const key = `${row.guild_id}|${row.club_key}`;
      if (!byClub.has(key)) byClub.set(key, []);
      byClub.get(key).push(row);
    }
    for (const rows of byClub.values()) {
      const { guild_id: guildId, club_key: clubKey } = rows[0];
      const club = await events.clubFor(guildId, clubKey);
      if (!club) continue;
      const cursor = club.autopilot?.recap_cursor || startedAt;
      const fresh = rows.filter((r) => new Date(r.created_at) > new Date(cursor));
      if (!fresh.length) continue;
      const lastSeen = fresh[fresh.length - 1].created_at;
      await updateClub(guildId, clubKey, (ap) => {
        ap.recap_cursor = lastSeen;
      });
      // History backfills (/syncclub) insert old games; only react to ones played in the last few hours
      // Every recent game gets its own recap, oldest first, so back-to-back games are never dropped
      const recent = toInsightMatches(fresh)
        .filter((m) => now.getTime() - m.playedAt.getTime() < RECAP_MAX_AGE_MS)
        .reverse();
      if (!recent.length) continue;
      for (const hook of newMatchHooks) {
        await hook(guildId, club, recent, fresh).catch((err) => console.warn(`[autopilot] new-match hook failed: ${err.message}`));
      }
      const shown = recent.length > RECAPS_PER_TICK ? recent.slice(-RECAPS_PER_TICK) : recent;
      const channel = isOn(club, 'recaps') ? await postChannel(guildId, club) : null;
      if (isOn(club, 'recaps') && !channel) console.warn(`[autopilot] ${recent.length} recap(s) for ${guildId}/${clubKey} not posted: no channel I can post in`);
      if (channel) await sendRecaps(channel, club, recent, shown, fresh);
      await postMatchReports(guildId, club, shown);
    }
  }

  async function sendRecaps(channel, club, recent, shown, fresh) {
    const rowsById = new Map(fresh.map((r) => [r.id, r]));
    if (shown.length < recent.length) {
      const older = recent.slice(0, recent.length - shown.length);
      const line = older.map((m) => `${RESULT[m.result].emoji} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent}`).join(' · ');
      await channel.send({ content: `🏁 ${older.length} earlier game${older.length === 1 ? '' : 's'} synced: ${line}`.slice(0, 2000) }).catch(() => {});
    }
    for (const m of shown) {
      const recapRow = rowsById.get(m.id);
      const recapMsg = await buildRecap(recapRow, club);
      // Unlinked players get a private "Is this you?" DM instead of public buttons on the recap
      if (deps.autoLink && Array.isArray(recapRow?.player_stats) && channel.guild) {
        const tags = recapRow.player_stats.map((p) => p?.ea_username).filter(Boolean);
        deps.autoLink.promptMatchPlayers(channel.guild, tags).catch(() => {});
      }
      await channel.send(recapMsg).catch((err) => console.warn(`[autopilot] recap ${m.id} failed: ${err.message}`));
    }
  }

  // ---------- 2b. Newspaper match reports ----------
  // One Chronicle-style story per game, printed in the Chronicle's own channel next to the editions.
  // Only clubs that picked a Chronicle channel (Print Chronicle here) get them, so nobody's recap channel doubles up unasked.
  async function buildMatchStory(guildId, club, match, seasonMatches) {
    const prefs = await events.serverPrefs(guildId).catch(() => ({}));
    const story = await aiStory(
      "You are a sharp newspaper beat writer covering an EA FC Pro Clubs team. Write a short postgame piece about THIS ONE GAME only: one paragraph, 3 to 5 sentences, under 550 characters. Open with a punchy lede on the result, say in one line how it was won or lost from the stats, and name the standout player or two in **bold** with their rating. Never mention other games, the season, form, streaks, records, head-to-head history or milestones; that belongs to the twice-daily digest. Land at least one funny pun or wordplay (on a player's numbers or the opponent's name) when one genuinely works, and vary your openings, verbs and jokes so no two pieces read alike. Only use the facts given; never invent goals, minutes, scorers' timing or quotes. No headings or bullet points. The game's 'script' tag (demolition, lockdown, shootout, smash-and-grab, heartbreaker, etc.) sets the tone. Clean sheets belong only to goalkeepers and defenders, never attackers. Stats marked (est) are estimates; say 'about'." + ` ${aiStyle(club)}`,
      storyFacts({ club, matches: [match], seasonMatches, single: true })
    );
    return buildMatchReport({ club, match, logoUrl: prefs.branding?.logo_url, story });
  }

  async function postMatchReports(guildId, club, matches) {
    const chId = club.autopilot?.chronicle_channel_id;
    if (!matches.length || !chId || !isOn(club, 'press') || !isOn(club, 'chronicle')) return;
    const guild = client().guilds.cache.get(guildId);
    const channel = guild ? await guild.channels.fetch(chId).catch(() => null) : null;
    if (!channel?.isTextBased?.()) return;
    const all = loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
    for (const m of matches) {
      const report = await buildMatchStory(guildId, club, m, all).catch((err) => console.warn(`[autopilot] match report ${m.id} failed: ${err.message}`));
      if (report) await channel.send(report).catch((err) => console.warn(`[autopilot] match report send failed: ${err.message}`));
    }
  }

  // ---------- 3. Sub dispatch ----------

  function cancelSubTimer(eventId, userId) {
    const key = `${eventId}:${userId}`;
    clearTimeout(subTimers.get(key));
    subTimers.delete(key);
  }

  async function watchDropout(event, club, userId, vcId) {
    const lineup = await matchNight.lineupFor(event);
    const slot = lineup?.slots.find((s) => !s.is_substitute && s.discord_user_id === userId);
    if (!slot) return;
    const key = `${event.id}:${userId}`;
    if (subTimers.has(key)) return;
    subTimers.set(
      key,
      setTimeout(() => {
        subTimers.delete(key);
        dispatchSub(event.id, club.key, userId, vcId, slot.position).catch((err) => console.warn(`[autopilot] sub for ${userId} failed: ${err.message}`));
      }, SUB_GRACE_MS)
    );
  }

  async function dispatchSub(eventId, clubKey, userId, vcId, position) {
    const event = await events.loadEvent(eventId);
    if (!event || event.closed || event.cancelled || Date.now() > eventEnd(event)) return;
    const club = await events.clubFor(event.guild_id, clubKey);
    if (!club || !isOn(club, 'subs')) return;
    const guild = client().guilds.cache.get(event.guild_id);
    if (!guild || guild.voiceStates.cache.get(userId)?.channelId === vcId) return;
    // Still a starter, and nobody has asked for cover already
    const lineup = await matchNight.lineupFor(event);
    if (!lineup?.slots.some((s) => !s.is_substitute && s.discord_user_id === userId)) return;
    const { data: existing } = await supabase
      .from('sub_requests')
      .select('id')
      .eq('event_id', event.id)
      .eq('replacing_discord_id', userId)
      .neq('status', 'cancelled')
      .limit(1);
    if (existing?.length) return;
    const channel = await client().channels.fetch(event.channel_id).catch(() => null);
    if (!channel?.send || missingChannelPerms(channel, guild.members.me).length) return;
    await matchNight.postSubRequest(channel, event, {
      position,
      replacing: userId,
      requestedBy: client().user.id,
      lineupId: lineup.id,
      note: `<@${userId}> left <#${vcId}> ${Math.round(SUB_GRACE_MS / 60000)} min ago.`,
    });
    await matchNight.refreshCheckin(event);
  }

  // ---------- 3b. Voice-bounded session recap ----------

  // One player's line: GP and only the stats that aren't zero
  function sessionPlayerLine(t) {
    const parts = [`👕 GP ${t.games}`];
    if (t.goals) parts.push(`🥅 GLS ${t.goals}`);
    if (t.shots) parts.push(`🎯 SHT ${t.shots}`);
    if (t.assists) parts.push(`🤝 AST ${t.assists}`);
    if (t.passAttempts) parts.push(`👟 PAS ${t.passesMade}/${t.passAttempts}`);
    if (t.tackleAttempts || t.tackles) parts.push(`🛡 TKL ${t.tackles}/${t.tackleAttempts || t.tackles}`);
    if (t.interceptions) parts.push(`🧠 INT ${t.interceptions}`);
    if (t.clearances) parts.push(`🧹 CLR ${t.clearances}`);
    if (t.saves) parts.push(`🧤 SVS ${t.saves}`);
    if (t.motm) parts.push(`⭐ MOTM ${t.motm}`);
    return parts.join(' · ');
  }

  async function buildSessionRecap(guildId, club, matches, startedAt, endedAt) {
    const prefs = await events.serverPrefs(guildId);
    const ordered = [...matches].sort((a, b) => a.playedAt - b.playedAt);
    const goalsFor = ordered.reduce((s, m) => s + m.scoreFor, 0);
    const goalsAgainst = ordered.reduce((s, m) => s + m.scoreAgainst, 0);
    const minutes = Math.round((endedAt - startedAt) / 60000);
    const embed = new EmbedBuilder()
      .setTitle(`🧾 Session recap · ${club.name}`)
      .setColor(Number(prefs.branding?.color) || 0x5865f2)
      .setDescription(
        `You played **${ordered.length}** match${ordered.length === 1 ? '' : 'es'} in ${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m.\n` +
          `**${record(ordered)}** · ${goalsFor} scored, ${goalsAgainst} conceded\n` +
          ordered.map((m) => `${RESULT[m.result].emoji} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent}`).join('\n')
      )
      .setTimestamp(new Date(endedAt));
    const players = [...seasonTotals(ordered).values()].sort((a, b) => b.avgRating - a.avgRating || b.games - a.games);
    for (const t of players.slice(0, SESSION_MAX_PLAYERS)) {
      embed.addFields({ name: `${t.name} · ${t.avgRating ? t.avgRating.toFixed(1) : '–'}`, value: truncate(sessionPlayerLine(t)), inline: true });
    }
    embed.setFooter({ text: `${prefs.branding?.footer ? `${prefs.branding.footer} · ` : ''}From voice to voice: ${ordered.length} EA matches. /manager → Match Night → Autopilot to switch this off.` });
    return { embeds: [embed] };
  }

  async function closeSession(guild, club, session) {
    const startedAt = new Date(session.started_at).getTime();
    const endedAt = new Date(session.empty_since).getTime();
    const matches = loadMatches ? await loadMatches(guild.id, club.key).catch(() => []) : [];
    const played = matches.filter((m) => m.playedAt.getTime() >= startedAt - SESSION_EARLY_MS && m.playedAt.getTime() <= endedAt);
    if (!played.length) return;
    const recap = await buildSessionRecap(guild.id, club, played, startedAt, endedAt);
    // Premium extras (the assistant coach) add embeds to the same message
    for (const hook of sessionHooks) {
      const extra = await hook({ guildId: guild.id, club, matches: played, allMatches: matches, startedAt, endedAt }).catch((err) => {
        console.warn(`[autopilot] session hook failed: ${err.message}`);
        return null;
      });
      if (extra?.embeds) recap.embeds.push(...extra.embeds);
    }
    const channel = await postChannel(guild.id, club);
    if (channel) await channel.send(recap).catch((err) => console.warn(`[autopilot] session recap failed: ${err.message}`));
  }

  // A session opens when the linked voice channel gets its first player and closes once it has
  // been empty for SESSION_SETTLE_MS; the state lives on the club so a restart doesn't lose it.
  async function sweepSessions(now) {
    for (const guild of client().guilds.cache.values()) {
      const state = await getGuildState(guild.id);
      for (const club of activeClubs(state)) {
        const vcId = state.clubVcLinks?.[club.key];
        if (!vcId || !club.ea_club_id) continue;
        const session = club.autopilot?.session || null;
        const busy = voiceMembers(guild.id, vcId).length > 0;
        if (busy && (!session || session.empty_since)) {
          await updateClub(guild.id, club.key, (ap) => {
            ap.session = session ? { started_at: session.started_at } : { started_at: now.toISOString() };
          });
        } else if (!busy && session && !session.empty_since) {
          await updateClub(guild.id, club.key, (ap) => {
            ap.session = { ...session, empty_since: now.toISOString() };
          });
        } else if (!busy && session?.empty_since && now - new Date(session.empty_since) >= SESSION_SETTLE_MS) {
          await updateClub(guild.id, club.key, (ap) => {
            delete ap.session;
          });
          if (isOn(club, 'session')) await closeSession(guild, club, session).catch((err) => console.warn(`[autopilot] session ${club.key} failed: ${err.message}`));
        }
      }
    }
  }

  // ---------- 4. Weekly digest ----------

  async function buildDigest(guildId, club) {
    const matches = loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const week = matches.filter((m) => m.playedAt.getTime() >= weekAgo);
    const o = computeOverview(week);
    const embed = new EmbedBuilder().setTitle(`🗞️ ${club.name} weekly digest`).setColor(0x5865f2).setTimestamp(new Date());
    embed.setDescription(
      week.length
        ? `This week: **${record(week)}**, ${o.goalsFor} scored and ${o.goalsAgainst} conceded. Form ${week.slice(0, 10).reverse().map((m) => RESULT[m.result].emoji).join('')}`
        : 'No matches synced this week.'
    );

    // Best first; the weakest is flagged when it loses more than it wins
    const formations = computeFormations(matches)
      .filter((f) => f.record.games >= MIN_FORMATION_GAMES)
      .sort((a, b) => winPct(b.record) - winPct(a.record));
    if (formations.length) {
      const worst = formations.length > 1 && winPct(formations[formations.length - 1].record) < 50 ? formations[formations.length - 1] : null;
      const shown = [...formations.slice(0, 3).filter((f) => f !== worst), ...(worst ? [worst] : [])];
      const icon = (f, i) => (f === worst ? '⚠️' : i === 0 ? '✅' : '•');
      embed.addFields({
        name: 'Formations',
        value: truncate(shown.map((f, i) => `${icon(f, i)} **${f.formation}** won ${Math.round(winPct(f.record))}% (${recordText(f.record)})`).join('\n')),
      });
    }

    const comboLine = (c) => `**${c.names.join(' + ')}**: ${Math.round(winPct(c.together))}% in ${c.together.games} together${c.apart.games ? ` (${Math.round(winPct(c.apart))}% apart)` : ''}`;
    const duos = computeCombos(matches, 2).filter((c) => c.lift > 0).slice(0, 3);
    const trio = computeCombos(matches, 3).filter((c) => c.lift > 0)[0];
    if (duos.length || trio) embed.addFields({ name: 'Best pairings', value: truncate([...duos, ...(trio ? [trio] : [])].map(comboLine).join('\n')) });

    // Show-up rates for the club's roster (whole server when the club has no roster)
    let rosterIds = null;
    if (club.team_id) {
      const { data } = await supabase.from('team_rosters').select('discord_user_id').eq('team_id', club.team_id);
      if (data?.length) rosterIds = new Set(data.map((r) => r.discord_user_id));
    }
    const inClub = (id) => !rosterIds || rosterIds.has(id);
    const [{ data: reliability }, { data: missed }] = await Promise.all([
      supabase.from('player_reliability').select('discord_user_id, reliability_score, events_available').eq('guild_id', guildId).gte('events_available', 3),
      supabase
        .from('attendance_records')
        .select('discord_user_id')
        .eq('guild_id', guildId)
        .eq('said_available', true)
        .eq('actually_showed', false)
        .gte('recorded_at', new Date(weekAgo).toISOString()),
    ]);
    const reliable = (reliability || []).filter((r) => inClub(r.discord_user_id) && Number(r.reliability_score) >= 90).sort((a, b) => b.events_available - a.events_available);
    const noShows = [...new Set((missed || []).map((r) => r.discord_user_id).filter(inClub))];
    if (reliable.length) embed.addFields({ name: '🟢 Always there (90%+)', value: truncate(reliable.slice(0, 15).map((r) => `<@${r.discord_user_id}> ${Math.round(Number(r.reliability_score))}%`).join(', ')) });
    if (noShows.length) embed.addFields({ name: '🔴 Said yes, didn’t show this week', value: truncate(noShows.map((id) => `<@${id}>`).join(', ')) });

    const hasContent = week.length || formations.length || duos.length || reliable.length || noShows.length;
    embed.setFooter({ text: `Based on ${matches.length} synced matches. /manager → Match Night → Autopilot to switch this off.` });
    return hasContent ? { embeds: [embed], allowedMentions: { parse: [] } } : null;
  }

  // Monday from 10:00 in the server's timezone, once per club per week
  async function postDigests(now) {
    for (const guild of client().guilds.cache.values()) {
      const { timezone } = await events.serverPrefs(guild.id);
      const local = T.localParts(now, timezone);
      if (local.weekday !== 1 || local.hour < DIGEST_HOUR) continue;
      const weekKey = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
      const state = await getGuildState(guild.id);
      for (const club of activeClubs(state)) {
        if (!club.ea_club_id || !isOn(club, 'digest') || club.autopilot?.digest_week === weekKey) continue;
        await updateClub(guild.id, club.key, (ap) => {
          ap.digest_week = weekKey;
        });
        const digest = await buildDigest(guild.id, club).catch((err) => console.warn(`[autopilot] digest ${club.key} failed: ${err.message}`));
        const channel = digest ? await postChannel(guild.id, club) : null;
        if (channel) await channel.send(digest).catch(() => {});
      }
    }
  }

  // ---------- Daily Chronicle (3 PM + midnight Central) ----------

  // AI-written copy when the bot has a key; undefined means the template prose is used
  async function aiStory(system, facts) {
    if (!deps.openai) return undefined;
    try {
      const res = await deps.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 650,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: facts },
        ],
      });
      return res.choices?.[0]?.message?.content?.trim() || undefined;
    } catch (err) {
      console.warn(`[chronicle] AI story failed, using template: ${err.message}`);
      return undefined;
    }
  }

  async function buildEdition(guildId, club, edition, now = new Date()) {
    const ed = EDITIONS[edition];
    const all = loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
    const since = now.getTime() - ed.windowH * 60 * 60 * 1000;
    const matches = all.filter((m) => m.playedAt.getTime() >= since && m.playedAt.getTime() <= now.getTime());
    const { data: upcoming } = await supabase
      .from('availability_events')
      .select('title, scheduled_at')
      .eq('guild_id', guildId)
      .eq('club_key', club.key)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', new Date(now.getTime() + 20 * 60 * 60 * 1000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5);
    const prefs = await events.serverPrefs(guildId).catch(() => ({}));
    const story = matches.length
      ? await aiStory(
          "You are a sharp newspaper beat writer covering an EA FC Pro Clubs team. Write 2-3 short paragraphs (under 950 characters total). Lead with the most newsworthy story angle, not the first game. Explain HOW games were won or lost using the stats (passing, tackling, finishing, saves), name standout players in **bold**, mention any milestone, rematch, drought or partnership from the angles, and give the last paragraph to the recent run of games and the overall team storyline (form, streaks, points pace, who is carrying the side). Vary sentence rhythm; no clichés like 'all in all'. Only use the facts given; never invent goals, minutes, scorers' timing or quotes. No headings or bullet points. Each game has a 'script' tag (demolition, lockdown, shootout, smash-and-grab, heartbreaker, etc.): use it to set the tone. Clean sheets belong only to goalkeepers and defenders, never attackers. Stats marked (est) are estimates; say 'about'." + ` ${aiStyle(club)}`,
          storyFacts({ club, matches, seasonMatches: all })
        )
      : undefined;
    // Premium front page drawn from the same cover, with players shown only through their own photos
    let image;
    if (editionImage && isOn(club, 'graphics')) {
      const cover = editionCover({ club, edition, matches, seasonMatches: all, now });
      image = (await editionImage({ guildId, club, cover, prefs }).catch((err) => console.warn(`[chronicle] front page failed: ${err.message}`))) || undefined;
    }
    return buildChronicle({ club, edition, matches, upcoming: upcoming || [], seasonMatches: all, now, logoUrl: prefs.branding?.logo_url, story, image });
  }

  async function postChronicles(now) {
    const local = T.localParts(now, CHRONICLE_TZ);
    const edition = local.hour === EDITIONS.afternoon.hour ? 'afternoon' : local.hour === EDITIONS.overnight.hour ? 'overnight' : null;
    if (!edition) return;
    const dayKey = `${local.year}-${local.month}-${local.day}:${edition}`;
    for (const guild of client().guilds.cache.values()) {
      const state = await getGuildState(guild.id);
      for (const club of activeClubs(state)) {
        if (!club.ea_club_id || !isOn(club, 'chronicle') || club.autopilot?.chronicle_last === dayKey) continue;
        await updateClub(guild.id, club.key, (ap) => {
          ap.chronicle_last = dayKey;
        });
        const paper = await buildEdition(guild.id, club, edition, now).catch((err) => console.warn(`[autopilot] chronicle ${club.key} failed: ${err.message}`));
        const chId = club.autopilot?.chronicle_channel_id || club.autopilot?.channel_id;
        const channel = chId ? await guild.channels.fetch(chId).catch(() => null) : await postChannel(guild.id, club);
        if (paper && channel) await channel.send(paper).catch((err) => console.warn(`[autopilot] chronicle send failed: ${err.message}`));
      }
    }
  }

  // ---------- /autopilot panel ----------

  async function buildPanel(guildId, club) {
    const channel = club.autopilot?.channel_id || club.stats_channel_id;
    const state = await getGuildState(guildId);
    const vcId = state.clubVcLinks?.[club.key];
    const embed = new EmbedBuilder()
      .setTitle(`🤖 ${club.name} Autopilot`)
      .setColor(0x5865f2)
      .setDescription(
        Object.entries(FEATURES)
          .map(([k, f]) => `${isOn(club, k) ? '✅' : '⛔'} ${f.emoji} **${f.label}**${f.premium ? ' ⭐' : ''}: ${f.help}`)
          .join('\n')
      )
      .addFields(
        { name: 'Voice channel', value: vcId ? `<#${vcId}>` : 'Not linked. Voice check-ins, the auto XI and sub requests need one: run **/manager → Lineups & Spots → Voice Spots** from the club voice channel.', inline: true },
        { name: 'Recaps and digest go to', value: channel ? `<#${channel}>` : 'The channel your events are posted in', inline: true },
        { name: '📰 Chronicle prints in', value: club.autopilot?.chronicle_channel_id ? `<#${club.autopilot.chronicle_channel_id}>` : club.autopilot?.channel_id ? `<#${club.autopilot.channel_id}> (the dropdown channel)` : 'Pick a channel in the dropdown below', inline: true },
        { name: '🏆 Hall of Fame posts in', value: club.autopilot?.hof_channel_id ? `<#${club.autopilot.hof_channel_id}>` : 'Not set (trophy banners go to the recap channel)', inline: true }
      );
    // Discord allows five buttons per row
    const toggleRow = (entries) =>
      new ActionRowBuilder().addComponents(
        entries.map(([k, f]) =>
          new ButtonBuilder()
            .setCustomId(`ap_t:${k}:${club.key}`)
            .setLabel(f.label)
            .setEmoji(f.emoji)
            .setStyle(isOn(club, k) ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
      );
    const entries = Object.entries(FEATURES);
    const toggles = [];
    for (let i = 0; i < entries.length; i += 5) toggles.push(toggleRow(entries.slice(i, i + 5)));
    const pickChannel = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`ap_ch:${club.key}`)
        .setPlaceholder('Channel for recaps and the digest')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    );
    const extras = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ap_digest:${club.key}`).setLabel('Preview digest').setEmoji('🗞️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ap_chronhere:${club.key}`).setLabel('Print Chronicle here').setEmoji('📰').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ap_chron:${club.key}`).setLabel('Preview Chronicle').setEmoji('🗞️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ap_hofhere:${club.key}`).setLabel('Hall of Fame here').setEmoji('🏆').setStyle(ButtonStyle.Primary)
    );
    embed.setFooter({
      text: PREMIUM_FREE ? '⭐ Premium jobs are free on every server for now.' : '⭐ Premium jobs only run on servers with GafferBot Premium. /manager → Premium for details.',
    });
    return { embeds: [embed], components: [...toggles, pickChannel, extras] };
  }

  async function withClub(interaction, key) {
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member, key);
    if (!club) {
      await interaction.reply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.', flags: 64 });
      return null;
    }
    if (!(await canManageClub(interaction.member, club))) {
      await interaction.reply({ content: `❌ Only ${club.name}'s leaders can change autopilot.`, flags: 64 });
      return null;
    }
    return club;
  }

  async function handleComponent(interaction) {
    const [action, a, b] = interaction.customId.split(':');
    if (!action.startsWith('ap_')) return false;
    if (action === 'ap_pub') await handlePublish(interaction, a);
    else if (action === 'ap_tweak') await handleTweak(interaction, a);
    else if (action === 'ap_form') await handleFormationPick(interaction, a, b);
    else if (action === 'ap_panel') {
      const club = await withClub(interaction, a);
      if (club) await interaction.reply({ ...(await buildPanel(interaction.guildId, club)), flags: 64 });
    } else if (action === 'ap_t' && FEATURES[a]) {
      const club = await withClub(interaction, b);
      if (!club) return true;
      const updated = await updateClub(interaction.guildId, club.key, (ap) => {
        const off = new Set(ap.off || []);
        if (off.has(a)) off.delete(a);
        else off.add(a);
        ap.off = [...off];
      });
      await interaction.update(await buildPanel(interaction.guildId, updated));
    } else if (action === 'ap_ch') {
      const club = await withClub(interaction, a);
      if (!club) return true;
      const updated = await updateClub(interaction.guildId, club.key, (ap) => {
        ap.channel_id = interaction.values[0];
      });
      await interaction.update(await buildPanel(interaction.guildId, updated));
    } else if (action === 'ap_chronhere') {
      const club = await withClub(interaction, a);
      if (!club) return true;
      // "Here" means the channel the button was pressed in, so the paper can have its own newspaper channel
      const targetId = interaction.channelId;
      const updated = await updateClub(interaction.guildId, club.key, (ap) => {
        ap.chronicle_channel_id = targetId;
        ap.off = (ap.off || []).filter((f) => f !== 'chronicle');
      });
      await interaction.update(await buildPanel(interaction.guildId, updated));
      await interaction.followUp({ content: `📰 The ${club.name} Chronicle will print in <#${targetId}> at 3 PM and midnight Central, with a newspaper match report after every game. Printing the latest edition there now.`, flags: 64 });
      // Print the edition covering the most recent period straight away
      const hour = T.localParts(new Date(), CHRONICLE_TZ).hour;
      const paper = await buildEdition(interaction.guildId, updated, hour >= 15 ? 'afternoon' : 'overnight').catch((err) => console.warn(`[autopilot] chronicle ${club.key} failed: ${err.message}`));
      const target = await interaction.guild?.channels.fetch(targetId).catch(() => null);
      if (paper && target?.isTextBased()) await target.send(paper).catch((err) => console.warn(`[autopilot] chronicle send failed: ${err.message}`));
    } else if (action === 'ap_hofhere') {
      const club = await withClub(interaction, a);
      if (!club) return true;
      const updated = await updateClub(interaction.guildId, club.key, (ap) => {
        ap.hof_channel_id = interaction.channelId;
        ap.off = (ap.off || []).filter((f) => f !== 'trophies');
      });
      await interaction.update(await buildPanel(interaction.guildId, updated));
      await interaction.followUp({ content: `🏆 Trophy banners and player accolades for ${club.name} will post in <#${interaction.channelId}>.`, flags: 64 });
    } else if (action === 'ap_chron') {
      const club = await withClub(interaction, a);
      if (!club) return true;
      await interaction.deferReply({ flags: 64 });
      const hour = Number(T.localParts(new Date(), CHRONICLE_TZ).hour);
      await interaction.editReply(await buildEdition(interaction.guildId, club, hour >= 12 && hour < 20 ? 'afternoon' : 'overnight'));
    } else if (action === 'ap_digest') {
      const club = await withClub(interaction, a);
      if (!club) return true;
      await interaction.deferReply({ flags: 64 });
      const digest = await buildDigest(interaction.guildId, club);
      await interaction.editReply(digest || { content: 'Nothing to report yet: no matches, pairings or show-up history.' });
    } else return false;
    return true;
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'autopilot') return false;
      const club = await withClub(interaction);
      if (club) await interaction.reply({ ...(await buildPanel(interaction.guildId, club)), flags: 64 });
      return true;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) return handleComponent(interaction);
    return false;
  }

  // ---------- Scheduler ----------

  async function tick(now) {
    for (const [name, job] of [
      ['voice', sweepVoice],
      ['lineup', draftDue],
      ['recaps', postRecaps],
      ['digest', postDigests],
      ['chronicle', postChronicles],
      ['session', sweepSessions],
    ]) {
      await job(now).catch((err) => console.warn(`[autopilot] ${name} failed: ${err.message}`));
    }
  }

  events.onTick(tick);
  events.onClose((event) => {
    for (const key of subTimers.keys()) if (key.startsWith(`${event.id}:`)) cancelSubTimer(event.id, key.split(':')[1]);
    eventCache.delete(event.guild_id);
    return Promise.resolve();
  });

  // The bot's own EA monitor posts a basic result card; skip it when recaps cover the club
  const postsRecaps = (club) => isOn(club, 'recaps');

  return {
    commands: AUTOPILOT_COMMANDS,
    handleInteraction,
    onVoiceStateUpdate,
    postsRecaps,
    buildDigest,
    buildRecap,
    postMatchReports,
    draft,
    isOn,
    updateClub,
    postChannel,
    // fn(guildId, club, recentMatches, rows) after new EA matches land, whether or not recaps are on
    onNewMatches: (fn) => newMatchHooks.push(fn),
    // fn({ guildId, club, matches, allMatches, startedAt, endedAt }) -> { embeds } added to the session recap
    onSessionEnd: (fn) => sessionHooks.push(fn),
    buildSessionRecap,
    // fn({ row, club, match, history, prefs, talkingPoint }) -> PNG buffer or null
    // fn({ guildId, club, cover, prefs }) -> PNG buffer or null (the Chronicle front page)
    setEditionImage: (fn) => {
      editionImage = fn;
    },
    setRecapImage: (fn) => {
      recapImage = fn;
    },
  };
}

module.exports = { createAutopilot, AUTOPILOT_COMMANDS, FEATURES };
