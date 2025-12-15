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

    console.log(`Fetching club info for club ${clubId}`);

    // Find the club stats
    const { data: clubStats, error } = await supabase
      .from('club_stats')
      .select('*')
      .eq('ea_club_id', clubId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching club stats:', error);
      throw error;
    }

    if (!clubStats) {
      return new Response(
        JSON.stringify({ success: false, error: 'Club not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get match count
    const { count: matchCount } = await supabase
      .from('club_matches')
      .select('*', { count: 'exact', head: true })
      .eq('club_key', clubStats.club_key);

    const response = {
      success: true,
      club: {
        id: clubStats.ea_club_id,
        name: clubStats.club_name,
        platform: clubStats.ea_platform,
        skill_rating: clubStats.skill_rating,
        division: clubStats.best_division,
        wins: clubStats.wins || 0,
        draws: clubStats.draws || 0,
        losses: clubStats.losses || 0,
        goals_scored: clubStats.goals_scored || 0,
        goals_conceded: clubStats.goals_conceded || 0,
        total_members: clubStats.total_members || 0,
        matches_tracked: matchCount || 0,
        last_synced_at: clubStats.last_synced_at,
        updated_at: clubStats.updated_at
      }
    };

    console.log(`Returning club info for ${clubStats.club_name}`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-club-info-api:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
