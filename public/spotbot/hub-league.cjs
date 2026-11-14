// Hub team competitions for Social Hub servers: a reason for the teams players start in the hub to
// stay and play each other.
//   Friendlies  a captain challenges another hub team (Hub League → Challenge a team); the other
//               team's captains accept or decline from their desk.
//   League      captains enter their team; an admin starts it. Every team plays every other once
//               (round robin), one round a week; unplayed games are void after their week. Three
//               points a win, one a draw; the top of the table at the end is champion.
//   Cup         captains enter; an admin starts it. Knockout with byes to a power of two, a week a
//               round; a tie not played by its deadline goes to the higher seed.
//   Scores      either team's captain reports the score; the other team's captains confirm or
//               dispute it from their desk (no answer in 24 hours confirms it). A server admin's
//               report is final, which settles disputes. Results post in #hub-feed.
// Tables hub_competitions and hub_team_matches. Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { firstRound, nextRound, roundName } = require('./hub-tournament.cjs');
const { isServerAdmin } = require('./perm-check.cjs');

const BLUE = 0x3498db;
const NO_PINGS = { parse: [] };
const WEEK_MS = 7 * 86400000;
const CONFIRM_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 10 * 60 * 1000;
const OPEN = ['pending', 'scheduled', 'reported', 'disputed'];
const DONE = ['confirmed', 'walkover'];

// ---------- Pure ----------

// Round robin by the circle method: rounds of [home, away], every team meets every other once
function roundRobin(keys) {
  const list = [...keys];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== null && b !== null) games.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(games);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

