// GafferBot Premium: which servers get the premium features, and the /premium command.
// For now every server gets Premium free. Set PREMIUM_PAYWALL=on to start gating it; then
// a server is premium when any of these is true:
//   - the bot owner switched it on with /premium on (stored in premium_servers)
//   - its id is in the PREMIUM_GUILDS env list (handy for testing before the table exists)
//   - it holds an active Discord App Subscription for DISCORD_PREMIUM_SKU_ID (Discord's own shop)
// AI image plans and packs (billing function) are sold on the website and in Discord's store at the
// same price: DISCORD_SKUS maps plan/pack keys to SKUs, and every entitlement is forwarded to the
// billing function, which owns the plan rows and image balances. IMAGE_LIMITS=on enforces them.
// BOT_OWNER_IDS (comma separated Discord user ids) says who may use /premium on|off.

const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CACHE_MS = 60 * 1000;
const IMAGE_LIMITS = /^(on|true|1|yes)$/i.test(String(process.env.IMAGE_LIMITS || '').trim());
// How long a buy button remembers which server it was opened in (Discord ties packs to the buyer)
const HINT_MS = 2 * 60 * 60 * 1000;
// The saved copy lasts longer, so a purchase replayed after a long outage still finds its server
const SAVED_HINT_MS = 7 * 24 * 60 * 60 * 1000;

function skuMap(raw) {
  try {
    const v = JSON.parse(raw || '{}');
    return Object.fromEntries(Object.entries(v).filter(([, id]) => /^\d{5,25}$/.test(String(id))).map(([k, id]) => [k, String(id)]));
  } catch {
    console.warn('[premium] ignoring invalid DISCORD_SKUS JSON');
    return {};
  }
}
// Until PREMIUM_PAYWALL=on, every premium feature is free on every server
const PREMIUM_FREE = !/^(on|true|1|yes)$/i.test(String(process.env.PREMIUM_PAYWALL || '').trim());
const PREMIUM_COLOR = 0xf5b301;

// What premium unlocks, for /premium and the upsell message
const PREMIUM_FEATURES = [
  ['🖼️', 'Matchday graphics', 'Recap images after every match, FUT-style squad cards (/manager → Premium → Player Cards) and a Team of the Week poster (/manager → Premium → Team of the Week).'],
  ['🕵️', 'Opponent dossier', '/manager → Recruiting → Opponent Dossier: formation shape, danger men and weak spots from their recent EA games.'],
  ['📺', 'Streamer kit', 'An OBS browser source with the XI and live ratings (/manager → Premium → Stream Overlay), plus big-moment alerts with live streams.'],
  ['🏆', 'Stat trophies', 'Roles that move on their own: Club Legend, Golden Boot, Playmaker, Golden Glove, In-Form (/manager → Premium → Trophies).'],
  ['🧠', 'Assistant coach', 'A plain-English debrief after each session: pairings, late-night drop-off, who to rotate (/manager → Premium → Assistant Coach).'],
];

// /premium carries every premium feature as a subcommand; feature modules pass theirs in
function premiumCommands(...extra) {
  return [
    {
      name: 'premium',
      description: 'GafferBot Premium: status, squad cards, TOTW, stream overlay, trophies and the assistant coach.',
      options: [...BASE_SUBCOMMANDS, ...extra.flat()],
    },
  ];
}

const BASE_SUBCOMMANDS = [
  { type: 1, name: 'status', description: 'Show what Premium includes and whether this server has it.' },
  {
    type: 1,
    name: 'on',
    description: 'Bot owner only: switch Premium on for a server.',
    options: [
      { name: 'server_id', description: 'Server id (defaults to this server).', type: 3, required: false },
      { name: 'note', description: 'Why, e.g. "beta tester".', type: 3, required: false, max_length: 100 },
    ],
  },
  {
    type: 1,
    name: 'off',
    description: 'Bot owner only: switch Premium off for a server.',
    options: [{ name: 'server_id', description: 'Server id (defaults to this server).', type: 3, required: false }],
  },
];

