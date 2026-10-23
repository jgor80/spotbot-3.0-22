// Pure helpers for the event availability board: who to ping when it is posted, the
// Available / Maybe / Unavailable sections (only people who answered), and each player's
// positions (primary in bold, then secondary) so captains can see the shape of the squad
// at a glance. Kept free of Discord and database calls so they can be tested directly.

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const MAX_SECONDARY = 3;
const MAX_EMERGENCY = 3;
const SECTION_CAPS = { yes: 30, maybe: 15, no: 15 };
const SECTIONS = [
  { key: 'yes', emoji: '✅', title: 'AVAILABLE', numbered: true },
  { key: 'maybe', emoji: '❓', title: 'MAYBE' },
  { key: 'no', emoji: '❌', title: 'UNAVAILABLE' },
];

// "st", "CAM, CM", "LW/RW" -> valid position codes, in order, no repeats
function splitPositions(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\s,/|]+/);
  const out = [];
  for (const raw of list) {
    const p = String(raw || '').trim().toUpperCase();
    if (POSITIONS.includes(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

// Position codes from a member's Discord role names, highest role first. Accepts "ST",
// "ST • Striker" and the quieter secondary roles like "ST (2nd)", which always come after
// the main (comp) roles.
function rolePositions(roleNames) {
  const out = [];
  const isSecond = (n) => /\b(2nd|second|secondary)\b/i.test(String(n || ''));
  const names = [...(roleNames || [])];
  for (const name of [...names.filter((n) => !isSecond(n)), ...names.filter(isSecond)]) {
    const tokens = String(name || '').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
    const hit = tokens.find((t) => POSITIONS.includes(t));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

// Combine sources best first (position tiers, roster, saved preferences, Discord roles) into
// the tiers shape { primary, secondary: [], emergency: [] }. The first source with a primary
// sets it; secondaries fill from every source; emergency cover comes from the tiers only.
function mergePositions(...sources) {
  let primary = null;
  const rest = [];
  const emergencyIn = [];
  for (const s of sources) {
    if (!s) continue;
    const p = splitPositions(s.primary)[0];
    if (!primary && p) primary = p;
    else if (p) rest.push(p);
    rest.push(...splitPositions(s.secondary));
    emergencyIn.push(...splitPositions(s.emergency));
  }
  const secondary = [];
  for (const p of rest) if (p !== primary && !secondary.includes(p)) secondary.push(p);
  if (!primary && !secondary.length && !emergencyIn.length) return null;
  if (!primary) primary = secondary.shift() || null;
  const sec = secondary.slice(0, MAX_SECONDARY);
  const emergency = [];
  for (const p of emergencyIn) if (p !== primary && !sec.includes(p) && !emergency.includes(p)) emergency.push(p);
  return { primary, secondary: sec, emergency: emergency.slice(0, MAX_EMERGENCY) };
}

// "**ST** · CAM/CM", plus what they signed up for on position sign-up events when it differs
function formatPositions(entry, signedUp) {
  const parts = [];
  if (entry?.primary) parts.push(`**${entry.primary}**`);
  const sec = (entry?.secondary || []).filter((p) => p !== entry?.primary);
  if (sec.length) parts.push(sec.join('/'));
  const picked = splitPositions(signedUp);
  if (picked.length && picked.join() !== [entry?.primary, ...sec].filter(Boolean).slice(0, picked.length).join()) {
    parts.push(`🎯 ${picked.join('/')}`);
  }
  return parts.join(' · ');
}

function playerLine(r, i, section, { positions, deadline }) {
  const pos = formatPositions(positions?.get(r.discord_user_id), r.response === 'yes' ? r.position : null);
  const late = deadline && r.responded_at && new Date(r.responded_at) > deadline ? ' ⏰' : '';
  const note = r.note ? ' 📝' : '';
  const lead = section.numbered ? `${i + 1}.` : '•';
  return `${lead} <@${r.discord_user_id}>${pos ? ` — ${pos}` : ''}${late}${note}`;
}

// The three answer sections. Only people who tapped a button are listed; nobody is shown
// as "still to answer", so a server-wide @everyone post doesn't print the whole member list.
function availabilitySections(responses, { positions = new Map(), deadline = null } = {}) {
  const blocks = [];
  for (const section of SECTIONS) {
    const list = (responses || []).filter((r) => r.response === section.key);
    const cap = SECTION_CAPS[section.key];
    const lines = list.slice(0, cap).map((r, i) => playerLine(r, i, section, { positions, deadline }));
    if (list.length > cap) lines.push(`-# +${list.length - cap} more · tap 👥 View Players`);
    blocks.push(`### ${section.emoji} ${section.title} · ${list.length}\n${lines.length ? lines.join('\n') : '-# Nobody yet'}`);
  }
  return blocks.join('\n');
}

// Counts of Available players by their primary position (or sign-up pick), e.g. "GK 1 · CB 2 · ST 1"
function positionCoverage(responses, positions = new Map()) {
  const counts = {};
  for (const r of responses || []) {
    if (r.response !== 'yes') continue;
    const p = splitPositions(r.position)[0] || positions.get(r.discord_user_id)?.primary;
    if (p) counts[p] = (counts[p] || 0) + 1;
  }
  return POSITIONS.filter((p) => counts[p]).map((p) => `${p} ${counts[p]}`).join(' · ');
}

// The club's signed-players role: the one picked in Events → Signed Players Role, else a role
// named like "Signed Players" / "signed-players" / "Signed".
function findSignedRole(roles, club) {
  const list = roles ? [...(roles.values ? roles.values() : roles)] : [];
  if (club?.signed_role_id) {
    const picked = list.find((r) => r.id === club.signed_role_id);
    if (picked) return picked;
  }
  const squash = (n) => String(n || '').toLowerCase().replace(/[^a-z]/g, '');
  return list.find((r) => ['signedplayers', 'signedplayer', 'signed'].includes(squash(r.name))) || null;
}

// Who the announcement pings:
// - notify "none": nobody
// - league games with a signed-players role always ping that role and nobody else: only
//   signed players can answer them, so a picked role or @everyone is ignored
// - otherwise notify "everyone": @everyone; "signed": the signed-players role
// - otherwise a role picked on the event (or its preset) wins
// - everything else (BYOT, friendlies, practice, tournaments, big nights) pings @everyone
// A league game with no signed-players role falls back to the normal rules and says so.
function choosePing({ notify = null, pingRoleId = null, league = false, signedRoleId = null } = {}) {
  if (notify === 'none') return { kind: 'none' };
  if (league && signedRoleId) return { kind: 'role', roleId: signedRoleId, signed: true };
  if (notify === 'everyone') return { kind: 'everyone' };
  if (notify === 'signed') return signedRoleId ? { kind: 'role', roleId: signedRoleId, signed: true } : { kind: 'everyone', missingSigned: true };
  if (pingRoleId) return { kind: 'role', roleId: pingRoleId };
  if (league) return { kind: 'everyone', missingSigned: true };
  return { kind: 'everyone' };
}

// Whether a member holds a role: a cached GuildMember (roles.cache) or the raw interaction
// member Discord sends when the member isn't cached (roles is an array of ids)
function memberHasRole(member, roleId) {
  if (!member || !roleId) return false;
  const roles = member.roles;
  if (Array.isArray(roles)) return roles.includes(roleId);
  if (roles?.cache?.has) return roles.cache.has(roleId);
  return false;
}

function signedOnlyMessage(event, role) {
  return `🔒 **${event.title}** is a league game, so only players with the ${role ? `<@&${role.id}>` : 'signed-players'} role can sign up. Ask a club leader if you should have it.`;
}

function pingMessage(plan) {
  if (plan?.kind === 'role') return { content: `<@&${plan.roleId}>`, allowedMentions: { parse: [], users: [], roles: [plan.roleId], repliedUser: false } };
  if (plan?.kind === 'everyone') return { content: '@everyone', allowedMentions: { parse: ['everyone'], users: [], roles: [], repliedUser: false } };
  return { allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } };
}

function pingLabel(plan) {
  if (plan?.kind === 'role') return plan.signed ? `the signed-players role <@&${plan.roleId}>` : `<@&${plan.roleId}>`;
  if (plan?.kind === 'everyone') return '@everyone';
  return 'nobody (no ping)';
}

module.exports = {
  POSITIONS,
  splitPositions,
  rolePositions,
  mergePositions,
  formatPositions,
  availabilitySections,
  positionCoverage,
  findSignedRole,
  choosePing,
  memberHasRole,
  signedOnlyMessage,
  pingMessage,
  pingLabel,
};
