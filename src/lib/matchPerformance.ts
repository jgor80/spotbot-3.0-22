// Match performance model: modelled goals, expected points, team scores out of 1000 and session
// reports, from the EA data each synced match already carries (both clubs' player rows).
//
// Everything is fitted or ranked against real FC27 games (the community research dataset, 14,240
// team games; scripts/ea-research-check.mjs --write-benchmarks regenerates the numbers):
// - Modelled goals come from shots on target, split by inside or outside the box. Fitted on that data
//   they track real goals with r = 0.77 (off-target shots added nothing, so they count zero). Without
//   EA event data a plain shots-on-target or shots rate is used. EA has no shot locations beyond
//   inside/outside the box, so this is not a shot-quality xG model and says nothing about finishing.
// - Expected points treat both sides' modelled goals as Poisson. On the dataset, games given 1.0-1.5
//   expected points earned 1.21, and 2.5-3.0 earned 2.81.
// - Each match gets five area scores (attack, ball security, defending, control, rating edge): where
//   that match sits among the FC27 games, on a 0-1000 scale (its FC27 percentile x 10). A club's score is
//   the average over its games.
// EA only reports human players, so both clubs' totals leave out AI teammates.
import { statsFromCounts } from "./eaEvents.ts";
import { FC27_BENCHMARKS } from "./fc27Benchmarks.ts";
import type { InsightMatch, MatchResult, PlayerMatchStats } from "./clubInsights.ts";

// Least-squares fit of team goals on shots on target inside and outside the box (no intercept).
// Off-target shots added nothing to the fit (their weights came out at about zero), so they count zero.
export const GOAL_MODEL = {
  onTargetInBox: 0.551,
  onTargetOutsideBox: 0.149,
  // Fallbacks when a side has no event data: goals per shot on target, then per shot
  perShotOnTarget: 0.491,
  perShot: 0.348,
};

// Team scores and match control run 0-1000 (an FC27 percentile x 10)
export const SCORE_MAX = 1000;

export type Area = "attack" | "ballSecurity" | "defending" | "control" | "ratingEdge";
export const AREAS: { key: Area; label: string; help: string }[] = [
  { key: "attack", label: "Attack", help: "Modelled goals for: shots on target, worth more from inside the box." },
  { key: "ballSecurity", label: "Ball security", help: "Pass completion and how rarely the ball is given away (per player)." },
  { key: "defending", label: "Defending", help: "Modelled goals against: how few good chances you allow." },
  { key: "control", label: "Control", help: "Your share of the game's modelled goals." },
  { key: "ratingEdge", label: "Rating edge", help: "Your players' average EA match rating minus the opposition's." },
];

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------- One side of one match ----------

export interface SideTotals {
  players: number;
  modelledGoals: number;
  // Pass completion % (null with no pass data)
  passCompletion: number | null;
  // Possessions lost per human player (null without event data)
  lostPerPlayer: number | null;
  avgRating: number | null;
  shots: number;
}

export function sideTotals(players: PlayerMatchStats[]): SideTotals | null {
  if (!players.length) return null;
  let inBox = 0, outBox = 0, sot = 0, shots = 0, made = 0, attempts = 0, lost = 0, withEvents = 0, sotKnown = false;
  const ratings: number[] = [];
  for (const p of players) {
    const r = num(p.rating);
    if (r !== null && r > 0) ratings.push(r);
    if (p.events) {
      const s = statsFromCounts(p.events);
      withEvents++;
      inBox += s.shotsOnTargetInBox || 0;
      outBox += s.shotsOnTargetOutsideBox || 0;
      sot += s.shotsOnTarget || 0;
      shots += (s.shotsOnTarget || 0) + (s.shotsOffTarget || 0);
      made += s.passesCompleted || 0;
      attempts += (s.passesCompleted || 0) + (s.passesFailed || 0);
      lost += s.possessionsLost || 0;
      sotKnown = true;
    } else {
      shots += num(p.shots) ?? 0;
      const o = num(p.shots_on_target);
      if (o !== null) {
        sot += o;
        sotKnown = true;
      }
      made += num(p.passes_made) ?? 0;
      attempts += num(p.pass_attempts) ?? 0;
    }
  }
  const allEvents = withEvents === players.length;
  const modelledGoals = allEvents
    ? inBox * GOAL_MODEL.onTargetInBox + outBox * GOAL_MODEL.onTargetOutsideBox
    : sotKnown
      ? sot * GOAL_MODEL.perShotOnTarget
      : shots * GOAL_MODEL.perShot;
  return {
    players: players.length,
    modelledGoals,
    passCompletion: attempts > 0 ? (made / attempts) * 100 : null,
    lostPerPlayer: allEvents ? lost / players.length : null,
    avgRating: mean(ratings),
    shots,
  };
}

