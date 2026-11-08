// Advanced player and club stats from EA's per-player event counts (decoded by eaEvents.ts).
// Pure functions over InsightMatch[] (clubInsights.ts attaches each player's `events`), shared by the
// web Insights page and the bot (bundled into public/spotbot/club-insights.cjs).
//
// What the event data can and can't say (checked by scripts/ea-research-check.mjs on 51k FC27 rows):
// - EA reports a player's role only as goalkeeper / defender / midfielder / forward, so "best
//   position" is a best role.
// - Positional discipline and decision quality come from EA's own in-game feedback popups. Their
//   share (not raw counts, which mostly measure involvement) lines up with match rating.
import { statsFromCounts, type EaEventStats } from "./eaEvents.ts";
import { FC27_BENCHMARKS } from "./fc27Benchmarks.ts";
import type { InsightMatch, PlayerMatchStats } from "./clubInsights.ts";

export type Role = "GK" | "DEF" | "MID" | "FWD";
export const ROLE_LABELS: Record<Role, string> = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };

export function roleOf(position: string | null | undefined): Role | null {
  const p = String(position || "").trim().toLowerCase();
  if (!p) return null;
  if (p === "goalkeeper" || p === "gk") return "GK";
  if (p === "defender" || ["cb", "lcb", "rcb", "lb", "rb", "lwb", "rwb", "sw"].includes(p)) return "DEF";
  if (p === "midfielder" || ["cdm", "ldm", "rdm", "cm", "lcm", "rcm", "cam", "lam", "ram", "lm", "rm"].includes(p)) return "MID";
  if (p === "forward" || p === "attacker" || ["st", "ls", "rs", "cf", "lf", "rf", "lw", "rw"].includes(p)) return "FWD";
  return null;
}

function pct(made: number, total: number): number | null {
  return total > 0 ? (made / total) * 100 : null;
}

function perGame(total: number, games: number): number | null {
  return games > 0 ? total / games : null;
}

function addInto(into: EaEventStats, add: EaEventStats) {
  for (const [k, v] of Object.entries(add)) into[k] = (into[k] || 0) + v;
}

function emptyTotals(): EaEventStats {
  return statsFromCounts({});
}

// EA's popups after an action: "best/good option taken" vs "should have passed elsewhere" / "use the ball"
export function decisionScore(t: EaEventStats): number | null {
  const good = (t.bestOption || 0) + (t.goodOption || 0);
  const bad = (t.shouldHavePassedElsewhere || 0) + (t.useTheBall || 0);
  return pct(good, good + bad);
}

// Share of EA's positioning feedback that was praise rather than an out-of-position warning
export function positionalDiscipline(t: EaEventStats): number | null {
  const good = t.inPosition || 0;
  return pct(good, good + (t.outOfPosition || 0));
}

export type PassStyle = "Progressive" | "Balanced" | "Recycler";

// Forward share of completed passes. The FC27 median is about 54%; the cut-offs are its upper and
// lower quartiles over players with 5+ games (scripts/ea-research-check.mjs prints them).
export const PASS_STYLE_CUTOFFS = { progressive: 64, recycler: 43 };

export function passStyle(forwardShare: number | null): PassStyle | null {
  if (forwardShare === null) return null;
  if (forwardShare >= PASS_STYLE_CUTOFFS.progressive) return "Progressive";
  if (forwardShare <= PASS_STYLE_CUTOFFS.recycler) return "Recycler";
  return "Balanced";
}

export interface DerivedStats {
  passCompletion: number | null;
  shortPassPct: number | null;
  mediumPassPct: number | null;
  longPassPct: number | null;
  crossPct: number | null;
  forwardShare: number | null;
  passStyle: PassStyle | null;
  shotAccuracy: number | null;
  insideBoxShotShare: number | null;
  tackleSuccess: number | null;
  slidingTackleShare: number | null;
  pressingPerGame: number | null; // ball won in the attacking third
  lostOwnThirdPerGame: number | null;
  netPossessionPerGame: number | null; // won minus lost
  outOfPositionPerGame: number | null;
  severeOutOfPositionPerGame: number | null;
  positionalDiscipline: number | null;
  decisionScore: number | null;
  aerialsPerGame: number | null;
  foulsPerGame: number | null;
  cardsPerGame: number | null;
}

