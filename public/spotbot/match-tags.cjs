// Match tags: managers mark played games as League, Tournament or BYOT. EA only tells league, cup and
// friendly games apart, and BYOT nights and community tournaments are played as friendlies, so without
// a tag they all count as friendlies. The tag is stored in club_matches.match_data._tag (EA syncs only
// insert rows, so it is never overwritten) and read through matchCompetition() in club-insights.cjs,
// which is what stats, recaps, the Chronicle and the web app use.
//
// Tournament and BYOT games are kept apart from the regular stats: their per-player rows in player_stats
// are retyped to match_type 'tournament' / 'byot', so every regular board, rating and summary (which read
// 'club' / 'friendly' / 'competition') leaves them out, and the Tournaments views and leaderboard filter
// read them on their own. The type EA sync wrote is kept in match_data._ps_type so clearing a tag restores it.
//
// Two ways a game gets tagged:
// - Automatically, when a new EA friendly was played during a BYOT, tournament or league event.
// - By hand: /manager → Manager Hub → Tag Matches, or /manager → Stats & Scouting → Tag Matches
//   (also in the web Control Room, which runs the same panel).

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { toInsightMatches, MATCH_TAGS, competitionLabel, competitionEmoji, playerStatsTypeForTag } = require('./club-insights.cjs');
const { resolveClub, activeClubs } = require('./manager-hub.cjs');

const PAGE_SIZE = 15;
const MAX_MATCHES = 150;
const COLOR = 0x9b59b6;
const RESULT_EMOJI = { win: '🟢', draw: '⚪', loss: '🔴' };
// A game counts as part of an event if it kicked off from shortly before the event until it ended
const EVENT_LEAD_MS = 30 * 60 * 1000;
const DEFAULT_EVENT_MINUTES = 180;
const TAG_VALUES = new Set(MATCH_TAGS.map((t) => t.value));
// player_stats rows that belong to a synced club game (never draft or EA-aggregate rows)
const GAME_STAT_TYPES = ['club', 'friendly', 'competition', 'tournament', 'byot'];

const ACTION_SCHEMA = {
  name: 'matchtags',
  description: 'Mark played games as League, Tournament or BYOT so stats and recaps count them right.',
  options: [],
};

// What an event says the night was, or null when it isn't a competitive night
function tagForEvent(event) {
  const title = String(event?.title || '').toLowerCase();
  const type = String(event?.event_type || '').toLowerCase();
  if (/\b(practice|training|session|try ?outs?|scrim)\b/.test(title) || ['training', 'practice', 'tryout', 'scrim', 'draft'].includes(type)) return null;
  if (/\bbyot\b/.test(title)) return 'byot';
  if (/\b(tournament|cup|playoffs?)\b/.test(title) || type === 'tournament') return 'tournament';
  if (/\bleague\b/.test(title) || type === 'league') return 'league';
  return null;
}

// The event a game was played in, if any (events for another club are skipped)
function eventForMatch(events, clubKey, playedAt) {
  const t = playedAt.getTime();
  return (
    events.find((e) => {
      if (e.cancelled) return false;
      if (e.club_key && clubKey && e.club_key !== clubKey) return false;
      const start = new Date(e.scheduled_at).getTime();
      const end = start + (Number(e.duration_minutes) || DEFAULT_EVENT_MINUTES) * 60 * 1000;
      return t >= start - EVENT_LEAD_MS && t <= end;
    }) || null
  );
}

function isFriendly(row) {
  return /friendly/i.test(String(row?.match_data?._matchCategory || row?.match_type || ''));
}

