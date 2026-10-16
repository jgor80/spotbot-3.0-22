// Pro photos: in-game Virtual Pro pictures used on recap cards.
// - Any image posted in a #pro-photos channel (or a club's pro_photos_channel_id) is analyzed
//   and attached to the poster, or to the mentioned player when a manager posts it.
// - /me → Pro Photo uploads one directly.
// - Graphics Studio → Upload Photos asks for a headshot and goal celebrations in one form.
// Only raw captures are kept (console screenshots or phone photos of the screen), never AI renders.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, LabelBuilder, FileUploadBuilder, TextDisplayBuilder } = require('discord.js');

const NAME_RE = /pro-?photos?/i;
const IMAGE_RE = /^image\/(png|jpe?g|webp)$/;
const UPLOAD_ID = 'pph_upload';
const UPLOAD_FORM_ID = 'pph_upload_form';

// Guided upload: a face headshot (the likeness anchor) plus goal celebrations (signature poses).
function uploadModal() {
  return new ModalBuilder().setCustomId(UPLOAD_FORM_ID).setTitle('Upload photos of your pro')
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      'Use **your phone** to photograph the TV/monitor, or a **console screenshot**. Real game images only, no AI renders or edited art: the artwork copies exactly what you send.',
      '**Headshot:** edit your pro, zoom in on the face looking at the camera, fill the frame, avoid glare.',
      '**Goal celebrations:** open the goal celebrations screen while editing your pro and snap each celebration you use, whole body in frame.',
    ].join('\n')))
    .addLabelComponents(
      new LabelBuilder().setLabel('Headshot').setDescription('One clear photo of your pro\'s face, facing the camera')
        .setFileUploadComponent(new FileUploadBuilder().setCustomId('headshot').setMinValues(1).setMaxValues(1).setRequired(true)),
      new LabelBuilder().setLabel('Goal celebrations (optional)').setDescription('Up to 5 photos from the goal celebrations screen')
        .setFileUploadComponent(new FileUploadBuilder().setCustomId('celebrations').setMinValues(0).setMaxValues(5).setRequired(false)),
    );
}

