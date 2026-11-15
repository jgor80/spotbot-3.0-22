// Public club pages: any EA FC Pro Clubs club, no sign-in. The public-club function fetches EA's
// public endpoints (club info, overall stats, members and recent matches); this file turns that raw
// payload into the page: record, form, team scores out of 1000, player scores, power rankings and a
// club vs club comparison. Pure functions, shared by the web page and tests.
import { toInsightMatches, type ClubMatchRow, type InsightMatch } from "./clubInsights.ts";
import { summarisePerformance, AREAS, type Area, type MatchPerformance } from "./matchPerformance.ts";
import { playerScores, powerRankings, type PlayerScore } from "./playerScores.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

export type PublicPlatform = "common-gen5" | "nx";
export const PUBLIC_PLATFORMS: { value: PublicPlatform; label: string }[] = [
  { value: "common-gen5", label: "PS5 / Xbox Series / PC" },
  { value: "nx", label: "Switch" },
];
export const isPublicPlatform = (p: unknown): p is PublicPlatform => p === "common-gen5" || p === "nx";

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown) => num(v) ?? 0;

export function eaCrestUrl(crestAssetId: unknown): string | null {
  const id = String(crestAssetId ?? "").replace(/\D/g, "");
  return id ? `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${id}.png` : null;
}

export type MatchCategory = "league" | "playoff" | "friendly";
const MATCH_TYPE: Record<MatchCategory, string> = { league: "leagueMatch", playoff: "playoffMatch", friendly: "friendlyMatch" };

// One raw EA match → the same row shape a synced club_matches row has, so every insight works on it.
// Only the fields the insights read are kept (clubs, players, timestamp), which keeps the payload small.
export function eaMatchToRow(match: Raw, clubId: string, category: MatchCategory): ClubMatchRow | null {
  const clubs: Raw = match?.clubs || {};
  const ours = clubs[clubId];
  const oppId = Object.keys(clubs).find((id) => id !== clubId);
  if (!ours || !oppId) return null;
  const sf = int(ours.goals ?? ours.score);
  const sa = int(clubs[oppId]?.goals ?? clubs[oppId]?.score);
  const ts = int(match.timestamp);
  const ourPlayers: Raw = match.players?.[clubId] || {};
  const player_stats = Object.values(ourPlayers)
    .filter((p: Raw) => p && p.playername)
    .map((p: Raw) => ({
      ea_username: String(p.playername).trim(),
      goals: int(p.goals),
      assists: int(p.assists),
      rating: num(p.rating) ?? undefined,
      position: p.pos ?? null,
      motm: String(p.mom) === "1",
      shots: int(p.shots),
      saves: int(p.saves),
      red_cards: String(p.redcards) === "1",
    }));
  return {
    id: String(match.matchId ?? `${clubId}-${ts}`),
    result: sf > sa ? "win" : sf < sa ? "loss" : "draw",
    score_for: sf,
    score_against: sa,
    match_type: MATCH_TYPE[category],
    created_at: new Date((ts || 0) * 1000).toISOString(),
    opponent_club_name: clubs[oppId]?.details?.name || clubs[oppId]?.name || "Unknown",
    match_data: { timestamp: ts, clubs: { [clubId]: { goals: sf }, [oppId]: { goals: sa, details: { name: clubs[oppId]?.details?.name } } }, players: match.players || {} },
    player_stats,
  };
}

export interface PublicMember {
  name: string;
  games: number;
  goals: number;
  assists: number;
  rating: number | null;
  winRate: number | null;
  motm: number;
  position: string | null;
  overall: number | null;
  passSuccess: number | null;
  tackleSuccess: number | null;
  cleanSheets: number;
}

export function eaMembers(raw: unknown): PublicMember[] {
  const r = raw as Raw;
  const list: Raw[] = Array.isArray(r) ? r : Array.isArray(r?.members) ? r.members : r && typeof r === "object" ? Object.values(r).filter((v) => v && typeof v === "object") : [];
  return list
    .filter((m) => m?.name || m?.playerName)
    .map((m) => ({
      name: String(m.name || m.playerName),
      games: int(m.gamesPlayed),
      goals: int(m.goals),
      assists: int(m.assists),
      rating: num(m.ratingAve),
      winRate: num(m.winRate),
      motm: int(m.manOfTheMatch),
      position: m.favoritePosition || m.proPos || null,
      overall: num(m.proOverall),
      passSuccess: num(m.passSuccessRate),
      tackleSuccess: num(m.tackleSuccessRate),
      cleanSheets: int(m.cleanSheetsDef) + int(m.cleanSheetsGK),
    }))
    .sort((a, b) => b.games - a.games);
}

export interface PublicOverall {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  goalsAgainst: number;
  skillRating: number | null;
  bestDivision: number | null;
  promotions: number;
  relegations: number;
  titles: number;
  unbeatenStreak: number;
}

export function eaOverall(raw: unknown): PublicOverall | null {
  const r = raw as Raw;
  const o: Raw | undefined = Array.isArray(r) ? r[0] : r && typeof r === "object" ? (Object.values(r).find((v) => v && typeof v === "object" && "wins" in (v as Raw)) as Raw) ?? r : undefined;
  if (!o || o.wins === undefined) return null;
  return {
    games: int(o.gamesPlayed),
    wins: int(o.wins),
    draws: int(o.ties),
    losses: int(o.losses),
    goals: int(o.goals),
    goalsAgainst: int(o.goalsAgainst),
    skillRating: num(o.skillRating),
    bestDivision: num(o.bestDivision),
    promotions: int(o.promotions),
    relegations: int(o.relegations),
    titles: int(o.titlesWon),
    unbeatenStreak: int(o.unbeatenstreak),
  };
}

