// Dressing-room banter built only from real match numbers: rankings (paper tiger, main character,
// invisible man, loss magnet, stat padder, ball hog), squad superlatives, and "receipts" that settle
// arguments (better without you, better together, who gets the shirt, head to head).
// Pure functions over InsightMatch[], shared by the bot (club-insights.cjs), the web and MCP. Nothing
// here is invented: every line quotes the numbers behind it, and anything comparing different sets of
// games says so.
import { statsFromCounts } from "./eaEvents.ts";
import { roleOf, type Role } from "./advancedStats.ts";
import { playerLines, type PlayerLine } from "./playerScores.ts";
import type { InsightMatch, PlayerMatchStats } from "./clubInsights.ts";

const keyOf = (p: PlayerMatchStats) => (p.ea_username || "").trim().toLowerCase();
const played = (m: InsightMatch, key: string) => m.players.some((p) => keyOf(p) === key);
const pts = (m: InsightMatch) => (m.result === "win" ? 3 : m.result === "draw" ? 1 : 0);
const f1 = (n: number) => n.toFixed(1);
const pctS = (n: number) => `${Math.round(n)}%`;

export type BanterWindow = "session" | "week" | "all";

// The matches a window covers: the latest night (90-minute gap), the last 7 days, or everything
export function banterWindow(matches: InsightMatch[], window: BanterWindow): InsightMatch[] {
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  if (!sorted.length || window === "all") return sorted;
  if (window === "week") {
    const from = sorted[0].playedAt.getTime() - 7 * 86400000;
    return sorted.filter((m) => m.playedAt.getTime() >= from);
  }
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (out[out.length - 1].playedAt.getTime() - sorted[i].playedAt.getTime() > 90 * 60000) break;
    out.push(sorted[i]);
  }
  return out;
}

// ---------- Rankings ----------

export type RankingKey = "paperTiger" | "mainCharacter" | "invisible" | "lossMagnet" | "statPadder" | "ballHog";

export interface RankingEntry {
  name: string;
  value: number; // the number the ranking sorts on (higher = more guilty)
  line: string; // the receipt, with numbers
  verdict: string; // one-word or short tag
}

export interface Ranking {
  key: RankingKey;
  title: string;
  emoji: string;
  question: string;
  entries: RankingEntry[]; // most guilty first
}

// Per-role averages in the same matches (our side only), so "for a forward" means forwards in this squad's games
function roleAverages(lines: PlayerLine[]): Partial<Record<Role, { rating: number; gaPerGame: number }>> {
  const out: Partial<Record<Role, { rating: number; gaPerGame: number }>> = {};
  for (const role of ["GK", "DEF", "MID", "FWD"] as Role[]) {
    const ls = lines.filter((l) => l.role === role && l.avgRating !== null);
    if (!ls.length) continue;
    const games = ls.reduce((t, l) => t + l.games, 0);
    out[role] = {
      rating: ls.reduce((t, l) => t + (l.avgRating || 0) * l.games, 0) / games,
      gaPerGame: ls.reduce((t, l) => t + l.goals + l.assists, 0) / games,
    };
  }
  return out;
}

interface Involvement {
  shots: number;
  touches: number; // passes attempted + tackles + dribbles + shots, from events
  eventGames: number;
}

function involvement(matches: InsightMatch[]): Map<string, Involvement> {
  const out = new Map<string, Involvement>();
  for (const m of matches) {
    for (const p of m.players) {
      const k = keyOf(p);
      if (!k) continue;
      const a = out.get(k) || { shots: 0, touches: 0, eventGames: 0 };
      if (p.events) {
        const s = statsFromCounts(p.events);
        const shots = (s.shotsOnTarget || 0) + (s.shotsOffTarget || 0);
        a.shots += shots;
        a.touches += (s.passesCompleted || 0) + (s.passesFailed || 0) + (s.tacklesWon || 0) + (s.tacklesLost || 0) + (s.dribbles || 0) + shots;
        a.eventGames++;
      } else {
        a.shots += Number(p.shots) || 0;
      }
      out.set(k, a);
    }
  }
  return out;
}

