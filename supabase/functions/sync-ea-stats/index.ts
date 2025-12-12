import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// EA API Configuration
const EA_PLATFORM_MAP: Record<string, string> = {
  'ps5': 'common-gen5',
  'xbox-series-xs': 'common-gen5',
  'pc': 'common-gen5',
  'ps4': 'common-gen4',
  'xboxone': 'common-gen4'
}

const EA_HEADERS = {
  'accept': 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'dnt': '1',
  'origin': 'https://www.ea.com',
  'referer': 'https://www.ea.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
}

async function fetchMatches(clubId: string, platform: string, matchType: string = 'matchType9') {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  
  try {
    const response = await fetch(`https://proclubs.ea.com/api/fc/clubs/matches?platform=${fcPlatform}&clubIds=${clubId}&matchType=${matchType}&maxResultCount=10`, {
      headers: EA_HEADERS
    })
    
    if (!response.ok) return []
    
    const data = await response.json()
    if (Array.isArray(data)) return data
    if (data?.matches) return data.matches
    return Object.values(data).filter(v => v && typeof v === 'object')
  } catch (err) {
    console.error(`[EA] Error fetching matches for ${clubId}:`, err)
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    console.log('[sync-ea-stats] Starting cron-based EA sync...')
    
    // Get all guild settings with EA-linked clubs
    const { data: guildSettings, error: settingsError } = await supabase
      .from('guild_settings')
      .select('guild_id, clubs')
    
    if (settingsError) {
      throw new Error(`Failed to fetch guild settings: ${settingsError.message}`)
    }
    
    if (!guildSettings || guildSettings.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No guilds to sync',
        synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    let totalSynced = 0
    let totalSkipped = 0
    let guildsProcessed = 0
    
    for (const settings of guildSettings) {
      const guildId = settings.guild_id
      const clubs = settings.clubs as any[]
      
      if (!clubs || !Array.isArray(clubs)) continue
      
      for (const club of clubs) {
        // Only sync clubs with EA linking and monitoring enabled
        if (!club.ea_club_id || !club.ea_platform || !club.monitoring_enabled) {
          continue
        }
        
        console.log(`[sync-ea-stats] Syncing ${club.name} (${club.ea_club_id}) for guild ${guildId}`)
        
        try {
          // Fetch recent matches
          const matches = await fetchMatches(club.ea_club_id, club.ea_platform)
          
          if (!matches || matches.length === 0) continue
          
          // Get existing match IDs
          const { data: existingMatches } = await supabase
            .from('club_matches')
            .select('ea_match_id')
            .eq('guild_id', guildId)
            .eq('club_key', club.key)
          
          const existingIds = new Set((existingMatches || []).map((m: any) => m.ea_match_id))
          
          for (const matchData of matches) {
            const matchId = matchData.matchId?.toString()
            if (!matchId || existingIds.has(matchId)) {
              totalSkipped++
              continue
            }
            
            // Process match
            const ourClubData = matchData.clubs?.[club.ea_club_id]
            const opponentClubId = Object.keys(matchData.clubs || {}).find((id: string) => id !== club.ea_club_id)
            const opponentClubData = opponentClubId ? matchData.clubs[opponentClubId] : null
            
            const scoreFor = parseInt(ourClubData?.goals || 0)
            const scoreAgainst = parseInt(opponentClubData?.goals || 0)
            const opponentName = opponentClubData?.name || 'Unknown'
            
            let result = 'draw'
            if (scoreFor > scoreAgainst) result = 'win'
            else if (scoreFor < scoreAgainst) result = 'loss'
            
            // Extract player stats
            const playerStats: any[] = []
            const players = matchData.players?.[club.ea_club_id] || {}
            
            for (const [eaPlayerId, pStats] of Object.entries(players) as any) {
              playerStats.push({
                ea_username: pStats.playername,
                goals: parseInt(pStats.goals || 0),
                assists: parseInt(pStats.assists || 0),
                rating: parseFloat(pStats.rating || 0),
                position: pStats.pos,
                motm: pStats.mom === '1'
              })
            }
            
            // Insert match
            const { error: insertError } = await supabase.from('club_matches').insert({
              guild_id: guildId,
              club_key: club.key,
              ea_match_id: matchId,
              match_type: 'division',
              result,
              score_for: scoreFor,
              score_against: scoreAgainst,
              opponent_club_name: opponentName,
              opponent_club_id: opponentClubId,
              match_data: matchData,
              player_stats: playerStats
            })
            
            if (insertError) {
              console.error(`[sync-ea-stats] Failed to insert match ${matchId}:`, insertError.message)
              continue
            }
            
            // Record player stats for linked players
            for (const pStat of playerStats) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('discord_user_id')
                .eq('ea_username', pStat.ea_username)
                .maybeSingle()
              
              if (profile) {
                await supabase.from('player_stats').insert({
                  guild_id: guildId,
                  discord_user_id: profile.discord_user_id,
                  draft_id: null,
                  match_type: 'club',
                  goals: pStat.goals,
                  assists: pStat.assists,
                  clean_sheet: pStat.position === 'GK' && scoreAgainst === 0,
                  won: result === 'win',
                  ea_match_rating: pStat.rating,
                  position_played: pStat.position,
                  man_of_match: pStat.motm
                })
                
                // Trigger rating recalculation
                await supabase.functions.invoke('calculate-ratings', {
                  body: { guild_id: guildId, discord_user_id: profile.discord_user_id }
                })
              }
            }
            
            totalSynced++
            existingIds.add(matchId)
          }
          
          guildsProcessed++
        } catch (clubErr) {
          console.error(`[sync-ea-stats] Error syncing club ${club.name}:`, clubErr)
        }
      }
    }
    
    console.log(`[sync-ea-stats] Completed: ${totalSynced} synced, ${totalSkipped} skipped, ${guildsProcessed} guilds processed`)
    
    return new Response(JSON.stringify({ 
      success: true,
      synced: totalSynced,
      skipped: totalSkipped,
      guilds_processed: guildsProcessed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sync-ea-stats] Error:', error)
    return new Response(JSON.stringify({ 
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
