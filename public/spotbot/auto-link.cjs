// Auto-linking: connects Discord members to their EA gamertag and club rosters with as little
// typing as possible.
//   - Joining a server: a player already linked anywhere is added to the rosters of the clubs they
//     have played for here and given their position roles. Unlinked players whose name looks like
//     a gamertag from this server's matches get a one-click "Is this you?" DM.
//   - Joining a voice channel: same "Is this you?" check, at most once a day per player.
//   - After matches: promptMatchPlayers() DMs the likely owner of each unlinked gamertag (never public buttons).
// Profiles are global, so a gamertag linked in one server works in every server.

const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');

const MATCH_SCAN = 60;
const NAME_MATCH = 0.8;
const AUTO_MATCH = 0.92;
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

function createAutoLink({ supabase, getGuildState, isManager }) {
  const namesCache = new Map(); // guildId -> { at, names: Map<key, {name, clubKey}> }
  const lastPrompt = new Map(); // `${guildId}:${userId}` -> ms
  const declinedPairs = new Map(); // guildId -> Set(`${userId}:${gamertagKey}`) undone by a manager
  const isManagerFn = async (m) => (isManager ? isManager(m) : m?.permissions?.has?.('ManageGuild'));

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

  // DM-only buttons, bound to the member they were sent to so nobody else can claim the gamertag
  function claimRow(guildId, gamertags, userId) {
    const buttons = gamertags.slice(0, 5).map((g) =>
      new ButtonBuilder().setCustomId(`alink:${guildId}:${userId}:${g}`.slice(0, 100)).setLabel(`I'm ${g}`.slice(0, 80)).setStyle(ButtonStyle.Success).setEmoji('🎮')
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
    await member.send({ embeds: [embed], components: [claimRow(member.guild.id, [match.name], member.id)] }).catch(() => {});
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

  // After a match: DM an "Is this you?" button to the best-matching unlinked member for each
  // unlinked gamertag. Nothing is posted in public channels.
  async function promptMatchPlayers(guild, gamertags) {
    const taken = await linkedNames(gamertags);
    const open = [...new Set(gamertags)].filter((g) => g && !taken.has(norm(g)));
    if (!open.length) return 0;
    const all = await unlinkedNames(guild.id);
    const cands = all.filter((c) => open.some((g) => norm(g) === norm(c.name)));
    if (!cands.length) return 0;
    const r = await bulkScan(guild, { autoThreshold: 2, prompt: false, only: new Set(cands.map((c) => norm(c.name))) });
    let sent = 0;
    for (const p of r.prompted) {
      const m = await guild.members.fetch(p.userId).catch(() => null);
      const c = cands.find((x) => norm(x.name) === norm(p.gamertag));
      if (m && c) { await promptMember(m, c); sent++; }
    }
    return sent;
  }

  // Discord IDs (of the given list) that already have a gamertag linked
  async function linkedMemberIds(ids) {
    const out = new Set();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from('profiles').select('discord_user_id, ea_username').in('discord_user_id', ids.slice(i, i + 100));
      for (const p of data || []) if (p.ea_username) out.add(p.discord_user_id);
    }
    return out;
  }

  // Declined pairs survive restarts: stored as rejected link_suggestions
  async function loadDeclined(guildId) {
    const set = new Set(declinedPairs.get(guildId) || []);
    const { data } = await supabase.from('link_suggestions').select('suggested_discord_id, ea_username').eq('guild_id', guildId).eq('status', 'rejected');
    for (const r of data || []) set.add(`${r.suggested_discord_id}:${norm(r.ea_username)}`);
    declinedPairs.set(guildId, set);
    return set;
  }

  // Reverse a wrong link: give the match history back to the placeholder profile so the real owner
  // gets it when they link, drop the roster spots it created, and never suggest the pair again.
  async function undoLink(guildId, userId, gamertag) {
    const tempId = `ea_${gamertag.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const key = norm(gamertag);
    const { data: matches } = await supabase.from('club_matches').select('ea_match_id, club_key, player_stats').eq('guild_id', guildId);
    const matchIds = [];
    const clubKeys = new Set();
    for (const m of matches || []) {
      const hit = (Array.isArray(m.player_stats) ? m.player_stats : []).some((p) => norm(p?.ea_username || p?.playername || p?.name) === key);
      if (!hit) continue;
      matchIds.push(m.ea_match_id);
      if (m.club_key) clubKeys.add(m.club_key);
    }
    await supabase.from('profiles').update({ ea_username: null }).eq('discord_user_id', userId);
    const { data: temp } = await supabase.from('profiles').select('discord_user_id').eq('discord_user_id', tempId).maybeSingle();
    if (!temp) await supabase.from('profiles').insert({ discord_user_id: tempId, ea_username: gamertag });
    for (let i = 0; i < matchIds.length; i += 100) {
      await supabase.from('player_stats').update({ discord_user_id: tempId }).eq('discord_user_id', userId).eq('guild_id', guildId).in('ea_match_id', matchIds.slice(i, i + 100));
    }
    const state = await getGuildState(guildId).catch(() => null);
    const teamIds = (Array.isArray(state?.clubs) ? state.clubs : []).filter((c) => c.team_id && clubKeys.has(c.key)).map((c) => c.team_id);
    if (teamIds.length) await supabase.from('team_rosters').delete().eq('discord_user_id', userId).in('team_id', teamIds);
    await supabase.from('link_suggestions').insert({ guild_id: guildId, temp_profile_id: tempId, ea_username: gamertag, suggested_discord_id: userId, similarity_score: 0, status: 'rejected', reviewed_at: new Date().toISOString() });
    if (!declinedPairs.has(guildId)) declinedPairs.set(guildId, new Set());
    declinedPairs.get(guildId).add(`${userId}:${key}`);
    namesCache.clear();
  }

  // Match every unlinked gamertag from this server's matches against every unlinked server member.
  // Strong matches are linked straight away; close ones get an "Is this you?" DM; the rest are
  // returned so a manager can pick the right member.
  async function bulkScan(guild, { autoThreshold = AUTO_MATCH, promptThreshold = NAME_MATCH, prompt = true, only = null } = {}) {
    const result = { linked: [], prompted: [], unmatched: [] };
    const open = (await unlinkedNames(guild.id)).filter((c) => !only || only.has(norm(c.name)));
    if (!open.length) return result;
    const members = [...(await guild.members.fetch().catch(() => guild.members.cache)).values()].filter((m) => !m.user?.bot);
    const linkedIds = await linkedMemberIds(members.map((m) => m.id));
    const free = members.filter((m) => !linkedIds.has(m.id));
    const declined = await loadDeclined(guild.id);
    const used = new Set();
    // Best pairs first so two gamertags never grab the same member
    const pairs = [];
    for (const c of open) {
      for (const m of free) {
        if (declined.has(`${m.id}:${norm(c.name)}`)) continue;
        const labels = [m.displayName, m.nickname, m.user?.username, m.user?.globalName].filter(Boolean);
        const score = Math.max(...labels.map((l) => similarity(l, c.name)));
        if (score >= promptThreshold) pairs.push({ c, m, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const done = new Set();
    for (const { c, m, score } of pairs) {
      const key = norm(c.name);
      if (done.has(key) || used.has(m.id)) continue;
      done.add(key);
      used.add(m.id);
      if (score >= autoThreshold) {
        const r = await link(m.id, c.name, null);
        if (!r.ok) continue;
        await addToRosters(guild.id, m.id, c.clubKeys).catch(() => {});
        await applyPositionRoles(m).catch(() => {});
        result.linked.push({ gamertag: c.name, userId: m.id });
        console.log(`[auto-link] bulk: ${m.user.username} -> ${c.name} (${score.toFixed(2)})`);
      } else {
        if (prompt) await promptMember(m, c);
        result.prompted.push({ gamertag: c.name, userId: m.id });
      }
    }
    result.unmatched = open.filter((c) => !done.has(norm(c.name))).map((c) => c.name);
    return result;
  }

  // Manager-facing summary with undo buttons and member pickers for gamertags with no match
  function scanReport(guildId, result) {
    const lines = [
      `✅ **Linked (${result.linked.length})**`,
      ...result.linked.map((l) => `• ${l.gamertag} → <@${l.userId}>`),
      `\n📩 **Asked to confirm (${result.prompted.length})**`,
      ...result.prompted.map((p) => `• ${p.gamertag} → <@${p.userId}>?`),
      `\n❓ **No match (${result.unmatched.length})**`,
      ...result.unmatched.map((u) => `• ${u}`)
    ];
    const embed = new EmbedBuilder().setTitle('🔗 Auto-link results').setColor(0x22c55e).setDescription(lines.join('\n').slice(0, 4000));
    const components = [];
    const undo = result.linked.slice(0, 5).map((l) =>
      new ButtonBuilder().setCustomId(`alink-undo:${guildId}:${l.userId}`.slice(0, 100)).setLabel(`Undo ${l.gamertag}`.slice(0, 80)).setStyle(ButtonStyle.Secondary)
    );
    if (undo.length) components.push(new ActionRowBuilder().addComponents(undo));
    for (const g of result.unmatched.slice(0, 5 - components.length)) {
      components.push(new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId(`alink-pick:${guildId}:${g}`.slice(0, 100)).setPlaceholder(`Who is ${g}?`.slice(0, 150)).setMaxValues(1)
      ));
    }
    return { embeds: [embed], components };
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (interaction.isUserSelectMenu?.() && id.startsWith('alink-pick:')) {
      if (!(await isManagerFn(interaction.member))) {
        await interaction.reply({ content: '❌ Managers only.', flags: 64 });
        return true;
      }
      const [, guildId, ...rest] = id.split(':');
      const gamertag = rest.join(':');
      const userId = interaction.values[0];
      const r = await link(userId, gamertag, null);
      if (!r.ok) {
        await interaction.reply({ content: `❌ ${r.reason}`, flags: 64 });
        return true;
      }
      const names = await recentNames(guildId);
      await addToRosters(guildId, userId, names.get(norm(gamertag))?.clubKeys || new Set()).catch(() => {});
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) await applyPositionRoles(member).catch(() => {});
      await interaction.reply({ content: `✅ Linked **${gamertag}** to <@${userId}>.`, flags: 64 });
      return true;
    }
    if (interaction.isButton?.() && id.startsWith('alink-undo:')) {
      if (!(await isManagerFn(interaction.member))) {
        await interaction.reply({ content: '❌ Managers only.', flags: 64 });
        return true;
      }
      const [, guildId, userId] = id.split(':');
      const profile = await profileFor(userId);
      if (profile?.ea_username) await undoLink(guildId, userId, profile.ea_username);
      await interaction.reply({ content: `↩️ Unlinked <@${userId}>${profile?.ea_username ? ` from **${profile.ea_username}**` : ''}.`, flags: 64 });
      return true;
    }
    if (!interaction.isButton?.() || !id.startsWith('alink:')) return false;
    // Only from the DM it was sent in, and only by the member it was sent to (old public recap
    // buttons have no member ID and are refused)
    const parts = id.split(':');
    const guildId = parts[1];
    const boundTo = /^\d{15,25}$/.test(parts[2] || '') ? parts[2] : null;
    const gamertag = parts.slice(boundTo ? 3 : 2).join(':');
    if (interaction.guildId || !boundTo || boundTo !== interaction.user.id) {
      await interaction.reply({ content: "🔒 Linking buttons only work from the DM the bot sent you. If this gamertag is yours, ask a manager or use **/me → Link EA**.", flags: 64 });
      return true;
    }
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

  // DM a one-time link to members so they can confirm gamertag + platform and connect the website.
  // By default only members with no gamertag yet; everyone=true re-asks the whole server.
  async function sendInvites(guild, { everyone = false, baseUrl } = {}) {
    const site = (baseUrl || process.env.DASHBOARD_URL || 'https://gafferbot.app').replace(/\/$/, '');
    const members = [...(await guild.members.fetch().catch(() => guild.members.cache)).values()].filter((m) => !m.user?.bot);
    const linked = everyone ? new Set() : await linkedMemberIds(members.map((m) => m.id));
    const targets = members.filter((m) => !linked.has(m.id));
    const out = { sent: 0, failed: 0, skipped: members.length - targets.length };
    for (const m of targets) {
      const token = crypto.randomBytes(24).toString('base64url');
      const { error } = await supabase.from('link_invites').insert({ token, discord_user_id: m.id, discord_username: m.user.username, guild_id: guild.id });
      if (error) { out.failed++; continue; }
      const embed = new EmbedBuilder()
        .setTitle('🔗 Link your accounts')
        .setColor(0x22c55e)
        .setDescription(`**${guild.name}** uses GafferBot for lineups and stats. Tap the button and confirm your EA gamertag and platform. It takes 20 seconds.\n\nThis link is just for you and expires in 7 days.`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Link my accounts').setURL(`${site}/link/${token}`));
      const ok = await m.send({ embeds: [embed], components: [row] }).then(() => true).catch(() => false);
      ok ? out.sent++ : out.failed++;
      await new Promise((r) => setTimeout(r, 1200)); // stay well under Discord's DM rate limits
    }
    return out;
  }

  return { onMemberJoin, onVoiceJoin, promptMatchPlayers, handleInteraction, link, similarity, bulkScan, scanReport, sendInvites };
}

module.exports = { createAutoLink, similarity };
