// Panels: GafferBot's tools live behind a handful of slash commands (/manager, /me, /help, /setup)
// instead of one command each. Every former command is now an action on a panel button. Pressing it
// opens a form for any input it needs (players, channels and choices are dropdowns), then runs the
// same handler the slash command used, so behaviour is unchanged.
//
// The old command definitions stay in index.cjs as ACTION_SCHEMAS: they are no longer registered with
// Discord, but they describe each action's inputs and are what the forms are built from.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  FileUploadBuilder,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');
const { missingChannelPerms, missingPermsMessage } = require('./perm-check.cjs');

const F = PermissionsBitField.Flags;
const VOICE = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const PROBE_TIMEOUT_MS = 2000;
const LONG_TEXT = new Set(['note', 'notes', 'description', 'message', 'reason']);
// Autocomplete inputs where any typed value is fine; the rest become dropdowns of the suggestions
const FREE_TEXT = new Set(['when', 'zone']);
// Inputs shown as a dropdown of suggestions plus a box to type one that isn't listed
const PICK_OR_TYPE = new Set(['username']);
const TYPED = '__typed';

const PANEL_COMMANDS = [
  { name: 'me', description: 'Your player hub: stats, availability, check-in, positions, EA link, free agent and more.' },
  { name: 'graphics', description: 'Open the Graphics Studio panel: player cards, match posters and championship banners.' },
];

// One entry per former command (or subcommand). fields: which inputs the form asks for, in order
// (default: every input, required first, up to Discord's 5 per form). ask: open the form even when
// nothing is required. fixed: inputs filled in for the player. channels: allowed channel types.
const PLAYER_ACTIONS = [
  { id: 'mystats', label: 'My Stats', emoji: '📊', cmd: 'mystats' },
  { id: 'myprofile', label: 'My Profile', emoji: '🪪', cmd: 'profile' },
  { id: 'leaderboard', label: 'Leaderboard', emoji: '🏆', cmd: 'leaderboard', ask: true },
  { id: 'available', label: 'My Events', emoji: '✅', cmd: 'available' },
  { id: 'checkin', label: 'Check In', emoji: '📍', cmd: 'checkin' },
  { id: 'sub', label: 'Need a Sub', emoji: '🔁', cmd: 'sub', ask: true },
  { id: 'whoisplaying', label: "Who's Playing", emoji: '👀', cmd: 'whoisplaying' },
  { id: 'myprefs', label: 'My Positions', emoji: '🧩', cmd: 'myprefs' },
  { id: 'syncmyprefs', label: 'Positions From Roles', emoji: '🔃', cmd: 'syncprefs', fixed: { scope: 'me' } },
  { id: 'myreliability', label: 'My Reliability', emoji: '📈', cmd: 'reliability' },
  { id: 'linkea', label: 'Link EA', emoji: '🎮', cmd: 'linkea' },
  { id: 'prophoto', label: 'Pro Photo', emoji: '📸', cmd: 'prophoto', fields: ['photo'], required: ['photo'] },
  { id: 'myphotos', label: 'My Pro Photos', emoji: '🖼️', cmd: 'myphotos' },
  { id: 'linkxbox', label: 'Link Xbox', emoji: '🟩', cmd: 'linkxbox' },
  { id: 'fa', label: 'Free Agent', emoji: '🧲', cmd: 'fa', fields: ['status', 'position', 'secondary', 'platform', 'timezone'] },
  { id: 'fadetails', label: 'Free Agent Details', emoji: '📝', cmd: 'fa', fields: ['status', 'gamertag', 'notes'] },
  { id: 'lfccard', label: 'Resume Card', emoji: '📇', cmd: 'lfc', sub: 'card', ask: true },
  { id: 'lfcverify', label: 'Check a Resume', emoji: '🔎', cmd: 'lfc', sub: 'verify' },
  { id: 'apply', label: 'Apply to Trial', emoji: '✍️', cmd: 'apply' },
  { id: 'claimwin', label: 'Claim a Win', emoji: '🥇', cmd: 'claimwin' },
  { id: 'aiaccess', label: 'AI Assistant', emoji: '🤖', cmd: 'aiaccess', fixed: { action: 'create' } },
  { id: 'airevoke', label: 'Revoke AI Access', emoji: '🔌', cmd: 'aiaccess', fixed: { action: 'revoke' } },
];

