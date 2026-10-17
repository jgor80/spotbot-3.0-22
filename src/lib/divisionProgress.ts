// Division progress from the daily club_division_history snapshots the EA sync saves.
// Shared by the website and the bot (bundled into public/spotbot/club-insights.cjs by npm run build:bot-lib).

export interface DivisionSnapshotRow {
  captured_on: string;
  captured_at?: string | null;
  current_division: number | null;
  best_division: number | null;
  skill_rating: number | null;
  promotions: number | null;
  relegations: number | null;
  season_points: number | null;
  season_wins: number | null;
  season_draws: number | null;
  season_losses: number | null;
  season_rank: number | null;
  alltime_rank: number | null;
  leaderboard_checked: boolean | null;
}

export interface DivisionChange {
  on: string;
  from: number;
  to: number;
  kind: "promoted" | "relegated";
}

export interface DivisionTrendPoint {
  date: string;
  division: number | null;
  skillRating: number | null;
  seasonRank: number | null;
}

export interface DivisionMatch {
  result: "win" | "draw" | "loss";
  playedAt: Date;
  matchType: string;
}

export interface DivisionSummary {
  division: number | null;
  bestDivision: number | null;
  skillRating: number | null;
  // Skill rating gained or lost against the snapshot closest to 7 and 30 days back (null without one)
  srChange7d: number | null;
  srChange30d: number | null;
  promotions: number | null;
  relegations: number | null;
  seasonPoints: number | null;
  seasonRecord: { wins: number; draws: number; losses: number } | null;
  seasonRank: number | null;
  alltimeRank: number | null;
  // Places moved on the season leaderboard since the previous ranked snapshot (positive = climbed)
  seasonRankChange: number | null;
  leaderboardChecked: boolean;
  // Division moves seen between snapshots, newest first
  changes: DivisionChange[];
  // When the club reached its current division (first snapshot in it), and its EA division games since
  inDivisionSince: string | null;
  sinceRecord: { wins: number; draws: number; losses: number; points: number; played: number };
  trend: DivisionTrendPoint[];
  trackedSince: string | null;
}

// EA sends divisions as numbers or text ("3", "Division 3"); 1 is the top division
export function parseDivision(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const m = String(value).match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function divisionLabel(division: number | null | undefined): string {
  return division === null || division === undefined ? "–" : `Division ${division}`;
}

// EA's own division games (leagueMatch), not friendlies or cups, whatever a manager tagged them
export function isDivisionMatch(m: { matchType?: string | null }): boolean {
  return !/friendly|competition|cup|playoff|tournament|byot/i.test(String(m.matchType || ""));
}

const DAY_MS = 86_400_000;

function srAgo(rows: DivisionSnapshotRow[], days: number): number | null {
  const latest = rows[rows.length - 1];
  if (!latest || latest.skill_rating === null) return null;
  const target = Date.parse(latest.captured_on) - days * DAY_MS;
  // Newest snapshot at least `days` old; fall back to the oldest one when tracking began more recently
  let pick: DivisionSnapshotRow | null = null;
  for (const r of rows) {
    if (r === latest || r.skill_rating === null) continue;
    if (Date.parse(r.captured_on) <= target) pick = r;
  }
  if (!pick) {
    const oldest = rows.find((r) => r !== latest && r.skill_rating !== null);
    if (!oldest || Date.parse(latest.captured_on) - Date.parse(oldest.captured_on) < Math.min(days, 2) * DAY_MS) return null;
    pick = oldest;
  }
  return latest.skill_rating - (pick.skill_rating as number);
}

export function summarizeDivision(history: DivisionSnapshotRow[], matches: DivisionMatch[] = []): DivisionSummary {
  const rows = [...history].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  const latest = rows[rows.length - 1] || null;

  const changes: DivisionChange[] = [];
  let prevDiv: number | null = null;
  let inDivisionSince: string | null = null;
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

  // Division games since the club reached this division (from the start of that day); before any
  // move is seen, from when tracking began
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
  const seasonRankChange =
    ranked.length >= 2 && latest?.season_rank !== null && latest?.season_rank !== undefined
      ? (ranked[ranked.length - 2].season_rank as number) - latest.season_rank
      : null;

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
    seasonRecord: hasSeasonRecord
      ? { wins: latest!.season_wins || 0, draws: latest!.season_draws || 0, losses: latest!.season_losses || 0 }
      : null,
    seasonRank: latest?.season_rank ?? null,
    alltimeRank: latest?.alltime_rank ?? null,
    seasonRankChange,
    leaderboardChecked: !!latest?.leaderboard_checked,
    changes,
    inDivisionSince,
    sinceRecord,
    trend: rows.map((r) => ({ date: r.captured_on, division: r.current_division, skillRating: r.skill_rating, seasonRank: r.season_rank })),
    trackedSince: rows[0]?.captured_on ?? null,
  };
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
