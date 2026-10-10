// Personal access tokens for the GafferBot MCP server. A token acts as one Discord user; only its
// SHA-256 hash is stored, so the plain token is shown once when it is created and never again.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export const TOKEN_PREFIX = "gb_";
export const MAX_ACTIVE_TOKENS = 5;

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return TOKEN_PREFIX + body;
}

export const looksLikeToken = (token: string) => token.startsWith(TOKEN_PREFIX) && token.length >= 40 && token.length <= 80;

// The Discord user a live token acts for, or null. Bumps last_used_at at most once a minute.
export async function resolveToken(admin: AdminClient, token: string): Promise<{ discordUserId: string } | null> {
  if (!looksLikeToken(token)) return null;
  const { data } = await admin
    .from("mcp_access_tokens")
    .select("id, discord_user_id, last_used_at, expires_at, revoked_at")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    await admin.from("mcp_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { discordUserId: data.discord_user_id as string };
}

export async function createToken(admin: AdminClient, discordUserId: string, label: string) {
  const { count } = await admin
    .from("mcp_access_tokens")
    .select("id", { count: "exact", head: true })
    .eq("discord_user_id", discordUserId)
    .is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) {
    return { error: `You already have ${MAX_ACTIVE_TOKENS} active AI tokens. Revoke them first.` };
  }
  const token = generateToken();
  const { data, error } = await admin
    .from("mcp_access_tokens")
    .insert({ discord_user_id: discordUserId, label, token_hash: await hashToken(token), token_hint: token.slice(-4) })
    .select("id, label, created_at")
    .single();
  if (error) return { error: "Could not create a token" };
  return { token, ...data };
}