export function deriveStats(t: EaEventStats, games: number): DerivedStats {
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
    cardsPerGame: perGame(t.yellowCards || 0, games),
  };
}

export interface RoleLine {
  role: Role;
  games: number;
  avgRating: number | null;
  positionalDiscipline: number | null;
  decisionScore: number | null;
  outOfPositionPerGame: number | null;
}

export interface AdvancedPlayer {
  key: string;
  name: string;
  games: number; // games with EA event data
  totals: EaEventStats;
  derived: DerivedStats;
  roles: RoleLine[];
  // Outfield role with the best average match rating (3+ games in it); null with only one such role.
  // Positional discipline per role is shown next to it but doesn't pick the role: in the FC27 data it
  // picked the higher-rated role only about half the time.
  bestRole: Role | null;
}

function keyOf(p: PlayerMatchStats): string | null {
  const name = (p.ea_username || "").trim();
  return name ? name.toLowerCase() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export const MIN_ROLE_GAMES = 3;

// Every player with EA event data in the given matches, most games first
export function computeAdvancedPlayers(matches: InsightMatch[], minGames = 1): AdvancedPlayer[] {
  const acc = new Map<string, { name: string; games: number; totals: EaEventStats; roles: Map<Role, { games: number; totals: EaEventStats; rating: number; rated: number }> }>();
  for (const m of matches) {
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      const s = statsFromCounts(p.events);
      let a = acc.get(key);
      if (!a) acc.set(key, (a = { name: (p.ea_username || "").trim(), games: 0, totals: emptyTotals(), roles: new Map() }));
      a.games++;
      addInto(a.totals, s);
      const role = roleOf(p.position);
      if (role) {
        let r = a.roles.get(role);
        if (!r) a.roles.set(role, (r = { games: 0, totals: emptyTotals(), rating: 0, rated: 0 }));
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

  const out: AdvancedPlayer[] = [];
  for (const [key, a] of acc) {
    if (a.games < minGames) continue;
    const roles: RoleLine[] = [...a.roles.entries()]
      .map(([role, r]) => ({
        role,
        games: r.games,
        avgRating: r.rated ? r.rating / r.rated : null,
        positionalDiscipline: positionalDiscipline(r.totals),
        decisionScore: decisionScore(r.totals),
        outOfPositionPerGame: perGame(r.totals.outOfPosition || 0, r.games),
      }))
      .sort((x, y) => y.games - x.games);
    const candidates = roles.filter((r) => r.role !== "GK" && r.games >= MIN_ROLE_GAMES && r.avgRating !== null);
    const bestRole = candidates.length >= 2
      ? [...candidates].sort((x, y) => (y.avgRating! - x.avgRating!) || ((y.positionalDiscipline ?? 0) - (x.positionalDiscipline ?? 0)))[0].role
      : null;
    out.push({ key, name: a.name, games: a.games, totals: a.totals, derived: deriveStats(a.totals, a.games), roles, bestRole });
  }
  return out.sort((x, y) => y.games - x.games || x.name.localeCompare(y.name));
}

// ---------- Club level ----------

interface TeamEvents {
  totals: EaEventStats;
  players: number;
}

// Our club's summed event stats for one match (null when no player had event data)
export function teamEvents(m: InsightMatch): TeamEvents | null {
  const totals = emptyTotals();
  let players = 0;
  for (const p of m.players) {
    if (!p.events) continue;
    addInto(totals, statsFromCounts(p.events));
    players++;
  }
  return players ? { totals, players } : null;
}

interface Record3 {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

function rec(): Record3 {
  return { games: 0, wins: 0, draws: 0, losses: 0 };
}

function addResult(r: Record3, m: InsightMatch) {
  r.games++;
  if (m.result === "win") r.wins++;
  else if (m.result === "draw") r.draws++;
  else r.losses++;
}

function winRate(r: Record3): number {
  return r.games ? (r.wins / r.games) * 100 : 0;
}

export interface Partnership {
  names: [string, string];
  roles: string; // e.g. "DEF + DEF"
  games: number;
  winPct: number;
  // Out-of-position warnings per game for the pair together, and what the same two average apart
  outOfPositionTogether: number;
  outOfPositionApart: number | null;
  // Possession lost per game for the pair together, and apart
  lostTogether: number;
  lostApart: number | null;
}

// Outfield pairs who share a role group (two defenders, two midfielders, or a defender and a
// midfielder), compared with how each plays without the other. Lower "together" numbers than
// "apart" mean the pair covers for each other.
export function computePartnerships(matches: InsightMatch[], minTogether = 5): Partnership[] {
  type Line = { oop: number; lost: number; role: Role | null };
  const perMatch = matches.map((m) => {
    const lines = new Map<string, Line & { name: string }>();
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      const s = statsFromCounts(p.events);
      lines.set(key, { name: (p.ea_username || "").trim(), oop: s.outOfPosition || 0, lost: s.possessionsLost || 0, role: roleOf(p.position) });
    }
    return { m, lines };
  });

  const pairs = new Map<string, { names: [string, string]; roles: Map<string, number>; together: Record3; oop: number; lost: number }>();
  for (const { m, lines } of perMatch) {
    const keys = [...lines.keys()].sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = lines.get(keys[i])!;
        const b = lines.get(keys[j])!;
        if (!a.role || !b.role || a.role === "GK" || b.role === "GK" || a.role === "FWD" || b.role === "FWD") continue;
        const id = `${keys[i]}|${keys[j]}`;
        let pr = pairs.get(id);
        if (!pr) pairs.set(id, (pr = { names: [a.name, b.name], roles: new Map(), together: rec(), oop: 0, lost: 0 }));
        const roleId = [a.role, b.role].sort().join(" + ");
        pr.roles.set(roleId, (pr.roles.get(roleId) || 0) + 1);
        addResult(pr.together, m);
        pr.oop += a.oop + b.oop;
        pr.lost += a.lost + b.lost;
      }
    }
  }

  const out: Partnership[] = [];
  for (const [id, pr] of pairs) {
    if (pr.together.games < minTogether) continue;
    const [ka, kb] = id.split("|");
    // Each player's own average in games without the other
    const apart = (k: string, other: string) => {
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
      lostApart: a && b ? a.lost + b.lost : null,
    });
  }
  // Biggest drop in out-of-position warnings together first
  const gain = (p: Partnership) => (p.outOfPositionApart === null ? -Infinity : p.outOfPositionApart - p.outOfPositionTogether);
  return out.sort((x, y) => gain(y) - gain(x) || y.games - x.games);
}

