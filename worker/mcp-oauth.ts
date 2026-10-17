// Sign-in for AI apps on the GafferBot MCP server (gafferbot.app/mcp), as the MCP authorization spec
// asks: OAuth 2.1 with PKCE and dynamic client registration, so Claude, ChatGPT and other apps only
// need the URL. The player signs in with Discord (the same app as website sign-in, via the already
// registered /auth/callback), then picks view-only or view-and-manage on a GafferBot consent page.
//
//   GET  /.well-known/oauth-protected-resource[/mcp]  where to sign in for /mcp
//   GET  /.well-known/oauth-authorization-server      endpoints below
//   POST /oauth/register   an AI app registers its redirect URIs (public client, no secret)
//   GET  /oauth/authorize  starts a sign-in, sends the browser to Discord
//   GET  /auth/callback?state=mcp.*  back from Discord: shows the consent page
//   POST /oauth/consent    the player's answer: one-time code back to the AI app
//   POST /oauth/token      code (+PKCE verifier) or refresh token → access + refresh token
//   POST /oauth/revoke     turns a grant off
//
// Codes, tokens and the consent nonce are stored only as SHA-256 hashes. Tokens are checked by the
// gafferbot-mcp function (resolveToken), and the player sees and revokes connected apps in /me.
import {
  cleanScopes, hashToken, issueGrant, randomString, refreshGrant, revokeByToken, SCOPE_MANAGE, SCOPE_READ,
} from "../supabase/functions/_shared/mcp-tokens.ts";

// The service-role supabase-js client (kept loose so the Deno tests can pass a stand-in).
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface OAuthEnv {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
}

const REQUEST_TTL_MS = 15 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const STATE_PREFIX = "mcp.";
// Redirects to these hosts belong to AI apps we know; anything else gets a louder warning on consent.
const KNOWN_APPS: [RegExp, string][] = [
  [/^(.+\.)?claude\.ai$/, "Claude"],
  [/^(.+\.)?anthropic\.com$/, "Claude"],
  [/^(.+\.)?chatgpt\.com$/, "ChatGPT"],
  [/^(.+\.)?openai\.com$/, "ChatGPT"],
];

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// https anywhere, or http only on this machine (Claude Code and other desktop apps listen on localhost).
export function validRedirect(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false;
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}

export function appFor(redirectUri: string): string | null {
  const host = new URL(redirectUri).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return "an app on your computer";
  return KNOWN_APPS.find(([re]) => re.test(host))?.[1] ?? null;
}

export function metadata(origin: string) {
  return {
    resource: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: [SCOPE_READ, SCOPE_MANAGE],
      bearer_methods_supported: ["header"],
      resource_name: "GafferBot",
      resource_documentation: `${origin}/welcome`,
    },
    server: {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [SCOPE_READ, SCOPE_MANAGE],
    },
  };
}

// ---------- Pages ----------

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · GafferBot</title><style>
:root{color-scheme:light dark;--bg:#0b1210;--card:#121c19;--text:#e8f2ee;--muted:#9bb0a8;--accent:#22c55e;--warn:#f59e0b;--line:#24332e}
@media (prefers-color-scheme:light){:root{--bg:#f3f7f5;--card:#fff;--text:#0f1a16;--muted:#51625b;--line:#dbe5e0}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{background:var(--card);border:1px solid var(--line);border-radius:14px;max-width:440px;width:100%;padding:24px;box-sizing:border-box}
h1{font-size:20px;margin:0 0 8px}p{margin:8px 0;color:var(--muted)}b{color:var(--text)}
label{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0;cursor:pointer}
label span{color:var(--muted);font-size:14px}label strong{display:block;color:var(--text);font-size:15px}
.warn{color:var(--warn)}.row{display:flex;gap:10px;margin-top:16px}
button{flex:1;font:inherit;border-radius:10px;padding:10px;border:1px solid var(--line);background:transparent;color:var(--text);cursor:pointer}
button.go{background:var(--accent);border-color:var(--accent);color:#04120a;font-weight:600}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'",
      // same-origin, not no-referrer: with no-referrer browsers send "Origin: null" on the consent form post.
      "Referrer-Policy": "same-origin",
    },
  });
}

