// Social Hub onboarding: a one-minute, fully optional "Get set up" for new players on an open hub
// server. Nothing is gated on it: anyone can still press Play now straight away.
//   #start-here  read-only channel at the top of the hub with one card and a Get set up button
//                (Set Up Social Hub makes it; the welcome DM and the hub board point to it).
//   Get set up   one private card that fills in as you go, every step optional:
//                  platform (PS5, Xbox, PC)                  → profiles.ea_platform
//                  region                                    → a region role (🌍 Europe, ...)
//                  EA gamertag and Twitch                    → profiles (gamertag through auto-link,
//                                                              so placeholder stats move across)
//                  positions                                 → the position tiers editor (index.cjs)
//                  game pings                                → the Up for a Game role
//                Finish gives the Kitted Out badge (Hub XP) once and a link to the website profile.
// Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;
const GREEN = 0x2ecc71;
const NO_PINGS = { parse: [] };
const SITE = process.env.PUBLIC_SITE_URL || 'https://gafferbot.app';
const PING_ROLE = 'Up for a Game';

const PLATFORMS = [
  { value: 'ps5', label: 'PlayStation 5', emoji: '🎮' },
  { value: 'xbox-series-xs', label: 'Xbox Series X|S', emoji: '🟩' },
  { value: 'pc', label: 'PC', emoji: '💻' },
];

const REGIONS = [
  { value: 'uki', label: 'UK & Ireland', emoji: '🇬🇧' },
  { value: 'eu', label: 'Europe', emoji: '🇪🇺' },
  { value: 'nae', label: 'North America East', emoji: '🇺🇸' },
  { value: 'naw', label: 'North America West', emoji: '🌄' },
  { value: 'sa', label: 'South America', emoji: '🌎' },
  { value: 'mea', label: 'Middle East & Africa', emoji: '🌍' },
  { value: 'apac', label: 'Asia & Oceania', emoji: '🌏' },
];
const regionRoleName = (r) => `${r.emoji} ${r.label}`;

// EA gamertags: letters, numbers, spaces, - and _ (3 to 32). Twitch logins: 4 to 25, letters, numbers, _
function cleanGamertag(raw) {
  const t = String(raw || '').trim();
  return /^[A-Za-z0-9 _.-]{3,32}$/.test(t) ? t : null;
}
function cleanTwitch(raw) {
  const t = String(raw || '').trim().replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//i, '').replace(/^@/, '').replace(/\/.*$/, '').toLowerCase();
  return /^[a-z0-9_]{3,25}$/.test(t) ? t : null;
}

// Which steps are done, from what we know about the player
function stepsOf(info) {
  return [
    { key: 'platform', label: 'Platform', done: !!info.platform, value: PLATFORMS.find((p) => p.value === info.platform)?.label },
    { key: 'region', label: 'Region', done: !!info.region, value: info.region ? regionRoleName(info.region) : null },
    { key: 'gamertag', label: 'EA gamertag', done: !!info.gamertag, value: info.gamertag },
    { key: 'positions', label: 'Positions', done: info.positions.length > 0, value: info.positions.slice(0, 4).join(', ') },
    { key: 'twitch', label: 'Twitch (optional)', done: !!info.twitch, value: info.twitch ? `twitch.tv/${info.twitch}` : null, optional: true },
    { key: 'pings', label: 'Game pings', done: info.pings, value: info.pings ? 'on' : null, optional: true },
  ];
}