const AREAS = [
  {
    key: 'events',
    label: 'Events',
    emoji: '📅',
    blurb: 'Schedule sessions with Available / Maybe / Unavailable buttons and manage who answered. League games ping your signed players, everything else pings @everyone.',
    actions: [
      { id: 'ev_quick_league', label: 'League Game', emoji: '⚽', cmd: 'event', sub: 'new', fields: ['when', 'title', 'description', 'formation'], required: ['when'], fixed: { type: 'league' }, style: 'success' },
      { id: 'ev_quick_byot', label: 'BYOT / Tournament', emoji: '🏆', cmd: 'event', sub: 'new', fields: ['when', 'title', 'description', 'formation'], required: ['when'], fixed: { type: 'tournament' }, style: 'success' },
      { id: 'ev_quick_friendly', label: 'Friendly', emoji: '🤝', cmd: 'event', sub: 'new', fields: ['when', 'title', 'description', 'formation'], required: ['when'], fixed: { type: 'friendly' } },
      { id: 'ev_new', label: 'New Event', emoji: '➕', cmd: 'event', sub: 'new', ask: true, fields: ['when', 'title', 'type', 'description'], required: ['when'], style: 'primary' },
      { id: 'ev_new_ping', label: 'Event With Custom Ping', emoji: '📣', cmd: 'event', sub: 'new', fields: ['when', 'title', 'type', 'notify'], required: ['when', 'notify'] },
      { id: 'ev_preset', label: 'Event From Preset', emoji: '📎', cmd: 'event', sub: 'new', fields: ['preset', 'when', 'ping', 'notify'], required: ['preset'] },
      { id: 'ev_list', label: 'Upcoming', emoji: '📅', cmd: 'event', sub: 'list' },
      { id: 'ev_edit', label: 'Edit Event', emoji: '✏️', cmd: 'event', sub: 'edit', fields: ['event', 'when', 'title', 'description'] },
      { id: 'ev_post', label: 'Repost Board', emoji: '📌', cmd: 'event', sub: 'post' },
      { id: 'ev_remind', label: 'Remind', emoji: '🔔', cmd: 'event', sub: 'remind' },
      { id: 'ev_mark', label: 'Mark a Player', emoji: '☑️', cmd: 'event', sub: 'mark' },
      { id: 'ev_close', label: 'Close Answers', emoji: '🔒', cmd: 'event', sub: 'close' },
      { id: 'ev_reopen', label: 'Reopen Answers', emoji: '🔓', cmd: 'event', sub: 'reopen' },
      { id: 'ev_cancel', label: 'Cancel Event', emoji: '🗑️', cmd: 'event', sub: 'cancel', style: 'danger' },
      { id: 'ev_tz', label: 'Timezone', emoji: '🌍', cmd: 'event', sub: 'timezone' },
      { id: 'ev_presets', label: 'Presets', emoji: '🗃️', cmd: 'event', group: 'preset', sub: 'list' },
      { id: 'ev_presetsave', label: 'Save Preset', emoji: '💾', cmd: 'event', group: 'preset', sub: 'save', fields: ['name', 'title', 'type', 'time', 'ping'] },
      { id: 'ev_presetdel', label: 'Delete Preset', emoji: '🗑️', cmd: 'event', group: 'preset', sub: 'delete' },
      { id: 'ev_series', label: 'Repeating Events', emoji: '🔁', cmd: 'event', group: 'series', sub: 'list' },
      { id: 'ev_seriesstop', label: 'Stop Repeating', emoji: '⏹️', cmd: 'event', group: 'series', sub: 'stop' },
    ],
  },
  {
    key: 'matchnight',
    label: 'Match Night',
    emoji: '🏟️',
    blurb: 'Check-ins, subs, show-up rates, friendlies and the jobs the bot runs for you.',
    actions: [
      { id: 'mn_checkin', label: 'Open Check-in', emoji: '📍', cmd: 'checkin', style: 'primary' },
      { id: 'mn_sub', label: 'Find a Sub', emoji: '🔁', cmd: 'sub', ask: true },
      { id: 'mn_reliability', label: 'Reliability', emoji: '📈', cmd: 'reliability', ask: true },
      { id: 'mn_attendance', label: 'Attendance', emoji: '🧾', cmd: 'attendance' },
      { id: 'mn_lfg', label: 'Find a Friendly', emoji: '🤝', cmd: 'lfg', ask: true },
      { id: 'mn_netclubs', label: 'Network Clubs', emoji: '🌐', cmd: 'network', sub: 'clubs' },
      { id: 'mn_autopilot', label: 'Autopilot', emoji: '🤖', cmd: 'autopilot' },
    ],
  },
  {
    key: 'lineups',
    label: 'Lineups & Spots',
    emoji: '📋',
    blurb: 'Team sheets, live spot boards and position preferences.',
    actions: [
      { id: 'ln_depth', label: 'Depth Chart', emoji: '📊', cmd: 'depthchart', style: 'primary' },
      { id: 'ln_sheet', label: 'Team Sheet', emoji: '📋', cmd: 'teamsheet', ask: true, style: 'primary' },
      { id: 'ln_spotpanel', label: 'Spots Panel', emoji: '🎛️', cmd: 'spotpanel' },
      { id: 'ln_spots', label: 'Spots Board', emoji: '🗒️', cmd: 'spots' },
      { id: 'ln_vcspots', label: 'Voice Spots', emoji: '🔊', cmd: 'vcspots' },
      { id: 'ln_whoisplaying', label: "Who's Playing", emoji: '👀', cmd: 'whoisplaying' },
      { id: 'ln_block', label: 'Block Mover', emoji: '🚫', cmd: 'spotblock' },
      { id: 'ln_autoassign', label: 'Auto-assign', emoji: '⚙️', cmd: 'autoassign' },
      { id: 'ln_pospanel', label: 'Prefs Panel', emoji: '🧩', cmd: 'pospanel' },
      { id: 'ln_posboard', label: 'Draft Prefs (Voice)', emoji: '🎧', cmd: 'posboard' },
      { id: 'ln_posprefs', label: 'All Prefs', emoji: '📑', cmd: 'posprefs' },
      { id: 'ln_syncprefs', label: 'Prefs From Roles', emoji: '🔃', cmd: 'syncprefs', ask: true },
      { id: 'ln_posroles', label: 'Position Roles Panel', emoji: '🏷️', cmd: 'positionpanel', perm: F.ManageRoles },
    ],
  },
  {
    key: 'drafts',
    label: 'Drafts',
    emoji: '🎲',
    blurb: 'Captains pick teams from the players in voice, then report the result.',
    actions: [
      { id: 'dr_start', label: 'Start Draft', emoji: '🎲', cmd: 'draft', ask: true, channels: { team_a_vc: VOICE, team_b_vc: VOICE }, style: 'primary' },
      { id: 'dr_panel', label: 'Draft Panel', emoji: '🎛️', cmd: 'draftpanel' },
      { id: 'dr_pick', label: 'Pick Player', emoji: '👆', cmd: 'draftpick' },
      { id: 'dr_result', label: 'Report Result', emoji: '🏁', cmd: 'draftresult' },
      { id: 'dr_reroll', label: 'Reroll Captains', emoji: '🔄', cmd: 'draftreroll' },
      { id: 'dr_cancel', label: 'Cancel Draft', emoji: '🛑', cmd: 'draftcancel', style: 'danger' },
      { id: 'dr_friendly', label: 'Apply Friendly Stats', emoji: '🔗', cmd: 'applyfriendly', ask: true },
    ],
  },
  {
    key: 'stats',
    label: 'Stats & Scouting',
    emoji: '📈',
    blurb: 'Your club\'s numbers, player ratings, and a look at any other club.',
    actions: [
      { id: 'st_club', label: 'Club Stats', emoji: '📊', cmd: 'clubstats', ask: true, style: 'primary' },
      { id: 'st_sync', label: 'Sync Matches', emoji: '🔄', cmd: 'syncclub' },
      { id: 'st_insights', label: 'Insights', emoji: '💡', cmd: 'insights' },
      { id: 'st_leaderboard', label: 'Leaderboard', emoji: '🏆', cmd: 'leaderboard', ask: true },
      { id: 'st_profile', label: 'Player Profile', emoji: '🪪', cmd: 'profile', ask: true },
      { id: 'st_ratings', label: 'Ratings Panel', emoji: '⭐', cmd: 'ratingspanel' },
      { id: 'st_scoutclub', label: 'Scout a Club', emoji: '🔭', cmd: 'scoutclub' },
      { id: 'st_matches', label: 'Club Matches', emoji: '🗂️', cmd: 'clubmatches' },
      { id: 'st_tags', label: 'Tag Matches', emoji: '🏷️', cmd: 'matchtags' },
      { id: 'st_preview', label: 'Match Preview', emoji: '🆚', cmd: 'matchpreview' },
      { id: 'st_scoutpanel', label: 'Scouting Panel', emoji: '🎛️', cmd: 'scoutpanel' },
    ],
  },
  {
    key: 'roster',
    label: 'Roster & Squad',
    emoji: '👥',
    blurb: 'Who is in the squad, their positions and status, and who runs the club.',
    actions: [
      { id: 'ro_view', label: 'View Roster', emoji: '👥', cmd: 'roster', sub: 'view', ask: true, style: 'primary' },
      { id: 'ro_add', label: 'Add Player', emoji: '➕', cmd: 'roster', sub: 'add' },
      { id: 'ro_player', label: 'Player Details', emoji: '🔍', cmd: 'roster', sub: 'player' },
      { id: 'ro_status', label: 'Set Status', emoji: '🩹', cmd: 'roster', sub: 'status' },
      { id: 'ro_remove', label: 'Remove Player', emoji: '➖', cmd: 'roster', sub: 'remove', style: 'danger' },
      { id: 'ro_import', label: 'Import Role', emoji: '📥', cmd: 'roster', sub: 'import' },
      { id: 'sq_info', label: 'Squad Info', emoji: 'ℹ️', cmd: 'squad', sub: 'info' },
      { id: 'sq_link', label: 'Link Squad', emoji: '🔗', cmd: 'squad', sub: 'link' },
      { id: 'sq_captain', label: 'Set Captain', emoji: '©️', cmd: 'squad', sub: 'captain' },
      { id: 'sq_manager', label: 'Add/Remove Manager', emoji: '🧑‍💼', cmd: 'squad', sub: 'manager' },
      { id: 'ro_forcelink', label: 'Link Player to EA', emoji: '🎮', cmd: 'forcelink' },
      { id: 'ro_reviewlinks', label: 'Review EA Links', emoji: '🧐', cmd: 'reviewlinks' },
      { id: 'ev_signedrole', label: 'Signed Players Role', emoji: '✍️', cmd: 'event', sub: 'signedrole', ask: true, fields: ['role', 'clear'] },
    ],
  },
  {
    key: 'recruit',
    label: 'Recruiting',
    emoji: '🧲',
    blurb: 'Find free agents, advertise open spots, scout opponents and keep a watchlist.',
    actions: [
      { id: 'rc_search', label: 'Search Free Agents', emoji: '🔎', cmd: 'recruit', sub: 'search', style: 'primary' },
      { id: 'rc_gaps', label: 'Squad Gaps', emoji: '🕳️', cmd: 'recruit', sub: 'gaps' },
      { id: 'rc_post', label: 'Recruitment Poster', emoji: '📣', cmd: 'recruit', sub: 'post', ask: true },
      { id: 'rc_applypanel', label: 'Apply Button', emoji: '✍️', cmd: 'recruit', sub: 'applypanel', ask: true },
      { id: 'rc_setup', label: 'Recruiting Setup', emoji: '⚙️', cmd: 'recruit', sub: 'setup', ask: true },
      { id: 'sc_opponent', label: 'Opponent Dossier', emoji: '🗂️', cmd: 'scout', sub: 'opponent' },
      { id: 'sc_watchlist', label: 'Watchlist', emoji: '👁️', cmd: 'scout', sub: 'watchlist' },
      { id: 'sc_add', label: 'Watch a Player', emoji: '➕', cmd: 'scout', sub: 'add' },
      { id: 'sc_remove', label: 'Unwatch', emoji: '➖', cmd: 'scout', sub: 'remove' },
    ],
  },
  {
    key: 'premium',
    label: 'Premium',
    emoji: '💎',
    blurb: 'Player cards, Team of the Week, the stream overlay, trophies and the assistant coach.',
    actions: [
      { id: 'pr_status', label: 'Premium Status', emoji: '💎', cmd: 'premium', sub: 'status' },
      { id: 'pr_cards', label: 'Player Cards', emoji: '🃏', cmd: 'premium', sub: 'cards', ask: true, style: 'primary' },
      { id: 'pr_totw', label: 'Team of the Week', emoji: '🌟', cmd: 'premium', sub: 'totw', ask: true },
      { id: 'pr_overlay', label: 'Stream Overlay', emoji: '📺', cmd: 'premium', sub: 'overlay', ask: true },
      { id: 'pr_trophies', label: 'Trophies', emoji: '🏆', cmd: 'premium', sub: 'trophies', ask: true },
      { id: 'pr_coach', label: 'Assistant Coach', emoji: '🧠', cmd: 'premium', sub: 'coach', ask: true },
      { id: 'pr_on', label: 'Owner: Premium On', emoji: '✅', cmd: 'premium', sub: 'on', ask: true },
      { id: 'pr_off', label: 'Owner: Premium Off', emoji: '⛔', cmd: 'premium', sub: 'off', ask: true },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    emoji: '⚙️',
    blurb: 'Link your EA club, the bot\'s look, panels, Twitch alerts and win claims.',
    actions: [
      { id: 'ad_setclub', label: 'Link EA Club', emoji: '🔗', cmd: 'setclub', ask: true, style: 'primary' },
      { id: 'ad_playerhub', label: 'Post Player Hub', emoji: '🙋', builtin: 'playerhub' },
      { id: 'ad_control', label: 'Control Panel', emoji: '🎛️', cmd: 'squadiq' },
      { id: 'ad_refresh', label: 'Refresh Panel', emoji: '♻️', cmd: 'refreshpanel' },
      { id: 'ad_eapanel', label: 'EA Panel', emoji: '🎮', cmd: 'eapanel' },
      { id: 'ad_brand', label: 'Brand', emoji: '🎨', cmd: 'brand', perm: F.ManageGuild, ask: true, fields: ['color', 'footer', 'lineup_title', 'logo_url', 'nickname'] },
      { id: 'ad_avatar', label: 'Bot Avatar', emoji: '🖼️', cmd: 'brand', perm: F.ManageGuild, fields: ['avatar'], required: ['avatar'] },
      { id: 'ad_brandreset', label: 'Reset Brand', emoji: '↩️', cmd: 'brand', perm: F.ManageGuild, fixed: { reset: true } },
      { id: 'ad_twitch', label: 'Twitch Alert', emoji: '🟣', cmd: 'twitchsetup' },
      { id: 'ad_twitchremove', label: 'Remove Twitch', emoji: '➖', cmd: 'twitchremove' },
      { id: 'ad_twitchlist', label: 'Twitch List', emoji: '📃', cmd: 'twitchlist' },
      { id: 'ad_pending', label: 'Pending Wins', emoji: '⏳', cmd: 'pendingwins' },
      { id: 'ad_verify', label: 'Verify a Win', emoji: '✔️', cmd: 'verifywin' },
      { id: 'ad_network', label: 'Network Setup', emoji: '🌐', cmd: 'network', sub: 'setup', perm: F.ManageGuild, ask: true },
      { id: 'ad_netstatus', label: 'Network Status', emoji: '🛰️', cmd: 'network', sub: 'status' },
      { id: 'ad_netsuspend', label: 'Owner: Network Suspend', emoji: '⛔', cmd: 'network', sub: 'suspend', ask: true },
    ],
  },
];

const ACTIONS = new Map();
for (const a of PLAYER_ACTIONS) ACTIONS.set(a.id, { ...a, area: null });
for (const area of AREAS) for (const a of area.actions) ACTIONS.set(a.id, { ...a, area });

const STYLES = { primary: ButtonStyle.Primary, danger: ButtonStyle.Danger, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success };

// Where an action lives, in words, for help text and messages: "/manager → Drafts → Start Draft"
function where(actionId) {
  const a = ACTIONS.get(actionId);
  if (!a) return '';
  return a.area ? `/manager → ${a.area.label} → ${a.label}` : `/me → ${a.label}`;
}

function humanize(name) {
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---------- Menus ----------

function actionButtons(actions) {
  return chunk(actions, 5).map((row) =>
    new ActionRowBuilder().addComponents(
      row.map((a) =>
        new ButtonBuilder()
          .setCustomId(`gp:a:${a.id}`)
          .setLabel(a.label)
          .setEmoji(a.emoji)
          .setStyle(STYLES[a.style] || ButtonStyle.Secondary)
      )
    )
  );
}

// On the hub it opens a private area menu; inside an area menu (switching) it swaps that menu in place
function areaSelect(selectedKey, placeholder = 'More tools: pick an area', switching = false) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(switching ? 'gp:area-switch' : 'gp:areas')
      .setPlaceholder(placeholder)
      .addOptions(AREAS.map((a) => ({ label: a.label, value: a.key, emoji: a.emoji, description: a.blurb.slice(0, 100), default: a.key === selectedKey })))
  );
}

