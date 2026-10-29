// Every former slash command. Only the entry points (/manager, /help, /setup) are registered with
// Discord; the rest are panel actions (panels.cjs), and these definitions describe the forms those
// actions open. Kept out of index.cjs so tests can check the panels against them without starting the bot.
const { PermissionsBitField, ChannelType } = require('discord.js');
const { CLUBSTATS_ACTION_CHOICES, TOP_STAT_CHOICES } = require('./club-stats.cjs');
const { HUB_COMMANDS } = require('./manager-hub.cjs');
const { SQUAD_COMMANDS } = require('./squads.cjs');
const { EVENT_COMMANDS } = require('./events.cjs');
const { ROSTER_COMMANDS } = require('./roster.cjs');
const { MATCHNIGHT_COMMANDS } = require('./matchnight.cjs');
const { AUTOPILOT_COMMANDS } = require('./autopilot.cjs');
const { SETUP_COMMANDS } = require('./club-setup.cjs');
const { PRO_PHOTO_COMMANDS } = require('./pro-photos.cjs');
const { AI_ACCESS_COMMANDS } = require('./ai-access.cjs');
const { RECRUIT_COMMANDS } = require('./recruitment.cjs');
const { NETWORK_COMMANDS } = require('./network.cjs');
const { SCOUT_COMMANDS } = require('./scouting.cjs');
const { TRIAL_COMMANDS } = require('./trials.cjs');
const { LFC_COMMANDS } = require('./recruit-cards.cjs');
const { premiumCommands } = require('./premium.cjs');
const { BROADCAST_SUBCOMMANDS } = require('./broadcast.cjs');
const { OVERLAY_SUBCOMMAND } = require('./stream-kit.cjs');
const { TROPHIES_SUBCOMMAND } = require('./stat-roles.cjs');
const { COACH_SUBCOMMAND } = require('./coach.cjs');
const { ACTION_SCHEMA: MATCHTAGS_SCHEMA } = require('./match-tags.cjs');
const { FUN_COMMAND } = require('./fun-zone.cjs');
const { CLUBLIFE_COMMANDS } = require('./club-life.cjs');
const { CASUAL_COMMANDS } = require('./casual.cjs');

