// GafferBot Network friendlies: a club leader invites a club on another server (or posts an open
// invite to every network server), the other side accepts, both network channels get a fixture card,
// and the score fills in by itself when either club's EA sync brings in the game.
// Managers' Discord names cross servers only once an invite is accepted.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { resolveClub, activeClubs } = require('./manager-hub.cjs');
const { toFcPlatform } = require('./ea-fc27.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 14;
const GRACE_MS = 30 * 60 * 1000;          // an invite can still be accepted this long after kick-off
const RESULT_WINDOW_MS = 4 * 60 * 60 * 1000; // a game within this of kick-off counts as the fixture
const DECLINE_COOLDOWN_MS = DAY_MS;
const MAX_OPEN_POSTS = 25;
const UUID = /^[0-9a-f-]{36}$/i;

const unix = (d) => Math.floor(new Date(d).getTime() / 1000);
const when = (d) => `<t:${unix(d)}:F> (<t:${unix(d)}:R>)`;

// Which accepted fixture (if any) is this synced game? Same two EA clubs, played near kick-off.
function fixtureForMatch(fixtures, guildId, clubKey, row, statuses = ['accepted']) {
  const playedAt = row.match_data?.timestamp ? row.match_data.timestamp * 1000 : new Date(row.created_at).getTime();
  const opp = String(row.opponent_club_id || '');
  return (
    (fixtures || []).find((f) => {
      if (!statuses.includes(f.status)) return false;
      const home = f.from_guild_id === guildId && f.from_club_key === clubKey;
      const away = f.to_guild_id === guildId && f.to_club_key === clubKey;
      if (!home && !away) return false;
      if (opp !== String(home ? f.to_ea_club_id : f.from_ea_club_id)) return false;
      return Math.abs(playedAt - new Date(f.kickoff_at).getTime()) <= RESULT_WINDOW_MS;
    }) || null
  );
}

// Clubs to suggest for an invite: same platform, closest EA skill rating first
function suggestClubs(clubs, platform, skill) {
  return clubs
    .filter((c) => !platform || c.platform === platform)
    .sort((a, b) => Math.abs((a.skill || 0) - (skill || 0)) - Math.abs((b.skill || 0) - (skill || 0)));
}

function createNetworkFriendlies(deps) {
  const { supabase, getGuildState, network, canManageClub, autopilot } = deps;

  async function load(id) {
    if (!UUID.test(id || '')) return null;
    const { data } = await supabase.from('network_fixtures').select('*').eq('id', id).maybeSingle();
    return data;
  }

  async function clubStats(guildId, clubKey) {
    const { data } = await supabase.from('club_stats').select('current_division, skill_rating, wins, draws, losses').eq('guild_id', guildId).eq('club_key', clubKey).maybeSingle();
    return data;
  }

  async function inviteEmbed(f) {
    const s = await clubStats(f.from_guild_id, f.from_club_key);
    const bits = [s?.current_division ? `Div ${s.current_division}` : null, s?.skill_rating ? `SR ${s.skill_rating}` : null, s && s.wins + s.draws + s.losses ? `${s.wins}W ${s.draws}D ${s.losses}L` : null].filter(Boolean);
    const embed = new EmbedBuilder()
      .setTitle(`🤝 ${f.from_club_name} ${f.is_open ? 'is looking for a friendly' : 'invites you to a friendly'}`)
      .setColor(0xeb459e)
      .addFields(
        { name: 'Kick-off', value: when(f.kickoff_at), inline: true },
        { name: 'Platform', value: f.platform === 'nx' ? 'Switch' : 'PS5 / Xbox Series / PC', inline: true },
        { name: 'Club', value: bits.join(' · ') || 'No EA stats yet', inline: true }
      )
      .setFooter({ text: f.is_open ? 'Open invite on the GafferBot Network: the first club to accept plays.' : 'From another server on the GafferBot Network. Only your club leaders can answer.' });
    if (f.note) embed.setDescription(f.note);
    return embed;
  }

  // Club leaders on this server who can act for `club`
  async function leaderOf(interaction, club) {
    return !!club && (await canManageClub(interaction.member, club));
  }

  async function editPosts(client, f, payload, skipMessageId) {
    for (const p of f.posts || []) {
      if (p.message_id === skipMessageId) continue;
      const channel = await client.channels.fetch(p.channel_id).catch(() => null);
      const msg = channel ? await channel.messages.fetch(p.message_id).catch(() => null) : null;
      if (msg) await msg.edit(payload).catch(() => {});
    }
  }

  // ---------- /network friendly ----------

  async function handleFriendly(interaction) {
    await interaction.deferReply({ flags: 64 });
    if (!(await network.isListed(interaction.guildId))) {
      return interaction.editReply({ content: '⚪ This server isn\'t on the GafferBot Network yet. A server admin can join with **/manager → Admin → Network Setup**.' });
    }
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club?.ea_club_id) return interaction.editReply({ content: '❌ Link your club to EA first (**/manager → Admin → Link EA Club**) so the other side can find you in game.' });
    if (!(await leaderOf(interaction, club))) return interaction.editReply({ content: `❌ Only ${club.name}'s leaders can arrange friendlies.` });
    const limited = await network.overLimit(interaction.guildId, 'friendly');
    if (limited) return interaction.editReply({ content: `⏳ ${limited}` });

    const whenText = interaction.options.getString('when');
    const kickoff = await network.kickoffFor(interaction.guildId, whenText);
    if (!kickoff) return interaction.editReply({ content: `❌ I couldn't read "${whenText.slice(0, 50)}" as a time. Try "9pm", "thu 21:00" or "now".` });
    if (kickoff.getTime() + GRACE_MS < Date.now()) return interaction.editReply({ content: '❌ That kick-off has already passed.' });
    if (kickoff.getTime() - Date.now() > MAX_DAYS_AHEAD * DAY_MS) return interaction.editReply({ content: `❌ Friendlies can be arranged up to ${MAX_DAYS_AHEAD} days ahead.` });

    const isOpen = !!interaction.options.getBoolean('open');
    const { data: f, error } = await supabase
      .from('network_fixtures')
      .insert({
        from_guild_id: interaction.guildId,
        from_club_key: club.key,
        from_club_name: club.ea_club_name || club.name,
        from_ea_club_id: String(club.ea_club_id),
        platform: toFcPlatform(club.ea_platform),
        kickoff_at: kickoff.toISOString(),
        note: network.cleanText(interaction.options.getString('note')) || null,
        is_open: isOpen,
        created_by_discord_id: interaction.user.id,
      })
      .select('*')
      .single();
    if (error) return interaction.editReply({ content: `❌ Could not create the invite: ${error.message}` });
    const cancelRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`nw_fx:cancel:${f.id}`).setLabel('Cancel invite').setStyle(ButtonStyle.Secondary));

    if (isOpen) {
      const posted = await postOpen(interaction.client, f);
      await network.logActivity(interaction.guildId, 'friendly');
      return interaction.editReply({
        content: posted
          ? `✅ Open invite posted to ${posted} network server${posted === 1 ? '' : 's'} for ${when(kickoff)}. The first club to accept plays, and you'll hear about it in your network channel.`
          : '⚪ No other network server has a club on your platform yet. Nothing was posted.',
        components: posted ? [cancelRow] : [],
      });
    }

    const mine = await clubStats(interaction.guildId, club.key);
    const others = (await network.clubDirectory(interaction.client, await network.visibleServers(interaction.guildId))).filter((c) => c.guildId !== interaction.guildId);
    const options = suggestClubs(others, f.platform, mine?.skill_rating).slice(0, 25);
    if (!options.length) {
      await supabase.from('network_fixtures').update({ status: 'cancelled' }).eq('id', f.id);
      return interaction.editReply({ content: '⚪ No other club on your platform is on the network yet. Try again later, or post an open invite with `open: Yes`.' });
    }
    return interaction.editReply({
      content: `Pick the club to invite for ${when(kickoff)}. Closest skill rating first.`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`nw_fx:pick:${f.id}`)
            .setPlaceholder('Pick a club')
            .addOptions(
              options.map((c) => ({
                label: c.name.slice(0, 100),
                value: `${c.guildId}|${c.key}`,
                description: [c.division ? `Div ${c.division}` : null, c.skill ? `SR ${c.skill}` : null, c.region, c.serverName ? `on ${c.serverName}` : null].filter(Boolean).join(' · ').slice(0, 100) || undefined,
              }))
            )
        ),
        cancelRow,
      ],
    });
  }

  async function postOpen(client, f) {
    const servers = (await network.visibleServers(f.from_guild_id)).filter((s) => s.channel_id);
    const clubs = await network.clubDirectory(client, servers);
    const targets = servers.filter((s) => clubs.some((c) => c.guildId === s.guild_id && c.platform === f.platform)).slice(0, MAX_OPEN_POSTS);
    const embed = await inviteEmbed(f);
    const mod = network.moderationSelect([{ guildId: f.from_guild_id, name: f.from_club_name }], 'friendly invite');
    const posts = [];
    for (const s of targets) {
      const msg = await network.postToChannel(client, s.guild_id, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`nw_fx:acc:${f.id}`).setLabel('Accept').setEmoji('🤝').setStyle(ButtonStyle.Success)), ...(mod ? [mod] : [])],
      });
      if (msg) posts.push({ guild_id: s.guild_id, channel_id: msg.channelId, message_id: msg.id });
    }
    await supabase.from('network_fixtures').update({ status: posts.length ? 'sent' : 'cancelled', posts }).eq('id', f.id);
    return posts.length;
  }

  async function pickClub(interaction, f) {
    if (!f || f.status !== 'draft' || f.created_by_discord_id !== interaction.user.id) return interaction.update({ content: 'This invite has expired.', components: [] });
    const [guildId, clubKey] = String(interaction.values[0] || '').split('|');
    if (await network.isBlockedBetween(f.from_guild_id, guildId)) return interaction.update({ content: '⚪ That club isn\'t taking invites right now.', components: [] });
    if (!(await network.isListed(guildId))) return interaction.update({ content: '⚪ That club has left the network.', components: [] });
    const target = activeClubs(await getGuildState(guildId)).find((c) => c.key === clubKey);
    if (!target?.ea_club_id) return interaction.update({ content: '⚪ That club isn\'t listed any more.', components: [] });

    // One live invite per pair, and a day's rest after a decline
    const { data: recent } = await supabase
      .from('network_fixtures')
      .select('status, responded_at')
      .eq('from_guild_id', f.from_guild_id)
      .eq('from_club_key', f.from_club_key)
      .eq('to_guild_id', guildId)
      .eq('to_club_key', clubKey)
      .in('status', ['sent', 'declined'])
      .order('created_at', { ascending: false })
      .limit(5);
    if ((recent || []).some((r) => r.status === 'sent')) return interaction.update({ content: '⏳ You already have an invite waiting with that club.', components: [] });
    const lastDecline = (recent || []).find((r) => r.status === 'declined' && r.responded_at && Date.now() - new Date(r.responded_at).getTime() < DECLINE_COOLDOWN_MS);
    if (lastDecline) return interaction.update({ content: `⏳ That club passed recently. You can invite them again <t:${unix(new Date(lastDecline.responded_at).getTime() + DECLINE_COOLDOWN_MS)}:R>.`, components: [] });

    const patch = { to_guild_id: guildId, to_club_key: clubKey, to_club_name: target.ea_club_name || target.name, to_ea_club_id: String(target.ea_club_id), status: 'sent' };
    const updated = { ...f, ...patch };
    const mod = network.moderationSelect([{ guildId: f.from_guild_id, name: f.from_club_name }], 'friendly invite');
    const msg = await network.postToChannel(interaction.client, guildId, {
      embeds: [await inviteEmbed(updated)],
      content: `For **${patch.to_club_name}**:`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`nw_fx:acc:${f.id}`).setLabel('Accept').setEmoji('🤝').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`nw_fx:dec:${f.id}`).setLabel('Decline').setStyle(ButtonStyle.Secondary)
        ),
        ...(mod ? [mod] : []),
      ],
    });
    if (!msg) return interaction.update({ content: '❌ I couldn\'t post in that club\'s network channel. Try another club.', components: [] });
    await supabase.from('network_fixtures').update({ ...patch, posts: [{ guild_id: guildId, channel_id: msg.channelId, message_id: msg.id }] }).eq('id', f.id).eq('status', 'draft');
    await network.logActivity(f.from_guild_id, 'friendly');
    return interaction.update({
      content: `✅ Invite sent to **${patch.to_club_name}** for ${when(f.kickoff_at)}. Their answer lands in your network channel.`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`nw_fx:cancel:${f.id}`).setLabel('Cancel invite').setStyle(ButtonStyle.Secondary))],
    });
  }

  // ---------- Answering an invite ----------

  async function accept(interaction, f) {
    if (!f || !interaction.guildId) return interaction.reply({ content: 'This invite has expired.', flags: 64 });
    if (f.status !== 'sent' || new Date(f.kickoff_at).getTime() + GRACE_MS < Date.now()) {
      if (f.status === 'sent') await supabase.from('network_fixtures').update({ status: 'expired' }).eq('id', f.id).eq('status', 'sent');
      await interaction.update({ components: [] }).catch(() => {});
      return interaction.followUp({ content: `This invite is ${f.status === 'sent' ? 'past its kick-off' : 'no longer open'}.`, flags: 64 });
    }
    if (interaction.guildId === f.from_guild_id) return interaction.reply({ content: '❌ That\'s your own invite.', flags: 64 });
    if (await network.isBlockedBetween(f.from_guild_id, interaction.guildId)) return interaction.reply({ content: 'This invite has expired.', flags: 64 });
    // Both servers must still be on the network: a suspended or departed server's invites stop working
    if (!(await network.isListed(f.from_guild_id))) return interaction.reply({ content: 'This invite has expired.', flags: 64 });
    if (!(await network.isListed(interaction.guildId))) return interaction.reply({ content: '❌ Switch the GafferBot Network on for this server first (/manager → Admin → Network).', flags: 64 });
    const state = await getGuildState(interaction.guildId);
    let club;
    if (f.is_open) {
      club = resolveClub(state, interaction.member);
      if (!club?.ea_club_id) return interaction.reply({ content: '❌ Link your club to EA first so they can find you in game.', flags: 64 });
      if (toFcPlatform(club.ea_platform) !== f.platform) return interaction.reply({ content: '❌ Your club is on a different platform.', flags: 64 });
    } else {
      if (interaction.guildId !== f.to_guild_id) return interaction.reply({ content: 'This invite has expired.', flags: 64 });
      club = activeClubs(state).find((c) => c.key === f.to_club_key);
    }
    if (!(await leaderOf(interaction, club))) return interaction.reply({ content: `❌ Only ${club?.name || 'the club'}'s leaders can accept.`, flags: 64 });

    const patch = {
      status: 'accepted',
      accepted_by_discord_id: interaction.user.id,
      responded_at: new Date().toISOString(),
      to_guild_id: interaction.guildId,
      to_club_key: club.key,
      to_club_name: club.ea_club_name || club.name,
      to_ea_club_id: String(club.ea_club_id),
    };
    const { data: won } = await supabase.from('network_fixtures').update(patch).eq('id', f.id).eq('status', 'sent').select('*');
    if (!won?.length) return interaction.reply({ content: 'Another club got there first.', flags: 64 });
    const fx = won[0];
    const sender = await interaction.client.users.fetch(fx.created_by_discord_id).catch(() => null);

    await interaction.update({
      content: `✅ **${fx.to_club_name}** vs **${fx.from_club_name}** is on, ${when(fx.kickoff_at)}. In game, find the club **${fx.from_club_name}**. Their manager is **${sender?.username || 'their manager'}**. The score fills in here after the EA sync.`,
      embeds: [],
      components: [],
    });
    if (fx.is_open) await editPosts(interaction.client, fx, { content: `~~${fx.from_club_name} was looking for a friendly~~ (taken)`, embeds: [], components: [] }, interaction.message.id);
    await network.postToChannel(
      interaction.client,
      fx.from_guild_id,
      {
        allowedMentions: { users: [fx.created_by_discord_id] },
        content: `🤝 <@${fx.created_by_discord_id}>: **${fx.to_club_name}** accepted! **${fx.from_club_name}** vs **${fx.to_club_name}**, ${when(fx.kickoff_at)}. In game, find the club **${fx.to_club_name}**. Their manager is **${interaction.user.username}**. The score fills in here after the EA sync.`,
      },
      fx.created_by_discord_id
    );
  }

  async function decline(interaction, f) {
    if (!f || f.is_open || interaction.guildId !== f.to_guild_id) return interaction.reply({ content: 'This invite has expired.', flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = activeClubs(state).find((c) => c.key === f.to_club_key);
    if (!(await leaderOf(interaction, club))) return interaction.reply({ content: `❌ Only ${club?.name || 'the club'}'s leaders can answer.`, flags: 64 });
    const { data: done } = await supabase.from('network_fixtures').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', f.id).eq('status', 'sent').select('id');
    await interaction.update({ content: done?.length ? `➡️ Declined ${f.from_club_name}'s invite.` : 'This invite is no longer open.', embeds: [], components: [] });
    if (done?.length) {
      await network.postToChannel(
        interaction.client,
        f.from_guild_id,
        { allowedMentions: { users: [f.created_by_discord_id] }, content: `📭 <@${f.created_by_discord_id}>: ${f.to_club_name} can't make the friendly at <t:${unix(f.kickoff_at)}:f>.` },
        f.created_by_discord_id
      );
    }
  }

  async function cancel(interaction, f) {
    if (!f || f.created_by_discord_id !== interaction.user.id) return interaction.reply({ content: '❌ Only the manager who sent it can cancel this invite.', flags: 64 });
    const { data: done } = await supabase
      .from('network_fixtures')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', f.id)
      .in('status', ['draft', 'sent', 'accepted'])
      .select('*');
    if (!done?.length) return interaction.update({ content: `ℹ️ This invite is already ${f.status}.`, components: [] });
    await interaction.update({ content: '🗑️ Invite cancelled.', components: [] });
    await editPosts(interaction.client, f, { content: `~~Friendly invite from ${f.from_club_name}~~ (cancelled)`, embeds: [], components: [] });
    if (f.status === 'accepted') {
      await network.postToChannel(interaction.client, f.to_guild_id, { allowedMentions: { users: [f.accepted_by_discord_id] }, content: `🗑️ <@${f.accepted_by_discord_id}>: ${f.from_club_name} cancelled the friendly at <t:${unix(f.kickoff_at)}:f>.` }, f.accepted_by_discord_id);
    }
  }

  async function handleComponent(interaction, action, id) {
    const f = await load(id);
    if (action === 'pick' && interaction.isStringSelectMenu?.()) return pickClub(interaction, f);
    if (action === 'acc') return accept(interaction, f);
    if (action === 'dec') return decline(interaction, f);
    if (action === 'cancel') return cancel(interaction, f);
    return interaction.reply({ content: 'This has expired.', flags: 64 });
  }

  // ---------- Results from the EA sync ----------

  // autopilot.onNewMatches hook: (guildId, club, recent, rows)
  async function onNewMatches(guildId, club, recent, rows) {
    if (!network.isOn() || !rows?.length) return;
    const since = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const [{ data: asHome }, { data: asAway }] = await Promise.all([
      supabase.from('network_fixtures').select('*').eq('kind', 'friendly').eq('status', 'accepted').eq('from_guild_id', guildId).eq('from_club_key', club.key).gte('kickoff_at', since),
      supabase.from('network_fixtures').select('*').eq('kind', 'friendly').eq('status', 'accepted').eq('to_guild_id', guildId).eq('to_club_key', club.key).gte('kickoff_at', since),
    ]);
    const fixtures = [...(asHome || []), ...(asAway || [])];
    if (!fixtures.length) return;
    for (const row of rows) {
      const f = fixtureForMatch(fixtures, guildId, club.key, row);
      if (!f) continue;
      const home = f.from_guild_id === guildId && f.from_club_key === club.key;
      const scoreFrom = home ? row.score_for : row.score_against;
      const scoreTo = home ? row.score_against : row.score_for;
      const { data: done } = await supabase
        .from('network_fixtures')
        .update({ status: 'played', ea_match_id: row.ea_match_id ? String(row.ea_match_id) : null, score_from: scoreFrom, score_to: scoreTo, played_at: new Date().toISOString() })
        .eq('id', f.id)
        .eq('status', 'accepted')
        .select('id');
      f.status = 'played';
      if (!done?.length) continue; // the other club's sync recorded it first
      const line = `🏁 GafferBot Network friendly: **${f.from_club_name}** ${scoreFrom}-${scoreTo} **${f.to_club_name}**`;
      const client = deps.client();
      if (!client) continue;
      await network.postToChannel(client, f.from_guild_id, { content: line });
      await network.postToChannel(client, f.to_guild_id, { content: line });
    }
  }

  network.addSubcommand('friendly', handleFriendly);
  network.addComponent('nw_fx', handleComponent);
  if (autopilot) autopilot.onNewMatches(onNewMatches);

  return { handleFriendly, onNewMatches };
}

module.exports = { createNetworkFriendlies, fixtureForMatch, suggestClubs };