function idList(text) {
  return new Set(
    String(text || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function createPremium(deps) {
  const { supabase, supabaseUrl, secret } = deps;
  const skus = skuMap(process.env.DISCORD_SKUS);
  const buyHints = new Map();
  const owners = [...new Set([...idList(process.env.BOT_OWNER_IDS), '501557839932948490'])];
  const envGuilds = idList(process.env.PREMIUM_GUILDS);
  const skuId = process.env.DISCORD_PREMIUM_SKU_ID || null;
  const cache = new Map();
  let client = null;
  let tableMissing = false;

  async function loadRow(guildId) {
    if (tableMissing) return null;
    const { data, error } = await supabase.from('premium_servers').select('*').eq('guild_id', guildId).maybeSingle();
    if (error) {
      // 42P01: the migration hasn't been applied yet; fall back to the env list and Discord
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
        tableMissing = true;
        console.warn('[premium] premium_servers table missing; using PREMIUM_GUILDS and Discord subscriptions only');
      } else console.warn(`[premium] lookup failed: ${error.message}`);
      return null;
    }
    return data;
  }

  async function hasEntitlement(guildId) {
    if (!skuId || !client?.application) return false;
    try {
      const list = await client.application.entitlements.fetch({ guild: guildId, skus: [skuId], excludeEnded: true, cache: false });
      return list.some((e) => !e.deleted && (!e.endsTimestamp || e.endsTimestamp > Date.now()));
    } catch (err) {
      console.warn(`[premium] entitlement check failed for ${guildId}: ${err.message}`);
      return false;
    }
  }

  // { premium, source } with source manual | env | discord | null
  async function status(guildId) {
    if (!guildId) return { premium: false, source: null };
    if (PREMIUM_FREE) return { premium: true, source: 'free', row: null };
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    let value = { premium: false, source: null, row: null };
    const row = await loadRow(guildId);
    const manual = row?.enabled && (!row.expires_at || new Date(row.expires_at) > new Date());
    if (manual) value = { premium: true, source: 'manual', row };
    else if (envGuilds.has(guildId)) value = { premium: true, source: 'env', row };
    else if (await hasEntitlement(guildId)) value = { premium: true, source: 'discord', row };
    else if (await hasPlan(guildId)) value = { premium: true, source: 'plan', row };
    else value.row = row;
    cache.set(guildId, { at: Date.now(), value });
    return value;
  }

  // Any live paid plan (website or Discord) also unlocks the premium features
  async function hasPlan(guildId) {
    const { data, error } = await supabase.from('billing_subscriptions').select('status, current_period_end').eq('guild_id', guildId).eq('active', true).limit(5);
    if (error) return false;
    return (data || []).some((r) => !r.current_period_end || new Date(r.current_period_end) > new Date());
  }

  async function billing(body) {
    if (!secret || !supabaseUrl) return { error: 'Billing needs the bot functions secret.' };
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/billing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret }, body: JSON.stringify(body),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    return res?.ok ? out : { error: out.error || 'Billing is unavailable right now.' };
  }

  // Sends a Discord store purchase to the billing function; packs are consumed once credited
  async function forwardEntitlement(e, { deleted = Boolean(e?.deleted) } = {}) {
    if (!e || !Object.values(skus).includes(e.skuId)) return;
    const hint = await hintFor(e.userId);
    const out = await billing({
      action: 'discord_entitlement',
      guild_hint: hint ? hint.guildId : null,
      entitlement: { id: e.id, sku_id: e.skuId, guild_id: e.guildId || null, user_id: e.userId || null, ends_at: e.endsTimestamp ? new Date(e.endsTimestamp).toISOString() : null, deleted, consumed: Boolean(e.consumed) },
    });
    if (out.error) return console.warn(`[premium] entitlement ${e.id} not recorded: ${out.error}`);
    if (!out.applied) console.warn(`[premium] entitlement ${e.id} skipped: ${out.reason}`);
    if (out.consume && !e.consumed && typeof e.consume === 'function') await e.consume().catch((err) => console.warn(`[premium] consume ${e.id} failed: ${err.message}`));
    if (e.guildId) cache.delete(e.guildId);
    if (hint) cache.delete(hint.guildId);
  }

  // Which server the buyer last opened a buy button in, from memory or (after a restart) the database
  async function hintFor(userId) {
    if (!userId) return null;
    const mem = buyHints.get(userId);
    if (mem && Date.now() - mem.at < HINT_MS) return mem;
    const { data } = await supabase.from('billing_buy_hints').select('guild_id, updated_at').eq('discord_user_id', userId).maybeSingle()
      .then((r) => r, () => ({ data: null }));
    const at = data ? new Date(data.updated_at).getTime() : 0;
    return data && Date.now() - at < SAVED_HINT_MS ? { guildId: data.guild_id, at } : null;
  }

  // Purchases made while the bot was offline: Discord keeps them, so replay them at startup
  async function replayEntitlements() {
    const ids = Object.values(skus);
    if (!ids.length || !client?.application) return;
    const list = await client.application.entitlements.fetch({ skus: ids, excludeEnded: true, cache: false }).catch((err) => { console.warn(`[premium] entitlement replay failed: ${err.message}`); return null; });
    for (const e of list?.values() || []) await forwardEntitlement(e);
  }

  // The server's AI image balance, for Studio and /manager
  async function imageStatus(guildId) {
    return billing({ action: 'status', guild_id: guildId });
  }

  // Buttons to buy more: Discord's own store buttons for whatever has a SKU, plus the website
  function buyRows(guildId, userId, status) {
    if (userId) {
      buyHints.set(userId, { guildId, at: Date.now() });
      // Saved too, so a purchase finished after a restart still credits this server
      supabase.from('billing_buy_hints').upsert({ discord_user_id: userId, guild_id: guildId, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.warn(`[premium] buy hint not saved: ${error.message}`); }, () => {});
    }
    if (buyHints.size > 5000) buyHints.delete(buyHints.keys().next().value);
    const products = status?.products || [];
    const storeButtons = products.filter((p) => p.discord_sku && p.type !== 'monthly').slice(0, 3)
      .map((p) => new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(p.discord_sku));
    const plans = products.filter((p) => p.discord_sku && p.type === 'monthly').slice(0, 4)
      .map((p) => new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(p.discord_sku));
    const site = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Plans & packs on gafferbot.app').setURL(status?.billing_url || `https://gafferbot.app/billing?guild=${guildId}`);
    return [new ActionRowBuilder().addComponents(site, ...storeButtons), ...(plans.length ? [new ActionRowBuilder().addComponents(...plans)] : [])];
  }

  // One line for panels: "12 AI images left this month (Club)"
  function imagesLine(status) {
    if (!status || status.error) return null;
    if (!status.limits_on) return '🖼️ AI images are unlimited for now.';
    const monthly = status.monthly ? ` (${Math.max(0, status.monthly - status.used)} of ${status.monthly} this month, ${status.pack_balance} from packs)` : '';
    return `🖼️ **${status.left}** AI images left on the **${status.plan}** plan${monthly}.`;
  }

  async function isPremium(guildId) {
    return (await status(guildId)).premium;
  }

  function upsellRow() {
    if (!skuId) return [];
    return [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(skuId))];
  }

  function upsellMessage(feature) {
    const embed = new EmbedBuilder()
      .setTitle(`⭐ ${feature} is a GafferBot Premium feature`)
      .setColor(PREMIUM_COLOR)
      .setDescription(PREMIUM_FEATURES.map(([emoji, name, help]) => `${emoji} **${name}**: ${help}`).join('\n'))
      .setFooter({ text: skuId ? 'A server admin can subscribe with the button below.' : 'Ask the bot owner to switch Premium on for this server.' });
    return { embeds: [embed], components: upsellRow(), flags: 64 };
  }

  // For slash commands: true when the server is premium; otherwise replies with the upsell
  async function gate(interaction, feature) {
    if (await isPremium(interaction.guildId)) return true;
    const msg = upsellMessage(feature);
    if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: msg.embeds, components: msg.components });
    else await interaction.reply(msg);
    return false;
  }

  // A per-server secret for the OBS overlay URL; created on first use
  async function overlayToken(guildId, rotate = false) {
    const row = await loadRow(guildId);
    if (tableMissing) return null;
    if (row?.overlay_token && !rotate) return row.overlay_token;
    const token = newToken();
    const { error } = await supabase
      .from('premium_servers')
      .upsert({ guild_id: guildId, overlay_token: token, enabled: row?.enabled ?? false, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
    if (error) {
      console.warn(`[premium] overlay token save failed: ${error.message}`);
      return null;
    }
    cache.delete(guildId);
    return token;
  }

  async function setManual(guildId, enabled, by, note) {
    const row = await loadRow(guildId);
    if (tableMissing) return 'The premium_servers table is missing. Apply the premium migration first, or use the PREMIUM_GUILDS env var.';
    const { error } = await supabase.from('premium_servers').upsert(
      {
        guild_id: guildId,
        enabled,
        granted_by: by,
        note: note ?? row?.note ?? null,
        overlay_token: row?.overlay_token || newToken(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guild_id' },
    );
    cache.delete(guildId);
    return error ? error.message : null;
  }

  async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') {
      const s = await status(interaction.guildId);
      const how = { manual: 'switched on by the bot owner', env: 'switched on in the bot settings', discord: 'active Discord subscription', free: 'free for every server for now' }[s.source];
      const embed = new EmbedBuilder()
        .setTitle(s.premium ? '⭐ This server has GafferBot Premium' : 'GafferBot Premium')
        .setColor(s.premium ? PREMIUM_COLOR : 0x99aab5)
        .setDescription(
          (s.premium ? `Premium is on (${how}).\n\n` : 'Premium is not on for this server yet.\n\n') +
            PREMIUM_FEATURES.map(([emoji, name, help]) => `${emoji} **${name}**: ${help}`).join('\n'),
        );
      return interaction.reply({ embeds: [embed], components: s.premium ? [] : upsellRow(), flags: 64 });
    }

    if (!owners.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Only the bot owner can switch Premium on or off.', flags: 64 });
    }
    const guildId = (interaction.options.getString('server_id') || interaction.guildId || '').trim();
    if (!/^\d{15,22}$/.test(guildId)) return interaction.reply({ content: '❌ That is not a server id.', flags: 64 });
    const enabled = sub === 'on';
    const err = await setManual(guildId, enabled, interaction.user.id, interaction.options.getString('note'));
    if (err) return interaction.reply({ content: `❌ ${err}`, flags: 64 });
    const name = client?.guilds.cache.get(guildId)?.name || guildId;
    return interaction.reply({ content: `${enabled ? '⭐ Premium is on' : 'Premium is off'} for **${name}**.`, flags: 64 });
  }

  // status / on / off; the feature subcommands are handled by their own modules
  async function handleInteraction(interaction) {
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'premium' &&
      ['status', 'on', 'off'].includes(interaction.options.getSubcommand(false))
    ) {
      await handleCommand(interaction);
      return true;
    }
    return false;
  }

  // Discord sends these when a server subscribes, renews or cancels through the app shop
  function start(c) {
    client = c;
    const forget = (e) => e?.guildId && cache.delete(e.guildId);
    const handle = (e, opts) => { forget(e); forwardEntitlement(e, opts).catch((err) => console.warn(`[premium] entitlement failed: ${err.message}`)); };
    c.on('entitlementCreate', (e) => handle(e));
    c.on('entitlementUpdate', (_old, e) => handle(e));
    c.on('entitlementDelete', (e) => handle(e, { deleted: true }));
    setTimeout(() => replayEntitlements().catch(() => {}), 15000);
  }

  return { handleInteraction, start, isPremium, status, gate, upsellMessage, overlayToken, imageStatus, buyRows, imagesLine, forwardEntitlement, IMAGE_LIMITS };
}

module.exports = { createPremium, premiumCommands, PREMIUM_FEATURES, PREMIUM_FREE, IMAGE_LIMITS };
