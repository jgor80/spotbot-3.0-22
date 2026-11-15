// Player scores: contribution out of 1000 (attack, possession, ball-winning, overall), keeper score,
// power rankings, clutch, carry and defensive records. Pure functions over InsightMatch[], shared by the
// web Insights page, the bot (bundled in club-insights.cjs) and the MCP server.
//
// Every score is a percentile against FC27 players of the same role in the community research data
// (players with 5+ games; scripts/ea-research-check.mjs --write-benchmarks writes the tables), times 10.
// A defender is only ever compared with defenders, so a centre-back isn't punished for not scoring.
import { statsFromCounts } from "./eaEvents.ts";
import { FC27_BENCHMARKS } from "./fc27Benchmarks.ts";
import { roleOf, type Role, ROLE_LABELS } from "./advancedStats.ts";
import { quantileScore, SCORE_MAX } from "./matchPerformance.ts";
import type { InsightMatch } from "./clubInsights.ts";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------- Per-player season line ----------

export interface PlayerLine {
  key: string;
  name: string;
  games: number;
  role: Role | null; // most-played role
  roleGames: Partial<Record<Role, number>>;
  eventGames: number; // games with EA event data
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  secondAssists: number;
  motm: number;
  avgRating: number | null;
  // Per game (event-based stats use eventGames)
  perGame: Record<ScoreMetric, number | null>;
}

export type ScoreMetric =
  | "goalsPerGame"
  | "chancesCreatedPerGame"
  | "shotsOnTargetPerGame"
  | "passCompletion"
  | "passesPerGame"
  | "lostPerGame"
  | "dribblesPerGame"
  | "tacklesWonPerGame"
  | "interceptionsPerGame"
  | "gainsPerGame"
  | "tackleSuccess"
  | "savesPerGame"
  | "concededPerGame"
  | "cleanSheetRate"
  | "avgRating";

export const SCORE_METRICS: ScoreMetric[] = [
  "goalsPerGame", "chancesCreatedPerGame", "shotsOnTargetPerGame", "passCompletion", "passesPerGame", "lostPerGame", "dribblesPerGame",
  "tacklesWonPerGame", "interceptionsPerGame", "gainsPerGame", "tackleSuccess", "savesPerGame", "concededPerGame", "cleanSheetRate", "avgRating",
];

const LOWER_IS_BETTER: Partial<Record<ScoreMetric, true>> = { lostPerGame: true, concededPerGame: true };

interface Acc {
  key: string;
  name: string;
  games: number;
  eventGames: number;
  roleGames: Partial<Record<Role, number>>;
  w: number;
  d: number;
  l: number;
  goals: number;
  assists: number;
  secondAssists: number;
  motm: number;
  ratingSum: number;
  rated: number;
  sot: number;
  passMade: number;
  passAtt: number;
  lost: number;
  dribbles: number;
  tackles: number;
  tacklesLost: number;
  interceptions: number;
  gains: number;
  gkGames: number;
  saves: number;
  conceded: number;
  cleanSheets: number;
}

