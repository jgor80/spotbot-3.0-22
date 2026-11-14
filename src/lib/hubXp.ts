// Social Hub XP for the website. Must match public/spotbot/hub-xp.cjs (checked by hub-xp.test.cjs):
// tiers, badges, challenges, the level curve and the weekly challenge pick.

export type HubTier = { level: number; key: string; name: string; emoji: string };
export type HubBadge = { name: string; tier: "common" | "rare" | "epic" | "legendary"; help: string };

export const HUB_TIERS: HubTier[] = [
  { level: 1, key: "rookie", name: "Rookie", emoji: "🌱" },
  { level: 5, key: "regular", name: "Regular", emoji: "⚽" },
  { level: 10, key: "starter", name: "Starter", emoji: "⭐" },
  { level: 20, key: "veteran", name: "Veteran", emoji: "🎖️" },
  { level: 35, key: "legend", name: "Legend", emoji: "👑" },
];

export const HUB_BADGES: Record<string, HubBadge> = {
  regular: { name: "Drop-in Regular", tier: "common", help: "Played 25 games in the hub" },
  hub_veteran: { name: "Hub Veteran", tier: "rare", help: "Played 100 games in the hub" },
  hub_legend: { name: "Hub Legend", tier: "epic", help: "Played 500 games in the hub" },
  connector: { name: "Connector", tier: "rare", help: "Played with 25 different people" },
  social_butterfly: { name: "Social Butterfly", tier: "epic", help: "Played with 100 different people" },
  lobby_hopper: { name: "Lobby Hopper", tier: "rare", help: "Played in every lobby (3 or more)" },
  streak3: { name: "On a Roll", tier: "common", help: "Played 3 days in a row" },
  streak7: { name: "Week Warrior", tier: "rare", help: "Played 7 days in a row" },
  streak30: { name: "Ever-present", tier: "legendary", help: "Played 30 days in a row" },
  caller: { name: "Caller", tier: "common", help: "Started 5 games" },
  full_week: { name: "Clean Sweep", tier: "rare", help: "Finished all three weekly challenges" },
  weekly_winner: { name: "Player of the Week", tier: "epic", help: "Most XP in the hub in a week" },
  kitted_out: { name: "Kitted Out", tier: "common", help: "Finished the welcome setup" },
  recruiter: { name: "Recruiter", tier: "rare", help: "Brought a friend who played a game" },
  talent_scout: { name: "Talent Scout", tier: "epic", help: "Brought 5 friends who played" },
  season_podium: { name: "Season Podium", tier: "epic", help: "Finished top 3 in a hub season" },
  season_champion: { name: "Season Champion", tier: "legendary", help: "Won a hub season (most XP in a month)" },
};

export const HUB_CHALLENGES: Record<string, { target: number; text: string }> = {
  games: { target: 5, text: "Play 5 games" },
  wins: { target: 3, text: "Win 3 games" },
  goals: { target: 3, text: "Score 3 goals" },
  assists: { target: 3, text: "Get 3 assists" },
  mates: { target: 10, text: "Play with 10 different people" },
  positions: { target: 3, text: "Play 3 different positions" },
  days: { target: 3, text: "Play on 3 different days" },
  minutes: { target: 180, text: "Spend 3 hours in the lobbies" },
  lobbies: { target: 2, text: "Play in 2 different lobbies" },
};
const SOCIAL_CHALLENGES = ["mates", "positions", "days", "minutes", "lobbies"];
const GAME_CHALLENGES = ["games", "wins"];

export const xpForLevel = (n: number) => 50 * n * (n - 1);

export function levelFor(xp: number) {
  let n = 1;
  while (xpForLevel(n + 1) <= (xp || 0)) n++;
  return n;
}

export function tierFor(level: number) {
  let t = HUB_TIERS[0];
  for (const x of HUB_TIERS) if (level >= x.level) t = x;
  return t;
}

// Monday (UTC) of the week a date falls in, as YYYY-MM-DD
export function weekKeyOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// This week's three challenges, the same for everyone
export function challengesFor(weekKey: string) {
  const h = hash(weekKey);
  const social = SOCIAL_CHALLENGES[h % SOCIAL_CHALLENGES.length];
  const game = GAME_CHALLENGES[(h >>> 4) % GAME_CHALLENGES.length];
  const rest = Object.keys(HUB_CHALLENGES).filter((k) => k !== social && k !== game);
  return [social, game, rest[(h >>> 8) % rest.length]];
}

export function challengeProgress(week: Record<string, unknown> | null | undefined, key: string) {
  const v = week?.[key];
  const n = Array.isArray(v) ? v.length : Number(v) || 0;
  return Math.min(HUB_CHALLENGES[key].target, n);
}

// Chemistry badge for a 0-100 pair score (public/spotbot/hub-chemistry.cjs chemLabel)
export function chemLabel(score: number) {
  if (score >= 70) return "🔥";
  if (score >= 55) return "✅";
  return "🤝";
}

// Hub seasons run a calendar month (UTC), as YYYY-MM
export const seasonKeyOf = (date = new Date()) => date.toISOString().slice(0, 7);
export const seasonLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