function createHubOnboarding(deps) {
  const { supabase, hubOf, autoLink, getUserPrefs } = deps;
  const xp = () => deps.xp?.();

  // ---------- What we know ----------

  async function infoFor(guild, userId) {
    const [{ data: profile }, prefs, member] = await Promise.all([
      supabase.from('profiles').select('ea_username, ea_platform, twitch_username').eq('discord_user_id', userId).maybeSingle(),
      getUserPrefs ? getUserPrefs(guild.id, userId).catch(() => []) : [],
      guild.members.fetch(userId).catch(() => null),
    ]);
    const roles = member?.roles?.cache;
    const has = (name) => !!roles?.some?.((r) => r.name === name);
    return {
      member,
      platform: profile?.ea_platform && PLATFORMS.some((p) => p.value === profile.ea_platform) ? profile.ea_platform : null,
      gamertag: profile?.ea_username || null,
      twitch: profile?.twitch_username || null,
      positions: (prefs || []).filter(Boolean),
      region: REGIONS.find((r) => has(regionRoleName(r))) || null,
      pings: has(PING_ROLE),
    };
  }

  // ---------- Cards ----------

  function welcomePost(guild) {
    const embed = new EmbedBuilder()
      .setTitle(`👋 Welcome to ${guild.name}`)
      .setColor(GREEN)
      .setDescription(
        [
          'Anyone can play here, any time. No trials, no sign-ups: press **Play now** on the board and you get a spot.',
          'Take a minute to **get set up** so the bot puts you in the right spots and your games count: your platform, region, EA gamertag, positions and (if you stream) your Twitch.',
          'Every step is optional, and you can come back and change things any time.',
        ].join('\n\n')
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ob_start').setLabel('Get set up').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setLabel('Your profile on the web').setStyle(ButtonStyle.Link).setURL(`${SITE}/profile`)
    );
    return { embeds: [embed], components: [row], allowedMentions: NO_PINGS };
  }

  function setupCard(info, note = null) {
    const steps = stepsOf(info);
    const needed = steps.filter((s) => !s.optional);
    const done = needed.filter((s) => s.done).length;
    const embed = new EmbedBuilder()
      .setTitle(done === needed.length ? '✅ You\'re all set' : `Get set up · ${done}/${needed.length}`)
      .setColor(GREEN)
      .setDescription(
        [
          note,
          steps.map((s) => `${s.done ? '✅' : s.optional ? '▫️' : '⬜'} **${s.label}**${s.value ? `: ${s.value}` : ''}`).join('\n'),
          'Your gamertag links your EA games to you, so they count for stats, badges and Hub XP in every GafferBot server.',
        ].filter(Boolean).join('\n\n')
      )
      .setFooter({ text: 'Everything is optional. Press Finish when you\'re done.' });
    const platform = new StringSelectMenuBuilder()
      .setCustomId('ob_plat')
      .setPlaceholder(info.platform ? `Platform: ${PLATFORMS.find((p) => p.value === info.platform).label}` : 'Pick your platform')
      .addOptions(PLATFORMS.map((p) => ({ label: p.label, value: p.value, emoji: p.emoji, default: p.value === info.platform })));
    const region = new StringSelectMenuBuilder()
      .setCustomId('ob_region')
      .setPlaceholder(info.region ? `Region: ${info.region.label}` : 'Pick your region')
      .addOptions(REGIONS.map((r) => ({ label: r.label, value: r.value, emoji: r.emoji, default: r.value === info.region?.value })));
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ob_links').setLabel(info.gamertag ? 'Edit gamertag & Twitch' : 'Add gamertag & Twitch').setEmoji('🎮').setStyle(info.gamertag ? ButtonStyle.Secondary : ButtonStyle.Primary),
      // Handled by index.cjs: the position tiers editor
      new ButtonBuilder().setCustomId('posboard_setprefs').setLabel('My positions').setEmoji('🎯').setStyle(info.positions.length ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ob_ping').setLabel(info.pings ? 'Game pings: on' : 'Game pings: off').setEmoji(info.pings ? '🔔' : '🔕').setStyle(ButtonStyle.Secondary)
    );
    const end = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ob_done').setLabel('Finish').setEmoji('🏁').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ob_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel('Profile on the web').setStyle(ButtonStyle.Link).setURL(`${SITE}/profile`)
    );
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(platform), new ActionRowBuilder().addComponents(region), buttons, end], allowedMentions: NO_PINGS };
  }

  function linksModal(info) {
    return new ModalBuilder()
      .setCustomId('ob_links_m')
      .setTitle('Gamertag & Twitch')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('gamertag').setLabel('EA gamertag (as it shows in Pro Clubs)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32).setValue(info.gamertag || '')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('twitch').setLabel('Twitch channel (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder('twitch.tv/yourname').setValue(info.twitch || '')
        )
      );
  }

  // ---------- Saves ----------

  async function saveProfile(userId, fields) {
    const { data } = await supabase.from('profiles').select('discord_user_id').eq('discord_user_id', userId).maybeSingle();
    const { error } = data
      ? await supabase.from('profiles').update(fields).eq('discord_user_id', userId)
      : await supabase.from('profiles').insert({ discord_user_id: userId, ...fields });
    return error ? error.message : null;
  }

  async function setTwitch(userId, login) {
    if (login) {
      const { data: owner } = await supabase.from('profiles').select('discord_user_id').ilike('twitch_username', login).neq('discord_user_id', userId).limit(1).maybeSingle();
      if (owner) return `twitch.tv/${login} is already linked to another member.`;
    }
    const err = await saveProfile(userId, { twitch_username: login || null });
    return err ? `Couldn't save Twitch: ${err}` : null;
  }

  async function setRegion(guild, member, value) {
    const pick = REGIONS.find((r) => r.value === value);
    if (!pick || !member?.roles) return 'I couldn\'t find you on this server.';
    if (!guild.members.me?.permissions?.has(F.ManageRoles)) return 'I need **Manage Roles** to give region roles. Ask an admin.';
    let role = guild.roles.cache.find((r) => r.name === regionRoleName(pick));
    if (!role) role = await guild.roles.create({ name: regionRoleName(pick), mentionable: false, reason: 'GafferBot Social Hub region' }).catch(() => null);
    if (!role) return 'I couldn\'t make the region role.';
    // One region at a time
    for (const r of REGIONS) {
      if (r.value === pick.value) continue;
      const old = guild.roles.cache.find((x) => x.name === regionRoleName(r));
      if (old && member.roles.cache.has(old.id)) await member.roles.remove(old).catch(() => {});
    }
    if (!member.roles.cache.has(role.id)) {
      const ok = await member.roles.add(role).then(() => true).catch(() => false);
      if (!ok) return 'I can\'t give that role. Ask an admin to move my role above the region roles.';
    }
    return null;
  }

  async function togglePings(guild, member) {
    if (!member?.roles) return 'I couldn\'t find you on this server.';
    let role = guild.roles.cache.find((r) => r.name === PING_ROLE);
    if (!role && guild.members.me?.permissions?.has(F.ManageRoles)) {
      role = await guild.roles.create({ name: PING_ROLE, mentionable: true, reason: 'GafferBot Casual Play: Who\'s On? pings' }).catch(() => null);
    }
    if (!role) return `There's no **${PING_ROLE}** role and I can't make one.`;
    const has = member.roles.cache.has(role.id);
    const ok = await (has ? member.roles.remove(role) : member.roles.add(role)).then(() => true).catch(() => false);
    return ok ? null : `I can't change **${PING_ROLE}**. Ask an admin to move my role above it.`;
  }

  // ---------- Hub setup and welcome ----------

  async function onMemberJoin(member) {
    if (member.user?.bot) return;
    const hub = await hubOf(member.guild.id);
    if (!hub.on) return;
    const where = hub.start_channel_id ? `<#${hub.start_channel_id}>` : hub.board_channel_id ? `<#${hub.board_channel_id}>` : 'the server';
    await member
      .send(
        `👋 Welcome to **${member.guild.name}**! Anyone can play here, any time.\n` +
          `• Press **Get set up** in ${where} (one minute, all optional): platform, region, gamertag, positions and Twitch.\n` +
          (hub.board_channel_id ? `• Then head to <#${hub.board_channel_id}> and press **Play now** to get in a game.\n` : '') +
          '• Every game, win and hour in the lobbies earns Hub XP, and anyone can start their own team.'
      )
      .catch(() => {});
  }

  // ---------- Interactions ----------

  async function render(interaction, note, update = true) {
    const info = await infoFor(interaction.guild, interaction.user.id);
    const card = setupCard(info, note);
    return update ? interaction.editReply(card) : interaction.reply({ ...card, flags: 64 });
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    const id = interaction.customId || '';
    if (!id.startsWith('ob_')) return false;
    const guild = interaction.guild;

    if (interaction.isModalSubmit?.() && id === 'ob_links_m') {
      // The modal came from the setup card, so update that card in place
      if (interaction.isFromMessage?.()) await interaction.deferUpdate();
      else await interaction.deferReply({ flags: 64 });
      const notes = [];
      const info = await infoFor(guild, interaction.user.id);
      const rawTag = interaction.fields.getTextInputValue('gamertag');
      if (rawTag && rawTag.trim() !== (info.gamertag || '')) {
        const tag = cleanGamertag(rawTag);
        if (!tag) notes.push('⚠️ That gamertag has characters EA doesn\'t use. Type it as it shows in Pro Clubs.');
        else {
          const r = await autoLink.link(interaction.user.id, tag, info.platform);
          notes.push(r.ok ? `🎮 Linked **${tag}**: your EA games now count for you.` : `⚠️ ${r.reason}`);
        }
      }
      const rawTwitch = interaction.fields.getTextInputValue('twitch');
      if ((rawTwitch || '') !== (info.twitch || '')) {
        const login = rawTwitch ? cleanTwitch(rawTwitch) : null;
        if (rawTwitch && !login) notes.push('⚠️ That doesn\'t look like a Twitch channel name.');
        else {
          const err = await setTwitch(interaction.user.id, login);
          notes.push(err ? `⚠️ ${err}` : login ? `📺 Twitch saved: twitch.tv/${login}` : '📺 Twitch removed.');
        }
      }
      await render(interaction, notes.join('\n') || null);
      return true;
    }

    if (interaction.isStringSelectMenu?.() && (id === 'ob_plat' || id === 'ob_region')) {
      await interaction.deferUpdate();
      const value = interaction.values?.[0];
      let note = null;
      if (id === 'ob_plat') {
        if (!PLATFORMS.some((p) => p.value === value)) return true;
        const err = await saveProfile(interaction.user.id, { ea_platform: value });
        note = err ? `⚠️ Couldn't save your platform: ${err}` : null;
      } else {
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        const err = await setRegion(guild, member, value);
        note = err ? `⚠️ ${err}` : null;
      }
      await render(interaction, note);
      return true;
    }

    if (!interaction.isButton?.()) return false;
    if (id === 'ob_start') {
      await interaction.deferReply({ flags: 64 });
      await render(interaction, null);
      return true;
    }
    if (id === 'ob_refresh') {
      await interaction.deferUpdate();
      await render(interaction, null);
      return true;
    }
    if (id === 'ob_links') {
      await interaction.showModal(linksModal(await infoFor(guild, interaction.user.id)));
      return true;
    }
    if (id === 'ob_ping') {
      await interaction.deferUpdate();
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      const err = await togglePings(guild, member);
      await render(interaction, err ? `⚠️ ${err}` : null);
      return true;
    }
    if (id === 'ob_done') {
      await interaction.deferUpdate();
      const info = await infoFor(guild, interaction.user.id);
      const missing = stepsOf(info).filter((s) => !s.optional && !s.done).map((s) => s.label.toLowerCase());
      if (!missing.length && xp()) await xp().record(guild.id, new Map([[interaction.user.id, { badges: ['kitted_out'] }]])).catch(() => {});
      const hub = await hubOf(guild.id);
      const next = hub.board_channel_id ? ` Head to <#${hub.board_channel_id}> and press **Play now**.` : '';
      await render(interaction, (missing.length ? `👍 Done for now. You can add your ${missing.join(', ')} any time with **Get set up**.` : '🏁 All set! You earned the **Kitted Out** badge.') + next);
      return true;
    }
    return false;
  }

  return { handleInteraction, onMemberJoin, welcomePost, setupCard, infoFor };
}

module.exports = { createHubOnboarding, cleanGamertag, cleanTwitch, stepsOf, PLATFORMS, REGIONS, regionRoleName };
