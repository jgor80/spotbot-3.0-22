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
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// =======================
// OPENAI CONFIGURATION (for scouting)
// =======================

const openaiApiKey = process.env.OPENAI_API_KEY;
let openai = null;
if (openaiApiKey) {
  openai = new OpenAI({ apiKey: openaiApiKey });
  console.log('✅ OpenAI configured for scouting reports');
} else {
  console.warn('⚠️ OPENAI_API_KEY not set – scouting reports and match previews will be unavailable.');
}

// =======================
// EA FC API CONFIGURATION
// =======================

// Platform mapping from Discord choices to EA API values
const EA_PLATFORM_MAP = {
  'ps5': 'common-gen5',
  'xbox-series-xs': 'common-gen5',
  'pc': 'common-gen5',
  'ps4': 'common-gen4',
  'xboxone': 'common-gen4'
};

// Headers to avoid Akamai blocking
const EA_HEADERS = {
  'accept': 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'dnt': '1',
  'origin': 'https://www.ea.com',
  'referer': 'https://www.ea.com/',
  'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
};

/**
 * Search for clubs on EA FC Pro Clubs API
 * @param {Object} options - { name: string, platform: string }
 * @returns {Array} - Array of club objects with clubId, name, etc.
 */
async function searchClub(options) {
  const { name, platform } = options;
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  console.log(`[EA] Searching for club "${name}" on platform ${platform} -> ${fcPlatform}`);
  
  try {
    const res = await axios.get('https://proclubs.ea.com/api/fc/allTimeLeaderboard/search', {
      params: {
        platform: fcPlatform,
        clubName: name
      },
      headers: EA_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });
    
    console.log(`[EA] Search response status: ${res.status}`);
    
    if (res.status !== 200 || !res.data) {
      return [];
    }
    
    let data = res.data;
    
    // Handle wrapped responses (keyed at "0")
    if (data && typeof data === 'object' && data['0']) {
      data = data['0'];
    }
    
    let rows = [];
    if (Array.isArray(data)) {
      rows = data;
    } else if (data && typeof data === 'object') {
      rows = Object.values(data).filter(v => v && typeof v === 'object');
    }
    
    const results = [];
    for (const row of rows) {
      const info = row.clubInfo || row.clubinfo || row.info || row;
      if (!info || typeof info !== 'object') continue;
      
      const clubId = String(info.clubId ?? info.clubID ?? info.id ?? info.club ?? '');
      if (!clubId) continue;
      
      results.push({
        clubId,
        name: info.name || info.clubName || info.clubname || name,
        region: info.regionName || info.region || info.countryName || null,
        division: info.division || info.leagueDivision || info.bestDivision || null,
        platform: fcPlatform,
        raw: info
      });
    }
    
    console.log(`[EA] Found ${results.length} clubs matching "${name}"`);
    return results;
    
  } catch (err) {
    console.error(`[EA] Search error for "${name}" on ${fcPlatform}:`, err.message);
    throw err;
  }
}

/**
 * Fetch match stats from EA FC Pro Clubs API
 * @param {Object} options - { clubId: string, platform: string, matchType: string }
 * @returns {Array} - Array of match objects
 */
async function matchesStats(options) {
  const { clubId, platform, matchType = 'leagueMatch' } = options;
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  console.log(`[EA] Fetching ${matchType} for club ${clubId} on ${fcPlatform}`);
  
  try {
    const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
      params: {
        platform: fcPlatform,
        clubIds: clubId,
        matchType,
        maxResultCount: 50
      },
      headers: EA_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (res.status !== 200 || !res.data) {
      return [];
    }
    
    let matches = res.data;
    if (Array.isArray(matches)) {
      return matches;
    } else if (matches && typeof matches === 'object') {
      // Handle different response formats
      if (Array.isArray(matches.matches)) return matches.matches;
      return Object.values(matches).filter(v => v && typeof v === 'object');
    }
    
    return [];
  } catch (err) {
    console.error(`[EA] Match stats error for club ${clubId}:`, err.message);
    throw err;
  }
}

/**
 * Fetch club info (skill rating, record, goals)
 * @param {Object} options - { clubId: string, platform: string }
 * @returns {Object|null} - Club info object
 */
async function fetchClubInfo(options) {
  const { clubId, platform } = options;
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  try {
    const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/info', {
      params: {
        platform: fcPlatform,
        clubIds: clubId
      },
      headers: EA_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (res.status !== 200 || !res.data) {
      console.error(`[EA] Club info request failed: ${res.status}`);
      return null;
    }
    
    const data = res.data;
    // Response is typically an array or object keyed by club ID
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data[clubId]) return data[clubId];
    return data;
  } catch (err) {
    console.error(`[EA] Club info error for ${clubId}:`, err.message);
    return null;
  }
}

/**
 * Fetch club member list with stats
 * @param {Object} options - { clubId: string, platform: string }
 * @returns {Array} - Array of member objects
 */
async function fetchClubMembers(options) {
  const { clubId, platform } = options;
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  try {
    const res = await axios.get('https://proclubs.ea.com/api/fc/members/stats', {
      params: {
        platform: fcPlatform,
        clubId
      },
      headers: EA_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (res.status !== 200 || !res.data) {
      console.error(`[EA] Club members request failed: ${res.status}`);
      return [];
    }
    
    const data = res.data;
    if (data?.members && Array.isArray(data.members)) return data.members;
    if (Array.isArray(data)) return data;
    return Object.values(data).filter(v => v && typeof v === 'object');
  } catch (err) {
    console.error(`[EA] Club members error for ${clubId}:`, err.message);
    return [];
  }
}

/**
 * Sync club stats to database (called from local bot)
 */
async function syncClubStatsLocal(guildId, clubKey, clubId, platform) {
  try {
    const clubInfo = await fetchClubInfo({ clubId, platform });
    if (!clubInfo) return null;
    
    const clubData = {
      guild_id: guildId,
      club_key: clubKey,
      ea_club_id: clubId,
      ea_platform: platform,
      skill_rating: parseInt(clubInfo.skillRating || clubInfo.skill_rating || 0),
      wins: parseInt(clubInfo.wins || 0),
      draws: parseInt(clubInfo.draws || clubInfo.ties || 0),
      losses: parseInt(clubInfo.losses || 0),
      goals_scored: parseInt(clubInfo.goals || clubInfo.goalsScored || 0),
      goals_conceded: parseInt(clubInfo.goalsAgainst || clubInfo.goalsConceded || 0),
      total_members: parseInt(clubInfo.memberCount || clubInfo.totalMembers || 0),
      club_name: clubInfo.name || clubInfo.clubName || null,
      best_division: clubInfo.bestDivision || clubInfo.bestDivisionName || null,
      last_synced_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('club_stats')
      .upsert(clubData, { onConflict: 'guild_id,club_key' });
    
    if (error) {
      console.error(`[EA] Failed to sync club stats:`, error.message);
      return null;
    }
    
    console.log(`[EA] Synced club stats for ${clubData.club_name || clubKey}`);
    return clubData;
  } catch (err) {
    console.error(`[EA] Error syncing club stats:`, err);
    return null;
  }
}

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
  { key: 'club5', name: 'Club 5', enabled: false },
  { key: 'club6', name: 'Club 6', enabled: false },
  { key: 'club7', name: 'Club 7', enabled: false },
  { key: 'club8', name: 'Club 8', enabled: false },
  { key: 'club9', name: 'Club 9', enabled: false },
  { key: 'club10', name: 'Club 10', enabled: false }
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
  { 
    name: 'draft', 
    description: 'Start a draft with players in your current voice channel.',
    options: [
      { name: 'team_a_vc', description: 'Voice channel for Team A (optional, for auto-move).', type: 7, required: false },
      { name: 'team_b_vc', description: 'Voice channel for Team B (optional, for auto-move).', type: 7, required: false },
      { name: 'min_games', description: 'Minimum games to be captain (default: 5).', type: 4, required: false }
    ]
  },
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
  { name: 'draftreroll', description: 'Request to reroll captains (before picks begin). Requires both captains to agree.' },

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
  { name: 'refreshpanel', description: 'Force refresh the admin panel in this channel.' },

  // Scouting Panel
  { name: 'scoutpanel', description: 'Create a scouting panel in this channel for club scouting and match analysis.' },
  
  // EA Sync Panel
  { name: 'eapanel', description: 'Create an EA integration panel for managing club links and syncing stats.' },
  
  // Ratings Panel
  { name: 'ratingspanel', description: 'Create a ratings panel for viewing player ratings, leaderboards, and stats.' },

  // Scouting Commands (ScoutBot functionality)
  {
    name: 'scoutclub',
    description: 'Generate an AI scouting report for any EA FC Pro Clubs team.',
    options: [
      { name: 'name', description: 'Club name as it appears in-game.', type: 3, required: true }
    ]
  },
  {
    name: 'clubmatches',
    description: 'Show a summary of recent matches for any EA FC Pro Clubs team.',
    options: [
      { name: 'name', description: 'Club name as it appears in-game.', type: 3, required: true }
    ]
  },
  {
    name: 'matchpreview',
    description: 'Generate an AI match preview between two EA FC Pro Clubs teams.',
    options: [
      { name: 'home', description: 'Home club name.', type: 3, required: true },
      { name: 'away', description: 'Away club name.', type: 3, required: true }
    ]
  }
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

// Scouting state (for select menu choices)
const pendingScoutChoices = new Map(); // Map<userId, { query, results }>
const pendingMatchesChoices = new Map(); // Map<userId, { query, results }>
const pendingPreviewChoices = new Map(); // Map<userId, { homeQuery, awayQuery, homeResults, awayResults, homeIndex, awayIndex }>

// FC Platform labels for scouting
const FC_PLATFORM_LABELS = {
  'common-gen5': 'Gen 5 (PS5 / Xbox Series / PC)',
  'common-gen4': 'Gen 4 (PS4 / Xbox One)'
};

// =======================
// SCOUTING OPENAI PROMPTS
// =======================

const SCOUT_SYSTEM_PROMPT = `
You are an experienced EA FC Pro Clubs opposition scout.

You will receive:
- Club info JSON for a single team
- Aggregated club + player stats JSON
- Match history JSON for league, playoffs, and friendlies (sometimes partial)

Your job: produce a **concise, practical, numbers-first scouting report** for a competitive Pro Clubs team that focuses on:
- A **Difficulty To Beat (DTB)** score from 0–100
- A **Club Value Index (CVI)** ranking of key players
- **Per-position production** (forwards vs midfield vs defense vs GK)
- **Attacking & defensive tendencies**
- **Recent form**
- A clear **game plan** to beat them

Avoid meta commentary and boilerplate. Spend your words on actual metrics and what they imply.

### Difficulty To Beat (DTB)
Assign the club a DTB score from 0–100 (higher = harder to beat).
- ~40–50: average team
- ~55–65: solid / above average competitive side
- ~70–80: strong / high-level side
- 80+: very tough / elite side

### Report structure (sections)
1. **Overall Summary** - One paragraph with headline metrics and DTB score
2. **Key Players & CVI** - Top 8-12 players table with deeper analysis
3. **Attacking Tendencies** - GF/GP, goal creation patterns
4. **Defensive Tendencies** - GA/GP, clean sheets, weak points
5. **Recent Form** - Last matches W-D-L and trends
6. **Game Plan to Beat Them** - 4-7 actionable tactical bullets

Keep the report under 3000 characters for Discord. Use markdown code blocks for tables.`;

const MATCH_PREVIEW_SYSTEM_PROMPT = `
You are an experienced EA FC Pro Clubs opposition scout preparing a head-to-head match preview between two clubs.

Your job: produce a concise, numbers-first match preview that:
- Assigns **each team** a **Difficulty To Beat (DTB)** score from 0–100
- Compares overall strength and style of both clubs
- Highlights key players for each side
- Summarizes attacking and defensive tendencies
- Ends with **tactical keys** and a **specific score prediction**

### Report structure
1. **DTB Comparison** - Table with both teams' DTB, Win%, GF/GP, GA/GP
2. **Key Players** - Top 3-5 per team with positions and contributions
3. **Attacking vs Defensive** - Direct comparison
4. **Tactical Keys** - 4-6 specific matchup insights
5. **Score Prediction** - "Predicted score: Home X-Y Away (confidence: low/medium/high)"

Keep under 3000 characters for Discord. Use markdown code blocks for tables.`;

// =======================
// SCOUTING HELPER FUNCTIONS
// =======================

function safeJsonStringify(obj, maxChars) {
  try {
    const s = JSON.stringify(obj);
    if (!maxChars) return s;
    return s.length > maxChars ? s.slice(0, maxChars) : s;
  } catch (e) {
    return String(obj || '').slice(0, maxChars || 8000);
  }
}

function isNonEmpty(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function countMatches(raw) {
  if (!raw) return 0;
  if (Array.isArray(raw)) return raw.length;
  if (Array.isArray(raw.matches)) return raw.matches.length;
  if (typeof raw === 'object') {
    let total = 0;
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) total += v.length;
      else if (v && Array.isArray(v.matches)) total += v.matches.length;
    }
    return total;
  }
  return 0;
}

/**
 * Search clubs across all FC platforms (for scouting)
 */
async function searchClubsAcrossPlatforms(query) {
  const q = (query || '').trim();
  if (!q) return [];

  const FC_PLATFORMS = ['common-gen5', 'common-gen4'];
  const results = [];

  console.log('[Scout] Searching "%s" on platforms: %s', q, FC_PLATFORMS.join(', '));

  await Promise.all(
    FC_PLATFORMS.map(async (fcPlatform) => {
      try {
        const res = await axios.get(
          'https://proclubs.ea.com/api/fc/allTimeLeaderboard/search',
          {
            params: { platform: fcPlatform, clubName: q },
            headers: EA_HEADERS,
            timeout: 10000,
            validateStatus: () => true
          }
        );

        if (res.status !== 200 || !res.data) return;

        let data = res.data;
        if (data && typeof data === 'object' && data['0']) {
          data = data['0'];
        }

        let rows = [];
        if (Array.isArray(data)) {
          rows = data;
        } else if (data && typeof data === 'object') {
          rows = Object.values(data).filter(v => v && typeof v === 'object');
        }

        for (const row of rows) {
          const info = row.clubInfo || row.clubinfo || row.info || row;
          if (!info || typeof info !== 'object') continue;

          const clubId = String(info.clubId ?? info.clubID ?? info.id ?? info.club ?? '');
          if (!clubId) continue;

          results.push({
            fcPlatform,
            clubId,
            name: info.name || info.clubName || info.clubname || q,
            region: info.regionName || info.region || info.countryName || null,
            division: info.division || info.leagueDivision || info.bestDivision || null,
            raw: info
          });
        }
      } catch (err) {
        console.error('[Scout] Search error for platform=%s:', fcPlatform, err.message);
      }
    })
  );

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    const key = `${r.fcPlatform}:${r.clubId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }

  console.log('[Scout] Found %d unique clubs for "%s"', unique.length, q);
  return unique;
}

/**
 * Fetch comprehensive club data from EA for scouting
 */
async function fetchScoutClubData(fcPlatform, clubId, leaderboardSeed = null) {
  const platform = fcPlatform || 'common-gen5';
  const clubIdsParam = String(clubId);
  const baseParams = { platform };
  const clubParams = { ...baseParams, clubIds: clubIdsParam };
  const singleClubParams = { ...baseParams, clubId: clubIdsParam };

  const requests = {
    info: axios.get('https://proclubs.ea.com/api/fc/clubs/info', {
      params: clubParams, headers: EA_HEADERS, timeout: 8000
    }),
    overallStats: axios.get('https://proclubs.ea.com/api/fc/clubs/overallStats', {
      params: clubParams, headers: EA_HEADERS, timeout: 8000
    }),
    playoffAchievements: axios.get('https://proclubs.ea.com/api/fc/club/playoffAchievements', {
      params: singleClubParams, headers: EA_HEADERS, timeout: 8000
    }),
    membersCareer: axios.get('https://proclubs.ea.com/api/fc/members/career/stats', {
      params: singleClubParams, headers: EA_HEADERS, timeout: 8000
    }),
    membersSeason: axios.get('https://proclubs.ea.com/api/fc/members/stats', {
      params: singleClubParams, headers: EA_HEADERS, timeout: 8000
    }),
    leagueMatches: axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
      params: { ...clubParams, matchType: 'leagueMatch', maxResultCount: 100 },
      headers: EA_HEADERS, timeout: 10000
    }),
    playoffMatches: axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
      params: { ...clubParams, matchType: 'playoffMatch', maxResultCount: 100 },
      headers: EA_HEADERS, timeout: 10000
    }),
    friendlyMatches: axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
      params: { ...clubParams, matchType: 'friendlyMatch', maxResultCount: 100 },
      headers: EA_HEADERS, timeout: 10000
    })
  };

  const settled = await Promise.allSettled(Object.values(requests));
  const keys = Object.keys(requests);
  
  function safeData(s) {
    if (s.status === 'fulfilled') return s.value.data;
    console.error('[Scout] Fetch error:', s.reason?.message || s.reason);
    return null;
  }

  const infoRaw = safeData(settled[keys.indexOf('info')]);
  let clubInfo = null;
  if (Array.isArray(infoRaw)) {
    clubInfo = infoRaw[0] || null;
  } else if (infoRaw && typeof infoRaw === 'object') {
    clubInfo = infoRaw[clubIdsParam] || infoRaw;
  }

  return {
    infoPayload: { clubInfo, leaderboardSeed },
    statsPayload: {
      overallStats: safeData(settled[keys.indexOf('overallStats')]),
      playoffAchievements: safeData(settled[keys.indexOf('playoffAchievements')]),
      membersCareer: safeData(settled[keys.indexOf('membersCareer')]),
      membersSeason: safeData(settled[keys.indexOf('membersSeason')])
    },
    matchesPayload: {
      leagueMatches: safeData(settled[keys.indexOf('leagueMatches')]),
      playoffMatches: safeData(settled[keys.indexOf('playoffMatches')]),
      friendlyMatches: safeData(settled[keys.indexOf('friendlyMatches')])
    }
  };
}

/**
 * Compute match record from match history
 */
function computeRecord(matches, clubId) {
  if (!Array.isArray(matches)) return null;

  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;

  for (const m of matches) {
    if (!m || !m.clubs || !m.clubs[clubId]) continue;
    const me = m.clubs[clubId];
    const oppId = Object.keys(m.clubs).find(id => id !== String(clubId));
    const opp = oppId ? m.clubs[oppId] : null;

    const gf = Number(me.goals) || 0;
    const ga = opp ? Number(opp.goals) || 0 : 0;

    goalsFor += gf;
    goalsAgainst += ga;

    if (gf > ga) wins++;
    else if (gf < ga) losses++;
    else draws++;
  }

  return { played: wins + draws + losses, wins, draws, losses, goalsFor, goalsAgainst, goalDiff: goalsFor - goalsAgainst };
}

/**
 * Generate match summary for a club
 */
async function summarizeMatchesForClub(fcPlatform, clubId, displayName, leaderboardSeed) {
  const { matchesPayload } = await fetchScoutClubData(fcPlatform, clubId, leaderboardSeed);

  const empty = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0 };
  const league = computeRecord(matchesPayload.leagueMatches, clubId) || empty;
  const playoffs = computeRecord(matchesPayload.playoffMatches, clubId) || empty;
  const friendlies = computeRecord(matchesPayload.friendlyMatches, clubId) || empty;

  function formatLine(label, rec) {
    if (!rec.played) return `${label}: no matches in last sample.`;
    const { played, wins, draws, losses, goalsFor, goalsAgainst, goalDiff } = rec;
    return `${label}: ${wins}-${draws}-${losses} in ${played} matches, GF ${goalsFor} / GA ${goalsAgainst} (GD ${goalDiff >= 0 ? '+' : ''}${goalDiff})`;
  }

  return [
    `Last matches for **${displayName}** (by mode, up to EA cap):`,
    formatLine('League', league),
    formatLine('Playoffs', playoffs),
    formatLine('Friendlies', friendlies)
  ].join('\n');
}

/**
 * Create scouting report using OpenAI
 */
async function createScoutingReportFromId(fcPlatform, clubId, displayName, leaderboardSeed) {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const { infoPayload, statsPayload, matchesPayload } = await fetchScoutClubData(fcPlatform, clubId, leaderboardSeed);

  const hasStats = Object.values(statsPayload).some(isNonEmpty);
  const hasMatches = Object.values(matchesPayload).some(isNonEmpty);

  if (!hasStats && !hasMatches) {
    const err = new Error('No stats or match history available from EA for this club.');
    err.code = 'insufficient_data';
    throw err;
  }

  const infoStr = safeJsonStringify(infoPayload, 16000);
  const statsStr = safeJsonStringify(statsPayload, 64000);
  const matchesStr = safeJsonStringify(matchesPayload, 64000);

  const userPrompt = `
Analyzing EA FC Pro Clubs team:
- Club display name: ${displayName}
- EA internal club ID: ${clubId}
- Platform: ${fcPlatform}

CLUB_INFO_JSON:
${infoStr}

STATS_JSON:
${statsStr}

MATCH_HISTORY_JSON:
${matchesStr}

Using only this data, write the scouting report with DTB score, CVI rankings, and game plan.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SCOUT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 2000
  });

  const report = response.choices?.[0]?.message?.content || 'No report generated.';
  return { info: infoPayload.clubInfo || null, report };
}

/**
 * Create match preview using OpenAI
 */
