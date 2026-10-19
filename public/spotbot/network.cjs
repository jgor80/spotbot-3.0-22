// GafferBot Network: servers that opt in can see each other's clubs, and later send replacement
// requests, friendly invites and BYOT sign-ups through the bot. Every server starts off the network;
// a server admin turns it on and picks the channel where requests from other servers land.
// Only public club info leaves a server (club name, platform, EA division, skill rating, record) and
// the server's name only if the admin ticks "show server name". Member lists never do.
//
// Abuse controls live here so every later piece shares them: block a server (both sides stop seeing
// each other), report a server (goes to the bot owners), per-day rate limits, a text cleaner for
// anything typed into a request, owner suspensions, and NETWORK=off as a kill switch.

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const { activeClubs } = require('./manager-hub.cjs');
const { isServerAdmin, isBotOwner, ownerIds, missingChannelPerms, missingPermsMessage } = require('./perm-check.cjs');
const { toFcPlatform } = require('./ea-fc27.cjs');
const { POSITIONS } = require('./recruitment.cjs');
const T = require('./event-time.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const REGIONS = ['Europe', 'UK & Ireland', 'North America East', 'North America West', 'South America', 'Middle East & Africa', 'Asia', 'Oceania'];
const PLATFORMS = { 'common-gen5': 'PS5 / Xbox Series / PC', nx: 'Switch' };
// Per server, per rolling day. Later slices add their own kinds (replacement, friendly...).
const DAILY_LIMITS = { report: 5, replacement: 10, friendly: 10 };
// Per player across every server, per rolling day, so one person can't spam from several servers
const USER_DAILY_LIMITS = { report: 3, replacement: 5, friendly: 5 };
// Joining needs a server that isn't brand new and has a few people in it (NETWORK_MIN_SERVER_DAYS,
// NETWORK_MIN_MEMBERS). Reports from this many different listed servers within REPORT_WINDOW_MS pause
// a server until the team reviews it (NETWORK_AUTO_SUSPEND_REPORTS, 0 turns it off).
const REPORT_WINDOW_MS = 30 * DAY_MS;
const AUTO_SUSPEND_REASON = 'Paused automatically after reports from several servers. The GafferBot team will review it.';
const envInt = (name, fallback) => {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const REGION_CHOICES = REGIONS.map((r) => ({ name: r, value: r }));
const PLATFORM_CHOICES = Object.entries({ 'common-gen5': 'PS5 / Xbox Series / PC', nx: 'Switch' }).map(([value, name]) => ({ name, value }));
const PAGE_SIZE = 15;
const MAX_LISTED = 10000;
const STATE_BATCH = 10;
const MAX_TEXT = 200;

const NETWORK_COMMANDS = [
  {
    name: 'network',
    description: 'The GafferBot Network: find clubs on other servers that run GafferBot.',
    options: [
      {
        type: 1,
        name: 'setup',
        description: 'Join or leave the GafferBot Network (server admins).',
        options: [
          { name: 'enabled', description: 'List this server\'s clubs on the network.', type: 5, required: true },
          { name: 'channel', description: 'Where requests from other servers land. Managers only see them.', type: 7, required: false, channel_types: [ChannelType.GuildText] },
          { name: 'show_server_name', description: 'Show this Discord server\'s name next to your clubs (off: club names only).', type: 5, required: false },
          { name: 'region', description: 'Where your clubs mostly play from.', type: 3, required: false, choices: REGIONS.map((r) => ({ name: r, value: r })) },
        ],
      },
      { type: 1, name: 'status', description: 'Whether this server is on the network, and the servers you blocked.' },
      {
        type: 1,
        name: 'need',
        description: 'Short a player? Ask free agents and other network servers for a replacement.',
        options: [
          { name: 'position', description: 'The position you need.', type: 3, required: true, choices: POSITIONS.map((p) => ({ name: p, value: p })) },
          { name: 'when', description: 'Kick-off, e.g. "9pm" or "thu 21:00". Shown in each reader\'s local time.', type: 3, required: true },
          { name: 'note', description: 'Anything else, e.g. "Div 2 league game, mics on".', type: 3, required: false },
          { name: 'reach', description: 'Who to ask (default: free agents and other servers).', type: 3, required: false, choices: [{ name: 'Free agents and other servers', value: 'all' }, { name: 'Free agents only', value: 'fa' }] },
        ],
      },
      {
        type: 1,
        name: 'clubs',
        description: 'Browse clubs on the GafferBot Network.',
        options: [
          { name: 'platform', description: 'Only clubs on this platform.', type: 3, required: false, choices: Object.entries(PLATFORMS).map(([value, name]) => ({ name, value })) },
          { name: 'region', description: 'Only clubs from this region.', type: 3, required: false, choices: REGIONS.map((r) => ({ name: r, value: r })) },
        ],
      },
      {
        type: 1,
        name: 'friendly',
        description: 'Invite a club on another server to a friendly.',
        options: [
          { name: 'when', description: 'Kick-off, e.g. "9pm" or "thu 21:00". Shown in each reader\'s local time.', type: 3, required: true },
          { name: 'note', description: 'Anything else, e.g. "best of 3" or "need a Div 3-5 side".', type: 3, required: false },
          { name: 'open', description: 'Post to every network server and take the first club that accepts (default: pick a club).', type: 5, required: false },
        ],
      },
      { type: 1, name: 'byot', description: 'GafferBot-hosted BYOT tournaments: sign up and see the bracket.' },
      {
        type: 1,
        name: 'byot_create',
        description: 'Bot owners: host a BYOT tournament for every network server.',
        options: [
          { name: 'name', description: 'Tournament name.', type: 3, required: true, max_length: 60 },
          { name: 'when', description: 'Round 1 kick-off, e.g. "sat 20:00". Sign-ups close then.', type: 3, required: true },
          { name: 'platform', description: 'Platform.', type: 3, required: true, choices: PLATFORM_CHOICES },
          { name: 'max_teams', description: 'Most clubs that can enter (default 16).', type: 4, required: false, choices: [4, 8, 16, 32].map((n) => ({ name: String(n), value: n })) },
          { name: 'round_minutes', description: 'Minutes between rounds (default 45).', type: 4, required: false, min_value: 20, max_value: 1440 },
        ],
      },
      {
        type: 1,
        name: 'leaderboard',
        description: 'Every club on the GafferBot Network, ranked.',
        options: [
          { name: 'view', description: 'Clubs (default) or servers.', type: 3, required: false, choices: [{ name: 'Clubs', value: 'clubs' }, { name: 'Servers', value: 'servers' }] },
          { name: 'platform', description: 'Only clubs on this platform.', type: 3, required: false, choices: PLATFORM_CHOICES },
          { name: 'region', description: 'Only clubs from this region.', type: 3, required: false, choices: REGION_CHOICES },
        ],
      },
      {
        type: 1,
        name: 'suspend',
        description: 'Bot owners: take a server off the network, or lift a suspension.',
        options: [
          { name: 'server_id', description: 'The Discord server id.', type: 3, required: true },
          { name: 'reason', description: 'Shown to that server\'s admins. Leave empty to lift the suspension.', type: 3, required: false },
        ],
      },
    ],
  },
];

// Strip what should never travel between servers (links, bare domains, invites, mentions, invisible
// characters) and mask blocked words. Extra words can be added with NETWORK_BLOCKED_WORDS (comma
// separated) without a deploy.
const BUILTIN_BLOCKED = ['fuck', 'cunt', 'retard', 'nigger', 'nigga', 'faggot', 'tranny'];
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const INVITE = /\b(discord(app)?\s*\.\s*(gg|com\s*\/\s*invite|me)|dsc\s*\.\s*gg|invite\s*\.\s*gg)\s*\/?\s*[\w-]+/gi;
const TLDS = 'com|net|org|gg|io|co|me|tv|ly|xyz|app|dev|link|club|shop|site|online|live|store|ru|uk|de|fr|es|it|nl|info|biz|us|ca|au|pro|fun|top|win|bet|cc|to|be|eu';
const BARE_DOMAIN = new RegExp(`\\b[a-z0-9][a-z0-9-]*(\\s*\\.\\s*[a-z0-9-]+)*\\s*\\.\\s*(${TLDS})\\b(\\/\\S*)?`, 'gi');
function blockedWords() {
  const extra = String(process.env.NETWORK_BLOCKED_WORDS || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...BUILTIN_BLOCKED, ...extra])];
}
function cleanText(text, max = MAX_TEXT) {
  if (!text) return '';
  let s = String(text)
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/<[@#][!&]?\d+>/g, '')
    .replace(/@(everyone|here)/gi, '')
    .replace(/(https?:\/\/|www\.)\S+/gi, '')
    .replace(INVITE, '')
    .replace(BARE_DOMAIN, '')
    .replace(/@/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const word of blockedWords()) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`\\w*${escaped}\\w*`, 'gi'), (m) => m[0] + '*'.repeat(Math.max(1, m.length - 1)));
  }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Which listed servers a server may see: on, not suspended, not itself, no block in either direction
