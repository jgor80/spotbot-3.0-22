// Matchday Picks: a prediction game for every session.
//   Open    when the club's linked voice channel gets its first player (or a leader presses Open Picks).
//           Everyone picks tonight's verdict (more wins than losses, even, or more losses), the top scorer
//           and a captain. Picks lock once the first game of the night lands.
//   Score   when the voice session ends: 3 points for the right verdict, 3 for the top scorer (ties count),
//           and the captain's own night: 2 a goal, 1 an assist, 1 a Man of the Match.
//   Vote    then a 12-hour Fans' Player of the Night vote between the night's best five; backing the
//           winner is worth 1 more point. Votes stay private (service role only).
//   Table   points add up per EA season; the leader is the Oracle. Club Life → Picks Table and the website.
// Pure scoring helpers first, then the Discord wiring. No AI calls.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { seasonTotals } = require('./player-season.cjs');

const HOUR = 60 * 60 * 1000;
const REOPEN_AFTER_MS = 8 * HOUR; // one round per evening, even if voice empties and refills
const STALE_AFTER_MS = 14 * HOUR; // a round nobody closed is scored (or voided) after this
const EARLY_MS = 30 * 60 * 1000; // games that kicked off just before the round opened still count
const MATCH_MS = 15 * 60 * 1000; // roughly one game, so a pick made mid-game doesn't count
const VOTE_HOURS = 12;
const CANDIDATE_DAYS = 30;
const MAX_CANDIDATES = 25;
const POTN_OPTIONS = 5;

const VERDICTS = {
  win: { label: 'We win more than we lose', emoji: '📈' },
  even: { label: 'Wins and losses level', emoji: '⚖️' },
  loss: { label: 'We lose more than we win', emoji: '📉' },
};
const POINTS = { verdict: 3, scorer: 3, captainGoal: 2, captainAssist: 1, captainMotm: 1, potn: 1 };

// Pure: what actually happened on the night. matches = the session's games
function outcomeOf(matches) {
  const wins = matches.filter((m) => m.result === 'win').length;
  const losses = matches.filter((m) => m.result === 'loss').length;
  const totals = [...seasonTotals(matches).values()];
  const most = Math.max(0, ...totals.map((t) => t.goals));
  return {
    games: matches.length,
    wins,
    draws: matches.length - wins - losses,
    losses,
    verdict: wins > losses ? 'win' : wins === losses ? 'even' : 'loss',
    topScorers: most > 0 ? totals.filter((t) => t.goals === most).map((t) => t.key) : [],
    topGoals: most,
    players: Object.fromEntries(totals.map((t) => [t.key, { name: t.name, games: t.games, goals: t.goals, assists: t.assists, motm: t.motm, avg: t.rated ? Math.round(t.avgRating * 100) / 100 : null }])),
  };
}

// Pure: one member's points for the night. Picks made after the lock don't count.
function scorePick(pick, outcome, locksAt = null) {
  const late = locksAt && pick.picked_at && Date.parse(pick.picked_at) > Date.parse(locksAt);
  const breakdown = {};
  if (!late) {
    if (pick.verdict && pick.verdict === outcome.verdict) breakdown.verdict = POINTS.verdict;
    if (pick.scorer && outcome.topScorers.includes(pick.scorer)) breakdown.scorer = POINTS.scorer;
    const c = pick.captain ? outcome.players[pick.captain] : null;
    if (c) {
      const pts = c.goals * POINTS.captainGoal + c.assists * POINTS.captainAssist + c.motm * POINTS.captainMotm;
      if (pts) breakdown.captain = pts;
    }
  }
  const points = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { points, breakdown, late: !!late };
}

// Pure: the Fans' Player of the Night shortlist, best average rating first (2+ games when anyone has them)
function potnShortlist(outcome) {
  const all = Object.entries(outcome.players).filter(([, p]) => p.avg != null);
  const regulars = all.filter(([, p]) => p.games >= 2);
  return (regulars.length >= 2 ? regulars : all)
    .sort((a, b) => b[1].avg - a[1].avg || b[1].goals + b[1].assists - (a[1].goals + a[1].assists))
    .slice(0, POTN_OPTIONS)
    .map(([key, p]) => ({ key, name: p.name, line: `${p.avg.toFixed(1)} avg · ${p.goals}G ${p.assists}A · ${p.games} game${p.games === 1 ? '' : 's'}` }));
}

