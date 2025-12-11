// ============================================
// SquadIQ Spots - Unified Discord Bot
// Combines Spot Management + Position Preferences
// with Supabase persistence and auto-assign from VC
// ============================================

const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');
const { searchClub, matchesStats } = require('eafc-clubs-api');
const fs = require('fs');
const path = require('path');

// =======================
// ENVIRONMENT & SETUP
// =======================

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN env var not set');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// =======================
// FORMATION DEFINITIONS (loaded from JSON for efficiency)
// =======================

const FORMATIONS_FILE = path.join(__dirname, 'formations.json');
const FORMATIONS_DATA = JSON.parse(fs.readFileSync(FORMATIONS_FILE, 'utf8'));

// Derived lookup maps
const FORMATION_POSITIONS = {};
const FORMATION_INFO = {};

for (const [name, data] of Object.entries(FORMATIONS_DATA)) {
  FORMATION_POSITIONS[name] = data.positions;
  FORMATION_INFO[name] = data.meta || '';
}

// =======================
// CONSTANTS & METADATA
// =======================

const DEFAULT_FORMATION = '4-3-3 FLAT';

const DEFAULT_CLUBS = [
  { key: 'club1', name: 'Club 1', enabled: true },
  { key: 'club2', name: 'Club 2', enabled: false },
  { key: 'club3', name: 'Club 3', enabled: false },
  { key: 'club4', name: 'Club 4', enabled: false },
  { key: 'club5', name: 'Club 5', enabled: false }
];

// All positions available across formations (derived from formations.json)
// Valid positions: GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, CF, ST
const POSITION_PREF_OPTIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
const PREFS_LIMIT = 6;

const POSITION_META = Object.freeze({
  GK: { emoji: '🧤', label: 'Goalkeeper' },
  CB: { emoji: '🧱', label: 'Centre Back' },
  LB: { emoji: '🧱', label: 'Left Back' },
  RB: { emoji: '🧱', label: 'Right Back' },
  LWB: { emoji: '🧱', label: 'Left Wing Back' },
  RWB: { emoji: '🧱', label: 'Right Wing Back' },
  CDM: { emoji: '🛡️', label: 'Defensive Midfielder' },
  CM: { emoji: '🎯', label: 'Central Midfielder' },
  CAM: { emoji: '🎯', label: 'Attacking Midfielder' },
  LM: { emoji: '🏃', label: 'Left Midfielder' },
  RM: { emoji: '🏃', label: 'Right Midfielder' },
  LW: { emoji: '🏃', label: 'Left Wing' },
  RW: { emoji: '🏃', label: 'Right Wing' },
  CF: { emoji: '⚽', label: 'Centre Forward' },
  ST: { emoji: '⚽', label: 'Striker' }
});

const RANK_EMOJI = Object.freeze({
  1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣'
});

// Position similarity mapping for smart inference (only valid formation positions)
const POSITION_INFERENCE = Object.freeze({
  GK: [],
  CB: ['CDM', 'LB', 'RB'],
  LB: ['LWB', 'CB', 'LM'],
  RB: ['RWB', 'CB', 'RM'],
  LWB: ['LB', 'LM', 'LW'],
  RWB: ['RB', 'RM', 'RW'],
  CDM: ['CM', 'CB', 'CAM'],
  CM: ['CAM', 'CDM', 'RM', 'LM'],
  CAM: ['CM', 'CF', 'ST', 'RM', 'LM'],
  LM: ['LW', 'CM', 'LWB', 'CAM'],
  RM: ['RW', 'CM', 'RWB', 'CAM'],
  LW: ['LM', 'ST', 'CF', 'RW'],
  RW: ['RM', 'ST', 'CF', 'LW'],
  CF: ['ST', 'CAM', 'RW', 'LW'],
  ST: ['CF', 'CAM', 'RW', 'LW']
});

// =======================
// COMMANDS
// =======================

const COMMANDS = [
  // Spot Management Commands
  { name: 'spotpanel', description: 'Create the global control panel for club spots.' },
  { name: 'spots', description: 'Show a read-only board with club dropdown.' },
  { name: 'vcspots', description: 'Create/update a live club spot panel linked to your current voice channel.' },
  { name: 'spothelp', description: 'Shows the SquadIQ Spots manual & quick commands.' },
  {
    name: 'spotblock',
    description: 'Block or unblock a user from moving players.',
    options: [
      { name: 'user', description: 'User to block or unblock.', type: 6, required: true },
      { name: 'action', description: 'Block or unblock the user.', type: 3, required: true, choices: [{ name: 'Block', value: 'block' }, { name: 'Unblock', value: 'unblock' }] }
    ]
  },
  { name: 'whoisplaying', description: 'Show who is currently slotted in your voice channel club (if linked).' },
  { name: 'pospanel', description: 'Create the shared position preference panel.' },
  { name: 'myprefs', description: 'Open your personal position preferences editor.' },
  { name: 'posboard', description: 'Show position preferences for players in your current voice channel.' },
  { name: 'posprefs', description: 'View position preferences for VC members or online players.' },
  { name: 'autoassign', description: 'Toggle auto-assign for the current club.' },
  { 
    name: 'syncprefs', 
    description: 'Sync position preferences from Discord roles.',
    options: [
      { name: 'scope', description: 'Sync just yourself or the whole server.', type: 3, required: false, choices: [
        { name: 'Just Me', value: 'me' },
        { name: 'Entire Server', value: 'all' }
      ]}
    ]
  },

  // Draft System Commands
  { name: 'draft', description: 'Start a draft with players in your current voice channel.' },
  { 
    name: 'draftpick', 
    description: 'Pick a player for your team (captains only).',
    options: [
      { name: 'player', description: 'The player to pick.', type: 6, required: true }
    ]
  },
  { 
    name: 'draftresult', 
    description: 'Report the result of the current draft.',
    options: [
      { name: 'team_a_score', description: 'Score for Team A.', type: 4, required: true },
      { name: 'team_b_score', description: 'Score for Team B.', type: 4, required: true }
    ]
  },
  { name: 'draftcancel', description: 'Cancel the current draft (captains/admins only).' },

  // Player Rating & Profile Commands
  { 
    name: 'profile', 
    description: 'View a player\'s profile and ratings.',
    options: [
      { name: 'player', description: 'The player to view (defaults to yourself).', type: 6, required: false }
    ]
  },
  { 
    name: 'leaderboard', 
    description: 'Show the server leaderboard.',
    options: [
      { name: 'type', description: 'Leaderboard type.', type: 3, required: false, choices: [
        { name: 'Overall Rating', value: 'overall' },
        { name: 'Win Rate', value: 'win_rate' },
        { name: 'Goals', value: 'goals' },
        { name: 'Assists', value: 'assists' },
        { name: 'Form', value: 'form' }
      ]},
      { name: 'position', description: 'Filter by position.', type: 3, required: false }
    ]
  },
  { name: 'mystats', description: 'Quick view of your own stats and current form.' },

  // Availability & Event Commands
  { 
    name: 'event', 
    description: 'Create an availability event.',
    options: [
      { name: 'title', description: 'Event title.', type: 3, required: true },
      { name: 'date', description: 'Date and time (e.g., "2024-01-15 20:00").', type: 3, required: true },
      { name: 'type', description: 'Event type.', type: 3, required: false, choices: [
        { name: 'League Match', value: 'league' },
        { name: 'Tournament', value: 'tournament' },
        { name: 'Draft Night', value: 'draft' },
        { name: 'Practice', value: 'practice' }
      ]},
      { name: 'description', description: 'Event description.', type: 3, required: false }
    ]
  },
  { 
    name: 'available', 
    description: 'Mark your availability for an event.',
    options: [
      { name: 'response', description: 'Your availability.', type: 3, required: true, choices: [
        { name: 'Yes', value: 'yes' },
        { name: 'No', value: 'no' },
        { name: 'Maybe', value: 'maybe' }
      ]}
    ]
  },
  { 
    name: 'attendance', 
    description: 'Mark attendance after an event (managers only).',
    options: [
      { name: 'player', description: 'The player to mark.', type: 6, required: true },
      { name: 'showed', description: 'Did they show up?', type: 5, required: true }
    ]
  },

  // Competition Win Commands
  { 
    name: 'claimwin', 
    description: 'Claim a competition win for verification.',
    options: [
      { name: 'competition', description: 'Competition name.', type: 3, required: true },
      { name: 'type', description: 'Competition type.', type: 3, required: true, choices: [
        { name: 'Tournament', value: 'tournament' },
        { name: 'League', value: 'league' }
      ]},
      { name: 'tier', description: 'Competition tier.', type: 3, required: true, choices: [
        { name: 'Major', value: 'major' },
        { name: 'Minor', value: 'minor' },
        { name: 'Community', value: 'community' },
        { name: 'Division 1', value: 'div1' },
        { name: 'Division 2', value: 'div2' },
        { name: 'Division 3', value: 'div3' },
        { name: 'Division 4', value: 'div4' }
      ]},
      { name: 'proof', description: 'Proof URL (screenshot/clip).', type: 3, required: false }
    ]
  },
  { 
    name: 'verifywin', 
    description: 'Verify a pending win claim (admins only).',
    options: [
      { name: 'claim_id', description: 'The claim ID to verify.', type: 3, required: true },
      { name: 'action', description: 'Approve or reject.', type: 3, required: true, choices: [
        { name: 'Approve', value: 'approve' },
        { name: 'Reject', value: 'reject' }
      ]},
      { name: 'reason', description: 'Reason (required for rejection).', type: 3, required: false }
    ]
  },
  { name: 'pendingwins', description: 'Show pending win claims (admins only).' },

  // EA FC Pro Clubs Integration Commands
  {
    name: 'setclub',
    description: 'Link your club to EA FC Pro Clubs for automatic stats tracking.',
    options: [
      { name: 'name', description: 'Your EA FC Pro Clubs team name.', type: 3, required: true },
      { name: 'platform', description: 'Your gaming platform.', type: 3, required: true, choices: [
        { name: 'PlayStation 5', value: 'ps5' },
        { name: 'PlayStation 4', value: 'ps4' },
        { name: 'Xbox Series X|S', value: 'xbox-series-xs' },
        { name: 'Xbox One', value: 'xboxone' },
        { name: 'PC', value: 'pc' }
      ]},
      { name: 'stats_channel', description: 'Channel to post match results (optional).', type: 7, required: false }
    ]
  },
  {
    name: 'clubstats',
    description: 'Toggle or check EA stats monitoring for the current club.',
    options: [
      { name: 'action', description: 'Enable, disable, or check status.', type: 3, required: true, choices: [
        { name: 'Enable monitoring', value: 'enable' },
        { name: 'Disable monitoring', value: 'disable' },
        { name: 'Show status', value: 'status' }
      ]}
    ]
  },
  { name: 'syncclub', description: 'Manually sync recent matches from EA FC Pro Clubs.' },
  {
    name: 'linkea',
    description: 'Link your EA username to your Discord account for stats tracking.',
    options: [
      { name: 'username', description: 'Your EA FC Pro Clubs username.', type: 3, required: true }
    ]
  },

  // Admin Panel
  { name: 'squadiq', description: 'Launch the SquadIQ control panel in this channel (admin only).' },
  { name: 'refreshpanel', description: 'Force refresh the admin panel in this channel.' }
];

// =======================
// CACHES & STATE
// =======================

const guildStates = new Map();
const positionPrefsCache = new Map();
const blockedUsersCache = new Map();
const dragState = new Map();
const guildQueues = new Map();
const pendingReadyChecks = new Map(); // Map<uniqueId, { guildId, clubKey, vcId, userId, positions }>
const activeDrafts = new Map(); // Map<guildId, draftData>
const eaMonitoringIntervals = new Map(); // Map<guildId_clubKey, intervalId> for EA polling

// =======================
// SUPABASE FUNCTIONS
// =======================

async function loadGuildSettings(guildId) {
  try {
    const { data, error } = await supabase
      .from('guild_settings')
      .select('*')
      .eq('guild_id', guildId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Error loading guild settings:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('❌ Exception loading guild settings:', err);
    return null;
  }
}

async function saveGuildSettings(guildId, state) {
  try {
    const { error } = await supabase
      .from('guild_settings')
      .upsert({
        guild_id: guildId,
        clubs: state.clubs,
        board_state: state.boardState,
        current_club_key: state.currentClubKey,
        admin_panel_channel_id: state.adminPanelChannelId,
        admin_panel_message_id: state.adminPanelMessageId,
        vc_panels: state.vcPanels || {},
        club_vc_links: state.clubVcLinks || {},
        // Store squadiq panel info in vc_panels as a special key
        updated_at: new Date().toISOString()
      }, { onConflict: 'guild_id' });

    if (error) {
      console.error('❌ Error saving guild settings:', error);
    }
  } catch (err) {
    console.error('❌ Exception saving guild settings:', err);
  }
}

async function loadPositionPrefs(guildId, userId) {
  try {
    const { data, error } = await supabase
      .from('position_preferences')
      .select('preferences')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Error loading position prefs:', error);
      return [];
    }
    return data?.preferences || [];
  } catch (err) {
    console.error('❌ Exception loading position prefs:', err);
    return [];
  }
}

async function savePositionPrefs(guildId, userId, prefs) {
  try {
    const { error } = await supabase
      .from('position_preferences')
      .upsert({
        guild_id: guildId,
        user_id: userId,
        preferences: prefs,
        updated_at: new Date().toISOString()
      }, { onConflict: 'guild_id,user_id' });

    if (error) {
      console.error('❌ Error saving position prefs:', error);
    }
  } catch (err) {
    console.error('❌ Exception saving position prefs:', err);
  }
}

async function loadBlockedUsers(guildId) {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('user_id')
      .eq('guild_id', guildId);

    if (error) {
      console.error('❌ Error loading blocked users:', error);
      return [];
    }
    return (data || []).map((row) => row.user_id);
  } catch (err) {
    console.error('❌ Exception loading blocked users:', err);
    return [];
  }
}

async function setUserBlocked(guildId, userId, blocked) {
  try {
    if (blocked) {
      await supabase
        .from('blocked_users')
        .upsert({ guild_id: guildId, user_id: userId }, { onConflict: 'guild_id,user_id' });
    } else {
      await supabase
        .from('blocked_users')
        .delete()
        .eq('guild_id', guildId)
        .eq('user_id', userId);
    }

    // Update cache
    if (!blockedUsersCache.has(guildId)) {
      blockedUsersCache.set(guildId, new Set());
    }
    const set = blockedUsersCache.get(guildId);
    if (blocked) {
      set.add(userId);
    } else {
      set.delete(userId);
    }
  } catch (err) {
    console.error('❌ Exception setting user blocked:', err);
  }
}

// =======================
// HELPER FUNCTIONS
// =======================

function formatFormationInfo(txt) {
  if (!txt) return '';
  txt = txt.replace(/Strengths:/, '**Strengths:**');
  txt = txt.replace(/Weaknesses:/, '\n**Weaknesses:**');
  txt = txt.replace(/Best used:/, '\n**Best used:**');
  txt = txt.replace(/Key players:/, '\n**Key players:**');
  return txt;
}

function getPositionGroup(label) {
  const upper = (label || '').toUpperCase();
  if (upper === 'GK') return 'GK';
  if (upper === 'CB') return 'CB';
  if (['LB', 'RB'].includes(upper)) return 'FB';
  if (['LWB', 'RWB'].includes(upper)) return 'WB';
  if (upper === 'CDM') return 'CDM';
  if (upper === 'CM') return 'CM';
  if (upper === 'CAM') return 'CAM';
  if (upper === 'CF') return 'CF';
  if (['LM', 'RM'].includes(upper)) return 'WM';
  if (['LW', 'RW'].includes(upper)) return 'WING';
  if (upper === 'ST') return 'ST';
  return 'OTHER';
}

// Get inferred positions for a slot based on user preferences
function getInferredMatch(slotLabel, userPrefs) {
  const upper = slotLabel.toUpperCase();
  
  // Direct match first
  if (userPrefs.includes(upper)) return { match: true, priority: 0 };
  
  // Check if any of user's preferred positions would infer to this slot
  for (let i = 0; i < userPrefs.length; i++) {
    const pref = userPrefs[i].toUpperCase();
    const inferences = POSITION_INFERENCE[pref] || [];
    const inferIdx = inferences.indexOf(upper);
    if (inferIdx !== -1) {
      // Priority: preference rank * 10 + inference distance
      return { match: true, priority: (i + 1) * 10 + inferIdx };
    }
  }
  
  // Check reverse: if slot position infers to any of user's preferences
  const slotInferences = POSITION_INFERENCE[upper] || [];
  for (let i = 0; i < userPrefs.length; i++) {
    const pref = userPrefs[i].toUpperCase();
    const inferIdx = slotInferences.indexOf(pref);
    if (inferIdx !== -1) {
      return { match: true, priority: (i + 1) * 10 + inferIdx + 5 };
    }
  }
  
  return { match: false, priority: Infinity };
}

// =======================
// QUEUE HELPERS
// =======================

function ensureQueueState(guildId, clubKey, slotIndex) {
  if (!guildQueues.has(guildId)) guildQueues.set(guildId, {});
  const g = guildQueues.get(guildId);
  if (!g[clubKey]) g[clubKey] = {};
  if (!g[clubKey][slotIndex]) g[clubKey][slotIndex] = [];
  return g[clubKey][slotIndex];
}

function getQueueCount(guildId, clubKey, slotIndex) {
  const queue = guildQueues.get(guildId)?.[clubKey]?.[slotIndex];
  return queue ? queue.length : 0;
}

async function handleSlotOpened(guildId, clubKey, slotIndex) {
  const queue = guildQueues.get(guildId)?.[clubKey]?.[slotIndex];
  if (!queue || queue.length === 0) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const state = guildStates.get(guildId);
  const club = state?.clubs?.find((c) => c.key === clubKey);
  const clubName = club ? club.name : clubKey;
  const slotLabel = state?.boardState?.[clubKey]?.slots?.[slotIndex]?.label || `Slot ${slotIndex + 1}`;

  const notifyList = [...queue];
  queue.length = 0;

  for (const userId of notifyList) {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      await member.send({
        content: `✅ A spot you were waiting for just opened: **${slotLabel}** in **${clubName}**.\nJump into VC and claim it on the SquadIQ panel!`
      });
    } catch {
      // DMs closed / blocked, ignore
    }
  }
}

// =======================
// STATE HELPERS
// =======================

function cloneDefaultClubs() {
  return DEFAULT_CLUBS.map((c) => ({ ...c }));
}

function createEmptyBoardForFormation(formationName) {
  const positions = FORMATION_POSITIONS[formationName] || FORMATION_POSITIONS[DEFAULT_FORMATION];
  return {
    formation: formationName,
    slots: positions.map((label) => ({ label, open: true, takenBy: null }))
  };
}

function createEmptyBoardState(clubs) {
  const state = {};
  clubs.forEach((club) => {
    state[club.key] = createEmptyBoardForFormation(DEFAULT_FORMATION);
  });
  return state;
}

async function getGuildState(guildId) {
  if (!guildId) return null;

  let state = guildStates.get(guildId);
  if (state) return state;

  const dbData = await loadGuildSettings(guildId);

  if (dbData) {
    state = {
      clubs: dbData.clubs || cloneDefaultClubs(),
      boardState: dbData.board_state || createEmptyBoardState(dbData.clubs || cloneDefaultClubs()),
      currentClubKey: dbData.current_club_key || 'club1',
      adminPanelChannelId: dbData.admin_panel_channel_id,
      adminPanelMessageId: dbData.admin_panel_message_id,
      vcPanels: dbData.vc_panels || {},
      clubVcLinks: dbData.club_vc_links || {}
    };
  } else {
    const clubs = cloneDefaultClubs();
    const clubVcLinks = {};
    clubs.forEach((club) => { clubVcLinks[club.key] = null; });

    state = {
      clubs,
      boardState: createEmptyBoardState(clubs),
      currentClubKey: 'club1',
      adminPanelChannelId: null,
      adminPanelMessageId: null,
      vcPanels: {},
      clubVcLinks,
      autoAssign: {}
    };
  }

  if (!state.clubVcLinks) state.clubVcLinks = {};
  state.clubs.forEach((club) => {
    if (!(club.key in state.clubVcLinks)) {
      state.clubVcLinks[club.key] = null;
    }
  });

  guildStates.set(guildId, state);
  return state;
}

function getClubByKey(clubs, key) {
  return clubs.find((c) => c.key === key);
}

