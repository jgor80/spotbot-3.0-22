// /setup: a first-run checklist that says what to run next and diagnoses the permissions that
// stop the bot posting or creating events, plus the onboarding steps (club setup, team colours &
// crest, club identity). /brand: per-server colours, footer, lineup title, logo, era crests,
// and the bot's nickname and avatar in this server.
// Branding (kit, colours and crest, identity, /brand) runs on gafferbot.app only (web-only.cjs):
// in Discord /setup links the EA club and points to the website for the rest.

const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, LabelBuilder, FileUploadBuilder, AttachmentBuilder } = require('discord.js');
const { missingChannelPerms } = require('./perm-check.cjs');
const { activeClubs } = require('./manager-hub.cjs');
const { parseCrestHistory } = require('./club-logos.cjs');
const { VOICES, VOICE_KEYS, identityOf } = require('./club-identity.cjs');
const { toHex, teamColors, crestUrl } = require('./club-colors.cjs');
const { WEB_URL, onWeb, brandingButton, webOnlyReply } = require('./web-only.cjs');
const { createChannelSetup } = require('./channel-setup.cjs');

const F = PermissionsBitField.Flags;
const SERVER_PERMS = [
  [F.ManageRoles, 'Manage Roles', 'position roles from /manager → Lineups & Spots → Positions Panel'],
  [F.MentionEveryone, 'Mention @everyone, @here and All Roles', 'pinging a role that is not mentionable'],
  [F.ChangeNickname, 'Change Nickname', '/manager → Admin → Brand (nickname)'],
];
const POSITION_ROLE_NAMES = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const MAX_CREST_BYTES = 8 * 1024 * 1024;
const CREST_BUCKET = 'pro-photos';
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

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
  const channelSetup = createChannelSetup({ supabase, getGuildState, saveGuildSettings, currentClubOf: (s) => currentClubOf(s), activeClubs, hooks: deps.channelHooks });

  // ---------- Setup wizard: EA club and kit in one form ----------

  function wizardModal(club, withKit = true) {
    const kit = club?.kit || {};
    const input = (id, label, value, opts = {}) => {
      const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(opts.long ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!opts.required).setMaxLength(opts.max || 100);
      if (opts.placeholder) t.setPlaceholder(opts.placeholder);
      if (value) t.setValue(String(value).slice(0, opts.max || 100));
      return new ActionRowBuilder().addComponents(t);
    };
    const rows = [input('ea_name', 'EA club name (exactly as in game)', club?.ea_club_name || '', { placeholder: 'Leave blank to keep the current link' })];
    if (withKit) {
      rows.push(
        input('kit_primary', 'Kit main colour', kit.primary, { placeholder: 'sky blue', max: 40 }),
        input('kit_secondary', 'Kit second colour', kit.secondary, { placeholder: 'white', max: 40 }),
        input('kit_description', 'Describe your home kit', kit.description, { long: true, max: 300, placeholder: 'Sky blue shirt with white collar and cuffs, white shorts' })
      );
    }
    return new ModalBuilder().setCustomId('setupw:submit').setTitle(withKit ? 'Club setup' : 'Link your EA club').addComponents(...rows);
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
      return interaction.showModal(wizardModal(currentClubOf(state), onWeb(interaction)));
    }
    // Modal submit
    await interaction.deferReply({ flags: 64 });
    const get = (id) => {
      try {
        return (interaction.fields.getTextInputValue(id) || '').trim();
      } catch {
        return '';
      }
    };
    const state = await getGuildState(interaction.guildId);
    const club = currentClubOf(state);
    if (!club) return interaction.editReply({ content: '❌ No club exists on this server yet. Open `/manager` once to create it, then run setup again.' });
    const notes = [];

    const kit = { ...(club.kit || {}) };
    if (onWeb(interaction)) {
      for (const [field, key] of [['kit_primary', 'primary'], ['kit_secondary', 'secondary'], ['kit_description', 'description']]) {
        const v = get(field);
        if (v) kit[key] = v;
      }
      club.kit = kit;
      await saveGuildSettings(interaction.guildId, state);
      if (kit.primary || kit.description) notes.push('👕 Kit saved — graphics will use it.');
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
    const colors = fresh.colors?.primary ? `${fresh.colors.primary} / ${fresh.colors.secondary || '–'}` : 'Not picked yet';
    const embed = new EmbedBuilder()
      .setTitle(`✅ ${fresh.name} is set up`)
      .setColor(teamColors(fresh).picked ? teamColors(fresh).primaryInt : 0x22c55e)
      .addFields(
        { name: 'EA club', value: fresh.ea_club_id ? `${fresh.ea_club_name || fresh.name} (${fresh.ea_club_id})` : 'Not linked yet', inline: true },
        { name: 'Team colours', value: colors, inline: true },
        { name: 'Kit', value: [kit.primary, kit.secondary].filter(Boolean).join(' / ') || 'Not set', inline: true },
        { name: 'Kit look', value: (kit.description || '–').slice(0, 1024) }
      )
      .setFooter({ text: onWeb(interaction) ? 'Next: pick your team colours and crest. Run the Setup Wizard again any time to change these.' : 'Next: kit, team colours, crest and club identity are set on gafferbot.app.' });
    const next = onWeb(interaction) ? [colorsButton(), identityButton()] : [brandingButton(), channelsButton()];
    await interaction.editReply({ content: notes.join('\n') || null, embeds: [embed], components: [new ActionRowBuilder().addComponents(...next)] });
    if (picker) await interaction.followUp({ ...picker, flags: 64 });
  }


  // ---------- Setup wizard step 2: team colours and crest ----------
  // Stored on the club (club.colors, club.crest_url) and read everywhere through club-colors.cjs.

  const colorsButton = () => new ButtonBuilder().setCustomId('setupw:colors').setLabel('Team colours & crest').setEmoji('🎨').setStyle(ButtonStyle.Primary);

  function colorsModal(club) {
    const saved = club?.colors || {};
    const text = (id, label, description, value, placeholder, max = 30) => {
      const t = new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(max).setPlaceholder(placeholder);
      if (value) t.setValue(String(value).slice(0, max));
      return new LabelBuilder().setLabel(label).setDescription(description).setTextInputComponent(t);
    };
    return new ModalBuilder().setCustomId('setupw:colorsubmit').setTitle('Team colours & crest').addLabelComponents(
      text('primary', 'Main team colour', 'Hex like #c8102e, or a colour name like claret', saved.primary, '#c8102e'),
      text('secondary', 'Second team colour', 'Used for trim, stripes and text panels', saved.secondary, '#ffffff'),
      new LabelBuilder().setLabel('Crest image (optional)').setDescription('PNG, JPG or WebP. A plain background is removed automatically.')
        .setFileUploadComponent(new FileUploadBuilder().setCustomId('crest').setMinValues(0).setMaxValues(1).setRequired(false)),
      text('crest_link', 'Or a link to your crest (optional)', club?.crest_url ? 'Blank keeps your current crest; type remove to clear it' : 'An https link to an image', '', 'https://…', 1000)
    );
  }

  // Downloads, cleans (backdrop knocked out, trimmed) and stores an uploaded crest; returns its
  // long-lived link and the cleaned image.
  async function storeCrest(guildId, club, file) {
    const isImage = /^image\/(png|jpe?g|webp|gif)$/.test(file.contentType || '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(file.name || '');
    if (!isImage) throw new Error('The crest must be a PNG, JPG or WebP image.');
    if (file.size && file.size > MAX_CREST_BYTES) throw new Error('The crest image must be under 8 MB.');
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`couldn't download the image (${res.status})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_CREST_BYTES) throw new Error('The crest image must be under 8 MB.');
    const type = /^image\/(png|jpe?g|webp|gif)$/.test(file.contentType || '') ? file.contentType.replace('jpg', 'jpeg') : 'image/png';
    const { seamlessLogo } = require('./logo-cleanup.cjs');
    const cleaned = seamlessLogo(`data:${type};base64,${bytes.toString('base64')}`);
    const isPng = cleaned.startsWith('data:image/png;base64,');
    const png = isPng ? Buffer.from(cleaned.split(',')[1], 'base64') : bytes;
    const storedType = isPng ? 'image/png' : type;
    const path = `club-crests/${guildId}/${String(club.key || 'club').replace(/[^\w-]/g, '')}-${Date.now()}.png`;
    const bucket = supabase.storage.from(CREST_BUCKET);
    const up = await bucket.upload(path, png, { contentType: storedType, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const signed = await bucket.createSignedUrl(path, TEN_YEARS);
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'no link for the stored crest');
    return { url: signed.data.signedUrl, image: `data:${storedType};base64,${png.toString('base64')}` };
  }

  // A small banner in the club's colours with its crest, so admins see the result straight away.
  async function colorsPreview(club, crest, image) {
    const G = require('./graphics.cjs');
    const c = teamColors(club);
    const img = image || (crest ? await G.fetchImage(crest) : null);
    const name = G.esc(String(club.name || 'Your club').toUpperCase().slice(0, 28));
    const tx = img ? 250 : 60;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260" viewBox="0 0 900 260">
      <rect width="900" height="260" fill="${c.primary}"/>
      <rect y="200" width="900" height="60" fill="${c.secondary}"/>
      <rect y="190" width="900" height="10" fill="${c.ink}" fill-opacity="0.25"/>
      ${img ? `<image href="${img}" x="40" y="20" width="170" height="170" preserveAspectRatio="xMidYMid meet"/>` : ''}
      <text x="${tx}" y="120" font-family="Oswald" font-weight="700" font-size="${Math.max(30, Math.min(64, Math.floor(600 / Math.max(name.length, 1) * 1.7)))}" fill="${c.ink}">${name}</text>
      <text x="${tx}" y="165" font-family="Inter" font-weight="700" font-size="24" fill="${c.ink}" fill-opacity="0.8">${c.primary.toUpperCase()}  ·  ${c.secondary.toUpperCase()}</text>
    </svg>`;
    try {
      return G.render(svg);
    } catch {
      return null;
    }
  }

  async function handleColors(interaction) {
    if (!onWeb(interaction)) return interaction.reply(webOnlyReply('Team colours and crest'));
    if (!interaction.member.permissions.has(F.ManageGuild)) {
      return interaction.reply({ content: '❌ Only server admins can change the team colours and crest.', flags: 64 });
    }
    const state = await getGuildState(interaction.guildId);
    const club = currentClubOf(state);
    if (!club) return interaction.reply({ content: '❌ No club exists on this server yet. Open `/manager` once to create it, then run setup again.', flags: 64 });
    if (interaction.isButton()) return interaction.showModal(colorsModal(club));

    await interaction.deferReply({ flags: 64 });
    const get = (id) => (interaction.fields.getTextInputValue(id) || '').trim();
    const colors = {};
    for (const key of ['primary', 'secondary']) {
      const raw = get(key);
      if (!raw) continue;
      const hex = toHex(raw);
      if (!hex) return interaction.editReply({ content: `❌ "${raw}" isn't a colour I know. Use a hex code like #c8102e.` });
      colors[key] = hex;
    }
    if (colors.secondary && !colors.primary) return interaction.editReply({ content: '❌ Pick a main team colour as well as the second one.' });

    const notes = [];
    let file = null;
    try {
      file = [...(interaction.fields.getUploadedFiles('crest', false)?.values() || [])][0] || null;
    } catch {
      file = null;
    }
    const link = get('crest_link');
    let crest = club.crest_url || null;
    let crestImage = null;
    if (file) {
      try {
        ({ url: crest, image: crestImage } = await storeCrest(interaction.guildId, club, file));
        notes.push('🛡️ Crest saved. Team sheets, recaps and graphics will show it.');
      } catch (err) {
        notes.push(`⚠️ Crest not saved: ${err.message}. You can paste a link to it instead.`);
      }
    } else if (/^remove$/i.test(link)) {
      crest = null;
      notes.push('🛡️ Crest removed.');
    } else if (link) {
      if (!/^https:\/\/\S+$/i.test(link)) return interaction.editReply({ content: '❌ The crest link must be an https link to an image.' });
      const G = require('./graphics.cjs');
      if (!(await G.fetchImage(link))) return interaction.editReply({ content: "❌ I couldn't load an image from that link. Use a direct link to a PNG, JPG or WebP." });
      crest = link;
      notes.push('🛡️ Crest link saved.');
    }

    if (colors.primary) club.colors = colors;
    else delete club.colors;
    if (crest) club.crest_url = crest;
    else delete club.crest_url;
    await saveGuildSettings(interaction.guildId, state);

    // The server's embed accent follows the club's colour when it is the only club (or no colour was set)
    if (colors.primary) {
      const { data: row } = await supabase.from('guild_settings').select('branding').eq('guild_id', interaction.guildId).maybeSingle();
      const branding = { ...(row?.branding || {}) };
      if (activeClubs(state).length <= 1 || !Number.isInteger(branding.color)) {
        branding.color = parseInt(colors.primary.slice(1), 16);
        const { error } = await supabase.from('guild_settings').upsert({ guild_id: interaction.guildId, branding }, { onConflict: 'guild_id' });
        if (error) notes.push(`⚠️ Embed colour not updated: ${error.message}`);
      }
      events.forgetPrefs(interaction.guildId);
      require('./embed-style.cjs').forget(interaction.guildId);
      notes.unshift(`🎨 Team colours set to ${colors.primary}${colors.secondary ? ` and ${colors.secondary}` : ''}.`);
    } else notes.unshift('🎨 No team colours picked, so posts keep the default look.');

    const c = teamColors(club);
    const embed = new EmbedBuilder()
      .setTitle(`🎨 ${club.name}: team colours & crest`)
      .setColor(c.primaryInt)
      .setDescription('Lineup images, availability posts, team sheets, recaps, cards and the website use these from now on.')
      .addFields(
        { name: 'Main colour', value: club.colors?.primary || `Not picked (using ${c.primary})`, inline: true },
        { name: 'Second colour', value: club.colors?.secondary || `Not picked (using ${c.secondary})`, inline: true },
        { name: 'Crest', value: club.crest_url ? 'Saved' : crestUrl(club, (await events.serverPrefs(interaction.guildId)).branding) ? 'Using the server logo from Brand' : 'None yet', inline: true }
      )
      .setFooter({ text: 'Next: give the club its own voice and newspaper. Run the Setup Wizard any time to change these.' });
    const crestLink = crestUrl(club, (await events.serverPrefs(interaction.guildId)).branding);
    if (crestLink) embed.setThumbnail(crestLink);
    const png = await colorsPreview(club, crestLink, crestImage);
    if (png) embed.setImage('attachment://team-colours.png');
    return interaction.editReply({
      content: notes.join('\n') || null,
      embeds: [embed],
      files: png ? [new AttachmentBuilder(png, { name: 'team-colours.png' })] : [],
      components: [new ActionRowBuilder().addComponents(identityButton())],
    });
  }

  // ---------- Setup wizard step 3: club identity (newspaper voice, paper name, hometown) ----------

  const channelsButton = () => new ButtonBuilder().setCustomId('setupw:channels').setLabel('Channels').setEmoji('📁').setStyle(ButtonStyle.Secondary);
  const identityButton = () => new ButtonBuilder().setCustomId('setupw:identity').setLabel('Club identity: voice & newspaper').setEmoji('📰').setStyle(ButtonStyle.Secondary);

  function identityPanel(club) {
    const id = identityOf(club);
    const sample = id.def.kickers.demolition?.[0];
    const embed = new EmbedBuilder()
      .setTitle(`📰 ${club.name}: club identity`)
      .setColor(0xe8d9b5)
      .setDescription(
        'How the Chronicle, match reports, the AI writer and the Fun Zone sound for this club. Changes apply from the next post.' +
          (id.picked ? '' : `\n\nYou're on the default voice (${VOICES[id.voice].label}). Pick one below to make it yours.`)
      )
      .addFields(
        { name: 'Voice', value: `${id.def.emoji} **${id.def.label}**\n${id.def.desc}${sample ? `\nHeadline kicker: *${sample}*` : ''}` },
        { name: 'Newspaper', value: id.paper, inline: true },
        { name: 'Hometown', value: id.city, inline: true },
        { name: 'Opponent name gags', value: id.nameJokes ? 'On' : 'Off', inline: true }
      )
      .setFooter({ text: 'Next: Channels, to create and wire up every channel GafferBot posts in. Run the Setup Wizard any time to change these.' });
    const voiceMenu = new StringSelectMenuBuilder()
      .setCustomId('setupw:voice')
      .setPlaceholder('Pick your club’s voice')
      .addOptions(VOICE_KEYS.map((k) => ({ label: VOICES[k].label, value: k, emoji: VOICES[k].emoji, description: VOICES[k].desc.slice(0, 100), default: k === id.voice })));
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setupw:paper').setLabel('Newspaper name & hometown').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setupw:jokes').setLabel(id.nameJokes ? 'Turn name gags off' : 'Turn name gags on').setEmoji('😏').setStyle(ButtonStyle.Secondary),
      channelsButton()
    );
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(voiceMenu), buttons] };
  }

  function paperModal(club) {
    const saved = club.identity || {};
    const id = identityOf(club);
    const input = (key, label, value, placeholder) => {
      const t = new TextInputBuilder().setCustomId(key).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder(placeholder);
      if (value) t.setValue(value);
      return new ActionRowBuilder().addComponents(t);
    };
    return new ModalBuilder().setCustomId('setupw:papersubmit').setTitle('Newspaper & hometown').addComponents(
      input('paper_name', 'Newspaper name', saved.paper_name || '', id.paper),
      input('home_city', 'Hometown (used in banter and the press box)', saved.home_city || '', id.city)
    );
  }

  async function handleIdentity(interaction) {
    if (!onWeb(interaction)) return interaction.reply(webOnlyReply('Club identity'));
    if (!interaction.member.permissions.has(F.ManageGuild)) {
      return interaction.reply({ content: '❌ Only server admins can change the club identity.', flags: 64 });
    }
    const state = await getGuildState(interaction.guildId);
    const club = currentClubOf(state);
    if (!club) return interaction.reply({ content: '❌ No club exists on this server yet. Open `/manager` once to create it, then run setup again.', flags: 64 });
    const action = interaction.customId.split(':')[1];
    if (action === 'identity') return interaction.reply({ ...identityPanel(club), flags: 64 });
    if (action === 'paper') return interaction.showModal(paperModal(club));

    const identity = { ...(club.identity || {}) };
    if (action === 'voice') identity.voice = VOICE_KEYS.includes(interaction.values?.[0]) ? interaction.values[0] : identityOf(club).voice;
    else if (action === 'jokes') identity.name_jokes = !identityOf(club).nameJokes;
    else if (action === 'papersubmit') {
      for (const key of ['paper_name', 'home_city']) {
        const v = (interaction.fields.getTextInputValue(key) || '').trim().slice(0, 40);
        if (v) identity[key] = v;
        else delete identity[key];
      }
    }
    club.identity = identity;
    await saveGuildSettings(interaction.guildId, state);
    if (action === 'papersubmit' && !interaction.isFromMessage?.()) return interaction.reply({ ...identityPanel(club), flags: 64 });
    return interaction.update(identityPanel(club));
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

    const wired = deps.saveGuildSettings ? await channelSetup.summary(guild).catch(() => null) : null;
    const channelsText = wired
      ? wired.set === wired.total
        ? `✅ All ${wired.total} feature channels are set (results, matchday, Chronicle, clips and more)`
        : `⬜ ${wired.set} of ${wired.total} feature channels set. Press **Channels** to have me create and wire the rest, or pick your own.`
      : null;

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
        ...(channelsText ? [{ name: 'Feature channels', value: channelsText }] : []),
        { name: 'Channels I post in', value: channelLines.join('\n').slice(0, 1024) || '–' },
        { name: 'Server permissions', value: problems.join('\n').slice(0, 1024) || '✅ Nothing missing' },
        { name: 'Who can use commands', value: accessText.slice(0, 1024) }
      )
      .setFooter({ text: `Bot online · ${Math.max(0, Math.round(guild.client.ws.ping))}ms latency · Missing a channel permission? Edit the channel → Permissions → add my role.` });
    const canEdit = interaction.member.permissions.has(F.ManageGuild);
    const web = onWeb(interaction);
    const start = new ButtonBuilder().setCustomId('setupw:start').setLabel(web ? 'Club setup: EA club & kit' : 'Link EA club').setEmoji('🧭').setStyle(ButtonStyle.Primary);
    const components = canEdit && deps.saveGuildSettings
      ? [new ActionRowBuilder().addComponents(...(web ? [start, colorsButton(), identityButton(), channelsButton()] : [start, channelsButton(), brandingButton()]))]
      : [];
    return interaction.editReply({ embeds: [embed], components });
  }

  // ---------- /brand ----------

  async function handleBrand(interaction) {
    const guild = interaction.guild;
    if (!onWeb(interaction)) return interaction.reply(webOnlyReply('Branding'));
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
    if (/^setupw:ch/.test(interaction.customId || '') && (await channelSetup.handleInteraction(interaction))) return true;
    if (/^setupw:(identity|voice|jokes|paper|papersubmit)$/.test(interaction.customId || '') && (interaction.isButton() || interaction.isStringSelectMenu?.() || interaction.isModalSubmit())) {
      await handleIdentity(interaction);
      return true;
    }
    if ((interaction.isButton() && interaction.customId === 'setupw:colors') || (interaction.isModalSubmit() && interaction.customId === 'setupw:colorsubmit')) {
      await handleColors(interaction);
      return true;
    }
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
              'Start with **`/setup`** and press **Link EA club**, then **Channels** to have me create every channel GafferBot uses and wire them up (or pick your own). It also shows what to do next and checks my permissions.\n\n' +
                `Branding lives on the website: sign in at **${WEB_URL.replace(/^https?:\/\//, '')}/control** for your kit, team colours, crest, club identity (voice, newspaper, hometown) and the bot's look in this server.\n\n` +
                'The usual path, all from `/manager`: **Admin → Link EA Club**, **Roster & Squad → Import Role**, **Events → Timezone**, then **Events → New Event**.'
            ),
        ],
      })
      .catch(() => {});
  }

  return { commands: SETUP_COMMANDS, handleInteraction, welcome };
}

module.exports = { createClubSetup, SETUP_COMMANDS, parseColor };