// ---------- Expected points ----------

function poisson(lambda: number, k: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export function outcomeOdds(forGoals: number, againstGoals: number): { win: number; draw: number; loss: number } {
  const a = Math.max(0.05, forGoals);
  const b = Math.max(0.05, againstGoals);
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i <= 15; i++) {
    const pi = poisson(a, i);
    for (let j = 0; j <= 15; j++) {
      const p = pi * poisson(b, j);
      if (i > j) win += p;
      else if (i === j) draw += p;
      else loss += p;
    }
  }
  const t = win + draw + loss;
  return { win: win / t, draw: draw / t, loss: loss / t };
}

export function expectedPoints(forGoals: number, againstGoals: number): number {
  const o = outcomeOdds(forGoals, againstGoals);
  return 3 * o.win + o.draw;
}

// ---------- FC27 percentiles ----------

// Interpolated position of value among the 21 quantiles (0th, 5th, ..., 100th), 0-100
export function quantileScore(q: number[] | undefined, value: number | null, higherIsBetter = true): number | null {
  if (!q || !q.length || value === null || !Number.isFinite(value)) return null;
  let p: number;
  if (value <= q[0]) p = 0;
  else if (value >= q[q.length - 1]) p = 100;
  else {
    let i = 0;
    while (i < q.length - 2 && q[i + 1] <= value) i++;
    const span = q[i + 1] - q[i];
    p = ((i + (span > 0 ? (value - q[i]) / span : 0)) * 100) / (q.length - 1);
  }
  return higherIsBetter ? p : 100 - p;
}

const team = (k: string) => FC27_BENCHMARKS.team?.[k];

// ---------- One match ----------

export type Verdict = "Deserved win" | "Edged it" | "Smash and grab" | "Fair draw" | "Should have won" | "Got away with it" | "Deserved loss" | "Narrow loss" | "Hard luck";

export interface MatchPerformance {
  id: string;
  playedAt: Date;
  opponent: string;
  result: MatchResult;
  scoreFor: number;
  scoreAgainst: number;
  modelledFor: number;
  modelledAgainst: number;
  expectedPoints: number;
  points: number;
  // 0-1000 per area (null when the data for it is missing)
  areas: Record<Area, number | null>;
  // Average of the area scores
  control: number | null;
  verdict: Verdict;
  // True when both clubs' rows carried EA event data
  fullData: boolean;
}

// The point gap (modelled goals) that counts as one side clearly having the better of it
export const CLEAR_EDGE = 0.6;

export function verdictFor(result: MatchResult, modelledFor: number, modelledAgainst: number): Verdict {
  const edge = modelledFor - modelledAgainst;
  if (result === "win") return edge >= CLEAR_EDGE ? "Deserved win" : edge > -CLEAR_EDGE ? "Edged it" : "Smash and grab";
  if (result === "draw") return edge >= CLEAR_EDGE ? "Should have won" : edge <= -CLEAR_EDGE ? "Got away with it" : "Fair draw";
  return edge <= -CLEAR_EDGE ? "Deserved loss" : edge < CLEAR_EDGE ? "Narrow loss" : "Hard luck";
}

const POINTS: Record<MatchResult, number> = { win: 3, draw: 1, loss: 0 };

export function matchPerformance(m: InsightMatch): MatchPerformance | null {
  const us = sideTotals(m.players);
  const them = sideTotals(m.opponentPlayers || []);
  if (!us) return null;
  const modelledFor = us.modelledGoals;
  // Without the opposition's rows, fall back to what the scoreline says about their chances
  const modelledAgainst = them ? them.modelledGoals : m.scoreAgainst;
  const share = modelledFor + modelledAgainst > 0 ? modelledFor / (modelledFor + modelledAgainst) : 0.5;
  const ball = [quantileScore(team("passCompletion"), us.passCompletion), quantileScore(team("lostPerPlayer"), us.lostPerPlayer, false)].filter(
    (v): v is number => v !== null
  );
  const scale = (v: number | null) => (v === null ? null : v * (SCORE_MAX / 100));
  const areas: Record<Area, number | null> = {
    attack: scale(quantileScore(team("modelledGoalsFor"), modelledFor)),
    ballSecurity: scale(ball.length ? mean(ball) : null),
    defending: scale(them ? quantileScore(team("modelledGoalsFor"), modelledAgainst, false) : null),
    control: scale(them ? quantileScore(team("modelledGoalShare"), share) : null),
    ratingEdge: scale(them && us.avgRating !== null && them.avgRating !== null ? quantileScore(team("ratingEdge"), us.avgRating - them.avgRating) : null),
  };
  const scored = Object.values(areas).filter((v): v is number => v !== null);
  const fullData = !!them && m.players.every((p) => p.events) && (m.opponentPlayers || []).every((p) => p.events);
  return {
    id: m.id,
    playedAt: m.playedAt,
    opponent: m.opponent,
    result: m.result,
    scoreFor: m.scoreFor,
    scoreAgainst: m.scoreAgainst,
    modelledFor,
    modelledAgainst,
    expectedPoints: expectedPoints(modelledFor, modelledAgainst),
    points: POINTS[m.result],
    areas,
    control: scored.length >= 3 ? mean(scored) : null,
    verdict: verdictFor(m.result, modelledFor, modelledAgainst),
    fullData,
  };
}

