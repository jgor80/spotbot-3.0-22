// Club FUT layer: the Discord side of FUT (XI Lab) for a club's server. Every part is opt-in per player on the
// website (FUT → My Account → Share with my Discord club), and the club can switch the whole thing off in
// Club Life settings (feature key "fut").
//   Pull feed      every 15 minutes: new big pack pulls from members who share them, posted to the club channel
//                  (no pings). Pulls older than 12 hours when first seen are skipped.
//   FUT board      /manager → Club Life → FUT Board, and by itself on Sunday evening (server timezone): club value,
//                  trading profit, Champs/Rivals record and best pull this week for members who share.
//   Who has it?    /manager → Club Life → Who Has This Card: which sharing members own a card with that name.
//   Draft night    /manager → Club Life → FUT Draft Night (leaders): posts a draft code; everyone drafts the same
//                  options on the website, and Results shows the server's best scores on that code.
// fut-api does the reading (jobs club-pulls, club-board, club-whohas); this file maps website accounts to the
// server's members through verified Discord links. Read-only: nothing touches anyone's EA account.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { activeClubs } = require('./manager-hub.cjs');
const T = require('./event-time.cjs');
const { clubTimezone } = require('./career.cjs');

const PULLS_EVERY_MS = 15 * 60 * 1000;
const MEMBERS_TTL_MS = 10 * 60 * 1000;
const BOARD_DAY = 0; // Sunday
const BOARD_HOUR = 18;

const futOn = () => process.env.FUT_ENABLED === 'true' && process.env.FUT_CLUB !== 'off';
const coins = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const signed = (n) => `${n >= 0 ? '+' : '−'}${coins(Math.abs(n))}`;

/** One board line per member, best club value first. Pure. */
function boardLines(rows, nameOf) {
  return [...rows]
    .sort((a, b) => (b.club_value ?? -1) - (a.club_value ?? -1))
    .map((r, i) => {
      const bits = [];
      if (r.club_value !== null && r.club_value !== undefined) bits.push(`club ${coins(r.club_value)}`);
      if (r.trade_profit_week !== null && r.trade_profit_week !== undefined) bits.push(`trading ${signed(r.trade_profit_week)} (${r.flips_week} flips)`);
      if (r.champs) bits.push(`${r.champs.w}W ${r.champs.d}D ${r.champs.l}L`);
      if (r.best_pull) bits.push(`best pull ${r.best_pull.name ? `${r.best_pull.name} ` : ''}${r.best_pull.rating}`);
      return `**${i + 1}. ${nameOf(r.user_id)}** · ${bits.length ? bits.join(' · ') : 'nothing synced this week'}`;
    });
}

/** The trading, Champs and pull leaders for the week. Pure. */
function boardHighlights(rows, nameOf) {
  const out = [];
  const trader = [...rows].filter((r) => typeof r.trade_profit_week === 'number').sort((a, b) => b.trade_profit_week - a.trade_profit_week)[0];
  if (trader && trader.trade_profit_week > 0) out.push(`💰 Top trader: **${nameOf(trader.user_id)}** ${signed(trader.trade_profit_week)}`);
  const champ = [...rows].filter((r) => r.champs && r.champs.w + r.champs.d + r.champs.l >= 3).sort((a, b) => b.champs.w / (b.champs.w + b.champs.d + b.champs.l) - a.champs.w / (a.champs.w + a.champs.d + a.champs.l) || b.champs.w - a.champs.w)[0];
  if (champ) out.push(`🏆 Best record: **${nameOf(champ.user_id)}** ${champ.champs.w}W ${champ.champs.d}D ${champ.champs.l}L`);
  const pull = [...rows].filter((r) => r.best_pull).sort((a, b) => b.best_pull.rating - a.best_pull.rating)[0];
  if (pull) out.push(`🃏 Pull of the week: **${nameOf(pull.user_id)}** · ${pull.best_pull.name ? `${pull.best_pull.name} ` : ''}${pull.best_pull.rating}`);
  return out;
}

