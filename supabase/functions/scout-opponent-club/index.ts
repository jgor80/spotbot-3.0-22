import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toFcPlatform } from '../_shared/ea.ts'
import { rejectUnlessCaller, requireGuildAccess } from '../_shared/auth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const EA_HEADERS = {
  'accept': 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'origin': 'https://www.ea.com',
  'referer': 'https://www.ea.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

async function fetchClubMembers(clubId: string, platform: string) {
  const fcPlatform = toFcPlatform(platform);
  
  try {
    const url = `https://proclubs.ea.com/api/fc/members/stats?platform=${fcPlatform}&clubId=${clubId}`;
    console.log(`[EA] Fetching members from: ${url}`);
    
    const res = await fetch(url, {
      headers: EA_HEADERS,
    });
    
    if (!res.ok) {
      console.error(`[EA] Members fetch failed: ${res.status}`);
      return [];
    }
    
    const data = await res.json();
    if (data?.members) return data.members;
    if (Array.isArray(data)) return data;
    return Object.values(data).filter((v: any) => v && typeof v === 'object');
  } catch (err) {
    console.error(`[EA] Club members error:`, err);
    return [];
  }
}

async function fetchClubInfo(clubId: string, platform: string) {
  const fcPlatform = toFcPlatform(platform);
  
  try {
    const url = `https://proclubs.ea.com/api/fc/clubs/info?platform=${fcPlatform}&clubIds=${clubId}`;
    const res = await fetch(url, { headers: EA_HEADERS });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data[clubId]) return data[clubId];
    return data;
  } catch (err) {
    console.error(`[EA] Club info error:`, err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot or a signed-in web user may call it.
  const denied = await rejectUnlessCaller(req);
  if (denied) return denied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("[scout-opponent] Missing env vars");
      return new Response(
        JSON.stringify({ error: "Server configuration error", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { guild_id, ea_club_id, platform, increment_times_faced } = await req.json();
    const noAccess = await requireGuildAccess(req, supabase, guild_id, 'member');
    if (noAccess) return noAccess;

    if (!guild_id || !ea_club_id) {
      return new Response(
        JSON.stringify({ error: "guild_id and ea_club_id required", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine platform - try to infer from existing data if not provided
    let usePlatform = platform;
    if (!usePlatform) {
      // Try to get platform from existing club_stats
      const { data: existingClub } = await supabase
        .from('club_stats')
        .select('ea_platform')
        .eq('guild_id', guild_id)
        .limit(1)
        .maybeSingle();
      
      usePlatform = existingClub?.ea_platform || 'ps5';
    }

    console.log(`[scout-opponent] Scouting club ${ea_club_id} on ${usePlatform} for guild ${guild_id}`);

    // Fetch club info first to get name
    const clubInfo = await fetchClubInfo(ea_club_id, usePlatform);
    const clubName = clubInfo?.name || `Club ${ea_club_id}`;
    
    console.log(`[scout-opponent] Club name: ${clubName}`);

    // Fetch all members
    const members = await fetchClubMembers(ea_club_id, usePlatform);
    
    if (!members.length) {
      console.log(`[scout-opponent] No members found for ${clubName}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No members found - may be blocked by EA API from cloud",
          club_name: clubName,
          scouted_count: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scout-opponent] Found ${members.length} members`);

    let scoutedCount = 0;
    const scoutedPlayers = [];

    for (const member of members) {
      const eaUsername = member.name || member.playerName;
      if (!eaUsername) continue;

      const gamesPlayed = parseInt(member.gamesPlayed || member.games || 0);
      const goals = parseInt(member.goals || 0);
      const assists = parseInt(member.assists || 0);
      const wins = parseInt(member.wins || 0);
      const losses = parseInt(member.losses || 0);
      const draws = parseInt(member.draws || member.ties || 0);
      const cleanSheets = parseInt(member.cleanSheetsDef || member.cleanSheetsGK || member.cleanSheets || 0);
      const manOfMatch = parseInt(member.manOfTheMatch || member.motm || 0);
      const avgRating = parseFloat(member.ratingAve || member.avgRating || 0) || null;
      const position = member.favoritePosition || member.proPos || null;
      const archetype = member.archetypeid || member.archetype || null;

      const playerData = {
        guild_id,
        ea_club_id,
        ea_club_name: clubName,
        ea_username: eaUsername,
        ea_platform: usePlatform,
        games_played: gamesPlayed,
        goals,
        assists,
        wins,
        losses,
        draws,
        win_rate: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0,
        avg_match_rating: avgRating,
        clean_sheets: cleanSheets,
        man_of_match: manOfMatch,
        primary_position: position,
        archetypeid: archetype,
        shots: parseInt(member.shots || 0),
        tackles: parseInt(member.tackles || member.tacklesAttempted || 0),
        passes_made: parseInt(member.passesMade || 0),
        pass_attempts: parseInt(member.passesAttempted || 0),
        saves: parseInt(member.saves || 0),
        interceptions: parseInt(member.interceptions || 0),
        clearances: parseInt(member.clearances || 0),
        last_scouted_at: new Date().toISOString(),
        ...(increment_times_faced ? {} : {}) // Will handle increment separately
      };

      // Upsert player data
      const { data: existing } = await supabase
        .from('scouted_players')
        .select('id, times_faced')
        .eq('guild_id', guild_id)
        .eq('ea_club_id', ea_club_id)
        .eq('ea_username', eaUsername)
        .maybeSingle();

      if (existing) {
        // Update existing - increment times_faced if requested
        const updateData = {
          ...playerData,
          times_faced: increment_times_faced ? (existing.times_faced || 0) + 1 : existing.times_faced || 0
        };
        
        await supabase
          .from('scouted_players')
          .update(updateData)
          .eq('id', existing.id);
      } else {
        // Insert new
        await supabase
          .from('scouted_players')
          .insert({
            ...playerData,
            times_faced: increment_times_faced ? 1 : 0,
            first_seen_at: new Date().toISOString()
          });
      }

      scoutedPlayers.push({
        name: eaUsername,
        position,
        games: gamesPlayed,
        goals,
        assists,
        rating: avgRating
      });
      scoutedCount++;
    }

    console.log(`[scout-opponent] Scouted ${scoutedCount} players from ${clubName}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        club_name: clubName,
        scouted_count: scoutedCount,
        players: scoutedPlayers
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[scout-opponent] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});