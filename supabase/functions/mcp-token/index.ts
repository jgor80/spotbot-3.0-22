// Creates, lists and revokes a player's tokens for the GafferBot MCP server (personal tokens and AI apps
// signed in with Discord), and shows the changes AI apps made for them (activity).
// The bot names the member it acts for (/me → AI Assistant); a web user always manages their own.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, resolveDiscordActor } from "../_shared/auth.ts";
import { createToken } from "../_shared/mcp-tokens.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const actor = await resolveDiscordActor(req, admin, typeof body.discord_user_id === "string" ? body.discord_user_id : null);
    if (actor instanceof Response) return actor;
    const userId = actor.discordUserId;
    if (!userId || !/^\d{17,20}$/.test(userId)) return json({ error: "discord_user_id is required" }, 400);

    if (body.action === "create") {
      const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : "AI assistant";
      const created = await createToken(admin, userId, label);
      return json(created, "error" in created ? 400 : 200);
    }
    if (body.action === "list") {
      const { data } = await admin
        .from("mcp_access_tokens")
        .select("id, label, token_hint, scopes, oauth_client_id, created_at, last_used_at")
        .eq("discord_user_id", userId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      return json({ tokens: data || [] });
    }
    if (body.action === "activity") {
      const { data } = await admin
        .from("mcp_action_log")
        .select("guild_id, tool, target, ok, error, created_at")
        .eq("discord_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      return json({ actions: data || [] });
    }
    if (body.action === "revoke") {
      let q = admin.from("mcp_access_tokens").update({ revoked_at: new Date().toISOString() })
        .eq("discord_user_id", userId).is("revoked_at", null);
      if (body.token_id) q = q.eq("id", String(body.token_id));
      const { data, error } = await q.select("id");
      if (error) return json({ error: "Could not revoke tokens" }, 500);
      return json({ revoked: (data || []).length });
    }
    return json({ error: "action must be create, list, activity or revoke" }, 400);
  } catch (err) {
    console.error("[mcp-token] error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
