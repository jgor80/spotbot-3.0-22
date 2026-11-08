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
  MIN_ROLE_GAMES: () => MIN_ROLE_GAMES,
  PASS_STYLE_CUTOFFS: () => PASS_STYLE_CUTOFFS,
  ROLE_LABELS: () => ROLE_LABELS,
  SEPARATE_COMPETITIONS: () => SEPARATE_COMPETITIONS,
  SESSION_GAP_MS: () => SESSION_GAP_MS,
  competitionEmoji: () => competitionEmoji,
  competitionLabel: () => competitionLabel,
  computeAdvancedPlayers: () => computeAdvancedPlayers,
  computeCombos: () => computeCombos,
  computeCompetitionRecords: () => computeCompetitionRecords,
  computeFormations: () => computeFormations,
  computeOverview: () => computeOverview,
  computePartnerships: () => computePartnerships,
  computePlayerImpact: () => computePlayerImpact,
  computePressing: () => computePressing,
  computeSessionFatigue: () => computeSessionFatigue,
  computeWinLossGaps: () => computeWinLossGaps,
  decisionScore: () => decisionScore,
  deriveStats: () => deriveStats,
  divisionLabel: () => divisionLabel,
  gdPerGame: () => gdPerGame,
  generateAdvancedInsights: () => generateAdvancedInsights,
  generateInsights: () => generateInsights,
  isDivisionMatch: () => isDivisionMatch,
  isSeparateCompetition: () => isSeparateCompetition,
  matchCompetition: () => matchCompetition,
  matchTag: () => matchTag,
  parseDivision: () => parseDivision,
  passStyle: () => passStyle,
  playerKey: () => playerKey,
  playerStatsTypeForTag: () => playerStatsTypeForTag,
  positionalDiscipline: () => positionalDiscipline,
  roleOf: () => roleOf,
  signed: () => signed,
  summarizeDivision: () => summarizeDivision,
  teamEvents: () => teamEvents,
  teamMetrics: () => teamMetrics,
  toInsightMatches: () => toInsightMatches,
  winPct: () => winPct
});
module.exports = __toCommonJS(clubInsights_exports);