async function getUserPrefs(guildId, userId) {
  if (!positionPrefsCache.has(guildId)) {
    positionPrefsCache.set(guildId, new Map());
  }
  const guildPrefs = positionPrefsCache.get(guildId);

  if (guildPrefs.has(userId)) {
    return guildPrefs.get(userId);
  }

  const prefs = await loadPositionPrefs(guildId, userId);
  guildPrefs.set(userId, prefs);
  return prefs;
}

async function setUserPrefs(guildId, userId, prefs) {
  if (!positionPrefsCache.has(guildId)) {
    positionPrefsCache.set(guildId, new Map());
  }
  positionPrefsCache.get(guildId).set(userId, prefs);
  await savePositionPrefs(guildId, userId, prefs);
}

async function isUserBlocked(guildId, userId) {
  if (!blockedUsersCache.has(guildId)) {
    const blocked = await loadBlockedUsers(guildId);
    blockedUsersCache.set(guildId, new Set(blocked));
  }
  return blockedUsersCache.get(guildId).has(userId);
}

function getDrag(guildId, userId) {
  const guildDrag = dragState.get(guildId);
  return guildDrag?.[userId] || null;
}

function setDrag(guildId, userId, drag) {
  if (!drag) {
    const guildDrag = dragState.get(guildId);
    if (guildDrag) delete guildDrag[userId];
    return;
  }
  if (!dragState.has(guildId)) dragState.set(guildId, {});
  dragState.get(guildId)[userId] = drag;
}

function getVcPanelByMessage(state, messageId) {
  if (!state.vcPanels) return null;
  for (const [vcId, panel] of Object.entries(state.vcPanels)) {
    if (panel && panel.messageId === messageId) {
      return { vcId, panel };
    }
  }
  return null;
}

// =======================
// PERMISSION HELPERS
// =======================

function isManager(member) {
  if (!member) return false;

  try {
    const perms = member.permissions;
    if (perms && typeof perms.has === 'function') {
      if (perms.has(PermissionsBitField.Flags.ManageGuild)) return true;
    }
  } catch (err) {
    console.warn('⚠️ isManager permissions check failed:', err);
  }

  if (!member.roles?.cache) return false;

  const managerKeywords = ['captain', 'manager', 'owner', 'media', 'admin'];
  return member.roles.cache.some((role) => {
    const name = role.name.toLowerCase();
    return managerKeywords.some((kw) => name.includes(kw));
  });
}

// =======================
// UI BUILDERS
// =======================

function buildEmbedForClub(guildId, clubKey, state) {
  const { clubs, boardState, clubVcLinks } = state;
  const club = getClubByKey(clubs, clubKey);
  const clubBoard = boardState[clubKey];

  if (!club || !clubBoard) {
    return new EmbedBuilder()
      .setTitle('Unknown Club')
      .setDescription('This club no longer exists or is disabled.')
      .setColor(0xff0000);
  }

  const formationName = clubBoard.formation || DEFAULT_FORMATION;
  const formationInfo = FORMATION_INFO[formationName] || '';

  // Count filled vs open spots
  let filled = 0, openCount = 0, placeholders = 0;
  for (const slot of clubBoard.slots) {
    if (!slot.open) {
      filled++;
      if (slot.takenBy === '__NOT_IN_VC__') placeholders++;
    } else {
      openCount++;
    }
  }

  // Build prominent header
  const statusEmoji = openCount === 0 ? '✅' : openCount <= 3 ? '🟡' : '🟢';
  const statusText = openCount === 0 
    ? 'FULL SQUAD' 
    : `${openCount} SPOT${openCount > 1 ? 'S' : ''} OPEN`;

  // Build slot lines
  const lines = [];
  const guildQueue = guildQueues.get(guildId) || {};
  const queuesForClub = guildQueue[clubKey] || {};

  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];
    const emoji = slot.open ? '🟢' : '🔴';

    const queueLen = (queuesForClub[i] || []).length;
    const queueInfo = queueLen > 0 ? ` 🔔${queueLen}` : '';

    let text;
    if (slot.open) {
      text = 'OPEN' + queueInfo;
    } else if (slot.takenBy === '__NOT_IN_VC__') {
      text = 'TAKEN by player not in VC' + queueInfo;
    } else if (slot.takenBy) {
      text = `<@${slot.takenBy}>` + queueInfo;
    } else {
      text = 'TAKEN' + queueInfo;
    }

    lines.push(`**${slot.label}** – ${emoji} ${text}`);
  }

  // Build linked VC info
  const linkedVcId = clubVcLinks?.[clubKey] || null;
  let linkedVcText = linkedVcId ? `\n🔗 **Voice Channel:** <#${linkedVcId}>` : '';

  const autoEnabled = state.autoAssign?.[clubKey];
  if (autoEnabled) {
    linkedVcText += '\n✨ **Auto-assign enabled**';
  }

  // Build formation info section
  let formationSection = '';
  if (formationInfo) {
    formationSection = `\n\n📋 **Formation Details:**\n${formatFormationInfo(formationInfo)}`;
  }

  // Build description with clear sections
  const description = [
    `${statusEmoji} **${statusText}** • ${filled}/${clubBoard.slots.length} players assigned`,
    '',
    '**━━━━━━━━━━━━━━━━━━━━━━**',
    ...lines,
    '**━━━━━━━━━━━━━━━━━━━━━━**',
    linkedVcText,
    formationSection
  ].filter(Boolean).join('\n');

  return new EmbedBuilder()
    .setTitle(`⚽ CURRENT CLUB: ${club.name.toUpperCase()}`)
    .setDescription(description)
    .setColor(openCount === 0 ? 0x00ff00 : openCount <= 3 ? 0xffcc00 : 0x5865f2)
    .setFooter({ text: `Formation: ${formationName} • 🟢 = claim spot • 🔴 = quick actions • 🔔 = waitlist` });
}

function buildButtons(guildId, clubKey, state) {
  const clubBoard = state.boardState[clubKey];
  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];
    const button = new ButtonBuilder()
      .setCustomId(`pos_${clubKey}_${i}`)
      .setLabel(slot.label)
      .setStyle(slot.open ? ButtonStyle.Success : ButtonStyle.Danger);

    currentRow.addComponents(button);
    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  }

  if (currentRow.components.length > 0) rows.push(currentRow);
  return rows;
}

function buildClubSelect(clubs, currentClubKey) {
  const enabledClubs = clubs.filter((club) => club.enabled);
  const select = new StringSelectMenuBuilder()
    .setCustomId('club_select')
    .setPlaceholder('Select club')
    .addOptions(enabledClubs.map((club) => ({
      label: club.name,
      value: club.key,
      default: club.key === currentClubKey
    })));

  return new ActionRowBuilder().addComponents(select);
}

function buildViewerClubSelect(clubs, selectedKey) {
  const enabledClubs = clubs.filter((club) => club.enabled);
  const select = new StringSelectMenuBuilder()
    .setCustomId('viewer_club_select')
    .setPlaceholder('Select club')
    .addOptions(enabledClubs.map((club) => ({
      label: club.name,
      value: club.key,
      default: club.key === selectedKey
    })));

  return new ActionRowBuilder().addComponents(select);
}

function buildAdminComponents(guildId, clubKey, state) {
  const clubRow = buildClubSelect(state.clubs, clubKey);

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`formation_menu_${clubKey}`)
      .setLabel('Formation')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`player_tools_${clubKey}`)
      .setLabel('Player Tools')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`club_tools_${clubKey}`)
      .setLabel('Club Tools')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('open_help')
      .setLabel('❔ Help')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRows = buildButtons(guildId, clubKey, state);
  return [clubRow, controlRow, ...buttonRows.slice(0, 3)];
}

// Position preference UI builders
function buildProgressBar(current, max, length = 11) {
  const safeCurrent = Math.max(0, current || 0);
  const safeMax = Math.max(1, max || 1);
  const safeLength = Math.max(1, length || 11);
  const ratio = safeCurrent / safeMax;
  const filled = Math.min(safeLength, Math.max(0, Math.round(ratio * safeLength)));
  return '█'.repeat(filled) + '░'.repeat(safeLength - filled);
}

function buildPrefsEmbed(selected, formationName = null) {
  const list = selected || [];
  const bar = buildProgressBar(list.length, PREFS_LIMIT, 6);

  let body;
  if (list.length === 0) {
    body = 'No positions selected yet.\nClick buttons below to add up to **6** positions in preference order.\n\n*Tip: We\'ll intelligently match you to similar positions if your exact picks aren\'t open.*';
  } else {
    const lines = list.map((pos, i) => {
      const rank = i + 1;
      const rankIcon = RANK_EMOJI[rank] || `${rank}.`;
      const meta = POSITION_META[pos];
      const friendly = meta ? `${meta.emoji || ''} **${pos}** – ${meta.label}` : `**${pos}**`;
      return `${rankIcon} ${friendly}`;
    });
    body = 'Your current preferences:\n' + lines.join('\n');
  }

  const titleSuffix = formationName ? ` (${formationName})` : '';

  return new EmbedBuilder()
    .setTitle(`🎮 Rank Your Positions${titleSuffix}`)
    .setColor(0x5865f2)
    .setDescription(`Slots: **${list.length}/${PREFS_LIMIT}** \`${bar}\`\n\n${body}`)
    .setFooter({ text: formationName 
      ? `Showing positions for ${formationName} • Preferences saved automatically` 
      : 'Preferences saved automatically • Smart matching fills similar positions' });
}

function buildPrefComponents(selected, availablePositions = null) {
  const list = selected || [];
  const rows = [];
  let currentRow = new ActionRowBuilder();

  // Use formation positions if provided, otherwise use all positions
  const positionsToShow = availablePositions || POSITION_PREF_OPTIONS;
  // Dedupe positions (formations may have duplicate position labels like CB, CB)
  const uniquePositions = [...new Set(positionsToShow)];

  uniquePositions.forEach((pos, index) => {
    const isSelected = list.includes(pos);
    const meta = POSITION_META[pos];

    const button = new ButtonBuilder()
      .setCustomId(`prefpos_${pos}`)
      .setLabel(pos)
      .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary);

    if (meta?.emoji) button.setEmoji(meta.emoji);

    currentRow.addComponents(button);
    if (currentRow.components.length === 5 || index === uniquePositions.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prefs_done').setLabel('Done').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prefs_clear').setLabel('Clear').setStyle(ButtonStyle.Danger)
  ));

  return rows;
}

// Helper to get formation positions from user's linked VC
function getFormationForUserVc(member, state) {
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) return null;

  const vcId = voiceChannel.id;
  const clubVcLinks = state.clubVcLinks || {};
  
  // Find which club is linked to this VC
  for (const [clubKey, linkedVcId] of Object.entries(clubVcLinks)) {
    if (linkedVcId === vcId) {
      const clubBoard = state.boardState?.[clubKey];
      if (clubBoard) {
        const formationName = clubBoard.formation || DEFAULT_FORMATION;
        const positions = FORMATION_POSITIONS[formationName] || [];
        return { formationName, positions };
      }
    }
  }
  return null;
}

// Build filter select for /posprefs command (VC members vs Online vs All)
function buildPosPrefsFilterSelect(vcCount, onlineCount, allCount) {
  const options = [];
  
  if (vcCount > 0) {
    options.push({ label: 'In My Voice Channel', value: '__VC__', description: `${vcCount} player(s) in your VC` });
  }
  if (onlineCount > 0) {
    options.push({ label: 'Online Now', value: '__ONLINE__', description: `${onlineCount} online player(s) with prefs` });
  }
  options.push({ label: 'Entire Server', value: '__ALL__', description: `${allCount} player(s) with saved prefs` });

  const select = new StringSelectMenuBuilder()
    .setCustomId('posprefs_filter_select')
    .setPlaceholder('Choose a filter')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

// Build position prefs embed for a filtered set of participants
function buildPosPrefsEmbedForParticipants(guild, participants, label) {
  const posMap = {};
  POSITION_PREF_OPTIONS.forEach(p => posMap[p] = []);

  for (const { member, prefs } of participants) {
    prefs.forEach((pos, index) => {
      if (posMap[pos]) {
        posMap[pos].push({ userId: member.id, rank: index + 1 });
      }
    });
  }

  POSITION_PREF_OPTIONS.forEach(pos => {
    posMap[pos].sort((a, b) => a.rank - b.rank);
  });

  const fields = POSITION_PREF_OPTIONS.map(pos => {
    const entries = posMap[pos];
    const meta = POSITION_META[pos];
    const value = entries.length === 0
      ? '*No data*'
      : entries.slice(0, 10).map(e => `${RANK_EMOJI[e.rank] || e.rank} <@${e.userId}>`).join('\n') +
        (entries.length > 10 ? `\n…+${entries.length - 10} more` : '');
    return { name: `${meta?.emoji || ''} ${pos}`, value, inline: true };
  });

  return new EmbedBuilder()
    .setTitle(`🧩 Position Preferences – ${label}`)
    .setColor(0x5865f2)
    .setDescription(`Filter: **${label}** • Players: **${participants.length}**\nSorted by preference rank (1️⃣ = top choice).`)
    .addFields(fields)
    .setFooter({ text: 'Only players with saved preferences are shown.' });
}

// =======================
// AUTO-ASSIGN LOGIC
// =======================

async function autoAssignPlayer(guildId, userId, clubKey, state) {
  const clubBoard = state.boardState[clubKey];
  if (!clubBoard?.slots) return { assigned: false, position: null, matchType: null };

  const prefs = await getUserPrefs(guildId, userId);
  const prefsUpper = (prefs || []).map(p => p.toUpperCase());
  
  // No preferences set - can't auto-assign
  if (prefsUpper.length === 0) {
    return { assigned: false, position: null, matchType: 'no_prefs' };
  }
  
  // Find best matching open slot using inference
  let bestSlot = null;
  let bestPriority = Infinity;
  let bestIndex = -1;
  let matchType = null;

  for (let i = 0; i < clubBoard.slots.length; i++) {
    const slot = clubBoard.slots[i];
    if (!slot.open) continue;

    const { match, priority } = getInferredMatch(slot.label, prefsUpper);
    if (match && priority < bestPriority) {
      bestPriority = priority;
      bestSlot = slot;
      bestIndex = i;
      // Determine match type: direct (priority < 10) vs inferred
      matchType = priority < 10 ? 'direct' : 'inferred';
    }
  }

  if (!bestSlot) {
    return { assigned: false, position: null, matchType: 'no_match' };
  }

  // Clear any existing slot for this user in this club
  clubBoard.slots.forEach((s, idx) => {
    if (s.takenBy === userId) {
      s.open = true;
      s.takenBy = null;
      handleSlotOpened(guildId, clubKey, idx).catch(() => {});
    }
  });

  bestSlot.open = false;
  bestSlot.takenBy = userId;
  
  // Clear any waitlist for this slot
  ensureQueueState(guildId, clubKey, bestIndex).length = 0;
  
  await saveGuildSettings(guildId, state);
  return { assigned: true, position: bestSlot.label, matchType };
}

// =======================
// SMART ASSIGN FROM VC
// =======================

async function smartAssignFromVc(interaction, state, clubKey) {
  const guildId = interaction.guildId;

  if (await isUserBlocked(guildId, interaction.user.id)) {
    return interaction.reply({
      content: 'You have been blocked from moving players on SquadIQ Spots.',
      flags: 64
    });
  }

  const guild = interaction.guild;
  const clubBoard = state.boardState[clubKey];
  const club = getClubByKey(state.clubs, clubKey);
  const clubName = club ? club.name : clubKey;
  const formationName = clubBoard?.formation || DEFAULT_FORMATION;
  
  if (!guild || !clubBoard) {
    return interaction.reply({ content: 'Club not found.', flags: 64 });
  }

  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      content: 'Join a voice channel with your players first.',
      flags: 64
    });
  }

  const members = [...voiceChannel.members.values()].filter((m) => !m.user.bot);
  if (!members.length) {
    return interaction.reply({
      content: 'No non-bot players in your voice channel.',
      flags: 64
    });
  }

  const openSlots = [];
  clubBoard.slots.forEach((slot, idx) => {
    if (slot.open) {
      openSlots.push({ idx, slot, group: getPositionGroup(slot.label) });
    }
  });

  if (!openSlots.length) {
    return interaction.reply({
      content: `❌ No open spots in **${clubName}** (${formationName}) to auto-assign.`,
      flags: 64
    });
  }

  const assigned = [];
  const skipped = { noPrefs: [], noMatch: [] };

  for (const m of members) {
    // Skip if already assigned to a spot in this club
    const existingSlot = clubBoard.slots.find(s => s.takenBy === m.id);
    if (existingSlot) continue;
    
    const prefs = await getUserPrefs(guildId, m.id);
    const prefsUpper = prefs.map(p => p.toUpperCase());
    
    // Track players without preferences
    if (prefsUpper.length === 0) {
      skipped.noPrefs.push(m);
      continue;
    }
    
    // Find best matching open slot using inference
    let pickedIndex = null;
    let bestPriority = Infinity;
    let matchType = 'direct';

    for (const open of openSlots) {
      const { match, priority } = getInferredMatch(open.slot.label, prefsUpper);
      if (match && priority < bestPriority) {
        bestPriority = priority;
        pickedIndex = open.idx;
        matchType = priority < 10 ? 'direct' : 'inferred';
      }
    }

    if (pickedIndex === null) {
      skipped.noMatch.push(m);
      continue;
    }

    const s = clubBoard.slots[pickedIndex];
    s.open = false;
    s.takenBy = m.id;
    assigned.push({ member: m, slotLabel: s.label, matchType });

    const openIdx = openSlots.findIndex((o) => o.idx === pickedIndex);
    if (openIdx !== -1) openSlots.splice(openIdx, 1);
    ensureQueueState(guildId, clubKey, pickedIndex).length = 0;

    if (!openSlots.length) break;
  }

  await saveGuildSettings(guildId, state);
  await refreshClubPanels(guildId, clubKey);

  // Build response with detailed feedback
  const lines = [];
  
  if (assigned.length > 0) {
    lines.push(`✅ **Assigned ${assigned.length} player(s) to ${clubName}:**`);
    for (const a of assigned) {
      const indicator = a.matchType === 'direct' ? '🎯' : '🔄';
      lines.push(`${indicator} <@${a.member.id}> → **${a.slotLabel}**`);
    }
  }
  
  if (skipped.noPrefs.length > 0) {
    lines.push('');
    lines.push(`⚠️ **${skipped.noPrefs.length} player(s) have no preferences set:**`);
    lines.push(skipped.noPrefs.map(m => `• <@${m.id}>`).join('\n'));
    lines.push('*They can set preferences via Player Tools → Set Preferences*');
  }
  
  if (skipped.noMatch.length > 0) {
    lines.push('');
    lines.push(`❌ **${skipped.noMatch.length} player(s) couldn't be matched:**`);
    lines.push(skipped.noMatch.map(m => `• <@${m.id}>`).join('\n'));
    lines.push('*Their preferences don\'t match any open positions*');
  }
  
  if (openSlots.length > 0) {
    lines.push('');
    lines.push(`📋 **${openSlots.length} spot(s) still open:** ${openSlots.map(o => o.slot.label).join(', ')}`);
  }

  if (assigned.length === 0 && skipped.noPrefs.length === 0 && skipped.noMatch.length === 0) {
    return interaction.reply({
      content: `ℹ️ All VC members are already assigned spots in **${clubName}**.`,
      flags: 64
    });
  }

  return interaction.reply({
    content: lines.join('\n'),
    flags: 64
  });
}

// =======================
// READY CHECK
// =======================

