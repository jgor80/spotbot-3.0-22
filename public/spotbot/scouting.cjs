// Scouting: talent spotting from the matches the bot already syncs.
// After each synced match it looks at the opposing box score and posts a Recruitment Alert for
// standout players (rating, passing, tackles, hat-tricks). Managers save players to a watchlist
// with /scout; watched players trigger a ping when they list as a free agent or change clubs.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { resolveClub } = require('./manager-hub.cjs');
const { DOSSIER_SUBCOMMAND } = require('./dossier.cjs');

const SCAN_EVERY_MS = 2 * 60 * 1000;
const SCAN_WINDOW_MS = 6 * 60 * 60 * 1000; // never alert on old matches, e.g. after downtime
const SCAN_BATCH = 25;
const MAX_ALERTS_PER_MATCH = 2;
const WATCH_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_WATCHLIST = 100;
const PASS_PCT = 90;
const PASS_MIN_ATTEMPTS = 15;
const TACKLES = 5;
const EA_POS = { goalkeeper: 'Goalkeeper', defender: 'Defender', midfielder: 'Midfielder', forward: 'Striker' };
const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];

const SCOUT_COMMANDS = [
  {
    name: 'scout',
    description: 'Scout opponents (Premium dossier) and keep a watchlist of players you like.',
    options: [
      // Handled by dossier.cjs
      DOSSIER_SUBCOMMAND,
      { type: 1, name: 'watchlist', description: 'Show the watchlist, with anyone now listed as a free agent.' },
      {
        type: 1,
        name: 'add',
        description: 'Watch a player by EA gamertag.',
        options: [
          { name: 'gamertag', description: 'Their EA gamertag.', type: 3, required: true, max_length: 32 },
          { name: 'position', description: 'Position you see them in.', type: 3, required: false, choices: POSITIONS.map((p) => ({ name: p, value: p })) },
          { name: 'note', description: 'e.g. "Ran our midfield ragged".', type: 3, required: false, max_length: 150 },
        ],
      },
      {
        type: 1,
        name: 'remove',
        description: 'Stop watching a player.',
        options: [{ name: 'gamertag', description: 'Their EA gamertag.', type: 3, required: true, autocomplete: true }],
      },
    ],
  },
];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// One player's line from an EA match box score
function readPlayer(p) {
  const passAttempts = num(p.passattempts ?? p.passAttempts);
  const passesMade = num(p.passesmade ?? p.passesMade);
  return {
    name: String(p.playername || '').trim(),
    pos: EA_POS[String(p.pos || '').toLowerCase()] || (p.pos ? String(p.pos) : 'Player'),
    rating: num(p.rating),
    goals: num(p.goals),
    assists: num(p.assists),
    passAttempts,
    passesMade,
    passPct: passAttempts ? (100 * passesMade) / passAttempts : null,
    tackles: num(p.tacklesmade ?? p.tackles),
    saves: num(p.saves),
    motm: String(p.mom) === '1',
  };
}

// Why a performance stands out ([] when it doesn't)
function standoutReasons(p, minRating) {
  const reasons = [];
  if (p.goals >= 3) reasons.push(p.goals === 3 ? 'scored a hat-trick' : `scored ${p.goals}`);
  if (p.rating >= minRating) reasons.push(`was rated ${p.rating.toFixed(1)}`);
  if (p.passPct != null && p.passAttempts >= PASS_MIN_ATTEMPTS && p.passPct >= PASS_PCT) reasons.push(`completed ${Math.round(p.passPct)}% of passes`);
  if (p.tackles >= TACKLES) reasons.push(`made ${p.tackles} tackles`);
  return reasons;
}

