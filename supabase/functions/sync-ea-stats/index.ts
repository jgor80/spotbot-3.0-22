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
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Referer': 'https://www.ea.com/games/ea-sports-fc/clubs',
  'Origin': 'https://www.ea.com',
  'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
}

// Fetch match history with player stats
async function fetchMatches(clubId: string, platform: string, matchType: string = 'matchType9') {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  const url = `https://proclubs.ea.com/api/fc/clubs/matches?platform=${fcPlatform}&clubIds=${clubId}&matchType=${matchType}&maxResultCount=10`
  
  try {
    console.log(`[EA] Fetching matches from: ${url}`)
    const response = await fetch(url, { headers: EA_HEADERS })
    
    if (!response.ok) {
      console.error(`[EA] Matches request failed: ${response.status} ${response.statusText}`)
      return []
    }
    
    const data = await response.json()
    console.log(`[EA] Matches response type: ${typeof data}, isArray: ${Array.isArray(data)}`)
    
    if (Array.isArray(data)) return data
    if (data?.matches) return data.matches
    return Object.values(data).filter(v => v && typeof v === 'object')
  } catch (err) {
    console.error(`[EA] Error fetching matches for ${clubId}:`, err)
    return []
  }
}

// Fetch club info (skill rating, record, goals)
async function fetchClubInfo(clubId: string, platform: string) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  
  try {
    const response = await fetch(`https://proclubs.ea.com/api/fc/clubs/info?platform=${fcPlatform}&clubIds=${clubId}`, {
      headers: EA_HEADERS
    })
    
    if (!response.ok) {
      console.error(`[EA] Club info request failed: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    if (Array.isArray(data) && data.length > 0) return data[0]
    if (data[clubId]) return data[clubId]
    return data
  } catch (err) {
    console.error(`[EA] Error fetching club info for ${clubId}:`, err)
    return null
  }
}

// Fetch club member list with stats
async function fetchClubMembers(clubId: string, platform: string) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  
  try {
    const response = await fetch(`https://proclubs.ea.com/api/fc/members/stats?platform=${fcPlatform}&clubId=${clubId}`, {
      headers: EA_HEADERS
    })
    
    if (!response.ok) {
      console.error(`[EA] Club members request failed: ${response.status}`)
      return []
    }
    
    const data = await response.json()
    if (data?.members && Array.isArray(data.members)) return data.members
    if (Array.isArray(data)) return data
    return Object.values(data).filter(v => v && typeof v === 'object')
  } catch (err) {
    console.error(`[EA] Error fetching club members for ${clubId}:`, err)
    return []
  }
}

// Sync club stats to database
async function syncClubStats(supabase: any, guildId: string, clubKey: string, clubId: string, platform: string) {
  try {
    const clubInfo = await fetchClubInfo(clubId, platform)
    if (!clubInfo) return null
    
    const clubData = {
      guild_id: guildId,
      club_key: clubKey,
      ea_club_id: clubId,
      ea_platform: platform,
      skill_rating: parseInt(clubInfo.skillRating || clubInfo.skill_rating || 0),
      wins: parseInt(clubInfo.wins || 0),
      draws: parseInt(clubInfo.draws || clubInfo.ties || 0),
      losses: parseInt(clubInfo.losses || 0),
      goals_scored: parseInt(clubInfo.goals || clubInfo.goalsFor || 0),
      goals_conceded: parseInt(clubInfo.goalsAgainst || 0),
      total_members: parseInt(clubInfo.memberCount || clubInfo.members || 0),
      best_division: clubInfo.bestDivision || clubInfo.divisionName || null,
      club_name: clubInfo.name || clubInfo.clubName || null,
      last_synced_at: new Date().toISOString()
    }
    
    const { error } = await supabase
      .from('club_stats')
      .upsert(clubData, { onConflict: 'guild_id,club_key' })
    
    if (error) {
      console.error(`[sync-ea-stats] Failed to sync club stats:`, error.message)
      return null
    }
    
    console.log(`[sync-ea-stats] Synced club stats for ${clubData.club_name}: ${clubData.skill_rating} SR`)
    return clubData
  } catch (err) {
    console.error(`[sync-ea-stats] Error syncing club stats:`, err)
    return null
  }
}