async function sendReadyCheck(interaction, state, clubKey) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({
      content: 'Join the voice channel you want to ready-check first.',
      flags: 64
    });
  }

  const members = [...voiceChannel.members.values()].filter((m) => !m.user.bot);
  if (!members.length) {
    return interaction.reply({
      content: 'No non-bot players in your voice channel to ready-check.',
      flags: 64
    });
  }

  const club = getClubByKey(state.clubs, clubKey);
  const clubName = club ? club.name : 'your club';
  const clubBoard = state.boardState[clubKey];
  const guildId = interaction.guildId;

  // Get open positions for the select menu
  const openPositions = [];
  clubBoard.slots.forEach((slot, idx) => {
    if (slot.open) {
      openPositions.push({ label: slot.label, index: idx });
    }
  });

  let sent = 0;
  for (const m of members) {
    try {
      // Check if user already has a spot
      const existingSlot = clubBoard.slots.find(s => s.takenBy === m.id);
      
      if (existingSlot) {
        // Already has a spot, just confirm
        await m.send({
          content: `⚽ **Ready check:** your match is starting soon in **${voiceChannel.name}** for **${clubName}**.\n✅ You're playing **${existingSlot.label}**. Get ready!`
        });
        sent++;
        continue;
      }

      // Get available positions (could change between messages, recalculate)
      const currentOpenPositions = [];
      clubBoard.slots.forEach((slot, idx) => {
        if (slot.open) {
          currentOpenPositions.push({ label: slot.label, index: idx });
        }
      });

      if (currentOpenPositions.length === 0) {
        await m.send({
          content: `⚽ **Ready check:** your match is starting soon in **${voiceChannel.name}** for **${clubName}**.\n⚠️ All spots are taken! Ask a manager to assign you or check the panel.`
        });
        sent++;
        continue;
      }

      // Create unique ID for this ready check response
      const uniqueId = `rc_${guildId}_${m.id}_${Date.now()}`;
      
      // Store pending ready check data
      pendingReadyChecks.set(uniqueId, {
        guildId,
        clubKey,
        vcId: voiceChannel.id,
        userId: m.id,
        positions: currentOpenPositions,
        createdAt: Date.now()
      });

      // Build position select menu (max 25 options in Discord)
      const selectOptions = currentOpenPositions.slice(0, 25).map(pos => ({
        label: pos.label,
        value: `${uniqueId}_${pos.index}`,
        description: `Claim ${pos.label} position`
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ready_check_position_${uniqueId}`)
        .setPlaceholder('Select your position')
        .addOptions(selectOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await m.send({
        content: `⚽ **Ready check:** your match is starting soon in **${voiceChannel.name}** for **${clubName}**.\n\n📍 **Select your position** to claim your spot:`,
        components: [row]
      });
      sent++;
    } catch {
      // ignore DM failures
    }
  }

  // Clean up old pending ready checks (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, data] of pendingReadyChecks.entries()) {
    if (data.createdAt < tenMinutesAgo) {
      pendingReadyChecks.delete(key);
    }
  }

  return interaction.reply({
    content: `📢 Sent ready-check DMs to **${sent}** player(s) in ${voiceChannel}.`,
    flags: 64
  });
}

// =======================
// PANEL REFRESH
// =======================

async function refreshClubPanels(guildId, clubKey) {
  const state = guildStates.get(guildId);
  if (!state) return;

  if (state.adminPanelChannelId && state.adminPanelMessageId && state.currentClubKey === clubKey) {
    try {
      const channel = await client.channels.fetch(state.adminPanelChannelId);
      if (!channel) {
        state.adminPanelChannelId = null;
        state.adminPanelMessageId = null;
      } else {
        const msg = await channel.messages.fetch(state.adminPanelMessageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, clubKey, state)],
          components: buildAdminComponents(guildId, clubKey, state)
        });
      }
    } catch (err) {
      if (err.code === 10008 || err.code === 50001) {
        state.adminPanelChannelId = null;
        state.adminPanelMessageId = null;
      } else {
        console.error('⚠️ Failed to update admin panel:', err);
      }
    }
  }

  if (state.vcPanels) {
    for (const [vcId, panel] of Object.entries(state.vcPanels)) {
      if (!panel || panel.clubKey !== clubKey) continue;

      try {
        const channel = await client.channels.fetch(panel.textChannelId);
        if (!channel) {
          delete state.vcPanels[vcId];
          continue;
        }

        const msg = await channel.messages.fetch(panel.messageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, clubKey, state)],
          components: buildAdminComponents(guildId, clubKey, state)
        });
      } catch (err) {
        if (err.code === 10008 || err.code === 50001) {
          delete state.vcPanels[vcId];
        } else {
          console.error(`⚠️ Failed to update VC panel for ${vcId}:`, err);
        }
      }
    }
  }
}

function resetClubSpots(boardState, clubKey) {
  const clubBoard = boardState[clubKey];
  if (!clubBoard) return;
  clubBoard.slots.forEach((slot) => {
    slot.open = true;
    slot.takenBy = null;
  });
}

// =======================
// INTERACTION HELPERS
// =======================

async function startAssignFromVc(interaction, state, clubKey) {
  const guildId = interaction.guildId;

  if (await isUserBlocked(guildId, interaction.user.id)) {
    return interaction.reply({
      content: 'You have been blocked from moving players on SquadIQ Spots.',
      flags: 64
    });
  }

  if (!isManager(interaction.member)) {
    return interaction.reply({
      content: 'Only captains, managers, owners, media, or admins can assign or move players.',
      flags: 64
    });
  }

  const { clubs } = state;
  const club = getClubByKey(clubs, clubKey);
  if (!club) {
    return interaction.reply({ content: 'Unknown club in assignment request.', flags: 64 });
  }

  const vcPanelInfo = getVcPanelByMessage(state, interaction.message.id);
  let voiceChannel = null;

  if (vcPanelInfo) {
    const { vcId } = vcPanelInfo;
    voiceChannel = interaction.guild.channels.cache.get(vcId) ||
      (await interaction.guild.channels.fetch(vcId).catch(() => null));

    if (!voiceChannel) {
      return interaction.reply({ content: 'The voice channel linked to this panel no longer exists.', flags: 64 });
    }

    if (interaction.member?.voice?.channelId !== vcId) {
      return interaction.reply({
        content: `You must be in **${voiceChannel.name}** to assign players for this panel.`,
        flags: 64
      });
    }
  } else {
    voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: 'You must be in a voice channel with the players you want to assign.',
        flags: 64
      });
    }
  }

  const members = [...voiceChannel.members.values()].filter((m) => !m.user.bot);
  if (members.length === 0) {
    return interaction.reply({ content: 'No non-bot players found in your voice channel to assign.', flags: 64 });
  }

  const memberOptions = members.map((m) => ({
    label: m.displayName || m.user.username,
    value: m.id
  }));

  const options = memberOptions.slice(0, 24);
  options.push({
    label: 'Player not in VC (placeholder)',
    value: '__NOT_IN_VC__',
    description: 'Use when someone is playing but not connected to voice.'
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`assign_player_pick_${clubKey}`)
    .setPlaceholder('Pick a player or placeholder')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.reply({
    content: `Pick a player to assign in **${club.name}**:`,
    components: [row],
    flags: 64
  });
}

async function startManagePlayers(interaction, state, clubKey) {
  const guildId = interaction.guildId;

  if (await isUserBlocked(guildId, interaction.user.id)) {
    return interaction.reply({
      content: 'You have been blocked from moving players on SquadIQ Spots.',
      flags: 64
    });
  }

  if (!isManager(interaction.member)) {
    return interaction.reply({
      content: 'Only captains, managers, owners, media, or admins can remove or move players.',
      flags: 64
    });
  }

  const { clubs, boardState } = state;
  const clubBoard = boardState[clubKey];
  if (!clubBoard) {
    return interaction.reply({ content: 'Club not found.', flags: 64 });
  }

  const seen = new Set();
  const options = [];

  for (const slot of clubBoard.slots) {
    if (slot.open || !slot.takenBy) continue;
    const userId = slot.takenBy;

    if (userId === '__NOT_IN_VC__') {
      if (seen.has(userId)) continue;
      seen.add(userId);
      options.push({
        label: 'Player not in VC (placeholder)',
        value: userId,
        description: 'Placeholder for someone not in voice'
      });
      continue;
    }

    if (seen.has(userId)) continue;
    seen.add(userId);

    let label = userId;
    try {
      const member = await interaction.guild.members.fetch(userId);
      label = member.displayName || member.user.username || userId;
    } catch (err) {}

    options.push({
      label,
      value: userId,
      description: 'Currently in at least one spot'
    });
  }

  if (options.length === 0) {
    return interaction.reply({ content: 'There are no players to manage for this club.', flags: 64 });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`manage_player_pick_${clubKey}`)
    .setPlaceholder('Select a player to remove/move')
    .addOptions(options.slice(0, 25));

  const row = new ActionRowBuilder().addComponents(select);
  const club = getClubByKey(clubs, clubKey);

  return interaction.reply({
    content: `Pick a player in **${club ? club.name : clubKey}** to remove or move:`,
    components: [row],
    flags: 64
  });
}

async function startSetClubVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content: 'Only captains, managers, owners, media, or admins can set the voice channel.',
      flags: 64
    });
  }

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: 'Guild not found.', flags: 64 });
  }

  const club = getClubByKey(state.clubs, clubKey);
  if (!club) {
    return interaction.reply({ content: 'Unknown club in voice channel link request.', flags: 64 });
  }

  const voiceChannels = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice
  );

  if (!voiceChannels.size) {
    return interaction.reply({ content: 'No voice channels found in this server to link.', flags: 64 });
  }

  const currentLinkedId = state.clubVcLinks?.[clubKey] || null;
  const options = [];

  const sorted = [...voiceChannels.values()].sort((a, b) => {
    if (a.rawPosition !== b.rawPosition) {
      return a.rawPosition - b.rawPosition;
    }
    return a.name.localeCompare(b.name);
  });

  for (const vc of sorted) {
    options.push({
      label: vc.name.slice(0, 100),
      value: vc.id,
      default: vc.id === currentLinkedId
    });
    if (options.length >= 24) break;
  }

  options.push({ label: 'Clear voice channel link', value: '__NONE__' });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`set_vc_select_${clubKey}`)
    .setPlaceholder('Select a voice channel')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.reply({
    content: `Choose a voice channel to link to **${club.name}**.`,
    components: [row],
    flags: 64
  });
}

async function doResetSpots(interaction, state, guildId, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content: 'Only captains, managers, owners, media, or admins can reset spots.',
      flags: 64
    });
  }

  const clubBoard = state.boardState[clubKey];
  if (clubBoard?.slots) {
    for (let i = 0; i < clubBoard.slots.length; i++) {
      handleSlotOpened(guildId, clubKey, i).catch(() => {});
    }
  }

  resetClubSpots(state.boardState, clubKey);
  await saveGuildSettings(guildId, state);
  await refreshClubPanels(guildId, clubKey);

  return interaction.reply({ content: 'All spots set to 🟢 OPEN for this club.', flags: 64 });
}

async function setClubFormation(interaction, guildId, clubKey, formationName) {
  const state = await getGuildState(guildId);
  if (!state) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Guild state not found.', flags: 64 });
    }
    return;
  }

  const positions = FORMATION_POSITIONS[formationName];
  if (!positions) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Unknown formation.', flags: 64 });
    }
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('⚠️ Error deferring formation change:', err);
    }
  }

  const oldBoard = state.boardState[clubKey];
  const oldSlots = oldBoard?.slots || [];

  const occupants = [];
  for (const slot of oldSlots) {
    if (!slot || slot.open || !slot.takenBy) continue;
    occupants.push({
      playerId: slot.takenBy,
      label: slot.label,
      group: getPositionGroup(slot.label)
    });
  }

  const newBoard = {
    formation: formationName,
    slots: positions.map((label) => ({ label, open: true, takenBy: null }))
  };

  const newSlots = newBoard.slots;
  const usedIndices = new Set();

  const groupOrder = ['GK', 'CB', 'FB', 'CDM', 'CM', 'CAM', 'WM', 'WING', 'ST', 'OTHER'];
  const groupPriority = {};
  groupOrder.forEach((g, i) => { groupPriority[g] = i; });

  occupants.sort((a, b) => {
    const pa = groupPriority[a.group] ?? 999;
    const pb = groupPriority[b.group] ?? 999;
    return pa - pb;
  });

  function findExactIndex(label) {
    for (let i = 0; i < newSlots.length; i++) {
      if (usedIndices.has(i)) continue;
      if (newSlots[i].label === label) return i;
    }
    return -1;
  }

  function findGroupIndex(group) {
    for (let i = 0; i < newSlots.length; i++) {
      if (usedIndices.has(i)) continue;
      if (getPositionGroup(newSlots[i].label) === group) return i;
    }
    return -1;
  }

  function findAnyIndex() {
    for (let i = 0; i < newSlots.length; i++) {
      if (!usedIndices.has(i)) return i;
    }
    return -1;
  }

  for (const occ of occupants) {
    let idx = findExactIndex(occ.label);
    if (idx === -1 && occ.group) {
      idx = findGroupIndex(occ.group);
    }
    if (idx === -1) {
      idx = findAnyIndex();
    }

    if (idx !== -1) {
      newSlots[idx].open = false;
      newSlots[idx].takenBy = occ.playerId;
      usedIndices.add(idx);
    }
  }

  const oldVcId = state.clubVcLinks?.[clubKey] || null;
  state.boardState[clubKey] = newBoard;
  if (!state.clubVcLinks) state.clubVcLinks = {};
  state.clubVcLinks[clubKey] = oldVcId;

  await saveGuildSettings(guildId, state);

  try {
    await refreshClubPanels(guildId, clubKey);
  } catch (err) {
    console.error('⚠️ Error refreshing panels after formation change:', err);
  }

  try {
    await interaction.followUp({
      content: `Formation for this club is now **${formationName}**. Current players were moved into the closest matching spots.`,
      flags: 64
    });
  } catch (err) {
    if (err.code !== 10062) {
      console.error('⚠️ Error sending formation change follow-up:', err);
    }
  }
}

// =======================
// HELP EMBED BUILDER
// =======================

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('📘 SquadIQ Spots Help')
    .setColor(0x5865f2)
    .setDescription(
      '**Core Commands**\n' +
      '`/spotpanel` – Create admin control panel\n' +
      '`/spots` – View spots read-only\n' +
      '`/vcspots` – Link VC to club panel\n' +
      '`/whoisplaying` – See who\'s in your VC club\n' +
      '`/spothelp` – Show this help message\n' +
      '`/spotblock` – Block/unblock a user from moving players\n\n' +
      '**Preference Commands**\n' +
      '`/pospanel` – Create preference panel\n' +
      '`/myprefs` – Edit your preferences privately\n' +
      '`/posboard` – See VC members\' preferences\n' +
      '`/posprefs` – Filter preferences by role\n\n' +
      '**Manager Commands**\n' +
      '`/autoassign` – Toggle auto-assign for current club\n\n' +
      '**Panel Buttons & Menus**\n' +
      '• **Formation** – Change club formation\n' +
      '• **Player Tools** – Assign from VC, smart-assign, move/remove players, ready-check, set preferences\n' +
      '• **Club Tools** – Rename/add/remove clubs, reset spots, link VC, toggle auto-assign, refresh\n\n' +
      '**Quick Tips**\n' +
      '🟢 Click an open spot to **claim** it\n' +
      '🔴 Click a taken spot for **quick actions**: Move, Remove, or Waitlist\n' +
      '🔔 **Waitlist**: Get a DM notification when a spot opens\n' +
      '✨ **Auto-Assign**: Auto-place players in their preferred position when joining VC!'
    )
    .setFooter({ text: 'SquadIQ Spots • Unified Spot Management + Position Preferences' });
}

// =======================
// ADMIN CONTROL PANEL BUILDERS
// =======================

async function buildAdminControlPanelEmbeds(guildId, state) {
  const embeds = [];
  
  // Header embed with branding
  const headerEmbed = new EmbedBuilder()
    .setTitle('🎮 SQUADIQ CONTROL CENTER')
    .setColor(0x5865f2)
    .setDescription(
      '**Your central hub for squad management, drafts, and player analytics.**\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    );
  embeds.push(headerEmbed);
  
  // Club & Formation Status
  const clubKey = state.currentClubKey;
  const club = getClubByKey(state.clubs, clubKey);
  const clubBoard = state.boardState?.[clubKey];
  const formationName = clubBoard?.formation || DEFAULT_FORMATION;
  const linkedVc = state.clubVcLinks?.[clubKey];
  const autoAssignEnabled = state.autoAssign?.[clubKey];
  
  let filledSlots = 0, totalSlots = 0;
  if (clubBoard?.slots) {
    totalSlots = clubBoard.slots.length;
    filledSlots = clubBoard.slots.filter(s => !s.open).length;
  }
  
  const clubStatusEmbed = new EmbedBuilder()
    .setTitle('⚽ CLUB STATUS')
    .setColor(filledSlots === totalSlots ? 0x00ff00 : filledSlots > 0 ? 0xffcc00 : 0x5865f2)
    .addFields(
      { name: '🏟️ Current Club', value: club?.name || 'None', inline: true },
      { name: '📋 Formation', value: formationName, inline: true },
      { name: '👥 Roster', value: `${filledSlots}/${totalSlots} filled`, inline: true },
      { name: '🔗 Linked VC', value: linkedVc ? `<#${linkedVc}>` : 'Not linked', inline: true },
      { name: '✨ Auto-Assign', value: autoAssignEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: '📡 EA Tracking', value: club?.ea_club_id ? '✅ Connected' : '❌ Not linked', inline: true }
    );
  embeds.push(clubStatusEmbed);
  
  // Get some stats from the database
  let playerCount = 0;
  let activeDraftCount = 0;
  let pendingClaimsCount = 0;
  let recentMatchesCount = 0;
  
  try {
    // Count players with prefs in this guild
    const { count: prefCount } = await supabase
      .from('position_preferences')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId);
    playerCount = prefCount || 0;
    
    // Count pending drafts
    const { count: draftCount } = await supabase
      .from('drafts')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .in('status', ['pending', 'picking']);
    activeDraftCount = draftCount || 0;
    
    // Count pending win claims
    const { count: claimsCount } = await supabase
      .from('pending_win_claims')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('status', 'pending');
    pendingClaimsCount = claimsCount || 0;
    
    // Count recent club matches (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: matchCount } = await supabase
      .from('club_matches')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .gte('created_at', weekAgo);
    recentMatchesCount = matchCount || 0;
  } catch (err) {
    console.error('[AdminPanel] Error fetching stats:', err);
  }
  
  // Stats overview embed
  const statsEmbed = new EmbedBuilder()
    .setTitle('📊 SYSTEM STATUS')
    .setColor(0x00d4aa)
    .addFields(
      { name: '👥 Players Registered', value: `${playerCount}`, inline: true },
      { name: '⚔️ Active Drafts', value: `${activeDraftCount}`, inline: true },
      { name: '🏆 Pending Claims', value: `${pendingClaimsCount}`, inline: true },
      { name: '📈 Matches (7d)', value: `${recentMatchesCount}`, inline: true },
      { name: '🌐 Web Dashboard', value: '[Open →](https://squadiq.lovable.app)', inline: true },
      { name: '⏱️ Last Update', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    );
  embeds.push(statsEmbed);
  
  // Quick actions reference
  const actionsEmbed = new EmbedBuilder()
    .setTitle('🛠️ QUICK ACTIONS')
    .setColor(0xff6b35)
    .setDescription(
      '**Use the buttons below or these commands:**\n\n' +
      '**📋 Spot Management**\n' +
      '`/spotpanel` – Full spot control panel\n' +
      '`/vcspots` – Link VC to spots\n' +
      '`/autoassign` – Toggle auto-assignment\n\n' +
      '**⚔️ Draft System**\n' +
      '`/draft` – Start a captain draft\n' +
      '`/draftresult` – Report match result\n\n' +
      '**🎮 EA Integration**\n' +
      '`/setclub` – Link EA Pro Clubs\n' +
      '`/syncclub` – Manual stats sync\n' +
      '`/clubstats` – Check EA status\n\n' +
      '**👤 Player Management**\n' +
      '`/profile` – View player profile\n' +
      '`/leaderboard` – Server rankings\n' +
      '`/syncprefs all` – Sync all roles to prefs\n\n' +
      '**🏆 Competition Tracking**\n' +
      '`/pendingwins` – Review win claims\n' +
      '`/verifywin` – Approve/reject claims\n\n' +
      '**📅 Events**\n' +
      '`/event` – Create availability event'
    );
  embeds.push(actionsEmbed);
  
  return embeds;
}

function buildAdminControlPanelButtons() {
  const rows = [];
  
  // Row 1: Core management
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('squadiq_spotpanel')
      .setLabel('Spot Panel')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('squadiq_draft')
      .setLabel('Start Draft')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('squadiq_leaderboard')
      .setLabel('Leaderboard')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_syncprefs')
      .setLabel('Sync Prefs')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(row1);
  
  // Row 2: EA & Stats
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('squadiq_eaconfig')
      .setLabel('EA Config')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_syncclub')
      .setLabel('Sync Matches')
      .setEmoji('📥')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_pendingwins')
      .setLabel('Pending Claims')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Success)
  );
  rows.push(row2);
  
  // Row 3: Debug & Info
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('squadiq_debug')
      .setLabel('Debug Info')
      .setEmoji('🔧')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_logs')
      .setLabel('Recent Activity')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_help')
      .setLabel('Full Help')
      .setEmoji('❔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Web Dashboard')
      .setEmoji('🌐')
      .setStyle(ButtonStyle.Link)
      .setURL('https://squadiq.lovable.app')
  );
  rows.push(row3);
  
  return rows;
}

