// Premium: stat trophies. Discord roles the bot hands out and takes back on its own after each
// synced match. Weekly belts cover the last 7 days, so they change hands week to week:
//   Club Legend   played in 75%+ of all the club's games (needs 10+ club games)
//   Golden Boot / Playmaker / Golden Glove / The Wall / MVP / Iron Man / Sniper  weekly leaders
//   In-Form       average match rating above 8.5 over their last 5 games
// Ties share a trophy. Players need their EA gamertag linked (/linkea) to receive roles.
// Role ids live on the club (autopilot.trophy_roles); a deleted role is recreated next time.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { seasonTotals, leaders, num } = require('./player-season.cjs');

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;
const LEGEND_SHARE = 0.75;
const LEGEND_MIN_CLUB_GAMES = 10;
const IN_FORM_RATING = 8.5;
const IN_FORM_GAMES = 5;
const IRON_MAN_MIN = 3;
const SNIPER_MIN_GOALS = 3;

const TROPHIES = {
  legend: { name: '👑 Club Legend', color: 0xf5b301, help: `Played in ${LEGEND_SHARE * 100}%+ of all club games` },
  boot: { name: '⚽ Golden Boot', color: 0xfacc15, help: 'Top scorer this week (last 7 days)' },
  playmaker: { name: '🎯 Playmaker', color: 0x38bdf8, help: 'Most assists this week' },
  glove: { name: '🧤 Golden Glove', color: 0x22c55e, help: 'Most clean sheets this week' },
  wall: { name: '🛡️ The Wall', color: 0x64748b, help: 'Most tackles + interceptions this week' },
  mvp: { name: '⭐ MVP', color: 0xeab308, help: 'Most Man of the Match awards this week' },
  ironman: { name: '🦾 Iron Man', color: 0x94a3b8, help: `Most appearances this week (${IRON_MAN_MIN}+)` },
  sniper: { name: '🔫 Sniper', color: 0xef4444, help: `Best goals-per-shot this week (${SNIPER_MIN_GOALS}+ goals)` },
  inform: { name: '🔥 In-Form', color: 0xf97316, help: `Avg rating over ${IN_FORM_RATING} in last ${IN_FORM_GAMES} games` },
};

const TROPHIES_SUBCOMMAND = {
  type: 1,
  name: 'trophies',
  description: 'Who holds the weekly stat trophies, Club Legend and In-Form.',
  options: [
    { name: 'club', description: 'Club name (if the server has more than one).', type: 3, required: false },
    { name: 'refresh', description: 'Leaders: re-check and hand out the roles now.', type: 5, required: false },
  ],
};

// Pure: who should hold each trophy. totalsRecent from the last 7 days, totalsAll from everything
// synced, eaGames maps lowercase gamertag -> EA's games played for the club, clubGames = club match count.
function trophyHolders(totalsRecent, totalsAll, eaGames = new Map(), clubGames = 0) {
  const recent = [...totalsRecent.values()];
  const all = [...totalsAll.values()];
  const keys = (list) => list.map((t) => t.key);
  const keepers = recent.filter((t) => t.line === 'GK');
  const gloveFrom = keepers.some((t) => t.cleanSheets > 0) ? keepers : recent.filter((t) => t.line === 'DEF');
  // EA's member list counts games we never synced, so the club total is the larger of the two.
  const eaMax = Math.max(0, ...eaGames.values());
  const total = Math.max(clubGames, eaMax);
  const legendKeys = new Set();
  if (total >= LEGEND_MIN_CLUB_GAMES) {
    const need = Math.ceil(total * LEGEND_SHARE);
    for (const t of all) if (t.games >= need) legendKeys.add(t.key);
    for (const [key, games] of eaGames) if (games >= need) legendKeys.add(key);
  }
  return {
    legend: [...legendKeys],
    boot: keys(leaders(recent, (t) => t.goals)),
    playmaker: keys(leaders(recent, (t) => t.assists)),
    glove: keys(leaders(gloveFrom, (t) => t.cleanSheets)),
    wall: keys(leaders(recent, (t) => num(t.tackles) + num(t.interceptions))),
    mvp: keys(leaders(recent, (t) => num(t.motm))),
    ironman: keys(leaders(recent.filter((t) => t.games >= IRON_MAN_MIN), (t) => t.games)),
    sniper: keys(leaders(recent.filter((t) => t.goals >= SNIPER_MIN_GOALS && num(t.shots) > 0), (t) => t.goals / num(t.shots))),
    inform: keys(all.filter((t) => t.ratings.length >= IN_FORM_GAMES && t.recentAvg(IN_FORM_GAMES) > IN_FORM_RATING)),
  };
}

