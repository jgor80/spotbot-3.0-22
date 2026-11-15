// Lobby EA club: which in-game Pro Clubs club a Social Hub lobby is playing on, and stats for only the
// games played in that lobby.
//   Set        Lobby club on the hub board (anyone in that lobby's voice channel, or a server admin):
//              type the club's name as it shows in game, pick it if EA finds several, or Clear. The
//              lobby shows the club on the board so people know whose club to join.
//   Windows    while a lobby with a club has 2+ people in its voice channel, the bot records a play
//              window (start, end and the EA gamertags of the people in voice). Stored on the lobby club
//              (lobby_windows, last 7 days), so the website's sync sees them too.
//   Stats      the lobby club is marked lobby_only: EA matches count only when they were played inside a
//              window, and when the window knew any gamertags, at least one of the match's players was in
//              voice. Games the club plays at other times (its owner's own sessions) are left out, and
//              the club's EA career and record stats are not copied into the lobby.
// Keep inLobbyWindow in step with supabase/functions/_shared/lobby-window.ts. Nothing here pings anyone.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { isServerAdmin } = require('./perm-check.cjs');

const NO_PINGS = { parse: [] };
const MIN_PLAYERS = 2; // people in voice for a window to count
const GAP_MS = 10 * 60 * 1000; // a window closes after 10 minutes under MIN_PLAYERS
const SLACK_MS = 20 * 60 * 1000; // EA stamps a match when it ends; allow a game that started before the window
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_WINDOWS = 60;
const SAVE_EVERY_MS = 3 * 60 * 1000;

// ---------- Pure ----------

const norm = (s) => String(s || '').trim().toLowerCase();

// The EA gamertags in one match for this club
function matchPlayerNames(match, eaClubId) {
  const players = match?.players?.[String(eaClubId)] || {};
  return Object.values(players).map((p) => norm(p?.playername || p?.name)).filter(Boolean);
}

// Was this match played in the lobby? Inside a window (with slack), and when the window knew any
// gamertags, one of them is in the match.
function inLobbyWindow(windows, match, eaClubId) {
  const at = Number(match?.timestamp || 0) * 1000;
  if (!at || !Array.isArray(windows)) return false;
  const names = matchPlayerNames(match, eaClubId);
  return windows.some((w) => {
    if (at < Number(w.from) - SLACK_MS || at > Number(w.to) + SLACK_MS) return false;
    const tags = (w.tags || []).map(norm);
    return !tags.length || names.some((n) => tags.includes(n));
  });
}

// Extend the latest window or open a new one; drop windows older than a week
function extendWindows(windows, now, tags) {
  const list = (Array.isArray(windows) ? windows : []).filter((w) => now - Number(w.to) < KEEP_MS);
  const last = list[list.length - 1];
  const clean = [...new Set((tags || []).map(norm).filter(Boolean))];
  if (last && now - Number(last.to) <= GAP_MS) {
    last.to = now;
    last.tags = [...new Set([...(last.tags || []), ...clean])].slice(0, 40);
  } else {
    list.push({ from: now, to: now, tags: clean.slice(0, 40) });
  }
  return list.slice(-MAX_WINDOWS);
}

// ---------- Module ----------

