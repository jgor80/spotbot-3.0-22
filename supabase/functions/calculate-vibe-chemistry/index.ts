import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_ID_REGEX = /^\d{17,19}$/;

interface CalculateVibeRequest {
  guild_id: string;
  player_ids?: string[]; // Optional: specific players to recalculate, or all if not provided
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
    const { guild_id, player_ids }: CalculateVibeRequest = body;

    if (!guild_id || !DISCORD_ID_REGEX.test(guild_id)) {
      return new Response(
        JSON.stringify({ error: "guild_id must be a valid Discord ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[vibe-chemistry] Calculating vibe chemistry for guild ${guild_id}`);

    // Get all peer evaluations with vibe data
    let query = supabase
      .from("peer_evaluations")
      .select("evaluator_discord_id, evaluated_discord_id, enjoyment, team_energy, play_again, created_at")
      .eq("guild_id", guild_id)
      .not("enjoyment", "is", null);

    if (player_ids && player_ids.length > 0) {
      query = query.or(`evaluator_discord_id.in.(${player_ids.join(",")}),evaluated_discord_id.in.(${player_ids.join(",")})`);
    }

    const { data: evaluations, error: evalError } = await query;

    if (evalError) {
      console.error("[vibe-chemistry] Error fetching evaluations:", evalError);
      throw evalError;
    }

    if (!evaluations || evaluations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No vibe evaluations to process", pairs_updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[vibe-chemistry] Processing ${evaluations.length} evaluations`);

    // Group evaluations by player pairs
    const pairMap = new Map<string, {
      evaluations: Array<{ enjoyment: number; team_energy: number; play_again: string; created_at: string }>;
    }>();

    for (const evaluation of evaluations) {
      // Create consistent pair key (sorted IDs)
      const [playerA, playerB] = [evaluation.evaluator_discord_id, evaluation.evaluated_discord_id].sort();
      const pairKey = `${playerA}|${playerB}`;

      if (!pairMap.has(pairKey)) {
        pairMap.set(pairKey, { evaluations: [] });
      }

      pairMap.get(pairKey)!.evaluations.push({
        enjoyment: evaluation.enjoyment,
        team_energy: evaluation.team_energy,
        play_again: evaluation.play_again,
        created_at: evaluation.created_at,
      });
    }

    // Calculate and upsert chemistry for each pair
    const updates: any[] = [];

    for (const [pairKey, data] of pairMap) {
      const [playerA, playerB] = pairKey.split("|");
      const evals = data.evaluations;

      // Calculate averages
      const avgEnjoyment = evals.reduce((sum, e) => sum + e.enjoyment, 0) / evals.length;
      const avgTeamEnergy = evals.reduce((sum, e) => sum + e.team_energy, 0) / evals.length;

      // Count play_again responses
      const preferCount = evals.filter(e => e.play_again === "prefer").length;
      const neutralCount = evals.filter(e => e.play_again === "neutral").length;
      const avoidCount = evals.filter(e => e.play_again === "avoid").length;

      // Calculate vibe score (0-100)
      const baseScore = ((avgEnjoyment + avgTeamEnergy) / 2) * 20;
      const playAgainModifier = (preferCount * 10 - avoidCount * 15) / Math.max(1, evals.length);
      const vibeScore = Math.max(0, Math.min(100, baseScore + playAgainModifier));

      // Determine vibe status
      let vibeStatus = "neutral";
      if (vibeScore >= 80) vibeStatus = "great";
      else if (vibeScore >= 60) vibeStatus = "good";
      else if (vibeScore < 40 || avoidCount >= 2) vibeStatus = "avoid";

      // Find most recent evaluation
      const lastPlayed = evals.reduce((latest, e) => 
        new Date(e.created_at) > new Date(latest) ? e.created_at : latest,
        evals[0].created_at
      );

      updates.push({
        guild_id,
        player_a_discord_id: playerA,
        player_b_discord_id: playerB,
        games_together: evals.length,
        avg_enjoyment: avgEnjoyment,
        avg_team_energy: avgTeamEnergy,
        prefer_count: preferCount,
        neutral_count: neutralCount,
        avoid_count: avoidCount,
        vibe_score: vibeScore,
        vibe_status: vibeStatus,
        last_played_together: lastPlayed,
        updated_at: new Date().toISOString(),
      });
    }

    // Batch upsert all chemistry records
    if (updates.length > 0) {
      const { error: upsertError } = await supabase
        .from("player_vibe_chemistry")
        .upsert(updates, { onConflict: "guild_id,player_a_discord_id,player_b_discord_id" });

      if (upsertError) {
        console.error("[vibe-chemistry] Error upserting chemistry:", upsertError);
        throw upsertError;
      }
    }

    // Update player vibe scores in player_summary
    const allPlayers = new Set<string>();
    for (const [pairKey] of pairMap) {
      const [playerA, playerB] = pairKey.split("|");
      allPlayers.add(playerA);
      allPlayers.add(playerB);
    }

    for (const playerId of allPlayers) {
      await updatePlayerVibeScore(supabase, guild_id, playerId);
    }

    console.log(`[vibe-chemistry] Updated ${updates.length} chemistry pairs, ${allPlayers.size} player scores`);

    return new Response(
      JSON.stringify({
        success: true,
        pairs_updated: updates.length,
        players_updated: allPlayers.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[vibe-chemistry] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function updatePlayerVibeScore(supabase: any, guildId: string, playerId: string) {
  // Get all vibe chemistry records involving this player
  const { data: chemistryRecords } = await supabase
    .from("player_vibe_chemistry")
    .select("vibe_score, games_together")
    .eq("guild_id", guildId)
    .or(`player_a_discord_id.eq.${playerId},player_b_discord_id.eq.${playerId}`);

  if (!chemistryRecords || chemistryRecords.length === 0) return;

  // Calculate weighted average vibe score based on games together
  let totalWeightedScore = 0;
  let totalGames = 0;

  for (const record of chemistryRecords) {
    if (record.vibe_score != null) {
      totalWeightedScore += record.vibe_score * record.games_together;
      totalGames += record.games_together;
    }
  }

  const avgVibeScore = totalGames > 0 ? totalWeightedScore / totalGames : null;

  // Update player_summary
  if (avgVibeScore != null) {
    await supabase
      .from("player_summary")
      .update({ vibe_score: avgVibeScore })
      .eq("guild_id", guildId)
      .eq("discord_user_id", playerId);
  }
}
