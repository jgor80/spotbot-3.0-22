import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetLineupRequest {
  lineup_id?: string;
  share_code?: string;
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

    const { lineup_id, share_code }: GetLineupRequest = await req.json();

    if (!lineup_id && !share_code) {
      return new Response(
        JSON.stringify({ error: "Either lineup_id or share_code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[get-lineup] Fetching lineup ${lineup_id || share_code}`);

    // Get lineup
    let query = supabase
      .from("lineups")
      .select("*, teams(name, tag), availability_events(title, scheduled_at)")
      .limit(1);

    if (lineup_id) {
      query = query.eq("id", lineup_id);
    } else {
      query = query.eq("share_code", share_code);
    }

    const { data: lineup, error: lineupError } = await query.single();

    if (lineupError || !lineup) {
      return new Response(
        JSON.stringify({ error: "Lineup not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get slots
    const { data: slots } = await supabase
      .from("lineup_slots")
      .select("*")
      .eq("lineup_id", lineup.id)
      .order("slot_index");

    // Get player details
    const playerIds = (slots || []).map(s => s.discord_user_id);
    const { data: players } = await supabase
      .from("player_summary")
      .select("*")
      .eq("guild_id", lineup.guild_id)
      .in("discord_user_id", playerIds);

    const playerMap = new Map((players || []).map(p => [p.discord_user_id, p]));

    // Get chemistry between players in lineup
    const starters = (slots || []).filter(s => !s.is_substitute).map(s => s.discord_user_id);
    const chemistryPairs: any[] = [];

    const { data: chemistry } = await supabase
      .from("player_chemistry")
      .select("*")
      .eq("guild_id", lineup.guild_id)
      .gte("games_together", 2);

    for (const chem of chemistry || []) {
      if (starters.includes(chem.player_a_discord_id) && starters.includes(chem.player_b_discord_id)) {
        chemistryPairs.push({
          player_a: chem.player_a_discord_id,
          player_b: chem.player_b_discord_id,
          win_rate: chem.win_rate,
          games_together: chem.games_together,
        });
      }
    }

    // Enrich slots with player data
    const enrichedSlots = (slots || []).map(slot => {
      const player = playerMap.get(slot.discord_user_id);
      return {
        ...slot,
        player: player ? {
          discord_user_id: player.discord_user_id,
          discord_username: player.discord_username,
          overall_rating: player.overall_rating,
          form_rating: player.form_rating,
          current_streak: player.current_streak,
          streak_type: player.streak_type,
          top_achievements: player.top_achievements,
          primary_position: player.primary_position,
          reliability_score: player.reliability_score,
          rating_tier: getRatingTier(player.overall_rating),
        } : { discord_user_id: slot.discord_user_id, overall_rating: 50 },
      };
    });

    const starterSlots = enrichedSlots.filter(s => !s.is_substitute);
    const substituteSlots = enrichedSlots.filter(s => s.is_substitute);

    return new Response(
      JSON.stringify({
        success: true,
        lineup: {
          id: lineup.id,
          name: lineup.name,
          formation: lineup.formation,
          share_code: lineup.share_code,
          team_avg_rating: lineup.team_avg_rating,
          win_probability: lineup.win_probability,
          created_at: lineup.created_at,
          team: lineup.teams,
          event: lineup.availability_events,
        },
        starters: starterSlots,
        substitutes: substituteSlots,
        chemistry_pairs: chemistryPairs,
        team_chemistry: chemistryPairs.length > 0
          ? Math.round(chemistryPairs.reduce((sum, c) => sum + c.win_rate, 0) / chemistryPairs.length * 10) / 10
          : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[get-lineup] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getRatingTier(rating: number): { name: string; icon: string; color: string } {
  if (rating >= 90) return { name: "Diamond", icon: "💎", color: "#b9f2ff" };
  if (rating >= 80) return { name: "Platinum", icon: "🏆", color: "#e5e4e2" };
  if (rating >= 70) return { name: "Gold", icon: "🥇", color: "#ffd700" };
  if (rating >= 60) return { name: "Silver", icon: "🥈", color: "#c0c0c0" };
  if (rating >= 50) return { name: "Bronze", icon: "🥉", color: "#cd7f32" };
  return { name: "Iron", icon: "⚙️", color: "#5a5a5a" };
}