// src/lib/eaEvents.ts
var EA_EVENT_STATS = {
  // Core
  goals: [214],
  assists: [11],
  secondAssists: [115],
  interceptions: [6],
  tacklesWon: [0],
  tacklesLost: [1],
  dribbles: [174],
  // dribbles completed
  progressiveCarries: [97],
  // dribbles carried
  throughBalls: [152],
  // Passing
  passesCompleted: [215],
  // excludes offside passes
  passesFailed: [216],
  shortPassesMade: [24],
  shortPassesFailed: [25],
  mediumPassesMade: [26],
  mediumPassesFailed: [27],
  longPassesMade: [28],
  longPassesFailed: [29],
  crossesMade: [36],
  crossesFailed: [37],
  // open play only
  forwardPasses: [30],
  // completed
  forwardPassesFailed: [31],
  backwardPasses: [32],
  backwardPassesFailed: [33],
  sidewaysPasses: [34],
  sidewaysPassesFailed: [35],
  firstTimePasses: [143],
  switchesOfPlay: [144],
  flairPasses: [147],
  offsidePasses: [153],
  // Shooting
  shotsOnTarget: [217],
  shotsOffTarget: [218],
  shotsOnTargetInBox: [13],
  shotsOnTargetOutsideBox: [18],
  shotsOffTargetInBox: [14],
  shotsOffTargetOutsideBox: [19],
  weakFootGoals: [131],
  firstTimeGoals: [128],
  postGoals: [136],
  throughBallAssists: [118],
  // Dribbling
  beats: [112],
  // includes skill-move beats
  skillMoveBeats: [38],
  // Defending
  standingTacklesWon: [229],
  slidingTacklesWon: [230],
  dangerousTackles: [163],
  cleanTackles: [164],
  dispossessed: [158],
  crossesBlocked: [156],
  aerialsWon: [265, 266],
  aerialsWonAttacking: [265],
  aerialsWonDefending: [266],
  // Where the ball is won and lost
  possessionGains: [108, 109, 110],
  wonDefensiveThird: [108],
  wonMiddleThird: [109],
  wonAttackingThird: [110],
  possessionsLost: [105, 106, 107],
  lostDefensiveThird: [105],
  lostMiddleThird: [106],
  lostAttackingThird: [107],
  // Discipline and set pieces
  yellowCards: [95, 213],
  foulsCommitted: [2, 3],
  foulsWon: [4],
  penaltiesConceded: [94],
  cornersTaken: [145],
  cornersConceded: [10],
  // Positioning: EA's in-game "out of position" warnings (severity 1-5) and "good positioning" praise
  outOfPosition: [219],
  outOfPositionSevere: [102, 103],
  inPosition: [111],
  // Decisions: EA's in-game feedback popups after each action
  bestOption: [177],
  goodOption: [176],
  noGoodOption: [175],
  shouldHavePassedElsewhere: [182],
  useTheBall: [212],
  choseToPass: [183],
  // Keepers
  goodDirectionSaves: [267]
};
function eaEventCounts(p) {
  const counts = {};
  for (let i = 0; i < 4; i++) {
    for (const pair of String(p?.[`match_event_aggregate_${i}`] ?? "").split(",")) {
      const [k, v] = pair.split(":");
      if (!/^\d+$/.test(k || "") || !/^\d+$/.test(v || "")) continue;
      counts[Number(k)] = (counts[Number(k)] || 0) + Number(v);
    }
  }
  return counts;
}
function statsFromCounts(c) {
  const out = {};
  for (const [name, ids] of Object.entries(EA_EVENT_STATS)) {
    out[name] = ids.reduce((sum2, id) => sum2 + (c && c[id] || 0), 0);
  }
  return out;
}
function hasEventData(p) {
  return Object.keys(eaEventCounts(p)).length > 0;
}