// ---------- Many matches ----------

export interface PerformanceSummary {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  expectedPoints: number;
  goalsFor: number;
  goalsAgainst: number;
  modelledFor: number;
  modelledAgainst: number;
  control: number | null;
  areas: Record<Area, number | null>;
  strongest: Area | null;
  weakest: Area | null;
  matches: MatchPerformance[]; // newest first
  // Share of games where both clubs had EA event data (the model's best case)
  fullDataShare: number;
}

function areaMeans(perf: MatchPerformance[]): Record<Area, number | null> {
  const out = {} as Record<Area, number | null>;
  for (const { key } of AREAS) out[key] = mean(perf.map((p) => p.areas[key]).filter((v): v is number => v !== null));
  return out;
}

function extremes(areas: Record<Area, number | null>): { strongest: Area | null; weakest: Area | null } {
  const list = AREAS.map((a) => [a.key, areas[a.key]] as const).filter((x): x is readonly [Area, number] => x[1] !== null);
  if (!list.length) return { strongest: null, weakest: null };
  const sorted = [...list].sort((a, b) => b[1] - a[1]);
  return { strongest: sorted[0][0], weakest: sorted.length > 1 ? sorted[sorted.length - 1][0] : null };
}

export function summarisePerformance(matches: InsightMatch[]): PerformanceSummary {
  const perf = matches.map(matchPerformance).filter((p): p is MatchPerformance => !!p).sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const areas = areaMeans(perf);
  const sum = (f: (p: MatchPerformance) => number) => perf.reduce((t, p) => t + f(p), 0);
  return {
    games: perf.length,
    wins: perf.filter((p) => p.result === "win").length,
    draws: perf.filter((p) => p.result === "draw").length,
    losses: perf.filter((p) => p.result === "loss").length,
    points: sum((p) => p.points),
    expectedPoints: sum((p) => p.expectedPoints),
    goalsFor: sum((p) => p.scoreFor),
    goalsAgainst: sum((p) => p.scoreAgainst),
    modelledFor: sum((p) => p.modelledFor),
    modelledAgainst: sum((p) => p.modelledAgainst),
    control: mean(perf.map((p) => p.control).filter((v): v is number => v !== null)),
    areas,
    ...extremes(areas),
    matches: perf,
    fullDataShare: perf.length ? perf.filter((p) => p.fullData).length / perf.length : 0,
  };
}

// Points vs expected points as a sentence
export function pointsVerdict(points: number, expected: number, games: number): string {
  const gap = points - expected;
  const tolerance = Math.max(1, games * 0.35);
  const worth = `${points} point${points === 1 ? "" : "s"} from games worth ${expected.toFixed(1)}`;
  if (gap > tolerance) return `${worth}: you got more than the chances deserved.`;
  if (gap < -tolerance) return `${worth}: you played well enough for more.`;
  return `${worth}: the results matched the performances.`;
}

// ---------- Sessions ----------

// A new session starts after a 90-minute gap (same rule as the session recap and the coach)
export const SESSION_BREAK_MS = 90 * 60 * 1000;

// Matches grouped into nights, newest night first, each night oldest game first
export function groupSessions(matches: InsightMatch[]): InsightMatch[][] {
  const sorted = [...matches].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  const nights: InsightMatch[][] = [];
  let last = -Infinity;
  for (const m of sorted) {
    const t = m.playedAt.getTime();
    if (t - last > SESSION_BREAK_MS || !nights.length) nights.push([]);
    nights[nights.length - 1].push(m);
    last = t;
  }
  return nights.reverse();
}

