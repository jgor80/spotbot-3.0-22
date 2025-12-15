import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const eaUsername = url.searchParams.get('eaUsername');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50'), 1), 500);

    if (!eaUsername) {
      return new Response(
        JSON.stringify({ success: false, error: 'eaUsername is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Fetching player stats for ${eaUsername}`);

    // Find the profile by EA username
    const { data: profile } = await supabase
      .from('profiles')
      .select('discord_user_id, discord_username, ea_username, ea_platform, ea_persona_id, primary_position')
      .eq('ea_username', eaUsername)
      .limit(1)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Player not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get player summary (aggregated stats)
    const { data: summaries } = await supabase
      .from('player_summary')
      .select('*')
      .eq('discord_user_id', profile.discord_user_id);

    // Get recent match stats
    const { data: recentMatches } = await supabase
      .from('player_stats')
      .select(`
        id,
        guild_id,
        goals,
        assists,
        ea_match_rating,
        position_played,
        shots,
        tackles,
        passes_made,
        pass_attempts,
        clean_sheet,
        man_of_match,
        won,
        match_type,
        recorded_at
      `)
      .eq('discord_user_id', profile.discord_user_id)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    // Aggregate stats across all guilds
    const totalStats = (summaries || []).reduce((acc, s) => ({
      games_played: acc.games_played + (s.games_played || 0),
      wins: acc.wins + (s.wins || 0),
      losses: acc.losses + (s.losses || 0),
      draws: acc.draws + (s.draws || 0),
      goals: acc.goals + (s.goals || 0),
      assists: acc.assists + (s.assists || 0),
      clean_sheets: acc.clean_sheets + (s.clean_sheets || 0),
      man_of_match: acc.man_of_match + (s.man_of_match || 0),
      shots: acc.shots + (s.shots || 0),
      tackles: acc.tackles + (s.tackles || 0),
      passes_made: acc.passes_made + (s.passes_made || 0),
      pass_attempts: acc.pass_attempts + (s.pass_attempts || 0),
      saves: acc.saves + (s.saves || 0),
    }), {
      games_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      goals: 0,
      assists: 0,
      clean_sheets: 0,
      man_of_match: 0,
      shots: 0,
      tackles: 0,
      passes_made: 0,
      pass_attempts: 0,
      saves: 0
    });

    // Calculate averages
    const avgRating = summaries && summaries.length > 0
      ? summaries.reduce((sum, s) => sum + (s.avg_match_rating || 0), 0) / summaries.length
      : null;
    const winRate = totalStats.games_played > 0
      ? Math.round((totalStats.wins / totalStats.games_played) * 100)
      : 0;
    const passAccuracy = totalStats.pass_attempts > 0
      ? Math.round((totalStats.passes_made / totalStats.pass_attempts) * 100)
      : 0;

    // Format recent matches
    const matches = (recentMatches || []).map(m => ({
      id: m.id,
      date: m.recorded_at,
      match_type: m.match_type,
      position: m.position_played,
      result: m.won === true ? 'win' : m.won === false ? 'loss' : 'draw',
      rating: m.ea_match_rating,
      goals: m.goals || 0,
      assists: m.assists || 0,
      shots: m.shots || 0,
      tackles: m.tackles || 0,
      passes_made: m.passes_made || 0,
      pass_attempts: m.pass_attempts || 0,
      clean_sheet: m.clean_sheet || false,
      man_of_match: m.man_of_match || false
    }));

    const response = {
      success: true,
      player: {
        ea_username: profile.ea_username,
        discord_username: profile.discord_username,
        platform: profile.ea_platform,
        primary_position: profile.primary_position || summaries?.[0]?.primary_position || 'Unknown'
      },
      career_stats: {
        ...totalStats,
        avg_match_rating: avgRating ? Math.round(avgRating * 100) / 100 : null,
        win_rate: winRate,
        pass_accuracy: passAccuracy,
        goals_per_game: totalStats.games_played > 0 
          ? Math.round((totalStats.goals / totalStats.games_played) * 100) / 100 
          : 0,
        assists_per_game: totalStats.games_played > 0 
          ? Math.round((totalStats.assists / totalStats.games_played) * 100) / 100 
          : 0
      },
      recent_matches: matches
    };

    console.log(`Returning stats for ${eaUsername}: ${totalStats.games_played} games`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-player-stats-api:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