function createHubLobbyClub(deps) {
  const { supabase, getGuildState, saveGuildSettings, hubOf, searchClubs, startMonitoring, refreshBoard } = deps;
  const lastSave = new Map(); // guildId:clubKey -> ms

  async function lobbiesOf(guildId) {
    const [state, hub] = await Promise.all([getGuildState(guildId), hubOf(guildId)]);
    const clubs = (hub.lobbies || []).map((k) => (state?.clubs || []).find((c) => c.key === k && c.enabled)).filter(Boolean);
    return { state, hub, clubs };
  }

  const voiceOf = (guild, state, key) => {
    const id = state?.clubVcLinks?.[key];
    return id ? guild.channels.cache.get(id) : null;
  };

  const label = (club) => (club.ea_club_id ? `${club.ea_club_name || 'EA club'} (${club.ea_platform || '?'})` : null);

  // Line for the board under a lobby
  function boardLine(club) {
    return club?.ea_club_id && club.lobby_only ? `🏟️ Club: **${club.ea_club_name || 'EA club'}**` : null;
  }

  async function setClub(guildId, key, eaClub, platform) {
    const state = await getGuildState(guildId);
    const club = state?.clubs?.find((c) => c.key === key);
    if (!club) return null;
    if (eaClub) {
      Object.assign(club, {
        ea_club_id: String(eaClub.clubId ?? eaClub.id ?? ''),
        ea_club_name: eaClub.name || null,
        ea_platform: platform,
        ea_fc_version: deps.eaVersion?.() || null,
        monitoring_enabled: true,
        lobby_only: true,
        last_match_id: null,
        lobby_windows: [],
      });
    } else {
      for (const k of ['ea_club_id', 'ea_club_name', 'ea_platform', 'last_match_id']) club[k] = null;
      club.monitoring_enabled = false;
      club.lobby_windows = [];
    }
    await saveGuildSettings(guildId, state);
    if (eaClub) startMonitoring?.(guildId, key);
    return club;
  }

  // Every minute: record play windows for lobbies with a club and people in voice
  async function sample(guild) {
    const { state, hub, clubs } = await lobbiesOf(guild.id);
    if (!hub.on) return;
    let changed = false;
    for (const club of clubs.filter((c) => c.ea_club_id && c.lobby_only)) {
      const vc = voiceOf(guild, state, club.key);
      const ids = vc?.members ? [...vc.members.values()].filter((m) => !m.user?.bot).map((m) => m.id) : [];
      if (ids.length < MIN_PLAYERS) continue;
      const { data } = await supabase.from('profiles').select('ea_username').in('discord_user_id', ids);
      const tags = (data || []).map((p) => p.ea_username).filter(Boolean);
      const now = Date.now();
      const before = (club.lobby_windows || []).length;
      club.lobby_windows = extendWindows(club.lobby_windows, now, tags);
      const k = `${guild.id}:${club.key}`;
      if (club.lobby_windows.length !== before || now - (lastSave.get(k) || 0) >= SAVE_EVERY_MS) {
        lastSave.set(k, now);
        changed = true;
      }
    }
    if (changed) await saveGuildSettings(guild.id, state);
  }

  function start(client) {
    setInterval(() => {
      for (const guild of client.guilds.cache.values()) sample(guild).catch((err) => console.warn(`[lobby-club] sample failed: ${err.message}`));
    }, 60 * 1000).unref?.();
  }

  // ---------- Views ----------

  async function chooser(guild, member) {
    const { state, clubs } = await lobbiesOf(guild.id);
    if (!clubs.length) return { content: '❌ No lobbies here yet.', components: [] };
    const admin = isServerAdmin(member);
    const inside = clubs.filter((c) => voiceOf(guild, state, c.key)?.members?.has?.(member.id));
    const allowed = admin ? clubs : inside;
    if (!allowed.length) return { content: '🎧 Join a lobby\'s voice channel first, then set the club it\'s playing on.', components: [] };
    const lines = clubs.map((c) => `• **${c.name}**: ${label(c) || 'no club set'}`);
    return {
      content: ['🏟️ **Which in-game club is each lobby using?** Pick a lobby to set or clear its club. Only games played while people are in that lobby\'s voice count for its stats.', ...lines].join('\n'),
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('lc_lobby')
            .setPlaceholder('Pick a lobby')
            .addOptions(allowed.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: c.key, description: (label(c) || 'No club set').slice(0, 100) })))
        ),
      ],
    };
  }

  function lobbyCard(club) {
    return {
      content: `🏟️ **${club.name}**: ${label(club) ? `playing on **${label(club)}**` : 'no club set'}.`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`lc_set:${club.key}`).setLabel('Set club').setEmoji('✏️').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`lc_clear:${club.key}`).setLabel('Clear').setStyle(ButtonStyle.Secondary).setDisabled(!club.ea_club_id)
        ),
      ],
    };
  }

  async function mayEdit(guild, member, key) {
    if (isServerAdmin(member)) return true;
    const state = await getGuildState(guild.id);
    return Boolean(voiceOf(guild, state, key)?.members?.has?.(member.id));
  }

  // ---------- Interactions ----------

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('lc_') || !interaction.guildId) return false;
    const guild = interaction.guild;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;
    const [action, key] = id.split(':');

    if (action === 'lc_open' && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ ...(await chooser(guild, interaction.member)), allowedMentions: NO_PINGS });
      return true;
    }
    if (action === 'lc_lobby' && interaction.isStringSelectMenu?.()) {
      await interaction.deferUpdate();
      const { clubs } = await lobbiesOf(guild.id);
      const club = clubs.find((c) => c.key === interaction.values?.[0]);
      await interaction.editReply(club ? lobbyCard(club) : { content: '❌ That lobby is gone.', components: [] });
      return true;
    }
    if (action === 'lc_set' && interaction.isButton?.()) {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`lc_m:${key}`)
          .setTitle('Lobby club')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Club name, exactly as in game').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)))
      );
      return true;
    }
    if (!(await mayEdit(guild, interaction.member, key))) {
      await interaction.reply({ content: '🎧 Only people in this lobby\'s voice channel (or admins) can change its club.', flags: 64 });
      return true;
    }
    if (action === 'lc_m' && interaction.isModalSubmit?.()) {
      await interaction.deferUpdate();
      const name = interaction.fields.getTextInputValue('name').trim();
      const found = await searchClubs(name).catch(() => ({ exact: null, candidates: [] }));
      if (found.exact) {
        const club = await setClub(guild.id, key, found.exact.club, found.exact.platform);
        await interaction.editReply({ ...lobbyCard(club), content: `✅ **${club.name}** is now playing on **${label(club)}**. Games played while people are in its voice channel count for the lobby.` });
        refreshBoard?.(guild);
        return true;
      }
      const options = (found.candidates || []).slice(0, 25).map((c) => ({ label: String(c.club.name || name).slice(0, 100), value: `${c.platform}|${c.club.clubId}`.slice(0, 100), description: String(c.platform).slice(0, 100) }));
      if (!options.length) {
        await interaction.editReply({ content: `❌ EA has no FC27 club called **${name.slice(0, 40)}**. Check the spelling; EA only lists a club after its first league match.`, components: lobbyCard({ key, name: 'This lobby' }).components });
        return true;
      }
      await interaction.editReply({
        content: `🔎 EA found ${options.length === 1 ? 'one club' : `${options.length} clubs`} close to **${name.slice(0, 40)}**. Pick the right one:`,
        components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`lc_pick:${key}`).setPlaceholder('Pick the club').addOptions(options))],
      });
      PICKS.set(`${guild.id}:${key}`, found.candidates);
      return true;
    }
    if (action === 'lc_pick' && interaction.isStringSelectMenu?.()) {
      await interaction.deferUpdate();
      const [platform, clubId] = String(interaction.values?.[0] || '').split('|');
      const cand = (PICKS.get(`${guild.id}:${key}`) || []).find((c) => String(c.club.clubId) === clubId && c.platform === platform);
      const club = cand ? await setClub(guild.id, key, cand.club, cand.platform) : null;
      await interaction.editReply(club ? { ...lobbyCard(club), content: `✅ **${club.name}** is now playing on **${label(club)}**.` } : { content: '❌ That pick expired. Press Set club again.', components: [] });
      if (club) refreshBoard?.(guild);
      return true;
    }
    if (action === 'lc_clear' && interaction.isButton?.()) {
      await interaction.deferUpdate();
      const club = await setClub(guild.id, key, null);
      await interaction.editReply(club ? { ...lobbyCard(club), content: `✅ Cleared. **${club.name}** has no club set.` } : { content: '❌ That lobby is gone.', components: [] });
      refreshBoard?.(guild);
      return true;
    }
    return false;
  }

  const PICKS = new Map();

  return { handleInteraction, sample, start, setClub, boardLine, chooser };
}

module.exports = { createHubLobbyClub, inLobbyWindow, extendWindows, matchPlayerNames, MIN_PLAYERS, SLACK_MS, GAP_MS };
