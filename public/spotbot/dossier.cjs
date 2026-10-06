// Premium: /scout opponent, a pre-match dossier on another club from its recent EA matches.
// EA's match data is per-player box scores: goals, assists, shots, passes, tackles, saves, rating
// and a broad position (goalkeeper / defender / midfielder / forward). It has no formations, no
// event times and no shot locations, so:
//   - "shape" is inferred by counting their human players per line, and labelled as inferred
//   - nothing here claims what they do when trailing or after a given minute
// Everything else is a straight count from those box scores.

const { EmbedBuilder } = require('discord.js');
const { findExactClubMatch } = require('./ea-fc27.cjs');

const MAX_GAMES = 20;
const MIN_PLAYER_GAMES = 3;
const FULL_SIDE = 10; // humans needed before a match says anything about their shape
const LINE = { goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD' };

const DOSSIER_SUBCOMMAND = {
  type: 1,
  name: 'opponent',
  description: 'Premium: tactical dossier on a club from its last 20 EA matches.',
  options: [
    { name: 'club', description: 'Their EA club name.', type: 3, required: true, max_length: 40 },
    {
      name: 'platform',
      description: 'Their platform (defaults to your club).',
      type: 3,
      required: false,
      choices: [
        { name: 'PS5 / Xbox Series / PC', value: 'common-gen5' },
        { name: 'PS4 / Xbox One', value: 'common-gen4' },
        { name: 'Nintendo Switch', value: 'nx' },
      ],
    },
  ],
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function pct(a, b) {
  return b ? Math.round((100 * a) / b) : null;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// Pure: turn raw EA match objects into the numbers the dossier talks about
function analyseOpponent(matches, clubId) {
  const id = String(clubId);
  const games = [];
  for (const m of matches) {
    const us = m.clubs?.[id];
    if (!us) continue;
    const players = Object.values(m.players?.[id] || {});
    const gf = n(us.goals ?? us.score);
    const ga = n(us.goalsAgainst);
    games.push({
      at: n(m.timestamp) * 1000,
      gf,
      ga,
      result: gf > ga ? 'win' : gf < ga ? 'loss' : 'draw',
      opponent: Object.entries(m.clubs).find(([k]) => k !== id)?.[1]?.details?.name || 'Unknown',
      players,
    });
  }
  games.sort((a, b) => b.at - a.at);
  const recent = games.slice(0, MAX_GAMES);
  const total = recent.length;
  const sum = (f) => recent.reduce((s, g) => s + f(g), 0);
  const record = { win: 0, draw: 0, loss: 0 };
  recent.forEach((g) => record[g.result]++);

  // Inferred shape: count of human DEF-MID-FWD in games where they had (nearly) a full side
  const shapes = new Map();
  let humansSum = 0;
  let aiKeeper = 0;
  const bySize = { full: { games: 0, wins: 0 }, short: { games: 0, wins: 0 } };
  for (const g of recent) {
    const lines = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of g.players) lines[LINE[String(p.pos).toLowerCase()] || 'MID']++;
    humansSum += g.players.length;
    if (!lines.GK) aiKeeper++;
    const size = g.players.length >= FULL_SIDE ? 'full' : 'short';
    bySize[size].games++;
    if (g.result === 'win') bySize[size].wins++;
    if (g.players.length >= FULL_SIDE) {
      const key = `${lines.DEF}-${lines.MID}-${lines.FWD}`;
      if (!shapes.has(key)) shapes.set(key, { shape: key, games: 0, wins: 0, losses: 0 });
      const s = shapes.get(key);
      s.games++;
      if (g.result === 'win') s.wins++;
      if (g.result === 'loss') s.losses++;
    }
  }
  const shapeList = [...shapes.values()].sort((a, b) => b.games - a.games);
  // Average humans per line, for clubs that rarely field a full side
  const perLine = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const g of recent) for (const p of g.players) perLine[LINE[String(p.pos).toLowerCase()] || 'MID']++;
  const humansByLine = Object.fromEntries(Object.entries(perLine).map(([k, v]) => [k, total ? v / total : 0]));
  const shapedGames = shapeList.reduce((s, x) => s + x.games, 0);

  // Players
  const people = new Map();
  for (const g of recent) {
    for (const p of g.players) {
      const name = String(p.playername || '').trim();
      if (!name) continue;
      if (!people.has(name))
        people.set(name, {
          name,
          games: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          passes: 0,
          passAttempts: 0,
          tackles: 0,
          tackleAttempts: 0,
          saves: 0,
          conceded: 0,
          ratingSum: 0,
          rated: 0,
          reds: 0,
          motm: 0,
          lines: {},
        });
      const t = people.get(name);
      const line = LINE[String(p.pos).toLowerCase()] || 'MID';
      t.games++;
      t.goals += n(p.goals);
      t.assists += n(p.assists);
      t.shots += n(p.shots);
      t.passes += n(p.passesmade);
      t.passAttempts += n(p.passattempts);
      t.tackles += n(p.tacklesmade);
      t.tackleAttempts += n(p.tackleattempts);
      t.saves += n(p.saves);
      if (line === 'GK') t.conceded += g.ga;
      // EA gives 3.0 to players who left early; leave those out of averages
      if (n(p.rating) > 3) {
        t.ratingSum += n(p.rating);
        t.rated++;
      }
      if (n(p.redcards)) t.reds++;
      if (String(p.mom) === '1') t.motm++;
      t.lines[line] = (t.lines[line] || 0) + 1;
    }
  }
  const roster = [...people.values()].map((t) => ({
    ...t,
    line: Object.entries(t.lines).sort((a, b) => b[1] - a[1])[0][0],
    rating: t.rated ? t.ratingSum / t.rated : 0,
  }));
  const teamShots = roster.reduce((s, t) => s + t.shots, 0);
  const teamGoals = sum((g) => g.gf);
  const regulars = roster.filter((t) => t.games >= Math.min(MIN_PLAYER_GAMES, Math.max(1, Math.ceil(total / 3))));
  const threat = (t) => (t.goals + 0.7 * t.assists) / t.games;
  const danger = [...regulars].filter((t) => t.goals + t.assists > 0).sort((a, b) => threat(b) - threat(a))[0] || null;
  const creator = [...regulars].filter((t) => t !== danger && t.assists > 0).sort((a, b) => b.assists / b.games - a.assists / a.games)[0] || null;
  const keepers = roster.filter((t) => t.line === 'GK');
  const gkSaves = keepers.reduce((s, t) => s + t.saves, 0);
  const gkConceded = keepers.reduce((s, t) => s + t.conceded, 0);
  const defenders = regulars.filter((t) => t.line === 'DEF').sort((a, b) => a.rating - b.rating);
  const passes = roster.reduce((s, t) => s + t.passes, 0);
  const passAttempts = roster.reduce((s, t) => s + t.passAttempts, 0);
  const tackles = roster.reduce((s, t) => s + t.tackles, 0);
  const tackleAttempts = roster.reduce((s, t) => s + t.tackleAttempts, 0);

  return {
    total,
    record,
    goalsFor: teamGoals,
    goalsAgainst: sum((g) => g.ga),
    cleanSheets: recent.filter((g) => g.ga === 0).length,
    blanks: recent.filter((g) => g.gf === 0).length,
    form: recent.slice(0, 5).map((g) => g.result),
    avgHumans: total ? humansSum / total : 0,
    aiKeeper,
    bySize,
    shapes: shapeList,
    shapedGames,
    humansByLine,
    danger: danger && { ...danger, shotShare: pct(danger.shots, teamShots), conversion: pct(danger.goals, danger.shots) },
    creator,
    keeper: keepers.length
      ? {
          names: keepers.sort((a, b) => b.games - a.games).map((k) => k.name),
          savePct: pct(gkSaves, gkSaves + gkConceded),
          saves: gkSaves,
          conceded: gkConceded,
        }
      : null,
    weakDefender: defenders.length >= 2 ? { ...defenders[0], tacklePct: pct(defenders[0].tackles, defenders[0].tackleAttempts) } : null,
    passPct: pct(passes, passAttempts),
    tacklePct: pct(tackles, tackleAttempts),
    conversion: pct(teamGoals, teamShots),
    reds: roster.reduce((s, t) => s + t.reds, 0),
    last: recent.slice(0, 5),
  };
}

// Plain-English bullets for the manager; each says what it is based on
function gamePlan(a) {
  const tips = [];
  if (a.danger && a.danger.shotShare >= 30) tips.push(`Shut down **${a.danger.name}**: ${a.danger.shotShare}% of their shots come from them.`);
  else if (a.danger) tips.push(`Track **${a.danger.name}**, their main goal threat.`);
  if (a.keeper && a.keeper.savePct != null && a.keeper.savePct < 65 && a.keeper.saves + a.keeper.conceded >= 10)
    tips.push(`Test the keeper early: they save only ${a.keeper.savePct}% of the shots that reach goal.`);
  if (a.aiKeeper >= Math.ceil(a.total / 2)) tips.push(`They usually play an AI keeper (${a.aiKeeper} of ${a.total} games). Shoot from range.`);
  if (a.passPct != null && a.passPct < 75) tips.push(`Press them: they complete only ${a.passPct}% of passes.`);
  if (a.passPct != null && a.passPct >= 85) tips.push(`They keep the ball well (${a.passPct}% passing). Stay compact and win it back in midfield.`);
  if (a.weakDefender && a.weakDefender.rating < 6.8)
    tips.push(`Run at **${a.weakDefender.name}**, their lowest-rated regular defender (${a.weakDefender.rating.toFixed(1)}).`);
  const full = a.bySize.full;
  const short = a.bySize.short;
  if (full.games >= 3 && short.games >= 3) {
    const fw = pct(full.wins, full.games);
    const sw = pct(short.wins, short.games);
    if (fw - sw >= 20) tips.push(`They are much weaker short-handed: ${fw}% wins with ${FULL_SIDE}+ players, ${sw}% with fewer.`);
  }
  if (a.goalsAgainst / Math.max(a.total, 1) >= 2) tips.push(`They leak goals (${(a.goalsAgainst / a.total).toFixed(1)} a game). Commit numbers forward.`);
  return tips.slice(0, 6);
}

function dossierEmbed(club, a) {
  const RES = { win: '🟢', draw: '⚪', loss: '🔴' };
  const embed = new EmbedBuilder()
    .setTitle(`🕵️ Scouting dossier · ${club.name}`)
    .setColor(0x0ea5e9)
    .setDescription(
      `Last **${a.total}** competitive matches: **${a.record.win}W-${a.record.draw}D-${a.record.loss}L**, ${a.goalsFor} scored (${(a.goalsFor / a.total).toFixed(1)}/game), ${a.goalsAgainst} conceded (${(a.goalsAgainst / a.total).toFixed(1)}/game).\n` +
        `Form ${a.form
          .slice()
          .reverse()
          .map((r) => RES[r])
          .join('')} · ${a.last
          .map((g) => `${g.gf}-${g.ga} ${g.opponent}`)
          .slice(0, 3)
          .join(', ')}`,
    );

  // Shape
  let shape;
  if (a.shapes.length && a.shapedGames >= 2) {
    const top = a.shapes[0];
    shape = `**${top.shape}** (DEF-MID-FWD) in ${pct(top.games, a.shapedGames)}% of full-squad games (${top.wins}W of ${top.games}).`;
    const next = a.shapes[1];
    if (next) shape += `\nAlso **${next.shape}** in ${pct(next.games, a.shapedGames)}% (${next.wins}W of ${next.games}).`;
  } else {
    const h = a.humansByLine;
    shape = `They rarely field ${FULL_SIDE}+ humans. A typical game has ${h.DEF.toFixed(1)} DEF, ${h.MID.toFixed(1)} MID and ${h.FWD.toFixed(1)} FWD humans, the rest AI.`;
  }
  shape += `\nAvg **${a.avgHumans.toFixed(1)}** humans a game${a.aiKeeper ? `, AI keeper in ${a.aiKeeper}` : ''}.`;
  embed.addFields({ name: '📐 Formation shape (inferred)', value: shape });

  if (a.danger) {
    const d = a.danger;
    embed.addFields({
      name: '🚨 Danger man',
      value:
        `**${d.name}** (${d.line}): ${plural(d.goals, 'goal')} and ${plural(d.assists, 'assist')} in ${plural(d.games, 'game')}, ${d.rating.toFixed(1)} avg rating.\n` +
        `Takes ${d.shotShare ?? 0}% of their shots and scores ${d.conversion ?? 0}% of them.` +
        (a.creator ? `\nSupply line: **${a.creator.name}** (${plural(a.creator.assists, 'assist')} in ${a.creator.games}).` : ''),
    });
  }

  const weak = [];
  if (a.keeper && a.keeper.savePct != null)
    weak.push(
      `Keeper${a.keeper.names.length > 1 ? 's' : ''} ${a.keeper.names.slice(0, 2).join(', ')}: **${a.keeper.savePct}%** of shots on goal saved (${a.keeper.saves} saves, ${a.keeper.conceded} conceded).`,
    );
  if (a.weakDefender)
    weak.push(
      `Weakest regular defender: **${a.weakDefender.name}**, ${a.weakDefender.rating.toFixed(1)} avg rating${a.weakDefender.tacklePct != null ? `, wins ${a.weakDefender.tacklePct}% of tackles` : ''}.`,
    );
  if (a.passPct != null) weak.push(`Team passing ${a.passPct}%, tackling ${a.tacklePct ?? '–'}%, shot conversion ${a.conversion ?? '–'}%.`);
  weak.push(`${plural(a.cleanSheets, 'clean sheet')}, failed to score in ${a.blanks}.${a.reds ? ` ${plural(a.reds, 'red card')}.` : ''}`);
  embed.addFields({ name: '🎯 Vulnerabilities', value: weak.join('\n') });

  const plan = gamePlan(a);
  if (plan.length) embed.addFields({ name: '📝 Game plan', value: plan.map((t) => `• ${t}`).join('\n') });
  embed.setFooter({ text: 'From EA box scores. Shape is inferred from player positions; EA does not publish formations, event times or shot locations.' });
  return embed;
}

function createDossier(deps) {
  const { premium, getGuildState, searchClub, matchesStats } = deps;

  async function handle(interaction) {
    await interaction.deferReply();
    if (!(await premium.gate(interaction, 'The opponent dossier'))) return;
    const name = interaction.options.getString('club').trim();
    const state = await getGuildState(interaction.guildId);
    const ownPlatform = (state?.clubs || []).find((c) => c.ea_platform)?.ea_platform;
    const platform = interaction.options.getString('platform') || ownPlatform || 'common-gen5';

    const results = await searchClub({ name, platform }).catch(() => []);
    if (!results.length)
      return interaction.editReply({ content: `❌ EA has no club called **${name}** on that platform. Check the spelling or pick the platform.` });
    const club = findExactClubMatch(results, name) || results[0];

    const lists = await Promise.all(
      ['leagueMatch', 'playoffMatch'].map((matchType) => matchesStats({ clubId: club.clubId, platform: club.platform || platform, matchType }).catch(() => [])),
    );
    let matches = lists.flat();
    if (matches.length < 5)
      matches = matches.concat(await matchesStats({ clubId: club.clubId, platform: club.platform || platform, matchType: 'friendlyMatch' }).catch(() => []));
    const a = analyseOpponent(matches, club.clubId);
    if (!a.total) return interaction.editReply({ content: `**${club.name}** has no recent matches on EA's servers, so there is nothing to scout yet.` });
    const others = results.length > 1 && !findExactClubMatch(results, name) ? `Closest match for "${name}". Not them? Use their exact club name.` : null;
    return interaction.editReply({ content: others, embeds: [dossierEmbed(club, a)] });
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'scout') return false;
    if (interaction.options.getSubcommand(false) !== 'opponent') return false;
    await handle(interaction);
    return true;
  }

  return { handleInteraction };
}

module.exports = { createDossier, analyseOpponent, gamePlan, dossierEmbed, DOSSIER_SUBCOMMAND };
