// Club stats views built from the matches the bot has already saved (club_matches), so they need
// no extra EA calls: /clubstats members, top players per stat, in-form players and recent results.
// Also /help (short guide plus a stats glossary) and the EA-name lookup behind /linkea.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const { toInsightMatches, competitionLabel, competitionEmoji, isSeparateCompetition, computeCompetitionRecords } = require('./club-insights.cjs');
const { resolveClub, activeClubs } = require('./manager-hub.cjs');
const { where } = require('./panels.cjs');

const MATCH_WINDOW = 100;
const FORM_WINDOW = 10;
const NAMES_TTL_MS = 10 * 60 * 1000;
const RESULT_EMOJI = { win: '🟢', draw: '🟡', loss: '🔴' };

// Stats /clubstats top can rank by. avg: per-game average (needs MIN_GAMES); pct: ratio of two totals
const TOP_STATS = {
  goals: { label: 'Goals', key: 'goals' },
  assists: { label: 'Assists', key: 'assists' },
  ga: { label: 'Goals + assists', key: 'ga' },
  rating: { label: 'Average match rating', key: 'rating', avg: true },
  motm: { label: 'Man of the match awards', key: 'motm' },
  shots: { label: 'Shots', key: 'shots' },
  tackles: { label: 'Tackles won', key: 'tackles' },
  passes: { label: 'Pass completion', pct: ['passes_made', 'pass_attempts'] },
  saves: { label: 'Saves', key: 'saves' },
  clean_sheets: { label: 'Clean sheets', key: 'clean_sheet' },
  games: { label: 'Games played', key: 'games' },
};
const MIN_GAMES = 3;

const CLUBSTATS_ACTION_CHOICES = [
  { name: 'Members: everyone who has played', value: 'members' },
  { name: 'Top players for a stat', value: 'top' },
  { name: 'In form: best over recent games', value: 'form' },
  { name: 'Recent matches', value: 'matches' },
  { name: 'Tournament & BYOT stats', value: 'tournaments' },
  { name: 'Overall team stats (EA)', value: 'team' },
  { name: 'Full EA member list', value: 'ea_members' },
];
const TOP_STAT_CHOICES = Object.entries(TOP_STATS).map(([value, s]) => ({ name: s.label, value }));

const GLOSSARY =
  '**GP** games played · **G** goals · **A** assists · **G+A** goals plus assists\n' +
  '**Rtg** average EA match rating (0-10) · **MOTM** man of the match\n' +
  '**Pass%** passes completed out of passes tried · **Tkl** tackles won · **CS** clean sheets (keepers and defenders)\n' +
  '**W-D-L** wins, draws, losses · **GD** goal difference\n' +
  '**Overall rating** (on **/me → My Profile**) is GafferBot\'s 0-100 score from match ratings, form and teammate reviews; it is not an EA number.\n\n' +
  '**Why EA numbers can look off**\n' +
  '• If you play as "Any" or control AI teammates, EA credits you with every pass and tackle those AI players make, but not their possessions won or interceptions.\n' +
  '• EA\'s in-game summary screen and its "Possession" tab often disagree. The bot uses what EA\'s API reports, which matches the tab, not the summary.\n' +
  '• Only finished club matches count; EA posts them a few minutes after full time, and the bot picks them up on its next sync.';

// Where a tool lives now, e.g. "/manager → Events → New Event"
const at = (...ids) => ids.map(where).join(' · ');