const ACTION_SCHEMAS = [
  // Spot Management Commands
  { name: 'spotpanel', description: 'Create the global control panel for club spots.' },
  { name: 'spots', description: 'Show a read-only board with club dropdown.' },
  { name: 'vcspots', description: 'Create/update a live club spot panel linked to your current voice channel.' },
  { name: 'help', description: 'How to get started, what each command does, and what the stats mean.' },
  {
    name: 'spotblock',
    description: 'Block or unblock a user from moving players.',
    options: [
      { name: 'user', description: 'User to block or unblock.', type: 6, required: true },
      { name: 'action', description: 'Block or unblock the user.', type: 3, required: true, choices: [{ name: 'Block', value: 'block' }, { name: 'Unblock', value: 'unblock' }] }
    ]
  },
  { name: 'whoisplaying', description: 'Show who is currently slotted in your voice channel club (if linked).' },
  { name: 'pospanel', description: 'Post the shared positions panel.' },
  { name: 'myprefs', description: 'Set your comp position, positions you play well and emergency positions.' },
  { name: 'positions', description: 'Set your comp position, positions you play well and emergency positions.' },
  { name: 'posboard', description: 'Show position preferences for players in your current voice channel.' },
  { name: 'posprefs', description: 'View position preferences for VC members or online players.' },
  { name: 'depthchart', description: 'Depth chart: who covers each position and where the squad is thin.' },
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
  { name: 'draftpanel', description: 'Create a draft control panel in this channel with player stats and position preferences.' },

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

  // Events (/event, /available) are defined in events.cjs
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
    description: 'Link or relink your club to EA FC Pro Clubs by name (also fixes FC27 club IDs).',
    options: [
      { name: 'name', description: 'Your EA FC Pro Clubs team name.', type: 3, required: true },
      { name: 'platform', description: 'Your platform (optional, searches all if left blank).', type: 3, required: false, choices: [
        { name: 'PS5 / Xbox Series X|S / PC', value: 'ps5' },
        { name: 'Nintendo Switch', value: 'switch' }
      ]},
      { name: 'stats_channel', description: 'Channel to post match results (optional).', type: 7, required: false }
    ]
  },
  {
    name: 'clubstats',
    description: 'Club stats, members, top players, in-form players and recent matches.',
    options: [
      { name: 'action', description: 'Leave blank to show club stats.', type: 3, required: false, choices: [
        { name: 'Show club stats', value: 'stats' },
        ...CLUBSTATS_ACTION_CHOICES,
        { name: 'Enable monitoring', value: 'enable' },
        { name: 'Disable monitoring', value: 'disable' },
        { name: 'Show status', value: 'status' }
      ]},
      { name: 'stat', description: 'For "Top players": which stat to rank by (default goals + assists).', type: 3, required: false, choices: TOP_STAT_CHOICES }
    ]
  },
  { name: 'syncclub', description: 'Manually sync recent matches from EA FC Pro Clubs.' },
  {
    name: 'teamsheet',
    description: 'Post the latest saved lineup (team sheet) in this channel and ping the starting XI.',
    options: [
      { name: 'team', description: 'Team name (defaults to the most recent lineup).', type: 3, required: false },
      { name: 'ping', description: 'Ping the starting XI (default: yes).', type: 5, required: false },
      { name: 'dm', description: 'Also DM each starter their position (default: no).', type: 5, required: false },
      { name: 'message', description: 'Note to include, e.g. kick-off time.', type: 3, required: false }
    ]
  },
  {
    name: 'linkea',
    description: 'Link your EA username to your Discord account for stats tracking.',
    options: [
      { name: 'username', description: 'Start typing and pick your name from your club\'s EA players.', type: 3, required: true, autocomplete: true }
    ]
  },

  // Admin Panel
  { name: 'squadiq', description: 'Launch the GafferBot control panel in this channel (admin only).' },
  { name: 'refreshpanel', description: 'Force refresh the admin panel in this channel.' },

  // Scouting Panel
  { name: 'scoutpanel', description: 'Create a scouting panel in this channel for club scouting and match analysis.' },
  
  // EA Sync Panel
  { name: 'eapanel', description: 'Create an EA integration panel for managing club links and syncing stats.' },
  
  // Ratings Panel
  { name: 'ratingspanel', description: 'Create a ratings panel for viewing player ratings, leaderboards, and stats.' },

  // Admin EA Account Linking
  {
    name: 'forcelink',
    description: 'Force-link an EA username to a Discord user (admin only).',
    options: [
      { name: 'user', description: 'The Discord user to link.', type: 6, required: true },
      { name: 'username', description: 'The EA FC Pro Clubs username.', type: 3, required: true }
    ]
  },

  // Review Pending Link Suggestions
  {
    name: 'reviewlinks',
    description: 'Review pending EA-to-Discord link suggestions (admin only).'
  },

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
  },

  // Twitch Integration Commands
  {
    name: 'twitchsetup',
    description: 'Set up Twitch live notifications in a channel.',
    options: [
      { name: 'username', description: 'Twitch username to monitor.', type: 3, required: true },
      { name: 'channel', description: 'Discord channel to post notifications.', type: 7, required: true },
      { name: 'message', description: 'Custom notification message (optional).', type: 3, required: false }
    ]
  },
  {
    name: 'twitchremove',
    description: 'Remove Twitch live notifications for a streamer.',
    options: [
      { name: 'username', description: 'Twitch username to stop monitoring.', type: 3, required: true }
    ]
  },
  {
    name: 'twitchlist',
    description: 'List all Twitch streamers being monitored in this server.'
  },
  {
    name: 'twitchimport',
    description: 'Link players to their Twitch accounts from the twitch.tv links posted in a channel.',
    options: [
      { name: 'channel', description: 'Channel where players posted their Twitch links.', type: 7, required: true },
      { name: 'save', description: 'True writes the links; leave blank to preview first.', type: 5, required: false }
    ]
  },

  // Xbox Presence Tracking
  {
    name: 'linkxbox',
    description: 'Link your Xbox gamertag for presence tracking and game detection.',
    options: [
      { name: 'gamertag', description: 'Your Xbox gamertag (exactly as it appears).', type: 3, required: true }
    ]
  },

  // Apply Friendly to Draft Command
  {
    name: 'applyfriendly',
    description: 'Link EA friendly match stats to a completed draft.',
    options: [
      {
        name: 'draft_id',
        description: 'Specific draft ID (uses most recent if not provided).',
        type: 3,
        required: false
      }
    ]
  },

  // Position Role Panel Command
  {
    name: 'positionpanel',
    description: 'Post a panel where members pick their position and get the matching role.',
    default_member_permissions: String(PermissionsBitField.Flags.ManageRoles)
  },
  ...HUB_COMMANDS,
  ...SQUAD_COMMANDS,
  ...EVENT_COMMANDS,
  ...ROSTER_COMMANDS,
  ...MATCHNIGHT_COMMANDS,
  ...AUTOPILOT_COMMANDS,
  ...SETUP_COMMANDS,
  ...PRO_PHOTO_COMMANDS,
  ...AI_ACCESS_COMMANDS,
  ...RECRUIT_COMMANDS,
  ...NETWORK_COMMANDS,
  ...SCOUT_COMMANDS,
  ...TRIAL_COMMANDS,
  ...LFC_COMMANDS,
  ...premiumCommands(BROADCAST_SUBCOMMANDS, OVERLAY_SUBCOMMAND, TROPHIES_SUBCOMMAND, COACH_SUBCOMMAND),
  MATCHTAGS_SCHEMA,
  FUN_COMMAND,
  ...CLUBLIFE_COMMANDS,
  ...CASUAL_COMMANDS
];

module.exports = { ACTION_SCHEMAS };
