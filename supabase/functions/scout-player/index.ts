import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { guild_id, player_id } = await req.json();
    
    if (!guild_id || !player_id) {
      return new Response(JSON.stringify({ error: 'guild_id and player_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all player data in parallel
    const [
      { data: summary },
      { data: ratings },
      { data: profile },
      { data: streaks },
      { data: achievements },
      { data: positionRatings },
      { data: chemistry },
      { data: recentStats },
      { data: reliability },
      { data: competitionWins }
    ] = await Promise.all([
      supabase.from('player_summary').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
      supabase.from('player_ratings').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
      supabase.from('profiles').select('*').eq('discord_user_id', player_id).maybeSingle(),
      supabase.from('player_streaks').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
      supabase.from('player_achievements').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id),
      supabase.from('player_position_ratings').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).order('games_at_position', { ascending: false }),
      supabase.from('player_chemistry').select('*').eq('guild_id', guild_id).or(`player_a_discord_id.eq.${player_id},player_b_discord_id.eq.${player_id}`).order('games_together', { ascending: false }).limit(10),
      supabase.from('player_stats').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).order('recorded_at', { ascending: false }).limit(20),
      supabase.from('player_reliability').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
      supabase.from('competition_wins').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).eq('verified', true)
    ]);

    if (!summary && !ratings && !profile) {
      return new Response(JSON.stringify({ error: 'Player not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build comprehensive player data object
    const playerData = {
      profile: {
        username: summary?.discord_username || profile?.discord_username || player_id,
        ea_username: profile?.ea_username,
        ea_platform: profile?.ea_platform,
        primary_position: summary?.primary_position || profile?.primary_position
      },
      overall: {
        rating: summary?.overall_rating || ratings?.overall_rating || 50,
        games_played: summary?.games_played || ratings?.games_played || 0,
        wins: summary?.wins || ratings?.wins || 0,
        losses: ratings?.losses || 0,
        draws: ratings?.draws || 0,
        win_rate: summary?.win_rate || 0,
        goals: summary?.goals || ratings?.total_goals || 0,
        assists: summary?.assists || ratings?.total_assists || 0,
        clean_sheets: ratings?.total_clean_sheets || 0,
        motm_count: ratings?.total_motm || 0
      },
      ratings_breakdown: {
        overall: ratings?.overall_rating,
        draft_performance: ratings?.draft_performance_rating,
        club_performance: ratings?.club_performance_rating,
        peer_rating: ratings?.peer_rating,
        build_quality: ratings?.build_quality_rating
      },
      form: {
        form_rating: summary?.form_rating || streaks?.form_rating,
        current_streak: summary?.current_streak || 0,
        streak_type: summary?.streak_type,
        longest_win_streak: summary?.longest_win_streak || streaks?.longest_win_streak || 0,
        current_win_streak: streaks?.current_win_streak || 0,
        current_loss_streak: streaks?.current_loss_streak || 0,
        current_goal_streak: streaks?.current_goal_streak || 0,
        last_5_results: streaks?.last_5_results || [],
        last_10_results: streaks?.last_10_results || []
      },
      positions: positionRatings?.map(p => ({
        position: p.position,
        games: p.games_at_position,
        goals: p.goals_at_position,
        assists: p.assists_at_position,
        avg_rating: p.avg_match_rating,
        position_rating: p.rating
      })) || [],
      reliability: {
        score: reliability?.reliability_score || summary?.reliability_score || 100,
        total_events: reliability?.total_events || 0,
        events_showed: reliability?.events_showed || 0,
        events_no_showed: reliability?.events_no_showed || 0
      },
      chemistry: chemistry?.map(c => ({
        partner_id: c.player_a_discord_id === player_id ? c.player_b_discord_id : c.player_a_discord_id,
        games_together: c.games_together,
        wins_together: c.wins_together,
        win_rate: c.win_rate,
        synergy_score: c.synergy_score
      })) || [],
      achievements: achievements?.map(a => ({
        name: a.achievement_name,
        icon: a.achievement_icon,
        earned_at: a.earned_at
      })) || [],
      competition_wins: competitionWins?.map(w => ({
        competition: w.competition_name,
        type: w.competition_type,
        tier: w.tier,
        team: w.team_name,
        date: w.placed_at
      })) || [],
      recent_games: recentStats?.map(s => ({
        date: s.recorded_at,
        match_type: s.match_type,
        position: s.position_played,
        goals: s.goals,
        assists: s.assists,
        rating: s.ea_match_rating,
        won: s.won,
        clean_sheet: s.clean_sheet,
        motm: s.man_of_match
      })) || []
    };

    // Calculate additional stats
    const totalGoalContributions = playerData.overall.goals + playerData.overall.assists;
    const goalsPerGame = playerData.overall.games_played > 0 ? (playerData.overall.goals / playerData.overall.games_played).toFixed(2) : 0;
    const assistsPerGame = playerData.overall.games_played > 0 ? (playerData.overall.assists / playerData.overall.games_played).toFixed(2) : 0;
    
    // Build AI prompt
    const prompt = `You are an expert football/soccer scout and analyst. Analyze this player's comprehensive statistics and provide a detailed scouting report.

PLAYER DATA:
${JSON.stringify(playerData, null, 2)}

ADDITIONAL METRICS:
- Goals per game: ${goalsPerGame}
- Assists per game: ${assistsPerGame}
- Total goal contributions: ${totalGoalContributions}

Provide a detailed scouting report covering:
1. **Player Overview** - Brief summary of who this player is
2. **Strengths** - What they excel at based on the data
3. **Weaknesses** - Areas needing improvement
4. **Position Analysis** - Best positions and versatility
5. **Form Assessment** - Current form and recent performance trends
6. **Chemistry Insights** - Who they play well with
7. **Reliability Rating** - Attendance and consistency
8. **Draft Value** - How valuable would they be in a draft pick
9. **Recommendations** - Tactical suggestions for using this player

Be specific and reference actual numbers from the data. Format with markdown.`;

    // Call OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert football scout providing detailed player analysis reports. Be analytical, insightful, and back up observations with data.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI error:', error);
      return new Response(JSON.stringify({ error: 'Failed to generate AI analysis' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResult = await openaiResponse.json();
    const analysis = aiResult.choices[0]?.message?.content || 'Unable to generate analysis';

    return new Response(JSON.stringify({ 
      success: true,
      player_data: playerData,
      analysis 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scout-player:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
