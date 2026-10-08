// Club events: /event (new, list, cancel, remind, presets, recurring series, timezone) and /available.
// Each event announces @everyone once and posts a counts-only live availability board.
// The scheduler posts recurring events, reminds non-responders before the deadline and
// closes events after they finish.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const { resolveClub, activeClubs } = require('./manager-hub.cjs');
const { missingChannelPerms, canPingRole, missingPermsMessage } = require('./perm-check.cjs');
const T = require('./event-time.cjs');
const { FORMATION_SLOTS } = require('./lineup-autofill.cjs');
const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// "433", "4-3-3", "4-3-3 flat" -> "4-3-3 FLAT"
function matchFormation(text) {
  if (!text) return null;
  const names = Object.keys(FORMATION_SLOTS);
  const t = String(text).toUpperCase().trim();
  const exact = names.find((n) => n === t);
  if (exact) return exact;
  const squash = (x) => x.replace(/[^0-9A-Z]/g, '');
  return names.find((n) => squash(n) === squash(t)) || names.find((n) => squash(n).startsWith(squash(t))) || null;
}

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const EVENT_TYPES = {
  league: { label: 'League match', emoji: '🏆', color: 0xf1c40f },
  friendly: { label: 'Friendly', emoji: '🤝', color: 0x57f287 },
  scrim: { label: 'Scrim', emoji: '⚔️', color: 0xeb459e },
  training: { label: 'Training', emoji: '🏃', color: 0x3498db },
  tryout: { label: 'Tryout', emoji: '🎯', color: 0xe67e22 },
  tournament: { label: 'Tournament', emoji: '🏟️', color: 0x9b59b6 },
  match: { label: 'Match', emoji: '⚽', color: 0x5865f2 },
  practice: { label: 'Training', emoji: '🏃', color: 0x3498db },
  draft: { label: 'Draft night', emoji: '🎲', color: 0x5865f2 },
};
const RESPONSES = {
  yes: { label: 'Available', emoji: '✅', style: ButtonStyle.Success },
  maybe: { label: 'Maybe', emoji: '❓', style: ButtonStyle.Secondary },
  no: { label: "Can't make it", emoji: '❌', style: ButtonStyle.Danger },
};
const ROSTER_OUT = { injured: '🚑', away: '✈️', inactive: '💤' };
const DEFAULT_DEADLINE_MINUTES = 60;
const REMIND_LEAD_MS = 3 * 60 * 60 * 1000;
const MANUAL_REMIND_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_PRESETS = 25;
const MAX_SIGNUP_POSITIONS = 3;
const PREFS_TTL_MS = 5 * 60 * 1000;

