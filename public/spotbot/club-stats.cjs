// Club stats views built from the matches the bot has already saved (club_matches), so they need
// no extra EA calls: /clubstats members, top players per stat, in-form players and recent results.
// Also /help (short guide plus a stats glossary) and the EA-name lookup behind /linkea.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { toInsightMatches } = require('./club-insights.cjs');
const { resolveClub, activeClubs } = require('./manager-hub.cjs');

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
];
const TOP_STAT_CHOICES = Object.entries(TOP_STATS).map(([value, s]) => ({ name: s.label, value }));

const GLOSSARY =
  '**GP** games played · **G** goals · **A** assists · **G+A** goals plus assists\n' +
  '**Rtg** average EA match rating (0-10) · **MOTM** man of the match\n' +
  '**Pass%** passes completed out of passes tried · **Tkl** tackles won · **CS** clean sheets (keepers and defenders)\n' +
  '**W-D-L** wins, draws, losses · **GD** goal difference\n' +
  '**Overall rating** (on `/profile`) is GafferBot\'s 0-100 score from match ratings, form and teammate reviews; it is not an EA number.\n\n' +
  '**Why EA numbers can look off**\n' +
  '• If you play as "Any" or control AI teammates, EA credits you with every pass and tackle those AI players make, but not their possessions won or interceptions.\n' +
  '• EA\'s in-game summary screen and its "Possession" tab often disagree. The bot uses what EA\'s API reports, which matches the tab, not the summary.\n' +
  '• Only finished club matches count; EA posts them a few minutes after full time, and the bot picks them up on its next sync.';