// League table from finished matches: points, then goal difference, then goals scored
function leagueTable(teams, matches) {
  const rows = new Map(teams.map((t) => [t.key, { key: t.key, name: t.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const m of matches) {
    if (m.status !== 'confirmed') continue;
    const h = rows.get(m.home_key);
    const a = rows.get(m.away_key);
    if (!h || !a) continue;
    h.p += 1; a.p += 1;
    h.gf += m.home_goals; h.ga += m.away_goals;
    a.gf += m.away_goals; a.ga += m.home_goals;
    if (m.home_goals > m.away_goals) { h.w += 1; a.l += 1; h.pts += 3; }
    else if (m.home_goals < m.away_goals) { a.w += 1; h.l += 1; a.pts += 3; }
    else { h.d += 1; a.d += 1; h.pts += 1; a.pts += 1; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));
}

// A typed score: whole numbers 0 to 99
function parseGoals(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  return Number(s);
}

// The winner's key of a finished cup tie (no draws in a cup)
function tieWinner(m) {
  if (m.status === 'walkover') return m.home_key;
  if (m.status !== 'confirmed' || m.home_goals === m.away_goals) return null;
  return m.home_goals > m.away_goals ? m.home_key : m.away_key;
}

const scoreLine = (m) => (DONE.includes(m.status) && m.home_goals != null ? `**${m.home_name}** ${m.home_goals}-${m.away_goals} **${m.away_name}**` : `**${m.home_name}** vs **${m.away_name}**`);
const unix = (iso) => Math.floor(new Date(iso).getTime() / 1000);

// ---------- Module ----------

function createHubLeague(deps) {
  const { supabase, hubOf, getGuildState } = deps;
  const client = () => deps.client();
  const locks = new Map();

  function locked(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const run = prev.then(fn, fn);
    locks.set(key, run.catch(() => {}));
    return run;
  }

  async function teamsOf(guildId) {
    const [hub, state] = await Promise.all([hubOf(guildId), getGuildState(guildId)]);
    return (hub.teams || []).map((k) => state.clubs.find((c) => c.key === k && c.enabled)).filter(Boolean);
  }

  const isCaptainOf = (member, club) => !!member && !!club && (club.captain_id === member.id || (club.captain_role_id && member.roles?.cache?.has?.(club.captain_role_id)));

  async function memberOf(interaction) {
    if (interaction.member?.roles?.cache) return interaction.member;
    return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  }

  async function channel(guild, id) {
    return id ? guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null)) : null;
  }

  async function feedPost(guild, payload) {
    const hub = await hubOf(guild.id);
    const ch = await channel(guild, hub.feed_channel_id);
    if (ch?.send) await ch.send({ ...payload, allowedMentions: NO_PINGS }).catch(() => {});
  }

  async function deskPost(guild, club, payload) {
    const ch = await channel(guild, club?.manager_desk_channel_id);
    if (ch?.send) return ch.send({ ...payload, allowedMentions: NO_PINGS }).then(() => true).catch(() => false);
    return false;
  }

  async function activeComp(guildId, kind) {
    const { data } = await supabase.from('hub_competitions').select('*').eq('guild_id', guildId).eq('kind', kind).in('status', ['signup', 'running']).order('created_at', { ascending: false }).limit(1);
    return data?.[0] || null;
  }

  async function matchById(guildId, id) {
    const { data } = await supabase.from('hub_team_matches').select('*').eq('guild_id', guildId).eq('id', id).maybeSingle();
    return data || null;
  }

  // ---------- Views ----------

  async function leagueCard(guild, member) {
    const [teams, league, cup] = await Promise.all([teamsOf(guild.id), activeComp(guild.id, 'league'), activeComp(guild.id, 'cup')]);
    const mine = teams.filter((t) => isCaptainOf(member, t));
    const admin = isServerAdmin(member);
    const myKeys = mine.map((t) => t.key);
    const { data: open } = await supabase.from('hub_team_matches').select('*').eq('guild_id', guild.id).in('status', OPEN).order('created_at').limit(50);
    const embed = new EmbedBuilder()
      .setTitle('🏟️ Hub League')
      .setColor(BLUE)
      .setDescription('Hub teams play each other here: friendlies any time, a league with a round a week, and a knockout cup. Captains report scores and the other side confirms.');

    if (league?.status === 'running') {
      const { data: ms } = await supabase.from('hub_team_matches').select('*').eq('competition_id', league.id);
      const table = leagueTable(league.teams, ms || []);
      embed.addFields({
        name: `📊 ${league.name}`,
        value: ['`#  Team                 P  W  D  L  GD Pts`', ...table.map((r, i) => `\`${String(i + 1).padStart(2)} ${r.name.slice(0, 20).padEnd(20)} ${String(r.p).padStart(2)} ${String(r.w).padStart(2)} ${String(r.d).padStart(2)} ${String(r.l).padStart(2)} ${String(r.gf - r.ga).padStart(3)} ${String(r.pts).padStart(3)}\``)].join('\n').slice(0, 1024),
      });
    } else if (league?.status === 'signup') {
      embed.addFields({ name: `📝 ${league.name}: sign-ups open`, value: league.teams.map((t) => t.name).join(', ') || 'No teams yet.' });
    }
    if (cup?.status === 'running') {
      const rounds = cup.data?.rounds || [];
      const last = rounds[rounds.length - 1] || [];
      const { data: ms } = await supabase.from('hub_team_matches').select('*').eq('competition_id', cup.id).eq('round', rounds.length);
      embed.addFields({ name: `🏆 ${cup.name}: ${roundName(last.length)}`, value: (ms || []).map((m) => `${scoreLine(m)}${m.status === 'walkover' ? ' (walkover)' : ''}`).join('\n').slice(0, 1024) || 'Byes only this round.' });
    } else if (cup?.status === 'signup') {
      embed.addFields({ name: `📝 ${cup.name}: sign-ups open`, value: cup.teams.map((t) => t.name).join(', ') || 'No teams yet.' });
    }
    const mineOpen = (open || []).filter((m) => myKeys.includes(m.home_key) || myKeys.includes(m.away_key) || (admin && m.status === 'disputed'));
    if (mineOpen.length) {
      embed.addFields({
        name: 'Your games',
        value: mineOpen.slice(0, 8).map((m) => `${scoreLine(m)} · ${m.kind}${m.due_at ? ` · by <t:${unix(m.due_at)}:d>` : ''} · ${m.status === 'reported' ? `reported ${m.home_goals}-${m.away_goals}, waiting for the other side` : m.status}`).join('\n').slice(0, 1024),
      });
    }
    if (!mine.length && !admin) embed.setFooter({ text: 'Only team captains can challenge and enter. Start a team or Find a team on the hub board.' });

    const rows = [];
    const reportable = mineOpen.filter((m) => ['scheduled', 'disputed'].includes(m.status)).slice(0, 25);
    if (reportable.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('hl_rep')
            .setPlaceholder('Report a score')
            .addOptions(reportable.map((m) => ({ label: `${m.home_name} vs ${m.away_name}`.slice(0, 100), value: m.id, description: `${m.kind}${m.status === 'disputed' ? ' · disputed' : ''}` })))
        )
      );
    }
    const buttons = [];
    if (mine.length) buttons.push(new ButtonBuilder().setCustomId('hl_chal').setLabel('Challenge a team').setEmoji('🤝').setStyle(ButtonStyle.Primary));
    if (mine.length && league?.status !== 'running') buttons.push(new ButtonBuilder().setCustomId('hl_enter:league').setLabel('Enter the league').setEmoji('📊').setStyle(ButtonStyle.Secondary));
    if (mine.length && cup?.status !== 'running') buttons.push(new ButtonBuilder().setCustomId('hl_enter:cup').setLabel('Enter the cup').setEmoji('🏆').setStyle(ButtonStyle.Secondary));
    if (admin && league?.status === 'signup') buttons.push(new ButtonBuilder().setCustomId('hl_start:league').setLabel('Start the league').setEmoji('▶️').setStyle(ButtonStyle.Success));
    if (admin && cup?.status === 'signup') buttons.push(new ButtonBuilder().setCustomId('hl_start:cup').setLabel('Start the cup').setEmoji('▶️').setStyle(ButtonStyle.Success));
    if (buttons.length) rows.push(new ActionRowBuilder().addComponents(...buttons.slice(0, 5)));
    return { embeds: [embed], components: rows, allowedMentions: NO_PINGS };
  }

  // ---------- Entering and starting ----------

  async function enter(guild, member, kind) {
    const mine = (await teamsOf(guild.id)).filter((t) => isCaptainOf(member, t));
    if (!mine.length) return '❌ Only team captains can enter.';
    return locked(`${guild.id}:${kind}`, async () => {
      let comp = await activeComp(guild.id, kind);
      if (comp?.status === 'running') return `❌ The ${kind} is already under way. Enter the next one.`;
      if (!comp) {
        const month = new Date().toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
        const { data, error } = await supabase.from('hub_competitions').insert({ guild_id: guild.id, kind, name: kind === 'league' ? `${month} Hub League` : `${month} Hub Cup` }).select('*').single();
        if (error) return `❌ ${error.message}`;
        comp = data;
        await feedPost(guild, { content: `📝 Sign-ups are open for the **${comp.name}**. Captains: **Hub League** on the board → **Enter the ${kind}**.` });
      }
      const already = new Set(comp.teams.map((t) => t.key));
      const added = mine.filter((t) => !already.has(t.key));
      if (!added.length) return `✅ You're already in the **${comp.name}** (${comp.teams.length} team${comp.teams.length === 1 ? '' : 's'}).`;
      const teams = [...comp.teams, ...added.map((t) => ({ key: t.key, name: t.name }))];
      await supabase.from('hub_competitions').update({ teams }).eq('id', comp.id);
      return `✍️ **${added.map((t) => t.name).join(', ')}** ${added.length === 1 ? 'is' : 'are'} in the **${comp.name}** (${teams.length} teams). An admin starts it from **Hub League**.`;
    });
  }

  async function start(guild, kind) {
    return locked(`${guild.id}:${kind}`, async () => {
      const comp = await activeComp(guild.id, kind);
      if (comp?.status !== 'signup') return '❌ There\'s nothing to start.';
      const live = new Set((await teamsOf(guild.id)).map((t) => t.key));
      const teams = comp.teams.filter((t) => live.has(t.key));
      if (teams.length < 2) return '❌ It needs at least two teams.';
      const now = Date.now();
      const name = (k) => teams.find((t) => t.key === k)?.name || k;
      let rows = [];
      let data = {};
      if (kind === 'league') {
        roundRobin(teams.map((t) => t.key)).forEach((games, r) => {
          for (const [h, a] of games) rows.push({ round: r + 1, home_key: h, away_key: a, due_at: new Date(now + (r + 1) * WEEK_MS).toISOString() });
        });
        data = { rounds: Math.max(...rows.map((x) => x.round)) };
      } else {
        const seeded = [...teams].sort(() => Math.random() - 0.5).map((t) => t.key);
        const round = firstRound(seeded.length).map((m) => ({ a: seeded[m.a], b: m.b === null ? null : seeded[m.b], winner: m.winner === null ? null : seeded[m.winner] }));
        for (const m of round) if (m.b) rows.push({ round: 1, home_key: m.a, away_key: m.b, due_at: new Date(now + WEEK_MS).toISOString() });
        data = { rounds: [round] };
      }
      rows = rows.map((r) => ({ ...r, guild_id: guild.id, competition_id: comp.id, kind, home_name: name(r.home_key), away_name: name(r.away_key), status: 'scheduled' }));
      const { error } = await supabase.from('hub_team_matches').insert(rows);
      if (error) return `❌ ${error.message}`;
      await supabase.from('hub_competitions').update({ status: 'running', teams, data, started_at: new Date(now).toISOString() }).eq('id', comp.id);
      const first = rows.filter((r) => r.round === 1);
      await feedPost(guild, {
        embeds: [
          new EmbedBuilder()
            .setTitle(`${kind === 'league' ? '📊' : '🏆'} The ${comp.name} is on!`)
            .setColor(BLUE)
            .setDescription(
              `${teams.length} teams. ${kind === 'league' ? `Everyone plays everyone once, a round a week (${data.rounds} rounds).` : 'Knockout, a round a week.'} Captains report scores from **Hub League** on the board.\n\n**${kind === 'league' ? 'Round 1' : roundName(data.rounds[0].length)}** (by <t:${unix(first[0]?.due_at || new Date(now + WEEK_MS).toISOString())}:d>)\n${first.map(scoreLine).join('\n')}`.slice(0, 4000)
            ),
        ],
      });
      return `▶️ The **${comp.name}** has started.`;
    });
  }

  // ---------- Friendlies ----------

  async function challenge(guild, member, fromKey, toKey) {
    const teams = await teamsOf(guild.id);
    const from = teams.find((t) => t.key === fromKey);
    const to = teams.find((t) => t.key === toKey);
    if (!from || !to || from.key === to.key) return '❌ Pick another team.';
    if (!isCaptainOf(member, from)) return `❌ Only ${from.name}'s captains can challenge for it.`;
    const { data: dup } = await supabase.from('hub_team_matches').select('id').eq('guild_id', guild.id).eq('kind', 'friendly').in('status', ['pending', 'scheduled', 'reported']).or(`and(home_key.eq.${from.key},away_key.eq.${to.key}),and(home_key.eq.${to.key},away_key.eq.${from.key})`).limit(1);
    if (dup?.length) return `✅ There's already a friendly between **${from.name}** and **${to.name}**.`;
    const { data: m, error } = await supabase.from('hub_team_matches').insert({ guild_id: guild.id, kind: 'friendly', home_key: from.key, away_key: to.key, home_name: from.name, away_name: to.name, status: 'pending', created_by: member.id }).select('*').single();
    if (error) return `❌ ${error.message}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`hl_acc:${m.id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`hl_dec:${m.id}`).setLabel('Decline').setStyle(ButtonStyle.Secondary)
    );
    const ok = await deskPost(guild, to, { content: `🤝 **${from.name}** challenged **${to.name}** to a friendly. Sort out a time in the hub, then accept. Either captain reports the score from **Hub League** on the board.`, components: [row] });
    return ok ? `🤝 Challenge sent to **${to.name}**'s captains.` : `🤝 Challenge saved, but I couldn't post in **${to.name}**'s desk. Their captains will see it under **Hub League**.`;
  }

  async function answerChallenge(guild, member, id, yes) {
    const m = await matchById(guild.id, id);
    if (!m || m.status !== 'pending') return 'This challenge has already been answered.';
    const to = (await teamsOf(guild.id)).find((t) => t.key === m.away_key);
    if (!isCaptainOf(member, to)) return `❌ Only ${m.away_name}'s captains can answer.`;
    await supabase.from('hub_team_matches').update({ status: yes ? 'scheduled' : 'declined' }).eq('id', id).eq('status', 'pending');
    if (yes) await feedPost(guild, { content: `🤝 Friendly on: **${m.home_name}** vs **${m.away_name}**.` });
    return yes ? `✅ Friendly on with **${m.home_name}**. Report the score from **Hub League** after the game.` : `👋 Declined.`;
  }

  // ---------- Scores ----------

  async function report(guild, member, id, homeGoals, awayGoals) {
    return locked(`${guild.id}:match:${id}`, async () => {
      const m = await matchById(guild.id, id);
      if (!m || !['scheduled', 'disputed', 'reported'].includes(m.status)) return '❌ This game is already settled.';
      if (homeGoals == null || awayGoals == null) return '❌ Type whole numbers for both scores.';
      if (m.kind === 'cup' && homeGoals === awayGoals) return '❌ Cup ties need a winner: report the score after extra time or penalties (count the penalty winner as one more goal).';
      const teams = await teamsOf(guild.id);
      const side = [m.home_key, m.away_key].find((k) => isCaptainOf(member, teams.find((t) => t.key === k)));
      const admin = isServerAdmin(member);
      if (!side && !admin) return `❌ Only the captains of ${m.home_name} and ${m.away_name} (or a server admin) can report.`;
      if (m.status === 'disputed' && !admin) return '⚖️ This score is disputed. A server admin sets the final score.';
      if (admin && (!side || m.status === 'disputed')) {
        await supabase.from('hub_team_matches').update({ home_goals: homeGoals, away_goals: awayGoals, status: 'confirmed', reported_at: new Date().toISOString() }).eq('id', id);
        await settled(guild, { ...m, home_goals: homeGoals, away_goals: awayGoals, status: 'confirmed' });
        return `✅ Final score set: ${m.home_name} ${homeGoals}-${awayGoals} ${m.away_name}.`;
      }
      await supabase.from('hub_team_matches').update({ home_goals: homeGoals, away_goals: awayGoals, status: 'reported', reported_by_key: side, reported_at: new Date().toISOString() }).eq('id', id);
      const other = teams.find((t) => t.key === (side === m.home_key ? m.away_key : m.home_key));
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hl_ok:${id}`).setLabel('Confirm').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`hl_no:${id}`).setLabel('Dispute').setEmoji('⚖️').setStyle(ButtonStyle.Secondary)
      );
      await deskPost(guild, other, { content: `📝 Score reported: **${m.home_name}** ${homeGoals}-${awayGoals} **${m.away_name}** (${m.kind}). Confirm it, or dispute it and a server admin sets the final score. No answer in 24 hours confirms it.`, components: [row] });
      return `📝 Reported ${m.home_name} ${homeGoals}-${awayGoals} ${m.away_name}. ${other?.name || 'The other team'}'s captains confirm it (or it's confirmed in 24 hours).`;
    });
  }

  async function answerReport(guild, member, id, yes) {
    return locked(`${guild.id}:match:${id}`, async () => {
      const m = await matchById(guild.id, id);
      if (!m || m.status !== 'reported') return 'This score has already been settled.';
      const otherKey = m.reported_by_key === m.home_key ? m.away_key : m.home_key;
      const other = (await teamsOf(guild.id)).find((t) => t.key === otherKey);
      if (!isCaptainOf(member, other) && !isServerAdmin(member)) return `❌ Only ${other?.name || 'the other team'}'s captains can answer.`;
      if (!yes) {
        await supabase.from('hub_team_matches').update({ status: 'disputed' }).eq('id', id);
        await feedPost(guild, { content: `⚖️ The score of **${m.home_name}** vs **${m.away_name}** is disputed. A server admin sets the final score from **Hub League**.` });
        return '⚖️ Disputed. A server admin will set the final score.';
      }
      await supabase.from('hub_team_matches').update({ status: 'confirmed' }).eq('id', id);
      await settled(guild, { ...m, status: 'confirmed' });
      return '✅ Confirmed.';
    });
  }

  // A game is final: post it, then move its competition on
  async function settled(guild, m) {
    const tag = m.kind === 'friendly' ? 'Friendly' : m.kind === 'league' ? 'League' : 'Cup';
    await feedPost(guild, { content: `⚽ ${tag}: ${scoreLine(m)}${m.status === 'walkover' ? ' (walkover: not played in time)' : ''}` });
    if (m.competition_id) await advance(guild, m.competition_id);
  }

  async function advance(guild, compId) {
    return locked(`${guild.id}:comp:${compId}`, async () => {
      const { data: comp } = await supabase.from('hub_competitions').select('*').eq('id', compId).maybeSingle();
      if (comp?.status !== 'running') return;
      const { data: ms } = await supabase.from('hub_team_matches').select('*').eq('competition_id', compId);
      const matches = ms || [];
      if (comp.kind === 'league') {
        if (matches.some((m) => OPEN.includes(m.status))) return;
        const table = leagueTable(comp.teams, matches);
        await finish(guild, comp, table[0]?.key, table[0]?.name, `with **${table[0]?.pts ?? 0}** points`);
        return;
      }
      const rounds = comp.data?.rounds || [];
      const n = rounds.length;
      const current = rounds[n - 1].map((t) => {
        if (t.winner || !t.b) return t;
        const m = matches.find((x) => x.round === n && x.home_key === t.a && x.away_key === t.b);
        return { ...t, winner: m ? tieWinner(m) : null };
      });
      rounds[n - 1] = current;
      if (current.some((t) => !t.winner)) {
        await supabase.from('hub_competitions').update({ data: { ...comp.data, rounds } }).eq('id', compId);
        return;
      }
      const next = nextRound(current);
      if (!next) {
        const name = comp.teams.find((t) => t.key === current[0].winner)?.name || 'A team';
        await supabase.from('hub_competitions').update({ data: { ...comp.data, rounds } }).eq('id', compId);
        await finish(guild, comp, current[0].winner, name, 'in the final');
        return;
      }
      rounds.push(next);
      const name = (k) => comp.teams.find((t) => t.key === k)?.name || k;
      const due = new Date(Date.now() + WEEK_MS).toISOString();
      const rows = next.map((t) => ({ guild_id: guild.id, competition_id: compId, kind: 'cup', round: n + 1, home_key: t.a, away_key: t.b, home_name: name(t.a), away_name: name(t.b), status: 'scheduled', due_at: due }));
      await supabase.from('hub_team_matches').insert(rows);
      await supabase.from('hub_competitions').update({ data: { ...comp.data, rounds } }).eq('id', compId);
      await feedPost(guild, { content: `🏆 **${comp.name}: ${roundName(next.length)}** (by <t:${unix(due)}:d>)\n${rows.map(scoreLine).join('\n')}` });
    });
  }

  async function finish(guild, comp, key, name, how) {
    await supabase.from('hub_competitions').update({ status: 'done', winner_key: key || null, winner_name: name || null, ended_at: new Date().toISOString() }).eq('id', comp.id);
    if (key) await feedPost(guild, { content: `🥇 **${name}** won the **${comp.name}** ${how}! Captains: the next one opens when you press **Enter** under **Hub League**.` });
  }

  // Every 10 minutes: confirm reports nobody answered, and settle games past their week
  async function tick() {
    const now = Date.now();
    const { data: stale } = await supabase.from('hub_team_matches').select('*').eq('status', 'reported').lt('reported_at', new Date(now - CONFIRM_MS).toISOString()).limit(100);
    const { data: late } = await supabase.from('hub_team_matches').select('*').eq('status', 'scheduled').in('kind', ['league', 'cup']).lt('due_at', new Date(now).toISOString()).limit(100);
    for (const m of [...(stale || []), ...(late || [])]) {
      const guild = client()?.guilds?.cache?.get(m.guild_id);
      if (!guild) continue;
      if (m.status === 'reported') {
        await supabase.from('hub_team_matches').update({ status: 'confirmed' }).eq('id', m.id).eq('status', 'reported');
        await settled(guild, { ...m, status: 'confirmed' }).catch(() => {});
      } else if (m.kind === 'cup') {
        await supabase.from('hub_team_matches').update({ status: 'walkover' }).eq('id', m.id).eq('status', 'scheduled');
        await settled(guild, { ...m, status: 'walkover' }).catch(() => {});
      } else {
        await supabase.from('hub_team_matches').update({ status: 'void' }).eq('id', m.id).eq('status', 'scheduled');
        await advance(guild, m.competition_id).catch(() => {});
      }
    }
  }
  const timer = setInterval(() => tick().catch((err) => console.warn(`[hub-league] tick failed: ${err.message}`)), TICK_MS);
  timer.unref?.();

  // ---------- Interactions ----------

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('hl_') || !interaction.guildId) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;
    const member = await memberOf(interaction);
    const guild = interaction.guild;
    const fromCard = interaction.message?.flags?.has?.(64);
    const [action, arg] = id.split(':');

    if (action === 'hl_open') {
      if (fromCard) await interaction.deferUpdate();
      else await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await leagueCard(guild, member));
      return true;
    }
    if (action === 'hl_enter' || action === 'hl_start') {
      const kind = arg === 'cup' ? 'cup' : 'league';
      if (action === 'hl_start' && !isServerAdmin(member)) {
        await interaction.reply({ content: '❌ Only server admins can start it.', flags: 64 });
        return true;
      }
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: action === 'hl_enter' ? await enter(guild, member, kind) : await start(guild, kind) });
      return true;
    }
    if (action === 'hl_chal' && interaction.isButton?.()) {
      const teams = await teamsOf(guild.id);
      const mine = teams.filter((t) => isCaptainOf(member, t));
      if (!mine.length) {
        await interaction.reply({ content: '❌ Only team captains can challenge.', flags: 64 });
        return true;
      }
      const rows = mine.slice(0, 4).map((from) => {
        const others = teams.filter((t) => t.key !== from.key).slice(0, 25);
        return others.length
          ? new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`hl_chal_to:${from.key}`)
                .setPlaceholder(`${from.name}: pick an opponent`.slice(0, 150))
                .addOptions(others.map((t) => ({ label: t.name.slice(0, 100), value: t.key })))
            )
          : null;
      }).filter(Boolean);
      await interaction.reply({ content: rows.length ? '🤝 Who do you want to play?' : 'There are no other teams to play yet.', components: rows, flags: 64 });
      return true;
    }
    if (action === 'hl_chal_to' && interaction.isStringSelectMenu?.()) {
      await interaction.deferUpdate();
      await interaction.editReply({ content: await challenge(guild, member, arg, interaction.values[0]), components: [] });
      return true;
    }
    if ((action === 'hl_acc' || action === 'hl_dec') && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: await answerChallenge(guild, member, arg, action === 'hl_acc') });
      return true;
    }
    if (action === 'hl_rep' && interaction.isStringSelectMenu?.()) {
      const m = await matchById(guild.id, interaction.values[0]);
      if (!m) {
        await interaction.reply({ content: '❌ This game is gone.', flags: 64 });
        return true;
      }
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`hl_rep_m:${m.id}`)
          .setTitle('Report the score')
          .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('home').setLabel(`${m.home_name} goals`.slice(0, 45)).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('away').setLabel(`${m.away_name} goals`.slice(0, 45)).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true))
          )
      );
      return true;
    }
    if (action === 'hl_rep_m' && interaction.isModalSubmit?.()) {
      await interaction.deferReply({ flags: 64 });
      const content = await report(guild, member, arg, parseGoals(interaction.fields.getTextInputValue('home')), parseGoals(interaction.fields.getTextInputValue('away')));
      await interaction.editReply({ content });
      return true;
    }
    if ((action === 'hl_ok' || action === 'hl_no') && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: await answerReport(guild, member, arg, action === 'hl_ok') });
      return true;
    }
    return false;
  }

  return { handleInteraction, leagueCard, enter, start, challenge, answerChallenge, report, answerReport, advance, tick };
}

module.exports = { createHubLeague, roundRobin, leagueTable, parseGoals, tieWinner };
