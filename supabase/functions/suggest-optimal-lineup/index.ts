import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Formation definitions: position -> slot indices
const FORMATIONS: Record<string, { positions: string[]; slots: number }> = {
  "4-3-3": {
    positions: ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
    slots: 11,
  },
  "4-4-2": {
    positions: ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
    slots: 11,
  },
  "3-5-2": {
    positions: ["GK", "CB", "CB", "CB", "LM", "CM", "CDM", "CM", "RM", "ST", "ST"],
    slots: 11,
  },
  "4-2-3-1": {
    positions: ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LAM", "CAM", "RAM", "ST"],
    slots: 11,
  },
  "5-3-2": {
    positions: ["GK", "LWB", "CB", "CB", "CB", "RWB", "CM", "CM", "CM", "ST", "ST"],
    slots: 11,
  },
};

// Position groups for flexible matching
const POSITION_GROUPS: Record<string, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CM", "CDM", "CAM", "LM", "RM", "LAM", "RAM"],
  ATT: ["ST", "LW", "RW", "CF"],
};

interface SuggestLineupRequest {
  guild_id: string;
  formation: string;
  available_player_ids: string[];
  prioritize?: "rating" | "form" | "chemistry" | "reliability";
}

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const VALID_PRIORITIES = ["rating", "form", "chemistry", "reliability"] as const;

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) {
    errors.push("guild_id must be a valid Discord ID");
  }
  if (!body.formation || !FORMATIONS[body.formation]) {
    errors.push(`formation must be one of: ${Object.keys(FORMATIONS).join(", ")}`);
  }
  if (!Array.isArray(body.available_player_ids) || body.available_player_ids.length === 0) {
    errors.push("available_player_ids must be a non-empty array");
  } else if (body.available_player_ids.length > 50) {
    errors.push("available_player_ids must have at most 50 items");
  } else {
    for (let i = 0; i < body.available_player_ids.length; i++) {
      if (!DISCORD_ID_REGEX.test(body.available_player_ids[i])) {
        errors.push(`available_player_ids[${i}] must be a valid Discord ID`);
        break;
      }
    }
  }
  if (body.prioritize && !VALID_PRIORITIES.includes(body.prioritize)) {
    errors.push(`prioritize must be one of: ${VALID_PRIORITIES.join(", ")}`);
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
      console.log("[suggest-lineup] Unauthorized: Missing or invalid service role key");
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
      console.log(`[suggest-lineup] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      guild_id,
      formation,
      available_player_ids,
      prioritize = "rating",
    }: SuggestLineupRequest = body;

    console.log(`[suggest-lineup] Suggesting ${formation} from ${available_player_ids.length} players, prioritizing ${prioritize}`);

    const formationDef = FORMATIONS[formation];
    if (!formationDef) {
      return new Response(
        JSON.stringify({ error: `Unknown formation: ${formation}. Available: ${Object.keys(FORMATIONS).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get player data
    const { data: players } = await supabase
      .from("player_summary")
      .select("*")
      .eq("guild_id", guild_id)
      .in("discord_user_id", available_player_ids);

    // Get position ratings for more precise placement
    const { data: positionRatings } = await supabase
      .from("player_position_ratings")
      .select("*")
      .eq("guild_id", guild_id)
      .in("discord_user_id", available_player_ids);

    // Get chemistry data
    const { data: chemistry } = await supabase
      .from("player_chemistry")
      .select("*")
      .eq("guild_id", guild_id)
      .gte("games_together", 2);

    // Build player lookup maps
    const playerMap = new Map((players || []).map(p => [p.discord_user_id, p]));
    const posRatingMap = new Map<string, Map<string, number>>();
    
    for (const pr of positionRatings || []) {
      if (!posRatingMap.has(pr.discord_user_id)) {
        posRatingMap.set(pr.discord_user_id, new Map());
      }
      posRatingMap.get(pr.discord_user_id)!.set(pr.position, pr.rating);
    }

    // Score function based on priority
    const getPlayerScore = (playerId: string, position: string): number => {
      const player = playerMap.get(playerId);
      if (!player) return 0;

      let score = 0;
      const posRatings = posRatingMap.get(playerId);
      const positionRating = posRatings?.get(position) || player.overall_rating || 50;

      switch (prioritize) {
        case "form":
          score = (player.form_rating || 50) * 0.6 + positionRating * 0.4;
          break;
        case "reliability":
          score = (player.reliability_score || 100) * 0.4 + positionRating * 0.6;
          break;
        case "chemistry":
          // Chemistry is handled in team optimization
          score = positionRating;
          break;
        default: // rating
          score = positionRating;
      }

      // Bonus for playing preferred position
      if (player.primary_position === position) {
        score += 5;
      }

      // Check position group compatibility
      const playerPrimaryGroup = Object.entries(POSITION_GROUPS).find(
        ([_, positions]) => positions.includes(player.primary_position || "")
      )?.[0];
      const targetGroup = Object.entries(POSITION_GROUPS).find(
        ([_, positions]) => positions.includes(position)
      )?.[0];

      if (playerPrimaryGroup === targetGroup) {
        score += 3; // Same position group bonus
      }

      return score;
    };

    // Greedy assignment algorithm
    const assignments: { position: string; slot_index: number; discord_user_id: string; score: number }[] = [];
    const assignedPlayers = new Set<string>();

    // Assign each position
    for (let i = 0; i < formationDef.positions.length; i++) {
      const position = formationDef.positions[i];
      
      // Find best unassigned player for this position
      let bestPlayer: string | null = null;
      let bestScore = -1;

      for (const playerId of available_player_ids) {
        if (assignedPlayers.has(playerId)) continue;

        const score = getPlayerScore(playerId, position);
        if (score > bestScore) {
          bestScore = score;
          bestPlayer = playerId;
        }
      }

      if (bestPlayer) {
        assignments.push({
          position,
          slot_index: i,
          discord_user_id: bestPlayer,
          score: bestScore,
        });
        assignedPlayers.add(bestPlayer);
      }
    }

    // Calculate team chemistry bonus
    let totalChemistry = 0;
    let chemPairs = 0;
    const assignedIds = assignments.map(a => a.discord_user_id);

    for (const chem of chemistry || []) {
      if (assignedIds.includes(chem.player_a_discord_id) && assignedIds.includes(chem.player_b_discord_id)) {
        totalChemistry += chem.win_rate;
        chemPairs++;
      }
    }

    const avgChemistry = chemPairs > 0 ? totalChemistry / chemPairs : 50;

    // Calculate team average rating
    const avgRating = assignments.length > 0
      ? assignments.reduce((sum, a) => sum + (playerMap.get(a.discord_user_id)?.overall_rating || 50), 0) / assignments.length
      : 50;

    // Remaining players as substitutes
    const substitutes = available_player_ids
      .filter(id => !assignedPlayers.has(id))
      .map(id => ({
        discord_user_id: id,
        player: playerMap.get(id) || { overall_rating: 50 },
      }))
      .sort((a, b) => (b.player.overall_rating || 0) - (a.player.overall_rating || 0))
      .slice(0, 5); // Top 5 subs

    // Enrich assignments with player data
    const enrichedAssignments = assignments.map(a => ({
      ...a,
      player: playerMap.get(a.discord_user_id) || { discord_user_id: a.discord_user_id, overall_rating: 50 },
    }));

    console.log(`[suggest-lineup] Suggested lineup with avg rating ${avgRating.toFixed(1)}, chemistry ${avgChemistry.toFixed(1)}`);

    return new Response(
      JSON.stringify({
        success: true,
        formation,
        priority: prioritize,
        team_avg_rating: Math.round(avgRating * 10) / 10,
        team_chemistry: Math.round(avgChemistry * 10) / 10,
        slots: enrichedAssignments,
        substitutes,
        positions_filled: assignments.length,
        positions_total: formationDef.slots,
        warnings: assignments.length < formationDef.slots
          ? [`Only ${assignments.length}/${formationDef.slots} positions filled`]
          : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[suggest-lineup] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
