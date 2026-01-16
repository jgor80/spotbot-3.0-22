import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// EA Event Code mapping (Opta-style event IDs used by EA)
// These are encoded in match_event_aggregate fields as "eventId:count" pairs
// Updated: 2026-01-11 via analyze-event-codes discovery
const EA_EVENT_CODES: Record<number, string> = {
  // Defensive stats
  0: 'tackleAttempts',     // Discovered: r=0.93 with tackles
  6: 'clearances',         // Confirmed: 100% correlation
  7: 'tackleEvents',       // Tackle events
  8: 'interceptions',      // Confirmed: 100% correlation
  49: 'ballRecoveries',    // Ball recoveries
  61: 'blocks',            // Blocks
  121: 'tackleSuccess',    // Discovered: r=0.698 with tackles - successful tackles
  158: 'defensiveActions', // Discovered: combined defensive actions
  163: 'ballRecoveriesLoose', // Discovered: r=0.81 with tackles
  164: 'recoveriesOppHalf',   // Discovered: r=0.97 with tackles
  229: 'successfulTackles',   // Discovered: r=0.690 with tackles (mirror of 121)
  
  // Passing stats
  1: 'passes',             // Pass events
  24: 'passesCompleted',   // Discovered: r=0.525 with passes_made
  30: 'passesAttempted',   // Discovered: r=0.477 with passes_made
  174: 'forwardPasses',    // Discovered: r=0.65 with passes_made
  176: 'possessionGains',  // Discovered: r=0.80 with passes_made
  215: 'passAttempts',     // Discovered: r=1.0 with passes
  
  // Attacking stats
  3: 'takeOns',            // Dribble attempts (take-ons)
  11: 'assistEvents',      // Discovered: r=0.943 with assists
  12: 'goalsOpenPlay',     // Discovered: r=0.42 with goals
  13: 'shots',             // Confirmed: 100% correlation
  14: 'shotsInBox',        // Discovered: r=0.60 with shots
  16: 'goals',             // Goal events
  106: 'aerialDuelsWon',   // Discovered: r=0.98 with goals
  118: 'assistChances',    // Discovered: r=0.41 with assists - chances created
  131: 'goalsInsideBox',   // Discovered: goals from inside box
  177: 'shotsOnTarget',    // Discovered: r=0.495 with shots
  214: 'goalsDirect',      // Discovered: r=0.978 with goals
  217: 'shotsOffTarget',   // Discovered: r=0.70 with shots
  218: 'shotAttempts',     // Discovered: total shot attempts
  
  // Duel stats
  44: 'aerialDuels',       // Aerial duels total
  100: 'groundDuelsTotal', // Ground duels total
  101: 'groundDuelsWon',   // Ground duels won
  105: 'aerialDuelsTotal', // Aerial duels total
  107: 'looseBallDuels',   // Loose ball duels
  
  // GK stats
  10: 'savesStandard',     // Confirmed: 100% correlation with saves
  50: 'savesDiving',       // GK diving saves
  99: 'gkClaims',          // Discovered: GK catches/claims
  267: 'goodDirectionSaves', // Confirmed: 100% correlation
  
  // Meta
  113: 'matchPlayed',      // Match played marker
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
          
          // NEW: Extract newly discovered stats
          const passesCompleted = eventStats.passesCompleted || 0
          const shotsOnTarget = eventStats.shotsOnTarget || 0
          const tackleSuccess = eventStats.tackleSuccess || eventStats.successfulTackles || 0
          const gkClaims = eventStats.gkClaims || 0
          const goalsInsideBox = eventStats.goalsInsideBox || 0
          const defensiveActions = eventStats.defensiveActions || 0
          
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
            clean_sheet_gk: isCleanSheetGK,
            // NEW: Add newly discovered stats
            passes_completed: passesCompleted,
            shots_on_target: shotsOnTarget,
            tackle_success: tackleSuccess,
            gk_claims: gkClaims,
            goals_inside_box: goalsInsideBox,
            defensive_actions: defensiveActions
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
