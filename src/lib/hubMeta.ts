// Search and share text for a public Social Hub page (/play/<slug>). Shared by the Worker, which writes it
// into the HTML crawlers get (worker/public-pages.ts), and PlayPage, which sets it once the hub loads.
// No "@/" imports: the Worker bundles this file directly.

export interface HubPublic {
  slug: string;
  name: string;
  icon_url?: string | null;
  invite_code?: string | null;
  members?: number | null;
  snapshot?: {
    playing?: number;
    lobbies?: { name: string; humans: number; live: boolean; open: string[] }[];
    leaders?: { name: string; xp: number; level: number | null }[];
  } | null;
  updated_at?: string;
}

export function hubTitle(h: Pick<HubPublic, "name">) {
  return `${h.name} | Pro Clubs Discord Server`;
}

export function hubDescription(h: Pick<HubPublic, "name" | "members">) {
  const members = h.members ? ` ${h.members.toLocaleString("en-US")} members.` : "";
  return `${h.name} is an open EA FC 27 Pro Clubs Discord server: drop-in lobbies, pickup drafts, a weekly tournament, XP and teams to join. No trials.${members}`;
}
