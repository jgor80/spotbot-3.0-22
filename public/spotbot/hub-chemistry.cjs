// Hub chemistry: who works well with whom on a Social Hub server, and squads built from it.
//   Pairs     every two players who share a lobby or team voice channel (minutes together), a game
//             (Next game in a lobby, or an EA match) and, for EA matches, the result. Stored in
//             hub_pairs with a 0-100 chemistry score: win rate together (pulled toward 50% until
//             there are enough results) and how much they've played together.
//   Chemistry the board's Chemistry button: your best partners, people worth trying (active players
//             you haven't played with who cover a different line), and the server's best duos.
//   Squads    Build a squad picks a 6 (smalls) or 11 around you: best chemistry with the players
//             already in, plus covering every line (GK, defence, midfield, attack). Start this team
//             makes it a team (social-hub createTeam) and sends each picked player one DM invite
//             with a Join button. Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const PURPLE = 0x9b59b6;
const NO_PINGS = { parse: [] };
const ACTIVE_DAYS = 14;
const SQUAD_TTL_MS = 15 * 60 * 1000;
const LINES = ['GK', 'DEF', 'MID', 'ATT'];
const LINE_OF = {
  GK: 'GK', LB: 'DEF', CB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', CF: 'ATT', ST: 'ATT',
};
// How many of each line a squad wants
const SHAPE = { 6: { GK: 1, DEF: 2, MID: 2, ATT: 1 }, 11: { GK: 1, DEF: 4, MID: 3, ATT: 3 } };
const UNKNOWN_CHEM = 40;

// ---------- Pure ----------

const pairKey = (a, b) => (a < b ? [a, b] : [b, a]);

// Every pair in a group of players
function pairsOf(ids) {
  const list = [...new Set(ids)].sort();
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
  return out;
}

// 0-100: win rate together (smoothed toward 50%) and how much they've played together
function chemistryScore(p) {
  const rated = p.rated_games || 0;
  const together = (2 * (p.wins || 0) + 1) / (2 * rated + 2);
  const familiarity = Math.min(1, ((p.games || 0) + (p.minutes || 0) / 45) / 15);
  return Math.round(100 * (0.65 * together + 0.35 * familiarity));
}

function chemLabel(score) {
  if (score >= 70) return '🔥';
  if (score >= 55) return '✅';
  return '🤝';
}

// Add one group's time, game and result to the pair rows (a Map of "a:b" -> row)
function addGroup(rows, guildId, group, now = new Date()) {
  for (const [a, b] of pairsOf(group.ids)) {
    const key = `${a}:${b}`;
    const r = rows.get(key) || { guild_id: guildId, user_a: a, user_b: b, games: 0, rated_games: 0, wins: 0, minutes: 0 };
    r.games += group.games || 0;
    r.minutes += group.minutes || 0;
    if (group.result) {
      r.rated_games += 1;
      if (group.result === 'win') r.wins += 1;
    }
    r.score = chemistryScore(r);
    r.last_at = now.toISOString();
    rows.set(key, r);
  }
  return rows;
}

const linesOf = (prefs) => [...new Set((prefs || []).map((p) => LINE_OF[String(p).toUpperCase()]).filter(Boolean))];

// Pick a squad around the captain: each pick is the player with the best average chemistry with the
// squad so far, with a big bonus for filling a line the squad still needs (by their main position)
function buildSquad(captain, candidates, size, chemOf, prefsOf) {
  const shape = SHAPE[size] || SHAPE[6];
  const need = { ...shape };
  const squad = [{ id: captain, line: linesOf(prefsOf(captain))[0] || null }];
  if (squad[0].line && need[squad[0].line] > 0) need[squad[0].line] -= 1;
  const pool = new Set(candidates.filter((id) => id !== captain));
  while (squad.length < size && pool.size) {
    let best = null;
    for (const id of pool) {
      const lines = linesOf(prefsOf(id));
      const fills = lines.find((l) => need[l] > 0) || null;
      const avg = squad.reduce((n, s) => n + (chemOf(s.id, id) ?? UNKNOWN_CHEM), 0) / squad.length;
      const value = avg + (fills ? (lines[0] === fills ? 40 : 25) : lines.length ? 0 : 10);
      if (!best || value > best.value) best = { id, value, line: fills || lines[0] || null, avg };
    }
    pool.delete(best.id);
    if (best.line && need[best.line] > 0) need[best.line] -= 1;
    squad.push({ id: best.id, line: best.line, chem: Math.round(best.avg) });
  }
  return { squad, missing: LINES.filter((l) => need[l] > 0).map((l) => `${need[l]} ${l}`) };
}

