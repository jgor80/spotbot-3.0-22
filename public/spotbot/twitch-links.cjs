// Links players to their Twitch accounts from the twitch.tv links posted in a channel
// (/manager → Admin → Import Twitch). Saves profiles.twitch_username.
//
// Each link belongs to the message's author, unless the message @mentions exactly one other member
// ("@Sam twitch.tv/samplays"), when it belongs to them. A preview always comes first; Save writes only
// the clear matches. Anything ambiguous is listed and left alone: a Twitch account claimed by two
// players, a Twitch account another profile already owns (anywhere, not just this channel), a message
// with several mentions, or a player already linked to a different account. The database backs this up
// with a unique index on lower(twitch_username), so one Twitch account can never sit on two profiles.

const { PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;
const SCAN_MAX = 5000;
// Twitch pages that aren't a channel
const RESERVED = new Set(['videos', 'directory', 'clip', 'clips', 'p', 'settings', 'subscriptions', 'downloads', 'jobs',
  'turbo', 'search', 'inventory', 'wallet', 'friends', 'messages', 'login', 'signup', 'moderator', 'popout', 'drops',
  'prime', 'store', 'team', 'collections', 'broadcast', 'dashboard', 'following', 'privacy', 'legal']);
const LINK_RE = /(?<![\w.-])(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})(?![A-Za-z0-9_])/gi;

// Twitch logins in a piece of text, lowercased, in order, no repeats
function extractTwitchLogins(text) {
  const out = [];
  for (const m of String(text || '').matchAll(LINK_RE)) {
    const login = m[1].toLowerCase();
    if (!RESERVED.has(login) && !out.includes(login)) out.push(login);
  }
  return out;
}

// Who a message's links belong to: { userId } or { ambiguous: reason }
function targetOf(message) {
  const authorId = message.author?.id;
  const mentioned = [...(message.mentions?.users?.values?.() || [])].filter((u) => !u.bot && u.id !== authorId);
  if (mentioned.length > 1) return { ambiguous: 'mentions several players' };
  if (mentioned.length === 1) return { userId: mentioned[0].id, viaMention: true };
  return { userId: authorId };
}

// Turn messages (newest first, as Discord returns them) into matches and problems.
// existing: Map discordUserId → current twitch_username. owners: Map login → discordUserId of every
// profile already holding that login. members: Set of user ids still in the server.
function buildMatches(messages, { existing = new Map(), owners = new Map(), members = null, botId = null } = {}) {
  const byUser = new Map(); // userId → { login, others: Set, messageId }
  const problems = [];
  for (const msg of messages) {
    if (msg.author?.bot || msg.author?.id === botId) continue;
    const logins = extractTwitchLogins(msg.content);
    if (!logins.length) continue;
    const t = targetOf(msg);
    if (t.ambiguous) { problems.push({ kind: 'mentions', logins, messageId: msg.id, authorId: msg.author?.id }); continue; }
    // Several channels in one message by one person: only clear when it's their own post with one link
    if (logins.length > 1 && t.viaMention) { problems.push({ kind: 'mentions', logins, messageId: msg.id, authorId: msg.author?.id }); continue; }
    const cur = byUser.get(t.userId);
    if (!cur) byUser.set(t.userId, { login: logins[0], others: new Set(logins.slice(1)), messageId: msg.id });
    else for (const l of logins) if (l !== cur.login) cur.others.add(l);
  }

  // A Twitch account claimed by more than one player is left for a human
  const claims = new Map();
  for (const [userId, m] of byUser) claims.set(m.login, [...(claims.get(m.login) || []), userId]);

  const matches = [];
  for (const [userId, m] of byUser) {
    const row = { userId, login: m.login, others: [...m.others], messageId: m.messageId };
    const current = existing.get(userId) ? String(existing.get(userId)).toLowerCase() : null;
    const owner = owners.get(m.login);
    if (members && !members.has(userId)) problems.push({ kind: 'left', ...row });
    else if (owner && owner !== userId) problems.push({ kind: 'taken', ...row, owner });
    else if (claims.get(m.login).length > 1) problems.push({ kind: 'shared', ...row, sharedWith: claims.get(m.login).filter((u) => u !== userId) });
    else if (current && current !== m.login) problems.push({ kind: 'different', ...row, current });
    else matches.push({ ...row, already: current === m.login });
  }
  return { matches, problems };
}

const link = (login) => `[${login}](<https://twitch.tv/${login}>)`;

