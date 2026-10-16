// GafferBot-hosted BYOT: a bot owner creates a knockout tournament (/network byot_create), every
// network server gets a sign-up card, and at kick-off the bot seeds the bracket by EA skill rating.
// Each game is a network fixture (kind 'byot'): both clubs get the kick-off in their network channel,
// they play it as an EA friendly, and the EA sync records the score and tags the game BYOT so its stats
// stay apart from league stats. A draw, or no game found two hours after kick-off, goes to the host
// with Advance / Replay buttons. Winners move on until there is a champion.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { resolveClub } = require('./manager-hub.cjs');
const { isBotOwner } = require('./perm-check.cjs');
const { toFcPlatform } = require('./ea-fc27.cjs');
const { fixtureForMatch } = require('./network-friendlies.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_LEAD_MS = 15 * 60 * 1000;       // later rounds kick off at least this far from now
const NO_GAME_MS = 2 * 60 * 60 * 1000;    // after this long with no game, the host decides
const TICK_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f-]{36}$/i;

const unix = (d) => Math.floor(new Date(d).getTime() / 1000);

// ---------- Bracket maths (pure) ----------

function bracketSize(n) {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

// Standard seeding positions: 1 v 8, 4 v 5, 2 v 7, 3 v 6 for eight, so top seeds meet last
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const m = order.length * 2 + 1;
    order = order.flatMap((x) => [x, m - x]);
  }
  return order;
}

// Round 1 pairs from entries ranked best first; a missing opponent is a bye
function firstRound(entries) {
  const ranked = [...entries].sort((a, b) => (b.skill_rating || 0) - (a.skill_rating || 0));
  const size = bracketSize(ranked.length);
  const order = seedOrder(size);
  const pairs = [];
  for (let slot = 0; slot < size / 2; slot++) {
    const home = ranked[order[2 * slot] - 1] || null;
    const away = ranked[order[2 * slot + 1] - 1] || null;
    pairs.push({ slot, home, away, seeds: [order[2 * slot], order[2 * slot + 1]] });
  }
  return { size, rounds: Math.log2(size), pairs, ranked };
}

// Where the winner of (round, slot) plays next, and on which side
function nextSlot(round, slot) {
  return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? 'from' : 'to' };
}

function roundName(round, rounds) {
  const left = rounds - round;
  return left === 0 ? 'Final' : left === 1 ? 'Semi-finals' : left === 2 ? 'Quarter-finals' : `Round ${round}`;
}

