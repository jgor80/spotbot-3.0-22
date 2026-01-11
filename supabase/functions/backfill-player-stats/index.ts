import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// EA Event Code mapping (Opta-style event IDs used by EA)
// These are encoded in match_event_aggregate fields as "eventId:count" pairs
// VALIDATED: Code 50 is GK saves (diving), NOT second_assists - confirmed via correlation
const EA_EVENT_CODES: Record<number, string> = {
  1: 'passes',           // Pass events
  3: 'takeOns',          // Dribble attempts (take-ons)
  6: 'clearances',       // Clearances (confirmed for defenders - 422+ occurrences)
  7: 'tackleEvents',     // Tackle events (may differ from tacklesmade)
  8: 'interceptions',    // Interceptions (confirmed - 460+ occurrences)
  10: 'savesStandard',   // GK saves (standard type) - confirmed via correlation
  13: 'shots',           // Shot attempts - validated vs boxscore
  16: 'goals',           // Goal events
  44: 'aerialDuels',     // Aerial duels
  49: 'ballRecoveries',  // Ball recoveries
  50: 'savesDiving',     // GK diving saves (subtype) - FIX: was incorrectly mapped to secondAssists
  61: 'blocks',          // Blocks
  267: 'goodDirectionSaves', // GK good direction saves - matches goodDirectionSaves field
}

// Parse event aggregate strings to extract hidden stats
function parseEventAggregate(
  agg0?: string,
  agg1?: string,
  agg2?: string,
  agg3?: string
): Record<string, number> {
  const result: Record<string, number> = {}
  
  const combined = [agg0, agg1, agg2, agg3]
    .filter((s): s is string => Boolean(s) && typeof s === 'string')
    .join(',')
  
  if (!combined) return result
  
  const pairs = combined.split(',').filter(Boolean)
  
  for (const pair of pairs) {
    const [eventIdStr, countStr] = pair.split(':')
    if (!eventIdStr || !countStr) continue
    
    const eventId = parseInt(eventIdStr, 10)
    const count = parseInt(countStr, 10)
    
    if (isNaN(eventId) || isNaN(count)) continue
    
    const eventName = EA_EVENT_CODES[eventId]
    if (eventName) {
      result[eventName] = (result[eventName] || 0) + count
    }
  }
  
  return result
}

