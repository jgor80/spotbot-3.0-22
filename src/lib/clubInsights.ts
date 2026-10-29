// Club insights computed from synced EA matches (club_matches rows).
// Pure functions so the page stays thin and the math is easy to check.

export type MatchResult = "win" | "draw" | "loss";

export interface PlayerMatchStats {
  ea_username?: string | null;
  goals?: number;
  assists?: number;
  rating?: number;
  position?: string | null;
  shots?: number;
  shots_on_target?: number;
  tackles?: number;
  tackle_attempts?: number;
  passes_made?: number;
  pass_attempts?: number;
  interceptions?: number;
  ball_recoveries?: number;
  possession?: number;
  dribbles?: number;
  dribble_attempts?: number;
  fouls?: number;
  red_cards?: boolean;
}

export interface InsightMatch {
  id: string;
  result: MatchResult;
  scoreFor: number;
  scoreAgainst: number;
  matchType: string;
  // Manager's tag (league / tournament / byot / smalls), or null when the game keeps EA's own type
  tag: MatchTag | null;
  // What the game counts as: the tag when set, otherwise EA's match type
  competition: Competition;
  playedAt: Date;
  opponent: string;
  players: PlayerMatchStats[];
  formation: string | null;
}

export interface ClubMatchRow {
  id: string;
  result: string | null;
  score_for: number | null;
  score_against: number | null;
  match_type: string;
  created_at: string | null;
  opponent_club_name: string | null;
  player_stats: unknown;
  match_data: unknown;
}

export interface LineupRow {
  formation: string;
  created_at: string;
}

// What kind of game a match was. EA only knows league (division), cup/playoff and friendly; BYOT and
// community tournaments are played as friendlies, so managers tag them. The tag lives in
// match_data._tag so EA re-syncs never touch it and every existing club_matches query carries it.
export type MatchTag = "league" | "tournament" | "byot" | "smalls";
export type Competition = MatchTag | "cup" | "friendly";

export const MATCH_TAGS: { value: MatchTag; label: string; emoji: string }[] = [
  { value: "league", label: "League", emoji: "🏆" },
  { value: "tournament", label: "Tournament", emoji: "🏟️" },
  { value: "byot", label: "BYOT", emoji: "🎟️" },
  // A friendly played short-handed (AI filling the rest). Counts in the regular record and stats like
  // any friendly, and has its own filter. Casual clubs get it automatically (casual.cjs).
  { value: "smalls", label: "Smalls", emoji: "👥" },
];

export const COMPETITIONS: { value: Competition; label: string; emoji: string }[] = [
  ...MATCH_TAGS,
  { value: "cup", label: "Cup/Playoff", emoji: "🥇" },
  { value: "friendly", label: "Friendly", emoji: "🤝" },
];

// Tournament and BYOT games are kept apart: regular records, player stats and leaderboards leave them
// out, and they have their own views. Tagged games' player_stats rows carry match_type 'tournament' / 'byot'.
export const SEPARATE_COMPETITIONS: Competition[] = ["tournament", "byot"];

export function isSeparateCompetition(c: Competition | null | undefined): boolean {
  return !!c && SEPARATE_COMPETITIONS.includes(c);
}

// The player_stats.match_type a game's rows should carry for a tag (null: back to what EA sync wrote).
// Smalls keep EA's own type, so they stay on the regular boards.
export function playerStatsTypeForTag(tag: MatchTag | null): string | null {
  if (tag === "tournament" || tag === "byot") return tag;
  if (tag === "league") return "club";
  return null;
}

export function matchTag(row: { match_data?: unknown }): MatchTag | null {
  const t = (row.match_data as { _tag?: unknown } | null)?._tag;
  return MATCH_TAGS.some((m) => m.value === t) ? (t as MatchTag) : null;
}

// EA's own type for a match row (club_matches.match_type, or the category saved in match_data)
function eaCompetition(row: { match_type?: string | null; match_data?: unknown }): Competition {
  const raw = String((row.match_data as { _matchCategory?: unknown } | null)?._matchCategory || row.match_type || "").toLowerCase();
  if (/friendly/.test(raw)) return "friendly";
  if (/competition|cup|playoff/.test(raw)) return "cup";
  return "league";
}

