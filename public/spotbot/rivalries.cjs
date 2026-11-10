// Rivalries: any club we've played 3+ times becomes a named rival with a head-to-head record.
//   After a game against a rival, the recap gets one line on what it did to the head-to-head
//   (a run extended, a hoodoo broken, the series levelled). /manager → Club Life → Rivals lists them,
//   and club_rivalries keeps a copy for the website's Trophy Room. Pure helpers first.

const { EmbedBuilder } = require('discord.js');

const RIVAL_MIN = 3;
const DERBY_MIN = 10;
const SHOW = 10;
const SYNC_EVERY_MS = 24 * 60 * 60 * 1000;

const known = (o) => o && o !== 'Unknown';
const tag = { win: 'W', draw: 'D', loss: 'L' };

// Pure: head-to-head per opponent, most-played first. matches are insight matches (any order)
function rivalryTable(matches, { min = RIVAL_MIN } = {}) {
  const by = new Map();
  for (const m of [...matches].sort((a, b) => a.playedAt - b.playedAt)) {
    if (!known(m.opponent)) continue;
    const r = by.get(m.opponent) || { opponent: m.opponent, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, results: [], biggestWin: null, last: null };
    r.games++;
    if (m.result === 'win') r.wins++;
    else if (m.result === 'draw') r.draws++;
    else r.losses++;
    r.gf += m.scoreFor || 0;
    r.ga += m.scoreAgainst || 0;
    r.results.push(m.result);
    const margin = (m.scoreFor || 0) - (m.scoreAgainst || 0);
    if (m.result === 'win' && (!r.biggestWin || margin > r.biggestWin.margin)) r.biggestWin = { margin, score: `${m.scoreFor}-${m.scoreAgainst}`, at: m.playedAt.toISOString() };
    r.last = { result: m.result, score: `${m.scoreFor}-${m.scoreAgainst}`, at: m.playedAt.toISOString(), id: m.id ?? null };
    by.set(m.opponent, r);
  }
  return [...by.values()]
    .filter((r) => r.games >= min)
    .map((r) => {
      const { results, ...rest } = r;
      const lastResult = results[results.length - 1];
      let streak = 0;
      for (let i = results.length - 1; i >= 0 && results[i] === lastResult; i--) streak++;
      return { ...rest, level: r.games >= DERBY_MIN ? 'derby' : 'rival', streak: { result: lastResult, count: streak }, form: results.slice(-5).map((x) => tag[x]).join('') };
    })
    .sort((a, b) => b.games - a.games || b.last.at.localeCompare(a.last.at));
}

const record = (r) => `${r.wins}W ${r.draws}D ${r.losses}L`;

function rivalLine(r) {
  return `${r.level === 'derby' ? '🔥' : '⚔️'} **${r.opponent}** · ${r.games} meetings · ${record(r)} · ${r.gf}-${r.ga} · form ${r.form}`;
}

// Pure: what one game did to the head-to-head, or null when it's not a rivalry (yet)
function rivalMoment(match, matches) {
  if (!known(match.opponent)) return null;
  const upTo = matches.filter((m) => m.opponent === match.opponent && m.playedAt <= match.playedAt);
  const before = upTo.filter((m) => m !== match && m.id !== match.id);
  const r = rivalryTable(upTo, { min: 1 })[0];
  if (!r || r.games < RIVAL_MIN) return null;
  const opp = `**${match.opponent}**`;
  const prev = rivalryTable(before, { min: 1 })[0];
  let text;
  if (r.games === RIVAL_MIN) text = `${opp} are officially rivals now: ${RIVAL_MIN} meetings, ${record(r)}.`;
  else if (r.games === DERBY_MIN) text = `Meeting number ${DERBY_MIN} with ${opp}: this one's a derby now (${record(r)}).`;
  else if (match.result === 'win' && prev && prev.wins === 0) text = `First ever win over ${opp}, at attempt number ${r.games}.`;
  else if (match.result === 'win' && prev?.streak.result === 'loss' && prev.streak.count >= 3) text = `Hoodoo broken: a win over ${opp} after ${prev.streak.count} straight defeats.`;
  else if (r.streak.count >= 3) text = `That's ${r.streak.count} ${r.streak.result === 'win' ? 'wins' : r.streak.result === 'draw' ? 'draws' : 'defeats'} in a row against ${opp}.`;
  else if (prev && prev.wins !== prev.losses && r.wins === r.losses) text = `All square with ${opp} again: ${record(r)} in ${r.games} meetings.`;
  else if (prev && prev.wins <= prev.losses && r.wins > r.losses) text = `We lead the head-to-head with ${opp} now: ${record(r)}.`;
  else text = `Head-to-head with ${opp}: ${record(r)} in ${r.games} meetings.`;
  return `⚔️ ${text}`;
}