// src/lib/advancedStats.ts
var ROLE_LABELS = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };
function roleOf(position) {
  const p = String(position || "").trim().toLowerCase();
  if (!p) return null;
  if (p === "goalkeeper" || p === "gk") return "GK";
  if (p === "defender" || ["cb", "lcb", "rcb", "lb", "rb", "lwb", "rwb", "sw"].includes(p)) return "DEF";
  if (p === "midfielder" || ["cdm", "ldm", "rdm", "cm", "lcm", "rcm", "cam", "lam", "ram", "lm", "rm"].includes(p)) return "MID";
  if (p === "forward" || p === "attacker" || ["st", "ls", "rs", "cf", "lf", "rf", "lw", "rw"].includes(p)) return "FWD";
  return null;
}
function pct(made, total) {
  return total > 0 ? made / total * 100 : null;
}
function perGame(total, games) {
  return games > 0 ? total / games : null;
}
function addInto(into, add) {
  for (const [k, v] of Object.entries(add)) into[k] = (into[k] || 0) + v;
}
function emptyTotals() {
  return statsFromCounts({});
}
function decisionScore(t) {
  const good = (t.bestOption || 0) + (t.goodOption || 0);
  const bad = (t.shouldHavePassedElsewhere || 0) + (t.useTheBall || 0);
  return pct(good, good + bad);
}
function positionalDiscipline(t) {
  const good = t.inPosition || 0;
  return pct(good, good + (t.outOfPosition || 0));
}
var PASS_STYLE_CUTOFFS = { progressive: 64, recycler: 43 };
function passStyle(forwardShare) {
  if (forwardShare === null) return null;
  if (forwardShare >= PASS_STYLE_CUTOFFS.progressive) return "Progressive";
  if (forwardShare <= PASS_STYLE_CUTOFFS.recycler) return "Recycler";
  return "Balanced";
}
function deriveStats(t, games) {
  const fwd = t.forwardPasses || 0;
  const forwardShare = pct(fwd, fwd + (t.backwardPasses || 0) + (t.sidewaysPasses || 0));
  const shots = (t.shotsOnTarget || 0) + (t.shotsOffTarget || 0);
  const tackles = t.tacklesWon || 0;
  return {
    passCompletion: pct(t.passesCompleted || 0, (t.passesCompleted || 0) + (t.passesFailed || 0)),
    shortPassPct: pct(t.shortPassesMade || 0, (t.shortPassesMade || 0) + (t.shortPassesFailed || 0)),
    mediumPassPct: pct(t.mediumPassesMade || 0, (t.mediumPassesMade || 0) + (t.mediumPassesFailed || 0)),
    longPassPct: pct(t.longPassesMade || 0, (t.longPassesMade || 0) + (t.longPassesFailed || 0)),
    crossPct: pct(t.crossesMade || 0, (t.crossesMade || 0) + (t.crossesFailed || 0)),
    forwardShare,
    passStyle: passStyle(forwardShare),
    shotAccuracy: pct(t.shotsOnTarget || 0, shots),
    insideBoxShotShare: pct((t.shotsOnTargetInBox || 0) + (t.shotsOffTargetInBox || 0), shots),
    tackleSuccess: pct(tackles, tackles + (t.tacklesLost || 0)),
    slidingTackleShare: pct(t.slidingTacklesWon || 0, (t.slidingTacklesWon || 0) + (t.standingTacklesWon || 0)),
    pressingPerGame: perGame(t.wonAttackingThird || 0, games),
    lostOwnThirdPerGame: perGame(t.lostDefensiveThird || 0, games),
    netPossessionPerGame: perGame((t.possessionGains || 0) - (t.possessionsLost || 0), games),
    outOfPositionPerGame: perGame(t.outOfPosition || 0, games),
    severeOutOfPositionPerGame: perGame(t.outOfPositionSevere || 0, games),
    positionalDiscipline: positionalDiscipline(t),
    decisionScore: decisionScore(t),
    aerialsPerGame: perGame(t.aerialsWon || 0, games),
    foulsPerGame: perGame(t.foulsCommitted || 0, games),
    cardsPerGame: perGame(t.yellowCards || 0, games)
  };
}
function keyOf(p) {
  const name = (p.ea_username || "").trim();
  return name ? name.toLowerCase() : null;
}
function num(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
var MIN_ROLE_GAMES = 3;
function computeAdvancedPlayers(matches, minGames = 1) {
  const acc = /* @__PURE__ */ new Map();
  for (const m of matches) {
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      const s = statsFromCounts(p.events);
      let a = acc.get(key);
      if (!a) acc.set(key, a = { name: (p.ea_username || "").trim(), games: 0, totals: emptyTotals(), roles: /* @__PURE__ */ new Map() });
      a.games++;
      addInto(a.totals, s);
      const role = roleOf(p.position);
      if (role) {
        let r = a.roles.get(role);
        if (!r) a.roles.set(role, r = { games: 0, totals: emptyTotals(), rating: 0, rated: 0 });
        r.games++;
        addInto(r.totals, s);
        const rating = num(p.rating);
        if (rating !== null && rating > 0) {
          r.rating += rating;
          r.rated++;
        }
      }
    }
  }
  const out = [];
  for (const [key, a] of acc) {
    if (a.games < minGames) continue;
    const roles = [...a.roles.entries()].map(([role, r]) => ({
      role,
      games: r.games,
      avgRating: r.rated ? r.rating / r.rated : null,
      positionalDiscipline: positionalDiscipline(r.totals),
      decisionScore: decisionScore(r.totals),
      outOfPositionPerGame: perGame(r.totals.outOfPosition || 0, r.games)
    })).sort((x, y) => y.games - x.games);
    const candidates = roles.filter((r) => r.role !== "GK" && r.games >= MIN_ROLE_GAMES && r.avgRating !== null);
    const bestRole = candidates.length >= 2 ? [...candidates].sort((x, y) => y.avgRating - x.avgRating || (y.positionalDiscipline ?? 0) - (x.positionalDiscipline ?? 0))[0].role : null;
    out.push({ key, name: a.name, games: a.games, totals: a.totals, derived: deriveStats(a.totals, a.games), roles, bestRole });
  }
  return out.sort((x, y) => y.games - x.games || x.name.localeCompare(y.name));
}
function teamEvents(m) {
  const totals = emptyTotals();
  let players = 0;
  for (const p of m.players) {
    if (!p.events) continue;
    addInto(totals, statsFromCounts(p.events));
    players++;
  }
  return players ? { totals, players } : null;
}
function rec() {
  return { games: 0, wins: 0, draws: 0, losses: 0 };
}
function addResult(r, m) {
  r.games++;
  if (m.result === "win") r.wins++;
  else if (m.result === "draw") r.draws++;
  else r.losses++;
}
function winRate(r) {
  return r.games ? r.wins / r.games * 100 : 0;
}
function computePartnerships(matches, minTogether = 5) {
  const perMatch = matches.map((m) => {
    const lines = /* @__PURE__ */ new Map();
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      const s = statsFromCounts(p.events);
      lines.set(key, { name: (p.ea_username || "").trim(), oop: s.outOfPosition || 0, lost: s.possessionsLost || 0, role: roleOf(p.position) });
    }
    return { m, lines };
  });
  const pairs = /* @__PURE__ */ new Map();
  for (const { m, lines } of perMatch) {
    const keys = [...lines.keys()].sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = lines.get(keys[i]);
        const b = lines.get(keys[j]);
        if (!a.role || !b.role || a.role === "GK" || b.role === "GK" || a.role === "FWD" || b.role === "FWD") continue;
        const id = `${keys[i]}|${keys[j]}`;
        let pr = pairs.get(id);
        if (!pr) pairs.set(id, pr = { names: [a.name, b.name], roles: /* @__PURE__ */ new Map(), together: rec(), oop: 0, lost: 0 });
        const roleId = [a.role, b.role].sort().join(" + ");
        pr.roles.set(roleId, (pr.roles.get(roleId) || 0) + 1);
        addResult(pr.together, m);
        pr.oop += a.oop + b.oop;
        pr.lost += a.lost + b.lost;
      }
    }
  }
  const out = [];
  for (const [id, pr] of pairs) {
    if (pr.together.games < minTogether) continue;
    const [ka, kb] = id.split("|");
    const apart = (k, other) => {
      let games = 0, oop = 0, lost = 0;
      for (const { lines } of perMatch) {
        const l = lines.get(k);
        if (!l || lines.has(other)) continue;
        games++;
        oop += l.oop;
        lost += l.lost;
      }
      return games >= 2 ? { oop: oop / games, lost: lost / games } : null;
    };
    const a = apart(ka, kb);
    const b = apart(kb, ka);
    const roles = [...pr.roles.entries()].sort((x, y) => y[1] - x[1])[0][0];
    out.push({
      names: pr.names,
      roles,
      games: pr.together.games,
      winPct: winRate(pr.together),
      outOfPositionTogether: pr.oop / pr.together.games,
      outOfPositionApart: a && b ? a.oop + b.oop : null,
      lostTogether: pr.lost / pr.together.games,
      lostApart: a && b ? a.lost + b.lost : null
    });
  }
  const gain = (p) => p.outOfPositionApart === null ? -Infinity : p.outOfPositionApart - p.outOfPositionTogether;
  return out.sort((x, y) => gain(y) - gain(x) || y.games - x.games);
}
var SESSION_GAP_MS = 90 * 60 * 1e3;
function computeSessionFatigue(matches, buckets = 5) {
  const sorted = [...matches].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  const acc = Array.from({ length: buckets }, () => ({ r: rec(), totals: emptyTotals(), playerGames: 0 }));
  let n = 0;
  let last = -Infinity;
  for (const m of sorted) {
    const t = m.playedAt.getTime();
    n = t - last > SESSION_GAP_MS ? 1 : n + 1;
    last = t;
    const b = acc[Math.min(n, buckets) - 1];
    addResult(b.r, m);
    const te = teamEvents(m);
    if (te) {
      addInto(b.totals, te.totals);
      b.playerGames += te.players;
    }
  }
  return acc.map((b, i) => ({
    gameNumber: i + 1,
    label: i + 1 === buckets ? `Game ${buckets}+` : `Game ${i + 1}`,
    games: b.r.games,
    winPct: winRate(b.r),
    decisionScore: decisionScore(b.totals),
    positionalDiscipline: positionalDiscipline(b.totals),
    outOfPositionPerPlayer: b.playerGames ? (b.totals.outOfPosition || 0) / b.playerGames : null
  })).filter((l) => l.games > 0);
}
function computePressing(matches) {
  const rows = matches.map((m) => ({ m, te: teamEvents(m) })).filter((x) => !!x.te).map((x) => ({ m: x.m, v: x.te.totals.wonAttackingThird || 0 })).sort((a, b) => a.v - b.v);
  if (rows.length < 9) return [];
  const cut = (i) => rows[Math.min(rows.length - 1, Math.floor(rows.length * i / 3))].v;
  const lowMax = cut(1);
  const midMax = Math.max(cut(2), lowMax + 1);
  const groups = [
    ["Low", (v) => v < lowMax, `0-${Math.max(0, lowMax - 1)}`],
    ["Medium", (v) => v >= lowMax && v < midMax, lowMax === midMax - 1 ? `${lowMax}` : `${lowMax}-${midMax - 1}`],
    ["High", (v) => v >= midMax, `${midMax}+`]
  ];
  return groups.map(([band, test, range]) => {
    const r = rec();
    let gf = 0, ga = 0;
    for (const x of rows) {
      if (!test(x.v)) continue;
      addResult(r, x.m);
      gf += x.m.scoreFor;
      ga += x.m.scoreAgainst;
    }
    return { band, range, games: r.games, winPct: winRate(r), goalsFor: r.games ? gf / r.games : 0, goalsAgainst: r.games ? ga / r.games : 0 };
  }).filter((b) => b.games > 0).map((b, i, list) => list.length === 2 ? { ...b, band: i === 0 ? "Low" : "High" } : b);
}
var r0 = (n) => `${Math.round(n)}%`;
function generateAdvancedInsights(matches) {
  const out = [];
  if (matches.filter((m) => m.players.some((p) => p.events)).length < 5) return out;
  const fatigue = computeSessionFatigue(matches);
  const early = fatigue.filter((l) => l.gameNumber <= 2);
  const late = fatigue.filter((l) => l.gameNumber >= 4);
  const avg = (ls, k) => {
    const g = ls.reduce((s, l) => s + (l[k] === null ? 0 : l.games), 0);
    return g ? ls.reduce((s, l) => s + (l[k] ?? 0) * l.games, 0) / g : null;
  };
  const earlyGames = early.reduce((s, l) => s + l.games, 0);
  const lateGames = late.reduce((s, l) => s + l.games, 0);
  if (earlyGames >= 5 && lateGames >= 5) {
    const dq1 = avg(early, "decisionScore");
    const dq2 = avg(late, "decisionScore");
    const w1 = avg(early, "winPct");
    const w2 = avg(late, "winPct");
    if (dq1 !== null && dq2 !== null && dq1 - dq2 >= 4) {
      out.push({ tone: "bad", text: `Decisions slip late in a session: ${r0(dq1)} good calls in games 1-2 vs ${r0(dq2)} from game 4 on (win rate ${r0(w1)} vs ${r0(w2)}).` });
    } else if (w1 - w2 >= 15) {
      out.push({ tone: "bad", text: `The club wins ${r0(w1)} of games 1-2 in a session but ${r0(w2)} from game 4 on.` });
    }
  }
  const first = fatigue.find((l) => l.gameNumber === 1);
  const rest = fatigue.filter((l) => l.gameNumber > 1);
  const restGames = rest.reduce((s, l) => s + l.games, 0);
  if (first && first.games >= 5 && restGames >= 5) {
    const wr = avg(rest, "winPct");
    if (wr - first.winPct >= 15) out.push({ tone: "neutral", text: `Slow starter: the club wins ${r0(first.winPct)} of the first game of a session and ${r0(wr)} after that. A warm-up game may help.` });
  }
  const pressing = computePressing(matches);
  const low = pressing.find((b) => b.band === "Low");
  const high = pressing.find((b) => b.band === "High");
  if (low && high && low.games >= 5 && high.games >= 5 && Math.abs(high.winPct - low.winPct) >= 15) {
    out.push({
      tone: high.winPct > low.winPct ? "good" : "neutral",
      text: high.winPct > low.winPct ? `Pressing pays: ${r0(high.winPct)} wins when the club wins the ball in the attacking third ${high.range} times, ${r0(low.winPct)} when it's ${low.range}.` : `High pressing hasn't paid off: ${r0(high.winPct)} wins in high-press games vs ${r0(low.winPct)} in low-press ones.`
    });
  }
  const players = computeAdvancedPlayers(matches, 5);
  const byDecision = players.filter((p) => p.derived.decisionScore !== null).sort((a, b) => b.derived.decisionScore - a.derived.decisionScore);
  if (byDecision.length >= 3) {
    out.push({ tone: "good", text: `${byDecision[0].name} makes the best calls on the ball: ${r0(byDecision[0].derived.decisionScore)} of EA's decision feedback is "good option" or better.` });
  }
  const loose = players.filter((p) => p.roles[0]?.role !== "GK" && p.derived.outOfPositionPerGame !== null).sort((a, b) => b.derived.outOfPositionPerGame - a.derived.outOfPositionPerGame);
  if (loose.length >= 3 && loose[0].derived.outOfPositionPerGame >= 4) {
    out.push({ tone: "bad", text: `${loose[0].name} gets the most out-of-position warnings: ${loose[0].derived.outOfPositionPerGame.toFixed(1)} a game.` });
  }
  for (const p of players) {
    if (!p.bestRole || p.roles[0].role === p.bestRole) continue;
    const best = p.roles.find((r) => r.role === p.bestRole);
    const main = p.roles[0];
    if ((best.avgRating ?? 0) - (main.avgRating ?? 0) >= 0.5) {
      out.push({ tone: "neutral", text: `${p.name} mostly plays ${ROLE_LABELS[main.role].toLowerCase()} but rates higher as a ${ROLE_LABELS[p.bestRole].toLowerCase()} (${best.avgRating.toFixed(1)} vs ${main.avgRating.toFixed(1)} over ${best.games} games).` });
      break;
    }
  }
  const pair = computePartnerships(matches).find((p) => p.outOfPositionApart !== null && p.outOfPositionApart - p.outOfPositionTogether >= 2);
  if (pair) {
    out.push({ tone: "good", text: `${pair.names.join(" + ")} cover for each other: ${pair.outOfPositionTogether.toFixed(1)} out-of-position warnings a game together vs ${pair.outOfPositionApart.toFixed(1)} apart (${pair.games} games).` });
  }
  return out;
}

