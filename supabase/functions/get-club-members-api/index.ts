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
    const clubId = url.searchParams.get('clubId');

    if (!clubId) {
      return new Response(
        JSON.stringify({ success: false, error: 'clubId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Fetching club members for club ${clubId}`);

    // First, find the club_key and guild_id that matches this EA club ID
    const { data: clubStats } = await supabase
      .from('club_stats')
      .select('club_key, club_name, guild_id, ea_club_id')
      .eq('ea_club_id', clubId)
      .limit(1)
      .maybeSingle();

    if (!clubStats) {
      return new Response(
        JSON.stringify({ success: false, error: 'Club not found', count: 0, members: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get player summaries for this guild
    const { data: players, error } = await supabase
      .from('player_summary')
      .select(`
        discord_user_id,
        discord_username,
        games_played,
        wins,
        goals,
        assists,
        overall_rating,
        avg_match_rating,
        form_rating,
        primary_position,
        clean_sheets,
        man_of_match,
        shots,
        tackles,
        passes_made,
        pass_attempts,
        saves
      `)
      .eq('guild_id', clubStats.guild_id)
      .gt('games_played', 0)
      .order('overall_rating', { ascending: false });

    if (error) {
      console.error('Error fetching players:', error);
      throw error;
    }

    // Get EA usernames for players
    const discordIds = (players || []).map(p => p.discord_user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('discord_user_id, ea_username, ea_platform')
      .in('discord_user_id', discordIds);

    const profileMap = new Map((profiles || []).map(p => [p.discord_user_id, p]));

    // Transform to API format
    const members = (players || []).map(player => {
      const profile = profileMap.get(player.discord_user_id);
      const winRate = player.games_played > 0 
        ? Math.round((player.wins / player.games_played) * 100) 
        : 0;
      const passAccuracy = player.pass_attempts > 0 
        ? Math.round((player.passes_made / player.pass_attempts) * 100) 
        : 0;

      return {
        ea_username: profile?.ea_username || player.discord_username || player.discord_user_id,
        discord_username: player.discord_username,
        platform: profile?.ea_platform || null,
        position: player.primary_position || 'Unknown',
        overall_rating: player.overall_rating || 50,
        avg_match_rating: player.avg_match_rating || null,
        form_rating: player.form_rating || null,
        games_played: player.games_played || 0,
        wins: player.wins || 0,
        win_rate: winRate,
        goals: player.goals || 0,
        assists: player.assists || 0,
        clean_sheets: player.clean_sheets || 0,
        man_of_match: player.man_of_match || 0,
        shots: player.shots || 0,
        tackles: player.tackles || 0,
        passes_made: player.passes_made || 0,
        pass_attempts: player.pass_attempts || 0,
        pass_accuracy: passAccuracy,
        saves: player.saves || 0
      };
    });

    console.log(`Returning ${members.length} members for club ${clubStats.club_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        club_id: clubId,
        club_name: clubStats.club_name,
        count: members.length,
        members
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-club-members-api:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
