// The AI-app sign-in in the Worker (worker/mcp-oauth.ts), end to end against an in-memory database
// with Discord stubbed: register → authorize → Discord → consent → code → tokens → refresh → revoke.
import { handleOAuth, s256, validRedirect } from "../../../worker/mcp-oauth.ts";
import { resolveToken } from "../_shared/mcp-tokens.ts";
import { memoryDb } from "./test-db.ts";

const ORIGIN = "https://gafferbot.app";
const ENV = { DISCORD_CLIENT_ID: "123", DISCORD_CLIENT_SECRET: "shh" };
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const PLAYER = "111111111111111111";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

// deno-lint-ignore no-explicit-any
async function hit(db: any, method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}) {
  const url = new URL(ORIGIN + path);
  const req = new Request(url, { method, body, headers });
  const res = await handleOAuth(req, url, ENV, () => db);
  if (!res) throw new Error(`${path} not handled`);
  return res;
}

const SERVER = "222222222222222222";
// A database where the player is a club manager, so sign-in offers manage.
const adminDb = () => memoryDb({ user_roles: [{ guild_id: SERVER, discord_user_id: PLAYER, role: "manager" }] });

function stubDiscord(guilds: { id: string; owner?: boolean; permissions?: string }[] = []) {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes("/users/@me/guilds")) return Promise.resolve(new Response(JSON.stringify(guilds)));
    if (u.includes("/oauth2/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "discord-at" })));
    if (u.includes("/users/@me")) return Promise.resolve(new Response(JSON.stringify({ id: PLAYER, username: "jeff" })));
    return Promise.reject(new Error(`unexpected fetch ${u}`));
  }) as typeof fetch;
  return () => (globalThis.fetch = real);
}

// Runs the browser part of a sign-in and returns the code the AI app receives.
// deno-lint-ignore no-explicit-any
async function signIn(db: any, opts: { access?: string; verifier?: string; scope?: string; guilds?: { id: string; owner?: boolean; permissions?: string }[] } = {}) {
  const reg = await hit(db, "POST", "/oauth/register", JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT] }), { "content-type": "application/json" });
  assert(reg.status === 201, "register failed");
  const { client_id } = await reg.json();
  const verifier = opts.verifier ?? "v".repeat(50);
  const q = new URLSearchParams({
    response_type: "code", client_id, redirect_uri: REDIRECT, state: "xyz",
    code_challenge: await s256(verifier), code_challenge_method: "S256", resource: `${ORIGIN}/mcp`,
    ...(opts.scope ? { scope: opts.scope } : {}),
  });
  const auth = await hit(db, "GET", `/oauth/authorize?${q}`);
  assert(auth.status === 302, "authorize should redirect to Discord");
  const discord = new URL(auth.headers.get("location")!);
  assert(discord.hostname === "discord.com" && discord.searchParams.get("redirect_uri") === `${ORIGIN}/auth/callback`, "wrong Discord redirect");
  const state = discord.searchParams.get("state")!;
  const restore = stubDiscord(opts.guilds);
  let html: string;
  try {
    const cb = await hit(db, "GET", `/auth/callback?code=discordcode123&state=${state}`);
    assert(cb.status === 200 && cb.headers.get("x-frame-options") === "DENY", "consent page missing");
    html = await cb.text();
  } finally {
    restore();
  }
  const field = (name: string) => html.match(new RegExp(`name="${name}" value="([^"]+)"`))![1];
  const form = new URLSearchParams({ request: field("request"), nonce: field("nonce"), decision: "allow", access: opts.access ?? "manage" });
  const consent = await hit(db, "POST", "/oauth/consent", form, { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN });
  assert(consent.status === 302, "consent should redirect back to the app");
  const back = new URL(consent.headers.get("location")!);
  assert(back.origin + back.pathname === REDIRECT && back.searchParams.get("state") === "xyz", "wrong redirect back");
  return { client_id, verifier, code: back.searchParams.get("code")!, html };
}

// deno-lint-ignore no-explicit-any
const exchange = (db: any, p: Record<string, string>) =>
  hit(db, "POST", "/oauth/token", new URLSearchParams(p), { "content-type": "application/x-www-form-urlencoded" });

Deno.test("metadata points AI apps at the sign-in endpoints", async () => {
  const db = memoryDb();
  const pr = await (await hit(db, "GET", "/.well-known/oauth-protected-resource")).json();
  assert(pr.resource === `${ORIGIN}/mcp` && pr.authorization_servers[0] === ORIGIN, "resource metadata");
  const as = await (await hit(db, "GET", "/.well-known/oauth-authorization-server")).json();
  assert(as.token_endpoint === `${ORIGIN}/oauth/token` && as.code_challenge_methods_supported.includes("S256"), "server metadata");
  const url = new URL(`${ORIGIN}/auth/callback?code=x&state=abc`);
  assert((await handleOAuth(new Request(url), url, ENV, () => db)) === null, "website sign-in callback must pass through");
});

Deno.test("redirect URIs must be https or localhost", () => {
  assert(validRedirect("https://claude.ai/cb") && validRedirect("http://localhost:3334/cb"), "good ones refused");
  assert(!validRedirect("http://evil.com/cb") && !validRedirect("javascript:alert(1)") && !validRedirect("https://a.com/#x"), "bad ones accepted");
});

