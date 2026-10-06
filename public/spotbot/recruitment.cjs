// Recruitment: a free agent pool shared by every server GafferBot is in, and manager reach-outs.
// Players opt in with /fa. Managers search it with /recruit search and press Reach Out; the bot
// DMs the player, who decides. Nobody sees a player's Discord name until they say yes, and a
// player can stop all contact with one button.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const { resolveClub } = require('./manager-hub.cjs');
const { missingChannelPerms } = require('./perm-check.cjs');

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
// Nearby positions count as a partial match when searching
const RELATED = {
  GK: [],
  CB: ['CDM', 'LB', 'RB'],
  LB: ['LWB', 'CB', 'LM'],
  RB: ['RWB', 'CB', 'RM'],
  LWB: ['LB', 'LM'],
  RWB: ['RB', 'RM'],
  CDM: ['CM', 'CB'],
  CM: ['CDM', 'CAM'],
  CAM: ['CM', 'CF'],
  LM: ['LW', 'LWB'],
  RM: ['RW', 'RWB'],
  LW: ['LM', 'ST'],
  RW: ['RM', 'ST'],
  CF: ['ST', 'CAM'],
  ST: ['CF', 'LW', 'RW'],
};
const TIMEZONES = {
  PST: { label: 'Pacific (PST/PT)', offset: -8 },
  MST: { label: 'Mountain (MST/MT)', offset: -7 },
  CST: { label: 'Central (CST/CT)', offset: -6 },
  EST: { label: 'Eastern (EST/ET)', offset: -5 },
  BRT: { label: 'South America (BRT)', offset: -3 },
  GMT: { label: 'UK & Ireland (GMT)', offset: 0 },
  CET: { label: 'Central Europe (CET)', offset: 1 },
  EET: { label: 'Eastern Europe (EET)', offset: 2 },
  GST: { label: 'Gulf (GST)', offset: 4 },
  IST: { label: 'India (IST)', offset: 5.5 },
  SGT: { label: 'SE Asia (SGT)', offset: 8 },
  AEST: { label: 'Australia East (AEST)', offset: 10 },
  NZST: { label: 'New Zealand (NZST)', offset: 12 },
};
const PLATFORMS = { ps5: 'PlayStation', 'xbox-series-xs': 'Xbox', pc: 'PC', switch: 'Switch' };
const STATUS = {
  looking: { label: 'Looking for a club', emoji: '🟢' },
  open: { label: 'Open to offers', emoji: '🟡' },
  off: { label: 'Remove my listing', emoji: '⚪' },
};

const LISTING_DAYS = 30;
const RECONTACT_DAYS = 7;
const MAX_CONTACTS_PER_DAY = 15;
const INVITE_DAYS = 7;
const SETTINGS_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const positionChoices = POSITIONS.map((p) => ({ name: p, value: p }));
const timezoneChoices = Object.entries(TIMEZONES).map(([value, t]) => ({ name: t.label, value }));
const platformChoices = Object.entries(PLATFORMS).map(([value, name]) => ({ name, value }));