// What the public-club function returns
export interface PublicClubPayload {
  clubId: string;
  platform: PublicPlatform;
  name: string;
  crest: string | null;
  overall: PublicOverall | null;
  members: PublicMember[];
  rows: ClubMatchRow[];
  fetchedAt: string;
}

export interface PublicClubView {
  matches: InsightMatch[];
  form: ("win" | "draw" | "loss")[];
  recent: { games: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; pointsPerGame: number; expectedPointsPerGame: number };
  areas: Record<Area, number | null>;
  strongest: Area | null;
  weakest: Area | null;
  players: PlayerScore[];
  rankings: ReturnType<typeof powerRankings>;
  results: MatchPerformance[]; // newest first, with modelled goals and a verdict
}

export function publicClubView(payload: PublicClubPayload): PublicClubView {
  const matches = toInsightMatches(payload.rows);
  const perf = summarisePerformance(matches);
  const n = perf.games || 1;
  return {
    matches,
    form: matches.slice(0, 10).map((m) => m.result),
    recent: {
      games: perf.games,
      wins: perf.wins,
      draws: perf.draws,
      losses: perf.losses,
      goalsFor: perf.goalsFor,
      goalsAgainst: perf.goalsAgainst,
      pointsPerGame: perf.points / n,
      expectedPointsPerGame: perf.expectedPoints / n,
    },
    areas: perf.areas,
    strongest: perf.strongest,
    weakest: perf.weakest,
    players: playerScores(matches, matches.length >= 20 ? 3 : 2),
    rankings: powerRankings(matches),
    results: perf.matches,
  };
}

export interface CompareRow {
  label: string;
  values: [string, string];
  better: 0 | 1 | null;
}

// Club vs club: the same numbers side by side, with which side is better
export function compareClubs(a: PublicClubPayload, b: PublicClubPayload): { rows: CompareRow[]; views: [PublicClubView, PublicClubView] } {
  const va = publicClubView(a), vb = publicClubView(b);
  const rows: CompareRow[] = [];
  const add = (label: string, x: number | null, y: number | null, fmt: (n: number) => string, lowerBetter = false) => {
    if (x === null && y === null) return;
    const better = x === null || y === null || Math.abs(x - y) < 1e-9 ? null : (x > y) !== lowerBetter ? 0 : 1;
    rows.push({ label, values: [x === null ? "—" : fmt(x), y === null ? "—" : fmt(y)], better });
  };
  const pct = (o: PublicOverall | null) => (o && o.games ? (o.wins / o.games) * 100 : null);
  const per = (o: PublicOverall | null, k: "goals" | "goalsAgainst") => (o && o.games ? o[k] / o.games : null);
  add("Skill rating", a.overall?.skillRating ?? null, b.overall?.skillRating ?? null, (n) => String(Math.round(n)));
  add("Best division", a.overall?.bestDivision ?? null, b.overall?.bestDivision ?? null, (n) => `Div ${n}`, true);
  add("All-time win rate", pct(a.overall), pct(b.overall), (n) => `${Math.round(n)}%`);
  add("All-time goals a game", per(a.overall, "goals"), per(b.overall, "goals"), (n) => n.toFixed(2));
  add("All-time conceded a game", per(a.overall, "goalsAgainst"), per(b.overall, "goalsAgainst"), (n) => n.toFixed(2), true);
  add("Titles", a.overall?.titles ?? null, b.overall?.titles ?? null, (n) => String(n));
  const recent = (v: PublicClubView) => (v.recent.games ? v.recent : null);
  add("Recent points a game", recent(va)?.pointsPerGame ?? null, recent(vb)?.pointsPerGame ?? null, (n) => n.toFixed(2));
  add("Recent expected points a game", recent(va)?.expectedPointsPerGame ?? null, recent(vb)?.expectedPointsPerGame ?? null, (n) => n.toFixed(2));
  for (const { key, label } of AREAS) add(`${label} (out of 1000)`, va.areas[key], vb.areas[key], (n) => String(Math.round(n)));
  const top = (v: PublicClubView) => v.players[0]?.overall ?? null;
  add("Best player score", top(va), top(vb), (n) => String(Math.round(n)));
  add("Squad size", a.members.length || null, b.members.length || null, (n) => String(n));
  rows[rows.length - 1].better = rows[rows.length - 1].label === "Squad size" ? null : rows[rows.length - 1].better; // bigger isn't better
  return { rows, views: [va, vb] };
}

// Short, readable link ids: /club/<platform>/<clubId>
export const publicClubPath = (platform: PublicPlatform, clubId: string) => `/club/${platform}/${encodeURIComponent(clubId)}`;
export const compareParam = (platform: PublicPlatform, clubId: string) => `${platform}:${clubId}`;
export function parseCompareParam(v: string | null): { platform: PublicPlatform; clubId: string } | null {
  const [p, id] = String(v || "").split(":");
  return isPublicPlatform(p) && /^\d+$/.test(id || "") ? { platform: p, clubId: id } : null;
}