function createFutClub({ supabase, callFunction, autopilot, events, getGuildState, dashboardUrl }) {
  const client = () => events.getClient();
  const site = (dashboardUrl || 'https://gafferbot.app').replace(/\/$/, '');
  const memberCache = new Map();
  let lastPulls = 0;
  const tzOf = async (guildId) => clubTimezone(await events.serverPrefs(guildId).catch(() => ({})));

  async function job(body) {
    const { data, error } = await callFunction('fut-api', body, 120000);
    if (error) throw new Error(`${body.job}: ${error?.message || error}`);
    return data?.data ?? data;
  }

  async function links() {
    const { data, error } = await supabase.from('user_discord_links').select('auth_user_id, discord_user_id').eq('verified', true).limit(5000);
    if (error) throw new Error(`discord links: ${error.message}`);
    return data || [];
  }

  /** Website accounts of this server's members: Map auth_user_id → discord_user_id. Cached 10 minutes. */
  async function memberUsers(guild) {
    const hit = memberCache.get(guild.id);
    if (hit && Date.now() - hit.at < MEMBERS_TTL_MS) return hit.users;
    const all = await links();
    const users = new Map();
    const ids = [...new Set(all.map((l) => l.discord_user_id))];
    for (let i = 0; i < ids.length; i += 100) {
      const found = await guild.members.fetch({ user: ids.slice(i, i + 100) }).catch(() => null);
      for (const l of all) if (found?.has?.(l.discord_user_id)) users.set(l.auth_user_id, l.discord_user_id);
    }
    memberCache.set(guild.id, { at: Date.now(), users });
    return users;
  }

  /** The club in this server that posts FUT things: the first active club with the feature on. */
  async function futClub(guildId) {
    const state = await getGuildState(guildId);
    return activeClubs(state).find((c) => autopilot.isOn(c, 'fut')) || null;
  }

  async function postPulls() {
    const { deliveries = [] } = await job({ job: 'club-pulls' });
    if (!deliveries.length) return { posted: 0 };
    const discordOf = new Map((await links()).map((l) => [l.auth_user_id, l.discord_user_id]));
    let posted = 0;
    for (const guild of client()?.guilds.cache.values() || []) {
      const club = await futClub(guild.id);
      if (!club) continue;
      const here = [];
      for (const d of deliveries) {
        const to = discordOf.get(d.user_id);
        if (to && (await guild.members.fetch(to).catch(() => null))) here.push({ ...d, to });
      }
      if (!here.length) continue;
      const channel = await autopilot.postChannel(guild.id, club);
      if (!channel) continue;
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle(here.length === 1 ? '🃏 Pack pull' : `🃏 ${here.length} pack pulls`)
        .setDescription(here.map((d) => `<@${d.to}> ${d.text}`).join('\n').slice(0, 4000))
        .setFooter({ text: 'Shared by the players themselves from XI Lab. Turn it on or off on the website: FUT → My Account.' });
      const ok = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).then(() => true).catch((err) => { console.warn(`[futclub] pulls ${guild.id}: ${err.message}`); return false; });
      if (ok) posted += here.length;
    }
    if (posted) console.log(`🃏 fut-club: ${posted} pulls posted`);
    return { posted };
  }

  async function boardEmbed(guild, club) {
    const users = await memberUsers(guild);
    const { rows = [] } = users.size ? await job({ job: 'club-board', user_ids: [...users.keys()] }) : { rows: [] };
    const nameOf = (id) => {
      const m = guild.members.cache.get(users.get(id));
      return m?.displayName || 'A member';
    };
    const embed = new EmbedBuilder().setColor(0xd4af37).setTitle(`🃏 ${club?.name || guild.name} · FUT board, last 7 days`);
    if (!rows.length) {
      return embed.setDescription(`Nobody here shares their FUT yet. Link Discord on the website, then switch on **Share with my Discord club** under FUT → My Account (${site}/fut/account).`);
    }
    const highlights = boardHighlights(rows, nameOf);
    return embed
      .setDescription([...highlights, highlights.length ? '' : null, ...boardLines(rows, nameOf)].filter((x) => x !== null).join('\n').slice(0, 4000))
      .setFooter({ text: 'Club value after EA tax from FUT.GG prices; trading and pulls from XI Lab; Champs from games players logged. Only players who opted in.' });
  }

  async function whoHasReply(guild, query) {
    const users = await memberUsers(guild);
    if (!users.size) return { content: 'Nobody here has linked Discord on the website yet.' };
    const { owners = [] } = await job({ job: 'club-whohas', user_ids: [...users.keys()], query });
    if (!owners.length) return { content: `Nobody who shares their club here has a card matching **${String(query).slice(0, 60)}**. Players choose to share on the website: FUT → My Account.` };
    const lines = owners.slice(0, 20).map((o) => `<@${users.get(o.user_id)}> · ${o.cards.map((c) => `${c.name} ${c.rating ?? ''}${c.version ? ` (${c.version})` : ''}`.trim()).join(', ')}`);
    return { embeds: [new EmbedBuilder().setColor(0xd4af37).setTitle(`🔎 Who has "${String(query).slice(0, 60)}"`).setDescription(lines.join('\n').slice(0, 4000))], allowedMentions: { parse: [] } };
  }

  const newCode = () => Array.from({ length: 6 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');

  /** A draft night post: the code, the link, and a Results button. */
  function draftNightPost(club, code = newCode()) {
    const url = `${site}/fut/draft?seed=${code}`;
    const embed = new EmbedBuilder().setColor(0xd4af37).setTitle(`🎲 ${club?.name || 'Club'} FUT Draft Night`)
      .setDescription(`Everyone gets the same 5 options per slot. Pick your XI, then press **Results** to see who built the best team.\nCode: **${code}**`)
      .setFooter({ text: 'Score = team rating + team chemistry. Real FC 27 cards from FUT.GG; nothing touches your EA club.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setURL(url).setLabel('Draft now').setStyle(ButtonStyle.Link),
      new ButtonBuilder().setCustomId(`fd_res:${code}`).setLabel('Results').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row], code };
  }

  async function draftResults(guild, code) {
    const users = await memberUsers(guild);
    const { rows = [] } = users.size ? await job({ job: 'draft-board', seed: code, user_ids: [...users.keys()] }) : { rows: [] };
    const embed = new EmbedBuilder().setColor(0xd4af37).setTitle(`🎲 Draft ${code} · results`);
    if (!rows.length) return { embeds: [embed.setDescription(`Nobody here has finished draft **${code}** yet. Results count players who linked Discord on the website.`)] };
    const medal = ['🥇', '🥈', '🥉'];
    return { embeds: [embed.setDescription(rows.slice(0, 20).map((r, i) => `${medal[i] || `${i + 1}.`} <@${users.get(r.user_id)}> · **${r.score}** (${r.rating} rated, ${r.chemistry} chem, ${r.formation})`).join('\n'))], allowedMentions: { parse: [] } };
  }

  async function handleComponent(interaction) {
    const [action, code] = (interaction.customId || '').split(':');
    if (action !== 'fd_res' || !/^[a-z0-9]{6,16}$/.test(code || '')) return false;
    await interaction.deferReply({ flags: 64 });
    await interaction.editReply(await draftResults(interaction.guild, code).catch((err) => ({ content: `❌ ${err.message}` })));
    return true;
  }

  async function weeklyBoards(now) {
    for (const guild of client()?.guilds.cache.values() || []) {
      const club = await futClub(guild.id);
      if (!club) continue;
      const local = T.localParts(now, await tzOf(guild.id));
      if (local.weekday !== BOARD_DAY || local.hour < BOARD_HOUR) continue;
      const week = `${local.year}-${local.month}-${local.day}`;
      if (club.autopilot?.fut_board === week) continue;
      await autopilot.updateClub(guild.id, club.key, (ap) => { ap.fut_board = week; });
      const users = await memberUsers(guild);
      if (users.size < 2) continue;
      const embed = await boardEmbed(guild, club);
      if (!embed.data.footer) continue; // nobody shares
      const channel = await autopilot.postChannel(guild.id, club);
      await channel?.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((err) => console.warn(`[futclub] board ${guild.id}: ${err.message}`));
    }
  }

  async function tick(now) {
    if (!futOn() || !callFunction) return;
    if (now.getTime() - lastPulls >= PULLS_EVERY_MS) {
      lastPulls = now.getTime();
      await postPulls().catch((err) => console.warn(`[futclub] pulls failed: ${err.message}`));
    }
    await weeklyBoards(now).catch((err) => console.warn(`[futclub] boards failed: ${err.message}`));
  }

  events.onTick((now) => tick(now).catch((err) => console.warn(`[futclub] tick failed: ${err.message}`)));

  return { postPulls, boardEmbed, whoHasReply, memberUsers, futClub, tick, draftNightPost, draftResults, handleComponent, enabled: futOn };
}

module.exports = { createFutClub, boardLines, boardHighlights };
