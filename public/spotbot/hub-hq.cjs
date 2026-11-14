// GafferBot HQ: turns a Social Hub server (The Spot) into GafferBot's own home on Discord, the way
// PennantBot's hub server works: where clubs find GafferBot, read how it works, add it, get help and
// follow news, next to the Social Hub's lobbies.
//   Who       bot owners only (isBotOwner), from Make this the GafferBot HQ on the Set Up Social Hub
//             reply. Safe to run again: ids live in guild_settings.social_hub.hq, so a second run edits
//             the same channels and posts. It never deletes anything.
//   Builds    the GafferBot Team role (hoisted, given to whoever ran it); a read-only 📣 GafferBot
//             category (#welcome, #guides, #announcements, #how-it-works, #add-gafferbot, #pricing), a 💬
//             Clubs category (#show-off-your-club, #feature-requests), a 🛟 Support category (#support,
//             a forum with tags when Community is on, and a staff-only #staff); Community turned on
//             (rules = the hub's #rules, updates = #staff) so #announcements can be followed; branded
//             banner graphics on every post (drawn locally, resvg); the GafferBot logo as the server
//             icon when it has none; and a permanent invite from #welcome.
//   Guides    #guides is a read-only forum (a text channel when Community is off) with one tagged post per
//             part of the app (hub-guides.cjs), each with its own banner, edited in place on a rerun.
// Nothing here pings anyone.

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const G = require('./graphics.cjs');
const { isBotOwner } = require('./perm-check.cjs');
const { guides, GUIDE_TAGS, FREE_IMAGES, IMAGE_PACKS } = require('./hub-guides.cjs');

const F = PermissionsBitField.Flags;
const NO_PINGS = { parse: [] };
const SITE = process.env.PUBLIC_SITE_URL || 'https://gafferbot.app';
const DONATE_URL = 'https://venmo.com/u/bleacherjeff';
const BOT_PERMISSIONS = '309591534673';
const GREEN = 0x22c35e;
const DARK = 0x0f172a;
const TEAM_ROLE = 'GafferBot Team';
const LOGO = path.join(__dirname, '..', 'favicon.png');

const CATEGORIES = [
  {
    key: 'cat_gb',
    name: '📣 GafferBot',
    access: 'read_only',
    channels: [
      { key: 'welcome', name: 'welcome', topic: 'What GafferBot is and where to go next.' },
      { key: 'guides', name: 'guides', topic: 'How every part of GafferBot works, for managers and players. Pick a tag to filter.', forum: true, tags: GUIDE_TAGS },
      { key: 'announcements', name: 'announcements', topic: 'New features, fixes and downtime. Press Follow to get these in your club\'s server.', announce: true },
      { key: 'how_it_works', name: 'how-it-works', topic: 'Everything GafferBot runs for a Pro Clubs side.' },
      { key: 'add', name: 'add-gafferbot', topic: 'Add GafferBot to your club\'s server in four steps.' },
      { key: 'pricing', name: 'pricing', topic: 'GafferBot is free. Here\'s how it keeps running.' },
    ],
  },
  {
    key: 'cat_clubs',
    name: '💬 Clubs',
    access: 'open',
    channels: [
      { key: 'show_off', name: 'show-off-your-club', topic: 'Post your lineups, recaps, player cards and newspaper front pages.' },
      { key: 'feature_requests', name: 'feature-requests', topic: 'One idea per message. React 👍 on the ones you want.' },
    ],
  },
  {
    key: 'cat_support',
    name: '🛟 Support',
    access: 'open',
    channels: [
      { key: 'support', name: 'support', topic: 'One post per problem: your server\'s name, what you did and what you expected.', forum: true, tags: ['Setup', 'EA stats', 'Lineups & events', 'Graphics', 'Network', 'Social Hub', 'Bug', 'Question', 'Solved'] },
      { key: 'staff', name: 'staff', topic: 'GafferBot Team only.', access: 'staff' },
    ],
  },
];

// ---------- Graphics ----------

const BOLT = 'M58 0 L18 70 L46 70 L34 128 L82 48 L54 48 L70 0 Z';

