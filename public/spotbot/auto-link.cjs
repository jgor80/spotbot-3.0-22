// Auto-linking: connects Discord members to their EA gamertag and club rosters with as little
// typing as possible.
//   - Joining a server: a player already linked anywhere is added to the rosters of the clubs they
//     have played for here and given their position roles. Unlinked players whose name looks like
//     a gamertag from this server's matches get a one-click "Is this you?" DM.
//   - Joining a voice channel: same "Is this you?" check, at most once a day per player.
//   - Match recaps: claimButtons() adds "That's me" buttons for unlinked gamertags in a match.
// Profiles are global, so a gamertag linked in one server works in every server.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const MATCH_SCAN = 60;
const NAME_MATCH = 0.8;
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const POSITION_ROLES = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

// 0..1 similarity; also counts "AirDangus" vs "AirDangus23" (one name contains the other) as strong
function similarity(a, b) {
  a = norm(a);
  b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) return 0.9 * (shorter.length / longer.length) + 0.1;
  const A = bigrams(a);
  const B = bigrams(b);
  let hit = 0;
  for (const [g, n] of A) hit += Math.min(n, B.get(g) || 0);
  return (2 * hit) / Math.max(1, a.length - 1 + b.length - 1);
}

function createAutoLink({ supabase, getGuildState }) {
  const namesCache = new Map(); // guildId -> { at, names: Map<key, {name, clubKey}> }
  const lastPrompt = new Map(); // `${guildId}:${userId}` -> ms

  // Gamertags seen in this server's recent matches, with the club they played for
  async function recentNames(guildId) {
    const hit = namesCache.get(guildId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.names;
    const { data } = await supabase
      .from('club_matches')
      .select('club_key, player_stats')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(MATCH_SCAN);
    const names = new Map();
    for (const row of data || []) {
      for (const p of Array.isArray(row.player_stats) ? row.player_stats : []) {
        const name = p?.ea_username || p?.playername || p?.name;
        if (!name) continue;
        const key = norm(name);
        if (!names.has(key)) names.set(key, { name, clubKeys: new Set() });
        if (row.club_key) names.get(key).clubKeys.add(row.club_key);
      }
    }
    namesCache.set(guildId, { at: Date.now(), names });
    return names;
  }

  async function profileFor(userId) {
    const { data } = await supabase.from('profiles').select('discord_user_id, ea_username, ea_platform').eq('discord_user_id', userId).maybeSingle();
    return data;
  }

  async function linkedNames(names) {
    if (!names.length) return new Set();
    const { data } = await supabase.from('profiles').select('ea_username, discord_user_id').in('ea_username', names);
    return new Set((data || []).filter((p) => !String(p.discord_user_id).startsWith('ea_')).map((p) => norm(p.ea_username)));
  }

  async function unlinkedNames(guildId) {
    const names = await recentNames(guildId);
    const taken = await linkedNames([...names.values()].map((n) => n.name));
    return [...names.entries()].filter(([k]) => !taken.has(k)).map(([, v]) => v);
  }

  function bestMatch(member, candidates) {
    const labels = [member.displayName, member.nickname, member.user?.username, member.user?.globalName].filter(Boolean);
    let best = null;
    for (const c of candidates) {
      const score = Math.max(...labels.map((l) => similarity(l, c.name)));
      if (score >= NAME_MATCH && (!best || score > best.score)) best = { ...c, score };
    }
    return best;
  }

  // Link a Discord user to a gamertag; moves stats saved under a placeholder profile
  async function link(userId, gamertag, platform) {
    const { data: owner } = await supabase.from('profiles').select('discord_user_id').ilike('ea_username', gamertag).neq('discord_user_id', userId);
    const realOwner = (owner || []).find((p) => !String(p.discord_user_id).startsWith('ea_'));
    if (realOwner) return { ok: false, reason: 'That gamertag is already linked to another member. A manager can move it with /forcelink.' };

    const existing = await profileFor(userId);
    const fields = { ea_username: gamertag, ...(platform ? { ea_platform: platform } : {}) };
    const { error } = existing
      ? await supabase.from('profiles').update(fields).eq('discord_user_id', userId)
      : await supabase.from('profiles').insert({ discord_user_id: userId, ...fields });
    if (error) return { ok: false, reason: error.message };

    const tempId = `ea_${gamertag.replace(/[^a-zA-Z0-9]/g, '_')}`;
    for (const p of owner || []) {
      if (p.discord_user_id !== tempId) continue;
      await supabase.from('player_stats').update({ discord_user_id: userId }).eq('discord_user_id', tempId);
      await supabase.from('profiles').delete().eq('discord_user_id', tempId);
    }
    namesCache.clear();
    return { ok: true };
  }

  async function addToRosters(guildId, userId, clubKeys) {
    const state = await getGuildState(guildId).catch(() => null);
    const clubs = Array.isArray(state?.clubs) ? state.clubs : [];
    const teamIds = clubs.filter((c) => c.team_id && (!clubKeys.size || clubKeys.has(c.key))).map((c) => c.team_id);
    if (!teamIds.length) return 0;
    const { data: have } = await supabase.from('team_rosters').select('team_id').eq('discord_user_id', userId).in('team_id', teamIds);
    const missing = teamIds.filter((t) => !(have || []).some((h) => h.team_id === t));
    if (missing.length) await supabase.from('team_rosters').insert(missing.map((team_id) => ({ team_id, discord_user_id: userId, role: 'player', status: 'active' })));
    return missing.length;
  }

  // Position roles from the player's saved preferences in any server
  async function applyPositionRoles(member) {
    const { data } = await supabase.from('position_preferences').select('preferences, updated_at').eq('user_id', member.id).order('updated_at', { ascending: false }).limit(1);
    const prefs = data?.[0]?.preferences;
    const list = (Array.isArray(prefs) ? prefs : Object.values(prefs || {})).map((p) => String(p?.position || p).toUpperCase()).filter((p) => POSITION_ROLES.includes(p)).slice(0, 2);
    const roles = list.map((p) => member.guild.roles.cache.find((r) => r.name.toUpperCase() === p)).filter((r) => r && r.editable);
    if (roles.length) await member.roles.add(roles).catch(() => {});
    return roles.map((r) => r.name);
  }

  function claimRow(guildId, gamertags) {
    const buttons = gamertags.slice(0, 5).map((g) =>
      new ButtonBuilder().setCustomId(`alink:${guildId}:${g}`.slice(0, 100)).setLabel(`I'm ${g}`.slice(0, 80)).setStyle(ButtonStyle.Success).setEmoji('🎮')
    );
    return buttons.length ? new ActionRowBuilder().addComponents(buttons) : null;
  }

  async function promptMember(member, match) {
    const k = `${member.guild.id}:${member.id}`;
    if (Date.now() - (lastPrompt.get(k) || 0) < PROMPT_COOLDOWN_MS) return;
    lastPrompt.set(k, Date.now());
    const embed = new EmbedBuilder()
      .setTitle('🎮 Is this you?')
      .setColor(0x22c55e)
      .setDescription(`**${match.name}** played for a club in **${member.guild.name}**. If that's you, press the button and your stats will count straight away.`);
    await member.send({ embeds: [embed], components: [claimRow(member.guild.id, [match.name])] }).catch(() => {});
  }

  async function onMemberJoin(member) {
    if (member.user?.bot) return false;
    const profile = await profileFor(member.id);
    if (profile?.ea_username) {
      const names = await recentNames(member.guild.id);
      const clubKeys = names.get(norm(profile.ea_username))?.clubKeys || new Set();
      const added = clubKeys.size ? await addToRosters(member.guild.id, member.id, clubKeys) : 0;
      const roles = await applyPositionRoles(member);
      console.log(`[auto-link] ${member.user.username} recognised as ${profile.ea_username}: ${added} roster(s), roles ${roles.join(',') || 'none'}`);
      return true;
    }
    const match = bestMatch(member, await unlinkedNames(member.guild.id));
    if (match) {
      await promptMember(member, match);
      return true;
    }
    return false;
  }

  async function onVoiceJoin(member) {
    if (!member || member.user?.bot) return;
    const k = `${member.guild.id}:${member.id}`;
    if (Date.now() - (lastPrompt.get(k) || 0) < PROMPT_COOLDOWN_MS) return;
    const profile = await profileFor(member.id);
    if (profile?.ea_username) return;
    const match = bestMatch(member, await unlinkedNames(member.guild.id));
    if (match) await promptMember(member, match);
    else lastPrompt.set(k, Date.now());
  }

  // "That's me" buttons for the unlinked gamertags in a match (for recaps)
  async function claimButtons(guildId, gamertags) {
    const taken = await linkedNames(gamertags);
    const open = [...new Set(gamertags)].filter((g) => g && !taken.has(norm(g)));
    const row = claimRow(guildId, open);
    return row ? [row] : [];
  }

  async function handleInteraction(interaction) {
    if (!interaction.isButton?.() || !interaction.customId.startsWith('alink:')) return false;
    const [, guildId, ...rest] = interaction.customId.split(':');
    const gamertag = rest.join(':');
    const result = await link(interaction.user.id, gamertag, null);
    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.reason}`, flags: 64 });
      return true;
    }
    const names = await recentNames(guildId);
    await addToRosters(guildId, interaction.user.id, names.get(norm(gamertag))?.clubKeys || new Set()).catch(() => {});
    await interaction.reply({ content: `✅ Linked to **${gamertag}**. Your stats now count in every server that uses the bot.`, flags: 64 });
    return true;
  }

  return { onMemberJoin, onVoiceJoin, claimButtons, handleInteraction, link, similarity };
}

module.exports = { createAutoLink, similarity };
