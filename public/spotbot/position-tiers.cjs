// Position tiers: every player has one primary position (the one they play in comp matches), up to
// three secondary positions (ones they play well) and up to three emergency positions (ones they
// can fill in a pinch). Stored per server in player_positions.
//
// Discord roles: the primary is the main position role ("ST", hoisted and coloured when the bot
// creates it); secondaries get a quiet role ("ST (2nd)": no colour, not hoisted, not mentionable,
// below the main roles). Emergency positions are never roles; they show on sub requests, free agent
// listings and profiles. Lineups and team sheets keep reading the roster's primary_position, which
// the bot keeps in step with the primary here.

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
// Positions offered on the pickers (and the only ones with Discord roles)
const ROLE_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const MAX_SECONDARY = 3;
const MAX_EMERGENCY = 3;
const TIERS = ['primary', 'secondary', 'emergency'];
const TIER_LABEL = { primary: 'Comp position', secondary: 'Plays well', emergency: 'Emergency' };
const TIER_EMOJI = { primary: '⭐', secondary: '✅', emergency: '🆘' };
// Main position roles the bot creates are coloured by line so the member list groups nicely
const LINE_COLOUR = { GK: 0xf1c40f, DEF: 0x3498db, MID: 0x2ecc71, ATT: 0xe74c3c };
const LINE_OF = {
  GK: 'GK', LB: 'DEF', CB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'ATT', RW: 'ATT', CF: 'ATT', ST: 'ATT',
};

const secondaryRoleName = (pos) => `${pos} (2nd)`;
const SECONDARY_ROLE_RE = /^([A-Z]{2,3}) \(2ND\)$/;

function cleanPos(p) {
  const up = String(p || '').trim().toUpperCase();
  return POSITIONS.includes(up) ? up : null;
}

