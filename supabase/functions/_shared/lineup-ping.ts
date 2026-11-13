// Who a published team sheet pings. Same rule as the bot's event posts (public/spotbot/event-board.cjs):
// - league games ping the club's signed-players role only, never @everyone and never players one by one
// - other games ping the role picked on the event, else @everyone
// - a team sheet with no event pings the signed-players role, else @everyone
// Players are named in the post, but their tags never notify.

export type PingPlan = { kind: "role"; roleId: string } | { kind: "everyone" } | { kind: "none" };

type Role = { id: string; name?: string | null };

const squash = (n: unknown) => String(n || "").toLowerCase().replace(/[^a-z]/g, "");

// The club's signed-players role: the one set in /manager, else a role named like "Signed Players"
export function findSignedRole(roles: Role[], club: any): Role | null {
  const list = Array.isArray(roles) ? roles : [];
  if (club?.signed_role_id) {
    const picked = list.find((r) => r.id === club.signed_role_id);
    if (picked) return picked;
  }
  return (
    list.find((r) => ["signedplayers", "signedplayer", "signed"].includes(squash(r.name))) ||
    list.find((r) => /signed/.test(squash(r.name)) && !/unsigned/.test(squash(r.name))) ||
    null
  );
}

const TYPE_RULES: [RegExp, string][] = [
  [/\b(practice|training|session)\b/, "training"],
  [/\b(byot|tournament|cup|playoff)\b/, "tournament"],
  [/\bleague\b/, "league"],
];

export function isLeagueEvent(event: any): boolean {
  if (!event) return false;
  const title = String(event.title || "").toLowerCase();
  for (const [re, kind] of TYPE_RULES) if (re.test(title)) return kind === "league";
  if (/\b(scrim|friendly|try ?outs?)\b/.test(title)) return false;
  return event.event_type === "league";
}

export function lineupPingPlan({ event, signedRoleId, roleIds }: { event: any; signedRoleId: string | null; roleIds: string[] }): PingPlan {
  if (event && isLeagueEvent(event)) {
    if (signedRoleId) return { kind: "role", roleId: signedRoleId };
    return event.ping_role_id && roleIds.includes(event.ping_role_id) ? { kind: "role", roleId: event.ping_role_id } : { kind: "none" };
  }
  if (event) {
    return event.ping_role_id && roleIds.includes(event.ping_role_id) ? { kind: "role", roleId: event.ping_role_id } : { kind: "everyone" };
  }
  return signedRoleId ? { kind: "role", roleId: signedRoleId } : { kind: "everyone" };
}

export function pingHead(plan: PingPlan): string {
  return plan.kind === "role" ? `<@&${plan.roleId}>` : plan.kind === "everyone" ? "@everyone" : "";
}

// allowed_mentions for Discord's REST API: the plan's role or @everyone, never a user
export function pingAllowed(plan: PingPlan) {
  return {
    parse: plan.kind === "everyone" ? ["everyone"] : [],
    roles: plan.kind === "role" ? [plan.roleId] : [],
    users: [] as string[],
  };
}