function areaMenu(key) {
  const area = AREAS.find((a) => a.key === key) || AREAS[0];
  const embed = new EmbedBuilder()
    .setTitle(`${area.emoji} ${area.label}`)
    .setColor(0x5865f2)
    .setDescription(`${area.blurb}\n\nButtons that need details open a short form first.`);
  return { embeds: [embed], components: [...actionButtons(area.actions), areaSelect(area.key, 'Switch area', true)] };
}

function playerHub({ persistent = false } = {}) {
  const embed = new EmbedBuilder()
    .setTitle('🙋 Player Hub')
    .setColor(0x5865f2)
    .setDescription(
      persistent
        ? 'Everything you need on match night. Buttons work for whoever presses them, and anything private is only shown to you.'
        : 'Your stats, events and settings. Leaders: `/manager` has the club tools.'
    );
  return { embeds: [embed], components: actionButtons(PLAYER_ACTIONS) };
}

// Kick-off as two dropdowns (day + time) in the server's timezone instead of free text.
// Required forms preselect today and the current time (rounded up to 5 minutes).
function whenDropdowns(tz, preselect, now = new Date()) {
  const parts = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((p) => [p.type, p.value]));
  const zoneName = (new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName') || {}).value || tz;
  const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' });
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const p = parts(d);
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : null;
    days.push({ label: (name ? `${name} · ${dayFmt.format(d)}` : dayFmt.format(d)).slice(0, 100), value: `${p.year}-${p.month}-${p.day}`, default: preselect && i === 0 });
  }
  const p = parts(now);
  let mins = Number(p.hour) * 60 + Number(p.minute);
  mins = Math.min(Math.ceil(mins / 5) * 5, 23 * 60 + 55);
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const pretty = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
  const times = [{ label: `Right now · ${pretty(mins)} ${zoneName}`, value: hhmm(mins), default: !!preselect }];
  for (let m = 12 * 60; m < 24 * 60; m += 30) if (m !== mins) times.push({ label: `${pretty(m)} ${zoneName}`, value: hhmm(m) });
  return { days, times: times.slice(0, 25), zoneName };
}