function joinReasons(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function clubNameIn(match, clubId) {
  const c = match?.clubs?.[clubId];
  return c?.details?.name || c?.name || null;
}

// customIds hold the club id and gamertag; gamertags never contain ':'
function encodeTarget(clubId, name) {
  return `${clubId || '0'}:${name}`.slice(0, 90);
}

function createScouting(deps) {
  const { supabase, getGuildState, recruitment } = deps;
  let client = null;
  let pausedUntil = 0;

  async function canScout(member, guildId) {
    const state = await getGuildState(guildId);
    const club = resolveClub(state, member);
    return { club, ok: await recruitment.canRecruit(member, club) };
  }

  // ---------- Watchlist data ----------

  async function loadWatchlist(guildId) {
    const { data, error } = await supabase.from('scout_watchlist').select('*').eq('guild_id', guildId).order('created_at', { ascending: false });
    return { rows: data || [], error };
  }

  async function addToWatchlist({ guildId, clubKey, name, clubId, clubName, position, note, source, matchId, userId }) {
    const key = name.toLowerCase();
    const { count } = await supabase.from('scout_watchlist').select('id', { count: 'exact', head: true }).eq('guild_id', guildId);
    const { data: existing } = await supabase.from('scout_watchlist').select('id').eq('guild_id', guildId).eq('ea_key', key).maybeSingle();
    if (existing) return { already: true };
    if ((count || 0) >= MAX_WATCHLIST) return { error: `The watchlist is full (${MAX_WATCHLIST}). Remove someone with \`/scout remove\` first.` };
    const { data: profile } = await supabase.from('profiles').select('discord_user_id').ilike('ea_username', key.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
    const { error } = await supabase.from('scout_watchlist').insert({
      guild_id: guildId,
      club_key: clubKey || null,
      ea_username: name,
      ea_key: key,
      discord_user_id: profile && !String(profile.discord_user_id).startsWith('ea_') ? profile.discord_user_id : null,
      last_known_club_id: clubId && clubId !== '0' ? clubId : null,
      last_known_club_name: clubName || null,
      position: position || null,
      note: note || null,
      source,
      source_match_id: matchId || null,
      added_by_discord_id: userId,
    });
    if (error) return { error: recruitment.tablesMissing(error) ? recruitment.NOT_READY : error.message };
    return { added: true };
  }

  // ---------- Match scan ----------

  async function scan() {
    if (!client || Date.now() < pausedUntil) return;
    const since = new Date(Date.now() - SCAN_WINDOW_MS).toISOString();
    const { data: matches, error } = await supabase
      .from('club_matches')
      .select('id, guild_id, club_key, ea_match_id, opponent_club_id, opponent_club_name, result, score_for, score_against, match_data, created_at')
      .is('recruit_scanned_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(SCAN_BATCH);
    if (error) {
      // Most likely the recruitment migration has not run yet; check again in an hour
      console.warn('[Scouting] match scan paused:', error.message);
      pausedUntil = Date.now() + 60 * 60 * 1000;
      return;
    }
    for (const match of matches || []) {
      try {
        await scanMatch(match);
      } catch (err) {
        console.error(`[Scouting] scan of match ${match.ea_match_id} failed:`, err.message);
      }
      await supabase.from('club_matches').update({ recruit_scanned_at: new Date().toISOString() }).eq('id', match.id);
    }
  }

  async function scanMatch(match) {
    const players = match.match_data?.players || {};
    await trackWatchedPlayers(match, players);

    const settings = await recruitment.getSettings(match.guild_id);
    if (!settings.alerts_enabled || !settings.channel_id || !match.opponent_club_id) return;
    const minRating = Number(settings.alert_min_rating) || 8;
    const standouts = Object.values(players[match.opponent_club_id] || {})
      .map(readPlayer)
      .filter((p) => p.name)
      .map((p) => ({ ...p, reasons: standoutReasons(p, minRating) }))
      .filter((p) => p.reasons.length)
      .sort((a, b) => b.reasons.length - a.reasons.length || b.rating - a.rating)
      .slice(0, MAX_ALERTS_PER_MATCH);
    if (!standouts.length) return;

    const state = await getGuildState(match.guild_id);
    const club = (state?.clubs || []).find((c) => c.key === match.club_key);
    const listings = await recruitment.findListings({ eaKeys: standouts.map((p) => p.name) });
    const { rows: watched } = await loadWatchlist(match.guild_id);
    const watchedKeys = new Set(watched.map((w) => w.ea_key));
    for (const p of standouts) {
      const listing = listings.find((l) => l.ea_username?.toLowerCase() === p.name.toLowerCase());
      await recruitment.postToGuild(match.guild_id, alertPayload(match, club, p, listing, watchedKeys.has(p.name.toLowerCase())));
    }
  }

  function alertPayload(match, club, p, listing, watched) {
    const opponent = match.opponent_club_name || clubNameIn(match.match_data, match.opponent_club_id) || 'the opposition';
    const ours = club?.name || 'you';
    const resultText = match.result ? ` (${match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D'} ${match.score_for}-${match.score_against})` : '';
    const embed = new EmbedBuilder()
      .setTitle('🔎 Recruitment Alert')
      .setColor(0xf1c40f)
      .setDescription(`${p.pos} \`${p.name}\` (${opponent}) ${joinReasons(p.reasons)} against ${ours}${resultText}.`)
      .addFields(
        { name: 'Rating', value: p.rating ? p.rating.toFixed(1) : '–', inline: true },
        { name: 'G / A', value: `${p.goals} / ${p.assists}`, inline: true },
        { name: 'Passing', value: p.passPct != null ? `${p.passesMade}/${p.passAttempts} (${Math.round(p.passPct)}%)` : '–', inline: true },
        { name: 'Tackles', value: String(p.tackles), inline: true }
      )
      .setFooter({ text: `EA match ${match.ea_match_id}${p.motm ? ' · Man of the Match' : ''}` });
    if (listing) embed.addFields({ name: '📣 Free agent', value: `Listed as a free agent right now (${recruitment.positionsText(listing)}).` });
    if (watched) embed.addFields({ name: '👀 Watchlist', value: 'Already on your watchlist.' });
    const target = encodeTarget(match.opponent_club_id, p.name);
    const buttons = [new ButtonBuilder().setCustomId(`rx_sc:${target}`).setLabel('Scout Player').setEmoji('🔎').setStyle(ButtonStyle.Primary)];
    if (!watched) buttons.push(new ButtonBuilder().setCustomId(`rx_sw:${target}`).setLabel('Add to Watchlist').setEmoji('👀').setStyle(ButtonStyle.Secondary));
    if (listing) buttons.push(new ButtonBuilder().setCustomId(`rx_reach:${listing.id}:${club?.key || ''}`).setLabel('Reach Out').setEmoji('📨').setStyle(ButtonStyle.Success));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] };
  }

  // Every watched gamertag seen in a match updates its club; a move pings the watching server
  async function trackWatchedPlayers(match, players) {
    const seen = new Map();
    for (const [clubId, list] of Object.entries(players)) {
      for (const p of Object.values(list || {})) {
        const name = String(p?.playername || '').trim();
        if (name) seen.set(name.toLowerCase(), { clubId, name });
      }
    }
    if (!seen.size) return;
    const { data: watches } = await supabase.from('scout_watchlist').select('*').in('ea_key', [...seen.keys()]);
    for (const w of watches || []) {
      const now = seen.get(w.ea_key);
      if (!now || now.clubId === w.last_known_club_id) continue;
      const previous = w.last_known_club_id ? { id: w.last_known_club_id, name: w.last_known_club_name } : null;
      const clubName = clubNameIn(match.match_data, now.clubId) || (now.clubId === match.opponent_club_id ? match.opponent_club_name : null) || `club ${now.clubId}`;
      await supabase.from('scout_watchlist').update({ last_known_club_id: now.clubId, last_known_club_name: clubName }).eq('id', w.id);
      if (!previous) continue;
      if (w.last_alert_at && Date.now() - new Date(w.last_alert_at).getTime() < WATCH_ALERT_COOLDOWN_MS) continue;
      await supabase.from('scout_watchlist').update({ last_alert_at: new Date().toISOString() }).eq('id', w.id);
      const embed = new EmbedBuilder()
        .setTitle('🔁 Watchlist: club change')
        .setColor(0x9b59b6)
        .setDescription(`\`${w.ea_username}\` now plays for **${clubName}**${previous.name ? ` (was ${previous.name})` : ''}.`)
        .setFooter({ text: 'Seen in a match GafferBot synced' });
      if (w.note) embed.addFields({ name: 'Your note', value: truncate(w.note, 200) });
      await recruitment.postToGuild(w.guild_id, { embeds: [embed] }, w.added_by_discord_id);
    }
  }

  // ---------- Free agent listed ----------

  async function notifyListed(fa) {
    const rows = [];
    if (fa.ea_username) {
      const { data } = await supabase.from('scout_watchlist').select('*').eq('ea_key', fa.ea_username.toLowerCase());
      rows.push(...(data || []));
    }
    const { data: byUser } = await supabase.from('scout_watchlist').select('*').eq('discord_user_id', fa.discord_user_id);
    rows.push(...(byUser || []));
    const seen = new Set();
    const stats = (await recruitment.statsFor([fa.discord_user_id])).get(fa.discord_user_id);
    for (const w of rows) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      if (w.last_alert_at && Date.now() - new Date(w.last_alert_at).getTime() < WATCH_ALERT_COOLDOWN_MS) continue;
      await supabase.from('scout_watchlist').update({ last_alert_at: new Date().toISOString(), discord_user_id: fa.discord_user_id }).eq('id', w.id);
      const embed = recruitment.listingEmbed(fa, stats).setTitle(`👀 Watchlist: \`${w.ea_username}\` is now a free agent`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rx_reach:${fa.id}:${w.club_key || ''}`).setLabel('Reach Out').setEmoji('📨').setStyle(ButtonStyle.Success)
      );
      await recruitment.postToGuild(w.guild_id, { embeds: [embed], components: [row] }, w.added_by_discord_id);
    }
  }

  // ---------- Scout Player ----------

  // Everything we know about a gamertag from this server's synced matches
  async function scoutReport(guildId, clubId, name) {
    const key = name.toLowerCase();
    const { data: scouted } = await supabase
      .from('scouted_players')
      .select('ea_club_name, games_played, goals, assists, avg_match_rating, primary_position, times_faced, last_scouted_at')
      .eq('guild_id', guildId)
      .ilike('ea_username', key.replace(/[\\%_]/g, (c) => `\\${c}`))
      .order('last_scouted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let query = supabase
      .from('club_matches')
      .select('ea_match_id, opponent_club_id, opponent_club_name, result, score_for, score_against, match_data, created_at')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(15);
    if (clubId && clubId !== '0') query = query.eq('opponent_club_id', clubId);
    const { data: matches } = await query;
    const games = [];
    for (const m of matches || []) {
      const list = m.match_data?.players?.[m.opponent_club_id] || {};
      const raw = Object.values(list).find((p) => String(p?.playername || '').toLowerCase() === key);
      if (raw) games.push({ m, p: readPlayer(raw) });
    }

    const embed = new EmbedBuilder().setTitle(`🔎 Scouting: ${name}`).setColor(0x3498db);
    const lines = [];
    if (scouted) {
      lines.push(
        `**${scouted.ea_club_name || 'Unknown club'}** · ${scouted.primary_position || 'position unknown'}`,
        `Club stats: ${scouted.games_played ?? 0} games · ${scouted.goals ?? 0}G ${scouted.assists ?? 0}A · ⭐ ${scouted.avg_match_rating ? Number(scouted.avg_match_rating).toFixed(1) : '–'} avg`
      );
    }
    if (games.length) {
      const avg = (f) => games.reduce((s, g) => s + f(g.p), 0) / games.length;
      lines.push(
        `Against you: ${games.length} game${games.length === 1 ? '' : 's'} · ⭐ ${avg((p) => p.rating).toFixed(1)} avg · ` +
          `${games.reduce((s, g) => s + g.p.goals, 0)}G ${games.reduce((s, g) => s + g.p.assists, 0)}A · ${avg((p) => p.tackles).toFixed(1)} tackles/game`
      );
      embed.addFields({
        name: 'Recent games against you',
        value: truncate(
          games
            .slice(0, 6)
            .map(({ m, p }) => `<t:${Math.floor(new Date(m.created_at).getTime() / 1000)}:d> ${m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'} ${m.score_for}-${m.score_against}: ⭐ ${p.rating.toFixed(1)}, ${p.goals}G ${p.assists}A, ${p.passPct != null ? `${Math.round(p.passPct)}% passing, ` : ''}${p.tackles} tackles`)
            .join('\n')
        ),
      });
    }
    if (!lines.length && !games.length) lines.push("I haven't seen this player in any of this server's synced matches yet.");
    embed.setDescription(lines.join('\n'));
    return embed;
  }

  async function handleScoutButton(interaction, clubId, name) {
    if (!interaction.guildId) return interaction.reply({ content: 'Use this in your server.', flags: 64 });
    const { ok, club } = await canScout(interaction.member, interaction.guildId);
    if (!ok) return interaction.reply({ content: '❌ Only managers can scout players.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const embed = await scoutReport(interaction.guildId, clubId, name);
    const [listing] = await recruitment.findListings({ eaKeys: [name] });
    const { data: watch } = await supabase.from('scout_watchlist').select('id, note').eq('guild_id', interaction.guildId).eq('ea_key', name.toLowerCase()).maybeSingle();
    if (listing) embed.addFields({ name: '📣 Free agent', value: `Listed now: ${recruitment.positionsText(listing)}${listing.notes ? `\n> ${truncate(listing.notes, 150)}` : ''}` });
    if (watch) embed.addFields({ name: '👀 On your watchlist', value: watch.note || 'No note' });
    const buttons = [];
    if (!watch) buttons.push(new ButtonBuilder().setCustomId(`rx_sw:${encodeTarget(clubId, name)}`).setLabel('Add to Watchlist').setEmoji('👀').setStyle(ButtonStyle.Secondary));
    if (listing) buttons.push(new ButtonBuilder().setCustomId(`rx_reach:${listing.id}:${club?.key || ''}`).setLabel('Reach Out').setEmoji('📨').setStyle(ButtonStyle.Success));
    return interaction.editReply({ embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [] });
  }

  async function handleWatchButton(interaction, clubId, name) {
    if (!interaction.guildId) return interaction.reply({ content: 'Use this in your server.', flags: 64 });
    const { ok, club } = await canScout(interaction.member, interaction.guildId);
    if (!ok) return interaction.reply({ content: '❌ Only managers can edit the watchlist.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const { data: last } = await supabase
      .from('scouted_players')
      .select('ea_club_name')
      .eq('guild_id', interaction.guildId)
      .eq('ea_club_id', clubId)
      .limit(1)
      .maybeSingle();
    const res = await addToWatchlist({
      guildId: interaction.guildId,
      clubKey: club?.key,
      name,
      clubId,
      clubName: last?.ea_club_name || null,
      source: 'opponent',
      userId: interaction.user.id,
    });
    if (res.error) return interaction.editReply({ content: `❌ ${res.error}` });
    if (res.already) return interaction.editReply({ content: `\`${name}\` is already on the watchlist.` });
    return interaction.editReply({ content: `👀 Added \`${name}\` to the watchlist. I'll ping you if they list as a free agent or turn up at a new club. See \`/scout watchlist\`.` });
  }

  // ---------- /scout ----------

  async function handleScout(interaction) {
    const sub = interaction.options.getSubcommand();
    const { ok, club } = await canScout(interaction.member, interaction.guildId);
    if (!ok) return interaction.reply({ content: '❌ Only managers can use the watchlist.', flags: 64 });

    if (sub === 'add') {
      await interaction.deferReply({ flags: 64 });
      const name = interaction.options.getString('gamertag').trim();
      const res = await addToWatchlist({
        guildId: interaction.guildId,
        clubKey: club?.key,
        name,
        position: interaction.options.getString('position'),
        note: interaction.options.getString('note'),
        source: 'manual',
        userId: interaction.user.id,
      });
      if (res.error) return interaction.editReply({ content: `❌ ${res.error}` });
      if (res.already) return interaction.editReply({ content: `\`${name}\` is already on the watchlist.` });
      const [listing] = await recruitment.findListings({ eaKeys: [name] });
      return interaction.editReply({
        content:
          `👀 Watching \`${name}\`. I'll ping you if they list as a free agent or show up at a new club in a synced match.` +
          (listing ? `\n📣 They're listed as a free agent right now (${recruitment.positionsText(listing)}). Use \`/scout watchlist\` to reach out.` : ''),
      });
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('gamertag').trim();
      const { data } = await supabase.from('scout_watchlist').delete().eq('guild_id', interaction.guildId).eq('ea_key', name.toLowerCase()).select('id');
      return interaction.reply({ content: data?.length ? `✅ Stopped watching \`${name}\`.` : `\`${name}\` wasn't on the watchlist.`, flags: 64 });
    }

    // watchlist
    await interaction.deferReply({ flags: 64 });
    const { rows, error } = await loadWatchlist(interaction.guildId);
    if (recruitment.tablesMissing(error)) return interaction.editReply({ content: recruitment.NOT_READY });
    const embed = new EmbedBuilder().setTitle('👀 Recruitment watchlist').setColor(0x9b59b6);
    if (!rows.length) {
      embed.setDescription('Nobody yet. Press **Add to Watchlist** on a Recruitment Alert, or use `/scout add gamertag:`.');
      return interaction.editReply({ embeds: [embed] });
    }
    const listings = await recruitment.findListings({ eaKeys: rows.map((r) => r.ea_username), discordIds: rows.map((r) => r.discord_user_id) });
    const listingFor = (r) => listings.find((l) => (r.discord_user_id && l.discord_user_id === r.discord_user_id) || l.ea_username?.toLowerCase() === r.ea_key);
    const sorted = [...rows].sort((a, b) => !!listingFor(b) - !!listingFor(a));
    embed.setDescription(
      truncate(
        sorted
          .slice(0, 30)
          .map((r) => {
            const fa = listingFor(r);
            const where = r.last_known_club_name ? ` · ${r.last_known_club_name}` : '';
            return (
              `${fa ? '📣' : '•'} \`${r.ea_username}\`${r.position ? ` ${r.position}` : ''}${where}` +
              `${fa ? ` · **free agent** (${recruitment.positionsText(fa)})` : ''} · added <t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>` +
              (r.note ? `\n  _${truncate(r.note, 100)}_` : '')
            );
          })
          .join('\n'),
        4000
      )
    );
    embed.setFooter({ text: `${rows.length}/${MAX_WATCHLIST} watched · 📣 = listed as a free agent now` });
    const reachable = sorted.filter(listingFor).slice(0, 25);
    const components = reachable.length
      ? [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`rx_pick:${club?.key || ''}`)
              .setPlaceholder('Reach out to a free agent…')
              .addOptions(reachable.map((r) => ({ label: `${r.ea_username} · ${recruitment.positionsText(listingFor(r))}`.slice(0, 100), value: listingFor(r).id })))
          ),
        ]
      : [];
    return interaction.editReply({ embeds: [embed], components });
  }

  async function handleInteraction(interaction) {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== 'scout') return false;
      const q = String(interaction.options.getFocused() || '').toLowerCase();
      const { rows } = await loadWatchlist(interaction.guildId);
      await interaction
        .respond(rows.filter((r) => r.ea_key.includes(q)).slice(0, 25).map((r) => ({ name: r.ea_username, value: r.ea_username })))
        .catch(() => {});
      return true;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'scout') {
      if (!interaction.guildId) {
        await interaction.reply({ content: '❌ Use `/scout` in your club\'s server.', flags: 64 });
        return true;
      }
      await handleScout(interaction);
      return true;
    }
    return false;
  }

  // Buttons share the rx_ prefix so the recruitment router hands them over
  const target = (interaction) => {
    const [, clubId, ...name] = interaction.customId.split(':');
    return [clubId, name.join(':')];
  };
  recruitment.addComponent('rx_sc', (interaction) => handleScoutButton(interaction, ...target(interaction)));
  recruitment.addComponent('rx_sw', (interaction) => handleWatchButton(interaction, ...target(interaction)));
  recruitment.onListed(notifyListed);

  function start(discordClient) {
    client = discordClient;
    setInterval(() => scan().catch((err) => console.error('[Scouting] scan failed:', err.message)), SCAN_EVERY_MS);
    setTimeout(() => scan().catch(() => {}), 30 * 1000);
  }

  return { commands: SCOUT_COMMANDS, handleInteraction, start, scan, scanMatch, standoutReasons, readPlayer };
}

module.exports = { createScouting, SCOUT_COMMANDS, standoutReasons, readPlayer };