// src/lib/divisionProgress.ts
function parseDivision(value) {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const m = String(value).match(/\d+/);
  return m ? Number(m[0]) : null;
}
function divisionLabel(division) {
  return division === null || division === void 0 ? "\u2013" : `Division ${division}`;
}
function isDivisionMatch(m) {
  return !/friendly|competition|cup|playoff|tournament|byot/i.test(String(m.matchType || ""));
}
var DAY_MS = 864e5;
function srAgo(rows, days) {
  const latest = rows[rows.length - 1];
  if (!latest || latest.skill_rating === null) return null;
  const target = Date.parse(latest.captured_on) - days * DAY_MS;
  let pick = null;
  for (const r of rows) {
    if (r === latest || r.skill_rating === null) continue;
    if (Date.parse(r.captured_on) <= target) pick = r;
  }
  if (!pick) {
    const oldest = rows.find((r) => r !== latest && r.skill_rating !== null);
    if (!oldest || Date.parse(latest.captured_on) - Date.parse(oldest.captured_on) < Math.min(days, 2) * DAY_MS) return null;
    pick = oldest;
  }
  return latest.skill_rating - pick.skill_rating;
}
function summarizeDivision(history, matches = []) {
  const rows = [...history].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  const latest = rows[rows.length - 1] || null;
  const changes = [];
  let prevDiv = null;
  let inDivisionSince = null;
  for (const r of rows) {
    if (r.current_division === null) continue;
    if (prevDiv === null) inDivisionSince = r.captured_on;
    else if (r.current_division !== prevDiv) {
      changes.push({ on: r.captured_on, from: prevDiv, to: r.current_division, kind: r.current_division < prevDiv ? "promoted" : "relegated" });
      inDivisionSince = r.captured_on;
    }
    prevDiv = r.current_division;
  }
  changes.reverse();
  const sinceMs = inDivisionSince ? Date.parse(inDivisionSince) : null;
  const sinceRecord = { wins: 0, draws: 0, losses: 0, points: 0, played: 0 };
  if (sinceMs !== null) {
    for (const m of matches) {
      if (!isDivisionMatch(m) || m.playedAt.getTime() < sinceMs) continue;
      sinceRecord.played++;
      if (m.result === "win") sinceRecord.wins++;
      else if (m.result === "draw") sinceRecord.draws++;
      else sinceRecord.losses++;
    }
    sinceRecord.points = sinceRecord.wins * 3 + sinceRecord.draws;
  }
  const ranked = rows.filter((r) => r.season_rank !== null);
  const seasonRankChange = ranked.length >= 2 && latest?.season_rank !== null && latest?.season_rank !== void 0 ? ranked[ranked.length - 2].season_rank - latest.season_rank : null;
  const hasSeasonRecord = latest && [latest.season_wins, latest.season_draws, latest.season_losses].some((v) => v !== null);
  return {
    division: latest?.current_division ?? null,
    bestDivision: latest?.best_division ?? null,
    skillRating: latest?.skill_rating ?? null,
    srChange7d: srAgo(rows, 7),
    srChange30d: srAgo(rows, 30),
    promotions: latest?.promotions ?? null,
    relegations: latest?.relegations ?? null,
    seasonPoints: latest?.season_points ?? null,
    seasonRecord: hasSeasonRecord ? { wins: latest.season_wins || 0, draws: latest.season_draws || 0, losses: latest.season_losses || 0 } : null,
    seasonRank: latest?.season_rank ?? null,
    alltimeRank: latest?.alltime_rank ?? null,
    seasonRankChange,
    leaderboardChecked: !!latest?.leaderboard_checked,
    changes,
    inDivisionSince,
    sinceRecord,
    trend: rows.map((r) => ({ date: r.captured_on, division: r.current_division, skillRating: r.skill_rating, seasonRank: r.season_rank })),
    trackedSince: rows[0]?.captured_on ?? null
  };
}
function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

