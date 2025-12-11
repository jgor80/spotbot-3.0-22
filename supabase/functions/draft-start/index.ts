import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;

interface DraftStartRequest {
  guild_id: string;
  voice_channel_id: string;
  player_discord_ids: string[];
}

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) {
    errors.push("guild_id must be a valid Discord ID");
  }
  if (!body.voice_channel_id || !DISCORD_ID_REGEX.test(body.voice_channel_id)) {
    errors.push("voice_channel_id must be a valid Discord ID");
  }
  if (!Array.isArray(body.player_discord_ids)) {
    errors.push("player_discord_ids must be an array");
  } else if (body.player_discord_ids.length > 50) {
    errors.push("player_discord_ids must have at most 50 players");
  } else {
    for (let i = 0; i < body.player_discord_ids.length; i++) {
      if (!DISCORD_ID_REGEX.test(body.player_discord_ids[i])) {
        errors.push(`player_discord_ids[${i}] must be a valid Discord ID`);
        break;
      }
    }
  }
  
  return errors;
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

    const body = await req.json();
    
    // Validate input
    const errors = validateRequest(body);
    if (errors.length > 0) {
      console.log(`[draft-start] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { guild_id, voice_channel_id, player_discord_ids }: DraftStartRequest = body;

    console.log(`[draft-start] Starting draft for guild ${guild_id} with ${player_discord_ids.length} players`);

    // Validate we have enough players (need at least 4 for 2v2, ideally 22 for 11v11)
    if (player_discord_ids.length < 4) {
      return new Response(
        JSON.stringify({ error: "Need at least 4 players to start a draft" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure all players have profiles
    for (const discordId of player_discord_ids) {
      await supabase
        .from("profiles")
        .upsert({ discord_user_id: discordId }, { onConflict: "discord_user_id" });
    }

    // Randomly select two captains
    const shuffled = [...player_discord_ids].sort(() => Math.random() - 0.5);
    const captainA = shuffled[0];
    const captainB = shuffled[1];
    const availablePlayers = shuffled.slice(2);

    // Create the draft
    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .insert({
        guild_id,
        voice_channel_id,
        captain_a_discord_id: captainA,
        captain_b_discord_id: captainB,
        team_a_player_ids: [captainA],
        team_b_player_ids: [captainB],
        available_player_ids: availablePlayers,
        current_picker: "a",
        status: "picking",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (draftError) {
      console.error("[draft-start] Error creating draft:", draftError);
      throw draftError;
    }

    console.log(`[draft-start] Draft ${draft.id} created successfully`);

    // Fetch player summaries for display
    const { data: playerSummaries } = await supabase
      .from("player_summary")
      .select("discord_user_id, discord_username, overall_rating, current_streak, streak_type, top_achievements")
      .eq("guild_id", guild_id)
      .in("discord_user_id", player_discord_ids);

    // Create a map for easy lookup
    const playerData = new Map(
      (playerSummaries || []).map(p => [p.discord_user_id, p])
    );

    // Build response with player info
    const availableWithRatings = availablePlayers.map(id => ({
      ...(playerData.get(id) || { overall_rating: 50, current_streak: 0, streak_type: "neutral" }),
      discord_user_id: id,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        draft_id: draft.id,
        captain_a: {
          ...(playerData.get(captainA) || { overall_rating: 50 }),
          discord_user_id: captainA,
        },
        captain_b: {
          ...(playerData.get(captainB) || { overall_rating: 50 }),
          discord_user_id: captainB,
        },
        available_players: availableWithRatings,
        current_picker: "a",
        pick_number: 1,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[draft-start] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
