// Team recruiting and Find a team, for Social Hub servers: the bridge from pickup play to teams.
//   Find a team   the board's Find a team ranks every hub team for you: your chemistry with its
//                 players (hub_pairs), whether it's looking for your line (GK, DEF, MID, ATT from My
//                 positions) and whether it's recruiting. Pick one from the menu to join it (joining a
//                 hub team is open, the same as the Join button in team chat).
//   Recruiting    a team's captain (or anyone with its Captain role) opens Recruit players from the
//                 captain's desk or Find a team: pick the lines you need and a short note, post the
//                 ad in #hub-feed with a Join button (once every 6 hours), and see suggested players:
//                 active hub players on no team, ranked by chemistry with your squad and fit for the
//                 lines you need. Invite them sends each one DM with a Join button (once a week per
//                 player per team). Recruiting teams are marked 📣 on the hub board.
// State lives in guild_settings.social_hub.recruiting[clubKey]. Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { chemLabel, linesOf } = require('./hub-chemistry.cjs');

const GREEN = 0x2ecc71;
const NO_PINGS = { parse: [] };
const LINES = ['GK', 'DEF', 'MID', 'ATT'];
const LINE_NAMES = { GK: 'Goalkeeper', DEF: 'Defence', MID: 'Midfield', ATT: 'Attack' };
const POST_EVERY_MS = 6 * 60 * 60 * 1000;
const INVITE_EVERY_MS = 7 * 86400000;
const ACTIVE_DAYS = 14;
const MAX_INVITES = 5;

// ---------- Pure ----------

const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// Average known chemistry between one player and a group (null when they've never played together)
function chemWith(id, group, chemOf) {
  const known = group.filter((o) => o !== id).map((o) => chemOf(id, o)).filter((s) => s != null);
  return known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null;
}

// How well a team suits a player: chemistry with its players, a line it needs, and whether it's recruiting
function teamFit(myLines, team, chem) {
  const wanted = team.recruiting?.lines || [];
  const lineMatch = wanted.some((l) => myLines.includes(l));
  const score = (chem ?? 40) + (lineMatch ? 25 : 0) + (team.recruiting ? 10 : 0) - (team.members.length >= 11 ? 20 : 0);
  return { score, lineMatch };
}

// Teams ranked for a player, best first; teams they're already on are left out
function rankTeams(me, myLines, teams, chemOf) {
  return teams
    .filter((t) => !t.members.includes(me))
    .map((t) => {
      const chem = chemWith(me, t.members, chemOf);
      return { ...t, chem, ...teamFit(myLines, t, chem) };
    })
    .sort((a, b) => b.score - a.score || b.members.length - a.members.length);
}

// Players worth inviting to a team: chemistry with the squad, then a line the team needs
function rankPlayers(candidates, members, needLines, chemOf, prefsOf) {
  return candidates
    .filter((id) => !members.includes(id))
    .map((id) => {
      const lines = linesOf(prefsOf(id));
      const chem = chemWith(id, members, chemOf);
      const fits = needLines.length ? lines.some((l) => needLines.includes(l)) : false;
      return { id, lines, chem, fits, score: (chem ?? 40) + (fits ? 25 : 0) };
    })
    .sort((a, b) => b.score - a.score);
}

function adLine(rec) {
  if (!rec) return null;
  const lines = (rec.lines || []).map((l) => LINE_NAMES[l] || l);
  return [lines.length ? `needs ${lines.join(', ')}` : 'recruiting', rec.note ? `"${rec.note}"` : null].filter(Boolean).join(' · ');
}

// The hub board's teams list marks a recruiting team with 📣 and the lines it needs
function boardMark(hub, key) {
  const rec = hub?.recruiting?.[key];
  return rec ? ` 📣${rec.lines?.length ? ` ${rec.lines.join('/')}` : ''}` : '';
}

