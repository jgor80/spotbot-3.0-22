// Rules and code of conduct for Social Hub servers.
//   #rules     Set Up Social Hub makes a read-only #rules channel at the top and posts the code of
//              conduct (DEFAULT_RULES, or the server's own text in social_hub.rules_text) with an
//              I agree button. Agreeing gives the "✅ Rules agreed" role (made on first use), so admins
//              can see who has read them and, if they ever want to, lock channels to it. Nothing is
//              locked by default: the hub stays open.
//   Edit       server admins press Edit rules to change the text (a modal, up to 4,000 characters,
//              {server} becomes the server's name); the post is edited in place. Leaving it empty goes
//              back to the default. Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { isServerAdmin } = require('./perm-check.cjs');

const RED = 0xe74c3c;
const NO_PINGS = { parse: [] };
const AGREED_ROLE = '✅ Rules agreed';
const MAX_TEXT = 4000;

const DEFAULT_RULES = [
  'Welcome to **{server}**. Play fair, have fun, and help everyone get a game.',
  '',
  '**1. Respect everyone.** No racism, sexism, homophobia, hate speech, threats or harassment, in chat, voice or in game. Banter is fine; bullying isn\'t. If someone asks you to stop, stop.',
  '**2. Play fair.** No cheating, exploits or glitches, and no quitting games on purpose. Don\'t leave your lobby mid-game.',
  '**3. Show up.** If you join a lobby, a draft, a tournament or a team sheet, be there. Can\'t make it? Leave the lobby or tell your captain early. Players who keep not showing up lose their place.',
  '**4. Keep lobbies open.** Lobbies are drop-in for everyone. Don\'t hold spots for people who aren\'t on, and share the good positions.',
  '**5. Mic manners.** Use push-to-talk or mute when there\'s background noise. Calls are welcome; shouting at teammates isn\'t.',
  '**6. Report scores honestly.** Hub league, cup and friendly scores are reported truthfully. Disputes go to the admins, and their decision is final.',
  '**7. Teams.** Recruit with the hub tools, not by poaching players mid-game or spamming DMs. Teams playing outside events represent the hub, so act like it.',
  '**8. No spam or ads.** No self-promotion, server invites or selling. Clips go in #highlights.',
  '**9. Keep it safe.** No NSFW content, no doxxing, and never share anyone\'s personal details. Follow Discord\'s Terms of Service and Community Guidelines, and EA\'s rules for EA SPORTS FC.',
  '**10. Admins have the final say.** Breaking the rules can mean a warning, a timeout, removal from a team or competition, or a ban. Report problems to an admin privately.',
  '',
  'Press **I agree** to show you\'ve read them, then head to #start-here to get set up.',
].join('\n');

// ---------- Pure ----------

// The rules text for a server: its own text, or the default, with {server} filled in
function rulesText(hub, serverName) {
  const own = String(hub?.rules_text || '').trim();
  return (own || DEFAULT_RULES).replace(/\{server\}/g, String(serverName || 'the hub')).slice(0, MAX_TEXT);
}

// What an admin typed: trimmed, no @everyone/@here, no longer than an embed holds
function cleanRules(raw) {
  return String(raw || '').replace(/@(everyone|here)/g, '@​$1').trim().slice(0, MAX_TEXT);
}

// ---------- Module ----------

function createHubRules(deps) {
  const { hubOf, saveHub } = deps;

  function rulesPost(guild, hub) {
    const embed = new EmbedBuilder()
      .setTitle(`📜 ${guild.name}: rules and code of conduct`.slice(0, 256))
      .setColor(RED)
      .setDescription(rulesText(hub, guild.name))
      .setFooter({ text: 'Admins: Edit rules changes this post.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rl_ok').setLabel('I agree').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rl_edit').setLabel('Edit rules').setEmoji('✏️').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row], allowedMentions: NO_PINGS };
  }

  async function agreedRole(guild) {
    const roles = guild.roles.cache?.size ? guild.roles.cache : await guild.roles.fetch().catch(() => null);
    const found = roles?.find?.((r) => r.name === AGREED_ROLE);
    if (found) return found;
    return guild.roles.create({ name: AGREED_ROLE, mentionable: false, reason: 'GafferBot Social Hub: players who agreed to the rules' }).catch(() => null);
  }

  async function agree(guild, member) {
    const role = await agreedRole(guild);
    if (!role) return '✅ Thanks for reading the rules! Have fun.';
    if (member?.roles?.cache?.has?.(role.id)) return '✅ You\'ve already agreed. Have fun!';
    await member?.roles?.add?.(role).catch(() => {});
    return '✅ Thanks for reading the rules! Next: **Get set up** in #start-here, then jump into a lobby.';
  }

  // Edit the #rules post in place after a change
  async function refresh(guild, hub) {
    if (!hub.rules_channel_id || !hub.rules_message_id) return false;
    const ch = await guild.channels.fetch(hub.rules_channel_id).catch(() => null);
    const msg = ch?.messages ? await ch.messages.fetch(hub.rules_message_id).catch(() => null) : null;
    if (!msg) return false;
    return msg.edit(rulesPost(guild, hub)).then(() => true).catch(() => false);
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('rl_') || !interaction.guildId) return false;
    const hub = await hubOf(interaction.guildId);
    if (!hub.on) return false;
    const guild = interaction.guild;

    if (id === 'rl_ok' && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      const member = interaction.member?.roles?.cache ? interaction.member : await guild.members.fetch(interaction.user.id).catch(() => null);
      await interaction.editReply({ content: await agree(guild, member) });
      return true;
    }
    if (id === 'rl_edit' && interaction.isButton?.()) {
      if (!isServerAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ Only server admins can edit the rules.', flags: 64 });
        return true;
      }
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId('rl_edit_m')
          .setTitle('Edit the rules')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('text')
                .setLabel('Rules ({server} = server name; empty = default)')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(MAX_TEXT)
                .setRequired(false)
                .setValue(String(hub.rules_text || DEFAULT_RULES).slice(0, MAX_TEXT))
            )
          )
      );
      return true;
    }
    if (id === 'rl_edit_m' && interaction.isModalSubmit?.()) {
      if (!isServerAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ Only server admins can edit the rules.', flags: 64 });
        return true;
      }
      await interaction.deferReply({ flags: 64 });
      const text = cleanRules(interaction.fields.getTextInputValue('text'));
      const next = { ...hub, rules_text: text && text !== DEFAULT_RULES ? text : null };
      await saveHub(interaction.guildId, next);
      const ok = await refresh(guild, next);
      await interaction.editReply({ content: ok ? '✅ Rules updated.' : '✅ Rules saved. I couldn\'t find the #rules post; press **Set Up Social Hub** again to post it.' });
      return true;
    }
    return false;
  }

  return { handleInteraction, rulesPost, agree, refresh };
}

module.exports = { createHubRules, rulesText, cleanRules, DEFAULT_RULES, AGREED_ROLE };