export interface SessionGameLine {
  gameNumber: number; // 1-based; the last bucket also holds every later game
  label: string;
  games: number;
  winPct: number;
  decisionScore: number | null;
  positionalDiscipline: number | null;
  outOfPositionPerPlayer: number | null;
}

// A new session starts when the gap since the previous game is longer than this
export const SESSION_GAP_MS = 90 * 60 * 1000;

// How the club does by game number within a session (back-to-back games on one night)
export function computeSessionFatigue(matches: InsightMatch[], buckets = 5): SessionGameLine[] {
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
  return acc
    .map((b, i) => ({
      gameNumber: i + 1,
      label: i + 1 === buckets ? `Game ${buckets}+` : `Game ${i + 1}`,
      games: b.r.games,
      winPct: winRate(b.r),
      decisionScore: decisionScore(b.totals),
      positionalDiscipline: positionalDiscipline(b.totals),
      outOfPositionPerPlayer: b.playerGames ? (b.totals.outOfPosition || 0) / b.playerGames : null,
    }))
    .filter((l) => l.games > 0);
}

export interface PressingBand {
  band: "Low" | "Medium" | "High";
  range: string; // ball wins in the attacking third per game, e.g. "0-1"
  games: number;
  winPct: number;
  goalsFor: number; // per game
  goalsAgainst: number; // per game
}

