// Generated from src/lib/clubInsights.ts by npm run build:bot-lib. Do not edit by hand.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/clubInsights.ts
var clubInsights_exports = {};
__export(clubInsights_exports, {
  COMPETITIONS: () => COMPETITIONS,
  MATCH_TAGS: () => MATCH_TAGS,
  SEPARATE_COMPETITIONS: () => SEPARATE_COMPETITIONS,
  competitionEmoji: () => competitionEmoji,
  competitionLabel: () => competitionLabel,
  computeCombos: () => computeCombos,
  computeCompetitionRecords: () => computeCompetitionRecords,
  computeFormations: () => computeFormations,
  computeOverview: () => computeOverview,
  computePlayerImpact: () => computePlayerImpact,
  computeWinLossGaps: () => computeWinLossGaps,
  gdPerGame: () => gdPerGame,
  generateInsights: () => generateInsights,
  isSeparateCompetition: () => isSeparateCompetition,
  matchCompetition: () => matchCompetition,
  matchTag: () => matchTag,
  playerKey: () => playerKey,
  playerStatsTypeForTag: () => playerStatsTypeForTag,
  teamMetrics: () => teamMetrics,
  toInsightMatches: () => toInsightMatches,
  winPct: () => winPct
});
module.exports = __toCommonJS(clubInsights_exports);
var MATCH_TAGS = [
  { value: "league", label: "League", emoji: "\u{1F3C6}" },
  { value: "tournament", label: "Tournament", emoji: "\u{1F3DF}\uFE0F" },
  { value: "byot", label: "BYOT", emoji: "\u{1F39F}\uFE0F" }
];
var COMPETITIONS = [
  ...MATCH_TAGS,
  { value: "cup", label: "Cup/Playoff", emoji: "\u{1F947}" },
  { value: "friendly", label: "Friendly", emoji: "\u{1F91D}" }
];
var SEPARATE_COMPETITIONS = ["tournament", "byot"];
function isSeparateCompetition(c) {
  return !!c && SEPARATE_COMPETITIONS.includes(c);
}
function playerStatsTypeForTag(tag) {
  if (tag === "tournament" || tag === "byot") return tag;
  if (tag === "league") return "club";
  return null;
}
function matchTag(row) {
  const t = row.match_data?._tag;
  return MATCH_TAGS.some((m) => m.value === t) ? t : null;
}
function eaCompetition(row) {
  const raw = String(row.match_data?._matchCategory || row.match_type || "").toLowerCase();
  if (/friendly/.test(raw)) return "friendly";
  if (/competition|cup|playoff/.test(raw)) return "cup";
  return "league";
}
function matchCompetition(row) {
  return matchTag(row) || eaCompetition(row);
}
function competitionLabel(c) {
  return COMPETITIONS.find((x) => x.value === c)?.label || "Match";
}
function competitionEmoji(c) {
  return COMPETITIONS.find((x) => x.value === c)?.emoji || "\u26BD";
}
var LINEUP_WINDOW_MS = 6 * 60 * 60 * 1e3;
function num(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function playerKey(p) {
  const name = (p.ea_username || "").trim();
  return name ? name.toLowerCase() : null;
}
function normalizeResult(row) {
  const r = (row.result || "").toLowerCase();
  if (r === "win" || r === "w") return "win";
  if (r === "loss" || r === "l") return "loss";
  if (r === "draw" || r === "d") return "draw";
  const f = num(row.score_for);
  const a = num(row.score_against);
  if (f === null || a === null) return null;
  return f > a ? "win" : f < a ? "loss" : "draw";
}
function matchTime(row) {
  const data = row.match_data;
  const ts = num(data?.timestamp);
  if (ts && ts > 1e9) return new Date(ts < 1e12 ? ts * 1e3 : ts);
  return new Date(row.created_at || 0);
}
function toInsightMatches(rows, lineups = []) {
  const sortedLineups = lineups.map((l) => ({ formation: l.formation, at: new Date(l.created_at).getTime() })).sort((a, b) => a.at - b.at);
  const matches = [];
  for (const row of rows) {
    const result = normalizeResult(row);
    if (!result) continue;
    const playedAt = matchTime(row);
    const t = playedAt.getTime();
    let formation = null;
    for (const l of sortedLineups) {
      if (l.at > t) break;
      if (t - l.at <= LINEUP_WINDOW_MS) formation = l.formation;
    }
    matches.push({
      id: row.id,
      result,
      scoreFor: num(row.score_for) ?? 0,
      scoreAgainst: num(row.score_against) ?? 0,
      matchType: row.match_type,
      tag: matchTag(row),
      competition: matchCompetition(row),
      playedAt,
      opponent: row.opponent_club_name || "Unknown",
      players: Array.isArray(row.player_stats) ? row.player_stats : [],
      formation
    });
  }
  return matches.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}
function sum(players, key) {
  let total = 0;
  let seen = false;
  for (const p of players) {
    const v = num(p[key]);
    if (v !== null) {
      total += v;
      seen = true;
    }
  }
  return seen ? total : null;
}
function ratio(made, attempts) {
  if (made === null || attempts === null || attempts <= 0) return null;
  return made / attempts * 100;
}
function teamMetrics(m) {
  const ps = m.players;
  const possessions = ps.map((p) => num(p.possession)).filter((v) => v !== null && v > 0);
  const ratings = ps.map((p) => num(p.rating)).filter((v) => v !== null && v > 0);
  const shots = sum(ps, "shots");
  return {
    // EA reports team possession on each player row
    possession: possessions.length ? possessions.reduce((a, b) => a + b, 0) / possessions.length : null,
    passCompletion: ratio(sum(ps, "passes_made"), sum(ps, "pass_attempts")),
    shots,
    shotAccuracy: ratio(sum(ps, "shots_on_target"), shots),
    tackleSuccess: ratio(sum(ps, "tackles"), sum(ps, "tackle_attempts")),
    interceptions: sum(ps, "interceptions"),
    ballRecoveries: sum(ps, "ball_recoveries"),
    dribbleSuccess: ratio(sum(ps, "dribbles"), sum(ps, "dribble_attempts")),
    fouls: sum(ps, "fouls"),
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  };
}
function mean(values) {
  const v = values.filter((x) => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function computeOverview(matches) {
  const wins = matches.filter((m) => m.result === "win").length;
  const draws = matches.filter((m) => m.result === "draw").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const metrics = matches.map(teamMetrics);
  return {
    played: matches.length,
    wins,
    draws,
    losses,
    winPct: matches.length ? wins / matches.length * 100 : 0,
    goalsFor: matches.reduce((a, m) => a + m.scoreFor, 0),
    goalsAgainst: matches.reduce((a, m) => a + m.scoreAgainst, 0),
    cleanSheets: matches.filter((m) => m.scoreAgainst === 0).length,
    avgPossession: mean(metrics.map((x) => x.possession)),
    passCompletion: mean(metrics.map((x) => x.passCompletion)),
    shotsPerGame: mean(metrics.map((x) => x.shots)),
    form: matches.slice(0, 10).map((m) => m.result)
  };
}
function emptyRecord() {
  return { games: 0, wins: 0, draws: 0, losses: 0, goalDiff: 0 };
}
function addTo(r, m) {
  r.games++;
  if (m.result === "win") r.wins++;
  else if (m.result === "draw") r.draws++;
  else r.losses++;
  r.goalDiff += m.scoreFor - m.scoreAgainst;
}
function winPct(r) {
  return r.games ? r.wins / r.games * 100 : 0;
}
function gdPerGame(r) {
  return r.games ? r.goalDiff / r.games : 0;
}
function computeCompetitionRecords(matches) {
  return COMPETITIONS.map((c) => {
    const record = emptyRecord();
    for (const m of matches) if (m.competition === c.value) addTo(record, m);
    return { competition: c.value, label: c.label, emoji: c.emoji, record };
  }).filter((x) => x.record.games > 0);
}
function displayNames(matches) {
  const names = /* @__PURE__ */ new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const k = playerKey(p);
      if (k && !names.has(k)) names.set(k, (p.ea_username || "").trim());
    }
  }
  return names;
}
function computePlayerImpact(matches, minGames = 5) {
  const names = displayNames(matches);
  const out = [];
  for (const [key, name] of names) {
    const withR = emptyRecord();
    const withoutR = emptyRecord();
    for (const m of matches) {
      const played = m.players.some((p) => playerKey(p) === key);
      addTo(played ? withR : withoutR, m);
    }
    if (withR.games < minGames) continue;
    out.push({
      key,
      name,
      with: withR,
      without: withoutR,
      lift: withoutR.games ? winPct(withR) - winPct(withoutR) : 0
    });
  }
  return out.sort((a, b) => b.with.games - a.with.games);
}
function combinations(items, size) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === size) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}
function computeCombos(matches, size, minTogether = 5) {
  const names = displayNames(matches);
  const together = /* @__PURE__ */ new Map();
  for (const m of matches) {
    const keys = Array.from(new Set(m.players.map(playerKey).filter((k) => !!k))).sort();
    for (const combo of combinations(keys, size)) {
      const id = combo.join("|");
      if (!together.has(id)) together.set(id, emptyRecord());
      addTo(together.get(id), m);
    }
  }
  const combos = [];
  for (const [id, rec] of together) {
    if (rec.games < minTogether) continue;
    const members = id.split("|");
    const apart = emptyRecord();
    for (const m of matches) {
      const present = new Set(m.players.map(playerKey));
      const count = members.filter((k) => present.has(k)).length;
      if (count > 0 && count < members.length) addTo(apart, m);
    }
    combos.push({
      names: members.map((k) => names.get(k) || k),
      together: rec,
      apart,
      lift: apart.games ? winPct(rec) - winPct(apart) : 0
    });
  }
  return combos.sort((a, b) => b.lift - a.lift || b.together.games - a.together.games);
}
function computeFormations(matches) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of matches) {
    if (!m.formation) continue;
    if (!groups.has(m.formation)) groups.set(m.formation, []);
    groups.get(m.formation).push(m);
  }
  return Array.from(groups.entries()).map(([formation, ms]) => {
    const record = emptyRecord();
    ms.forEach((m) => addTo(record, m));
    return {
      formation,
      record,
      avgRating: mean(ms.map((m) => teamMetrics(m).avgRating)),
      goalsForPerGame: ms.reduce((a, m) => a + m.scoreFor, 0) / ms.length,
      goalsAgainstPerGame: ms.reduce((a, m) => a + m.scoreAgainst, 0) / ms.length
    };
  }).sort((a, b) => b.record.games - a.record.games);
}
var METRIC_LABELS = [
  { key: "possession", label: "Possession", unit: "%", higherIsBetter: true },
  { key: "passCompletion", label: "Pass completion", unit: "%", higherIsBetter: true },
  { key: "shots", label: "Shots", unit: "", higherIsBetter: true },
  { key: "shotAccuracy", label: "Shots on target", unit: "%", higherIsBetter: true },
  { key: "tackleSuccess", label: "Tackle success", unit: "%", higherIsBetter: true },
  { key: "interceptions", label: "Interceptions", unit: "", higherIsBetter: true },
  { key: "ballRecoveries", label: "Ball recoveries", unit: "", higherIsBetter: true },
  { key: "dribbleSuccess", label: "Dribble success", unit: "%", higherIsBetter: true },
  { key: "fouls", label: "Fouls", unit: "", higherIsBetter: false },
  { key: "avgRating", label: "Avg match rating", unit: "", higherIsBetter: true }
];
function computeWinLossGaps(matches, minEach = 3) {
  const wins = matches.filter((m) => m.result === "win").map(teamMetrics);
  const losses = matches.filter((m) => m.result === "loss").map(teamMetrics);
  if (wins.length < minEach || losses.length < minEach) return [];
  const gaps = [];
  for (const meta of METRIC_LABELS) {
    const w = mean(wins.map((x) => x[meta.key]));
    const l = mean(losses.map((x) => x[meta.key]));
    if (w === null || l === null || w === 0) continue;
    const rel = (w - l) / Math.abs(w);
    gaps.push({ ...meta, inWins: w, inLosses: l, severity: meta.higherIsBetter ? rel : -rel });
  }
  return gaps.sort((a, b) => b.severity - a.severity);
}
function fmt(n, unit = "") {
  return unit === "%" ? `${Math.round(n)}%` : n.toFixed(1);
}
function generateInsights(matches) {
  const insights = [];
  if (matches.length < 5) return insights;
  const duos = computeCombos(matches, 2);
  const bestDuo = duos.find((d) => d.lift >= 15 && d.apart.games >= 3);
  if (bestDuo) {
    insights.push({
      tone: "good",
      text: `${bestDuo.names.join(" + ")} win ${fmt(winPct(bestDuo.together), "%")} of ${bestDuo.together.games} games together, but ${fmt(winPct(bestDuo.apart), "%")} when only one of them plays.`
    });
  }
  const worstDuo = [...duos].reverse().find((d) => d.lift <= -15 && d.apart.games >= 3);
  if (worstDuo) {
    insights.push({
      tone: "bad",
      text: `${worstDuo.names.join(" + ")} win only ${fmt(winPct(worstDuo.together), "%")} together (${worstDuo.together.games} games) versus ${fmt(winPct(worstDuo.apart), "%")} apart.`
    });
  }
  const impact = computePlayerImpact(matches).filter((p) => p.without.games >= 3);
  const mvp = [...impact].sort((a, b) => b.lift - a.lift)[0];
  if (mvp && mvp.lift >= 15) {
    insights.push({
      tone: "good",
      text: `The club wins ${fmt(winPct(mvp.with), "%")} with ${mvp.name} and ${fmt(winPct(mvp.without), "%")} without.`
    });
  }
  const gaps = computeWinLossGaps(matches);
  for (const g of gaps.slice(0, 2)) {
    if (g.severity < 0.08) break;
    insights.push({
      tone: "bad",
      text: `${g.label} falls from ${fmt(g.inWins, g.unit)} in wins to ${fmt(g.inLosses, g.unit)} in losses.`
    });
  }
  const formations = computeFormations(matches).filter((f) => f.record.games >= 3);
  if (formations.length >= 2) {
    const sorted = [...formations].sort((a, b) => winPct(b.record) - winPct(a.record));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (winPct(best.record) - winPct(worst.record) >= 15) {
      insights.push({
        tone: "neutral",
        text: `${best.formation} wins ${fmt(winPct(best.record), "%")} (${best.record.games} games); ${worst.formation} wins ${fmt(winPct(worst.record), "%")} (${worst.record.games} games).`
      });
    }
  }
  return insights;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  COMPETITIONS,
  MATCH_TAGS,
  SEPARATE_COMPETITIONS,
  competitionEmoji,
  competitionLabel,
  computeCombos,
  computeCompetitionRecords,
  computeFormations,
  computeOverview,
  computePlayerImpact,
  computeWinLossGaps,
  gdPerGame,
  generateInsights,
  isSeparateCompetition,
  matchCompetition,
  matchTag,
  playerKey,
  playerStatsTypeForTag,
  teamMetrics,
  toInsightMatches,
  winPct
});