// The inputs an action takes, from its old command definition
function actionInputs(schemaByName, action) {
  const cmd = schemaByName.get(action.cmd);
  if (!cmd) return [];
  const parent = action.group ? (cmd.options || []).find((o) => o.type === 2 && o.name === action.group) : cmd;
  const opts = action.sub ? (parent?.options || []).find((o) => o.type === 1 && o.name === action.sub)?.options || [] : (cmd.options || []).filter((o) => o.type > 2);
  return opts.map((o) => (action.required?.includes(o.name) ? { ...o, required: true } : o));
}

// The inputs its form asks for (the web app's control room builds the same form)
function actionFields(schemaByName, action) {
  const fixed = action.fixed || {};
  const inputs = actionInputs(schemaByName, action).filter((o) => !(o.name in fixed));
  if (action.fields) return action.fields.map((n) => inputs.find((o) => o.name === n)).filter(Boolean);
  const usable = inputs.filter((o) => o.type !== 11);
  return [...usable.filter((o) => o.required), ...usable.filter((o) => !o.required)].slice(0, 5);
}

// Why this member may not use the action, or null. Shared with the web app's control room.
function deniedReason(member, action, isManager) {
  if (action.area && !isManager(member)) return `Only captains, managers and admins can use **${action.area.label}** tools.`;
  if (action.perm) {
    const perms = member?.permissions;
    const ok = typeof perms?.has === 'function' ? perms.has(action.perm) : (BigInt(perms || 0) & action.perm) === action.perm;
    if (!ok) return `You need the **${new PermissionsBitField(action.perm).toArray().join(', ').replace(/([a-z])([A-Z])/g, '$1 $2')}** permission for this.`;
  }
  return null;
}