const RECRUIT_COMMANDS = [
  {
    name: 'fa',
    description: 'List yourself as a free agent so managers in any GafferBot server can find you.',
    options: [
      {
        name: 'status',
        description: 'Are you looking for a club?',
        type: 3,
        required: true,
        choices: Object.entries(STATUS).map(([value, s]) => ({ name: s.label, value })),
      },
      { name: 'position', description: 'Your main position.', type: 3, required: false, choices: positionChoices },
      { name: 'secondary', description: 'A second position you can cover.', type: 3, required: false, choices: positionChoices },
      { name: 'timezone', description: 'When you play from.', type: 3, required: false, choices: timezoneChoices },
      { name: 'platform', description: 'Your platform.', type: 3, required: false, choices: platformChoices },
      { name: 'notes', description: 'e.g. "Comp experience, free Sun-Thu".', type: 3, required: false, max_length: 200 },
      { name: 'gamertag', description: 'Only if you have not linked your EA account with /me → Link EA.', type: 3, required: false, max_length: 32 },
    ],
  },
  {
    name: 'recruit',
    description: 'Find free agents and set up recruitment for your club.',
    options: [
      {
        type: 1,
        name: 'search',
        description: 'Search the free agent pool across every GafferBot server.',
        options: [
          { name: 'position', description: 'Position you need.', type: 3, required: true, choices: positionChoices },
          { name: 'min_rating', description: 'Lowest average match rating, e.g. 7.5.', type: 10, required: false, min_value: 0, max_value: 10 },
          { name: 'timezone', description: 'Their timezone (an hour either side counts).', type: 3, required: false, choices: timezoneChoices },
          { name: 'platform', description: 'Their platform.', type: 3, required: false, choices: platformChoices },
        ],
      },
      {
        type: 1,
        name: 'setup',
        description: 'Where scouting alerts and reach-out replies go, and alert thresholds.',
        options: [
          { name: 'channel', description: 'Channel for scouting alerts and replies.', type: 7, required: false, channel_types: [ChannelType.GuildText] },
          { name: 'invite_channel', description: 'Channel that invites sent to players open on.', type: 7, required: false, channel_types: [ChannelType.GuildText] },
          { name: 'alerts', description: 'Post standout-opponent alerts after synced matches.', type: 5, required: false },
          { name: 'min_rating', description: 'Opponent match rating that triggers an alert (default 8.0).', type: 10, required: false, min_value: 6, max_value: 10 },
          { name: 'trialist_role', description: 'Role given to players who /me → Apply to Trial (removed on promote or release).', type: 8, required: false },
        ],
      },
      {
        type: 1,
        name: 'post',
        description: 'Post a recruitment poster: crest, record, match nights, open positions and an invite.',
        options: [
          { name: 'positions', description: 'e.g. "CB, GK" (defaults to the gaps in your squad).', type: 3, required: false, max_length: 100 },
          { name: 'notes', description: 'e.g. "Comp club, VFL Div 2, 3 nights a week".', type: 3, required: false, max_length: 300 },
          { name: 'channel', description: 'Where to post it (defaults to here).', type: 7, required: false, channel_types: [ChannelType.GuildText] },
        ],
      },
      {
        type: 1,
        name: 'gaps',
        description: 'Positional gap radar: positions your squad is thin at, weighted by reliability.',
      },
      {
        type: 1,
        name: 'applypanel',
        description: 'Post an "Apply to trial" button (e.g. in #welcome) that runs /me → Apply to Trial.',
        options: [{ name: 'channel', description: 'Where to post it (defaults to here).', type: 7, required: false, channel_types: [ChannelType.GuildText] }],
      },
    ],
  },
];

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isServerAdmin(member) {
  try {
    return !!member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild);
  } catch {
    return false;
  }
}

function fmtRating(n) {
  return Number.isFinite(n) && n > 0 ? n.toFixed(1) : '–';
}

// The tables come from a migration; until it runs, say so instead of failing quietly
function tablesMissing(error) {
  return !!error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || ''));
}
const NOT_READY = '❌ Recruitment is not switched on for this bot yet (its database tables are missing). Ask the bot owner to apply the recruitment migration.';

