import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rejectUnlessCaller } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpotPlayer {
  discord_user_id: string;
  club_key: string;
  position: string;
}

interface XboxPresenceResult {
  discord_user_id: string;
  xbox_gamertag: string;
  xbox_xuid: string;
  presence_state: string;
  presence_text: string;
  in_fc: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot may call it.
  const denied = await rejectUnlessCaller(req, { botOnly: true });
  if (denied) return denied;

  try {
    const { guild_id, spot_players } = await req.json() as { 
      guild_id: string; 
      spot_players: SpotPlayer[];
    };

    const openXblApiKey = Deno.env.get('OPENXBL_API_KEY');
    if (!openXblApiKey) {
      console.error('[check-xbox-presence] OPENXBL_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'OPENXBL_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (!spot_players?.length) {
      return new Response(JSON.stringify({ 
        playersOnline: [], 
        totalChecked: 0,
        activeSession: null,
        gameEnded: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Xbox XUIDs for spot players
    const discordIds = spot_players.map(p => p.discord_user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('discord_user_id, xbox_gamertag, xbox_xuid')
      .in('discord_user_id', discordIds)
      .not('xbox_xuid', 'is', null);

    if (profilesError) {
      console.error('[check-xbox-presence] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    if (!profiles?.length) {
      console.log('[check-xbox-presence] No spot players have Xbox XUIDs linked');
      return new Response(JSON.stringify({ 
        playersOnline: [], 
        totalChecked: 0,
        activeSession: null,
        gameEnded: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[check-xbox-presence] Checking ${profiles.length} players with Xbox XUIDs`);

    // Batch lookup XUIDs via OpenXBL
    const xuids = profiles.map(p => p.xbox_xuid).join(',');
    
    let xblData: any = null;
    try {
      const xblResponse = await fetch(`https://xbl.io/api/v2/account/${xuids}`, {
        headers: {
          'X-Authorization': openXblApiKey,
          'Accept': 'application/json',
        },
      });

      if (!xblResponse.ok) {
        console.error(`[check-xbox-presence] OpenXBL API error: ${xblResponse.status}`);
        throw new Error(`OpenXBL API returned ${xblResponse.status}`);
      }

      xblData = await xblResponse.json();
      console.log(`[check-xbox-presence] OpenXBL returned ${xblData?.people?.length || 0} people`);
    } catch (xblError) {
      console.error('[check-xbox-presence] OpenXBL fetch error:', xblError);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch Xbox presence',
        playersOnline: [], 
        totalChecked: profiles.length 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process presence data
    const playersOnlineFC: XboxPresenceResult[] = [];
    const allPresenceResults: XboxPresenceResult[] = [];

    for (const person of xblData?.people || []) {
      const profile = profiles.find(p => p.xbox_xuid === person.xuid);
      if (!profile) continue;

      const presenceState = person.presenceState || 'Unknown';
      const presenceText = person.presenceText || '';
      const inFC = presenceState === 'Online' && 
                   presenceText.toLowerCase().includes('ea fc');

      const result: XboxPresenceResult = {
        discord_user_id: profile.discord_user_id,
        xbox_gamertag: person.gamertag || profile.xbox_gamertag,
        xbox_xuid: person.xuid,
        presence_state: presenceState,
        presence_text: presenceText,
        in_fc: inFC,
      };

      allPresenceResults.push(result);

      if (inFC) {
        playersOnlineFC.push(result);
      }

      // Update last seen in profiles
      await supabase
        .from('profiles')
        .update({
          xbox_last_online: presenceState === 'Online' ? new Date().toISOString() : undefined,
          xbox_last_game: presenceText || undefined,
        })
        .eq('discord_user_id', profile.discord_user_id);
    }

    console.log(`[check-xbox-presence] ${playersOnlineFC.length} players detected in EA FC`);

    // Determine the primary club_key (most common among spot players)
    const clubKeyCounts: Record<string, number> = {};
    for (const sp of spot_players) {
      clubKeyCounts[sp.club_key] = (clubKeyCounts[sp.club_key] || 0) + 1;
    }
    const primaryClubKey = Object.entries(clubKeyCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'club1';

    // Get current active session
    const { data: existingSession } = await supabase
      .from('active_game_sessions')
      .select('*')
      .eq('guild_id', guild_id)
      .eq('club_key', primaryClubKey)
      .eq('status', 'in_progress')
      .maybeSingle();

    const spotPlayersWithXbox = spot_players.filter(sp => 
      profiles.some(p => p.discord_user_id === sp.discord_user_id)
    );
    const majorityThreshold = Math.ceil(spotPlayersWithXbox.length / 2);
    
    let activeSession = existingSession;
    let gameEnded = false;

    // Check if majority of spot players are in FC - start or continue game
    if (playersOnlineFC.length >= majorityThreshold && spotPlayersWithXbox.length >= 2) {
      if (!existingSession) {
        // Start new game session
        const sessionPlayers = playersOnlineFC.map(p => ({
          discord_user_id: p.discord_user_id,
          xbox_gamertag: p.xbox_gamertag,
          position: spot_players.find(sp => sp.discord_user_id === p.discord_user_id)?.position || 'unknown'
        }));

        const { data: newSession, error: insertError } = await supabase
          .from('active_game_sessions')
          .insert({
            guild_id,
            club_key: primaryClubKey,
            player_count: playersOnlineFC.length,
            players: sessionPlayers,
            detected_score: '0-0',
            status: 'in_progress'
          })
          .select()
          .single();

        if (insertError) {
          console.error('[check-xbox-presence] Error creating session:', insertError);
        } else {
          activeSession = newSession;
          console.log(`[check-xbox-presence] New game session started for ${guild_id}/${primaryClubKey}`);
        }

        // Also log to historical table
        await supabase.from('xbox_detected_sessions').insert({
          guild_id,
          players: sessionPlayers,
          game_title: 'EA FC 25',
          player_count: playersOnlineFC.length,
        });
      } else {
        // Update existing session player count
        await supabase
          .from('active_game_sessions')
          .update({
            player_count: playersOnlineFC.length,
            players: playersOnlineFC.map(p => ({
              discord_user_id: p.discord_user_id,
              xbox_gamertag: p.xbox_gamertag,
              position: spot_players.find(sp => sp.discord_user_id === p.discord_user_id)?.position || 'unknown'
            }))
          })
          .eq('id', existingSession.id);
      }
    } else if (existingSession && playersOnlineFC.length < majorityThreshold) {
      // Majority left the game - end session
      console.log(`[check-xbox-presence] Majority left game - ending session`);
      
      await supabase
        .from('active_game_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', existingSession.id);

      gameEnded = true;
      activeSession = null;
    }

    return new Response(JSON.stringify({ 
      playersOnline: playersOnlineFC,
      allPresence: allPresenceResults,
      totalChecked: profiles.length,
      activeSession,
      gameEnded,
      club_key: primaryClubKey
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[check-xbox-presence] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