// A 1200x500 GafferBot banner: bolt, wordmark, headline, line and up to six feature chips
function bannerSvg({ headline, line, chips = [], accent = '#22c35e' }) {
  const e = G.esc;
  const chipEls = chips.slice(0, 6).map((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 70 + col * 360;
    const y = 330 + row * 66;
    return `<g transform="translate(${x},${y})"><rect width="340" height="52" rx="26" fill="#ffffff14" stroke="${accent}66"/><text x="170" y="34" text-anchor="middle" font-family="Inter" font-weight="600" font-size="22" fill="#e2e8f0">${e(c)}</text></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#0f2a1c"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="500" fill="url(#bg)"/>
  <rect width="1200" height="500" fill="url(#glow)"/>
  <g stroke="#ffffff10" stroke-width="2" fill="none"><circle cx="1040" cy="250" r="150"/><line x1="1040" y1="0" x2="1040" y2="500"/></g>
  <g transform="translate(70,48) scale(0.55)"><path d="${BOLT}" fill="${accent}"/></g>
  <text x="128" y="105" font-family="Oswald" font-weight="700" font-size="40" letter-spacing="4" fill="#ffffff">GAFFERBOT</text>
  <text x="70" y="200" font-family="Oswald" font-weight="700" font-size="${headline.length > 30 ? 52 : 64}" fill="#ffffff">${e(headline)}</text>
  <text x="70" y="252" font-family="Inter" font-size="26" fill="#cbd5e1">${e(line)}</text>
  <rect x="70" y="278" width="120" height="6" rx="3" fill="${accent}"/>
  ${chipEls.join('\n  ')}
  <text x="1130" y="470" text-anchor="end" font-family="Inter" font-weight="600" font-size="20" fill="#94a3b8">gafferbot.app</text>
</svg>`;
}

const banner = (opts) => G.render(bannerSvg(opts));

// ---------- Posts ----------

function hqPosts({ inviteUrl, ch, hubName }) {
  return [
    {
      key: 'welcome',
      channel: 'welcome',
      title: 'Welcome to GafferBot ⚡',
      banner: { headline: 'Run your Pro Clubs side from Discord', line: 'Lineups, availability, EA stats, recruiting and graphics. Free.', chips: ['Manager hub', 'Lineups', 'EA stats', 'Recruiting', 'Network', 'Social Hub'] },
      links: [['Add to Discord', inviteUrl], ['gafferbot.app', SITE]],
      description: [
        'GafferBot runs **EA SPORTS FC Pro Clubs** sides from Discord and the web: events and availability, lineups, stats straight from EA, recruiting, the GafferBot Network and club graphics.',
        '',
        `**New here?** Read ${ch('how_it_works')}, then follow ${ch('add')} to set it up for your club.`,
        `**How does it work?** ${ch('guides')} explains every part of the app, for managers and players.`,
        `**Want a game right now?** ${hubName} is also an open Social Hub: jump into a lobby, find a team or start one.`,
        `**Something broken?** Open a post in ${ch('support')}.`,
        `**Stay in the loop:** follow ${ch('announcements')} into your club's server.`,
      ].join('\n'),
    },
    {
      key: 'how_it_works',
      channel: 'how_it_works',
      title: 'What GafferBot does for a club',
      banner: { headline: 'Everything your club needs', line: 'One /manager panel. No commands to memorise.', chips: ['Events', 'Team sheets', 'Stats & form', 'Free agents', 'Newspaper', 'Player cards'] },
      description: [
        '**A manager hub inside Discord.** One **/manager** panel runs the club: events, team sheets, roster, stats and recruiting are all buttons.',
        '',
        '**Availability without the chasing.** Post a game and players tap Yes, Maybe or No. Reminders go out by DM before kick-off.',
        '',
        '**Lineups your squad will read.** Drag players into a formation, pick a kit and post a clean team graphic. Auto lineups when you\'re short on time.',
        '',
        '**Stats straight from EA.** Results, ratings, form and division progress sync on their own, with recaps after every game and insights on who plays well together.',
        '',
        '**Recruiting and free agents.** A cross-server pool of free agents by position and platform, tryouts and a report card on every trialist.',
        '',
        '**The GafferBot Network.** Opt in to find a last-minute replacement, book friendlies with clubs your level, enter GafferBot BYOTs and climb a global leaderboard.',
        '',
        '**Club life.** A match report after every game, a club newspaper, awards, badges, rivalries and player cards in your colours.',
        '',
        `**On the web too.** Every Discord panel works at ${SITE}, with the same permissions.`,
      ].join('\n'),
    },
    {
      key: 'add',
      channel: 'add',
      title: 'Add GafferBot to your club',
      banner: { headline: 'Set up in about two minutes', line: 'Add it, link your EA club, post your first game.', chips: ['1 · Add', '2 · Link EA club', '3 · Post a game', '4 · Invite players'] },
      links: [['Add GafferBot', inviteUrl]],
      description: [
        `**1. Add the bot to your club's server.** You need Manage Server there. [Add GafferBot](${inviteUrl})`,
        `**2. Set it up.** Run **/setup** for a checklist and any missing permissions, link your club with **/manager → Admin → Link EA Club**, then pick your colours, crest and kits on ${SITE}.`,
        '**3. Post your first game.** **/manager → Events**. Availability, the lineup, reminders and the recap take care of themselves.',
        `**4. Bring your players in.** Each player runs **/me** to set positions and link their gamertag, or signs in at ${SITE}.`,
        '',
        `Every step in more detail: ${ch('guides')}. Stuck? Open a post in ${ch('support')} with the Setup tag.`,
      ].join('\n'),
    },
    {
      key: 'pricing',
      channel: 'pricing',
      title: 'Pricing: free, plus AI image packs',
      banner: { headline: 'Free for every club', line: `Every feature free. ${FREE_IMAGES} AI images free, then image packs.`, chips: ['Every feature', 'Lineups', 'EA stats', `${FREE_IMAGES} free AI images`, ...IMAGE_PACKS.map((p) => `${p.images} for $${p.price}`)] },
      links: [['Add to Discord', inviteUrl], ['Buy image packs', `${SITE}/billing`], ['Donate', DONATE_URL]],
      description: [
        'GafferBot is **free**: every feature, every server, no card needed.',
        '• Every club, player and event in your server',
        '• Lineups, availability and reminders',
        '• EA stat sync, insights and recaps',
        '• Recruiting, free agents and the Network',
        '• Lineup graphics, player cards and the club newspaper',
        '',
        `**AI images** cost us money to make, so each server gets **${FREE_IMAGES} free**. After that, buy an image pack:`,
        ...IMAGE_PACKS.map((p) => `• **${p.images} images: $${p.price}**`),
        `Packs are on the website (${SITE}/billing) and in Discord's store, at the same price.`,
        '',
        'GafferBot also runs on donations. If it helps your club, you can chip in to keep it going.',
      ].join('\n'),
    },
    {
      key: 'announcements',
      channel: 'announcements',
      title: 'GafferBot HQ is open',
      banner: { headline: 'GafferBot HQ is open', line: 'News, help and a place to play, all in one server.' },
      description: [
        'This is where clubs find GafferBot, ask questions, get help and find a game.',
        `Start with ${ch('how_it_works')} and ${ch('add')}.`,
        'Press **Follow** on this channel to get GafferBot news in your own club\'s server.',
      ].join('\n'),
    },
    {
      key: 'show_off',
      channel: 'show_off',
      title: 'Show off your club',
      description: 'Post your lineups, recaps, player cards, newspaper front pages and Wrapped. Say which club it is so others can find you on the Network.',
    },
    {
      key: 'feature_requests',
      channel: 'feature_requests',
      title: 'Feature requests',
      description: 'One idea per message, and say what it would do for your club. React 👍 on ideas you want too; the most wanted get built first.',
    },
    {
      key: 'support_guide',
      channel: 'support',
      thread_title: 'Read me first: how to get help',
      title: 'How to get help',
      description: [
        'Open **one post per problem** and pick a tag. Include:',
        '• your club\'s Discord server name',
        '• what you did, what you expected and what happened',
        '• a screenshot, if you can',
        '',
        'Never post passwords, tokens or sign-in links. The GafferBot Team will never ask for them. When it\'s fixed we\'ll tag the post **Solved**.',
      ].join('\n'),
    },
    // Forums list the newest post first, so the guides go up last to first and "Start here" is pinned
    ...guides({ ch })
      .reverse()
      .map((g) => ({ key: `guide_${g.key}`, channel: 'guides', title: g.title, thread_title: g.title, banner: g.banner, description: g.body, tags: g.tags, pin: g.key === 'start' })),
  ];
}

// Forum tag ids for tag names
function tagIds(channel, names = []) {
  const tags = channel?.availableTags || [];
  return names.map((n) => tags.find((t) => t.name === n)?.id).filter(Boolean).slice(0, 5);
}

// Which channel a saved post belongs to, from its key
function postChannelKey(key) {
  if (key === 'support_guide') return 'support';
  if (key.startsWith('guide_')) return 'guides';
  return key;
}

// ---------- Setup ----------

function createHubHq(deps) {
  const { hubOf, saveHub } = deps;
  const client = () => deps.client();

  function inviteUrl() {
    const id = client()?.application?.id || client()?.user?.id || '';
    return `https://discord.com/oauth2/authorize?client_id=${id}&permissions=${BOT_PERMISSIONS}&scope=bot%20applications.commands`;
  }

  async function fetchCh(guild, id) {
    return id ? guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null)) : null;
  }

  function overwrites(guild, access, teamRoleId) {
    const me = guild.members.me.id;
    const bot = { id: me, allow: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.AttachFiles, F.ReadMessageHistory, F.ManageMessages, F.ManageThreads] };
    const team = teamRoleId ? [{ id: teamRoleId, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.EmbedLinks, F.AttachFiles] }] : [];
    if (access === 'staff') return [{ id: guild.roles.everyone.id, deny: [F.ViewChannel] }, bot, ...team];
    if (access === 'read_only') return [{ id: guild.roles.everyone.id, allow: [F.ViewChannel, F.ReadMessageHistory, F.AddReactions], deny: [F.SendMessages, F.SendMessagesInThreads, F.CreatePublicThreads, F.CreatePrivateThreads] }, bot, ...team];
    return [bot];
  }

  async function setup(guild, member) {
    const done = [];
    const warnings = [];
    const hub = { ...(await hubOf(guild.id)) };
    if (!hub.on) return { error: 'Set up the Social Hub here first.' };
    const me = guild.members.me;
    const missing = ['ManageGuild', 'ManageRoles', 'ManageChannels', 'CreateInstantInvite', 'ManageMessages'].filter((p) => !me?.permissions?.has(F[p]));
    if (missing.length) return { error: `I need **${missing.join('**, **')}** to build GafferBot HQ.` };
    const hq = { channels: {}, posts: {}, ...(hub.hq || {}) };
    hq.channels = { ...(hq.channels || {}) };
    hq.posts = { ...(hq.posts || {}) };

    // 1) GafferBot Team role, given to whoever ran this
    let role = hq.role_id ? guild.roles.cache.get(hq.role_id) || (await guild.roles.fetch(hq.role_id).catch(() => null)) : null;
    if (!role) {
      role = await guild.roles.create({ name: TEAM_ROLE, color: GREEN, hoist: true, mentionable: false, permissions: [F.KickMembers, F.ViewAuditLog, F.ManageMessages, F.ManageThreads, F.ModerateMembers], reason: 'GafferBot HQ' }).catch(() => null);
      if (role) done.push(`Made the **${TEAM_ROLE}** role`);
      else warnings.push(`Couldn't make the ${TEAM_ROLE} role`);
    }
    if (role) {
      hq.role_id = role.id;
      await member?.roles?.add?.(role).catch(() => warnings.push(`Couldn't give you the ${TEAM_ROLE} role (move my role above it)`));
    }

    // 2) Categories and channels (forums and announcement channels come after Community)
    for (const cat of CATEGORIES) {
      let category = await fetchCh(guild, hq.channels[cat.key]);
      if (!category) {
        category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites(guild, cat.access, role?.id), reason: 'GafferBot HQ' });
        done.push(`Made the ${cat.name} category`);
      }
      hq.channels[cat.key] = category.id;
      for (const c of cat.channels) {
        if (c.forum || c.announce) continue;
        let channel = await fetchCh(guild, hq.channels[c.key]);
        if (!channel) {
          channel = await guild.channels.create({ name: c.name, type: ChannelType.GuildText, parent: category.id, topic: c.topic, permissionOverwrites: overwrites(guild, c.access || cat.access, role?.id), reason: 'GafferBot HQ' });
          done.push(`Made <#${channel.id}>`);
        }
        hq.channels[c.key] = channel.id;
      }
    }
    if (hq.channels.cat_gb) await guild.channels.cache.get(hq.channels.cat_gb)?.setPosition?.(0).catch(() => {});

    // 3) Community, so #announcements can be followed and #support can be a forum
    let community = (guild.features || []).includes('COMMUNITY');
    if (!community && hub.rules_channel_id && hq.channels.staff) {
      const r = await guild
        .edit({
          features: [...(guild.features || []), 'COMMUNITY'],
          verificationLevel: Math.max(guild.verificationLevel || 0, 1),
          explicitContentFilter: 2,
          rulesChannel: hub.rules_channel_id,
          publicUpdatesChannel: hq.channels.staff,
          reason: 'GafferBot HQ',
        })
        .then(() => true)
        .catch((err) => {
          warnings.push(`Couldn't turn on Community (${String(err.message).slice(0, 100)}). Turn it on in Server Settings → Enable Community, then run this again.`);
          return false;
        });
      if (r) {
        community = true;
        done.push('Turned on Community (rules: #rules, updates: #staff; members need a verified email)');
      }
    } else if (!community) {
      warnings.push('Community is off: press Set Up Social Hub again so #rules exists, then run this again.');
    }

    // 4) #announcements (followable when Community is on) and #support (a forum when Community is on)
    for (const cat of CATEGORIES) {
      for (const c of cat.channels.filter((x) => x.forum || x.announce)) {
        let channel = await fetchCh(guild, hq.channels[c.key]);
        const want = c.forum ? (community ? ChannelType.GuildForum : ChannelType.GuildText) : community ? ChannelType.GuildAnnouncement : ChannelType.GuildText;
        if (channel && channel.type !== want && c.announce && want === ChannelType.GuildAnnouncement) {
          await channel.setType?.(ChannelType.GuildAnnouncement).catch(() => {});
        }
        if (channel && c.forum && want === ChannelType.GuildForum && channel.type !== ChannelType.GuildForum) {
          // A text #support from before Community: leave it, make the forum alongside
          channel = null;
        }
        if (!channel) {
          channel = await guild.channels.create({
            name: c.name,
            type: want,
            parent: hq.channels[cat.key],
            topic: c.topic,
            permissionOverwrites: overwrites(guild, c.access || cat.access, role?.id),
            ...(want === ChannelType.GuildForum ? { availableTags: (c.tags || []).map((name) => ({ name })) } : {}),
            reason: 'GafferBot HQ',
          });
          done.push(`Made <#${channel.id}>`);
          for (const k of Object.keys(hq.posts)) if (hq.posts[k]?.channel_id && hq.posts[k].channel_id !== channel.id && postChannelKey(k) === c.key) delete hq.posts[k];
        } else if (channel.type === ChannelType.GuildForum && c.tags?.length) {
          const have = channel.availableTags || [];
          const add = c.tags.filter((n) => !have.some((t) => t.name === n)).map((name) => ({ name }));
          if (add.length && have.length + add.length <= 20) await channel.setAvailableTags([...have, ...add]).catch(() => warnings.push(`Couldn't add tags to <#${channel.id}>`));
        }
        hq.channels[c.key] = channel.id;
      }
    }

    // 5) Posts with banners, edited in place on a second run
    const ch = (k) => (hq.channels[k] ? `<#${hq.channels[k]}>` : `#${k}`);
    const invite = inviteUrl();
    for (const p of hqPosts({ inviteUrl: invite, ch, hubName: guild.name })) {
      const channel = await fetchCh(guild, hq.channels[p.channel]);
      if (!channel) continue;
      const files = p.banner ? [new AttachmentBuilder(banner(p.banner), { name: `${p.key}.png` })] : [];
      const embed = new EmbedBuilder().setTitle(p.title).setColor(p.banner ? GREEN : DARK).setDescription(p.description.slice(0, 4000));
      if (p.banner) embed.setImage(`attachment://${p.key}.png`);
      const components = p.links?.length ? [new ActionRowBuilder().addComponents(...p.links.map(([label, url]) => new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url)))] : [];
      const payload = { embeds: [embed], files, components, allowedMentions: NO_PINGS };
      const saved = hq.posts[p.key];
      let msg = null;
      if (saved?.message_id) {
        const where = saved.thread_id ? await fetchCh(guild, saved.thread_id) : channel;
        const old = where?.messages ? await where.messages.fetch(saved.message_id).catch(() => null) : null;
        if (old) msg = await old.edit({ ...payload, attachments: [] }).catch(() => null);
        if (msg && saved.thread_id && channel.type === ChannelType.GuildForum) {
          const thread = await fetchCh(guild, saved.thread_id);
          if (p.thread_title && thread?.name !== p.thread_title) await thread?.setName?.(p.thread_title.slice(0, 100)).catch(() => {});
          if (p.tags) await thread?.setAppliedTags?.(tagIds(channel, p.tags)).catch(() => {});
        }
      }
      if (!msg) {
        if (channel.type === ChannelType.GuildForum) {
          const thread = await channel.threads.create({ name: (p.thread_title || p.title).slice(0, 100), message: payload, appliedTags: tagIds(channel, p.tags), reason: 'GafferBot HQ' }).catch(() => null);
          if (thread) {
            if (p.pin || !p.key.startsWith('guide_')) await thread.pin?.().catch(() => {});
            msg = await thread.fetchStarterMessage().catch(() => null);
            hq.posts[p.key] = { channel_id: channel.id, thread_id: thread.id, message_id: msg?.id || null };
          }
        } else {
          msg = await channel.send(payload).catch(() => null);
          if (msg) {
            if (!p.key.startsWith('guide_') || p.pin) await msg.pin().catch(() => {});
            hq.posts[p.key] = { channel_id: channel.id, message_id: msg.id };
          }
        }
        if (msg) done.push(`Posted **${p.title}**`);
        else warnings.push(`Couldn't post "${p.title}"`);
      }
    }

    // 6) Server icon, only when the server has none
    if (!guild.icon && fs.existsSync(LOGO)) {
      const ok = await guild.setIcon(fs.readFileSync(LOGO), 'GafferBot HQ').then(() => true).catch(() => false);
      if (ok) done.push('Set the server icon to the GafferBot logo');
      else warnings.push('Couldn\'t set the server icon');
    }

    // 7) A permanent invite to HQ, from #welcome
    if (!hq.invite_code && hq.channels.welcome) {
      const inv = await guild.invites.create(hq.channels.welcome, { maxAge: 0, maxUses: 0, unique: false, reason: 'GafferBot HQ' }).catch(() => null);
      if (inv) hq.invite_code = inv.code;
      else warnings.push('Couldn\'t make a permanent invite');
    }

    hq.set_up_at = new Date().toISOString();
    await saveHub(guild.id, { ...hub, hq });
    return { done, warnings, invite: hq.invite_code ? `https://discord.gg/${hq.invite_code}` : null };
  }

  async function handleInteraction(interaction) {
    if (interaction.customId !== 'hq_setup' || !interaction.guildId || !interaction.isButton?.()) return false;
    if (!isBotOwner(interaction.user.id)) {
      await interaction.reply({ content: '❌ Only the GafferBot team can make a server GafferBot HQ.', flags: 64 });
      return true;
    }
    await interaction.deferReply({ flags: 64 });
    const member = interaction.member?.roles?.add ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const r = await setup(interaction.guild, member).catch((err) => ({ error: err.message }));
    if (r.error) return interaction.editReply({ content: `❌ ${r.error}` }).then(() => true);
    const lines = [
      '🏢 **GafferBot HQ is set up.**',
      r.done.length ? r.done.map((d) => `• ${d}`).join('\n') : '• Everything was already there; posts are up to date.',
      r.warnings.length ? `\n⚠️ ${r.warnings.join('\n⚠️ ')}` : null,
      r.invite ? `\nInvite to HQ: ${r.invite}` : null,
    ].filter(Boolean);
    await interaction.editReply({ content: lines.join('\n').slice(0, 1900) });
    return true;
  }

  return { handleInteraction, setup, inviteUrl };
}

module.exports = { createHubHq, bannerSvg, banner, hqPosts, tagIds, postChannelKey, CATEGORIES, TEAM_ROLE };