function createRecruitment(deps) {
  const { supabase, getGuildState, isManager } = deps;
  const canManageClub = deps.canManageClub || (async (member) => isManager(member));
  const listedHooks = [];
  const settingsCache = new Map();
  let client = null;

  // ---------- Settings ----------

  async function getSettings(guildId) {
    const cached = settingsCache.get(guildId);
    if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) return cached.value;
    const { data } = await supabase.from('recruit_settings').select('*').eq('guild_id', guildId).maybeSingle();
    const value = data || { guild_id: guildId, channel_id: null, invite_channel_id: null, alerts_enabled: true, alert_min_rating: 8.0, trialist_role_id: null };
    settingsCache.set(guildId, { at: Date.now(), value });
    return value;
  }

  async function canRecruit(member, club) {
    if (isServerAdmin(member)) return true;
    if (club && (await canManageClub(member, club))) return true;
    return isManager(member);
  }

  // Post to the server's recruitment channel; with none set (or no access), DM the fallback user
  async function postToGuild(guildId, payload, fallbackUserId) {
    if (!client) return false;
    const settings = await getSettings(guildId);
    const guild = client.guilds.cache.get(guildId);
    if (guild && settings.channel_id) {
      const channel = guild.channels.cache.get(settings.channel_id) || (await guild.channels.fetch(settings.channel_id).catch(() => null));
      if (channel && !missingChannelPerms(channel, guild.members.me).length) {
        const sent = await channel.send({ allowedMentions: { parse: [] }, ...payload }).catch(() => null);
        if (sent) return true;
      }
    }
    if (!fallbackUserId) return false;
    const user = await client.users.fetch(fallbackUserId).catch(() => null);
    const sent = user ? await user.send(payload).catch(() => null) : null;
    return !!sent;
  }

  // ---------- Stats ----------

  // GafferBot stats across every server the player has played in, weighted by games
  async function statsFor(discordIds) {
    const result = new Map();
    const ids = [...new Set(discordIds.filter(Boolean))];
    if (!ids.length) return result;
    const { data } = await supabase
      .from('player_summary')
      .select('discord_user_id, games_played, avg_match_rating, goals, assists, passes_made, pass_attempts, tackles, clean_sheets, man_of_match, primary_position')
      .in('discord_user_id', ids);
    for (const row of data || []) {
      const games = row.games_played || 0;
      if (!games) continue;
      const s = result.get(row.discord_user_id) || { games: 0, ratingSum: 0, ratedGames: 0, goals: 0, assists: 0, passesMade: 0, passAttempts: 0, tackles: 0, cleanSheets: 0, motm: 0 };
      s.games += games;
      if (row.avg_match_rating > 0) {
        s.ratingSum += row.avg_match_rating * games;
        s.ratedGames += games;
      }
      s.goals += row.goals || 0;
      s.assists += row.assists || 0;
      s.passesMade += row.passes_made || 0;
      s.passAttempts += row.pass_attempts || 0;
      s.tackles += row.tackles || 0;
      s.cleanSheets += row.clean_sheets || 0;
      s.motm += row.man_of_match || 0;
      result.set(row.discord_user_id, s);
    }
    for (const s of result.values()) {
      s.rating = s.ratedGames ? s.ratingSum / s.ratedGames : null;
      s.passPct = s.passAttempts ? (100 * s.passesMade) / s.passAttempts : null;
    }
    return result;
  }

  function statsLine(s) {
    if (!s) return 'No GafferBot match stats yet';
    const parts = [`⭐ ${fmtRating(s.rating)} avg`, `${s.games} games`, `${s.goals}G ${s.assists}A`];
    if (s.passPct != null) parts.push(`${Math.round(s.passPct)}% passing`);
    if (s.tackles) parts.push(`${(s.tackles / s.games).toFixed(1)} tackles/game`);
    return parts.join(' · ');
  }

  // ---------- Listings ----------

  function isListed(fa) {
    return !!fa && fa.status !== 'off' && !fa.no_contact && Date.now() - new Date(fa.updated_at).getTime() < LISTING_DAYS * DAY_MS;
  }

  async function loadListing(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return null;
    const { data } = await supabase.from('free_agents').select('*').eq('id', id).maybeSingle();
    return data;
  }

  // Listings matching a gamertag or Discord user, for watchlist and scouting checks
  async function findListings({ eaKeys = [], discordIds = [] }) {
    const rows = [];
    const keys = [...new Set(eaKeys.filter(Boolean).map((k) => k.toLowerCase()))];
    if (keys.length) {
      // lower(ea_username) is indexed; ilike on each name keeps gamertags with odd characters safe
      for (const key of keys.slice(0, 40)) {
        const { data } = await supabase.from('free_agents').select('*').ilike('ea_username', key.replace(/[\\%_]/g, (c) => `\\${c}`));
        rows.push(...(data || []));
      }
    }
    const ids = [...new Set(discordIds.filter(Boolean))];
    if (ids.length) {
      const { data } = await supabase.from('free_agents').select('*').in('discord_user_id', ids);
      rows.push(...(data || []));
    }
    const unique = new Map(rows.map((r) => [r.id, r]));
    return [...unique.values()].filter(isListed);
  }

  function positionsText(fa) {
    return [fa.position, fa.secondary_position].filter(Boolean).join('/');
  }

  function nameText(fa) {
    if (!fa.ea_username) return 'Unnamed player';
    return `\`${fa.ea_username}\`${fa.ea_verified ? ' ✅' : ' (unverified)'}`;
  }

  function listingEmbed(fa, stats) {
    const s = STATUS[fa.status] || STATUS.looking;
    const embed = new EmbedBuilder()
      .setTitle(`${s.emoji} Free agent: ${positionsText(fa)}`)
      .setColor(fa.status === 'looking' ? 0x57f287 : 0xfee75c)
      .setDescription(`${nameText(fa)}\n${statsLine(stats)}`)
      .addFields(
        { name: 'Status', value: s.label, inline: true },
        { name: 'Timezone', value: TIMEZONES[fa.timezone]?.label || 'Not set', inline: true },
        { name: 'Platform', value: PLATFORMS[fa.platform] || 'Not set', inline: true }
      )
      .setFooter({ text: `Listed ${new Date(fa.updated_at).toISOString().slice(0, 10)} · ✅ = gamertag linked with /me → Link EA` });
    if (fa.notes) embed.addFields({ name: 'Notes', value: truncate(fa.notes, 300) });
    return embed;
  }

  async function handleFa(interaction) {
    const userId = interaction.user.id;
    const status = interaction.options.getString('status');
    await interaction.deferReply({ flags: 64 });

    const { data: existing, error: loadError } = await supabase.from('free_agents').select('*').eq('discord_user_id', userId).maybeSingle();
    if (tablesMissing(loadError)) return interaction.editReply({ content: NOT_READY });

    if (status === 'off') {
      if (!existing || existing.status === 'off') return interaction.editReply({ content: "You aren't listed as a free agent." });
      await supabase.from('free_agents').update({ status: 'off', updated_at: new Date().toISOString() }).eq('id', existing.id);
      return interaction.editReply({ content: '⚪ Your free agent listing is down. Managers can no longer find or contact you through GafferBot.' });
    }

    const position = interaction.options.getString('position') || existing?.position;
    if (!position) return interaction.editReply({ content: '❌ Pick your main `position` so managers can find you.' });
    let secondary = interaction.options.getString('secondary') ?? existing?.secondary_position ?? null;
    if (secondary === position) secondary = null;

    const { data: profile } = await supabase.from('profiles').select('ea_username, ea_platform').eq('discord_user_id', userId).maybeSingle();
    const typed = interaction.options.getString('gamertag')?.trim() || null;
    const linked = profile?.ea_username || null;
    const gamertag = typed || linked || existing?.ea_username || null;
    const verified = !!linked && !!gamertag && linked.toLowerCase() === gamertag.toLowerCase();

    const row = {
      discord_user_id: userId,
      status,
      position,
      secondary_position: secondary,
      timezone: interaction.options.getString('timezone') ?? existing?.timezone ?? null,
      platform: interaction.options.getString('platform') ?? existing?.platform ?? (PLATFORMS[profile?.ea_platform] ? profile.ea_platform : null),
      ea_username: gamertag,
      ea_verified: verified,
      notes: interaction.options.getString('notes') ?? existing?.notes ?? null,
      home_guild_id: interaction.guildId || existing?.home_guild_id || null,
      no_contact: false,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await supabase.from('free_agents').upsert(row, { onConflict: 'discord_user_id' }).select('*').single();
    if (error) return interaction.editReply({ content: tablesMissing(error) ? NOT_READY : `❌ ${error.message}` });

    const stats = (await statsFor([userId])).get(userId);
    const wasListed = isListed(existing);
    await interaction.editReply({
      content:
        `${wasListed ? '✅ Listing updated.' : '✅ You\'re listed as a free agent.'} This is what managers see in **/manager → Recruiting → Search Free Agents**.\n` +
        "They can't see your Discord name. If one reaches out I'll DM you and you decide whether to share it and get an invite.\n" +
        `Your listing stays up for ${LISTING_DAYS} days; press **/me → Free Agent** again to refresh it, or pick "Remove my listing" there to take it down.` +
        (verified ? '' : '\n_Tip: link your EA account with **/me → Link EA** so your stats show and your gamertag gets a ✅._'),
      embeds: [listingEmbed(saved, stats)],
    });

    // Watchlists that include this player hear about it (only on a fresh listing)
    if (!wasListed) {
      for (const fn of listedHooks) {
        try {
          await fn(saved);
        } catch (err) {
          console.error('[Recruit] listed hook failed:', err.message);
        }
      }
    }
  }

  // ---------- /recruit search ----------

  async function guildRosterIds(guildId) {
    const { data: teams } = await supabase.from('teams').select('id').eq('guild_id', guildId);
    const teamIds = (teams || []).map((t) => t.id);
    if (!teamIds.length) return new Set();
    const { data } = await supabase.from('team_rosters').select('discord_user_id').in('team_id', teamIds);
    return new Set((data || []).map((r) => r.discord_user_id));
  }

  // Search filters come from /recruit search, or from another button (e.g. the gap radar)
  async function handleSearch(interaction, club, params) {
    const opt = interaction.options;
    const { position, minRating, tz, platform } = params || {
      position: opt.getString('position'),
      minRating: opt.getNumber('min_rating'),
      tz: opt.getString('timezone'),
      platform: opt.getString('platform'),
    };
    await interaction.deferReply({ flags: 64 });

    const since = new Date(Date.now() - LISTING_DAYS * DAY_MS).toISOString();
    const wanted = [position, ...(RELATED[position] || [])];
    const { data, error } = await supabase
      .from('free_agents')
      .select('*')
      .neq('status', 'off')
      .eq('no_contact', false)
      .gte('updated_at', since)
      .or(`position.in.(${wanted.join(',')}),secondary_position.in.(${wanted.join(',')})`)
      .limit(200);
    if (error) return interaction.editReply({ content: tablesMissing(error) ? NOT_READY : `❌ ${error.message}` });

    const ours = await guildRosterIds(interaction.guildId);
    let pool = (data || []).filter((fa) => fa.discord_user_id !== interaction.user.id && !ours.has(fa.discord_user_id));
    if (platform) pool = pool.filter((fa) => !fa.platform || fa.platform === platform);
    if (tz && TIMEZONES[tz]) {
      const target = TIMEZONES[tz].offset;
      pool = pool.filter((fa) => TIMEZONES[fa.timezone] && Math.abs(TIMEZONES[fa.timezone].offset - target) <= 1);
    }
    const stats = await statsFor(pool.map((fa) => fa.discord_user_id));
    let unrated = 0;
    if (minRating != null) {
      pool = pool.filter((fa) => {
        const s = stats.get(fa.discord_user_id);
        if (!s?.rating) unrated++;
        return s?.rating && s.rating >= minRating;
      });
    }

    const fit = (fa) => (fa.position === position ? 3 : fa.secondary_position === position ? 2 : 1);
    pool.sort(
      (a, b) =>
        fit(b) - fit(a) ||
        (b.status === 'looking') - (a.status === 'looking') ||
        (stats.get(b.discord_user_id)?.rating || 0) - (stats.get(a.discord_user_id)?.rating || 0) ||
        new Date(b.updated_at) - new Date(a.updated_at)
    );
    const top = pool.slice(0, 10);

    const filters = [position, minRating != null ? `rating ${minRating}+` : null, tz ? TIMEZONES[tz]?.label : null, platform ? PLATFORMS[platform] : null].filter(Boolean);
    const embed = new EmbedBuilder().setTitle(`🔍 Free agents: ${filters.join(' · ')}`).setColor(0x5865f2);
    if (!top.length) {
      embed.setDescription(
        'Nobody matches right now.' +
          (unrated ? ` ${unrated} more ${unrated === 1 ? 'player has' : 'players have'} no GafferBot stats yet, so the rating filter hides them.` : '') +
          '\nPlayers list themselves with **/me → Free Agent**; share it in your server or league Discord to grow the pool.'
      );
      return interaction.editReply({ embeds: [embed] });
    }
    embed.setDescription(
      top
        .map((fa, i) => {
          const s = STATUS[fa.status];
          const tzText = TIMEZONES[fa.timezone] ? ` · ${fa.timezone}` : '';
          const fitText = fa.position === position ? '' : fa.secondary_position === position ? ' (2nd position)' : ' (nearby position)';
          return (
            `**${i + 1}. ${positionsText(fa)}**${fitText} ${s.emoji} ${nameText(fa)}${tzText}\n` +
            `${statsLine(stats.get(fa.discord_user_id))}` +
            (fa.notes ? `\n> ${truncate(fa.notes.replace(/\n/g, ' '), 150)}` : '')
          );
        })
        .join('\n\n')
    );
    embed.setFooter({
      text:
        `${pool.length} match${pool.length === 1 ? '' : 'es'}${pool.length > top.length ? `, best ${top.length} shown` : ''}` +
        `${unrated ? ` · ${unrated} hidden with no stats` : ''} · Reach Out sends them a DM from GafferBot`,
    });
    const select = new StringSelectMenuBuilder()
      .setCustomId(`rx_pick:${club?.key || ''}`)
      .setPlaceholder('Reach out to…')
      .addOptions(
        top.map((fa, i) => ({
          label: `${i + 1}. ${positionsText(fa)} · ${fa.ea_username || 'Player'}`.slice(0, 100),
          description: statsLine(stats.get(fa.discord_user_id)).slice(0, 100),
          value: fa.id,
        }))
      );
    return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
  }

  // ---------- /recruit setup ----------

  async function handleSetup(interaction, club) {
    if (!(await canRecruit(interaction.member, club))) {
      return interaction.reply({ content: "❌ Only server admins or the club's leaders can change recruitment settings.", flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    const current = await getSettings(interaction.guildId);
    const channel = interaction.options.getChannel('channel');
    const inviteChannel = interaction.options.getChannel('invite_channel');
    const alerts = interaction.options.getBoolean('alerts');
    const minRating = interaction.options.getNumber('min_rating');
    const trialistRole = interaction.options.getRole('trialist_role');
    const me = interaction.guild.members.me;
    if (trialistRole && (trialistRole.managed || !me.permissions.has(PermissionsBitField.Flags.ManageRoles) || trialistRole.position >= me.roles.highest.position)) {
      return interaction.editReply({ content: `❌ I can't hand out ${trialistRole}. I need **Manage Roles**, and my role must be above it in the role list.` });
    }
    if (channel) {
      const missing = missingChannelPerms(channel, me);
      if (missing.length) return interaction.editReply({ content: `❌ I can't post in ${channel}. I'm missing **${missing.join('**, **')}** there.` });
    }
    if (inviteChannel && !inviteChannel.permissionsFor(me)?.has(PermissionsBitField.Flags.CreateInstantInvite)) {
      return interaction.editReply({ content: `❌ I need **Create Invite** in ${inviteChannel} to send players invites.` });
    }
    const row = {
      guild_id: interaction.guildId,
      channel_id: channel?.id ?? current.channel_id ?? null,
      invite_channel_id: inviteChannel?.id ?? current.invite_channel_id ?? null,
      alerts_enabled: alerts ?? current.alerts_enabled ?? true,
      alert_min_rating: minRating ?? current.alert_min_rating ?? 8.0,
      updated_at: new Date().toISOString(),
    };
    if (trialistRole) row.trialist_role_id = trialistRole.id;
    const { error } = await supabase.from('recruit_settings').upsert(row, { onConflict: 'guild_id' });
    if (error) return interaction.editReply({ content: tablesMissing(error) ? NOT_READY : `❌ ${error.message}` });
    settingsCache.delete(interaction.guildId);
    const lines = [
      `📣 Alerts and replies: ${row.channel_id ? `<#${row.channel_id}>` : 'not set (replies are DMed to the manager; standout alerts need a channel)'}`,
      `🔎 Standout-opponent alerts: ${row.alerts_enabled ? `on, for match ratings of ${Number(row.alert_min_rating).toFixed(1)}+, 90%+ passing or 5+ tackles` : 'off'}`,
      `✉️ Player invites open on: ${row.invite_channel_id ? `<#${row.invite_channel_id}>` : 'the server\'s system channel (or the first channel I can invite to)'}`,
      `🧪 Trialist role: ${trialistRole ? `${trialistRole}` : current.trialist_role_id ? `<@&${current.trialist_role_id}>` : 'not set (players who /me → Apply to Trial are added to the roster as Trial)'}`,
    ];
    return interaction.editReply({ content: `✅ Recruitment settings saved.\n${lines.join('\n')}` });
  }

  // ---------- Reach Out ----------

  async function contactBlocked(guildId, playerId) {
    const since = new Date(Date.now() - RECONTACT_DAYS * DAY_MS).toISOString();
    const { data: recent } = await supabase
      .from('recruit_contacts')
      .select('created_at, status')
      .eq('guild_id', guildId)
      .eq('player_discord_id', playerId)
      .neq('status', 'failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    if (recent?.length) {
      const until = Math.floor((new Date(recent[0].created_at).getTime() + RECONTACT_DAYS * DAY_MS) / 1000);
      return `Someone from this server already contacted this player recently. You can reach out again <t:${until}:R>.`;
    }
    const { count } = await supabase
      .from('recruit_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .gte('created_at', new Date(Date.now() - DAY_MS).toISOString());
    if ((count || 0) >= MAX_CONTACTS_PER_DAY) return `This server has sent ${MAX_CONTACTS_PER_DAY} reach-outs in the last day. Try again tomorrow.`;
    return null;
  }

  // Shared by the search menu, scouting alerts and the watchlist: checks, then the message modal
  async function openReachOut(interaction, faId, clubKey) {
    if (!interaction.guildId) return interaction.reply({ content: '❌ Reach out from your club\'s server.', flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member, clubKey || undefined);
    if (!(await canRecruit(interaction.member, club))) {
      return interaction.reply({ content: '❌ Only managers can reach out to free agents.', flags: 64 });
    }
    const fa = await loadListing(faId);
    if (!isListed(fa)) return interaction.reply({ content: 'That player is no longer listed as a free agent.', flags: 64 });
    if (fa.discord_user_id === interaction.user.id) return interaction.reply({ content: "That's your own listing.", flags: 64 });
    const blocked = await contactBlocked(interaction.guildId, fa.discord_user_id);
    if (blocked) return interaction.reply({ content: `⏳ ${blocked}`, flags: 64 });

    const modal = new ModalBuilder()
      .setCustomId(`rx_msg:${fa.id}:${club?.key || ''}`)
      .setTitle(`Reach out: ${positionsText(fa)} ${fa.ea_username || ''}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Message to the player (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(400)
            .setPlaceholder('e.g. We play Sun/Tue/Thu 9pm ET and need a starting CDM. Come trial Thursday?')
        )
      );
    return interaction.showModal(modal);
  }

  async function clubRecord(guildId, club) {
    if (!club) return null;
    const { data } = await supabase.from('club_stats').select('*').eq('guild_id', guildId).eq('club_key', club.key).maybeSingle();
    if (!data) return null;
    const bits = [];
    if (data.wins != null) bits.push(`${data.wins}W ${data.draws ?? 0}D ${data.losses ?? 0}L`);
    const division = data.current_division ?? data.division;
    if (division) bits.push(`Division ${division}`);
    return bits.join(' · ') || null;
  }

  async function sendReachOut(interaction, faId, clubKey) {
    await interaction.deferReply({ flags: 64 });
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member, clubKey || undefined);
    if (!(await canRecruit(interaction.member, club))) return interaction.editReply({ content: '❌ Only managers can reach out to free agents.' });
    const fa = await loadListing(faId);
    if (!isListed(fa)) return interaction.editReply({ content: 'That player is no longer listed as a free agent.' });
    const blocked = await contactBlocked(interaction.guildId, fa.discord_user_id);
    if (blocked) return interaction.editReply({ content: `⏳ ${blocked}` });

    const message = interaction.fields.getTextInputValue('message')?.trim() || null;
    const clubName = club?.name || interaction.guild.name;
    const { data: contact, error } = await supabase
      .from('recruit_contacts')
      .insert({
        guild_id: interaction.guildId,
        club_key: club?.key || null,
        club_name: clubName,
        manager_discord_id: interaction.user.id,
        player_discord_id: fa.discord_user_id,
        free_agent_id: fa.id,
        position: fa.position,
        message,
        status: 'sent',
      })
      .select('id')
      .single();
    if (error) return interaction.editReply({ content: tablesMissing(error) ? NOT_READY : `❌ ${error.message}` });

    const record = await clubRecord(interaction.guildId, club);
    const embed = new EmbedBuilder()
      .setTitle(`📨 ${clubName} wants to talk to you`)
      .setColor(0x5865f2)
      .setDescription(
        `A manager from **${clubName}** (server **${interaction.guild.name}**) saw your free agent listing (${positionsText(fa)}) and would like to talk.\n\n` +
          (message ? `> ${message.replace(/\n/g, '\n> ')}\n\n` : '') +
          "**Interested** sends you an invite to their server and shares your Discord name with them. **Not right now** tells them no, without sharing anything."
      )
      .setFooter({ text: 'You got this because you listed yourself with /me → Free Agent. "Stop all contact" takes your listing down.' });
    if (record) embed.addFields({ name: 'Club', value: record, inline: true });
    if (interaction.guild.iconURL()) embed.setThumbnail(interaction.guild.iconURL());
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rx_yes:${contact.id}`).setLabel('Interested').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rx_no:${contact.id}`).setLabel('Not right now').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rx_stop:${contact.id}`).setLabel('Stop all contact').setStyle(ButtonStyle.Danger)
    );

    const user = await interaction.client.users.fetch(fa.discord_user_id).catch(() => null);
    const sent = user ? await user.send({ embeds: [embed], components: [row] }).catch(() => null) : null;
    if (!sent) {
      await supabase.from('recruit_contacts').update({ status: 'failed' }).eq('id', contact.id);
      return interaction.editReply({ content: `❌ I couldn't DM the ${fa.position} free agent (their DMs are closed). Nothing was shared.` });
    }
    return interaction.editReply({
      content: `✅ Sent. I DMed the ${positionsText(fa)} free agent (${fa.ea_username || 'no gamertag'}). If they're interested they get an invite and you get their name${(await getSettings(interaction.guildId)).channel_id ? ' in the recruitment channel' : ' by DM'}.`,
    });
  }

  // A single-use invite for one player by default; the recruitment poster asks for a reusable one
  async function inviteFor(guild, opts = {}) {
    const settings = await getSettings(guild.id);
    const me = guild.members.me;
    const can = (ch) => ch && ch.type === ChannelType.GuildText && ch.permissionsFor(me)?.has(PermissionsBitField.Flags.CreateInstantInvite);
    const candidates = [
      settings.invite_channel_id && (guild.channels.cache.get(settings.invite_channel_id) || (await guild.channels.fetch(settings.invite_channel_id).catch(() => null))),
      guild.systemChannel,
      guild.rulesChannel,
      ...guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).sort((a, b) => a.rawPosition - b.rawPosition).values(),
    ];
    const channel = candidates.find(can);
    if (!channel) return null;
    const invite = await channel
      .createInvite({ maxAge: INVITE_DAYS * 24 * 60 * 60, maxUses: 1, unique: true, reason: 'GafferBot recruitment: free agent accepted a reach-out', ...opts })
      .catch(() => null);
    return invite?.url || null;
  }

  async function handlePlayerAnswer(interaction, action, contactId) {
    if (!/^[0-9a-f-]{36}$/i.test(contactId || '')) return interaction.reply({ content: 'This request has expired.', flags: 64 });
    const { data: contact } = await supabase.from('recruit_contacts').select('*').eq('id', contactId).maybeSingle();
    if (!contact || contact.player_discord_id !== interaction.user.id) return interaction.reply({ content: 'This request has expired.', flags: 64 });
    if (contact.status !== 'sent') return interaction.reply({ content: `You already answered this one (${contact.status}).`, flags: 64 });

    const done = (label) => [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rx_done').setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(true)),
    ];
    const now = new Date().toISOString();
    const guild = interaction.client.guilds.cache.get(contact.guild_id);

    if (action === 'stop' || action === 'no') {
      await supabase.from('recruit_contacts').update({ status: 'declined', responded_at: now }).eq('id', contact.id);
      if (action === 'stop') {
        await supabase.from('free_agents').update({ status: 'off', no_contact: true, updated_at: now }).eq('discord_user_id', interaction.user.id);
      }
      await interaction.update({ components: done(action === 'stop' ? 'Stopped: listing removed' : 'Not right now') });
      if (action === 'stop') {
        await interaction.followUp({ content: '⚪ Done. Your free agent listing is down and no club can contact you through GafferBot. Run **/me → Free Agent** any time to list again.' }).catch(() => {});
      }
      const { data: fa } = await supabase.from('free_agents').select('position, ea_username').eq('id', contact.free_agent_id || '00000000-0000-0000-0000-000000000000').maybeSingle();
      await postToGuild(
        contact.guild_id,
        {
          allowedMentions: { users: [contact.manager_discord_id] },
          content: `📭 <@${contact.manager_discord_id}>: the ${fa?.position || contact.position || ''} free agent${fa?.ea_username ? ` \`${fa.ea_username}\`` : ''} passed on ${contact.club_name || 'your club'} for now.`,
        },
        contact.manager_discord_id
      );
      return;
    }

    // Interested: invite them (unless they are already in the server) and introduce them
    const alreadyIn = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    const inviteUrl = guild && !alreadyIn ? await inviteFor(guild) : null;
    await supabase.from('recruit_contacts').update({ status: 'accepted', responded_at: now, invite_url: inviteUrl }).eq('id', contact.id);
    await interaction.update({ components: done('Interested') });
    const toPlayer = alreadyIn
      ? `✅ Great. You're already in **${guild.name}**; I've told ${contact.club_name || 'the club'}'s manager, <@${contact.manager_discord_id}>, to get in touch.`
      : inviteUrl
        ? `✅ Great. Here's your invite to **${guild?.name || contact.club_name}** (works once, for ${INVITE_DAYS} days): ${inviteUrl}\nI've let the manager, <@${contact.manager_discord_id}>, know you're coming.`
        : `✅ Great. I couldn't create an invite to that server, so I've passed your Discord name to the manager, <@${contact.manager_discord_id}>, to send you one.`;
    await interaction.followUp({ content: toPlayer }).catch(() => {});

    const { data: fa } = await supabase.from('free_agents').select('position, secondary_position, ea_username').eq('discord_user_id', interaction.user.id).maybeSingle();
    await postToGuild(
      contact.guild_id,
      {
        allowedMentions: { users: [contact.manager_discord_id] },
        content:
          `🤝 <@${contact.manager_discord_id}>: the ${fa ? positionsText(fa) : contact.position || ''} free agent${fa?.ea_username ? ` \`${fa.ea_username}\`` : ''} is interested in ${contact.club_name || 'your club'}! ` +
          `They're <@${interaction.user.id}> (${interaction.user.username}). ` +
          (alreadyIn ? "They're already in this server." : inviteUrl ? "I've sent them an invite." : "I couldn't make an invite (I need Create Invite), so send them one."),
      },
      contact.manager_discord_id
    );
  }

  // ---------- Routing ----------

  async function handleCommand(interaction) {
    if (interaction.commandName === 'fa') {
      await handleFa(interaction);
      return true;
    }
    if (interaction.commandName !== 'recruit') return false;
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ Use **/manager → Recruiting** in your club\'s server.', flags: 64 });
      return true;
    }
    const sub = interaction.options.getSubcommand();
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member);
    if (subcommandHandlers[sub]) {
      await subcommandHandlers[sub](interaction, club, state);
      return true;
    }
    if (sub === 'setup') {
      await handleSetup(interaction, club);
      return true;
    }
    if (!(await canRecruit(interaction.member, club))) {
      await interaction.reply({ content: '❌ Only managers can search the free agent pool.', flags: 64 });
      return true;
    }
    if (sub === 'search') await handleSearch(interaction, club);
    return true;
  }

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'fa' && interaction.commandName !== 'recruit') return false;
      return handleCommand(interaction);
    }
    const id = interaction.customId || '';
    if (!id.startsWith('rx_')) return false;
    const [action, a, b] = id.split(':');
    if (interaction.isStringSelectMenu() && action === 'rx_pick') await openReachOut(interaction, interaction.values[0], a);
    else if (interaction.isButton() && action === 'rx_reach') await openReachOut(interaction, a, b);
    else if (interaction.isModalSubmit() && action === 'rx_msg') await sendReachOut(interaction, a, b);
    else if (interaction.isButton() && (action === 'rx_yes' || action === 'rx_no' || action === 'rx_stop')) await handlePlayerAnswer(interaction, action.slice(3), a);
    else if (componentHandlers[action]) await componentHandlers[action](interaction, a, b);
    else return false;
    return true;
  }

  // Other recruitment modules add /recruit subcommands and rx_ components here
  const subcommandHandlers = {};
  const componentHandlers = {};

  function start(discordClient) {
    client = discordClient;
  }

  return {
    commands: RECRUIT_COMMANDS,
    handleInteraction,
    start,
    getSettings,
    canRecruit,
    search: handleSearch,
    postToGuild,
    inviteFor,
    statsFor,
    statsLine,
    findListings,
    isListed,
    listingEmbed,
    positionsText,
    tablesMissing,
    NOT_READY,
    onListed: (fn) => listedHooks.push(fn),
    addSubcommand: (name, fn) => {
      subcommandHandlers[name] = fn;
    },
    addComponent: (action, fn) => {
      componentHandlers[action] = fn;
    },
  };
}

module.exports = { createRecruitment, RECRUIT_COMMANDS, POSITIONS, TIMEZONES, PLATFORMS };