function visibleServerIds(rows, blocks, guildId) {
  const hidden = new Set();
  for (const b of blocks || []) {
    if (b.guild_id === guildId) hidden.add(b.blocked_guild_id);
    if (b.blocked_guild_id === guildId) hidden.add(b.guild_id);
  }
  return (rows || []).filter((r) => r.enabled && !r.suspended_at && r.guild_id !== guildId && !hidden.has(r.guild_id)).map((r) => r.guild_id);
}

// Why a server can't join yet, or null. Bot owners skip this (they run test servers).
function joinProblem(guild, now = Date.now()) {
  const minDays = envInt('NETWORK_MIN_SERVER_DAYS', 30);
  const minMembers = envInt('NETWORK_MIN_MEMBERS', 5);
  const created = guild?.createdTimestamp;
  if (minDays && created && now - created < minDays * DAY_MS) {
    return `Servers can join the GafferBot Network once they're ${minDays} days old. This one can join <t:${Math.ceil((created + minDays * DAY_MS) / 1000)}:R>.`;
  }
  if (minMembers && typeof guild?.memberCount === 'number' && guild.memberCount < minMembers) {
    return `Servers need at least ${minMembers} members to join the GafferBot Network.`;
  }
  return null;
}

function fmtRecord(s) {
  if (!s) return null;
  const w = s.wins || 0;
  const d = s.draws || 0;
  const l = s.losses || 0;
  return w + d + l ? `${w}W ${d}D ${l}L` : null;
}