// src/lib/clubInsights.ts
var MATCH_TAGS = [
  { value: "league", label: "League", emoji: "\u{1F3C6}" },
  { value: "tournament", label: "Tournament", emoji: "\u{1F3DF}\uFE0F" },
  { value: "byot", label: "BYOT", emoji: "\u{1F39F}\uFE0F" },
  // A friendly played short-handed (AI filling the rest). Counts in the regular record and stats like
  // any friendly, and has its own filter. Casual clubs get it automatically (casual.cjs).
  { value: "smalls", label: "Smalls", emoji: "\u{1F465}" }
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
function num2(v) {
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
  const f = num2(row.score_for);
  const a = num2(row.score_against);
  if (f === null || a === null) return null;
  return f > a ? "win" : f < a ? "loss" : "draw";
}
function matchTime(row) {
  const data = row.match_data;
  const ts = num2(data?.timestamp);
  if (ts && ts > 1e9) return new Date(ts < 1e12 ? ts * 1e3 : ts);
  return new Date(row.created_at || 0);
}
function rawPlayerRows(row, players) {
  const byClub = row.match_data?.players;
  const out = /* @__PURE__ */ new Map();
  if (!byClub || typeof byClub !== "object") return out;
  const ours = new Set(players.map(playerKey).filter((k) => !!k));
  let best = null;
  let bestHits = 0;
  for (const club of Object.values(byClub)) {
    if (!club || typeof club !== "object") continue;
    const hits = Object.values(club).filter((r) => r && ours.has(String(r.playername || "").trim().toLowerCase())).length;
    if (hits > bestHits) {
      best = club;
      bestHits = hits;
    }
  }
  for (const r of Object.values(best || {})) {
    const k = String(r?.playername || "").trim().toLowerCase();
    if (k) out.set(k, r);
  }
  return out;
}
function withEvents(row, players) {
  const raw = rawPlayerRows(row, players);
  if (!raw.size) return players;
  return players.map((p) => {
    const r = raw.get(playerKey(p) || "");
    if (!r || !hasEventData(r)) return p;
    return { ...p, events: eaEventCounts(r), position: p.position ?? r.pos ?? null };
  });
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
      scoreFor: num2(row.score_for) ?? 0,
      scoreAgainst: num2(row.score_against) ?? 0,
      matchType: row.match_type,
      tag: matchTag(row),
      competition: matchCompetition(row),
      playedAt,
      opponent: row.opponent_club_name || "Unknown",
      players: withEvents(row, Array.isArray(row.player_stats) ? row.player_stats : []),
      formation
    });
  }
  return matches.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}