async function buildDebugEmbed(guildId, state) {
  const debugInfo = [];
  
  // Guild state
  debugInfo.push('**📦 Guild State**');
  debugInfo.push(`• Clubs loaded: ${state.clubs?.length || 0}`);
  debugInfo.push(`• Current club: ${state.currentClubKey}`);
  debugInfo.push(`• VC panels: ${Object.keys(state.vcPanels || {}).length}`);
  debugInfo.push(`• VC links: ${Object.entries(state.clubVcLinks || {}).filter(([k, v]) => v).length}`);
  debugInfo.push('');
  
  // Caches
  debugInfo.push('**🧠 Cache Status**');
  debugInfo.push(`• Guild states cached: ${guildStates.size}`);
  debugInfo.push(`• Position prefs cached: ${positionPrefsCache.size} guilds`);
  debugInfo.push(`• Blocked users cached: ${blockedUsersCache.size} guilds`);
  debugInfo.push(`• Active drafts: ${activeDrafts.size}`);
  debugInfo.push(`• EA monitors running: ${eaMonitoringIntervals.size}`);
  debugInfo.push('');
  
  // EA Integration
  debugInfo.push('**🎮 EA Integration**');
  for (const club of state.clubs || []) {
    if (club.ea_club_id) {
      const monitorKey = `${guildId}_${club.key}`;
      const isRunning = eaMonitoringIntervals.has(monitorKey);
      debugInfo.push(`• ${club.name}: ID ${club.ea_club_id} (${club.ea_platform}) - ${isRunning ? '🟢 Polling' : '🔴 Stopped'}`);
    }
  }
  
  // Database stats
  let dbStats = {};
  try {
    const tables = ['player_ratings', 'player_stats', 'drafts', 'club_matches'];
    for (const table of tables) {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('guild_id', guildId);
      dbStats[table] = count || 0;
    }
  } catch (err) {
    debugInfo.push('');
    debugInfo.push('**⚠️ DB query error:** ' + err.message);
  }
  
  debugInfo.push('');
  debugInfo.push('**💾 Database Records**');
  debugInfo.push(`• player_ratings: ${dbStats.player_ratings || 0}`);
  debugInfo.push(`• player_stats: ${dbStats.player_stats || 0}`);
  debugInfo.push(`• drafts: ${dbStats.drafts || 0}`);
  debugInfo.push(`• club_matches: ${dbStats.club_matches || 0}`);
  
  return new EmbedBuilder()
    .setTitle('🔧 Debug Information')
    .setColor(0x888888)
    .setDescription(debugInfo.join('\n'))
    .setFooter({ text: `Guild ID: ${guildId} • ${new Date().toISOString()}` });
}

async function buildRecentActivityEmbed(guildId) {
  const activities = [];
  
  try {
    // Recent drafts
    const { data: recentDrafts } = await supabase
      .from('drafts')
      .select('id, status, created_at, captain_a_discord_id, captain_b_discord_id')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (recentDrafts?.length > 0) {
      activities.push('**⚔️ Recent Drafts**');
      for (const d of recentDrafts) {
        const time = Math.floor(new Date(d.created_at).getTime() / 1000);
        activities.push(`• <t:${time}:R> - ${d.status} (Captains: <@${d.captain_a_discord_id}> vs <@${d.captain_b_discord_id}>)`);
      }
      activities.push('');
    }
    
    // Recent matches
    const { data: recentMatches } = await supabase
      .from('club_matches')
      .select('result, score_for, score_against, opponent_club_name, created_at')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentMatches?.length > 0) {
      activities.push('**📊 Recent Matches**');
      for (const m of recentMatches) {
        const time = Math.floor(new Date(m.created_at).getTime() / 1000);
        const emoji = m.result === 'win' ? '✅' : m.result === 'loss' ? '❌' : '🤝';
        activities.push(`• <t:${time}:R> ${emoji} ${m.score_for}-${m.score_against} vs ${m.opponent_club_name}`);
      }
      activities.push('');
    }
    
    // Recent win claims
    const { data: recentClaims } = await supabase
      .from('pending_win_claims')
      .select('claimed_by_discord_id, competition_name, status, created_at')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (recentClaims?.length > 0) {
      activities.push('**🏆 Recent Win Claims**');
      for (const c of recentClaims) {
        const time = Math.floor(new Date(c.created_at).getTime() / 1000);
        const statusEmoji = c.status === 'approved' ? '✅' : c.status === 'rejected' ? '❌' : '⏳';
        activities.push(`• <t:${time}:R> ${statusEmoji} <@${c.claimed_by_discord_id}> - ${c.competition_name}`);
      }
    }
    
  } catch (err) {
    activities.push('**⚠️ Error fetching activity:** ' + err.message);
  }
  
  if (activities.length === 0) {
    activities.push('*No recent activity recorded.*');
  }
  
  return new EmbedBuilder()
    .setTitle('📜 Recent Activity')
    .setColor(0x5865f2)
    .setDescription(activities.join('\n'))
    .setFooter({ text: 'Showing last 24-48 hours of activity' });
}