function clubLine(c) {
  const bits = [PLATFORMS[c.platform] || null, c.division ? `Div ${c.division}` : null, c.skill ? `SR ${c.skill}` : null, fmtRecord(c.stats), c.region, c.serverName ? `on ${c.serverName}` : null];
  return `**${c.name}** · ${bits.filter(Boolean).join(' · ') || 'no EA stats yet'}`;
}

function createNetwork(deps) {
  const { supabase, getGuildState, isManager } = deps;
  const isOn = () => String(process.env.NETWORK || '').toLowerCase() !== 'off';
  const OFF_MSG = '⚪ The GafferBot Network is switched off right now. Try again later.';
  // Later slices register their own subcommands and nw_<x> components here
  const subcommandHandlers = {};
  const componentHandlers = {};

  async function serverRow(guildId) {
    const { data } = await supabase.from('network_servers').select('*').eq('guild_id', guildId).maybeSingle();
    return data || null;
  }

  async function isListed(guildId) {
    if (!isOn()) return false;
    const row = await serverRow(guildId);
    return !!row?.enabled && !row.suspended_at;
  }

  async function blocksFor(guildId) {
    const [{ data: mine }, { data: theirs }] = await Promise.all([
      supabase.from('network_blocks').select('guild_id, blocked_guild_id').eq('guild_id', guildId),
      supabase.from('network_blocks').select('guild_id, blocked_guild_id').eq('blocked_guild_id', guildId),
    ]);
    return [...(mine || []), ...(theirs || [])];
  }

  async function isBlockedBetween(a, b) {
    const blocks = await blocksFor(a);
    return blocks.some((x) => (x.guild_id === a && x.blocked_guild_id === b) || (x.guild_id === b && x.blocked_guild_id === a));
  }

  // Every listed server, a page at a time (PostgREST caps one response at 1000 rows)
  async function listedRows() {
    const out = [];
    for (let from = 0; from < MAX_LISTED; from += 1000) {
      const { data } = await supabase
        .from('network_servers')
        .select('*')
        .eq('enabled', true)
        .is('suspended_at', null)
        .order('guild_id')
        .range(from, from + 999);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  // Servers this one can reach, with their settings rows
  async function visibleServers(guildId) {
    const [rows, blocks] = await Promise.all([listedRows(), blocksFor(guildId)]);
    const ids = new Set(visibleServerIds(rows, blocks, guildId));
    return (rows || []).filter((r) => ids.has(r.guild_id));
  }

  // Rate limit: how many of this kind a server, and the player across every server, sent in the last
  // day. Returns a message when either is over.
  async function overLimit(guildId, kind, userId) {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const count = async (column, value) => {
      const { count: n } = await supabase
        .from('network_activity')
        .select('id', { count: 'exact', head: true })
        .eq(column, value)
        .eq('kind', kind)
        .gte('created_at', since);
      return n || 0;
    };
    const limit = DAILY_LIMITS[kind];
    if (limit && (await count('guild_id', guildId)) >= limit) return `This server has hit today's network limit (${limit} a day). Try again tomorrow.`;
    const userLimit = USER_DAILY_LIMITS[kind];
    if (userId && userLimit && (await count('discord_user_id', userId)) >= userLimit) return `You've hit today's network limit (${userLimit} a day across all servers). Try again tomorrow.`;
    return null;
  }

  async function logActivity(guildId, kind, userId) {
    await supabase.from('network_activity').insert({ guild_id: guildId, kind, discord_user_id: userId || null });
  }

  // Enough different listed servers reported this one lately: take it off the network until reviewed.
  // Returns how many servers reported it when that happened, otherwise null.
  async function autoSuspend(client, targetId) {
    const needed = envInt('NETWORK_AUTO_SUSPEND_REPORTS', 3);
    if (!needed) return null;
    const { data: reports } = await supabase
      .from('network_reports')
      .select('reporter_guild_id')
      .eq('reported_guild_id', targetId)
      .gte('created_at', new Date(Date.now() - REPORT_WINDOW_MS).toISOString())
      .limit(500);
    const reporters = [...new Set((reports || []).map((r) => r.reporter_guild_id).filter((id) => id && id !== targetId))];
    if (reporters.length < needed) return null;
    // Only servers in good standing count, so a ring of throwaway servers can't knock someone off
    const { data: good } = await supabase.from('network_servers').select('guild_id').in('guild_id', reporters).eq('enabled', true).is('suspended_at', null);
    const n = (good || []).length;
    if (n < needed) return null;
    const { data: hit } = await supabase
      .from('network_servers')
      .update({ suspended_at: new Date().toISOString(), suspended_reason: AUTO_SUSPEND_REASON, updated_at: new Date().toISOString() })
      .eq('guild_id', targetId)
      .is('suspended_at', null)
      .select('guild_id');
    if (!hit?.length) return null;
    await postToChannel(client, targetId, { content: `⛔ This server is off the GafferBot Network for now: ${AUTO_SUSPEND_REASON}` }).catch(() => null);
    return n;
  }

  function serverLabel(client, row, fallbackClub) {
    if (row?.show_server_name) {
      const name = cleanText(client?.guilds?.cache?.get(row.guild_id)?.name, 60);
      if (name) return name;
    }
    return fallbackClub ? `${fallbackClub}'s server` : 'a GafferBot server';
  }

  // Public club cards for these servers: clubs that are on and linked to EA, plus their EA numbers
  async function clubDirectory(client, servers) {
    if (!servers.length) return [];
    const ids = servers.map((s) => s.guild_id);
    const stats = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase
        .from('club_stats')
        .select('guild_id, club_key, club_name, ea_platform, current_division, skill_rating, wins, draws, losses')
        .in('guild_id', ids.slice(i, i + 200));
      stats.push(...(data || []));
    }
    const statsByClub = new Map(stats.map((x) => [`${x.guild_id}|${x.club_key}`, x]));
    // Server settings load a few at a time instead of one after another
    const states = new Map();
    for (let i = 0; i < servers.length; i += STATE_BATCH) {
      const batch = servers.slice(i, i + STATE_BATCH);
      const loaded = await Promise.all(batch.map((row) => getGuildState(row.guild_id).catch(() => null)));
      batch.forEach((row, j) => states.set(row.guild_id, loaded[j]));
    }
    const out = [];
    for (const row of servers) {
      const state = states.get(row.guild_id);
      if (!state) continue;
      for (const club of activeClubs(state)) {
        if (!club.ea_club_id) continue;
        const s = statsByClub.get(`${row.guild_id}|${club.key}`);
        out.push({
          guildId: row.guild_id,
          key: club.key,
          eaClubId: String(club.ea_club_id),
          name: cleanText(club.ea_club_name || s?.club_name || club.name, 60) || 'Unnamed club',
          platform: toFcPlatform(club.ea_platform || s?.ea_platform),
          division: s?.current_division || null,
          skill: s?.skill_rating || null,
          stats: s,
          region: row.region || null,
          serverName: row.show_server_name ? cleanText(client?.guilds?.cache?.get(row.guild_id)?.name, 60) || null : null,
        });
      }
    }
    return out;
  }

  // A select a manager uses on anything that came from another server: block it or report it
  function moderationSelect(entries, context = 'club card') {
    const seen = new Set();
    const options = [];
    for (const e of entries) {
      if (seen.has(e.guildId)) continue;
      seen.add(e.guildId);
      const label = e.serverName || `${e.name}'s server`;
      options.push({ label: `Report ${label}`.slice(0, 100), value: `rep:${e.guildId}`, emoji: '🚩' });
      options.push({ label: `Block ${label}`.slice(0, 100), value: `blk:${e.guildId}`, emoji: '⛔' });
      if (options.length >= 24) break;
    }
    if (!options.length) return null;
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`nw_mod:${context.slice(0, 40)}`).setPlaceholder('Report or block a server').addOptions(options)
    );
  }

  // ---------- /network setup ----------

  async function handleSetup(interaction) {
    if (!isServerAdmin(interaction.member)) return interaction.reply({ content: '❌ Only server admins can change the network settings.', flags: 64 });
    const enabled = interaction.options.getBoolean('enabled');
    const channel = interaction.options.getChannel('channel');
    const showName = interaction.options.getBoolean('show_server_name');
    const region = interaction.options.getString('region');
    const existing = await serverRow(interaction.guildId);

    if (existing?.suspended_at && enabled) {
      return interaction.reply({ content: `⛔ This server is suspended from the GafferBot Network${existing.suspended_reason ? `: ${existing.suspended_reason}` : ''}. Contact the GafferBot team to appeal.`, flags: 64 });
    }
    const tooNew = enabled && !existing?.enabled && !isBotOwner(interaction.user.id) ? joinProblem(interaction.guild) : null;
    if (tooNew) return interaction.reply({ content: `⏳ ${tooNew}`, flags: 64 });
    const channelId = channel?.id || existing?.channel_id || null;
    if (enabled && !channelId) {
      return interaction.reply({ content: '❌ Pick a channel where requests from other servers should land, then switch the network on.', flags: 64 });
    }
    if (channel) {
      const real = interaction.guild?.channels?.cache?.get(channel.id);
      const me = interaction.guild?.members?.me;
      const missing = real && me ? missingChannelPerms(real, me) : [];
      if (missing.length) return interaction.reply({ content: missingPermsMessage(real, missing), flags: 64 });
    }

    const row = {
      guild_id: interaction.guildId,
      enabled,
      channel_id: channelId,
      show_server_name: showName ?? existing?.show_server_name ?? false,
      region: region ?? existing?.region ?? null,
      enabled_by_discord_id: enabled ? interaction.user.id : existing?.enabled_by_discord_id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('network_servers').upsert(row, { onConflict: 'guild_id' });
    if (error) return interaction.reply({ content: `❌ Could not save: ${error.message}`, flags: 64 });

    if (!enabled) {
      return interaction.reply({ content: '⚪ This server is off the GafferBot Network. Your clubs are hidden and other servers can no longer reach you.', flags: 64 });
    }
    const state = await getGuildState(interaction.guildId);
    const listed = activeClubs(state).filter((c) => c.ea_club_id);
    const unlinked = activeClubs(state).filter((c) => !c.ea_club_id);
    return interaction.reply({
      content:
        `🌐 This server is on the GafferBot Network. Requests from other servers land in <#${channelId}>.\n` +
        (listed.length ? `Listed: ${listed.map((c) => `**${c.name}**`).join(', ')}.` : 'No club is listed yet: link one to EA first (**/manager → Admin → Link EA Club**).') +
        (unlinked.length && listed.length ? `\nNot listed until linked to EA: ${unlinked.map((c) => c.name).join(', ')}.` : '') +
        `\nOther servers see club names, platform, EA division, skill rating and record${row.show_server_name ? ', plus this server\'s name' : ''}. Never your members.`,
      flags: 64,
    });
  }

  // ---------- /network status ----------

  async function handleStatus(interaction) {
    if (!isManager(interaction.member) && !isServerAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Only managers can see the network settings.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    const row = await serverRow(interaction.guildId);
    const { data: blocked } = await supabase.from('network_blocks').select('blocked_guild_id, created_at').eq('guild_id', interaction.guildId).limit(25);
    const state = await getGuildState(interaction.guildId);
    const listed = activeClubs(state).filter((c) => c.ea_club_id);

    const embed = new EmbedBuilder()
      .setTitle('🌐 GafferBot Network')
      .setColor(row?.enabled && !row?.suspended_at ? 0x57f287 : 0x99aab5)
      .addFields(
        { name: 'Status', value: !isOn() ? 'Network switched off for everyone' : row?.suspended_at ? `Suspended${row.suspended_reason ? `: ${row.suspended_reason}` : ''}` : row?.enabled ? 'On' : 'Off', inline: true },
        { name: 'Requests land in', value: row?.channel_id ? `<#${row.channel_id}>` : 'Not set', inline: true },
        { name: 'Server name shown', value: row?.show_server_name ? 'Yes' : 'No, club names only', inline: true },
        { name: 'Region', value: row?.region || 'Not set', inline: true },
        { name: 'Listed clubs', value: row?.enabled && listed.length ? listed.map((c) => c.name).join(', ') : 'None', inline: true },
        { name: 'Blocked servers', value: String(blocked?.length || 0), inline: true }
      )
      .setFooter({ text: 'Server admins change this with /manager → Admin → Network Setup.' });

    const components = [];
    if (blocked?.length) {
      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('nw_unblock')
            .setPlaceholder('Unblock a server')
            .addOptions(blocked.map((b) => ({ label: (interaction.client.guilds.cache.get(b.blocked_guild_id)?.name || `Server ${b.blocked_guild_id}`).slice(0, 100), value: b.blocked_guild_id, description: `Blocked ${new Date(b.created_at).toISOString().slice(0, 10)}` })))
        )
      );
    }
    return interaction.editReply({ embeds: [embed], components });
  }

  // ---------- /network clubs ----------

  async function handleClubs(interaction) {
    await interaction.deferReply({ flags: 64 });
    if (!(await isListed(interaction.guildId))) {
      return interaction.editReply({ content: '⚪ This server isn\'t on the GafferBot Network. A server admin can join with **/manager → Admin → Network Setup**; you see other clubs once you\'re listed too.' });
    }
    const platform = interaction.options.getString('platform');
    const region = interaction.options.getString('region');
    let clubs = await clubDirectory(interaction.client, await visibleServers(interaction.guildId));
    if (platform) clubs = clubs.filter((c) => c.platform === platform);
    if (region) clubs = clubs.filter((c) => c.region === region);
    clubs.sort((a, b) => (b.skill || 0) - (a.skill || 0));

    const page = clubs.slice(0, PAGE_SIZE);
    const embed = new EmbedBuilder()
      .setTitle('🌐 Clubs on the GafferBot Network')
      .setColor(0x5865f2)
      .setDescription(page.length ? page.map((c, i) => `${i + 1}. ${clubLine(c)}`).join('\n') : 'No other clubs match yet. As more servers join, they show up here.')
      .setFooter({ text: `${clubs.length} club${clubs.length === 1 ? '' : 's'}${clubs.length > PAGE_SIZE ? `, top ${PAGE_SIZE} by skill rating shown` : ''} · filters: platform, region` });
    const mod = moderationSelect(page);
    return interaction.editReply({ embeds: [embed], components: mod ? [mod] : [] });
  }

  // ---------- /network suspend (bot owners) ----------

  async function handleSuspend(interaction) {
    if (!isBotOwner(interaction.user.id)) return interaction.reply({ content: '❌ Only the GafferBot team can suspend servers.', flags: 64 });
    const guildId = interaction.options.getString('server_id').trim();
    if (!/^\d{15,22}$/.test(guildId)) return interaction.reply({ content: '❌ That doesn\'t look like a Discord server id.', flags: 64 });
    const reason = cleanText(interaction.options.getString('reason'), 300) || null;
    const row = { guild_id: guildId, suspended_at: reason ? new Date().toISOString() : null, suspended_reason: reason, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('network_servers').upsert(row, { onConflict: 'guild_id' });
    if (error) return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    const name = interaction.client.guilds.cache.get(guildId)?.name || guildId;
    return interaction.reply({ content: reason ? `⛔ ${name} is suspended from the network: ${reason}` : `✅ ${name}'s suspension is lifted. Their admin can switch the network back on.`, flags: 64 });
  }

  // ---------- Report / block / unblock ----------

  async function canModerate(interaction) {
    return isManager(interaction.member) || isServerAdmin(interaction.member);
  }

  async function blockServer(interaction, targetId) {
    if (!(await canModerate(interaction))) return interaction.reply({ content: '❌ Only managers can block servers.', flags: 64 });
    if (targetId === interaction.guildId) return interaction.reply({ content: '❌ That\'s this server.', flags: 64 });
    const { error } = await supabase
      .from('network_blocks')
      .upsert({ guild_id: interaction.guildId, blocked_guild_id: targetId, created_by_discord_id: interaction.user.id }, { onConflict: 'guild_id,blocked_guild_id' });
    if (error) return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    return interaction.reply({ content: '⛔ Blocked. You won\'t see that server\'s clubs or requests and they can\'t reach you. They aren\'t told. Undo it in **/manager → Admin → Network Status**.', flags: 64 });
  }

  async function openReport(interaction, targetId, context) {
    if (!(await canModerate(interaction))) return interaction.reply({ content: '❌ Only managers can report servers.', flags: 64 });
    const modal = new ModalBuilder()
      .setCustomId(`nw_repsend:${targetId}:${(context || '').slice(0, 40)}`)
      .setTitle('Report a server')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('What happened?').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  async function sendReport(interaction, targetId, context) {
    const limited = await overLimit(interaction.guildId, 'report', interaction.user.id);
    if (limited) return interaction.reply({ content: `⏳ ${limited}`, flags: 64 });
    const reason = cleanText(interaction.fields.getTextInputValue('reason'), 500) || 'No reason given';
    const { data: report, error } = await supabase
      .from('network_reports')
      .insert({ reporter_guild_id: interaction.guildId, reporter_discord_id: interaction.user.id, reported_guild_id: targetId, context: context || null, reason })
      .select('id')
      .single();
    if (error) return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    await logActivity(interaction.guildId, 'report', interaction.user.id);
    const suspendedAfter = await autoSuspend(interaction.client, targetId).catch((err) => {
      console.warn(`[network] auto-suspend check failed: ${err.message}`);
      return null;
    });
    await notifyOwners(interaction.client, report.id, interaction.guildId, targetId, context, reason, suspendedAfter);
    return interaction.reply({ content: '🚩 Thanks, the GafferBot team will look at it. If you don\'t want to hear from that server meanwhile, block it from the same menu.', flags: 64 });
  }

  // Reports go to NETWORK_REPORTS_CHANNEL_ID if set, otherwise to the bot owners' DMs
  async function notifyOwners(client, reportId, fromId, targetId, context, reason, suspendedAfter = null) {
    const name = (id) => `${client.guilds.cache.get(id)?.name || 'Unknown server'} (${id})`;
    const { count } = await supabase.from('network_reports').select('id', { count: 'exact', head: true }).eq('reported_guild_id', targetId);
    const embed = new EmbedBuilder()
      .setTitle('🚩 GafferBot Network report')
      .setColor(0xed4245)
      .addFields(
        { name: 'Reported', value: name(targetId) },
        { name: 'By', value: name(fromId) },
        { name: 'About', value: context || 'Not given', inline: true },
        { name: 'Reports against them', value: String(count || 1), inline: true },
        { name: 'Reason', value: reason.slice(0, 1000) },
        ...(suspendedAfter ? [{ name: 'Automatically suspended', value: `Reported by ${suspendedAfter} servers in 30 days. Lift it with Owner: Network Suspend and an empty reason.` }] : [])
      )
      .setFooter({ text: `Report ${reportId} · suspend with /manager → Admin → Owner: Network Suspend` });
    await notifyHost(client, { embeds: [embed] });
  }

  // The host's queue (reports, BYOT disputes): NETWORK_REPORTS_CHANNEL_ID if set, else the bot owners' DMs
  async function notifyHost(client, payload) {
    const channelId = process.env.NETWORK_REPORTS_CHANNEL_ID;
    try {
      if (channelId) {
        const ch = await client.channels.fetch(channelId);
        if (ch?.isTextBased()) return void (await ch.send(payload));
      }
    } catch (err) {
      console.warn(`[network] host channel failed: ${err.message}`);
    }
    for (const id of ownerIds()) {
      try {
        const user = await client.users.fetch(id);
        await user.send(payload);
      } catch (err) {
        console.warn(`[network] could not DM owner ${id}: ${err.message}`);
      }
    }
  }

  async function unblock(interaction, targetId) {
    if (!(await canModerate(interaction))) return interaction.reply({ content: '❌ Only managers can unblock servers.', flags: 64 });
    await supabase.from('network_blocks').delete().eq('guild_id', interaction.guildId).eq('blocked_guild_id', targetId);
    return interaction.reply({ content: '✅ Unblocked. You\'ll see that server\'s clubs and requests again.', flags: 64 });
  }

  // Kick-off typed by a manager, read in the server's timezone ("now" = now). Null when unreadable.
  async function kickoffFor(guildId, text) {
    const { data: prefs } = await supabase.from('guild_settings').select('timezone').eq('guild_id', guildId).maybeSingle();
    const tz = T.isValidTimeZone(prefs?.timezone) ? prefs.timezone : 'UTC';
    const raw = String(text || '').trim();
    if (!raw || raw.toLowerCase() === 'now') return new Date();
    return T.parseWhen(raw, tz) || null;
  }

  // Post into a server's network channel; falls back to a DM to fallbackUserId. Returns the message.
  async function postToChannel(client, guildId, payload, fallbackUserId) {
    const row = await serverRow(guildId);
    const guild = client?.guilds?.cache?.get(guildId);
    if (guild && row?.channel_id) {
      const channel = guild.channels.cache.get(row.channel_id) || (await guild.channels.fetch(row.channel_id).catch(() => null));
      if (channel && !missingChannelPerms(channel, guild.members.me).length) {
        const sent = await channel.send({ allowedMentions: { parse: [] }, ...payload }).catch(() => null);
        if (sent) return sent;
      }
    }
    if (!fallbackUserId) return null;
    const user = await client.users.fetch(fallbackUserId).catch(() => null);
    return user ? await user.send(payload).catch(() => null) : null;
  }

  // ---------- Routing ----------

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand?.()) {
      if (interaction.commandName !== 'network') return false;
      if (!interaction.guildId) {
        await interaction.reply({ content: '❌ Use this in your club\'s server.', flags: 64 });
        return true;
      }
      const sub = interaction.options.getSubcommand();
      if (!isOn() && sub !== 'suspend') {
        await interaction.reply({ content: OFF_MSG, flags: 64 });
        return true;
      }
      if (sub === 'setup') await handleSetup(interaction);
      else if (sub === 'status') await handleStatus(interaction);
      else if (sub === 'clubs') await handleClubs(interaction);
      else if (sub === 'suspend') await handleSuspend(interaction);
      else if (subcommandHandlers[sub]) await subcommandHandlers[sub](interaction);
      else return false;
      return true;
    }
    const id = interaction.customId || '';
    if (!id.startsWith('nw_')) return false;
    if (!isOn()) {
      await interaction.reply({ content: OFF_MSG, flags: 64 });
      return true;
    }
    const [action, a, b] = id.split(':');
    if (interaction.isStringSelectMenu?.() && action === 'nw_mod') {
      const [kind, target] = String(interaction.values[0] || '').split(':');
      if (!/^\d{15,22}$/.test(target || '')) await interaction.reply({ content: 'This menu has expired.', flags: 64 });
      else if (kind === 'blk') await blockServer(interaction, target);
      else await openReport(interaction, target, a);
    } else if (interaction.isStringSelectMenu?.() && action === 'nw_unblock') await unblock(interaction, interaction.values[0]);
    else if (interaction.isModalSubmit?.() && action === 'nw_repsend') await sendReport(interaction, a, b);
    else if (componentHandlers[action]) await componentHandlers[action](interaction, a, b);
    else return false;
    return true;
  }

  return {
    commands: NETWORK_COMMANDS,
    handleInteraction,
    // For the replacement, friendly and BYOT slices
    isOn,
    isListed,
    serverRow,
    visibleServers,
    isBlockedBetween,
    clubDirectory,
    serverLabel,
    moderationSelect,
    overLimit,
    logActivity,
    cleanText,
    postToChannel,
    kickoffFor,
    notifyHost,
    addSubcommand: (name, fn) => {
      subcommandHandlers[name] = fn;
    },
    addComponent: (action, fn) => {
      componentHandlers[action] = fn;
    },
  };
}

module.exports = { createNetwork, NETWORK_COMMANDS, cleanText, visibleServerIds, clubLine, joinProblem, PLATFORMS, REGIONS, DAILY_LIMITS, USER_DAILY_LIMITS };