function describe(problem) {
  const who = problem.userId ? `<@${problem.userId}>` : `message by <@${problem.authorId}>`;
  switch (problem.kind) {
    case 'mentions': return `${who}: ${problem.logins.map(link).join(', ')}: can't tell whose (several mentions or links)`;
    case 'left': return `${who} → ${link(problem.login)}: no longer in the server`;
    case 'shared': return `${who} → ${link(problem.login)}: also posted for ${problem.sharedWith.map((u) => `<@${u}>`).join(', ')}`;
    case 'taken': return `${who} → ${link(problem.login)}: already linked to <@${problem.owner}>`;
    case 'failed': return `${who} → ${link(problem.login)}: couldn't save (${problem.reason})`;
    case 'different': return `${who} → ${link(problem.login)}: already linked to ${link(problem.current)}, left as is`;
    default: return who;
  }
}

function report({ matches, problems, scanned, channelId, saved = null }) {
  const lines = [];
  const fresh = matches.filter((m) => !m.already);
  lines.push(saved == null
    ? `**Twitch links in <#${channelId}>** (${scanned} messages read)`
    : `**Saved ${saved} Twitch link${saved === 1 ? '' : 's'}** from <#${channelId}>`);
  lines.push('');
  if (fresh.length) {
    lines.push(saved == null ? `✅ Ready to link (${fresh.length}):` : `✅ Linked (${fresh.length}):`);
    for (const m of fresh) lines.push(`<@${m.userId}> → ${link(m.login)}${m.others.length ? ` (latest; also posted ${m.others.map(link).join(', ')})` : ''}`);
  } else lines.push('Nothing new to link.');
  const already = matches.length - fresh.length;
  if (already) lines.push('', `Already linked: ${already}`);
  if (problems.length) {
    lines.push('', `⚠️ Left alone (${problems.length}):`);
    for (const p of problems) lines.push(describe(p));
  }
  if (saved == null && fresh.length) lines.push('', 'Run **Import Twitch** again with **save** set to True to write these.');
  return lines.join('\n');
}

function createTwitchLinks({ supabase, getClient }) {
  async function readChannel(channel, max = SCAN_MAX) {
    const out = [];
    let before;
    while (out.length < max) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      out.push(...batch.values());
      before = batch.lastKey();
      if (batch.size < 100) break;
    }
    return out;
  }

  // Preview (save false) or write the clear matches. Returns the text to show.
  async function importFromChannel({ guild, channel, save = false }) {
    const me = guild.members.me;
    const perms = channel.permissionsFor?.(me);
    if (!perms?.has(F.ViewChannel) || !perms?.has(F.ReadMessageHistory)) {
      return `❌ I need **View Channel** and **Read Message History** in <#${channel.id}>.`;
    }
    const messages = await readChannel(channel);
    const members = new Set((await guild.members.fetch().catch(() => guild.members.cache)).keys());
    const userIds = [...new Set(messages.map((m) => [m.author?.id, ...(m.mentions?.users?.keys?.() || [])]).flat().filter(Boolean))];
    const existing = new Map();
    for (let i = 0; i < userIds.length; i += 200) {
      const { data, error } = await supabase.from('profiles').select('discord_user_id, twitch_username')
        .in('discord_user_id', userIds.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of data || []) if (r.twitch_username) existing.set(r.discord_user_id, r.twitch_username);
    }
    // Who already owns each posted login, across every profile, not only the people in this channel
    const logins = [...new Set(messages.flatMap((m) => extractTwitchLogins(m.content)))];
    const owners = new Map();
    for (let i = 0; i < logins.length; i += 200) {
      const { data, error } = await supabase.from('profiles').select('discord_user_id, twitch_username')
        .in('twitch_username', logins.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of data || []) owners.set(String(r.twitch_username).toLowerCase(), r.discord_user_id);
    }
    const result = buildMatches(messages, { existing, owners, members, botId: getClient()?.user?.id });
    if (!save) return report({ ...result, scanned: messages.length, channelId: channel.id });

    const fresh = result.matches.filter((m) => !m.already);
    const saved = [];
    for (const m of fresh) {
      const member = guild.members.cache.get(m.userId);
      const { error } = await supabase.from('profiles').upsert({
        discord_user_id: m.userId,
        twitch_username: m.login,
        ...(member ? { discord_username: member.displayName || member.user?.username } : {}),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'discord_user_id' });
      if (error) {
        // 23505: another profile took this login since the preview (unique index on lower(twitch_username))
        console.error('[twitch-links] save failed for', m.userId, error.message);
        result.problems.push({ kind: 'failed', ...m, reason: error.code === '23505' ? 'linked to another player' : 'database error' });
      } else saved.push(m);
    }
    return report({ ...result, matches: saved, scanned: messages.length, channelId: channel.id, saved: saved.length });
  }

  return { importFromChannel, readChannel };
}

module.exports = { createTwitchLinks, extractTwitchLogins, targetOf, buildMatches, report };
