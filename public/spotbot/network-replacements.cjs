// GafferBot Network replacements: "we need a CB tonight". A manager posts one request (/network need,
// /manager → Match Night → Need a Player). The bot DMs up to MAX_DMS listed free agents who play that
// position on that platform, and (unless "free agents only") posts a card in other network servers'
// network channels. Anyone can say "I can play"; the manager accepts one, the player gets the club,
// kick-off and an invite, and the request closes everywhere. Nobody's Discord name crosses servers
// until they volunteer, and the requesting manager's only once they accept someone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { resolveClub } = require('./manager-hub.cjs');
const { toFcPlatform } = require('./ea-fc27.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const LISTING_DAYS = 30;
const MAX_DMS = 10;            // free agents DMed per request
const MAX_DMS_PER_PLAYER = 3;  // requests one player gets per day, across all servers
const MAX_SERVERS = 25;        // network channels a request is posted to
const GRACE_MS = 30 * 60 * 1000; // a request stays open this long after kick-off
const UUID = /^[0-9a-f-]{36}$/i;

// Does a free agent's listing fit the request? Main or second position, same EA platform, still listed.
function faMatches(fa, req, now = Date.now()) {
  if (!fa || fa.status === 'off' || fa.no_contact) return false;
  if (now - new Date(fa.updated_at).getTime() > LISTING_DAYS * DAY_MS) return false;
  if (fa.position !== req.position && fa.secondary_position !== req.position) return false;
  if (fa.platform && req.platform && toFcPlatform(fa.platform) !== req.platform) return false;
  return true;
}

function isOpen(req, now = Date.now()) {
  return req?.status === 'open' && new Date(req.expires_at).getTime() > now;
}

function createReplacements(deps) {
  const { supabase, getGuildState, network, recruitment, canManageClub } = deps;

  async function loadRequest(id) {
    if (!UUID.test(id || '')) return null;
    const { data } = await supabase.from('network_requests').select('*').eq('id', id).maybeSingle();
    return data;
  }

  function requestEmbed(req, { forOtherServer = false } = {}) {
    const at = Math.floor(new Date(req.kickoff_at).getTime() / 1000);
    const embed = new EmbedBuilder()
      .setTitle(`🆘 ${req.club_name || 'A club'} needs a ${req.position}`)
      .setColor(0xfaa61a)
      .addFields(
        { name: 'Kick-off', value: `<t:${at}:F> (<t:${at}:R>)`, inline: true },
        { name: 'Platform', value: req.platform === 'nx' ? 'Switch' : 'PS5 / Xbox Series / PC', inline: true }
      )
      .setFooter({ text: forOtherServer ? 'From another server on the GafferBot Network. Press "I can play" and their manager decides.' : 'GafferBot Network replacement request' });
    if (req.note) embed.setDescription(req.note);
    return embed;
  }

  function closedEmbed(req, label) {
    return requestEmbed(req).setTitle(`~~${req.club_name || 'A club'} needs a ${req.position}~~ ${label}`).setColor(0x99aab5);
  }

  // ---------- /network need ----------

  async function handleNeed(interaction) {
    await interaction.deferReply({ flags: 64 });
    if (!(await network.isListed(interaction.guildId))) {
      return interaction.editReply({ content: '⚪ This server isn\'t on the GafferBot Network yet. A server admin can join with **/manager → Admin → Network Setup**; replies land in the channel picked there.' });
    }
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (!club) return interaction.editReply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.' });
    if (!(await canManageClub(interaction.member, club))) return interaction.editReply({ content: `❌ Only ${club.name}'s leaders can ask for replacements.` });
    const limited = await network.overLimit(interaction.guildId, 'replacement', interaction.user.id);
    if (limited) return interaction.editReply({ content: `⏳ ${limited}` });

    const whenText = interaction.options.getString('when');
    const kickoff = await network.kickoffFor(interaction.guildId, whenText);
    if (!kickoff) return interaction.editReply({ content: `❌ I couldn't read "${whenText.slice(0, 50)}" as a time. Try "9pm", "thu 21:00" or "now".` });
    if (kickoff.getTime() + GRACE_MS < Date.now()) return interaction.editReply({ content: '❌ That kick-off has already passed.' });
    if (kickoff.getTime() - Date.now() > 7 * DAY_MS) return interaction.editReply({ content: '❌ Replacement requests are for the next 7 days.' });

    const row = {
      guild_id: interaction.guildId,
      club_key: club.key,
      club_name: club.ea_club_name || club.name,
      platform: toFcPlatform(club.ea_platform),
      position: interaction.options.getString('position'),
      kickoff_at: kickoff.toISOString(),
      expires_at: new Date(kickoff.getTime() + GRACE_MS).toISOString(),
      note: network.cleanText(interaction.options.getString('note')) || null,
      reach: interaction.options.getString('reach') === 'fa' ? 'fa' : 'all',
      created_by_discord_id: interaction.user.id,
    };
    const { data: req, error } = await supabase.from('network_requests').insert(row).select('*').single();
    if (error) return interaction.editReply({ content: `❌ Could not create the request: ${error.message}` });
    await network.logActivity(interaction.guildId, 'replacement', interaction.user.id);

    const dmed = await offerToFreeAgents(interaction, req);
    const posted = req.reach === 'all' ? await postToServers(interaction.client, req) : 0;
    const home = await network.serverRow(interaction.guildId);
    return interaction.editReply({
      content:
        `✅ Asked ${dmed} free agent${dmed === 1 ? '' : 's'}${req.reach === 'all' ? ` and ${posted} other server${posted === 1 ? '' : 's'}` : ''} for a ${req.position}. ` +
        `Volunteers show up in ${home?.channel_id ? `<#${home.channel_id}>` : 'your DMs'} with Accept / Pass. The request closes 30 minutes after kick-off.` +
        (dmed + posted === 0 ? '\nNobody matches right now; it stays open in case a server joins or a free agent lists.' : ''),
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`nw_rq:cancel:${req.id}`).setLabel('Cancel request').setStyle(ButtonStyle.Secondary))],
    });
  }

  async function offerToFreeAgents(interaction, req) {
    const since = new Date(Date.now() - LISTING_DAYS * DAY_MS).toISOString();
    const { data: listings } = await supabase
      .from('free_agents')
      .select('*')
      .neq('status', 'off')
      .eq('no_contact', false)
      .gte('updated_at', since)
      .or(`position.eq.${req.position},secondary_position.eq.${req.position}`)
      .order('updated_at', { ascending: false })
      .limit(60);
    const guild = interaction.guild;
    let sent = 0;
    for (const fa of listings || []) {
      if (sent >= MAX_DMS) break;
      if (!faMatches(fa, req) || fa.discord_user_id === interaction.user.id) continue;
      if (guild?.members?.cache?.has(fa.discord_user_id)) continue; // already in this server: ask them directly
      if (fa.home_guild_id && fa.home_guild_id !== req.guild_id && (await network.isBlockedBetween(req.guild_id, fa.home_guild_id))) continue;
      const { count } = await supabase
        .from('network_responses')
        .select('id', { count: 'exact', head: true })
        .eq('player_discord_id', fa.discord_user_id)
        .eq('source', 'dm')
        .gte('created_at', new Date(Date.now() - DAY_MS).toISOString());
      if ((count || 0) >= MAX_DMS_PER_PLAYER) continue;
      const { error } = await supabase.from('network_responses').insert({ request_id: req.id, player_discord_id: fa.discord_user_id, source: 'dm' });
      if (error) continue;
      const user = await interaction.client.users.fetch(fa.discord_user_id).catch(() => null);
      const ok = user
        ? await user
            .send({
              content: `🆘 A club on the GafferBot Network needs a **${req.position}** and you're listed as a free agent.`,
              embeds: [requestEmbed(req).setFooter({ text: 'You got this because you listed yourself with /me → Free Agent. "Stop all contact" takes your listing down.' })],
              components: [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`nw_rq:yes:${req.id}`).setLabel('I can play').setEmoji('✅').setStyle(ButtonStyle.Success),
                  new ButtonBuilder().setCustomId(`nw_rq:no:${req.id}`).setLabel('Not this time').setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder().setCustomId(`nw_rq:stop:${req.id}`).setLabel('Stop all contact').setStyle(ButtonStyle.Danger)
                ),
              ],
            })
            .catch(() => null)
        : null;
      if (ok) sent++;
      else await supabase.from('network_responses').delete().eq('request_id', req.id).eq('player_discord_id', fa.discord_user_id);
    }
    return sent;
  }

  async function postToServers(client, req) {
    const servers = (await network.visibleServers(req.guild_id)).filter((s) => s.channel_id).slice(0, MAX_SERVERS);
    const posts = [];
    const mod = network.moderationSelect([{ guildId: req.guild_id, name: req.club_name }], 'replacement request');
    for (const s of servers) {
      const msg = await network.postToChannel(client, s.guild_id, {
        embeds: [requestEmbed(req, { forOtherServer: true })],
        components: [
          new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`nw_rq:vol:${req.id}`).setLabel('I can play').setEmoji('🙋').setStyle(ButtonStyle.Success)),
          ...(mod ? [mod] : []),
        ],
      });
      if (msg) posts.push({ guild_id: s.guild_id, channel_id: msg.channelId, message_id: msg.id });
    }
    if (posts.length) await supabase.from('network_requests').update({ posts }).eq('id', req.id);
    return posts.length;
  }

  // Edit every card in other servers once a request closes
  async function closeCards(client, req, label) {
    for (const p of req.posts || []) {
      const channel = await client.channels.fetch(p.channel_id).catch(() => null);
      const msg = channel ? await channel.messages.fetch(p.message_id).catch(() => null) : null;
      if (msg) await msg.edit({ embeds: [closedEmbed(req, label)], components: [] }).catch(() => {});
    }
  }

  async function closeRequest(client, req, status, extra = {}) {
    const { data: updated } = await supabase
      .from('network_requests')
      .update({ status, closed_at: new Date().toISOString(), ...extra })
      .eq('id', req.id)
      .eq('status', 'open')
      .select('id');
    if (!updated?.length) return false; // someone else closed it first
    await closeCards(client, req, status === 'filled' ? '(filled)' : status === 'expired' ? '(closed)' : '(cancelled)');
    return true;
  }

  // ---------- A player offers to play ----------

  async function volunteer(interaction, req, source) {
    const dm = !interaction.guildId;
    const reply = (content) => (dm ? interaction.reply({ content }) : interaction.reply({ content, flags: 64 }));
    if (!req || !isOpen(req)) {
      if (req?.status === 'open') await closeRequest(interaction.client, req, 'expired');
      if (dm) await interaction.update({ components: [] }).catch(() => {});
      return dm ? interaction.followUp({ content: 'This request has closed. Thanks anyway!' }).catch(() => {}) : reply('This request has closed. Thanks anyway!');
    }
    if (interaction.user.id === req.created_by_discord_id) return reply('That\'s your own request.');
    if (!dm && (await network.isBlockedBetween(req.guild_id, interaction.guildId))) return reply('This request has closed.');
    // A suspended or departed server's requests stop working, and only listed servers can answer from a channel
    if (!(await network.isListed(req.guild_id))) return reply('This request has closed.');
    if (!dm && !(await network.isListed(interaction.guildId))) return reply('❌ Switch the GafferBot Network on for this server first (/manager → Admin → Network).');

    const { data: existing } = await supabase.from('network_responses').select('*').eq('request_id', req.id).eq('player_discord_id', interaction.user.id).maybeSingle();
    if (existing && existing.status !== 'offered') return reply(`You already answered this one (${existing.status}).`);
    const now = new Date().toISOString();
    const { data: resp, error } = existing
      ? await supabase.from('network_responses').update({ status: 'volunteered', responded_at: now }).eq('id', existing.id).select('*').single()
      : await supabase.from('network_responses').insert({ request_id: req.id, player_discord_id: interaction.user.id, source, source_guild_id: interaction.guildId || null, status: 'volunteered', responded_at: now }).select('*').single();
    if (error) return reply(`❌ ${error.message}`);

    const { data: fa } = await supabase.from('free_agents').select('position, secondary_position, ea_username, ea_verified').eq('discord_user_id', interaction.user.id).maybeSingle();
    const gamertag = fa?.ea_username ? `\`${fa.ea_username}\`${fa.ea_verified ? ' ✅' : ''}` : 'no gamertag listed';
    const from = source === 'dm' ? 'a listed free agent' : 'another server on the network';
    await network.postToChannel(
      interaction.client,
      req.guild_id,
      {
        allowedMentions: { users: [req.created_by_discord_id] },
        content: `🙋 <@${req.created_by_discord_id}>: **${interaction.user.username}** (${gamertag}${fa ? `, ${[fa.position, fa.secondary_position].filter(Boolean).join('/')}` : ''}) can play ${req.position} for ${req.club_name}. They're ${from}.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`nw_rq:acc:${resp.id}`).setLabel('Accept').setEmoji('🤝').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`nw_rq:pass:${resp.id}`).setLabel('Pass').setStyle(ButtonStyle.Secondary)
          ),
        ],
      },
      req.created_by_discord_id
    );
    const msg = `✅ Sent to ${req.club_name}'s manager. If they pick you, I'll DM you the details and an invite.`;
    if (dm) {
      await interaction.update({ components: [] }).catch(() => {});
      return interaction.followUp({ content: msg }).catch(() => {});
    }
    return reply(msg);
  }

  async function decline(interaction, req, stop) {
    const now = new Date().toISOString();
    if (req) await supabase.from('network_responses').update({ status: 'declined', responded_at: now }).eq('request_id', req.id).eq('player_discord_id', interaction.user.id);
    if (stop) await supabase.from('free_agents').update({ status: 'off', no_contact: true, updated_at: now }).eq('discord_user_id', interaction.user.id);
    await interaction.update({ components: [] }).catch(() => {});
    return interaction
      .followUp({ content: stop ? '⚪ Done. Your free agent listing is down and no club can contact you through GafferBot. Run **/me → Free Agent** any time to list again.' : '👍 No problem.' })
      .catch(() => {});
  }

  // ---------- The manager accepts or passes ----------

  async function answerVolunteer(interaction, action, respId) {
    const { data: resp } = UUID.test(respId || '') ? await supabase.from('network_responses').select('*').eq('id', respId).maybeSingle() : { data: null };
    const req = resp ? await loadRequest(resp.request_id) : null;
    if (!resp || !req) return interaction.reply({ content: 'This has expired.', flags: 64 });
    if (interaction.guildId && interaction.guildId !== req.guild_id) return interaction.reply({ content: 'This has expired.', flags: 64 });
    if (interaction.guildId) {
      const state = await getGuildState(req.guild_id);
      const club = resolveClub(state, interaction.member, req.club_key);
      if (!club || !(await canManageClub(interaction.member, club))) return interaction.reply({ content: `❌ Only ${req.club_name}'s leaders can answer this.`, flags: 64 });
    } else if (interaction.user.id !== req.created_by_discord_id) {
      return interaction.reply({ content: 'This has expired.' });
    }
    if (resp.status !== 'volunteered') return interaction.reply({ content: `Already answered (${resp.status}).`, flags: 64 });

    const now = new Date().toISOString();
    const player = await interaction.client.users.fetch(resp.player_discord_id).catch(() => null);

    if (action === 'pass') {
      await supabase.from('network_responses').update({ status: 'passed', responded_at: now }).eq('id', resp.id);
      await interaction.update({ content: `${interaction.message.content}\n➡️ Passed.`, components: [] });
      await player?.send({ content: `Thanks for offering to play for ${req.club_name}. They've gone another way this time.` }).catch(() => {});
      return;
    }

    if (!isOpen(req)) {
      if (req.status === 'open') await closeRequest(interaction.client, req, 'expired');
      return interaction.update({ content: `${interaction.message.content}\n⌛ This request has closed.`, components: [] });
    }
    const closed = await closeRequest(interaction.client, req, 'filled', { filled_by_discord_id: resp.player_discord_id });
    if (!closed) return interaction.update({ content: `${interaction.message.content}\nℹ️ This request was already filled or cancelled.`, components: [] });
    await supabase.from('network_responses').update({ status: 'accepted', responded_at: now }).eq('id', resp.id);

    const guild = interaction.client.guilds.cache.get(req.guild_id);
    const alreadyIn = guild ? await guild.members.fetch(resp.player_discord_id).catch(() => null) : null;
    const invite = guild && !alreadyIn ? await recruitment.inviteFor(guild, { maxAge: 24 * 60 * 60, reason: 'GafferBot Network: replacement accepted' }) : null;
    const at = Math.floor(new Date(req.kickoff_at).getTime() / 1000);
    const sent = await player
      ?.send({
        content:
          `🤝 You're in! **${req.club_name}** picked you at ${req.position}, kick-off <t:${at}:F> (<t:${at}:R>). ` +
          `Their manager is **${interaction.user.username}**.` +
          (alreadyIn ? ` You're already in **${guild.name}**.` : invite ? ` Here's an invite (one use, 24 hours): ${invite}` : ' Their manager will send you an invite.'),
      })
      .catch(() => null);
    await interaction.update({
      content:
        `${interaction.message.content}\n✅ Accepted <@${resp.player_discord_id}> (${player?.username || 'player'}). ` +
        (sent ? (alreadyIn ? 'They\'re already in this server.' : invite ? 'I sent them the kick-off and an invite.' : 'I sent them the kick-off; I couldn\'t make an invite (I need Create Invite), so send them one.') : 'I couldn\'t DM them; message them directly.'),
      allowedMentions: { parse: [] },
      components: [],
    });

    // Let everyone else who offered know it's filled
    const { data: others } = await supabase.from('network_responses').select('id, player_discord_id').eq('request_id', req.id).eq('status', 'volunteered');
    for (const o of others || []) {
      await supabase.from('network_responses').update({ status: 'passed', responded_at: now }).eq('id', o.id);
      const u = await interaction.client.users.fetch(o.player_discord_id).catch(() => null);
      await u?.send({ content: `Thanks for offering to play for ${req.club_name}. The spot's been filled.` }).catch(() => {});
    }
  }

  async function cancel(interaction, req) {
    if (!req || req.guild_id !== interaction.guildId) return interaction.reply({ content: 'This has expired.', flags: 64 });
    const state = await getGuildState(req.guild_id);
    const club = resolveClub(state, interaction.member, req.club_key);
    if (interaction.user.id !== req.created_by_discord_id && !(club && (await canManageClub(interaction.member, club)))) {
      return interaction.reply({ content: '❌ Only the club\'s leaders can cancel this.', flags: 64 });
    }
    const closed = req.status === 'open' && (await closeRequest(interaction.client, req, 'cancelled'));
    return interaction.update({ content: closed ? '🗑️ Request cancelled. The cards in other servers now say so.' : `ℹ️ This request is already ${req.status}.`, components: [] });
  }

  async function handleComponent(interaction, action, id) {
    if (action === 'acc' || action === 'pass') return answerVolunteer(interaction, action, id);
    const req = await loadRequest(id);
    if (action === 'yes') return volunteer(interaction, req, 'dm');
    if (action === 'vol') return volunteer(interaction, req, 'server');
    if (action === 'no' || action === 'stop') return decline(interaction, req, action === 'stop');
    if (action === 'cancel') return cancel(interaction, req);
    return interaction.reply({ content: 'This has expired.', flags: 64 });
  }

  network.addSubcommand('need', handleNeed);
  network.addComponent('nw_rq', handleComponent);

  return { handleNeed, requestEmbed };
}

module.exports = { createReplacements, faMatches, isOpen };