// =======================
// READY & COMMAND REG
// =======================

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ SquadIQ Spots logged in as ${c.user.tag}`);

  try {
    await c.application.commands.set(COMMANDS);
    console.log('✅ Commands registered');

    for (const guild of c.guilds.cache.values()) {
      try {
        await c.application.commands.set(COMMANDS, guild.id);
      } catch (err) {
        console.error('⚠️ Failed to register commands in guild', guild.id, err);
      }
    }
    
    // Resume EA FC Pro Clubs monitoring for all linked clubs
    resumeEaMonitoring();
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    if (!client.application?.commands) return;
    await client.application.commands.set(COMMANDS, guild.id);
    console.log(`✅ Commands registered in newly joined guild ${guild.name}`);
  } catch (err) {
    console.error('⚠️ Failed to register commands in new guild', guild.id, err);
  }
});

// =======================
// VOICE STATE UPDATE
// =======================

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guildId = oldState.guild?.id || newState.guild?.id;
    if (!guildId) return;

    const state = await getGuildState(guildId);
    if (!state) return;

    const userId = oldState.id || newState.id;

    // User left voice completely
    if (oldState.channelId && !newState.channelId) {
      const touchedClubKeys = new Set();

      for (const clubKey of Object.keys(state.boardState)) {
        const clubBoard = state.boardState[clubKey];
        if (!clubBoard?.slots) continue;

        let changed = false;
        clubBoard.slots.forEach((slot, idx) => {
          if (slot && slot.takenBy === userId) {
            slot.open = true;
            slot.takenBy = null;
            changed = true;
            handleSlotOpened(guildId, clubKey, idx).catch(() => {});
          }
        });
        if (changed) touchedClubKeys.add(clubKey);
      }

      if (touchedClubKeys.size > 0) {
        await saveGuildSettings(guildId, state);
        for (const clubKey of touchedClubKeys) {
          await refreshClubPanels(guildId, clubKey);
        }
      }
      return;
    }

    // User joined a voice channel - check for auto-assign
    if (newState.channelId && (!oldState.channelId || oldState.channelId !== newState.channelId)) {
      for (const [clubKey, vcId] of Object.entries(state.clubVcLinks || {})) {
        if (vcId === newState.channelId && state.autoAssign?.[clubKey]) {
          const assigned = await autoAssignPlayer(guildId, userId, clubKey, state);
          if (assigned) {
            await refreshClubPanels(guildId, clubKey);
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('❌ Error in VoiceStateUpdate handler:', err);
  }
});

// =======================
// MAIN INTERACTION HANDLER
// =======================

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Handle DM interactions for ready check position selection
    if (!interaction.guildId && interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id.startsWith('ready_check_position_')) {
        const uniqueId = id.replace('ready_check_position_', '');
        const pendingData = pendingReadyChecks.get(uniqueId);
        
        if (!pendingData) {
          return interaction.update({
            content: '⏰ This ready check has expired. Please wait for a new ready check from your manager.',
            components: []
          });
        }
        
        const { guildId, clubKey, userId } = pendingData;
        const selectedValue = interaction.values[0];
        const slotIndex = parseInt(selectedValue.split('_').pop(), 10);
        
        // Get the guild state
        const state = await getGuildState(guildId);
        if (!state) {
          return interaction.update({
            content: '❌ Could not find club data. Please contact a manager.',
            components: []
          });
        }
        
        const clubBoard = state.boardState[clubKey];
        const club = getClubByKey(state.clubs, clubKey);
        const clubName = club ? club.name : 'your club';
        
        if (!clubBoard || !clubBoard.slots[slotIndex]) {
          return interaction.update({
            content: '❌ That position no longer exists. The formation may have changed.',
            components: []
          });
        }
        
        const slot = clubBoard.slots[slotIndex];
        
        // Check if slot is still open
        if (!slot.open) {
          // Slot was taken, show remaining options
          const remainingOpen = [];
          clubBoard.slots.forEach((s, idx) => {
            if (s.open) {
              remainingOpen.push({ label: s.label, index: idx });
            }
          });
          
          if (remainingOpen.length === 0) {
            pendingReadyChecks.delete(uniqueId);
            return interaction.update({
              content: `❌ **${slot.label}** was just taken, and all other spots are now full!\nContact a manager to get assigned.`,
              components: []
            });
          }
          
          // Update the select menu with remaining options
          const newUniqueId = `rc_${guildId}_${userId}_${Date.now()}`;
          pendingReadyChecks.set(newUniqueId, { ...pendingData, positions: remainingOpen, createdAt: Date.now() });
          pendingReadyChecks.delete(uniqueId);
          
          const selectOptions = remainingOpen.slice(0, 25).map(pos => ({
            label: pos.label,
            value: `${newUniqueId}_${pos.index}`,
            description: `Claim ${pos.label} position`
          }));
          
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ready_check_position_${newUniqueId}`)
            .setPlaceholder('Select a different position')
            .addOptions(selectOptions);
          
          const row = new ActionRowBuilder().addComponents(selectMenu);
          
          return interaction.update({
            content: `⚠️ **${slot.label}** was just taken! Choose another position:`,
            components: [row]
          });
        }
        
        // Remove user from any existing slot first
        clubBoard.slots.forEach((s, idx) => {
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
            handleSlotOpened(guildId, clubKey, idx).catch(() => {});
          }
        });
        
        // Assign to chosen slot
        slot.open = false;
        slot.takenBy = userId;
        ensureQueueState(guildId, clubKey, slotIndex).length = 0;
        
        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);
        
        // Clean up pending data
        pendingReadyChecks.delete(uniqueId);
        
        return interaction.update({
          content: `✅ You're now playing **${slot.label}** in **${clubName}**! Get ready for the match!`,
          components: []
        });
      }
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) return;

    const state = await getGuildState(guildId);
    if (!state) return;

    const { clubs, boardState } = state;

    // ----- Slash Commands -----
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      if (cmd === 'spotpanel') {
        await interaction.reply({
          embeds: [buildEmbedForClub(guildId, state.currentClubKey, state)],
          components: buildAdminComponents(guildId, state.currentClubKey, state)
        });

        const msg = await interaction.fetchReply();
        state.adminPanelChannelId = interaction.channelId;
        state.adminPanelMessageId = msg.id;
        await saveGuildSettings(guildId, state);
        return;
      }

      if (cmd === 'spots') {
        let key = state.currentClubKey;
        const currentClub = getClubByKey(clubs, key);
        if (!currentClub || !currentClub.enabled) {
          const firstEnabled = clubs.find((c) => c.enabled) || clubs[0];
          key = firstEnabled ? firstEnabled.key : state.currentClubKey;
        }

        return interaction.reply({
          embeds: [buildEmbedForClub(guildId, key, state)],
          components: [buildViewerClubSelect(clubs, key)]
        });
      }

      if (cmd === 'vcspots') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: 'You must be in a voice channel to use `/vcspots`.',
            flags: 64
          });
        }

        const enabledClubs = clubs.filter((c) => c.enabled);
        if (enabledClubs.length === 0) {
          return interaction.reply({
            content: 'No enabled clubs are available. Use `/spotpanel` to add or enable clubs first.',
            flags: 64
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`vcspots_pickclub_${voiceChannel.id}`)
          .setPlaceholder('Select club for this voice channel')
          .addOptions(enabledClubs.map((club) => ({
            label: club.name,
            value: club.key
          })));

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: `Pick which club is playing in **${voiceChannel.name}**. I'll post/update the live panel in this chat.`,
          components: [row],
          flags: 64
        });
      }

      if (cmd === 'spothelp') {
        return interaction.reply({ embeds: [buildHelpEmbed()], flags: 64 });
      }

      if (cmd === 'spotblock') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only captains, managers, owners, media, or admins can use /spotblock.',
            flags: 64
          });
        }

        const target = interaction.options.getUser('user');
        const action = interaction.options.getString('action') || 'block';
        if (!target) {
          return interaction.reply({
            content: 'You must specify a user to block or unblock.',
            flags: 64
          });
        }

        if (action === 'unblock') {
          await setUserBlocked(guildId, target.id, false);
          return interaction.reply({
            content: `✅ <@${target.id}> is now **unblocked** and can move players again.`,
            flags: 64
          });
        }

        await setUserBlocked(guildId, target.id, true);
        return interaction.reply({
          content: `🚫 <@${target.id}> is now **blocked** from moving other players on SquadIQ Spots.`,
          flags: 64
        });
      }

      if (cmd === 'whoisplaying') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: 'Join the voice channel whose lineup you want to see, then run `/whoisplaying` again.',
            flags: 64
          });
        }

        // Find if this VC is linked to any club
        let linkedClubKey = null;
        for (const [clubKey, vcId] of Object.entries(state.clubVcLinks || {})) {
          if (vcId === voiceChannel.id) {
            linkedClubKey = clubKey;
            break;
          }
        }

        if (!linkedClubKey) {
          return interaction.reply({
            content: 'This voice channel is not linked to a SquadIQ club. Use `/vcspots` to link it first.',
            flags: 64
          });
        }

        const clubBoard = boardState[linkedClubKey];
        const club = getClubByKey(clubs, linkedClubKey);
        if (!clubBoard) {
          return interaction.reply({ content: 'Club board not found.', flags: 64 });
        }

        const lines = [];
        for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
          const slot = clubBoard.slots[i];
          if (slot.open) continue;
          if (slot.takenBy === '__NOT_IN_VC__') {
            lines.push(`**${slot.label}** – player not in VC`);
          } else if (slot.takenBy) {
            lines.push(`**${slot.label}** – <@${slot.takenBy}>`);
          } else {
            lines.push(`**${slot.label}** – taken`);
          }
        }

        const embed = new EmbedBuilder()
          .setTitle(`Who's Playing – ${club ? club.name : linkedClubKey} (${clubBoard.formation})`)
          .setColor(0x5865f2)
          .setDescription(lines.length ? lines.join('\n') : 'No one is currently slotted for this club.');

        return interaction.reply({ embeds: [embed] });
      }

      if (cmd === 'pospanel') {
        // Get formation from user's current VC if linked
        const formationData = getFormationForUserVc(interaction.member, state);
        
        let description = 'Click the button below to set your **position preferences**.\n\n' +
          `• Rank up to **${PREFS_LIMIT}** positions in order of preference.\n` +
          '• When you join a linked VC with auto-assign enabled, you\'ll be placed in your best available position!\n' +
          '• Preferences are saved per server.';

        if (formationData) {
          description = `🎯 **Showing positions for ${formationData.formationName}**\n\n` + description;
        }

        const panelEmbed = new EmbedBuilder()
          .setTitle('📋 Position Preference Panel')
          .setColor(0x57f287)
          .setDescription(description);

        const panelRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('open_prefs')
            .setLabel('Set My Preferences')
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({ embeds: [panelEmbed], components: [panelRow] });
      }

      if (cmd === 'myprefs') {
        const existing = await getUserPrefs(guildId, interaction.user.id);
        const formationData = getFormationForUserVc(interaction.member, state);
        
        return interaction.reply({
          embeds: [buildPrefsEmbed(existing, formationData?.formationName)],
          components: buildPrefComponents(existing, formationData?.positions),
          flags: 64
        });
      }

      if (cmd === 'autoassign') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: 'Only managers can toggle auto-assign.', flags: 64 });
        }

        const clubKey = state.currentClubKey;
        if (!state.autoAssign) state.autoAssign = {};
        state.autoAssign[clubKey] = !state.autoAssign[clubKey];
        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);

        const status = state.autoAssign[clubKey] ? 'enabled' : 'disabled';
        return interaction.reply({
          content: `✨ Auto-assign for **${getClubByKey(state.clubs, clubKey)?.name || clubKey}** is now **${status}**.`,
          flags: 64
        });
      }

      if (cmd === 'posboard') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({ content: 'You need to be in a voice channel to use `/posboard`.', flags: 64 });
        }

        const members = [...voiceChannel.members.values()].filter(m => !m.user.bot);
        if (members.length === 0) {
          return interaction.reply({ content: 'No players in your voice channel.', flags: 64 });
        }

        const posMap = {};
        POSITION_PREF_OPTIONS.forEach(p => posMap[p] = []);

        for (const m of members) {
          const prefs = await getUserPrefs(guildId, m.id);
          prefs.forEach((pos, index) => {
            if (posMap[pos]) {
              posMap[pos].push({ userId: m.id, rank: index + 1 });
            }
          });
        }

        const fields = POSITION_PREF_OPTIONS.map(pos => {
          const entries = posMap[pos].sort((a, b) => a.rank - b.rank);
          const meta = POSITION_META[pos];
          const value = entries.length === 0
            ? '*No data*'
            : entries.map(e => `${RANK_EMOJI[e.rank] || e.rank} <@${e.userId}>`).join('\n');
          return { name: `${meta?.emoji || ''} ${pos}`, value, inline: true };
        });

        const embed = new EmbedBuilder()
          .setTitle('🧩 Position Board – Voice Channel')
          .setColor(0x5865f2)
          .setDescription(`Voice: ${voiceChannel} • **${members.length}** player(s)`)
          .addFields(fields)
          .setFooter({ text: 'Players without saved preferences not shown.' });

        return interaction.reply({ embeds: [embed] });
      }

      if (cmd === 'posprefs') {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: 'Please run this in a server.', flags: 64 });
        }

        await interaction.deferReply();

        // Get all members with prefs
        let members = await guild.members.fetch();
        members = members.filter(m => !m.user.bot);

        const allParticipants = [];
        for (const m of members.values()) {
          const prefs = await getUserPrefs(guildId, m.id);
          if (prefs && prefs.length > 0) {
            allParticipants.push({ member: m, prefs });
          }
        }

        if (allParticipants.length === 0) {
          return interaction.editReply({ content: 'No players have saved position preferences yet.' });
        }

        // Get user's VC members
        const userVc = interaction.member?.voice?.channel;
        const vcParticipants = userVc
          ? allParticipants.filter(p => p.member.voice?.channel?.id === userVc.id)
          : [];

        // Get online members
        const onlineParticipants = allParticipants.filter(p => 
          p.member.presence?.status && p.member.presence.status !== 'offline'
        );

        // Default to VC if in one, otherwise show filter
        const filterSelect = buildPosPrefsFilterSelect(vcParticipants.length, onlineParticipants.length, allParticipants.length);
        
        let defaultParticipants, defaultLabel;
        if (vcParticipants.length > 0) {
          defaultParticipants = vcParticipants;
          defaultLabel = `Voice Channel (${userVc.name})`;
        } else if (onlineParticipants.length > 0) {
          defaultParticipants = onlineParticipants;
          defaultLabel = 'Online Now';
        } else {
          defaultParticipants = allParticipants;
          defaultLabel = 'Entire Server';
        }

        const embed = buildPosPrefsEmbedForParticipants(guild, defaultParticipants, defaultLabel);

        return interaction.editReply({
          embeds: [embed],
          components: [filterSelect]
        });
      }

      if (cmd === 'syncprefs') {
        const scope = interaction.options.getString('scope') || 'me';
        
        // Position mappings for role name -> position code
        const positionMappings = {
          'STRIKER': 'ST',
          'CENTRE FORWARD': 'CF',
          'CENTER FORWARD': 'CF',
          'RIGHT WING': 'RW',
          'LEFT WING': 'LW',
          'ATTACKING MID': 'CAM',
          'ATTACKING MIDFIELDER': 'CAM',
          'CENTRAL MID': 'CM',
          'CENTRAL MIDFIELDER': 'CM',
          'MIDFIELDER': 'CM',
          'DEFENSIVE MID': 'CDM',
          'DEFENSIVE MIDFIELDER': 'CDM',
          'RIGHT MID': 'RM',
          'RIGHT MIDFIELDER': 'RM',
          'LEFT MID': 'LM',
          'LEFT MIDFIELDER': 'LM',
          'RIGHT WING BACK': 'RWB',
          'LEFT WING BACK': 'LWB',
          'RIGHT BACK': 'RB',
          'LEFT BACK': 'LB',
          'CENTRE BACK': 'CB',
          'CENTER BACK': 'CB',
          'CENTRAL DEFENDER': 'CB',
          'DEFENDER': 'CB',
          'GOALKEEPER': 'GK',
          'GOALIE': 'GK',
          'KEEPER': 'GK',
          'FORWARD': 'ST',
          'WINGER': 'RW'
        };
        
        // Helper function to extract positions from a member's roles
        function extractPositionsFromRoles(memberRoles) {
          const matchedPositions = [];
          for (const [roleId, role] of memberRoles) {
            const roleName = role.name.toUpperCase().trim();
            
            // Check for exact position match
            if (POSITION_PREF_OPTIONS.includes(roleName)) {
              if (!matchedPositions.includes(roleName)) {
                matchedPositions.push(roleName);
              }
            } else if (positionMappings[roleName] && !matchedPositions.includes(positionMappings[roleName])) {
              matchedPositions.push(positionMappings[roleName]);
            }
          }
          return matchedPositions.slice(0, PREFS_LIMIT);
        }
        
        if (scope === 'all') {
          // Check for admin/manage server permission
          if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ 
              content: '❌ You need **Manage Server** permission to sync preferences for the entire server.', 
              flags: 64 
            });
          }
          
          await interaction.deferReply();
          
          // Fetch all guild members
          const guild = interaction.guild;
          let allMembers;
          try {
            allMembers = await guild.members.fetch();
          } catch (err) {
            console.error('Failed to fetch guild members:', err);
            return interaction.editReply({ content: '❌ Failed to fetch server members. Make sure the bot has the Server Members Intent enabled.' });
          }
          
          let syncedCount = 0;
          let skippedCount = 0;
          const syncedUsers = [];
          
          for (const [memberId, member] of allMembers) {
            // Skip bots
            if (member.user.bot) continue;
            
            const positions = extractPositionsFromRoles(member.roles.cache);
            
            if (positions.length > 0) {
              await setUserPrefs(guildId, memberId, positions);
              syncedCount++;
              syncedUsers.push({ id: memberId, username: member.user.username, positions });
            } else {
              skippedCount++;
            }
          }
          
          // Build summary of synced users (limit to first 15 for display)
          const displayUsers = syncedUsers.slice(0, 15);
          const userSummary = displayUsers.map(u => 
            `<@${u.id}>: ${u.positions.map(p => `\`${p}\``).join(', ')}`
          ).join('\n');
          
          const embed = new EmbedBuilder()
            .setTitle('🔄 Server-Wide Position Sync Complete')
            .setColor(0x57f287)
            .setDescription(
              `**${syncedCount}** member(s) synced with position roles.\n` +
              `**${skippedCount}** member(s) had no position roles (skipped).\n\n` +
              (userSummary ? `**Synced Users:**\n${userSummary}` : '') +
              (syncedUsers.length > 15 ? `\n_...and ${syncedUsers.length - 15} more_` : '')
            );
          
          return interaction.editReply({ embeds: [embed] });
          
        } else {
          // Original single-user sync
          await interaction.deferReply({ flags: 64 });
          
          const member = interaction.member;
          if (!member) {
            return interaction.editReply({ content: '❌ Could not fetch your member data.' });
          }

          const matchedPositions = extractPositionsFromRoles(member.roles.cache);

          if (matchedPositions.length === 0) {
            return interaction.editReply({
              content: '❌ **No position roles found on your account.**\n\n' +
                'To use this feature, you need Discord roles matching position names like:\n' +
                '`ST`, `CF`, `RW`, `LW`, `CAM`, `CM`, `CDM`, `RM`, `LM`, `RWB`, `LWB`, `RB`, `LB`, `CB`, `GK`\n\n' +
                'Or full names like `Striker`, `Goalkeeper`, `Centre Back`, etc.\n\n' +
                'Ask a server admin to assign you the appropriate position roles!'
            });
          }

          // Save preferences
          await setUserPrefs(guildId, interaction.user.id, matchedPositions);
          
          const summary = matchedPositions.map((p, i) => `${RANK_EMOJI[i + 1] || (i + 1)} **${p}** ${POSITION_META[p]?.emoji || ''}`).join('\n');
          
          const embed = new EmbedBuilder()
            .setTitle('🔄 Position Preferences Synced from Roles')
            .setColor(0x57f287)
            .setDescription(
              `Found **${matchedPositions.length}** position role(s) on your account!\n\n` +
              `**Your preferences are now:**\n${summary}\n\n` +
              `_Use \`/myprefs\` to reorder or adjust these._`
            );

          return interaction.editReply({ embeds: [embed] });
        }
      }

      // =======================
      // DRAFT COMMANDS
      // =======================

      if (cmd === 'draft') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: '❌ You must be in a voice channel with players to start a draft.',
            flags: 64
          });
        }

        // Check for existing active draft
        if (activeDrafts.has(guildId)) {
          return interaction.reply({
            content: '❌ A draft is already in progress. Use `/draftresult` to finish it first.',
            flags: 64
          });
        }

        await interaction.deferReply();

        const members = [...voiceChannel.members.values()].filter((m) => !m.user.bot);
        const playerIds = members.map(m => m.id);

        if (playerIds.length < 4) {
          return interaction.editReply({
            content: `❌ Need at least 4 players to start a draft. Currently have ${playerIds.length} in voice.`
          });
        }

        const { error, data } = await callEdgeFunction('draft-start', {
          guild_id: guildId,
          voice_channel_id: voiceChannel.id,
          player_discord_ids: playerIds
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to start draft: ${error}` });
        }

        activeDrafts.set(guildId, data);

        const embed = buildDraftEmbed(data, interaction.guild);
        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'draftpick') {
        const draftData = activeDrafts.get(guildId);
        if (!draftData) {
          return interaction.reply({
            content: '❌ No active draft. Start one with `/draft` in a voice channel.',
            flags: 64
          });
        }

        const currentCaptain = draftData.current_picker === 'a' 
          ? draftData.captain_a.discord_user_id 
          : draftData.captain_b.discord_user_id;

        if (interaction.user.id !== currentCaptain) {
          return interaction.reply({
            content: `❌ It's not your turn! <@${currentCaptain}>'s turn to pick.`,
            flags: 64
          });
        }

        const pickedPlayer = interaction.options.getUser('player');
        if (!pickedPlayer) {
          return interaction.reply({ content: '❌ You must specify a player to pick.', flags: 64 });
        }

        await interaction.deferReply();

        const { error, data } = await callEdgeFunction('draft-pick', {
          draft_id: draftData.draft_id,
          captain_discord_id: interaction.user.id,
          picked_player_discord_id: pickedPlayer.id
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to pick: ${error}` });
        }

        // Update local cache
        activeDrafts.set(guildId, {
          ...draftData,
          team_a_player_ids: data.team_a,
          team_b_player_ids: data.team_b,
          available_players: data.available_players,
          current_picker: data.current_picker,
          pick_number: data.pick_number
        });

        if (data.draft_complete) {
          const completeEmbed = new EmbedBuilder()
            .setTitle('✅ Draft Complete!')
            .setColor(0x00ff00)
            .addFields(
              { name: '🔴 Team A', value: data.team_a.map(id => `<@${id}>`).join('\n'), inline: true },
              { name: '🔵 Team B', value: data.team_b.map(id => `<@${id}>`).join('\n'), inline: true }
            )
            .setDescription('Use `/draftresult <team_a_score> <team_b_score>` to report the match result!');
          
          return interaction.editReply({ embeds: [completeEmbed] });
        }

        const embed = buildDraftEmbed(activeDrafts.get(guildId), interaction.guild);
        embed.setDescription(`✅ **${pickedPlayer.username}** picked by <@${interaction.user.id}>!\n\n` + embed.data.description);
        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'draftresult') {
        const draftData = activeDrafts.get(guildId);
        if (!draftData) {
          return interaction.reply({
            content: '❌ No active draft to report results for.',
            flags: 64
          });
        }

        const teamAScore = interaction.options.getInteger('team_a_score');
        const teamBScore = interaction.options.getInteger('team_b_score');

        await interaction.deferReply();

        const { error, data } = await callEdgeFunction('draft-result', {
          draft_id: draftData.draft_id,
          reporter_discord_id: interaction.user.id,
          team_a_score: teamAScore,
          team_b_score: teamBScore
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to report result: ${error}` });
        }

        const embed = buildDraftResultEmbed({
          team_a_score: teamAScore,
          team_b_score: teamBScore,
          winning_team: teamAScore > teamBScore ? 'a' : teamBScore > teamAScore ? 'b' : 'draw',
          status: data.status,
          confirmations: data.confirmations,
          required: data.required_confirmations
        });

        if (data.status === 'confirmed') {
          activeDrafts.delete(guildId);
          embed.setFooter({ text: '🎉 Result confirmed! Stats recorded. DMs sent for peer evaluations.' });
        } else {
          embed.setFooter({ text: `${data.confirmations}/${data.required_confirmations} confirmations. Others: use /draftresult with same score to confirm.` });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'draftcancel') {
        const draftData = activeDrafts.get(guildId);
        if (!draftData) {
          return interaction.reply({
            content: '❌ No active draft to cancel.',
            flags: 64
          });
        }

        // Only captains or managers can cancel
        const isCaptain = interaction.user.id === draftData.captain_a?.discord_user_id || 
                          interaction.user.id === draftData.captain_b?.discord_user_id;
        
        if (!isCaptain && !isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only captains or managers can cancel a draft.',
            flags: 64
          });
        }

        activeDrafts.delete(guildId);
        return interaction.reply({
          content: '🗑️ Draft cancelled. Start a new one with `/draft`.',
        });
      }

      // =======================
      // PLAYER PROFILE & STATS COMMANDS
      // =======================

      if (cmd === 'profile') {
        const targetUser = interaction.options.getUser('player') || interaction.user;
        
        await interaction.deferReply();

        const { error, data } = await callEdgeFunction('get-player-profile', {
          guild_id: guildId,
          discord_user_id: targetUser.id
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to fetch profile: ${error}` });
        }

        const embed = buildProfileEmbed(data, targetUser.username);
        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'leaderboard') {
        const type = interaction.options.getString('type') || 'overall';
        const position = interaction.options.getString('position');
        
        await interaction.deferReply();

        const { error, data } = await callEdgeFunction('get-leaderboard', {
          guild_id: guildId,
          type,
          position,
          limit: 10
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to fetch leaderboard: ${error}` });
        }

        const embed = buildLeaderboardEmbed(data.players || [], type, interaction.guild.name);
        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'mystats') {
        await interaction.deferReply({ flags: 64 });

        const { error, data } = await callEdgeFunction('get-player-profile', {
          guild_id: guildId,
          discord_user_id: interaction.user.id
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to fetch stats: ${error}` });
        }

        const streakEmoji = data.streak_type === 'win' ? '🔥' : data.streak_type === 'loss' ? '❄️' : '➖';
        const formText = data.last_5_results?.map(r => r === 'W' ? '🟢' : r === 'L' ? '🔴' : '⚪').join('') || 'No games yet';

        const embed = new EmbedBuilder()
          .setTitle(`📊 Your Stats`)
          .setColor(0x5865f2)
          .addFields(
            { name: '⭐ Rating', value: `**${data.overall_rating || 50}**`, inline: true },
            { name: '🎮 Games', value: `${data.games_played || 0}`, inline: true },
            { name: '🏆 Wins', value: `${data.wins || 0} (${data.win_rate || 0}%)`, inline: true },
            { name: '⚽ Goals', value: `${data.goals || 0}`, inline: true },
            { name: '🎯 Assists', value: `${data.assists || 0}`, inline: true },
            { name: `${streakEmoji} Streak`, value: `${data.current_streak || 0}`, inline: true },
            { name: '📈 Recent Form', value: formText, inline: false }
          );

        return interaction.editReply({ embeds: [embed] });
      }

      // =======================
      // AVAILABILITY & EVENT COMMANDS
      // =======================

      if (cmd === 'event') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only managers can create events.',
            flags: 64
          });
        }

        const title = interaction.options.getString('title');
        const dateStr = interaction.options.getString('date');
        const eventType = interaction.options.getString('type') || 'practice';
        const description = interaction.options.getString('description');

        // Parse date
        const scheduledAt = new Date(dateStr);
        if (isNaN(scheduledAt.getTime())) {
          return interaction.reply({
            content: '❌ Invalid date format. Use: YYYY-MM-DD HH:MM (e.g., 2024-01-15 20:00)',
            flags: 64
          });
        }

        await interaction.deferReply();

        const { error, data } = await callEdgeFunction('event-create', {
          guild_id: guildId,
          created_by_discord_id: interaction.user.id,
          title,
          scheduled_at: scheduledAt.toISOString(),
          event_type: eventType,
          description,
          channel_id: interaction.channelId
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to create event: ${error}` });
        }

        const eventEmbed = new EmbedBuilder()
          .setTitle(`📅 ${title}`)
          .setColor(0x5865f2)
          .addFields(
            { name: '📆 Date', value: scheduledAt.toLocaleString(), inline: true },
            { name: '🏷️ Type', value: eventType, inline: true },
            { name: '✅ Available', value: '0', inline: true },
            { name: '❌ Unavailable', value: '0', inline: true },
            { name: '❓ Maybe', value: '0', inline: true }
          )
          .setDescription(description || 'React below to mark your availability!')
          .setFooter({ text: `Event ID: ${data.event_id}` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`avail_yes_${data.event_id}`).setLabel('✅ Available').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`avail_no_${data.event_id}`).setLabel('❌ Unavailable').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`avail_maybe_${data.event_id}`).setLabel('❓ Maybe').setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({ embeds: [eventEmbed], components: [row] });
      }

      if (cmd === 'available') {
        const response = interaction.options.getString('response');
        
        // This would need context of which event - simplified version
        return interaction.reply({
          content: `Use the buttons on an event post to mark availability, or react to event messages!`,
          flags: 64
        });
      }

      if (cmd === 'attendance') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only managers can mark attendance.',
            flags: 64
          });
        }

        const player = interaction.options.getUser('player');
        const showed = interaction.options.getBoolean('showed');

        await interaction.deferReply({ flags: 64 });

        const { error } = await callEdgeFunction('mark-attendance', {
          guild_id: guildId,
          discord_user_id: player.id,
          actually_showed: showed,
          recorded_by_discord_id: interaction.user.id
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to mark attendance: ${error}` });
        }

        return interaction.editReply({
          content: `${showed ? '✅' : '❌'} Marked <@${player.id}> as ${showed ? 'showed up' : 'no-show'}.`
        });
      }

      // =======================
      // COMPETITION WIN COMMANDS
      // =======================

      if (cmd === 'claimwin') {
        const competition = interaction.options.getString('competition');
        const compType = interaction.options.getString('type');
        const tier = interaction.options.getString('tier');
        const proofUrl = interaction.options.getString('proof');

        await interaction.deferReply({ flags: 64 });

        const { error, data } = await callEdgeFunction('claim-competition-win', {
          guild_id: guildId,
          claimed_by_discord_id: interaction.user.id,
          competition_name: competition,
          competition_type: compType,
          tier,
          proof_url: proofUrl
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to submit claim: ${error}` });
        }

        return interaction.editReply({
          content: `✅ **Win claim submitted!**\n\n` +
            `🏆 **${competition}** (${tier} ${compType})\n` +
            `📋 Claim ID: \`${data.claim_id}\`\n\n` +
            `An admin will verify your claim soon.`
        });
      }

      if (cmd === 'verifywin') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only admins can verify win claims.',
            flags: 64
          });
        }

        const claimId = interaction.options.getString('claim_id');
        const action = interaction.options.getString('action');
        const reason = interaction.options.getString('reason');

        if (action === 'reject' && !reason) {
          return interaction.reply({
            content: '❌ A reason is required when rejecting a claim.',
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });

        const { error } = await callEdgeFunction('claim-competition-win', {
          claim_id: claimId,
          action,
          verified_by_discord_id: interaction.user.id,
          rejection_reason: reason
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to verify: ${error}` });
        }

        return interaction.editReply({
          content: `${action === 'approve' ? '✅ Claim approved!' : '❌ Claim rejected.'}`
        });
      }

      if (cmd === 'pendingwins') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only admins can view pending claims.',
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });

        const { data: claims, error } = await supabase
          .from('pending_win_claims')
          .select('*')
          .eq('guild_id', guildId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          return interaction.editReply({ content: `❌ Failed to fetch claims: ${error.message}` });
        }

        if (!claims || claims.length === 0) {
          return interaction.editReply({ content: '✅ No pending win claims!' });
        }

        const lines = claims.map(c => 
          `• \`${c.id.slice(0, 8)}\` <@${c.claimed_by_discord_id}> – **${c.competition_name}** (${c.tier} ${c.competition_type})`
        );

        const embed = new EmbedBuilder()
          .setTitle('📋 Pending Win Claims')
          .setColor(0xffcc00)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Use /verifywin <claim_id> <approve/reject> to review' });

        return interaction.editReply({ embeds: [embed] });
      }

      // =======================
      // EA FC PRO CLUBS COMMANDS
      // =======================

      if (cmd === 'setclub') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only managers can configure EA club integration.',
            flags: 64
          });
        }

        const clubName = interaction.options.getString('name');
        const platform = interaction.options.getString('platform');
        const statsChannel = interaction.options.getChannel('stats_channel');

        await interaction.deferReply({ flags: 64 });

        try {
          // Search for the club on EA
          const clubs = await searchClub({ name: clubName, platform });
          
          if (!clubs || clubs.length === 0) {
            return interaction.editReply({
              content: `❌ Could not find a club named **${clubName}** on ${EA_PLATFORM_NAMES[platform] || platform}.\n\nMake sure the name is exactly as it appears in EA FC Pro Clubs.`
            });
          }

          // Use the first (best) match
          const eaClub = clubs[0];
          const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);
          
          if (!currentClub) {
            return interaction.editReply({ content: '❌ No current club selected. Use the spot panel first.' });
          }

          // Update the club with EA data
          currentClub.ea_club_id = eaClub.clubId?.toString();
          currentClub.ea_platform = platform;
          currentClub.stats_channel_id = statsChannel?.id || null;
          currentClub.monitoring_enabled = true;
          currentClub.last_match_id = null;

          await saveGuildSettings(guildId, state);

          // Start monitoring
          startEaMonitoring(guildId, currentClub.key);

          // Auto-sync historical matches in background
          syncClubHistory(guildId, currentClub.key).then(result => {
            console.log(`[EA] Initial sync for ${currentClub.name}: ${result.synced} matches added`);
          }).catch(err => {
            console.error(`[EA] Initial sync error:`, err);
          });

          const embed = new EmbedBuilder()
            .setTitle('✅ EA FC Club Linked!')
            .setColor(0x00ff00)
            .addFields(
              { name: '🎮 Club Name', value: eaClub.name || clubName, inline: true },
              { name: '🖥️ Platform', value: EA_PLATFORM_NAMES[platform] || platform, inline: true },
              { name: '📊 Stats Channel', value: statsChannel ? `<#${statsChannel.id}>` : 'Not set', inline: true }
            )
            .setDescription(`Now monitoring **${currentClub.name}** for division matches!\n\n📩 Match results will be auto-posted and stats recorded.\n🔄 **Syncing match history in background...**\n\n**Important:** Players need to use \`/linkea\` to connect their EA username for stats tracking.`);

          return interaction.editReply({ embeds: [embed] });

        } catch (err) {
          console.error('[EA] Error in /setclub:', err);
          return interaction.editReply({ content: `❌ Failed to search EA: ${err.message}` });
        }
      }

      if (cmd === 'clubstats') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only managers can manage EA stats monitoring.',
            flags: 64
          });
        }

        const action = interaction.options.getString('action');
        const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);

        if (!currentClub) {
          return interaction.reply({ content: '❌ No current club selected.', flags: 64 });
        }

        if (action === 'status') {
          const embed = new EmbedBuilder()
            .setTitle(`📊 EA Stats Status: ${currentClub.name}`)
            .setColor(currentClub.monitoring_enabled ? 0x00ff00 : 0xffcc00)
            .addFields(
              { name: 'EA Club ID', value: currentClub.ea_club_id || 'Not linked', inline: true },
              { name: 'Platform', value: EA_PLATFORM_NAMES[currentClub.ea_platform] || 'Not set', inline: true },
              { name: 'Monitoring', value: currentClub.monitoring_enabled ? '✅ Active' : '❌ Disabled', inline: true },
              { name: 'Stats Channel', value: currentClub.stats_channel_id ? `<#${currentClub.stats_channel_id}>` : 'Not set', inline: true },
              { name: 'Last Match ID', value: currentClub.last_match_id || 'None recorded', inline: true }
            );

          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (!currentClub.ea_club_id) {
          return interaction.reply({
            content: '❌ This club is not linked to EA yet. Use `/setclub` first.',
            flags: 64
          });
        }

        if (action === 'enable') {
          currentClub.monitoring_enabled = true;
          await saveGuildSettings(guildId, state);
          startEaMonitoring(guildId, currentClub.key);
          return interaction.reply({ content: `✅ EA stats monitoring **enabled** for ${currentClub.name}.`, flags: 64 });
        }

        if (action === 'disable') {
          currentClub.monitoring_enabled = false;
          await saveGuildSettings(guildId, state);
          stopEaMonitoring(guildId, currentClub.key);
          return interaction.reply({ content: `⏸️ EA stats monitoring **disabled** for ${currentClub.name}.`, flags: 64 });
        }
      }

      if (cmd === 'syncclub') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only managers can manually sync club data.',
            flags: 64
          });
        }

        const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);

        if (!currentClub?.ea_club_id) {
          return interaction.reply({
            content: '❌ This club is not linked to EA. Use `/setclub` first.',
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          // Sync full match history (not just new matches)
          const result = await syncClubHistory(guildId, currentClub.key);
          
          if (result.error) {
            return interaction.editReply({ content: `❌ Sync failed: ${result.error}` });
          }
          
          const embed = new EmbedBuilder()
            .setTitle(`✅ Club History Synced`)
            .setColor(0x00ff00)
            .setDescription(`Pulled match history for **${currentClub.name}**`)
            .addFields(
              { name: '📥 New Matches Added', value: `${result.synced}`, inline: true },
              { name: '⏭️ Already Recorded', value: `${result.skipped}`, inline: true }
            )
            .setFooter({ text: 'Player stats recorded for linked EA accounts' });
          
          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply({ content: `❌ Sync failed: ${err.message}` });
        }
      }

      if (cmd === 'linkea') {
        const eaUsername = interaction.options.getString('username');

        await interaction.deferReply({ flags: 64 });

        // Update the user's profile with their EA username
        const { error } = await supabase
          .from('profiles')
          .upsert({
            discord_user_id: interaction.user.id,
            ea_username: eaUsername,
            discord_username: interaction.user.username,
            updated_at: new Date().toISOString()
          }, { onConflict: 'discord_user_id' });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to save EA username: ${error.message}` });
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ EA Account Linked!')
          .setColor(0x00ff00)
          .setDescription(`Your EA username **${eaUsername}** is now linked to your Discord account.\n\nWhen your club plays division matches, your stats will be automatically recorded!`)
          .addFields(
            { name: '📊 What happens now?', value: 'Your goals, assists, ratings, and other stats from Pro Clubs matches will be tracked and contribute to your SquadIQ rating.', inline: false }
          );

        return interaction.editReply({ embeds: [embed] });
      }

      // =======================
      // ADMIN CONTROL PANEL COMMANDS
      // =======================

      if (cmd === 'squadiq') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only admins and managers can launch the SquadIQ control panel.',
            flags: 64
          });
        }

        await interaction.deferReply();

        const embeds = await buildAdminControlPanelEmbeds(guildId, state);
        const buttons = buildAdminControlPanelButtons();

        const msg = await interaction.editReply({
          embeds,
          components: buttons
        });

        // Store the panel location
        state.squadiqPanelChannelId = interaction.channelId;
        state.squadiqPanelMessageId = msg.id;
        await saveGuildSettings(guildId, state);

        return;
      }

      if (cmd === 'refreshpanel') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only admins can refresh panels.',
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });

        // Refresh all panels
        await refreshClubPanels(guildId, state.currentClubKey);

        // Also try to refresh the squadiq panel if it exists
        if (state.squadiqPanelChannelId && state.squadiqPanelMessageId) {
          try {
            const channel = await client.channels.fetch(state.squadiqPanelChannelId);
            if (channel) {
              const msg = await channel.messages.fetch(state.squadiqPanelMessageId);
              const embeds = await buildAdminControlPanelEmbeds(guildId, state);
              const buttons = buildAdminControlPanelButtons();
              await msg.edit({ embeds, components: buttons });
            }
          } catch (err) {
            console.error('[RefreshPanel] Error refreshing squadiq panel:', err);
          }
        }

        return interaction.editReply({ content: '✅ All panels refreshed!' });
      }
    }

    // ----- Buttons -----
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'open_prefs') {
        const existing = await getUserPrefs(guildId, interaction.user.id);
        const formationData = getFormationForUserVc(interaction.member, state);
        
        return interaction.reply({
          embeds: [buildPrefsEmbed(existing, formationData?.formationName)],
          components: buildPrefComponents(existing, formationData?.positions),
          flags: 64
        });
      }

      if (id === 'open_help') {
        return interaction.reply({ embeds: [buildHelpEmbed()], flags: 64 });
      }

      // =======================
      // SQUADIQ CONTROL PANEL BUTTONS
      // =======================

      if (id === 'squadiq_refresh') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }
        await interaction.deferUpdate();
        const embeds = await buildAdminControlPanelEmbeds(guildId, state);
        const buttons = buildAdminControlPanelButtons();
        return interaction.editReply({ embeds, components: buttons });
      }

      if (id === 'squadiq_spotpanel') {
        return interaction.reply({
          embeds: [buildEmbedForClub(guildId, state.currentClubKey, state)],
          components: buildAdminComponents(guildId, state.currentClubKey, state),
          flags: 64
        });
      }

      if (id === 'squadiq_draft') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: '❌ Join a voice channel with players to start a draft.',
            flags: 64
          });
        }

        if (activeDrafts.has(guildId)) {
          return interaction.reply({
            content: '❌ A draft is already in progress. Use `/draftresult` to finish it first.',
            flags: 64
          });
        }

        return interaction.reply({
          content: '⚔️ To start a draft, use `/draft` in a voice channel with your players.\n\nThis will randomly assign captains and begin the pick-em process!',
          flags: 64
        });
      }

      if (id === 'squadiq_leaderboard') {
        await interaction.deferReply({ flags: 64 });

        const { data: players } = await supabase
          .from('player_summary')
          .select('*')
          .eq('guild_id', guildId)
          .order('overall_rating', { ascending: false })
          .limit(10);

        if (!players || players.length === 0) {
          return interaction.editReply({ content: 'No players with ratings found yet.' });
        }

        const embed = buildLeaderboardEmbed(players, 'overall', interaction.guild.name);
        return interaction.editReply({ embeds: [embed] });
      }

      if (id === 'squadiq_syncprefs') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }
        return interaction.reply({
          content: '🔄 **Sync Position Preferences**\n\n' +
            'Use `/syncprefs all` to sync position preferences from Discord roles for all server members.\n\n' +
            'This will match roles like `ST`, `GK`, `Striker`, `Goalkeeper`, etc. to position preferences.',
          flags: 64
        });
      }

      if (id === 'squadiq_eaconfig') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);
        
        const embed = new EmbedBuilder()
          .setTitle('🎮 EA FC Pro Clubs Configuration')
          .setColor(currentClub?.ea_club_id ? 0x00ff00 : 0xffcc00)
          .addFields(
            { name: '🏟️ Current Club', value: currentClub?.name || 'None', inline: true },
            { name: '🔗 EA Club ID', value: currentClub?.ea_club_id || 'Not linked', inline: true },
            { name: '🖥️ Platform', value: currentClub?.ea_platform || 'Not set', inline: true },
            { name: '📡 Monitoring', value: currentClub?.monitoring_enabled ? '✅ Active' : '❌ Off', inline: true },
            { name: '📊 Stats Channel', value: currentClub?.stats_channel_id ? `<#${currentClub.stats_channel_id}>` : 'Not set', inline: true }
          )
          .setDescription(
            '**Commands:**\n' +
            '`/setclub <name> <platform>` - Link EA club\n' +
            '`/clubstats enable/disable` - Toggle monitoring\n' +
            '`/syncclub` - Manual match sync\n' +
            '`/linkea <username>` - Link player EA accounts'
          );

        return interaction.reply({ embeds: [embed], flags: 64 });
      }

      if (id === 'squadiq_syncclub') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);
        
        if (!currentClub?.ea_club_id) {
          return interaction.reply({
            content: '❌ No EA club linked. Use `/setclub` first.',
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });

        const result = await syncClubHistory(guildId, currentClub.key);
        
        if (result.error) {
          return interaction.editReply({ content: `❌ Sync failed: ${result.error}` });
        }

        return interaction.editReply({
          content: `✅ Synced **${result.synced}** new matches (${result.skipped} already recorded) for **${currentClub.name}**`
        });
      }

      if (id === 'squadiq_pendingwins') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        const { data: claims } = await supabase
          .from('pending_win_claims')
          .select('*')
          .eq('guild_id', guildId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!claims || claims.length === 0) {
          return interaction.editReply({ content: '✅ No pending win claims!' });
        }

        const lines = claims.map(c => 
          `• \`${c.id.slice(0, 8)}\` <@${c.claimed_by_discord_id}> – **${c.competition_name}** (${c.tier} ${c.competition_type})`
        );

        const embed = new EmbedBuilder()
          .setTitle('📋 Pending Win Claims')
          .setColor(0xffcc00)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Use /verifywin <claim_id> <approve/reject> to review' });

        return interaction.editReply({ embeds: [embed] });
      }

      if (id === 'squadiq_debug') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });
        const embed = await buildDebugEmbed(guildId, state);
        return interaction.editReply({ embeds: [embed] });
      }

      if (id === 'squadiq_logs') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });
        const embed = await buildRecentActivityEmbed(guildId);
        return interaction.editReply({ embeds: [embed] });
      }

      if (id === 'squadiq_help') {
        return interaction.reply({ embeds: [buildHelpEmbed()], flags: 64 });
      }

      // Availability response buttons
      if (id.startsWith('avail_')) {
        const parts = id.split('_');
        const response = parts[1]; // yes, no, maybe
        const eventId = parts.slice(2).join('_');

        await interaction.deferReply({ flags: 64 });

        const { error } = await callEdgeFunction('availability-response', {
          event_id: eventId,
          discord_user_id: interaction.user.id,
          response
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to record availability: ${error}` });
        }

        const responseEmojis = { yes: '✅', no: '❌', maybe: '❓' };
        return interaction.editReply({
          content: `${responseEmojis[response]} Availability marked as **${response}**!`
        });
      }

      if (id.startsWith('prefpos_')) {
        const pos = id.replace('prefpos_', '');
        // Allow any valid position (from full list or formation-specific)
        if (!POSITION_META[pos]) return;

        const current = await getUserPrefs(guildId, interaction.user.id);
        let newPrefs = [...current];
        const idx = newPrefs.indexOf(pos);

        if (idx !== -1) {
          newPrefs.splice(idx, 1);
        } else if (newPrefs.length < PREFS_LIMIT) {
          newPrefs.push(pos);
        } else {
          return interaction.reply({
            content: `You've selected **${PREFS_LIMIT}** positions. Remove one first.`,
            flags: 64
          });
        }

        await setUserPrefs(guildId, interaction.user.id, newPrefs);

        const formationData = getFormationForUserVc(interaction.member, state);
        return interaction.update({
          embeds: [buildPrefsEmbed(newPrefs, formationData?.formationName)],
          components: buildPrefComponents(newPrefs, formationData?.positions)
        });
      }

      if (id === 'prefs_done') {
        const prefs = await getUserPrefs(guildId, interaction.user.id);
        const summary = prefs.length > 0
          ? prefs.map((p, i) => `${RANK_EMOJI[i + 1] || (i + 1)} **${p}**`).join('\n')
          : 'No positions selected.';

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ Preferences Saved')
              .setColor(0x57f287)
              .setDescription(summary + '\n\nYou can update anytime via `/myprefs` or the panel.')
          ],
          components: []
        });
      }

      if (id === 'prefs_clear') {
        await setUserPrefs(guildId, interaction.user.id, []);
        return interaction.update({
          embeds: [buildPrefsEmbed([])],
          components: buildPrefComponents([])
        });
      }

      // Queue button - join waitlist
      if (id.startsWith('queue_')) {
        const parts = id.split('_');
        const clubKey = parts[1];
        const slotIndex = parseInt(parts[2], 10);

        if (Number.isNaN(slotIndex)) {
          return interaction.reply({ content: 'Queue error.', flags: 64 });
        }

        const queue = ensureQueueState(guildId, clubKey, slotIndex);
        if (!queue.includes(interaction.user.id)) {
          queue.push(interaction.user.id);
        }

        return interaction.update({
          content: "✅ You're now on the waitlist for this spot. I'll DM you when it opens up.",
          components: []
        });
      }

      // Quick move button - start drag mode
      if (id.startsWith('start_move_')) {
        const parts = id.split('_');
        const clubKey = parts[2];
        const index = parseInt(parts[3], 10);

        const clubBoard = boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[index]) {
          return interaction.reply({ content: 'This spot no longer exists.', flags: 64 });
        }

        const slot = clubBoard.slots[index];
        if (slot.open) {
          return interaction.reply({ content: 'This spot is now open - click it to claim!', flags: 64 });
        }

        // Start drag
        setDrag(guildId, interaction.user.id, { clubKey, fromIndex: index });

        const playerLabel = slot.takenBy === '__NOT_IN_VC__' ? 'the placeholder player' : `<@${slot.takenBy}>`;
        
        return interaction.update({
          content: `📍 **Moving ${playerLabel} from ${slot.label}**\n\nClick another position to place them there, or click **${slot.label}** again to cancel.`,
          components: []
        });
      }

      // Quick remove button
      if (id.startsWith('quick_remove_')) {
        const parts = id.split('_');
        const clubKey = parts[2];
        const index = parseInt(parts[3], 10);

        const clubBoard = boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[index]) {
          return interaction.reply({ content: 'This spot no longer exists.', flags: 64 });
        }

        const slot = clubBoard.slots[index];
        if (slot.open) {
          return interaction.reply({ content: 'This spot is already open.', flags: 64 });
        }

        const removedPlayer = slot.takenBy;
        slot.open = true;
        slot.takenBy = null;
        handleSlotOpened(guildId, clubKey, index).catch(() => {});

        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);

        const playerLabel = removedPlayer === '__NOT_IN_VC__' ? 'Placeholder' : `<@${removedPlayer}>`;
        return interaction.update({
          content: `✅ Removed ${playerLabel} from **${slot.label}**. The spot is now open!`,
          components: []
        });
      }

      // Rename club button
      if (id.startsWith('rename_club_')) {
        const clubKey = id.substring('rename_club_'.length);
        const currentClub = getClubByKey(clubs, clubKey);
        if (!currentClub) {
          return interaction.reply({ content: 'Current club not found.', flags: 64 });
        }

        const modal = new ModalBuilder()
          .setCustomId(`rename_club_modal_${clubKey}`)
          .setTitle('Rename Club')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('club_name')
                .setLabel('New club name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(currentClub.name)
            )
          );

        await interaction.showModal(modal);
        return;
      }

      // Add club button
      if (id === 'add_club') {
        const disabledClub = clubs.find((c) => !c.enabled);
        if (!disabledClub) {
          return interaction.reply({ content: 'All available club slots are already in use (max 5).', flags: 64 });
        }

        disabledClub.enabled = true;
        boardState[disabledClub.key] = createEmptyBoardForFormation(DEFAULT_FORMATION);
        if (!state.clubVcLinks) state.clubVcLinks = {};
        state.clubVcLinks[disabledClub.key] = null;
        state.currentClubKey = disabledClub.key;
        await saveGuildSettings(guildId, state);

        return interaction.reply({
          content: `Added a new club slot: **${disabledClub.name}**.`,
          flags: 64
        });
      }

      // Player tools button
      if (id.startsWith('player_tools_')) {
        const clubKey = id.substring('player_tools_'.length);

        const select = new StringSelectMenuBuilder()
          .setCustomId(`player_tools_select_${clubKey}`)
          .setPlaceholder('Choose a player tool')
          .addOptions(
            { label: 'Assign from your voice channel (manual)', value: 'assign', description: 'Manually pick players from VC' },
            { label: 'Smart assign from VC (using prefs)', value: 'smart_assign', description: 'Auto-assign based on preferences' },
            { label: 'Remove/move existing players', value: 'manage', description: 'Manage slotted players' },
            { label: 'Send ready-check DM to your VC', value: 'ready_check', description: 'DM all VC members' },
            { label: 'Set my position preferences', value: 'set_prefs', description: 'Edit your own preferences' }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: '🎮 **Player Tools** – What do you want to do?',
          components: [row],
          flags: 64
        });
      }

      // Club tools button
      if (id.startsWith('club_tools_')) {
        const clubKey = id.substring('club_tools_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only captains, managers, owners, media, or admins can use club tools.',
            flags: 64
          });
        }

        const autoEnabled = state.autoAssign?.[clubKey];

        const select = new StringSelectMenuBuilder()
          .setCustomId(`club_tools_select_${clubKey}`)
          .setPlaceholder('Choose a club tool')
          .addOptions(
            { label: 'Rename club', value: 'rename', description: 'Change the club name' },
            { label: 'Add club', value: 'add', description: 'Enable another club slot' },
            { label: 'Remove club', value: 'remove', description: 'Disable this club' },
            { label: 'Set voice channel for this club', value: 'set_vc', description: 'Link a VC' },
            { label: autoEnabled ? 'Disable auto-assign' : 'Enable auto-assign', value: 'toggle_auto', description: autoEnabled ? 'Turn off auto-assignment' : 'Auto-assign when joining VC' },
            { label: 'Reset all spots (this club)', value: 'reset', description: 'Free all positions' },
            { label: 'Refresh panel', value: 'refresh', description: 'Update the panel display' }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: '🛠️ **Club Tools** – Choose an action:',
          components: [row],
          flags: 64
        });
      }

      // Formation menu button
      if (id.startsWith('formation_menu_')) {
        const clubKey = id.substring('formation_menu_'.length);
        const clubBoard = boardState[clubKey] || createEmptyBoardForFormation(DEFAULT_FORMATION);
        const currentFormation = clubBoard.formation || DEFAULT_FORMATION;

        const allNames = Object.keys(FORMATION_POSITIONS);

        const threeBack = allNames.filter((name) => name.startsWith('3-'));
        const fourBack = allNames.filter((name) => name.startsWith('4-'));
        const fiveBack = allNames.filter((name) => name.startsWith('5-'));
        const twoStrikers = allNames.filter((name) => {
          const positions = FORMATION_POSITIONS[name] || [];
          return positions.filter((p) => p === 'ST').length === 2;
        });

        const groups = [
          { id: '3back', label: '3-back formations', list: threeBack },
          { id: '4back', label: '4-back formations', list: fourBack },
          { id: '5back', label: '5-back formations', list: fiveBack },
          { id: '2st', label: 'Two-striker formations', list: twoStrikers }
        ];

        const rows = [];

        groups.forEach((group) => {
          if (!group.list.length) return;

          const options = group.list.map((name) => ({
            label: name,
            value: name,
            default: name === currentFormation
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId(`formation_select_${clubKey}_${group.id}`)
            .setPlaceholder(group.label)
            .addOptions(options.slice(0, 25));

          rows.push(new ActionRowBuilder().addComponents(select));
        });

        return interaction.reply({
          content: 'Choose a formation. Current players will be moved into the closest matching spots.',
          components: rows,
          flags: 64
        });
      }

      // Position buttons: self-claim/free + two-click move/swap
      if (id.startsWith('pos_')) {
        const parts = id.split('_');
        const clubKey = parts[1];
        const index = parseInt(parts[2], 10);

        const clubBoard = boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[index]) {
          return interaction.reply({ content: 'This spot no longer exists.', flags: 64 });
        }

        const slot = clubBoard.slots[index];
        const userId = interaction.user.id;
        const isMgr = isManager(interaction.member);
        const isBlocked = await isUserBlocked(guildId, userId);

        const vcPanelInfo = getVcPanelByMessage(state, interaction.message.id);
        if (vcPanelInfo) {
          const { vcId } = vcPanelInfo;
          const voiceChannel = interaction.guild.channels.cache.get(vcId) ||
            (await interaction.guild.channels.fetch(vcId).catch(() => null));

          if (voiceChannel && interaction.member?.voice?.channelId !== vcId) {
            return interaction.reply({
              content: `You must be connected to **${voiceChannel.name}** to use this panel.`,
              flags: 64
            });
          }
        } else {
          if (!interaction.member?.voice?.channelId) {
            return interaction.reply({
              content: 'You must be connected to a voice channel to claim, free, or move a spot.',
              flags: 64
            });
          }
        }

        const existingDrag = getDrag(guildId, userId);

        // Handle drag/drop
        if (existingDrag && existingDrag.clubKey === clubKey) {
          const fromIndex = existingDrag.fromIndex;
          const fromBoard = boardState[clubKey];
          const fromSlot = fromBoard?.slots[fromIndex];

          if (!fromBoard || !fromSlot) {
            setDrag(guildId, userId, null);
            return interaction.reply({ content: 'Move cancelled (original spot no longer exists).', flags: 64 });
          }

          if (fromIndex === index) {
            setDrag(guildId, userId, null);
            return interaction.reply({ content: 'Move cancelled.', flags: 64 });
          }

          // Perform swap
          const targetSlot = clubBoard.slots[index];
          const tempTakenBy = fromSlot.takenBy;
          const fromWasOpen = fromSlot.open;

          fromSlot.takenBy = targetSlot.takenBy;
          fromSlot.open = !fromSlot.takenBy;

          targetSlot.takenBy = tempTakenBy;
          targetSlot.open = !targetSlot.takenBy;

          // Notify queue if origin slot opened
          if (!fromWasOpen && fromSlot.open) {
            handleSlotOpened(guildId, clubKey, fromIndex).catch(() => {});
          }

          setDrag(guildId, userId, null);

          await saveGuildSettings(guildId, state);
          await interaction.deferUpdate();
          await refreshClubPanels(guildId, clubKey);
          return;
        }

        if (existingDrag && existingDrag.clubKey !== clubKey) {
          setDrag(guildId, userId, null);
        }

        const inVoice = !!interaction.member?.voice?.channelId;
        const canMoveOthers = isMgr || inVoice;

        if (slot.open) {
          // Self-claim
          clubBoard.slots.forEach((s, idx) => {
            if (s.takenBy === userId) {
              s.open = true;
              s.takenBy = null;
              handleSlotOpened(guildId, clubKey, idx).catch(() => {});
            }
          });
          slot.open = false;
          slot.takenBy = userId;
          ensureQueueState(guildId, clubKey, index).length = 0;

          await saveGuildSettings(guildId, state);
          await interaction.deferUpdate();
          await refreshClubPanels(guildId, clubKey);

          try {
            await interaction.followUp({
              content: `✅ You are now playing **${slot.label}**.`,
              flags: 64
            });
          } catch {}
          return;
        }

        // Slot is taken
        if (slot.takenBy === userId) {
          slot.open = true;
          slot.takenBy = null;
          handleSlotOpened(guildId, clubKey, index).catch(() => {});

          await saveGuildSettings(guildId, state);
          await interaction.deferUpdate();
          await refreshClubPanels(guildId, clubKey);
          return;
        }

        // Taken by someone else
        if (isBlocked) {
          const queueRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`queue_${clubKey}_${index}`)
              .setLabel(`🔔 Waitlist ${slot.label}`)
              .setStyle(ButtonStyle.Primary)
          );

          return interaction.reply({
            content: `**${slot.label}** is taken by ${slot.takenBy === '__NOT_IN_VC__' ? 'a placeholder' : `<@${slot.takenBy}>`}.\n\n🔔 **Waitlist this position** – You'll get a DM when it opens!`,
            components: [queueRow],
            flags: 64
          });
        }

        if (!canMoveOthers) {
          const queueRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`queue_${clubKey}_${index}`)
              .setLabel(`🔔 Waitlist ${slot.label}`)
              .setStyle(ButtonStyle.Primary)
          );

          return interaction.reply({
            content: `**${slot.label}** is taken by ${slot.takenBy === '__NOT_IN_VC__' ? 'a placeholder' : `<@${slot.takenBy}>`}.\n\nYou can only move players while in voice, but you can **waitlist this position** to be notified when it opens!`,
            components: [queueRow],
            flags: 64
          });
        }

        // Manager/in-voice: show quick action buttons
        const playerLabel = slot.takenBy === '__NOT_IN_VC__' ? 'placeholder player' : `<@${slot.takenBy}>`;
        
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`start_move_${clubKey}_${index}`)
            .setLabel('🔄 Move Player')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`quick_remove_${clubKey}_${index}`)
            .setLabel('❌ Remove')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`queue_${clubKey}_${index}`)
            .setLabel(`🔔 Waitlist ${slot.label}`)
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: `**${slot.label}** is taken by ${playerLabel}.\n\n🔄 **Move** – Click then pick destination\n❌ **Remove** – Free this spot\n🔔 **Waitlist ${slot.label}** – Get notified when this position opens`,
          components: [actionRow],
          flags: 64
        });
      }
    }

    // ----- Modals -----
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      if (id.startsWith('rename_club_modal_')) {
        const clubKey = id.substring('rename_club_modal_'.length);
        const newName = interaction.fields.getTextInputValue('club_name').trim();
        if (!newName) {
          return interaction.reply({ content: 'Club name cannot be empty.', flags: 64 });
        }

        const currentClub = getClubByKey(state.clubs, clubKey);
        if (!currentClub) {
          return interaction.reply({ content: 'Current club not found.', flags: 64 });
        }

        currentClub.name = newName;
        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);

        return interaction.reply({ content: `Club renamed to **${newName}**.`, flags: 64 });
      }
    }

    // ----- Select Menus -----
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      // Viewer club select
      if (id === 'viewer_club_select') {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(clubs, selectedKey);
        if (!club || !club.enabled) {
          return interaction.reply({ content: 'Unknown or disabled club selected.', flags: 64 });
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildId, selectedKey, state)],
          components: [buildViewerClubSelect(clubs, selectedKey)]
        });
      }

      // Admin club select
      if (id === 'club_select') {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(clubs, selectedKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club selected.', flags: 64 });
        }

        state.currentClubKey = selectedKey;

        const vcPanelInfo = getVcPanelByMessage(state, interaction.message.id);
        if (vcPanelInfo) {
          vcPanelInfo.panel.clubKey = selectedKey;
        }

        await saveGuildSettings(guildId, state);

        return interaction.update({
          embeds: [buildEmbedForClub(guildId, selectedKey, state)],
          components: buildAdminComponents(guildId, selectedKey, state)
        });
      }

      // Player tools select
      if (id.startsWith('player_tools_select_')) {
        const clubKey = id.substring('player_tools_select_'.length);
        const choice = interaction.values[0];

        if (choice === 'assign') {
          return startAssignFromVc(interaction, state, clubKey);
        }
        if (choice === 'smart_assign') {
          if (!isManager(interaction.member)) {
            return interaction.reply({
              content: 'Only captains, managers, owners, media, or admins can use smart assign.',
              flags: 64
            });
          }
          return smartAssignFromVc(interaction, state, clubKey);
        }
        if (choice === 'manage') {
          return startManagePlayers(interaction, state, clubKey);
        }
        if (choice === 'ready_check') {
          if (!isManager(interaction.member)) {
            return interaction.reply({
              content: 'Only captains, managers, owners, media, or admins can send ready checks.',
              flags: 64
            });
          }
          return sendReadyCheck(interaction, state, clubKey);
        }
        if (choice === 'set_prefs') {
          const existing = await getUserPrefs(guildId, interaction.user.id);
          return interaction.reply({
            embeds: [buildPrefsEmbed(existing)],
            components: buildPrefComponents(existing),
            flags: 64
          });
        }
        return;
      }

      // Club tools select
      if (id.startsWith('club_tools_select_')) {
        const clubKey = id.substring('club_tools_select_'.length);
        const choice = interaction.values[0];

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only captains, managers, owners, media, or admins can use club tools.',
            flags: 64
          });
        }

        const club = getClubByKey(clubs, clubKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club selected.', flags: 64 });
        }

        if (choice === 'rename') {
          const modal = new ModalBuilder()
            .setCustomId(`rename_club_modal_${clubKey}`)
            .setTitle('Rename Club')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('club_name')
                  .setLabel('New club name')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(club.name)
              )
            );

          await interaction.showModal(modal);
          return;
        }

        if (choice === 'add') {
          const disabledClub = clubs.find((c) => !c.enabled);
          if (!disabledClub) {
            return interaction.update({ content: 'All available club slots are already in use (max 5).', components: [] });
          }

          disabledClub.enabled = true;
          boardState[disabledClub.key] = createEmptyBoardForFormation(DEFAULT_FORMATION);
          if (!state.clubVcLinks) state.clubVcLinks = {};
          state.clubVcLinks[disabledClub.key] = null;
          state.currentClubKey = disabledClub.key;

          await saveGuildSettings(guildId, state);
          await refreshClubPanels(guildId, disabledClub.key);

          return interaction.update({ content: `Added a new club slot: **${disabledClub.name}**.`, components: [] });
        }

        if (choice === 'remove') {
          if (!club.enabled) {
            return interaction.update({ content: 'This club cannot be removed.', components: [] });
          }

          const enabledCount = clubs.filter((c) => c.enabled).length;
          if (enabledCount <= 1) {
            return interaction.update({ content: 'You must keep at least one club enabled.', components: [] });
          }

          const clubBoard = boardState[clubKey];
          if (clubBoard?.slots) {
            const hasTaken = clubBoard.slots.some((slot) => !slot.open);
            if (hasTaken) {
              return interaction.update({
                content: 'This club still has taken spots. Free all spots first before removing it.',
                components: []
              });
            }
          }

          club.enabled = false;
          resetClubSpots(boardState, clubKey);
          if (state.clubVcLinks) {
            state.clubVcLinks[clubKey] = null;
          }

          if (state.currentClubKey === clubKey) {
            const firstEnabled = clubs.find((c) => c.enabled);
            if (firstEnabled) state.currentClubKey = firstEnabled.key;
          }

          await saveGuildSettings(guildId, state);
          await refreshClubPanels(guildId, state.currentClubKey);

          return interaction.update({ content: `Removed club **${club.name}**.`, components: [] });
        }

        if (choice === 'set_vc') {
          return startSetClubVc(interaction, state, clubKey);
        }

        if (choice === 'toggle_auto') {
          if (!state.autoAssign) state.autoAssign = {};
          state.autoAssign[clubKey] = !state.autoAssign[clubKey];
          await saveGuildSettings(guildId, state);
          await refreshClubPanels(guildId, clubKey);

          const status = state.autoAssign[clubKey] ? 'enabled' : 'disabled';
          return interaction.update({
            content: `✨ Auto-assign for **${club.name}** is now **${status}**.`,
            components: []
          });
        }

        if (choice === 'reset') {
          return doResetSpots(interaction, state, guildId, clubKey);
        }

        if (choice === 'refresh') {
          await refreshClubPanels(guildId, clubKey);
          return interaction.update({ content: 'Panel refreshed.', components: [] });
        }

        return;
      }

      // Set VC select
      if (id.startsWith('set_vc_select_')) {
        const clubKey = id.substring('set_vc_select_'.length);
        const selected = interaction.values[0];

        const club = getClubByKey(clubs, clubKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club in voice channel link request.', flags: 64 });
        }

        if (!state.clubVcLinks) state.clubVcLinks = {};

        let responseText;
        if (selected === '__NONE__') {
          state.clubVcLinks[clubKey] = null;
          responseText = `Cleared the linked voice channel for **${club.name}**.`;
        } else {
          state.clubVcLinks[clubKey] = selected;
          responseText = `Linked **${club.name}** to voice channel <#${selected}>.`;
        }

        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);

        return interaction.update({ content: responseText, components: [] });
      }

      // Assign player pick
      if (id.startsWith('assign_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only captains, managers, owners, media, or admins can assign or move players.',
            flags: 64
          });
        }

        const clubKey = id.substring('assign_player_pick_'.length);
        const club = getClubByKey(clubs, clubKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club in assignment request.', flags: 64 });
        }

        const userId = interaction.values[0];
        const clubBoard = boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({ content: 'Club board not found.', flags: 64 });
        }

        const labelCounts = {};
        clubBoard.slots.forEach((slot) => {
          labelCounts[slot.label] = (labelCounts[slot.label] || 0) + 1;
        });

        const seenLabelIndex = {};
        const options = [];
        for (let idx = clubBoard.slots.length - 1; idx >= 0; idx--) {
          const slot = clubBoard.slots[idx];
          const total = labelCounts[slot.label];
          let label = slot.label;
          if (total > 1) {
            seenLabelIndex[slot.label] = (seenLabelIndex[slot.label] || 0) + 1;
            label = `${slot.label} (${seenLabelIndex[slot.label]})`;
          }
          options.push({ label, value: String(idx) });
        }

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`assign_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Pick a spot')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Now pick a spot for ${userId === '__NOT_IN_VC__' ? 'a player not in VC (placeholder)' : `<@${userId}>`} in **${club.name}**:`,
          components: [row]
        });
      }

      // Assign player position
      if (id.startsWith('assign_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only captains, managers, owners, media, or admins can assign or move players.',
            flags: 64
          });
        }

        const parts = id.split('_');
        const clubKey = parts[3];
        const userId = parts[4];
        const slotIndex = parseInt(interaction.values[0], 10);

        const club = getClubByKey(clubs, clubKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club in assignment request.', flags: 64 });
        }

        const clubBoard = boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[slotIndex]) {
          return interaction.reply({ content: 'Unknown spot for this club.', flags: 64 });
        }

        clubBoard.slots.forEach((s, idx) => {
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
            handleSlotOpened(guildId, clubKey, idx).catch(() => {});
          }
        });

        const slot = clubBoard.slots[slotIndex];
        slot.open = false;
        slot.takenBy = userId;
        ensureQueueState(guildId, clubKey, slotIndex).length = 0;

        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);

        const playerLabel = userId === '__NOT_IN_VC__' ? 'a player not in VC (placeholder)' : `<@${userId}>`;

        return interaction.update({
          content: `Assigned ${playerLabel} to **${slot.label}** in **${club.name}**.`,
          components: []
        });
      }

      // VCSpots pick club
      if (id.startsWith('vcspots_pickclub_')) {
        const voiceChannelId = id.substring('vcspots_pickclub_'.length);
        const clubKey = interaction.values[0];

        const club = getClubByKey(clubs, clubKey);
        if (!club || !club.enabled) {
          return interaction.reply({ content: 'Unknown or disabled club selected.', flags: 64 });
        }

        let vc;
        try {
          vc = await interaction.guild.channels.fetch(voiceChannelId);
        } catch (err) {
          console.error('⚠️ Failed to fetch voice channel for vcspots:', err);
        }

        const existingPanel = state.vcPanels[voiceChannelId];
        let panelMessage = null;

        try {
          if (existingPanel) {
            const channel = await interaction.guild.channels.fetch(existingPanel.textChannelId);
            panelMessage = await channel.messages.fetch(existingPanel.messageId);
            await panelMessage.edit({
              embeds: [buildEmbedForClub(guildId, clubKey, state)],
              components: buildAdminComponents(guildId, clubKey, state)
            });
          }
        } catch (err) {
          console.error('⚠️ Failed to edit existing VC panel:', err);
          panelMessage = null;
        }

        if (!panelMessage) {
          panelMessage = await interaction.channel.send({
            embeds: [buildEmbedForClub(guildId, clubKey, state)],
            components: buildAdminComponents(guildId, clubKey, state)
          });
        }

        state.vcPanels[voiceChannelId] = {
          clubKey,
          textChannelId: panelMessage.channel.id,
          messageId: panelMessage.id
        };

        if (!state.clubVcLinks) state.clubVcLinks = {};
        state.clubVcLinks[clubKey] = voiceChannelId;

        await saveGuildSettings(guildId, state);

        return interaction.update({
          content: `Linked **${club.name}** to voice channel **${vc ? vc.name : 'this VC'}** and posted/updated the live panel in this chat.`,
          components: []
        });
      }

      // Manage player pick
      if (id.startsWith('manage_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only captains, managers, owners, media, or admins can remove or move players.',
            flags: 64
          });
        }

        const clubKey = id.substring('manage_player_pick_'.length);
        const club = getClubByKey(clubs, clubKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club in manage request.', flags: 64 });
        }

        const userId = interaction.values[0];
        const clubBoard = boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({ content: 'Club board not found.', flags: 64 });
        }

        const labelCounts = {};
        clubBoard.slots.forEach((slot) => {
          labelCounts[slot.label] = (labelCounts[slot.label] || 0) + 1;
        });

        const seenLabelIndex = {};
        const options = [];
        for (let idx = clubBoard.slots.length - 1; idx >= 0; idx--) {
          const slot = clubBoard.slots[idx];
          const total = labelCounts[slot.label];
          let label = slot.label;
          if (total > 1) {
            seenLabelIndex[slot.label] = (seenLabelIndex[slot.label] || 0) + 1;
            label = `${slot.label} (${seenLabelIndex[slot.label]})`;
          }
          options.push({ label, value: String(idx) });
        }

        options.push({ label: 'Remove from all spots', value: '__REMOVE__' });

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`manage_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Choose a new spot or remove from all')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Manage ${userId === '__NOT_IN_VC__' ? 'the player not in VC placeholder' : `<@${userId}>`} in **${club.name}**:`,
          components: [row]
        });
      }

      // Manage player position
      if (id.startsWith('manage_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only captains, managers, owners, media, or admins can remove or move players.',
            flags: 64
          });
        }

        const parts = id.split('_');
        const clubKey = parts[3];
        const userId = parts[4];
        const choice = interaction.values[0];

        const club = getClubByKey(clubs, clubKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club in manage request.', flags: 64 });
        }

        const clubBoard = boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({ content: 'Club board not found.', flags: 64 });
        }

        clubBoard.slots.forEach((s, idx) => {
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
            handleSlotOpened(guildId, clubKey, idx).catch(() => {});
          }
        });

        if (choice !== '__REMOVE__') {
          const slotIndex = parseInt(choice, 10);
          const slot = clubBoard.slots[slotIndex];
          if (!slot) {
            return interaction.reply({ content: 'Unknown position for this club.', flags: 64 });
          }
          slot.open = false;
          slot.takenBy = userId;
          ensureQueueState(guildId, clubKey, slotIndex).length = 0;
        }

        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);

        if (choice === '__REMOVE__') {
          if (userId === '__NOT_IN_VC__') {
            return interaction.update({
              content: `Removed the "player not in VC" placeholder from all spots in **${club.name}**.`,
              components: []
            });
          } else {
            return interaction.update({
              content: `Removed <@${userId}> from all spots in **${club.name}**.`,
              components: []
            });
          }
        } else {
          const slotIndex = parseInt(choice, 10);
          const newSlot = clubBoard.slots[slotIndex];
          const movedLabel = userId === '__NOT_IN_VC__' ? 'the player not in VC placeholder' : `<@${userId}>`;

          return interaction.update({
            content: `Moved ${movedLabel} to **${newSlot.label}** in **${club.name}**.`,
            components: []
          });
        }
      }

      // Formation selection
      if (id.startsWith('formation_select_')) {
        const parts = id.split('_');
        const clubKey = parts[2];
        const formationName = interaction.values[0];
        return setClubFormation(interaction, guildId, clubKey, formationName);
      }

      // Filter for /posprefs (VC / Online / All)
      if (id === 'posprefs_filter_select') {
        const guild = interaction.guild;
        const selected = interaction.values[0];

        await interaction.deferUpdate();

        let members = await guild.members.fetch();
        members = members.filter(m => !m.user.bot);

        const allParticipants = [];
        for (const m of members.values()) {
          const prefs = await getUserPrefs(guildId, m.id);
          if (prefs && prefs.length > 0) {
            allParticipants.push({ member: m, prefs });
          }
        }

        if (allParticipants.length === 0) {
          return interaction.editReply({
            content: 'No players have saved position preferences yet.',
            embeds: [],
            components: []
          });
        }

        const userVc = interaction.member?.voice?.channel;
        const vcParticipants = userVc
          ? allParticipants.filter(p => p.member.voice?.channel?.id === userVc.id)
          : [];
        const onlineParticipants = allParticipants.filter(p => 
          p.member.presence?.status && p.member.presence.status !== 'offline'
        );

        let filteredParticipants, label;
        if (selected === '__VC__' && userVc) {
          filteredParticipants = vcParticipants;
          label = `Voice Channel (${userVc.name})`;
        } else if (selected === '__ONLINE__') {
          filteredParticipants = onlineParticipants;
          label = 'Online Now';
        } else {
          filteredParticipants = allParticipants;
          label = 'Entire Server';
        }

        if (filteredParticipants.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setTitle(`🧩 Position Preferences – ${label}`)
            .setColor(0x5865f2)
            .setDescription(`No players with saved preferences found for **${label}**.`);

          const filterSelect = buildPosPrefsFilterSelect(vcParticipants.length, onlineParticipants.length, allParticipants.length);
          return interaction.editReply({
            embeds: [emptyEmbed],
            components: [filterSelect]
          });
        }

        const embed = buildPosPrefsEmbedForParticipants(guild, filteredParticipants, label);
        const filterSelect = buildPosPrefsFilterSelect(vcParticipants.length, onlineParticipants.length, allParticipants.length);

        return interaction.editReply({
          embeds: [embed],
          components: [filterSelect]
        });
      }
    }
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: 'An error occurred.', flags: 64 });
      } catch (e) {}
    }
  }
});

