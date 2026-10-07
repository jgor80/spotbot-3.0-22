// Pro photos: in-game Virtual Pro pictures used on recap cards.
// - Any image posted in a #pro-photos channel (or the channel set as pro_photos_channel_id) is analyzed
//   and attached to the poster, or to the mentioned player when a manager posts it.
// - /me → Pro Photo uploads one directly.
const { EmbedBuilder } = require('discord.js');

const NAME_RE = /pro-?photos?/i;
const IMAGE_RE = /^image\/(png|jpe?g|webp)$/;

function createProPhotos({ supabaseUrl, secret, getGuildState, isManager }) {
  async function ingest({ guildId, userId, submittedBy, url }) {
    if (!secret) return { error: 'Photo uploads need BOT_PROXY_SECRET set on the bot.' };
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/pro-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ guild_id: guildId, discord_user_id: userId, submitted_by: submittedBy, image_url: url }),
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
      .setDescription([a.description, lines.join('\n'), '_Used on recap cards, MOTM and Team of the Week from now on._'].filter(Boolean).join('\n\n'))
      .setThumbnail(r.image_url);
  }

  async function isPhotoChannel(message) {
    if (NAME_RE.test(message.channel?.name || '')) return true;
    const state = await getGuildState(message.guild.id).catch(() => null);
    return !!state?.pro_photos_channel_id && state.pro_photos_channel_id === message.channelId;
  }

  async function onMessage(message) {
    if (!message.guild || message.author?.bot) return;
    const img = message.attachments.find((a) => IMAGE_RE.test(a.contentType || ''));
    if (!img || !(await isPhotoChannel(message))) return;
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
    const r = await ingest({ guildId: message.guild.id, userId: target.id, submittedBy: message.author.id, url: img.url });
    await message.reactions.cache.get('⏳')?.users.remove(message.client.user.id).catch(() => {});
    if (r.error) {
      await message.react('❌').catch(() => {});
      return message.reply(`❌ ${r.error}`).catch(() => {});
    }
    if (!r.accepted) {
      await message.react('🤔').catch(() => {});
      return message.reply("🤔 That doesn't look like a Pro Clubs player. Post a screenshot of your pro (Edit Pro, lobby or player card).").catch(() => {});
    }
    await message.react('✅').catch(() => {});
    await message.reply({ embeds: [resultEmbed(target, r)], allowedMentions: { parse: [] } }).catch(() => {});
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'prophoto') return false;
    const file = interaction.options.getAttachment('photo', true);
    if (!IMAGE_RE.test(file?.contentType || '')) {
      await interaction.reply({ content: '❌ Upload a PNG, JPG or WebP screenshot of your pro.', flags: 64 });
      return true;
    }
    await interaction.deferReply({ flags: 64 });
    const r = await ingest({ guildId: interaction.guildId, userId: interaction.user.id, submittedBy: interaction.user.id, url: file.url });
    if (r.error) await interaction.editReply(`❌ ${r.error}`);
    else if (!r.accepted) await interaction.editReply("🤔 That doesn't look like a Pro Clubs player. Try a screenshot from Edit Pro, the lobby or your player card.");
    else await interaction.editReply({ embeds: [resultEmbed(interaction.user, r)] });
    return true;
  }

  return { onMessage, handleInteraction };
}

const PRO_PHOTO_COMMANDS = [
  {
    name: 'prophoto',
    description: 'Upload a screenshot of your in-game pro for recap cards.',
    options: [{ name: 'photo', description: 'Screenshot of your pro (Edit Pro, lobby or player card).', type: 11, required: true }],
  },
];

module.exports = { createProPhotos, PRO_PHOTO_COMMANDS };
