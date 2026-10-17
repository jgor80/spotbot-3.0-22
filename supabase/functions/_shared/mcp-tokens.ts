// Access tokens for the GafferBot MCP server. A token acts as one Discord user; only its SHA-256 hash is
// stored, so the plain token is shown once when it is created and never again.
// - Personal tokens (/me → AI Assistant) never expire and can only read (clubs:read).
// - OAuth grants (an AI app signed in with Discord through the Worker's /oauth/*) get a one-hour access
//   token plus a refresh token, both rotated on every refresh, and may also hold clubs:manage.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export const TOKEN_PREFIX = "gb_";
export const REFRESH_PREFIX = "gbr_";
export const MAX_ACTIVE_TOKENS = 5;
export const MAX_OAUTH_GRANTS = 10;
export const SCOPE_READ = "clubs:read";
export const SCOPE_MANAGE = "clubs:manage";
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type TokenInfo = { id: string; discordUserId: string; scopes: string[]; oauth: boolean };

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomString(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateToken(prefix = TOKEN_PREFIX): string {
  return prefix + randomString();
}

// Only scopes we know, read always included (manage implies read).
export function cleanScopes(list: unknown): string[] {
  const asked = new Set(Array.isArray(list) ? list.map(String) : String(list || "").split(/\s+/));
  return asked.has(SCOPE_MANAGE) ? [SCOPE_READ, SCOPE_MANAGE] : [SCOPE_READ];
}

export const looksLikeToken = (token: string) => token.startsWith(TOKEN_PREFIX) && token.length >= 40 && token.length <= 80;

// The Discord user a live token acts for, with its scopes, or null. Bumps last_used_at at most once a minute.
export async function resolveToken(admin: AdminClient, token: string): Promise<TokenInfo | null> {
  if (!looksLikeToken(token)) return null;
  const { data } = await admin
    .from("mcp_access_tokens")
    .select("id, discord_user_id, scopes, oauth_client_id, last_used_at, expires_at, revoked_at")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    await admin.from("mcp_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return {
    id: data.id as string,
    discordUserId: data.discord_user_id as string,
    scopes: cleanScopes(data.scopes),
    oauth: !!data.oauth_client_id,
  };
}

export async function createToken(admin: AdminClient, discordUserId: string, label: string) {
  const { count } = await admin
    .from("mcp_access_tokens")
    .select("id", { count: "exact", head: true })
    .eq("discord_user_id", discordUserId)
    .is("oauth_client_id", null)
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

// ---------- OAuth grants (used by the Worker's /oauth/token) ----------

type Grant = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

async function freshPair(scopes: string[]) {
  const access = generateToken();
  const refresh = generateToken(REFRESH_PREFIX);
  return {
    grant: { access_token: access, token_type: "Bearer" as const, expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(" ") },
    row: {
      token_hash: await hashToken(access),
      token_hint: access.slice(-4),
      refresh_hash: await hashToken(refresh),
      expires_at: new Date(Date.now() + ACCESS_TTL_S * 1000).toISOString(),
      refresh_expires_at: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
    },
  };
}

// A new grant for an AI app the player just allowed. Past MAX_OAUTH_GRANTS the oldest ones are turned off.
export async function issueGrant(
  admin: AdminClient,
  opts: { discordUserId: string; clientId: string; clientName: string; scopes: string[] },
): Promise<Grant | null> {
  const scopes = cleanScopes(opts.scopes);
  const { grant, row } = await freshPair(scopes);
  const { error } = await admin.from("mcp_access_tokens").insert({
    ...row,
    discord_user_id: opts.discordUserId,
    label: opts.clientName.slice(0, 60) || "AI app",
    scopes,
    oauth_client_id: opts.clientId,
  });
  if (error) return null;
  const { data: live } = await admin
    .from("mcp_access_tokens")
    .select("id")
    .eq("discord_user_id", opts.discordUserId)
    .not("oauth_client_id", "is", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const extra = (live || []).slice(MAX_OAUTH_GRANTS).map((r: { id: string }) => r.id);
  if (extra.length) await admin.from("mcp_access_tokens").update({ revoked_at: new Date().toISOString() }).in("id", extra);
  return grant;
}

// Swap a refresh token for a new pair. The old refresh token stops working at once (rotation), and only
// the app it was issued to may use it.
export async function refreshGrant(admin: AdminClient, refreshToken: string, clientId: string): Promise<Grant | null> {
  if (!refreshToken.startsWith(REFRESH_PREFIX) || refreshToken.length > 80) return null;
  const oldHash = await hashToken(refreshToken);
  const { data } = await admin
    .from("mcp_access_tokens")
    .select("id, oauth_client_id, scopes, refresh_expires_at, revoked_at")
    .eq("refresh_hash", oldHash)
    .maybeSingle();
  if (!data || data.revoked_at || data.oauth_client_id !== clientId) return null;
  if (!data.refresh_expires_at || new Date(data.refresh_expires_at).getTime() <= Date.now()) return null;
  const scopes = cleanScopes(data.scopes);
  const { grant, row } = await freshPair(scopes);
  // Conditional on the old hash, so two refreshes racing with the same token can't both succeed.
  const { data: updated } = await admin
    .from("mcp_access_tokens")
    .update({ ...row, last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("refresh_hash", oldHash)
    .select("id");
  return updated?.length ? grant : null;
}

// Turn off the grant an access or refresh token belongs to (OAuth token revocation).
export async function revokeByToken(admin: AdminClient, token: string, clientId?: string): Promise<void> {
  const column = token.startsWith(REFRESH_PREFIX) ? "refresh_hash" : "token_hash";
  let q = admin.from("mcp_access_tokens").update({ revoked_at: new Date().toISOString() })
    .eq(column, await hashToken(token)).not("oauth_client_id", "is", null).is("revoked_at", null);
  if (clientId) q = q.eq("oauth_client_id", clientId);
  await q;
}
