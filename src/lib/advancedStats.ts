// Advanced player and club stats from EA's per-player event counts (decoded by eaEvents.ts).
// Pure functions over InsightMatch[] (clubInsights.ts attaches each player's `events`), shared by the
// web Insights page and the bot (bundled into public/spotbot/club-insights.cjs).
//
// What the event data can and can't say (checked by scripts/ea-research-check.mjs on 51k FC27 rows):
// - EA reports a player's role only as goalkeeper / defender / midfielder / forward, so "best
//   position" is a best role.
// - Positional discipline and decision quality come from EA's own in-game feedback popups. Their
//   share (not raw counts, which mostly measure involvement) lines up with match rating.
import { statsFromCounts, type EaEventStats } from "./eaEvents";
import type { InsightMatch, PlayerMatchStats } from "./clubInsights";

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
