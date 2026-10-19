// GafferBot MCP server: lets AI assistants (Claude, ChatGPT, Cursor…) read a player's clubs, stats,
// events and team sheets, and with manage access run their Discord panel actions. Served at
// https://gafferbot.app/mcp by the Worker. Callers act as one Discord player, signed in by:
//   - OAuth (the Worker's /oauth/*, Discord sign-in): Bearer header, clubs:read, plus clubs:manage for club admins
//   - a personal token from Discord (/me → AI Assistant): read only, header or ?key=
//   - a signed-in web session (JWT): read only
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, guildAccessLevel, identifyCaller, isBotOwner, isDiscordClubLeader, safeEqual } from "../_shared/auth.ts";
import { isClubAdmin, looksLikeToken, resolveToken, SCOPE_MANAGE, SCOPE_READ } from "../_shared/mcp-tokens.ts";
import { handleBody } from "./protocol.ts";
import { Ctx, PanelBridge, TOOLS, visibleTo } from "./tools.ts";
import { MANAGE_TOOLS } from "./manage.ts";
import { MODERATION_TOOLS } from "./moderation.ts";
import { LINEUP_TOOLS } from "./lineups.ts";
import { allowCall, MAX_BATCH } from "./limits.ts";

const SITE = (Deno.env.get("DASHBOARD_URL") || "https://gafferbot.app").replace(/\/+$/, "");
const ALL_TOOLS = [...TOOLS, ...LINEUP_TOOLS, ...MANAGE_TOOLS, ...MODERATION_TOOLS];

type Caller = { discordUserId: string; tokenId: string | null; scopes: string[] };

// Manage access is for club admins only. Checked on every request (not just at sign-in) so a player who
// stops being an admin loses it; cached for a few minutes because the Discord check costs API calls.
const ADMIN_CACHE_MS = 5 * 60 * 1000;
const adminCache = new Map<string, { admin: boolean; at: number }>();
// deno-lint-ignore no-explicit-any
async function clubAdmin(admin: any, discordUserId: string): Promise<boolean> {
  const hit = adminCache.get(discordUserId);
  if (hit && Date.now() - hit.at < ADMIN_CACHE_MS) return hit.admin;
  const result = isBotOwner(discordUserId) || await isClubAdmin(admin, discordUserId, async (ids) =>
    (await Promise.all(ids.slice(0, 100).map((g) => isDiscordClubLeader(g, discordUserId)))).some(Boolean));
  if (adminCache.size > 5000) adminCache.clear();
  adminCache.set(discordUserId, { admin: result, at: Date.now() });
  return result;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

// deno-lint-ignore no-explicit-any
async function callerFor(req: Request, admin: any): Promise<Caller | null> {
  const header = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  // Some AI clients can only take a URL, so a personal token may also come as ?key=. A URL ends up in
  // logs and history, so a token sent that way can only ever read.
  const token = header || new URL(req.url).searchParams.get("key") || "";
  if (!token) return null;
  if (looksLikeToken(token)) {
    const t = await resolveToken(admin, token);
    if (!t) return null;
    const manage = t.oauth && !!header && t.scopes.includes(SCOPE_MANAGE) && await clubAdmin(admin, t.discordUserId);
    return { discordUserId: t.discordUserId, tokenId: t.id, scopes: manage ? [SCOPE_READ, SCOPE_MANAGE] : [SCOPE_READ] };
  }
  const caller = await identifyCaller(new Request(req.url, { headers: { authorization: `Bearer ${token}` } }), admin);
  if (caller?.kind !== "user") return null;
  const { data: link } = await admin.from("user_discord_links").select("discord_user_id")
    .eq("auth_user_id", caller.userId).eq("verified", true).maybeSingle();
  return link?.discord_user_id ? { discordUserId: link.discord_user_id as string, tokenId: null, scopes: [SCOPE_READ] } : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Stateless server: no server-initiated stream to open with GET.
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST, OPTIONS" });

  try {
    const admin = createAdminClient();
    // The Worker's AI sign-in asks whether a player leads a club before offering manage access
    const leaderCheck = req.headers.get("x-gafferbot-leader-check");
    if (leaderCheck) {
      // The Worker proves itself with MCP_LEADER_CHECK_SECRET (or, until that is set, as the bot).
      const checkSecret = Deno.env.get("MCP_LEADER_CHECK_SECRET") ?? "";
      const given = req.headers.get("x-leader-check-secret") ?? "";
      const trusted = (checkSecret.length >= 24 && safeEqual(given, checkSecret)) ||
        (await identifyCaller(req, admin))?.kind === "bot";
      if (!trusted || !/^\d{17,20}$/.test(leaderCheck)) return json({ error: "Forbidden" }, 403);
      return json({ leader: await clubAdmin(admin, leaderCheck) });
    }
    const caller = await callerFor(req, admin);
    if (!caller) {
      // Points AI apps at the OAuth sign-in (MCP authorization spec), so adding the URL is all it takes.
      return json(
        { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Connect with Discord sign-in, or use a token from /me → AI Assistant as a Bearer token." } },
        401,
        { "WWW-Authenticate": `Bearer realm="GafferBot", resource_metadata="${SITE}/.well-known/oauth-protected-resource"` },
      );
    }
    const { discordUserId } = caller;
    if (!allowCall(caller.tokenId || discordUserId)) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests. Wait a minute and try again." } }, 429, { "Retry-After": "60" });
    }

    let body: unknown;
    try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
    // A batch is several calls: cap its size and count every message against the per-minute limit.
    if (Array.isArray(body)) {
      if (body.length > MAX_BATCH) {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Send at most ${MAX_BATCH} messages per batch.` } }, 400);
      }
      for (let i = 1; i < body.length; i++) {
        if (!allowCall(caller.tokenId || discordUserId)) {
          return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests. Wait a minute and try again." } }, 429, { "Retry-After": "60" });
        }
      }
    }

    const levels = new Map<string, Promise<"leader" | "member" | null>>();
    const manage = caller.scopes.includes(SCOPE_MANAGE);
    const ctx: Ctx = {
      db: admin,
      discordUserId,
      access: (guildId) => {
        if (!levels.has(guildId)) levels.set(guildId, guildAccessLevel(admin, guildId, discordUserId));
        return levels.get(guildId)!;
      },
      tokenId: caller.tokenId,
      // The Control Room bridge exists only inside the self-hosted bot process.
      panels: manage ? ((globalThis as unknown as { __gafferbotWebPanels?: PanelBridge }).__gafferbotWebPanels ?? null) : null,
      moderation: manage ? ((globalThis as unknown as { __gafferbotModeration?: PanelBridge }).__gafferbotModeration ?? null) : null,
      lineups: (globalThis as unknown as { __gafferbotLineups?: PanelBridge }).__gafferbotLineups ?? null,
    };
    // Manage tools need a clubs:manage grant; leader tools are also hidden unless the player leads a club.
    const tools = ALL_TOOLS.filter((t) => !t.scope || caller.scopes.includes(t.scope));
    const reply = await handleBody(body, tools, ctx, visibleTo(ctx));
    return reply === null ? new Response(null, { status: 202, headers: corsHeaders }) : json(reply);
  } catch (err) {
    console.error("[gafferbot-mcp] error:", err);
    return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, 500);
  }
});