function createNetworkByot(deps) {
  const { supabase, getGuildState, network, canManageClub, autopilot, tagMatch } = deps;
  const client = () => deps.client();

  async function loadTournament(id) {
    if (!UUID.test(id || '')) return null;
    const { data } = await supabase.from('network_tournaments').select('*').eq('id', id).maybeSingle();
    return data;
  }

  async function entriesOf(tid, statuses = ['entered', 'out', 'champion']) {
    const { data } = await supabase.from('network_tournament_entries').select('*').eq('tournament_id', tid).in('status', statuses).order('created_at');
    return data || [];
  }

  async function fixturesOf(tid) {
    const { data } = await supabase.from('network_fixtures').select('*').eq('tournament_id', tid).order('round').order('slot');
    return data || [];
  }

  async function listedServerRows() {
    const { data } = await supabase.from('network_servers').select('*').eq('enabled', true).is('suspended_at', null).limit(500);
    return (data || []).filter((r) => r.channel_id);
  }

  const signupRow = (t) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`nw_bt:join:${t.id}`).setLabel('Sign up my club').setEmoji('✍️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`nw_bt:leave:${t.id}`).setLabel('Withdraw').setStyle(ButtonStyle.Secondary)
    );

  function announceEmbed(t) {
    return new EmbedBuilder()
      .setTitle(`🏆 ${t.name}: a GafferBot-hosted BYOT`)
      .setColor(0xf1c40f)
      .setDescription(
        `Knockout for up to ${t.max_teams} clubs on ${t.platform === 'nx' ? 'Switch' : 'PS5 / Xbox Series / PC'}. Seeded by EA skill rating. ` +
          `Each game is played as an EA friendly and the score comes in from the EA sync. Rounds are ${t.round_minutes} minutes apart.`
      )
      .addFields({ name: 'Round 1 kick-off', value: `<t:${unix(t.starts_at)}:F> (<t:${unix(t.starts_at)}:R>). Sign-ups close then.` })
      .setFooter({ text: 'Club leaders sign up. Fixtures land in your GafferBot Network channel.' });
  }

  async function postFixture(f, t, rounds) {
    const line =
      `🏆 **${t.name}**, ${roundName(f.round, rounds)}: **${f.from_club_name}** vs **${f.to_club_name}**, kick-off <t:${unix(f.kickoff_at)}:F> (<t:${unix(f.kickoff_at)}:R>). ` +
      'Play it as an EA friendly; the score comes in from the EA sync.';
    await network.postToChannel(client(), f.from_guild_id, { content: `${line} Find the club **${f.to_club_name}** in game.` });
    await network.postToChannel(client(), f.to_guild_id, { content: `${line} Find the club **${f.from_club_name}** in game.` });
  }

  // ---------- Create (bot owners) ----------

  async function handleCreate(interaction) {
    if (!isBotOwner(interaction.user.id)) return interaction.reply({ content: '❌ Only the GafferBot team can host network BYOTs.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const startsAt = await network.kickoffFor(interaction.guildId, interaction.options.getString('when'));
    if (!startsAt || startsAt.getTime() < Date.now() + MIN_LEAD_MS) return interaction.editReply({ content: '❌ Pick a kick-off at least 15 minutes from now.' });
    const t = {
      name: network.cleanText(interaction.options.getString('name'), 60) || 'GafferBot BYOT',
      platform: interaction.options.getString('platform'),
      max_teams: interaction.options.getInteger('max_teams') || 16,
      round_minutes: interaction.options.getInteger('round_minutes') || 45,
      starts_at: startsAt.toISOString(),
      created_by_discord_id: interaction.user.id,
    };
    const { data: created, error } = await supabase.from('network_tournaments').insert(t).select('*').single();
    if (error) return interaction.editReply({ content: `❌ ${error.message}` });
    const posts = [];
    for (const s of await listedServerRows()) {
      const msg = await network.postToChannel(interaction.client, s.guild_id, { embeds: [announceEmbed(created)], components: [signupRow(created)] });
      if (msg) posts.push({ guild_id: s.guild_id, channel_id: msg.channelId, message_id: msg.id });
    }
    await supabase.from('network_tournaments').update({ posts }).eq('id', created.id);
    return interaction.editReply({ content: `✅ **${created.name}** announced in ${posts.length} network server${posts.length === 1 ? '' : 's'}. It starts by itself at kick-off; **/network byot** shows entries and lets you start or cancel it early.` });
  }

  // ---------- Sign up / withdraw ----------

  async function join(interaction, t) {
    if (!t || t.status !== 'signup' || new Date(t.starts_at).getTime() <= Date.now()) return interaction.reply({ content: 'Sign-ups for this tournament are closed.', flags: 64 });
    if (!interaction.guildId || !(await network.isListed(interaction.guildId))) return interaction.reply({ content: '⚪ This server isn\'t on the GafferBot Network.', flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club?.ea_club_id) return interaction.reply({ content: '❌ Link your club to EA first (**/manager → Admin → Link EA Club**).', flags: 64 });
    if (!(await canManageClub(interaction.member, club))) return interaction.reply({ content: `❌ Only ${club.name}'s leaders can sign it up.`, flags: 64 });
    if (toFcPlatform(club.ea_platform) !== t.platform) return interaction.reply({ content: '❌ This tournament is on a different platform.', flags: 64 });
    const entered = await entriesOf(t.id, ['entered']);
    const existing = entered.find((e) => e.ea_club_id === String(club.ea_club_id));
    if (existing) return interaction.reply({ content: `✅ ${club.name} is already in (${entered.length}/${t.max_teams}).`, flags: 64 });
    if (entered.length >= t.max_teams) return interaction.reply({ content: `❌ ${t.name} is full (${t.max_teams} clubs).`, flags: 64 });
    const { data: stats } = await supabase.from('club_stats').select('skill_rating').eq('guild_id', interaction.guildId).eq('club_key', club.key).maybeSingle();
    const row = {
      tournament_id: t.id,
      guild_id: interaction.guildId,
      club_key: club.key,
      club_name: club.ea_club_name || club.name,
      ea_club_id: String(club.ea_club_id),
      skill_rating: stats?.skill_rating || null,
      status: 'entered',
      entered_by_discord_id: interaction.user.id,
    };
    const { data: saved, error } = await supabase.from('network_tournament_entries').upsert(row, { onConflict: 'tournament_id,ea_club_id' }).select('id').single();
    if (error) return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    // Sign-ups can race the start or each other: check again now the entry is written, and undo it if late
    const fresh = await loadTournament(t.id);
    const now = await entriesOf(t.id, ['entered']);
    const place = now.findIndex((e) => e.id === saved.id);
    if (fresh?.status !== 'signup' || place < 0 || place >= t.max_teams) {
      await supabase.from('network_tournament_entries').update({ status: 'withdrawn' }).eq('id', saved.id);
      return interaction.reply({ content: fresh?.status !== 'signup' ? 'Sign-ups for this tournament just closed.' : `❌ ${t.name} just filled up (${t.max_teams} clubs).`, flags: 64 });
    }
    return interaction.reply({ content: `✍️ **${row.club_name}** is in **${t.name}** (${now.length > t.max_teams ? t.max_teams : now.length}/${t.max_teams}). Fixtures land in your network channel from <t:${unix(t.starts_at)}:f>.`, flags: 64 });
  }

  async function leave(interaction, t) {
    if (!t || t.status !== 'signup') return interaction.reply({ content: 'This tournament has already started.', flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club || !(await canManageClub(interaction.member, club))) return interaction.reply({ content: '❌ Only the club\'s leaders can withdraw it.', flags: 64 });
    const { data: done } = await supabase
      .from('network_tournament_entries')
      .update({ status: 'withdrawn' })
      .eq('tournament_id', t.id)
      .eq('guild_id', interaction.guildId)
      .eq('club_key', club.key)
      .eq('status', 'entered')
      .select('id');
    return interaction.reply({ content: done?.length ? `↩️ ${club.name} withdrew from ${t.name}.` : `${club.name} wasn't entered.`, flags: 64 });
  }

  // ---------- Start, results, advancing ----------

  async function start(t) {
    const { data: claimed } = await supabase.from('network_tournaments').update({ status: 'running' }).eq('id', t.id).eq('status', 'signup').select('*');
    if (!claimed?.length) return { ok: false, message: 'Already started or cancelled.' };
    const signed = await entriesOf(t.id, ['entered']);
    const entries = signed.slice(0, t.max_teams);
    for (const late of signed.slice(t.max_teams)) await supabase.from('network_tournament_entries').update({ status: 'withdrawn' }).eq('id', late.id);
    if (entries.length < 2) {
      await supabase.from('network_tournaments').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', t.id);
      for (const e of entries) await network.postToChannel(client(), e.guild_id, { content: `🗑️ **${t.name}** was cancelled: not enough clubs signed up.` });
      return { ok: false, message: 'Fewer than 2 clubs signed up, so it was cancelled.' };
    }
    const { pairs, rounds, ranked } = firstRound(entries);
    await supabase.from('network_tournaments').update({ rounds }).eq('id', t.id);
    t.rounds = rounds;
    for (const [i, e] of ranked.entries()) await supabase.from('network_tournament_entries').update({ seed: i + 1 }).eq('id', e.id);
    const kickoff = new Date(Math.max(new Date(t.starts_at).getTime(), Date.now() + MIN_LEAD_MS));
    const byes = [];
    for (const p of pairs) {
      const home = p.home || p.away;
      const away = p.home ? p.away : null;
      if (!home) continue;
      const row = fixtureRow(t, 1, p.slot, home, away, kickoff);
      if (!away) Object.assign(row, { status: 'played', winner_side: 'from', played_at: new Date().toISOString() });
      const { data: f } = await supabase.from('network_fixtures').insert(row).select('*').single();
      if (!f) continue;
      if (away) await postFixture(f, t, rounds);
      else byes.push(f);
    }
    for (const f of byes) await advance(t, f, rounds);
    return { ok: true, message: `Started with ${entries.length} clubs.` };
  }

  function fixtureRow(t, round, slot, home, away, kickoff) {
    return {
      kind: 'byot',
      tournament_id: t.id,
      round,
      slot,
      from_guild_id: home.guild_id,
      from_club_key: home.club_key,
      from_club_name: home.club_name,
      from_ea_club_id: home.ea_club_id,
      from_entry_id: home.id,
      to_guild_id: away?.guild_id || null,
      to_club_key: away?.club_key || null,
      to_club_name: away?.club_name || null,
      to_ea_club_id: away?.ea_club_id || null,
      to_entry_id: away?.id || null,
      platform: t.platform,
      kickoff_at: kickoff.toISOString(),
      status: 'accepted',
      created_by_discord_id: t.created_by_discord_id,
    };
  }

  // A fixture has a winner: move them on, or crown them
  async function advance(t, f, rounds) {
    const winnerId = f.winner_side === 'to' ? f.to_entry_id : f.from_entry_id;
    const loserId = f.winner_side === 'to' ? f.from_entry_id : f.to_entry_id;
    if (loserId) await supabase.from('network_tournament_entries').update({ status: 'out' }).eq('id', loserId);
    const { data: winner } = await supabase.from('network_tournament_entries').select('*').eq('id', winnerId).maybeSingle();
    if (!winner) return;
    if (f.round >= rounds) {
      await supabase.from('network_tournament_entries').update({ status: 'champion' }).eq('id', winner.id);
      const { data: done } = await supabase.from('network_tournaments').update({ status: 'finished', champion_entry_id: winner.id, finished_at: new Date().toISOString() }).eq('id', t.id).eq('status', 'running').select('posts');
      if (done?.length) await announceChampion(t, winner, done[0].posts || []);
      return;
    }
    const next = nextSlot(f.round, f.slot);
    const fixtures = await fixturesOf(t.id);
    const sibling = fixtures.find((x) => x.round === f.round && x.slot === (f.slot ^ 1));
    if (!sibling?.winner_side) return; // wait for the other half
    const otherId = sibling ? (sibling.winner_side === 'to' ? sibling.to_entry_id : sibling.from_entry_id) : null;
    const { data: other } = otherId ? await supabase.from('network_tournament_entries').select('*').eq('id', otherId).maybeSingle() : { data: null };
    const home = next.side === 'from' ? winner : other;
    const away = next.side === 'from' ? other : winner;
    const kickoff = new Date(Math.max(new Date(t.starts_at).getTime() + f.round * t.round_minutes * 60000, Date.now() + MIN_LEAD_MS));
    const row = fixtureRow(t, next.round, next.slot, home || away, home && away ? away : null, kickoff);
    if (!(home && away)) Object.assign(row, { status: 'played', winner_side: 'from', played_at: new Date().toISOString() });
    const { data: created, error } = await supabase.from('network_fixtures').insert(row).select('*').single();
    if (error || !created) return; // the other half already created it
    if (home && away) await postFixture(created, t, rounds);
    else await advance(t, created, rounds);
  }

  async function announceChampion(t, winner, posts) {
    const line = `🏆 **${winner.club_name}** won **${t.name}**, the GafferBot-hosted BYOT!`;
    const sent = new Set();
    for (const p of posts) {
      const channel = await client().channels.fetch(p.channel_id).catch(() => null);
      const msg = channel ? await channel.messages.fetch(p.message_id).catch(() => null) : null;
      if (msg) await msg.edit({ embeds: [announceEmbed(t).setTitle(`🏆 ${t.name}: won by ${winner.club_name}`)], components: [] }).catch(() => {});
      if (channel && !sent.has(p.guild_id)) {
        sent.add(p.guild_id);
        await channel.send({ content: line, allowedMentions: { parse: [] } }).catch(() => {});
      }
    }
    if (!sent.has(winner.guild_id)) await network.postToChannel(client(), winner.guild_id, { content: line });
  }

  // A score arrived (EA sync) or the host decided: settle the fixture
  async function settle(f, winnerSide, scores = {}) {
    const { data: done } = await supabase
      .from('network_fixtures')
      .update({ status: 'played', winner_side: winnerSide, played_at: new Date().toISOString(), ...scores })
      .eq('id', f.id)
      .eq('status', 'accepted')
      .select('*');
    if (!done?.length) return false;
    const t = await loadTournament(f.tournament_id);
    if (!t || t.status !== 'running') return true;
    await advance(t, done[0], t.rounds || 1);
    return true;
  }

  async function flagToHost(f, reason) {
    const { data: claimed } = await supabase.from('network_fixtures').update({ flagged_at: new Date().toISOString() }).eq('id', f.id).is('flagged_at', null).select('id');
    if (!claimed?.length) return;
    const t = await loadTournament(f.tournament_id);
    await network.notifyHost(client(), {
      content: `⚖️ **${t?.name || 'BYOT'}**: **${f.from_club_name}** vs **${f.to_club_name}** (kick-off <t:${unix(f.kickoff_at)}:f>): ${reason}`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`nw_bt:win:${f.id}:from`).setLabel(`Advance ${f.from_club_name}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`nw_bt:win:${f.id}:to`).setLabel(`Advance ${f.to_club_name}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`nw_bt:replay:${f.id}`).setLabel('Replay in 20 min').setStyle(ButtonStyle.Secondary)
        ),
      ],
    });
  }

  // autopilot.onNewMatches hook: settle BYOT fixtures and tag the games BYOT on both clubs' sides
  async function onNewMatches(guildId, club, recent, rows) {
    if (!network.isOn() || !rows?.length) return;
    const since = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const [{ data: asHome }, { data: asAway }] = await Promise.all([
      supabase.from('network_fixtures').select('*').eq('kind', 'byot').in('status', ['accepted', 'played']).eq('from_guild_id', guildId).eq('from_club_key', club.key).gte('kickoff_at', since),
      supabase.from('network_fixtures').select('*').eq('kind', 'byot').in('status', ['accepted', 'played']).eq('to_guild_id', guildId).eq('to_club_key', club.key).gte('kickoff_at', since),
    ]);
    const fixtures = [...(asHome || []), ...(asAway || [])].filter((f) => f.to_entry_id);
    if (!fixtures.length) return;
    for (const row of rows) {
      const f = fixtureForMatch(fixtures, guildId, club.key, row, ['accepted', 'played']);
      if (!f) continue;
      if (tagMatch && row.match_data?._tag !== 'byot') {
        await tagMatch(row, 'byot', `network:${f.id}`).catch((err) => console.warn(`[network-byot] tag failed: ${err.message}`));
        for (const m of recent || []) if (m.id === row.id) m.tag = m.competition = 'byot';
      }
      if (f.status !== 'accepted') continue;
      const home = f.from_guild_id === guildId && f.from_club_key === club.key;
      const scoreFrom = home ? row.score_for : row.score_against;
      const scoreTo = home ? row.score_against : row.score_for;
      const scores = { score_from: scoreFrom, score_to: scoreTo, ea_match_id: row.ea_match_id ? String(row.ea_match_id) : null };
      if (scoreFrom === scoreTo) {
        await supabase.from('network_fixtures').update(scores).eq('id', f.id);
        await flagToHost({ ...f, ...scores }, `the EA game ended ${scoreFrom}-${scoreTo}. Pick who goes through (penalties or your rules), or replay.`);
        continue;
      }
      const winnerSide = scoreFrom > scoreTo ? 'from' : 'to';
      if (await settle(f, winnerSide, scores)) {
        f.status = 'played';
        const t = await loadTournament(f.tournament_id);
        const line = `🏁 ${t?.name || 'BYOT'}: **${f.from_club_name}** ${scoreFrom}-${scoreTo} **${f.to_club_name}**. ${winnerSide === 'from' ? f.from_club_name : f.to_club_name} go through.`;
        await network.postToChannel(client(), f.from_guild_id, { content: line });
        await network.postToChannel(client(), f.to_guild_id, { content: line });
      }
    }
  }

  // Every few minutes: start tournaments at kick-off, and send games with no result to the host
  async function tick() {
    if (!network.isOn() || !client()) return;
    const { data: due } = await supabase.from('network_tournaments').select('*').eq('status', 'signup').lte('starts_at', new Date().toISOString()).limit(5);
    for (const t of due || []) await start(t);
    const { data: stale } = await supabase
      .from('network_fixtures')
      .select('*')
      .eq('kind', 'byot')
      .eq('status', 'accepted')
      .is('flagged_at', null)
      .lte('kickoff_at', new Date(Date.now() - NO_GAME_MS).toISOString())
      .limit(20);
    for (const f of stale || []) if (f.to_entry_id) await flagToHost(f, 'no game between them has come in from EA yet. Advance one side or replay.');
  }

  // ---------- /network byot ----------

  async function bracketText(t) {
    const fixtures = await fixturesOf(t.id);
    const entries = await entriesOf(t.id);
    if (!fixtures.length) {
      const list = entries.filter((e) => e.status === 'entered').map((e) => e.club_name);
      return `**Entered (${list.length}/${t.max_teams}):** ${list.join(', ') || 'nobody yet'}`;
    }
    const rounds = t.rounds || firstRound(entries).rounds;
    const lines = [];
    for (let r = 1; r <= rounds; r++) {
      const games = fixtures.filter((f) => f.round === r);
      if (!games.length) continue;
      lines.push(`**${roundName(r, rounds)}**`);
      for (const f of games) {
        if (!f.to_entry_id) lines.push(`• ${f.from_club_name} (bye)`);
        else if (f.status === 'played') lines.push(`• ${f.winner_side === 'from' ? `**${f.from_club_name}**` : f.from_club_name} ${f.score_from ?? ''}-${f.score_to ?? ''} ${f.winner_side === 'to' ? `**${f.to_club_name}**` : f.to_club_name}`);
        else lines.push(`• ${f.from_club_name} vs ${f.to_club_name}, <t:${unix(f.kickoff_at)}:t>${f.flagged_at ? ' (with the host)' : ''}`);
      }
    }
    const champ = entries.find((e) => e.status === 'champion');
    if (champ) lines.push(`🏆 **${champ.club_name}**`);
    return lines.join('\n');
  }

  async function view(interaction, tid) {
    const { data: list } = await supabase
      .from('network_tournaments')
      .select('*')
      .or(`status.in.(signup,running),finished_at.gte.${new Date(Date.now() - 7 * DAY_MS).toISOString()}`)
      .order('starts_at', { ascending: false })
      .limit(10);
    const tournaments = list || [];
    if (!tournaments.length) return { content: 'No GafferBot-hosted BYOTs right now. They\'re announced in your network channel when one opens.', embeds: [], components: [] };
    const t = tournaments.find((x) => x.id === tid) || tournaments[0];
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${t.name}`)
      .setColor(0xf1c40f)
      .setDescription(`Round 1: <t:${unix(t.starts_at)}:F>\n\n${await bracketText(t)}`.slice(0, 4000))
      .setFooter({ text: `${t.status === 'signup' ? 'Sign-ups open' : t.status === 'running' ? 'In progress' : t.status === 'finished' ? 'Finished' : 'Cancelled'} · ${t.platform === 'nx' ? 'Switch' : 'PS5 / Xbox Series / PC'} · up to ${t.max_teams} clubs` });
    const components = [];
    if (t.status === 'signup') components.push(signupRow(t));
    if (isBotOwner(interaction.user.id) && (t.status === 'signup' || t.status === 'running')) {
      components.push(
        new ActionRowBuilder().addComponents(
          ...(t.status === 'signup' ? [new ButtonBuilder().setCustomId(`nw_bt:start:${t.id}`).setLabel('Host: start now').setStyle(ButtonStyle.Primary)] : []),
          new ButtonBuilder().setCustomId(`nw_bt:cancel:${t.id}`).setLabel('Host: cancel').setStyle(ButtonStyle.Danger)
        )
      );
    }
    if (tournaments.length > 1) {
      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('nw_bt:view')
            .setPlaceholder('Other tournaments')
            .addOptions(tournaments.map((x) => ({ label: x.name.slice(0, 100), value: x.id, description: x.status, default: x.id === t.id })))
        )
      );
    }
    return { content: '', embeds: [embed], components };
  }

  async function handleView(interaction) {
    await interaction.deferReply({ flags: 64 });
    return interaction.editReply(await view(interaction, null));
  }

  async function hostOnly(interaction) {
    if (isBotOwner(interaction.user.id)) return true;
    await interaction.reply({ content: '❌ Only the GafferBot team can do that.', flags: 64 });
    return false;
  }

  async function handleComponent(interaction, action, id, extra) {
    if (action === 'view') return interaction.update(await view(interaction, interaction.values?.[0]));
    if (action === 'join' || action === 'leave') {
      const t = await loadTournament(id);
      return action === 'join' ? join(interaction, t) : leave(interaction, t);
    }
    if (!(await hostOnly(interaction))) return;
    if (action === 'start') {
      const t = await loadTournament(id);
      if (!t) return interaction.reply({ content: 'Not found.', flags: 64 });
      await interaction.deferUpdate();
      const res = await start(t);
      return interaction.followUp({ content: res.ok ? `✅ ${res.message}` : `ℹ️ ${res.message}`, flags: 64 });
    }
    if (action === 'cancel') {
      const { data: done } = await supabase.from('network_tournaments').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', id).in('status', ['signup', 'running']).select('*');
      if (done?.length) {
        await supabase.from('network_fixtures').update({ status: 'cancelled' }).eq('tournament_id', id).eq('status', 'accepted');
        for (const p of done[0].posts || []) {
          const channel = await interaction.client.channels.fetch(p.channel_id).catch(() => null);
          const msg = channel ? await channel.messages.fetch(p.message_id).catch(() => null) : null;
          if (msg) await msg.edit({ embeds: [announceEmbed(done[0]).setTitle(`~~${done[0].name}~~ (cancelled)`)], components: [] }).catch(() => {});
        }
      }
      return interaction.reply({ content: done?.length ? '🗑️ Tournament cancelled.' : 'Already finished or cancelled.', flags: 64 });
    }
    const { data: f } = UUID.test(id || '') ? await supabase.from('network_fixtures').select('*').eq('id', id).maybeSingle() : { data: null };
    if (!f || f.status !== 'accepted') return interaction.update({ content: `${interaction.message?.content || ''}\nℹ️ Already settled.`, components: [] });
    if (action === 'win' && (extra === 'from' || extra === 'to')) {
      if (!(await settle(f, extra))) return interaction.update({ content: `${interaction.message.content}\nℹ️ Already settled.`, components: [] });
      const name = extra === 'from' ? f.from_club_name : f.to_club_name;
      const line = `⚖️ The host sent **${name}** through (${f.from_club_name} vs ${f.to_club_name}).`;
      await network.postToChannel(interaction.client, f.from_guild_id, { content: line });
      await network.postToChannel(interaction.client, f.to_guild_id, { content: line });
      return interaction.update({ content: `${interaction.message.content}\n✅ ${name} advanced.`, components: [] });
    }
    if (action === 'replay') {
      const kickoff = new Date(Date.now() + 20 * 60000);
      await supabase.from('network_fixtures').update({ kickoff_at: kickoff.toISOString(), flagged_at: null, score_from: null, score_to: null }).eq('id', f.id);
      const t = await loadTournament(f.tournament_id);
      await postFixture({ ...f, kickoff_at: kickoff.toISOString() }, t, t?.rounds || 1);
      return interaction.update({ content: `${interaction.message.content}\n🔁 Replay set for <t:${unix(kickoff)}:t>.`, components: [] });
    }
    return interaction.reply({ content: 'This has expired.', flags: 64 });
  }

  network.addSubcommand('byot', handleView);
  network.addSubcommand('byot_create', handleCreate);
  network.addComponent('nw_bt', (interaction, a, b) => handleComponent(interaction, a, b, (interaction.customId || '').split(':')[3]));
  if (autopilot) autopilot.onNewMatches(onNewMatches);
  const timer = setInterval(() => tick().catch((err) => console.warn(`[network-byot] tick failed: ${err.message}`)), TICK_MS);
  timer.unref?.();

  return { start, tick, onNewMatches, settle };
}

module.exports = { createNetworkByot, bracketSize, seedOrder, firstRound, nextSlot, roundName };
