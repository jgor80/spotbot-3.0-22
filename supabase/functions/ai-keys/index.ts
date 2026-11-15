// Your own AI key for images, and your server's (see _shared/ai-provider-keys.ts).
// POST { action: "status" | "save" | "remove", scope: "me" | "server", guild_id?, key? }
//  - "me": a signed-in web user manages the key on their own verified Discord account.
//  - "server": club leaders (the bot's leader rule) and GafferBot web admins manage the server's key; any member
//    can see whether the server has one, but never its hint or who added it.
// No action ever returns a saved key, only its last 4 characters.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, identifyCaller, requireGuildAccess, resolveDiscordActor, throttleWebUser } from "../_shared/auth.ts";
import { KeyError, keyStatus, ownKeysEnabled, removeKey, saveKey } from "../_shared/ai-provider-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (k: string) => Deno.env.get(k);
const snowflake = (id: unknown): id is string => typeof id === "string" && /^\d{17,20}$/.test(id);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");
    if (!["status", "save", "remove"].includes(action)) return json({ error: "action must be status, save or remove" }, 400);
    const actor = await resolveDiscordActor(req, admin, typeof body.discord_user_id === "string" ? body.discord_user_id : null);
    if (actor instanceof Response) return actor;
    const userId = actor.discordUserId;
    if (!snowflake(userId)) return json({ error: "discord_user_id is required" }, 400);
    // Keys are only ever typed on the website, never into Discord
    if (action !== "status" && (await identifyCaller(req, admin))?.kind === "bot") return json({ error: "Save AI keys on gafferbot.app." }, 403);
    // Saving checks the key with OpenAI: a few tries an hour is plenty, and stops anyone using us to test keys
    if (action === "save") {
      const limited = await throttleWebUser(req, admin, "ai-keys-save", 8, 60 * 60 * 1000);
      if (limited) return limited;
    }
    const enabled = ownKeysEnabled(env);

    if (body.scope === "server") {
      const guildId = body.guild_id;
      if (!snowflake(guildId)) return json({ error: "guild_id is required" }, 400);
      const leaderBlock = await requireGuildAccess(req, admin, guildId, "leader");
      if (action !== "status" && leaderBlock) return json({ error: "Only club leaders can change the server's AI key." }, 403);
      if (action === "status") {
        const memberBlock = leaderBlock ? await requireGuildAccess(req, admin, guildId, "member") : null;
        if (memberBlock) return memberBlock;
        const s = await keyStatus(admin, env, "server", guildId);
        // Members only learn that the server pays with its own key; leaders see the hint and any problem
        return json({ enabled, can_manage: !leaderBlock, key: leaderBlock ? { saved: s.saved } : s });
      }
      const s = action === "save" ? await saveKey(admin, env, "server", guildId, body.key, userId) : await removeKey(admin, env, "server", guildId);
      console.log(`[ai-keys] server ${guildId} key ${action === "save" ? "saved" : "removed"} by ${userId}`);
      return json({ enabled, can_manage: true, key: s });
    }

    if (action === "status") return json({ enabled, key: await keyStatus(admin, env, "user", userId) });
    const s = action === "save" ? await saveKey(admin, env, "user", userId, body.key, userId) : await removeKey(admin, env, "user", userId);
    return json({ enabled, key: s });
  } catch (err) {
    if (err instanceof KeyError) return json({ error: err.message }, err.status);
    console.error("[ai-keys] error:", err instanceof Error ? err.message : err);
    return json({ error: "Internal error" }, 500);
  }
});
