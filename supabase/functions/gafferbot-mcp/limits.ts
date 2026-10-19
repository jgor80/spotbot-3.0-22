// Rate limits for the MCP server. Calls are counted in memory per caller (the server runs in the one
// bot process); changes are counted from mcp_action_log so they hold across restarts.

export const CALLS_PER_MINUTE = 60;
export const CHANGES_PER_HOUR = 30;
// Most JSON-RPC messages one POST may carry; each one counts as a call.
export const MAX_BATCH = 10;

const windows = new Map<string, number[]>();

// True when the caller may make another call now (and records it).
export function allowCall(key: string, now = Date.now(), limit = CALLS_PER_MINUTE): boolean {
  const recent = (windows.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 5000) {
    for (const [k, v] of windows) if (!v.some((t) => now - t < 60_000)) windows.delete(k);
  }
  return true;
}

// deno-lint-ignore no-explicit-any
export async function changesLastHour(db: any, discordUserId: string): Promise<number> {
  const { count } = await db
    .from("mcp_action_log")
    .select("id", { count: "exact", head: true })
    .eq("discord_user_id", discordUserId)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  return count ?? 0;
}

// Preview-then-confirm, enforced: a confirmed change runs only if this player previewed the same call
// (same tool, server and arguments) in the last PREVIEW_TTL_MS, so an AI app can't skip the preview step.
export const PREVIEW_TTL_MS = 15 * 60 * 1000;
const previews = new Map<string, number>();

// deno-lint-ignore no-explicit-any
function stable(v: any): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

function previewKey(discordUserId: string, tool: string, guildId: string, args: Record<string, unknown>) {
  const { confirm: _confirm, guild_id: _guild, ...rest } = args;
  return `${discordUserId}|${tool}|${guildId}|${stable(rest)}`;
}

export function rememberPreview(discordUserId: string, tool: string, guildId: string, args: Record<string, unknown>, now = Date.now()) {
  previews.set(previewKey(discordUserId, tool, guildId, args), now);
  if (previews.size > 5000) {
    for (const [k, at] of previews) if (now - at > PREVIEW_TTL_MS) previews.delete(k);
  }
}

export function previewed(discordUserId: string, tool: string, guildId: string, args: Record<string, unknown>, now = Date.now()) {
  const at = previews.get(previewKey(discordUserId, tool, guildId, args));
  return at !== undefined && now - at <= PREVIEW_TTL_MS;
}
