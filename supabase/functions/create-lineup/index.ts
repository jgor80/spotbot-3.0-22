import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateLineupRequest {
  guild_id: string;
  created_by_discord_id: string;
  name?: string;
  formation: string; // e.g., "4-3-3", "4-4-2", "3-5-2"
  event_id?: string;
  team_id?: string;
  slots: {
    discord_user_id: string;
    position: string;
    slot_index: number;
    is_substitute?: boolean;
  }[];
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
      created_by_discord_id,
      name,
      formation,
      event_id,
      team_id,
      slots,
    }: CreateLineupRequest = await req.json();

    console.log(`[create-lineup] ${created_by_discord_id} creating ${formation} lineup with ${slots.length} players`);

    // Generate share code
    const shareCode = generateShareCode();

    // Calculate team average rating
    const playerIds = slots.filter(s => !s.is_substitute).map(s => s.discord_user_id);
    const { data: players } = await supabase
      .from("player_summary")
      .select("discord_user_id, overall_rating")
      .eq("guild_id", guild_id)
      .in("discord_user_id", playerIds);

    const playerRatings = new Map((players || []).map(p => [p.discord_user_id, p.overall_rating || 50]));
    const avgRating = playerIds.length > 0
      ? playerIds.reduce((sum, id) => sum + (playerRatings.get(id) || 50), 0) / playerIds.length
      : 50;

    // Create the lineup
    const { data: lineup, error: lineupError } = await supabase
      .from("lineups")
      .insert({
        guild_id,
        event_id,
        team_id,
        name: name || `${formation} Lineup`,
        formation,
        created_by_discord_id,
        share_code: shareCode,
        team_avg_rating: avgRating,
      })
      .select()
      .single();

    if (lineupError) {
      console.error("[create-lineup] Error:", lineupError);
      throw lineupError;
    }

    // Insert slots
    const slotInserts = slots.map(slot => ({
      lineup_id: lineup.id,
      discord_user_id: slot.discord_user_id,
      position: slot.position,
      slot_index: slot.slot_index,
      is_substitute: slot.is_substitute || false,
    }));

    await supabase.from("lineup_slots").insert(slotInserts);

    // Get full player details for response
    const allPlayerIds = slots.map(s => s.discord_user_id);
    const { data: playerDetails } = await supabase
      .from("player_summary")
      .select("*")
      .eq("guild_id", guild_id)
      .in("discord_user_id", allPlayerIds);

    const playerMap = new Map((playerDetails || []).map(p => [p.discord_user_id, p]));

    const enrichedSlots = slots.map(slot => ({
      ...slot,
      player: playerMap.get(slot.discord_user_id) || { discord_user_id: slot.discord_user_id, overall_rating: 50 },
    }));

    console.log(`[create-lineup] Lineup ${lineup.id} created with share code ${shareCode}`);

    return new Response(
      JSON.stringify({
        success: true,
        lineup_id: lineup.id,
        share_code: shareCode,
        share_url: `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '')}/lineup/${shareCode}`,
        formation,
        team_avg_rating: Math.round(avgRating * 10) / 10,
        slots: enrichedSlots,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[create-lineup] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateShareCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