function uniq(list) {
  const out = [];
  for (const p of list || []) {
    const c = cleanPos(p);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// One shape everywhere: no duplicates across tiers, caps applied. Secondaries over the cap move to
// emergency rather than being dropped.
function normalize(t) {
  const primary = cleanPos(t?.primary ?? t?.primary_position);
  const secondaryAll = uniq(t?.secondary ?? t?.secondary_positions).filter((p) => p !== primary);
  const secondary = secondaryAll.slice(0, MAX_SECONDARY);
  const emergency = uniq([...secondaryAll.slice(MAX_SECONDARY), ...uniq(t?.emergency ?? t?.emergency_positions)])
    .filter((p) => p !== primary && !secondary.includes(p))
    .slice(0, MAX_EMERGENCY);
  return { primary, secondary, emergency };
}

const isEmpty = (t) => !t || (!t.primary && !t.secondary?.length && !t.emergency?.length);

// A pick on one tier replaces that tier. A position moves to the tier it was just picked for.
function applyPick(current, tier, values) {
  const t = normalize(current);
  const picked = uniq(values);
  if (tier === 'primary') {
    const primary = picked[0] || null;
    return normalize({
      primary,
      secondary: t.secondary.filter((p) => p !== primary),
      emergency: t.emergency.filter((p) => p !== primary),
    });
  }
  if (tier === 'secondary') {
    const secondary = picked.filter((p) => p !== t.primary).slice(0, MAX_SECONDARY);
    return normalize({ primary: t.primary, secondary, emergency: t.emergency.filter((p) => !secondary.includes(p)) });
  }
  if (tier === 'emergency') {
    const emergency = picked.filter((p) => p !== t.primary && !t.secondary.includes(p)).slice(0, MAX_EMERGENCY);
    return normalize({ primary: t.primary, secondary: t.secondary, emergency });
  }
  return t;
}

// A manager adding single positions (roster Add Player): a new comp position pushes the old one into
// the positions played well; a secondary or emergency joins the front of its list.
function addPositions(current, { primary, secondary, emergency } = {}) {
  const t = normalize(current);
  const p = cleanPos(primary);
  const s = cleanPos(secondary);
  const e = cleanPos(emergency);
  const next = { primary: t.primary, secondary: [...t.secondary], emergency: [...t.emergency] };
  if (p && p !== next.primary) {
    if (next.primary) next.secondary.unshift(next.primary);
    next.primary = p;
  }
  if (s && s !== next.primary) {
    next.secondary = [s, ...next.secondary.filter((x) => x !== s)];
    next.emergency = next.emergency.filter((x) => x !== s);
  }
  if (e && e !== next.primary && !next.secondary.includes(e)) next.emergency = [e, ...next.emergency.filter((x) => x !== e)];
  next.secondary = next.secondary.filter((x) => x !== next.primary);
  next.emergency = next.emergency.filter((x) => x !== next.primary && !next.secondary.includes(x));
  return normalize(next);
}

// Old single-menu panels sent up to three positions at once: first is the primary, the rest secondary
function fromLegacyPick(current, values) {
  const picked = uniq(values);
  const t = normalize(current);
  return normalize({
    primary: picked[0] || null,
    secondary: picked.slice(1),
    emergency: t.emergency.filter((p) => !picked.includes(p)),
  });
}

// Which tier a player covers a position at, or null
function tierOf(t, pos) {
  if (!t) return null;
  if (t.primary === pos) return 'primary';
  if ((t.secondary || []).includes(pos)) return 'secondary';
  if ((t.emergency || []).includes(pos)) return 'emergency';
  return null;
}

// Roles a member holds, split into main and secondary position roles
function heldFromRoleNames(names) {
  const primary = [];
  const secondary = [];
  for (const raw of names || []) {
    const up = String(raw).toUpperCase();
    if (ROLE_POSITIONS.includes(up)) primary.push(up);
    const m = up.match(SECONDARY_ROLE_RE);
    if (m && ROLE_POSITIONS.includes(m[1])) secondary.push(m[1]);
  }
  return { primary, secondary };
}

// Fold roles someone was handed (by an admin, or before tiers existed) into their tiers. Never removes
// anything: an empty primary takes the first main role (in `order`, e.g. their ranked preferences),
// and any other held position joins the secondaries while there is room.
function mergeHeldRoles(current, held, order = []) {
  const t = normalize(current);
  const rank = (p) => {
    const i = order.indexOf(p);
    return i === -1 ? order.length + POSITIONS.indexOf(p) : i;
  };
  const mains = uniq(held?.primary).sort((a, b) => rank(a) - rank(b));
  const seconds = uniq(held?.secondary);
  const next = { primary: t.primary, secondary: [...t.secondary], emergency: [...t.emergency] };
  if (!next.primary && mains.length) next.primary = mains[0];
  for (const p of [...mains, ...seconds]) {
    if (p === next.primary || next.secondary.includes(p)) continue;
    if (next.secondary.length >= MAX_SECONDARY) break;
    next.secondary.push(p);
    next.emergency = next.emergency.filter((e) => e !== p);
  }
  return normalize(next);
}

// Which role names to add and remove so the member's roles match their tiers
function roleChanges(t, heldNames) {
  const tiers = normalize(t);
  const held = new Set((heldNames || []).map((n) => String(n).toUpperCase()));
  const wantMain = tiers.primary && ROLE_POSITIONS.includes(tiers.primary) ? [tiers.primary] : [];
  const wantSecond = tiers.secondary.filter((p) => ROLE_POSITIONS.includes(p)).map(secondaryRoleName);
  const want = new Set([...wantMain, ...wantSecond].map((n) => n.toUpperCase()));
  const all = [...ROLE_POSITIONS, ...ROLE_POSITIONS.map(secondaryRoleName)];
  return {
    add: [...wantMain, ...wantSecond].filter((n) => !held.has(n.toUpperCase())),
    remove: all.filter((n) => held.has(n.toUpperCase()) && !want.has(n.toUpperCase())),
  };
}

// "⭐ ST · ✅ CAM, CM · 🆘 CB" (empty tiers are left out)
function formatInline(t, { empty = 'Not set' } = {}) {
  const n = normalize(t);
  const parts = [];
  if (n.primary) parts.push(`${TIER_EMOJI.primary} **${n.primary}**`);
  if (n.secondary.length) parts.push(`${TIER_EMOJI.secondary} ${n.secondary.join(', ')}`);
  if (n.emergency.length) parts.push(`${TIER_EMOJI.emergency} ${n.emergency.join(', ')}`);
  return parts.length ? parts.join(' · ') : empty;
}

// One line per tier, for profiles
function formatLines(t, { empty = 'Not set yet' } = {}) {
  const n = normalize(t);
  if (isEmpty(n)) return empty;
  return [
    `${TIER_EMOJI.primary} **${TIER_LABEL.primary}:** ${n.primary || '—'}`,
    `${TIER_EMOJI.secondary} **${TIER_LABEL.secondary}:** ${n.secondary.join(', ') || '—'}`,
    `${TIER_EMOJI.emergency} **${TIER_LABEL.emergency}:** ${n.emergency.join(', ') || '—'}`,
  ].join('\n');
}

const toRow = (guildId, userId, t) => ({
  guild_id: guildId,
  discord_user_id: userId,
  primary_position: t.primary,
  secondary_positions: t.secondary,
  emergency_positions: t.emergency,
  updated_at: new Date().toISOString(),
});
const fromRow = (row) => (row ? normalize(row) : null);

function createPositionTiers({ supabase }) {
  async function load(guildId, userId) {
    const { data } = await supabase
      .from('player_positions')
      .select('primary_position, secondary_positions, emergency_positions')
      .eq('guild_id', guildId)
      .eq('discord_user_id', userId)
      .maybeSingle();
    return fromRow(data);
  }

  async function loadMany(guildId, userIds) {
    const out = new Map();
    const ids = [...new Set(userIds || [])].filter(Boolean);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase
        .from('player_positions')
        .select('discord_user_id, primary_position, secondary_positions, emergency_positions')
        .eq('guild_id', guildId)
        .in('discord_user_id', ids.slice(i, i + 200));
      for (const row of data || []) out.set(row.discord_user_id, fromRow(row));
    }
    return out;
  }

  // Everyone in the server who covers a position, grouped by tier
  async function covering(guildId, pos) {
    const groups = { primary: [], secondary: [], emergency: [] };
    if (!cleanPos(pos)) return groups;
    const { data } = await supabase
      .from('player_positions')
      .select('discord_user_id, primary_position, secondary_positions, emergency_positions')
      .eq('guild_id', guildId)
      .or(`primary_position.eq.${pos},secondary_positions.cs.{${pos}},emergency_positions.cs.{${pos}}`)
      .limit(300);
    for (const row of data || []) {
      const tier = tierOf(fromRow(row), pos);
      if (tier) groups[tier].push(row.discord_user_id);
    }
    return groups;
  }

  // Club rosters in this server follow the primary (lineups and team sheets read primary_position).
  // Clearing positions leaves the roster as it was.
  async function mirrorToRosters(guildId, userId, t) {
    if (!t.primary) return;
    const { data: teams } = await supabase.from('teams').select('id').eq('guild_id', guildId);
    const teamIds = (teams || []).map((x) => x.id);
    if (!teamIds.length) return;
    await supabase
      .from('team_rosters')
      .update({ primary_position: t.primary, secondary_position: t.secondary[0] || null })
      .in('team_id', teamIds)
      .eq('discord_user_id', userId);
  }

  // A live free agent listing shows the player's latest tiers
  async function mirrorToFreeAgent(userId, t) {
    if (!t.primary) return;
    await supabase
      .from('free_agents')
      .update({
        position: t.primary,
        secondary_position: t.secondary[0] || null,
        secondary_positions: t.secondary,
        emergency_positions: t.emergency,
      })
      .eq('discord_user_id', userId)
      .neq('status', 'off');
  }

  async function save(guildId, userId, tiers, { mirror = true } = {}) {
    const t = normalize(tiers);
    const { error } = await supabase.from('player_positions').upsert(toRow(guildId, userId, t), { onConflict: 'guild_id,discord_user_id' });
    if (error) throw new Error(error.message);
    if (mirror) {
      await mirrorToRosters(guildId, userId, t).catch((err) => console.warn('[positions] roster mirror failed:', err.message));
      await mirrorToFreeAgent(userId, t).catch((err) => console.warn('[positions] free agent mirror failed:', err.message));
    }
    return t;
  }

  // ---------- Discord roles ----------

  function findRole(guild, name) {
    const up = name.toUpperCase();
    return guild.roles.cache.find((r) => r.name.toUpperCase() === up) || null;
  }

  // Creates any missing role this member needs. Main roles stand out; secondary roles stay quiet.
  async function ensureRole(guild, name) {
    const existing = findRole(guild, name);
    if (existing) return existing;
    const second = name.toUpperCase().match(SECONDARY_ROLE_RE);
    if (second) {
      return guild.roles.create({
        name,
        hoist: false,
        mentionable: false,
        permissions: [],
        reason: 'GafferBot secondary position role',
      });
    }
    return guild.roles.create({
      name,
      hoist: true,
      mentionable: true,
      color: LINE_COLOUR[LINE_OF[name]] || 0,
      permissions: [],
      reason: 'GafferBot position role',
    });
  }

  // Secondary roles sit below every main position role so they never take over a member's colour or
  // sidebar group. Best effort: needs Manage Roles and a bot role above them.
  async function keepSecondaryBelow(guild) {
    const mains = ROLE_POSITIONS.map((p) => findRole(guild, p)).filter(Boolean);
    if (!mains.length) return;
    const lowest = Math.min(...mains.map((r) => r.position));
    for (const pos of ROLE_POSITIONS) {
      const role = findRole(guild, secondaryRoleName(pos));
      if (!role || role.position < lowest || !role.editable) continue;
      await role.setPosition(Math.max(1, lowest - 1), { reason: 'GafferBot: secondary position roles sit below main ones' }).catch(() => {});
    }
  }

  // Makes the member's position roles match their tiers. Returns what changed, or throws if Discord
  // refuses (usually the bot's role sits below the position roles).
  async function syncRoles(member, tiers) {
    const guild = member.guild;
    await guild.roles.fetch().catch(() => {});
    const { add, remove } = roleChanges(tiers, member.roles.cache.map((r) => r.name));
    const removeIds = remove.map((n) => findRole(guild, n)).filter(Boolean).map((r) => r.id);
    if (removeIds.length) await member.roles.remove(removeIds, 'Position tiers');
    const addRoles = [];
    for (const name of add) addRoles.push(await ensureRole(guild, name));
    if (addRoles.length) await member.roles.add(addRoles.map((r) => r.id), 'Position tiers');
    if (add.some((n) => SECONDARY_ROLE_RE.test(n.toUpperCase()))) await keepSecondaryBelow(guild);
    return { add, remove };
  }

  // Roles held -> tiers, for members who had roles before tiers existed or were handed one by an admin
  async function adoptFromMember(member) {
    const held = heldFromRoleNames(member.roles.cache.map((r) => r.name));
    const current = await load(member.guild.id, member.id);
    if (!held.primary.length && !held.secondary.length) return current;
    let order = [];
    if (!current?.primary) {
      const { data: prefs } = await supabase
        .from('position_preferences')
        .select('preferences')
        .eq('guild_id', member.guild.id)
        .eq('user_id', member.id)
        .maybeSingle();
      order = uniq(prefs?.preferences);
    }
    const merged = mergeHeldRoles(current, held, order);
    const same = current && JSON.stringify(normalize(current)) === JSON.stringify(merged);
    if (same) return current;
    // Rosters only take a primary they don't have yet (syncMemberPositions), so skip the mirror here
    return save(member.guild.id, member.id, merged, { mirror: false });
  }

  return { load, loadMany, covering, save, syncRoles, adoptFromMember, ensureRole, mirrorToRosters };
}

module.exports = {
  POSITIONS,
  ROLE_POSITIONS,
  MAX_SECONDARY,
  MAX_EMERGENCY,
  TIERS,
  TIER_LABEL,
  TIER_EMOJI,
  secondaryRoleName,
  normalize,
  isEmpty,
  applyPick,
  addPositions,
  fromLegacyPick,
  tierOf,
  heldFromRoleNames,
  mergeHeldRoles,
  roleChanges,
  formatInline,
  formatLines,
  createPositionTiers,
};