// =======================
// EDGE FUNCTION HELPER
// =======================

async function callEdgeFunction(functionName, body) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    if (!response.ok) {
      console.error(`❌ Edge function ${functionName} error:`, data);
      return { error: data.error || 'Unknown error', data: null };
    }
    return { error: null, data };
  } catch (err) {
    console.error(`❌ Edge function ${functionName} exception:`, err);
    return { error: err.message, data: null };
  }
}

// =======================
// EA FC PRO CLUBS INTEGRATION
// =======================

// Platform display names for embeds
const EA_PLATFORM_NAMES = {
  'ps5': 'PlayStation 5',
  'ps4': 'PlayStation 4',
  'xbox-series-xs': 'Xbox Series X|S',
  'xboxone': 'Xbox One',
  'pc': 'PC'
};

// Start EA monitoring for a specific club
async function startEaMonitoring(guildId, clubKey) {
  const monitorKey = `${guildId}_${clubKey}`;
  
  // Don't start duplicate intervals
  if (eaMonitoringIntervals.has(monitorKey)) {
    return;
  }
  
  console.log(`[EA] Starting monitoring for ${monitorKey}`);
  
  // Run immediately then every 2 minutes
  checkForNewMatches(guildId, clubKey);
  
  const intervalId = setInterval(() => {
    checkForNewMatches(guildId, clubKey);
  }, 120000); // 2 minutes
  
  eaMonitoringIntervals.set(monitorKey, intervalId);
}