export function banterRankings(matches: InsightMatch[], minGames = 3): Ranking[] {
  const lines = playerLines(matches, minGames).filter((l) => l.role);
  if (!lines.length) return [];
  const roleAvg = roleAverages(playerLines(matches, 1));
  const inv = involvement(matches);
  const teamWin = matches.length ? (matches.filter((m) => m.result === "win").length / matches.length) * 100 : 0;
  const teamShots = [...inv.values()].reduce((t, a) => t + a.shots, 0);
  const teamGoals = lines.reduce((t, l) => t + l.goals, 0);
  const roleWord = (r: Role | null) => (r === "GK" ? "keepers" : r === "DEF" ? "defenders" : r === "MID" ? "midfielders" : "forwards");
  const rankings: Ranking[] = [];

  // Paper tiger: rated above their role, but the team wins less with them than without
  const tigers = lines
    .filter((l) => l.avgRating !== null && roleAvg[l.role!])
    .map((l) => {
      const winPct = (l.wins / l.games) * 100;
      const ratingGap = l.avgRating! - roleAvg[l.role!]!.rating;
      return { l, winPct, ratingGap, value: ratingGap * 10 + (teamWin - winPct) / 5 };
    })
    .filter((x) => x.ratingGap > 0 && x.winPct < teamWin)
    .sort((a, b) => b.value - a.value);
  rankings.push({
    key: "paperTiger",
    title: "Paper Tiger",
    emoji: "🐯",
    question: "Looks great on the ratings, but do the results follow?",
    entries: tigers.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${f1(x.l.avgRating!)} average (squad ${roleWord(x.l.role)} ${f1(roleAvg[x.l.role!]!.rating)}), yet wins ${pctS(x.winPct)} of games to the squad's ${pctS(teamWin)}.`,
      verdict: x.value >= 6 ? "All bark" : "Suspicious",
    })),
  });

  // Main character: share of the team's shots and goals, plus man of the match awards
  const mains = lines
    .filter((l) => l.role !== "GK")
    .map((l) => {
      const shotShare = teamShots ? ((inv.get(l.key)?.shots || 0) / teamShots) * 100 : 0;
      const goalShare = teamGoals ? (l.goals / teamGoals) * 100 : 0;
      return { l, shotShare, goalShare, value: shotShare + goalShare + l.motm * 2 };
    })
    .filter((x) => x.shotShare + x.goalShare > 0)
    .sort((a, b) => b.value - a.value);
  rankings.push({
    key: "mainCharacter",
    title: "Main Character",
    emoji: "👑",
    question: "Who thinks this is their story and everyone else is an extra?",
    entries: mains.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${pctS(x.shotShare)} of the shots, ${pctS(x.goalShare)} of the goals and ${x.l.motm} man of the match award${x.l.motm === 1 ? "" : "s"} in ${x.l.games} games.`,
      verdict: x.goalShare >= 35 ? "Lead role" : x.shotShare >= 25 ? "Wants the lead role" : "Ensemble cast",
    })),
  });

  // Invisible man: fewest on-ball actions per game against their role in this squad
  const withTouches = lines.filter((l) => l.role !== "GK" && (inv.get(l.key)?.eventGames || 0) >= minGames);
  const touchAvg: Partial<Record<Role, number>> = {};
  for (const role of ["DEF", "MID", "FWD"] as Role[]) {
    const ls = withTouches.filter((l) => l.role === role);
    const g = ls.reduce((t, l) => t + inv.get(l.key)!.eventGames, 0);
    if (g) touchAvg[role] = ls.reduce((t, l) => t + inv.get(l.key)!.touches, 0) / g;
  }
  const ghosts = withTouches
    .map((l) => {
      const a = inv.get(l.key)!;
      const perGame = a.touches / a.eventGames;
      const avg = touchAvg[l.role!] || perGame;
      return { l, perGame, avg, value: avg ? ((avg - perGame) / avg) * 100 : 0 };
    })
    .filter((x) => x.value > 10)
    .sort((a, b) => b.value - a.value);
  rankings.push({
    key: "invisible",
    title: "Invisible Man",
    emoji: "👻",
    question: "Was anyone actually on the pitch?",
    entries: ghosts.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${f1(x.perGame)} on-ball actions a game, where the squad's ${roleWord(x.l.role)} average ${f1(x.avg)}.`,
      verdict: x.value >= 35 ? "Missing person" : "Quiet",
    })),
  });

  // Loss magnet: the squad's win rate with them vs without (needs games both ways)
  const magnets = lines
    .map((l) => {
      const without = matches.filter((m) => !played(m, l.key));
      if (without.length < 3) return null;
      const withWin = (l.wins / l.games) * 100;
      const woWin = (without.filter((m) => m.result === "win").length / without.length) * 100;
      return { l, withWin, woWin, woGames: without.length, value: woWin - withWin };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.value > 0)
    .sort((a, b) => b.value - a.value);
  rankings.push({
    key: "lossMagnet",
    title: "Loss Magnet",
    emoji: "🧲",
    question: "Do the defeats follow someone around?",
    entries: magnets.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `The squad wins ${pctS(x.withWin)} with them (${x.l.games} games) and ${pctS(x.woWin)} without (${x.woGames}). Different games, so not proof.`,
      verdict: x.value >= 25 ? "Black cat" : "Unlucky charm",
    })),
  });

  // Stat padder: share of their goals that came when the game was already won by 3+
  const padders = lines
    .map((l) => {
      let goals = 0, padded = 0, tight = 0;
      for (const m of matches) {
        const me = m.players.find((p) => keyOf(p) === l.key);
        const g = Number(me?.goals) || 0;
        if (!g) continue;
        goals += g;
        if (m.scoreFor - m.scoreAgainst >= 3) padded += g;
        if (Math.abs(m.scoreFor - m.scoreAgainst) <= 1) tight += g;
      }
      return { l, goals, padded, tight, value: goals ? (padded / goals) * 100 : 0 };
    })
    .filter((x) => x.goals >= 3 && x.value >= 40)
    .sort((a, b) => b.value - a.value);
  rankings.push({
    key: "statPadder",
    title: "Stat Padder",
    emoji: "📊",
    question: "Whose goals come when the game is already over?",
    entries: padders.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${x.padded} of ${x.goals} goals came in wins by three or more; ${x.tight} in one-goal games or draws.`,
      verdict: x.value >= 60 ? "Padding merchant" : "Garbage-time specialist",
    })),
  });

  // Ball hog: scores plenty but sets up far less than the squad does per goal (assists per goal across the squad)
  const squadGoals = lines.reduce((t, l) => t + l.goals, 0);
  const squadRatio = squadGoals ? lines.reduce((t, l) => t + l.assists, 0) / squadGoals : 0;
  const hogs = lines
    .filter((l) => l.role !== "GK" && l.goals >= 3)
    .map((l) => {
      const ratio = l.assists / l.goals;
      return { l, ratio, value: squadRatio - ratio };
    })
    .filter((x) => x.value > 0.15)
    .sort((a, b) => b.value - a.value || b.l.goals - a.l.goals);
  rankings.push({
    key: "ballHog",
    title: "Ball Hog",
    emoji: "🐷",
    question: "Who never looks up?",
    entries: hogs.map((x) => ({
      name: x.l.name,
      value: x.value,
      line: `${x.l.goals} goals, ${x.l.assists} assist${x.l.assists === 1 ? "" : "s"}: ${x.ratio.toFixed(2)} assists per goal, where the squad manages ${squadRatio.toFixed(2)}.`,
      verdict: x.ratio < 0.2 ? "Pass it, mate" : "Selective vision",
    })),
  });

  return rankings.filter((r) => r.entries.length);
}

// ---------- Superlatives ----------

export interface Superlative {
  key: string;
  title: string;
  emoji: string;
  name: string;
  line: string;
}

export function superlatives(matches: InsightMatch[], minGames = 3): Superlative[] {
  const lines = playerLines(matches, minGames);
  const inv = involvement(matches);
  const out: Superlative[] = [];
  const top = <T,>(list: T[], f: (x: T) => number) => [...list].sort((a, b) => f(b) - f(a))[0];
  const outfield = lines.filter((l) => l.role && l.role !== "GK");
  const scorer = top(outfield, (l) => l.goals / l.games);
  if (scorer?.goals) out.push({ key: "score", title: "Most likely to score", emoji: "⚽", name: scorer.name, line: `${f1(scorer.goals / scorer.games)} goals a game` });
  const misser = top(
    outfield.filter((l) => (inv.get(l.key)?.shots || 0) >= 5),
    (l) => (inv.get(l.key)!.shots - l.goals) / l.games
  );
  if (misser) out.push({ key: "miss", title: "Most likely to miss", emoji: "🎯", name: misser.name, line: `${inv.get(misser.key)!.shots - misser.goals} shots without a goal` });
  const architect = top(outfield, (l) => (l.assists + l.secondAssists) / l.games);
  if (architect && architect.assists + architect.secondAssists) out.push({ key: "architect", title: "The Architect", emoji: "🎨", name: architect.name, line: `${architect.assists} assists, ${architect.secondAssists} second assists` });
  const og = top(lines, (l) => l.games);
  if (og) out.push({ key: "og", title: "The OG", emoji: "👴", name: og.name, line: `${og.games} games, never misses a session` });
  const wall = top(
    lines.filter((l) => l.role === "DEF" || l.role === "GK"),
    (l) => -matches.filter((m) => played(m, l.key)).reduce((t, m) => t + m.scoreAgainst, 0) / l.games
  );
  if (wall) {
    const ga = matches.filter((m) => played(m, wall.key)).reduce((t, m) => t + m.scoreAgainst, 0) / wall.games;
    out.push({ key: "wall", title: "The Wall", emoji: "🧱", name: wall.name, line: `${f1(ga)} conceded a game with them at the back` });
  }
  const star = top(lines, (l) => l.motm / l.games);
  if (star?.motm) out.push({ key: "star", title: "Man of the Match machine", emoji: "🌟", name: star.name, line: `${star.motm} MOTM in ${star.games}` });
  const rated = lines.filter((l) => l.avgRating !== null);
  const steady = top(rated, (l) => l.avgRating!);
  if (steady) out.push({ key: "rated", title: "Highest rated", emoji: "⭐", name: steady.name, line: `${f1(steady.avgRating!)} average` });
  // Cards: yellow cards from events
  const cards = new Map<string, number>();
  for (const m of matches) for (const p of m.players) if (p.events) cards.set(keyOf(p), (cards.get(keyOf(p)) || 0) + (statsFromCounts(p.events).yellowCards || 0) + (p.red_cards ? 1 : 0));
  const hot = top(lines.filter((l) => (cards.get(l.key) || 0) > 0), (l) => (cards.get(l.key) || 0) / l.games);
  if (hot) out.push({ key: "cards", title: "Most likely to see red", emoji: "🟥", name: hot.name, line: `${cards.get(hot.key)} cards in ${hot.games} games` });
  return out;
}

// ---------- Receipts ----------

export interface Split {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  pointsPerGame: number;
  goalsFor: number;
  goalsAgainst: number;
}

function split(ms: InsightMatch[]): Split {
  const w = ms.filter((m) => m.result === "win").length;
  const d = ms.filter((m) => m.result === "draw").length;
  return {
    games: ms.length,
    wins: w,
    draws: d,
    losses: ms.length - w - d,
    pointsPerGame: ms.length ? ms.reduce((t, m) => t + pts(m), 0) / ms.length : 0,
    goalsFor: ms.length ? ms.reduce((t, m) => t + m.scoreFor, 0) / ms.length : 0,
    goalsAgainst: ms.length ? ms.reduce((t, m) => t + m.scoreAgainst, 0) / ms.length : 0,
  };
}

function nameOf(matches: InsightMatch[], key: string): string {
  for (const m of matches) for (const p of m.players) if (keyOf(p) === key) return (p.ea_username || "").trim();
  return key;
}

export interface WithoutReceipt {
  kind: "without";
  name: string;
  with: Split;
  without: Split;
  headline: string;
}

// One player: how the squad does with them and without them
export function betterWithout(matches: InsightMatch[], player: string): WithoutReceipt | null {
  const key = player.trim().toLowerCase();
  const withMs = matches.filter((m) => played(m, key));
  const without = matches.filter((m) => !played(m, key));
  if (!withMs.length) return null;
  const a = split(withMs), b = split(without);
  const name = nameOf(matches, key);
  const headline = !without.length
    ? `${name} has played every game. No receipts without them.`
    : b.pointsPerGame > a.pointsPerGame + 0.3
      ? `The squad is better off when ${name} is offline.`
      : a.pointsPerGame > b.pointsPerGame + 0.3
        ? `Without ${name}, it falls apart.`
        : `${name} makes no difference either way.`;
  return { kind: "without", name, with: a, without: b, headline };
}

export interface TogetherReceipt {
  kind: "together";
  names: [string, string];
  together: Split;
  onlyA: Split;
  onlyB: Split;
  headline: string;
}

// Two players: together, and each without the other
export function betterTogether(matches: InsightMatch[], a: string, b: string): TogetherReceipt | null {
  const ka = a.trim().toLowerCase(), kb = b.trim().toLowerCase();
  if (ka === kb) return null;
  const both = matches.filter((m) => played(m, ka) && played(m, kb));
  const onlyA = matches.filter((m) => played(m, ka) && !played(m, kb));
  const onlyB = matches.filter((m) => !played(m, ka) && played(m, kb));
  if (!both.length && !onlyA.length && !onlyB.length) return null;
  const t = split(both), sa = split(onlyA), sb = split(onlyB);
  const na = nameOf(matches, ka), nb = nameOf(matches, kb);
  const apart = [sa, sb].filter((s) => s.games);
  const apartPpg = apart.length ? apart.reduce((x, s) => x + s.pointsPerGame * s.games, 0) / apart.reduce((x, s) => x + s.games, 0) : null;
  const headline = !both.length
    ? `${na} and ${nb} have never played together.`
    : apartPpg === null
      ? `${na} and ${nb} have only ever played together.`
      : t.pointsPerGame > apartPpg + 0.3
        ? `${na} and ${nb}: a proper partnership.`
        : apartPpg > t.pointsPerGame + 0.3
          ? `${na} and ${nb} should be kept apart.`
          : `${na} and ${nb}: no chemistry, no problem.`;
  return { kind: "together", names: [na, nb], together: t, onlyA: sa, onlyB: sb, headline };
}

export interface ShirtReceipt {
  kind: "shirt";
  role: Role | null;
  players: { name: string; games: number; avgRating: number | null; pointsPerGame: number; goalInvolvementsPerGame: number; tackleWinsPerGame: number | null }[];
  winner: string | null;
  headline: string;
}

// Two players for one spot: each one's games in the role when the other wasn't in it
export function whoGetsTheShirt(matches: InsightMatch[], a: string, b: string): ShirtReceipt | null {
  const ka = a.trim().toLowerCase(), kb = b.trim().toLowerCase();
  if (ka === kb) return null;
  const roleIn = (m: InsightMatch, k: string) => roleOf(m.players.find((p) => keyOf(p) === k)?.position);
  // The role they share most
  const counts = new Map<Role, number>();
  for (const m of matches) for (const k of [ka, kb]) {
    const r = roleIn(m, k);
    if (r) counts.set(r, (counts.get(r) || 0) + 1);
  }
  const role = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || null;
  const side = (k: string, other: string) => {
    const ms = matches.filter((m) => roleIn(m, k) === role && roleIn(m, other) !== role);
    const rows = ms.map((m) => m.players.find((p) => keyOf(p) === k)!);
    const ratings = rows.map((p) => Number(p.rating) || 0).filter((r) => r > 0);
    const ev = rows.filter((p) => p.events);
    return {
      name: nameOf(matches, k),
      games: ms.length,
      avgRating: ratings.length ? ratings.reduce((x, y) => x + y, 0) / ratings.length : null,
      pointsPerGame: ms.length ? ms.reduce((t, m) => t + pts(m), 0) / ms.length : 0,
      goalInvolvementsPerGame: ms.length ? rows.reduce((t, p) => t + (Number(p.goals) || 0) + (Number(p.assists) || 0), 0) / ms.length : 0,
      tackleWinsPerGame: ev.length ? ev.reduce((t, p) => t + (statsFromCounts(p.events!).tacklesWon || 0), 0) / ev.length : null,
    };
  };
  const pa = side(ka, kb), pb = side(kb, ka);
  if (!pa.games && !pb.games) return null;
  // Points per game decides; rating breaks a near tie; needs 3+ games each to call it
  let winner: string | null = null;
  if (pa.games >= 3 && pb.games >= 3) {
    const diff = pa.pointsPerGame - pb.pointsPerGame;
    if (Math.abs(diff) >= 0.2) winner = diff > 0 ? pa.name : pb.name;
    else if (pa.avgRating !== null && pb.avgRating !== null && Math.abs(pa.avgRating - pb.avgRating) >= 0.2) winner = pa.avgRating > pb.avgRating ? pa.name : pb.name;
  }
  const roleName = role === "GK" ? "in goal" : role === "DEF" ? "in defence" : role === "MID" ? "in midfield" : role === "FWD" ? "up front" : "";
  const headline = winner
    ? `${winner} gets the shirt ${roleName}.`.replace(" .", ".")
    : pa.games < 3 || pb.games < 3
      ? `Not enough games apart ${roleName} to call it yet.`.replace("  ", " ")
      : `Too close to call ${roleName}. Share the shirt.`.replace("  ", " ");
  return { kind: "shirt", role, players: [pa, pb], winner, headline };
}

export interface HeadToHead {
  players: PlayerLine[];
  // For each stat: [a, b] and which side is better (0, 1 or null for a tie)
  rows: { label: string; values: [string, string]; better: 0 | 1 | null }[];
}

export function headToHead(matches: InsightMatch[], a: string, b: string): HeadToHead | null {
  const lines = playerLines(matches, 1);
  const la = lines.find((l) => l.key === a.trim().toLowerCase());
  const lb = lines.find((l) => l.key === b.trim().toLowerCase());
  if (!la || !lb || la === lb) return null;
  const rows: HeadToHead["rows"] = [];
  const add = (label: string, va: number | null, vb: number | null, fmt: (n: number) => string, lowerBetter = false) => {
    if (va === null && vb === null) return;
    const better = va === null || vb === null || Math.abs(va - vb) < 1e-9 ? null : (va > vb) !== lowerBetter ? 0 : 1;
    rows.push({ label, values: [va === null ? "–" : fmt(va), vb === null ? "–" : fmt(vb)], better });
  };
  add("Games", la.games, lb.games, (n) => String(n));
  add("Average rating", la.avgRating, lb.avgRating, f1);
  add("Win rate", (la.wins / la.games) * 100, (lb.wins / lb.games) * 100, pctS);
  add("Goals a game", la.perGame.goalsPerGame, lb.perGame.goalsPerGame, (n) => n.toFixed(2));
  add("Chances created a game", la.perGame.chancesCreatedPerGame, lb.perGame.chancesCreatedPerGame, (n) => n.toFixed(2));
  add("Pass completion", la.perGame.passCompletion, lb.perGame.passCompletion, pctS);
  add("Tackles won a game", la.perGame.tacklesWonPerGame, lb.perGame.tacklesWonPerGame, f1);
  add("Interceptions a game", la.perGame.interceptionsPerGame, lb.perGame.interceptionsPerGame, f1);
  add("Dribbles a game", la.perGame.dribblesPerGame, lb.perGame.dribblesPerGame, f1);
  add("Ball lost a game", la.perGame.lostPerGame, lb.perGame.lostPerGame, f1, true);
  add("Man of the match", la.motm, lb.motm, (n) => String(n));
  return { players: [la, lb], rows };
}
