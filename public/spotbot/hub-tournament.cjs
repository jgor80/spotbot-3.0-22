// Weekly hub tournament for Social Hub servers: random teams, a bot-run bracket and a winner's role.
//   Sign-ups   every week a tournament opens by itself (Saturday 19:00 UTC by default; admins change
//              the day, hour and team size with Tournament settings). The sign-up card posts in
//              #hub-feed with Join / Leave; Hub tournament on the board shows it too.
//   Draw       at kick-off, with at least two teams' worth of players, sign-ups are split into even
//              random teams by pickup rating (hub-draft balance, shuffled within the rating bands), up
//              to 8 teams; anyone left over is listed as a sub. The bracket is single elimination with
//              byes to a power of two.
//   Matches    each match posts in #hub-feed with a result button per team. A captain (first player
//              listed) of either team reports; the other captain can undo it for 10 minutes. Winners
//              move on and the next round posts when a round is done.
//   Champions  the winners get the 🏆 Hub Champion role (taken off last week's champions), +100 XP
//              each and the Tournament Winner badge. State lives in guild_settings.social_hub.tournament,
//              so a restart picks up where it left off. Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
const { balance, START_RATING } = require('./hub-draft.cjs');
const { isServerAdmin } = require('./perm-check.cjs');

const F = PermissionsBitField.Flags;
const GOLD = 0xf1c40f;
const NO_PINGS = { parse: [] };
const TICK_MS = 60 * 1000;
const UNDO_MS = 10 * 60 * 1000;
const MAX_TEAMS = 8;
const CHAMPION_ROLE = '🏆 Hub Champion';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DEFAULTS = { day: 6, hour: 19, size: 3 };

// ---------- Pure ----------

// The next kick-off at or after now for a weekly day (0 Sunday) and UTC hour
function nextStart(now, day, hour) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
  d.setUTCDate(d.getUTCDate() + ((day - d.getUTCDay() + 7) % 7));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

// Split players into teams of `size` (2 to MAX_TEAMS teams), even by rating; leftovers are subs
function makeTeams(ids, size, ratingOf, shuffle = (l) => l) {
  const count = Math.min(MAX_TEAMS, Math.floor(ids.length / size));
  if (count < 2) return null;
  const players = shuffle([...ids]).sort((a, b) => ratingOf(b) - ratingOf(a));
  const inTeams = players.slice(0, count * size);
  const subs = players.slice(count * size);
  // Pairwise balance keeps halves even; for more teams deal snake by rating
  let teams;
  if (count === 2) teams = balance(inTeams, ratingOf).teams;
  else {
    teams = Array.from({ length: count }, () => []);
    inTeams.forEach((id, i) => {
      const round = Math.floor(i / count);
      const slot = i % count;
      teams[round % 2 ? count - 1 - slot : slot].push(id);
    });
  }
  return { teams, subs };
}

// Round one of a single-elimination bracket: byes for the top seeds when teams aren't a power of two
function firstRound(teamCount) {
  let size = 1;
  while (size < teamCount) size *= 2;
  const seeds = Array.from({ length: size }, (_, i) => (i < teamCount ? i : null));
  const matches = [];
  for (let i = 0; i < size / 2; i++) matches.push({ a: seeds[i], b: seeds[size - 1 - i], winner: null });
  // A bye: the team goes straight through
  for (const m of matches) if (m.b === null) m.winner = m.a;
  return matches;
}

// The next round from a finished one, or null when it was the final
function nextRound(round) {
  if (round.length <= 1) return null;
  const out = [];
  for (let i = 0; i < round.length; i += 2) out.push({ a: round[i].winner, b: round[i + 1].winner, winner: null });
  return out;
}

const roundName = (n) => (n === 1 ? 'Final' : n === 2 ? 'Semi-finals' : n === 4 ? 'Quarter-finals' : `Round of ${n * 2}`);