Deno.test("full sign-in gives a manage token that refreshes, rotates and revokes", async () => {
  const db = adminDb();
  const { client_id, verifier, code, html } = await signIn(db);
  assert(html.includes("Claude") && html.includes("View and manage"), "consent page content");
  const tok = await exchange(db, { grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: verifier });
  assert(tok.status === 200, "token exchange failed");
  const grant = await tok.json();
  assert(grant.access_token.startsWith("gb_") && grant.refresh_token.startsWith("gbr_") && grant.scope.includes("clubs:manage"), "grant shape");
  const info = await resolveToken(db, grant.access_token);
  assert(info?.discordUserId === PLAYER && info.oauth && info.scopes.includes("clubs:manage"), "token not resolved with manage");
  assert(!(await resolveToken(db, grant.refresh_token)), "refresh token must not work as an access token");

  const again = await exchange(db, { grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: verifier });
  assert(again.status === 400, "code reused");

  const r1 = await exchange(db, { grant_type: "refresh_token", refresh_token: grant.refresh_token, client_id });
  assert(r1.status === 200, "refresh failed");
  const next = await r1.json();
  assert(!(await resolveToken(db, grant.access_token)) && await resolveToken(db, next.access_token), "access token not rotated");
  const stale = await exchange(db, { grant_type: "refresh_token", refresh_token: grant.refresh_token, client_id });
  assert(stale.status === 400, "old refresh token still works");
  const otherApp = await exchange(db, { grant_type: "refresh_token", refresh_token: next.refresh_token, client_id: "gbc_other" });
  assert(otherApp.status === 401, "another app used the refresh token");

  await hit(db, "POST", "/oauth/revoke", new URLSearchParams({ token: next.refresh_token }), { "content-type": "application/x-www-form-urlencoded" });
  assert(!(await resolveToken(db, next.access_token)), "revoke didn't stop the access token");
});

Deno.test("view-only consent and PKCE are enforced", async () => {
  const db = adminDb();
  const { client_id, verifier, code } = await signIn(db, { access: "read" });
  const bad = await exchange(db, { grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: "w".repeat(50) });
  assert(bad.status === 400, "wrong PKCE verifier accepted");
  const { code: code2, client_id: c2, verifier: v2 } = await signIn(db, { access: "read" });
  const ok = await (await exchange(db, { grant_type: "authorization_code", code: code2, client_id: c2, redirect_uri: REDIRECT, code_verifier: v2 })).json();
  assert(ok.scope === "clubs:read", "view-only consent got manage");
  const info = await resolveToken(db, ok.access_token);
  assert(info && !info.scopes.includes("clubs:manage"), "read token has manage");
  // An app that only asked for read never gets the manage option.
  const { html } = await signIn(db, { scope: "clubs:read" });
  assert(!html.includes("View and manage"), "manage offered without being asked");
  void verifier;
});

Deno.test("unregistered redirects and forged consent are refused", async () => {
  const db = memoryDb();
  const reg = await (await hit(db, "POST", "/oauth/register", JSON.stringify({ redirect_uris: [REDIRECT] }), { "content-type": "application/json" })).json();
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: "https://evil.example/cb", code_challenge: "a".repeat(43), code_challenge_method: "S256" });
  const res = await hit(db, "GET", `/oauth/authorize?${q}`);
  assert(res.status === 400 && !res.headers.get("location"), "sent the browser to an unregistered redirect");
  const plain = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: "short", code_challenge_method: "plain" });
  const noPkce = await hit(db, "GET", `/oauth/authorize?${plain}`);
  assert(new URL(noPkce.headers.get("location")!).searchParams.get("error") === "invalid_request", "plain PKCE accepted");

  const { html } = await signIn(db);
  const request = html.match(/name="request" value="([^"]+)"/)![1];
  void request;
  const forged = new URLSearchParams({ request: "x".repeat(24), nonce: "guess", decision: "allow", access: "manage" });
  const f = await hit(db, "POST", "/oauth/consent", forged, { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN });
  assert(f.status === 400, "forged consent accepted");
  const cross = await hit(db, "POST", "/oauth/consent", forged, { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" });
  assert(cross.status === 403, "cross-site consent accepted");
});

Deno.test("only club admins are offered manage; other players connect view-only", async () => {
  const db = memoryDb({ guild_settings: [{ guild_id: SERVER }] });
  const player = await signIn(db, { access: "manage" });
  assert(!player.html.includes("View and manage") && player.html.includes("only for club admins"), "manage offered to a player");
  const tok = await (await exchange(db, { grant_type: "authorization_code", code: player.code, client_id: player.client_id, redirect_uri: REDIRECT, code_verifier: player.verifier })).json();
  assert(tok.scope === "clubs:read", "a player got manage by posting access=manage");

  // Discord server admins (Manage Server) of a GafferBot server count, other servers don't.
  const elsewhere = await signIn(db, { guilds: [{ id: "999999999999999999", owner: true }] });
  assert(!elsewhere.html.includes("View and manage"), "admin of an unrelated server got manage");
  const discordAdmin = await signIn(db, { guilds: [{ id: SERVER, permissions: "32" }] });
  assert(discordAdmin.html.includes("View and manage"), "Discord server admin not offered manage");
});