// Matches split into thirds by how often the club won the ball in the attacking third
export function computePressing(matches: InsightMatch[]): PressingBand[] {
  const rows = matches
    .map((m) => ({ m, te: teamEvents(m) }))
    .filter((x): x is { m: InsightMatch; te: TeamEvents } => !!x.te)
    .map((x) => ({ m: x.m, v: x.te.totals.wonAttackingThird || 0 }))
    .sort((a, b) => a.v - b.v);
  if (rows.length < 9) return [];
  const cut = (i: number) => rows[Math.min(rows.length - 1, Math.floor((rows.length * i) / 3))].v;
  const lowMax = cut(1);
  const midMax = Math.max(cut(2), lowMax + 1);
  const groups: [PressingBand["band"], (v: number) => boolean, string][] = [
    ["Low", (v) => v < lowMax, `0-${Math.max(0, lowMax - 1)}`],
    ["Medium", (v) => v >= lowMax && v < midMax, lowMax === midMax - 1 ? `${lowMax}` : `${lowMax}-${midMax - 1}`],
    ["High", (v) => v >= midMax, `${midMax}+`],
  ];
  return groups
    .map(([band, test, range]) => {
      const r = rec();
      let gf = 0, ga = 0;
      for (const x of rows) {
        if (!test(x.v)) continue;
        addResult(r, x.m);
        gf += x.m.scoreFor;
        ga += x.m.scoreAgainst;
      }
      return { band, range, games: r.games, winPct: winRate(r), goalsFor: r.games ? gf / r.games : 0, goalsAgainst: r.games ? ga / r.games : 0 };
    })
    .filter((b) => b.games > 0)
    // Most clubs win the ball up front 0-1 times a game, so the thirds often collapse into two bands
    .map((b, i, list) => (list.length === 2 ? { ...b, band: i === 0 ? "Low" : "High" } : b));
}

export interface AdvancedInsight {
  tone: "good" | "bad" | "neutral";
  text: string;
}

const r0 = (n: number) => `${Math.round(n)}%`;

// Plain-language takeaways from the event data; only ones with enough games behind them
export function generateAdvancedInsights(matches: InsightMatch[]): AdvancedInsight[] {
  const out: AdvancedInsight[] = [];
  if (matches.filter((m) => m.players.some((p) => p.events)).length < 5) return out;

  const fatigue = computeSessionFatigue(matches);
  const early = fatigue.filter((l) => l.gameNumber <= 2);
  const late = fatigue.filter((l) => l.gameNumber >= 4);
  const avg = (ls: SessionGameLine[], k: "decisionScore" | "winPct") => {
    const g = ls.reduce((s, l) => s + (l[k] === null ? 0 : l.games), 0);
    return g ? ls.reduce((s, l) => s + (l[k] ?? 0) * l.games, 0) / g : null;
  };
  const earlyGames = early.reduce((s, l) => s + l.games, 0);
  const lateGames = late.reduce((s, l) => s + l.games, 0);
  // Across FC27 clubs, decisions hold steady through a session and win rates rise after game 1, so
  // only call out a club that clearly goes against that.
  if (earlyGames >= 5 && lateGames >= 5) {
    const dq1 = avg(early, "decisionScore");
    const dq2 = avg(late, "decisionScore");
    const w1 = avg(early, "winPct")!;
    const w2 = avg(late, "winPct")!;
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
    const wr = avg(rest, "winPct")!;
    if (wr - first.winPct >= 15) out.push({ tone: "neutral", text: `Slow starter: the club wins ${r0(first.winPct)} of the first game of a session and ${r0(wr)} after that. A warm-up game may help.` });
  }

  const pressing = computePressing(matches);
  const low = pressing.find((b) => b.band === "Low");
  const high = pressing.find((b) => b.band === "High");
  if (low && high && low.games >= 5 && high.games >= 5 && Math.abs(high.winPct - low.winPct) >= 15) {
    out.push({
      tone: high.winPct > low.winPct ? "good" : "neutral",
      text: high.winPct > low.winPct
        ? `Pressing pays: ${r0(high.winPct)} wins when the club wins the ball in the attacking third ${high.range} times, ${r0(low.winPct)} when it's ${low.range}.`
        : `High pressing hasn't paid off: ${r0(high.winPct)} wins in high-press games vs ${r0(low.winPct)} in low-press ones.`,
    });
  }

  const players = computeAdvancedPlayers(matches, 5);
  const byDecision = players.filter((p) => p.derived.decisionScore !== null).sort((a, b) => b.derived.decisionScore! - a.derived.decisionScore!);
  if (byDecision.length >= 3) {
    out.push({ tone: "good", text: `${byDecision[0].name} makes the best calls on the ball: ${r0(byDecision[0].derived.decisionScore!)} of EA's decision feedback is "good option" or better.` });
  }
  const loose = players
    .filter((p) => p.roles[0]?.role !== "GK" && p.derived.outOfPositionPerGame !== null)
    .sort((a, b) => b.derived.outOfPositionPerGame! - a.derived.outOfPositionPerGame!);
  if (loose.length >= 3 && loose[0].derived.outOfPositionPerGame! >= 4) {
    out.push({ tone: "bad", text: `${loose[0].name} gets the most out-of-position warnings: ${loose[0].derived.outOfPositionPerGame!.toFixed(1)} a game.` });
  }
  for (const p of players) {
    if (!p.bestRole || p.roles[0].role === p.bestRole) continue;
    const best = p.roles.find((r) => r.role === p.bestRole)!;
    const main = p.roles[0];
    if ((best.avgRating ?? 0) - (main.avgRating ?? 0) >= 0.5) {
      out.push({ tone: "neutral", text: `${p.name} mostly plays ${ROLE_LABELS[main.role].toLowerCase()} but rates higher as a ${ROLE_LABELS[p.bestRole].toLowerCase()} (${best.avgRating!.toFixed(1)} vs ${main.avgRating!.toFixed(1)} over ${best.games} games).` });
      break;
    }
  }

  // Pair-vs-apart gaps are noisy (in the FC27 data about half of pairs are tighter together), so only
  // a big gap is worth saying
  const pair = computePartnerships(matches).find((p) => p.outOfPositionApart !== null && p.outOfPositionApart - p.outOfPositionTogether >= 2);
  if (pair) {
    out.push({ tone: "good", text: `${pair.names.join(" + ")} cover for each other: ${pair.outOfPositionTogether.toFixed(1)} out-of-position warnings a game together vs ${pair.outOfPositionApart!.toFixed(1)} apart (${pair.games} games).` });
  }
  return out;
}

