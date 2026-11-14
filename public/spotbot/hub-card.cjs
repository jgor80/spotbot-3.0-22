// Shareable hub cards and refer a friend, for Social Hub servers.
//   Hub card     My XP → Share my hub card draws your card (graphics-club-life hubCard: level, XP bar,
//                hub career, best partners from hub chemistry, top badges and YOUR invite link) as an
//                image to save and post anywhere, or post in #hub-feed.
//   Invite link  every player gets their own permanent invite (hub_invites). When someone joins with
//                it (needs Manage Server to read invite uses) the join is saved in hub_referrals; when
//                they play their first game (hub-xp onFirstGame) the inviter gets +100 XP, Recruiter
//                (1 friend) and Talent Scout (5 friends). Nothing here pings anyone.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const G = require('./graphics.cjs');
const CL = require('./graphics-club-life.cjs');
const { levelFor, tierFor, xpForLevel, HUB_BADGES } = require('./hub-xp.cjs');

const F = PermissionsBitField.Flags;
const NO_PINGS = { parse: [] };
const POST_COOLDOWN_MS = 60 * 60 * 1000;
const TIER_RANK = { legendary: 4, epic: 3, rare: 2, common: 1 };

// Two-letter medal glyph from a badge name ("Player of the Week" -> "PW")
function glyphOf(name) {
  const words = String(name || '').split(/[\s-]+/).filter((w) => w && !/^(of|the|a|in)$/i.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '★').slice(0, 2)).toUpperCase();
}

// The rarest badges first
function topBadges(keys, n = 5) {
  return (keys || [])
    .filter((k) => HUB_BADGES[k])
    .sort((a, b) => TIER_RANK[HUB_BADGES[b].tier] - TIER_RANK[HUB_BADGES[a].tier])
    .slice(0, n)
    .map((k) => ({ key: k, glyph: glyphOf(HUB_BADGES[k].name), tier: HUB_BADGES[k].tier }));
}

// Which invite gained a use since we last looked: the one whose count went up
function usedInvite(saved, live) {
  for (const row of saved) {
    const now = live.get(row.code);
    if (now != null && now > (row.uses || 0)) return row;
  }
  return null;
}

