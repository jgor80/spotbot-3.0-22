import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WinProbabilityRequest {
  guild_id: string;
  team_a_player_ids: string[];
  team_b_player_ids: string[];
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

    const { guild_id, team_a_player_ids, team_b_player_ids }: WinProbabilityRequest = await req.json();

    console.log(`[win-probability] Calculating for ${team_a_player_ids.length} vs ${team_b_player_ids.length} players`);

    // Get player summaries for both teams
    const allPlayerIds = [...team_a_player_ids, ...team_b_player_ids];
    
    const { data: players } = await supabase
      .from("player_summary")
      .select("discord_user_id, overall_rating, form_rating, current_streak, wins, games_played")
      .eq("guild_id", guild_id)
      .in("discord_user_id", allPlayerIds);

    const playerMap = new Map((players || []).map(p => [p.discord_user_id, p]));

    // Calculate team ratings
    const getTeamStats = (playerIds: string[]) => {
      const teamPlayers = playerIds.map(id => playerMap.get(id) || {
        overall_rating: 50,
        form_rating: 50,
        current_streak: 0,
        wins: 0,
        games_played: 0,
      });

      const avgRating = teamPlayers.reduce((sum, p) => sum + (p.overall_rating || 50), 0) / teamPlayers.length;
      const avgForm = teamPlayers.reduce((sum, p) => sum + (p.form_rating || 50), 0) / teamPlayers.length;
      const totalStreak = teamPlayers.reduce((sum, p) => sum + (p.current_streak || 0), 0);
      const totalWins = teamPlayers.reduce((sum, p) => sum + (p.wins || 0), 0);
      const totalGames = teamPlayers.reduce((sum, p) => sum + (p.games_played || 0), 0);

      return {
        avg_rating: avgRating,
        avg_form: avgForm,
        total_streak: totalStreak,
        win_rate: totalGames > 0 ? (totalWins / totalGames) * 100 : 50,
        players: teamPlayers,
      };
    };

    const teamAStats = getTeamStats(team_a_player_ids);
    const teamBStats = getTeamStats(team_b_player_ids);

    // Get chemistry bonuses
    const teamAChemistry = await getTeamChemistry(supabase, guild_id, team_a_player_ids);
    const teamBChemistry = await getTeamChemistry(supabase, guild_id, team_b_player_ids);

    // Calculate win probability using ELO-style formula with adjustments
    // Base: rating difference
    const ratingDiff = teamAStats.avg_rating - teamBStats.avg_rating;
    
    // Form adjustment (recent performance matters)
    const formDiff = (teamAStats.avg_form - teamBStats.avg_form) * 0.2;
    
    // Streak adjustment (momentum matters)
    const streakDiff = (teamAStats.total_streak - teamBStats.total_streak) * 0.5;
    
    // Chemistry adjustment
    const chemistryDiff = (teamAChemistry - teamBChemistry) * 0.3;

    // Combined difference
    const totalDiff = ratingDiff + formDiff + streakDiff + chemistryDiff;

    // ELO-style probability: 1 / (1 + 10^(-diff/400))
    // Using 40 as scaling factor for tighter range
    const teamAProbability = 1 / (1 + Math.pow(10, -totalDiff / 40));
    const teamBProbability = 1 - teamAProbability;

    // Convert to percentage
    const teamAPercent = Math.round(teamAProbability * 100);
    const teamBPercent = Math.round(teamBProbability * 100);

    // Determine favorite
    const favorite = teamAPercent > teamBPercent ? "a" : teamAPercent < teamBPercent ? "b" : "even";

    return new Response(
      JSON.stringify({
        success: true,
        team_a: {
          probability: teamAPercent,
          avg_rating: Math.round(teamAStats.avg_rating * 10) / 10,
          avg_form: Math.round(teamAStats.avg_form * 10) / 10,
          team_chemistry: Math.round(teamAChemistry * 10) / 10,
          player_ids: team_a_player_ids,
        },
        team_b: {
          probability: teamBPercent,
          avg_rating: Math.round(teamBStats.avg_rating * 10) / 10,
          avg_form: Math.round(teamBStats.avg_form * 10) / 10,
          team_chemistry: Math.round(teamBChemistry * 10) / 10,
          player_ids: team_b_player_ids,
        },
        favorite,
        confidence: Math.abs(teamAPercent - 50), // How confident (0 = coin flip, 50 = very confident)
        factors: {
          rating_difference: Math.round(ratingDiff * 10) / 10,
          form_difference: Math.round(formDiff * 10) / 10,
          streak_difference: Math.round(streakDiff * 10) / 10,
          chemistry_difference: Math.round(chemistryDiff * 10) / 10,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[win-probability] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getTeamChemistry(supabase: any, guildId: string, playerIds: string[]): Promise<number> {
  if (playerIds.length < 2) return 50;

  // Get all chemistry pairs for this team
  const pairs = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const [a, b] = [playerIds[i], playerIds[j]].sort();
      pairs.push({ a, b });
    }
  }

  let totalWinRate = 0;
  let pairsWithData = 0;

  for (const pair of pairs) {
    const { data } = await supabase
      .from("player_chemistry")
      .select("win_rate, games_together")
      .eq("guild_id", guildId)
      .eq("player_a_discord_id", pair.a)
      .eq("player_b_discord_id", pair.b)
      .maybeSingle();

    if (data && data.games_together >= 2) {
      totalWinRate += data.win_rate;
      pairsWithData++;
    }
  }

  if (pairsWithData === 0) return 50; // No chemistry data

  return totalWinRate / pairsWithData;
}