// ---------- FC27 benchmarks ----------

export interface BenchMetric {
  key: string;
  label: string;
  lowerIsBetter?: boolean;
  get: (p: AdvancedPlayer) => number | null;
}

const perGameOf = (k: string) => (p: AdvancedPlayer) => (p.games ? (p.totals[k] || 0) / p.games : null);

// Stats players are ranked on against every FC27 player in the research data with the same main role
export const BENCH_METRICS: BenchMetric[] = [
  { key: "decisionScore", label: "Decisions", get: (p) => p.derived.decisionScore },
  { key: "positionalDiscipline", label: "Positioning", get: (p) => p.derived.positionalDiscipline },
  { key: "outOfPositionPerGame", label: "Out of position", lowerIsBetter: true, get: (p) => p.derived.outOfPositionPerGame },
  { key: "passCompletion", label: "Pass completion", get: (p) => p.derived.passCompletion },
  { key: "tackleSuccess", label: "Tackle success", get: (p) => p.derived.tackleSuccess },
  { key: "shotAccuracy", label: "Shot accuracy", get: (p) => p.derived.shotAccuracy },
  { key: "pressingPerGame", label: "Pressing", get: (p) => p.derived.pressingPerGame },
  { key: "aerialsPerGame", label: "Aerials", get: (p) => p.derived.aerialsPerGame },
  { key: "interceptionsPerGame", label: "Interceptions", get: perGameOf("interceptions") },
  { key: "dribblesPerGame", label: "Dribbles", get: perGameOf("dribbles") },
  { key: "throughBallsPerGame", label: "Through balls", get: perGameOf("throughBalls") },
  { key: "secondAssistsPerGame", label: "Second assists", get: perGameOf("secondAssists") },
];

// The player's main role (most games) when the research data has a benchmark for it
export function benchRole(p: AdvancedPlayer): Role | null {
  const r = p.roles[0]?.role;
  return r && FC27_BENCHMARKS.roles[r] ? r : null;
}