export function matchCompetition(row: { match_type?: string | null; match_data?: unknown }): Competition {
  return matchTag(row) || eaCompetition(row);
}

export function competitionLabel(c: Competition | null | undefined): string {
  return COMPETITIONS.find((x) => x.value === c)?.label || "Match";
}

export function competitionEmoji(c: Competition | null | undefined): string {
  return COMPETITIONS.find((x) => x.value === c)?.emoji || "⚽";
}

// A lineup counts for matches played up to this long after it was saved
const LINEUP_WINDOW_MS = 6 * 60 * 60 * 1000;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function playerKey(p: PlayerMatchStats): string | null {
  const name = (p.ea_username || "").trim();
  return name ? name.toLowerCase() : null;
}

function normalizeResult(row: ClubMatchRow): MatchResult | null {
  const r = (row.result || "").toLowerCase();
  if (r === "win" || r === "w") return "win";
  if (r === "loss" || r === "l") return "loss";
  if (r === "draw" || r === "d") return "draw";
  const f = num(row.score_for);
  const a = num(row.score_against);
  if (f === null || a === null) return null;
  return f > a ? "win" : f < a ? "loss" : "draw";
}

function matchTime(row: ClubMatchRow): Date {
  // EA's match timestamp (epoch seconds) is when it was played; created_at is when we synced it
  const data = row.match_data as { timestamp?: unknown } | null;
  const ts = num(data?.timestamp);
  if (ts && ts > 1e9) return new Date(ts < 1e12 ? ts * 1000 : ts);
  return new Date(row.created_at || 0);
}

// Attach the formation of the most recent lineup saved before each match (within the window)
export function toInsightMatches(rows: ClubMatchRow[], lineups: LineupRow[] = []): InsightMatch[] {
  const sortedLineups = lineups
    .map((l) => ({ formation: l.formation, at: new Date(l.created_at).getTime() }))
    .sort((a, b) => a.at - b.at);

  const matches: InsightMatch[] = [];
  for (const row of rows) {
    const result = normalizeResult(row);
    if (!result) continue;
    const playedAt = matchTime(row);
    const t = playedAt.getTime();
    let formation: string | null = null;
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
      players: Array.isArray(row.player_stats) ? (row.player_stats as PlayerMatchStats[]) : [],
      formation,
    });
  }
  return matches.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}

export interface ClubOverview {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  avgPossession: number | null;
  passCompletion: number | null;
  shotsPerGame: number | null;
  form: MatchResult[];
}

interface TeamMetrics {
  possession: number | null;
  passCompletion: number | null;
  shots: number | null;
  shotAccuracy: number | null;
  tackleSuccess: number | null;
  interceptions: number | null;
  ballRecoveries: number | null;
  dribbleSuccess: number | null;
  fouls: number | null;
  avgRating: number | null;
}

function sum(players: PlayerMatchStats[], key: keyof PlayerMatchStats): number | null {
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

function ratio(made: number | null, attempts: number | null): number | null {
  if (made === null || attempts === null || attempts <= 0) return null;
  return (made / attempts) * 100;
}

export function teamMetrics(m: InsightMatch): TeamMetrics {
  const ps = m.players;
  const possessions = ps.map((p) => num(p.possession)).filter((v): v is number => v !== null && v > 0);
  const ratings = ps.map((p) => num(p.rating)).filter((v): v is number => v !== null && v > 0);
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
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
  };
}

function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function computeOverview(matches: InsightMatch[]): ClubOverview {
  const wins = matches.filter((m) => m.result === "win").length;
  const draws = matches.filter((m) => m.result === "draw").length;
  const losses = matches.filter((m) => m.result === "loss").length;
  const metrics = matches.map(teamMetrics);
  return {
    played: matches.length,
    wins,
    draws,
    losses,
    winPct: matches.length ? (wins / matches.length) * 100 : 0,
    goalsFor: matches.reduce((a, m) => a + m.scoreFor, 0),
    goalsAgainst: matches.reduce((a, m) => a + m.scoreAgainst, 0),
    cleanSheets: matches.filter((m) => m.scoreAgainst === 0).length,
    avgPossession: mean(metrics.map((x) => x.possession)),
    passCompletion: mean(metrics.map((x) => x.passCompletion)),
    shotsPerGame: mean(metrics.map((x) => x.shots)),
    form: matches.slice(0, 10).map((m) => m.result),
  };
}