// Pure: votes -> winner key (ties go to the better rating, which is listed first)
function potnWinner(options, votes) {
  const counts = Object.fromEntries(options.map((o) => [o.key, 0]));
  for (const v of votes) if (v.choice in counts) counts[v.choice]++;
  const max = Math.max(0, ...Object.values(counts));
  return { winner: max ? options.find((o) => counts[o.key] === max).key : null, counts };
}

// Pure: season table from scored picks [{ discord_user_id, points }]
function seasonTable(picks) {
  const by = new Map();
  for (const p of picks) {
    const r = by.get(p.discord_user_id) || { discord_user_id: p.discord_user_id, points: 0, rounds: 0, best: 0 };
    r.points += p.points || 0;
    r.rounds++;
    r.best = Math.max(r.best, p.points || 0);
    by.set(p.discord_user_id, r);
  }
  return [...by.values()].sort((a, b) => b.points - a.points || b.best - a.best || a.rounds - b.rounds);
}

function seasonKeyFor(seasons, now = new Date()) {
  const started = (seasons || []).filter((s) => Date.parse(s.starts_at) <= now.getTime()).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return started[0] ? { key: started[0].code, label: started[0].label || started[0].code } : { key: now.toISOString().slice(0, 7), label: now.toISOString().slice(0, 7) };
}