// Where a value sits among FC27 players of that role: 0-100, higher is better (lower-is-better
// stats are flipped). Null when there is no benchmark.
export function fc27Percentile(role: Role, metric: string, value: number | null): number | null {
  const q = FC27_BENCHMARKS.roles[role]?.[metric];
  const m = BENCH_METRICS.find((b) => b.key === metric);
  if (!q || value === null || !m) return null;
  // q holds the 0th, 5th, ..., 100th percentile values
  let pct: number;
  if (value <= q[0]) pct = 0;
  else if (value >= q[q.length - 1]) pct = 100;
  else {
    let i = 0;
    while (i < q.length - 1 && q[i + 1] < value) i++;
    // Ties span several steps; land in the middle of them
    let j = i + 1;
    while (j < q.length - 1 && q[j + 1] === value) j++;
    const lo = q[i], hi = q[j];
    const frac = hi > lo ? (value - lo) / (hi - lo) : 0.5;
    pct = (i + frac * (j - i)) * (100 / (q.length - 1));
  }
  return m.lowerIsBetter ? 100 - pct : pct;
}

export interface Benchmark {
  key: string;
  label: string;
  value: number;
  percentile: number;
}

// Every benchmarked stat for a player, best first
export function benchmarkPlayer(p: AdvancedPlayer): Benchmark[] {
  const role = benchRole(p);
  if (!role) return [];
  const out: Benchmark[] = [];
  for (const m of BENCH_METRICS) {
    const value = m.get(p);
    const percentile = fc27Percentile(role, m.key, value);
    if (value !== null && percentile !== null) out.push({ key: m.key, label: m.label, value, percentile });
  }
  return out.sort((a, b) => b.percentile - a.percentile);
}

// "Top 12% of FC27 midfielders" style text
export function percentileText(percentile: number, role: Role): string {
  const roleWord = ROLE_LABELS[role].toLowerCase() + "s";
  if (percentile >= 50) return `top ${Math.max(1, Math.round(100 - percentile))}% of FC27 ${roleWord}`;
  return `bottom ${Math.max(1, Math.round(percentile))}% of FC27 ${roleWord}`;
}

// ---------- Form trends ----------

export interface FormTrend {
  key: string;
  name: string;
  recentGames: number;
  earlierGames: number;
  // Recent minus earlier, in percentage points
  decisionChange: number | null;
  positioningChange: number | null;
  passCompletionChange: number | null;
  tackleSuccessChange: number | null;
  recent: DerivedStats;
  earlier: DerivedStats;
  trend: "Improving" | "Dipping" | "Steady";
}

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

// Each player's last `recent` games (with event data) against the games before them
export function computeFormTrends(matches: InsightMatch[], recent = 10, minEarlier = 5): FormTrend[] {
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const lines = new Map<string, { name: string; recent: EaEventStats; earlier: EaEventStats; r: number; e: number }>();
  for (const m of sorted) {
    for (const p of m.players) {
      const key = keyOf(p);
      if (!key || !p.events) continue;
      let l = lines.get(key);
      if (!l) lines.set(key, (l = { name: (p.ea_username || "").trim(), recent: emptyTotals(), earlier: emptyTotals(), r: 0, e: 0 }));
      if (l.r < recent) {
        addInto(l.recent, statsFromCounts(p.events));
        l.r++;
      } else {
        addInto(l.earlier, statsFromCounts(p.events));
        l.e++;
      }
    }
  }
  const out: FormTrend[] = [];
  for (const [key, l] of lines) {
    if (l.r < Math.min(recent, 5) || l.e < minEarlier) continue;
    const r = deriveStats(l.recent, l.r);
    const e = deriveStats(l.earlier, l.e);
    const decisionChange = diff(r.decisionScore, e.decisionScore);
    const positioningChange = diff(r.positionalDiscipline, e.positionalDiscipline);
    const score = (decisionChange ?? 0) + (positioningChange ?? 0) / 2;
    out.push({
      key, name: l.name, recentGames: l.r, earlierGames: l.e,
      decisionChange, positioningChange,
      passCompletionChange: diff(r.passCompletion, e.passCompletion),
      tackleSuccessChange: diff(r.tackleSuccess, e.tackleSuccess),
      recent: r, earlier: e,
      trend: score >= 5 ? "Improving" : score <= -5 ? "Dipping" : "Steady",
    });
  }
  const weight = (t: FormTrend) => (t.decisionChange ?? 0) + (t.positioningChange ?? 0) / 2;
  return out.sort((a, b) => weight(b) - weight(a));
}

// ---------- One match ----------

export interface MatchHighlight {
  kind: "decisions" | "positioning" | "pressing" | "passing";
  name: string;
  text: string;
}