async function createMatchPreviewReport(homeClub, awayClub) {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const [homeData, awayData] = await Promise.all([
    fetchScoutClubData(homeClub.fcPlatform, homeClub.clubId, homeClub.raw),
    fetchScoutClubData(awayClub.fcPlatform, awayClub.clubId, awayClub.raw)
  ]);

  const homeHasData = Object.values(homeData.statsPayload).some(isNonEmpty) || Object.values(homeData.matchesPayload).some(isNonEmpty);
  const awayHasData = Object.values(awayData.statsPayload).some(isNonEmpty) || Object.values(awayData.matchesPayload).some(isNonEmpty);

  if (!homeHasData || !awayHasData) {
    const err = new Error('No stats or match history available from EA for one or both clubs.');
    err.code = 'insufficient_data';
    throw err;
  }

  const userPrompt = `
Match preview between two EA FC Pro Clubs teams:

HOME CLUB:
- Name: ${homeClub.name}
- Club ID: ${homeClub.clubId}
- Platform: ${homeClub.fcPlatform}

HOME_INFO: ${safeJsonStringify(homeData.infoPayload, 8000)}
HOME_STATS: ${safeJsonStringify(homeData.statsPayload, 32000)}
HOME_MATCHES: ${safeJsonStringify(homeData.matchesPayload, 32000)}

AWAY CLUB:
- Name: ${awayClub.name}
- Club ID: ${awayClub.clubId}
- Platform: ${awayClub.fcPlatform}

AWAY_INFO: ${safeJsonStringify(awayData.infoPayload, 8000)}
AWAY_STATS: ${safeJsonStringify(awayData.statsPayload, 32000)}
AWAY_MATCHES: ${safeJsonStringify(awayData.matchesPayload, 32000)}

Write the match preview with DTB scores, key players, and score prediction.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: MATCH_PREVIEW_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 2000
  });

  const preview = response.choices?.[0]?.message?.content || 'No preview generated.';
  return {
    homeInfo: homeData.infoPayload.clubInfo || null,
    awayInfo: awayData.infoPayload.clubInfo || null,
    preview
  };
}

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
    .setTitle(`⚽ Club: ${club.name.toUpperCase()}`)
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
  const club = getClubByKey(state.clubs, clubKey);

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
      .setCustomId(`ea_tools_${clubKey}`)
      .setLabel(club?.monitoring_enabled ? '📊 EA Active' : '📊 EA Stats')
      .setStyle(club?.monitoring_enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
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
    .setTitle('📘 SquadIQ Complete Help')
    .setColor(0x5865f2)
    .setDescription(
      '**📋 Spot Management**\n' +
      '`/spotpanel` – Create admin control panel\n' +
      '`/spots` – View spots read-only\n' +
      '`/vcspots` – Link VC to club panel\n' +
      '`/whoisplaying` – See who\'s in your VC club\n' +
      '`/spotblock` – Block/unblock a user\n' +
      '`/autoassign` – Toggle auto-assign\n\n' +
      '**🎮 Preferences**\n' +
      '`/pospanel` – Create preference panel\n' +
      '`/myprefs` – Edit your preferences\n' +
      '`/posboard` – See VC members\' prefs\n' +
      '`/syncprefs` – Sync from Discord roles\n\n' +
      '**⚔️ Drafts & Games**\n' +
      '`/draft` – Start captain draft\n' +
      '`/draftpick` – Pick a player\n' +
      '`/draftresult` – Report result\n\n' +
      '**🔍 Scouting (AI)**\n' +
      '`/scoutclub` – AI scouting report\n' +
      '`/clubmatches` – Match history\n' +
      '`/matchpreview` – AI match preview\n\n' +
      '**👤 Player Stats**\n' +
      '`/profile` – View player profile\n' +
      '`/leaderboard` – Server rankings\n' +
      '`/mystats` – Your quick stats\n\n' +
      '**🎮 EA Integration**\n' +
      '`/setclub` – Link EA Pro Clubs\n' +
      '`/linkea` – Link your EA username\n' +
      '`/syncclub` – Manual stats sync\n\n' +
      '**🏆 Competition**\n' +
      '`/claimwin` – Claim a win\n' +
      '`/pendingwins` – Review claims\n' +
      '`/verifywin` – Approve/reject\n\n' +
      '**📅 Events**\n' +
      '`/event` – Create availability event\n' +
      '`/available` – Mark availability\n\n' +
      '**💡 Quick Tips**\n' +
      '🟢 Click open spot to claim\n' +
      '🔴 Click taken spot for actions\n' +
      '🔔 Waitlist for DM alerts\n' +
      '✨ Auto-assign from VC prefs'
    )
    .setFooter({ text: 'SquadIQ • Complete Squad Management System' });
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
      { name: '🏟️ Club', value: club?.name || 'None', inline: true },
      { name: '📋 Formation', value: formationName, inline: true },
      { name: '🔗 EA Link', value: club?.ea_club_id ? `✅ ${club.ea_club_id}` : '❌ Not linked', inline: true },
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
      '**🔍 Scouting & Analytics**\n' +
      '`/scoutclub` – AI scouting report\n' +
      '`/matchpreview` – AI match preview\n' +
      '`/clubmatches` – Recent match history\n\n' +
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
      .setCustomId('squadiq_draftpanel')
      .setLabel('Draft Panel')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('squadiq_eventpanel')
      .setLabel('Events')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('squadiq_teampanel')
      .setLabel('Teams')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Primary)
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
      .setCustomId('squadiq_syncstats')
      .setLabel('Sync Stats')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('squadiq_autolink')
      .setLabel('Auto-Link EA')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('squadiq_buildsupload')
      .setLabel('Builds')
      .setEmoji('🏗️')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(row2);
  
  // Row 3: Scouting & Analytics
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('squadiq_scout')
      .setLabel('Scout Club')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('squadiq_pendingwins')
      .setLabel('Win Claims')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_leaderboard')
      .setLabel('Leaderboard')
      .setEmoji('📈')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_profile')
      .setLabel('Profile')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(row3);
  
  // Row 4: Debug & Links
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('squadiq_debug')
      .setLabel('Debug')
      .setEmoji('🔧')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('squadiq_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel('Web Dashboard')
      .setEmoji('🌐')
      .setStyle(ButtonStyle.Link)
      .setURL('https://squadiq.lovable.app')
  );
  rows.push(row4);
  
  return rows;
}

// =======================
// SCOUTING PANEL BUILDER
// =======================

async function buildScoutingPanelEmbed(guildId) {
  // Fetch some live stats for the panel
  let playerCount = 0;
  let recentMatchCount = 0;
  let scoutingListCount = 0;
  
  try {
    const { count: pCount } = await supabase
      .from('player_summary')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId);
    playerCount = pCount || 0;
    
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: mCount } = await supabase
      .from('club_matches')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .gte('created_at', weekAgo);
    recentMatchCount = mCount || 0;
    
    const { count: sCount } = await supabase
      .from('scouting_lists')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId);
    scoutingListCount = sCount || 0;
  } catch (err) {
    console.error('[ScoutPanel] Error fetching stats:', err);
  }
  
  return new EmbedBuilder()
    .setTitle('🔍 SCOUTIQ - Intelligence Hub')
    .setColor(0x5865f2)
    .setDescription(
      '**Your command center for player intelligence and match analysis.**\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '**📊 SCOUTING**\n' +
      '• **Scout Club** - AI analysis of any Pro Clubs team\n' +
      '• **Scout Player** - Deep dive on any player\n' +
      '• **View Profile** - Quick stats lookup\n\n' +
      '**⚔️ MATCH ANALYSIS**\n' +
      '• **Match Preview** - AI head-to-head comparison\n' +
      '• **Recent Results** - Last matches with AI summary\n' +
      '• **Club Matches** - Full match history\n\n' +
      '**📋 LISTS & RANKINGS**\n' +
      '• **Scouting Lists** - Manage player watchlists\n' +
      '• **Leaderboard** - Server rankings\n' +
      '• **Form Check** - Hot and cold streaks\n\n' +
      '**🏆 PERFORMANCE**\n' +
      '• **My Stats** - Your personal dashboard\n' +
      '• **Achievements** - Badges and awards'
    )
    .addFields(
      { name: '👥 Players Tracked', value: `${playerCount}`, inline: true },
      { name: '📈 Matches (7d)', value: `${recentMatchCount}`, inline: true },
      { name: '📋 Scout Lists', value: `${scoutingListCount}`, inline: true }
    )
    .setFooter({ text: 'AI-powered analysis • All features button-accessible • No slash commands needed' })
    .setTimestamp();
}

function buildScoutingPanelComponents() {
  const rows = [];
  
  // Row 1: Main scouting actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('scoutpanel_scout')
      .setLabel('Scout Club')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_scoutplayer')
      .setLabel('Scout Player')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_profile')
      .setLabel('View Profile')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_matches')
      .setLabel('Club Matches')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(row1);
  
  // Row 2: Match analysis
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('scoutpanel_preview')
      .setLabel('Match Preview')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('scoutpanel_recent')
      .setLabel('Recent Results')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_winprob')
      .setLabel('Win Probability')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_form')
      .setLabel('Form Check')
      .setEmoji('🔥')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(row2);
  
  // Row 3: Lists & rankings
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('scoutpanel_lists')
      .setLabel('Scout Lists')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_leaderboard')
      .setLabel('Leaderboard')
      .setEmoji('📈')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_achievements')
      .setLabel('Achievements')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_mystats')
      .setLabel('My Stats')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(row3);
  
  // Row 4: Utility buttons
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('scoutpanel_compare')
      .setLabel('Compare Players')
      .setEmoji('⚖️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('scoutpanel_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel('Web Dashboard')
      .setEmoji('🌐')
      .setStyle(ButtonStyle.Link)
      .setURL('https://squadiq.lovable.app/scouting')
  );
  rows.push(row4);
  
  return rows;
}

// =======================
// EA SYNC PANEL BUILDER
// =======================

function buildEaPanelEmbed(guildId, state) {
  const currentClub = state?.clubs?.find(c => c.key === state.currentClubKey);
  const isLinked = !!currentClub?.ea_club_id;
  const isMonitoring = !!currentClub?.monitoring_enabled;
  
  return new EmbedBuilder()
    .setTitle('🎮 EA FC Integration Panel')
    .setColor(isLinked ? (isMonitoring ? 0x00ff00 : 0xffcc00) : 0xff6600)
    .setDescription(
      '**Manage your EA FC Pro Clubs integration**\n\n' +
      `**Current Club:** ${currentClub?.name || 'None selected'}\n` +
      `**EA Club ID:** ${currentClub?.ea_club_id || 'Not linked'}\n` +
      `**Platform:** ${currentClub?.ea_platform || 'Not set'}\n` +
      `**Monitoring:** ${isMonitoring ? '🟢 Active' : '🔴 Disabled'}\n\n` +
      '**🔗 Link Club** - Connect your club to EA FC Pro Clubs\n' +
      '**📥 Sync Matches** - Manually sync recent match history\n' +
      '**📡 Toggle Monitoring** - Enable/disable auto-sync\n' +
      '**🎮 Link EA Account** - Connect your personal EA account\n' +
      '**📊 View Status** - See detailed integration status'
    )
    .setFooter({ text: 'Auto-syncs every 2 minutes when monitoring is enabled' })
    .setTimestamp();
}

function buildEaPanelComponents(state) {
  const rows = [];
  const currentClub = state?.clubs?.find(c => c.key === state.currentClubKey);
  const isLinked = !!currentClub?.ea_club_id;
  const isMonitoring = !!currentClub?.monitoring_enabled;
  
  // Row 1: Main EA actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('eapanel_link')
      .setLabel('Link Club')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('eapanel_sync')
      .setLabel('Sync Matches')
      .setEmoji('📥')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isLinked),
    new ButtonBuilder()
      .setCustomId('eapanel_toggle')
      .setLabel(isMonitoring ? 'Disable Monitoring' : 'Enable Monitoring')
      .setEmoji(isMonitoring ? '🔴' : '🟢')
      .setStyle(isMonitoring ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(!isLinked)
  );
  rows.push(row1);
  
  // Row 2: Additional actions
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('eapanel_linkea')
      .setLabel('Link My EA Account')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eapanel_status')
      .setLabel('View Status')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eapanel_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Web Dashboard')
      .setEmoji('🌐')
      .setStyle(ButtonStyle.Link)
      .setURL('https://squadiq.lovable.app/settings')
  );
  rows.push(row2);
  
  return rows;
}

// =======================
// RATINGS PANEL BUILDER
// =======================

function buildRatingsPanelEmbed(guildId) {
  return new EmbedBuilder()
    .setTitle('📊 Player Ratings Panel')
    .setColor(0x5865f2)
    .setDescription(
      '**Access player ratings and statistics**\n\n' +
      '**📈 Leaderboard** - View top players by various metrics\n' +
      '**👤 View Profile** - Check any player\'s detailed stats\n' +
      '**🎯 Scout Player** - Generate AI scouting report\n' +
      '**📊 My Stats** - Quick view of your own performance\n' +
      '**🔥 Form Check** - See players\' recent form\n' +
      '**🏆 Achievements** - View player achievements and badges'
    )
    .setFooter({ text: 'Ratings updated after each game • AI-powered insights' })
    .setTimestamp();
}

function buildRatingsPanelComponents() {
  const rows = [];
  
  // Row 1: Main rating actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ratingspanel_leaderboard')
      .setLabel('Leaderboard')
      .setEmoji('📈')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ratingspanel_profile')
      .setLabel('View Profile')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ratingspanel_scoutplayer')
      .setLabel('Scout Player')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ratingspanel_mystats')
      .setLabel('My Stats')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary)
  );
  rows.push(row1);
  
  // Row 2: Additional actions
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ratingspanel_form')
      .setLabel('Form Check')
      .setEmoji('🔥')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ratingspanel_achievements')
      .setLabel('Achievements')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ratingspanel_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel('Web Dashboard')
      .setEmoji('🌐')
      .setStyle(ButtonStyle.Link)
      .setURL('https://squadiq.lovable.app/leaderboard')
  );
  rows.push(row2);
  
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
// DRAFT VC MOVE HELPER
// =======================

/**
 * Move players to their respective team voice channels after draft completion
 * @param {Guild} guild - Discord guild object
 * @param {string[]} teamAPlayerIds - Player IDs for Team A
 * @param {string[]} teamBPlayerIds - Player IDs for Team B  
 * @param {string} teamAVcId - Voice channel ID for Team A
 * @param {string} teamBVcId - Voice channel ID for Team B
 * @returns {Object} - { moved: number, failed: number, errors: string[] }
 */
async function movePlayersToTeamVCs(guild, teamAPlayerIds, teamBPlayerIds, teamAVcId, teamBVcId) {
  const result = { moved: 0, failed: 0, errors: [] };
  
  if (!guild || !teamAVcId || !teamBVcId) {
    return result;
  }
  
  try {
    // Fetch the target voice channels
    const teamAVc = await guild.channels.fetch(teamAVcId).catch(() => null);
    const teamBVc = await guild.channels.fetch(teamBVcId).catch(() => null);
    
    if (!teamAVc || !teamBVc) {
      result.errors.push('Could not find one or both team voice channels');
      return result;
    }
    
    if (teamAVc.type !== ChannelType.GuildVoice || teamBVc.type !== ChannelType.GuildVoice) {
      result.errors.push('Team channels must be voice channels');
      return result;
    }
    
    // Move Team A players
    for (const playerId of teamAPlayerIds) {
      try {
        const member = await guild.members.fetch(playerId).catch(() => null);
        if (member?.voice?.channel) {
          await member.voice.setChannel(teamAVc);
          result.moved++;
          console.log(`[Draft VC] Moved ${playerId} to Team A VC`);
        }
      } catch (err) {
        result.failed++;
        console.error(`[Draft VC] Failed to move ${playerId} to Team A:`, err.message);
      }
    }
    
    // Move Team B players
    for (const playerId of teamBPlayerIds) {
      try {
        const member = await guild.members.fetch(playerId).catch(() => null);
        if (member?.voice?.channel) {
          await member.voice.setChannel(teamBVc);
          result.moved++;
          console.log(`[Draft VC] Moved ${playerId} to Team B VC`);
        }
      } catch (err) {
        result.failed++;
        console.error(`[Draft VC] Failed to move ${playerId} to Team B:`, err.message);
      }
    }
    
    console.log(`[Draft VC] Move complete: ${result.moved} moved, ${result.failed} failed`);
    
  } catch (err) {
    result.errors.push(err.message);
    console.error('[Draft VC] Error moving players:', err);
  }
  
  return result;
}

// Pending captain reroll requests (guildId -> { draftId, initiator, originalCaptainA, originalCaptainB, expires })
const pendingCaptainRerolls = new Map();

// =======================
// READY & COMMAND REG
// =======================

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ SquadIQ Spots logged in as ${c.user.tag}`);

  try {
    // One-time cleanup: Remove all guild-specific commands to fix duplicates
    console.log(`🧹 Clearing guild-specific commands to fix duplicates...`);
    for (const [guildId, guild] of c.guilds.cache) {
      try {
        await guild.commands.set([]);
        console.log(`  ✓ Cleared commands for guild: ${guild.name}`);
      } catch (err) {
        console.error(`  ✗ Failed to clear commands for ${guild.name}:`, err.message);
      }
    }
    console.log(`🧹 Guild command cleanup complete`);
    
    // Register commands globally only (not per-guild to avoid duplicates)
    await c.application.commands.set(COMMANDS);
    console.log(`✅ Commands registered globally for ${c.guilds.cache.size} guilds`);
    
    // Sync guild names to database
    await syncGuildNames(c);
    
    // Resume EA FC Pro Clubs monitoring for all linked clubs
    resumeEaMonitoring();
    
    // Start background polling for pending feedback DMs (created by local sync script)
    startFeedbackDMPolling(c);
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

// Sync guild names to guild_settings table
async function syncGuildNames(discordClient) {
  try {
    console.log(`[Guild] Syncing guild names for ${discordClient.guilds.cache.size} guilds...`);
    
    for (const [guildId, guild] of discordClient.guilds.cache) {
      const { error } = await supabase
        .from('guild_settings')
        .update({ name: guild.name })
        .eq('guild_id', guildId);
      
      if (!error) {
        console.log(`[Guild] Updated name: ${guildId} -> ${guild.name}`);
      }
    }
    
    console.log(`[Guild] Guild names synced successfully`);
  } catch (err) {
    console.error(`[Guild] Error syncing guild names:`, err);
  }
}

client.on(Events.GuildCreate, async (guild) => {
  // Commands are registered globally, no need to register per-guild (causes duplicates)
  console.log(`✅ Joined new guild: ${guild.name} (${guild.id})`);
  // Sync guild name to database
  try {
    await supabase
      .from('guild_settings')
      .upsert({ guild_id: guild.id, name: guild.name }, { onConflict: 'guild_id' });
    console.log(`[Guild] Synced new guild: ${guild.name}`);
  } catch (err) {
    console.error('⚠️ Failed to sync new guild', guild.id, err);
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

        // Get optional team VCs for auto-move after draft
        const teamAVc = interaction.options.getChannel('team_a_vc');
        const teamBVc = interaction.options.getChannel('team_b_vc');
        const minGames = interaction.options.getInteger('min_games') || 5;

        // Validate VCs if provided
        if (teamAVc && teamAVc.type !== ChannelType.GuildVoice) {
          return interaction.editReply({ content: '❌ Team A VC must be a voice channel.' });
        }
        if (teamBVc && teamBVc.type !== ChannelType.GuildVoice) {
          return interaction.editReply({ content: '❌ Team B VC must be a voice channel.' });
        }

        const { error, data } = await callEdgeFunction('draft-start', {
          guild_id: guildId,
          voice_channel_id: voiceChannel.id,
          player_discord_ids: playerIds,
          team_a_vc_id: teamAVc?.id || null,
          team_b_vc_id: teamBVc?.id || null,
          min_games_for_captain: minGames
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to start draft: ${error}` });
        }

        activeDrafts.set(guildId, data);

        const embed = buildDraftEmbed(data, interaction.guild);
        
        // Add captain selection info
        if (data.captain_selection_info) {
          const info = data.captain_selection_info;
          let selectionNote = '';
          if (info.used_fallback) {
            selectionNote = `⚠️ Not enough experienced players (${info.eligible_captains_count}/${info.min_games_required} games min). Captain selection weighted by experience.`;
          } else {
            selectionNote = `✅ ${info.eligible_captains_count} players eligible (${info.min_games_required}+ games). Captains selected from experienced pool.`;
          }
          embed.addFields({ name: '👑 Captain Selection', value: selectionNote });
        }

        // Add VC info if configured
        if (teamAVc && teamBVc) {
          embed.addFields({
            name: '🎧 Team Voice Channels',
            value: `Team A → <#${teamAVc.id}>\nTeam B → <#${teamBVc.id}>\n*Players will be moved after draft completes.*`
          });
        }

        // Add reroll button
        const rerollRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`draft_reroll_${data.draft_id}`)
            .setLabel('🔄 Reroll Captains')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({ embeds: [embed], components: [rerollRow] });
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
          
          // Move players to team VCs if configured
          if (data.team_a_vc_id && data.team_b_vc_id) {
            const vcMoveResults = await movePlayersToTeamVCs(
              interaction.guild,
              data.team_a,
              data.team_b,
              data.team_a_vc_id,
              data.team_b_vc_id
            );
            
            if (vcMoveResults.moved > 0) {
              completeEmbed.addFields({
                name: '🎧 Voice Channels',
                value: `Moved ${vcMoveResults.moved} players to team VCs\n` +
                  `Team A → <#${data.team_a_vc_id}>\n` +
                  `Team B → <#${data.team_b_vc_id}>`
              });
            }
          }
          
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

      // Reroll captains command
      if (cmd === 'draftreroll') {
        const draftData = activeDrafts.get(guildId);
        if (!draftData) {
          return interaction.reply({
            content: '❌ No active draft to reroll captains for.',
            flags: 64
          });
        }

        // Only allow reroll before any picks are made (pick_number should be 1 or 0)
        if (draftData.pick_number > 1) {
          return interaction.reply({
            content: '❌ Cannot reroll captains after picking has begun.',
            flags: 64
          });
        }

        const isCaptain = interaction.user.id === draftData.captain_a?.discord_user_id || 
                          interaction.user.id === draftData.captain_b?.discord_user_id;
        
        if (!isCaptain && !isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only captains or managers can request a captain reroll.',
            flags: 64
          });
        }

        // Check for existing reroll request
        const existingRequest = pendingCaptainRerolls.get(guildId);
        if (existingRequest && existingRequest.draftId === draftData.draft_id) {
          // Second captain agreeing - execute reroll
          if (existingRequest.initiator !== interaction.user.id) {
            await interaction.deferReply();
            
            // Reroll captains by calling draft-start again with same players
            const allPlayers = [
              ...draftData.team_a_player_ids || [draftData.captain_a.discord_user_id],
              ...draftData.team_b_player_ids || [draftData.captain_b.discord_user_id],
              ...(draftData.available_players || []).map(p => p.discord_user_id || p)
            ];
            
            // Cancel old draft
            await supabase
              .from('drafts')
              .update({ status: 'cancelled', completed_at: new Date().toISOString() })
              .eq('id', draftData.draft_id);
            
            // Start new draft with same players
            const { error, data: newDraft } = await callEdgeFunction('draft-start', {
              guild_id: guildId,
              voice_channel_id: draftData.voice_channel_id,
              player_discord_ids: allPlayers,
              team_a_vc_id: draftData.team_a_vc_id,
              team_b_vc_id: draftData.team_b_vc_id
            });

            pendingCaptainRerolls.delete(guildId);

            if (error) {
              return interaction.editReply({ content: `❌ Failed to reroll captains: ${error}` });
            }

            activeDrafts.set(guildId, newDraft);
            
            const embed = buildDraftEmbed(newDraft, interaction.guild);
            embed.setDescription('🔄 **Captains Rerolled!**\n\n' + (embed.data.description || ''));
            
            return interaction.editReply({ embeds: [embed] });
          } else {
            return interaction.reply({
              content: `⏳ You already requested a reroll. Waiting for the other captain <@${
                existingRequest.initiator === draftData.captain_a.discord_user_id 
                  ? draftData.captain_b.discord_user_id 
                  : draftData.captain_a.discord_user_id
              }> to agree.`,
              flags: 64
            });
          }
        }

        // First captain requesting - create pending request
        pendingCaptainRerolls.set(guildId, {
          draftId: draftData.draft_id,
          initiator: interaction.user.id,
          originalCaptainA: draftData.captain_a.discord_user_id,
          originalCaptainB: draftData.captain_b.discord_user_id,
          expires: Date.now() + 60000 // 1 minute expiry
        });

        const otherCaptain = interaction.user.id === draftData.captain_a.discord_user_id 
          ? draftData.captain_b.discord_user_id 
          : draftData.captain_a.discord_user_id;

        const rerollEmbed = new EmbedBuilder()
          .setTitle('🔄 Captain Reroll Requested')
          .setColor(0xffcc00)
          .setDescription(
            `<@${interaction.user.id}> has requested to reroll captains.\n\n` +
            `<@${otherCaptain}> - use \`/draftreroll\` or click the button to agree.`
          )
          .setFooter({ text: 'Request expires in 60 seconds' });

        const rerollButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`draft_reroll_confirm_${draftData.draft_id}`)
            .setLabel('✅ Agree to Reroll')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`draft_reroll_cancel_${draftData.draft_id}`)
            .setLabel('❌ Keep Current Captains')
            .setStyle(ButtonStyle.Danger)
        );

        // Auto-expire after 60 seconds
        setTimeout(() => {
          const request = pendingCaptainRerolls.get(guildId);
          if (request && request.draftId === draftData.draft_id) {
            pendingCaptainRerolls.delete(guildId);
          }
        }, 60000);

        return interaction.reply({ embeds: [rerollEmbed], components: [rerollButtons] });
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
      // SCOUTING COMMANDS (ScoutBot functionality)
      // =======================

      if (cmd === 'scoutclub') {
        if (!openai) {
          return interaction.reply({
            content: '❌ Scouting reports require OpenAI configuration. Contact your server admin.',
            flags: 64
          });
        }

        const clubName = interaction.options.getString('name');
        await interaction.deferReply();

        try {
          const matches = await searchClubsAcrossPlatforms(clubName);

          if (!matches.length) {
            return interaction.editReply({
              content: 'I could not find any clubs matching that name on EA FC servers. Try a different spelling or the exact in-game name.'
            });
          }

          // If only one result, go straight to the report
          if (matches.length === 1) {
            const chosen = matches[0];
            const labelPlatform = FC_PLATFORM_LABELS[chosen.fcPlatform] || chosen.fcPlatform;

            await interaction.editReply({
              content: `Found one match: **${chosen.name}** on **${labelPlatform}**. Generating scouting report...`
            });

            try {
              const { info, report } = await createScoutingReportFromId(
                chosen.fcPlatform,
                chosen.clubId,
                chosen.name,
                chosen.raw
              );

              const titleName = info?.name || chosen.name;
              const trimmed = report.length > 4000 ? report.slice(0, 4000) + '...' : report;

              const embed = new EmbedBuilder()
                .setTitle(`🔍 Scouting Report: ${titleName}`)
                .setColor(0x5865f2)
                .setDescription(trimmed)
                .setFooter({ text: `Platform: ${labelPlatform} • Club ID: ${chosen.clubId}` });

              return interaction.editReply({ content: null, embeds: [embed] });
            } catch (err) {
              console.error('❌ Error creating scouting report:', err);
              if (err.code === 'insufficient_data') {
                return interaction.editReply({
                  content: 'I found the club, but EA did not return enough stats or match history to generate a meaningful scouting report.'
                });
              }
              return interaction.editReply({
                content: 'I found the club, but failed to generate a scouting report. Please try again later.'
              });
            }
          }

          // Multiple results: let user choose via dropdown
          const top = matches.slice(0, 5);
          pendingScoutChoices.set(interaction.user.id, { query: clubName, results: top });

          const options = top.map((club, index) => {
            const labelPlatform = FC_PLATFORM_LABELS[club.fcPlatform] || club.fcPlatform;
            return {
              label: `${club.name} (${labelPlatform})`.slice(0, 100),
              description: `Club ID: ${club.clubId}`.slice(0, 100),
              value: String(index)
            };
          });

          const select = new StringSelectMenuBuilder()
            .setCustomId('scoutclub_pick')
            .setPlaceholder('Select the correct club')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          const lines = top.map((club, index) => {
            const labelPlatform = FC_PLATFORM_LABELS[club.fcPlatform] || club.fcPlatform;
            return `**${index + 1}.** ${club.name} (${labelPlatform})`;
          });

          const embed = new EmbedBuilder()
            .setTitle('🔍 Multiple clubs found')
            .setColor(0x5865f2)
            .setDescription(
              lines.join('\n') + '\n\nUse the dropdown below to pick the club you want to scout.'
            );

          return interaction.editReply({ content: null, embeds: [embed], components: [row] });
        } catch (err) {
          console.error('❌ Error in /scoutclub:', err);
          return interaction.editReply({ content: `❌ Search failed: ${err.message}` });
        }
      }

      if (cmd === 'clubmatches') {
        const clubName = interaction.options.getString('name');
        await interaction.deferReply();

        try {
          const matches = await searchClubsAcrossPlatforms(clubName);

          if (!matches.length) {
            return interaction.editReply({
              content: 'I could not find any clubs matching that name on EA FC servers. Try a different spelling or the exact in-game name.'
            });
          }

          // If only one result, go straight to the summary
          if (matches.length === 1) {
            const chosen = matches[0];
            const labelPlatform = FC_PLATFORM_LABELS[chosen.fcPlatform] || chosen.fcPlatform;

            await interaction.editReply({
              content: `Found one match: **${chosen.name}** on **${labelPlatform}**. Fetching match history...`
            });

            try {
              const summaryText = await summarizeMatchesForClub(
                chosen.fcPlatform,
                chosen.clubId,
                chosen.name,
                chosen.raw
              );

              return interaction.editReply({ content: summaryText });
            } catch (err) {
              console.error('❌ Error summarizing matches:', err);
              return interaction.editReply({
                content: 'I found the club, but failed to fetch match history from EA.'
              });
            }
          }

          // Multiple results: let user choose via dropdown
          const top = matches.slice(0, 5);
          pendingMatchesChoices.set(interaction.user.id, { query: clubName, results: top });

          const options = top.map((club, index) => {
            const labelPlatform = FC_PLATFORM_LABELS[club.fcPlatform] || club.fcPlatform;
            return {
              label: `${club.name} (${labelPlatform})`.slice(0, 100),
              description: `Club ID: ${club.clubId}`.slice(0, 100),
              value: String(index)
            };
          });

          const select = new StringSelectMenuBuilder()
            .setCustomId('clubmatches_pick')
            .setPlaceholder('Select the correct club')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          const embed = new EmbedBuilder()
            .setTitle('📊 Multiple clubs found')
            .setColor(0x5865f2)
            .setDescription('Use the dropdown below to pick the club whose recent matches you want to see.');

          return interaction.editReply({ content: null, embeds: [embed], components: [row] });
        } catch (err) {
          console.error('❌ Error in /clubmatches:', err);
          return interaction.editReply({ content: `❌ Search failed: ${err.message}` });
        }
      }

      if (cmd === 'matchpreview') {
        if (!openai) {
          return interaction.reply({
            content: '❌ Match previews require OpenAI configuration. Contact your server admin.',
            flags: 64
          });
        }

        const homeName = interaction.options.getString('home');
        const awayName = interaction.options.getString('away');

        await interaction.deferReply();

        try {
          const [homeCandidates, awayCandidates] = await Promise.all([
            searchClubsAcrossPlatforms(homeName),
            searchClubsAcrossPlatforms(awayName)
          ]);

          if (!homeCandidates.length && !awayCandidates.length) {
            return interaction.editReply({
              content: 'I could not find any clubs matching either name on EA FC servers. Try more exact in-game names for both.'
            });
          }

          if (!homeCandidates.length) {
            return interaction.editReply({
              content: `I could not find any clubs matching the home club name **${homeName}** on EA FC servers.`
            });
          }

          if (!awayCandidates.length) {
            return interaction.editReply({
              content: `I could not find any clubs matching the away club name **${awayName}** on EA FC servers.`
            });
          }

          // If exactly one for each, go straight to the preview
          if (homeCandidates.length === 1 && awayCandidates.length === 1) {
            const home = homeCandidates[0];
            const away = awayCandidates[0];

            const homeLabel = FC_PLATFORM_LABELS[home.fcPlatform] || home.fcPlatform;
            const awayLabel = FC_PLATFORM_LABELS[away.fcPlatform] || away.fcPlatform;

            await interaction.editReply({
              content: `Found:\n- Home: **${home.name}** (${homeLabel})\n- Away: **${away.name}** (${awayLabel})\n\nGenerating match preview...`
            });

            try {
              const { homeInfo, awayInfo, preview } = await createMatchPreviewReport(home, away);

              const homeTitle = homeInfo?.name || home.name;
              const awayTitle = awayInfo?.name || away.name;
              const trimmed = preview.length > 4000 ? preview.slice(0, 4000) + '...' : preview;

              const embed = new EmbedBuilder()
                .setTitle(`⚔️ Match Preview: ${homeTitle} vs ${awayTitle}`)
                .setColor(0x5865f2)
                .setDescription(trimmed);

              return interaction.editReply({ content: null, embeds: [embed] });
            } catch (err) {
              console.error('❌ Error creating match preview:', err);
              if (err.code === 'insufficient_data') {
                return interaction.editReply({
                  content: 'I found both clubs, but EA did not return enough stats or match history to generate a meaningful match preview.'
                });
              }
              return interaction.editReply({
                content: 'I found both clubs, but failed to generate a match preview. Please try again later.'
              });
            }
          }

          // Multiple results for one or both: let user choose via dropdown(s)
          const homeTop = homeCandidates.slice(0, 5);
          const awayTop = awayCandidates.slice(0, 5);

          pendingPreviewChoices.set(interaction.user.id, {
            homeQuery: homeName,
            awayQuery: awayName,
            homeResults: homeTop,
            awayResults: awayTop,
            homeIndex: homeTop.length === 1 ? 0 : null,
            awayIndex: awayTop.length === 1 ? 0 : null
          });

          const components = [];

          // Home side
          if (homeTop.length > 1) {
            const homeOptions = homeTop.map((club, index) => {
              const labelPlatform = FC_PLATFORM_LABELS[club.fcPlatform] || club.fcPlatform;
              return {
                label: `${club.name} (${labelPlatform})`.slice(0, 100),
                description: 'Select as home club',
                value: String(index)
              };
            });

            const homeSelect = new StringSelectMenuBuilder()
              .setCustomId('matchpreview_home_pick')
              .setPlaceholder('Select the home club')
              .addOptions(homeOptions);

            components.push(new ActionRowBuilder().addComponents(homeSelect));
          }

          // Away side
          if (awayTop.length > 1) {
            const awayOptions = awayTop.map((club, index) => {
              const labelPlatform = FC_PLATFORM_LABELS[club.fcPlatform] || club.fcPlatform;
              return {
                label: `${club.name} (${labelPlatform})`.slice(0, 100),
                description: 'Select as away club',
                value: String(index)
              };
            });

            const awaySelect = new StringSelectMenuBuilder()
              .setCustomId('matchpreview_away_pick')
              .setPlaceholder('Select the away club')
              .addOptions(awayOptions);

            components.push(new ActionRowBuilder().addComponents(awaySelect));
          }

          const embed = new EmbedBuilder()
            .setTitle('⚔️ Match Preview: Select clubs')
            .setColor(0x5865f2)
            .setDescription(
              `**Home:** ${homeTop.length === 1 ? `Auto-selected: ${homeTop[0].name}` : `${homeTop.length} candidates found`}\n` +
              `**Away:** ${awayTop.length === 1 ? `Auto-selected: ${awayTop[0].name}` : `${awayTop.length} candidates found`}\n\n` +
              'Use the dropdown(s) below to pick the correct clubs.'
            );

          return interaction.editReply({ content: null, embeds: [embed], components });
        } catch (err) {
          console.error('❌ Error in /matchpreview:', err);
          return interaction.editReply({ content: `❌ Search failed: ${err.message}` });
        }
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

        await interaction.deferReply({ flags: 64 });

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

      // =======================
      // SCOUTING PANEL COMMAND
      // =======================

      if (cmd === 'scoutpanel') {
        const embed = await buildScoutingPanelEmbed(guildId);
        const components = buildScoutingPanelComponents();

        await interaction.reply({
          embeds: [embed],
          components
        });

        // Store the panel location for reference
        const msg = await interaction.fetchReply();
        state.scoutPanelChannelId = interaction.channelId;
        state.scoutPanelMessageId = msg.id;
        await saveGuildSettings(guildId, state);

        return;
      }

      // =======================
      // EA SYNC PANEL COMMAND
      // =======================

      if (cmd === 'eapanel') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only admins and managers can create the EA panel.',
            flags: 64
          });
        }

        const embed = buildEaPanelEmbed(guildId, state);
        const components = buildEaPanelComponents(state);

        await interaction.reply({
          embeds: [embed],
          components
        });

        // Store the panel location for reference
        const msg = await interaction.fetchReply();
        state.eaPanelChannelId = interaction.channelId;
        state.eaPanelMessageId = msg.id;
        await saveGuildSettings(guildId, state);

        return;
      }

      // =======================
      // RATINGS PANEL COMMAND
      // =======================

      if (cmd === 'ratingspanel') {
        const embed = buildRatingsPanelEmbed(guildId);
        const components = buildRatingsPanelComponents();

        await interaction.reply({
          embeds: [embed],
          components
        });

        // Store the panel location for reference
        const msg = await interaction.fetchReply();
        state.ratingsPanelChannelId = interaction.channelId;
        state.ratingsPanelMessageId = msg.id;
        await saveGuildSettings(guildId, state);

        return;
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

      // Draft Panel - shows full draft control interface
      if (id === 'squadiq_draftpanel') {
        await interaction.deferReply({ flags: 64 });
        
        // Check for active draft
        const { data: activeDraft } = await supabase
          .from('drafts')
          .select('*')
          .eq('guild_id', guildId)
          .in('status', ['pending', 'picking'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (activeDraft) {
          // Show active draft embed with controls
          const embed = buildDraftEmbed(activeDraft, interaction.guild);
          
          const draftButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`draft_report_${activeDraft.id}`)
              .setLabel('Report Result')
              .setEmoji('📝')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`draft_cancel_${activeDraft.id}`)
              .setLabel('Cancel Draft')
              .setEmoji('❌')
              .setStyle(ButtonStyle.Danger)
          );
          
          return interaction.editReply({ embeds: [embed], components: [draftButtons] });
        }
        
        // No active draft - show start draft panel
        const voiceChannel = interaction.member?.voice?.channel;
        const vcMembers = voiceChannel ? 
          [...voiceChannel.members.values()].filter(m => !m.user.bot) : [];
        
        const startEmbed = new EmbedBuilder()
          .setTitle('⚔️ Draft Control Panel')
          .setColor(0xff6b35)
          .setDescription(
            '**No active draft**\n\n' +
            'To start a draft:\n' +
            '1️⃣ Join a voice channel with 4+ players\n' +
            '2️⃣ Click **Start Draft** below or use `/draft`\n\n' +
            `**Your VC:** ${voiceChannel ? `${voiceChannel.name} (${vcMembers.length} players)` : 'Not in a voice channel'}`
          );
        
        // Add recent drafts info
        const { data: recentDrafts } = await supabase
          .from('drafts')
          .select('id, created_at, status, captain_a_discord_id, captain_b_discord_id')
          .eq('guild_id', guildId)
          .order('created_at', { ascending: false })
          .limit(3);
        
        if (recentDrafts && recentDrafts.length > 0) {
          const recentText = recentDrafts.map(d => {
            const date = new Date(d.created_at).toLocaleDateString();
            return `• ${date} - ${d.status} (Captains: <@${d.captain_a_discord_id}> vs <@${d.captain_b_discord_id}>)`;
          }).join('\n');
          startEmbed.addFields({ name: '📜 Recent Drafts', value: recentText });
        }
        
        // Add pending feedback count
        const { count: pendingFeedback } = await supabase
          .from('dm_feedback_requests')
          .select('*', { count: 'exact', head: true })
          .eq('guild_id', guildId)
          .eq('status', 'pending');
        
        if (pendingFeedback > 0) {
          startEmbed.addFields({ 
            name: '📬 Pending Feedback', 
            value: `${pendingFeedback} players have pending peer evaluations`,
            inline: true 
          });
        }
        
        const startButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('squadiq_draft')
            .setLabel('Start Draft')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!voiceChannel || vcMembers.length < 4),
          new ButtonBuilder()
            .setCustomId('squadiq_send_feedback_dms')
            .setLabel('Send Feedback DMs')
            .setEmoji('📬')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('squadiq_link_ea_modal')
            .setLabel('Link EA Account')
            .setEmoji('🎮')
            .setStyle(ButtonStyle.Secondary)
        );
        
        return interaction.editReply({ embeds: [startEmbed], components: [startButtons] });
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
            { name: '🏟️ Club', value: currentClub?.name || 'None', inline: true },
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

      if (id === 'squadiq_syncstats') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          // Call the sync-ea-stats edge function for a full sync
          const response = await fetch(`${supabaseUrl}/functions/v1/sync-ea-stats`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              guild_id: guildId,
              sync_type: 'full'
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[squadiq_syncstats] Sync failed:', response.status, errorText);
            return interaction.editReply({ 
              content: `❌ Stats sync failed: ${response.status} - Check if EA API is accessible from local sync script.` 
            });
          }

          const result = await response.json();
          
          return interaction.editReply({
            content: `📊 **Stats Sync Complete**\n\n` +
              `• Matches synced: **${result.total_matches || 0}**\n` +
              `• Members updated: **${result.total_members || 0}**\n` +
              `• Clubs processed: **${result.total_clubs || 0}**\n\n` +
              `⚠️ Note: Full EA sync runs via local script every 10 min. This triggers an immediate refresh.`
          });
        } catch (error) {
          console.error('[squadiq_syncstats] Error:', error);
          return interaction.editReply({ 
            content: `❌ Stats sync error: ${error.message}. The local EA sync script handles most syncing.` 
          });
        }
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

      // Auto-Link EA Accounts button - triggers fuzzy matching for all unlinked profiles
      if (id === 'squadiq_autolink') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          const result = await autoLinkEaAccounts(guildId, interaction.guild);
          
          return interaction.editReply({
            content: `🔗 **EA Account Auto-Link Complete**\n\n` +
              `✅ Linked: ${result.linked}\n` +
              `⏭️ Already linked: ${result.skipped}\n` +
              `❌ No match found: ${result.noMatch}\n\n` +
              `Auto-linking uses fuzzy matching (>50% similarity) to connect EA usernames to Discord members.`
          });
        } catch (error) {
          console.error('[Auto-Link] Error:', error);
          return interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
      }

      // Events Panel button
      if (id === 'squadiq_eventpanel') {
        await interaction.deferReply({ flags: 64 });
        
        // Fetch upcoming events
        const { data: events } = await supabase
          .from('availability_events')
          .select('*')
          .eq('guild_id', guildId)
          .eq('closed', false)
          .order('scheduled_at', { ascending: true })
          .limit(5);
        
        const eventLines = (events || []).map(e => {
          const time = new Date(e.scheduled_at).toLocaleString();
          return `• **${e.title}** – ${time}`;
        }).join('\n') || 'No upcoming events';
        
        const embed = new EmbedBuilder()
          .setTitle('📅 Event Management')
          .setColor(0x5865f2)
          .setDescription(
            '**Upcoming Events:**\n' + eventLines + '\n\n' +
            '**Create New Event:**\n' +
            'Use `/event` command to create availability checks\n\n' +
            '**Event Types:** Match, Training, Scrimmage, Tournament'
          )
          .setFooter({ text: 'Players respond with ✅ Yes / ❌ No / ❓ Maybe' });
        
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('squadiq_event_create')
            .setLabel('Create Event')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('squadiq_event_list')
            .setLabel('View All Events')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
        );
        
        return interaction.editReply({ embeds: [embed], components: [buttons] });
      }

      // Teams Panel button
      if (id === 'squadiq_teampanel') {
        await interaction.deferReply({ flags: 64 });
        
        // Fetch teams
        const { data: teams } = await supabase
          .from('teams')
          .select('*')
          .eq('guild_id', guildId)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(10);
        
        const teamLines = (teams || []).map(t => {
          const captain = t.captain_discord_id ? `<@${t.captain_discord_id}>` : 'No captain';
          return `• **${t.name}** (${t.team_type}) – ${captain}`;
        }).join('\n') || 'No teams created yet';
        
        const embed = new EmbedBuilder()
          .setTitle('👥 Team Management')
          .setColor(0x5865f2)
          .setDescription(
            '**Active Teams:**\n' + teamLines + '\n\n' +
            '**Manage Teams on Web Dashboard:**\n' +
            'Create teams, assign players to rosters, set captains and managers.'
          )
          .setFooter({ text: 'Full team management available on web • squadiq.lovable.app' });
        
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('squadiq_team_create')
            .setLabel('Create Team')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setLabel('Manage on Web')
            .setEmoji('🌐')
            .setStyle(ButtonStyle.Link)
            .setURL('https://squadiq.lovable.app/teams')
        );
        
        return interaction.editReply({ embeds: [embed], components: [buttons] });
      }

      // Builds Upload Panel button
      if (id === 'squadiq_buildsupload') {
        const embed = new EmbedBuilder()
          .setTitle('🏗️ Player Build Upload')
          .setColor(0x5865f2)
          .setDescription(
            '**Submit Your Pro Clubs Build:**\n\n' +
            '1️⃣ Take a screenshot of your player build screen in EA FC\n' +
            '2️⃣ Click the button below to upload\n' +
            '3️⃣ Your build will be verified and added to your profile\n\n' +
            '**What to include:**\n' +
            '• Height, Weight\n' +
            '• Position & Playstyles\n' +
            '• Build Rating (if visible)\n\n' +
            '*Verified builds contribute to your Build Quality rating!*'
          )
          .setFooter({ text: 'Screenshots help verify player builds for fair matchmaking' });
        
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('squadiq_build_upload')
            .setLabel('Upload Build Screenshot')
            .setEmoji('📸')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('squadiq_build_manual')
            .setLabel('Enter Manually')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Secondary)
        );
        
        return interaction.reply({ embeds: [embed], components: [buttons], flags: 64 });
      }

      // Build upload button handler
      if (id === 'squadiq_build_upload') {
        return interaction.reply({
          content: '📸 **Upload Your Build Screenshot**\n\n' +
            'Please post your build screenshot in this channel, then an admin will verify it.\n\n' +
            '*Alternatively, use the web dashboard at squadiq.lovable.app to upload directly.*',
          flags: 64
        });
      }

      // Manual build entry modal
      if (id === 'squadiq_build_manual') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_build_manual_modal')
          .setTitle('Enter Build Details');
        
        const positionInput = new TextInputBuilder()
          .setCustomId('build_position')
          .setLabel('Position (e.g., ST, CM, CB, GK)')
          .setPlaceholder('ST')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const heightInput = new TextInputBuilder()
          .setCustomId('build_height')
          .setLabel('Height (cm)')
          .setPlaceholder('185')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        const playstylesInput = new TextInputBuilder()
          .setCustomId('build_playstyles')
          .setLabel('Playstyles (comma separated)')
          .setPlaceholder('Technical, Quick Step, First Touch')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);
        
        modal.addComponents(
          new ActionRowBuilder().addComponents(positionInput),
          new ActionRowBuilder().addComponents(heightInput),
          new ActionRowBuilder().addComponents(playstylesInput)
        );
        return interaction.showModal(modal);
      }

      // Create Event modal trigger
      if (id === 'squadiq_event_create') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }
        
        const modal = new ModalBuilder()
          .setCustomId('squadiq_event_create_modal')
          .setTitle('Create Event');
        
        const titleInput = new TextInputBuilder()
          .setCustomId('event_title')
          .setLabel('Event Title')
          .setPlaceholder('League Match vs Team Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const dateInput = new TextInputBuilder()
          .setCustomId('event_date')
          .setLabel('Date & Time (e.g., 2025-01-15 20:00)')
          .setPlaceholder('2025-01-15 20:00')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const typeInput = new TextInputBuilder()
          .setCustomId('event_type')
          .setLabel('Type (match/training/scrimmage/tournament)')
          .setPlaceholder('match')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(dateInput),
          new ActionRowBuilder().addComponents(typeInput)
        );
        return interaction.showModal(modal);
      }

      // Create Team modal trigger
      if (id === 'squadiq_team_create') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }
        
        const modal = new ModalBuilder()
          .setCustomId('squadiq_team_create_modal')
          .setTitle('Create Team');
        
        const nameInput = new TextInputBuilder()
          .setCustomId('team_name')
          .setLabel('Team Name')
          .setPlaceholder('First Team')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const typeInput = new TextInputBuilder()
          .setCustomId('team_type')
          .setLabel('Type (comp/casual/academy)')
          .setPlaceholder('comp')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        const captainInput = new TextInputBuilder()
          .setCustomId('team_captain')
          .setLabel('Captain Discord ID (optional)')
          .setPlaceholder('123456789012345678')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(typeInput),
          new ActionRowBuilder().addComponents(captainInput)
        );
        return interaction.showModal(modal);
      }

      // Send Feedback DMs button - sends pending feedback requests via DM
      if (id === 'squadiq_send_feedback_dms') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Admin only.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        const result = await sendPendingFeedbackDMs(guildId, interaction.guild);
        
        return interaction.editReply({
          content: `📬 **Feedback DMs Sent!**\n\n` +
            `✅ Sent: ${result.sent}\n` +
            `⏭️ Skipped (already sent): ${result.skipped}\n` +
            `❌ Failed: ${result.failed}\n\n` +
            `Players will receive DMs with buttons to rate their teammates.`
        });
      }

      // Link EA Account button - opens modal
      if (id === 'squadiq_link_ea_modal') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_linkea_modal')
          .setTitle('Link EA Account');
        
        const usernameInput = new TextInputBuilder()
          .setCustomId('ea_username')
          .setLabel('EA FC Pro Clubs Username')
          .setPlaceholder('Enter your exact EA username')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const platformInput = new TextInputBuilder()
          .setCustomId('ea_platform')
          .setLabel('Platform (ps5/xbox/pc)')
          .setPlaceholder('ps5, xbox, or pc')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row1 = new ActionRowBuilder().addComponents(usernameInput);
        const row2 = new ActionRowBuilder().addComponents(platformInput);
        modal.addComponents(row1, row2);
        return interaction.showModal(modal);
      }

      // Draft report result button
      if (id.startsWith('draft_report_')) {
        const draftId = id.substring('draft_report_'.length);
        
        const modal = new ModalBuilder()
          .setCustomId(`draft_result_modal_${draftId}`)
          .setTitle('Report Draft Result');
        
        const teamAScore = new TextInputBuilder()
          .setCustomId('team_a_score')
          .setLabel('Team A Score')
          .setPlaceholder('Enter score (e.g., 3)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const teamBScore = new TextInputBuilder()
          .setCustomId('team_b_score')
          .setLabel('Team B Score')
          .setPlaceholder('Enter score (e.g., 2)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row1 = new ActionRowBuilder().addComponents(teamAScore);
        const row2 = new ActionRowBuilder().addComponents(teamBScore);
        modal.addComponents(row1, row2);
        return interaction.showModal(modal);
      }

      // Draft cancel button
      if (id.startsWith('draft_cancel_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Only admins can cancel drafts.', flags: 64 });
        }
        
        const draftId = id.substring('draft_cancel_'.length);
        
        await interaction.deferReply({ flags: 64 });
        
        const { error } = await supabase
          .from('drafts')
          .update({ status: 'cancelled', completed_at: new Date().toISOString() })
          .eq('id', draftId);
        
        if (error) {
          return interaction.editReply({ content: `❌ Failed to cancel draft: ${error.message}` });
        }
        
        activeDrafts.delete(guildId);
        return interaction.editReply({ content: '✅ Draft cancelled.' });
      }

      // Draft reroll buttons
      if (id.startsWith('draft_reroll_confirm_') || id.startsWith('draft_reroll_')) {
        const draftId = id.replace('draft_reroll_confirm_', '').replace('draft_reroll_', '');
        const draftData = activeDrafts.get(guildId);
        
        if (!draftData || draftData.draft_id !== draftId) {
          return interaction.reply({ content: '❌ This draft is no longer active.', flags: 64 });
        }

        const isCaptain = interaction.user.id === draftData.captain_a?.discord_user_id || 
                          interaction.user.id === draftData.captain_b?.discord_user_id;
        
        if (!isCaptain && !isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Only captains can vote on reroll.', flags: 64 });
        }

        const existingRequest = pendingCaptainRerolls.get(guildId);
        
        if (!existingRequest) {
          // First person clicking - create request
          pendingCaptainRerolls.set(guildId, {
            draftId,
            initiator: interaction.user.id,
            expires: Date.now() + 60000
          });
          
          const otherCaptain = interaction.user.id === draftData.captain_a.discord_user_id 
            ? draftData.captain_b.discord_user_id 
            : draftData.captain_a.discord_user_id;
          
          return interaction.reply({
            content: `🔄 <@${interaction.user.id}> wants to reroll captains. <@${otherCaptain}> click the button to agree.`,
            flags: 0
          });
        }
        
        if (existingRequest.initiator === interaction.user.id) {
          return interaction.reply({ content: '⏳ Waiting for the other captain to agree.', flags: 64 });
        }

        // Second captain agreeing
        await interaction.deferUpdate();
        
        const allPlayers = [
          ...(draftData.team_a_player_ids || [draftData.captain_a.discord_user_id]),
          ...(draftData.team_b_player_ids || [draftData.captain_b.discord_user_id]),
          ...(draftData.available_players || []).map(p => p.discord_user_id || p)
        ];
        
        await supabase.from('drafts').update({ status: 'cancelled' }).eq('id', draftId);
        
        const { error, data: newDraft } = await callEdgeFunction('draft-start', {
          guild_id: guildId,
          voice_channel_id: draftData.voice_channel_id,
          player_discord_ids: allPlayers,
          team_a_vc_id: draftData.team_a_vc_id,
          team_b_vc_id: draftData.team_b_vc_id
        });

        pendingCaptainRerolls.delete(guildId);

        if (error) {
          return interaction.followUp({ content: `❌ Reroll failed: ${error}`, flags: 64 });
        }

        activeDrafts.set(guildId, newDraft);
        const embed = buildDraftEmbed(newDraft, interaction.guild);
        embed.setDescription('🔄 **Captains Rerolled!**\n\n' + (embed.data.description || ''));
        
        return interaction.editReply({ embeds: [embed], components: [] });
      }

      if (id.startsWith('draft_reroll_cancel_')) {
        pendingCaptainRerolls.delete(guildId);
        return interaction.update({ content: '❌ Reroll cancelled. Keeping current captains.', embeds: [], components: [] });
      }

      // Feedback rating buttons (from DMs) - new panel-based system
      // Format: feedback_rate_{rating}_{feedbackRequestId}_{evaluatedUserId}
      if (id.startsWith('feedback_rate_')) {
        const parts = id.split('_');
        const rating = parseInt(parts[2], 10);
        const feedbackRequestId = parts[3];
        const evaluatedUserId = parts[4];
        
        await interaction.deferUpdate();
        
        // Record the peer evaluation
        const { data: feedbackRequest } = await supabase
          .from('dm_feedback_requests')
          .select('*')
          .eq('id', feedbackRequestId)
          .single();
        
        if (!feedbackRequest) {
          return interaction.followUp({ content: '❌ Feedback request not found or expired.', flags: 64 });
        }
        
        // Find the position this player was playing from teammates_data
        const teammatesData = feedbackRequest.teammates_data || [];
        const evaluatedPlayer = teammatesData.find(t => t.discord_user_id === evaluatedUserId);
        const positionPlayed = evaluatedPlayer?.position_played || null;
        
        // Insert peer evaluation with position
        await supabase.from('peer_evaluations').insert({
          guild_id: feedbackRequest.guild_id,
          draft_id: feedbackRequest.draft_id,
          club_match_id: feedbackRequest.club_match_id,
          evaluator_discord_id: interaction.user.id,
          evaluated_discord_id: evaluatedUserId,
          position_played: positionPlayed,
          overall_score: rating,
          technical_skill: rating,
          game_iq: rating,
          work_ethic: rating,
          communication: rating,
          consistency: rating,
          clutch_factor: rating
        });
        
        // Update teammates_data to mark this player as rated
        const updatedTeammatesData = teammatesData.map(t => 
          t.discord_user_id === evaluatedUserId 
            ? { ...t, rated: true, given_rating: rating }
            : t
        );
        
        // Check if all teammates have been rated
        const allRated = updatedTeammatesData.every(t => t.rated);
        
        await supabase
          .from('dm_feedback_requests')
          .update({
            teammates_data: updatedTeammatesData,
            status: allRated ? 'completed' : 'pending',
            completed_at: allRated ? new Date().toISOString() : null
          })
          .eq('id', feedbackRequestId);
        
        // Trigger rating recalculation for the evaluated player
        await callEdgeFunction('calculate-ratings', {
          guild_id: feedbackRequest.guild_id,
          discord_user_id: evaluatedUserId
        });
        
        // Rebuild the panel with updated ratings
        const matchType = feedbackRequest.match_type === 'club' ? 'Club Match' : 'Draft';
        
        // Build description showing all teammates and their ratings
        let description = `Rate each teammate from the **${matchType}**:\n\n`;
        for (const teammate of updatedTeammatesData) {
          const position = teammate.position_played || 'ANY';
          const name = teammate.ea_username || `<@${teammate.discord_user_id}>`;
          if (teammate.rated) {
            const stars = '⭐'.repeat(teammate.given_rating);
            description += `✅ **${name}** (${position}): ${stars}\n`;
          } else {
            description += `⬜ **${name}** (${position}): Not rated yet\n`;
          }
        }
        
        if (allRated) {
          // All done!
          const doneEmbed = new EmbedBuilder()
            .setTitle('✅ Feedback Complete!')
            .setColor(0x00ff00)
            .setDescription(description + '\n\nThank you for rating your teammates! Your feedback helps improve player ratings.');
          
          return interaction.editReply({ embeds: [doneEmbed], components: [] });
        }
        
        // Find next unrated teammate
        const nextUnrated = updatedTeammatesData.find(t => !t.rated);
        
        const embed = new EmbedBuilder()
          .setTitle('⭐ Rate Your Teammates')
          .setColor(0x5865f2)
          .setDescription(description + `\n**Now rating: ${nextUnrated.ea_username || 'Teammate'}** (${nextUnrated.position_played || 'ANY'})`);
        
        // Build rating buttons for next unrated player
        const ratingButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`feedback_rate_1_${feedbackRequestId}_${nextUnrated.discord_user_id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`feedback_rate_2_${feedbackRequestId}_${nextUnrated.discord_user_id}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`feedback_rate_3_${feedbackRequestId}_${nextUnrated.discord_user_id}`).setLabel('⭐ 3').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`feedback_rate_4_${feedbackRequestId}_${nextUnrated.discord_user_id}`).setLabel('⭐ 4').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`feedback_rate_5_${feedbackRequestId}_${nextUnrated.discord_user_id}`).setLabel('⭐ 5').setStyle(ButtonStyle.Success)
        );
        
        return interaction.editReply({ embeds: [embed], components: [ratingButtons] });
      }

      // Scouting button - opens modal for club name input
      if (id === 'squadiq_scout') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_scout_modal')
          .setTitle('Scout a Club');
        
        const clubNameInput = new TextInputBuilder()
          .setCustomId('scout_club_name')
          .setLabel('Club Name')
          .setPlaceholder('Enter the EA FC Pro Clubs team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row = new ActionRowBuilder().addComponents(clubNameInput);
        modal.addComponents(row);
        return interaction.showModal(modal);
      }

      // Club Matches button - opens modal for club name input
      if (id === 'squadiq_clubmatches') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_clubmatches_modal')
          .setTitle('View Club Matches');
        
        const clubNameInput = new TextInputBuilder()
          .setCustomId('matches_club_name')
          .setLabel('Club Name')
          .setPlaceholder('Enter the EA FC Pro Clubs team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row = new ActionRowBuilder().addComponents(clubNameInput);
        modal.addComponents(row);
        return interaction.showModal(modal);
      }

      // Match Preview button - opens modal for both club names
      if (id === 'squadiq_matchpreview') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_matchpreview_modal')
          .setTitle('Match Preview');
        
        const homeInput = new TextInputBuilder()
          .setCustomId('preview_home_club')
          .setLabel('Home Club Name')
          .setPlaceholder('Enter the home team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const awayInput = new TextInputBuilder()
          .setCustomId('preview_away_club')
          .setLabel('Away Club Name')
          .setPlaceholder('Enter the away team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row1 = new ActionRowBuilder().addComponents(homeInput);
        const row2 = new ActionRowBuilder().addComponents(awayInput);
        modal.addComponents(row1, row2);
        return interaction.showModal(modal);
      }

      // View Profile button - opens modal for player selection
      if (id === 'squadiq_profile') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_profile_modal')
          .setTitle('View Player Profile');
        
        const playerInput = new TextInputBuilder()
          .setCustomId('profile_player')
          .setLabel('Player (leave empty for yourself)')
          .setPlaceholder('Enter Discord username or ID, or leave empty')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        const row = new ActionRowBuilder().addComponents(playerInput);
        modal.addComponents(row);
        return interaction.showModal(modal);
      }

      // =======================
      // SCOUTING PANEL BUTTON HANDLERS
      // =======================

      // Scout Club button from scouting panel
      if (id === 'scoutpanel_scout') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_scout_modal')
          .setTitle('Scout a Club');
        
        const clubNameInput = new TextInputBuilder()
          .setCustomId('scout_club_name')
          .setLabel('Club Name')
          .setPlaceholder('Enter the EA FC Pro Clubs team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row = new ActionRowBuilder().addComponents(clubNameInput);
        modal.addComponents(row);
        return interaction.showModal(modal);
      }

      // Club Matches button from scouting panel
      if (id === 'scoutpanel_matches') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_clubmatches_modal')
          .setTitle('Club Match History');
        
        const clubNameInput = new TextInputBuilder()
          .setCustomId('matches_club_name')
          .setLabel('Club Name')
          .setPlaceholder('Enter the EA FC Pro Clubs team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row = new ActionRowBuilder().addComponents(clubNameInput);
        modal.addComponents(row);
        return interaction.showModal(modal);
      }

      // Match Preview button from scouting panel
      if (id === 'scoutpanel_preview') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_matchpreview_modal')
          .setTitle('Match Preview');
        
        const homeInput = new TextInputBuilder()
          .setCustomId('preview_home_club')
          .setLabel('Home Club Name')
          .setPlaceholder('Enter the home team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const awayInput = new TextInputBuilder()
          .setCustomId('preview_away_club')
          .setLabel('Away Club Name')
          .setPlaceholder('Enter the away team name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const row1 = new ActionRowBuilder().addComponents(homeInput);
        const row2 = new ActionRowBuilder().addComponents(awayInput);
        modal.addComponents(row1, row2);
        return interaction.showModal(modal);
      }

      // View Profile button from scouting panel
      if (id === 'scoutpanel_profile') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_profile_modal')
          .setTitle('View Player Profile');
        
        const playerInput = new TextInputBuilder()
          .setCustomId('profile_player')
          .setLabel('Player (leave empty for yourself)')
          .setPlaceholder('Enter Discord username or ID, or leave empty')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        
        const row = new ActionRowBuilder().addComponents(playerInput);
        modal.addComponents(row);
        return interaction.showModal(modal);
      }

      // Scout Player button from scouting panel
      if (id === 'scoutpanel_scoutplayer') {
        // Show options: Scout Discord member OR Scout by EA ID
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('scoutplayer_discord')
            .setLabel('Scout Discord Member')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👤'),
          new ButtonBuilder()
            .setCustomId('scoutplayer_ea')
            .setLabel('Scout by EA Username')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎮')
        );

        return interaction.reply({
          content: '🎯 **Scout a Player**\n\nChoose how you want to scout:',
          components: [row1],
          flags: 64
        });
      }

      // Scout Discord member option
      if (id === 'scoutplayer_discord') {
        await interaction.deferUpdate();

        // Fetch players from player_summary for this guild
        const { data: players } = await supabase
          .from('player_summary')
          .select('discord_user_id, discord_username, overall_rating, primary_position')
          .eq('guild_id', guildId)
          .order('overall_rating', { ascending: false })
          .limit(25);

        if (!players || players.length === 0) {
          return interaction.editReply({ content: 'No players found in this server. Players need to play games to appear here.', components: [] });
        }

        const options = players.map(p => ({
          label: `${p.discord_username || 'Unknown'} (${Math.round(p.overall_rating || 50)} OVR)`,
          value: p.discord_user_id,
          description: p.primary_position ? `Position: ${p.primary_position}` : 'Position: Unknown'
        }));

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('scoutpanel_scoutplayer_select')
          .setPlaceholder('Select a player to scout')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.editReply({
          content: '🎯 **Scout a Discord Member**\n\nSelect a player to generate an AI-powered scouting report:',
          components: [row]
        });
      }

      // Scout by EA Username option - show modal
      if (id === 'scoutplayer_ea') {
        const modal = new ModalBuilder()
          .setCustomId('scoutplayer_ea_modal')
          .setTitle('Scout by EA Username');

        const eaUsernameInput = new TextInputBuilder()
          .setCustomId('ea_username')
          .setLabel('EA FC Pro Clubs Username')
          .setPlaceholder('Enter the EA username to scout')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50);

        modal.addComponents(new ActionRowBuilder().addComponents(eaUsernameInput));
        return interaction.showModal(modal);
      }

      // Leaderboard button from scouting panel
      if (id === 'scoutpanel_leaderboard') {
        await interaction.deferReply({ flags: 64 });

        const { error, data } = await callEdgeFunction('get-leaderboard', {
          guild_id: guildId,
          type: 'overall',
          limit: 15
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to fetch leaderboard: ${error}` });
        }

        const players = data?.entries || data?.players || [];
        if (players.length === 0) {
          return interaction.editReply({ content: 'No players on the leaderboard yet. Play some games to get started!' });
        }

        const lines = players.map((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const rating = Math.round(p.overall_rating || 50);
          const pos = p.primary_position || '—';
          const name = p.ea_username || p.discord_username || 'Unknown';
          return `${medal} **${name}** • ${rating} OVR • ${pos}`;
        });

        const embed = new EmbedBuilder()
          .setTitle('📈 Server Leaderboard')
          .setColor(0x5865f2)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Based on overall rating • Top 15 players' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Refresh button from scouting panel
      if (id === 'scoutpanel_refresh') {
        const refreshEmbed = await buildScoutingPanelEmbed(guildId);
        await interaction.update({
          embeds: [refreshEmbed],
          components: buildScoutingPanelComponents()
        });
        return;
      }

      // Recent Results button from scouting panel
      if (id === 'scoutpanel_recent') {
        await interaction.deferReply({ flags: 64 });

        try {
          const { error, data } = await callEdgeFunction('recent-results', {
            guild_id: guildId,
            include_ai_summary: true
          });

          if (error) {
            return interaction.editReply({ content: `❌ Failed to fetch recent results: ${error}` });
          }

          const matches = data?.matches || [];
          const summary = data?.summary || null;

          if (matches.length === 0) {
            return interaction.editReply({ content: '📊 No recent matches found. Play some games to see results here!' });
          }

          // Build match list
          const matchLines = matches.slice(0, 5).map((m, i) => {
            const result = m.result === 'win' ? '🟢 W' : m.result === 'loss' ? '🔴 L' : '⚪ D';
            const score = `${m.score_for || 0}-${m.score_against || 0}`;
            const opponent = m.opponent_club_name || 'Unknown';
            return `${i + 1}. ${result} **${score}** vs ${opponent}`;
          });

          const embed = new EmbedBuilder()
            .setTitle('📋 Recent Match Results')
            .setColor(0x5865f2)
            .setDescription(matchLines.join('\n'))
            .setFooter({ text: 'Last 5 matches • Updated in real-time' })
            .setTimestamp();

          if (summary?.ai_analysis) {
            embed.addFields({
              name: '🤖 AI Analysis',
              value: summary.ai_analysis.substring(0, 1000)
            });
          }

          // Add stats fields if available
          if (summary?.leaders) {
            const leaders = summary.leaders;
            const statsFields = [];
            if (leaders.goals) statsFields.push({ name: '⚽ Top Scorer', value: `${leaders.goals.player} (${leaders.goals.value})`, inline: true });
            if (leaders.assists) statsFields.push({ name: '🅰️ Top Assists', value: `${leaders.assists.player} (${leaders.assists.value})`, inline: true });
            if (leaders.rating) statsFields.push({ name: '⭐ Best Rating', value: `${leaders.rating.player} (${leaders.rating.value})`, inline: true });
            if (statsFields.length > 0) embed.addFields(statsFields);
          }

          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      // Win Probability button from scouting panel
      if (id === 'scoutpanel_winprob') {
        const modal = new ModalBuilder()
          .setCustomId('scoutpanel_winprob_modal')
          .setTitle('Calculate Win Probability');

        const team1Input = new TextInputBuilder()
          .setCustomId('winprob_team1')
          .setLabel('Team 1 Players (comma-separated)')
          .setPlaceholder('Player1, Player2, Player3...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const team2Input = new TextInputBuilder()
          .setCustomId('winprob_team2')
          .setLabel('Team 2 Players (comma-separated)')
          .setPlaceholder('Player1, Player2, Player3...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(team1Input),
          new ActionRowBuilder().addComponents(team2Input)
        );

        return interaction.showModal(modal);
      }

      // Form Check button from scouting panel
      if (id === 'scoutpanel_form') {
        await interaction.deferReply({ flags: 64 });

        const { data: players } = await supabase
          .from('player_summary')
          .select('discord_username, ea_username, form_rating, current_streak, streak_type')
          .eq('guild_id', guildId)
          .order('form_rating', { ascending: false, nullsFirst: false })
          .limit(15);

        if (!players || players.length === 0) {
          return interaction.editReply({ content: 'No player form data available yet. Players need games to build form.' });
        }

        // Split into hot and cold
        const hotPlayers = players.filter(p => (p.form_rating || 50) >= 60);
        const coldPlayers = players.filter(p => (p.form_rating || 50) < 40);

        let description = '';
        if (hotPlayers.length > 0) {
          description += '**🔥 HOT FORM**\n';
          description += hotPlayers.slice(0, 5).map((p, i) => {
            const name = p.ea_username || p.discord_username || 'Unknown';
            const form = Math.round(p.form_rating || 50);
            const streak = p.streak_type === 'win' ? `🔥${p.current_streak}` : '';
            return `${i + 1}. **${name}** • Form: ${form} ${streak}`;
          }).join('\n');
          description += '\n\n';
        }

        if (coldPlayers.length > 0) {
          description += '**❄️ COLD FORM**\n';
          description += coldPlayers.slice(0, 5).map((p, i) => {
            const name = p.ea_username || p.discord_username || 'Unknown';
            const form = Math.round(p.form_rating || 50);
            const streak = p.streak_type === 'loss' ? `❄️${p.current_streak}` : '';
            return `${i + 1}. **${name}** • Form: ${form} ${streak}`;
          }).join('\n');
        }

        if (!description) {
          description = 'All players are in neutral form (40-60 range).';
        }

        const embed = new EmbedBuilder()
          .setTitle('🔥 Player Form Check')
          .setColor(0xff6b35)
          .setDescription(description)
          .setFooter({ text: 'Form updates after each match • 🔥 Hot = 60+ | ❄️ Cold = <40' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Scouting Lists button from scouting panel
      if (id === 'scoutpanel_lists') {
        await interaction.deferReply({ flags: 64 });

        const { data: lists } = await supabase
          .from('scouting_lists')
          .select('id, name, description, player_ids, is_public, created_by_discord_id')
          .eq('guild_id', guildId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!lists || lists.length === 0) {
          // Show options to create a list
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('scoutpanel_createlist')
              .setLabel('Create Scouting List')
              .setEmoji('➕')
              .setStyle(ButtonStyle.Success)
          );

          return interaction.editReply({
            content: '📋 **No scouting lists found!**\n\nCreate your first scouting list to track players you\'re interested in.',
            components: [row]
          });
        }

        const listLines = lists.map((l, i) => {
          const playerCount = l.player_ids?.length || 0;
          const visibility = l.is_public ? '🌐 Public' : '🔒 Private';
          return `${i + 1}. **${l.name}** (${playerCount} players) ${visibility}`;
        });

        const embed = new EmbedBuilder()
          .setTitle('📋 Scouting Lists')
          .setColor(0x5865f2)
          .setDescription(listLines.join('\n'))
          .setFooter({ text: 'Click a list below to view or manage it' })
          .setTimestamp();

        // Build select menu for lists
        const options = lists.map(l => ({
          label: l.name,
          value: l.id,
          description: `${l.player_ids?.length || 0} players • ${l.is_public ? 'Public' : 'Private'}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('scoutpanel_list_select')
          .setPlaceholder('Select a list to view')
          .addOptions(options);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('scoutpanel_createlist')
            .setLabel('Create New List')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Success)
        );

        return interaction.editReply({ embeds: [embed], components: [row1, row2] });
      }

      // Create Scouting List button
      if (id === 'scoutpanel_createlist') {
        const modal = new ModalBuilder()
          .setCustomId('scoutpanel_createlist_modal')
          .setTitle('Create Scouting List');

        const nameInput = new TextInputBuilder()
          .setCustomId('list_name')
          .setLabel('List Name')
          .setPlaceholder('e.g., "Transfer Targets", "Rival Team"')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50);

        const descInput = new TextInputBuilder()
          .setCustomId('list_description')
          .setLabel('Description (optional)')
          .setPlaceholder('What is this list for?')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput),
          new ActionRowBuilder().addComponents(descInput)
        );

        return interaction.showModal(modal);
      }

      // Achievements button from scouting panel
      if (id === 'scoutpanel_achievements') {
        await interaction.deferReply({ flags: 64 });

        const { data: achievements } = await supabase
          .from('player_achievements')
          .select('discord_user_id, achievement_name, achievement_icon, earned_at')
          .eq('guild_id', guildId)
          .order('earned_at', { ascending: false })
          .limit(20);

        if (!achievements || achievements.length === 0) {
          return interaction.editReply({ content: '🏆 No achievements earned yet. Keep playing to unlock badges!' });
        }

        const lines = achievements.map(a => {
          const time = Math.floor(new Date(a.earned_at).getTime() / 1000);
          return `${a.achievement_icon} **${a.achievement_name}** • <t:${time}:R>`;
        });

        const embed = new EmbedBuilder()
          .setTitle('🏆 Recent Server Achievements')
          .setColor(0xffd700)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Showing last 20 achievements' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // My Stats button from scouting panel
      if (id === 'scoutpanel_mystats') {
        await interaction.deferReply({ flags: 64 });

        const { error, data } = await callEdgeFunction('get-player-profile', {
          guild_id: guildId,
          discord_user_id: interaction.user.id
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to fetch stats: ${error}` });
        }

        if (!data || !data.player) {
          return interaction.editReply({ content: '📊 No stats found! Play some games to build your profile.' });
        }

        const p = data.player;
        const streakEmoji = p.streak_type === 'win' ? '🔥' : p.streak_type === 'loss' ? '❄️' : '➖';
        const formText = p.last_5_results?.map(r => r === 'W' ? '🟢' : r === 'L' ? '🔴' : '⚪').join('') || 'No games yet';

        const embed = new EmbedBuilder()
          .setTitle(`📊 Your Stats: ${p.ea_username || p.discord_username || interaction.user.username}`)
          .setColor(0x5865f2)
          .addFields(
            { name: '⭐ Rating', value: `**${Math.round(p.overall_rating || 50)}**`, inline: true },
            { name: '🎮 Games', value: `${p.games_played || 0}`, inline: true },
            { name: '🏆 Wins', value: `${p.wins || 0} (${Math.round(p.win_rate || 0)}%)`, inline: true },
            { name: '⚽ Goals', value: `${p.goals || 0}`, inline: true },
            { name: '🅰️ Assists', value: `${p.assists || 0}`, inline: true },
            { name: `${streakEmoji} Streak`, value: `${p.current_streak || 0}`, inline: true },
            { name: '📈 Recent Form', value: formText, inline: false }
          )
          .setFooter({ text: 'Keep playing to improve your rating!' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Compare Players button from scouting panel
      if (id === 'scoutpanel_compare') {
        await interaction.deferReply({ flags: 64 });

        // Fetch players for selection
        const { data: players } = await supabase
          .from('player_summary')
          .select('discord_user_id, discord_username, ea_username, overall_rating, primary_position')
          .eq('guild_id', guildId)
          .order('overall_rating', { ascending: false })
          .limit(25);

        if (!players || players.length < 2) {
          return interaction.editReply({ content: 'Need at least 2 players with stats to compare.' });
        }

        const options = players.map(p => ({
          label: `${p.ea_username || p.discord_username || 'Unknown'} (${Math.round(p.overall_rating || 50)} OVR)`,
          value: p.discord_user_id,
          description: p.primary_position ? `Position: ${p.primary_position}` : 'Position: Unknown'
        }));

        const selectMenu1 = new StringSelectMenuBuilder()
          .setCustomId('scoutpanel_compare_player1')
          .setPlaceholder('Select first player')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu1);

        return interaction.editReply({
          content: '⚖️ **Compare Players**\n\nSelect the first player to compare:',
          components: [row]
        });
      }

      // Compare Players - First player selected
      if (id === 'scoutpanel_compare_player1') {
        const player1Id = interaction.values[0];

        // Store player1 selection and show player2 selection
        const { data: players } = await supabase
          .from('player_summary')
          .select('discord_user_id, discord_username, ea_username, overall_rating, primary_position')
          .eq('guild_id', guildId)
          .neq('discord_user_id', player1Id) // Exclude already selected player
          .order('overall_rating', { ascending: false })
          .limit(25);

        if (!players || players.length === 0) {
          return interaction.update({ content: 'No other players available to compare.', components: [] });
        }

        const options = players.map(p => ({
          label: `${p.ea_username || p.discord_username || 'Unknown'} (${Math.round(p.overall_rating || 50)} OVR)`,
          value: `${player1Id}|${p.discord_user_id}`, // Combine both IDs
          description: p.primary_position ? `Position: ${p.primary_position}` : 'Position: Unknown'
        }));

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('scoutpanel_compare_player2')
          .setPlaceholder('Select second player')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.update({
          content: '⚖️ **Compare Players**\n\nNow select the second player to compare:',
          components: [row]
        });
      }

      // Compare Players - Second player selected - Show comparison
      if (id === 'scoutpanel_compare_player2') {
        const [player1Id, player2Id] = interaction.values[0].split('|');

        await interaction.update({
          content: '⚖️ **Generating player comparison...**\n\n📊 Fetching stats for both players...',
          components: []
        });

        try {
          // Fetch both players' full stats
          const { data: player1Data } = await supabase
            .from('player_summary')
            .select('*')
            .eq('guild_id', guildId)
            .eq('discord_user_id', player1Id)
            .single();

          const { data: player2Data } = await supabase
            .from('player_summary')
            .select('*')
            .eq('guild_id', guildId)
            .eq('discord_user_id', player2Id)
            .single();

          if (!player1Data || !player2Data) {
            return interaction.editReply({ content: '❌ Could not fetch player data.', components: [] });
          }

          // Get profiles for EA usernames
          const { data: profiles } = await supabase
            .from('profiles')
            .select('discord_user_id, ea_username')
            .in('discord_user_id', [player1Id, player2Id]);

          const p1Profile = profiles?.find(p => p.discord_user_id === player1Id);
          const p2Profile = profiles?.find(p => p.discord_user_id === player2Id);

          const p1Name = p1Profile?.ea_username || player1Data.discord_username || 'Player 1';
          const p2Name = p2Profile?.ea_username || player2Data.discord_username || 'Player 2';

          // Helper to compare and add emoji
          const compare = (val1, val2, higherBetter = true) => {
            if (val1 === val2) return ['➖', '➖'];
            if (higherBetter) {
              return val1 > val2 ? ['🟢', '🔴'] : ['🔴', '🟢'];
            }
            return val1 < val2 ? ['🟢', '🔴'] : ['🔴', '🟢'];
          };

          // Build comprehensive stat comparisons
          const stats = [
            { name: '⭐ Overall Rating', v1: Math.round(player1Data.overall_rating || 50), v2: Math.round(player2Data.overall_rating || 50) },
            { name: '🎮 Games Played', v1: player1Data.games_played || 0, v2: player2Data.games_played || 0 },
            { name: '🏆 Wins', v1: player1Data.wins || 0, v2: player2Data.wins || 0 },
            { name: '📈 Win Rate', v1: Math.round(player1Data.win_rate || 0), v2: Math.round(player2Data.win_rate || 0), suffix: '%' },
            { name: '⚽ Goals', v1: player1Data.goals || 0, v2: player2Data.goals || 0 },
            { name: '🅰️ Assists', v1: player1Data.assists || 0, v2: player2Data.assists || 0 },
            { name: '🔥 Form Rating', v1: Math.round(player1Data.form_rating || 50), v2: Math.round(player2Data.form_rating || 50) },
            { name: '🎯 Avg Match Rating', v1: (player1Data.avg_match_rating || 0).toFixed(1), v2: (player2Data.avg_match_rating || 0).toFixed(1) },
            { name: '🥅 Clean Sheets', v1: player1Data.clean_sheets || 0, v2: player2Data.clean_sheets || 0 },
            { name: '🏅 Man of Match', v1: player1Data.man_of_match || 0, v2: player2Data.man_of_match || 0 },
            { name: '🔫 Shots', v1: player1Data.shots || 0, v2: player2Data.shots || 0 },
            { name: '⛔ Tackles', v1: player1Data.tackles || 0, v2: player2Data.tackles || 0 },
            { name: '📤 Passes Made', v1: player1Data.passes_made || 0, v2: player2Data.passes_made || 0 },
            { name: '🧤 Saves', v1: player1Data.saves || 0, v2: player2Data.saves || 0 },
            { name: '✅ Reliability', v1: Math.round(player1Data.reliability_score || 100), v2: Math.round(player2Data.reliability_score || 100), suffix: '%' },
          ];

          // Build comparison lines with bars
          const buildBar = (val1, val2, max) => {
            const ratio1 = max > 0 ? val1 / max : 0;
            const ratio2 = max > 0 ? val2 / max : 0;
            const bar1 = '█'.repeat(Math.round(ratio1 * 5)) + '░'.repeat(5 - Math.round(ratio1 * 5));
            const bar2 = '█'.repeat(Math.round(ratio2 * 5)) + '░'.repeat(5 - Math.round(ratio2 * 5));
            return [bar1, bar2];
          };

          // Build main comparison embed
          let comparisonText = '';
          for (const stat of stats) {
            const [e1, e2] = compare(parseFloat(stat.v1), parseFloat(stat.v2));
            const suffix = stat.suffix || '';
            comparisonText += `**${stat.name}**\n`;
            comparisonText += `${e1} ${p1Name}: **${stat.v1}${suffix}**\n`;
            comparisonText += `${e2} ${p2Name}: **${stat.v2}${suffix}**\n\n`;
          }

          // Calculate per-game ratios
          const p1Games = player1Data.games_played || 1;
          const p2Games = player2Data.games_played || 1;
          const perGameStats = [
            { name: 'Goals/Game', v1: ((player1Data.goals || 0) / p1Games).toFixed(2), v2: ((player2Data.goals || 0) / p2Games).toFixed(2) },
            { name: 'Assists/Game', v1: ((player1Data.assists || 0) / p1Games).toFixed(2), v2: ((player2Data.assists || 0) / p2Games).toFixed(2) },
            { name: 'Shots/Game', v1: ((player1Data.shots || 0) / p1Games).toFixed(2), v2: ((player2Data.shots || 0) / p2Games).toFixed(2) },
            { name: 'Tackles/Game', v1: ((player1Data.tackles || 0) / p1Games).toFixed(2), v2: ((player2Data.tackles || 0) / p2Games).toFixed(2) },
          ];

          let perGameText = '';
          for (const stat of perGameStats) {
            const [e1, e2] = compare(parseFloat(stat.v1), parseFloat(stat.v2));
            perGameText += `${stat.name}: ${e1} **${stat.v1}** vs ${e2} **${stat.v2}**\n`;
          }

          // Calculate overall winner
          let p1Wins = 0, p2Wins = 0;
          for (const stat of stats) {
            const v1 = parseFloat(stat.v1);
            const v2 = parseFloat(stat.v2);
            if (v1 > v2) p1Wins++;
            else if (v2 > v1) p2Wins++;
          }

          let verdictEmoji = '🤝';
          let verdictText = 'Evenly matched!';
          if (p1Wins > p2Wins + 3) {
            verdictEmoji = '👑';
            verdictText = `**${p1Name}** wins the comparison!`;
          } else if (p2Wins > p1Wins + 3) {
            verdictEmoji = '👑';
            verdictText = `**${p2Name}** wins the comparison!`;
          } else if (p1Wins > p2Wins) {
            verdictText = `**${p1Name}** has a slight edge`;
          } else if (p2Wins > p1Wins) {
            verdictText = `**${p2Name}** has a slight edge`;
          }

          // Build radar chart visualization (text-based)
          const radarStats = [
            { name: 'Rating', v1: (player1Data.overall_rating || 50) / 100, v2: (player2Data.overall_rating || 50) / 100 },
            { name: 'Wins', v1: Math.min((player1Data.wins || 0) / 50, 1), v2: Math.min((player2Data.wins || 0) / 50, 1) },
            { name: 'Goals', v1: Math.min((player1Data.goals || 0) / 30, 1), v2: Math.min((player2Data.goals || 0) / 30, 1) },
            { name: 'Assists', v1: Math.min((player1Data.assists || 0) / 20, 1), v2: Math.min((player2Data.assists || 0) / 20, 1) },
            { name: 'Form', v1: (player1Data.form_rating || 50) / 100, v2: (player2Data.form_rating || 50) / 100 },
          ];

          let radarText = '**📊 SKILL RADAR**\n```\n';
          radarText += `Stat       │ ${p1Name.substring(0, 8).padEnd(8)} │ ${p2Name.substring(0, 8).padEnd(8)}\n`;
          radarText += `───────────┼──────────┼──────────\n`;
          for (const rs of radarStats) {
            const bar1 = '█'.repeat(Math.round(rs.v1 * 8)).padEnd(8);
            const bar2 = '█'.repeat(Math.round(rs.v2 * 8)).padEnd(8);
            radarText += `${rs.name.padEnd(10)} │ ${bar1} │ ${bar2}\n`;
          }
          radarText += '```';

          const embed = new EmbedBuilder()
            .setTitle(`⚖️ Player Comparison`)
            .setColor(0x5865f2)
            .setDescription(
              `**${p1Name}** vs **${p2Name}**\n\n` +
              `${verdictEmoji} ${verdictText}\n` +
              `📊 Stats won: **${p1Wins}** - **${p2Wins}**\n\n` +
              radarText
            )
            .addFields(
              { 
                name: `🔵 ${p1Name}`, 
                value: `Rating: **${Math.round(player1Data.overall_rating || 50)}**\nPosition: **${player1Data.primary_position || '—'}**\nGames: **${player1Data.games_played || 0}**\nWin Rate: **${Math.round(player1Data.win_rate || 0)}%**`, 
                inline: true 
              },
              { 
                name: `🔴 ${p2Name}`, 
                value: `Rating: **${Math.round(player2Data.overall_rating || 50)}**\nPosition: **${player2Data.primary_position || '—'}**\nGames: **${player2Data.games_played || 0}**\nWin Rate: **${Math.round(player2Data.win_rate || 0)}%**`, 
                inline: true 
              },
              { name: '📈 Per-Game Efficiency', value: perGameText, inline: false }
            )
            .setFooter({ text: '🟢 = Better | 🔴 = Worse | ➖ = Equal • SquadIQ Scouting' })
            .setTimestamp();

          return interaction.editReply({ content: null, embeds: [embed], components: [] });
        } catch (err) {
          console.error('[Compare Players] Error:', err);
          return interaction.editReply({ content: `❌ Error comparing players: ${err.message}`, components: [] });
        }
      }

      // =======================
      // EA PANEL BUTTON HANDLERS
      // =======================

      // EA Panel - Link Club button
      if (id === 'eapanel_link') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Only managers can link clubs.', flags: 64 });
        }

        const modal = new ModalBuilder()
          .setCustomId('eapanel_link_modal')
          .setTitle('Link EA Club');

        const clubNameInput = new TextInputBuilder()
          .setCustomId('ea_club_name')
          .setLabel('EA FC Pro Clubs Team Name')
          .setPlaceholder('Enter your club name exactly as it appears')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const platformInput = new TextInputBuilder()
          .setCustomId('ea_platform')
          .setLabel('Platform (ps5, ps4, xbox, pc)')
          .setPlaceholder('ps5, ps4, xbox, or pc')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue('ps5');

        modal.addComponents(
          new ActionRowBuilder().addComponents(clubNameInput),
          new ActionRowBuilder().addComponents(platformInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // EA Panel - Sync Matches button
      if (id === 'eapanel_sync') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Only managers can sync matches.', flags: 64 });
        }

        const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);
        if (!currentClub?.ea_club_id) {
          return interaction.reply({ content: '❌ No EA club linked. Use Link Club first.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        const result = await syncClubHistory(guildId, currentClub.key);

        if (result.error) {
          return interaction.editReply({ content: `❌ Sync failed: ${result.error}` });
        }

        return interaction.editReply({
          content: `✅ **Synced ${result.synced} new matches** for **${currentClub.name}**\n(${result.skipped} already recorded)`
        });
      }

      // EA Panel - Toggle Monitoring button
      if (id === 'eapanel_toggle') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Only managers can toggle monitoring.', flags: 64 });
        }

        const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);
        if (!currentClub?.ea_club_id) {
          return interaction.reply({ content: '❌ No EA club linked.', flags: 64 });
        }

        currentClub.monitoring_enabled = !currentClub.monitoring_enabled;
        await saveGuildSettings(guildId, state);

        if (currentClub.monitoring_enabled) {
          startEaMonitoring(guildId, currentClub.key);
        } else {
          stopEaMonitoring(guildId, currentClub.key);
        }

        await interaction.update({
          embeds: [buildEaPanelEmbed(guildId, state)],
          components: buildEaPanelComponents(state)
        });
        return;
      }

      // EA Panel - Link EA Account button
      if (id === 'eapanel_linkea') {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('ea_username, ea_platform')
          .eq('discord_user_id', interaction.user.id)
          .maybeSingle();

        const modal = new ModalBuilder()
          .setCustomId('link_ea_modal')
          .setTitle('Link Your EA Account');

        const usernameInput = new TextInputBuilder()
          .setCustomId('ea_username')
          .setLabel('Your EA FC Pro Clubs username')
          .setPlaceholder('Exactly as it appears in-game')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(existingProfile?.ea_username || '');

        const platformInput = new TextInputBuilder()
          .setCustomId('ea_platform')
          .setLabel('Platform (ps5, ps4, xbox, pc)')
          .setPlaceholder('ps5, ps4, xbox, or pc')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(existingProfile?.ea_platform || 'ps5');

        modal.addComponents(
          new ActionRowBuilder().addComponents(usernameInput),
          new ActionRowBuilder().addComponents(platformInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // EA Panel - View Status button
      if (id === 'eapanel_status') {
        await interaction.deferReply({ flags: 64 });

        const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);
        const isLinked = !!currentClub?.ea_club_id;
        const isMonitoring = !!currentClub?.monitoring_enabled;
        const monitorKey = `${guildId}_${currentClub?.key}`;
        const isPolling = eaMonitoringIntervals.has(monitorKey);

        // Count linked players
        const { count: linkedPlayers } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .not('ea_username', 'is', null);

        // Count recent matches
        const { count: recentMatches } = await supabase
          .from('club_matches')
          .select('id', { count: 'exact', head: true })
          .eq('guild_id', guildId)
          .eq('club_key', currentClub?.key || '');

        const embed = new EmbedBuilder()
          .setTitle(`📊 EA Integration Status: ${currentClub?.name || 'No Club'}`)
          .setColor(isLinked ? (isMonitoring ? 0x00ff00 : 0xffcc00) : 0xff6600)
          .addFields(
            { name: '🔗 EA Club Linked', value: isLinked ? `✅ Yes (ID: ${currentClub.ea_club_id})` : '❌ Not linked', inline: true },
            { name: '📡 Platform', value: currentClub?.ea_platform || 'Not set', inline: true },
            { name: '🔄 Auto-Monitoring', value: isMonitoring ? (isPolling ? '🟢 Active (polling)' : '🟡 Enabled (not polling)') : '🔴 Disabled', inline: true },
            { name: '📊 Matches Tracked', value: `${recentMatches || 0}`, inline: true },
            { name: '👥 Players Linked', value: `${linkedPlayers || 0}`, inline: true },
            { name: '🕐 Last Match ID', value: currentClub?.last_match_id || 'None', inline: true }
          )
          .setFooter({ text: 'Enable monitoring to auto-track games • Link EA accounts to record player stats' });

        return interaction.editReply({ embeds: [embed] });
      }

      // EA Panel - Refresh button
      if (id === 'eapanel_refresh') {
        await interaction.update({
          embeds: [buildEaPanelEmbed(guildId, state)],
          components: buildEaPanelComponents(state)
        });
        return;
      }

      // =======================
      // RATINGS PANEL BUTTON HANDLERS
      // =======================

      // Ratings Panel - Leaderboard button
      if (id === 'ratingspanel_leaderboard') {
        await interaction.deferReply({ flags: 64 });

        const { error, data } = await callEdgeFunction('get-leaderboard', {
          guild_id: guildId,
          type: 'overall',
          limit: 15
        });

        if (error) {
          return interaction.editReply({ content: `❌ Failed to fetch leaderboard: ${error}` });
        }

        const players = data?.entries || data?.players || [];
        if (players.length === 0) {
          return interaction.editReply({ content: 'No players on the leaderboard yet. Play some games to get started!' });
        }

        const lines = players.map((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const rating = Math.round(p.overall_rating || 50);
          const pos = p.primary_position || '—';
          const name = p.ea_username || p.discord_username || 'Unknown';
          return `${medal} **${name}** • ${rating} OVR • ${pos}`;
        });

        const embed = new EmbedBuilder()
          .setTitle('📈 Server Leaderboard')
          .setColor(0x5865f2)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Based on overall rating • Top 15 players' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Ratings Panel - View Profile button
      if (id === 'ratingspanel_profile') {
        const modal = new ModalBuilder()
          .setCustomId('squadiq_profile_modal')
          .setTitle('View Player Profile');

        const playerInput = new TextInputBuilder()
          .setCustomId('profile_player')
          .setLabel('Player (leave empty for yourself)')
          .setPlaceholder('Enter Discord username or ID, or leave empty')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const row = new ActionRowBuilder().addComponents(playerInput);
        modal.addComponents(row);
        return interaction.showModal(modal);
      }

      // Ratings Panel - Scout Player button
      if (id === 'ratingspanel_scoutplayer') {
        await interaction.deferReply({ flags: 64 });

        const { data: players } = await supabase
          .from('player_summary')
          .select('discord_user_id, discord_username, overall_rating, primary_position')
          .eq('guild_id', guildId)
          .order('overall_rating', { ascending: false })
          .limit(25);

        if (!players || players.length === 0) {
          return interaction.editReply({ content: 'No players found in this server.' });
        }

        const options = players.map(p => ({
          label: `${p.discord_username || 'Unknown'} (${Math.round(p.overall_rating || 50)} OVR)`,
          value: p.discord_user_id,
          description: p.primary_position ? `Position: ${p.primary_position}` : 'Position: Unknown'
        }));

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('ratingspanel_scoutplayer_select')
          .setPlaceholder('Select a player to scout')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.editReply({
          content: '🎯 **Scout a Player**\n\nSelect a player to generate an AI-powered scouting report:',
          components: [row]
        });
      }

      // Ratings Panel - My Stats button
      if (id === 'ratingspanel_mystats') {
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
            { name: '⭐ Rating', value: `**${Math.round(data.overall_rating || 50)}**`, inline: true },
            { name: '🎮 Games', value: `${data.games_played || 0}`, inline: true },
            { name: '🏆 Wins', value: `${data.wins || 0} (${Math.round(data.win_rate || 0)}%)`, inline: true },
            { name: '⚽ Goals', value: `${data.total_goals || 0}`, inline: true },
            { name: '🎯 Assists', value: `${data.total_assists || 0}`, inline: true },
            { name: `${streakEmoji} Streak`, value: `${data.current_streak || 0}`, inline: true },
            { name: '📈 Recent Form', value: formText, inline: false }
          );

        return interaction.editReply({ embeds: [embed] });
      }

      // Ratings Panel - Form Check button
      if (id === 'ratingspanel_form') {
        await interaction.deferReply({ flags: 64 });

        const { data: players } = await supabase
          .from('player_summary')
          .select('discord_username, form_rating, current_streak, streak_type')
          .eq('guild_id', guildId)
          .order('form_rating', { ascending: false, nullsFirst: false })
          .limit(15);

        if (!players || players.length === 0) {
          return interaction.editReply({ content: 'No player form data available yet.' });
        }

        const lines = players.map((p, i) => {
          const form = Math.round(p.form_rating || 50);
          const streakEmoji = p.streak_type === 'win' ? '🔥' : p.streak_type === 'loss' ? '❄️' : '➖';
          const streak = p.current_streak || 0;
          return `${i + 1}. **${p.discord_username || 'Unknown'}** • Form: ${form} ${streakEmoji}${streak > 0 ? streak : ''}`;
        });

        const embed = new EmbedBuilder()
          .setTitle('🔥 Current Form')
          .setColor(0x5865f2)
          .setDescription(lines.join('\n'))
          .setFooter({ text: '🔥 = Win streak • ❄️ = Loss streak' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Ratings Panel - Achievements button
      if (id === 'ratingspanel_achievements') {
        await interaction.deferReply({ flags: 64 });

        const { data: achievements } = await supabase
          .from('player_achievements')
          .select('discord_user_id, achievement_name, achievement_icon, earned_at')
          .eq('guild_id', guildId)
          .order('earned_at', { ascending: false })
          .limit(20);

        if (!achievements || achievements.length === 0) {
          return interaction.editReply({ content: 'No achievements earned yet. Keep playing to unlock badges!' });
        }

        const lines = achievements.map(a => {
          const time = Math.floor(new Date(a.earned_at).getTime() / 1000);
          return `${a.achievement_icon} **${a.achievement_name}** • <t:${time}:R>`;
        });

        const embed = new EmbedBuilder()
          .setTitle('🏆 Recent Achievements')
          .setColor(0xffd700)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Showing last 20 achievements' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Ratings Panel - Refresh button
      if (id === 'ratingspanel_refresh') {
        await interaction.update({
          embeds: [buildRatingsPanelEmbed(guildId)],
          components: buildRatingsPanelComponents()
        });
        return;
      }

      // Ratings Panel - Scout Player select menu
      if (id === 'ratingspanel_scoutplayer_select') {
        const playerId = interaction.values[0];

        await interaction.update({
          content: '🔍 **Generating AI Scouting Report...**\n\nThis may take a few seconds.',
          components: []
        });

        try {
          const { error, data } = await callEdgeFunction('scout-player', {
            guild_id: guildId,
            player_id: playerId
          });

          if (error) {
            return interaction.editReply({ content: `❌ Failed to generate report: ${error}`, components: [] });
          }

          const playerData = data?.playerData || {};
          const analysis = data?.analysis || 'No analysis available.';

          const embed = new EmbedBuilder()
            .setTitle(`🎯 Scouting Report: ${playerData.discord_username || 'Unknown Player'}`)
            .setColor(0x5865f2)
            .setDescription(analysis.substring(0, 4000))
            .addFields(
              { name: '📊 Overall Rating', value: `${Math.round(playerData.overall_rating || 50)}`, inline: true },
              { name: '🎮 Games Played', value: `${playerData.games_played || 0}`, inline: true },
              { name: '📍 Position', value: playerData.primary_position || 'Unknown', inline: true }
            )
            .setFooter({ text: 'AI-powered analysis • SquadIQ Scouting' })
            .setTimestamp();

          return interaction.editReply({ content: null, embeds: [embed], components: [] });
        } catch (err) {
          return interaction.editReply({ content: `❌ Error: ${err.message}`, components: [] });
        }
      }

      // Scout Player select menu handler
      if (id === 'scoutpanel_scoutplayer_select') {
        const playerId = interaction.values[0];
        
        await interaction.update({
          content: '🔍 **Generating AI Scouting Report...**\n\nThis may take a few seconds as we analyze the player data.',
          components: []
        });

        try {
          // Call the scout-player edge function
          const { error, data } = await callEdgeFunction('scout-player', {
            guild_id: guildId,
            player_id: playerId
          });

          if (error) {
            return interaction.editReply({ 
              content: `❌ Failed to generate scouting report: ${error}`,
              components: []
            });
          }

          const playerData = data?.player_data || {};
          const analysis = data?.analysis || 'No analysis available.';
          const eaClubs = data?.ea_clubs || [];

          // Build clubs info
          let clubsText = '';
          if (eaClubs.length > 0) {
            clubsText = eaClubs.map(c => 
              `• **${c.club_name}** (${c.platform}): ${c.stats?.games_played || 0}G, ${c.stats?.wins || 0}W`
            ).join('\n');
          }

          // Build the scouting report embed
          const embed = new EmbedBuilder()
            .setTitle(`🎯 Scouting Report: ${playerData.profile?.username || 'Unknown Player'}`)
            .setColor(0x5865f2)
            .setDescription(analysis.length > 3500 ? analysis.substring(0, 3500) + '...' : analysis)
            .addFields(
              { name: '📊 Overall Rating', value: `${Math.round(playerData.overall?.rating || 50)}`, inline: true },
              { name: '🎮 Games Played', value: `${playerData.overall?.games_played || 0}`, inline: true },
              { name: '📍 Position', value: playerData.profile?.primary_position || 'Unknown', inline: true },
              { name: '🏆 Win Rate', value: `${Math.round(playerData.overall?.win_rate || 0)}%`, inline: true },
              { name: '⚽ Goals', value: `${playerData.overall?.goals || 0}`, inline: true },
              { name: '🅰️ Assists', value: `${playerData.overall?.assists || 0}`, inline: true }
            );

          // Add clubs found if any
          if (clubsText) {
            embed.addFields({ name: `🏟️ Clubs (${eaClubs.length})`, value: clubsText.substring(0, 1000), inline: false });
          }

          embed.setFooter({ text: 'AI-powered analysis • SquadIQ Scouting' });
          embed.setTimestamp();

          return interaction.editReply({ 
            content: null,
            embeds: [embed],
            components: []
          });
        } catch (err) {
          console.error('[Scout Player] Error:', err);
          return interaction.editReply({ 
            content: `❌ Error generating report: ${err.message}`,
            components: []
          });
        }
      }

      // Auto-link confirmation buttons (from DM)
      if (id.startsWith('autolink_confirm_')) {
        const parts = id.substring('autolink_confirm_'.length).split('_');
        const eaUsername = parts.slice(0, -1).join('_'); // Handle usernames with underscores
        const eaPlatform = parts[parts.length - 1];
        
        try {
          // Check if already linked
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id, ea_username')
            .eq('discord_user_id', interaction.user.id)
            .maybeSingle();
          
          if (existingProfile?.ea_username) {
            return interaction.update({
              content: `✅ You're already linked to EA account **${existingProfile.ea_username}**!`,
              embeds: [],
              components: []
            });
          }
          
          // Link the account
          if (existingProfile) {
            await supabase
              .from('profiles')
              .update({
                ea_username: eaUsername,
                ea_platform: eaPlatform,
                updated_at: new Date().toISOString()
              })
              .eq('discord_user_id', interaction.user.id);
          } else {
            await supabase
              .from('profiles')
              .insert({
                discord_user_id: interaction.user.id,
                discord_username: interaction.user.username,
                ea_username: eaUsername,
                ea_platform: eaPlatform
              });
          }
          
          const embed = new EmbedBuilder()
            .setTitle('✅ EA Account Linked!')
            .setColor(0x00ff00)
            .setDescription(
              `Your EA account **${eaUsername}** has been linked!\n\n` +
              `Your stats from club matches will now be automatically tracked and contribute to your ratings.`
            )
            .setFooter({ text: 'Welcome to SquadIQ!' });
          
          return interaction.update({ content: null, embeds: [embed], components: [] });
        } catch (err) {
          console.error('[AutoLink Confirm] Error:', err);
          return interaction.update({
            content: `❌ Error linking account: ${err.message}`,
            embeds: [],
            components: []
          });
        }
      }
      
      // Auto-link dismiss button
      if (id === 'autolink_dismiss') {
        return interaction.update({
          content: 'No problem! You can always link your EA account later using `/linkea` in the server.',
          embeds: [],
          components: []
        });
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
            { label: 'Set my position preferences', value: 'set_prefs', description: 'Edit your own preferences' },
            { label: 'Link my EA Username', value: 'link_ea', description: 'Connect your EA account for stats' }
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

      // EA Tools menu button
      if (id.startsWith('ea_tools_')) {
        const clubKey = id.substring('ea_tools_'.length);
        const club = getClubByKey(clubs, clubKey);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only managers can access EA tools.',
            flags: 64
          });
        }

        const isLinked = !!club?.ea_club_id;
        const isMonitoring = !!club?.monitoring_enabled;

        const options = [
          { label: isMonitoring ? '🔴 Disable EA Monitoring' : '🟢 Enable EA Monitoring', value: 'toggle_monitoring', description: isMonitoring ? 'Stop auto-fetching match stats' : 'Auto-fetch match stats every 2 min' },
          { label: '🔄 Sync Club History', value: 'sync_history', description: 'Fetch last 50 games from EA (no duplicates)' },
          { label: '🔗 Link EA Club', value: 'link_club', description: 'Connect this club to EA FC Pro Clubs' },
          { label: '🎮 Link My EA Account', value: 'link_ea', description: 'Link your EA username to Discord' },
          { label: '📊 EA Club Status', value: 'ea_status', description: 'View EA integration status' }
        ];

        const select = new StringSelectMenuBuilder()
          .setCustomId(`ea_tools_select_${clubKey}`)
          .setPlaceholder('Choose an EA tool')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(select);

        const statusText = isLinked 
          ? `✅ **${club.name}** is linked to EA Club ID: \`${club.ea_club_id}\` (${club.ea_platform})\n📡 Monitoring: ${isMonitoring ? '🟢 Active' : '🔴 Disabled'}`
          : `❌ **${club.name}** is not linked to an EA club yet.`;

        return interaction.reply({
          content: `📊 **EA Stats Tools**\n\n${statusText}\n\nChoose an action:`,
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

        // Update the club name
        currentClub.name = newName;
        await saveGuildSettings(guildId, state);
        await refreshClubPanels(guildId, clubKey);

        // If already linked to EA, just rename
        if (currentClub.ea_club_id) {
          return interaction.reply({ content: `Club renamed to **${newName}**.`, flags: 64 });
        }

        // Auto-search for EA club - try next-gen platforms first
        await interaction.deferReply({ flags: 64 });
        
        const nextGenPlatforms = ['ps5', 'xbox-series-xs', 'pc'];
        const oldGenPlatforms = ['ps4', 'xboxone'];
        let foundClub = null;
        let foundPlatform = null;

        // Try next-gen platforms first
        for (const platform of nextGenPlatforms) {
          try {
            const clubs = await searchClub({ name: newName, platform });
            if (clubs && clubs.length > 0) {
              foundClub = clubs[0];
              foundPlatform = platform;
              break;
            }
          } catch (err) {
            console.log(`[EA] Search failed for ${platform}:`, err.message);
          }
        }

        // If not found on next-gen, try old-gen
        if (!foundClub) {
          for (const platform of oldGenPlatforms) {
            try {
              const clubs = await searchClub({ name: newName, platform });
              if (clubs && clubs.length > 0) {
                foundClub = clubs[0];
                foundPlatform = platform;
                break;
              }
            } catch (err) {
              console.log(`[EA] Search failed for ${platform}:`, err.message);
            }
          }
        }

        if (foundClub && foundPlatform) {
          // Auto-link the EA club
          currentClub.ea_club_id = foundClub.clubId?.toString();
          currentClub.ea_platform = foundPlatform;
          currentClub.monitoring_enabled = true;
          currentClub.last_match_id = null;

          await saveGuildSettings(guildId, state);

          // Start monitoring
          startEaMonitoring(guildId, clubKey);

          // Auto-sync historical matches in background
          syncClubHistory(guildId, clubKey).then(result => {
            console.log(`[EA] Auto-link sync for ${currentClub.name}: ${result.synced} matches added`);
          }).catch(err => {
            console.error(`[EA] Auto-link sync error:`, err);
          });

          const embed = new EmbedBuilder()
            .setTitle('✅ Club Renamed & EA Linked!')
            .setColor(0x00ff00)
            .addFields(
              { name: '🏟️ Club Name', value: newName, inline: true },
              { name: '🎮 EA Club', value: foundClub.name || newName, inline: true },
              { name: '🖥️ Platform', value: EA_PLATFORM_NAMES[foundPlatform] || foundPlatform, inline: true }
            )
            .setDescription(
              `Found and linked EA club automatically!\n\n` +
              `📩 Match results will be auto-posted and stats recorded.\n` +
              `🔄 **Syncing match history in background...**\n\n` +
              `**Important:** Players need to use \`/linkea\` to connect their EA username for stats tracking.`
            );

          return interaction.editReply({ embeds: [embed] });
        } else {
          // Not found on any platform - just rename without EA linking
          const embed = new EmbedBuilder()
            .setTitle('✅ Club Renamed')
            .setColor(0xffcc00)
            .setDescription(
              `Club renamed to **${newName}**.\n\n` +
              `⚠️ Could not find an EA club with this name on any platform.\n` +
              `Use \`/setclub ${newName} <platform>\` to manually link your EA club.`
            );

          return interaction.editReply({ embeds: [embed] });
        }
      }

      // Link EA Username modal
      if (id === 'link_ea_modal') {
        const eaUsername = interaction.fields.getTextInputValue('ea_username').trim();
        if (!eaUsername) {
          return interaction.reply({ content: '❌ EA username cannot be empty.', flags: 64 });
        }

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

      // EA Panel - Link Club Modal
      if (id === 'eapanel_link_modal') {
        if (!isManager(interaction.member)) {
          return interaction.reply({ content: '❌ Only managers can link clubs.', flags: 64 });
        }

        const clubName = interaction.fields.getTextInputValue('ea_club_name').trim();
        const platform = interaction.fields.getTextInputValue('ea_platform').trim().toLowerCase();

        if (!clubName) {
          return interaction.reply({ content: '❌ Club name cannot be empty.', flags: 64 });
        }

        const validPlatforms = ['ps5', 'ps4', 'xbox', 'xbox-series-xs', 'xboxone', 'pc'];
        const normalizedPlatform = platform === 'xbox' ? 'xbox-series-xs' : platform;
        
        if (!validPlatforms.includes(platform) && !validPlatforms.includes(normalizedPlatform)) {
          return interaction.reply({ content: '❌ Invalid platform. Use: ps5, ps4, xbox, or pc', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          const clubs = await searchClub({ name: clubName, platform: normalizedPlatform });

          if (!clubs || clubs.length === 0) {
            return interaction.editReply({
              content: `❌ Could not find a club named **${clubName}** on ${EA_PLATFORM_NAMES[normalizedPlatform] || normalizedPlatform}.\n\nMake sure the name is exactly as it appears in EA FC Pro Clubs.`
            });
          }

          const eaClub = clubs[0];
          const currentClub = state.clubs?.find(c => c.key === state.currentClubKey);

          if (!currentClub) {
            return interaction.editReply({ content: '❌ No current club selected.' });
          }

          currentClub.ea_club_id = eaClub.clubId?.toString();
          currentClub.ea_platform = normalizedPlatform;
          currentClub.monitoring_enabled = true;
          currentClub.last_match_id = null;

          await saveGuildSettings(guildId, state);
          startEaMonitoring(guildId, currentClub.key);

          // Sync historical matches in background
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
              { name: '🖥️ Platform', value: EA_PLATFORM_NAMES[normalizedPlatform] || normalizedPlatform, inline: true },
              { name: '📡 Monitoring', value: '🟢 Active', inline: true }
            )
            .setDescription(`Now monitoring **${currentClub.name}** for division matches!\n\n📩 Match results will be auto-posted and stats recorded.\n🔄 **Syncing match history in background...**`);

          return interaction.editReply({ embeds: [embed] });

        } catch (err) {
          console.error('[EA] Error in eapanel_link_modal:', err);
          return interaction.editReply({ content: `❌ Failed to search EA: ${err.message}` });
        }
      }

      // =====================
      // SQUADIQ PANEL MODALS
      // =====================

      // Scout Club Modal
      if (id === 'squadiq_scout_modal') {
        const clubName = interaction.fields.getTextInputValue('scout_club_name').trim();
        if (!clubName) {
          return interaction.reply({ content: '❌ Club name cannot be empty.', flags: 64 });
        }

        await interaction.deferReply();

        try {
          const results = await searchClubsAcrossPlatforms(clubName);

          if (results.length === 0) {
            return interaction.editReply({
              content: `❌ No clubs found matching "${clubName}" on any platform.\n\nTry the exact club name as it appears in-game.`
            });
          }

          if (results.length === 1) {
            const chosen = results[0];
            const labelPlatform = FC_PLATFORM_LABELS[chosen.fcPlatform] || chosen.fcPlatform;

            await interaction.editReply({
              content: `Generating scouting report for **${chosen.name}** on **${labelPlatform}**...`
            });

            const { info, report } = await createScoutingReportFromId(
              chosen.fcPlatform,
              chosen.clubId,
              chosen.name,
              chosen.raw
            );

            const titleName = info?.name || chosen.name;
            const trimmed = report.length > 4000 ? report.slice(0, 4000) + '...' : report;

            const embed = new EmbedBuilder()
              .setTitle(`🔍 Scouting Report: ${titleName}`)
              .setColor(0x5865f2)
              .setDescription(trimmed)
              .setFooter({ text: `Platform: ${labelPlatform} • Club ID: ${chosen.clubId}` });

            return interaction.editReply({ content: null, embeds: [embed] });
          }

          // Multiple results - show selector
          pendingScoutChoices.set(interaction.user.id, { query: clubName, results });
          const options = results.slice(0, 25).map((r, i) => ({
            label: r.name.slice(0, 100),
            value: String(i),
            description: (FC_PLATFORM_LABELS[r.fcPlatform] || r.fcPlatform).slice(0, 100)
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId('scoutclub_pick')
            .setPlaceholder('Choose the correct club')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          return interaction.editReply({
            content: `Found ${results.length} clubs matching "${clubName}". Pick the correct one:`,
            components: [row]
          });
        } catch (err) {
          console.error('[Scout Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error searching for clubs: ${err.message}` });
        }
      }

      // Club Matches Modal
      if (id === 'squadiq_clubmatches_modal') {
        const clubName = interaction.fields.getTextInputValue('matches_club_name').trim();
        if (!clubName) {
          return interaction.reply({ content: '❌ Club name cannot be empty.', flags: 64 });
        }

        await interaction.deferReply();

        try {
          const results = await searchClubsAcrossPlatforms(clubName);

          if (results.length === 0) {
            return interaction.editReply({
              content: `❌ No clubs found matching "${clubName}" on any platform.`
            });
          }

          if (results.length === 1) {
            const chosen = results[0];
            const labelPlatform = FC_PLATFORM_LABELS[chosen.fcPlatform] || chosen.fcPlatform;

            await interaction.editReply({
              content: `Fetching recent matches for **${chosen.name}** on **${labelPlatform}**...`
            });

            const summaryText = await summarizeMatchesForClub(
              chosen.fcPlatform,
              chosen.clubId,
              chosen.name,
              chosen.raw
            );

            return interaction.editReply({ content: summaryText });
          }

          // Multiple results - show selector
          pendingMatchesChoices.set(interaction.user.id, { query: clubName, results });
          const options = results.slice(0, 25).map((r, i) => ({
            label: r.name.slice(0, 100),
            value: String(i),
            description: (FC_PLATFORM_LABELS[r.fcPlatform] || r.fcPlatform).slice(0, 100)
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId('clubmatches_pick')
            .setPlaceholder('Choose the correct club')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          return interaction.editReply({
            content: `Found ${results.length} clubs matching "${clubName}". Pick the correct one:`,
            components: [row]
          });
        } catch (err) {
          console.error('[ClubMatches Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error searching for clubs: ${err.message}` });
        }
      }

      // Match Preview Modal
      if (id === 'squadiq_matchpreview_modal') {
        const homeClub = interaction.fields.getTextInputValue('preview_home_club').trim();
        const awayClub = interaction.fields.getTextInputValue('preview_away_club').trim();

        if (!homeClub || !awayClub) {
          return interaction.reply({ content: '❌ Both club names are required.', flags: 64 });
        }

        await interaction.deferReply();

        try {
          const [homeResults, awayResults] = await Promise.all([
            searchClubsAcrossPlatforms(homeClub),
            searchClubsAcrossPlatforms(awayClub)
          ]);

          if (homeResults.length === 0) {
            return interaction.editReply({ content: `❌ No clubs found matching "${homeClub}" for home team.` });
          }
          if (awayResults.length === 0) {
            return interaction.editReply({ content: `❌ No clubs found matching "${awayClub}" for away team.` });
          }

          // If both have exactly one result, generate preview directly
          if (homeResults.length === 1 && awayResults.length === 1) {
            const home = homeResults[0];
            const away = awayResults[0];

            await interaction.editReply({
              content: `Generating match preview: **${home.name}** vs **${away.name}**...`
            });

            const report = await createMatchPreviewReport(home, away);

            const embed = new EmbedBuilder()
              .setTitle(`⚔️ Match Preview: ${home.name} vs ${away.name}`)
              .setColor(0xff6b35)
              .setDescription(report.length > 4000 ? report.slice(0, 4000) + '...' : report)
              .setFooter({ text: 'AI-powered match analysis' });

            return interaction.editReply({ content: null, embeds: [embed] });
          }

          // Need to select clubs - store state and show selectors
          pendingPreviewChoices.set(interaction.user.id, {
            homeQuery: homeClub,
            awayQuery: awayClub,
            homeResults,
            awayResults,
            homeIndex: homeResults.length === 1 ? 0 : null,
            awayIndex: awayResults.length === 1 ? 0 : null
          });

          // Show home selector first if needed
          if (homeResults.length > 1) {
            const options = homeResults.slice(0, 25).map((r, i) => ({
              label: r.name.slice(0, 100),
              value: String(i),
              description: (FC_PLATFORM_LABELS[r.fcPlatform] || r.fcPlatform).slice(0, 100)
            }));

            const select = new StringSelectMenuBuilder()
              .setCustomId('matchpreview_home_pick')
              .setPlaceholder('Select HOME club')
              .addOptions(options);

            const row = new ActionRowBuilder().addComponents(select);

            return interaction.editReply({
              content: `Found ${homeResults.length} clubs matching "${homeClub}". Select the **HOME** team:`,
              components: [row]
            });
          }

          // Home is selected, show away selector
          const options = awayResults.slice(0, 25).map((r, i) => ({
            label: r.name.slice(0, 100),
            value: String(i),
            description: (FC_PLATFORM_LABELS[r.fcPlatform] || r.fcPlatform).slice(0, 100)
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId('matchpreview_away_pick')
            .setPlaceholder('Select AWAY club')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          return interaction.editReply({
            content: `Found ${awayResults.length} clubs matching "${awayClub}". Select the **AWAY** team:`,
            components: [row]
          });
        } catch (err) {
          console.error('[MatchPreview Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      // Profile Modal
      if (id === 'squadiq_profile_modal') {
        const playerInput = interaction.fields.getTextInputValue('profile_player').trim();
        
        await interaction.deferReply({ flags: 64 });

        let targetUserId = interaction.user.id;
        let targetUsername = interaction.user.username;

        if (playerInput) {
          // Try to find the user by mention, ID, or username
          try {
            // Check if it's a mention format <@123456789>
            const mentionMatch = playerInput.match(/^<@!?(\d+)>$/);
            if (mentionMatch) {
              targetUserId = mentionMatch[1];
            } else if (/^\d+$/.test(playerInput)) {
              // It's a raw ID
              targetUserId = playerInput;
            } else {
              // Try to find by username in the guild
              const members = await interaction.guild.members.fetch({ query: playerInput, limit: 1 });
              const member = members.first();
              if (member) {
                targetUserId = member.id;
                targetUsername = member.user.username;
              }
            }
          } catch (err) {
            console.log('[Profile Modal] Could not find user:', playerInput);
          }
        }

        // Fetch profile data from Supabase
        try {
          const { data: summary } = await supabase
            .from('player_summary')
            .select('*')
            .eq('guild_id', guildId)
            .eq('discord_user_id', targetUserId)
            .maybeSingle();

          if (!summary) {
            return interaction.editReply({ content: `❌ No profile data found for this player. They need to play some games first!` });
          }

          const rating = Math.round(summary.overall_rating || 50);
          // win_rate is already stored as percentage (e.g., 44.0 for 44%)
          const winRate = Math.round(summary.win_rate || 0);
          const ratingBar = '█'.repeat(Math.floor(rating / 10)) + '░'.repeat(10 - Math.floor(rating / 10));

          const embed = new EmbedBuilder()
            .setTitle(`👤 Player Profile: ${summary.ea_username || summary.discord_username || targetUsername}`)
            .setColor(rating >= 70 ? 0x00ff00 : rating >= 50 ? 0xffcc00 : 0xff6b35)
            .addFields(
              { name: '⭐ Overall Rating', value: `**${rating}** \`${ratingBar}\``, inline: true },
              { name: '🎯 Position', value: summary.primary_position || 'Not set', inline: true },
              { name: '📊 Win Rate', value: `${winRate}%`, inline: true },
              { name: '🎮 Games Played', value: `${summary.games_played || 0}`, inline: true },
              { name: '⚽ Goals', value: `${summary.goals || 0}`, inline: true },
              { name: '🅰️ Assists', value: `${summary.assists || 0}`, inline: true },
              { name: '🔥 Current Streak', value: summary.streak_type ? `${summary.current_streak} ${summary.streak_type}` : 'None', inline: true },
              { name: '🏆 Wins', value: `${summary.wins || 0}`, inline: true },
              { name: '📈 Form', value: summary.form_rating ? `${Math.round(summary.form_rating)}` : 'N/A', inline: true }
            )
            .setFooter({ text: `Use /profile @player for full profile • Web: squadiq.lovable.app` });

          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          console.error('[Profile Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error fetching profile: ${err.message}` });
        }
      }

      // Link EA Modal
      if (id === 'squadiq_linkea_modal') {
        const eaUsername = interaction.fields.getTextInputValue('ea_username').trim();
        const eaPlatform = interaction.fields.getTextInputValue('ea_platform').trim().toLowerCase();
        
        // Validate platform
        const validPlatforms = ['ps5', 'ps4', 'xbox', 'xbox-series-xs', 'xboxone', 'pc'];
        let normalizedPlatform = eaPlatform;
        if (eaPlatform === 'xbox') normalizedPlatform = 'xbox-series-xs';
        if (eaPlatform === 'playstation' || eaPlatform === 'ps') normalizedPlatform = 'ps5';
        
        if (!validPlatforms.includes(normalizedPlatform) && !validPlatforms.includes(eaPlatform)) {
          return interaction.reply({
            content: '❌ Invalid platform. Use: ps5, ps4, xbox, or pc',
            flags: 64
          });
        }
        
        await interaction.deferReply({ flags: 64 });
        
        try {
          // Update or create profile with EA username
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('discord_user_id', interaction.user.id)
            .single();
          
          if (existingProfile) {
            await supabase
              .from('profiles')
              .update({
                ea_username: eaUsername,
                ea_platform: normalizedPlatform,
                updated_at: new Date().toISOString()
              })
              .eq('discord_user_id', interaction.user.id);
          } else {
            await supabase
              .from('profiles')
              .insert({
                discord_user_id: interaction.user.id,
                discord_username: interaction.user.username,
                ea_username: eaUsername,
                ea_platform: normalizedPlatform
              });
          }
          
          return interaction.editReply({
            content: `✅ **EA Account Linked!**\n\n` +
              `🎮 **Username:** ${eaUsername}\n` +
              `🖥️ **Platform:** ${EA_PLATFORM_NAMES[normalizedPlatform] || normalizedPlatform}\n\n` +
              `Your stats from club matches will now be automatically tracked!`
          });
        } catch (err) {
          console.error('[LinkEA Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error linking EA account: ${err.message}` });
        }
      }

      // Scout Player by EA Username Modal
      if (id === 'scoutplayer_ea_modal') {
        const eaUsername = interaction.fields.getTextInputValue('ea_username').trim();
        
        if (!eaUsername) {
          return interaction.reply({ content: '❌ EA username cannot be empty.', flags: 64 });
        }

        await interaction.deferReply();

        try {
          // Call the scout-player edge function with EA username lookup
          const { error, data } = await callEdgeFunction('scout-player', {
            ea_username: eaUsername,
            search_ea: true
          });

          if (error) {
            return interaction.editReply({ 
              content: `❌ Failed to scout player: ${error}\n\nMake sure the EA username is exact and the player is in a tracked club.`
            });
          }

          const playerData = data?.player_data || {};
          const analysis = data?.analysis || 'No analysis available.';
          const eaClubs = data?.ea_clubs || [];

          // Build clubs info
          let clubsText = '';
          if (eaClubs.length > 0) {
            clubsText = eaClubs.map(c => 
              `• **${c.club_name}** (${c.platform}): ${c.stats?.games_played || 0}G, ${c.stats?.wins || 0}W, ${c.stats?.goals || 0}⚽, ${c.stats?.assists || 0}🅰️`
            ).join('\n');
          }

          // Build the scouting report embed
          const embed = new EmbedBuilder()
            .setTitle(`🎯 EA Scouting Report: ${eaUsername}`)
            .setColor(playerData.profile?.is_discord_member ? 0x5865f2 : 0xff9500)
            .setDescription(analysis.length > 3500 ? analysis.substring(0, 3500) + '...' : analysis);

          // Add stats fields
          if (playerData.overall) {
            embed.addFields(
              { name: '📊 Rating', value: `${Math.round(playerData.overall.rating || 0)}`, inline: true },
              { name: '🎮 Games', value: `${playerData.overall.games_played || 0}`, inline: true },
              { name: '🏆 Win Rate', value: `${Math.round(playerData.overall.win_rate || 0)}%`, inline: true },
              { name: '⚽ Goals', value: `${playerData.overall.goals || 0}`, inline: true },
              { name: '🅰️ Assists', value: `${playerData.overall.assists || 0}`, inline: true },
              { name: '📍 Position', value: playerData.profile?.primary_position || 'Unknown', inline: true }
            );
          }

          // Add clubs found
          if (clubsText) {
            embed.addFields({ name: `🏟️ Clubs Found (${eaClubs.length})`, value: clubsText.substring(0, 1000), inline: false });
          }

          embed.setFooter({ 
            text: playerData.profile?.is_discord_member 
              ? '✅ Discord Member • AI-powered analysis' 
              : '⚠️ External Player • AI-powered analysis'
          });
          embed.setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          console.error('[Scout EA Player] Error:', err);
          return interaction.editReply({ content: `❌ Error generating report: ${err.message}` });
        }
      }

      // Create Scouting List Modal
      if (id === 'scoutpanel_createlist_modal') {
        const listName = interaction.fields.getTextInputValue('list_name').trim();
        const listDesc = interaction.fields.getTextInputValue('list_description')?.trim() || null;

        if (!listName) {
          return interaction.reply({ content: '❌ List name is required.', flags: 64 });
        }

        try {
          await supabase.from('scouting_lists').insert({
            guild_id: guildId,
            name: listName,
            description: listDesc,
            created_by_discord_id: interaction.user.id,
            player_ids: [],
            is_public: false
          });

          return interaction.reply({
            content: `✅ **Scouting list "${listName}" created!**\n\nUse the Scout Player button to add players to your list.`,
            flags: 64
          });
        } catch (err) {
          return interaction.reply({ content: `❌ Failed to create list: ${err.message}`, flags: 64 });
        }
      }

      // Win Probability Modal
      if (id === 'scoutpanel_winprob_modal') {
        const team1Input = interaction.fields.getTextInputValue('winprob_team1').trim();
        const team2Input = interaction.fields.getTextInputValue('winprob_team2').trim();

        await interaction.deferReply({ flags: 64 });

        try {
          const { error, data } = await callEdgeFunction('win-probability', {
            guild_id: guildId,
            team1_names: team1Input.split(',').map(n => n.trim()),
            team2_names: team2Input.split(',').map(n => n.trim())
          });

          if (error) {
            return interaction.editReply({ content: `❌ Failed to calculate: ${error}` });
          }

          const embed = new EmbedBuilder()
            .setTitle('🎲 Win Probability Analysis')
            .setColor(0x5865f2)
            .addFields(
              { name: '🔵 Team 1', value: `${Math.round(data?.team1_probability || 50)}%`, inline: true },
              { name: '🔴 Team 2', value: `${Math.round(data?.team2_probability || 50)}%`, inline: true }
            )
            .setDescription(data?.analysis || 'Based on player ratings and recent form.')
            .setFooter({ text: 'AI-powered prediction • SquadIQ' })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      // Link EA Club Modal (from EA Tools)
      if (id.startsWith('link_ea_club_modal_')) {
        const clubKey = id.substring('link_ea_club_modal_'.length);
        const eaClubName = interaction.fields.getTextInputValue('ea_club_name').trim();
        const eaPlatform = interaction.fields.getTextInputValue('ea_platform').trim().toLowerCase();

        // Validate platform
        const validPlatforms = ['ps5', 'ps4', 'xbox', 'xbox-series-xs', 'xboxone', 'pc'];
        let normalizedPlatform = eaPlatform;
        if (eaPlatform === 'xbox') normalizedPlatform = 'xbox-series-xs';
        if (eaPlatform === 'playstation' || eaPlatform === 'ps') normalizedPlatform = 'ps5';

        if (!validPlatforms.includes(normalizedPlatform) && !validPlatforms.includes(eaPlatform)) {
          return interaction.reply({
            content: '❌ Invalid platform. Use: ps5, ps4, xbox, or pc',
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          // Search for the club on EA
          const results = await searchClub({ name: eaClubName, platform: normalizedPlatform });

          if (!results || results.length === 0) {
            return interaction.editReply({
              content: `❌ Could not find a club named **${eaClubName}** on ${EA_PLATFORM_NAMES[normalizedPlatform] || normalizedPlatform}.\n\nMake sure the name is exactly as it appears in EA FC Pro Clubs.`
            });
          }

          // Use the first (best) match
          const eaClub = results[0];
          const club = state.clubs?.find(c => c.key === clubKey);

          if (!club) {
            return interaction.editReply({ content: '❌ Club not found in server settings.' });
          }

          // Update the club with EA info
          club.ea_club_id = eaClub.clubId;
          club.ea_platform = normalizedPlatform;
          club.monitoring_enabled = true;
          club.last_match_id = null;

          await saveGuildSettings(guildId, state);

          // Start monitoring and sync history
          startEaMonitoring(guildId, clubKey);
          const syncResult = await syncClubHistory(guildId, clubKey, 50);

          await refreshClubPanels(guildId, clubKey);

          const embed = new EmbedBuilder()
            .setTitle('✅ EA Club Linked Successfully!')
            .setColor(0x00ff00)
            .addFields(
              { name: '🎮 EA Club', value: eaClub.name || eaClubName, inline: true },
              { name: '🆔 Club ID', value: eaClub.clubId, inline: true },
              { name: '🖥️ Platform', value: EA_PLATFORM_NAMES[normalizedPlatform] || normalizedPlatform, inline: true },
              { name: '📊 Matches Synced', value: `${syncResult.synced} new (${syncResult.skipped} already existed)`, inline: true },
              { name: '📡 Monitoring', value: '🟢 Active', inline: true }
            )
            .setDescription('EA stats will now be automatically tracked every 2 minutes!')
            .setFooter({ text: 'Players need to link their EA accounts with /linkea to receive personal stats' });

          return interaction.editReply({ embeds: [embed] });

        } catch (err) {
          console.error('[Link EA Club Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error linking EA club: ${err.message}` });
        }
      }

      // Link EA Modal (from Spot Panel)
      if (id === 'link_ea_modal') {
        const eaUsername = interaction.fields.getTextInputValue('ea_username').trim();
        const eaPlatform = interaction.fields.getTextInputValue('ea_platform').trim().toLowerCase();

        // Validate platform
        const validPlatforms = ['ps5', 'ps4', 'xbox', 'xbox-series-xs', 'xboxone', 'pc'];
        let normalizedPlatform = eaPlatform;
        if (eaPlatform === 'xbox') normalizedPlatform = 'xbox-series-xs';
        if (eaPlatform === 'playstation' || eaPlatform === 'ps') normalizedPlatform = 'ps5';

        if (!validPlatforms.includes(normalizedPlatform) && !validPlatforms.includes(eaPlatform)) {
          return interaction.reply({
            content: '❌ Invalid platform. Use: ps5, ps4, xbox, or pc',
            flags: 64
          });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          // Update or create profile with EA username
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('discord_user_id', interaction.user.id)
            .maybeSingle();

          if (existingProfile) {
            await supabase
              .from('profiles')
              .update({
                ea_username: eaUsername,
                ea_platform: normalizedPlatform,
                updated_at: new Date().toISOString()
              })
              .eq('discord_user_id', interaction.user.id);
          } else {
            await supabase
              .from('profiles')
              .insert({
                discord_user_id: interaction.user.id,
                discord_username: interaction.user.username,
                ea_username: eaUsername,
                ea_platform: normalizedPlatform
              });
          }

          return interaction.editReply({
            content: `✅ **EA Account Linked!**\n\n` +
              `🎮 **Username:** ${eaUsername}\n` +
              `🖥️ **Platform:** ${EA_PLATFORM_NAMES[normalizedPlatform] || normalizedPlatform}\n\n` +
              `Your stats from club matches will now be automatically tracked!`
          });
        } catch (err) {
          console.error('[Link EA Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error linking EA account: ${err.message}` });
        }
      }

      // Draft Result Modal
      if (id.startsWith('draft_result_modal_')) {
        const draftId = id.substring('draft_result_modal_'.length);
        const teamAScore = parseInt(interaction.fields.getTextInputValue('team_a_score'), 10);
        const teamBScore = parseInt(interaction.fields.getTextInputValue('team_b_score'), 10);
        
        if (isNaN(teamAScore) || isNaN(teamBScore) || teamAScore < 0 || teamBScore < 0) {
          return interaction.reply({
            content: '❌ Invalid scores. Please enter valid numbers.',
            flags: 64
          });
        }
        
        await interaction.deferReply({ flags: 64 });
        
        try {
          const { error, data } = await callEdgeFunction('draft-result', {
            draft_id: draftId,
            reporter_discord_id: interaction.user.id,
            team_a_score: teamAScore,
            team_b_score: teamBScore
          });
          
          if (error) {
            return interaction.editReply({ content: `❌ Failed to report result: ${error}` });
          }
          
          const winner = teamAScore > teamBScore ? '🔴 Team A' : teamBScore > teamAScore ? '🔵 Team B' : '🤝 Draw';
          
          const embed = new EmbedBuilder()
            .setTitle('📝 Draft Result Reported')
            .setColor(0x5865f2)
            .addFields(
              { name: 'Score', value: `🔴 Team A: **${teamAScore}** - 🔵 Team B: **${teamBScore}**`, inline: false },
              { name: 'Winner', value: winner, inline: true },
              { name: 'Status', value: data.status === 'confirmed' ? '✅ Confirmed' : '⏳ Awaiting confirmation', inline: true }
            )
            .setDescription(
              data.status === 'confirmed' 
                ? '✅ Result confirmed! Stats recorded and feedback requests sent.'
                : `⏳ Need ${data.confirmations_needed || 1} more confirmation(s) from other players.`
            );
          
          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          console.error('[Draft Result Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error reporting result: ${err.message}` });
        }
      }

      // Event Create Modal
      if (id === 'squadiq_event_create_modal') {
        const eventTitle = interaction.fields.getTextInputValue('event_title').trim();
        const eventDate = interaction.fields.getTextInputValue('event_date').trim();
        const eventType = interaction.fields.getTextInputValue('event_type')?.trim() || 'match';

        if (!eventTitle || !eventDate) {
          return interaction.reply({ content: '❌ Title and date are required.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          // Parse the date
          const scheduledAt = new Date(eventDate);
          if (isNaN(scheduledAt.getTime())) {
            return interaction.editReply({ content: '❌ Invalid date format. Use YYYY-MM-DD HH:MM' });
          }

          const { data: event, error } = await supabase
            .from('availability_events')
            .insert({
              guild_id: guildId,
              title: eventTitle,
              event_type: eventType,
              scheduled_at: scheduledAt.toISOString(),
              created_by_discord_id: interaction.user.id,
              channel_id: interaction.channel?.id
            })
            .select()
            .single();

          if (error) {
            return interaction.editReply({ content: `❌ Failed to create event: ${error.message}` });
          }

          const embed = new EmbedBuilder()
            .setTitle(`📅 ${eventTitle}`)
            .setColor(0x5865f2)
            .setDescription(`**Type:** ${eventType}\n**When:** ${scheduledAt.toLocaleString()}\n\nRespond with your availability!`)
            .setFooter({ text: 'Click a button to respond' });

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`event_yes_${event.id}`).setLabel('✅ Available').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`event_no_${event.id}`).setLabel('❌ Unavailable').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`event_maybe_${event.id}`).setLabel('❓ Maybe').setStyle(ButtonStyle.Secondary)
          );

          await interaction.editReply({
            content: '✅ Event created!',
            embeds: [embed],
            components: [buttons]
          });
        } catch (err) {
          console.error('[Event Create Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      // Team Create Modal
      if (id === 'squadiq_team_create_modal') {
        const teamName = interaction.fields.getTextInputValue('team_name').trim();
        const teamType = interaction.fields.getTextInputValue('team_type')?.trim() || 'comp';
        const captainId = interaction.fields.getTextInputValue('team_captain')?.trim() || null;

        if (!teamName) {
          return interaction.reply({ content: '❌ Team name is required.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
          const { data: team, error } = await supabase
            .from('teams')
            .insert({
              guild_id: guildId,
              name: teamName,
              team_type: teamType,
              captain_discord_id: captainId,
              manager_discord_ids: [interaction.user.id]
            })
            .select()
            .single();

          if (error) {
            return interaction.editReply({ content: `❌ Failed to create team: ${error.message}` });
          }

          return interaction.editReply({
            content: `✅ **Team "${teamName}" created!**\n\n` +
              `**Type:** ${teamType}\n` +
              `**Captain:** ${captainId ? `<@${captainId}>` : 'Not set'}\n\n` +
              `Manage your team roster at squadiq.lovable.app/teams`
          });
        } catch (err) {
          console.error('[Team Create Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      // Build Manual Entry Modal
      if (id === 'squadiq_build_manual_modal') {
        const position = interaction.fields.getTextInputValue('build_position').trim().toUpperCase();
        const height = interaction.fields.getTextInputValue('build_height')?.trim() || null;
        const playstyles = interaction.fields.getTextInputValue('build_playstyles')?.trim() || null;

        await interaction.deferReply({ flags: 64 });

        try {
          const { error } = await supabase
            .from('player_build_profiles')
            .upsert({
              guild_id: guildId,
              discord_user_id: interaction.user.id,
              position: position,
              height_cm: height ? parseInt(height) : null,
              playstyles: playstyles ? playstyles.split(',').map(p => p.trim()) : [],
              verified: false
            }, { onConflict: 'guild_id,discord_user_id,position' });

          if (error) {
            return interaction.editReply({ content: `❌ Failed to save build: ${error.message}` });
          }

          return interaction.editReply({
            content: `✅ **Build Saved!**\n\n` +
              `**Position:** ${position}\n` +
              `**Height:** ${height || 'Not specified'}cm\n` +
              `**Playstyles:** ${playstyles || 'None specified'}\n\n` +
              `⏳ Awaiting admin verification. Once verified, this will contribute to your Build Quality rating!`
          });
        } catch (err) {
          console.error('[Build Manual Modal] Error:', err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }
    }

    // ----- Select Menus -----
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      // =======================
      // SCOUTING SELECT MENUS
      // =======================

      // Scout club pick
      if (id === 'scoutclub_pick') {
        const userId = interaction.user.id;
        const scoutState = pendingScoutChoices.get(userId);

        if (!scoutState) {
          return interaction.reply({
            content: 'No pending club selection found. Please run `/scoutclub` again.',
            flags: 64
          });
        }

        const index = parseInt(interaction.values[0], 10);
        const chosen = scoutState.results[index];
        if (!chosen) {
          return interaction.reply({
            content: 'Invalid club selection. Please run `/scoutclub` again.',
            flags: 64
          });
        }

        pendingScoutChoices.delete(userId);
        const labelPlatform = FC_PLATFORM_LABELS[chosen.fcPlatform] || chosen.fcPlatform;

        await interaction.deferUpdate();
        await interaction.editReply({
          content: `Generating scouting report for **${chosen.name}** on **${labelPlatform}**...`,
          embeds: [],
          components: []
        });

        try {
          const { info, report } = await createScoutingReportFromId(
            chosen.fcPlatform,
            chosen.clubId,
            chosen.name,
            chosen.raw
          );

          const titleName = info?.name || chosen.name;
          const trimmed = report.length > 4000 ? report.slice(0, 4000) + '...' : report;

          const embed = new EmbedBuilder()
            .setTitle(`🔍 Scouting Report: ${titleName}`)
            .setColor(0x5865f2)
            .setDescription(trimmed)
            .setFooter({ text: `Platform: ${labelPlatform} • Club ID: ${chosen.clubId}` });

          return interaction.editReply({ content: null, embeds: [embed] });
        } catch (err) {
          console.error('❌ Error creating scouting report (select):', err);
          let msg = 'I found the club, but failed to generate a scouting report.';
          if (err.code === 'insufficient_data') {
            msg = 'I found the club, but EA did not return enough stats or match history to generate a meaningful scouting report.';
          }
          return interaction.editReply({ content: msg, embeds: [], components: [] });
        }
      }

      // Club matches pick
      if (id === 'clubmatches_pick') {
        const userId = interaction.user.id;
        const matchesState = pendingMatchesChoices.get(userId);

        if (!matchesState) {
          return interaction.reply({
            content: 'No pending club selection found. Please run `/clubmatches` again.',
            flags: 64
          });
        }

        const index = parseInt(interaction.values[0], 10);
        const chosen = matchesState.results[index];
        if (!chosen) {
          return interaction.reply({
            content: 'Invalid club selection. Please run `/clubmatches` again.',
            flags: 64
          });
        }

        pendingMatchesChoices.delete(userId);
        const labelPlatform = FC_PLATFORM_LABELS[chosen.fcPlatform] || chosen.fcPlatform;

        await interaction.deferUpdate();
        await interaction.editReply({
          content: `Fetching recent matches for **${chosen.name}** on **${labelPlatform}**...`,
          embeds: [],
          components: []
        });

        try {
          const summaryText = await summarizeMatchesForClub(
            chosen.fcPlatform,
            chosen.clubId,
            chosen.name,
            chosen.raw
          );

          return interaction.editReply({ content: summaryText, embeds: [], components: [] });
        } catch (err) {
          console.error('❌ Error summarizing matches (select):', err);
          return interaction.editReply({
            content: 'I found the club, but failed to fetch match history from EA.',
            embeds: [],
            components: []
          });
        }
      }

      // Match preview picks
      if (id === 'matchpreview_home_pick' || id === 'matchpreview_away_pick') {
        const userId = interaction.user.id;
        const previewState = pendingPreviewChoices.get(userId);

        if (!previewState) {
          return interaction.reply({
            content: 'No pending match preview selection found. Please run `/matchpreview` again.',
            flags: 64
          });
        }

        const index = parseInt(interaction.values[0], 10);
        const isHome = id === 'matchpreview_home_pick';

        if (Number.isNaN(index)) {
          return interaction.reply({
            content: 'Invalid selection. Please run `/matchpreview` again.',
            flags: 64
          });
        }

        if (isHome) {
          if (!previewState.homeResults[index]) {
            return interaction.reply({
              content: 'Invalid home club selection. Please run `/matchpreview` again.',
              flags: 64
            });
          }
          previewState.homeIndex = index;
        } else {
          if (!previewState.awayResults[index]) {
            return interaction.reply({
              content: 'Invalid away club selection. Please run `/matchpreview` again.',
              flags: 64
            });
          }
          previewState.awayIndex = index;
        }

        // If both sides are now chosen, generate the preview
        if (previewState.homeIndex != null && previewState.awayIndex != null) {
          const home = previewState.homeResults[previewState.homeIndex];
          const away = previewState.awayResults[previewState.awayIndex];

          pendingPreviewChoices.delete(userId);

          const homeLabel = FC_PLATFORM_LABELS[home.fcPlatform] || home.fcPlatform;
          const awayLabel = FC_PLATFORM_LABELS[away.fcPlatform] || away.fcPlatform;

          await interaction.deferUpdate();
          await interaction.editReply({
            content: `Generating match preview for **${home.name}** vs **${away.name}**...`,
            embeds: [],
            components: []
          });

          try {
            const { homeInfo, awayInfo, preview } = await createMatchPreviewReport(home, away);

            const homeTitle = homeInfo?.name || home.name;
            const awayTitle = awayInfo?.name || away.name;
            const trimmed = preview.length > 4000 ? preview.slice(0, 4000) + '...' : preview;

            const embed = new EmbedBuilder()
              .setTitle(`⚔️ Match Preview: ${homeTitle} vs ${awayTitle}`)
              .setColor(0x5865f2)
              .setDescription(trimmed);

            return interaction.editReply({ content: null, embeds: [embed] });
          } catch (err) {
            console.error('❌ Error creating match preview (select):', err);
            let msg = 'I found both clubs, but failed to generate a match preview.';
            if (err.code === 'insufficient_data') {
              msg = 'I found both clubs, but EA did not return enough stats or match history to generate a meaningful match preview.';
            }
            return interaction.editReply({ content: msg, embeds: [], components: [] });
          }
        }

        // One side chosen, still waiting for the other
        await interaction.deferUpdate();
        return;
      }

      // Viewer club select

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
        if (choice === 'link_ea') {
          // Check if user already has an EA username linked
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('ea_username')
            .eq('discord_user_id', interaction.user.id)
            .single();

          const modal = new ModalBuilder()
            .setCustomId('link_ea_modal')
            .setTitle('Link EA Username')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('ea_username')
                  .setLabel('Your EA FC Pro Clubs username')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Enter your EA username exactly as it appears in-game')
                  .setRequired(true)
                  .setValue(existingProfile?.ea_username || '')
              )
            );

          await interaction.showModal(modal);
          return;
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
            return interaction.update({ content: 'All available club slots are already in use (max 10).', components: [] });
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

      // EA Tools select menu
      if (id.startsWith('ea_tools_select_')) {
        const clubKey = id.substring('ea_tools_select_'.length);
        const choice = interaction.values[0];

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: '❌ Only managers can use EA tools.',
            flags: 64
          });
        }

        const club = getClubByKey(clubs, clubKey);
        if (!club) {
          return interaction.reply({ content: 'Unknown club selected.', flags: 64 });
        }

        if (choice === 'toggle_monitoring') {
          if (!club.ea_club_id) {
            return interaction.update({
              content: '❌ You must link this club to an EA club first using "Link EA Club".',
              components: []
            });
          }

          club.monitoring_enabled = !club.monitoring_enabled;
          await saveGuildSettings(guildId, state);

          if (club.monitoring_enabled) {
            startEaMonitoring(guildId, clubKey);
            // Also sync history immediately when enabling
            await interaction.deferUpdate();
            const result = await syncClubHistory(guildId, clubKey, 50);
            await refreshClubPanels(guildId, clubKey);
            return interaction.followUp({
              content: `✅ **EA Monitoring Enabled** for **${club.name}**!\n\n📊 Synced ${result.synced} matches (${result.skipped} already existed).\n\n📡 Will check for new games every 2 minutes.`,
              flags: 64
            });
          } else {
            stopEaMonitoring(guildId, clubKey);
            await refreshClubPanels(guildId, clubKey);
            return interaction.update({
              content: `🔴 **EA Monitoring Disabled** for **${club.name}**.\n\nNo longer auto-fetching match stats.`,
              components: []
            });
          }
        }

        if (choice === 'sync_history') {
          if (!club.ea_club_id) {
            return interaction.update({
              content: '❌ You must link this club to an EA club first using "Link EA Club".',
              components: []
            });
          }

          await interaction.deferUpdate();
          const result = await syncClubHistory(guildId, clubKey, 50);

          if (result.error) {
            return interaction.followUp({
              content: `❌ Error syncing history: ${result.error}`,
              flags: 64
            });
          }

          return interaction.followUp({
            content: `✅ **History Synced for ${club.name}!**\n\n` +
              `📊 **${result.synced}** new matches recorded\n` +
              `⏭️ **${result.skipped}** matches already existed (skipped)\n\n` +
              `Player stats have been updated and feedback DMs sent.`,
            flags: 64
          });
        }

        if (choice === 'link_club') {
          const modal = new ModalBuilder()
            .setCustomId(`link_ea_club_modal_${clubKey}`)
            .setTitle('Link EA Club');

          const clubNameInput = new TextInputBuilder()
            .setCustomId('ea_club_name')
            .setLabel('EA FC Pro Clubs Team Name')
            .setPlaceholder('Enter your club name exactly as it appears')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(club.name || '');

          const platformInput = new TextInputBuilder()
            .setCustomId('ea_platform')
            .setLabel('Platform (ps5, ps4, xbox, pc)')
            .setPlaceholder('ps5, ps4, xbox, or pc')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(club.ea_platform || 'ps5');

          modal.addComponents(
            new ActionRowBuilder().addComponents(clubNameInput),
            new ActionRowBuilder().addComponents(platformInput)
          );

          await interaction.showModal(modal);
          return;
        }

        if (choice === 'link_ea') {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('ea_username, ea_platform')
            .eq('discord_user_id', interaction.user.id)
            .maybeSingle();

          const modal = new ModalBuilder()
            .setCustomId('link_ea_modal')
            .setTitle('Link Your EA Account');

          const usernameInput = new TextInputBuilder()
            .setCustomId('ea_username')
            .setLabel('Your EA FC Pro Clubs username')
            .setPlaceholder('Exactly as it appears in-game')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(existingProfile?.ea_username || '');

          const platformInput = new TextInputBuilder()
            .setCustomId('ea_platform')
            .setLabel('Platform (ps5, ps4, xbox, pc)')
            .setPlaceholder('ps5, ps4, xbox, or pc')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(existingProfile?.ea_platform || 'ps5');

          modal.addComponents(
            new ActionRowBuilder().addComponents(usernameInput),
            new ActionRowBuilder().addComponents(platformInput)
          );

          await interaction.showModal(modal);
          return;
        }

        if (choice === 'ea_status') {
          const isLinked = !!club.ea_club_id;
          const isMonitoring = !!club.monitoring_enabled;
          const monitorKey = `${guildId}_${clubKey}`;
          const isPolling = eaMonitoringIntervals.has(monitorKey);

          // Count linked players
          const { count: linkedPlayers } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .not('ea_username', 'is', null);

          // Count recent matches
          const { count: recentMatches } = await supabase
            .from('club_matches')
            .select('id', { count: 'exact', head: true })
            .eq('guild_id', guildId)
            .eq('club_key', clubKey);

          const embed = new EmbedBuilder()
            .setTitle(`📊 EA Integration Status: ${club.name}`)
            .setColor(isLinked ? (isMonitoring ? 0x00ff00 : 0xffcc00) : 0xff6600)
            .addFields(
              { name: '🔗 EA Club Linked', value: isLinked ? `✅ Yes (ID: ${club.ea_club_id})` : '❌ Not linked', inline: true },
              { name: '📡 Platform', value: club.ea_platform || 'Not set', inline: true },
              { name: '🔄 Auto-Monitoring', value: isMonitoring ? (isPolling ? '🟢 Active (polling)' : '🟡 Enabled (not polling)') : '🔴 Disabled', inline: true },
              { name: '📊 Matches Tracked', value: `${recentMatches || 0}`, inline: true },
              { name: '👥 Players Linked', value: `${linkedPlayers || 0}`, inline: true },
              { name: '🕐 Last Match ID', value: club.last_match_id || 'None', inline: true }
            )
            .setFooter({ text: 'Enable monitoring to auto-track games • Link EA accounts to record player stats' });

          return interaction.update({ content: null, embeds: [embed], components: [] });
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
    
    // Sync club stats (skill rating, record, etc.) - runs locally to avoid EA blocking
    await syncClubStatsLocal(guildId, clubKey, club.ea_club_id, club.ea_platform);
    
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
    
    // Extract player stats with expanded fields
    const playerStats = [];
    const players = matchData.players?.[club.ea_club_id] || {};
    
    for (const [eaPlayerId, pStats] of Object.entries(players)) {
      playerStats.push({
        ea_username: pStats.playername,
        goals: parseInt(pStats.goals || 0),
        assists: parseInt(pStats.assists || 0),
        rating: parseFloat(pStats.rating || 0),
        position: pStats.pos,
        motm: pStats.mom === '1',
        // Expanded stats
        shots: parseInt(pStats.shots || 0),
        tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
        passes_made: parseInt(pStats.passesmade || 0),
        pass_attempts: parseInt(pStats.passattempts || 0),
        red_cards: pStats.redcards === '1' || pStats.redCards === '1'
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
    // Only track stats for players who are members of THIS guild
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    
    for (const pStat of playerStats) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('ea_username', pStat.ea_username)
        .maybeSingle();
      
      if (profile) {
        // Verify this player is a member of this guild
        let isMember = false;
        if (guild) {
          try {
            const member = await guild.members.fetch(profile.discord_user_id).catch(() => null);
            isMember = !!member;
          } catch {
            isMember = false;
          }
        }
        
        if (!isMember) {
          console.log(`[EA] Skipping stats for ${pStat.ea_username} - not a member of guild ${guildId}`);
          continue;
        }
        
        // Record player stats with expanded fields
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
          man_of_match: pStat.motm,
          // Expanded stats
          shots: pStat.shots,
          tackles: pStat.tackles,
          passes_made: pStat.passes_made,
          pass_attempts: pStat.pass_attempts,
          red_cards: pStat.red_cards
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
        result, scoreFor, scoreAgainst, opponentName, playerStats, clubName: club.name, matchId
      });
    }
    
    // Create feedback requests for players in this match
    await createClubMatchFeedbackRequests(guildId, matchId, playerStats);
    
    // Auto-link: DM unlinked players suggesting they link their EA account
    await promptUnlinkedPlayersToLink(guildId, club, playerStats);
    
    console.log(`[EA] Processed match ${matchId}: ${result} ${scoreFor}-${scoreAgainst} vs ${opponentName}`);
    
  } catch (err) {
    console.error(`[EA] Error processing match:`, err);
  }
}

// Create feedback requests for club match participants
async function createClubMatchFeedbackRequests(guildId, eaMatchId, playerStats) {
  try {
    // Get the club_match record
    const { data: clubMatch } = await supabase
      .from('club_matches')
      .select('id')
      .eq('guild_id', guildId)
      .eq('ea_match_id', eaMatchId)
      .single();
    
    if (!clubMatch) {
      console.log(`[Feedback] No club_match found for ${eaMatchId}`);
      return;
    }
    
    // Map EA usernames to Discord IDs - only include guild members
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const discordPlayerIds = [];
    
    for (const pStat of playerStats) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('ea_username', pStat.ea_username)
        .maybeSingle();
      
      if (profile) {
        // Verify this player is a member of this guild
        let isMember = false;
        if (guild) {
          try {
            const member = await guild.members.fetch(profile.discord_user_id).catch(() => null);
            isMember = !!member;
          } catch {
            isMember = false;
          }
        }
        
        if (isMember) {
          discordPlayerIds.push(profile.discord_user_id);
        }
      }
    }
    
    if (discordPlayerIds.length < 2) {
      console.log(`[Feedback] Not enough linked players for feedback (${discordPlayerIds.length})`);
      return;
    }
    
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const feedbackRequests = discordPlayerIds.map(playerId => {
      const teammates = discordPlayerIds.filter(id => id !== playerId);
      return {
        guild_id: guildId,
        draft_id: null,
        club_match_id: clubMatch.id,
        match_type: 'club',
        evaluator_discord_id: playerId,
        teammates_to_evaluate: teammates,
        expires_at: expiresAt.toISOString()
      };
    });
    
    await supabase.from('dm_feedback_requests').insert(feedbackRequests);
    console.log(`[Feedback] Created ${feedbackRequests.length} feedback requests for club match ${eaMatchId}`);
    
  } catch (err) {
    console.error(`[Feedback] Error creating club match feedback requests:`, err);
  }
}

// Auto-link: DM unlinked players prompting them to link their EA account
async function promptUnlinkedPlayersToLink(guildId, club, playerStats) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    
    for (const pStat of playerStats) {
      // Check if this EA username is already linked to a profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('ea_username', pStat.ea_username)
        .maybeSingle();
      
      if (existingProfile) {
        // Already linked, skip
        continue;
      }
      
      // Try to fuzzy-match EA username to Discord members
      const eaName = pStat.ea_username?.toLowerCase() || '';
      if (!eaName) continue;
      
      // Search for members with similar display names or usernames
      let potentialMatch = null;
      
      try {
        // Try exact match first
        const members = await guild.members.fetch({ query: eaName, limit: 5 });
        
        for (const [memberId, member] of members) {
          const displayName = member.displayName?.toLowerCase() || '';
          const username = member.user.username?.toLowerCase() || '';
          
          // Check for close match (contains or exact)
          if (displayName === eaName || username === eaName ||
              displayName.includes(eaName) || eaName.includes(displayName) ||
              username.includes(eaName) || eaName.includes(username)) {
            potentialMatch = member;
            break;
          }
        }
        
        // If no match found, also check nickname similarity
        if (!potentialMatch) {
          const allMembers = await guild.members.fetch();
          for (const [memberId, member] of allMembers) {
            const displayName = member.displayName?.toLowerCase() || '';
            const username = member.user.username?.toLowerCase() || '';
            
            // Calculate similarity score
            const similarity = Math.max(
              getSimilarity(displayName, eaName),
              getSimilarity(username, eaName)
            );
            
            if (similarity > 0.7) {
              potentialMatch = member;
              break;
            }
          }
        }
      } catch (err) {
        console.log(`[AutoLink] Error searching for member matching ${eaName}:`, err.message);
      }
      
      if (potentialMatch) {
        // Check if we've already DMed this user recently (avoid spam)
        const recentDmKey = `autolink_${potentialMatch.id}`;
        const now = Date.now();
        
        if (!autoLinkDmCache.has(recentDmKey) || (now - autoLinkDmCache.get(recentDmKey)) > 24 * 60 * 60 * 1000) {
          try {
            const embed = new EmbedBuilder()
              .setTitle('🎮 Link Your EA Account!')
              .setColor(0x5865f2)
              .setDescription(
                `Hey! We detected **${pStat.ea_username}** playing for **${club.name}** and think it might be you!\n\n` +
                `Link your EA account to automatically track your stats, goals, assists, ratings, and more!`
              )
              .addFields(
                { name: '📊 What You Get', value: '• Automatic stat tracking\n• Personal performance ratings\n• Position-based analytics\n• Form and streak tracking', inline: false }
              )
              .setFooter({ text: 'Click the button below to link your EA account' });
            
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`autolink_confirm_${pStat.ea_username}_${club.ea_platform || 'ps5'}`)
                .setLabel(`Yes, I'm ${pStat.ea_username}`)
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('autolink_dismiss')
                .setLabel("That's not me")
                .setStyle(ButtonStyle.Secondary)
            );
            
            await potentialMatch.send({ embeds: [embed], components: [row] });
            autoLinkDmCache.set(recentDmKey, now);
            console.log(`[AutoLink] DM sent to ${potentialMatch.user.username} suggesting EA account: ${pStat.ea_username}`);
          } catch (dmErr) {
            console.log(`[AutoLink] Could not DM ${potentialMatch.user.username}: ${dmErr.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[AutoLink] Error prompting unlinked players:', err);
  }
}

// Simple string similarity function
function getSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  
  if (str1 === str2) return 1;
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;
  
  // Levenshtein distance-based similarity
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1;
  
  let matchCount = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matchCount++;
  }
  
  return matchCount / longer.length;
}

// Cache to prevent spamming auto-link DMs
const autoLinkDmCache = new Map();

// Track sent DMs to prevent duplicates within session
const sentFeedbackDMs = new Set();

// Send pending feedback DMs to players
async function sendPendingFeedbackDMs(guildId, guild) {
  const result = { sent: 0, skipped: 0, failed: 0 };
  
  try {
    // Check if feedback is enabled for this guild
    const { data: guildSettings } = await supabase
      .from('guild_settings')
      .select('feedback_enabled')
      .eq('guild_id', guildId)
      .single();
    
    if (guildSettings && guildSettings.feedback_enabled === false) {
      console.log(`[Feedback] Feedback disabled for guild ${guildId}, skipping DMs...`);
      return result;
    }
    
    // Get all pending feedback requests for this guild that haven't been DMed yet
    // Only get requests from the last 5 MINUTES to avoid sending old DMs
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: pendingRequests } = await supabase
      .from('dm_feedback_requests')
      .select('*')
      .eq('guild_id', guildId)
      .eq('status', 'pending')
      .is('dm_sent_at', null)
      .gt('expires_at', new Date().toISOString())
      .gt('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (!pendingRequests || pendingRequests.length === 0) {
      console.log(`[Feedback] No pending DMs to send for guild ${guildId}`);
      return result;
    }
    
    for (const request of pendingRequests) {
      // Skip if we've already processed this request in this session
      const requestKey = `${request.evaluator_discord_id}_${request.club_match_id || request.id}`;
      if (sentFeedbackDMs.has(requestKey)) {
        console.log(`[Feedback] Already sent in this session: ${requestKey}`);
        result.skipped++;
        continue;
      }
      
      // Use teammates_data if available, fall back to teammates_to_evaluate
      const teammatesData = request.teammates_data || [];
      const teammateIds = request.teammates_to_evaluate || [];
      
      if (teammatesData.length === 0 && teammateIds.length === 0) {
        result.skipped++;
        continue;
      }
      
      try {
        // Mark as sent FIRST to prevent race conditions
        const { error: updateError } = await supabase
          .from('dm_feedback_requests')
          .update({ dm_sent_at: new Date().toISOString() })
          .eq('id', request.id)
          .is('dm_sent_at', null); // Only update if not already sent
        
        if (updateError) {
          console.log(`[Feedback] Could not mark as sent: ${updateError.message}`);
          result.skipped++;
          continue;
        }
        
        // Add to session cache
        sentFeedbackDMs.add(requestKey);
        
        // Fetch the Discord user
        const member = await guild.members.fetch(request.evaluator_discord_id).catch(() => null);
        if (!member) {
          console.log(`[Feedback] Member not found: ${request.evaluator_discord_id}`);
          result.failed++;
          continue;
        }
        
        const matchType = request.match_type === 'club' ? 'Club Match' : 'Draft';
        
        // Build the feedback panel showing all teammates with positions
        let description = `You recently played a **${matchType}**!\n\nRate each teammate's performance:\n\n`;
        
        // If we have teammates_data with positions, use that
        if (teammatesData.length > 0) {
          for (const teammate of teammatesData) {
            const position = teammate.position_played || 'ANY';
            const name = teammate.ea_username || `<@${teammate.discord_user_id}>`;
            if (teammate.rated) {
              const stars = '⭐'.repeat(teammate.given_rating);
              description += `✅ **${name}** (${position}): ${stars}\n`;
            } else {
              description += `⬜ **${name}** (${position}): Not rated yet\n`;
            }
          }
        } else {
          // Fallback for old format without teammates_data
          for (const id of teammateIds) {
            description += `⬜ <@${id}>: Not rated yet\n`;
          }
        }
        
        // Find first unrated teammate
        let firstUnrated;
        if (teammatesData.length > 0) {
          firstUnrated = teammatesData.find(t => !t.rated);
        } else {
          firstUnrated = { discord_user_id: teammateIds[0], ea_username: null, position_played: null };
        }
        
        if (!firstUnrated) {
          result.skipped++;
          continue;
        }
        
        description += `\n**Now rating: ${firstUnrated.ea_username || 'Teammate'}** (${firstUnrated.position_played || 'ANY'})`;
        
        const embed = new EmbedBuilder()
          .setTitle('⭐ Rate Your Teammates')
          .setColor(0x5865f2)
          .setDescription(description)
          .setFooter({ text: `Expires in 24h` });
        
        const ratingButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`feedback_rate_1_${request.id}_${firstUnrated.discord_user_id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`feedback_rate_2_${request.id}_${firstUnrated.discord_user_id}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`feedback_rate_3_${request.id}_${firstUnrated.discord_user_id}`).setLabel('⭐ 3').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`feedback_rate_4_${request.id}_${firstUnrated.discord_user_id}`).setLabel('⭐ 4').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`feedback_rate_5_${request.id}_${firstUnrated.discord_user_id}`).setLabel('⭐ 5').setStyle(ButtonStyle.Success)
        );
        
        await member.send({ embeds: [embed], components: [ratingButtons] });
        
        result.sent++;
        console.log(`[Feedback] Sent panel DM to ${member.user.username} for match ${request.club_match_id}`);
        
      } catch (err) {
        console.error(`[Feedback] Failed to DM ${request.evaluator_discord_id}:`, err.message);
        result.failed++;
      }
    }
    
    return result;
    
  } catch (err) {
    console.error(`[Feedback] Error sending feedback DMs:`, err);
    return result;
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
      // Only track stats for players who are members of THIS guild
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      
      for (const pStat of playerStats) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('discord_user_id')
          .eq('ea_username', pStat.ea_username)
          .maybeSingle();
        
        if (profile) {
          // Verify this player is a member of this guild
          let isMember = false;
          if (guild) {
            try {
              const member = await guild.members.fetch(profile.discord_user_id).catch(() => null);
              isMember = !!member;
            } catch {
              isMember = false;
            }
          }
          
          if (!isMember) {
            console.log(`[EA] Skipping stats for ${pStat.ea_username} - not a member of guild ${guildId}`);
            continue;
          }
          
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
      
      // Create feedback requests for club match participants
      await createClubMatchFeedbackRequests(guildId, matchId, playerStats);
      
      synced++;
      existingIds.add(matchId); // Prevent processing same match twice
    }
    
    // Auto-send feedback DMs after syncing matches
    if (synced > 0) {
      try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          const feedbackResult = await sendPendingFeedbackDMs(guildId, guild);
          console.log(`[EA] Auto-sent ${feedbackResult.sent} feedback DMs after sync`);
        }
      } catch (feedbackErr) {
        console.error(`[EA] Error auto-sending feedback DMs:`, feedbackErr.message);
      }
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
// BACKGROUND FEEDBACK DM POLLING
// Automatically sends pending feedback DMs created by local EA sync script
// =======================

let feedbackPollingInterval = null;

function startFeedbackDMPolling(discordClient) {
  if (feedbackPollingInterval) {
    console.log(`[Feedback] Polling already running, skipping...`);
    return;
  }
  
  console.log(`[Feedback] Starting background DM polling (every 30 seconds)`);
  
  // Run immediately on startup
  pollAndSendFeedbackDMs(discordClient);
  
  // Then poll every 30 seconds
  feedbackPollingInterval = setInterval(() => {
    pollAndSendFeedbackDMs(discordClient);
  }, 30000); // 30 seconds
}

async function pollAndSendFeedbackDMs(discordClient) {
  try {
    // Get all pending feedback requests across all guilds that haven't been DMed yet
    const { data: pendingRequests, error } = await supabase
      .from('dm_feedback_requests')
      .select('guild_id')
      .eq('status', 'pending')
      .is('dm_sent_at', null)
      .gt('expires_at', new Date().toISOString());
    
    if (error) {
      console.error(`[Feedback] Error fetching pending requests:`, error.message);
      return;
    }
    
    if (!pendingRequests || pendingRequests.length === 0) {
      return; // Silent return when no pending DMs
    }
    
    // Get unique guild IDs with pending requests
    const uniqueGuildIds = [...new Set(pendingRequests.map(r => r.guild_id))];
    
    console.log(`[Feedback] Found ${pendingRequests.length} pending DMs across ${uniqueGuildIds.length} guild(s)`);
    
    // Process each guild's pending feedback DMs
    for (const guildId of uniqueGuildIds) {
      try {
        const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          console.log(`[Feedback] Guild ${guildId} not accessible, skipping...`);
          continue;
        }
        
        const result = await sendPendingFeedbackDMs(guildId, guild);
        
        if (result.sent > 0) {
          console.log(`[Feedback] Sent ${result.sent} DMs for guild ${guild.name} (skipped: ${result.skipped}, failed: ${result.failed})`);
        }
      } catch (guildErr) {
        console.error(`[Feedback] Error processing guild ${guildId}:`, guildErr.message);
      }
    }
  } catch (err) {
    console.error(`[Feedback] Polling error:`, err.message);
  }
}

// =======================
// AUTO-LINK EA ACCOUNTS TO DISCORD MEMBERS
// =======================

async function autoLinkEaAccounts(guildId, guild) {
  const result = { linked: 0, skipped: 0, noMatch: 0 };
  
  try {
    // Get all temporary ea_ profiles that need linking
    const { data: tempProfiles } = await supabase
      .from('profiles')
      .select('discord_user_id, ea_username, ea_platform')
      .like('discord_user_id', 'ea_%');
    
    if (!tempProfiles || tempProfiles.length === 0) {
      return result;
    }
    
    console.log(`[Auto-Link] Found ${tempProfiles.length} unlinked EA profiles`);
    
    // Fetch all guild members
    await guild.members.fetch();
    const guildMembers = guild.members.cache;
    
    // Get existing Discord profiles that don't have EA accounts linked
    const { data: discordProfiles } = await supabase
      .from('profiles')
      .select('discord_user_id, discord_username, ea_username')
      .not('discord_user_id', 'like', 'ea_%');
    
    const unlinkedMembers = (discordProfiles || []).filter(p => !p.ea_username && p.discord_username);
    
    for (const tempProfile of tempProfiles) {
      const eaUsername = tempProfile.ea_username;
      if (!eaUsername) continue;
      
      // First check if any guild member's Discord username matches
      let bestMatch = null;
      let bestSimilarity = 0;
      
      // Check guild members directly
      for (const [memberId, member] of guildMembers) {
        const similarity = stringSimilarity(eaUsername.toLowerCase(), member.user.username.toLowerCase());
        if (similarity > bestSimilarity && similarity >= 0.5) {
          bestSimilarity = similarity;
          bestMatch = { discord_user_id: memberId, discord_username: member.user.username };
        }
        
        // Also check display name
        if (member.displayName) {
          const displaySimilarity = stringSimilarity(eaUsername.toLowerCase(), member.displayName.toLowerCase());
          if (displaySimilarity > bestSimilarity && displaySimilarity >= 0.5) {
            bestSimilarity = displaySimilarity;
            bestMatch = { discord_user_id: memberId, discord_username: member.user.username };
          }
        }
      }
      
      // Also check against profiles table
      for (const profile of unlinkedMembers) {
        if (!profile.discord_username) continue;
        const similarity = stringSimilarity(eaUsername.toLowerCase(), profile.discord_username.toLowerCase());
        if (similarity > bestSimilarity && similarity >= 0.5) {
          bestSimilarity = similarity;
          bestMatch = profile;
        }
      }
      
      if (!bestMatch) {
        result.noMatch++;
        continue;
      }
      
      // Check if target already has an EA account linked
      const existingProfile = discordProfiles?.find(p => p.discord_user_id === bestMatch.discord_user_id);
      if (existingProfile?.ea_username) {
        result.skipped++;
        continue;
      }
      
      console.log(`[Auto-Link] Linking ${eaUsername} -> ${bestMatch.discord_username} (${(bestSimilarity * 100).toFixed(0)}%)`);
      
      const tempDiscordId = tempProfile.discord_user_id;
      const realDiscordId = bestMatch.discord_user_id;
      
      // Update the real Discord profile with EA info
      await supabase
        .from('profiles')
        .upsert({
          discord_user_id: realDiscordId,
          ea_username: eaUsername,
          ea_platform: tempProfile.ea_platform,
          discord_username: bestMatch.discord_username
        }, { onConflict: 'discord_user_id' });
      
      // Migrate player_stats
      await supabase
        .from('player_stats')
        .update({ discord_user_id: realDiscordId })
        .eq('discord_user_id', tempDiscordId);
      
      // Migrate player_summary
      await supabase
        .from('player_summary')
        .update({ discord_user_id: realDiscordId })
        .eq('discord_user_id', tempDiscordId);
      
      // Migrate player_ratings
      await supabase
        .from('player_ratings')
        .update({ discord_user_id: realDiscordId })
        .eq('discord_user_id', tempDiscordId);
      
      // Delete temp profile
      await supabase
        .from('profiles')
        .delete()
        .eq('discord_user_id', tempDiscordId);
      
      result.linked++;
      
      // Remove from unlinked list to prevent double-matching
      const idx = unlinkedMembers.findIndex(m => m.discord_user_id === realDiscordId);
      if (idx !== -1) unlinkedMembers.splice(idx, 1);
    }
    
    return result;
  } catch (err) {
    console.error('[Auto-Link] Error:', err);
    throw err;
  }
}

// Simple string similarity function (Dice coefficient)
function stringSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (str1.length < 2 || str2.length < 2) return 0;
  
  const bigrams = new Map();
  for (let i = 0; i < str1.length - 1; i++) {
    const bigram = str1.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }
  
  let intersectionSize = 0;
  for (let i = 0; i < str2.length - 1; i++) {
    const bigram = str2.substring(i, i + 2);
    const count = bigrams.get(bigram) || 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }
  
  return (2.0 * intersectionSize) / (str1.length + str2.length - 2);
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