function createPanels(deps) {
  const { schemas, isManager, dispatch } = deps;
  const schemaByName = new Map(schemas.map((c) => [c.name, c]));
  const formFields = (action) => actionFields(schemaByName, action);

  // ---------- Who may use what ----------

  function denied(interaction, action) {
    return deniedReason(interaction.member, action, isManager);
  }

  // ---------- Running an action ----------

  // Run the old command handler for this action with these input values
  function run(interaction, action, values) {
    return dispatch(commandProxy(interaction, action, { ...values, ...(action.fixed || {}) }));
  }

  async function startAction(interaction, action) {
    const why = denied(interaction, action);
    if (why) return interaction.reply({ content: `🔒 ${why}`, flags: 64 });

    if (action.builtin === 'playerhub') {
      const missing = missingChannelPerms(interaction.channel, interaction.guild?.members.me);
      if (missing.length) return interaction.reply({ content: missingPermsMessage(interaction.channel, missing), flags: 64 });
      await interaction.channel.send(playerHub({ persistent: true }));
      return interaction.reply({ content: '✅ Player Hub posted. Pin it so players can find it.', flags: 64 });
    }

    const fields = formFields(action);
    if (!fields.length || (!action.ask && !fields.some((f) => f.required))) return run(interaction, action, {});
    const modal = await buildForm(interaction, action, fields);
    if (typeof modal === 'string') return interaction.reply({ content: modal, flags: 64 });
    return interaction.showModal(modal);
  }

  // Ask the old autocomplete handler what it would suggest for an input
  async function suggestions(interaction, action, option) {
    let choices = null;
    const probe = autocompleteProxy(interaction, action, option.name, (list) => {
      choices = list;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, PROBE_TIMEOUT_MS));
    await Promise.race([dispatch(probe).catch(() => {}), timeout]);
    return choices;
  }

  async function buildForm(interaction, action, fields) {
    const modal = new ModalBuilder().setCustomId(`gp:m:${action.id}`).setTitle(action.label.slice(0, 45));
    for (const o of fields) {
      if (o.name === 'when' && deps.timezoneFor) {
        const tz = (await deps.timezoneFor(interaction.guildId).catch(() => null)) || 'UTC';
        const req = !!o.required;
        const { days, times, zoneName } = whenDropdowns(tz, req);
        const sel = (id, ph, opts) => new StringSelectMenuBuilder().setCustomId(id).setRequired(req).setMinValues(req ? 1 : 0).setMaxValues(1).setPlaceholder(ph).addOptions(opts);
        modal.addLabelComponents(new LabelBuilder().setLabel('Kick-off day').setDescription(`Times are ${tz.replace(/_/g, ' ')} (${zoneName}).`.slice(0, 100)).setStringSelectMenuComponent(sel('when__day', req ? 'Pick a day' : 'Keep current day', days)));
        modal.addLabelComponents(new LabelBuilder().setLabel(`Kick-off time (${zoneName})`.slice(0, 45)).setDescription('Change the server timezone in /manager → Events → Timezone.').setStringSelectMenuComponent(sel('when__time', req ? 'Pick a time' : 'Keep current time', times)));
        continue;
      }
      const label = new LabelBuilder().setLabel(humanize(o.name).slice(0, 45));
      if (o.description) label.setDescription(o.description.slice(0, 100));

      let choices = o.choices;
      if (o.type === 3 && o.autocomplete && PICK_OR_TYPE.has(o.name)) {
        const list = (await suggestions(interaction, action, o)) || [];
        if (list.length) {
          modal.addLabelComponents(
            label.setStringSelectMenuComponent(
              new StringSelectMenuBuilder()
                .setCustomId(o.name)
                .setRequired(false)
                .setMinValues(0)
                .setMaxValues(1)
                .setPlaceholder('Pick from the list')
                .addOptions(list.slice(0, 25).map((c) => ({ label: String(c.name).slice(0, 100), value: String(c.value).slice(0, 100) })))
            )
          );
        }
        modal.addLabelComponents(
          new LabelBuilder()
            .setLabel(list.length ? 'Not listed? Type it exactly' : humanize(o.name).slice(0, 45))
            .setTextInputComponent(new TextInputBuilder().setCustomId(o.name + TYPED).setStyle(TextInputStyle.Short).setRequired(!list.length && !!o.required).setMaxLength(100))
        );
        continue;
      }
      if (o.type === 3 && o.autocomplete && !FREE_TEXT.has(o.name)) {
        choices = await suggestions(interaction, action, o);
        if (!choices) return 'That list took too long to load. Please try again.';
        if (!choices.length && o.required) return `There is nothing to pick for **${humanize(o.name).toLowerCase()}** yet.`;
        if (!choices.length) continue;
      }

      if (o.type === 5) choices = [{ name: 'Yes', value: 'true' }, { name: 'No', value: 'false' }];

      if (choices) {
        label.setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(o.name)
            .setRequired(!!o.required)
            .setMinValues(o.required ? 1 : 0)
            .setMaxValues(1)
            .setPlaceholder(o.required ? 'Pick one' : 'Optional')
            .addOptions(choices.slice(0, 25).map((c) => ({ label: String(c.name).slice(0, 100), value: String(c.value).slice(0, 100) })))
        );
      } else if (o.type === 6) {
        label.setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId(o.name).setRequired(!!o.required).setMinValues(o.required ? 1 : 0).setMaxValues(1));
      } else if (o.type === 7) {
        const types = action.channels?.[o.name] || o.channel_types || TEXT;
        label.setChannelSelectMenuComponent(
          new ChannelSelectMenuBuilder().setCustomId(o.name).setChannelTypes(types).setRequired(!!o.required).setMinValues(o.required ? 1 : 0).setMaxValues(1)
        );
      } else if (o.type === 8) {
        label.setRoleSelectMenuComponent(new RoleSelectMenuBuilder().setCustomId(o.name).setRequired(!!o.required).setMinValues(o.required ? 1 : 0).setMaxValues(1));
      } else if (o.type === 11) {
        label.setFileUploadComponent(new FileUploadBuilder().setCustomId(o.name).setRequired(!!o.required).setMinValues(o.required ? 1 : 0).setMaxValues(1));
      } else {
        const input = new TextInputBuilder()
          .setCustomId(o.name)
          .setStyle(LONG_TEXT.has(o.name) ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(!!o.required)
          .setMaxLength(Math.min(o.max_length || 4000, 4000));
        if (o.type === 4 || o.type === 10) input.setPlaceholder('A number');
        if (o.name === 'when') {
          input.setPlaceholder('thu 9pm · tomorrow 20:00 · in 2h');
          if (!o.description) label.setDescription('Type it how you\'d say it: "thu 9pm", "tomorrow 8pm", "21 sep 18:00", "in 2h"');
        }
        if (o.name === 'zone') input.setPlaceholder('e.g. America/Chicago, Europe/London');
        if (o.name === 'formation' && !o.description) input.setPlaceholder('e.g. 4-3-3, 4-2-3-1 wide');
        label.setTextInputComponent(input);
      }
      modal.addLabelComponents(label);
    }
    return modal;
  }

  // Turn a submitted form into the values the old handler reads, or an error message
  function readForm(interaction, action) {
    const values = {};
    const members = {};
    for (const o of formFields(action)) {
      if (o.name === 'when' && deps.timezoneFor) {
        let day, time;
        try { day = interaction.fields.getStringSelectValues('when__day')[0]; } catch {}
        try { time = interaction.fields.getStringSelectValues('when__time')[0]; } catch {}
        if (day || time) {
          if (!day || !time) return { error: 'Pick both a **day** and a **time** for kick-off.' };
          values.when = `${day} ${time}`;
        } else if (o.required) return { error: 'Pick a kick-off **day** and **time**.' };
        continue;
      }
      if (PICK_OR_TYPE.has(o.name) && o.autocomplete) {
        let typed = '';
        let picked;
        try {
          typed = interaction.fields.getTextInputValue(o.name + TYPED).trim();
        } catch {}
        try {
          picked = interaction.fields.getStringSelectValues(o.name)[0];
        } catch {}
        const value = typed || picked;
        if (value) values[o.name] = value;
        else if (o.required) return { error: `Pick or type your **${humanize(o.name).toLowerCase()}**.` };
        continue;
      }
      let raw;
      try {
        raw = interaction.fields.getField(o.name);
      } catch {
        continue;
      }
      if (!raw) continue;
      if (o.type === 6) {
        const user = interaction.fields.getSelectedUsers(o.name)?.first();
        if (user) {
          values[o.name] = user;
          members[o.name] = interaction.fields.getSelectedMembers(o.name)?.first() || null;
        }
      } else if (o.type === 7) {
        const ch = interaction.fields.getSelectedChannels(o.name)?.first();
        if (ch) values[o.name] = interaction.guild?.channels.cache.get(ch.id) || ch;
      } else if (o.type === 8) {
        const role = interaction.fields.getSelectedRoles(o.name)?.first();
        if (role) values[o.name] = interaction.guild?.roles.cache.get(role.id) || role;
      } else if (o.type === 11) {
        const file = interaction.fields.getUploadedFiles(o.name)?.first();
        if (file) values[o.name] = file;
      } else if (raw.values) {
        const v = raw.values[0];
        if (v === undefined) continue;
        values[o.name] = o.type === 5 ? v === 'true' : v;
      } else {
        const text = String(raw.value || '').trim();
        if (!text) continue;
        if (o.type === 4 || o.type === 10) {
          const n = o.type === 4 ? Number.parseInt(text, 10) : Number.parseFloat(text);
          if (!Number.isFinite(n) || (o.type === 4 && !/^-?\d+$/.test(text))) return { error: `**${humanize(o.name)}** needs to be a ${o.type === 4 ? 'whole ' : ''}number.` };
          if (o.min_value !== undefined && n < o.min_value) return { error: `**${humanize(o.name)}** must be at least ${o.min_value}.` };
          if (o.max_value !== undefined && n > o.max_value) return { error: `**${humanize(o.name)}** must be at most ${o.max_value}.` };
          values[o.name] = n;
        } else {
          values[o.name] = text;
        }
      }
    }
    return { values, members };
  }

  // ---------- Interaction routing ----------

  async function handleCommand(interaction) {
    if (interaction.commandName !== 'me') return false;
    await interaction.reply({ ...playerHub(), flags: 64 });
    return true;
  }

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand?.() && !interaction.__gpProxy) return handleCommand(interaction);
    if (!interaction.guildId) return false;

    if (interaction.isStringSelectMenu() && (interaction.customId === 'gp:areas' || interaction.customId === 'gp:area-switch')) {
      const area = AREAS.find((a) => a.key === interaction.values[0]);
      if (!isManager(interaction.member)) {
        await interaction.reply({ content: `🔒 Only captains, managers and admins can use **${area?.label || 'these'}** tools. Players: try \`/me\`.`, flags: 64 });
        return true;
      }
      if (interaction.customId === 'gp:area-switch') await interaction.update(areaMenu(area?.key));
      else await interaction.reply({ ...areaMenu(area?.key), flags: 64 });
      return true;
    }

    if (interaction.isButton() && interaction.customId.startsWith('gp:a:')) {
      const action = ACTIONS.get(interaction.customId.slice(5));
      if (!action) {
        await interaction.reply({ content: 'That button is from an older version of the bot. Open `/manager` or `/me` again.', flags: 64 });
        return true;
      }
      await startAction(interaction, action);
      return true;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('gp:m:')) {
      const action = ACTIONS.get(interaction.customId.slice(5));
      if (!action) return false;
      const why = denied(interaction, action);
      if (why) {
        await interaction.reply({ content: `🔒 ${why}`, flags: 64 });
        return true;
      }
      const { values, members, error } = readForm(interaction, action);
      if (error) {
        await interaction.reply({ content: `❌ ${error}`, flags: 64 });
        return true;
      }
      const proxy = commandProxy(interaction, action, { ...values, ...(action.fixed || {}) }, members);
      await dispatch(proxy);
      return true;
    }

    return false;
  }

  return { handleInteraction };
}