function createProPhotos({ supabaseUrl, secret, getGuildState, isManager }) {
  async function manage(userId, action, extra = {}) {
    if (!secret) return { error: 'Photo management is not configured.' };
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/pro-photo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
        body: JSON.stringify({ ...extra, action, discord_user_id: userId, requester_id: userId }),
      });
      const result = await res.json().catch(() => ({}));
      return res.ok ? result : { error: typeof result.error === 'string' ? result.error : 'Could not manage your photos.' };
    } catch { return { error: 'Could not reach your photo collection. Please try again.' }; }
  }

  function photoButton(owner, action, offset, id, label, style = ButtonStyle.Secondary) {
    return new ButtonBuilder().setCustomId(`pph:${owner}:${action}:${offset}:${id || 'none'}`).setLabel(label).setStyle(style);
  }

  async function showPhotos(interaction, offset = 0, notice = '') {
    let r = await manage(interaction.user.id, 'list', { offset });
    if (!r.error && !r.photo && r.total > 0 && offset > 0) {
      offset = Math.max(0, r.total - 1);
      r = await manage(interaction.user.id, 'list', { offset });
    }
    if (r.error) return interaction.editReply({ content: r.error, embeds: [], components: [] });
    if (!r.photo) return interaction.editReply({ content: `${notice ? `${notice}\n` : ''}You have no saved original pro photos.`, embeds: [], components: [] });
    const p = r.photo;
    const embed = new EmbedBuilder().setColor(0x3b82f6).setTitle(`My pro photos · ${offset + 1} of ${r.total}`)
      .setDescription((p.description || 'Saved original pro photo').slice(0, 2000)).setImage(p.image_url)
      .setFooter({ text: `Original upload · ${p.pose || 'unclassified pose'} · ${new Date(p.created_at).toLocaleDateString('en-US')}` });
    const row = new ActionRowBuilder().addComponents(
      photoButton(interaction.user.id, 'page', Math.max(0, offset - 1), null, 'Previous').setDisabled(offset === 0),
      photoButton(interaction.user.id, 'page', offset + 1, null, 'Next').setDisabled(offset + 1 >= r.total),
      photoButton(interaction.user.id, 'ask', offset, p.id, 'Delete photo', ButtonStyle.Danger),
    );
    await interaction.editReply({ content: notice || null, embeds: [embed], components: [row] });
  }
  async function ingest({ guildId, userId, submittedBy, url, shot }) {
    if (!secret) return { error: 'Photo uploads need BOT_PROXY_SECRET set on the bot.' };
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/pro-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ guild_id: guildId, discord_user_id: userId, submitted_by: submittedBy, image_url: url, ...(shot ? { shot } : {}) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: typeof body.error === 'string' ? body.error : 'Something went wrong saving the photo.' };
    return body;
  }

  function resultEmbed(user, r) {
    const a = r.analysis || {};
    const lines = [
      a.position && `**Position:** ${a.position}`,
      a.overall && `**Overall:** ${a.overall}`,
      a.archetype && `**Archetype:** ${a.archetype}`,
      a.height && `**Height:** ${a.height}`,
      a.playstyles?.length && `**PlayStyles:** ${a.playstyles.slice(0, 6).join(', ')}`,
    ].filter(Boolean);
    return new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(`📸 Pro photo saved — ${r.ea_username || user.username}`)
      .setDescription([a.description, lines.join('\n'), '_Added to this player’s photo collection. Graphics Studio will choose a suitable pose._'].filter(Boolean).join('\n\n'))
      .setThumbnail(r.image_url);
  }

  async function isPhotoChannel(message) {
    if (NAME_RE.test(message.channel?.name || '')) return true;
    const state = await getGuildState(message.guild.id).catch(() => null);
    return (Array.isArray(state?.clubs) ? state.clubs : []).some((c) => c?.pro_photos_channel_id === message.channelId);
  }

  async function onMessage(message) {
    if (!message.guild || message.author?.bot) return;
    // Every image in the message counts: Discord sometimes omits contentType on multi-uploads, so fall back to the file extension.
    const isImage = (a) => IMAGE_RE.test(a.contentType || '') || /\.(png|jpe?g|webp)(\?|$)/i.test(a.name || a.url || '');
    const seen = new Set();
    const images = [...message.attachments.values()].filter((a) => isImage(a) && !seen.has(a.url) && seen.add(a.url));
    if (!images.length || !(await isPhotoChannel(message))) return;
    const tagged = message.mentions.users.find((u) => !u.bot);
    let target = message.author;
    if (tagged && tagged.id !== message.author.id) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!member || !(await isManager(member, message.guild.id))) {
        return message.reply('Only managers can upload a photo for someone else. Post your own pro to attach it to you.').catch(() => {});
      }
      target = tagged;
    }
    await message.react('⏳').catch(() => {});
    let saved = 0;
    const problems = [];
    let lastSaved;
    for (const img of images) {
      const r = await ingest({ guildId: message.guild.id, userId: target.id, submittedBy: message.author.id, url: img.url }).catch(() => ({ error: 'Could not save this photo. Please try again.' }));
      if (r.accepted) { saved++; lastSaved = r; }
      else problems.push(r.error || "That image needs a single footballer as its clear subject.");
    }
    await message.reactions.cache.get('⏳')?.users.remove(message.client.user.id).catch(() => {});
    await message.react(saved ? '✅' : '❌').catch(() => {});
    await message.reply({
      content: [`${saved} of ${images.length} photo${images.length === 1 ? '' : 's'} saved.`, ...problems].join('\n'),
      embeds: lastSaved ? [resultEmbed(target, lastSaved)] : [], allowedMentions: { parse: [] },
    }).catch(() => {});
  }

  async function handleUpload(interaction) {
    if (interaction.isButton?.()) {
      await interaction.showModal(uploadModal());
      return true;
    }
    if (!interaction.isModalSubmit?.()) return false;
    await interaction.deferReply({ flags: 64 });
    const files = (id) => [...(interaction.fields.getUploadedFiles(id, false)?.values() || [])];
    const shots = [...files('headshot').map((f) => ({ f, shot: 'headshot', label: 'Headshot' })), ...files('celebrations').map((f, i) => ({ f, shot: 'celebration', label: `Celebration ${i + 1}` }))];
    if (!shots.length) { await interaction.editReply('No photos were attached.'); return true; }
    const lines = [];
    let saved = 0, last;
    for (const { f, shot, label } of shots) {
      const isImage = IMAGE_RE.test(f.contentType || '') || /\.(png|jpe?g|webp)(\?|$)/i.test(f.name || f.url || '');
      const r = isImage
        ? await ingest({ guildId: interaction.guildId, userId: interaction.user.id, submittedBy: interaction.user.id, url: f.url, shot }).catch(() => ({ error: 'Could not save this photo. Please try again.' }))
        : { error: 'Send a PNG, JPG or WebP image (on iPhone, set Camera → Formats → Most Compatible).' };
      if (r.accepted) { saved++; last = r; lines.push(`✅ ${label} saved`); }
      else lines.push(`❌ ${label}: ${r.error || 'That image needs your pro as its clear subject.'}`);
    }
    await interaction.editReply({ content: [`${saved} of ${shots.length} photo${shots.length === 1 ? '' : 's'} saved.`, ...lines].join('\n'), embeds: last ? [resultEmbed(interaction.user, last)] : [] });
    return true;
  }

  async function handleInteraction(interaction) {
    if (interaction.customId === UPLOAD_ID || interaction.customId === UPLOAD_FORM_ID) return handleUpload(interaction);
    if (interaction.customId?.startsWith('pph:')) {
      const [, owner, action, rawOffset, id] = interaction.customId.split(':');
      if (owner !== interaction.user.id) {
        await interaction.reply({ content: 'These are another player’s photo controls. Open /me → My Pro Photos for yours.', flags: 64 });
        return true;
      }
      const offset = Number(rawOffset);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000 || !['page', 'ask', 'cancel', 'delete'].includes(action)) return false;
      await interaction.deferUpdate();
      if (action === 'ask') {
        await interaction.editReply({ content: 'Permanently delete this original photo? It will no longer guide new graphics. Saved cards and the original Discord message stay unchanged.', components: [new ActionRowBuilder().addComponents(
          photoButton(owner, 'delete', offset, id, 'Confirm delete', ButtonStyle.Danger),
          photoButton(owner, 'cancel', offset, null, 'Cancel'),
        )] });
      } else if (action === 'delete') {
        const r = await manage(interaction.user.id, 'delete', { photo_asset_id: id });
        if (r.error) await interaction.editReply({ content: r.error, embeds: [], components: [] });
        else await showPhotos(interaction, offset, 'Photo deleted. Future graphics will use your remaining original uploads.');
      } else await showPhotos(interaction, offset);
      return true;
    }
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'myphotos') {
      await interaction.deferReply({ flags: 64 });
      await showPhotos(interaction);
      return true;
    }
    if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'prophoto') return false;
    const file = interaction.options.getAttachment('photo', true);
    if (!IMAGE_RE.test(file?.contentType || '')) {
      await interaction.reply({ content: '❌ Upload a PNG, JPG or WebP screenshot of your pro.', flags: 64 });
      return true;
    }
    await interaction.deferReply({ flags: 64 });
    const r = await ingest({ guildId: interaction.guildId, userId: interaction.user.id, submittedBy: interaction.user.id, url: file.url });
    if (r.error) await interaction.editReply(`❌ ${r.error}`);
    else if (!r.accepted) await interaction.editReply("🤔 That doesn't look like a Pro Clubs player. Try a screenshot or a phone photo of your pro on screen.");
    else await interaction.editReply({ embeds: [resultEmbed(interaction.user, r)] });
    return true;
  }

  return { onMessage, handleInteraction };
}

const PRO_PHOTO_COMMANDS = [
  { name: 'myphotos', description: 'Privately browse and delete your own original pro photos.' },
  {
    name: 'prophoto',
    description: 'Upload a screenshot of your in-game pro for recap cards.',
    options: [{ name: 'photo', description: 'Screenshot of your pro (Edit Pro, lobby or player card).', type: 11, required: true }],
  },
];

module.exports = { createProPhotos, PRO_PHOTO_COMMANDS, UPLOAD_ID, uploadModal };