// Backfill player_stats with detailed GK and defensive stats from club_matches match_data
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    let requestBody: any = {}
    try {
      requestBody = await req.json()
    } catch { /* ignore parse errors */ }
    
    const guildId = requestBody.guild_id
    const dryRun = requestBody.dry_run === true
    
    console.log(`[backfill-player-stats] Starting backfill${dryRun ? ' (DRY RUN)' : ''}...`)
    
    // Get all club_matches with match_data
    let query = supabase
      .from('club_matches')
      .select('id, guild_id, club_key, ea_match_id, match_data, result, score_against')
      .not('match_data', 'is', null)
    
    if (guildId) {
      query = query.eq('guild_id', guildId)
    }
    
    const { data: matches, error: matchError } = await query
    
    if (matchError) {
      throw new Error(`Failed to fetch club_matches: ${matchError.message}`)
    }
    
    if (!matches || matches.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No matches to backfill',
        updated: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log(`[backfill-player-stats] Processing ${matches.length} matches...`)
    
    // Fetch all profiles at once for EA username lookup
    const { data: profiles } = await supabase
      .from('profiles')
      .select('discord_user_id, ea_username')
      .not('ea_username', 'is', null)
    
    const eaUsernameToDiscordId = new Map<string, string>()
    profiles?.forEach(p => {
      if (p.ea_username && !p.discord_user_id.startsWith('ea_')) {
        eaUsernameToDiscordId.set(p.ea_username.toLowerCase(), p.discord_user_id)
      }
    })
    
    console.log(`[backfill-player-stats] Loaded ${eaUsernameToDiscordId.size} EA username mappings`)
    
    // Fetch all existing player_stats for the matches
    const eaMatchIds = matches.map(m => m.ea_match_id)
    const { data: existingStats } = await supabase
      .from('player_stats')
      .select('id, guild_id, discord_user_id, ea_match_id')
      .in('ea_match_id', eaMatchIds)
    
    // Create lookup map: guild_id + discord_user_id + ea_match_id -> stat id
    const statLookup = new Map<string, string>()
    existingStats?.forEach(stat => {
      const key = `${stat.guild_id}:${stat.discord_user_id}:${stat.ea_match_id}`
      statLookup.set(key, stat.id)
    })
    
    console.log(`[backfill-player-stats] Loaded ${statLookup.size} existing player_stats records`)
    
    // Collect all updates
    const updates: Array<{id: string, data: any}> = []
    let totalSkipped = 0
    
    for (const match of matches) {
      const matchData = match.match_data as any
      if (!matchData?.players) {
        totalSkipped++
        continue
      }
      
      const clubIds = Object.keys(matchData.players || {})
      
      for (const clubId of clubIds) {
        const players = matchData.players[clubId]
        if (!players) continue
        
        for (const [playerId, pStats] of Object.entries(players) as any) {
          const eaUsername = pStats.playername
          if (!eaUsername) continue
          
          // Find discord user id from EA username
          const discordUserId = eaUsernameToDiscordId.get(eaUsername.toLowerCase())
          if (!discordUserId) continue
          
          // Find existing player_stats record
          const lookupKey = `${match.guild_id}:${discordUserId}:${match.ea_match_id}`
          const statId = statLookup.get(lookupKey)
          
          if (!statId) {
            totalSkipped++
            continue
          }
          
          // Parse event aggregates to extract hidden stats
          const eventStats = parseEventAggregate(
            pStats.match_event_aggregate_0,
            pStats.match_event_aggregate_1,
            pStats.match_event_aggregate_2,
            pStats.match_event_aggregate_3
          )
          
          // Extract detailed stats - prefer event aggregates over direct fields
          const interceptions = eventStats.interceptions || parseInt(pStats.interceptions || 0)
          const clearances = eventStats.clearances || parseInt(pStats.clearances || 0)
          const secondAssists = eventStats.secondAssists || parseInt(pStats.secondAssists || pStats.secondassists || 0)
          const dribbles = eventStats.takeOns || parseInt(pStats.dribblewon || pStats.dribbles || 0)
          const ballRecoveries = eventStats.ballRecoveries || 0
          
          // Extract detailed GK stats
          const savesDiving = parseInt(pStats.ballDiveSaves || pStats.ballDivesaves || 0)
          const savesCross = parseInt(pStats.crossSaves || pStats.crosssaves || 0)
          const savesParry = parseInt(pStats.parrySaves || pStats.parrysaves || 0)
          const savesPunch = parseInt(pStats.punchSaves || pStats.punchsaves || 0)
          const savesReflex = parseInt(pStats.reflexSaves || pStats.reflexsaves || 0)
          const goalsConceeded = parseInt(pStats.goalsconceded || pStats.goalsConceded || 0)
          const tackleAttempts = parseInt(pStats.tackleattempts || pStats.tackleAttempts || 0)
          
          // Position-specific clean sheets from EA API
          const isCleanSheetDef = pStats.cleansheetsdef === '1' || pStats.cleansheetsany === '1'
          const isCleanSheetGK = pStats.cleansheetsgk === '1' || pStats.cleansheetsany === '1'
          const isCleanSheet = isCleanSheetDef || isCleanSheetGK
          
          const updateData: any = {
            saves_diving: savesDiving,
            saves_cross: savesCross,
            saves_parry: savesParry,
            saves_punch: savesPunch,
            saves_reflex: savesReflex,
            goals_conceded: goalsConceeded,
            tackle_attempts: tackleAttempts,
            interceptions: interceptions,
            clearances: clearances,
            second_assists: secondAssists,
            dribbles: dribbles,
            fouls: parseInt(pStats.fouls || pStats.foulcommited || 0),
            offsides: parseInt(pStats.offsides || 0),
            archetypeid: pStats.archetypeid || pStats.archetypeId || null,
            clean_sheet: isCleanSheet,
            clean_sheet_def: isCleanSheetDef,
            clean_sheet_gk: isCleanSheetGK
          }
          
          updates.push({ id: statId, data: updateData })
        }
      }
    }
    
    console.log(`[backfill-player-stats] Found ${updates.length} records to update, ${totalSkipped} skipped`)
    
    let totalUpdated = 0
    const errors: string[] = []
    
    if (!dryRun && updates.length > 0) {
      // Batch updates in chunks of 50
      const chunkSize = 50
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize)
        
        // Execute updates in parallel within chunk
        const results = await Promise.all(
          chunk.map(async ({ id, data }) => {
            const { error } = await supabase
              .from('player_stats')
              .update(data)
              .eq('id', id)
            return { id, error }
          })
        )
        
        for (const result of results) {
          if (result.error) {
            errors.push(`Failed to update ${result.id}: ${result.error.message}`)
          } else {
            totalUpdated++
          }
        }
        
        console.log(`[backfill-player-stats] Progress: ${Math.min(i + chunkSize, updates.length)}/${updates.length}`)
      }
    } else if (dryRun) {
      totalUpdated = updates.length
    }
    
    console.log(`[backfill-player-stats] Completed: ${totalUpdated} updated, ${totalSkipped} skipped, ${errors.length} errors`)
    
    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      total_matches: matches.length,
      records_to_update: updates.length,
      updated: totalUpdated,
      skipped: totalSkipped,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[backfill-player-stats] Error:', error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
