// GafferBot MCP server: lets AI assistants (Claude, ChatGPT, Cursor…) read a player's clubs, stats,
// events and team sheets. Served at https://gafferbot.app/mcp by the Worker. Callers authenticate with
// a personal token from Discord (/me → AI Assistant) or a signed-in web session, and act as that player.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, guildAccessLevel, identifyCaller } from "../_shared/auth.ts";
import { looksLikeToken, resolveToken } from "../_shared/mcp-tokens.ts";
import { handleBody } from "./protocol.ts";
import { Ctx, TOOLS } from "./tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

// deno-lint-ignore no-explicit-any
async function discordUserFor(req: Request, admin: any): Promise<string | null> {
  const header = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  // Some AI clients can only take a URL, so the token may also come as ?key=.
  const token = header || new URL(req.url).searchParams.get("key") || "";
  if (!token) return null;
  if (looksLikeToken(token)) return (await resolveToken(admin, token))?.discordUserId ?? null;
  const caller = await identifyCaller(new Request(req.url, { headers: { authorization: `Bearer ${token}` } }), admin);
  if (caller?.kind !== "user") return null;
  const { data: link } = await admin.from("user_discord_links").select("discord_user_id")
    .eq("auth_user_id", caller.userId).eq("verified", true).maybeSingle();
  return (link?.discord_user_id as string) || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Stateless server: no server-initiated stream to open with GET.
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST, OPTIONS" });

  try {
    const admin = createAdminClient();
    const discordUserId = await discordUserFor(req, admin);
    if (!discordUserId) {
      return json(
        { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Get a token in Discord with /me → AI Assistant and send it as a Bearer token." } },
        401,
        { "WWW-Authenticate": 'Bearer realm="GafferBot"' },
      );
    }

    let body: unknown;
    try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

    const levels = new Map<string, Promise<"leader" | "member" | null>>();
    const ctx: Ctx = {
      db: admin,
      discordUserId,
      access: (guildId) => {
        if (!levels.has(guildId)) levels.set(guildId, guildAccessLevel(admin, guildId, discordUserId));
        return levels.get(guildId)!;
      },
    };
    const reply = await handleBody(body, TOOLS, ctx);
    return reply === null ? new Response(null, { status: 202, headers: corsHeaders }) : json(reply);
  } catch (err) {
    console.error("[gafferbot-mcp] error:", err);
    return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, 500);
  }
});