const HELP_PAGES = [
  {
    key: 'start',
    label: 'Getting started',
    emoji: '🚀',
    blurb: 'GafferBot has four commands: `/manager` for leaders, `/me` for players, `/help` and `/setup`. Everything else is a button.',
    lines: [
      [`1. ${at('ad_setclub')}`, 'Link your EA club. EA only lists a club after its first FC27 league match, so play one first if it isn\'t found.'],
      [`2. ${at('linkea')}`, 'Every player links their EA name so their stats count. Post a Player Hub (Admin area) so players can press the button instead of typing.'],
      ['3. /setup', 'Shows what\'s left and any missing permissions. Then post your first event from **/manager → Events**.'],
      [null, '\n**How the panels work:** `/manager` shows the hub; its **More tools** menu opens each area as buttons. Buttons that need details (a player, a time, a score) open a short form. Leader tools only work for captains, managers and admins.'],
    ],
  },
  {
    key: 'events',
    label: 'Events & availability',
    emoji: '✅',
    blurb: 'Schedule sessions and collect who can play. All in **/manager → Events**.',
    lines: [
      ['New Event · Event From Preset', 'Post an event with Available / Maybe / Out buttons. Times like "thu 9pm" or "21/09 18:00".'],
      ['Edit Event', 'Change the time, title, deadline or details. The board updates and players are told.'],
      ['Close Answers · Reopen Answers', 'Stop or restart answers for an event.'],
      ['Mark a Player', 'Set or clear a player\'s answer for them.'],
      ['Repost Board', 'Post the board again here, e.g. after it scrolled away.'],
      ['Remind · Cancel Event', 'Nudge players who haven\'t answered, or cancel and tell everyone.'],
      ['Upcoming', 'Every upcoming event. Players see their own answers with **/me → My Events**.'],
      ['Presets · Repeating Events · Timezone', 'Templates, repeating events and your server\'s timezone.'],
    ],
  },
  {
    key: 'matchnight',
    label: 'Match night',
    emoji: '🏟️',
    blurb: 'Lineups, check-ins and subs on the night.',
    lines: [
      ['/manager', 'The Manager Hub: Call Session, Team Sheet, Sync Matches, Club Stats and Insights buttons.'],
      [at('ln_sheet'), 'Post the latest lineup and ping the starting XI.'],
      [at('mn_checkin'), 'Open check-in for the next event. Players check in with **/me → Check In**.'],
      [at('mn_sub'), 'Ask the server for a sub.'],
      [at('mn_reliability'), 'Show-up rates: who turns up when they say they will.'],
      [at('mn_autopilot'), 'Turn on or off the automatic jobs: match recaps, auto team sheet, check-ins, subs, Monday digest.'],
      ['/manager → Lineups & Spots · Drafts', 'Live spot boards, position preferences and captain drafts.'],
    ],
  },
  {
    key: 'roster',
    label: 'Roster & players',
    emoji: '👥',
    blurb: 'Look up players and manage the roster. All in **/manager → Roster & Squad**.',
    lines: [
      ['Add Player', 'Add a player, or update their positions and role.'],
      ['View Roster', 'The roster grouped by position or status.'],
      ['Player Details', 'One player\'s roster details, EA stats and recent answers.'],
      ['Set Status', 'Set a player active, trial, injured, away or inactive.'],
      ['Remove Player', 'Move a player to Inactive (or delete them).'],
      ['Import Role', 'Add everyone with a role.'],
      [`${at('ln_posroles')} · ${at('mypositions')}`, 'Players pick their comp position, positions they play well and emergency positions.'],
    ],
  },
  {
    key: 'stats',
    label: 'Club & stats',
    emoji: '📈',
    blurb: 'Results, player stats and insights from your EA matches. Leaders: **/manager → Stats & Scouting**.',
    lines: [
      ['Club Stats', 'Club stats card. Pick Members, Top players (per stat), In form or Recent matches.'],
      [`${at('mystats')} · ${at('myprofile')} · ${at('leaderboard')}`, 'Your ratings and form, and the server leaderboard.'],
      ['Insights', 'Pairing chemistry, formation win rates and what wins you games.'],
      ['Sync Matches', 'Pull your latest EA matches now.'],
      ['Tag Matches', 'Mark played games as League, Tournament or BYOT (EA counts those as friendlies). Tournament and BYOT games keep their own record and player stats (stats panel → Tournaments) and stay out of the regular stats. Games played during a BYOT, tournament or league event are tagged for you.'],
      ['Club Matches · Scout a Club · Match Preview', 'Look at any other club, scout them, or preview a match.'],
    ],
  },
  {
    key: 'recruit',
    label: 'Squad & recruiting',
    emoji: '🧲',
    blurb: 'Leaders, friendlies and finding players.',
    lines: [
      ['/manager → Roster & Squad', 'Link the club to a squad and name its captain and managers.'],
      [at('mn_lfg'), 'Look for a friendly; times show in each server\'s local time.'],
      ['/manager → Recruiting', 'Find free agents, post a recruitment ad, keep a watchlist, scout opponents.'],
      [`${at('fa')} · ${at('lfccard')}`, 'Players: list yourself as a free agent, or share your resume card.'],
      [at('apply'), 'Apply to trial for this server\'s club.'],
    ],
  },
  {
    key: 'admin',
    label: 'Setup & admin',
    emoji: '⚙️',
    blurb: 'Configure the bot for your server. Leaders: **/manager → Admin**.',
    lines: [
      ['/setup', 'Checklist, permissions, disabled commands, bot latency.'],
      ['Link EA Club', 'Link or relink your EA club, and pick the channel for match results.'],
      ['Branding (website)', 'Kit, team colours, crest, era crests, club identity, lineup title, and the bot\'s name and picture: set on gafferbot.app/control (needs Manage Server).'],
      ['Post Player Hub', 'A pinned panel players can use without typing a command.'],
      [at('ro_forcelink'), 'Link an EA name to a player, or move it from their old Discord account.'],
      ['EA Panel · Control Panel', 'Button panels for EA links and the admin controls.'],
    ],
  },
  {
    key: 'glossary',
    label: 'Stats explained',
    emoji: '📊',
    blurb: 'What GP, Rtg, Pass% and the rest mean.',
    lines: [[null, GLOSSARY]],
  },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const POSITION_SHORT = { goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD', attacker: 'FWD' };

function nameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function pad(text, width) {
  const s = String(text);
  return s.length > width ? `${s.slice(0, width - 1)}…` : s.padEnd(width);
}

// Per-player totals across matches (newest first)
function aggregate(matches) {
  const players = new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const key = nameKey(p.ea_username);
      if (!key) continue;
      if (!players.has(key)) {
        players.set(key, { name: String(p.ea_username).trim(), games: 0, goals: 0, assists: 0, ga: 0, ratingSum: 0, rated: 0, motm: 0, shots: 0, tackles: 0, passes_made: 0, pass_attempts: 0, saves: 0, clean_sheet: 0, positions: new Map(), lastPlayed: m.playedAt });
      }
      const t = players.get(key);
      t.games += 1;
      t.goals += num(p.goals);
      t.assists += num(p.assists);
      t.ga += num(p.goals) + num(p.assists);
      if (num(p.rating) > 0) {
        t.ratingSum += num(p.rating);
        t.rated += 1;
      }
      if (p.motm) t.motm += 1;
      t.shots += num(p.shots);
      t.tackles += num(p.tackles);
      t.passes_made += num(p.passes_made);
      t.pass_attempts += num(p.pass_attempts);
      t.saves += num(p.saves);
      if (p.clean_sheet) t.clean_sheet += 1;
      const pos = p.position ? POSITION_SHORT[String(p.position).toLowerCase()] || String(p.position).toUpperCase().slice(0, 3) : null;
      if (pos) t.positions.set(pos, (t.positions.get(pos) || 0) + 1);
    }
  }
  for (const t of players.values()) {
    t.rating = t.rated ? t.ratingSum / t.rated : 0;
    t.position = [...t.positions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }
  return [...players.values()];
}

function statValue(t, stat) {
  if (stat.pct) return t[stat.pct[1]] ? (100 * t[stat.pct[0]]) / t[stat.pct[1]] : null;
  return t[stat.key];
}

function formatStat(v, stat) {
  if (v === null) return '–';
  if (stat.pct) return `${Math.round(v)}%`;
  if (stat.avg) return v.toFixed(1);
  return String(v);
}

function createClubStats(deps) {
  const { supabase, getGuildState, fetchClubMembers, fetchClubOverall, fetchClubInfo, dashboardUrl } = deps;
  const namesCache = new Map();

  // kinds: 'regular' (default) leaves out tagged tournament / BYOT games, which have their own view;
  // 'separate' is only those; 'all' is everything
  async function loadClubMatches(guildId, clubKey, limit = MATCH_WINDOW, kinds = 'regular') {
    const { data } = await supabase
      .from('club_matches')
      .select('id, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey)
      .order('created_at', { ascending: false })
      .limit(kinds === 'all' ? limit : MATCH_WINDOW * 3);
    const matches = toInsightMatches(data || []);
    if (kinds === 'all') return matches;
    return matches.filter((m) => isSeparateCompetition(m.competition) === (kinds === 'separate')).slice(0, limit);
  }

  // Every EA name seen for this server's clubs: from saved matches and EA's member list.
  // Map of lower-case name -> { name (as EA spells it), games, club }
  async function knownEaNames(guildId) {
    const cached = namesCache.get(guildId);
    if (cached && Date.now() - cached.at < NAMES_TTL_MS) return cached.names;
    const names = new Map();
    const add = (raw, games, club) => {
      const key = nameKey(raw);
      if (!key) return;
      const prev = names.get(key);
      if (!prev) names.set(key, { name: String(raw).trim(), games, club });
      else prev.games = Math.max(prev.games, games);
    };
    const state = await getGuildState(guildId);
    for (const club of activeClubs(state)) {
      const totals = aggregate(await loadClubMatches(guildId, club.key, MATCH_WINDOW, 'all').catch(() => []));
      for (const t of totals) add(t.name, t.games, club.name);
      if (club.ea_club_id && fetchClubMembers) {
        const members = await fetchClubMembers({ clubId: club.ea_club_id, platform: club.ea_platform }).catch(() => []);
        for (const m of members || []) add(m.name || m.proName || m.playername, num(m.gamesPlayed), club.name);
      }
    }
    namesCache.set(guildId, { at: Date.now(), names });
    return names;
  }

  // The EA spelling of a typed name, if it belongs to one of this server's clubs
  async function matchKnownName(guildId, typed) {
    const names = await knownEaNames(guildId).catch(() => new Map());
    return { match: names.get(nameKey(typed)) || null, any: names.size > 0 };
  }

  async function nameChoices(guildId, typed) {
    const q = nameKey(typed);
    const names = [...(await knownEaNames(guildId).catch(() => new Map())).values()];
    return names
      .filter((n) => nameKey(n.name).includes(q))
      .sort((a, b) => (nameKey(a.name).startsWith(q) ? 0 : 1) - (nameKey(b.name).startsWith(q) ? 0 : 1) || b.games - a.games)
      .slice(0, 25)
      .map((n) => ({ name: `${n.name}${n.games ? ` · ${n.games} GP` : ''} · ${n.club}`.slice(0, 100), value: n.name.slice(0, 100) }));
  }

  // ---------- /clubstats views ----------

  function noMatches(club) {
    return {
      content:
        `📭 No matches saved for **${club.name}** yet.\n` +
        (club.ea_club_id
          ? 'Play a club match; it shows up here a few minutes after full time. **/manager → Stats & Scouting → Sync Matches** pulls the latest now.'
          : 'Link the club first with **/manager → Admin → Link EA Club**. EA only lists a club after its first FC27 league match.'),
    };
  }

  async function membersView(guildId, club) {
    const matches = await loadClubMatches(guildId, club.key);
    if (!matches.length) return noMatches(club);
    const totals = aggregate(matches).sort((a, b) => b.games - a.games || b.ga - a.ga);
    const { data: linked } = await supabase
      .from('profiles')
      .select('discord_user_id, ea_username')
      .in('ea_username', totals.map((t) => t.name));
    const linkedKeys = new Set((linked || []).filter((p) => !String(p.discord_user_id).startsWith('ea_')).map((p) => nameKey(p.ea_username)));
    const shown = totals.slice(0, 30);
    const rows = shown.map((t) => `${linkedKeys.has(nameKey(t.name)) ? '✓' : ' '} ${pad(t.name, 16)} ${pad(t.position, 4)}${String(t.games).padStart(3)} ${String(t.goals).padStart(3)} ${String(t.assists).padStart(3)} ${t.rating ? t.rating.toFixed(1).padStart(4) : '   –'}`);
    const unlinked = totals.filter((t) => !linkedKeys.has(nameKey(t.name))).length;
    const embed = new EmbedBuilder()
      .setTitle(`👥 ${club.name} members`)
      .setColor(0x5865f2)
      .setDescription(`\`\`\`\n  ${pad('Player', 16)} ${pad('Pos', 4)} GP   G   A  Rtg\n${rows.join('\n')}\n\`\`\``)
      .setFooter({ text: `Last ${matches.length} regular matches (tournament & BYOT games are separate)${totals.length > shown.length ? ` · top ${shown.length} of ${totals.length} by games` : ''} · ✓ linked to Discord · /help explains the stats` });
    if (unlinked) embed.addFields({ name: 'Not linked yet', value: `${unlinked} player${unlinked === 1 ? '' : 's'} without ✓ should press **/me → Link EA** and pick their name so their stats count.` });
    return { embeds: [embed] };
  }

  async function topView(guildId, club, statKey) {
    const stat = TOP_STATS[statKey] || TOP_STATS.ga;
    const matches = await loadClubMatches(guildId, club.key);
    if (!matches.length) return noMatches(club);
    const needsGames = stat.avg || stat.pct;
    const ranked = aggregate(matches)
      .filter((t) => (needsGames ? t.games >= MIN_GAMES : true))
      .map((t) => ({ t, v: statValue(t, stat) }))
      .filter(({ v }) => v !== null && v > 0)
      .sort((a, b) => b.v - a.v || a.t.games - b.t.games)
      .slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = ranked.map(({ t, v }, i) => `${medals[i] || `\`${String(i + 1).padStart(2)}\``} **${t.name}** ${formatStat(v, stat)} · ${t.games} GP`);
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${club.name}: ${stat.label}`)
      .setColor(0xf59e0b)
      .setDescription(lines.join('\n') || 'Nobody has recorded this stat yet.')
      .setFooter({ text: `Last ${matches.length} regular matches (tournament & BYOT games are separate)${needsGames ? ` · at least ${MIN_GAMES} games` : ''} · pick another stat in /manager → Stats & Scouting → Club Stats` });
    return { embeds: [embed] };
  }

  async function formView(guildId, club) {
    const matches = await loadClubMatches(guildId, club.key, FORM_WINDOW);
    if (!matches.length) return noMatches(club);
    const ranked = aggregate(matches)
      .filter((t) => t.games >= 2 && t.rated)
      .sort((a, b) => b.rating - a.rating || b.ga - a.ga)
      .slice(0, 5);
    const lines = ranked.map((t, i) => `${['🔥', '🔥', '🔥', '⭐', '⭐'][i]} **${t.name}** ${t.rating.toFixed(1)} Rtg · ${t.goals} G · ${t.assists} A · ${t.motm ? `${t.motm} MOTM · ` : ''}${t.games} GP`);
    const embed = new EmbedBuilder()
      .setTitle(`🔥 ${club.name}: in form`)
      .setColor(0xef4444)
      .setDescription(lines.join('\n') || 'Nobody has 2+ rated games in the recent matches yet.')
      .setFooter({ text: `Average match rating over the last ${matches.length} matches, 2+ games played` });
    return { embeds: [embed] };
  }

  async function matchesView(guildId, club) {
    const matches = await loadClubMatches(guildId, club.key, 10, 'all');
    if (!matches.length) return noMatches(club);
    const lines = matches.map((m) => {
      const scorers = m.players.filter((p) => num(p.goals) > 0).map((p) => `${String(p.ea_username).trim()}${num(p.goals) > 1 ? ` ×${num(p.goals)}` : ''}`);
      return `${RESULT_EMOJI[m.result] || '⚪'} **${m.scoreFor}-${m.scoreAgainst}** vs ${m.opponent}${m.tag ? ` · ${competitionEmoji(m.tag)} ${competitionLabel(m.tag)}` : ''} · <t:${Math.floor(m.playedAt.getTime() / 1000)}:R>${scorers.length ? `\n-# ⚽ ${scorers.join(', ')}` : ''}`;
    });
    const embed = new EmbedBuilder()
      .setTitle(`📅 ${club.name}: recent matches`)
      .setColor(0x22c55e)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: 'Any other club: /manager → Stats & Scouting → Club Matches · full breakdowns: /manager → Stats & Scouting → Insights' });
    return { embeds: [embed] };
  }

  // Tournament and BYOT games, kept apart from the regular stats: the record per kind plus each player's numbers
  async function tournamentsView(guildId, club) {
    const matches = await loadClubMatches(guildId, club.key, MATCH_WINDOW, 'separate');
    const embed = new EmbedBuilder().setTitle(`🏟️ ${club.name}: tournament & BYOT stats`).setColor(0x9b59b6);
    if (!matches.length) {
      embed.setDescription(`No tournament or BYOT games yet. Tag them in **${where('st_tags')}**; friendlies played during a BYOT or tournament event are tagged for you.`);
      return { embeds: [embed] };
    }
    const records = computeCompetitionRecords(matches).map((k) => `${k.emoji} **${k.label}** ${k.record.wins}W ${k.record.draws}D ${k.record.losses}L · GD ${k.record.goalDiff >= 0 ? '+' : ''}${k.record.goalDiff}`);
    const totals = aggregate(matches).sort((a, b) => b.games - a.games || b.ga - a.ga).slice(0, 25);
    const rows = totals.map((t) => `${pad(t.name, 16)} ${String(t.games).padStart(3)} ${String(t.goals).padStart(3)} ${String(t.assists).padStart(3)} ${t.rating ? t.rating.toFixed(1).padStart(4) : '   –'} ${String(t.motm).padStart(3)}`);
    embed
      .setDescription(`${records.join('\n')}\n\`\`\`\n${pad('Player', 16)}  GP   G   A  Rtg MOTM\n${rows.join('\n')}\n\`\`\``.slice(0, 4000))
      .setFooter({ text: `${matches.length} tournament & BYOT games · not counted in the regular stats` });
    return { embeds: [embed] };
  }

  // ---------- EA views: full member list and overall team stats, straight from EA ----------

  function notLinked(club) {
    return { content: `❌ **${club.name}** isn't linked to EA yet. Run **/setup → Link EA club** or **/manager → Admin → Link EA Club**.` };
  }
  const pct = (v) => (v === undefined || v === null || v === '' ? '–' : `${Math.round(num(v))}%`);

  async function eaMembersView(club) {
    if (!club.ea_club_id) return notLinked(club);
    const members = (await fetchClubMembers({ clubId: club.ea_club_id, platform: club.ea_platform }).catch(() => [])) || [];
    if (!members.length) return { content: "📭 EA didn't send a member list just now. Try again in a minute." };
    const rows = members
      .map((m) => ({
        name: String(m.name || m.proName || m.playername || '?').trim(),
        pos: String(m.favoritePosition || m.proPos || '').slice(0, 3).toUpperCase(),
        gp: num(m.gamesPlayed), g: num(m.goals), a: num(m.assists), motm: num(m.manOfTheMatch),
        rtg: num(m.ratingAve), win: m.winRate, pass: m.passSuccessRate, tkl: num(m.tacklesMade),
        cs: num(m.cleanSheetsGK) + num(m.cleanSheetsDef), ovr: num(m.proOverall),
      }))
      .sort((a, b) => b.gp - a.gp || b.g + b.a - (a.g + a.a));
    const header = `${pad('Player', 14)} ${pad('Pos', 3)}  GP   G   A MOTM  Rtg Win% Pas% Tkl  CS`;
    const lines = rows.map((r) => `${pad(r.name, 14)} ${pad(r.pos, 3)} ${String(r.gp).padStart(3)} ${String(r.g).padStart(3)} ${String(r.a).padStart(3)} ${String(r.motm).padStart(4)} ${r.rtg ? r.rtg.toFixed(1).padStart(4) : '   –'} ${pct(r.win).padStart(4)} ${pct(r.pass).padStart(4)} ${String(r.tkl).padStart(3)} ${String(r.cs).padStart(3)}`);
    // Split the table across embeds so every member fits (Discord: 4096 chars per embed)
    const embeds = [];
    let chunk = [];
    for (const line of lines) {
      if ((chunk.join('\n').length + line.length + header.length + 20) > 3900) { embeds.push(chunk); chunk = []; }
      chunk.push(line);
    }
    if (chunk.length) embeds.push(chunk);
    const totals = rows.reduce((t, r) => ({ g: t.g + r.g, a: t.a + r.a, gp: Math.max(t.gp, r.gp) }), { g: 0, a: 0, gp: 0 });
    return {
      embeds: embeds.slice(0, 10).map((c, i) =>
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(i === 0 ? `👥 ${club.name}: EA member list (${rows.length})` : null)
          .setDescription(`\`\`\`\n${header}\n${c.join('\n')}\n\`\`\``)
          .setFooter(i === embeds.length - 1 ? { text: `Straight from EA's club member list · ${totals.g} goals, ${totals.a} assists across the squad · Win%/Pas% are EA's own rates` } : null)
      ),
    };
  }

  async function teamView(club) {
    if (!club.ea_club_id) return notLinked(club);
    const opts = { clubId: club.ea_club_id, platform: club.ea_platform };
    const [o, info, members] = await Promise.all([
      fetchClubOverall ? fetchClubOverall(opts).catch(() => null) : null,
      fetchClubInfo ? fetchClubInfo(opts).catch(() => null) : null,
      fetchClubMembers(opts).catch(() => []),
    ]);
    if (!o && !(members || []).length) return { content: "📭 EA didn't send club stats just now. Try again in a minute." };
    const st = o || {};
    const w = num(st.wins), d = num(st.ties ?? st.draws), l = num(st.losses);
    const gp = num(st.gamesPlayed) || w + d + l;
    const gf = num(st.goals), ga = num(st.goalsAgainst);
    const list = members || [];
    const sum = (k) => list.reduce((t, m) => t + num(m[k]), 0);
    const top = (k) => { const m = [...list].sort((a, b) => num(b[k]) - num(a[k]))[0]; return m && num(m[k]) ? `${m.name || m.proName} (${num(m[k])})` : '–'; };
    const topRtg = [...list].filter((m) => num(m.gamesPlayed) >= 5).sort((a, b) => num(b.ratingAve) - num(a.ratingAve))[0];
    const f = (name, value) => ({ name, value: String(value ?? '–'), inline: true });
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${info?.name || club.ea_club_name || club.name}: overall team stats`)
      .setColor(0x22c55e)
      .addFields(
        f('Record (W-D-L)', gp ? `${w}-${d}-${l}` : '–'),
        f('Games', gp || '–'),
        f('Win rate', gp ? `${Math.round((100 * w) / gp)}%` : '–'),
        f('Goals for / against', gp ? `${gf} / ${ga}` : '–'),
        f('Goal difference', gp ? (gf - ga > 0 ? `+${gf - ga}` : gf - ga) : '–'),
        f('Goals per game', gp ? (gf / gp).toFixed(2) : '–'),
        f('Skill rating', st.skillRating || '–'),
        f('Current division', st.currentDivision || '–'),
        f('Best division', st.bestDivision || '–'),
        f('Promotions / relegations', `${num(st.promotions)} / ${num(st.relegations)}`),
        f('Win streak / unbeaten', `${num(st.wstreak)} / ${num(st.unbeatenstreak)}`),
        f('Squad on EA', list.length || '–'),
        f('Squad goals / assists', list.length ? `${sum('goals')} / ${sum('assists')}` : '–'),
        f('Squad tackles', list.length ? sum('tacklesMade') : '–'),
        f('Clean sheets (GK)', list.length ? sum('cleanSheetsGK') : '–'),
        f('Top scorer', top('goals')),
        f('Top assister', top('assists')),
        f('Best rating (5+ GP)', topRtg ? `${topRtg.name || topRtg.proName} (${num(topRtg.ratingAve).toFixed(1)})` : '–'),
      )
      .setFooter({ text: "From EA's club stats and member list · /help explains each stat" });
    return { embeds: [embed] };
  }

  // ---------- Stats panel: lives at the bottom of the club's player-stats channel ----------

  const PANEL_MARK = '📊 Stats panel';
  const panelIds = new Map();
  const panelTimers = new Map();

  function panelPayload(club) {
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${club.name} stats`)
      .setColor(0x22c55e)
      .setDescription('Press a button — the answer comes back just for you.\n\n**Team Stats** EA record, division, goals and leaders\n**EA Member List** every member\'s full EA stats\n**Top Players** leaders for any stat\n**In Form** best over the last 10\n**Recent Matches** latest results and scorers\n**Tournaments** tournament & BYOT games, kept apart from the rest')
      .setFooter({ text: `${PANEL_MARK} · always stays at the bottom` });
    const b = (id, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`statsp:${id}:${club.key}`).setLabel(label).setEmoji(emoji).setStyle(style);
    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(b('team', 'Team Stats', '📊', ButtonStyle.Primary), b('members', 'EA Member List', '👥', ButtonStyle.Primary)),
        new ActionRowBuilder().addComponents(b('top', 'Top Players', '🏆'), b('form', 'In Form', '🔥'), b('matches', 'Recent Matches', '📅'), b('tournaments', 'Tournaments', '🏟️'), new ButtonBuilder().setCustomId('help_glossary').setLabel('What the stats mean').setEmoji('❓').setStyle(ButtonStyle.Secondary)),
      ],
    };
  }

  const panelChannelOf = (club) => (club.stats_panel === false ? null : club.stats_panel_channel_id || club.stats_channel_id || null);

  // Channels where the bot lacks a permission are skipped (and named once in the log) instead of
  // failing every repost with Discord's bare "Missing Access".
  const warnedChannels = new Set();
  function missingPanelPerms(channel) {
    const me = channel.guild?.members?.me;
    const perms = me && channel.permissionsFor?.(me);
    if (!perms) return [];
    const send = channel.isThread?.() ? 'SendMessagesInThreads' : 'SendMessages';
    return ['ViewChannel', send, 'EmbedLinks', 'ReadMessageHistory'].filter((name) => !perms.has(PermissionFlagsBits[name]));
  }

  async function repostPanel(channel, club) {
    const missing = missingPanelPerms(channel);
    if (missing.length) {
      if (!warnedChannels.has(channel.id)) {
        warnedChannels.add(channel.id);
        console.warn(`[stats panel] skipped #${channel.name} (${channel.id}) in ${channel.guild?.name} (${channel.guildId}) for club ${club.name || club.key}: bot is missing ${missing.join(', ')}`);
      }
      return;
    }
    warnedChannels.delete(channel.id);
    const oldId = panelIds.get(channel.id);
    if (oldId) await channel.messages.delete(oldId).catch(() => {});
    else {
      const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
      for (const m of recent?.values() || []) {
        if (m.author.id === channel.client.user.id && m.embeds[0]?.footer?.text?.includes(PANEL_MARK)) await m.delete().catch(() => {});
      }
    }
    const sent = await channel.send(panelPayload(club));
    panelIds.set(channel.id, sent.id);
  }

  async function onMessage(message) {
    if (!message.guildId || panelIds.get(message.channelId) === message.id) return;
    // Bot posts (recaps, stat answers) also push the panel down, so follow them too — but never our own panel
    if (message.author?.id === message.client.user.id && message.embeds[0]?.footer?.text?.includes(PANEL_MARK)) return;
    const state = await getGuildState(message.guildId).catch(() => null);
    const club = activeClubs(state).find((c) => panelChannelOf(c) === message.channelId);
    if (!club) return;
    clearTimeout(panelTimers.get(message.channelId));
    panelTimers.set(message.channelId, setTimeout(() => {
      panelTimers.delete(message.channelId);
      repostPanel(message.channel, club).catch((err) => console.warn('[stats panel] repost failed:', err.message));
    }, 5000));
  }

  async function initPanels(client) {
    for (const guild of client.guilds.cache.values()) {
      const state = await getGuildState(guild.id).catch(() => null);
      for (const club of activeClubs(state)) {
        const id = panelChannelOf(club);
        if (!id) continue;
        const channel = await guild.channels.fetch(id).catch(() => null);
        if (channel?.isTextBased()) await repostPanel(channel, club).catch((err) => console.warn('[stats panel] init failed:', err.message));
      }
    }
  }

  async function handlePanel(interaction) {
    const [, action, clubKey] = interaction.customId.split(':');
    const state = await getGuildState(interaction.guildId);
    const club = activeClubs(state).find((c) => c.key === clubKey) || resolveClub(state, interaction.member);
    if (!club) return interaction.reply({ content: '❌ That club is no longer set up.', flags: 64 });
    if (action === 'top' && interaction.isButton()) {
      return interaction.reply({
        flags: 64,
        components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`statsp:topsel:${club.key}`).setPlaceholder('Pick a stat').addOptions(TOP_STAT_CHOICES.map((c) => ({ label: c.name, value: c.value }))))],
      });
    }
    if (action === 'topsel') {
      await interaction.deferUpdate();
      return interaction.editReply({ ...(await topView(interaction.guildId, club, interaction.values[0])), components: interaction.message.components });
    }
    await interaction.deferReply({ flags: 64 });
    try {
      const view =
        action === 'team' ? await teamView(club)
        : action === 'members' ? await eaMembersView(club)
        : action === 'form' ? await formView(interaction.guildId, club)
        : action === 'tournaments' ? await tournamentsView(interaction.guildId, club)
        : await matchesView(interaction.guildId, club);
      return interaction.editReply(view);
    } catch (err) {
      return interaction.editReply({ content: `❌ Could not load stats: ${err.message}` });
    }
  }

  // ---------- /help ----------

  // One short page per area, picked from a menu (the TeamSheet layout): command + one line each
  function helpPage(key) {
    const page = HELP_PAGES.find((p) => p.key === key) || HELP_PAGES[0];
    const embed = new EmbedBuilder()
      .setTitle(`${page.emoji} Help: ${page.label}`)
      .setColor(0x5865f2)
      .setDescription(`${page.blurb}\n\n${page.lines.map(([cmd, what]) => (cmd ? `**${cmd}**\n${what}` : what)).join('\n')}`)
      .setFooter({ text: `GafferBot help · ${HELP_PAGES.indexOf(page) + 1} of ${HELP_PAGES.length} · pick another area below` });
    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_page')
        .setPlaceholder('More help: pick an area')
        .addOptions(HELP_PAGES.map((p) => ({ label: p.label, value: p.key, emoji: p.emoji, description: p.blurb.slice(0, 100), default: p.key === page.key })))
    );
    const rows = [menu];
    if (dashboardUrl) rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Open the dashboard').setStyle(ButtonStyle.Link).setURL(dashboardUrl)));
    return { embeds: [embed], components: rows };
  }

  function helpMessage() {
    return helpPage('start');
  }

  function glossaryMessage() {
    return helpPage('glossary');
  }

  async function handleInteraction(interaction) {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== 'linkea') return false;
      const focused = interaction.options.getFocused(true);
      if (focused.name !== 'username' || !interaction.guildId) return false;
      await interaction.respond(await nameChoices(interaction.guildId, focused.value)).catch(() => {});
      return true;
    }
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('statsp:')) {
      await handlePanel(interaction);
      return true;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_page') {
      await interaction.update(helpPage(interaction.values[0]));
      return true;
    }
    if (interaction.isButton() && interaction.customId === 'help_glossary') {
      await interaction.reply({ ...glossaryMessage(), flags: 64 });
      return true;
    }
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName === 'help') {
      await interaction.reply({ ...helpMessage(), flags: 64 });
      return true;
    }
    if (interaction.commandName !== 'clubstats' || !interaction.guildId) return false;
    const action = interaction.options.getString('action');
    if (!['members', 'top', 'form', 'matches', 'team', 'ea_members', 'tournaments'].includes(action)) return false;
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club) {
      await interaction.reply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.', flags: 64 });
      return true;
    }
    await interaction.deferReply();
    try {
      const guildId = interaction.guildId;
      const view =
        action === 'team' ? await teamView(club)
        : action === 'ea_members' ? await eaMembersView(club)
        : action === 'members' ? await membersView(guildId, club)
        : action === 'top' ? await topView(guildId, club, interaction.options.getString('stat'))
        : action === 'form' ? await formView(guildId, club)
        : action === 'tournaments' ? await tournamentsView(guildId, club)
        : await matchesView(guildId, club);
      await interaction.editReply(view);
    } catch (err) {
      await interaction.editReply({ content: `❌ Could not load stats: ${err.message}` });
    }
    return true;
  }

  return { handleInteraction, onMessage, initPanels, teamView, eaMembersView, knownEaNames, matchKnownName, helpMessage, glossaryMessage, forgetNames: (guildId) => namesCache.delete(guildId) };
}

module.exports = { createClubStats, CLUBSTATS_ACTION_CHOICES, TOP_STAT_CHOICES, GLOSSARY, aggregate };