const HELP_PAGES = [
  {
    key: 'start',
    label: 'Getting started',
    emoji: '🚀',
    blurb: 'Three steps to get your club running.',
    lines: [
      ['1. /setclub name', 'Link your EA club. EA only lists a club after its first FC27 league match, so play one first if it isn\'t found.'],
      ['2. /linkea username', 'Every player picks their EA name from the list as they type, so their stats count.'],
      ['3. /setup', 'Shows what\'s left, missing permissions, and any commands an admin has turned off. Then post your first `/event new`.'],
      [null, '\n**Command missing, or "you can\'t use this"?** A server admin can turn commands on or off in Server Settings → Integrations → GafferBot. `/setup` lists what is off.'],
    ],
  },
  {
    key: 'events',
    label: 'Events & availability',
    emoji: '✅',
    blurb: 'Schedule sessions and collect who can play.',
    lines: [
      ['/event new', 'Post an event with Available / Maybe / Out buttons. Times like "thu 9pm" or "21/09 18:00".'],
      ['/event edit', 'Change the time, title, deadline or details. The board updates and players are told.'],
      ['/event close · /event reopen', 'Stop or restart answers for an event.'],
      ['/event mark', 'Set or clear a player\'s answer for them.'],
      ['/event post', 'Post the board again here, e.g. after it scrolled away.'],
      ['/event remind · /event cancel', 'Nudge players who haven\'t answered, or cancel and tell everyone.'],
      ['/event list · /available', 'Upcoming events, and your own answers in one place.'],
      ['/event preset · /event series · /event timezone', 'Templates, repeating events and your server\'s timezone.'],
    ],
  },
  {
    key: 'matchnight',
    label: 'Match night',
    emoji: '🏟️',
    blurb: 'Lineups, check-ins and subs on the night.',
    lines: [
      ['/manager', 'The Manager Hub: roll call, team sheet, sync and stats buttons.'],
      ['/teamsheet', 'Post the latest lineup and ping the starting XI.'],
      ['/checkin', 'Open check-in for the next event, or check yourself in.'],
      ['/sub', 'Ask the server for a sub.'],
      ['/reliability', 'Show-up rates: who turns up when they say they will.'],
      ['/autopilot', 'Turn on or off the automatic jobs: match recaps, auto team sheet, check-ins, subs, Monday digest.'],
    ],
  },
  {
    key: 'roster',
    label: 'Roster & players',
    emoji: '👥',
    blurb: 'Look up players and manage the roster.',
    lines: [
      ['/roster add', 'Add a player, or update their positions and role.'],
      ['/roster view', 'The roster grouped by position or status.'],
      ['/roster player', 'Leaders only: one player\'s roster details, EA stats and recent answers.'],
      ['/roster status', 'Set a player active, trial, injured, away or inactive.'],
      ['/roster remove', 'Move a player to Inactive (or delete them).'],
      ['/roster import', 'Add everyone with a role.'],
      ['/positionpanel · /myprefs', 'Players pick their positions.'],
    ],
  },
  {
    key: 'stats',
    label: 'Club & stats',
    emoji: '📈',
    blurb: 'Results, player stats and insights from your EA matches.',
    lines: [
      ['/clubstats', 'Club stats card. Pick an action for Members, Top players (per stat), In form or Recent matches.'],
      ['/profile · /mystats · /leaderboard', 'Player ratings, form and the server leaderboard.'],
      ['/insights', 'Pairing chemistry, formation win rates and what wins you games.'],
      ['/syncclub', 'Pull your latest EA matches now.'],
      ['/clubmatches · /scoutclub · /matchpreview', 'Look at any other club, scout them, or preview a match.'],
    ],
  },
  {
    key: 'recruit',
    label: 'Squad & recruiting',
    emoji: '🧲',
    blurb: 'Leaders, friendlies and finding players.',
    lines: [
      ['/squad', 'Link the club to a squad and name its captain and managers.'],
      ['/lfg', 'Look for a friendly; times show in each server\'s local time.'],
      ['/recruit · /scout', 'Find free agents, post a recruitment ad, keep a watchlist.'],
      ['/fa · /lfc', 'Players: list yourself as a free agent, or share your resume card.'],
      ['/apply', 'Apply to trial for this server\'s club.'],
    ],
  },
  {
    key: 'admin',
    label: 'Setup & admin',
    emoji: '⚙️',
    blurb: 'Configure the bot for your server.',
    lines: [
      ['/setup', 'Checklist, permissions, disabled commands, bot latency.'],
      ['/setclub', 'Link or relink your EA club, and pick the channel for match results.'],
      ['/brand', 'Your colours, crest, lineup title, and the bot\'s name and picture here.'],
      ['/forcelink', 'Link an EA name to a player, or move it from their old Discord account.'],
      ['/eapanel · /squadiq', 'Button panels for EA links and the admin controls.'],
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
  const { supabase, getGuildState, fetchClubMembers, dashboardUrl } = deps;
  const namesCache = new Map();

  async function loadClubMatches(guildId, clubKey, limit = MATCH_WINDOW) {
    const { data } = await supabase
      .from('club_matches')
      .select('id, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey)
      .order('created_at', { ascending: false })
      .limit(limit);
    return toInsightMatches(data || []);
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
      const totals = aggregate(await loadClubMatches(guildId, club.key).catch(() => []));
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
          ? 'Play a club match; it shows up here a few minutes after full time. `/syncclub` pulls the latest now.'
          : 'Link the club first with `/setclub`. EA only lists a club after its first FC27 league match.'),
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
      .setFooter({ text: `Last ${matches.length} saved matches${totals.length > shown.length ? ` · top ${shown.length} of ${totals.length} by games` : ''} · ✓ linked to Discord · /help explains the stats` });
    if (unlinked) embed.addFields({ name: 'Not linked yet', value: `${unlinked} player${unlinked === 1 ? '' : 's'} without ✓ should run \`/linkea\` (start typing and pick their name) so their stats count.` });
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
      .setFooter({ text: `Last ${matches.length} saved matches${needsGames ? ` · at least ${MIN_GAMES} games` : ''} · pick another stat with /clubstats action:Top stat:…` });
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
    const matches = await loadClubMatches(guildId, club.key, 10);
    if (!matches.length) return noMatches(club);
    const lines = matches.map((m) => {
      const scorers = m.players.filter((p) => num(p.goals) > 0).map((p) => `${String(p.ea_username).trim()}${num(p.goals) > 1 ? ` ×${num(p.goals)}` : ''}`);
      return `${RESULT_EMOJI[m.result] || '⚪'} **${m.scoreFor}-${m.scoreAgainst}** vs ${m.opponent} · <t:${Math.floor(m.playedAt.getTime() / 1000)}:R>${scorers.length ? `\n-# ⚽ ${scorers.join(', ')}` : ''}`;
    });
    const embed = new EmbedBuilder()
      .setTitle(`📅 ${club.name}: recent matches`)
      .setColor(0x22c55e)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: 'Any other club: /clubmatches · full breakdowns: /insights' });
    return { embeds: [embed] };
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
    if (!['members', 'top', 'form', 'matches'].includes(action)) return false;
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club) {
      await interaction.reply({ content: '❌ No club is set up yet. Run `/setclub` first.', flags: 64 });
      return true;
    }
    await interaction.deferReply();
    try {
      const guildId = interaction.guildId;
      const view =
        action === 'members' ? await membersView(guildId, club)
        : action === 'top' ? await topView(guildId, club, interaction.options.getString('stat'))
        : action === 'form' ? await formView(guildId, club)
        : await matchesView(guildId, club);
      await interaction.editReply(view);
    } catch (err) {
      await interaction.editReply({ content: `❌ Could not load stats: ${err.message}` });
    }
    return true;
  }

  return { handleInteraction, knownEaNames, matchKnownName, helpMessage, glossaryMessage, forgetNames: (guildId) => namesCache.delete(guildId) };
}

module.exports = { createClubStats, CLUBSTATS_ACTION_CHOICES, TOP_STAT_CHOICES, GLOSSARY, aggregate };