export function grade(control: number | null): string {
  if (control === null) return "–";
  if (control >= 800) return "A+";
  if (control >= 700) return "A";
  if (control >= 620) return "B+";
  if (control >= 550) return "B";
  if (control >= 480) return "C+";
  if (control >= 400) return "C";
  if (control >= 300) return "D";
  return "F";
}

interface PlayerTally {
  key: string;
  name: string;
  games: number;
  goals: number;
  assists: number;
  secondAssists: number;
  tackles: number;
  interceptions: number;
  passMade: number;
  passAtt: number;
  saves: number;
  conceded: number;
  ratingSum: number;
  rated: number;
  gk: number;
}

function tally(matches: InsightMatch[]): Map<string, PlayerTally> {
  const out = new Map<string, PlayerTally>();
  for (const m of matches) {
    for (const p of m.players) {
      const name = (p.ea_username || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let t = out.get(key);
      if (!t) out.set(key, (t = { key, name, games: 0, goals: 0, assists: 0, secondAssists: 0, tackles: 0, interceptions: 0, passMade: 0, passAtt: 0, saves: 0, conceded: 0, ratingSum: 0, rated: 0, gk: 0 }));
      t.games++;
      const s = p.events ? statsFromCounts(p.events) : null;
      t.goals += num(p.goals) ?? 0;
      t.assists += num(p.assists) ?? 0;
      t.secondAssists += s?.secondAssists ?? 0;
      t.tackles += s ? s.tacklesWon || 0 : num(p.tackles) ?? 0;
      t.interceptions += s ? s.interceptions || 0 : num(p.interceptions) ?? 0;
      t.passMade += s ? s.passesCompleted || 0 : num(p.passes_made) ?? 0;
      t.passAtt += s ? (s.passesCompleted || 0) + (s.passesFailed || 0) : num(p.pass_attempts) ?? 0;
      const isGk = /^(gk|goalkeeper)$/i.test(String(p.position || ""));
      if (isGk) {
        t.gk++;
        t.saves += num(p.saves) ?? 0;
        t.conceded += m.scoreAgainst;
      }
      const r = num(p.rating);
      if (r !== null && r > 0) {
        t.ratingSum += r;
        t.rated++;
      }
    }
  }
  return out;
}

const avg = (t: PlayerTally) => (t.rated ? t.ratingSum / t.rated : null);
const per = (n: number, g: number) => (g ? n / g : 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export interface SessionPlayerLine {
  name: string;
  games: number;
  avgRating: number | null;
  usualRating: number | null;
  line: string;
}

// One plain sentence per player: what they did, then the stat that moved most against their usual
function playerLine(t: PlayerTally, usual: PlayerTally | undefined): string {
  const bits: string[] = [];
  if (t.gk >= Math.ceil(t.games / 2)) {
    bits.push(`${plural(t.saves, "save")} in ${plural(t.games, "game")}, ${per(t.conceded, t.gk).toFixed(1)} conceded a game`);
    if (usual?.gk) bits.push(`(usually ${per(usual.conceded, usual.gk).toFixed(1)})`);
    return bits.join(" ");
  }
  const contrib: string[] = [];
  if (t.goals) contrib.push(plural(t.goals, "goal"));
  if (t.assists) contrib.push(plural(t.assists, "assist"));
  if (t.secondAssists) contrib.push(plural(t.secondAssists, "second assist"));
  bits.push(contrib.length ? `${contrib.join(", ")} in ${plural(t.games, "game")}` : `${plural(t.games, "game")}`);
  // The per-game stat furthest above or below their usual
  const options: { text: string; now: number; was: number | null; scale: number }[] = [
    { text: "tackles won a game", now: per(t.tackles, t.games), was: usual?.games ? per(usual.tackles, usual.games) : null, scale: 1.5 },
    { text: "interceptions a game", now: per(t.interceptions, t.games), was: usual?.games ? per(usual.interceptions, usual.games) : null, scale: 1 },
  ];
  if (t.passAtt >= 10) {
    options.push({ text: "% passing", now: (t.passMade / t.passAtt) * 100, was: usual && usual.passAtt >= 20 ? (usual.passMade / usual.passAtt) * 100 : null, scale: 6 });
  }
  // Prefer a clear step up on their usual; otherwise the biggest change either way
  // A zero tonight is usually the role they played, not news, so it is never the headline
  const scored = options
    .filter((o) => o.now > 0)
    .map((o) => ({ ...o, z: o.was === null ? 0 : (o.now - o.was) / o.scale }));
  const best = scored.filter((o) => o.z >= 0.5).sort((a, b) => b.z - a.z)[0] || scored.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || b.now - a.now)[0];
  if (!best) {
    const now = avg(t);
    const was = usual ? avg(usual) : null;
    if (now !== null) bits.push(`rated ${now.toFixed(1)}${was !== null ? ` (usually ${was.toFixed(1)})` : ""}`);
  } else {
    const value = best.text.startsWith("%") ? `${Math.round(best.now)}${best.text}` : `${best.now.toFixed(1)} ${best.text}`;
    const was = best.was === null ? "" : best.text.startsWith("%") ? ` (usually ${Math.round(best.was)}%)` : ` (usually ${best.was.toFixed(1)})`;
    bits.push(`${value}${was}`);
  }
  return bits.join(", ");
}

export interface SessionReport {
  startedAt: Date;
  endedAt: Date;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  expectedPoints: number;
  control: number | null;
  usualControl: number | null;
  grade: string;
  areas: { key: Area; label: string; score: number | null; usual: number | null; delta: number | null }[];
  // Best and worst area against the club's usual (or in absolute terms with no history)
  strength: { key: Area; label: string; delta: number | null } | null;
  fixFirst: { key: Area; label: string; delta: number | null } | null;
  pointsLine: string;
  playerOfSession: SessionPlayerLine | null;
  players: SessionPlayerLine[];
  matches: MatchPerformance[];
}

// session: the night's matches; history: earlier matches (any order) to compare against
export function sessionReport(session: InsightMatch[], history: InsightMatch[]): SessionReport | null {
  if (!session.length) return null;
  const now = summarisePerformance(session);
  const before = history.length ? summarisePerformance(history) : null;
  const areas = AREAS.map((a) => {
    const score = now.areas[a.key];
    const usual = before && before.games >= 3 ? before.areas[a.key] : null;
    return { key: a.key, label: a.label, score, usual, delta: score !== null && usual !== null ? score - usual : null };
  });
  const withDelta = areas.filter((a) => a.delta !== null);
  const pool = withDelta.length >= 2 ? withDelta : areas.filter((a) => a.score !== null);
  const rank = (a: (typeof areas)[number]) => (withDelta.length >= 2 ? a.delta! : a.score!);
  const sorted = [...pool].sort((a, b) => rank(b) - rank(a));
  const strength = sorted[0] ? { key: sorted[0].key, label: sorted[0].label, delta: sorted[0].delta } : null;
  const low = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const fixFirst = low ? { key: low.key, label: low.label, delta: low.delta } : null;

  const tonight = tally(session);
  const usual = tally(history);
  const minGames = Math.max(1, Math.ceil(session.length / 2));
  const players: SessionPlayerLine[] = [...tonight.values()]
    .map((t) => ({ name: t.name, games: t.games, avgRating: avg(t), usualRating: usual.get(t.key) ? avg(usual.get(t.key)!) : null, line: playerLine(t, usual.get(t.key)), t }))
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || b.games - a.games)
    .map(({ t: _t, ...rest }) => rest);
  // Player of the session: best average rating over at least half the night, goal involvement breaks ties
  const pots = [...tonight.values()]
    .filter((t) => t.games >= minGames && avg(t) !== null)
    .sort((a, b) => avg(b)! + per(b.goals + b.assists, b.games) * 0.3 - (avg(a)! + per(a.goals + a.assists, a.games) * 0.3))[0];
  const ordered = [...session].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  return {
    startedAt: ordered[0].playedAt,
    endedAt: ordered[ordered.length - 1].playedAt,
    games: now.games,
    wins: now.wins,
    draws: now.draws,
    losses: now.losses,
    goalsFor: now.goalsFor,
    goalsAgainst: now.goalsAgainst,
    points: now.points,
    expectedPoints: now.expectedPoints,
    control: now.control,
    usualControl: before && before.games >= 3 ? before.control : null,
    grade: grade(now.control),
    areas,
    strength,
    fixFirst,
    pointsLine: pointsVerdict(now.points, now.expectedPoints, now.games),
    playerOfSession: pots ? players.find((p) => p.name === pots.name) || null : null,
    players,
    matches: now.matches,
  };
}

// What each area's weakness usually means on the pitch, for the "fix first" line
export const AREA_FIX: Record<Area, string> = {
  attack: "Few good chances: get more shots away from inside the box.",
  ballSecurity: "Too many passes going astray: keep it simple and stop forcing the ball forward.",
  defending: "Letting the opposition get clean shots in your box: stay compact and track runners.",
  control: "The other side made more of the game: win the ball back higher and keep it longer.",
  ratingEdge: "Their players outperformed yours one for one: check who was out of position or chasing the game.",
};