const EVENT_COMMANDS = [
  {
    name: 'event',
    description: 'Schedule club events and collect availability.',
    options: [
      {
        type: 1,
        name: 'new',
        description: 'Post an event with Available / Maybe / Out buttons.',
        options: [
          { name: 'when', description: 'Kick-off, e.g. "thu 9pm", "tomorrow 20:00", "21/09 18:00". Pick the preview to confirm.', type: 3, required: false, autocomplete: true },
          { name: 'title', description: 'Event title (defaults to club + type).', type: 3, required: false },
          {
            name: 'type',
            description: 'Event type.',
            type: 3,
            required: false,
            choices: ['league', 'friendly', 'scrim', 'training', 'tryout', 'tournament', 'match'].map((v) => ({ name: EVENT_TYPES[v].label, value: v })),
          },
          { name: 'formation', description: 'Formation for the lineup, e.g. 4-3-3, 4-2-3-1 wide.', type: 3, required: false, autocomplete: true },
          { name: 'preset', description: 'Start from a saved preset.', type: 3, required: false, autocomplete: true },
          { name: 'deadline', description: 'Answer by, e.g. "2h" before kick-off or "wed 6pm". Default 1h before.', type: 3, required: false },
          {
            name: 'repeat',
            description: 'Post this event again automatically.',
            type: 3,
            required: false,
            choices: [
              { name: 'Weekly', value: '1' },
              { name: 'Every 2 weeks', value: '2' },
            ],
          },
          { name: 'ping', description: 'Role to ping and remind (used when the club has no roster).', type: 8, required: false },
          { name: 'channel', description: 'Where to post (defaults to here).', type: 7, required: false, channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
          { name: 'positions', description: 'Ask players which position they are signing up for (on by default for tryouts).', type: 5, required: false },
          { name: 'club', description: 'Which club (only needed on servers with several).', type: 3, required: false, autocomplete: true },
          { name: 'description', description: 'Details, e.g. opponent or lobby code.', type: 3, required: false },
        ],
      },
      { type: 1, name: 'list', description: 'Upcoming events and recurring series.' },
      {
        type: 1,
        name: 'cancel',
        description: 'Cancel an event and tell everyone who said they could play.',
        options: [{ name: 'event', description: 'The event.', type: 3, required: true, autocomplete: true }],
      },
      {
        type: 1,
        name: 'remind',
        description: 'Nudge everyone who has not answered yet.',
        options: [{ name: 'event', description: 'The event.', type: 3, required: true, autocomplete: true }],
      },
      {
        type: 1,
        name: 'edit',
        description: 'Change an event\'s time, title, deadline or details. The board updates in place.',
        options: [
          { name: 'event', description: 'The event.', type: 3, required: true, autocomplete: true },
          { name: 'when', description: 'New kick-off, e.g. "thu 9pm" or "21/09 18:00".', type: 3, required: false, autocomplete: true },
          { name: 'title', description: 'New title.', type: 3, required: false },
          { name: 'deadline', description: 'Answer by, e.g. "2h" before kick-off or "wed 6pm".', type: 3, required: false },
          { name: 'description', description: 'New details, e.g. opponent or lobby code.', type: 3, required: false },
        ],
      },
      {
        type: 1,
        name: 'close',
        description: 'Stop taking answers for an event (leaders can still mark players).',
        options: [{ name: 'event', description: 'The event.', type: 3, required: true, autocomplete: true }],
      },
      {
        type: 1,
        name: 'reopen',
        description: 'Take answers again for an event you closed.',
        options: [{ name: 'event', description: 'The event.', type: 3, required: true, autocomplete: true }],
      },
      {
        type: 1,
        name: 'post',
        description: 'Post the event board again here (or in a channel), e.g. after it scrolled away.',
        options: [
          { name: 'event', description: 'The event.', type: 3, required: true, autocomplete: true },
          { name: 'channel', description: 'Where to post (defaults to here).', type: 7, required: false, channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
        ],
      },
      {
        type: 1,
        name: 'mark',
        description: "Set or clear a player's answer for them.",
        options: [
          { name: 'event', description: 'The event.', type: 3, required: true, autocomplete: true },
          { name: 'user', description: 'The player.', type: 6, required: true },
          {
            name: 'answer',
            description: 'Their answer.',
            type: 3,
            required: true,
            choices: [
              { name: 'Available', value: 'yes' },
              { name: 'Maybe', value: 'maybe' },
              { name: "Can't make it", value: 'no' },
              { name: 'Clear their answer', value: 'clear' },
            ],
          },
          { name: 'position', description: 'Position they will play (for position sign-ups).', type: 3, required: false },
        ],
      },
      {
        type: 1,
        name: 'timezone',
        description: 'Set the timezone plain times like "9pm" are read in.',
        options: [{ name: 'zone', description: 'e.g. Europe/London, America/Chicago.', type: 3, required: true, autocomplete: true }],
      },
      {
        type: 2,
        name: 'preset',
        description: 'Saved event templates.',
        options: [
          {
            type: 1,
            name: 'save',
            description: 'Save (or overwrite) a preset.',
            options: [
              { name: 'name', description: 'Preset name, e.g. "League night".', type: 3, required: true },
              { name: 'title', description: 'Event title.', type: 3, required: true },
              {
                name: 'type',
                description: 'Event type.',
                type: 3,
                required: false,
                choices: ['league', 'friendly', 'scrim', 'training', 'tryout', 'tournament', 'match'].map((v) => ({ name: EVENT_TYPES[v].label, value: v })),
              },
              { name: 'time', description: 'Usual kick-off, e.g. "21:00" or "thu 21:00".', type: 3, required: false },
              { name: 'deadline', description: 'Answer by, before kick-off, e.g. "2h".', type: 3, required: false },
              { name: 'ping', description: 'Role to ping.', type: 8, required: false },
              { name: 'channel', description: 'Channel to post in.', type: 7, required: false, channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
              { name: 'positions', description: 'Ask for a position when players sign up.', type: 5, required: false },
              { name: 'description', description: 'Details.', type: 3, required: false },
            ],
          },
          { type: 1, name: 'list', description: 'Show saved presets.' },
          {
            type: 1,
            name: 'delete',
            description: 'Delete a preset.',
            options: [{ name: 'name', description: 'The preset.', type: 3, required: true, autocomplete: true }],
          },
        ],
      },
      {
        type: 2,
        name: 'series',
        description: 'Recurring events.',
        options: [
          { type: 1, name: 'list', description: 'Show recurring events.' },
          {
            type: 1,
            name: 'stop',
            description: 'Stop a recurring event (already posted ones stay).',
            options: [{ name: 'series', description: 'The series.', type: 3, required: true, autocomplete: true }],
          },
        ],
      },
    ],
  },
  { name: 'available', description: 'Answer your upcoming events in one place.' },
];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// The title wins: "Practice", "BYOT" or "League" in the name tells members what the night is,
// even when the stored type is the generic "match".
function typeInfo(type, title) {
  const t = String(title || '').toLowerCase();
  if (/\b(practice|training|session)\b/.test(t)) return EVENT_TYPES.training;
  if (/\b(byot|tournament|cup|playoff)\b/.test(t)) return { ...EVENT_TYPES.tournament, label: /byot/.test(t) ? 'BYOT tournament' : 'Tournament' };
  if (/\bleague\b/.test(t)) return EVENT_TYPES.league;
  if (/\bscrim\b/.test(t)) return EVENT_TYPES.scrim;
  if (/\bfriendly\b/.test(t)) return EVENT_TYPES.friendly;
  if (/\btry ?outs?\b/.test(t)) return EVENT_TYPES.tryout;
  return EVENT_TYPES[type] || EVENT_TYPES.match;
}

function messageLink(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function whenExamples(tz) {
  return `Try "thu 9pm", "tomorrow 20:00", "21/09 18:00", "21 sep 8pm" or "in 2h" (read as ${tz} time; change it with **/manager → Events → Timezone**). As you type, the box above the keyboard shows how I read it.`;
}

// When a typed time can't be read, offer real kick-off times to tap instead of making the
// manager retype. The failed form is stashed under a token; picking a time re-runs it.
const pendingWhen = new Map(); // token -> { at, userId, kind, rec }
const WHEN_PICK_TTL = 15 * 60 * 1000;

function captureOptions(interaction) {
  const rec = { strings: {}, roles: {}, channels: {}, booleans: {} };
  const o = interaction.options;
  if (!o) return rec;
  for (const [method, key] of [['getString', 'strings'], ['getRole', 'roles'], ['getChannel', 'channels'], ['getBoolean', 'booleans']]) {
    if (typeof o[method] !== 'function') continue;
    const orig = o[method].bind(o);
    o[method] = (n, ...rest) => {
      const v = orig(n, ...rest);
      if (v != null) rec[key][n] = key === 'roles' || key === 'channels' ? v.id : v;
      return v;
    };
  }
  return rec;
}

function whenPicker(tz, token, whenText) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const picks = ['tonight 21:00', 'tomorrow 20:00', ...[1, 2, 3, 4, 5, 6].map((d) => `${T.WEEKDAYS[(T.localParts(now, tz).weekday + d) % 7]} 20:00`)];
  const seen = new Set();
  const options = [];
  for (const p of picks) {
    const at = T.parseWhen(p, tz, now);
    if (!at || at <= now || seen.has(T.unix(at))) continue;
    seen.add(T.unix(at));
    options.push({ label: fmt.format(at).slice(0, 100), value: String(T.unix(at)) });
  }
  const menu = new StringSelectMenuBuilder().setCustomId(`ev_when:${token}`).setPlaceholder('⚡ Pick a kick-off time instead').addOptions(options.slice(0, 25));
  return {
    content:
      `❌ I couldn't read "${whenText}".\n\n**Pick a time below, or type it how you'd say it:**\n` +
      '• `thu 9pm` or `friday 20:30`\n• `tomorrow 8pm` / `tonight 9pm`\n• `21/09 18:00` or `21 sep 8pm`\n• `in 2h`\n' +
      `(read as ${tz} time — change it in **/manager → Events → Timezone**)`,
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: 64,
  };
}

function stashWhen(interaction, kind, rec) {
  for (const [token, p] of pendingWhen) if (Date.now() - p.at > WHEN_PICK_TTL) pendingWhen.delete(token);
  const token = Math.random().toString(36).slice(2, 10);
  pendingWhen.set(token, { at: Date.now(), userId: interaction.user.id, kind, rec });
  return token;
}

function createEvents(deps) {
  const { supabase, getGuildState, saveGuildSettings, isManager, dashboardUrl } = deps;
  const canManageClub = deps.canManageClub || (async (member) => isManager(member));
  let client = null;
  let ticking = false;
  const prefsCache = new Map();
  const memberFetchAt = new Map();
  const manualRemindAt = new Map();
  // Set by matchnight.cjs: show-up rates worth flagging next to a player's answer
  let reliabilityLookup = async () => new Map();

  // ---------- Server preferences ----------

  async function serverPrefs(guildId) {
    const cached = prefsCache.get(guildId);
    if (cached && Date.now() - cached.at < PREFS_TTL_MS) return cached.value;
    const { data } = await supabase.from('guild_settings').select('timezone, branding').eq('guild_id', guildId).maybeSingle();
    const value = {
      timezone: T.isValidTimeZone(data?.timezone) ? data.timezone : 'UTC',
      branding: data?.branding || {},
    };
    prefsCache.set(guildId, { at: Date.now(), value });
    return value;
  }

  function forgetPrefs(guildId) {
    prefsCache.delete(guildId);
  }

  // ---------- Lookups ----------

  async function loadEvent(eventId) {
    if (!/^[0-9a-f-]{36}$/i.test(eventId || '')) return null;
    const { data } = await supabase.from('availability_events').select('*').eq('id', eventId).maybeSingle();
    return data;
  }

  async function loadResponses(eventId) {
    const { data } = await supabase
      .from('player_availability')
      .select('discord_user_id, response, responded_at, position, note')
      .eq('event_id', eventId)
      .order('responded_at', { ascending: true });
    return (data || []).filter((r) => r.response !== 'no_response');
  }

  // Events a leader closed to new answers, kept on the club in the saved server settings
  // (like autopilot's settings), so no extra column is needed
  async function isLocked(event) {
    if (!event.club_key) return false;
    const state = await getGuildState(event.guild_id);
    const club = state?.clubs?.find((c) => c.key === event.club_key);
    return (club?.locked_events || []).includes(event.id);
  }

  async function setLocked(event, locked) {
    const state = await getGuildState(event.guild_id);
    const club = state?.clubs?.find((c) => c.key === event.club_key);
    if (!club || !saveGuildSettings) throw new Error('Only club events can be closed to answers.');
    const ids = new Set(club.locked_events || []);
    if (locked) ids.add(event.id);
    else ids.delete(event.id);
    club.locked_events = [...ids].slice(-50);
    await saveGuildSettings(event.guild_id, state);
  }

  async function clubFor(guildId, clubKey) {
    const state = await getGuildState(guildId);
    return activeClubs(state).find((c) => c.key === clubKey) || null;
  }

  async function rosterFor(club) {
    if (!club?.team_id) return [];
    const { data } = await supabase
      .from('team_rosters')
      .select('discord_user_id, role, status, primary_position')
      .eq('team_id', club.team_id);
    return data || [];
  }

  // Who should answer: the club roster when it has one, otherwise members of the ping role.
  // Injured, away and inactive players are listed but not chased.
  async function expectedPlayers(event) {
    const club = event.club_key ? await clubFor(event.guild_id, event.club_key) : null;
    const roster = await rosterFor(club);
    if (roster.length) {
      const expected = roster.filter((r) => !ROSTER_OUT[r.status]).map((r) => r.discord_user_id);
      const out = roster.filter((r) => ROSTER_OUT[r.status]).map((r) => ({ id: r.discord_user_id, status: r.status }));
      return { expected, out, source: 'roster' };
    }
    if (event.ping_role_id && client) {
      const guild = client.guilds.cache.get(event.guild_id);
      const role = guild?.roles.cache.get(event.ping_role_id);
      if (role) {
        // Role members come from the member cache; fill it at most every 10 minutes
        const last = memberFetchAt.get(guild.id) || 0;
        if (Date.now() - last > 10 * 60 * 1000) {
          memberFetchAt.set(guild.id, Date.now());
          await guild.members.fetch().catch(() => {});
        }
        return { expected: role.members.filter((m) => !m.user.bot).map((m) => m.id), out: [], source: 'role' };
      }
    }
    return { expected: [], out: [], source: 'none' };
  }

  // Every non-bot member of the server (cached; refilled at most every 10 minutes).
  // Used so "Still to answer" covers everyone the @everyone ping reached, not just the roster.
  async function allMemberIds(event) {
    if (!client) return null;
    const guild = client.guilds.cache.get(event.guild_id);
    if (!guild) return null;
    const last = memberFetchAt.get(guild.id) || 0;
    if (Date.now() - last > 10 * 60 * 1000) {
      memberFetchAt.set(guild.id, Date.now());
      await guild.members.fetch().catch(() => {});
    }
    const ids = guild.members.cache.filter((m) => !m.user.bot).map((m) => m.id);
    return ids.length ? ids : null;
  }

  // Compact mention list for an embed field: names, then "+N more" past 12
  function mentionList(ids, cap = 12) {
    const shown = ids.slice(0, cap).map((id) => `<@${id}>`).join(', ');
    return ids.length > cap ? `${shown} … +${ids.length - cap} more` : shown;
  }

  // ---------- Board ----------

  async function buildBoard(event) {
    const prefs = await serverPrefs(event.guild_id);
    const info = typeInfo(event.event_type);
    const club = event.club_key ? await clubFor(event.guild_id, event.club_key) : null;
    const responses = await loadResponses(event.id);
    const { expected } = await expectedPlayers(event);
    const deadline = event.deadline_at ? new Date(event.deadline_at) : null;
    const kickoff = T.unix(event.scheduled_at);
    const locked = !event.closed && (await isLocked(event));

    const lines = [`🗓️ <t:${kickoff}:F> (<t:${kickoff}:R>)`, `${info.emoji} ${info.label}${club ? ` · ${club.name}` : ''}`];
    if (event.cancelled) lines.unshift('**❌ Cancelled**');
    else if (event.closed) lines.unshift('**Finished.** Answers are closed.');
    else if (locked) lines.unshift('🔒 **Answers are closed.** Ask a club leader if yours needs changing.');
    else if (deadline) {
      lines.push(
        deadline > new Date()
          ? `⏰ Answer by <t:${T.unix(deadline)}:f> (<t:${T.unix(deadline)}:R>)`
          : '⏰ The deadline has passed. Late answers still count but are marked.'
      );
    }
    if (event.formation) lines.push(`📐 Formation: **${event.formation}**`);
    if (event.series_id) lines.push('🔁 Repeats automatically');
    if (event.position_signup) lines.push(`🎯 Pick up to ${MAX_SIGNUP_POSITIONS} positions when you tap Available`);
    if (event.description) lines.push('', event.description);

    const embed = new EmbedBuilder()
      .setTitle(`${info.emoji} ${event.title}`)
      .setColor(event.cancelled ? 0x99aab5 : Number(prefs.branding.color) || info.color)
      .setDescription(truncate(lines.join('\n'), 4000))
      .setFooter({ text: `${prefs.branding.footer || 'GafferBot'} · event ${event.id.slice(0, 8)}` });

    // Names are shown for everyone who has answered; "Still to answer" covers the whole server
    const answered = new Set(responses.map((r) => r.discord_user_id));
    const byResponse = {};
    for (const r of responses) {
      (byResponse[r.response] = byResponse[r.response] || []).push(r.discord_user_id);
    }
    const availLines = Object.entries(RESPONSES)
      .map(([key, r]) => {
        const ids = byResponse[key] || [];
        return ids.length ? `${r.emoji} **${ids.length}** ${r.label}\n${mentionList(ids)}` : `${r.emoji} **0** ${r.label}`;
      })
      .join('\n');
    embed.addFields({ name: 'Availability', value: truncate(availLines, 1020) });

    if (event.position_signup) {
      const counts = {};
      for (const r of responses) {
        if (r.response !== 'yes' || !r.position) continue;
        for (const p of r.position.split(',')) counts[p] = (counts[p] || 0) + 1;
      }
      const byPos = POSITIONS.filter((p) => counts[p]).map((p) => `${p} ${counts[p]}`).join(' · ');
      if (byPos) embed.addFields({ name: 'By position', value: byPos });
    }

    const everyone = (await allMemberIds(event)) || expected;
    const waiting = everyone.filter((id) => !answered.has(id));
    if (waiting.length && !event.closed && !locked) {
      embed.addFields({
        name: '⏳ Still to answer',
        value: `**${waiting.length}** player${waiting.length === 1 ? '' : 's'}\n${mentionList(waiting)}`,
      });
    }
    embed.addFields({ name: '\u200b', value: '*Anyone in the server can answer. Tap 👥 Who\'s in for the full list with notes.*' });

    const components = [];
    if (!event.closed && !locked) {
      components.push(
        new ActionRowBuilder().addComponents(
          Object.entries(RESPONSES).map(([key, r]) =>
            new ButtonBuilder().setCustomId(`ev_r:${key}:${event.id}`).setLabel(r.label).setEmoji(r.emoji).setStyle(r.style)
          )
        )
      );
      const tools = [
        new ButtonBuilder().setCustomId(`ev_list:${event.id}`).setLabel("Who's in").setEmoji('👥').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ev_note:${event.id}`).setLabel('Add a note').setEmoji('📝').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`evl_build:${event.id}`).setLabel('Build Lineup').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ev_remind:${event.id}`).setLabel('Remind').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
      ];
      if (dashboardUrl) {
        tools.push(
          new ButtonBuilder()
            .setURL(`${dashboardUrl.replace(/\/$/, '')}/teams?event=${event.id}`)
            .setLabel('Lineup on website')
            .setStyle(ButtonStyle.Link)
        );
      }
      components.push(new ActionRowBuilder().addComponents(tools));
    }
    return { embeds: [embed], components, allowedMentions: { parse: [] } };
  }

  async function fetchBoardMessage(event) {
    if (!client || !event.channel_id || !event.message_id) return null;
    const channel = await client.channels.fetch(event.channel_id).catch(() => null);
    if (!channel?.messages) return null;
    return channel.messages.fetch(event.message_id).catch(() => null);
  }

  async function refreshBoard(event) {
    const message = await fetchBoardMessage(event);
    if (!message) return false;
    await message.edit(await buildBoard(event)).catch((err) => console.warn(`[events] board edit failed: ${err.message}`));
    return true;
  }

  // ---------- Create ----------

  async function postEvent(fields, channel) {
    const { data: event, error } = await supabase.from('availability_events').insert(fields).select().single();
    if (error) throw new Error(error.message);
    try {
      const message = await channel.send({
        ...(await buildBoard(event)),
        content: '@everyone',
        allowedMentions: { parse: ['everyone'], users: [], roles: [], repliedUser: false },
      });
      await supabase.from('availability_events').update({ message_id: message.id }).eq('id', event.id);
      event.message_id = message.id;
    } catch (err) {
      await supabase.from('availability_events').delete().eq('id', event.id);
      throw err;
    }
    return event;
  }

  async function loadPreset(guildId, name) {
    if (!name) return null;
    const { data } = await supabase.from('event_presets').select('*').eq('guild_id', guildId).ilike('name', name).maybeSingle();
    return data;
  }

  function presetKickoff(preset, tz) {
    if (!preset?.time_of_day) return null;
    const time = T.parseTimeOfDay(preset.time_of_day);
    if (!time) return null;
    if (preset.weekday !== null && preset.weekday !== undefined) return T.nextWeekdayAt(preset.weekday, time, tz);
    return T.parseWhen(preset.time_of_day, tz);
  }

  async function handleNew(interaction) {
    const rec = captureOptions(interaction);
    const guildId = interaction.guildId;
    const state = await getGuildState(guildId);
    const clubKey = interaction.options.getString('club');
    const club = resolveClub(state, interaction.member, clubKey);
    if (!club) return interaction.reply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.', flags: 64 });
    if (!(await canManageClub(interaction.member, club))) {
      return interaction.reply({ content: `❌ Only ${club.name}'s leaders can create events.`, flags: 64 });
    }

    const { timezone: tz } = await serverPrefs(guildId);
    const presetName = interaction.options.getString('preset');
    const preset = await loadPreset(guildId, presetName);
    if (presetName && !preset) return interaction.reply({ content: `❌ No preset called **${presetName}**. See **/manager → Events → Presets**.`, flags: 64 });

    const whenText = interaction.options.getString('when');
    const kickoff = whenText ? T.parseWhen(whenText, tz) : presetKickoff(preset, tz);
    if (!kickoff) {
      if (!whenText) return interaction.reply({ content: `❌ Tell me when it kicks off. ${whenExamples(tz)}`, flags: 64 });
      return interaction.reply(whenPicker(tz, stashWhen(interaction, 'new', rec), whenText));
    }
    const now = new Date();
    if (kickoff.getTime() < now.getTime() - 5 * 60000) {
      return interaction.reply({ content: `❌ <t:${T.unix(kickoff)}:F> is in the past. ${whenExamples(tz)}`, flags: 64 });
    }

    const type = interaction.options.getString('type') || preset?.event_type || 'match';
    const title = (interaction.options.getString('title') || preset?.title || `${club.name} ${typeInfo(type).label}`).slice(0, 100);
    const deadlineText = interaction.options.getString('deadline');
    let deadline;
    if (deadlineText) {
      deadline = T.parseDeadline(deadlineText, kickoff, tz);
      if (!deadline) return interaction.reply({ content: `❌ I couldn't read the deadline "${deadlineText}". Use "2h" (before kick-off) or a time like "wed 6pm".`, flags: 64 });
    } else {
      const minutes = preset?.deadline_minutes ?? DEFAULT_DEADLINE_MINUTES;
      deadline = new Date(kickoff.getTime() - minutes * 60000);
    }
    if (deadline > kickoff) deadline = kickoff;
    if (deadline < now) deadline = kickoff;

    const role = interaction.options.getRole('ping') || (preset?.ping_role_id ? interaction.guild.roles.cache.get(preset.ping_role_id) : null);
    const channelOpt = interaction.options.getChannel('channel');
    const channel =
      channelOpt ||
      (preset?.channel_id ? await interaction.guild.channels.fetch(preset.channel_id).catch(() => null) : null) ||
      (club?.events_channel_id ? await interaction.guild.channels.fetch(club.events_channel_id).catch(() => null) : null) ||
      interaction.channel;
    const me = interaction.guild.members.me;
    const missing = missingChannelPerms(channel, me);
    if (missing.length) return interaction.reply({ content: missingPermsMessage(channel, missing), flags: 64 });
    if (role && !canPingRole(channel, me, role)) {
      return interaction.reply({
        content: `❌ I can't ping ${role} in <#${channel.id}>. Make the role mentionable or give me **Mention @everyone, @here and All Roles** there.`,
        flags: 64,
      });
    }

    const formationText = interaction.options.getString('formation');
    const formation = formationText ? matchFormation(formationText) : null;
    if (formationText && !formation) return interaction.reply({ content: `❌ I don't know the formation "${formationText}". Try something like 4-3-3 or 4-2-3-1 wide.`, flags: 64 });
    const positionsOpt = interaction.options.getBoolean('positions');
    const positionSignup = positionsOpt ?? (preset ? preset.position_signup : type === 'tryout');
    const description = (interaction.options.getString('description') || preset?.description || '').slice(0, 1000) || null;
    const repeatWeeks = Number(interaction.options.getString('repeat') || 0);
    const durationMinutes = preset?.duration_minutes || 90;

    await interaction.deferReply({ flags: 64 });

    let seriesId = null;
    if (repeatWeeks) {
      const { data: series, error } = await supabase
        .from('event_series')
        .insert({
          guild_id: guildId,
          club_key: club.key,
          title,
          event_type: type,
          description,
          channel_id: channel.id,
          ping_role_id: role?.id || null,
          interval_weeks: repeatWeeks,
          next_at: T.addLocalDays(kickoff, 7 * repeatWeeks, tz).toISOString(),
          timezone: tz,
          duration_minutes: durationMinutes,
          deadline_minutes: Math.round((kickoff - deadline) / 60000),
          post_hours_before: repeatWeeks * 168 - 24,
          position_signup: positionSignup,
          created_by_discord_id: interaction.user.id,
        })
        .select('id')
        .single();
      if (error) return interaction.editReply({ content: `❌ Could not save the repeat: ${error.message}` });
      seriesId = series.id;
    }

    let event;
    try {
      event = await postEvent(
        {
          guild_id: guildId,
          club_key: club.key,
          team_id: club.team_id || null,
          series_id: seriesId,
          title,
          description,
          event_type: type,
          scheduled_at: kickoff.toISOString(),
          deadline_at: deadline.toISOString(),
          duration_minutes: durationMinutes,
          ping_role_id: role?.id || null,
          position_signup: positionSignup,
          formation,
          created_by_discord_id: interaction.user.id,
          channel_id: channel.id,
        },
        channel
      );
    } catch (err) {
      if (seriesId) await supabase.from('event_series').delete().eq('id', seriesId);
      return interaction.editReply({ content: `❌ Could not post the event: ${err.message}` });
    }

    const { source } = await expectedPlayers(event);
    const notes = [
      `✅ Posted **${title}** in <#${channel.id}>: ${messageLink(guildId, channel.id, event.message_id)}`,
      `Kick-off <t:${T.unix(kickoff)}:F>, answers due <t:${T.unix(deadline)}:R>.`,
      source === 'none'
        ? 'Tip: add players with **/manager → Roster & Squad → Add Player** (or pick a role with `ping`) so the board shows who has not answered and I can remind them.'
        : 'I will DM anyone who has not answered before the deadline.',
    ];
    if (repeatWeeks) notes.push(`🔁 I'll post the next one ${repeatWeeks === 1 ? 'every week' : 'every 2 weeks'}, a day after the previous kick-off. Stop it with **/manager → Events → Stop Repeating**.`);
    return interaction.editReply({ content: notes.join('\n') });
  }

  // ---------- Respond ----------

  function positionPicker(eventId, current = []) {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ev_pos:${eventId}`)
        .setPlaceholder(`Which positions can you play? (up to ${MAX_SIGNUP_POSITIONS})`)
        .setMinValues(1)
        .setMaxValues(MAX_SIGNUP_POSITIONS)
        .addOptions(POSITIONS.map((p) => ({ label: p, value: p, default: current.includes(p) })))
    );
  }

  async function saveResponse(event, userId, response, position = null) {
    const { error } = await supabase.from('player_availability').upsert(
      {
        event_id: event.id,
        discord_user_id: userId,
        response,
        position: response === 'yes' ? position : null,
        responded_at: new Date().toISOString(),
        auto_marked: false,
      },
      { onConflict: 'event_id,discord_user_id' }
    );
    if (error) throw new Error(error.message);
  }

  // The player's usual positions, best first: roster, then /myprefs
  async function usualPositions(event, userId) {
    const found = [];
    const club = event.club_key ? await clubFor(event.guild_id, event.club_key) : null;
    if (club?.team_id) {
      const { data } = await supabase
        .from('team_rosters')
        .select('primary_position, secondary_position')
        .eq('team_id', club.team_id)
        .eq('discord_user_id', userId)
        .maybeSingle();
      found.push(data?.primary_position, data?.secondary_position);
    }
    const { data: prefs } = await supabase
      .from('position_preferences')
      .select('preferences')
      .eq('guild_id', event.guild_id)
      .eq('user_id', userId)
      .maybeSingle();
    found.push(...(prefs?.preferences || []));
    return [...new Set(found.filter((p) => POSITIONS.includes(p)))].slice(0, MAX_SIGNUP_POSITIONS);
  }

  async function handleResponse(interaction, response, eventId) {
    const event = await loadEvent(eventId);
    if (!event) return interaction.reply({ content: '❌ That event no longer exists.', flags: 64 });
    if (event.closed) return interaction.reply({ content: `❌ **${event.title}** is ${event.cancelled ? 'cancelled' : 'finished'}.`, flags: 64 });
    if (await isLocked(event)) return interaction.reply({ content: `🔒 Answers for **${event.title}** are closed. Ask a club leader if yours needs changing.`, flags: 64 });

    if (response === 'yes' && event.position_signup) {
      const current = await usualPositions(event, interaction.user.id);
      return interaction.reply({
        content: `🎯 **${event.title}**: which positions are you signing up for? Pick up to ${MAX_SIGNUP_POSITIONS}.`,
        components: [positionPicker(event.id, current)],
        flags: 64,
      });
    }

    const onBoard = interaction.message?.id && interaction.message.id === event.message_id;
    if (onBoard) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: 64 });
    try {
      await saveResponse(event, interaction.user.id, response);
    } catch (err) {
      return onBoard ? interaction.followUp({ content: `❌ ${err.message}`, flags: 64 }) : interaction.editReply({ content: `❌ ${err.message}` });
    }
    if (onBoard) await interaction.editReply(await buildBoard(event));
    else {
      await refreshBoard(event);
      await interaction.editReply({ content: `${RESPONSES[response].emoji} You're down as **${RESPONSES[response].label}** for **${event.title}**.` });
    }
  }

  async function handlePositionPick(interaction, eventId) {
    const event = await loadEvent(eventId);
    if (!event || event.closed || (await isLocked(event))) return interaction.update({ content: '❌ That event is closed.', components: [] });
    const picked = POSITIONS.filter((p) => interaction.values.includes(p)).slice(0, MAX_SIGNUP_POSITIONS);
    try {
      await saveResponse(event, interaction.user.id, 'yes', picked.join(','));
    } catch (err) {
      return interaction.update({ content: `❌ ${err.message}`, components: [] });
    }
    await interaction.update({ content: `✅ You're signed up for **${event.title}** at **${picked.join(', ')}**.`, components: [] });
    await refreshBoard(event);
  }

  // ---------- Reminders ----------

  async function sendReminder(event, { manual = false } = {}) {
    const responses = await loadResponses(event.id);
    const answered = new Set(responses.map((r) => r.discord_user_id));
    const { expected, source } = await expectedPlayers(event);
    const waiting = expected.filter((id) => !answered.has(id));
    const kickoff = T.unix(event.scheduled_at);
    const due = event.deadline_at ? T.unix(event.deadline_at) : kickoff;
    const link = event.message_id ? messageLink(event.guild_id, event.channel_id, event.message_id) : null;

    let dmSent = 0;
    let dmFailed = 0;
    for (const userId of waiting) {
      try {
        const user = await client.users.fetch(userId);
        await user.send({
          content: `⏰ **${event.title}** kicks off <t:${kickoff}:F>. Can you play? Please answer by <t:${due}:R>.${link ? `\n${link}` : ''}`,
          components: [
            new ActionRowBuilder().addComponents(
              Object.entries(RESPONSES).map(([key, r]) =>
                new ButtonBuilder().setCustomId(`ev_r:${key}:${event.id}`).setLabel(r.label).setEmoji(r.emoji).setStyle(r.style)
              )
            ),
          ],
        });
        dmSent++;
      } catch {
        dmFailed++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // One channel nudge under the board for anyone with DMs closed (and as a visible reminder)
    const board = await fetchBoardMessage(event);
    if (board && (waiting.length || source === 'none')) {
      const content = waiting.length
        ? `⏰ Still waiting on ${waiting.map((id) => `<@${id}>`).join(' ')}. Answer on the post above by <t:${due}:R>.`
        : `⏰ Answers for **${event.title}** close <t:${due}:R>. Tap a button on the post above.`;
      await board.reply({ content: truncate(content, 2000), allowedMentions: { users: waiting.slice(0, 100) } }).catch(() => {});
    }
    if (!manual) await supabase.from('availability_events').update({ deadline_reminder_sent: true }).eq('id', event.id);
    return { waiting: waiting.length, dmSent, dmFailed, source };
  }

  async function handleRemindButton(interaction, eventId) {
    const event = await loadEvent(eventId);
    if (!event || event.closed) return interaction.reply({ content: '❌ That event is closed.', flags: 64 });
    return remindNow(interaction, event);
  }

  async function remindNow(interaction, event) {
    const club = event.club_key ? await clubFor(event.guild_id, event.club_key) : null;
    const allowed = club ? await canManageClub(interaction.member, club) : isManager(interaction.member);
    if (!allowed) return interaction.reply({ content: '❌ Only club leaders can send reminders.', flags: 64 });
    const last = manualRemindAt.get(event.id) || 0;
    if (Date.now() - last < MANUAL_REMIND_COOLDOWN_MS) {
      return interaction.reply({ content: `⏳ A reminder went out <t:${Math.floor(last / 1000)}:R>. Try again in a few minutes.`, flags: 64 });
    }
    manualRemindAt.set(event.id, Date.now());
    await interaction.deferReply({ flags: 64 });
    const result = await sendReminder(event, { manual: true });
    if (result.source === 'none') {
      return interaction.editReply({ content: 'Posted a reminder under the board. Add a roster with **/manager → Roster & Squad → Add Player** (or a ping role) and I can DM the players who have not answered.' });
    }
    return interaction.editReply({
      content: result.waiting
        ? `🔔 Reminded ${result.waiting} player(s): ${result.dmSent} by DM${result.dmFailed ? `, ${result.dmFailed} have DMs closed and were pinged in the channel` : ''}.`
        : '✅ Everyone has answered already.',
    });
  }

  // ---------- List / cancel ----------

  async function upcomingEvents(guildId, limit = 10) {
    const { data } = await supabase
      .from('availability_events')
      .select('*')
      .eq('guild_id', guildId)
      .eq('closed', false)
      .not('club_key', 'is', null)
      .gte('scheduled_at', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(limit);
    return data || [];
  }

  async function buildEventList(guildId) {
    const events = await upcomingEvents(guildId);
    const embed = new EmbedBuilder().setTitle('📅 Upcoming events').setColor(0x5865f2);
    if (!events.length) {
      embed.setDescription('Nothing scheduled. Create one with **/manager → Events → New Event**.');
    } else {
      const ids = events.map((e) => e.id);
      const { data: responses } = await supabase.from('player_availability').select('event_id, response').in('event_id', ids);
      const count = (id, r) => (responses || []).filter((x) => x.event_id === id && x.response === r).length;
      embed.setDescription(
        truncate(
          events
            .map((e) => {
              const link = e.message_id ? ` · [board](${messageLink(guildId, e.channel_id, e.message_id)})` : '';
              return `${typeInfo(e.event_type).emoji} **${e.title}** <t:${T.unix(e.scheduled_at)}:F>\n✅ ${count(e.id, 'yes')} ❓ ${count(e.id, 'maybe')} ❌ ${count(e.id, 'no')}${link}`;
            })
            .join('\n\n'),
          4000
        )
      );
    }
    const { data: series } = await supabase.from('event_series').select('*').eq('guild_id', guildId).eq('active', true).order('next_at');
    if (series?.length) {
      embed.addFields({
        name: '🔁 Recurring',
        value: truncate(
          series.map((s) => `**${s.title}** every ${s.interval_weeks === 1 ? 'week' : `${s.interval_weeks} weeks`}, next <t:${T.unix(s.next_at)}:F>`).join('\n')
        ),
      });
    }
    return { embeds: [embed] };
  }

  async function handleCancel(interaction) {
    const event = await loadEvent(interaction.options.getString('event'));
    if (!event || event.guild_id !== interaction.guildId) return interaction.reply({ content: '❌ Pick an event from the list.', flags: 64 });
    if (event.closed) return interaction.reply({ content: `❌ **${event.title}** is already ${event.cancelled ? 'cancelled' : 'finished'}.`, flags: 64 });
    const club = event.club_key ? await clubFor(event.guild_id, event.club_key) : null;
    if (!(club ? await canManageClub(interaction.member, club) : isManager(interaction.member))) {
      return interaction.reply({ content: '❌ Only club leaders can cancel events.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    await supabase.from('availability_events').update({ cancelled: true, closed: true, updated_at: new Date().toISOString() }).eq('id', event.id);
    const updated = { ...event, cancelled: true, closed: true };
    const board = await fetchBoardMessage(updated);
    let notified = 0;
    if (board) {
      await board.edit(await buildBoard(updated)).catch(() => {});
      const responses = await loadResponses(event.id);
      const players = responses.filter((r) => r.response !== 'no').map((r) => r.discord_user_id);
      notified = players.length;
      await board
        .reply({
          content: `❌ **${event.title}** (<t:${T.unix(event.scheduled_at)}:F>) is cancelled.${players.length ? ` ${players.map((id) => `<@${id}>`).join(' ')}` : ''}`,
          allowedMentions: { users: players.slice(0, 100) },
        })
        .catch(() => {});
    }
    return interaction.editReply({ content: `✅ Cancelled **${event.title}**${notified ? ` and pinged the ${notified} who said they could play` : ''}.` });
  }

  // ---------- Leader tools: edit, close/reopen, re-post, mark a player ----------

  // The open event picked in the command, if this member may run it. Replies and returns null otherwise.
  async function leaderEvent(interaction, { allowClosed = false } = {}) {
    const event = await loadEvent(interaction.options.getString('event'));
    if (!event || event.guild_id !== interaction.guildId) {
      await interaction.reply({ content: '❌ Pick an event from the list.', flags: 64 });
      return null;
    }
    if (event.closed && !allowClosed) {
      await interaction.reply({ content: `❌ **${event.title}** is already ${event.cancelled ? 'cancelled' : 'finished'}.`, flags: 64 });
      return null;
    }
    const club = event.club_key ? await clubFor(event.guild_id, event.club_key) : null;
    if (!(club ? await canManageClub(interaction.member, club) : isManager(interaction.member))) {
      await interaction.reply({ content: `❌ Only ${club ? `${club.name}'s` : 'club'} leaders can change events.`, flags: 64 });
      return null;
    }
    return event;
  }

  async function handleEdit(interaction) {
    const rec = captureOptions(interaction);
    const event = await leaderEvent(interaction);
    if (!event) return;
    const { timezone: tz } = await serverPrefs(event.guild_id);
    const update = {};
    const changes = [];
    const whenText = interaction.options.getString('when');
    let kickoff = new Date(event.scheduled_at);
    if (whenText) {
      const at = T.parseWhen(whenText, tz);
      if (!at) return interaction.reply(whenPicker(tz, stashWhen(interaction, 'edit', rec), whenText));
      if (at.getTime() < Date.now() - 5 * 60000) return interaction.reply({ content: `❌ <t:${T.unix(at)}:F> is in the past.`, flags: 64 });
      if (at.getTime() !== kickoff.getTime()) {
        update.scheduled_at = at.toISOString();
        update.reminder_24h_sent = false;
        update.reminder_2h_sent = false;
        // Keep the same answer-by gap before kick-off
        if (event.deadline_at) update.deadline_at = new Date(new Date(event.deadline_at).getTime() + (at - kickoff)).toISOString();
        update.deadline_reminder_sent = false;
        changes.push(`🗓️ moved to <t:${T.unix(at)}:F>`);
        kickoff = at;
      }
    }
    const deadlineText = interaction.options.getString('deadline');
    if (deadlineText) {
      const deadline = T.parseDeadline(deadlineText, kickoff, tz);
      if (!deadline) return interaction.reply({ content: `❌ I couldn't read the deadline "${deadlineText}". Use "2h" (before kick-off) or a time like "wed 6pm".`, flags: 64 });
      update.deadline_at = (deadline > kickoff ? kickoff : deadline).toISOString();
      update.deadline_reminder_sent = false;
      changes.push(`⏰ answer by <t:${T.unix(update.deadline_at)}:f>`);
    }
    const title = interaction.options.getString('title');
    if (title) {
      update.title = title.slice(0, 100);
      changes.push(`title is now **${update.title}**`);
    }
    const description = interaction.options.getString('description');
    if (description) {
      update.description = description.slice(0, 1000);
      changes.push('details updated');
    }
    if (!changes.length) return interaction.reply({ content: 'Nothing to change. Pick at least one of when, title, deadline or description.', flags: 64 });

    await interaction.deferReply({ flags: 64 });
    update.updated_at = new Date().toISOString();
    const { error } = await supabase.from('availability_events').update(update).eq('id', event.id);
    if (error) return interaction.editReply({ content: `❌ ${error.message}` });
    const updated = { ...event, ...update };
    const board = await fetchBoardMessage(updated);
    if (board) {
      await board.edit(await buildBoard(updated)).catch(() => {});
      // A new kick-off time matters to everyone who said they'd play
      if (update.scheduled_at) {
        const players = (await loadResponses(event.id)).filter((r) => r.response !== 'no').map((r) => r.discord_user_id);
        await board
          .reply({ content: `🕒 **${updated.title}** ${changes[0]}.${players.length ? ` ${players.map((id) => `<@${id}>`).join(' ')}` : ''}`, allowedMentions: { users: players.slice(0, 100) } })
          .catch(() => {});
      }
    }
    return interaction.editReply({ content: `✅ **${updated.title}**: ${changes.join(', ')}.${board ? '' : ' (The board message is gone; **/manager → Events → Repost Board** puts it back.)'}` });
  }

  async function handleLock(interaction, locked) {
    const event = await leaderEvent(interaction);
    if (!event) return;
    if ((await isLocked(event)) === locked) {
      return interaction.reply({ content: `**${event.title}** is already ${locked ? 'closed to answers' : 'taking answers'}.`, flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    try {
      await setLocked(event, locked);
    } catch (err) {
      return interaction.editReply({ content: `❌ ${err.message}` });
    }
    await refreshBoard(event);
    return interaction.editReply({
      content: locked
        ? `🔒 **${event.title}** is closed to answers. Use **/manager → Events → Mark a Player** to change someone's, or **Reopen Answers**.`
        : `🔓 **${event.title}** is taking answers again.`,
    });
  }

  async function handleRepost(interaction) {
    const event = await leaderEvent(interaction);
    if (!event) return;
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const missing = missingChannelPerms(channel, interaction.guild.members.me);
    if (missing.length) return interaction.reply({ content: missingPermsMessage(channel, missing), flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const old = await fetchBoardMessage(event);
    const message = await channel.send(await buildBoard(event)).catch((err) => ({ error: err }));
    if (message.error) return interaction.editReply({ content: `❌ Couldn't post there: ${message.error.message}` });
    await supabase.from('availability_events').update({ channel_id: channel.id, message_id: message.id, updated_at: new Date().toISOString() }).eq('id', event.id);
    if (old) await old.delete().catch(() => old.edit({ content: `➡️ This board moved: ${message.url}`, embeds: [], components: [] }).catch(() => {}));
    return interaction.editReply({ content: `✅ Posted **${event.title}** in <#${channel.id}>. Answers carry over.` });
  }

  async function handleMark(interaction) {
    const event = await leaderEvent(interaction);
    if (!event) return;
    const user = interaction.options.getUser('user');
    if (user.bot) return interaction.reply({ content: '❌ Bots can\'t answer events.', flags: 64 });
    const answer = interaction.options.getString('answer');
    await interaction.deferReply({ flags: 64 });
    if (answer === 'clear') {
      await supabase.from('player_availability').delete().eq('event_id', event.id).eq('discord_user_id', user.id);
    } else {
      const position = interaction.options.getString('position');
      const picked = position ? position.toUpperCase().split(/[\s,/]+/).filter((p) => POSITIONS.includes(p)).slice(0, MAX_SIGNUP_POSITIONS).join(',') : null;
      try {
        await saveResponse(event, user.id, answer, picked || null);
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }
    await refreshBoard(event);
    return interaction.editReply({
      content: answer === 'clear' ? `✅ Cleared <@${user.id}>'s answer for **${event.title}**.` : `${RESPONSES[answer].emoji} <@${user.id}> is down as **${RESPONSES[answer].label}** for **${event.title}**.`,
      allowedMentions: { parse: [] },
    });
  }

  // ---------- Presets ----------

  async function handlePreset(interaction, sub) {
    const guildId = interaction.guildId;
    if (sub === 'list') {
      const { data } = await supabase.from('event_presets').select('*').eq('guild_id', guildId).order('name');
      const embed = new EmbedBuilder().setTitle('🗂️ Event presets').setColor(0x5865f2);
      embed.setDescription(
        data?.length
          ? truncate(
              data
                .map((p) => {
                  const day = p.weekday !== null && p.weekday !== undefined ? `${T.WEEKDAYS[p.weekday]} ` : '';
                  const bits = [typeInfo(p.event_type).label, p.time_of_day ? `${day}${p.time_of_day}` : null, p.deadline_minutes ? `answers ${T.describeOffset(p.deadline_minutes)} before` : null, p.ping_role_id ? `<@&${p.ping_role_id}>` : null, p.position_signup ? 'position sign-up' : null].filter(Boolean);
                  return `**${p.name}**: ${p.title} (${bits.join(', ')})`;
                })
                .join('\n'),
              4000
            )
          : 'No presets yet. Save one with **/manager → Events → Save Preset**, then use it with **/manager → Events → Event From Preset**.'
      );
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (!isManager(interaction.member)) return interaction.reply({ content: '❌ Only managers can change presets.', flags: 64 });

    if (sub === 'delete') {
      const name = interaction.options.getString('name');
      const { data } = await supabase.from('event_presets').delete().eq('guild_id', guildId).ilike('name', name).select('id');
      return interaction.reply({ content: data?.length ? `🗑️ Deleted preset **${name}**.` : `❌ No preset called **${name}**.`, flags: 64 });
    }

    // save
    const name = interaction.options.getString('name').trim().slice(0, 50);
    const timeText = interaction.options.getString('time');
    let weekday = null;
    let timeOfDay = null;
    if (timeText) {
      const [first, ...rest] = timeText.trim().split(/\s+/);
      const wd = T.parseWeekday(first);
      const time = T.parseTimeOfDay(wd === -1 ? timeText : rest.join(' '));
      if (!time) return interaction.reply({ content: `❌ I couldn't read the time "${timeText}". Use "21:00" or "thu 21:00".`, flags: 64 });
      weekday = wd === -1 ? null : wd;
      timeOfDay = T.formatTimeOfDay(time);
    }
    const deadlineText = interaction.options.getString('deadline');
    const deadlineMinutes = deadlineText ? T.parseOffsetMinutes(deadlineText) : null;
    if (deadlineText && deadlineMinutes === null) {
      return interaction.reply({ content: '❌ Preset deadlines are a time before kick-off, like "2h" or "90m".', flags: 64 });
    }
    const { count } = await supabase.from('event_presets').select('id', { count: 'exact', head: true }).eq('guild_id', guildId);
    const { data: existing } = await supabase.from('event_presets').select('id').eq('guild_id', guildId).ilike('name', name).maybeSingle();
    if (!existing && (count || 0) >= MAX_PRESETS) {
      return interaction.reply({ content: `❌ You have ${MAX_PRESETS} presets already. Delete one first.`, flags: 64 });
    }
    const type = interaction.options.getString('type') || 'match';
    const row = {
      guild_id: guildId,
      name,
      title: interaction.options.getString('title').slice(0, 100),
      event_type: type,
      description: interaction.options.getString('description')?.slice(0, 1000) || null,
      weekday,
      time_of_day: timeOfDay,
      deadline_minutes: deadlineMinutes,
      channel_id: interaction.options.getChannel('channel')?.id || null,
      ping_role_id: interaction.options.getRole('ping')?.id || null,
      position_signup: interaction.options.getBoolean('positions') ?? type === 'tryout',
      created_by_discord_id: interaction.user.id,
    };
    const { error } = existing
      ? await supabase.from('event_presets').update(row).eq('id', existing.id)
      : await supabase.from('event_presets').insert(row);
    if (error) return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    return interaction.reply({
      content: `✅ Saved preset **${name}**. Post it with **/manager → Events → Event From Preset**${timeOfDay ? '' : ' (add a time like "thu 9pm")'}.`,
      flags: 64,
    });
  }

  // ---------- Series ----------

  async function handleSeries(interaction, sub) {
    const guildId = interaction.guildId;
    if (sub === 'list') return interaction.reply({ ...(await buildEventList(guildId)), flags: 64 });
    const { data: series } = await supabase.from('event_series').select('*').eq('id', interaction.options.getString('series')).eq('guild_id', guildId).maybeSingle();
    if (!series) return interaction.reply({ content: '❌ Pick a series from the list.', flags: 64 });
    const club = series.club_key ? await clubFor(guildId, series.club_key) : null;
    if (!(club ? await canManageClub(interaction.member, club) : isManager(interaction.member))) {
      return interaction.reply({ content: '❌ Only club leaders can stop a series.', flags: 64 });
    }
    await supabase.from('event_series').update({ active: false, updated_at: new Date().toISOString() }).eq('id', series.id);
    return interaction.reply({ content: `⏹️ Stopped **${series.title}**. Events already posted stay up.`, flags: 64 });
  }

  // ---------- /available ----------

  async function handleAvailable(interaction) {
    const events = (await upcomingEvents(interaction.guildId, 5)).filter((e) => new Date(e.scheduled_at) > new Date());
    if (!events.length) return interaction.reply({ content: 'No upcoming events right now.', flags: 64 });
    const { data: mine } = await supabase
      .from('player_availability')
      .select('event_id, response, position')
      .eq('discord_user_id', interaction.user.id)
      .in('event_id', events.map((e) => e.id));
    const byEvent = new Map((mine || []).map((r) => [r.event_id, r]));
    const embed = new EmbedBuilder()
      .setTitle('📅 Your upcoming events')
      .setColor(0x5865f2)
      .setDescription(
        events
          .map((e, i) => {
            const r = byEvent.get(e.id);
            const answer = r && RESPONSES[r.response] ? `${RESPONSES[r.response].emoji} ${RESPONSES[r.response].label}${r.position ? ` (${r.position.split(',').join('/')})` : ''}` : '⏳ Not answered';
            return `**${i + 1}. ${e.title}** <t:${T.unix(e.scheduled_at)}:F>\n${answer}`;
          })
          .join('\n\n')
      );
    const rows = events.map((e, i) =>
      new ActionRowBuilder().addComponents(
        Object.entries(RESPONSES).map(([key, r]) =>
          new ButtonBuilder()
            .setCustomId(`ev_r:${key}:${e.id}`)
            .setLabel(key === 'yes' ? `${i + 1}. ${r.label}` : r.label)
            .setEmoji(r.emoji)
            .setStyle(r.style)
        )
      )
    );
    return interaction.reply({ embeds: [embed], components: rows, flags: 64 });
  }

  // ---------- Timezone ----------

  async function handleTimezone(interaction) {
    if (!isManager(interaction.member)) return interaction.reply({ content: '❌ Only managers can change the timezone.', flags: 64 });
    const zone = interaction.options.getString('zone').trim();
    const match = T.allTimeZones().find((z) => z.toLowerCase() === zone.toLowerCase()) || (T.isValidTimeZone(zone) ? zone : null);
    if (!match) {
      const close = T.allTimeZones().filter((z) => z.toLowerCase().includes(zone.toLowerCase())).slice(0, 5);
      const hint = close.length ? ` Did you mean ${close.map((z) => `\`${z}\``).join(', ')}?` : ' Type a city or region, e.g. `America/Chicago`, `Europe/London`, `Australia/Sydney`.';
      return interaction.reply({ content: `❌ "${zone}" isn't a timezone I know.${hint}`, flags: 64 });
    }
    const { error } = await supabase.from('guild_settings').upsert({ guild_id: interaction.guildId, timezone: match }, { onConflict: 'guild_id' });
    if (error) return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    forgetPrefs(interaction.guildId);
    const p = T.localParts(new Date(), match);
    return interaction.reply({
      content: `✅ Times like "9pm" now mean 9pm in **${match}** (it's ${T.formatTimeOfDay(p)} there now). Everyone still sees event times in their own timezone.`,
      flags: 64,
    });
  }

  // ---------- Autocomplete ----------

  // Live preview for the kick-off box: shows how the text will be read (works on mobile, where
  // Discord has no date picker), and offers common picks when it's empty. A picked choice sends
  // the unix time, which parseWhen reads back exactly.
  async function whenChoices(guildId, typed) {
    const { timezone: tz } = await serverPrefs(guildId);
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const label = (d) => `${fmt.format(d)} (${tz})`;
    const now = new Date();
    const text = String(typed || '').trim();
    if (text) {
      const at = T.parseWhen(text, tz, now);
      if (at && at.getTime() > now.getTime() - 5 * 60000) return [{ name: `✅ ${label(at)}`.slice(0, 100), value: String(T.unix(at)) }];
      if (at) return [{ name: `⚠️ ${label(at)} is in the past`.slice(0, 100), value: text.slice(0, 100) }];
      return [{ name: `❓ Can't read "${text}" yet. Try 21/09 18:00, thu 9pm or tomorrow 20:00`.slice(0, 100), value: text.slice(0, 100) }];
    }
    const picks = ['tonight 21:00', 'tomorrow 20:00', ...[1, 2, 3, 4, 5, 6].map((d) => `${T.WEEKDAYS[(T.localParts(now, tz).weekday + d + 1) % 7]} 20:00`)];
    const seen = new Set();
    const choices = [];
    for (const p of picks) {
      const at = T.parseWhen(p, tz, now);
      if (!at || at <= now || seen.has(T.unix(at))) continue;
      seen.add(T.unix(at));
      choices.push({ at, name: label(at), value: String(T.unix(at)) });
    }
    return choices.sort((a, b) => a.at - b.at).map(({ name, value }) => ({ name, value }));
  }

  async function handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const q = String(focused.value || '').toLowerCase();
    const guildId = interaction.guildId;
    let choices = [];

    if (focused.name === 'club') {
      const state = await getGuildState(guildId);
      choices = activeClubs(state).map((c) => ({ name: c.name.slice(0, 100), value: c.key }));
    } else if (focused.name === 'preset' || (focused.name === 'name' && interaction.options.getSubcommand() === 'delete')) {
      const { data } = await supabase.from('event_presets').select('name').eq('guild_id', guildId).order('name');
      choices = (data || []).map((p) => ({ name: p.name, value: p.name }));
    } else if (focused.name === 'event') {
      const { timezone } = await serverPrefs(guildId);
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      choices = (await upcomingEvents(guildId, 25)).map((e) => ({ name: `${e.title} · ${fmt.format(new Date(e.scheduled_at))}`.slice(0, 100), value: e.id }));
    } else if (focused.name === 'series') {
      const { data } = await supabase.from('event_series').select('id, title, interval_weeks').eq('guild_id', guildId).eq('active', true);
      choices = (data || []).map((s) => ({ name: `${s.title} (every ${s.interval_weeks === 1 ? 'week' : `${s.interval_weeks} weeks`})`.slice(0, 100), value: s.id }));
    } else if (focused.name === 'formation') {
      choices = Object.keys(FORMATION_SLOTS).map((n) => ({ name: n, value: n }));
      const sq = q.replace(/[^0-9a-z]/g, '');
      return interaction.respond(choices.filter((c) => c.name.toLowerCase().replace(/[^0-9a-z]/g, '').includes(sq)).slice(0, 25)).catch(() => {});
    } else if (focused.name === 'when') {
      return interaction.respond(await whenChoices(guildId, focused.value)).catch(() => {});
    } else if (focused.name === 'zone') {
      choices = T.allTimeZones()
        .filter((z) => z.toLowerCase().includes(q.replace(/\s+/g, '_')))
        .slice(0, 25)
        .map((z) => ({ name: z, value: z }));
      return interaction.respond(choices).catch(() => {});
    } else {
      return false;
    }
    await interaction.respond(choices.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25)).catch(() => {});
    return true;
  }

  // ---------- Scheduler ----------

  async function postDueSeries(now) {
    const horizon = new Date(now.getTime() + 5 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: series } = await supabase.from('event_series').select('*').eq('active', true).lte('next_at', horizon);
    for (const s of series || []) {
      const guild = client.guilds.cache.get(s.guild_id);
      if (!guild) continue;
      let nextAt = new Date(s.next_at);
      // Skip occurrences that were missed while the bot was down
      while (nextAt <= now) nextAt = T.addLocalDays(nextAt, 7 * s.interval_weeks, s.timezone);
      if (nextAt.getTime() - s.post_hours_before * 3600000 > now.getTime()) {
        if (nextAt.getTime() !== new Date(s.next_at).getTime()) {
          await supabase.from('event_series').update({ next_at: nextAt.toISOString() }).eq('id', s.id);
        }
        continue;
      }

      // Advance first so a failure can't post the same occurrence twice
      const after = T.addLocalDays(nextAt, 7 * s.interval_weeks, s.timezone);
      await supabase.from('event_series').update({ next_at: after.toISOString(), updated_at: now.toISOString() }).eq('id', s.id);

      const { data: existing } = await supabase.from('availability_events').select('id').eq('series_id', s.id).eq('scheduled_at', nextAt.toISOString()).maybeSingle();
      if (existing) continue;
      const channel = await guild.channels.fetch(s.channel_id).catch(() => null);
      if (!channel || missingChannelPerms(channel, guild.members.me).length) {
        console.warn(`[events] series ${s.id}: can't post in ${s.channel_id}`);
        continue;
      }
      const club = s.club_key ? await clubFor(s.guild_id, s.club_key) : null;
      let deadline = s.deadline_minutes !== null ? new Date(nextAt.getTime() - s.deadline_minutes * 60000) : new Date(nextAt.getTime() - DEFAULT_DEADLINE_MINUTES * 60000);
      if (deadline < now) deadline = nextAt;
      await postEvent(
        {
          guild_id: s.guild_id,
          club_key: s.club_key,
          team_id: club?.team_id || null,
          series_id: s.id,
          title: s.title,
          description: s.description,
          event_type: s.event_type,
          scheduled_at: nextAt.toISOString(),
          deadline_at: deadline.toISOString(),
          duration_minutes: s.duration_minutes,
          ping_role_id: s.ping_role_id,
          position_signup: s.position_signup,
          created_by_discord_id: s.created_by_discord_id,
          channel_id: s.channel_id,
        },
        channel
      ).catch((err) => console.warn(`[events] series ${s.id} post failed: ${err.message}`));
    }
  }

  async function sendDueReminders(now) {
    const { data: events } = await supabase
      .from('availability_events')
      .select('*')
      .eq('closed', false)
      .eq('deadline_reminder_sent', false)
      .not('deadline_at', 'is', null)
      .gt('deadline_at', now.toISOString())
      .lte('deadline_at', new Date(now.getTime() + REMIND_LEAD_MS).toISOString());
    for (const event of events || []) {
      if (!client.guilds.cache.has(event.guild_id)) continue;
      // Give fresh events half the time to their deadline before chasing anyone
      const deadline = new Date(event.deadline_at).getTime();
      const created = new Date(event.created_at).getTime();
      if (now.getTime() < created + (deadline - created) / 2) continue;
      await sendReminder(event).catch((err) => console.warn(`[events] reminder ${event.id} failed: ${err.message}`));
    }
  }

  async function closeFinished(now) {
    const { data: events } = await supabase
      .from('availability_events')
      .select('*')
      .eq('closed', false)
      .not('club_key', 'is', null)
      .lte('scheduled_at', now.toISOString());
    for (const event of events || []) {
      const end = new Date(event.scheduled_at).getTime() + (event.duration_minutes || 90) * 60000;
      if (end > now.getTime()) continue;
      await supabase.from('availability_events').update({ closed: true, updated_at: now.toISOString() }).eq('id', event.id);
      if (await isLocked(event).catch(() => false)) await setLocked(event, false).catch(() => {});
      const closed = { ...event, closed: true };
      for (const hook of afterClose) await hook(closed).catch((err) => console.warn(`[events] close hook failed: ${err.message}`));
      await refreshBoard(closed);
    }
  }

  // Keep the match-night channel clean: delete boards of events that finished a while ago
  const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
  async function removeStaleBoards(now) {
    const { data: events } = await supabase
      .from('availability_events')
      .select('id, channel_id, message_id, scheduled_at, duration_minutes, guild_id')
      .eq('closed', true)
      .not('message_id', 'is', null)
      .lte('scheduled_at', new Date(now.getTime() - STALE_AFTER_MS).toISOString())
      .limit(25);
    for (const event of events || []) {
      if (!client.guilds.cache.has(event.guild_id)) continue;
      const end = new Date(event.scheduled_at).getTime() + (event.duration_minutes || 90) * 60000;
      if (end + STALE_AFTER_MS > now.getTime()) continue;
      const msg = await fetchBoardMessage(event);
      if (msg) await msg.delete().catch(() => {});
      await supabase.from('availability_events').update({ message_id: null }).eq('id', event.id);
    }
  }

  const tickHooks = [];
  const afterClose = [];

  async function tick() {
    if (ticking || !client) return;
    ticking = true;
    const now = new Date();
    try {
      await postDueSeries(now);
      await sendDueReminders(now);
      for (const hook of tickHooks) await hook(now);
      await closeFinished(now);
      await removeStaleBoards(now);
    } catch (err) {
      console.error('[events] scheduler error:', err);
    } finally {
      ticking = false;
    }
  }

  function start(discordClient) {
    client = discordClient;
    setInterval(tick, 60 * 1000);
    setTimeout(tick, 10 * 1000);
  }

  // ---------- Routing ----------

  async function handleCommand(interaction, cmd) {
    if (cmd === 'available') {
      await handleAvailable(interaction);
      return true;
    }
    if (cmd !== 'event') return false;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    if (group === 'preset') await handlePreset(interaction, sub);
    else if (group === 'series') await handleSeries(interaction, sub);
    else if (sub === 'new') await handleNew(interaction);
    else if (sub === 'list') await interaction.reply({ ...(await buildEventList(interaction.guildId)), flags: 64 });
    else if (sub === 'cancel') await handleCancel(interaction);
    else if (sub === 'edit') await handleEdit(interaction);
    else if (sub === 'close') await handleLock(interaction, true);
    else if (sub === 'reopen') await handleLock(interaction, false);
    else if (sub === 'post') await handleRepost(interaction);
    else if (sub === 'mark') await handleMark(interaction);
    else if (sub === 'timezone') await handleTimezone(interaction);
    else if (sub === 'remind') {
      const event = await loadEvent(interaction.options.getString('event'));
      if (!event || event.guild_id !== interaction.guildId || event.closed) await interaction.reply({ content: '❌ Pick an open event from the list.', flags: 64 });
      else await remindNow(interaction, event);
    }
    return true;
  }

  // Buttons and selects work in the server and in reminder DMs
  // A manager picked a kick-off time from the "couldn't read it" menu: re-run the original
  // form with that time, keeping everything else they had typed.
  async function handleWhenPick(interaction, token) {
    const pending = pendingWhen.get(token);
    pendingWhen.delete(token);
    if (!pending || Date.now() - pending.at > WHEN_PICK_TTL) {
      return interaction.update({ content: '❌ That expired — start the event again.', components: [] });
    }
    if (pending.userId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Only the person creating the event can pick the time.', flags: 64 });
    }
    const picked = interaction.values[0];
    const rec = pending.rec;
    const guild = interaction.guild;
    const shim = Object.create(interaction);
    shim.options = {
      getString: (n) => (n === 'when' ? picked : rec.strings[n] ?? null),
      getRole: (n) => (rec.roles[n] ? guild.roles.cache.get(rec.roles[n]) ?? null : null),
      getChannel: (n) => (rec.channels[n] ? guild.channels.cache.get(rec.channels[n]) ?? null : null),
      getBoolean: (n) => rec.booleans[n] ?? null,
    };
    let used = false;
    shim.reply = (opts) => {
      if (!used) {
        used = true;
        return interaction.update({ ...opts, components: opts.components ?? [] });
      }
      return interaction.followUp(opts);
    };
    shim.deferReply = () => interaction.deferUpdate();
    return pending.kind === 'edit' ? handleEdit(shim) : handleNew(shim);
  }

  // Private list of who answered, visible only to the person who tapped
  async function handleListButton(interaction, eventId) {
    const event = await loadEvent(eventId);
    if (!event) return interaction.reply({ content: '❌ That event no longer exists.', flags: 64 });
    const responses = await loadResponses(event.id);
    const deadline = event.deadline_at ? new Date(event.deadline_at) : null;
    const label = (r) => {
      const late = deadline && r.responded_at && new Date(r.responded_at) > deadline ? ' *(late)*' : '';
      const pos = r.position ? ` ${r.position.split(',').join('/')}` : '';
      const note = r.note ? ` — 📝 *${r.note.slice(0, 80)}*` : '';
      return `<@${r.discord_user_id}>${pos}${late}${note}`;
    };
    const embed = new EmbedBuilder().setTitle(`👥 ${event.title}`).setColor(0x5865f2);
    for (const [key, r] of Object.entries(RESPONSES)) {
      const list = responses.filter((x) => x.response === key);
      embed.addFields({ name: `${r.emoji} ${r.label} (${list.length})`, value: truncate(list.map(label).join('\n') || '–') });
    }
    return interaction.reply({ embeds: [embed], flags: 64, allowedMentions: { parse: [] } });
  }

  async function handleComponent(interaction) {
    const [action, a, b] = interaction.customId.split(':');
    if (!action.startsWith('ev_')) return false;
    if (action === 'ev_r' && RESPONSES[a]) await handleResponse(interaction, a, b);
    else if (action === 'ev_pos') await handlePositionPick(interaction, a);
    else if (action === 'ev_remind') await handleRemindButton(interaction, a);
    else if (action === 'ev_note') await handleNoteButton(interaction, a);
    else if (action === 'ev_list') await handleListButton(interaction, a);
    else if (action === 'ev_when') await handleWhenPick(interaction, a);
    else return false;
    return true;
  }

  async function handleNoteButton(interaction, eventId) {
    const event = await loadEvent(eventId);
    if (!event || event.closed) return interaction.reply({ content: '❌ That event is closed.', flags: 64 });
    const { data: mine } = await supabase.from('player_availability').select('note').eq('event_id', eventId).eq('discord_user_id', interaction.user.id).maybeSingle();
    const input = new TextInputBuilder()
      .setCustomId('note')
      .setLabel('Note for the captain')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(200)
      .setPlaceholder('e.g. might be 10 min late, can only play first half');
    if (mine?.note) input.setValue(mine.note);
    return interaction.showModal(
      new ModalBuilder().setCustomId(`ev_notem:${eventId}`).setTitle(event.title.slice(0, 45)).addComponents(new ActionRowBuilder().addComponents(input))
    );
  }

  async function handleNoteSubmit(interaction, eventId) {
    const event = await loadEvent(eventId);
    if (!event) return interaction.reply({ content: '❌ That event no longer exists.', flags: 64 });
    const note = (interaction.fields.getTextInputValue('note') || '').trim().slice(0, 200) || null;
    const { data: row } = await supabase.from('player_availability').select('id').eq('event_id', eventId).eq('discord_user_id', interaction.user.id).maybeSingle();
    const res = row
      ? await supabase.from('player_availability').update({ note }).eq('id', row.id)
      : await supabase.from('player_availability').insert({ event_id: eventId, discord_user_id: interaction.user.id, response: 'maybe', note, responded_at: new Date().toISOString() });
    if (res.error) return interaction.reply({ content: `❌ ${res.error.message}`, flags: 64 });
    await interaction.reply({ content: note ? `📝 Note saved for **${event.title}**.${row ? '' : ' You were marked **Maybe** — tap Available if you can play.'}` : '📝 Note cleared.', flags: 64 });
    await refreshBoard(event);
  }

  async function handleInteraction(interaction) {
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith('ev_notem:')) {
      await handleNoteSubmit(interaction, interaction.customId.split(':')[1]);
      return true;
    }
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== 'event') return false;
      await handleAutocomplete(interaction);
      return true;
    }
    if (interaction.isChatInputCommand()) {
      if (!interaction.guildId) return false;
      return handleCommand(interaction, interaction.commandName);
    }
    if (interaction.isButton() || interaction.isStringSelectMenu()) return handleComponent(interaction);
    return false;
  }

  return {
    commands: EVENT_COMMANDS,
    handleInteraction,
    start,
    buildEventList,
    postEvent,
    serverPrefs,
    forgetPrefs,
    loadEvent,
    loadResponses,
    expectedPlayers,
    fetchBoardMessage,
    refreshBoard,
    clubFor,
    runScheduler: tick,
    setReliabilityLookup: (fn) => {
      reliabilityLookup = fn;
    },
    onTick: (fn) => tickHooks.push(fn),
    onClose: (fn) => afterClose.push(fn),
    getClient: () => client,
  };
}

module.exports = { createEvents, EVENT_COMMANDS, POSITIONS, EVENT_TYPES, matchFormation };
