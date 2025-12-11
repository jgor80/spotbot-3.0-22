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

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_FORMATIONS = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1", "5-3-2", "5-4-1", "3-4-3", "4-1-4-1", "4-5-1"];

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) {
    errors.push("guild_id must be a valid Discord ID");
  }
  if (!body.created_by_discord_id || !DISCORD_ID_REGEX.test(body.created_by_discord_id)) {
    errors.push("created_by_discord_id must be a valid Discord ID");
  }
  if (!body.formation || !VALID_FORMATIONS.includes(body.formation)) {
    errors.push(`formation must be one of: ${VALID_FORMATIONS.join(", ")}`);
  }
  if (body.event_id && !UUID_REGEX.test(body.event_id)) {
    errors.push("event_id must be a valid UUID");
  }
  if (body.team_id && !UUID_REGEX.test(body.team_id)) {
    errors.push("team_id must be a valid UUID");
  }
  if (body.name && (typeof body.name !== "string" || body.name.length > 200)) {
    errors.push("name must be a string with at most 200 characters");
  }
  if (!Array.isArray(body.slots) || body.slots.length === 0 || body.slots.length > 20) {
    errors.push("slots must be an array with 1-20 items");
  } else {
    for (let i = 0; i < body.slots.length; i++) {
      const slot = body.slots[i];
      if (!slot.discord_user_id || !DISCORD_ID_REGEX.test(slot.discord_user_id)) {
        errors.push(`slots[${i}].discord_user_id must be a valid Discord ID`);
        break;
      }
      if (!slot.position || typeof slot.position !== "string") {
        errors.push(`slots[${i}].position is required`);
        break;
      }
      if (typeof slot.slot_index !== "number" || slot.slot_index < 0 || slot.slot_index > 20) {
        errors.push(`slots[${i}].slot_index must be a number between 0 and 20`);
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
    // Verify the request is from the Discord bot (service role key)
    const authHeader = req.headers.get("authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      console.log("[create-lineup] Unauthorized: Missing or invalid service role key");
      return new Response(
        JSON.stringify({ error: "This operation requires bot authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey
    );

    const body = await req.json();
    
    // Validate input
    const errors = validateRequest(body);
    if (errors.length > 0) {
      console.log(`[create-lineup] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      guild_id,
      created_by_discord_id,
      name,
      formation,
      event_id,
      team_id,
      slots,
    }: CreateLineupRequest = body;

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
