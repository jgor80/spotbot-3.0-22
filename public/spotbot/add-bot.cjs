// The "add GafferBot to your server" link, in one place, so every post and panel that offers it
// matches. setAppId() is called once the bot is logged in; until then the live app id is used.
//   ensureInstallLink   on startup, gives the bot's Discord profile an "Add App" button (server
//                       install with the bot's permissions) if it has none, so anyone who clicks
//                       GafferBot in a member list can add it. Changes nothing when one is set.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Routes } = require('discord.js');

const BOT_PERMISSIONS = '309591534673';
const SCOPES = ['bot', 'applications.commands'];
let appId = process.env.DISCORD_APPLICATION_ID || '1441212217834864720';

function setAppId(id) {
  if (id) appId = String(id);
}

function addBotUrl() {
  return `https://discord.com/oauth2/authorize?client_id=${appId}&permissions=${BOT_PERMISSIONS}&scope=${SCOPES.join('%20')}`;
}

function addBotButton(label = 'Add GafferBot to your server') {
  return new ButtonBuilder().setLabel(label).setEmoji('➕').setStyle(ButtonStyle.Link).setURL(addBotUrl());
}

const addBotRow = (label) => new ActionRowBuilder().addComponents(addBotButton(label));

async function ensureInstallLink(client) {
  const app = await client.application?.fetch?.().catch(() => null);
  if (!app) return false;
  setAppId(app.id);
  if (app.installParams?.scopes?.length || app.customInstallURL) return false;
  return client.rest
    .patch(Routes.currentApplication(), { body: { install_params: { scopes: SCOPES, permissions: BOT_PERMISSIONS } } })
    .then(() => true)
    .catch((err) => {
      console.warn(`[add-bot] couldn't set the profile Add App button: ${err.message}`);
      return false;
    });
}

module.exports = { addBotUrl, addBotButton, addBotRow, setAppId, ensureInstallLink, BOT_PERMISSIONS };
