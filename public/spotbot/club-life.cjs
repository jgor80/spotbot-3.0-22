// Club Life: the Discord side of badges, Club Wrapped, Awards Night, the belts, coach goals, the division
// poster and the Network Wire, plus what the Chronicle prints about them.
//   /manager → Club Life   Post Fun Zone, Start Awards Night, Post Club Wrapped, Badge Wall, Belts, Settings
//   /me → My Career        a player's badges, milestones in reach, this week's goal, card frame and Wrapped
// Scheduled (server timezone): Wrapped and Awards Night on the 1st for last month, and again for the
// season when EA's next season starts; ballots close after 72 hours; division changes get a poster.
// Everything is drawn locally (no AI calls). Commands here are panel actions only (ACTION_SCHEMAS).

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { toInsightMatches } = require('./club-insights.cjs');
const { seasonTotals } = require('./player-season.cjs');
const { BADGES, TIER_ORDER, TIER_EMOJI, FRAME_TIERS, milestonesInReach, clubTimezone, rarityText } = require('./career.cjs');
const { wrappedFor, wrappedTiles, monthPeriod, seasonJustEnded } = require('./wrapped.cjs');
const { nominations, tally, VOTE_HOURS } = require('./awards.cjs');
const { clubAccent, crestUrl } = require('./club-colors.cjs');
const GL = require('./graphics-club-life.cjs');
const G = require('./graphics.cjs');
const { fmt: goalFmt } = require('./dev-goals.cjs');
const T = require('./event-time.cjs');

const DAY = 24 * 60 * 60 * 1000;
const SCHEDULE_HOUR = 12;
const DIVISION_EVERY_MS = 60 * 60 * 1000;

const LIFE_FEATURES = {
  badges: { label: 'Badges', emoji: '🏅', help: 'Badge unlocks get one line and a medal image in the recap channel.' },
  wrapped: { label: 'Club Wrapped', emoji: '🎁', help: 'On the 1st, and when an EA season ends, every player can get their Wrapped.' },
  awards: { label: 'Awards Night', emoji: '🏆', help: 'Monthly and season awards: nominations from the stats, a 72-hour squad vote, then a ceremony.' },
  goals: { label: 'Coach goals', emoji: '🎯', help: 'One development goal per regular each week, in the Monday digest.' },
  wire: { label: 'Network Wire', emoji: '📡', help: 'Weekly Network news in your network channel (Network servers only).' },
};

const CLUBLIFE_COMMANDS = [
  {
    name: 'clublife',
    description: 'Club Life: badges, Club Wrapped, Awards Night, belts and the Fun Zone.',
    options: [
      { type: 1, name: 'awards', description: 'Start Awards Night now: nominations from the last 30 days and a 72-hour squad vote.' },
      { type: 1, name: 'wrapped', description: 'Post Club Wrapped for last month now (it also posts by itself on the 1st).' },
      { type: 1, name: 'badges', description: "The club's badge wall: who has which badge and how rare it is." },
      { type: 1, name: 'belts', description: 'Who holds each weekly belt, how long for, and the longest reigns.' },
      { type: 1, name: 'settings', description: 'Switch badges, Wrapped, Awards Night, coach goals and the Network Wire on or off.' },
    ],
  },
  { name: 'career', description: 'Your career at the club: badges, milestones in reach, this week\'s goal, card frame and Wrapped.', options: [{ type: 1, name: 'view', description: 'Open your career card.' }] },
];

function slimRow(r) {
  return { ...r, match_data: { timestamp: r.ts ?? null, _tag: r.tag ?? null, _matchCategory: r.cat ?? null } };
}