const errorPage = (msg: string, status = 400) => page("Sign-in problem", `<h1>Couldn't connect your AI app</h1><p>${esc(msg)}</p><p>Go back to your AI app and start the connection again.</p>`, status);

function back(redirectUri: string, params: Record<string, string | null | undefined>, origin: string): Response {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  u.searchParams.set("iss", origin);
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
}

// ---------- Endpoints ----------

async function register(req: Request, db: SupabaseClient): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return oauthError("invalid_client_metadata", "Send JSON client metadata.");
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every(validRedirect)) {
    return oauthError("invalid_redirect_uri", "redirect_uris must be 1-5 https URLs (http only for localhost).");
  }
  const method = body.token_endpoint_auth_method ?? "none";
  if (method !== "none") return oauthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method none) are supported.");
  const name = [...String(body.client_name || "AI app")].filter((ch) => ch >= " " && ch !== "<" && ch !== ">").join("").trim().slice(0, 60) || "AI app";
  const clientId = `gbc_${randomString(18)}`;
  const { error } = await db.from("mcp_oauth_clients").insert({ client_id: clientId, client_name: name, redirect_uris: uris });
  if (error) return oauthError("server_error", "Could not register the app.", 500);
  return json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: `${SCOPE_READ} ${SCOPE_MANAGE}`,
  }, 201);
}

async function authorize(url: URL, db: SupabaseClient, env: OAuthEnv, origin: string): Promise<Response> {
  const p = url.searchParams;
  const clientId = p.get("client_id") || "";
  const redirectUri = p.get("redirect_uri") || "";
  const { data: client } = await db.from("mcp_oauth_clients").select("client_id, redirect_uris").eq("client_id", clientId).maybeSingle();
  // Until the redirect is known to be the app's own, problems are shown here, never sent anywhere.
  if (!client) return errorPage("This AI app isn't registered with GafferBot.");
  if (!(client.redirect_uris as string[]).includes(redirectUri)) return errorPage("This AI app asked to send you somewhere it didn't register.");
  const state = p.get("state");
  if (p.get("response_type") !== "code") return back(redirectUri, { error: "unsupported_response_type", state }, origin);
  const challenge = p.get("code_challenge") || "";
  if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return back(redirectUri, { error: "invalid_request", error_description: "PKCE with S256 is required.", state }, origin);
  }
  const resource = p.get("resource");
  if (resource && resource.replace(/\/$/, "") !== `${origin}/mcp`) return back(redirectUri, { error: "invalid_target", state }, origin);
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return errorPage("Discord sign-in isn't configured yet.", 500);

  // Without a scope the app gets the choice of both; the player decides on the consent page.
  const asked = p.get("scope");
  const scopes = asked ? cleanScopes(asked) : [SCOPE_READ, SCOPE_MANAGE];
  const id = randomString(18);
  const { error } = await db.from("mcp_oauth_requests").insert({
    id, client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, state: state?.slice(0, 500) ?? null, scopes,
  });
  if (error) return errorPage("Something went wrong starting sign-in. Try again.", 500);
  const discord = new URL("https://discord.com/oauth2/authorize");
  discord.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    scope: "identify",
    redirect_uri: `${origin}/auth/callback`,
    state: STATE_PREFIX + id,
    prompt: "none",
  }).toString();
  return new Response(null, { status: 302, headers: { Location: discord.toString(), "Cache-Control": "no-store" } });
}

async function pendingRequest(db: SupabaseClient, id: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(id)) return null;
  const { data } = await db.from("mcp_oauth_requests")
    .select("id, client_id, redirect_uri, state, scopes, discord_user_id, consent_hash, code_hash, created_at")
    .eq("id", id).maybeSingle();
  if (!data || data.code_hash || Date.now() - new Date(data.created_at).getTime() > REQUEST_TTL_MS) return null;
  return data;
}