// Stop EA monitoring for a specific club
function stopEaMonitoring(guildId, clubKey) {
  const monitorKey = `${guildId}_${clubKey}`;
  const intervalId = eaMonitoringIntervals.get(monitorKey);
  
  if (intervalId) {
    clearInterval(intervalId);
    eaMonitoringIntervals.delete(monitorKey);
    console.log(`[EA] Stopped monitoring for ${monitorKey}`);
  }
}

// Check for new matches from EA API
async function checkForNewMatches(guildId, clubKey) {
  try {
    const state = await getGuildState(guildId);
    if (!state) return;
    
    const club = state.clubs?.find(c => c.key === clubKey);
    if (!club?.ea_club_id || !club?.ea_platform || !club?.monitoring_enabled) {
      return;
    }
    
    console.log(`[EA] Checking matches for ${club.name} (${club.ea_club_id})`);
    
    // Fetch recent matches from EA API
    const matches = await matchesStats({
      clubId: club.ea_club_id,
      platform: club.ea_platform,
      matchType: 'matchType9' // Division matches
    }).catch(err => {
      console.error(`[EA] Failed to fetch matches:`, err.message);
      return [];
    });
    
    if (!matches || matches.length === 0) {
      return;
    }
    
    // Get the most recent match
    const latestMatch = matches[0];
    const matchId = latestMatch.matchId?.toString();
    
    if (!matchId) return;
    
    // Check if we've already processed this match
    if (club.last_match_id === matchId) {
      return;
    }
    
    // Check if match exists in database
    const { data: existingMatch } = await supabase
      .from('club_matches')
      .select('id')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey)
      .eq('ea_match_id', matchId)
      .single();
    
    if (existingMatch) {
      // Update last_match_id even if already exists
      club.last_match_id = matchId;
      await saveGuildSettings(guildId, state);
      return;
    }
    
    // New match detected! Process it
    console.log(`[EA] New match detected: ${matchId}`);
    await processNewMatch(guildId, clubKey, club, latestMatch, state);
    
  } catch (err) {
    console.error(`[EA] Error checking matches:`, err);
  }
}

