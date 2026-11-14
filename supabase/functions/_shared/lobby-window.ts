// Social Hub lobbies that borrow an EA club (lobby_only) keep only the games played while people were in
// the lobby's voice channel. Keep in step with public/spotbot/hub-lobby-club.cjs (inLobbyWindow).

export type LobbyWindow = { from: number; to: number; tags?: string[] };

const SLACK_MS = 20 * 60 * 1000; // EA stamps a match when it ends
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function matchPlayerNames(match: any, eaClubId: string | number): string[] {
  const players = match?.players?.[String(eaClubId)] || {};
  return Object.values(players).map((p: any) => norm(p?.playername || p?.name)).filter(Boolean);
}

export function inLobbyWindow(windows: LobbyWindow[] | null | undefined, match: any, eaClubId: string | number): boolean {
  const at = Number(match?.timestamp || 0) * 1000;
  if (!at || !Array.isArray(windows)) return false;
  const names = matchPlayerNames(match, eaClubId);
  return windows.some((w) => {
    if (at < Number(w.from) - SLACK_MS || at > Number(w.to) + SLACK_MS) return false;
    const tags = (w.tags || []).map(norm);
    return !tags.length || names.some((n) => tags.includes(n));
  });
}