export interface WinRecord {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalDiff: number;
}

function emptyRecord(): WinRecord {
  return { games: 0, wins: 0, draws: 0, losses: 0, goalDiff: 0 };
}

function addTo(r: WinRecord, m: InsightMatch) {
  r.games++;
  if (m.result === "win") r.wins++;
  else if (m.result === "draw") r.draws++;
  else r.losses++;
  r.goalDiff += m.scoreFor - m.scoreAgainst;
}

export function winPct(r: WinRecord): number {
  return r.games ? (r.wins / r.games) * 100 : 0;
}

export function gdPerGame(r: WinRecord): number {
  return r.games ? r.goalDiff / r.games : 0;
}

// Record per kind of game (League, Tournament, BYOT, ...), only the kinds that were played
export function computeCompetitionRecords(matches: InsightMatch[]): { competition: Competition; label: string; emoji: string; record: WinRecord }[] {
  return COMPETITIONS.map((c) => {
    const record = emptyRecord();
    for (const m of matches) if (m.competition === c.value) addTo(record, m);
    return { competition: c.value, label: c.label, emoji: c.emoji, record };
  }).filter((x) => x.record.games > 0);
}

function displayNames(matches: InsightMatch[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of matches) {
    for (const p of m.players) {
      const k = playerKey(p);
      if (k && !names.has(k)) names.set(k, (p.ea_username || "").trim());
    }
  }
  return names;
}

export interface PlayerImpact {
  key: string;
  name: string;
  with: WinRecord;
  without: WinRecord;
  // Win % with the player minus win % without them
  lift: number;
}

export function computePlayerImpact(matches: InsightMatch[], minGames = 5): PlayerImpact[] {
  const names = displayNames(matches);
  const out: PlayerImpact[] = [];
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
      lift: withoutR.games ? winPct(withR) - winPct(withoutR) : 0,
    });
  }
  return out.sort((a, b) => b.with.games - a.with.games);
}

export interface Combo {
  names: string[];
  together: WinRecord;
  // Win % of matches where some, but not all, of the combo played
  apart: WinRecord;
  lift: number;
}

function combinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
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

// Duos (size 2) or trios (size 3) that play together often, ranked by how much better they do together
export function computeCombos(matches: InsightMatch[], size: 2 | 3, minTogether = 5): Combo[] {
  const names = displayNames(matches);
  const together = new Map<string, WinRecord>();

  for (const m of matches) {
    const keys = Array.from(new Set(m.players.map(playerKey).filter((k): k is string => !!k))).sort();
    for (const combo of combinations(keys, size)) {
      const id = combo.join("|");
      if (!together.has(id)) together.set(id, emptyRecord());
      addTo(together.get(id)!, m);
    }
  }

  const combos: Combo[] = [];
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
      lift: apart.games ? winPct(rec) - winPct(apart) : 0,
    });
  }
  return combos.sort((a, b) => b.lift - a.lift || b.together.games - a.together.games);
}

export interface FormationStat {
  formation: string;
  record: WinRecord;
  avgRating: number | null;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
}

export function computeFormations(matches: InsightMatch[]): FormationStat[] {
  const groups = new Map<string, InsightMatch[]>();
  for (const m of matches) {
    if (!m.formation) continue;
    if (!groups.has(m.formation)) groups.set(m.formation, []);
    groups.get(m.formation)!.push(m);
  }
  return Array.from(groups.entries())
    .map(([formation, ms]) => {
      const record = emptyRecord();
      ms.forEach((m) => addTo(record, m));
      return {
        formation,
        record,
        avgRating: mean(ms.map((m) => teamMetrics(m).avgRating)),
        goalsForPerGame: ms.reduce((a, m) => a + m.scoreFor, 0) / ms.length,
        goalsAgainstPerGame: ms.reduce((a, m) => a + m.scoreAgainst, 0) / ms.length,
      };
    })
    .sort((a, b) => b.record.games - a.record.games);
}

export interface MetricGap {
  key: keyof TeamMetrics;
  label: string;
  unit: "%" | "";
  // true when a higher value is better (fouls is the exception)
  higherIsBetter: boolean;
  inWins: number;
  inLosses: number;
  // Relative difference, signed so positive means "worse in losses"
  severity: number;
}

