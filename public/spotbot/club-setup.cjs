// /setup: a first-run checklist that says what to run next and diagnoses the permissions that
// stop the bot posting or creating events. /brand: per-server colours, footer, lineup title, logo,
// and the bot's nickname and avatar in this server.

const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { missingChannelPerms } = require('./perm-check.cjs');
const { activeClubs } = require('./manager-hub.cjs');
const { parseCrestHistory } = require('./club-logos.cjs');

const F = PermissionsBitField.Flags;
const SERVER_PERMS = [
  [F.ManageRoles, 'Manage Roles', 'position roles from /manager → Lineups & Spots → Position Roles Panel'],
  [F.MentionEveryone, 'Mention @everyone, @here and All Roles', 'pinging a role that is not mentionable'],
  [F.ChangeNickname, 'Change Nickname', '/manager → Admin → Brand (nickname)'],
];
const POSITION_ROLE_NAMES = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

const SETUP_COMMANDS = [
  {
    name: 'setup',
    description: 'Setup checklist: what to do next, and which permissions the bot is missing.',
    options: [{ name: 'channel', description: 'Also check a specific channel.', type: 7, required: false }],
  },
  {
    name: 'brand',
    description: "Customise the bot's look in this server (colours, lineup title, nickname, avatar).",
    default_member_permissions: String(F.ManageGuild),
    options: [
      { name: 'color', description: 'Accent colour as hex, e.g. #e11d48.', type: 3, required: false },
      { name: 'footer', description: 'Footer text on boards and team sheets.', type: 3, required: false, max_length: 100 },
      { name: 'lineup_title', description: 'Team sheet title, e.g. "{team} Matchday XI".', type: 3, required: false, max_length: 100 },
      { name: 'logo_url', description: 'https link to your crest, shown on team sheets.', type: 3, required: false },
      { name: 'crest_history', description: 'Crest-history page link (e.g. worldsoccerpins.com) — imports every era crest.', type: 3, required: false },
      { name: 'clear_crests', description: 'Remove imported era crests.', type: 5, required: false },
      { name: 'nickname', description: "The bot's name in this server.", type: 3, required: false, max_length: 32 },
      { name: 'avatar', description: "The bot's picture in this server (PNG, JPG or GIF).", type: 11, required: false },
      { name: 'reset', description: 'Go back to the default look.', type: 5, required: false },
    ],
  },
];