function createHubCard(deps) {
  const { supabase, hubOf } = deps;
  const xp = () => deps.xp?.();
  const chemistry = () => deps.chemistry?.();
  const client = () => deps.client();
  const lastPost = new Map();

  // ---------- Invites ----------

  async function inviteFor(guild, userId) {
    const { data } = await supabase.from('hub_invites').select('code').eq('guild_id', guild.id).eq('user_id', userId).maybeSingle();
    if (data?.code) {
      const live = await guild.invites?.fetch?.(data.code).catch(() => null);
      if (live !== null) return data.code;
    }
    const hub = await hubOf(guild.id);
    const chId = hub.start_channel_id || hub.board_channel_id;
    const ch = chId ? await guild.channels.fetch(chId).catch(() => null) : null;
    if (!ch?.createInvite) return null;
    const inv = await ch.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: `GafferBot Social Hub invite for ${userId}` }).catch(() => null);
    if (!inv) return null;
    await supabase.from('hub_invites').upsert({ guild_id: guild.id, user_id: userId, code: inv.code, uses: 0 }, { onConflict: 'guild_id,user_id' });
    return inv.code;
  }

  // Who brought this member? Compare invite uses with what we saved
  async function onMemberJoin(member) {
    if (member.user?.bot) return null;
    const guild = member.guild;
    const hub = await hubOf(guild.id);
    if (!hub.on || !guild.members.me?.permissions?.has(F.ManageGuild)) return null;
    const { data: saved } = await supabase.from('hub_invites').select('user_id, code, uses').eq('guild_id', guild.id);
    if (!saved?.length) return null;
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return null;
    const live = new Map([...invites.values()].map((i) => [i.code, i.uses || 0]));
    const row = usedInvite(saved, live);
    // Keep every count current so the next join compares against now
    const changed = saved.filter((r) => live.has(r.code) && live.get(r.code) !== (r.uses || 0));
    for (const r of changed) await supabase.from('hub_invites').update({ uses: live.get(r.code) }).eq('guild_id', guild.id).eq('user_id', r.user_id);
    if (!row || row.user_id === member.id) return null;
    await supabase.from('hub_referrals').upsert({ guild_id: guild.id, invitee_id: member.id, inviter_id: row.user_id, code: row.code }, { onConflict: 'guild_id,invitee_id', ignoreDuplicates: true });
    return row.user_id;
  }

  // An invited player's first game rewards whoever brought them, once
  async function onFirstGame(guildId, ids) {
    const { data } = await supabase.from('hub_referrals').select('invitee_id, inviter_id').eq('guild_id', guildId).in('invitee_id', ids).is('rewarded_at', null);
    for (const r of data || []) {
      const { data: claimed } = await supabase
        .from('hub_referrals')
        .update({ rewarded_at: new Date().toISOString() })
        .eq('guild_id', guildId)
        .eq('invitee_id', r.invitee_id)
        .is('rewarded_at', null)
        .select('invitee_id');
      if (!claimed?.length) continue;
      await xp()?.record(guildId, new Map([[r.inviter_id, { referrals: 1 }]]));
      await feedLine(guildId, `🤝 <@${r.inviter_id}> brought <@${r.invitee_id}> to the hub and they've played their first game: +100 XP!`);
    }
  }

  async function feedLine(guildId, content) {
    const hub = await hubOf(guildId);
    const guild = client()?.guilds.cache.get(guildId);
    const ch = guild && hub.feed_channel_id ? await guild.channels.fetch(hub.feed_channel_id).catch(() => null) : null;
    if (ch?.send) await ch.send({ content, allowedMentions: NO_PINGS }).catch(() => {});
  }

  // ---------- Card ----------

  async function cardData(guild, userId) {
    const { data: row } = await supabase.from('hub_players').select('*').eq('guild_id', guild.id).eq('discord_user_id', userId).maybeSingle();
    const r = row || { xp: 0, games: 0, wins: 0, goals: 0, assists: 0, voice_minutes: 0, mates: [], badges: [], best_streak: 0, referrals: 0 };
    const member = await guild.members.fetch(userId).catch(() => null);
    const level = levelFor(r.xp);
    const pairs = chemistry() ? await chemistry().pairsFor(guild.id, userId).catch(() => []) : [];
    const partners = [];
    for (const p of pairs.sort((a, b) => b.score - a.score).slice(0, 3)) {
      const m = await guild.members.fetch(p.other).catch(() => null);
      partners.push({ name: m?.displayName || 'Teammate', score: p.score });
    }
    const avatar = member?.displayAvatarURL?.({ extension: 'png', size: 256 });
    const code = await inviteFor(guild, userId);
    return {
      playerName: member?.displayName || 'Player',
      serverName: guild.name,
      photo: avatar ? await G.fetchImage(avatar) : null,
      level,
      tierName: tierFor(level).name,
      xp: r.xp,
      into: r.xp - xpForLevel(level),
      span: xpForLevel(level + 1) - xpForLevel(level),
      tiles: [
        { label: 'Games', value: `${r.games}`, sub: `${r.wins} wins` },
        { label: 'Goals + assists', value: `${r.goals} + ${r.assists}` },
        { label: 'Hours in lobbies', value: `${Math.round((r.voice_minutes || 0) / 60)}` },
        { label: 'Played with', value: `${(r.mates || []).length}`, sub: 'different people' },
        { label: 'Best streak', value: `${r.best_streak || 0} days` },
        { label: 'Badges', value: `${(r.badges || []).length}/${Object.keys(HUB_BADGES).length}` },
      ],
      partners,
      badges: topBadges(r.badges),
      invite: code ? `discord.gg/${code}` : null,
      code,
    };
  }

  async function shareCard(guild, userId) {
    const d = await cardData(guild, userId);
    const png = CL.hubCard(d);
    const file = new AttachmentBuilder(png, { name: 'hub-card.png' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hc_post').setLabel('Show it off in the hub feed').setEmoji('📣').setStyle(ButtonStyle.Primary),
      ...(d.code ? [new ButtonBuilder().setLabel('My invite link').setStyle(ButtonStyle.Link).setURL(`https://discord.gg/${d.code}`)] : [])
    );
    const content = d.code
      ? `🪪 Your hub card. Save it and post it anywhere. Your own invite link is **https://discord.gg/${d.code}**: when a friend joins with it and plays a game, you get **+100 XP** and the **Recruiter** badge.`
      : '🪪 Your hub card. Save it and post it anywhere. (I couldn\'t make you an invite link: I need **Create Invite** in the hub channels.)';
    return { content, files: [file], components: [row], allowedMentions: NO_PINGS };
  }

  // ---------- Interactions ----------

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('hc_') || !interaction.guildId || !interaction.isButton?.()) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;
    if (id === 'hc_card') {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await shareCard(interaction.guild, interaction.user.id));
      return true;
    }
    if (id === 'hc_invite') {
      await interaction.deferReply({ flags: 64 });
      const code = await inviteFor(interaction.guild, interaction.user.id);
      await interaction.editReply({
        content: code
          ? `🔗 Your invite link: **https://discord.gg/${code}**\nWhen a friend joins with it and plays a game, you get **+100 XP** and the **Recruiter** badge (5 friends: **Talent Scout**).`
          : '❌ I couldn\'t make an invite link. I need **Create Invite** in the hub channels.',
      });
      return true;
    }
    if (id === 'hc_post') {
      const key = `${interaction.guildId}:${interaction.user.id}`;
      if (Date.now() - (lastPost.get(key) || 0) < POST_COOLDOWN_MS) {
        await interaction.reply({ content: '⏱️ One card in the feed an hour, please.', flags: 64 });
        return true;
      }
      const ch = hub.feed_channel_id ? await interaction.guild.channels.fetch(hub.feed_channel_id).catch(() => null) : null;
      if (!ch?.send) {
        await interaction.reply({ content: '❌ This hub has no feed channel. An admin can press **Set Up Social Hub** again.', flags: 64 });
        return true;
      }
      await interaction.deferReply({ flags: 64 });
      lastPost.set(key, Date.now());
      const d = await cardData(interaction.guild, interaction.user.id);
      await ch.send({ content: `🪪 <@${interaction.user.id}>'s hub card`, files: [new AttachmentBuilder(CL.hubCard(d), { name: 'hub-card.png' })], allowedMentions: NO_PINGS });
      await interaction.editReply({ content: `📣 Posted in <#${ch.id}>.` });
      return true;
    }
    return false;
  }

  return { handleInteraction, onMemberJoin, onFirstGame, inviteFor, shareCard, cardData };
}

module.exports = { createHubCard, glyphOf, topBadges, usedInvite };
