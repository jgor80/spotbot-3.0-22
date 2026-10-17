// /setup → Channels: create the channels GafferBot posts in and wire each one into the club and server
// settings, or let the admin pick their own. Creating only happens after an admin confirms the plan,
// needs Manage Channels, reuses channels whose names already match, and never deletes or renames
// anything, so running it again only fills gaps. Every channel can be changed afterwards here.

const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, OverwriteType } = require('discord.js');
const { missingChannelPerms, isServerAdmin } = require('./perm-check.cjs');

const F = PermissionsBitField.Flags;
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const VOICE_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
// Roles that see the private channels (matches the role-name fallback in isManager)
const STAFF_WORDS = ['captain', 'manager', 'owner', 'media', 'admin'];
const MAX_STAFF_ROLES = 8;
const BOT_PERMS = [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.AttachFiles, F.ReadMessageHistory, F.AddReactions];
const BOT_VOICE_PERMS = [F.ViewChannel, F.Connect, F.CreateInstantInvite];

const autopilotField = (field) => ({
  get: (club) => club.autopilot?.[field] || null,
  set: (club, id) => {
    club.autopilot = { ...(club.autopilot || {}) };
    if (id) club.autopilot[field] = id;
    else delete club.autopilot[field];
  },
});
const clubField = (field) => ({
  get: (club) => club[field] || null,
  set: (club, id) => {
    if (id) club[field] = id;
    else delete club[field];
  },
});

// access: feed = members read, react and press buttons but don't post; open = everyone posts;
// staff = only admins and manager/captain roles see it.
const FEATURES = [
  { key: 'events', emoji: '📅', label: 'Matchday', name: 'matchday', aliases: ['fixtures', 'events', 'availability'], access: 'feed', what: 'Events, availability boards and team sheets', ...clubField('events_channel_id') },
  { key: 'results', emoji: '📊', label: 'Results', name: 'results', aliases: ['match-results', 'recaps'], access: 'feed', what: 'Match results, recaps and the stats panel', ...clubField('stats_channel_id') },
  { key: 'chronicle', emoji: '📰', label: 'Chronicle', name: 'chronicle', aliases: ['the-chronicle', 'newspaper'], access: 'feed', what: 'The Chronicle newspaper and match reports', ...autopilotField('chronicle_channel_id') },
  { key: 'hof', emoji: '🏆', label: 'Hall of Fame', name: 'hall-of-fame', aliases: ['trophies'], access: 'feed', what: 'Trophy banners and milestones', ...autopilotField('hof_channel_id') },
  { key: 'clips', emoji: '🎬', label: 'Clips', name: 'clips', aliases: ['highlights'], access: 'open', what: 'Players share clips; Xbox clips from club matches post here', ...autopilotField('clips_channel_id') },
  { key: 'photos', emoji: '📸', label: 'Pro photos', name: 'pro-photos', aliases: ['pro-photo'], access: 'open', what: 'Players upload pro photos for their cards', ...clubField('pro_photos_channel_id') },
  { key: 'graphics', emoji: '🎨', label: 'Graphics Studio', name: 'graphics-studio', aliases: ['graphics', 'media-studio'], access: 'open', what: 'The Graphics Studio panel for cards and posters', ...clubField('graphics_channel_id') },
  { key: 'desk', emoji: '🧑‍💼', label: 'Manager desk', name: 'manager-desk', aliases: ['managers', 'staff-room'], access: 'staff', what: 'The Manager Hub, always at the bottom (staff only)', ...clubField('manager_desk_channel_id') },
  {
    key: 'recruit', emoji: '🔎', label: 'Recruitment', name: 'recruitment', aliases: ['recruiting'], access: 'staff', server: true, what: 'Free agent replies and standout-opponent alerts (staff only)',
    get: (club, ctx) => ctx.recruit?.channel_id || null,
    set: (club, id, ctx) => {
      ctx.recruit = { ...(ctx.recruit || {}), channel_id: id || null };
      ctx.recruitChanged = true;
    },
  },
  {
    key: 'voice', emoji: '🔊', label: 'Matchday voice', name: 'Matchday', aliases: ['match-day', 'matchday-voice'], access: 'open', voice: true, what: 'Voice channel for match nights (kick-off invites and spots)',
    get: (club, ctx) => ctx.state.clubVcLinks?.[club.key] || null,
    set: (club, id, ctx) => {
      ctx.state.clubVcLinks = { ...(ctx.state.clubVcLinks || {}), [club.key]: id || null };
    },
  },
];
const FEATURE = new Map(FEATURES.map((f) => [f.key, f]));