// Deep-stat standouts from a single game, for recaps. Only players with enough feedback to mean something.
export function matchDeepHighlights(m: InsightMatch): MatchHighlight[] {
  const rows = m.players
    .filter((p) => p.events && roleOf(p.position) !== "GK")
    .map((p) => ({ name: (p.ea_username || "").trim(), s: statsFromCounts(p.events) }));
  if (!rows.length) return [];
  const out: MatchHighlight[] = [];
  const decided = rows
    .map((r) => {
      const good = r.s.bestOption + r.s.goodOption;
      const total = good + r.s.shouldHavePassedElsewhere + r.s.useTheBall;
      return { ...r, good, total, score: total ? good / total : 0 };
    })
    .filter((r) => r.total >= 6)
    .sort((a, b) => b.score - a.score || b.good - a.good);
  if (decided[0] && decided[0].score >= 0.6) {
    out.push({ kind: "decisions", name: decided[0].name, text: `${decided[0].name} made the best calls: ${decided[0].good} of ${decided[0].total} rated a good option` });
  }
  const loose = [...rows].sort((a, b) => b.s.outOfPosition - a.s.outOfPosition)[0];
  if (loose && loose.s.outOfPosition >= 5) {
    out.push({ kind: "positioning", name: loose.name, text: `${loose.name} was caught out of position ${loose.s.outOfPosition} times` });
  }
  const presser = [...rows].sort((a, b) => b.s.wonAttackingThird - a.s.wonAttackingThird)[0];
  if (presser && presser.s.wonAttackingThird >= 2) {
    out.push({ kind: "pressing", name: presser.name, text: `${presser.name} won the ball back ${presser.s.wonAttackingThird} times in the attacking third` });
  }
  const passer = rows
    .filter((r) => r.s.throughBalls + r.s.secondAssists >= 2)
    .sort((a, b) => b.s.throughBalls + b.s.secondAssists - (a.s.throughBalls + a.s.secondAssists))[0];
  if (passer) {
    out.push({ kind: "passing", name: passer.name, text: `${passer.name} unlocked them with ${passer.s.throughBalls} through balls and ${passer.s.secondAssists} second assists` });
  }
  return out;
}

// ---------- Opponent scouting ----------

export interface OpponentProfile {
  opponent: string;
  games: number;
  record: { wins: number; draws: number; losses: number };
  perGame: {
    pressing: number; // their ball wins in our half's end of the pitch (their attacking third)
    lostOwnThird: number;
    aerialsWon: number;
    shots: number;
  };
  passCompletion: number | null;
  forwardShare: number | null;
  passStyle: PassStyle | null;
  insideBoxShotShare: number | null;
  decisionScore: number | null;
  threats: { name: string; games: number; goals: number; shots: number; avgRating: number | null }[];
  tips: string[];
}

export function teamPercentile(metric: string, value: number | null): number | null {
  const q = FC27_BENCHMARKS.team?.[metric];
  if (!q || value === null) return null;
  let i = 0;
  while (i < q.length - 1 && q[i + 1] <= value) i++;
  return (i * 100) / (q.length - 1);
}