// Sync member career stats to player_ratings and player_summary
async function syncMemberStats(supabase: any, guildId: string, clubId: string, platform: string, clubName: string) {
  try {
    const members = await fetchClubMembers(clubId, platform)
    if (!members || members.length === 0) {
      console.log(`[sync-ea-stats] No members found for ${clubName}`)
      return { synced: 0, updatedPlayerIds: [] }
    }
    
    let synced = 0
    const updatedPlayerIds: string[] = []
    
    const positionMap: Record<string, string> = {
      'goalkeeper': 'GK', 'gk': 'GK',
      'defender': 'CB', 'cb': 'CB', 'rb': 'RB', 'lb': 'LB', 'rwb': 'RWB', 'lwb': 'LWB',
      'midfielder': 'CM', 'cm': 'CM', 'cdm': 'CDM', 'cam': 'CAM', 'rm': 'RM', 'lm': 'LM',
      'attacker': 'ST', 'st': 'ST', 'cf': 'CF', 'rw': 'RW', 'lw': 'LW', 'rf': 'RF', 'lf': 'LF'
    }
    
    for (const member of members) {
      const eaUsername = member.name || member.playerName
      if (!eaUsername) continue
      
      // Find profile for this EA username
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id, discord_username')
        .eq('ea_username', eaUsername)
        .maybeSingle()
      
      if (!profile || profile.discord_user_id.startsWith('ea_')) continue
      
      // Extract aggregate stats from EA member data
      const goals = parseInt(member.goals || 0)
      const assists = parseInt(member.assists || 0)
      const gamesPlayed = parseInt(member.gamesPlayed || member.matches || 0)
      const wins = parseInt(member.wins || 0)
      const losses = parseInt(member.losses || 0)
      const draws = gamesPlayed - wins - losses
      const avgRating = parseFloat(member.ratingAve || member.avgRating || 0)
      const cleanSheets = parseInt(member.cleanSheetsDef || member.cleanSheetsGK || member.cleanSheets || 0)
      const manOfMatch = parseInt(member.manOfTheMatch || member.mom || 0)
      const position = member.favoritePosition || member.proPos || null
      const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0
      
      // Calculate club performance rating
      const clubPerformanceRating = Math.min(100, Math.max(0,
        (avgRating * 10) +
        (winRate * 0.3) +
        (goals / Math.max(1, gamesPlayed) * 10) +
        (assists / Math.max(1, gamesPlayed) * 5)
      ))
      
      // Update player_ratings
      const { data: existingRating } = await supabase
        .from('player_ratings')
        .select('id')
        .eq('guild_id', guildId)
        .eq('discord_user_id', profile.discord_user_id)
        .maybeSingle()
      
      if (existingRating) {
        await supabase
          .from('player_ratings')
          .update({
            games_played: gamesPlayed,
            wins: wins,
            losses: losses,
            draws: draws,
            total_goals: goals,
            total_assists: assists,
            total_clean_sheets: cleanSheets,
            total_motm: manOfMatch,
            club_performance_rating: clubPerformanceRating,
            last_game_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRating.id)
      } else {
        await supabase
          .from('player_ratings')
          .insert({
            guild_id: guildId,
            discord_user_id: profile.discord_user_id,
            games_played: gamesPlayed,
            wins: wins,
            losses: losses,
            draws: draws,
            total_goals: goals,
            total_assists: assists,
            total_clean_sheets: cleanSheets,
            total_motm: manOfMatch,
            club_performance_rating: clubPerformanceRating,
            overall_rating: clubPerformanceRating,
            last_game_at: new Date().toISOString()
          })
      }
      
      // Update player_summary
      const normalizedPosition = position ? (positionMap[position.toLowerCase()] || position.toUpperCase()) : null
      
      const { data: existingSummary } = await supabase
        .from('player_summary')
        .select('id')
        .eq('guild_id', guildId)
        .eq('discord_user_id', profile.discord_user_id)
        .maybeSingle()
      
      const summaryData = {
        guild_id: guildId,
        discord_user_id: profile.discord_user_id,
        discord_username: profile.discord_username || eaUsername,
        games_played: gamesPlayed,
        wins: wins,
        goals: goals,
        assists: assists,
        win_rate: winRate,
        overall_rating: clubPerformanceRating,
        primary_position: normalizedPosition,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      if (existingSummary) {
        await supabase.from('player_summary').update(summaryData).eq('id', existingSummary.id)
      } else {
        await supabase.from('player_summary').insert(summaryData)
      }
      
      updatedPlayerIds.push(profile.discord_user_id)
      synced++
      console.log(`[sync-ea-stats] Updated ${eaUsername}: ${gamesPlayed}G ${wins}W ${goals}g ${assists}a`)
    }
    
    return { synced, updatedPlayerIds }
  } catch (err) {
    console.error(`[sync-ea-stats] Error syncing member stats:`, err)
    return { synced: 0, updatedPlayerIds: [] }
  }
}

// Auto-detect player position preferences based on most-played positions
async function updatePlayerPositionPreferences(supabase: any, guildId: string, discordUserId: string) {
  try {
    const { data: stats } = await supabase
      .from('player_stats')
      .select('position_played')
      .eq('guild_id', guildId)
      .eq('discord_user_id', discordUserId)
      .not('position_played', 'is', null)
    
    if (!stats || stats.length === 0) return
    
    const positionCounts: Record<string, number> = {}
    for (const stat of stats) {
      const pos = stat.position_played
      if (pos) {
        positionCounts[pos] = (positionCounts[pos] || 0) + 1
      }
    }
    
    const sortedPositions = Object.entries(positionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pos]) => pos)
    
    if (sortedPositions.length === 0) return
    
    await supabase
      .from('position_preferences')
      .upsert({
        guild_id: guildId,
        user_id: discordUserId,
        preferences: sortedPositions,
        updated_at: new Date().toISOString()
      }, { onConflict: 'guild_id,user_id' })
  } catch (err) {
    console.error(`[sync-ea-stats] Error updating position preferences:`, err)
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
    
    // Parse request body for sync type
    let syncType = 'full'
    try {
      const body = await req.json()
      syncType = body.sync_type || 'full'
    } catch { /* ignore parse errors */ }
    
    console.log(`[sync-ea-stats] Starting ${syncType} EA sync...`)
    
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
    let clubStatsSynced = 0
    let memberStatsSynced = 0
    const allUpdatedPlayerIds: string[] = []
    
    for (const settings of guildSettings) {
      const guildId = settings.guild_id
      const clubs = settings.clubs as any[]
      
      if (!clubs || !Array.isArray(clubs)) continue
      
      for (const club of clubs) {
        if (!club.ea_club_id || !club.ea_platform || !club.monitoring_enabled) {
          continue
        }
        
        console.log(`[sync-ea-stats] Syncing ${club.name} (${club.ea_club_id}) for guild ${guildId}`)
        
        try {
          // Sync club stats
          const clubStatsResult = await syncClubStats(supabase, guildId, club.key, club.ea_club_id, club.ea_platform)
          if (clubStatsResult) clubStatsSynced++
          
          // Sync member career stats (pulls from EA member list API)
          const { synced: membersSynced, updatedPlayerIds } = await syncMemberStats(
            supabase, guildId, club.ea_club_id, club.ea_platform, club.name
          )
          memberStatsSynced += membersSynced
          allUpdatedPlayerIds.push(...updatedPlayerIds)
          
          // Also sync recent matches for match-by-match tracking
          if (syncType === 'full') {
            const matches = await fetchMatches(club.ea_club_id, club.ea_platform)
            
            if (matches && matches.length > 0) {
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
                
                const ourClubData = matchData.clubs?.[club.ea_club_id]
                const opponentClubId = Object.keys(matchData.clubs || {}).find((id: string) => id !== club.ea_club_id)
                const opponentClubData = opponentClubId ? matchData.clubs[opponentClubId] : null
                
                const scoreFor = parseInt(ourClubData?.goals || 0)
                const scoreAgainst = parseInt(opponentClubData?.goals || 0)
                
                let result = 'draw'
                if (scoreFor > scoreAgainst) result = 'win'
                else if (scoreFor < scoreAgainst) result = 'loss'
                
                const playerStats: any[] = []
                const players = matchData.players?.[club.ea_club_id] || {}
                
                for (const [, pStats] of Object.entries(players) as any) {
                  playerStats.push({
                    ea_username: pStats.playername,
                    goals: parseInt(pStats.goals || 0),
                    assists: parseInt(pStats.assists || 0),
                    rating: parseFloat(pStats.rating || 0),
                    position: pStats.pos,
                    motm: pStats.mom === '1',
                    shots: parseInt(pStats.shots || 0),
                    tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
                    passes_made: parseInt(pStats.passesmade || 0),
                    pass_attempts: parseInt(pStats.passattempts || 0),
                    red_cards: pStats.redcards === '1'
                  })
                }
                
                const { error: insertError } = await supabase.from('club_matches').insert({
                  guild_id: guildId,
                  club_key: club.key,
                  ea_match_id: matchId,
                  match_type: 'division',
                  result,
                  score_for: scoreFor,
                  score_against: scoreAgainst,
                  opponent_club_name: opponentClubData?.name || 'Unknown',
                  opponent_club_id: opponentClubId,
                  match_data: matchData,
                  player_stats: playerStats
                })
                
                if (!insertError) {
                  totalSynced++
                  existingIds.add(matchId)
                  
                  // Record player stats
                  for (const pStat of playerStats) {
                    const { data: profile } = await supabase
                      .from('profiles')
                      .select('discord_user_id')
                      .eq('ea_username', pStat.ea_username)
                      .maybeSingle()
                    
                    if (profile && !profile.discord_user_id.startsWith('ea_')) {
                      await supabase.from('player_stats').insert({
                        guild_id: guildId,
                        discord_user_id: profile.discord_user_id,
                        ea_match_id: matchId,
                        match_type: 'club',
                        goals: pStat.goals,
                        assists: pStat.assists,
                        clean_sheet: pStat.position === 'GK' && scoreAgainst === 0,
                        won: result === 'win',
                        ea_match_rating: pStat.rating,
                        position_played: pStat.position,
                        man_of_match: pStat.motm,
                        shots: pStat.shots,
                        tackles: pStat.tackles,
                        passes_made: pStat.passes_made,
                        pass_attempts: pStat.pass_attempts,
                        red_cards: pStat.red_cards
                      })
                      
                      await updatePlayerPositionPreferences(supabase, guildId, profile.discord_user_id)
                    }
                  }
                }
              }
            }
          }
          
          guildsProcessed++
        } catch (clubErr) {
          console.error(`[sync-ea-stats] Error syncing club ${club.name}:`, clubErr)
        }
      }
    }
    
    // Trigger rating recalculation for all updated players
    const uniquePlayerIds = [...new Set(allUpdatedPlayerIds)]
    if (uniquePlayerIds.length > 0) {
      console.log(`[sync-ea-stats] Triggering rating recalculation for ${uniquePlayerIds.length} players`)
      // Group by guild and trigger recalculation
      for (const settings of guildSettings) {
        const guildPlayerIds = uniquePlayerIds.filter(async (id) => {
          const { data } = await supabase
            .from('player_ratings')
            .select('id')
            .eq('guild_id', settings.guild_id)
            .eq('discord_user_id', id)
            .maybeSingle()
          return !!data
        })
        
        if (guildPlayerIds.length > 0) {
          await supabase.functions.invoke('calculate-ratings', {
            body: { guild_id: settings.guild_id, player_ids: guildPlayerIds, trigger: 'ea_sync' }
          })
        }
      }
    }
    
    console.log(`[sync-ea-stats] Completed: ${totalSynced} matches, ${memberStatsSynced} members, ${clubStatsSynced} clubs`)
    
    return new Response(JSON.stringify({ 
      success: true,
      synced: totalSynced,
      skipped: totalSkipped,
      club_stats_synced: clubStatsSynced,
      member_stats_synced: memberStatsSynced,
      guilds_processed: guildsProcessed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sync-ea-stats] Error:', error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})