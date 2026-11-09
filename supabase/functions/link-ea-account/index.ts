import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guildAccessLevel, identifyCaller, requireGuildAccess, resolveDiscordActor } from "../_shared/auth.ts";
import { isPlaceholderId, mergePlaceholderInto, placeholderIdsForGamertag, profilesForGamertag } from "../_shared/ea-profiles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinkRequest {
  guild_id: string;
  discord_user_id: string;
  ea_username: string;
  ea_platform?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { guild_id, discord_user_id, ea_username, ea_platform = "ps5" }: LinkRequest = await req.json();

    if (!guild_id || !discord_user_id || !ea_username) {
      return new Response(
        JSON.stringify({ success: false, error: "guild_id, discord_user_id, and ea_username are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate discord_user_id is a valid Discord snowflake (numeric, 17-19 digits)
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(discord_user_id)) {
      console.error(`[link-ea-account] Invalid discord_user_id: ${discord_user_id} - must be a numeric Discord snowflake`);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid discord_user_id - must be a valid Discord user ID (17-19 digit number)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // verify_jwt is off: only the bot, or a signed-in web user linking themselves or managing this server.
    const actor = await resolveDiscordActor(req, supabase, discord_user_id);
    if (actor instanceof Response) return actor;
    const deny = (status: number, error: string) =>
      new Response(JSON.stringify({ success: false, error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (actor.discordUserId !== discord_user_id) {
      // Profiles are global, so changing someone else's gamertag needs leader rights in this server
      // (GafferBot role or Discord leader, same rule as everywhere else) and the player must belong to it.
      // Otherwise anyone could add the bot to a server of their own and rewrite any player's identity.
      const denied = await requireGuildAccess(req, supabase, guild_id, "leader");
      if (denied) return deny(403, "You can only link your own EA account");
      if (!(await guildAccessLevel(supabase, guild_id, discord_user_id))) {
        return deny(403, "That player isn't a member of this server");
      }
    } else if ((await identifyCaller(req, supabase))?.kind !== "bot" && !(await guildAccessLevel(supabase, guild_id, discord_user_id))) {
      // The bot only links members it sees in the server. Claiming a gamertag merges its match history into your account, which then counts as access to
      // every server it played in. Only members of this server can claim one here.
      return deny(403, "Join this Discord server first, then link your EA account from it.");
    }

    // Never take a gamertag that another real member already holds (a manager can move it with /forcelink in Discord)
    const holders = await profilesForGamertag(supabase, ea_username);
    if (holders.some((p) => !isPlaceholderId(p.discord_user_id) && p.discord_user_id !== discord_user_id)) {
      return deny(409, "That gamertag is already linked to another member. A manager can move it with /forcelink in Discord.");
    }

    console.log(`[link-ea-account] Linking Discord ${discord_user_id} to EA ${ea_username}`);

    // Every placeholder for this gamertag, found by name: older code spelled the ea_ ID several ways
    const tempIds = await placeholderIdsForGamertag(supabase, ea_username);

    // Check if the real Discord user already has a profile
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('discord_user_id', discord_user_id)
      .maybeSingle();

    if (existingProfile) {
      // Update existing profile with EA info
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          ea_username,
          ea_platform,
          updated_at: new Date().toISOString()
        })
        .eq('discord_user_id', discord_user_id);

      if (updateError) {
        console.error(`[link-ea-account] Update error:`, updateError);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new profile for real Discord user
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          discord_user_id,
          ea_username,
          ea_platform
        });

      if (insertError) {
        console.error(`[link-ea-account] Insert error:`, insertError);
        return new Response(
          JSON.stringify({ success: false, error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Move everything each placeholder holds, in every server; rows the player already has are kept
    for (const tempDiscordId of tempIds) {
      const res = await mergePlaceholderInto(supabase, tempDiscordId, discord_user_id);
      if (!res.ok) console.error(`[link-ea-account] Couldn't move ${tempDiscordId}:`, res.error);
    }

    // Trigger rating recalculation
    try {
      await supabase.functions.invoke('calculate-ratings', {
        body: { guild_id, discord_user_ids: [discord_user_id] }
      });
    } catch (calcError) {
      console.log(`[link-ea-account] Rating calc skipped:`, calcError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Linked Discord user ${discord_user_id} to EA account ${ea_username}`,
        migrated_temp_profile: tempIds.length > 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[link-ea-account] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