const METRIC_LABELS: { key: keyof TeamMetrics; label: string; unit: "%" | ""; higherIsBetter: boolean }[] = [
  { key: "possession", label: "Possession", unit: "%", higherIsBetter: true },
  { key: "passCompletion", label: "Pass completion", unit: "%", higherIsBetter: true },
  { key: "shots", label: "Shots", unit: "", higherIsBetter: true },
  { key: "shotAccuracy", label: "Shots on target", unit: "%", higherIsBetter: true },
  { key: "tackleSuccess", label: "Tackle success", unit: "%", higherIsBetter: true },
  { key: "interceptions", label: "Interceptions", unit: "", higherIsBetter: true },
  { key: "ballRecoveries", label: "Ball recoveries", unit: "", higherIsBetter: true },
  { key: "dribbleSuccess", label: "Dribble success", unit: "%", higherIsBetter: true },
  { key: "fouls", label: "Fouls", unit: "", higherIsBetter: false },
  { key: "avgRating", label: "Avg match rating", unit: "", higherIsBetter: true },
];

export function computeWinLossGaps(matches: InsightMatch[], minEach = 3): MetricGap[] {
  const wins = matches.filter((m) => m.result === "win").map(teamMetrics);
  const losses = matches.filter((m) => m.result === "loss").map(teamMetrics);
  if (wins.length < minEach || losses.length < minEach) return [];

  const gaps: MetricGap[] = [];
  for (const meta of METRIC_LABELS) {
    const w = mean(wins.map((x) => x[meta.key]));
    const l = mean(losses.map((x) => x[meta.key]));
    if (w === null || l === null || w === 0) continue;
    const rel = (w - l) / Math.abs(w);
    gaps.push({ ...meta, inWins: w, inLosses: l, severity: meta.higherIsBetter ? rel : -rel });
  }
  return gaps.sort((a, b) => b.severity - a.severity);
}

export interface Insight {
  tone: "good" | "bad" | "neutral";
  text: string;
}

function fmt(n: number, unit: "%" | "" = ""): string {
  return unit === "%" ? `${Math.round(n)}%` : n.toFixed(1);
}

// Plain-language takeaways, strongest first
export function generateInsights(matches: InsightMatch[]): Insight[] {
  const insights: Insight[] = [];
  if (matches.length < 5) return insights;

  const duos = computeCombos(matches, 2);
  const bestDuo = duos.find((d) => d.lift >= 15 && d.apart.games >= 3);
  if (bestDuo) {
    insights.push({
      tone: "good",
      text: `${bestDuo.names.join(" + ")} win ${fmt(winPct(bestDuo.together), "%")} of ${bestDuo.together.games} games together, but ${fmt(winPct(bestDuo.apart), "%")} when only one of them plays.`,
    });
  }
  const worstDuo = [...duos].reverse().find((d) => d.lift <= -15 && d.apart.games >= 3);
  if (worstDuo) {
    insights.push({
      tone: "bad",
      text: `${worstDuo.names.join(" + ")} win only ${fmt(winPct(worstDuo.together), "%")} together (${worstDuo.together.games} games) versus ${fmt(winPct(worstDuo.apart), "%")} apart.`,
    });
  }

  const impact = computePlayerImpact(matches).filter((p) => p.without.games >= 3);
  const mvp = [...impact].sort((a, b) => b.lift - a.lift)[0];
  if (mvp && mvp.lift >= 15) {
    insights.push({
      tone: "good",
      text: `The club wins ${fmt(winPct(mvp.with), "%")} with ${mvp.name} and ${fmt(winPct(mvp.without), "%")} without.`,
    });
  }

  const gaps = computeWinLossGaps(matches);
  for (const g of gaps.slice(0, 2)) {
    if (g.severity < 0.08) break;
    insights.push({
      tone: "bad",
      text: `${g.label} falls from ${fmt(g.inWins, g.unit)} in wins to ${fmt(g.inLosses, g.unit)} in losses.`,
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
        text: `${best.formation} wins ${fmt(winPct(best.record), "%")} (${best.record.games} games); ${worst.formation} wins ${fmt(winPct(worst.record), "%")} (${worst.record.games} games).`,
      });
    }
  }

  return insights;
}

// Division progress (club_division_history), also used by the bot
export * from "./divisionProgress";