async function discordCallback(url: URL, db: SupabaseClient, env: OAuthEnv, origin: string): Promise<Response> {
  const id = (url.searchParams.get("state") || "").slice(STATE_PREFIX.length);
  const request = await pendingRequest(db, id);
  if (!request) return errorPage("This sign-in link has expired.");
  if (url.searchParams.get("error")) return back(request.redirect_uri, { error: "access_denied", state: request.state }, origin);
  const code = url.searchParams.get("code") || "";
  if (code.length < 10 || code.length > 200) return errorPage("Discord didn't send a sign-in code.");

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code,
      redirect_uri: `${origin}/auth/callback`,
    }),
  });
  if (!tokenRes.ok) return errorPage("Discord rejected the sign-in.");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) return errorPage("Could not read your Discord profile.");
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string };
  if (!/^\d{17,20}$/.test(me.id)) return errorPage("Discord sent an unexpected account id.");

  const nonce = randomString(24);
  const { error } = await db.from("mcp_oauth_requests")
    .update({ discord_user_id: me.id, consent_hash: await hashToken(nonce) })
    .eq("id", request.id).is("code_hash", null);
  if (error) return errorPage("Something went wrong. Try again.", 500);

  const { data: client } = await db.from("mcp_oauth_clients").select("client_name").eq("client_id", request.client_id).maybeSingle();
  const appName = String(client?.client_name || "An AI app");
  const host = new URL(request.redirect_uri).host;
  const known = appFor(request.redirect_uri);
  const canManage = (request.scopes as string[]).includes(SCOPE_MANAGE);
  const who = esc(me.global_name || me.username);
  const sentTo = known
    ? `<p>Access goes to <b>${esc(known)}</b> (${esc(host)}).</p>`
    : `<p class="warn">Access goes to <b>${esc(host)}</b>. Only continue if you started this from an app you trust.</p>`;
  return page("Connect an AI app", `
<h1>Connect ${esc(appName)} to GafferBot</h1>
<p>Signed in as <b>${who}</b> on Discord. The app acts as you and only sees servers you're in.</p>
${sentTo}
<form method="post" action="/oauth/consent">
<input type="hidden" name="request" value="${esc(request.id)}"><input type="hidden" name="nonce" value="${esc(nonce)}">
<label><input type="radio" name="access" value="read"${canManage ? "" : " checked"}><div><strong>View only</strong><span>Stats, matches, events, lineups and chemistry.</span></div></label>
${canManage ? `<label><input type="radio" name="access" value="manage" checked><div><strong>View and manage</strong><span>Also run the same club actions you can use in Discord (events, team sheets, lineups, match tags), each one only after you say yes in the chat. Every change is logged in /me → AI Assistant.</span></div></label>` : ""}
<div class="row"><button type="submit" name="decision" value="deny">Cancel</button><button class="go" type="submit" name="decision" value="allow">Allow</button></div>
</form>
<p>Turn it off any time with /me → Revoke AI Access.</p>`);
}

async function consent(req: Request, db: SupabaseClient, origin: string): Promise<Response> {
  // Forms only come from our own consent page.
  const from = req.headers.get("origin");
  if (from && from !== origin) return errorPage("That request didn't come from GafferBot.", 403);
  const form = await req.formData().catch(() => null);
  if (!form) return errorPage("Something went wrong. Try again.");
  const request = await pendingRequest(db, String(form.get("request") || ""));
  const nonce = String(form.get("nonce") || "");
  if (!request || !request.consent_hash || !request.discord_user_id || (await hashToken(nonce)) !== request.consent_hash) {
    return errorPage("This sign-in link has expired.");
  }
  if (form.get("decision") !== "allow") {
    await db.from("mcp_oauth_requests").update({ used_at: new Date().toISOString(), code_hash: `denied:${request.id}` }).eq("id", request.id);
    return back(request.redirect_uri, { error: "access_denied", state: request.state }, origin);
  }
  const manage = form.get("access") === "manage" && (request.scopes as string[]).includes(SCOPE_MANAGE);
  const code = randomString(32);
  const { data: saved } = await db.from("mcp_oauth_requests")
    .update({
      code_hash: await hashToken(code),
      code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      scopes: manage ? [SCOPE_READ, SCOPE_MANAGE] : [SCOPE_READ],
      consent_hash: null,
    })
    .eq("id", request.id).is("code_hash", null).select("id");
  if (!saved?.length) return errorPage("This sign-in link was already used.");
  return back(request.redirect_uri, { code, state: request.state }, origin);
}

