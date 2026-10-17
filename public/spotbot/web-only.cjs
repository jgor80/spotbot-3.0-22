// Branding (team colours, crest, club identity, kit, the Brand look and the bot's avatar) is set on
// gafferbot.app only. The Control Room runs the same handlers (web-panels.cjs marks its interactions
// with __webPanel); in Discord those steps answer with a link to the website instead.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const WEB_URL = String(process.env.WEB_APP_URL || 'https://gafferbot.app').replace(/\/+$/, '');
const CONTROL_URL = `${WEB_URL}/control`;

const onWeb = (interaction) => !!interaction?.__webPanel;

const brandingButton = (label = 'Branding on gafferbot.app') =>
  new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(CONTROL_URL).setLabel(label).setEmoji('🎨');

// Private answer for a branding step pressed in Discord
function webOnlyReply(what = 'Branding') {
  return {
    content: `🎨 ${what} is set on the website now: open **${WEB_URL.replace(/^https?:\/\//, '')}/control**, sign in with Discord, pick this server and use **Admin → Setup Wizard** or **Brand**.`,
    components: [new ActionRowBuilder().addComponents(brandingButton())],
    flags: 64,
  };
}

module.exports = { WEB_URL, CONTROL_URL, onWeb, brandingButton, webOnlyReply };