function rivalsEmbed(club, table, color) {
  const embed = new EmbedBuilder().setTitle(`⚔️ ${club.name} rivals`).setColor(color ?? 0xdc2626);
  if (!table.length) return embed.setDescription(`No rivals yet. Any club you play ${RIVAL_MIN} or more times becomes one.`);
  embed.setDescription(table.slice(0, SHOW).map(rivalLine).join('\n'));
  const nemesis = [...table].filter((r) => r.losses > r.wins).sort((a, b) => b.losses - b.wins - (a.losses - a.wins))[0];
  const favourite = [...table].filter((r) => r.wins > r.losses).sort((a, b) => b.wins - b.losses - (a.wins - a.losses))[0];
  if (nemesis) embed.addFields({ name: '😈 Nemesis', value: `**${nemesis.opponent}** · ${record(nemesis)}`, inline: true });
  if (favourite) embed.addFields({ name: '😁 Favourite opponent', value: `**${favourite.opponent}** · ${record(favourite)}`, inline: true });
  embed.setFooter({ text: `${table.length} rival${table.length === 1 ? '' : 's'} · ${DERBY_MIN}+ meetings makes it a derby 🔥` });
  return embed;
}

function createRivalries({ supabase, autopilot, loadMatches }) {
  const syncedAt = new Map();

  async function tableFor(guildId, clubKey, matches = null) {
    return rivalryTable(matches || (await loadMatches(guildId, clubKey).catch(() => [])));
  }

  // Website copy: one row per rival, replaced wholesale
  async function sync(guildId, clubKey, matches = null) {
    const table = await tableFor(guildId, clubKey, matches);
    syncedAt.set(`${guildId}:${clubKey}`, Date.now());
    const now = new Date().toISOString();
    const rows = table.map((r) => ({
      guild_id: guildId,
      club_key: clubKey,
      opponent: r.opponent,
      level: r.level,
      games: r.games,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goals_for: r.gf,
      goals_against: r.ga,
      form: r.form,
      streak: r.streak,
      biggest_win: r.biggestWin,
      last_result: r.last,
      updated_at: now,
    }));
    if (rows.length) {
      const { error } = await supabase.from('club_rivalries').upsert(rows, { onConflict: 'guild_id,club_key,opponent' });
      if (error) throw new Error(error.message);
    }
    await supabase.from('club_rivalries').delete().eq('guild_id', guildId).eq('club_key', clubKey).lt('updated_at', now);
    return table;
  }

  // Recap line for a game against a rival
  autopilot.onRecapExtra?.(async (guildId, club, match) => {
    if (!autopilot.isOn(club, 'rivals')) return null;
    const all = await loadMatches(guildId, club.key).catch(() => []);
    return rivalMoment(match, all);
  });
  autopilot.onNewMatches?.((guildId, club) => sync(guildId, club.key).catch((err) => console.warn(`[rivals] sync failed: ${err.message}`)));

  // Daily refresh so the website fills in before the next game
  async function tick(guildId, club) {
    if (Date.now() - (syncedAt.get(`${guildId}:${club.key}`) || 0) < SYNC_EVERY_MS) return;
    await sync(guildId, club.key);
  }

  return { tableFor, sync, tick, view: async (guildId, club, color) => ({ embeds: [rivalsEmbed(club, await tableFor(guildId, club.key), color)] }) };
}

module.exports = { createRivalries, rivalryTable, rivalMoment, rivalLine, rivalsEmbed, RIVAL_MIN, DERBY_MIN };