async function formOrJson(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  }
  const text = await req.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(text));
}

async function token(req: Request, db: SupabaseClient): Promise<Response> {
  const p = await formOrJson(req);
  const clientId = p.client_id || "";
  const { data: client } = await db.from("mcp_oauth_clients").select("client_id, client_name").eq("client_id", clientId).maybeSingle();
  if (!client) return oauthError("invalid_client", "Unknown client_id.", 401);
  await db.from("mcp_oauth_clients").update({ last_used_at: new Date().toISOString() }).eq("client_id", clientId);

  if (p.grant_type === "refresh_token") {
    const grant = await refreshGrant(db, p.refresh_token || "", clientId);
    return grant ? json(grant) : oauthError("invalid_grant", "The refresh token is invalid, expired or revoked.");
  }
  if (p.grant_type !== "authorization_code") return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");

  const code = p.code || "";
  if (code.length < 20 || code.length > 100) return oauthError("invalid_grant", "Invalid code.");
  const { data: request } = await db.from("mcp_oauth_requests")
    .select("id, client_id, redirect_uri, code_challenge, scopes, discord_user_id, code_expires_at, used_at")
    .eq("code_hash", await hashToken(code)).maybeSingle();
  if (!request || request.used_at || !request.discord_user_id) return oauthError("invalid_grant", "The code is invalid or was already used.");
  if (new Date(request.code_expires_at).getTime() <= Date.now()) return oauthError("invalid_grant", "The code has expired.");
  if (request.client_id !== clientId || request.redirect_uri !== (p.redirect_uri || "")) return oauthError("invalid_grant", "The code was issued to another app or redirect.");
  if (!p.code_verifier || (await s256(p.code_verifier)) !== request.code_challenge) return oauthError("invalid_grant", "PKCE check failed.");
  // One use only, even when two exchanges race.
  const { data: claimed } = await db.from("mcp_oauth_requests").update({ used_at: new Date().toISOString() })
    .eq("id", request.id).is("used_at", null).select("id");
  if (!claimed?.length) return oauthError("invalid_grant", "The code was already used.");

  const grant = await issueGrant(db, {
    discordUserId: request.discord_user_id,
    clientId,
    clientName: String(client.client_name || "AI app"),
    scopes: request.scopes as string[],
  });
  return grant ? json(grant) : oauthError("server_error", "Could not issue a token.", 500);
}

async function revoke(req: Request, db: SupabaseClient): Promise<Response> {
  const p = await formOrJson(req);
  if (p.token) await revokeByToken(db, p.token, p.client_id || undefined);
  return new Response(null, { status: 200, headers: cors });
}

// Handles the OAuth routes; null when the path isn't one of them.
export async function handleOAuth(req: Request, url: URL, env: OAuthEnv, db: () => SupabaseClient): Promise<Response | null> {
  const origin = url.origin;
  const path = url.pathname;
  if (req.method === "OPTIONS" && (path.startsWith("/.well-known/oauth-") || path.startsWith("/oauth/"))) {
    return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  }
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") return json(metadata(origin).resource);
  if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/oauth-authorization-server/mcp") return json(metadata(origin).server);
  if (path === "/auth/callback") {
    if (!(url.searchParams.get("state") || "").startsWith(STATE_PREFIX)) return null;
    return discordCallback(url, db(), env, origin);
  }
  if (!path.startsWith("/oauth/")) return null;
  const route = `${req.method} ${path}`;
  if (route === "POST /oauth/register") return register(req, db());
  if (route === "GET /oauth/authorize") return authorize(url, db(), env, origin);
  if (route === "POST /oauth/consent") return consent(req, db(), origin);
  if (route === "POST /oauth/token") return token(req, db());
  if (route === "POST /oauth/revoke") return revoke(req, db());
  return json({ error: "Not found" }, 404);
}