function createHubTournament(deps) {
  const { supabase, hubOf, saveHub } = deps;
  const xp = () => deps.xp?.();
  const client = () => deps.client();
  const busy = new Set();

  const settingsOf = (hub) => ({ ...DEFAULTS, ...(hub.tournament_settings || {}) });

  async function save(guildId, t) {
    const hub = await hubOf(guildId);
    await saveHub(guildId, { ...hub, tournament: t });
  }

  async function feed(guild, hub) {
    const ch = hub.feed_channel_id ? await guild.channels.fetch(hub.feed_channel_id).catch(() => null) : null;
    return ch?.send ? ch : null;
  }

  // ---------- Views ----------

  function signupCard(t) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Weekly hub tournament')
      .setColor(GOLD)
      .setDescription(
        [
          `Kick-off <t:${Math.floor(t.starts_at / 1000)}:F> (<t:${Math.floor(t.starts_at / 1000)}:R>). Teams of **${t.size}**, drawn at random and evened out by pickup rating.`,
          `**${t.players.length} signed up**${t.players.length ? `: ${t.players.map((id) => `<@${id}>`).join(' ')}`.slice(0, 1500) : ''}`,
          `Winners get the **${CHAMPION_ROLE}** role for the week, +100 XP and the Tournament Winner badge.`,
        ].join('\n\n')
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ht_join').setLabel('Join').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ht_leave').setLabel('Leave').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row], allowedMentions: NO_PINGS };
  }

  const teamLine = (t, i) => `**${t.names[i]}**: ${t.teams[i].map((id) => `<@${id}>`).join(' ')}`;

  function matchCard(t, r, m) {
    const match = t.rounds[r][m];
    const done = match.winner !== null && match.winner !== undefined;
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${roundName(t.rounds[r].length)}${t.rounds[r].length > 1 ? ` · match ${m + 1}` : ''}`)
      .setColor(GOLD)
      .setDescription(
        [
          `${teamLine(t, match.a)}\n**vs**\n${teamLine(t, match.b)}`,
          done ? `✅ **${t.names[match.winner]}** go through${match.by ? ` (reported by <@${match.by}>)` : ''}.` : 'Play it in any lobby. A captain (the first player listed) reports the result here.',
        ].join('\n\n')
      );
    const rows = [];
    if (!done) {
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ht_win:${r}:${m}:${match.a}`).setLabel(`${t.names[match.a]} won`.slice(0, 80)).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ht_win:${r}:${m}:${match.b}`).setLabel(`${t.names[match.b]} won`.slice(0, 80)).setStyle(ButtonStyle.Primary)
      ));
    } else if (match.by && Date.now() - match.at < UNDO_MS && !t.rounds[r + 1]) {
      rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ht_undo:${r}:${m}`).setLabel('Undo result').setStyle(ButtonStyle.Secondary)));
    }
    return { embeds: [embed], components: rows, allowedMentions: NO_PINGS };
  }

  // ---------- Lifecycle ----------

  async function open(guild, hub) {
    const s = settingsOf(hub);
    const t = { id: Date.now().toString(36), state: 'signup', starts_at: nextStart(new Date(), s.day, s.hour).getTime(), size: s.size, players: [] };
    const ch = await feed(guild, hub);
    if (ch) t.signup_message_id = (await ch.send(signupCard(t)).catch(() => null))?.id || null;
    await save(guild.id, t);
    return t;
  }

  async function ratings(guildId, ids) {
    const { data } = await supabase.from('hub_players').select('discord_user_id, rating').eq('guild_id', guildId).in('discord_user_id', ids);
    return new Map((data || []).map((r) => [r.discord_user_id, r.rating ?? START_RATING]));
  }

  async function draw(guild, hub, t) {
    const ch = await feed(guild, hub);
    const rating = await ratings(guild.id, t.players);
    const shuffle = (l) => l.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const made = makeTeams(t.players, t.size, (id) => rating.get(id) ?? START_RATING, shuffle);
    if (!made) {
      const next = { ...t, state: 'cancelled' };
      await save(guild.id, next);
      if (ch) await ch.send({ content: `🏆 Not enough players for this week's tournament (${t.players.length} signed up, ${t.size * 2} needed). Next week's sign-ups open now.`, allowedMentions: NO_PINGS }).catch(() => {});
      return next;
    }
    const names = [];
    for (const team of made.teams) names.push(`Team ${(await guild.members.fetch(team[0]).catch(() => null))?.displayName || names.length + 1}`.slice(0, 40));
    const next = { ...t, state: 'playing', teams: made.teams, subs: made.subs, names, rounds: [firstRound(made.teams.length)], match_messages: [[]] };
    if (ch) {
      await ch.send({
        embeds: [new EmbedBuilder().setTitle('🏆 The draw').setColor(GOLD).setDescription([...made.teams.map((_, i) => teamLine(next, i)), made.subs.length ? `Subs: ${made.subs.map((id) => `<@${id}>`).join(' ')}` : null].filter(Boolean).join('\n'))],
        allowedMentions: NO_PINGS,
      }).catch(() => {});
    }
    await postRound(guild, hub, next, 0);
    return next;
  }

  async function postRound(guild, hub, t, r) {
    const ch = await feed(guild, hub);
    t.match_messages[r] = [];
    for (let m = 0; m < t.rounds[r].length; m++) {
      const match = t.rounds[r][m];
      if (match.b === null) continue; // bye
      t.match_messages[r][m] = ch ? (await ch.send(matchCard(t, r, m)).catch(() => null))?.id || null : null;
    }
    await save(guild.id, t);
    await advance(guild, hub, t);
  }

  // When every match in the latest round has a winner: next round, or champions
  async function advance(guild, hub, t) {
    const r = t.rounds.length - 1;
    if (t.rounds[r].some((m) => m.winner === null || m.winner === undefined)) return t;
    const next = nextRound(t.rounds[r]);
    if (next) {
      t.rounds.push(next);
      return postRound(guild, hub, t, r + 1);
    }
    return crown(guild, hub, t, t.rounds[r][0].winner);
  }

  async function crown(guild, hub, t, team) {
    t.state = 'done';
    t.champions = t.teams[team];
    await save(guild.id, t);
    let role = guild.roles.cache.find((x) => x.name === CHAMPION_ROLE);
    if (!role && guild.members.me?.permissions?.has(F.ManageRoles)) role = await guild.roles.create({ name: CHAMPION_ROLE, hoist: true, reason: 'GafferBot hub tournament' }).catch(() => null);
    if (role) {
      for (const m of role.members?.values?.() || []) if (!t.champions.includes(m.id)) await m.roles.remove(role).catch(() => {});
      for (const id of t.champions) await (await guild.members.fetch(id).catch(() => null))?.roles?.add(role).catch(() => {});
    }
    await xp()?.record(guild.id, new Map(t.champions.map((id) => [id, { tournamentWins: 1 }])));
    const ch = await feed(guild, hub);
    if (ch) {
      await ch.send({
        embeds: [new EmbedBuilder().setTitle(`🏆 ${t.names[team]} win the weekly tournament!`).setColor(GOLD).setDescription(`${t.champions.map((id) => `<@${id}>`).join(' ')} are this week's **${CHAMPION_ROLE}**s: +100 XP each. Next week's sign-ups are open.`)],
        allowedMentions: NO_PINGS,
      }).catch(() => {});
    }
    return t;
  }

  async function tick() {
    for (const guild of client()?.guilds?.cache?.values?.() || []) {
      if (busy.has(guild.id)) continue;
      busy.add(guild.id);
      try {
        const hub = await hubOf(guild.id);
        if (!hub.on || !hub.feed_channel_id || hub.tournament_settings?.off) continue;
        const t = hub.tournament;
        if (!t || t.state === 'done' || t.state === 'cancelled') await open(guild, hub);
        else if (t.state === 'signup' && Date.now() >= t.starts_at) await draw(guild, hub, { ...t });
      } catch (err) {
        console.warn(`[tournament] tick failed for ${guild.id}: ${err.message}`);
      } finally {
        busy.delete(guild.id);
      }
    }
  }
  const timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  timer.unref?.();

  async function refreshSignup(guild, hub, t) {
    const ch = await feed(guild, hub);
    const msg = ch && t.signup_message_id ? await ch.messages.fetch(t.signup_message_id).catch(() => null) : null;
    if (msg) await msg.edit(signupCard(t)).catch(() => {});
  }

  // ---------- Interactions ----------

  function settingsModal(s) {
    const row = (id, label, value) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(value)).setMaxLength(10));
    return new ModalBuilder()
      .setCustomId('ht_set_m')
      .setTitle('Tournament settings')
      .addComponents(row('day', 'Day (monday … sunday, or off)', DAYS[s.day]), row('hour', 'Kick-off hour, UTC (0-23)', s.hour), row('size', 'Players per team (2-11)', s.size));
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('ht_') || !interaction.guildId) return false;
    const guild = interaction.guild;
    const hub = await hubOf(guild.id);
    if (!hub.on) return false;
    const t = hub.tournament ? JSON.parse(JSON.stringify(hub.tournament)) : null;

    if (id === 'ht_show') {
      if (!t || t.state !== 'signup') {
        await interaction.reply({ content: t?.state === 'playing' ? '🏆 This week\'s tournament is being played: follow it in the hub feed.' : '🏆 The next tournament opens shortly.', flags: 64 });
        return true;
      }
      const card = signupCard(t);
      if (isServerAdmin(interaction.member)) card.components[0].addComponents(new ButtonBuilder().setCustomId('ht_set').setLabel('Tournament settings').setStyle(ButtonStyle.Secondary));
      await interaction.reply({ ...card, flags: 64 });
      return true;
    }
    if (id === 'ht_join' || id === 'ht_leave') {
      if (!t || t.state !== 'signup') {
        await interaction.reply({ content: 'Sign-ups are closed for this one.', flags: 64 });
        return true;
      }
      const me = interaction.user.id;
      const has = t.players.includes(me);
      if (id === 'ht_join' && !has) t.players.push(me);
      if (id === 'ht_leave' && has) t.players = t.players.filter((x) => x !== me);
      await save(guild.id, t);
      await refreshSignup(guild, hub, t);
      await interaction.reply({ content: id === 'ht_join' ? (has ? 'You\'re already in.' : `✅ You're in (${t.players.length} signed up). Kick-off <t:${Math.floor(t.starts_at / 1000)}:R>.`) : has ? '👋 You\'re out.' : 'You weren\'t signed up.', flags: 64 });
      return true;
    }
    if (id === 'ht_set') {
      if (!isServerAdmin(interaction.member)) return interaction.reply({ content: 'Only server admins can change the tournament.', flags: 64 }).then(() => true);
      await interaction.showModal(settingsModal(settingsOf(hub)));
      return true;
    }
    if (id === 'ht_set_m' && interaction.isModalSubmit?.()) {
      if (!isServerAdmin(interaction.member)) return interaction.reply({ content: 'Only server admins can change the tournament.', flags: 64 }).then(() => true);
      const dayRaw = interaction.fields.getTextInputValue('day').trim().toLowerCase();
      const off = dayRaw === 'off';
      const day = DAYS.findIndex((d) => d.startsWith(dayRaw.slice(0, 3)));
      const hour = Number(interaction.fields.getTextInputValue('hour'));
      const size = Number(interaction.fields.getTextInputValue('size'));
      if (!off && (day < 0 || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(size) || size < 2 || size > 11)) {
        await interaction.reply({ content: '❌ Use a day name, an hour from 0 to 23 and a team size from 2 to 11.', flags: 64 });
        return true;
      }
      const settings = off ? { ...settingsOf(hub), off: true } : { day, hour, size };
      const next = { ...hub, tournament_settings: settings };
      // A sign-up already open moves to the new time and size
      if (!off && next.tournament?.state === 'signup') next.tournament = { ...next.tournament, starts_at: nextStart(new Date(), day, hour).getTime(), size };
      await saveHub(guild.id, next);
      if (next.tournament?.state === 'signup') await refreshSignup(guild, next, next.tournament);
      await interaction.reply({ content: off ? '⏸️ Weekly tournaments are off.' : `✅ Tournaments now kick off every **${DAYS[day]}** at **${hour}:00 UTC**, teams of **${size}**.`, flags: 64 });
      return true;
    }
    if (id.startsWith('ht_win:') || id.startsWith('ht_undo:')) {
      const [, r, m, w] = id.split(':');
      const match = t?.rounds?.[r]?.[m];
      if (!match || t.state !== 'playing') {
        await interaction.reply({ content: 'This match is over.', flags: 64 });
        return true;
      }
      const captains = [t.teams[match.a][0], t.teams[match.b][0]];
      if (!captains.includes(interaction.user.id)) {
        await interaction.reply({ content: 'Only the two captains (first player listed) can report this match.', flags: 64 });
        return true;
      }
      if (id.startsWith('ht_undo:')) {
        if (interaction.user.id === match.by || Date.now() - match.at > UNDO_MS || t.rounds[Number(r) + 1]) {
          await interaction.reply({ content: 'Only the other captain can undo, within 10 minutes and before the next round starts.', flags: 64 });
          return true;
        }
        match.winner = null;
        delete match.by;
        delete match.at;
      } else {
        if (match.winner !== null && match.winner !== undefined) {
          await interaction.reply({ content: 'The result is already in.', flags: 64 });
          return true;
        }
        match.winner = Number(w);
        match.by = interaction.user.id;
        match.at = Date.now();
      }
      await save(guild.id, t);
      await interaction.update(matchCard(t, Number(r), Number(m)));
      // Give the other captain the undo window before the next round goes out
      if (match.winner !== null) {
        const timer = setTimeout(async () => {
          const fresh = (await hubOf(guild.id)).tournament;
          if (fresh?.id === t.id && fresh.state === 'playing') await advance(guild, await hubOf(guild.id), JSON.parse(JSON.stringify(fresh))).catch((err) => console.warn(`[tournament] advance failed: ${err.message}`));
        }, deps.undoMs ?? UNDO_MS);
        timer.unref?.();
      }
      return true;
    }
    return false;
  }

  return { handleInteraction, tick, open, draw, advance };
}

module.exports = { createHubTournament, nextStart, makeTeams, firstRound, nextRound, roundName, CHAMPION_ROLE };
