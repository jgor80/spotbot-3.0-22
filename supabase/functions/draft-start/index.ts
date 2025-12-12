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
  team_a_vc_id?: string;
  team_b_vc_id?: string;
  min_games_for_captain?: number; // Minimum games to be eligible as captain
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

    const { 
      guild_id, 
      voice_channel_id, 
      player_discord_ids,
      team_a_vc_id,
      team_b_vc_id,
      min_games_for_captain = 5 // Default: need at least 5 games to be captain
    }: DraftStartRequest = body;

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

    // Fetch player ratings to determine captain eligibility
    const { data: playerRatings } = await supabase
      .from("player_ratings")
      .select("discord_user_id, games_played, overall_rating")
      .eq("guild_id", guild_id)
      .in("discord_user_id", player_discord_ids);

    const ratingsMap = new Map(
      (playerRatings || []).map(p => [p.discord_user_id, p])
    );

    // Filter for captain-eligible players (those with enough games)
    const eligibleCaptains = player_discord_ids.filter(id => {
      const rating = ratingsMap.get(id);
      return rating && rating.games_played >= min_games_for_captain;
    });

    console.log(`[draft-start] ${eligibleCaptains.length} players eligible as captains (min ${min_games_for_captain} games)`);

    // If not enough eligible captains, fall back to all players but prioritize experienced ones
    let captainPool = eligibleCaptains.length >= 2 
      ? eligibleCaptains 
      : player_discord_ids;

    // Sort captain pool by games played (most experienced first) then add some randomness
    captainPool = [...captainPool].sort((a, b) => {
      const aGames = ratingsMap.get(a)?.games_played || 0;
      const bGames = ratingsMap.get(b)?.games_played || 0;
      // Primary sort by games, secondary random factor for variety
      if (aGames !== bGames) return bGames - aGames;
      return Math.random() - 0.5;
    });

    // Select captains: if we have enough eligible, pick from top half randomly
    // Otherwise just pick from the sorted pool
    let captainA: string;
    let captainB: string;

    if (eligibleCaptains.length >= 4) {
      // Pick randomly from top half of eligible players
      const topHalf = captainPool.slice(0, Math.ceil(captainPool.length / 2));
      const shuffledTop = [...topHalf].sort(() => Math.random() - 0.5);
      captainA = shuffledTop[0];
      captainB = shuffledTop[1];
    } else if (eligibleCaptains.length >= 2) {
      // Use the two most experienced eligible players with some randomness
      const shuffled = [...eligibleCaptains].sort(() => Math.random() - 0.5);
      captainA = shuffled[0];
      captainB = shuffled[1];
    } else {
      // Fallback: random selection but prefer experienced players
      // Weight by games played
      const weighted = player_discord_ids.map(id => ({
        id,
        weight: (ratingsMap.get(id)?.games_played || 0) + 1
      }));
      
      const totalWeight = weighted.reduce((sum, p) => sum + p.weight, 0);
      
      // Weighted random selection for first captain
      let rand = Math.random() * totalWeight;
      let captainAIndex = 0;
      for (let i = 0; i < weighted.length; i++) {
        rand -= weighted[i].weight;
        if (rand <= 0) {
          captainAIndex = i;
          break;
        }
      }
      captainA = weighted[captainAIndex].id;
      
      // Remove first captain and select second
      const remaining = weighted.filter(p => p.id !== captainA);
      const remainingWeight = remaining.reduce((sum, p) => sum + p.weight, 0);
      rand = Math.random() * remainingWeight;
      let captainBIndex = 0;
      for (let i = 0; i < remaining.length; i++) {
        rand -= remaining[i].weight;
        if (rand <= 0) {
          captainBIndex = i;
          break;
        }
      }
      captainB = remaining[captainBIndex].id;
    }

    const availablePlayers = player_discord_ids.filter(id => id !== captainA && id !== captainB);

    console.log(`[draft-start] Selected captains: ${captainA} vs ${captainB}`);

    // Create the draft with optional team VCs
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
        team_a_vc_id: team_a_vc_id || null,
        team_b_vc_id: team_b_vc_id || null,
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

    // Include captain eligibility info in response
    const captainAData = ratingsMap.get(captainA);
    const captainBData = ratingsMap.get(captainB);

    return new Response(
      JSON.stringify({
        success: true,
        draft_id: draft.id,
        captain_a: {
          ...(playerData.get(captainA) || { overall_rating: 50 }),
          discord_user_id: captainA,
          games_played: captainAData?.games_played || 0,
        },
        captain_b: {
          ...(playerData.get(captainB) || { overall_rating: 50 }),
          discord_user_id: captainB,
          games_played: captainBData?.games_played || 0,
        },
        available_players: availableWithRatings,
        current_picker: "a",
        pick_number: 1,
        team_a_vc_id: team_a_vc_id || null,
        team_b_vc_id: team_b_vc_id || null,
        captain_selection_info: {
          eligible_captains_count: eligibleCaptains.length,
          min_games_required: min_games_for_captain,
          used_fallback: eligibleCaptains.length < 2,
        },
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
