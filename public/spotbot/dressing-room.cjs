// Dressing Room: banter that settles group-chat arguments with real match numbers. The maths is
// src/lib/banter.ts (bundled in club-insights.cjs); this file builds the embeds and buttons.
//   Fun Zone → Dressing Room   rankings (Paper Tiger, Main Character, Invisible Man, Loss Magnet,
//                              Stat Padder, Ball Hog) for tonight, this week or all time
//   Fun Zone → Superlatives    most likely to score, to miss, the Architect, the Wall...
//   Fun Zone → Receipts        better without you, better together, who gets the shirt, head to head
// Everything opens just for the person who pressed it, with a "Post it" button to drop it in the channel.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { banterWindow, banterRankings, superlatives, betterWithout, betterTogether, whoGetsTheShirt, headToHead, playerLines } = require('./club-insights.cjs');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');

const COLOR = 0xf97316;
const WINDOWS = { session: 'Tonight', week: 'This week', all: 'All time' };
const MIN_GAMES = { session: 1, week: 2, all: 3 };

function truncate(text, max = 1024) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const one = (v) => (v === null || v === undefined ? '–' : v.toFixed(1));
const record = (s) => `${s.wins}W ${s.draws}D ${s.losses}L`;
const splitLine = (label, s) => (s.games ? `**${label}** (${s.games}): ${record(s)} · ${s.pointsPerGame.toFixed(2)} pts a game · ${one(s.goalsFor)}-${one(s.goalsAgainst)}` : `**${label}**: no games`);

function minGamesFor(window, matches) {
  return window === 'all' && matches.length >= 40 ? 5 : MIN_GAMES[window];
}

// matches: InsightMatch[]
function rankingsEmbed(club, matches, window = 'all') {
  const ms = banterWindow(matches, window);
  const embed = new EmbedBuilder().setColor(COLOR).setTitle(`🚪 Dressing Room: ${club.name || 'the club'} · ${WINDOWS[window]}`);
  const rankings = banterRankings(ms, minGamesFor(window, ms));
  if (!rankings.length) return embed.setDescription('Nobody is guilty of anything yet. Play a few more games and come back.');
  embed.setDescription(`The squad's rankings from ${ms.length} game${ms.length === 1 ? '' : 's'}. Every line quotes the real numbers.`);
  for (const r of rankings.slice(0, 6)) {
    const [top, ...rest] = r.entries;
    const runners = rest.slice(0, 2).map((e) => e.name);
    embed.addFields({
      name: `${r.emoji} ${r.title}`,
      value: truncate(`**${top.name}** · ${top.verdict}\n${top.line}${runners.length ? `\n-# Also in the frame: ${runners.join(', ')}` : ''}`),
    });
  }
  return embed.setFooter({ text: 'All in good fun · numbers from EA match data' });
}

function superlativesEmbed(club, matches, window = 'all') {
  const ms = banterWindow(matches, window);
  const embed = new EmbedBuilder().setColor(COLOR).setTitle(`🏅 Squad superlatives: ${club.name || 'the club'} · ${WINDOWS[window]}`);
  const list = superlatives(ms, minGamesFor(window, ms));
  if (!list.length) return embed.setDescription('Not enough games for the yearbook yet.');
  return embed.setDescription(list.map((s) => `${s.emoji} **${s.title}**: ${s.name} (${s.line})`).join('\n'));
}

function receiptEmbed(club, matches, kind, names) {
  const embed = new EmbedBuilder().setColor(COLOR).setTitle('🧾 Receipts');
  const [a, b] = names;
  if (kind === 'without') {
    const r = betterWithout(matches, a);
    if (!r) return embed.setDescription(`No games found for ${a}.`);
    return embed
      .setTitle(`🧾 Better without ${r.name}?`)
      .setDescription([`**${r.headline}**`, '', splitLine(`With ${r.name}`, r.with), splitLine(`Without ${r.name}`, r.without)].join('\n'))
      .setFooter({ text: 'Different games, different opponents: a receipt, not proof.' });
  }
  if (kind === 'together') {
    const r = betterTogether(matches, a, b);
    if (!r) return embed.setDescription('Pick two different players.');
    const [na, nb] = r.names;
    return embed
      .setTitle(`🧾 ${na} & ${nb}: better together?`)
      .setDescription([`**${r.headline}**`, '', splitLine('Together', r.together), splitLine(`${na} without ${nb}`, r.onlyA), splitLine(`${nb} without ${na}`, r.onlyB)].join('\n'))
      .setFooter({ text: 'Different games, different opponents: a receipt, not proof.' });
  }
  if (kind === 'shirt') {
    const r = whoGetsTheShirt(matches, a, b);
    if (!r) return embed.setDescription('Pick two different players.');
    const lines = r.players.map(
      (p) => `**${p.name}** (${p.games} game${p.games === 1 ? '' : 's'} there without the other): ${one(p.avgRating)} rating · ${p.pointsPerGame.toFixed(2)} pts a game · ${p.goalInvolvementsPerGame.toFixed(2)} G+A${p.tackleWinsPerGame !== null ? ` · ${one(p.tackleWinsPerGame)} tackles won` : ''}`
    );
    return embed.setTitle('🧾 Who gets the shirt?').setDescription([`**${r.headline}**`, '', ...lines].join('\n')).setFooter({ text: 'Points a game decide it; rating breaks a near tie. 3+ games each to call it.' });
  }
  const h = headToHead(matches, a, b);
  if (!h) return embed.setDescription('Pick two different players.');
  const [pa, pb] = h.players;
  const mark = (row, i) => (row.better === i ? `**${row.values[i]}** ✅` : row.values[i]);
  return embed
    .setTitle(`🥊 ${pa.name} vs ${pb.name}`)
    .setDescription(h.rows.map((row) => `${row.label}: ${mark(row, 0)} · ${mark(row, 1)}`).join('\n'))
    .setFooter({ text: `${pa.name} on the left · per-game numbers over each player's own games` });
}

const RECEIPTS = [
  ['without', 'Better without you?', '🚪', 1],
  ['together', 'Better together?', '🤝', 2],
  ['shirt', 'Who gets the shirt?', '👕', 2],
  ['h2h', 'Head to head', '🥊', 2],
];

function windowRow(view, window) {
  return new ActionRowBuilder().addComponents(
    ...Object.entries(WINDOWS).map(([w, label]) =>
      new ButtonBuilder().setCustomId(`dr:${view}:${w}`).setLabel(label).setStyle(w === window ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(w === window)
    ),
    new ButtonBuilder().setCustomId('dr:post').setLabel('Post it').setEmoji('📣').setStyle(ButtonStyle.Success)
  );
}

function receiptsMenu() {
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🧾 Receipts').setDescription('Settle it with the numbers. Pick an argument, then the players.')],
    components: [new ActionRowBuilder().addComponents(RECEIPTS.map(([k, label, emoji]) => new ButtonBuilder().setCustomId(`dr:kind:${k}`).setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Secondary)))],
  };
}