function createMatchdayPicks({ supabase, autopilot, events, getGuildState, loadMatches, canManageClub, dashboardUrl }) {
  const client = () => events.getClient();
  const site = (dashboardUrl || 'https://gafferbot.app').replace(/\/$/, '');

  async function currentSeason() {
    const { data } = await supabase.from('ea_seasons').select('code, label, starts_at');
    return seasonKeyFor(data || []);
  }

  async function candidatesFor(guildId, clubKey) {
    const all = await loadMatches(guildId, clubKey).catch(() => []);
    const recent = all.filter((m) => Date.now() - m.playedAt.getTime() < CANDIDATE_DAYS * 24 * HOUR);
    return [...seasonTotals(recent.length ? recent : all.slice(0, 40)).values()]
      .sort((a, b) => b.games - a.games)
      .slice(0, MAX_CANDIDATES)
      .map((t) => ({ key: t.key, name: t.name }));
  }

  function roundCard(round, { picks = 0 } = {}) {
    const open = round.status === 'open';
    const embed = new EmbedBuilder()
      .setTitle('🔮 Matchday Picks')
      .setColor(0x8b5cf6)
      .setDescription(
        open
          ? `Make your calls before the first game lands:\n• **Tonight's verdict**: ${POINTS.verdict} pts if you're right\n• **Top scorer**: ${POINTS.scorer} pts (ties count)\n• **Captain**: ${POINTS.captainGoal} a goal, ${POINTS.captainAssist} an assist, ${POINTS.captainMotm} for Man of the Match\nYou can change your picks until they lock.`
          : round.status === 'void'
            ? 'No games were played, so these picks are void.'
            : round.status === 'locked'
              ? `🔒 Picks are locked. Results when the session ends.`
              : '✅ Scored. Results are below.'
      )
      .setFooter({ text: `${picks} pick${picks === 1 ? '' : 's'} in · season ${round.season_label || round.season_key} · Oracle table: Club Life → Picks Table` });
    if (!open) return { embeds: [embed], components: [] };
    const names = (round.candidates || []).map((c) => ({ label: c.name.slice(0, 100), value: c.key }));
    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`mp_p:${round.id}:verdict`).setPlaceholder("Tonight's verdict").addOptions(Object.entries(VERDICTS).map(([value, v]) => ({ label: v.label, value, emoji: v.emoji })))
      ),
    ];
    if (names.length) {
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mp_p:${round.id}:scorer`).setPlaceholder('Top scorer').addOptions(names.map((n) => ({ ...n, emoji: '⚽' })))));
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mp_p:${round.id}:captain`).setPlaceholder('Captain (their goals and assists score for you)').addOptions(names.map((n) => ({ ...n, emoji: '©️' })))));
    }
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mp_mine:${round.id}`).setLabel('My picks').setEmoji('👀').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mp_table:${round.club_key}`).setLabel('Picks table').setEmoji('🏆').setStyle(ButtonStyle.Secondary)
    ));
    return { embeds: [embed], components: rows };
  }

  async function pickCount(roundId) {
    const { count } = await supabase.from('matchday_picks').select('discord_user_id', { count: 'exact', head: true }).eq('round_id', roundId);
    return count || 0;
  }

  async function editCard(round, extra = {}) {
    if (!round.channel_id || !round.message_id) return;
    const ch = await client()?.channels.fetch(round.channel_id).catch(() => null);
    const msg = ch?.messages ? await ch.messages.fetch(round.message_id).catch(() => null) : null;
    if (msg) await msg.edit({ ...roundCard(round, { picks: await pickCount(round.id) }), ...extra }).catch(() => {});
  }

  async function openRound(guildId, club, { createdBy = null, channel = null, force = false } = {}) {
    const { data: last } = await supabase.from('matchday_rounds').select('id, status, opened_at').eq('guild_id', guildId).eq('club_key', club.key).order('opened_at', { ascending: false }).limit(1).maybeSingle();
    if (last && ['open', 'locked'].includes(last.status)) return { error: 'Picks are already open for this session.', round: last };
    if (!force && last && Date.now() - Date.parse(last.opened_at) < REOPEN_AFTER_MS) return { error: 'Picks already ran this evening.' };
    const target = channel || (await autopilot.postChannel(guildId, club));
    if (!target) return { error: "I couldn't find a channel to post picks in. Pick one in /manager → Match Night → Autopilot." };
    const season = await currentSeason();
    const { data: round, error } = await supabase
      .from('matchday_rounds')
      .insert({ guild_id: guildId, club_key: club.key, season_key: season.key, season_label: season.label, status: 'open', candidates: await candidatesFor(guildId, club.key), created_by_discord_id: createdBy })
      .select('*')
      .single();
    if (error) return { error: error.message };
    const msg = await target.send({ content: `🔮 **Matchday Picks** are open for ${club.name}!`, ...roundCard(round), allowedMentions: { parse: [] } }).catch((err) => ({ error: err.message }));
    if (msg?.error) return msg;
    await supabase.from('matchday_rounds').update({ channel_id: msg.channelId, message_id: msg.id }).eq('id', round.id);
    return { round: { ...round, channel_id: msg.channelId, message_id: msg.id }, message: msg };
  }

  async function loadRound(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return null;
    const { data } = await supabase.from('matchday_rounds').select('*').eq('id', id).maybeSingle();
    return data;
  }

  async function sessionMatches(round, until) {
    const from = Date.parse(round.opened_at) - EARLY_MS;
    const all = await loadMatches(round.guild_id, round.club_key).catch(() => []);
    return all.filter((m) => m.playedAt.getTime() >= from && m.playedAt.getTime() <= until.getTime());
  }

  // Picks lock once the first game of the session has synced
  async function lockOnFirstGame(guildId, club, recent) {
    const { data: round } = await supabase.from('matchday_rounds').select('*').eq('guild_id', guildId).eq('club_key', club.key).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
    if (!round) return;
    const first = recent.filter((m) => m.playedAt.getTime() >= Date.parse(round.opened_at) - EARLY_MS).sort((a, b) => a.playedAt - b.playedAt)[0];
    if (!first) return;
    // playedAt is when the game ended; a pick made during it doesn't count
    const locksAt = new Date(Math.max(Date.parse(round.opened_at), first.playedAt.getTime() - MATCH_MS)).toISOString();
    const { data: claimed } = await supabase.from('matchday_rounds').update({ status: 'locked', locks_at: locksAt }).eq('id', round.id).eq('status', 'open').select('*');
    if (claimed?.[0]) await editCard(claimed[0]);
  }

  async function scoreRound(round, until = new Date()) {
    const { data: claimed } = await supabase.from('matchday_rounds').update({ status: 'scoring' }).eq('id', round.id).in('status', ['open', 'locked']).select('*');
    if (!claimed?.[0]) return null;
    const matches = await sessionMatches(round, until);
    if (!matches.length) {
      await supabase.from('matchday_rounds').update({ status: 'void', closed_at: new Date().toISOString() }).eq('id', round.id);
      await editCard({ ...round, status: 'void' });
      return { void: true };
    }
    const outcome = outcomeOf(matches);
    const locksAt = round.locks_at || new Date(Math.max(Date.parse(round.opened_at), Math.min(...matches.map((m) => m.playedAt.getTime())) - MATCH_MS)).toISOString();
    const { data: picks } = await supabase.from('matchday_picks').select('*').eq('round_id', round.id);
    const scored = (picks || []).map((p) => ({ ...p, ...scorePick(p, outcome, locksAt) }));
    for (const p of scored) await supabase.from('matchday_picks').update({ points: p.points, breakdown: { ...p.breakdown, ...(p.late ? { late: true } : {}) } }).eq('round_id', round.id).eq('discord_user_id', p.discord_user_id);
    const options = potnShortlist(outcome);
    const closes = new Date(Date.now() + VOTE_HOURS * HOUR).toISOString();
    await supabase.from('matchday_rounds').update({ status: options.length >= 2 ? 'voting' : 'closed', locks_at: locksAt, outcome, potn_options: options, potn_closes_at: options.length >= 2 ? closes : null, closed_at: options.length >= 2 ? null : new Date().toISOString() }).eq('id', round.id);
    const full = { ...round, status: 'scored', outcome };
    await editCard(full);
    await postResults(full, outcome, scored, options, closes);
    return { outcome, scored };
  }

  async function seasonPicks(guildId, clubKey, seasonKey) {
    const { data: rounds } = await supabase.from('matchday_rounds').select('id').eq('guild_id', guildId).eq('club_key', clubKey).eq('season_key', seasonKey).in('status', ['voting', 'closed']).limit(1000);
    const ids = (rounds || []).map((r) => r.id);
    if (!ids.length) return [];
    const out = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('matchday_picks').select('discord_user_id, points').in('round_id', ids.slice(i, i + 200));
      out.push(...(data || []));
    }
    return out;
  }

  async function postResults(round, outcome, scored, options, closes) {
    const ch = round.channel_id ? await client()?.channels.fetch(round.channel_id).catch(() => null) : null;
    const target = ch?.send ? ch : null;
    if (!target) return;
    const names = (keys) => keys.map((k) => outcome.players[k]?.name || k).join(', ');
    const embed = new EmbedBuilder()
      .setTitle('🔮 Matchday Picks · results')
      .setColor(0x8b5cf6)
      .setDescription(
        `The night: **${outcome.wins}W ${outcome.draws}D ${outcome.losses}L** in ${outcome.games} game${outcome.games === 1 ? '' : 's'} (${VERDICTS[outcome.verdict].emoji} ${VERDICTS[outcome.verdict].label.toLowerCase()}).\n` +
          (outcome.topScorers.length ? `Top scorer: **${names(outcome.topScorers)}** with ${outcome.topGoals}.` : 'Nobody scored.')
      );
    const ranked = [...scored].sort((a, b) => b.points - a.points);
    if (ranked.length) {
      const right = scored.filter((p) => p.breakdown.verdict).length;
      embed.addFields({ name: `Tonight's points (${right}/${scored.length} called the verdict)`, value: ranked.slice(0, 10).map((p, i) => `${i === 0 && p.points ? '🔮' : `${i + 1}.`} <@${p.discord_user_id}> **${p.points}**${p.late ? ' (late)' : ''}${p.captain && outcome.players[p.captain] ? ` · captain ${outcome.players[p.captain].name}` : ''}`).join('\n').slice(0, 1024) });
    } else embed.addFields({ name: 'Nobody made picks', value: 'Next session, make your calls before the first game.' });
    const table = seasonTable(await seasonPicks(round.guild_id, round.club_key, round.season_key));
    if (table[0]?.points) embed.addFields({ name: `👁️ The Oracle · season ${round.season_label || round.season_key}`, value: `<@${table[0].discord_user_id}> leads with **${table[0].points}** pts` });
    const components = [];
    if (options.length >= 2) {
      embed.addFields({ name: "⭐ Fans' Player of the Night", value: `Vote below: back the winner for ${POINTS.potn} more point. Voting closes <t:${Math.floor(Date.parse(closes) / 1000)}:R>, and votes are private.` });
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`mp_v:${round.id}`).setPlaceholder("Fans' Player of the Night").addOptions(options.map((o) => ({ label: o.name.slice(0, 100), value: o.key, description: o.line.slice(0, 100), emoji: '⭐' })))
      ));
    }
    const sent = await target.send({ embeds: [embed], components, allowedMentions: { parse: [] } }).catch((err) => console.warn(`[picks] results failed: ${err.message}`));
    if (sent && options.length >= 2) await supabase.from('matchday_rounds').update({ potn_message_id: sent.id }).eq('id', round.id);
  }

  async function closeVote(round) {
    const { data: claimed } = await supabase.from('matchday_rounds').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', round.id).eq('status', 'voting').select('*');
    if (!claimed?.[0]) return null;
    const options = round.potn_options || [];
    const { data: votes } = await supabase.from('matchday_potn_votes').select('discord_user_id, choice').eq('round_id', round.id);
    const { winner, counts } = potnWinner(options, votes || []);
    await supabase.from('matchday_rounds').update({ potn_winner: winner, potn_counts: counts }).eq('id', round.id);
    if (winner) {
      // Backers of the winner get a point: on their picks row, made if they only voted
      for (const v of (votes || []).filter((x) => x.choice === winner)) {
        const { data: row } = await supabase.from('matchday_picks').select('points, breakdown').eq('round_id', round.id).eq('discord_user_id', v.discord_user_id).maybeSingle();
        const breakdown = { ...(row?.breakdown || {}), potn: POINTS.potn };
        await supabase.from('matchday_picks').upsert({ round_id: round.id, discord_user_id: v.discord_user_id, points: (row?.points || 0) + POINTS.potn, breakdown }, { onConflict: 'round_id,discord_user_id' });
      }
    }
    const ch = round.channel_id ? await client()?.channels.fetch(round.channel_id).catch(() => null) : null;
    if (ch?.messages && round.potn_message_id) {
      const msg = await ch.messages.fetch(round.potn_message_id).catch(() => null);
      if (msg) await msg.edit({ components: [] }).catch(() => {});
    }
    const w = options.find((o) => o.key === winner);
    if (ch?.send && w) await ch.send({ content: `⭐ **Fans' Player of the Night: ${w.name}** with ${counts[winner]} vote${counts[winner] === 1 ? '' : 's'} (${w.line}).`, allowedMentions: { parse: [] } }).catch(() => {});
    return { winner, counts };
  }

  async function tick(now) {
    const { data: due } = await supabase.from('matchday_rounds').select('*').eq('status', 'voting').lte('potn_closes_at', now.toISOString()).limit(20);
    for (const r of due || []) if (client()?.guilds.cache.has(r.guild_id)) await closeVote(r).catch((err) => console.warn(`[picks] close vote ${r.id} failed: ${err.message}`));
    const { data: stale } = await supabase.from('matchday_rounds').select('*').in('status', ['open', 'locked']).lte('opened_at', new Date(now.getTime() - STALE_AFTER_MS).toISOString()).limit(20);
    for (const r of stale || []) if (client()?.guilds.cache.has(r.guild_id)) await scoreRound(r, now).catch((err) => console.warn(`[picks] score ${r.id} failed: ${err.message}`));
  }

  autopilot.onSessionStart?.(async ({ guildId, club }) => {
    if (!autopilot.isOn(club, 'picks')) return;
    const r = await openRound(guildId, club);
    if (r.error && !/already/.test(r.error)) console.log(`[picks] ${guildId}/${club.key}: ${r.error}`);
  });
  autopilot.onSessionClosed?.(async ({ guildId, club, endedAt }) => {
    const { data: round } = await supabase.from('matchday_rounds').select('*').eq('guild_id', guildId).eq('club_key', club.key).in('status', ['open', 'locked']).order('opened_at', { ascending: false }).limit(1).maybeSingle();
    if (round) await scoreRound(round, endedAt);
  });
  autopilot.onNewMatches?.((guildId, club, recent) => lockOnFirstGame(guildId, club, recent).catch((err) => console.warn(`[picks] lock failed: ${err.message}`)));
  events.onTick((now) => tick(now).catch((err) => console.warn(`[picks] tick failed: ${err.message}`)));

  // ---------- Views ----------

  async function tableView(guildId, club, userId = null) {
    const season = await currentSeason();
    const table = seasonTable(await seasonPicks(guildId, club.key, season.key));
    const embed = new EmbedBuilder().setTitle(`🔮 ${club.name} · Picks table`).setColor(0x8b5cf6);
    if (!table.length) return { embeds: [embed.setDescription(`No scored picks this season (${season.label}) yet. Picks open when the first player joins the club's voice channel.`)] };
    embed.setDescription(table.slice(0, 15).map((r, i) => `${i === 0 ? '👁️' : `${i + 1}.`} <@${r.discord_user_id}> **${r.points}** pts · ${r.rounds} night${r.rounds === 1 ? '' : 's'} · best ${r.best}`).join('\n'));
    const me = userId ? table.findIndex((r) => r.discord_user_id === userId) : -1;
    embed.setFooter({ text: `Season ${season.label} · ${me >= 0 ? `You: #${me + 1} with ${table[me].points} pts · ` : ''}The leader is the Oracle` });
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setURL(`${site}/trophy-room`).setLabel('Picks on the web').setStyle(ButtonStyle.Link))], allowedMentions: { parse: [] } };
  }

  async function myPicks(round, userId) {
    const { data } = await supabase.from('matchday_picks').select('*').eq('round_id', round.id).eq('discord_user_id', userId).maybeSingle();
    if (!data) return 'You have no picks in yet.';
    const name = (k) => round.candidates?.find((c) => c.key === k)?.name || k;
    return [
      `Verdict: ${data.verdict ? VERDICTS[data.verdict].label : '—'}`,
      `Top scorer: ${data.scorer ? name(data.scorer) : '—'}`,
      `Captain: ${data.captain ? name(data.captain) : '—'}`,
      data.points ? `Points: **${data.points}**` : null,
    ].filter(Boolean).join('\n');
  }

  // ---------- Interactions ----------

  async function handleComponent(interaction) {
    const [action, a, b] = interaction.customId.split(':');
    if (action === 'mp_p') {
      const round = await loadRound(a);
      if (!round || round.status !== 'open') return interaction.reply({ content: '🔒 Picks are locked for this session.', flags: 64 });
      const value = interaction.values?.[0];
      const field = { verdict: 'verdict', scorer: 'scorer', captain: 'captain' }[b];
      if (!field || (field === 'verdict' ? !VERDICTS[value] : !round.candidates?.some((c) => c.key === value))) return interaction.reply({ content: "That option isn't on the card.", flags: 64 });
      const { error } = await supabase.from('matchday_picks').upsert({ round_id: round.id, discord_user_id: interaction.user.id, [field]: value, picked_at: new Date().toISOString() }, { onConflict: 'round_id,discord_user_id' });
      if (error) return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
      await interaction.reply({ content: `✅ Saved.\n${await myPicks(round, interaction.user.id)}`, flags: 64 });
      return editCard(round);
    }
    if (action === 'mp_mine') {
      const round = await loadRound(a);
      return interaction.reply({ content: round ? await myPicks(round, interaction.user.id) : 'That round is gone.', flags: 64 });
    }
    if (action === 'mp_table') {
      const state = await getGuildState(interaction.guildId);
      const club = state?.clubs?.find((c) => c.key === a);
      if (!club) return interaction.reply({ content: 'That club is gone.', flags: 64 });
      await interaction.deferReply({ flags: 64 });
      return interaction.editReply(await tableView(interaction.guildId, club, interaction.user.id));
    }
    if (action === 'mp_v') {
      const round = await loadRound(a);
      if (!round || round.status !== 'voting' || Date.parse(round.potn_closes_at) < Date.now()) return interaction.reply({ content: 'Voting has closed.', flags: 64 });
      const choice = interaction.values?.[0];
      const option = (round.potn_options || []).find((o) => o.key === choice);
      if (!option) return interaction.reply({ content: "That player isn't on the shortlist.", flags: 64 });
      const { error } = await supabase.from('matchday_potn_votes').upsert({ round_id: round.id, discord_user_id: interaction.user.id, choice, voted_at: new Date().toISOString() }, { onConflict: 'round_id,discord_user_id' });
      return interaction.reply({ content: error ? `❌ ${error.message}` : `⭐ Your vote for **${option.name}** is in. You can change it until voting closes.`, flags: 64 });
    }
    return null;
  }

  // From the Club Life panel: open picks now (leaders) or show the table (anyone)
  async function openNow(interaction, club) {
    if (!(await canManageClub(interaction.member, club))) return { content: `🔒 Only ${club.name}'s leaders can open picks by hand. They also open by themselves when someone joins the club's voice channel.` };
    const r = await openRound(interaction.guildId, club, { createdBy: interaction.user.id, channel: interaction.channel, force: true });
    return { content: r.error ? `❌ ${r.error}` : `🔮 Matchday Picks are open in <#${r.message.channelId}>.` };
  }

  return { handleComponent, openRound, scoreRound, closeVote, lockOnFirstGame, tableView, openNow, tick };
}

module.exports = { createMatchdayPicks, outcomeOf, scorePick, potnShortlist, potnWinner, seasonTable, seasonKeyFor, VERDICTS, POINTS };
