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