// What each club we've played looks like from EA's event data on their side, most-played first
export function computeOpponentProfiles(matches: InsightMatch[]): OpponentProfile[] {
  const acc = new Map<string, { name: string; games: number; w: number; d: number; l: number; totals: EaEventStats; withEvents: number; players: Map<string, { name: string; games: number; goals: number; shots: number; rating: number; rated: number }> }>();
  for (const m of matches) {
    const opp = m.opponentPlayers || [];
    if (!opp.length) continue;
    const key = m.opponent.trim().toLowerCase();
    let a = acc.get(key);
    if (!a) acc.set(key, (a = { name: m.opponent, games: 0, w: 0, d: 0, l: 0, totals: emptyTotals(), withEvents: 0, players: new Map() }));
    a.games++;
    if (m.result === "win") a.w++;
    else if (m.result === "draw") a.d++;
    else a.l++;
    let any = false;
    for (const p of opp) {
      if (p.events) {
        addInto(a.totals, statsFromCounts(p.events));
        any = true;
      }
      const pk = keyOf(p);
      if (!pk) continue;
      let pl = a.players.get(pk);
      if (!pl) a.players.set(pk, (pl = { name: (p.ea_username || "").trim(), games: 0, goals: 0, shots: 0, rating: 0, rated: 0 }));
      pl.games++;
      pl.goals += num(p.goals) ?? 0;
      pl.shots += num(p.shots) ?? 0;
      const r = num(p.rating);
      if (r !== null && r > 0) {
        pl.rating += r;
        pl.rated++;
      }
    }
    if (any) a.withEvents++;
  }

  const out: OpponentProfile[] = [];
  for (const a of acc.values()) {
    const g = a.withEvents;
    const d = deriveStats(a.totals, Math.max(g, 1));
    const t = a.totals;
    const perGame = {
      pressing: g ? t.wonAttackingThird / g : 0,
      lostOwnThird: g ? t.lostDefensiveThird / g : 0,
      aerialsWon: g ? t.aerialsWon / g : 0,
      shots: g ? (t.shotsOnTarget + t.shotsOffTarget) / g : 0,
    };
    const tips: string[] = [];
    if (g) {
      const press = teamPercentile("pressingPerGame", perGame.pressing);
      const lost = teamPercentile("lostOwnThirdPerGame", perGame.lostOwnThird);
      const air = teamPercentile("aerialsPerGame", perGame.aerialsWon);
      const box = teamPercentile("insideBoxShotShare", d.insideBoxShotShare);
      const comp = teamPercentile("passCompletion", d.passCompletion);
      if (press !== null && press >= 75) tips.push("They press high: move the ball quickly and avoid risky passes at the back.");
      if (lost !== null && lost >= 75) tips.push("They give the ball away in their own third: press them high.");
      if (air !== null && air <= 25) tips.push("They win few headers: crosses and long balls are worth trying.");
      if (air !== null && air >= 75) tips.push("They're strong in the air: keep crosses low and defend the back post.");
      if (box !== null && box >= 75) tips.push("Almost all their shots come from inside the box: protect the middle and block lanes.");
      if (box !== null && box <= 25) tips.push("They shoot from distance a lot: close down outside the box.");
      if (comp !== null && comp <= 25) tips.push("Their passing is loose: sit compact and pounce on mistakes.");
      if (d.passStyle === "Progressive") tips.push("They play forward fast: keep a deep line and track runners.");
      if (d.passStyle === "Recycler") tips.push("They keep the ball and recycle it: stay patient and don't get dragged out.");
    }
    const threats = [...a.players.values()]
      .filter((p) => p.games >= 1)
      .sort((x, y) => y.goals - x.goals || y.shots - x.shots)
      .slice(0, 3)
      .map((p) => ({ name: p.name, games: p.games, goals: p.goals, shots: p.shots, avgRating: p.rated ? p.rating / p.rated : null }));
    out.push({
      opponent: a.name,
      games: a.games,
      record: { wins: a.w, draws: a.d, losses: a.l },
      perGame,
      passCompletion: g ? d.passCompletion : null,
      forwardShare: g ? d.forwardShare : null,
      passStyle: g ? d.passStyle : null,
      insideBoxShotShare: g ? d.insideBoxShotShare : null,
      decisionScore: g ? d.decisionScore : null,
      threats,
      tips: tips.slice(0, 4),
    });
  }
  return out.sort((x, y) => y.games - x.games || x.opponent.localeCompare(y.opponent));
}

// ---------- Lineup hints ----------

export interface LineupHints {
  // lower-case EA name -> best role (only players who have one)
  bestRole: Record<string, Role>;
  // Pairs (lower-case EA names) who are clearly tighter together
  partners: [string, string][];
}

export function lineupHints(matches: InsightMatch[]): LineupHints {
  const bestRole: Record<string, Role> = {};
  for (const p of computeAdvancedPlayers(matches, MIN_ROLE_GAMES)) if (p.bestRole) bestRole[p.key] = p.bestRole;
  const partners = computePartnerships(matches)
    .filter((p) => p.outOfPositionApart !== null && p.outOfPositionApart - p.outOfPositionTogether >= 1.5)
    .slice(0, 5)
    .map((p) => [p.names[0].toLowerCase(), p.names[1].toLowerCase()] as [string, string]);
  return { bestRole, partners };
}