// Process a new match from EA API
async function processNewMatch(guildId, clubKey, club, matchData, state) {
  try {
    const matchId = matchData.matchId?.toString();
    
    // Determine match result
    const ourClubData = matchData.clubs?.[club.ea_club_id];
    const opponentClubId = Object.keys(matchData.clubs || {}).find(id => id !== club.ea_club_id);
    const opponentClubData = opponentClubId ? matchData.clubs[opponentClubId] : null;
    
    const scoreFor = parseInt(ourClubData?.goals || 0);
    const scoreAgainst = parseInt(opponentClubData?.goals || 0);
    const opponentName = opponentClubData?.name || 'Unknown';
    
    let result = 'draw';
    if (scoreFor > scoreAgainst) result = 'win';
    else if (scoreFor < scoreAgainst) result = 'loss';
    
    // Extract player stats
    const playerStats = [];
    const players = matchData.players?.[club.ea_club_id] || {};
    
    for (const [eaPlayerId, pStats] of Object.entries(players)) {
      playerStats.push({
        ea_username: pStats.playername,
        goals: parseInt(pStats.goals || 0),
        assists: parseInt(pStats.assists || 0),
        rating: parseFloat(pStats.rating || 0),
        position: pStats.pos,
        motm: pStats.mom === '1'
      });
    }
    
    // Save to club_matches table
    await supabase.from('club_matches').insert({
      guild_id: guildId,
      club_key: clubKey,
      ea_match_id: matchId,
      match_type: 'division',
      result,
      score_for: scoreFor,
      score_against: scoreAgainst,
      opponent_club_name: opponentName,
      opponent_club_id: opponentClubId,
      match_data: matchData,
      player_stats: playerStats
    });
    
    // Map EA usernames to Discord users and record stats
    for (const pStat of playerStats) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('ea_username', pStat.ea_username)
        .single();
      
      if (profile) {
        // Record player stats
        await supabase.from('player_stats').insert({
          guild_id: guildId,
          discord_user_id: profile.discord_user_id,
          draft_id: null,
          match_type: 'club',
          goals: pStat.goals,
          assists: pStat.assists,
          clean_sheet: pStat.position === 'GK' && scoreAgainst === 0,
          won: result === 'win',
          ea_match_rating: pStat.rating,
          position_played: pStat.position,
          man_of_match: pStat.motm
        });
        
        // Trigger rating recalculation
        await callEdgeFunction('calculate-ratings', {
          guild_id: guildId,
          discord_user_id: profile.discord_user_id
        });
      }
    }
    
    // Update last_match_id
    club.last_match_id = matchId;
    await saveGuildSettings(guildId, state);
    
    // Post result to stats channel
    if (club.stats_channel_id) {
      await postMatchResult(guildId, club.stats_channel_id, {
        result, scoreFor, scoreAgainst, opponentName, playerStats, clubName: club.name
      });
    }
    
    console.log(`[EA] Processed match ${matchId}: ${result} ${scoreFor}-${scoreAgainst} vs ${opponentName}`);
    
  } catch (err) {
    console.error(`[EA] Error processing match:`, err);
  }
}

// Post match result embed to a channel
async function postMatchResult(guildId, channelId, matchInfo) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    
    const resultEmoji = matchInfo.result === 'win' ? '✅' : matchInfo.result === 'loss' ? '❌' : '🤝';
    const resultText = matchInfo.result.toUpperCase();
    
    // Find MOTM
    const motm = matchInfo.playerStats.find(p => p.motm);
    
    // Format scorers
    const scorers = matchInfo.playerStats.filter(p => p.goals > 0);
    const assisters = matchInfo.playerStats.filter(p => p.assists > 0);
    
    const embed = new EmbedBuilder()
      .setTitle(`🏟️ Division Match Complete`)
      .setColor(matchInfo.result === 'win' ? 0x00ff00 : matchInfo.result === 'loss' ? 0xff0000 : 0xffcc00)
      .setDescription(`${resultEmoji} **${resultText}** ${matchInfo.scoreFor}-${matchInfo.scoreAgainst} vs **${matchInfo.opponentName}**`)
      .addFields(
        { name: '🎮 Club', value: matchInfo.clubName, inline: true },
        { name: '📊 Score', value: `${matchInfo.scoreFor} - ${matchInfo.scoreAgainst}`, inline: true },
        { name: '⭐ MOTM', value: motm ? `${motm.ea_username} (${motm.rating})` : 'N/A', inline: true }
      );
    
    if (scorers.length > 0) {
      const scorerText = scorers.map(p => `⚽ ${p.ea_username} (${p.goals})`).join('\n');
      embed.addFields({ name: 'Goals', value: scorerText, inline: true });
    }
    
    if (assisters.length > 0) {
      const assistText = assisters.map(p => `🎯 ${p.ea_username} (${p.assists})`).join('\n');
      embed.addFields({ name: 'Assists', value: assistText, inline: true });
    }
    
    embed.setFooter({ text: '📊 Stats recorded automatically! Use /linkea to connect your EA account.' });
    
    await channel.send({ embeds: [embed] });
    
  } catch (err) {
    console.error(`[EA] Error posting match result:`, err);
  }
}

// Sync historical matches from EA API - pulls all available match history without duplicating
async function syncClubHistory(guildId, clubKey, maxMatches = 50) {
  try {
    const state = await getGuildState(guildId);
    if (!state) return { synced: 0, skipped: 0, error: null };
    
    const club = state.clubs?.find(c => c.key === clubKey);
    if (!club?.ea_club_id || !club?.ea_platform) {
      return { synced: 0, skipped: 0, error: 'Club not linked to EA' };
    }
    
    console.log(`[EA] Syncing history for ${club.name} (${club.ea_club_id})`);
    
    // Fetch all available matches from EA API (both division and cup)
    const [divisionMatches, cupMatches] = await Promise.all([
      matchesStats({
        clubId: club.ea_club_id,
        platform: club.ea_platform,
        matchType: 'matchType9' // Division matches
      }).catch(() => []),
      matchesStats({
        clubId: club.ea_club_id,
        platform: club.ea_platform,
        matchType: 'matchType13' // Cup matches
      }).catch(() => [])
    ]);
    
    const allMatches = [
      ...divisionMatches.map(m => ({ ...m, matchType: 'division' })),
      ...cupMatches.map(m => ({ ...m, matchType: 'cup' }))
    ].slice(0, maxMatches);
    
    if (allMatches.length === 0) {
      return { synced: 0, skipped: 0, error: 'No matches found from EA API' };
    }
    
    // Get all existing match IDs to avoid duplicates
    const { data: existingMatches } = await supabase
      .from('club_matches')
      .select('ea_match_id')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey);
    
    const existingIds = new Set((existingMatches || []).map(m => m.ea_match_id));
    
    let synced = 0;
    let skipped = 0;
    
    for (const matchData of allMatches) {
      const matchId = matchData.matchId?.toString();
      if (!matchId) continue;
      
      // Skip if already exists
      if (existingIds.has(matchId)) {
        skipped++;
        continue;
      }
      
      // Process this match
      const ourClubData = matchData.clubs?.[club.ea_club_id];
      const opponentClubId = Object.keys(matchData.clubs || {}).find(id => id !== club.ea_club_id);
      const opponentClubData = opponentClubId ? matchData.clubs[opponentClubId] : null;
      
      const scoreFor = parseInt(ourClubData?.goals || 0);
      const scoreAgainst = parseInt(opponentClubData?.goals || 0);
      const opponentName = opponentClubData?.name || 'Unknown';
      
      let result = 'draw';
      if (scoreFor > scoreAgainst) result = 'win';
      else if (scoreFor < scoreAgainst) result = 'loss';
      
      // Extract player stats
      const playerStats = [];
      const players = matchData.players?.[club.ea_club_id] || {};
      
      for (const [eaPlayerId, pStats] of Object.entries(players)) {
        playerStats.push({
          ea_username: pStats.playername,
          goals: parseInt(pStats.goals || 0),
          assists: parseInt(pStats.assists || 0),
          rating: parseFloat(pStats.rating || 0),
          position: pStats.pos,
          motm: pStats.mom === '1'
        });
      }
      
      // Save to club_matches table
      const { error: insertError } = await supabase.from('club_matches').insert({
        guild_id: guildId,
        club_key: clubKey,
        ea_match_id: matchId,
        match_type: matchData.matchType,
        result,
        score_for: scoreFor,
        score_against: scoreAgainst,
        opponent_club_name: opponentName,
        opponent_club_id: opponentClubId,
        match_data: matchData,
        player_stats: playerStats
      });
      
      if (insertError) {
        console.error(`[EA] Failed to insert match ${matchId}:`, insertError.message);
        continue;
      }
      
      // Map EA usernames to Discord users and record player stats
      for (const pStat of playerStats) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('discord_user_id')
          .eq('ea_username', pStat.ea_username)
          .maybeSingle();
        
        if (profile) {
          // Check if player_stats already exists for this match
          const { data: existingStat } = await supabase
            .from('player_stats')
            .select('id')
            .eq('guild_id', guildId)
            .eq('discord_user_id', profile.discord_user_id)
            .eq('match_type', 'club')
            .eq('recorded_at', matchData.timestamp || new Date().toISOString())
            .maybeSingle();
          
          if (!existingStat) {
            await supabase.from('player_stats').insert({
              guild_id: guildId,
              discord_user_id: profile.discord_user_id,
              draft_id: null,
              match_type: 'club',
              goals: pStat.goals,
              assists: pStat.assists,
              clean_sheet: pStat.position === 'GK' && scoreAgainst === 0,
              won: result === 'win',
              ea_match_rating: pStat.rating,
              position_played: pStat.position,
              man_of_match: pStat.motm
            });
            
            // Trigger rating recalculation
            await callEdgeFunction('calculate-ratings', {
              guild_id: guildId,
              discord_user_id: profile.discord_user_id
            });
          }
        }
      }
      
      synced++;
      existingIds.add(matchId); // Prevent processing same match twice
    }
    
    // Update last_match_id to most recent
    if (allMatches.length > 0) {
      const latestMatchId = allMatches[0].matchId?.toString();
      if (latestMatchId) {
        club.last_match_id = latestMatchId;
        await saveGuildSettings(guildId, state);
      }
    }
    
    console.log(`[EA] History sync complete: ${synced} synced, ${skipped} skipped`);
    return { synced, skipped, error: null };
    
  } catch (err) {
    console.error(`[EA] Error syncing history:`, err);
    return { synced: 0, skipped: 0, error: err.message };
  }
}

// Resume EA monitoring for all enabled clubs on startup
async function resumeEaMonitoring() {
  try {
    const { data: allSettings } = await supabase
      .from('guild_settings')
      .select('guild_id, clubs');
    
    if (!allSettings) return;
    
    for (const settings of allSettings) {
      const clubs = settings.clubs || [];
      for (const club of clubs) {
        if (club.ea_club_id && club.monitoring_enabled) {
          startEaMonitoring(settings.guild_id, club.key);
        }
      }
    }
    
    console.log(`[EA] Resumed monitoring for ${eaMonitoringIntervals.size} clubs`);
  } catch (err) {
    console.error(`[EA] Error resuming monitoring:`, err);
  }
}

// =======================
// EMBED BUILDERS FOR NEW FEATURES
// =======================

function buildProfileEmbed(profile, username) {
  const rating = profile.overall_rating || 50;
  const ratingBar = buildProgressBar(rating, 100, 10);
  
  const streakEmoji = profile.streak_type === 'win' ? '🔥' : profile.streak_type === 'loss' ? '❄️' : '➖';
  const streakText = profile.current_streak > 0 ? `${streakEmoji} ${profile.current_streak}` : 'No streak';
  
  const achievements = (profile.top_achievements || []).slice(0, 3).join(' ') || 'None yet';
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 Player Profile: ${username}`)
    .setColor(rating >= 70 ? 0x00ff00 : rating >= 50 ? 0xffcc00 : 0xff6600)
    .addFields(
      { name: '⭐ Overall Rating', value: `**${rating}** \`${ratingBar}\``, inline: true },
      { name: '📈 Form', value: streakText, inline: true },
      { name: '🎯 Primary Position', value: profile.primary_position || 'Not set', inline: true },
      { name: '🎮 Games Played', value: `${profile.games_played || 0}`, inline: true },
      { name: '🏆 Wins', value: `${profile.wins || 0} (${profile.win_rate || 0}%)`, inline: true },
      { name: '⚽ Goals / 🎯 Assists', value: `${profile.goals || 0} / ${profile.assists || 0}`, inline: true },
      { name: '🏅 Achievements', value: achievements, inline: false }
    );
  
  if (profile.competition_wins && profile.competition_wins.length > 0) {
    const winsText = profile.competition_wins.slice(0, 3).map(w => 
      `🏆 ${w.competition_name} (${w.tier})`
    ).join('\n');
    embed.addFields({ name: '🏆 Competition Wins', value: winsText, inline: false });
  }
  
  return embed;
}

function buildLeaderboardEmbed(players, type, guildName) {
  const typeLabels = {
    overall: '⭐ Overall Rating',
    win_rate: '🏆 Win Rate',
    goals: '⚽ Goals',
    assists: '🎯 Assists',
    form: '📈 Form'
  };
  
  const lines = players.slice(0, 10).map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const name = p.discord_username || `<@${p.discord_user_id}>`;
    
    let stat;
    switch (type) {
      case 'win_rate': stat = `${p.win_rate || 0}%`; break;
      case 'goals': stat = `${p.goals || 0}`; break;
      case 'assists': stat = `${p.assists || 0}`; break;
      case 'form': stat = `${p.form_rating || 0}`; break;
      default: stat = `${p.overall_rating || 50}`;
    }
    
    return `${medal} **${name}** – ${stat}`;
  });
  
  return new EmbedBuilder()
    .setTitle(`🏆 ${guildName} Leaderboard – ${typeLabels[type] || 'Overall'}`)
    .setColor(0xffd700)
    .setDescription(lines.join('\n') || 'No players found.')
    .setFooter({ text: `Top 10 players • Updated just now` });
}

function buildDraftEmbed(draftData, guild) {
  const teamAPlayers = draftData.team_a_player_ids || [];
  const teamBPlayers = draftData.team_b_player_ids || [];
  const availablePlayers = draftData.available_players || [];
  
  const teamALines = teamAPlayers.map(id => `<@${id}>`).join('\n') || 'Empty';
  const teamBLines = teamBPlayers.map(id => `<@${id}>`).join('\n') || 'Empty';
  
  const availableLines = availablePlayers.slice(0, 10).map(p => {
    const rating = p.overall_rating || 50;
    const streak = p.current_streak > 0 ? (p.streak_type === 'win' ? `🔥${p.current_streak}` : `❄️${p.current_streak}`) : '';
    return `<@${p.discord_user_id}> (${rating}) ${streak}`;
  }).join('\n') || 'None';
  
  const currentPicker = draftData.current_picker === 'a' ? draftData.captain_a_discord_id : draftData.captain_b_discord_id;
  
  return new EmbedBuilder()
    .setTitle('⚔️ DRAFT IN PROGRESS')
    .setColor(0xff6b35)
    .addFields(
      { name: `🔴 Team A (Captain: <@${draftData.captain_a_discord_id}>)`, value: teamALines, inline: true },
      { name: `🔵 Team B (Captain: <@${draftData.captain_b_discord_id}>)`, value: teamBLines, inline: true },
      { name: '👥 Available Players', value: availableLines, inline: false }
    )
    .setDescription(`**Pick #${draftData.pick_number || 1}** – <@${currentPicker}>'s turn to pick!`)
    .setFooter({ text: 'Use /draftpick @player to pick • /draftresult to report score' });
}

function buildDraftResultEmbed(result) {
  const winner = result.winning_team === 'a' ? '🔴 Team A' : result.winning_team === 'b' ? '🔵 Team B' : '🤝 Draw';
  
  return new EmbedBuilder()
    .setTitle('🏁 Draft Result')
    .setColor(result.status === 'confirmed' ? 0x00ff00 : 0xffcc00)
    .addFields(
      { name: 'Score', value: `🔴 Team A: **${result.team_a_score}** – 🔵 Team B: **${result.team_b_score}**`, inline: false },
      { name: 'Winner', value: winner, inline: true },
      { name: 'Status', value: result.status === 'confirmed' ? '✅ Confirmed' : '⏳ Pending confirmation', inline: true }
    )
    .setFooter({ text: result.status === 'confirmed' ? 'Stats recorded!' : 'Waiting for more confirmations...' });
}

// =======================
// LOGIN
// =======================

client.login(token);