// ---------- Proxies: a button press or form dressed up as the old slash command ----------

function optionResolver(action, values, members = {}) {
  const get = (name, required) => {
    const v = values[name];
    if ((v === undefined || v === null) && required) throw new Error(`Missing required option "${name}"`);
    return v ?? null;
  };
  return {
    getString: (n, r) => {
      const v = get(n, r);
      return v === null ? null : String(v);
    },
    getInteger: (n, r) => get(n, r),
    getNumber: (n, r) => get(n, r),
    getBoolean: (n, r) => get(n, r),
    getUser: (n, r) => get(n, r),
    getMember: (n) => members[n] || null,
    getChannel: (n, r) => get(n, r),
    getRole: (n, r) => get(n, r),
    getAttachment: (n, r) => get(n, r),
    getMentionable: (n, r) => get(n, r),
    getSubcommand: (required = true) => {
      if (!action.sub && required) throw new Error('No subcommand');
      return action.sub || null;
    },
    getSubcommandGroup: (required = false) => {
      if (!action.group && required) throw new Error('No subcommand group');
      return action.group || null;
    },
    getFocused: () => '',
    get data() {
      return Object.entries(values).map(([name, value]) => ({ name, value }));
    },
  };
}

function commandProxy(base, action, values, members) {
  const proxy = Object.create(base);
  Object.assign(proxy, {
    __gpProxy: true,
    commandName: action.cmd,
    options: optionResolver(action, values, members),
    isChatInputCommand: () => true,
    isCommand: () => true,
    isAutocomplete: () => false,
    isButton: () => false,
    isAnySelectMenu: () => false,
    isStringSelectMenu: () => false,
    isUserSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    // Look like a slash command, not the button or form it came from
    customId: undefined,
    values: undefined,
    fields: undefined,
    message: undefined,
  });
  return proxy;
}

function autocompleteProxy(base, action, optionName, onChoices) {
  const proxy = Object.create(base);
  const options = optionResolver(action, {});
  options.getFocused = (full) => (full ? { name: optionName, value: '', focused: true } : '');
  Object.assign(proxy, {
    __gpProxy: true,
    commandName: action.cmd,
    options,
    isAutocomplete: () => true,
    isChatInputCommand: () => false,
    isCommand: () => false,
    isButton: () => false,
    isAnySelectMenu: () => false,
    isStringSelectMenu: () => false,
    isUserSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    respond: async (choices) => onChoices(choices || []),
    reply: async () => {},
    deferReply: async () => {},
    customId: undefined,
    values: undefined,
    fields: undefined,
    message: undefined,
  });
  return proxy;
}

module.exports = { createPanels, PANEL_COMMANDS, PLAYER_ACTIONS, AREAS, ACTIONS, where, areaSelect, areaMenu, playerHub, commandProxy, optionResolver, actionFields, deniedReason, whenDropdowns };
