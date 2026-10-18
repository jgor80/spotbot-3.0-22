// Cloudflare Worker entry: serves the SPA from ./dist and handles /api/* routes.
// Discord OAuth runs here so sign-in does not depend on Lovable Cloud functions.
import { createClient } from "@supabase/supabase-js";
import { handleOAuth } from "./mcp-oauth";

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  FUNCTIONS_ORIGIN?: string;
  OPS_ORIGIN?: string;
}

const ALLOWED = [/^https:\/\/(www\.)?gafferbot\.app$/, /^https:\/\/[a-z0-9-]+\.workers\.dev$/, /^http:\/\/localhost:\d+$/];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function discordAuth(req: Request, env: Env): Promise<Response> {
  const clientId = env.DISCORD_CLIENT_ID;
  if (req.method === "GET") return json({ client_id: clientId ?? null });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = (await req.json().catch(() => ({}))) as { code?: unknown; redirect_uri?: unknown };
  const { code, redirect_uri } = body;
  if (typeof code !== "string" || code.length < 10 || code.length > 200) return json({ error: "Invalid code" }, 400);
  if (typeof redirect_uri !== "string") return json({ error: "Invalid redirect" }, 400);
  let ru: URL;
  try { ru = new URL(redirect_uri); } catch { return json({ error: "Invalid redirect" }, 400); }
  if (!ALLOWED.some((r) => r.test(ru.origin)) || ru.pathname !== "/auth/callback") return json({ error: "Redirect not allowed" }, 400);
  if (!clientId || !env.DISCORD_CLIENT_SECRET) return json({ error: "Discord sign-in is not configured yet" }, 500);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Database is not configured" }, 500);

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri }),
  });
  if (!tokenRes.ok) {
    console.error("token exchange failed", tokenRes.status, await tokenRes.text());
    return json({ error: "Discord rejected the sign-in" }, 400);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const auth = { headers: { Authorization: `Bearer ${access_token}` } };
  const meRes = await fetch("https://discord.com/api/users/@me", auth);
  if (!meRes.ok) return json({ error: "Could not read Discord profile" }, 400);
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string; avatar?: string };
  const discordId = me.id;
  if (!/^\d{17,20}$/.test(discordId)) return json({ error: "Bad Discord id" }, 400);
  const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${me.avatar}.png` : null;

  // Verified console connections (needs the "connections" scope) are the gamertag source of truth.
  let xboxGamertag: string | null = null;
  let xboxXuid: string | null = null;
  let psnId: string | null = null;
  const connRes = await fetch("https://discord.com/api/users/@me/connections", auth);
  if (connRes.ok) {
    const connections = (await connRes.json()) as { type?: string; id?: string; name?: string; verified?: boolean }[];
    for (const c of connections) {
      if (!c?.name || c.verified === false) continue;
      if (c.type === "xbox" && !xboxGamertag) {
        xboxGamertag = c.name;
        // Discord's Xbox connection id is the XUID that presence polling needs
        if (c.id && /^\d{10,20}$/.test(String(c.id))) xboxXuid = String(c.id);
      }
      if (c.type === "psn" && !psnId) psnId = c.name;
    }
  }

  const meta = { discord_user_id: discordId, discord_username: me.username, full_name: me.global_name ?? me.username, avatar_url: avatar, provider: "discord", xbox_gamertag: xboxGamertag, psn_id: psnId };
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let email: string | null = null;
  let userId: string | null = null;

  const { data: link } = await admin.from("user_discord_links").select("auth_user_id").eq("discord_user_id", discordId).maybeSingle();
  if (link?.auth_user_id) {
    const { data } = await admin.auth.admin.getUserById(link.auth_user_id);
    if (data?.user) { email = data.user.email ?? null; userId = data.user.id; }
  }
  if (!userId) {
    // Synthetic address so nobody can claim an existing email account via Discord.
    email = `discord_${discordId}@users.gafferbot.app`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
    if (error && !/already/i.test(error.message)) throw error;
    if (created?.user) userId = created.user.id;
    else {
      const { data: gl } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      userId = gl?.user?.id ?? null;
    }
    if (!userId) throw new Error("Could not create account");
    await admin.from("user_discord_links").upsert({ auth_user_id: userId, discord_user_id: discordId, verified: true }, { onConflict: "discord_user_id" });
  } else {
    await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
  }

  // One profile row per player: refresh name/avatar, fill gamertags only when empty.
  const { data: profile } = await admin.from("profiles").select("id, ea_username, xbox_gamertag, xbox_xuid, psn_id").eq("discord_user_id", discordId).maybeSingle();
  const base: Record<string, unknown> = {
    auth_user_id: userId, discord_user_id: discordId, discord_username: me.username,
    display_name: me.global_name ?? me.username, avatar_url: avatar, discord_avatar: avatar, sign_in_provider: "discord",
  };
  if (xboxGamertag && !profile?.xbox_gamertag) base.xbox_gamertag = xboxGamertag;
  if (xboxXuid && !profile?.xbox_xuid) base.xbox_xuid = xboxXuid;
  if (psnId && !profile?.psn_id) base.psn_id = psnId;
  if (!profile?.ea_username) {
    if (xboxGamertag) { base.ea_username = xboxGamertag; base.ea_platform = "xbsx"; }
    else if (psnId) { base.ea_username = psnId; base.ea_platform = "ps5"; }
  }
  await admin.from("profiles").delete().eq("auth_user_id", userId).is("discord_user_id", null);
  const { error: pErr } = profile
    ? await admin.from("profiles").update(base).eq("id", profile.id)
    : await admin.from("profiles").insert(base);
  if (pErr) console.error("profile upsert failed", pErr.message);

  const { data: gen, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: email! });
  if (genErr || !gen?.properties?.hashed_token) throw genErr ?? new Error("No token");
  return json({ token_hash: gen.properties.hashed_token });
}

// Workers can't fetch a bare IP (Cloudflare error 1003), so http://1.2.3.4:8880 becomes http://1.2.3.4.sslip.io:8880.
function originUrl(origin: string): string {
  return origin.replace(/\/$/, "").replace(/^(https?:\/\/)(\d{1,3}(?:\.\d{1,3}){3})(?=[:/]|$)/, "$1$2.sslip.io");
}

// The bot's answer to "does this player lead a club?" (gafferbot-mcp, authenticated as the backend)
async function botLeaderCheck(env: Env, discordUserId: string): Promise<boolean> {
  if (!env.FUNCTIONS_ORIGIN || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const res = await fetch(`${originUrl(env.FUNCTIONS_ORIGIN)}/functions/v1/gafferbot-mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "x-gafferbot-leader-check": discordUserId },
    body: "{}",
  });
  if (!res.ok) return false;
  const body = (await res.json().catch(() => null)) as { leader?: boolean } | null;
  return body?.leader === true;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // Sign-in for AI apps on /mcp (OAuth with Discord), see mcp-oauth.ts.
    if (url.pathname.startsWith("/oauth/") || url.pathname.startsWith("/.well-known/oauth-") || url.pathname === "/auth/callback") {
      try {
        const db = () => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
        const res = await handleOAuth(req, url, { ...env, leaderCheck: (id: string) => botLeaderCheck(env, id) }, db);
        if (res) return res;
      } catch (e) {
        console.error("mcp oauth error", e);
        return json({ error: "server_error" }, 500);
      }
    }
    if (url.pathname === "/api/auth/discord") {
      try { return await discordAuth(req, env); }
      catch (e) { console.error("auth-discord error", e); return json({ error: "Discord sign-in failed" }, 500); }
    }
    // Backend functions run inside the bot on our own server (FUNCTIONS_ORIGIN, e.g. http://host.sslip.io:8880).
    // /mcp is the GafferBot MCP server for AI assistants (the gafferbot-mcp function).
    const isMcp = url.pathname === "/mcp";
    if (isMcp || url.pathname.startsWith("/api/functions/v1/")) {
      if (!env.FUNCTIONS_ORIGIN) return json({ error: "Functions server is not configured" }, 503);
      const path = isMcp ? "/functions/v1/gafferbot-mcp" : url.pathname.slice(4);
      const target = originUrl(env.FUNCTIONS_ORIGIN) + path + url.search;
      const headers = new Headers(req.headers);
      headers.delete("x-bot-secret");
      return fetch(target, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body });
    }
    // Remote maintenance: the Lovable agent runs whitelisted ops on our server.
    // Auth is enforced by the ops server itself via the x-ops-secret header, which is
    // forwarded untouched (never logged here).
    if (url.pathname.startsWith("/api/ops/")) {
      if (!env.OPS_ORIGIN) return json({ error: "Ops server is not configured" }, 503);
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const target = originUrl(env.OPS_ORIGIN) + url.pathname.slice("/api/ops".length) + url.search;
      return fetch(target, { method: "POST", headers: req.headers, body: req.body });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(req);
  },
};