function createMatchTags(deps) {
  const { supabase, getGuildState, callEdgeFunction } = deps;
  const canManageClub = deps.canManageClub || (async (member) => deps.isManager(member));

  // Move the game's player_stats rows to the type the tag asks for, then refresh those players' ratings
  async function retypePlayerStats(row, tag, md) {
    let eaMatchId = row.ea_match_id;
    if (!eaMatchId) {
      const { data } = await supabase.from('club_matches').select('ea_match_id').eq('id', row.id).maybeSingle();
      eaMatchId = data?.ea_match_id;
    }
    if (!eaMatchId || !row.guild_id) return;
    const { data: stats, error } = await supabase
      .from('player_stats')
      .select('id, discord_user_id, match_type')
      .eq('guild_id', row.guild_id)
      .eq('ea_match_id', String(eaMatchId))
      .in('match_type', GAME_STAT_TYPES);
    if (error) throw new Error(error.message);
    if (!stats?.length) return;
    if (!md._ps_type) {
      const original = stats.find((s) => s.match_type !== 'tournament' && s.match_type !== 'byot')?.match_type;
      if (original) md._ps_type = original;
    }
    const target = playerStatsTypeForTag(tag) || md._ps_type || 'club';
    const moved = stats.filter((s) => s.match_type !== target);
    if (!moved.length) return;
    const { error: upErr } = await supabase.from('player_stats').update({ match_type: target }).in('id', moved.map((s) => s.id));
    if (upErr) throw new Error(upErr.message);
    if (callEdgeFunction) {
      for (const id of new Set(moved.map((s) => s.discord_user_id))) {
        Promise.resolve(callEdgeFunction('calculate-ratings', { guild_id: row.guild_id, discord_user_id: id })).catch(() => {});
      }
    }
  }

  async function saveTag(row, tag, source, userId) {
    const md = { ...(row.match_data && typeof row.match_data === 'object' ? row.match_data : {}) };
    await retypePlayerStats(row, tag, md);
    if (tag) {
      md._tag = tag;
      md._tag_source = source;
      md._tagged_by = userId || null;
      md._tagged_at = new Date().toISOString();
    } else {
      delete md._tag;
      delete md._tag_source;
      delete md._tagged_by;
      delete md._tagged_at;
      delete md._ps_type;
    }
    const { error } = await supabase.from('club_matches').update({ match_data: md }).eq('id', row.id);
    if (error) throw new Error(error.message);
    row.match_data = md;
    return md;
  }

  // New-match hook (autopilot.onNewMatches): tag fresh EA friendlies played during a BYOT, tournament
  // or league event. Runs before the recaps are built, so the recap already shows the tag.
  async function autoTag(guildId, club, recent, rows) {
    const candidates = (rows || []).filter((r) => isFriendly(r) && !r.match_data?._tag && !r.match_data?._tag_source);
    if (!candidates.length) return;
    const times = toInsightMatches(candidates);
    const earliest = Math.min(...times.map((m) => m.playedAt.getTime()));
    const { data: events } = await supabase
      .from('availability_events')
      .select('id, title, event_type, scheduled_at, duration_minutes, club_key, cancelled')
      .eq('guild_id', guildId)
      .gte('scheduled_at', new Date(earliest - 12 * 60 * 60 * 1000).toISOString())
      .lte('scheduled_at', new Date(Date.now() + EVENT_LEAD_MS).toISOString())
      .order('scheduled_at', { ascending: false })
      .limit(50);
    const competitive = (events || []).filter((e) => tagForEvent(e));
    if (!competitive.length) return;
    for (const m of times) {
      const event = eventForMatch(competitive, club?.key, m.playedAt);
      if (!event) continue;
      const tag = tagForEvent(event);
      const row = candidates.find((r) => r.id === m.id);
      if (!row.guild_id) row.guild_id = guildId;
      await saveTag(row, tag, `event:${event.id}`, null).catch((err) => console.warn(`[match-tags] auto-tag ${m.id} failed: ${err.message}`));
      // Keep the hook's copies in step so later hooks and the recap see the tag
      for (const x of recent || []) {
        if (x.id === m.id) {
          x.tag = tag;
          x.competition = tag;
        }
      }
    }
  }

  // ---------- Panel ----------

  async function loadMatches(guildId, clubKey) {
    const { data, error } = await supabase
      .from('club_matches')
      .select('id, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey)
      .order('created_at', { ascending: false })
      .limit(MAX_MATCHES);
    if (error) throw new Error(error.message);
    return toInsightMatches(data || []);
  }

  const kindLine = (m) => `${competitionEmoji(m.competition)} ${competitionLabel(m.competition)}${m.tag ? '' : ' (EA)'}`;
  const when = (m) => `<t:${Math.floor(m.playedAt.getTime() / 1000)}:R>`;

  async function listView(guildId, club, page = 0, note = '') {
    const matches = await loadMatches(guildId, club.key);
    const embed = new EmbedBuilder().setTitle(`🏷️ ${club.name}: match types`).setColor(COLOR);
    if (!matches.length) {
      embed.setDescription('No matches saved yet. Play a game (or press **Sync Matches**) and it shows up here.');
      return { content: note || undefined, embeds: [embed], components: [] };
    }
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), pages - 1);
    const slice = matches.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
    embed
      .setDescription(
        'EA only knows league, cup and friendly games, and BYOT nights and tournaments are played as friendlies. ' +
          'Pick a game below to mark it **League**, **Tournament** or **BYOT**. Tournament and BYOT games get their own record and player stats ' +
          '(stats panel → **Tournaments**) and stay out of the regular stats and leaderboards. ' +
          'Friendlies played during a BYOT, tournament or league event are tagged for you.\n\n' +
          slice.map((m) => `${RESULT_EMOJI[m.result] || '⚪'} **${m.scoreFor}-${m.scoreAgainst}** vs ${m.opponent} · ${kindLine(m)} · ${when(m)}`).join('\n')
      )
      .setFooter({ text: `(EA) = EA's own type, no tag yet${pages > 1 ? ` · page ${p + 1} of ${pages}` : ''}` });

    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`mtag_pick:${club.key}:${p}`)
          .setPlaceholder('Pick a game to tag')
          .addOptions(
            slice.map((m) => ({
              label: `${m.scoreFor}-${m.scoreAgainst} vs ${m.opponent}`.slice(0, 100),
              description: `${competitionLabel(m.competition)}${m.tag ? '' : ' (EA)'} · ${m.playedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`.slice(0, 100),
              value: m.id,
              emoji: competitionEmoji(m.competition),
            }))
          )
      ),
    ];
    if (pages > 1) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`mtag_pg:${club.key}:${p - 1}`).setLabel('Newer').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
          new ButtonBuilder().setCustomId(`mtag_pg:${club.key}:${p + 1}`).setLabel('Older').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(p >= pages - 1)
        )
      );
    }
    return { content: note || undefined, embeds: [embed], components: rows };
  }

  async function loadRow(guildId, matchId) {
    const { data } = await supabase
      .from('club_matches')
      .select('id, guild_id, club_key, result, score_for, score_against, created_at, opponent_club_name, player_stats, match_data, match_type')
      .eq('id', matchId)
      .eq('guild_id', guildId)
      .maybeSingle();
    return data || null;
  }

  function detailView(row, club, page) {
    const m = toInsightMatches([row])[0];
    const scorers = m.players.filter((p) => Number(p.goals) > 0).map((p) => `${String(p.ea_username || '').trim()}${Number(p.goals) > 1 ? ` ×${p.goals}` : ''}`);
    const source = row.match_data?._tag_source;
    const embed = new EmbedBuilder()
      .setTitle(`${RESULT_EMOJI[m.result] || '⚪'} ${club.name} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent}`)
      .setColor(COLOR)
      .setDescription(
        `Played ${when(m)}${scorers.length ? `\n⚽ ${scorers.join(', ')}` : ''}\n\n` +
          `**Counts as:** ${kindLine(m)}${source?.startsWith('event:') ? ' · tagged from the event it was played in' : ''}\n` +
          'Pick what this game was.'
      );
    const tagButtons = MATCH_TAGS.map((t) =>
      new ButtonBuilder()
        .setCustomId(`mtag_set:${row.id}:${t.value}:${page}`)
        .setLabel(t.label)
        .setEmoji(t.emoji)
        .setStyle(m.tag === t.value ? ButtonStyle.Success : ButtonStyle.Primary)
    );
    tagButtons.push(
      new ButtonBuilder().setCustomId(`mtag_set:${row.id}:none:${page}`).setLabel("Use EA's type").setStyle(ButtonStyle.Secondary).setDisabled(!m.tag)
    );
    const back = new ButtonBuilder().setCustomId(`mtag_pg:${club.key}:${page}`).setLabel('Back to games').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
    return { content: '', embeds: [embed], components: [new ActionRowBuilder().addComponents(tagButtons), new ActionRowBuilder().addComponents(back)] };
  }

  const leadersOnly = (club) => ({ content: `❌ Only ${club ? `${club.name}'s` : 'club'} leaders can tag matches.`, flags: 64 });

  async function clubByKey(guildId, key, member) {
    const state = await getGuildState(guildId);
    return activeClubs(state).find((c) => c.key === key) || (key ? null : resolveClub(state, member));
  }

  async function open(interaction, clubKey) {
    const club = await clubByKey(interaction.guildId, clubKey, interaction.member);
    if (!club) return interaction.reply({ content: '❌ No club is set up yet. Run **/setup** first.', flags: 64 });
    if (!(await canManageClub(interaction.member, club))) return interaction.reply(leadersOnly(club));
    await interaction.deferReply({ flags: 64 });
    try {
      return await interaction.editReply(await listView(interaction.guildId, club));
    } catch (err) {
      return interaction.editReply({ content: `❌ Could not load matches: ${err.message}` });
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'matchtags') {
      await open(interaction, null);
      return true;
    }
    const id = interaction.customId || '';
    if (!id.startsWith('mtag_')) return false;
    const [action, a, b, c] = id.split(':');

    if (action === 'mtag_open' && interaction.isButton()) {
      await open(interaction, a);
      return true;
    }

    if (action === 'mtag_pg' && interaction.isButton()) {
      const club = await clubByKey(interaction.guildId, a);
      if (!club || !(await canManageClub(interaction.member, club))) return interaction.reply(leadersOnly(club)).then(() => true);
      await interaction.deferUpdate();
      await interaction.editReply(await listView(interaction.guildId, club, Number(b) || 0));
      return true;
    }

    if (action === 'mtag_pick' && interaction.isStringSelectMenu()) {
      const club = await clubByKey(interaction.guildId, a);
      if (!club || !(await canManageClub(interaction.member, club))) return interaction.reply(leadersOnly(club)).then(() => true);
      const row = await loadRow(interaction.guildId, interaction.values[0]);
      if (!row || row.club_key !== club.key) return interaction.reply({ content: '❌ That game is no longer saved.', flags: 64 }).then(() => true);
      await interaction.update(detailView(row, club, Number(b) || 0));
      return true;
    }

    if (action === 'mtag_set' && interaction.isButton()) {
      const tag = b === 'none' ? null : b;
      if (tag && !TAG_VALUES.has(tag)) return false;
      const row = await loadRow(interaction.guildId, a);
      if (!row) return interaction.reply({ content: '❌ That game is no longer saved.', flags: 64 }).then(() => true);
      const club = await clubByKey(interaction.guildId, row.club_key);
      if (!club || !(await canManageClub(interaction.member, club))) return interaction.reply(leadersOnly(club)).then(() => true);
      await interaction.deferUpdate();
      try {
        await saveTag(row, tag, 'manual', interaction.user.id);
      } catch (err) {
        await interaction.followUp({ content: `❌ Could not save the tag: ${err.message}`, flags: 64 });
        return true;
      }
      const label = `${row.score_for}-${row.score_against} vs ${row.opponent_club_name || 'Unknown'}`;
      const note = tag ? `✅ ${label} now counts as **${competitionLabel(tag)}**.` : `✅ ${label} is back to EA's own type.`;
      await interaction.editReply(await listView(interaction.guildId, club, Number(c) || 0, note));
      return true;
    }

    return false;
  }

  return { handleInteraction, autoTag, saveTag, listView };
}

module.exports = { createMatchTags, tagForEvent, eventForMatch, ACTION_SCHEMA };