function parseColor(text) {
  const m = String(text || '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return parseInt(hex, 16);
}

// Commands a server admin has switched off in Server Settings → Integrations, in plain words.
// Discord stores these as per-command overrides; the guild id stands for @everyone and
// guild id - 1 for "all channels". Overrides on the bot itself apply to every command.
async function commandAccessLines(guild) {
  const app = guild.client.application;
  let overrides;
  try {
    overrides = await app.commands.permissions.fetch({ guild: guild.id });
  } catch (err) {
    return { lines: [], error: err.message };
  }
  const commands = await app.commands.fetch().catch(() => null);
  const allChannels = (BigInt(guild.id) - 1n).toString();
  const lines = [];
  for (const [commandId, perms] of overrides) {
    const label = commandId === app.id ? '**All GafferBot commands**' : commands?.get(commandId) ? `\`/${commands.get(commandId).name}\`` : null;
    if (!label) continue;
    const denied = perms.filter((p) => !p.permission);
    if (!denied.length) continue;
    const where = denied.map((p) => {
      if (p.id === guild.id) return 'everyone';
      if (p.id === allChannels) return 'every channel';
      if (p.type === 1) return `<@&${p.id}>`;
      if (p.type === 2) return `<@${p.id}>`;
      return `<#${p.id}>`;
    });
    const allowed = perms.filter((p) => p.permission).length;
    lines.push(`🚫 ${label} turned off for ${where.join(', ')}${allowed ? ` (allowed for ${allowed} role/channel${allowed === 1 ? '' : 's'})` : ''}`);
  }
  return { lines, error: null };
}

// Commands that need a Discord permission by default, so members without it won't see them
function restrictedByDefault(guild) {
  const names = [];
  for (const cmd of guild.client.application.commands.cache.values()) {
    if (cmd.defaultMemberPermissions && cmd.defaultMemberPermissions.bitfield !== 0n) names.push(`\`/${cmd.name}\``);
  }
  return names;
}

function createClubSetup(deps) {
  const { supabase, getGuildState, events, saveGuildSettings, searchClubCandidates, linkEaClub, clubPickerReply } = deps;

  // ---------- Setup wizard: EA club, colour and kit in one form ----------

  function wizardModal(club, branding) {
    const kit = club?.kit || {};
    const color = Number.isInteger(branding?.color) ? `#${branding.color.toString(16).padStart(6, '0')}` : '';
    const input = (id, label, value, opts = {}) => {
      const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(opts.long ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!opts.required).setMaxLength(opts.max || 100);
      if (opts.placeholder) t.setPlaceholder(opts.placeholder);
      if (value) t.setValue(String(value).slice(0, opts.max || 100));
      return new ActionRowBuilder().addComponents(t);
    };
    return new ModalBuilder().setCustomId('setupw:submit').setTitle('Club setup').addComponents(
      input('ea_name', 'EA club name (exactly as in game)', club?.ea_club_name || '', { placeholder: 'Leave blank to keep the current link' }),
      input('color', 'Club colour (hex)', color, { placeholder: '#e11d48', max: 7 }),
      input('kit_primary', 'Kit main colour', kit.primary, { placeholder: 'sky blue', max: 40 }),
      input('kit_secondary', 'Kit second colour', kit.secondary, { placeholder: 'white', max: 40 }),
      input('kit_description', 'Describe your home kit', kit.description, { long: true, max: 300, placeholder: 'Sky blue shirt with white collar and cuffs, white shorts' })
    );
  }

  function currentClubOf(state) {
    return state?.clubs?.find((c) => c.key === state.currentClubKey) || state?.clubs?.[0] || null;
  }

  async function handleWizard(interaction) {
    if (!interaction.member.permissions.has(F.ManageGuild)) {
      return interaction.reply({ content: '❌ Only server admins can run club setup.', flags: 64 });
    }
    if (interaction.isButton()) {
      const state = await getGuildState(interaction.guildId);
      const prefs = await events.serverPrefs(interaction.guildId);
      return interaction.showModal(wizardModal(currentClubOf(state), prefs.branding));
    }
    // Modal submit
    await interaction.deferReply({ flags: 64 });
    const get = (id) => (interaction.fields.getTextInputValue(id) || '').trim();
    const state = await getGuildState(interaction.guildId);
    const club = currentClubOf(state);
    if (!club) return interaction.editReply({ content: '❌ No club exists on this server yet. Open `/manager` once to create it, then run setup again.' });
    const notes = [];

    const colorText = get('color');
    let color = null;
    if (colorText) {
      color = parseColor(colorText);
      if (color === null) return interaction.editReply({ content: `❌ "${colorText}" isn't a hex colour. Try #e11d48.` });
    }

    const kit = { ...(club.kit || {}) };
    for (const [field, key] of [['kit_primary', 'primary'], ['kit_secondary', 'secondary'], ['kit_description', 'description']]) {
      const v = get(field);
      if (v) kit[key] = v;
    }
    club.kit = kit;
    await saveGuildSettings(interaction.guildId, state);
    if (kit.primary || kit.description) notes.push('👕 Kit saved — graphics will use it.');

    if (color !== null) {
      const { data: row } = await supabase.from('guild_settings').select('branding').eq('guild_id', interaction.guildId).maybeSingle();
      const branding = { ...(row?.branding || {}), color };
      const { error } = await supabase.from('guild_settings').upsert({ guild_id: interaction.guildId, branding }, { onConflict: 'guild_id' });
      if (error) notes.push(`⚠️ Colour not saved: ${error.message}`);
      else {
        events.forgetPrefs(interaction.guildId);
        require('./embed-style.cjs').forget(interaction.guildId);
        notes.push(`🎨 Club colour set to ${colorText}.`);
      }
    }

    const eaName = get('ea_name');
    let picker = null;
    if (eaName && eaName.toLowerCase() !== String(club.ea_club_name || '').toLowerCase()) {
      try {
        const { exact, candidates, failed } = await searchClubCandidates(eaName, null);
        if (exact) {
          await linkEaClub(interaction.guildId, club.key, exact.club, exact.platform);
          notes.push(`🔗 Linked to EA club **${exact.club.name || eaName}** — match history is syncing.`);
        } else if (failed) notes.push("⚠️ EA didn't answer just now. Try the club name again in a minute.");
        else if (candidates.length) picker = clubPickerReply(eaName, candidates, club.key, null);
        else notes.push(`⚠️ EA has no club called **${eaName}**. Check the spelling — EA only lists a club after its first league match.`);
      } catch (err) {
        notes.push(`⚠️ Couldn't search EA: ${err.message}`);
      }
    }

    const fresh = currentClubOf(await getGuildState(interaction.guildId)) || club;
    const embed = new EmbedBuilder()
      .setTitle(`✅ ${fresh.name} is set up`)
      .setColor(color ?? 0x22c55e)
      .addFields(
        { name: 'EA club', value: fresh.ea_club_id ? `${fresh.ea_club_name || fresh.name} (${fresh.ea_club_id})` : 'Not linked yet', inline: true },
        { name: 'Colour', value: colorText || 'Unchanged', inline: true },
        { name: 'Kit', value: [kit.primary, kit.secondary].filter(Boolean).join(' / ') || 'Not set', inline: true },
        { name: 'Kit look', value: (kit.description || '–').slice(0, 1024) }
      )
      .setFooter({ text: 'Run /setup again any time to change these.' });
    await interaction.editReply({ content: notes.join('\n') || null, embeds: [embed] });
    if (picker) await interaction.followUp({ ...picker, flags: 64 });
  }


  // ---------- /setup ----------

  async function handleSetup(interaction) {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild;
    const me = guild.members.me;
    const state = await getGuildState(guild.id);
    const clubs = activeClubs(state);
    const linked = clubs.filter((c) => c.ea_club_id);
    const withSquad = clubs.filter((c) => c.team_id);
    const prefs = await events.serverPrefs(guild.id);

    let rosterSize = 0;
    if (withSquad.length) {
      const { count } = await supabase.from('team_rosters').select('id', { count: 'exact', head: true }).in('team_id', withSquad.map((c) => c.team_id));
      rosterSize = count || 0;
    }
    const { count: eventCount } = await supabase.from('availability_events').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).not('club_key', 'is', null);

    const steps = [
      {
        done: linked.length > 0,
        text: linked.length ? `Club linked to EA: ${linked.map((c) => c.name).join(', ')}` : 'Link your EA club: **/manager → Admin → Link EA Club**',
      },
      {
        done: withSquad.length > 0,
        text: withSquad.length ? 'Squad set up' : 'Name your squad and leaders: **/manager → Roster & Squad → Link Squad** (e.g. First XI), then **Set Captain**',
      },
      {
        done: rosterSize > 0,
        text: rosterSize ? `Roster: ${rosterSize} players` : 'Add players: **/manager → Roster & Squad → Import Role** with your team role (or **Add Player**)',
      },
      {
        done: prefs.timezone !== 'UTC',
        text: prefs.timezone !== 'UTC' ? `Timezone: ${prefs.timezone}` : 'Set your timezone so "9pm" means your 9pm: **/manager → Events → Timezone**',
      },
      {
        done: (eventCount || 0) > 0,
        text: eventCount ? 'Events: running' : 'Post your first event: **/manager → Events → New Event** (e.g. "thu 9pm", League match)',
      },
    ];
    const next = steps.find((s) => !s.done);

    // Permissions: server-wide, then each channel the bot posts in
    const problems = [];
    const serverPerms = me.permissions;
    for (const [flag, name, why] of SERVER_PERMS) {
      if (!serverPerms.has(flag)) problems.push(`⚠️ Missing **${name}** (needed for ${why})`);
    }
    const positionRoles = guild.roles.cache.filter((r) => POSITION_ROLE_NAMES.includes(r.name.toUpperCase()));
    const above = positionRoles.filter((r) => r.position >= me.roles.highest.position);
    if (above.size) {
      problems.push(`⚠️ My role is below ${above.map((r) => `**${r.name}**`).join(', ')}. Drag my role above them in Server Settings → Roles.`);
    }

    const channelIds = new Set([interaction.channelId]);
    const extra = interaction.options.getChannel('channel');
    if (extra) channelIds.add(extra.id);
    const { data: recentEvents } = await supabase.from('availability_events').select('channel_id').eq('guild_id', guild.id).not('channel_id', 'is', null).order('created_at', { ascending: false }).limit(10);
    const { data: recentLineups } = await supabase.from('lineups').select('channel_id').eq('guild_id', guild.id).not('channel_id', 'is', null).order('updated_at', { ascending: false }).limit(5);
    for (const row of [...(recentEvents || []), ...(recentLineups || [])]) channelIds.add(row.channel_id);

    const channelLines = [];
    for (const id of channelIds) {
      const channel = await guild.channels.fetch(id).catch(() => null);
      if (!channel) continue;
      const missing = missingChannelPerms(channel, me);
      channelLines.push(missing.length ? `❌ <#${id}>: missing ${missing.join(', ')}` : `✅ <#${id}>`);
    }

    // Match recaps that have nowhere to go would otherwise be dropped without a word
    const recapGaps = [];
    for (const club of linked) {
      if ((club.autopilot?.off || []).includes('recaps') || club.autopilot?.channel_id || club.stats_channel_id) continue;
      const { count } = await supabase.from('availability_events').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq('club_key', club.key).not('channel_id', 'is', null);
      if (!count) recapGaps.push(club.name);
    }
    if (recapGaps.length) problems.push(`⚠️ Match recaps for ${recapGaps.join(', ')} have no channel. Pick one with **/manager → Match Night → Autopilot**.`);

    const access = await commandAccessLines(guild);
    const restricted = restrictedByDefault(guild);
    const accessText = [
      ...access.lines,
      access.error ? `Couldn't read command settings (${access.error}).` : null,
      !access.lines.length && !access.error ? '✅ No commands turned off' : null,
      restricted.length ? `ℹ️ Admins only by default: ${restricted.join(', ')}` : null,
      'Change who can use what in **Server Settings → Integrations → GafferBot**.',
    ].filter(Boolean).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🛠️ GafferBot setup')
      .setColor(Number(prefs.branding.color) || 0x5865f2)
      .setDescription(
        (next ? `**Next:** ${next.text}\n\n` : '**All set.** Open the Manager Hub with `/manager`.\n\n') +
          steps.map((s) => `${s.done ? '✅' : '⬜'} ${s.text}`).join('\n')
      )
      .addFields(
        { name: 'Channels I post in', value: channelLines.join('\n').slice(0, 1024) || '–' },
        { name: 'Server permissions', value: problems.join('\n').slice(0, 1024) || '✅ Nothing missing' },
        { name: 'Who can use commands', value: accessText.slice(0, 1024) }
      )
      .setFooter({ text: `Bot online · ${Math.max(0, Math.round(guild.client.ws.ping))}ms latency · Missing a channel permission? Edit the channel → Permissions → add my role.` });
    const canEdit = interaction.member.permissions.has(F.ManageGuild);
    const components = canEdit && deps.saveGuildSettings
      ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('setupw:start').setLabel('Club setup: EA club, colours & kit').setEmoji('🧭').setStyle(ButtonStyle.Primary))]
      : [];
    return interaction.editReply({ embeds: [embed], components });
  }

  // ---------- /brand ----------

  async function handleBrand(interaction) {
    const guild = interaction.guild;
    if (!interaction.member.permissions.has(F.ManageGuild)) {
      return interaction.reply({ content: '❌ Only server admins can change the branding.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    const { data: row } = await supabase.from('guild_settings').select('branding').eq('guild_id', guild.id).maybeSingle();
    let branding = { ...(row?.branding || {}) };
    const notes = [];

    if (interaction.options.getBoolean('reset')) {
      branding = {};
      await setMe(guild, { nick: null, avatar: null }).catch(() => {});
      notes.push('Back to the default look, name and avatar.');
    }

    const colorText = interaction.options.getString('color');
    if (colorText) {
      const color = parseColor(colorText);
      if (color === null) return interaction.editReply({ content: `❌ "${colorText}" isn't a hex colour. Try #e11d48.` });
      branding.color = color;
    }
    const footer = interaction.options.getString('footer');
    if (footer) branding.footer = footer.trim();
    const lineupTitle = interaction.options.getString('lineup_title');
    if (lineupTitle) branding.lineup_title = lineupTitle.trim();
    const logo = interaction.options.getString('logo_url');
    if (logo) {
      if (!/^https:\/\/\S+$/i.test(logo.trim())) return interaction.editReply({ content: '❌ The logo must be an https link to an image.' });
      branding.logo_url = logo.trim();
    }

    if (interaction.options.getBoolean('clear_crests')) { delete branding.crests; notes.push('Imported era crests removed.'); }
    const history = interaction.options.getString('crest_history');
    if (history) {
      if (!/^https:\/\/\S+$/i.test(history.trim())) return interaction.editReply({ content: '❌ The crest history must be an https link.' });
      try {
        const res = await fetch(history.trim(), { headers: { 'user-agent': 'Mozilla/5.0' } });
        const crests = parseCrestHistory(await res.text(), history.trim());
        if (!crests.length) return interaction.editReply({ content: "❌ I couldn't find crests with year ranges on that page. Try the club's worldsoccerpins.com historical-crests page." });
        branding.crests = crests;
        notes.push(`🛡️ Imported **${crests.length}** era crests (${crests[0].from}–${crests.at(-1).to === 9999 ? 'present' : crests.at(-1).to}). Card styles now use the crest from their own era.`);
      } catch (err) {
        return interaction.editReply({ content: `❌ Couldn't load that page: ${err.message}` });
      }
    }

    const nickname = interaction.options.getString('nickname');
    const avatar = interaction.options.getAttachment('avatar');
    if (nickname || avatar) {
      const body = {};
      if (nickname) body.nick = nickname.trim();
      if (avatar) {
        if (!/^image\/(png|jpe?g|gif|webp)$/.test(avatar.contentType || '') || avatar.size > MAX_AVATAR_BYTES) {
          return interaction.editReply({ content: '❌ The avatar must be a PNG, JPG, GIF or WebP under 8 MB.' });
        }
        const res = await fetch(avatar.url);
        const bytes = Buffer.from(await res.arrayBuffer());
        body.avatar = `data:${avatar.contentType};base64,${bytes.toString('base64')}`;
      }
      try {
        await setMe(guild, body);
        if (nickname) notes.push(`My name here is now **${body.nick}**.`);
        if (avatar) notes.push('My avatar in this server is updated.');
      } catch (err) {
        notes.push(`⚠️ Couldn't change my ${nickname ? 'name' : 'avatar'}: ${err.message}. ${nickname ? 'I need **Change Nickname**.' : ''}`);
      }
    }

    const { error } = await supabase.from('guild_settings').upsert({ guild_id: guild.id, branding }, { onConflict: 'guild_id' });
    if (error) return interaction.editReply({ content: `❌ ${error.message}` });
    events.forgetPrefs(guild.id);
    require('./embed-style.cjs').forget(guild.id);

    const preview = new EmbedBuilder()
      .setTitle(`📋 ${(branding.lineup_title || '{team} Starting XI').replace('{team}', 'Your Club')}`)
      .setColor(Number.isInteger(branding.color) ? branding.color : 0x22c55e)
      .setDescription('**Formation:** 4-3-3\nThis is how team sheets and event boards will look.')
      .setFooter({ text: branding.footer || 'Team sheet from GafferBot' });
    if (branding.logo_url) preview.setThumbnail(branding.logo_url);
    return interaction.editReply({ content: notes.join('\n') || '✅ Branding saved.', embeds: [preview] });
  }

  // Per-server nickname and avatar for the bot (Modify Current Member)
  async function setMe(guild, body) {
    await guild.client.rest.patch(`/guilds/${guild.id}/members/@me`, { body });
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if ((interaction.isButton() && interaction.customId === 'setupw:start') || (interaction.isModalSubmit() && interaction.customId === 'setupw:submit')) {
      await handleWizard(interaction);
      return true;
    }
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName === 'setup') await handleSetup(interaction);
    else if (interaction.commandName === 'brand') await handleBrand(interaction);
    else return false;
    return true;
  }

  // First message after the bot joins: one clear first step
  async function welcome(guild) {
    const me = guild.members.me;
    const channel =
      (guild.systemChannel && !missingChannelPerms(guild.systemChannel, me).length && guild.systemChannel) ||
      guild.channels.cache.find((c) => c.isTextBased?.() && !c.isThread?.() && !missingChannelPerms(c, me).length);
    if (!channel) return;
    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle('👋 Thanks for adding GafferBot')
            .setColor(0x5865f2)
            .setDescription(
              'Start with **`/setup`** and press **Club setup** to link your EA club and set colours and kit in one form. It also shows what to do next and checks my permissions.\n\n' +
                'The usual path, all from `/manager`: **Admin → Link EA Club**, **Roster & Squad → Import Role**, **Events → Timezone**, then **Events → New Event**.'
            ),
        ],
      })
      .catch(() => {});
  }

  return { commands: SETUP_COMMANDS, handleInteraction, welcome };
}

module.exports = { createClubSetup, SETUP_COMMANDS, parseColor };