function createStatRoles(deps) {
  const { supabase, premium, events, autopilot, getGuildState, canManageClub, loadMatches, fetchClubMembers } = deps;
  const client = () => events.getClient();
  const running = new Set();

  async function eaGamesFor(club) {
    const out = new Map();
    if (!fetchClubMembers || !club.ea_club_id) return out;
    const members = await fetchClubMembers({ clubId: club.ea_club_id, platform: club.ea_platform }).catch(() => []);
    for (const m of members || []) {
      const name = String(m.name || m.proName || '').trim();
      const games = num(m.gamesPlayed ?? m.matches);
      if (name) out.set(name.toLowerCase(), { games, name });
    }
    return out;
  }

  async function compute(guildId, club) {
    const matches = loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
    const since = Date.now() - WINDOW_DAYS * DAY;
    const totalsAll = seasonTotals(matches);
    const totalsRecent = seasonTotals(matches.filter((m) => m.playedAt.getTime() >= since));
    const ea = await eaGamesFor(club);
    const holders = trophyHolders(totalsRecent, totalsAll, new Map([...ea].map(([k, v]) => [k, v.games])), matches.length);
    const names = new Map([...[...ea].map(([k, v]) => [k, v.name]), ...[...totalsAll.values()].map((t) => [t.key, t.name])]);
    return { holders, totalsRecent, totalsAll, names, matches: matches.length };
  }

  // gamertag (lowercase) -> Discord user id for linked players; names maps lowercase -> as EA spells it
  async function linkedIds(keys, names) {
    if (!keys.length) return new Map();
    const spelled = [...new Set(keys.flatMap((k) => [k, names.get(k)]).filter(Boolean))];
    const { data } = await supabase.from('profiles').select('discord_user_id, ea_username').in('ea_username', spelled);
    const wanted = new Set(keys);
    const out = new Map();
    for (const p of data || []) {
      const key = String(p.ea_username || '')
        .trim()
        .toLowerCase();
      if (wanted.has(key) && !String(p.discord_user_id).startsWith('ea_')) out.set(key, p.discord_user_id);
    }
    return out;
  }

  async function ensureRole(guild, club, kind, multiClub) {
    const saved = club.autopilot?.trophy_roles?.[kind];
    const existing = saved ? guild.roles.cache.get(saved) || (await guild.roles.fetch(saved).catch(() => null)) : null;
    if (existing) return existing;
    const t = TROPHIES[kind];
    const role = await guild.roles.create({
      name: multiClub ? `${t.name} · ${club.name}`.slice(0, 100) : t.name,
      color: t.color,
      hoist: false,
      mentionable: false,
      reason: 'GafferBot stat trophy',
    });
    await autopilot.updateClub(guild.id, club.key, (ap) => {
      ap.trophy_roles = { ...(ap.trophy_roles || {}), [kind]: role.id };
    });
    return role;
  }

  // Hand roles to the holders and take them off everyone else. Returns changes for the announcement.
  async function sync(guildId, club) {
    const guild = client()?.guilds.cache.get(guildId);
    if (!guild) return { error: 'I am not in that server.' };
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) return { error: 'I need the **Manage Roles** permission to hand out trophies.' };
    const lockKey = `${guildId}|${club.key}`;
    if (running.has(lockKey)) return { busy: true };
    running.add(lockKey);
    try {
      const { holders, names } = await compute(guildId, club);
      const ids = await linkedIds([...new Set(Object.values(holders).flat())], names);
      const multiClub = activeClubs(await getGuildState(guildId)).length > 1;
      await guild.members.fetch().catch(() => null);
      const changes = [];
      for (const kind of Object.keys(TROPHIES)) {
        const role = await ensureRole(guild, club, kind, multiClub).catch((err) => ({ error: err.message }));
        if (role.error) return { error: `I couldn't create the ${TROPHIES[kind].name} role: ${role.error}` };
        if (role.position >= me.roles.highest.position)
          return { error: `Move my role above **${role.name}** in Server Settings → Roles so I can hand it out.` };
        const want = new Set(holders[kind].map((k) => ids.get(k)).filter((id) => id && guild.members.cache.has(id)));
        const gained = [];
        const lost = [];
        for (const member of role.members.values()) {
          if (!want.has(member.id)) {
            await member.roles.remove(role, 'GafferBot stat trophy').catch(() => {});
            lost.push(member.id);
          }
        }
        for (const id of want) {
          const member = guild.members.cache.get(id);
          if (member && !member.roles.cache.has(role.id)) {
            await member.roles.add(role, 'GafferBot stat trophy').catch(() => {});
            gained.push(id);
          }
        }
        if (gained.length || lost.length) changes.push({ kind, gained, lost });
      }
      return { changes, holders, names, ids };
    } finally {
      running.delete(lockKey);
    }
  }

  function changeLines(changes) {
    return changes.map(({ kind, gained, lost }) => {
      const t = TROPHIES[kind];
      if (kind === 'legend' && gained.length && !lost.length) return `${t.name}: welcome ${gained.map((id) => `<@${id}>`).join(', ')}`;
      if (gained.length && lost.length)
        return `${t.name}: ${gained.map((id) => `<@${id}>`).join(', ')} takes it from ${lost.map((id) => `<@${id}>`).join(', ')}`;
      if (gained.length) return `${t.name}: now held by ${gained.map((id) => `<@${id}>`).join(', ')}`;
      return `${t.name}: ${lost.map((id) => `<@${id}>`).join(', ')} lost it`;
    });
  }

  async function standingsEmbed(guildId, club, result) {
    const { holders, names, ids } = result;
    const prefs = await events.serverPrefs(guildId);
    const embed = new EmbedBuilder().setTitle(`🏆 ${club.name} stat trophies`).setColor(Number(prefs.branding?.color) || 0xf5b301);
    for (const [kind, t] of Object.entries(TROPHIES)) {
      const who = holders[kind].map((k) => (ids?.get(k) ? `<@${ids.get(k)}>` : `${names.get(k) || k} (not linked)`));
      embed.addFields({ name: t.name, value: `${who.length ? who.slice(0, 10).join(', ') : 'Nobody yet'}\n-# ${t.help}`, inline: true });
    }
    embed.setFooter({ text: 'Roles update after every synced match. Players need /me → Link EA to receive them.' });
    return embed;
  }

  async function handleTrophies(interaction) {
    await interaction.deferReply({ flags: 64 });
    if (!(await premium.gate(interaction, 'Stat trophies'))) return;
    const state = await getGuildState(interaction.guildId);
    const wanted = (interaction.options.getString('club') || '').trim().toLowerCase();
    const club =
      (wanted && activeClubs(state).find((c) => c.key === wanted || (c.name || '').toLowerCase() === wanted)) || resolveClub(state, interaction.member);
    if (!club) return interaction.editReply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.' });
    if (interaction.options.getBoolean('refresh')) {
      if (!(await canManageClub(interaction.member, club)))
        return interaction.editReply({ content: `❌ Only ${club.name}'s leaders can refresh the trophies.` });
      const result = await sync(interaction.guildId, club);
      if (result.error) return interaction.editReply({ content: `❌ ${result.error}` });
      if (result.busy) return interaction.editReply({ content: 'Already updating the trophies, try again in a moment.' });
      const lines = changeLines(result.changes);
      return interaction.editReply({
        content: lines.length ? lines.join('\n') : 'No changes: everyone already has the right roles.',
        embeds: [await standingsEmbed(interaction.guildId, club, result)],
        allowedMentions: { parse: [] },
      });
    }
    const computed = await compute(interaction.guildId, club);
    const ids = await linkedIds([...new Set(Object.values(computed.holders).flat())], computed.names);
    return interaction.editReply({ embeds: [await standingsEmbed(interaction.guildId, club, { ...computed, ids })], allowedMentions: { parse: [] } });
  }

  // After new matches land: move the roles and say who took what
  async function onNewMatches(guildId, club) {
    if (!autopilot.isOn(club, 'trophies') || !(await premium.isPremium(guildId))) return;
    const result = await sync(guildId, club);
    if (result.error) {
      console.warn(`[trophies] ${guildId}/${club.key}: ${result.error}`);
      return;
    }
    const lines = changeLines(result.changes || []);
    if (!lines.length) return;
    let channel = null;
    const hofId = club.autopilot?.hof_channel_id;
    if (hofId) channel = await client().guilds.cache.get(guildId)?.channels.fetch(hofId).catch(() => null);
    if (!channel) channel = await autopilot.postChannel(guildId, club);
    if (!channel) return;
    const embed = new EmbedBuilder().setTitle(`🏆 ${club.name} Hall of Fame`).setColor(0xf5b301).setDescription(lines.join('\n'));
    embed.setFooter({ text: 'Trophy roles update after every synced match. Players need /me → Link EA to receive them.' });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guildId || interaction.commandName !== 'premium') return false;
    if (interaction.options.getSubcommand(false) !== 'trophies') return false;
    await handleTrophies(interaction);
    return true;
  }

  autopilot.onNewMatches(onNewMatches);

  return { handleInteraction, sync, compute };
}

module.exports = { createStatRoles, TROPHIES_SUBCOMMAND, TROPHIES, trophyHolders };
