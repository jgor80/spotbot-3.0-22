import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rejectUnlessCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AwardAchievementsRequest {
  guild_id: string;
  discord_user_id?: string; // If provided, only check for this player
  player_ids?: string[]; // If provided, check for these players
}

// Achievement definitions
const ACHIEVEMENTS = [
  // Milestone Achievements
  { key: "first_steps", name: "First Steps", icon: "👶", check: (p: any) => p.games_played >= 1 },
  { key: "centurion", name: "Centurion", icon: "🎖️", check: (p: any) => p.games_played >= 100 },
  { key: "500_club", name: "500 Club", icon: "💎", check: (p: any) => p.games_played >= 500 },
  { key: "legend", name: "Legend", icon: "🌟", check: (p: any) => p.games_played >= 1000 },
  { key: "century_goals", name: "Century Goals", icon: "💯", check: (p: any) => p.goals >= 100 },
  { key: "goal_machine", name: "Goal Machine", icon: "⚽", check: (p: any) => p.goals >= 250 },
  { key: "assist_king", name: "Assist King", icon: "🎯", check: (p: any) => p.assists >= 50 },
  { key: "provider", name: "Provider", icon: "🤝", check: (p: any) => p.assists >= 100 },
  { key: "maestro", name: "Maestro", icon: "🎼", check: (p: any) => p.assists >= 200 },
  
  // Performance Achievements
  { key: "mvp", name: "MVP", icon: "⭐", check: (p: any) => p.man_of_match >= 10 },
  { key: "mvp_magnet", name: "MVP Magnet", icon: "🏅", check: (p: any) => p.man_of_match >= 25 },
  { key: "superstar_motm", name: "Superstar", icon: "🌠", check: (p: any) => p.man_of_match >= 50 },
  { key: "elite", name: "Elite", icon: "🔝", check: (p: any) => p.overall_rating >= 85 },
  { key: "diamond_rating", name: "Diamond", icon: "💎", check: (p: any) => p.overall_rating >= 90 },
  { key: "world_class", name: "World Class", icon: "🌍", check: (p: any) => p.overall_rating >= 95 },
  
  // Goalkeeper Achievements
  { key: "safe_hands", name: "Safe Hands", icon: "🧤", check: (p: any) => p.clean_sheets >= 10 },
  { key: "lockdown", name: "Lockdown", icon: "🔒", check: (p: any) => p.clean_sheets >= 25 },
  { key: "brick_wall", name: "Brick Wall", icon: "🧱", check: (p: any) => p.clean_sheets >= 50 },
  { key: "fortress", name: "Fortress", icon: "🏰", check: (p: any) => p.clean_sheets >= 100 },
  { key: "shot_stopper", name: "Shot Stopper", icon: "🦸", check: (p: any) => p.saves >= 100 },
  { key: "octopus", name: "Octopus", icon: "🐙", check: (p: any) => p.saves >= 250 },
  { key: "cat_like", name: "Cat-Like Reflexes", icon: "🐱", check: (p: any) => p.saves >= 500 },
  
  // Defender Achievements
  { key: "brave", name: "Brave", icon: "🦁", check: (p: any) => p.tackles >= 100 },
  { key: "shield", name: "Shield", icon: "🛡️", check: (p: any) => p.tackles >= 250 },
  { key: "destroyer", name: "Destroyer", icon: "💥", check: (p: any) => p.tackles >= 500 },
  { key: "sweeper", name: "Sweeper", icon: "🧹", check: (p: any) => p.clearances >= 100 },
  { key: "interceptor", name: "Interceptor", icon: "🔍", check: (p: any) => p.interceptions >= 100 },
  { key: "ball_hawk", name: "Ball Hawk", icon: "🦅", check: (p: any) => p.interceptions >= 250 },
  
  // Winning Achievements
  { key: "winner", name: "Winner", icon: "🏆", check: (p: any) => p.wins >= 10 },
  { key: "champion", name: "Champion", icon: "👑", check: (p: any) => p.wins >= 50 },
  { key: "dominant", name: "Dominant", icon: "⚡", check: (p: any) => p.wins >= 100 },
  { key: "unstoppable", name: "Unstoppable", icon: "🚀", check: (p: any) => p.wins >= 250 },
  { key: "inferno", name: "Inferno", icon: "🔥", check: (p: any, s: any) => s?.longest_win_streak >= 5 },
  { key: "tidal_wave", name: "Tidal Wave", icon: "🌊", check: (p: any, s: any) => s?.longest_win_streak >= 10 },
  { key: "tsunami", name: "Tsunami", icon: "🌀", check: (p: any, s: any) => s?.longest_win_streak >= 15 },
  
  // Special Achievements
  { key: "entertainer", name: "Entertainer", icon: "🎪", check: (p: any) => p.goals >= 10 && p.assists >= 10 },
  { key: "complete_player", name: "Complete Player", icon: "🎭", check: (p: any) => p.goals >= 25 && p.assists >= 25 },
  { key: "on_fire", name: "On Fire", icon: "🔥", check: (p: any) => p.form_rating >= 80 && p.games_played >= 10 },
  { key: "reliable", name: "Reliable", icon: "✅", check: (p: any) => p.reliability_score >= 90 && p.games_played >= 20 },
  { key: "statistician", name: "Statistician", icon: "📊", check: (p: any) => p.passes_made >= 500 },
  { key: "pass_master", name: "Pass Master", icon: "🎯", check: (p: any) => p.passes_made >= 1000 },
  { key: "dribbler", name: "Dribbler", icon: "💨", check: (p: any) => p.dribbles >= 100 },
  { key: "skill_master", name: "Skill Master", icon: "🪄", check: (p: any) => p.dribbles >= 250 },
  { key: "sharpshooter", name: "Sharpshooter", icon: "🎯", check: (p: any) => p.shots >= 200 },
  { key: "cannon", name: "Cannon", icon: "💣", check: (p: any) => p.shots >= 500 },
  
  // Streak-based Achievements (require streak data)
  { key: "ice_cold", name: "Ice Cold", icon: "❄️", check: (p: any, s: any) => 
    s?.longest_win_streak >= 3 && s?.longest_loss_streak >= 3 },
  { key: "comeback_king", name: "Comeback King", icon: "👑", check: (p: any, s: any) => 
    s?.longest_win_streak >= 5 && s?.longest_loss_streak >= 5 },
  { key: "goal_streak", name: "Goal Streak", icon: "🎯", check: (p: any, s: any) => s?.longest_goal_streak >= 5 },
  { key: "scoring_machine", name: "Scoring Machine", icon: "⚽", check: (p: any, s: any) => s?.longest_goal_streak >= 10 },
  { key: "cs_streak", name: "Clean Sheet Streak", icon: "🧤", check: (p: any, s: any) => s?.longest_clean_sheet_streak >= 3 },
  { key: "impenetrable", name: "Impenetrable", icon: "🏰", check: (p: any, s: any) => s?.longest_clean_sheet_streak >= 5 },
  
  // Competition Achievements
  { key: "tournament_champ", name: "Tournament Champion", icon: "🏆", check: (p: any, s: any, c: any) => c?.tournament_wins >= 1 },
  { key: "tournament_legend", name: "Tournament Legend", icon: "👑", check: (p: any, s: any, c: any) => c?.tournament_wins >= 5 },
  { key: "league_winner", name: "League Winner", icon: "🏅", check: (p: any, s: any, c: any) => c?.league_wins >= 1 },
  { key: "league_dominator", name: "League Dominator", icon: "🌟", check: (p: any, s: any, c: any) => c?.league_wins >= 3 },
  { key: "major_winner", name: "Major Winner", icon: "🏆", check: (p: any, s: any, c: any) => c?.major_wins >= 1 },
  { key: "major_legend", name: "Major Legend", icon: "💎", check: (p: any, s: any, c: any) => c?.major_wins >= 3 },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot may call it.
  const denied = await rejectUnlessCaller(req, { botOnly: true });
  if (denied) return denied;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { guild_id, discord_user_id, player_ids }: AwardAchievementsRequest = await req.json();

    console.log(`[award-achievements] Checking achievements for guild ${guild_id}`);

    // Determine which players to check
    let playerIdsToCheck: string[] = [];
    
    if (player_ids && player_ids.length > 0) {
      playerIdsToCheck = player_ids;
    } else if (discord_user_id) {
      playerIdsToCheck = [discord_user_id];
    } else {
      // Get all players in the guild with games
      const { data: allPlayers } = await supabase
        .from("player_summary")
        .select("discord_user_id")
        .eq("guild_id", guild_id)
        .gt("games_played", 0);
      
      playerIdsToCheck = (allPlayers || []).map(p => p.discord_user_id);
    }

    const results: { discord_user_id: string; awarded: string[] }[] = [];

    for (const playerId of playerIdsToCheck) {
      const awarded: string[] = [];

      // Get player summary data
      const { data: summary } = await supabase
        .from("player_summary")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("discord_user_id", playerId)
        .maybeSingle();

      // Get player streak data
      const { data: streaks } = await supabase
        .from("player_streaks")
        .select("*")
        .eq("guild_id", guild_id)
        .eq("discord_user_id", playerId)
        .maybeSingle();

      // Get competition wins count
      const { data: compWins } = await supabase
        .from("competition_wins")
        .select("competition_type, tier")
        .eq("guild_id", guild_id)
        .eq("discord_user_id", playerId)
        .eq("verified", true);

      const competitionData = {
        tournament_wins: (compWins || []).filter(w => w.competition_type === "tournament").length,
        league_wins: (compWins || []).filter(w => w.competition_type === "league").length,
        major_wins: (compWins || []).filter(w => ["major", "div1"].includes(w.tier)).length,
      };

      // Get existing achievements
      const { data: existingAchievements } = await supabase
        .from("player_achievements")
        .select("achievement_key")
        .eq("guild_id", guild_id)
        .eq("discord_user_id", playerId);

      const existingKeys = new Set((existingAchievements || []).map(a => a.achievement_key));

      // Check each achievement
      for (const achievement of ACHIEVEMENTS) {
        if (existingKeys.has(achievement.key)) continue;

        try {
          const earned = achievement.check(summary || {}, streaks || {}, competitionData);
          
          if (earned) {
            const { error } = await supabase
              .from("player_achievements")
              .insert({
                guild_id,
                discord_user_id: playerId,
                achievement_key: achievement.key,
                achievement_name: achievement.name,
                achievement_icon: achievement.icon,
              });

            if (!error) {
              awarded.push(achievement.key);
              console.log(`[award-achievements] Awarded ${achievement.name} to ${playerId}`);
            }
          }
        } catch (e) {
          // Skip if check fails
        }
      }

      if (awarded.length > 0) {
        results.push({ discord_user_id: playerId, awarded });

        // Update player_summary with new achievement count
        const newAchievementCount = existingKeys.size + awarded.length;
        
        // Get top 3 achievement icons
        const { data: topAchievements } = await supabase
          .from("player_achievements")
          .select("achievement_icon")
          .eq("guild_id", guild_id)
          .eq("discord_user_id", playerId)
          .order("earned_at", { ascending: false })
          .limit(3);

        await supabase
          .from("player_summary")
          .update({
            achievement_count: newAchievementCount,
            top_achievements: (topAchievements || []).map(a => a.achievement_icon),
          })
          .eq("guild_id", guild_id)
          .eq("discord_user_id", playerId);
      }
    }

    const totalAwarded = results.reduce((sum, r) => sum + r.awarded.length, 0);
    console.log(`[award-achievements] Awarded ${totalAwarded} achievements to ${results.length} players`);

    return new Response(
      JSON.stringify({
        success: true,
        players_checked: playerIdsToCheck.length,
        achievements_awarded: totalAwarded,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[award-achievements] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
