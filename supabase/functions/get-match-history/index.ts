import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Archetype mapping for player builds
const ARCHETYPE_MAP: Record<string, string> = {
  "1": "Shot Stopper",
  "2": "Sweeper Keeper",
  "3": "Progressor",
  "4": "Boss",
  "5": "Engine",
  "6": "Marauder",
  "7": "Recycler",
  "8": "Maestro",
  "9": "Creator",
  "10": "Spark",
  "11": "Magician",
  "12": "Finisher",
  "13": "Target"
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const clubId = url.searchParams.get('clubId');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50'), 1), 500);
    const matchType = url.searchParams.get('matchType'); // Optional filter

    if (!clubId) {
      return new Response(
        JSON.stringify({ success: false, error: 'clubId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Fetching match history for club ${clubId}, limit: ${limit}`);

    // First, find the club_key that matches this EA club ID
    const { data: clubStats } = await supabase
      .from('club_stats')
      .select('club_key, club_name, ea_club_id')
      .eq('ea_club_id', clubId)
      .limit(1)
      .maybeSingle();

    if (!clubStats) {
      return new Response(
        JSON.stringify({ success: false, error: 'Club not found', count: 0, rows: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query for matches
    let query = supabase
      .from('club_matches')
      .select('*')
      .eq('club_key', clubStats.club_key)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply match type filter if provided
    if (matchType) {
      query = query.eq('match_type', matchType);
    }

    const { data: matches, error } = await query;

    if (error) {
      console.error('Error fetching matches:', error);
      throw error;
    }

    // Transform to OurProClub format
    const rows = (matches || []).map((match, index) => {
      const matchData = match.match_data as any || {};
      const playerStats = match.player_stats as any || {};

      // Build clubs object in their format
      const clubs: Record<string, { goals: string; clubName: string; winnerByDnf: string }> = {};
      
      // Add our club
      clubs[clubId] = {
        goals: String(match.score_for || 0),
        clubName: clubStats.club_name || match.club_key,
        winnerByDnf: "0"
      };

      // Add opponent club
      if (match.opponent_club_id) {
        clubs[match.opponent_club_id] = {
          goals: String(match.score_against || 0),
          clubName: match.opponent_club_name || "Unknown",
          winnerByDnf: matchData.winnerByDnf || "0"
        };
      }

      // Build player_data in their format
      const player_data: Record<string, any> = {};
      
      if (Array.isArray(playerStats)) {
        for (const player of playerStats) {
          const eaName = player.name || player.ea_username || 'Unknown';
          
          player_data[eaName] = {
            mom: player.mom || player.man_of_match ? "1" : "0",
            pos: mapPosition(player.pos || player.position || 'midfielder'),
            SCORE: String(match.score_for || 0),
            goals: String(player.goals || 0),
            saves: String(player.saves || 0),
            shots: String(player.shots || 0),
            rating: String(player.rating || player.match_rating || "6.00"),
            assists: String(player.assists || 0),
            redcards: player.redcards || player.red_card ? "1" : "0",
            passesmade: String(player.passesmade || player.passes_made || 0),
            archetypeid: String(player.archetypeid || player.archetype_id || "11"),
            tacklesmade: String(player.tacklesmade || player.tackles_made || 0),
            passattempts: String(player.passattempts || player.pass_attempts || 0),
            cleansheetsgk: player.cleansheetsgk || (player.pos === 'goalkeeper' && match.score_against === 0) ? "1" : "0",
            secondsPlayed: String(player.secondsPlayed || player.seconds_played || 5400),
            cleansheetsdef: player.cleansheetsdef || (mapPosition(player.pos) === 'defender' && match.score_against === 0) ? "1" : "0",
            tackleattempts: String(player.tackleattempts || player.tackle_attempts || 0)
          };
        }
      } else if (typeof playerStats === 'object') {
        // Handle object format
        for (const [eaName, stats] of Object.entries(playerStats)) {
          const player = stats as any;
          player_data[eaName] = {
            mom: player.mom || player.man_of_match ? "1" : "0",
            pos: mapPosition(player.pos || player.position || 'midfielder'),
            SCORE: String(match.score_for || 0),
            goals: String(player.goals || 0),
            saves: String(player.saves || 0),
            shots: String(player.shots || 0),
            rating: String(player.rating || player.match_rating || "6.00"),
            assists: String(player.assists || 0),
            redcards: player.redcards || player.red_card ? "1" : "0",
            passesmade: String(player.passesmade || player.passes_made || 0),
            archetypeid: String(player.archetypeid || player.archetype_id || "11"),
            tacklesmade: String(player.tacklesmade || player.tackles_made || 0),
            passattempts: String(player.passattempts || player.pass_attempts || 0),
            cleansheetsgk: player.cleansheetsgk || (player.pos === 'goalkeeper' && match.score_against === 0) ? "1" : "0",
            secondsPlayed: String(player.secondsPlayed || player.seconds_played || 5400),
            cleansheetsdef: player.cleansheetsdef || (mapPosition(player.pos) === 'defender' && match.score_against === 0) ? "1" : "0",
            tackleattempts: String(player.tackleattempts || player.tackle_attempts || 0)
          };
        }
      }

      // Convert match type to OurProClub format
      let formattedMatchType = 'friendlyMatch';
      if (match.match_type === 'division' || match.match_type === '9') {
        formattedMatchType = 'leagueMatch';
      } else if (match.match_type === 'cup' || match.match_type === '13') {
        formattedMatchType = 'playoffMatch';
      }

      return {
        id: index + 1,
        club_id: clubId,
        club_name: clubStats.club_name || match.club_key,
        match_type: formattedMatchType,
        match_date: Math.floor(new Date(match.created_at).getTime() / 1000),
        match_data: { clubs },
        player_data
      };
    });

    console.log(`Returning ${rows.length} matches for club ${clubId}`);

    return new Response(
      JSON.stringify({
        success: true,
        count: rows.length,
        rows
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-match-history:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Map detailed position to general category
function mapPosition(pos: string): string {
  const posLower = (pos || '').toLowerCase();
  if (posLower === 'gk' || posLower === 'goalkeeper') return 'goalkeeper';
  if (['cb', 'lb', 'rb', 'lwb', 'rwb', 'defender'].includes(posLower)) return 'defender';
  if (['cdm', 'cm', 'cam', 'lm', 'rm', 'midfielder'].includes(posLower)) return 'midfielder';
  if (['st', 'cf', 'lw', 'rw', 'forward', 'striker'].includes(posLower)) return 'forward';
  return 'midfielder'; // default
}
