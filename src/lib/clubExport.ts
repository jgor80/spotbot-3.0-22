// Excel export of a club's games: one workbook with every match, every player's season line, every
// player's match-by-match numbers and every night. Pure (returns sheets), so the web, the bot and the
// public club page export the same thing.
import { statsFromCounts } from "./eaEvents.ts";
import type { InsightMatch } from "./clubInsights.ts";
import { AREAS, grade, groupSessions, matchPerformance, summarisePerformance } from "./matchPerformance.ts";
import { playerScores, playerLines } from "./playerScores.ts";
import { workbook, type Sheet } from "./xlsx.ts";

const r1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const r0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v));
const day = (d: Date) => d.toISOString().slice(0, 10);
const time = (d: Date) => d.toISOString().slice(11, 16);
const RESULT = { win: "W", draw: "D", loss: "L" } as const;

export function clubExportSheets(matches: InsightMatch[]): Sheet[] {
  const sorted = [...matches].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());

  const matchSheet: Sheet = {
    name: "Matches",
    header: ["Date", "Time (UTC)", "Competition", "Opponent", "Result", "For", "Against", "Modelled for", "Modelled against", "Expected points", "Verdict", ...AREAS.map((a) => `${a.label} (/1000)`), "Players"],
    rows: sorted.map((m) => {
      const p = matchPerformance(m);
      return [
        day(m.playedAt), time(m.playedAt), m.competition, m.opponent, RESULT[m.result], m.scoreFor, m.scoreAgainst,
        r2(p?.modelledFor), r2(p?.modelledAgainst), r2(p?.expectedPoints), p?.verdict ?? null,
        ...AREAS.map((a) => r0(p?.areas[a.key])),
        m.players.length,
      ];
    }),
  };

  const minGames = sorted.length >= 40 ? 5 : sorted.length >= 10 ? 3 : 1;
  const scores = new Map(playerScores(sorted, minGames).map((s) => [s.key, s]));
  const playerSheet: Sheet = {
    name: "Players",
    header: ["Player", "Role", "Games", "W", "D", "L", "Goals", "Assists", "Second assists", "MOTM", "Avg rating", "Score (/1000)", "Attack", "Possession", "Ball-winning", "Tag", "Goals/game", "Chances created/game", "Pass %", "Tackles won/game", "Interceptions/game"],
    rows: playerLines(sorted, 1)
      .sort((a, b) => b.games - a.games)
      .map((l) => {
        const s = scores.get(l.key);
        return [
          l.name, l.role, l.games, l.wins, l.draws, l.losses, l.goals, l.assists, l.secondAssists, l.motm, r2(l.avgRating),
          r0(s?.overall), r0(s?.areas.attack), r0(s?.areas.possession), r0(s?.areas.ballWinning), s?.tag ?? null,
          r2(l.perGame.goalsPerGame), r2(l.perGame.chancesCreatedPerGame), r1(l.perGame.passCompletion), r2(l.perGame.tacklesWonPerGame), r2(l.perGame.interceptionsPerGame),
        ];
      }),
  };

  const logSheet: Sheet = {
    name: "Player match log",
    header: ["Date", "Opponent", "Result", "Player", "Position", "Rating", "Goals", "Assists", "MOTM", "Shots on target", "Shots off target", "Passes completed", "Passes failed", "Tackles won", "Tackles lost", "Interceptions", "Dribbles", "Possession won", "Possession lost", "Saves"],
    rows: sorted.flatMap((m) =>
      m.players.map((p) => {
        const e = p.events ? statsFromCounts(p.events) : null;
        const ev = (k: string) => (e ? e[k] ?? 0 : null);
        return [
          day(m.playedAt), m.opponent, RESULT[m.result], (p.ea_username || "").trim(), p.position ?? null, r1(Number(p.rating) || null),
          Number(p.goals) || 0, Number(p.assists) || 0, p.motm ? 1 : 0,
          ev("shotsOnTarget"), ev("shotsOffTarget"), ev("passesCompleted"), ev("passesFailed"), ev("tacklesWon"), ev("tacklesLost"), ev("interceptions"), ev("dribbles"), ev("possessionGains"), ev("possessionsLost"),
          p.saves ?? null,
        ];
      })
    ),
  };

  const nightSheet: Sheet = {
    name: "Nights",
    header: ["Date", "Games", "W", "D", "L", "Goals for", "Goals against", "Points", "Expected points", "Grade", ...AREAS.map((a) => `${a.label} (/1000)`)],
    rows: groupSessions(sorted).map((night) => {
      const s = summarisePerformance(night);
      const first = [...night].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime())[0];
      return [
        day(first.playedAt), night.length, s.wins, s.draws, s.losses, s.goalsFor, s.goalsAgainst, s.points, r2(s.expectedPoints),
        grade(s.control),
        ...AREAS.map((a) => r0(s.areas[a.key])),
      ];
    }),
  };

  return [matchSheet, playerSheet, logSheet, nightSheet];
}

export function clubExportXlsx(matches: InsightMatch[]): Uint8Array {
  return workbook(clubExportSheets(matches));
}

export function exportFileName(clubName: string, now = new Date()): string {
  const slug = clubName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "club";
  return `${slug}-gafferbot-${now.toISOString().slice(0, 10)}.xlsx`;
}
