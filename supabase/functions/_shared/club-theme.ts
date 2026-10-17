// Team colours and crest a club picked in /setup (club.colors, club.crest_url in guild_settings.clubs),
// with the same fallbacks as the bot's club-colors.cjs: the server's /brand colour and logo.

// deno-lint-ignore no-explicit-any
type Club = Record<string, any> | null | undefined;
type Branding = Record<string, unknown> | null | undefined;

const hexInt = (v: unknown) => {
  const m = String(v ?? "").trim().match(/^#?([0-9a-f]{6})$/i);
  return m ? parseInt(m[1], 16) : null;
};
const https = (v: unknown) => (typeof v === "string" && /^https:\/\/\S+$/i.test(v.trim()) ? v.trim() : null);

export function clubAccent(club: Club, branding: Branding, fallback: number): number {
  const picked = hexInt(club?.colors?.primary);
  if (picked !== null) return picked;
  const brand = Number(branding?.color);
  return Number.isInteger(brand) && brand >= 0 && brand <= 0xffffff ? brand : fallback;
}

export function clubColorsHex(club: Club): { primary: string; secondary: string | null } | null {
  const p = hexInt(club?.colors?.primary);
  if (p === null) return null;
  const s = hexInt(club?.colors?.secondary);
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  return { primary: hex(p), secondary: s === null ? null : hex(s) };
}

export function clubCrest(club: Club, branding: Branding): string | null {
  return https(club?.crest_url) || https(branding?.logo_url);
}