const norm = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const typesFor = (f) => (f.voice ? VOICE_TYPES : TEXT_TYPES);

function categoryNameFor(club, multiClub) {
  return multiClub ? String(club.name || 'GafferBot').slice(0, 90) : 'GafferBot';
}

// What running setup would do for each feature: keep (already wired to a channel that still exists),
// reuse (an existing channel with a matching name) or create. On servers with several clubs, only
// channels inside that club's category are reused, so one club never picks up another's channel.
function planChannels({ channels, club, ctx, multiClub }) {
  const list = [...channels];
  const byId = new Map(list.map((c) => [c.id, c]));
  const categoryName = categoryNameFor(club, multiClub);
  const category = list.find((c) => c.type === ChannelType.GuildCategory && norm(c.name) === norm(categoryName)) || null;
  const claimed = new Set();
  const plan = FEATURES.map((f) => {
    const current = byId.get(f.get(club, ctx));
    if (current && typesFor(f).includes(current.type)) {
      claimed.add(current.id);
      return { feature: f, action: 'keep', channel: current };
    }
    return { feature: f, action: 'create', name: f.name };
  });
  for (const p of plan) {
    if (p.action !== 'create') continue;
    const f = p.feature;
    const names = new Set([f.name, ...f.aliases].map(norm));
    const scope = multiClub && !f.server ? list.filter((c) => category && c.parentId === category.id) : list;
    const match = scope.find((c) => typesFor(f).includes(c.type) && names.has(norm(c.name)) && !claimed.has(c.id));
    if (match) {
      claimed.add(match.id);
      Object.assign(p, { action: 'reuse', channel: match, name: undefined });
    }
  }
  return { plan, categoryName, category };
}

function staffRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed && STAFF_WORDS.some((w) => r.name.toLowerCase().includes(w)))
    .sort((a, b) => b.position - a.position)
    .slice(0, MAX_STAFF_ROLES);
}

// Permission overwrites for a new channel. The bot can only allow or deny what it has itself, so
// anything it lacks is left out rather than failing the whole create.
function overwritesFor(feature, guild, me) {
  const has = (p) => me.permissions.has(p);
  const only = (perms) => perms.filter(has);
  const out = [{ id: me.id, type: OverwriteType.Member, allow: only(feature.voice ? BOT_VOICE_PERMS : BOT_PERMS) }];
  const everyone = guild.roles.everyone?.id || guild.id;
  if (feature.access === 'feed') out.push({ id: everyone, type: OverwriteType.Role, deny: only([F.SendMessages]) });
  if (feature.access === 'staff') {
    out.push({ id: everyone, type: OverwriteType.Role, deny: only([F.ViewChannel]) });
    for (const r of staffRoles(guild)) out.push({ id: r.id, type: OverwriteType.Role, allow: only([F.ViewChannel, F.SendMessages, F.ReadMessageHistory]) });
  }
  return out.filter((o) => (o.allow?.length || 0) + (o.deny?.length || 0) > 0);
}

const mention = (f, id) => `<#${id}>`;