const cleanNote = (raw) => String(raw || '').replace(/[@#<>*_`~|\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

// ---------- Module ----------

function createHubRecruit(deps) {
  const { supabase, hubOf, saveHub, getGuildState, getUserPrefs } = deps;
  const socialHub = () => deps.socialHub();
  const client = () => deps.client();
  const invited = new Map(); // `${guild}:${club}:${user}` -> ms

  async function teamsOf(guild) {
    const [hub, state] = await Promise.all([hubOf(guild.id), getGuildState(guild.id)]);
    const out = [];
    for (const key of hub.teams || []) {
      const club = state.clubs.find((c) => c.key === key && c.enabled);
      if (!club?.team_role_id) continue;
      const role = guild.roles.cache.get(club.team_role_id) || (await guild.roles.fetch(club.team_role_id).catch(() => null));
      if (!role) continue;
      const members = [...(role.members?.keys?.() || [])];
      out.push({ key, club, name: club.name, members, recruiting: hub.recruiting?.[key] || null });
    }
    return out;
  }

  async function chemMap(guildId, ids) {
    const list = [...new Set(ids)].slice(0, 150);
    if (list.length < 2) return () => null;
    const { data } = await supabase.from('hub_pairs').select('user_a, user_b, score').eq('guild_id', guildId).in('user_a', list).in('user_b', list);
    const m = new Map((data || []).map((r) => [`${r.user_a}:${r.user_b}`, r.score]));
    return (a, b) => m.get(pairKey(a, b)) ?? null;
  }

  async function prefsOf(guildId, id) {
    return ((await getUserPrefs?.(guildId, id).catch(() => [])) || []).map((p) => String(p).toUpperCase());
  }

  function isCaptain(member, club) {
    return !!member && (club.captain_id === member.id || (club.captain_role_id && member.roles?.cache?.has?.(club.captain_role_id)));
  }

  // ---------- Find a team ----------

  async function findCard(guild, member) {
    const teams = await teamsOf(guild);
    const myLines = linesOf(await prefsOf(guild.id, member.id));
    const chemOf = await chemMap(guild.id, [member.id, ...teams.flatMap((t) => t.members)]);
    const ranked = rankTeams(member.id, myLines, teams, chemOf).slice(0, 10);
    const mine = teams.filter((t) => isCaptain(member, t.club));
    const embed = new EmbedBuilder()
      .setTitle('🔎 Find a team')
      .setColor(GREEN)
      .setDescription(
        teams.length
          ? [
              ranked.length
                ? ranked
                    .map((t) => `${t.recruiting ? '📣' : '🛡️'} **${t.name}** · ${t.members.length} player${t.members.length === 1 ? '' : 's'}${t.chem != null ? ` · chemistry ${t.chem} ${chemLabel(t.chem)}` : ''}${t.lineMatch ? ' · ✅ needs your line' : ''}${t.recruiting ? `\n   ${adLine(t.recruiting)}` : ''}`)
                    .join('\n')
                : 'You\'re already on every team here!',
              myLines.length ? null : '\nSet **My positions** on the board so teams that need your line show first.',
            ].filter(Boolean).join('\n')
          : 'No teams yet. Press **Chemistry → Build a squad** to start one with the people you play best with.'
      )
      .setFooter({ text: 'Ranked by your chemistry with each team, the lines they need, and who is recruiting.' });
    const rows = [];
    if (ranked.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('hr_join')
            .setPlaceholder('Join a team')
            .addOptions(ranked.map((t) => ({ label: t.name.slice(0, 100), value: t.key, description: (adLine(t.recruiting) || `${t.members.length} players`).slice(0, 100), emoji: t.recruiting ? '📣' : '🛡️' })))
        )
      );
    }
    const buttons = mine.slice(0, 4).map((t) => new ButtonBuilder().setCustomId(`hr_rec:${t.key}`).setLabel(`Recruit for ${t.name}`.slice(0, 80)).setEmoji('📣').setStyle(ButtonStyle.Primary));
    buttons.push(new ButtonBuilder().setCustomId('ch_me').setLabel('Chemistry').setEmoji('🧪').setStyle(ButtonStyle.Secondary));
    rows.push(new ActionRowBuilder().addComponents(...buttons));
    return { embeds: [embed], components: rows, allowedMentions: NO_PINGS };
  }

  // ---------- Captain's recruiting card ----------

  async function suggestions(guild, team) {
    const since = new Date(Date.now() - ACTIVE_DAYS * 86400000).toISOString();
    const { data } = await supabase.from('hub_players').select('discord_user_id').eq('guild_id', guild.id).gte('updated_at', since).order('xp', { ascending: false }).limit(120);
    const teams = await teamsOf(guild);
    const teamed = new Set(teams.flatMap((t) => t.members));
    const candidates = (data || []).map((r) => r.discord_user_id).filter((id) => !teamed.has(id)).slice(0, 60);
    const chemOf = await chemMap(guild.id, [...team.members, ...candidates]);
    const prefs = new Map(await Promise.all(candidates.map(async (id) => [id, await prefsOf(guild.id, id)])));
    return rankPlayers(candidates, team.members, team.recruiting?.lines || [], chemOf, (id) => prefs.get(id));
  }

  async function recruitCard(guild, key) {
    const team = (await teamsOf(guild)).find((t) => t.key === key);
    if (!team) return { content: '❌ This team is gone.', embeds: [], components: [] };
    const picks = (await suggestions(guild, team)).slice(0, MAX_INVITES);
    const rec = team.recruiting;
    const embed = new EmbedBuilder()
      .setTitle(`📣 Recruit for ${team.name}`)
      .setColor(GREEN)
      .setDescription(
        [
          rec ? `**Recruiting:** ${adLine(rec)}` : '**Not recruiting.** Pick the lines you need below to start.',
          `${team.members.length} player${team.members.length === 1 ? '' : 's'} on the team.`,
        ].join('\n')
      )
      .addFields({
        name: 'Suggested players (on no team, active lately)',
        value:
          picks
            .map((p) => `${p.chem != null ? chemLabel(p.chem) : '🆕'} <@${p.id}>${p.lines.length ? ` · ${p.lines.join('/')}` : ''}${p.chem != null ? ` · chemistry ${p.chem}` : ''}${p.fits ? ' · ✅ fits' : ''}`)
            .join('\n') || 'Nobody free right now. Post your ad in the hub feed and check back.',
      })
      .setFooter({ text: 'Invite them sends each one a DM with a Join button (once a week each). Nobody is pinged.' });
    const lines = new StringSelectMenuBuilder()
      .setCustomId(`hr_lines:${key}`)
      .setPlaceholder('Lines you need')
      .setMinValues(0)
      .setMaxValues(LINES.length)
      .addOptions(LINES.map((l) => ({ label: LINE_NAMES[l], value: l, default: !!rec?.lines?.includes(l) })));
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`hr_note:${key}`).setLabel('Add a note').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`hr_post:${key}`).setLabel('Post in hub feed').setEmoji('📣').setStyle(ButtonStyle.Primary).setDisabled(!rec),
      new ButtonBuilder().setCustomId(`hr_inv:${key}`).setLabel('Invite them').setEmoji('✉️').setStyle(ButtonStyle.Success).setDisabled(!picks.length),
      new ButtonBuilder().setCustomId(`hr_stop:${key}`).setLabel('Stop recruiting').setStyle(ButtonStyle.Secondary).setDisabled(!rec)
    );
    return { content: '', embeds: [embed], components: [new ActionRowBuilder().addComponents(lines), buttons], allowedMentions: NO_PINGS };
  }

  async function setRecruiting(guildId, key, patch) {
    const hub = { ...(await hubOf(guildId)) };
    const all = { ...(hub.recruiting || {}) };
    if (patch === null) delete all[key];
    else all[key] = { ...(all[key] || { lines: [], note: '' }), ...patch, at: Date.now() };
    await saveHub(guildId, { ...hub, recruiting: all });
    socialHub()?.touch?.(guildId);
    return all[key] || null;
  }

  async function postAd(guild, key, by) {
    const hub = await hubOf(guild.id);
    const rec = hub.recruiting?.[key];
    if (!rec) return '❌ Pick the lines you need first.';
    if (Date.now() - (rec.posted_at || 0) < POST_EVERY_MS) return '⏱️ You can post the ad once every 6 hours.';
    const feed = hub.feed_channel_id ? await guild.channels.fetch(hub.feed_channel_id).catch(() => null) : null;
    if (!feed?.send) return '❌ This hub has no feed channel. An admin can press **Set Up Social Hub** again.';
    const team = (await teamsOf(guild)).find((t) => t.key === key);
    if (!team) return '❌ This team is gone.';
    const embed = new EmbedBuilder()
      .setTitle(`📣 ${team.name} is recruiting`)
      .setColor(GREEN)
      .setDescription(`${adLine(rec)}\n${team.members.length} player${team.members.length === 1 ? '' : 's'} so far. Press **Join team** to jump in, or **Find a team** on the hub board to see how well you'd fit.`)
      .setFooter({ text: `Posted by a ${team.name} captain` });
    const row = new ActionRowBuilder().addComponents(
      // Handled by social-hub.cjs (the same as the Join button in team chat)
      new ButtonBuilder().setCustomId(`sh_join:${key}`).setLabel(`Join ${team.name}`.slice(0, 80)).setEmoji('✅').setStyle(ButtonStyle.Success)
    );
    const ok = await feed.send({ embeds: [embed], components: [row], allowedMentions: NO_PINGS }).then(() => true).catch(() => false);
    if (!ok) return '❌ I couldn\'t post in the hub feed.';
    await setRecruiting(guild.id, key, { posted_at: Date.now(), posted_by: by });
    return `📣 Posted in <#${feed.id}>.`;
  }

  async function invite(guild, key) {
    const team = (await teamsOf(guild)).find((t) => t.key === key);
    if (!team) return '❌ This team is gone.';
    const picks = (await suggestions(guild, team)).slice(0, MAX_INVITES);
    let sent = 0;
    let skipped = 0;
    for (const p of picks) {
      const k = `${guild.id}:${key}:${p.id}`;
      if (Date.now() - (invited.get(k) || 0) < INVITE_EVERY_MS) {
        skipped += 1;
        continue;
      }
      const user = await client()?.users.fetch(p.id).catch(() => null);
      if (!user) continue;
      const row = new ActionRowBuilder().addComponents(
        // Handled by hub-chemistry.cjs (works from DMs)
        new ButtonBuilder().setCustomId(`ch_inv:${guild.id}:${key}`).setLabel(`Join ${team.name}`.slice(0, 80)).setEmoji('✅').setStyle(ButtonStyle.Success)
      );
      const why = p.chem != null ? 'you have good chemistry with its players' : 'you\'ve been active in the hub lately';
      const ok = await user
        .send({ content: `🛡️ **${team.name}** in **${guild.name}** would like you on the team: ${why}.${team.recruiting ? ` They ${adLine(team.recruiting)}.` : ''} Press **Join** to get the team role, or ignore this.`, components: [row], allowedMentions: NO_PINGS })
        .then(() => true)
        .catch(() => false);
      invited.set(k, Date.now());
      if (ok) sent += 1;
    }
    return `✉️ Sent ${sent} invite${sent === 1 ? '' : 's'}${skipped ? ` (${skipped} already invited this week)` : ''}.`;
  }

  // ---------- Interactions ----------

  async function captainCheck(interaction, key) {
    const state = await getGuildState(interaction.guildId);
    const club = state.clubs.find((c) => c.key === key && c.enabled);
    if (!club) return { error: '❌ This team is gone.' };
    const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!isCaptain(member, club)) return { error: `❌ Only ${club.name}'s captains can recruit for it.` };
    return { club };
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('hr_') || !interaction.guildId) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;

    if (id === 'hr_find' && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await findCard(interaction.guild, interaction.member));
      return true;
    }
    if (id === 'hr_join' && interaction.isStringSelectMenu?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: await socialHub().joinTeam(interaction.guild, interaction.user.id, interaction.values[0]) });
      return true;
    }
    const [action, key] = id.split(':');
    if (!key) return false;
    const check = await captainCheck(interaction, key);
    if (check.error) {
      await interaction.reply({ content: check.error, flags: 64 });
      return true;
    }
    const fromCard = interaction.message?.flags?.has?.(64);
    if (action === 'hr_rec') {
      if (fromCard) await interaction.deferUpdate();
      else await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await recruitCard(interaction.guild, key));
      return true;
    }
    if (action === 'hr_lines' && interaction.isStringSelectMenu?.()) {
      await interaction.deferUpdate();
      const lines = LINES.filter((l) => interaction.values.includes(l));
      await setRecruiting(interaction.guildId, key, lines.length || hub.recruiting?.[key]?.note ? { lines } : null);
      await interaction.editReply(await recruitCard(interaction.guild, key));
      return true;
    }
    if (action === 'hr_note' && interaction.isButton?.()) {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`hr_note_m:${key}`)
          .setTitle('Recruiting note')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('note').setLabel('What are you looking for?').setPlaceholder('e.g. Weeknights 8pm UK, Division 3, chill but competitive').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false).setValue(hub.recruiting?.[key]?.note || '')
            )
          )
      );
      return true;
    }
    if (action === 'hr_note_m' && interaction.isModalSubmit?.()) {
      await interaction.deferUpdate();
      await setRecruiting(interaction.guildId, key, { note: cleanNote(interaction.fields.getTextInputValue('note')) });
      await interaction.editReply(await recruitCard(interaction.guild, key));
      return true;
    }
    if (action === 'hr_post' && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: await postAd(interaction.guild, key, interaction.user.id) });
      return true;
    }
    if (action === 'hr_inv' && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({ content: await invite(interaction.guild, key) });
      return true;
    }
    if (action === 'hr_stop' && interaction.isButton?.()) {
      await interaction.deferUpdate();
      await setRecruiting(interaction.guildId, key, null);
      await interaction.editReply(await recruitCard(interaction.guild, key));
      return true;
    }
    return false;
  }

  return { handleInteraction, findCard, recruitCard, postAd, invite, teamsOf };
}

module.exports = { createHubRecruit, chemWith, teamFit, rankTeams, rankPlayers, adLine, cleanNote, boardMark };
