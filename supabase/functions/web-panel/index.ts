// The web app's control room: runs the same /manager and /me panel actions as the Discord bot,
// as the signed-in user's own Discord account, through the bot process (public/spotbot/web-panels.cjs).
//
// POST { op: "context", guild_id }                         -> areas, actions and form fields, channels, roles
// POST { op: "members", guild_id, query }                  -> server members for player pickers
// POST { op: "choices", guild_id, action_id, field, focused, channel_id } -> autocomplete suggestions
// POST { op: "run", guild_id, action_id, values, channel_id }            -> replies (and any form to fill in)
// POST { op: "click", guild_id, message_id, custom_id, values }          -> a button or menu on a reply
// POST { op: "submit", guild_id, run_id, values }          -> answers to a form a reply opened
// POST { op: "poll", guild_id, run_id }                    -> the latest state of a slow action
//
// Callers: a signed-in web user (JWT). They always act as their own verified Discord account and need
// access to the server (requireGuildAccess); the bot then applies the same checks as in Discord.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, requireGuildAccess, resolveDiscordActor } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Bridge = { handle: (op: string, args: Record<string, unknown>) => Promise<unknown> };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();
  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const guildId = String(body?.guild_id || "");

  const actor = await resolveDiscordActor(req, admin, null);
  if (actor instanceof Response) return actor;
  if (!actor.discordUserId) return json({ error: "Sign in with Discord to use the control room" }, 403);
  const denied = await requireGuildAccess(req, admin, guildId, "member");
  if (denied) return denied;

  // Only the self-hosted bot process has the panels; elsewhere (cloud previews) there is nothing to call.
  const bridge = (globalThis as unknown as { __gafferbotWebPanels?: Bridge }).__gafferbotWebPanels;
  if (!bridge) return json({ error: "The control room runs on the GafferBot server, which isn't reachable from here." }, 503);

  try {
    const result = await bridge.handle(String(body.op || ""), {
      guildId,
      userId: actor.discordUserId,
      actionId: body.action_id,
      values: body.values && typeof body.values === "object" ? body.values : {},
      channelId: body.channel_id || null,
      field: body.field,
      focused: body.focused,
      query: body.query,
      messageId: body.message_id,
      customId: body.custom_id,
      runId: body.run_id,
    });
    return json(result);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status) return json({ error: e.message }, e.status);
    console.error("[web-panel] failed:", e.message);
    return json({ error: "GafferBot could not do that right now. Please try again." }, 500);
  }
});