export function playerLines(matches: InsightMatch[], minGames = 1): PlayerLine[] {
  const acc = new Map<string, Acc>();
  for (const m of matches) {
    for (const p of m.players) {
      const name = (p.ea_username || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let a = acc.get(key);
      if (!a) {
        a = { key, name, games: 0, eventGames: 0, roleGames: {}, w: 0, d: 0, l: 0, goals: 0, assists: 0, secondAssists: 0, motm: 0, ratingSum: 0, rated: 0, sot: 0, passMade: 0, passAtt: 0, lost: 0, dribbles: 0, tackles: 0, tacklesLost: 0, interceptions: 0, gains: 0, gkGames: 0, saves: 0, conceded: 0, cleanSheets: 0 };
        acc.set(key, a);
      }
      a.games++;
      if (m.result === "win") a.w++;
      else if (m.result === "draw") a.d++;
      else a.l++;
      const role = roleOf(p.position);
      if (role) a.roleGames[role] = (a.roleGames[role] || 0) + 1;
      a.goals += num(p.goals) ?? 0;
      a.assists += num(p.assists) ?? 0;
      if (p.motm === true) a.motm++;
      const r = num(p.rating);
      if (r !== null && r > 0) {
        a.ratingSum += r;
        a.rated++;
      }
      if (role === "GK") {
        a.gkGames++;
        a.saves += num(p.saves) ?? 0;
        a.conceded += m.scoreAgainst;
        if (m.scoreAgainst === 0) a.cleanSheets++;
      }
      if (p.events) {
        const s = statsFromCounts(p.events);
        a.eventGames++;
        a.secondAssists += s.secondAssists || 0;
        a.sot += s.shotsOnTarget || 0;
        a.passMade += s.passesCompleted || 0;
        a.passAtt += (s.passesCompleted || 0) + (s.passesFailed || 0);
        a.lost += s.possessionsLost || 0;
        a.dribbles += s.dribbles || 0;
        a.tackles += s.tacklesWon || 0;
        a.tacklesLost += s.tacklesLost || 0;
        a.interceptions += s.interceptions || 0;
        a.gains += s.possessionGains || 0;
      }
    }
  }
  const out: PlayerLine[] = [];
  for (const a of acc.values()) {
    if (a.games < minGames) continue;
    const role = (Object.entries(a.roleGames).sort((x, y) => (y[1] || 0) - (x[1] || 0))[0]?.[0] as Role | undefined) || null;
    const eg = a.eventGames;
    const pg = (v: number) => (eg ? v / eg : null);
    out.push({
      key: a.key,
      name: a.name,
      games: a.games,
      role,
      roleGames: a.roleGames,
      eventGames: eg,
      wins: a.w,
      draws: a.d,
      losses: a.l,
      goals: a.goals,
      assists: a.assists,
      secondAssists: a.secondAssists,
      motm: a.motm,
      avgRating: a.rated ? a.ratingSum / a.rated : null,
      perGame: {
        goalsPerGame: a.goals / a.games,
        chancesCreatedPerGame: eg ? (a.assists + a.secondAssists) / a.games : a.assists / a.games,
        shotsOnTargetPerGame: pg(a.sot),
        passCompletion: a.passAtt > 0 ? (a.passMade / a.passAtt) * 100 : null,
        passesPerGame: pg(a.passMade),
        lostPerGame: pg(a.lost),
        dribblesPerGame: pg(a.dribbles),
        tacklesWonPerGame: pg(a.tackles),
        interceptionsPerGame: pg(a.interceptions),
        gainsPerGame: pg(a.gains),
        tackleSuccess: a.tackles + a.tacklesLost > 0 ? (a.tackles / (a.tackles + a.tacklesLost)) * 100 : null,
        savesPerGame: a.gkGames ? a.saves / a.gkGames : null,
        concededPerGame: a.gkGames ? a.conceded / a.gkGames : null,
        cleanSheetRate: a.gkGames ? (a.cleanSheets / a.gkGames) * 100 : null,
        avgRating: a.rated ? a.ratingSum / a.rated : null,
      },
    });
  }
  return out.sort((x, y) => y.games - x.games || x.name.localeCompare(y.name));
}

// ---------- Contribution scores ----------

export type ScoreArea = "attack" | "possession" | "ballWinning";
export const SCORE_AREAS: { key: ScoreArea; label: string; metrics: ScoreMetric[] }[] = [
  { key: "attack", label: "Attack", metrics: ["goalsPerGame", "chancesCreatedPerGame", "shotsOnTargetPerGame"] },
  { key: "possession", label: "Possession", metrics: ["passCompletion", "passesPerGame", "lostPerGame", "dribblesPerGame"] },
  { key: "ballWinning", label: "Ball-winning", metrics: ["tacklesWonPerGame", "interceptionsPerGame", "gainsPerGame", "tackleSuccess"] },
];

// How much each area counts towards a role's overall score
export const ROLE_WEIGHTS: Record<Exclude<Role, "GK">, Record<ScoreArea, number>> = {
  FWD: { attack: 0.6, possession: 0.3, ballWinning: 0.1 },
  MID: { attack: 0.3, possession: 0.45, ballWinning: 0.25 },
  DEF: { attack: 0.1, possession: 0.35, ballWinning: 0.55 },
};

export const KEEPER_METRICS: ScoreMetric[] = ["savesPerGame", "concededPerGame", "cleanSheetRate"];

// Where a player's per-game value sits among FC27 players of the role, 0-1000
export function roleScore(role: Role, metric: ScoreMetric, value: number | null): number | null {
  const q = FC27_BENCHMARKS.playerScores?.[role]?.[metric];
  const p = quantileScore(q, value, !LOWER_IS_BETTER[metric]);
  return p === null ? null : p * (SCORE_MAX / 100);
}

export type PlayerTag = "Finisher" | "Creator" | "Ball-winner" | "Playmaker" | "All-rounder" | "Shot-stopper" | "Keeper";

export interface PlayerScore {
  key: string;
  name: string;
  role: Role;
  games: number;
  overall: number | null;
  areas: Record<ScoreArea, number | null>;
  // Per metric, for the breakdown
  metrics: { metric: ScoreMetric; value: number | null; score: number | null }[];
  tag: PlayerTag;
  line: PlayerLine;
}

function areaScore(role: Role, line: PlayerLine, metrics: ScoreMetric[]): number | null {
  const s = metrics.map((k) => roleScore(role, k, line.perGame[k])).filter((v): v is number => v !== null);
  return s.length ? mean(s) : null;
}

export function scorePlayer(line: PlayerLine): PlayerScore | null {
  const role = line.role;
  if (!role) return null;
  if (role === "GK") {
    const metrics = KEEPER_METRICS.map((k) => ({ metric: k, value: line.perGame[k], score: roleScore("GK", k, line.perGame[k]) }));
    const s = metrics.map((m) => m.score).filter((v): v is number => v !== null);
    // Saves count most: they are the keeper's own work; goals conceded and clean sheets are shared
    const weighted = s.length === 3 ? 0.5 * metrics[0].score! + 0.25 * metrics[1].score! + 0.25 * metrics[2].score! : mean(s);
    return { key: line.key, name: line.name, role, games: line.games, overall: weighted, areas: { attack: null, possession: null, ballWinning: null }, metrics, tag: (metrics[0].score ?? 0) >= 700 ? "Shot-stopper" : "Keeper", line };
  }
  const areas = {} as Record<ScoreArea, number | null>;
  for (const a of SCORE_AREAS) areas[a.key] = areaScore(role, line, a.metrics);
  const weights = ROLE_WEIGHTS[role];
  let total = 0, weight = 0;
  for (const a of SCORE_AREAS) {
    const v = areas[a.key];
    if (v === null) continue;
    total += v * weights[a.key];
    weight += weights[a.key];
  }
  const metrics = SCORE_AREAS.flatMap((a) => a.metrics).map((k) => ({ metric: k, value: line.perGame[k], score: roleScore(role, k, line.perGame[k]) }));
  const best = (Object.entries(areas).filter(([, v]) => v !== null) as [ScoreArea, number][]).sort((x, y) => y[1] - x[1]);
  const spread = best.length >= 2 ? best[0][1] - best[best.length - 1][1] : 0;
  const tag: PlayerTag =
    !best.length ? "All-rounder"
    : spread < 120 ? "All-rounder"
    : best[0][0] === "attack" ? ((line.perGame.goalsPerGame || 0) >= (line.perGame.chancesCreatedPerGame || 0) ? "Finisher" : "Creator")
    : best[0][0] === "possession" ? "Playmaker"
    : "Ball-winner";
  return { key: line.key, name: line.name, role, games: line.games, overall: weight ? total / weight : null, areas, metrics, tag, line };
}

export function playerScores(matches: InsightMatch[], minGames = 3): PlayerScore[] {
  return playerLines(matches, minGames)
    .map(scorePlayer)
    .filter((s): s is PlayerScore => !!s && s.overall !== null)
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
}

// ---------- Power rankings ----------

export interface PowerRank {
  name: string;
  rank: number;
  previousRank: number | null;
  move: number | null; // positive = climbed
  games: number;
  goals: number;
  assists: number;
  avgRating: number | null;
  streak: number; // wins in a row in games they played
}

// Last `window` club games vs the window before, ranked by average match rating (min 2 games in a window)
export function powerRankings(matches: InsightMatch[], window = 5): PowerRank[] {
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const rank = (games: InsightMatch[]) =>
    playerLines(games, 2)
      .filter((l) => l.avgRating !== null)
      .sort((a, b) => b.avgRating! - a.avgRating! || b.goals + b.assists - (a.goals + a.assists))
      .map((l, i) => ({ l, rank: i + 1 }));
  const now = rank(sorted.slice(0, window));
  const before = new Map(rank(sorted.slice(window, window * 2)).map((x) => [x.l.key, x.rank]));
  return now.map(({ l, rank: r }) => {
    let streak = 0;
    for (const m of sorted) {
      if (!m.players.some((p) => (p.ea_username || "").trim().toLowerCase() === l.key)) continue;
      if (m.result === "win") streak++;
      else break;
    }
    const prev = before.get(l.key) ?? null;
    return { name: l.name, rank: r, previousRank: prev, move: prev === null ? null : prev - r, games: l.games, goals: l.goals, assists: l.assists, avgRating: l.avgRating, streak };
  });
}

// ---------- Clutch ----------

export interface ClutchLine {
  name: string;
  closeGames: number;
  closeRating: number | null;
  otherRating: number | null;
  // Rating in close games minus rating in the rest
  edge: number | null;
  closeGoals: number;
  closeAssists: number;
  label: "Ice cold" | "Steady" | "Shrinks";
}

// Close game: decided by one goal, or a draw
export function clutchRatings(matches: InsightMatch[], minClose = 5): ClutchLine[] {
  const close = matches.filter((m) => Math.abs(m.scoreFor - m.scoreAgainst) <= 1);
  const rest = matches.filter((m) => Math.abs(m.scoreFor - m.scoreAgainst) > 1);
  const c = new Map(playerLines(close).map((l) => [l.key, l]));
  const r = new Map(playerLines(rest).map((l) => [l.key, l]));
  const out: ClutchLine[] = [];
  for (const [key, l] of c) {
    if (l.games < minClose) continue;
    const other = r.get(key);
    const edge = l.avgRating !== null && other?.avgRating != null && other.games >= 3 ? l.avgRating - other.avgRating : null;
    out.push({
      name: l.name,
      closeGames: l.games,
      closeRating: l.avgRating,
      otherRating: other?.avgRating ?? null,
      edge,
      closeGoals: l.goals,
      closeAssists: l.assists,
      label: edge === null ? "Steady" : edge >= 0.15 ? "Ice cold" : edge <= -0.3 ? "Shrinks" : "Steady",
    });
  }
  return out.sort((a, b) => (b.closeRating ?? 0) - (a.closeRating ?? 0));
}

// ---------- Carry ----------

export interface CarryLine {
  name: string;
  games: number;
  score: number; // 0-1000
  label: "Talisman" | "Key player" | "Contributor" | "Passenger";
  ratingEdge: number | null; // vs teammates in the same games
  involvementShare: number; // share of the club's goals they scored or set up
  winLift: number | null; // win % with them minus without
}

// How much of the team a player carries: rating above teammates in the same games (40%), share of the
// club's goals they scored or set up (35%, not for keepers) and how much better the club does with them (25%)
export function carryScores(matches: InsightMatch[], minGames = 5): CarryLine[] {
  const lines = playerLines(matches, minGames);
  const out: CarryLine[] = [];
  for (const l of lines) {
    let edgeSum = 0, edgeN = 0, goalsWith = 0, withW = 0, withN = 0, woW = 0, woN = 0;
    for (const m of matches) {
      const me = m.players.find((p) => (p.ea_username || "").trim().toLowerCase() === l.key);
      if (!me) {
        woN++;
        if (m.result === "win") woW++;
        continue;
      }
      withN++;
      if (m.result === "win") withW++;
      goalsWith += m.scoreFor;
      const mine = num(me.rating);
      const others = m.players.filter((p) => p !== me).map((p) => num(p.rating)).filter((v): v is number => v !== null && v > 0);
      if (mine !== null && mine > 0 && others.length) {
        edgeSum += mine - others.reduce((a, b) => a + b, 0) / others.length;
        edgeN++;
      }
    }
    const ratingEdge = edgeN ? edgeSum / edgeN : null;
    const involvementShare = goalsWith ? Math.min(1, (l.goals + l.assists) / goalsWith) : 0;
    const winLift = woN >= 3 ? (withW / withN - woW / woN) * 100 : null;
    // Each part mapped to 0-1: rating edge of +1.0 = full marks, half the goals = full marks, +30 pts win lift = full marks
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const parts = [
      { w: 0.4, v: ratingEdge === null ? null : clamp((ratingEdge + 0.5) / 1.5) },
      // Keepers don't score or set up goals, so they are judged on the other two parts only
      { w: 0.35, v: l.role === "GK" ? null : clamp(involvementShare / 0.5) },
      { w: 0.25, v: winLift === null ? null : clamp((winLift + 30) / 60) },
    ].filter((p): p is { w: number; v: number } => p.v !== null);
    const wsum = parts.reduce((t, p) => t + p.w, 0);
    const score = Math.round((parts.reduce((t, p) => t + p.w * p.v, 0) / wsum) * SCORE_MAX);
    out.push({
      name: l.name,
      games: l.games,
      score,
      label: score >= 700 ? "Talisman" : score >= 500 ? "Key player" : score >= 300 ? "Contributor" : "Passenger",
      ratingEdge,
      involvementShare,
      winLift,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------- Defending ----------

export interface DefensiveLine {
  name: string;
  role: Role;
  games: number; // games at the back (DEF or GK)
  cleanSheetRate: number;
  concededPerGame: number;
  tacklesWonPerGame: number | null;
  tackleSuccess: number | null;
  avgRating: number | null;
}

export interface DefensivePair {
  names: [string, string];
  games: number;
  cleanSheetRate: number;
  concededPerGame: number;
}

export interface DefendingSummary {
  players: DefensiveLine[];
  pairs: DefensivePair[];
  recent: { games: number; cleanSheets: number; concededPerGame: number };
  earlier: { games: number; cleanSheets: number; concededPerGame: number };
  trend: "Tightening" | "Leaking" | "Steady" | null;
}

const atTheBack = (pos: string | null | undefined) => {
  const r = roleOf(pos);
  return r === "DEF" || r === "GK" ? r : null;
};

export function defendingSummary(matches: InsightMatch[], minGames = 5, recentWindow = 10): DefendingSummary {
  const back = matches.map((m) => ({ m, back: m.players.filter((p) => atTheBack(p.position)) }));
  // Each player's record in the games they played at the back
  const lines = playerLines(
    back.filter((b) => b.back.length).map((b) => ({ ...b.m, players: b.back })),
    minGames
  );
  const players: DefensiveLine[] = lines
    .filter((l) => l.role === "DEF" || l.role === "GK")
    .map((l) => {
      const games = back.filter((b) => b.back.some((p) => (p.ea_username || "").trim().toLowerCase() === l.key)).map((b) => b.m);
      return {
        name: l.name,
        role: l.role!,
        games: games.length,
        cleanSheetRate: (games.filter((m) => m.scoreAgainst === 0).length / games.length) * 100,
        concededPerGame: games.reduce((t, m) => t + m.scoreAgainst, 0) / games.length,
        tacklesWonPerGame: l.perGame.tacklesWonPerGame,
        tackleSuccess: l.perGame.tackleSuccess,
        avgRating: l.avgRating,
      };
    })
    .sort((a, b) => a.concededPerGame - b.concededPerGame);
  const pairMap = new Map<string, { names: [string, string]; games: number; cs: number; ga: number }>();
  for (const b of back) {
    const names = [...new Set(b.back.map((p) => (p.ea_username || "").trim()).filter(Boolean))].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const id = `${names[i].toLowerCase()}|${names[j].toLowerCase()}`;
      const p = pairMap.get(id) || { names: [names[i], names[j]] as [string, string], games: 0, cs: 0, ga: 0 };
      p.games++;
      if (b.m.scoreAgainst === 0) p.cs++;
      p.ga += b.m.scoreAgainst;
      pairMap.set(id, p);
    }
  }
  const pairs = [...pairMap.values()]
    .filter((p) => p.games >= minGames)
    .map((p) => ({ names: p.names, games: p.games, cleanSheetRate: (p.cs / p.games) * 100, concededPerGame: p.ga / p.games }))
    .sort((a, b) => a.concededPerGame - b.concededPerGame || b.games - a.games);
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const sum = (ms: InsightMatch[]) => ({ games: ms.length, cleanSheets: ms.filter((m) => m.scoreAgainst === 0).length, concededPerGame: ms.length ? ms.reduce((t, m) => t + m.scoreAgainst, 0) / ms.length : 0 });
  const recent = sum(sorted.slice(0, recentWindow));
  const earlier = sum(sorted.slice(recentWindow));
  const trend = recent.games >= 5 && earlier.games >= 5 ? (recent.concededPerGame <= earlier.concededPerGame - 0.4 ? "Tightening" : recent.concededPerGame >= earlier.concededPerGame + 0.4 ? "Leaking" : "Steady") : null;
  return { players, pairs, recent, earlier, trend };
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}