function createClubLife(deps) {
  const { supabase, autopilot, events, getGuildState, canManageClub, loadMatches, career, devGoals, statRoles, broadcast, network, dashboardUrl } = deps;
  const client = () => events.getClient();
  const site = (dashboardUrl || 'https://gafferbot.app').replace(/\/$/, '');
  let lastDivisionCheck = 0;

  // ---------- Data ----------

  // Every match played in [start, end), however long ago it synced
  async function matchesBetween(guildId, clubKey, start, end) {
    const rows = [];
    for (let page = 0; page < 10; page++) {
      const { data, error } = await supabase
        .from('club_matches')
        .select('id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, ts:match_data->timestamp, tag:match_data->_tag, cat:match_data->_matchCategory')
        .eq('guild_id', guildId)
        .eq('club_key', clubKey)
        .gte('created_at', new Date(start.getTime() - 2 * DAY).toISOString())
        .order('created_at', { ascending: true })
        .range(page * 500, page * 500 + 499);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    return toInsightMatches(rows.map(slimRow)).filter((m) => m.playedAt >= start && m.playedAt < end);
  }

  async function tzOf(guildId) {
    return clubTimezone(await events.serverPrefs(guildId).catch(() => ({})));
  }

  async function accentOf(guildId, club) {
    const prefs = await events.serverPrefs(guildId).catch(() => ({}));
    return clubAccent(club, prefs.branding, undefined);
  }

  async function clubFor(interaction) {
    const state = await getGuildState(interaction.guildId);
    return resolveClub(state, interaction.member) || activeClubs(state)[0] || null;
  }

  async function hofChannel(guildId, club) {
    const id = club.autopilot?.hof_channel_id;
    const ch = id ? await client()?.guilds.cache.get(guildId)?.channels.fetch(id).catch(() => null) : null;
    return ch?.send ? ch : autopilot.postChannel(guildId, club);
  }

  // ---------- Chronicle extras ----------

  autopilot.setChronicleExtras(async ({ guildId, club, since, now }) => {
    const from = (since || new Date(now.getTime() - DAY)).toISOString();
    const [careers, status, { data: recentBadges }, { data: held }, { data: reigns }, { data: ballots }] = await Promise.all([
      career.careersFor(guildId, club.key),
      statRoles?.beltStatus ? statRoles.beltStatus(guildId, club.key).catch(() => []) : [],
      supabase.from('player_badges').select('player_name, badge, tier, earned_at').eq('guild_id', guildId).eq('club_key', club.key).gte('earned_at', new Date(now.getTime() - 14 * DAY).toISOString()).order('earned_at', { ascending: false }).limit(30),
      supabase.from('player_badges').select('player_key, badge, tier').eq('guild_id', guildId).eq('club_key', club.key).in('tier', ['rare', 'epic', 'legendary']).limit(500),
      supabase.from('trophy_reigns').select('trophy, player_name, started_at').eq('guild_id', guildId).eq('club_key', club.key).gte('started_at', from).limit(20),
      supabase.from('club_award_ballots').select('period_label, categories, results, closed_at').eq('guild_id', guildId).eq('club_key', club.key).eq('status', 'closed').gte('closed_at', from).limit(3),
    ]);
    const { TROPHIES } = require('./stat-roles.cjs');
    const around = [];
    for (const b of (recentBadges || []).filter((x) => x.earned_at >= from).slice(0, 4)) around.push(`**${b.player_name}** unlocked the ${BADGES[b.badge]?.name || b.badge} badge${b.tier !== 'common' ? ` (${b.tier})` : ''}.`);
    if ((reigns || []).length < 6) for (const r of reigns || []) around.push(`**${r.player_name}** took the ${TROPHIES[r.trophy]?.name || r.trophy} belt.`);
    for (const b of ballots || []) {
      for (const c of b.categories || []) {
        const win = b.results?.[c.key]?.winner;
        const n = c.nominees.find((x) => x.key === win);
        if (n) around.push(`Awards Night (${b.period_label}): **${n.name}** won ${c.label}.`);
      }
    }
    return {
      careers,
      belts: status.flatMap((b) => b.holders.map((h) => ({ label: b.label, name: h.name, days: h.days }))),
      badges: (recentBadges || []).map((b) => ({ name: b.player_name, badge: BADGES[b.badge]?.name || b.badge, tier: b.tier })),
      badgesHeld: (held || []).map((b) => ({ player_key: b.player_key, name: BADGES[b.badge]?.name || b.badge })),
      milestones: milestonesInReach(careers),
      around,
    };
  });

  // ---------- Club Wrapped ----------

  async function generateWrapped(guildId, club, period) {
    const matches = await matchesBetween(guildId, club.key, period.start, period.end);
    if (matches.length < 3) return null;
    const totals = [...seasonTotals(matches).values()].filter((t) => t.games >= 3);
    const { data: badgeRows } = await supabase.from('player_badges').select('player_key, badge, tier').eq('guild_id', guildId).eq('club_key', club.key).gte('earned_at', period.start.toISOString()).lt('earned_at', period.end.toISOString()).limit(1000);
    const ids = await career.linkedIds(totals.map((t) => t.name));
    const rows = [];
    for (const t of totals) {
      const badges = (badgeRows || []).filter((b) => b.player_key === t.key && BADGES[b.badge]).map((b) => ({ badge: b.badge, name: BADGES[b.badge].name, glyph: BADGES[b.badge].glyph, tier: b.tier }));
      const data = wrappedFor(t.key, matches, { badges });
      if (data) rows.push({ guild_id: guildId, club_key: club.key, period_key: period.key, period_label: period.label, player_key: t.key, player_name: t.name, discord_user_id: ids.get(t.key) || null, data });
    }
    if (rows.length) {
      const { error } = await supabase.from('player_wrapped').upsert(rows, { onConflict: 'guild_id,club_key,period_key,player_key' });
      if (error) throw new Error(error.message);
    }
    return { rows, matches };
  }

  async function postWrapped(guildId, club, period, channel = null) {
    const res = await generateWrapped(guildId, club, period);
    if (!res?.rows.length) return null;
    const { matches, rows } = res;
    const w = matches.filter((m) => m.result === 'win').length;
    const d = matches.filter((m) => m.result === 'draw').length;
    const gf = matches.reduce((s, m) => s + m.scoreFor, 0);
    const totals = [...seasonTotals(matches).values()];
    const scorer = [...totals].sort((a, b) => b.goals - a.goals)[0];
    const capped = [...totals].sort((a, b) => b.games - a.games)[0];
    const embed = new EmbedBuilder()
      .setTitle(`🎁 Club Wrapped · ${period.label}`)
      .setColor(await accentOf(guildId, club) ?? 0x22c55e)
      .setDescription(`${club.name} played **${matches.length}** games: ${w}W ${d}D ${matches.length - w - d}L, ${gf} goals.\n${scorer?.goals ? `Top scorer: **${scorer.name}** (${scorer.goals}). ` : ''}Most capped: **${capped.name}** (${capped.games}).\n\n**${rows.length}** players have a Wrapped waiting. Press the button to get yours.`)
      .setFooter({ text: 'Players with 3+ games and a linked EA gamertag (/me → Link EA). Drawn from EA match data.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cl_wrap:${club.key}:${period.key}`).setLabel('Get my Wrapped').setEmoji('🎁').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setURL(`${site}/wrapped`).setLabel('Open on the web').setStyle(ButtonStyle.Link)
    );
    const target = channel || (await autopilot.postChannel(guildId, club));
    if (!target) return null;
    return target.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  }

  async function wrappedRowFor(guildId, clubKey, periodKey, userId) {
    let q = supabase.from('player_wrapped').select('*').eq('guild_id', guildId).eq('club_key', clubKey);
    if (periodKey) q = q.eq('period_key', periodKey);
    const { data: mine } = await q.eq('discord_user_id', userId).order('created_at', { ascending: false }).limit(1);
    if (mine?.length) return mine[0];
    const { data: prof } = await supabase.from('profiles').select('ea_username').eq('discord_user_id', userId).maybeSingle();
    if (!prof?.ea_username) return null;
    let q2 = supabase.from('player_wrapped').select('*').eq('guild_id', guildId).eq('club_key', clubKey).eq('player_key', prof.ea_username.toLowerCase());
    if (periodKey) q2 = q2.eq('period_key', periodKey);
    const { data } = await q2.order('created_at', { ascending: false }).limit(1);
    return data?.[0] || null;
  }

  async function wrappedImage(guildId, club, row) {
    const photos = broadcast?.portraitsFor ? await broadcast.portraitsFor(guildId, [row.player_name], row.period_key).catch(() => new Map()) : new Map();
    return GL.wrappedCard({
      playerName: row.player_name,
      clubName: club.name,
      periodLabel: row.period_label,
      accent: await accentOf(guildId, club),
      photo: photos.get(row.player_key) || null,
      headline: row.data.title?.text,
      tiles: wrappedTiles(row.data),
      badges: (row.data.badges || []).map((b) => ({ glyph: b.glyph, tier: b.tier })),
    });
  }

  // ---------- Awards Night ----------

  function ballotMessage(ballot, closed = false) {
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Awards Night · ${ballot.period_label}`)
      .setColor(0xd4af37)
      .setDescription(closed ? 'Voting is closed. The ceremony is in the Hall of Fame.' : `The squad decides. One vote per category, and you can change it until voting closes <t:${Math.floor(new Date(ballot.closes_at).getTime() / 1000)}:R>. Votes are private.`);
    for (const c of ballot.categories) {
      embed.addFields({ name: `${c.emoji} ${c.label}`, value: c.nominees.map((n) => `• **${n.name}**${n.line ? ` · ${n.line}` : ''}${n.url ? ` · [watch](${n.url})` : ''}`).join('\n').slice(0, 1024) });
    }
    if (closed) return { embeds: [embed], components: [] };
    const selects = ballot.categories.map((c) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`aw_v:${ballot.id}:${c.key}`)
          .setPlaceholder(`${c.label}: cast your vote`.slice(0, 150))
          .addOptions(c.nominees.map((n) => ({ label: n.name.slice(0, 100), value: n.key, description: (n.line || '').slice(0, 100) || undefined, emoji: c.emoji })))
      )
    );
    const close = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`aw_close:${ballot.id}`).setLabel('Close voting (leaders)').setEmoji('🔒').setStyle(ButtonStyle.Secondary));
    return { embeds: [embed], components: [...selects.slice(0, 4), close] };
  }

  async function startAwards(guildId, club, period, { createdBy = null, channel = null } = {}) {
    const { data: existing } = await supabase.from('club_award_ballots').select('id, status').eq('guild_id', guildId).eq('club_key', club.key).eq('period_key', period.key).maybeSingle();
    if (existing) return { error: existing.status === 'open' ? 'Awards Night for that period is already open.' : 'Awards Night for that period already happened.' };
    const matches = await matchesBetween(guildId, club.key, period.start, period.end);
    const careers = await career.careersFor(guildId, club.key);
    const categories = nominations(matches, { careers, clips: club.autopilot?.clip_log || [], period });
    if (!categories.length) return { error: `Not enough to vote on yet: each category needs two nominees with 3+ games in ${period.label}.` };
    const target = channel || (await autopilot.postChannel(guildId, club));
    if (!target) return { error: "I couldn't find a channel to post the ballot in. Pick one in /manager → Match Night → Autopilot." };
    const { data: ballot, error } = await supabase
      .from('club_award_ballots')
      .insert({ guild_id: guildId, club_key: club.key, period_key: period.key, period_label: period.label, kind: period.kind, categories, status: 'open', closes_at: new Date(Date.now() + VOTE_HOURS * 3600000).toISOString(), created_by_discord_id: createdBy })
      .select('*')
      .single();
    if (error) return { error: error.message };
    const msg = await target.send({ content: '🏆 **Awards Night** voting is open!', ...ballotMessage(ballot), allowedMentions: { parse: [] } }).catch((err) => ({ error: err.message }));
    if (msg?.error) return msg;
    await supabase.from('club_award_ballots').update({ channel_id: msg.channelId, message_id: msg.id }).eq('id', ballot.id);
    return { ballot, message: msg };
  }

  async function loadBallot(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return null;
    const { data } = await supabase.from('club_award_ballots').select('*').eq('id', id).maybeSingle();
    return data;
  }

  async function closeBallot(ballot) {
    const { data: claimed } = await supabase.from('club_award_ballots').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', ballot.id).eq('status', 'open').select('*');
    if (!claimed?.length) return null;
    const { data: votes } = await supabase.from('club_award_votes').select('category, choice').eq('ballot_id', ballot.id);
    const results = tally(ballot.categories, votes || []);
    await supabase.from('club_award_ballots').update({ results }).eq('id', ballot.id);
    const guild = client()?.guilds.cache.get(ballot.guild_id);
    const state = await getGuildState(ballot.guild_id);
    const club = state?.clubs?.find((c) => c.key === ballot.club_key);
    // Strike the ballot message
    if (guild && ballot.channel_id && ballot.message_id) {
      const ch = await guild.channels.fetch(ballot.channel_id).catch(() => null);
      const msg = ch?.messages ? await ch.messages.fetch(ballot.message_id).catch(() => null) : null;
      if (msg) await msg.edit({ content: '🏆 **Awards Night** voting is closed.', ...ballotMessage(ballot, true) }).catch(() => {});
    }
    if (!club) return results;
    const winners = [];
    for (const c of ballot.categories) {
      const r = results[c.key];
      const n = c.nominees.find((x) => x.key === r?.winner);
      if (n) winners.push({ category: c.label, emoji: c.emoji, name: n.name, votes: r.votes[n.key], line: n.line, url: n.url });
    }
    const channel = await hofChannel(ballot.guild_id, club);
    if (!channel) return results;
    if (!winners.length) {
      await channel.send({ content: `🏆 Awards Night · ${ballot.period_label}: nobody voted, so the trophies stay in the cabinet this time.` }).catch(() => {});
      return results;
    }
    const photos = broadcast?.portraitsFor ? await broadcast.portraitsFor(ballot.guild_id, winners.map((w) => w.name), ballot.period_key).catch(() => new Map()) : new Map();
    let files = [];
    try {
      const png = GL.awardsPoster({ clubName: club.name, periodLabel: ballot.period_label, accent: await accentOf(ballot.guild_id, club), winners: winners.map((w) => ({ ...w, photo: photos.get(w.name.toLowerCase()) || null })) });
      files = [new AttachmentBuilder(png, { name: 'awards.png' })];
    } catch (err) {
      console.warn(`[awards] poster failed: ${err.message}`);
    }
    const ids = await career.linkedIds(winners.map((w) => w.name));
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Awards Night · ${ballot.period_label}`)
      .setColor(0xd4af37)
      .setDescription(winners.map((w) => `${w.emoji} **${w.category}**: ${ids.get(w.name.toLowerCase()) ? `<@${ids.get(w.name.toLowerCase())}>` : `**${w.name}**`} (${w.votes} vote${w.votes === 1 ? '' : 's'})${w.url ? ` · [the goal](${w.url})` : ''}`).join('\n'))
      .setFooter({ text: 'Into the Hall of Fame. Every Awards Night is on the website under Trophy Room.' });
    if (files.length) embed.setImage('attachment://awards.png');
    await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } }).catch((err) => console.warn(`[awards] ceremony failed: ${err.message}`));
    return results;
  }

  async function closeDueBallots(now) {
    const { data } = await supabase.from('club_award_ballots').select('*').eq('status', 'open').lte('closes_at', now.toISOString()).limit(20);
    for (const b of data || []) {
      if (!client()?.guilds.cache.has(b.guild_id)) continue;
      await closeBallot(b).catch((err) => console.warn(`[awards] close ${b.id} failed: ${err.message}`));
    }
  }

  // ---------- Division poster ----------

  async function divisionCheck(guildId, club) {
    const { data } = await supabase.from('club_division_history').select('captured_on, current_division').eq('guild_id', guildId).eq('club_key', club.key).order('captured_on', { ascending: false }).limit(2);
    const [latest, prev] = data || [];
    if (!latest || club.autopilot?.division_seen === latest.captured_on) return;
    await autopilot.updateClub(guildId, club.key, (ap) => {
      ap.division_seen = latest.captured_on;
    });
    if (!club.autopilot?.division_seen || !prev || latest.current_division == null || prev.current_division == null || latest.current_division === prev.current_division) return;
    const up = latest.current_division < prev.current_division;
    const channel = await autopilot.postChannel(guildId, club);
    if (!channel) return;
    const prefs = await events.serverPrefs(guildId).catch(() => ({}));
    const crest = await G.fetchImage(crestUrl(club, prefs.branding)).catch(() => null);
    const png = GL.divisionPoster({ clubName: club.name, kind: up ? 'promoted' : 'relegated', from: prev.current_division, to: latest.current_division, accent: clubAccent(club, prefs.branding, undefined), crest });
    await channel.send({ content: up ? `🚀 **${club.name}** are up to Division ${latest.current_division}!` : `🪂 ${club.name} drop to Division ${latest.current_division}. Regroup and go again.`, files: [new AttachmentBuilder(png, { name: 'division.png' })] }).catch(() => {});
  }

  // ---------- Schedule ----------

  async function tick(now) {
    await career.sweep(now, loadMatches).catch((err) => console.warn(`[clublife] career sweep failed: ${err.message}`));
    await closeDueBallots(now).catch((err) => console.warn(`[clublife] ballots failed: ${err.message}`));
    const divisionDue = now.getTime() - lastDivisionCheck >= DIVISION_EVERY_MS;
    if (divisionDue) lastDivisionCheck = now.getTime();
    let seasons = null;
    for (const guild of client()?.guilds.cache.values() || []) {
      const tz = await tzOf(guild.id);
      const local = T.localParts(now, tz);
      const state = await getGuildState(guild.id);
      for (const club of activeClubs(state).filter((c) => c.ea_club_id)) {
        if (divisionDue) await divisionCheck(guild.id, club).catch((err) => console.warn(`[clublife] division ${club.key} failed: ${err.message}`));
        if (local.day === 1 && local.hour >= SCHEDULE_HOUR) {
          const prevMonth = local.month === 1 ? 12 : local.month - 1;
          const period = monthPeriod(local.month === 1 ? local.year - 1 : local.year, prevMonth, T.zonedToUtc, tz);
          await runPeriod(guild.id, club, period, 'month').catch((err) => console.warn(`[clublife] month ${club.key} failed: ${err.message}`));
        }
        if (local.hour >= SCHEDULE_HOUR) {
          if (!seasons) seasons = (await supabase.from('ea_seasons').select('code, label, starts_at')).data || [];
          const period = seasonJustEnded(seasons, now);
          if (period) await runPeriod(guild.id, club, period, 'season').catch((err) => console.warn(`[clublife] season ${club.key} failed: ${err.message}`));
        }
      }
    }
    if (deps.wire) await deps.wire.tick(now).catch((err) => console.warn(`[clublife] wire failed: ${err.message}`));
  }

  // Wrapped, then the Awards Night ballot, once per club per period
  async function runPeriod(guildId, club, period, kind) {
    const mark = kind === 'season' ? 'life_season' : 'life_month';
    if (club.autopilot?.[mark] === period.key) return;
    await autopilot.updateClub(guildId, club.key, (ap) => {
      ap[mark] = period.key;
    });
    if (autopilot.isOn(club, 'wrapped')) await postWrapped(guildId, club, period).catch((err) => console.warn(`[clublife] wrapped ${club.key} failed: ${err.message}`));
    if (autopilot.isOn(club, 'awards')) {
      const r = await startAwards(guildId, club, period).catch((err) => ({ error: err.message }));
      if (r?.error) console.log(`[clublife] awards ${guildId}/${club.key} ${period.key}: ${r.error}`);
    }
  }

  // ---------- Panels ----------

  function settingsPanel(club) {
    const embed = new EmbedBuilder()
      .setTitle(`🎉 ${club.name} · Club Life settings`)
      .setColor(0x5865f2)
      .setDescription(Object.entries(LIFE_FEATURES).map(([k, f]) => `${autopilot.isOn(club, k) ? '✅' : '⛔'} ${f.emoji} **${f.label}**: ${f.help}`).join('\n'));
    const row = new ActionRowBuilder().addComponents(
      Object.entries(LIFE_FEATURES).map(([k, f]) => new ButtonBuilder().setCustomId(`cl_t:${k}:${club.key}`).setLabel(f.label).setEmoji(f.emoji).setStyle(autopilot.isOn(club, k) ? ButtonStyle.Success : ButtonStyle.Secondary))
    );
    return { embeds: [embed], components: [row] };
  }

  async function badgeWall(guildId, club) {
    const [{ data: badges }, { count: players }] = await Promise.all([
      supabase.from('player_badges').select('player_name, badge, tier').eq('guild_id', guildId).eq('club_key', club.key).limit(5000),
      supabase.from('player_career').select('player_key', { count: 'exact', head: true }).eq('guild_id', guildId).eq('club_key', club.key),
    ]);
    const embed = new EmbedBuilder().setTitle(`🏅 ${club.name} badge wall`).setColor(0xf59e0b);
    if (!badges?.length) return { embeds: [embed.setDescription('No badges yet. They unlock from synced EA matches; the first sync reads the whole history.')] };
    const by = new Map();
    for (const b of badges) by.set(b.badge, [...(by.get(b.badge) || []), b.player_name]);
    for (const tier of [...TIER_ORDER].reverse()) {
      const lines = Object.entries(BADGES).filter(([k, d]) => d.tier === tier && by.has(k)).map(([k, d]) => `**${d.name}** · ${rarityText(by.get(k).length, players || 0)}: ${by.get(k).slice(0, 5).join(', ')}${by.get(k).length > 5 ? '…' : ''}`);
      if (lines.length) embed.addFields({ name: `${TIER_EMOJI[tier]} ${tier[0].toUpperCase()}${tier.slice(1)}`, value: lines.join('\n').slice(0, 1024) });
    }
    const counts = new Map();
    for (const b of badges) counts.set(b.player_name, (counts.get(b.player_name) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    embed.setDescription(`Top collectors: ${top.map(([n, c]) => `**${n}** ${c}`).join(' · ')}`);
    embed.setFooter({ text: `${Object.keys(BADGES).length} badges to unlock. Full walls with rarity are on the website profile pages.` });
    return { embeds: [embed] };
  }

  async function beltsView(guildId, club) {
    const status = statRoles?.beltStatus ? await statRoles.beltStatus(guildId, club.key) : [];
    const embed = new EmbedBuilder().setTitle(`🥊 ${club.name} belts`).setColor(0xf5b301);
    if (!status.length) return { embeds: [embed.setDescription('No belt history yet. Belts are tracked after each synced match while Stat trophies are on (/manager → Match Night → Autopilot).')] };
    for (const b of status) {
      embed.addFields({ name: b.label, value: `${b.holders.length ? b.holders.map((h) => `**${h.name}** · day ${h.days}`).join('\n') : 'Vacant'}${b.longest ? `\n-# Record: ${b.longest.name}, ${b.longest.days} days` : ''}`, inline: true });
    }
    return { embeds: [embed] };
  }

  // A player's career card: totals, badges, milestones in reach, this week's goal, frame and Wrapped
  async function careerView(interaction) {
    const club = await clubFor(interaction);
    if (!club) return { content: 'No club is set up yet.' };
    const userId = interaction.user.id;
    const { data: prof } = await supabase.from('profiles').select('ea_username').eq('discord_user_id', userId).maybeSingle();
    const key = prof?.ea_username?.toLowerCase();
    const { data: row } = key ? await supabase.from('player_career').select('*').eq('guild_id', interaction.guildId).eq('club_key', club.key).eq('player_key', key).maybeSingle() : { data: null };
    if (!row) return { content: `I couldn't find your career at ${club.name}. Link your EA gamertag with **/me → Link EA**; careers fill in from synced matches.` };
    const [badges, goals] = await Promise.all([career.badgesOf(interaction.guildId, { clubKey: club.key, playerKey: key }), devGoals ? devGoals.currentFor(interaction.guildId, userId).catch(() => []) : []]);
    const embed = new EmbedBuilder()
      .setTitle(`🪪 ${row.player_name} · ${club.name}`)
      .setColor(await accentOf(interaction.guildId, club) ?? 0x5865f2)
      .setDescription(`**${row.apps}** apps · **${row.goals}** goals · **${row.assists}** assists · **${row.motm}** MOTM · **${row.clean_sheets}** clean sheets\n${row.wins} wins (${row.apps ? Math.round((100 * row.wins) / row.apps) : 0}%)${row.best_rating ? ` · best rating ${Number(row.best_rating).toFixed(1)}` : ''}${row.first_match_at ? ` · first game <t:${Math.floor(Date.parse(row.first_match_at) / 1000)}:D>` : ''}`);
    if (badges.length) {
      const sorted = [...badges].sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier));
      embed.addFields({ name: `🏅 Badges (${badges.length}/${Object.keys(BADGES).length})`, value: sorted.slice(0, 12).map((b) => `${TIER_EMOJI[b.tier]} ${BADGES[b.badge]?.name || b.badge}${b.featured ? ' · card frame' : ''}`).join('\n').slice(0, 1024) });
    }
    const next = milestonesInReach([row], { maxGap: 10 });
    if (next.length) embed.addFields({ name: '🎯 Next milestone', value: next[0].text });
    const goal = goals[0];
    if (goal) embed.addFields({ name: goal.status === 'open' ? "🎯 This week's goal" : '🎯 Last goal', value: `${goal.label}${goal.status !== 'open' ? ` · ${goal.status === 'met' ? '✅ met' : goal.status === 'missed' ? '❌ missed' : '➖ not enough games'}${goal.result != null ? ` (${goalFmt(goal.metric, Number(goal.result))})` : ''}` : ''}` });
    const components = [];
    const frames = badges.filter((b) => FRAME_TIERS.has(b.tier));
    if (frames.length) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('cl_frame').setPlaceholder('Card frame: wear a rare badge on your Studio cards').addOptions([
          { label: 'No frame', value: 'none', emoji: '⬜' },
          ...frames.slice(0, 24).map((b) => ({ label: BADGES[b.badge]?.name || b.badge, value: b.badge, description: `${b.tier} badge`, emoji: TIER_EMOJI[b.tier], default: !!b.featured })),
        ])
      ));
    }
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cl_wrap:${club.key}:`).setLabel('My latest Wrapped').setEmoji('🎁').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setURL(`${site}/profile`).setLabel('Full career on the web').setStyle(ButtonStyle.Link)
    ));
    return { embeds: [embed], components };
  }

  // ---------- Interactions ----------

  async function leaderOnly(interaction, club) {
    if (club && (await canManageClub(interaction.member, club))) return true;
    await interaction.reply({ content: `🔒 Only ${club?.name || 'the club'}'s leaders can do that.`, flags: 64 });
    return false;
  }

  async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand(false);
    if (interaction.commandName === 'career') {
      await interaction.deferReply({ flags: 64 });
      return interaction.editReply(await careerView(interaction));
    }
    const club = await clubFor(interaction);
    if (!club) return interaction.reply({ content: 'No club is set up yet. Run **/setup** first.', flags: 64 });
    if (sub === 'badges') {
      await interaction.deferReply({ flags: 64 });
      return interaction.editReply(await badgeWall(interaction.guildId, club));
    }
    if (sub === 'belts') {
      await interaction.deferReply({ flags: 64 });
      return interaction.editReply(await beltsView(interaction.guildId, club));
    }
    if (!(await leaderOnly(interaction, club))) return null;
    if (sub === 'settings') return interaction.reply({ ...settingsPanel(club), flags: 64 });
    await interaction.deferReply({ flags: 64 });
    if (sub === 'awards') {
      const end = new Date();
      const day = end.toISOString().slice(0, 10);
      const r = await startAwards(interaction.guildId, club, { key: `custom-${day}`, label: `the last 30 days`, kind: 'custom', start: new Date(end.getTime() - 30 * DAY), end }, { createdBy: interaction.user.id, channel: interaction.channel });
      return interaction.editReply({ content: r.error ? `❌ ${r.error}` : `🏆 Awards Night is open in <#${r.message.channelId}>. Voting closes in ${VOTE_HOURS} hours, or press **Close voting** on the ballot.` });
    }
    if (sub === 'wrapped') {
      const tz = await tzOf(interaction.guildId);
      const local = T.localParts(new Date(), tz);
      const period = monthPeriod(local.month === 1 ? local.year - 1 : local.year, local.month === 1 ? 12 : local.month - 1, T.zonedToUtc, tz);
      const sent = await postWrapped(interaction.guildId, club, period, interaction.channel).catch((err) => console.warn(`[clublife] wrapped failed: ${err.message}`));
      return interaction.editReply({ content: sent ? `🎁 Club Wrapped for ${period.label} is posted.` : `Nothing to wrap for ${period.label}: players need 3+ games in it.` });
    }
    return interaction.editReply({ content: 'Unknown Club Life action.' });
  }

  async function handleComponent(interaction) {
    const [action, a, b] = interaction.customId.split(':');
    if (action === 'cl_t' && LIFE_FEATURES[a]) {
      const state = await getGuildState(interaction.guildId);
      const club = state?.clubs?.find((c) => c.key === b);
      if (!(await leaderOnly(interaction, club))) return;
      const updated = await autopilot.updateClub(interaction.guildId, club.key, (ap) => {
        const off = new Set(ap.off || []);
        if (off.has(a)) off.delete(a);
        else off.add(a);
        ap.off = [...off];
      });
      return interaction.update(settingsPanel(updated));
    }
    if (action === 'cl_wrap' || action === 'cl_wrapshare') {
      await interaction.deferReply({ flags: action === 'cl_wrap' ? 64 : undefined });
      const state = await getGuildState(interaction.guildId);
      const club = state?.clubs?.find((c) => c.key === a);
      const row = club ? await wrappedRowFor(interaction.guildId, club.key, b || null, interaction.user.id) : null;
      if (!row) return interaction.editReply({ content: 'No Wrapped for you there yet. You need 3+ games in the period and your EA gamertag linked (**/me → Link EA**).' });
      const png = await wrappedImage(interaction.guildId, club, row);
      const files = [new AttachmentBuilder(png, { name: 'wrapped.png' })];
      if (action === 'cl_wrapshare') return interaction.editReply({ content: `🎁 <@${interaction.user.id}>'s Club Wrapped · ${row.period_label}`, files, allowedMentions: { parse: [] } });
      return interaction.editReply({
        content: `🎁 Your Club Wrapped · ${row.period_label}`,
        files,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`cl_wrapshare:${club.key}:${row.period_key}`).setLabel('Share in this channel').setEmoji('📣').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setURL(`${site}/wrapped`).setLabel('See the full story').setStyle(ButtonStyle.Link)
        )],
      });
    }
    if (action === 'cl_frame') {
      const pickBadge = interaction.values?.[0];
      const ok = await career.setFeatured(interaction.guildId, interaction.user.id, pickBadge === 'none' ? null : pickBadge);
      return interaction.reply({ content: pickBadge === 'none' ? 'Card frame removed.' : ok ? `🖼️ Your Studio cards now wear the **${BADGES[pickBadge]?.name}** frame.` : "Couldn't set that frame.", flags: 64 });
    }
    if (action === 'aw_v') {
      const ballot = await loadBallot(a);
      if (!ballot || ballot.status !== 'open' || Date.parse(ballot.closes_at) < Date.now()) return interaction.reply({ content: 'Voting for this Awards Night is closed.', flags: 64 });
      const cat = ballot.categories.find((c) => c.key === b);
      const choice = interaction.values?.[0];
      const nominee = cat?.nominees.find((n) => n.key === choice);
      if (!nominee) return interaction.reply({ content: 'That option is no longer on the ballot.', flags: 64 });
      const { error } = await supabase.from('club_award_votes').upsert({ ballot_id: ballot.id, category: cat.key, discord_user_id: interaction.user.id, choice, voted_at: new Date().toISOString() }, { onConflict: 'ballot_id,category,discord_user_id' });
      return interaction.reply({ content: error ? `❌ ${error.message}` : `✅ Your ${cat.label} vote for **${nominee.name}** is in. You can change it until voting closes.`, flags: 64 });
    }
    if (action === 'aw_close') {
      const ballot = await loadBallot(a);
      if (!ballot) return interaction.reply({ content: 'That ballot no longer exists.', flags: 64 });
      const state = await getGuildState(interaction.guildId);
      const club = state?.clubs?.find((c) => c.key === ballot.club_key);
      if (!(await leaderOnly(interaction, club))) return;
      await interaction.deferReply({ flags: 64 });
      const results = ballot.status === 'open' ? await closeBallot(ballot) : null;
      return interaction.editReply({ content: results ? '🏆 Voting closed. The ceremony is posted in the Hall of Fame channel.' : 'This ballot was already closed.' });
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if (interaction.isChatInputCommand?.() && (interaction.commandName === 'clublife' || interaction.commandName === 'career')) {
      await handleCommand(interaction);
      return true;
    }
    const id = interaction.customId || '';
    if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && /^(cl_|aw_)/.test(id)) {
      await handleComponent(interaction);
      return true;
    }
    return false;
  }

  events.onTick((now) => tick(now).catch((err) => console.warn(`[clublife] tick failed: ${err.message}`)));

  return { handleInteraction, startAwards, closeBallot, postWrapped, generateWrapped, matchesBetween, careerView, badgeWall, beltsView, settingsPanel };
}

module.exports = { createClubLife, CLUBLIFE_COMMANDS, LIFE_FEATURES };