function createChannelSetup(deps) {
  const { supabase, getGuildState, saveGuildSettings, currentClubOf, activeClubs } = deps;
  const hooks = () => (typeof deps.hooks === 'function' ? deps.hooks() : deps.hooks) || {};

  async function loadCtx(guildId) {
    const state = await getGuildState(guildId);
    const club = currentClubOf(state);
    const { data } = await supabase.from('recruit_settings').select('*').eq('guild_id', guildId).maybeSingle();
    return { state, club, recruit: data || null, multiClub: activeClubs(state).length > 1 };
  }

  async function save(guildId, ctx) {
    await saveGuildSettings(guildId, ctx.state);
    if (ctx.recruitChanged) {
      const row = { guild_id: guildId, channel_id: ctx.recruit?.channel_id || null, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('recruit_settings').upsert(row, { onConflict: 'guild_id' });
      if (error) return `⚠️ Recruitment channel not saved: ${error.message}`;
      hooks().recruitChanged?.(guildId);
    }
    return null;
  }

  // Panels that live in a channel appear straight away instead of after the next restart
  async function afterWired(guild, club, feature, channel) {
    const h = hooks();
    try {
      if (feature.key === 'graphics') await h.graphicsPanel?.(channel, club);
      if (feature.key === 'desk') await h.deskPanel?.(channel);
    } catch (err) {
      console.warn(`[channel-setup] ${feature.key} panel in ${channel.id} failed: ${err.message}`);
    }
  }

  function canManageChannels(guild) {
    return !!guild.members.me?.permissions.has(F.ManageChannels);
  }

  const buttonRow = (...buttons) => new ActionRowBuilder().addComponents(...buttons);
  const btn = (id, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);

  function overviewLines(guild, ctx) {
    return FEATURES.map((f) => {
      const id = f.get(ctx.club, ctx);
      const ch = id && guild.channels.cache.get(id);
      return `${f.emoji} **${f.label}**: ${ch ? mention(f, id) : id ? 'channel deleted, pick a new one' : 'not set'}`;
    });
  }

  // How many feature channels are wired, for the /setup checklist
  async function summary(guild) {
    const ctx = await loadCtx(guild.id);
    if (!ctx.club) return null;
    const set = FEATURES.filter((f) => guild.channels.cache.get(f.get(ctx.club, ctx))).length;
    return { set, total: FEATURES.length };
  }

  async function overview(interaction, note) {
    const guild = interaction.guild;
    const ctx = await loadCtx(guild.id);
    if (!ctx.club) return { content: '❌ No club exists on this server yet. Open `/manager` once to create it, then run setup again.', embeds: [], components: [] };
    const canCreate = canManageChannels(guild);
    const embed = new EmbedBuilder()
      .setTitle(`📁 ${ctx.club.name}: channels`)
      .setColor(0x5865f2)
      .setDescription(
        'Where each feature posts. I can create the missing channels in a **' + categoryNameFor(ctx.club, ctx.multiClub) + '** category and wire them all up, or you can pick your own.\n\n' +
          overviewLines(guild, ctx).join('\n') +
          (canCreate ? '' : '\n\n⚠️ I need the **Manage Channels** permission to create channels. Give my role that permission in **Server Settings → Roles**, or pick your own channels below.')
      )
      .setFooter({ text: 'Nothing is deleted or renamed. You can change any channel here later.' });
    const create = btn('setupw:chplan', 'Create the channels for me', '✨', ButtonStyle.Primary).setDisabled(!canCreate);
    return { content: note || null, embeds: [embed], components: [buttonRow(create, btn('setupw:chpick', "I'll pick my own", '🧩'))] };
  }

  function planLine(p) {
    const f = p.feature;
    if (p.action === 'keep') return `✅ ${f.emoji} ${f.label}: keep ${mention(f, p.channel.id)}`;
    if (p.action === 'reuse') return `🔗 ${f.emoji} ${f.label}: use your existing ${mention(f, p.channel.id)}`;
    return `➕ ${f.emoji} ${f.label}: create ${f.voice ? '🔊 ' : '#'}${p.name}`;
  }

  async function planView(interaction) {
    const guild = interaction.guild;
    await guild.channels.fetch().catch(() => null);
    const ctx = await loadCtx(guild.id);
    if (!ctx.club) return overview(interaction);
    const { plan, categoryName, category } = planChannels({ channels: guild.channels.cache.values(), club: ctx.club, ctx, multiClub: ctx.multiClub });
    const todo = plan.filter((p) => p.action !== 'keep');
    const creates = plan.filter((p) => p.action === 'create').length;
    if (!todo.length) return overview(interaction, '✅ Every feature already has a channel. Nothing to create.');
    const access = [
      creates ? `New channels go in the **${categoryName}** category${category ? '' : ' (created too)'}.` : null,
      creates ? 'Results, Matchday, Chronicle and Hall of Fame are read-only for members (they can still react and press buttons). Clips, Pro photos, Graphics Studio and voice are open. Manager desk and Recruitment are only visible to admins and roles named manager, captain, owner, media or admin.' : null,
      plan.some((p) => p.feature.key === 'chronicle' && p.action !== 'keep') ? 'Wiring the Chronicle turns on the newspaper editions and match reports for this club.' : null,
      'Nothing is deleted or renamed, and existing channels keep their permissions.',
    ].filter(Boolean);
    const embed = new EmbedBuilder()
      .setTitle('✨ Set up these channels?')
      .setColor(0x22c55e)
      .setDescription(`${plan.map(planLine).join('\n')}\n\n${access.join('\n')}`.slice(0, 4096));
    const go = btn('setupw:chgo', creates ? `Yes, create ${creates} and wire them up` : 'Yes, wire them up', '✅', ButtonStyle.Success);
    return { content: null, embeds: [embed], components: [buttonRow(go, btn('setupw:chhome', 'Back', '↩️'))] };
  }

  async function runSetup(interaction) {
    const guild = interaction.guild;
    if (!canManageChannels(guild)) return overview(interaction);
    await guild.channels.fetch().catch(() => null);
    const ctx = await loadCtx(guild.id);
    if (!ctx.club) return overview(interaction);
    const club = ctx.club;
    const me = guild.members.me;
    const planned = planChannels({ channels: guild.channels.cache.values(), club, ctx, multiClub: ctx.multiClub });
    const { plan, categoryName } = planned;
    let { category } = planned;
    const reason = `GafferBot setup, confirmed by ${interaction.user?.username || 'a server admin'}`;
    const lines = [];
    const fresh = [];

    if (!category && plan.some((p) => p.action === 'create')) {
      category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory, reason }).catch((err) => {
        lines.push(`⚠️ Couldn't create the ${categoryName} category (${err.message}), so new channels go at the top level.`);
        return null;
      });
    }
    for (const p of plan) {
      const f = p.feature;
      if (p.action === 'keep') {
        lines.push(`✅ ${f.emoji} ${f.label}: ${mention(f, p.channel.id)} (already set)`);
        continue;
      }
      let channel = p.channel;
      if (p.action === 'create') {
        try {
          channel = await guild.channels.create({
            name: p.name,
            type: f.voice ? ChannelType.GuildVoice : ChannelType.GuildText,
            parent: category?.id,
            topic: f.voice ? undefined : `${f.what}. Set up by GafferBot.`,
            permissionOverwrites: overwritesFor(f, guild, me),
            reason,
          });
          fresh.push({ feature: f, channel });
        } catch (err) {
          lines.push(`❌ ${f.emoji} ${f.label}: couldn't create it (${err.message})`);
          continue;
        }
      }
      f.set(club, channel.id, ctx);
      const missing = f.voice ? [] : missingChannelPerms(channel, me);
      lines.push(`${p.action === 'create' ? '➕' : '🔗'} ${f.emoji} ${f.label}: ${mention(f, channel.id)} ${p.action === 'create' ? 'created' : 'existing channel'}${missing.length ? ` · ⚠️ I'm missing ${missing.join(', ')} there` : ''}`);
    }
    const saveNote = await save(guild.id, ctx);
    if (saveNote) lines.push(saveNote);

    for (const { feature: f, channel } of fresh) {
      if (f.voice) continue;
      await channel
        .send({ embeds: [new EmbedBuilder().setTitle(`${f.emoji} ${f.label}`).setDescription(`${f.what}.`).setColor(0x5865f2).setFooter({ text: 'Set up by GafferBot · change it in /setup → Channels' })] })
        .catch(() => {});
    }
    for (const p of plan) {
      const id = p.action === 'keep' ? null : p.feature.get(club, ctx);
      const channel = id && guild.channels.cache.get(id);
      if (channel) await afterWired(guild, club, p.feature, channel);
    }

    const embed = new EmbedBuilder()
      .setTitle(`📁 ${club.name}: channels are set up`)
      .setColor(0x22c55e)
      .setDescription(lines.join('\n').slice(0, 4096))
      .setFooter({ text: 'Change any of these with "Change a channel". Nothing was deleted or renamed.' });
    return { content: null, embeds: [embed], components: [buttonRow(btn('setupw:chpick', 'Change a channel', '🧩'))] };
  }

  async function pickView(interaction, note) {
    const guild = interaction.guild;
    const ctx = await loadCtx(guild.id);
    if (!ctx.club) return overview(interaction);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('setupw:chfeat')
      .setPlaceholder('Pick a feature to change its channel')
      .addOptions(FEATURES.map((f) => {
        const id = f.get(ctx.club, ctx);
        const ch = id && guild.channels.cache.get(id);
        return { label: f.label, value: f.key, emoji: f.emoji, description: (ch ? `Now: ${f.voice ? '' : '#'}${ch.name}` : 'Not set').slice(0, 100) };
      }));
    const embed = new EmbedBuilder()
      .setTitle(`🧩 ${ctx.club.name}: pick your channels`)
      .setColor(0x5865f2)
      .setDescription(overviewLines(guild, ctx).join('\n'))
      .setFooter({ text: 'Pick a feature, then the channel it should use.' });
    return { content: note || null, embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), buttonRow(btn('setupw:chhome', 'Back', '↩️'))] };
  }

  async function featureView(interaction, f) {
    const ctx = await loadCtx(interaction.guildId);
    const current = f.get(ctx.club, ctx);
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(`setupw:chset:${f.key}`)
      .setPlaceholder(`Pick the ${f.label} channel`)
      .setChannelTypes(...typesFor(f))
      .setMinValues(1)
      .setMaxValues(1);
    if (current && interaction.guild.channels.cache.get(current)) select.setDefaultChannels(current);
    const embed = new EmbedBuilder()
      .setTitle(`${f.emoji} ${f.label}`)
      .setColor(0x5865f2)
      .setDescription(`${f.what}.\n\nNow: ${current && interaction.guild.channels.cache.get(current) ? mention(f, current) : 'not set'}`);
    const buttons = [btn('setupw:chpick', 'Back', '↩️')];
    if (current) buttons.unshift(btn(`setupw:chclr:${f.key}`, 'Clear', '🧹', ButtonStyle.Danger));
    return { content: null, embeds: [embed], components: [new ActionRowBuilder().addComponents(select), buttonRow(...buttons)] };
  }

  async function setChannel(interaction, f, channelId) {
    const guild = interaction.guild;
    const ctx = await loadCtx(guild.id);
    if (!ctx.club) return overview(interaction);
    if (channelId) {
      const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
      if (!channel || !typesFor(f).includes(channel.type)) return pickView(interaction, `❌ Pick a ${f.voice ? 'voice' : 'text'} channel for ${f.label}.`);
      const missing = f.voice ? (channel.permissionsFor(guild.members.me)?.has(F.ViewChannel) ? [] : ['View Channel']) : missingChannelPerms(channel, guild.members.me);
      if (missing.length) return featureView(interaction, f).then((v) => ({ ...v, content: `❌ I can't use <#${channel.id}>. I'm missing **${missing.join('**, **')}** there. Give my role those permissions in the channel settings, or pick another channel.` }));
      f.set(ctx.club, channel.id, ctx);
      const note = await save(guild.id, ctx);
      await afterWired(guild, ctx.club, f, channel);
      return pickView(interaction, note || `✅ ${f.label} now uses <#${channel.id}>.`);
    }
    f.set(ctx.club, null, ctx);
    const note = await save(guild.id, ctx);
    return pickView(interaction, note || `🧹 ${f.label} channel cleared.`);
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!/^setupw:(channels|chhome|chplan|chgo|chpick|chfeat|chset:\w+|chclr:\w+)$/.test(id)) return false;
    if (!isServerAdmin(interaction.member)) {
      await interaction.reply({ content: '❌ Only server admins can set up channels.', flags: 64 });
      return true;
    }
    const [, action, key] = id.split(':');
    // The /setup checklist opens the panel as its own private reply; every step after edits that reply
    if (action === 'channels') {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await overview(interaction));
      return true;
    }
    await interaction.deferUpdate();
    let view;
    if (action === 'chhome') view = await overview(interaction);
    else if (action === 'chplan') view = await planView(interaction);
    else if (action === 'chgo') view = await runSetup(interaction);
    else if (action === 'chpick') view = await pickView(interaction);
    else if (action === 'chfeat') {
      const f = FEATURE.get(interaction.values?.[0]);
      view = f ? await featureView(interaction, f) : await pickView(interaction);
    } else {
      const f = FEATURE.get(key);
      const picked = action === 'chset' ? interaction.values?.[0] || null : null;
      view = f ? await setChannel(interaction, f, picked) : await pickView(interaction);
    }
    await interaction.editReply(view);
    return true;
  }

  return { handleInteraction, summary, overview };
}

module.exports = { createChannelSetup, planChannels, overwritesFor, FEATURES, categoryNameFor };
