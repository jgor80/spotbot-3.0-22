// The team colours and crest a club picked in /setup → Team colours & crest, for web accents.
import { useGuild, type GuildClub } from "@/contexts/GuildContext";

export interface ClubTheme {
  name: string;
  primary: string;
  secondary: string;
  crest: string | null;
}

const hex = (v: unknown) => {
  const m = String(v ?? "").trim().match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toLowerCase()}` : null;
};

// Black or white on a colour, like the bot's inkOn
export function inkOn(color: string) {
  const n = parseInt(color.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160 ? "#111111" : "#ffffff";
}

export function themeOf(club: GuildClub | null | undefined): ClubTheme | null {
  const primary = hex(club?.colors?.primary);
  const crest = typeof club?.crest_url === "string" && /^https:\/\//i.test(club.crest_url) ? club.crest_url : null;
  if (!club || (!primary && !crest)) return null;
  const p = primary || "#22c55e";
  const s = hex(club.colors?.secondary);
  return { name: club.name, primary: p, secondary: s && s !== p ? s : inkOn(p), crest };
}

// The selected server's club theme: the club running a squad when given, else the first enabled club that picked one
export function useClubTheme(teamId?: string | null): ClubTheme | null {
  const { selectedGuild } = useGuild();
  const clubs = (selectedGuild?.clubs || []).filter((c) => c && c.enabled !== false);
  const byTeam = teamId ? clubs.find((c) => c.team_id === teamId) : null;
  return themeOf(byTeam) || clubs.map(themeOf).find(Boolean) || null;
}