// Average chemistry of a squad across every pair that has played together
function squadChemistry(ids, chemOf) {
  const known = pairsOf(ids).map(([a, b]) => chemOf(a, b)).filter((x) => x != null);
  return known.length ? Math.round(known.reduce((n, x) => n + x, 0) / known.length) : null;
}

function createHubChemistry(deps) {
  const { supabase, hubOf, getUserPrefs } = deps;
  const client = () => deps.client();
  const socialHub = () => deps.socialHub();
  const locks = new Map();
  const squads = new Map(); // `${guildId}:${userId}` -> { ids, size, at }

  function locked(guildId, fn) {
    const prev = locks.get(guildId) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(guildId, next.catch(() => {}));
    return next;
  }

  // groups: [{ ids, games, minutes, result }]
  function record(guildId, groups) {
    const useful = (groups || []).filter((g) => new Set(g.ids).size >= 2);
    if (!useful.length) return Promise.resolve(0);
    return locked(guildId, async () => {
      const ids = [...new Set(useful.flatMap((g) => g.ids))];
      const { data, error } = await supabase.from('hub_pairs').select('*').eq('guild_id', guildId).in('user_a', ids).in('user_b', ids);
      if (error) throw new Error(error.message);
      const rows = new Map((data || []).map((r) => [`${r.user_a}:${r.user_b}`, r]));
      const before = new Set(rows.keys());
      const touched = new Set();
      for (const g of useful) {
        addGroup(rows, guildId, g);
        for (const [a, b] of pairsOf(g.ids)) touched.add(`${a}:${b}`);
      }
      const out = [...touched].map((k) => rows.get(k));
      for (let i = 0; i < out.length; i += 500) {
        const { error: e } = await supabase.from('hub_pairs').upsert(out.slice(i, i + 500), { onConflict: 'guild_id,user_a,user_b' });
        if (e) throw new Error(e.message);
      }
      return out.filter((r) => !before.has(`${r.user_a}:${r.user_b}`)).length;
    });
  }

  // ---------- Reads ----------

  async function pairsFor(guildId, userId) {
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from('hub_pairs').select('*').eq('guild_id', guildId).eq('user_a', userId),
      supabase.from('hub_pairs').select('*').eq('guild_id', guildId).eq('user_b', userId),
    ]);
    return [...(a || []), ...(b || [])].map((r) => ({ ...r, other: r.user_a === userId ? r.user_b : r.user_a }));
  }

  async function bestDuos(guildId, limit = 5) {
    const { data } = await supabase.from('hub_pairs').select('*').eq('guild_id', guildId).gte('games', 3).order('score', { ascending: false }).limit(limit);
    return data || [];
  }

  async function activePlayers(guildId) {
    const since = new Date(Date.now() - ACTIVE_DAYS * 86400000).toISOString();
    const { data } = await supabase.from('hub_players').select('discord_user_id').eq('guild_id', guildId).gte('updated_at', since).order('xp', { ascending: false }).limit(200);
    return (data || []).map((r) => r.discord_user_id);
  }

  async function prefsMap(guildId, ids) {
    const out = new Map();
    await Promise.all(ids.map(async (id) => out.set(id, ((await getUserPrefs?.(guildId, id).catch(() => [])) || []).map((p) => String(p).toUpperCase()))));
    return out;
  }

  // People worth trying: active, not played with yet, covering a line you don't
  function freshFaces(me, myPrefs, active, playedWith, prefs, limit = 3) {
    const mine = new Set(linesOf(myPrefs));
    return active
      .filter((id) => id !== me && !playedWith.has(id))
      .map((id) => ({ id, lines: linesOf(prefs.get(id)) }))
      .sort((a, b) => (b.lines.some((l) => !mine.has(l)) ? 1 : 0) - (a.lines.some((l) => !mine.has(l)) ? 1 : 0))
      .slice(0, limit);
  }

  // ---------- Views ----------

  const partnerLine = (p) => `${chemLabel(p.score)} <@${p.other}> · **${p.score}** · ${p.games} games${p.rated_games ? ` · won ${Math.round((100 * p.wins) / p.rated_games)}% of ${p.rated_games}` : ''}${p.minutes >= 60 ? ` · ${Math.round(p.minutes / 60)}h together` : ''}`;

  async function chemistryCard(guildId, userId) {
    const [mine, duos, active] = await Promise.all([pairsFor(guildId, userId), bestDuos(guildId), activePlayers(guildId)]);
    const top = mine.sort((a, b) => b.score - a.score).slice(0, 6);
    const prefs = await prefsMap(guildId, [userId, ...active.slice(0, 60)]);
    const fresh = freshFaces(userId, prefs.get(userId), active, new Set(mine.map((p) => p.other)), prefs);
    const embed = new EmbedBuilder()
      .setTitle('🧪 Chemistry')
      .setColor(PURPLE)
      .setDescription('Who works well together, from time in voice, games played together and results. 🔥 great · ✅ good · 🤝 getting there')
      .addFields(
        { name: 'Your best partners', value: top.map(partnerLine).join('\n').slice(0, 1024) || 'Play a few games in the lobbies and your partners show up here.' },
        { name: 'Try playing with', value: fresh.map((f) => `🆕 <@${f.id}>${f.lines.length ? ` · ${f.lines.join('/')}` : ''}`).join('\n') || 'You\'ve played with everyone who\'s been on lately!' },
        { name: 'Best duos on the server', value: duos.map((d) => `${chemLabel(d.score)} <@${d.user_a}> + <@${d.user_b}> · **${d.score}** · ${d.games} games`).join('\n').slice(0, 1024) || 'Not enough games yet.' }
      )
      .setFooter({ text: 'Build a squad picks players with the best chemistry with you and each other, covering every line.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ch_squad:6').setLabel('Build a squad of 6').setEmoji('🧩').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ch_squad:11').setLabel('Build an XI').setEmoji('🧩').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row], allowedMentions: NO_PINGS };
  }

  async function squadCard(guildId, userId, size) {
    const [mine, active] = await Promise.all([pairsFor(guildId, userId), activePlayers(guildId)]);
    const candidates = [...new Set([...mine.sort((a, b) => b.score - a.score).map((p) => p.other), ...active])].slice(0, 60);
    const prefs = await prefsMap(guildId, [userId, ...candidates]);
    // Chemistry between any two candidates
    const { data } = candidates.length
      ? await supabase.from('hub_pairs').select('user_a, user_b, score').eq('guild_id', guildId).in('user_a', [userId, ...candidates]).in('user_b', [userId, ...candidates])
      : { data: [] };
    const chem = new Map((data || []).map((r) => [`${r.user_a}:${r.user_b}`, r.score]));
    const chemOf = (a, b) => chem.get(pairKey(a, b).join(':')) ?? null;
    const { squad, missing } = buildSquad(userId, candidates, size, chemOf, (id) => prefs.get(id));
    squads.set(`${guildId}:${userId}`, { ids: squad.map((s) => s.id), size, at: Date.now() });
    const overall = squadChemistry(squad.map((s) => s.id), chemOf);
    const embed = new EmbedBuilder()
      .setTitle(`🧩 Your ${size === 11 ? 'XI' : 'squad of 6'}`)
      .setColor(PURPLE)
      .setDescription(
        [
          overall != null ? `Squad chemistry **${overall}** ${chemLabel(overall)}` : 'Nobody here has played together yet, so this squad is picked for positions.',
          squad.map((s, i) => `${i === 0 ? '👑' : s.chem != null && s.chem > UNKNOWN_CHEM ? chemLabel(s.chem) : '🆕'} <@${s.id}>${s.line ? ` · ${s.line}` : ''}`).join('\n'),
          squad.length < size ? `Only ${squad.length} active players to pick from right now.` : null,
          missing.length ? `Still short of: ${missing.join(', ')}` : null,
        ].filter(Boolean).join('\n\n')
      )
      .setFooter({ text: 'Start this team makes it a team with you as captain and sends each player a one-time invite.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ch_start`).setLabel('Start this team').setEmoji('🛡️').setStyle(ButtonStyle.Success).setDisabled(squad.length < 2),
      new ButtonBuilder().setCustomId(`ch_squad:${size}`).setLabel('Pick again').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ch_me').setLabel('Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row], allowedMentions: NO_PINGS };
  }

  function teamModal() {
    return new ModalBuilder()
      .setCustomId('ch_team_m')
      .setTitle('Start this team')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Team name').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(40).setRequired(true)));
  }

  // One DM per picked player, with a Join button that works from DMs
  async function invite(guild, club, captainId, ids) {
    let sent = 0;
    for (const id of ids.filter((x) => x !== captainId).slice(0, 10)) {
      const user = await client()?.users.fetch(id).catch(() => null);
      if (!user) continue;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ch_inv:${guild.id}:${club.key}`).setLabel(`Join ${club.name}`.slice(0, 80)).setEmoji('✅').setStyle(ButtonStyle.Success)
      );
      const ok = await user
        .send({ content: `🛡️ <@${captainId}> started **${club.name}** in **${guild.name}** and picked you: you have great chemistry together. Press **Join** to get the team role, or ignore this.`, components: [row], allowedMentions: NO_PINGS })
        .then(() => true)
        .catch(() => false);
      if (ok) sent += 1;
    }
    return sent;
  }

  // ---------- Interactions ----------

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('ch_')) return false;

    // DM invite: works without a server context
    if (interaction.isButton?.() && id.startsWith('ch_inv:')) {
      const [, guildId, clubKey] = id.split(':');
      const guild = client()?.guilds.cache.get(guildId);
      if (!guild) return interaction.reply({ content: '❌ I\'m not on that server any more.' }).then(() => true);
      const r = await socialHub().joinTeam(guild, interaction.user.id, clubKey);
      await interaction.reply({ content: r, ...(interaction.guildId ? { flags: 64 } : {}) });
      return true;
    }
    if (!interaction.guildId) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;

    if (interaction.isModalSubmit?.() && id === 'ch_team_m') {
      await interaction.deferReply({ flags: 64 });
      const picked = squads.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!picked || Date.now() - picked.at > SQUAD_TTL_MS) return interaction.editReply({ content: '⏱️ That squad expired. Press **Build a squad** again.' }).then(() => true);
      const r = await socialHub().createTeam(interaction.guild, interaction.member, interaction.fields.getTextInputValue('name')).catch((err) => ({ error: err.message }));
      if (r.error) return interaction.editReply({ content: `❌ ${r.error}` }).then(() => true);
      squads.delete(`${interaction.guildId}:${interaction.user.id}`);
      const sent = await invite(interaction.guild, r.club, interaction.user.id, picked.ids);
      await interaction.editReply({
        content: `🛡️ **${r.club.name}** is set up and you're its captain. Team chat: <#${r.chat.id}> · your desk: <#${r.desk.id}>. I sent ${sent} invite${sent === 1 ? '' : 's'} to your picks; anyone else can join with the button in team chat.`,
      });
      return true;
    }
    if (!interaction.isButton?.()) return false;
    if (id === 'ch_me') {
      const fromCard = interaction.message?.flags?.has?.(64);
      if (fromCard) await interaction.deferUpdate();
      else await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await chemistryCard(interaction.guildId, interaction.user.id));
      return true;
    }
    if (id.startsWith('ch_squad:')) {
      await interaction.deferUpdate();
      await interaction.editReply(await squadCard(interaction.guildId, interaction.user.id, Number(id.split(':')[1]) === 11 ? 11 : 6));
      return true;
    }
    if (id === 'ch_start') {
      await interaction.showModal(teamModal());
      return true;
    }
    return false;
  }

  return { record, handleInteraction, chemistryCard, squadCard, pairsFor, bestDuos, invite };
}

module.exports = { createHubChemistry, pairsOf, chemistryScore, chemLabel, addGroup, buildSquad, squadChemistry, linesOf, SHAPE };
