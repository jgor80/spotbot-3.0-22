// Club Life on the website: the badge catalogue and belt names the bot uses (public/spotbot/career.cjs and
// stat-roles.cjs). club-life.test.cjs checks this list against the bot's, so add a badge in both places.

export type Tier = "common" | "rare" | "epic" | "legendary";

export const BADGES: Record<string, { name: string; glyph: string; tier: Tier; help: string }> = {
  first_goal: { name: "Off the Mark", glyph: "1G", tier: "common", help: "Scored a first goal for the club" },
  brace: { name: "Brace", glyph: "2G", tier: "common", help: "Two goals in one game" },
  hat_trick: { name: "Hat-trick Hero", glyph: "3G", tier: "rare", help: "Three goals in one game" },
  four_timer: { name: "Haul of Four", glyph: "4G+", tier: "epic", help: "Four or more goals in one game" },
  provider: { name: "The Provider", glyph: "3A", tier: "rare", help: "Three or more assists in one game" },
  shut_out: { name: "Shut Out", glyph: "CS", tier: "common", help: "A first clean sheet as a keeper or defender" },
  iron_curtain: { name: "Iron Curtain", glyph: "CS3", tier: "rare", help: "Three clean sheets in a row as a keeper or defender" },
  super_sub: { name: "Super Sub", glyph: "SUB", tier: "rare", help: "Joined a game late and still scored" },
  last_orders: { name: "Last Orders", glyph: "LO", tier: "rare", help: "Scored in a one-goal win in the last game of the night" },
  night_owl: { name: "3 AM Survivor", glyph: "3AM", tier: "common", help: "Played a game that kicked off between 2:30 and 5 AM" },
  marathon: { name: "Marathon Night", glyph: "10+", tier: "rare", help: "Played 10 or more games in one session" },
  utility: { name: "Swiss Army Knife", glyph: "ALL", tier: "epic", help: "Played in goal, defence, midfield and attack" },
  ever_present: { name: "Ever Present", glyph: "EP", tier: "rare", help: "Played in every session of a month (4 or more sessions)" },
  apps50: { name: "50 Club", glyph: "50", tier: "common", help: "50 appearances" },
  apps100: { name: "Centurion", glyph: "100", tier: "rare", help: "100 appearances" },
  apps250: { name: "Club Servant", glyph: "250", tier: "epic", help: "250 appearances" },
  apps500: { name: "One-Club Legend", glyph: "500", tier: "legendary", help: "500 appearances" },
  goals50: { name: "Half-Century", glyph: "50G", tier: "rare", help: "50 goals" },
  goals100: { name: "Goal Machine", glyph: "100G", tier: "epic", help: "100 goals" },
  assists50: { name: "Creator in Chief", glyph: "50A", tier: "rare", help: "50 assists" },
  motm10: { name: "Main Character", glyph: "MOTM", tier: "rare", help: "10 Man of the Match awards" },
  perfect_ten: { name: "Perfect 10", glyph: "10", tier: "legendary", help: "A 10.0 match rating" },
  keeper_goal: { name: "Keeper Scores", glyph: "GK!", tier: "legendary", help: "Scored while playing in goal" },
};

export const TIER_ORDER: Tier[] = ["common", "rare", "epic", "legendary"];

// Tile colours per tier, matching the bot's badge art
export const TIER_CLASS: Record<Tier, string> = {
  common: "border-amber-700/50 bg-amber-900/20 text-amber-200",
  rare: "border-sky-400/60 bg-sky-500/15 text-sky-200",
  epic: "border-purple-400/60 bg-purple-500/15 text-purple-200",
  legendary: "border-yellow-300/70 bg-yellow-400/15 text-yellow-100",
};

export const BELTS: Record<string, { name: string; help: string }> = {
  boot: { name: "⚽ Golden Boot", help: "Top scorer this week" },
  playmaker: { name: "🎯 Playmaker", help: "Most assists this week" },
  glove: { name: "🧤 Golden Glove", help: "Most clean sheets this week" },
  wall: { name: "🛡️ The Wall", help: "Most tackles + interceptions this week" },
  mvp: { name: "⭐ MVP", help: "Most Man of the Match awards this week" },
  ironman: { name: "🦾 Iron Man", help: "Most appearances this week" },
  sniper: { name: "🔫 Sniper", help: "Best goals-per-shot this week" },
  fantasy: { name: "🎮 Fantasy King", help: "Most fantasy points this week" },
};

export const badgeOf = (key: string) => BADGES[key] ?? { name: key, glyph: "?", tier: "common" as Tier, help: "" };

export function daysBetween(from: string, to?: string | null) {
  return Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 86400000));
}

// "3 of 14 players" or "only you" for the badge wall
export function rarityLabel(holders: number, players: number) {
  if (!players) return "";
  if (holders <= 1) return players > 1 ? `only 1 of ${players} players` : "first in the club";
  return `${holders} of ${players} players`;
}