function sum(players, key) {
  let total = 0;
  let seen = false;
  for (const p of players) {
    const v = num2(p[key]);
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
  const possessions = ps.map((p) => num2(p.possession)).filter((v) => v !== null && v > 0);
  const ratings = ps.map((p) => num2(p.rating)).filter((v) => v !== null && v > 0);
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
  for (const [id, rec2] of together) {
    if (rec2.games < minTogether) continue;
    const members = id.split("|");
    const apart = emptyRecord();
    for (const m of matches) {
      const present = new Set(m.players.map(playerKey));
      const count = members.filter((k) => present.has(k)).length;
      if (count > 0 && count < members.length) addTo(apart, m);
    }
    combos.push({
      names: members.map((k) => names.get(k) || k),
      together: rec2,
      apart,
      lift: apart.games ? winPct(rec2) - winPct(apart) : 0
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
  return [...generateBaseInsights(matches), ...generateAdvancedInsights(matches)];
}
function generateBaseInsights(matches) {
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
  MIN_ROLE_GAMES,
  PASS_STYLE_CUTOFFS,
  ROLE_LABELS,
  SEPARATE_COMPETITIONS,
  SESSION_GAP_MS,
  competitionEmoji,
  competitionLabel,
  computeAdvancedPlayers,
  computeCombos,
  computeCompetitionRecords,
  computeFormations,
  computeOverview,
  computePartnerships,
  computePlayerImpact,
  computePressing,
  computeSessionFatigue,
  computeWinLossGaps,
  decisionScore,
  deriveStats,
  divisionLabel,
  gdPerGame,
  generateAdvancedInsights,
  generateInsights,
  isDivisionMatch,
  isSeparateCompetition,
  matchCompetition,
  matchTag,
  parseDivision,
  passStyle,
  playerKey,
  playerStatsTypeForTag,
  positionalDiscipline,
  roleOf,
  signed,
  summarizeDivision,
  teamEvents,
  teamMetrics,
  toInsightMatches,
  winPct
});
