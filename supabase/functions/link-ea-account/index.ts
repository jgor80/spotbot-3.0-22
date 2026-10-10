import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasGuildRole, resolveDiscordActor } from "../_shared/auth.ts";

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
    if (actor.discordUserId !== discord_user_id) {
      const { data: canManage } = await hasGuildRole(supabase, {
        _guild_id: guild_id,
        _discord_user_id: actor.discordUserId,
        _roles: ["admin", "moderator", "manager", "captain"],
      });
      if (!canManage) {
        return new Response(
          JSON.stringify({ success: false, error: "You can only link your own EA account" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[link-ea-account] Linking Discord ${discord_user_id} to EA ${ea_username}`);

    // Check if there's a temp profile with this EA username
    const tempDiscordId = `ea_${ea_username.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    const { data: tempProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('discord_user_id', tempDiscordId)
      .maybeSingle();

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

    // If temp profile exists, migrate all related data to real Discord user
    if (tempProfile) {
      console.log(`[link-ea-account] Migrating data from temp profile ${tempDiscordId} to ${discord_user_id}`);

      // Migrate player_stats
      await supabase
        .from('player_stats')
        .update({ discord_user_id })
        .eq('discord_user_id', tempDiscordId)
        .eq('guild_id', guild_id);

      // Migrate player_ratings
      const { data: tempRating } = await supabase
        .from('player_ratings')
        .select('*')
        .eq('discord_user_id', tempDiscordId)
        .eq('guild_id', guild_id)
        .maybeSingle();

      if (tempRating) {
        // Check if real user already has ratings
        const { data: existingRating } = await supabase
          .from('player_ratings')
          .select('id')
          .eq('discord_user_id', discord_user_id)
          .eq('guild_id', guild_id)
          .maybeSingle();

        if (!existingRating) {
          // Move temp ratings to real user
          await supabase
            .from('player_ratings')
            .update({ discord_user_id })
            .eq('id', tempRating.id);
        } else {
          // Delete temp ratings (real user already has ratings)
          await supabase
            .from('player_ratings')
            .delete()
            .eq('id', tempRating.id);
        }
      }

      // Migrate player_summary
      const { data: tempSummary } = await supabase
        .from('player_summary')
        .select('*')
        .eq('discord_user_id', tempDiscordId)
        .eq('guild_id', guild_id)
        .maybeSingle();

      if (tempSummary) {
        const { data: existingSummary } = await supabase
          .from('player_summary')
          .select('id')
          .eq('discord_user_id', discord_user_id)
          .eq('guild_id', guild_id)
          .maybeSingle();

        if (!existingSummary) {
          await supabase
            .from('player_summary')
            .update({ discord_user_id })
            .eq('id', tempSummary.id);
        } else {
          await supabase
            .from('player_summary')
            .delete()
            .eq('id', tempSummary.id);
        }
      }

      // Migrate position_preferences
      await supabase
        .from('position_preferences')
        .update({ user_id: discord_user_id })
        .eq('user_id', tempDiscordId)
        .eq('guild_id', guild_id);

      // Delete temp profile
      await supabase
        .from('profiles')
        .delete()
        .eq('discord_user_id', tempDiscordId);

      console.log(`[link-ea-account] Deleted temp profile ${tempDiscordId}`);
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
        migrated_temp_profile: !!tempProfile
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
