import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateAccountRequest {
  guild_id: string;
  discord_user_id: string;
  discord_username: string;
  ea_username: string;
  ea_platform?: string;
}

// Generate a random password
function generatePassword(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
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

    const { 
      guild_id, 
      discord_user_id, 
      discord_username,
      ea_username, 
      ea_platform = "ps5" 
    }: CreateAccountRequest = await req.json();

    if (!guild_id || !discord_user_id || !ea_username || !discord_username) {
      return new Response(
        JSON.stringify({ success: false, error: "guild_id, discord_user_id, discord_username, and ea_username are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate discord_user_id is a valid Discord snowflake
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(discord_user_id)) {
      console.error(`[create-discord-account] Invalid discord_user_id: ${discord_user_id}`);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid discord_user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[create-discord-account] Creating account for Discord ${discord_user_id} (${discord_username})`);

    // Check if Discord user already has a linked website account
    const { data: existingLink } = await supabase
      .from('user_discord_links')
      .select('auth_user_id')
      .eq('discord_user_id', discord_user_id)
      .maybeSingle();

    let authUserId: string;
    let password: string | null = null;
    let accountCreated = false;

    if (existingLink) {
      console.log(`[create-discord-account] Discord already linked to auth user ${existingLink.auth_user_id}`);
      authUserId = existingLink.auth_user_id;
    } else {
      // Create a new Supabase auth user
      // Use discord username as email base (sanitized)
      const sanitizedUsername = discord_username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `${sanitizedUsername}_${discord_user_id}@spotbot.local`;
      password = generatePassword(16);

      console.log(`[create-discord-account] Creating auth user with email: ${email}`);

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm
        user_metadata: {
          discord_user_id,
          discord_username,
        }
      });

      if (authError) {
        console.error(`[create-discord-account] Auth user creation failed:`, authError);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to create account: ${authError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      authUserId = authData.user.id;
      accountCreated = true;
      console.log(`[create-discord-account] Created auth user ${authUserId}`);

      // Create the discord link
      const { error: linkError } = await supabase
        .from('user_discord_links')
        .insert({
          auth_user_id: authUserId,
          discord_user_id,
          verified: true, // Auto-verified since they're linking via Discord
        });

      if (linkError) {
        console.error(`[create-discord-account] Discord link failed:`, linkError);
        // Clean up the auth user if link failed
        await supabase.auth.admin.deleteUser(authUserId);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to link Discord: ${linkError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[create-discord-account] Discord link created`);
    }

    // Now handle the EA account linking (same logic as link-ea-account)
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
      await supabase
        .from('profiles')
        .update({
          ea_username,
          ea_platform,
          discord_username,
          updated_at: new Date().toISOString()
        })
        .eq('discord_user_id', discord_user_id);
    } else {
      // Create new profile for real Discord user
      await supabase
        .from('profiles')
        .insert({
          discord_user_id,
          ea_username,
          ea_platform,
          discord_username
        });
    }

    // If temp profile exists, migrate all related data
    if (tempProfile) {
      console.log(`[create-discord-account] Migrating data from temp profile ${tempDiscordId}`);

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
        const { data: existingRating } = await supabase
          .from('player_ratings')
          .select('id')
          .eq('discord_user_id', discord_user_id)
          .eq('guild_id', guild_id)
          .maybeSingle();

        if (!existingRating) {
          await supabase
            .from('player_ratings')
            .update({ discord_user_id })
            .eq('id', tempRating.id);
        } else {
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

      console.log(`[create-discord-account] Deleted temp profile ${tempDiscordId}`);
    }

    // Trigger rating recalculation
    try {
      await supabase.functions.invoke('calculate-ratings', {
        body: { guild_id, discord_user_ids: [discord_user_id] }
      });
    } catch (calcError) {
      console.log(`[create-discord-account] Rating calc skipped:`, calcError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        account_created: accountCreated,
        password: password, // Only returned if new account was created
        message: accountCreated 
          ? `Account created and EA linked for ${discord_username}` 
          : `EA account linked for existing user`,
        migrated_temp_profile: !!tempProfile
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[create-discord-account] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