function playerPicker(matches, kind) {
  const [, label, , count] = RECEIPTS.find((r) => r[0] === kind) || RECEIPTS[0];
  const players = playerLines(matches, 1).sort((x, y) => y.games - x.games).slice(0, 25);
  if (players.length < count) return { embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🧾 Receipts').setDescription('Not enough players with synced games yet.')], components: [] };
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`dr:sel:${kind}`)
    .setPlaceholder(count === 1 ? 'Pick a player' : 'Pick two players')
    .setMinValues(count)
    .setMaxValues(count)
    .addOptions(players.map((p) => ({ label: p.name.slice(0, 100), value: p.key.slice(0, 100), description: `${p.games} games` })));
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`🧾 ${label}`).setDescription(count === 1 ? 'Who is on trial?' : 'Pick the two players.')],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

function receiptView(club, matches, kind, names) {
  return {
    embeds: [receiptEmbed(club, matches, kind, names)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dr:kind:${kind}`).setLabel('Another').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dr:receipts').setLabel('Other receipts').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dr:post').setLabel('Post it').setEmoji('📣').setStyle(ButtonStyle.Success)
      ),
    ],
  };
}

// Buttons for the Fun Zone panel
function dressingRoomButtons() {
  return [
    new ButtonBuilder().setCustomId('dr:open:rank').setLabel('Dressing Room').setEmoji('🚪').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dr:open:sup').setLabel('Superlatives').setEmoji('🏅').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dr:open:receipts').setLabel('Receipts').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
  ];
}

function createDressingRoom({ getGuildState, loadMatches }) {
  async function context(interaction) {
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member) || activeClubs(state)[0];
    if (!club) return { club: null, matches: [] };
    const matches = loadMatches ? await loadMatches(interaction.guildId, club.key).catch(() => []) : [];
    return { club, matches };
  }

  // Panel buttons (dr:open:*) open a private view; buttons inside that view update it in place
  async function respond(interaction, view, fromPanel = false) {
    if (fromPanel) return interaction.reply({ ...view, flags: 64 });
    return interaction.update(view);
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId || !interaction.customId?.startsWith('dr:')) return false;
    let [, action, arg] = interaction.customId.split(':');
    const fromPanel = action === 'open';
    if (fromPanel) [action, arg] = [arg, arg === 'rank' ? 'session' : 'all'];

    if (action === 'post' && interaction.isButton()) {
      const embeds = (interaction.message?.embeds || []).map((e) => EmbedBuilder.from(e).setFooter({ text: `${e.footer?.text ? `${e.footer.text} · ` : ''}posted by ${interaction.member?.displayName || interaction.user.username}` }));
      if (!embeds.length || !interaction.channel?.send) {
        await interaction.reply({ content: 'Nothing to post here.', flags: 64 });
        return true;
      }
      await interaction.channel.send({ embeds, allowedMentions: { parse: [] } });
      await interaction.update({ components: [] });
      return true;
    }

    const { club, matches } = await context(interaction);
    if (!club) {
      await interaction.reply({ content: 'Set up a club first with /setup.', flags: 64 });
      return true;
    }

    if (action === 'rank' || action === 'sup') {
      const window = WINDOWS[arg] ? arg : 'all';
      const embed = action === 'rank' ? rankingsEmbed(club, matches, window) : superlativesEmbed(club, matches, window);
      await respond(interaction, { embeds: [embed], components: [windowRow(action, window)] }, fromPanel);
      return true;
    }
    if (action === 'receipts') {
      await respond(interaction, receiptsMenu(), fromPanel);
      return true;
    }
    if (action === 'kind') {
      await interaction.update(playerPicker(matches, arg));
      return true;
    }
    if (action === 'sel' && interaction.isStringSelectMenu?.()) {
      await interaction.update(receiptView(club, matches, arg, interaction.values));
      return true;
    }
    return false;
  }

  return { handleInteraction };
}

module.exports = { createDressingRoom, dressingRoomButtons, rankingsEmbed, superlativesEmbed, receiptEmbed, playerPicker, receiptsMenu };
