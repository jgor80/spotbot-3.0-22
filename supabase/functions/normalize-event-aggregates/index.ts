import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Categorize position for analysis - handles both full names and abbreviations
function categorizePosition(pos: string | null): string {
  if (!pos) return 'unknown'
  const lower = pos.toLowerCase()
  
  // Handle full position names from EA match data
  if (lower === 'goalkeeper') return 'gk'
  if (lower === 'defender') return 'defender'
  if (lower === 'midfielder') return 'midfielder'
  if (lower === 'forward') return 'forward'
  
  // Handle abbreviations (for legacy/other sources)
  const upper = pos.toUpperCase()
  if (upper === 'GK') return 'gk'
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'LCB', 'RCB', 'SW'].includes(upper)) return 'defender'
  if (['CDM', 'CM', 'CAM', 'LM', 'RM', 'LCM', 'RCM'].includes(upper)) return 'midfielder'
  if (['ST', 'CF', 'LW', 'RW', 'LF', 'RF', 'LS', 'RS'].includes(upper)) return 'forward'
  
  return 'unknown'
}

// Parse event aggregate strings to extract individual event codes
function parseEventAggregates(
  agg0?: string,
  agg1?: string,
  agg2?: string,
  agg3?: string
): Map<number, number> {
  const result = new Map<number, number>()
  
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
    
    result.set(eventId, (result.get(eventId) || 0) + count)
  }
  
  return result
}

// Normalize all event aggregates from club_matches into event_code_occurrences table
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
    const clearExisting = requestBody.clear_existing === true
    const offset = requestBody.offset || 0
    const batchSize = requestBody.batch_size || 500
    
    console.log(`[normalize-event-aggregates] Starting${dryRun ? ' (DRY RUN)' : ''} offset=${offset} batch=${batchSize}...`)
    
    // Clear existing data if requested (only on first batch)
    if (clearExisting && offset === 0) {
      console.log('[normalize-event-aggregates] Clearing existing event_code_occurrences data...')
      const { error: deleteError, count: deletedCount } = await supabase
        .from('event_code_occurrences')
        .delete()
        .gte('id', '00000000-0000-0000-0000-000000000000')
      
      if (deleteError) {
        console.error('[normalize-event-aggregates] Failed to clear existing data:', deleteError)
      } else {
        console.log(`[normalize-event-aggregates] Cleared existing data`)
      }
    }
    
    // Fetch profiles for EA username mapping
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
    
    console.log(`[normalize-event-aggregates] Loaded ${eaUsernameToDiscordId.size} EA username mappings`)
    
    // Get club_matches with match_data using pagination
    let query = supabase
      .from('club_matches')
      .select('id, guild_id, club_key, ea_match_id, match_data')
      .not('match_data', 'is', null)
      .order('id')
      .range(offset, offset + batchSize - 1)
    
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
        message: 'No more matches to process',
        processed: 0,
        pagination: {
          offset: offset,
          batch_size: batchSize,
          has_more: false
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log(`[normalize-event-aggregates] Processing ${matches.length} matches (offset ${offset})...`)
    
    // Collect all occurrences
    const occurrences: Array<{
      ea_match_id: string
      guild_id: string
      discord_user_id: string | null
      ea_username: string
      position_played: string | null
      event_code: number
      count: number
      goals: number | null
      assists: number | null
      shots: number | null
      tackles: number | null
      saves: number | null
      passes_made: number | null
      pass_attempts: number | null
      rating: number | null
    }> = []
    
    const eventCodeTotals = new Map<number, number>()
    let playersProcessed = 0
    
    for (const match of matches) {
      const matchData = match.match_data as any
      if (!matchData?.players) continue
      
      const clubIds = Object.keys(matchData.players || {})
      
      for (const clubId of clubIds) {
        const players = matchData.players[clubId]
        if (!players) continue
        
        for (const [playerId, pStats] of Object.entries(players) as any) {
          const eaUsername = pStats.playername
          if (!eaUsername) continue
          
          playersProcessed++
          
          // Parse event aggregates
          const eventCodes = parseEventAggregates(
            pStats.match_event_aggregate_0,
            pStats.match_event_aggregate_1,
            pStats.match_event_aggregate_2,
            pStats.match_event_aggregate_3
          )
          
          if (eventCodes.size === 0) continue
          
          // Get discord user id if linked
          const discordUserId = eaUsernameToDiscordId.get(eaUsername.toLowerCase()) || null
          
          // Extract boxscore stats for correlation
          const goals = parseInt(pStats.goals || 0)
          const assists = parseInt(pStats.assists || 0)
          const shots = parseInt(pStats.shots || 0)
          const tackles = parseInt(pStats.tacklesmade || pStats.tackles || 0)
          const saves = parseInt(pStats.saves || pStats.gksaves || 0)
          const passesMade = parseInt(pStats.passesmade || pStats.passesMade || 0)
          const passAttempts = parseInt(pStats.passattempts || pStats.passAttempts || 0)
          const rating = parseFloat(pStats.rating || 0)
          const positionPlayed = pStats.pos || pStats.position || null
          
          // Create occurrence for each event code
          for (const [eventCode, count] of eventCodes) {
            occurrences.push({
              ea_match_id: match.ea_match_id,
              guild_id: match.guild_id,
              discord_user_id: discordUserId,
              ea_username: eaUsername,
              position_played: categorizePosition(positionPlayed),
              event_code: eventCode,
              count: count,
              goals: goals,
              assists: assists,
              shots: shots,
              tackles: tackles,
              saves: saves,
              passes_made: passesMade,
              pass_attempts: passAttempts,
              rating: rating > 0 ? rating : null
            })
            
            eventCodeTotals.set(eventCode, (eventCodeTotals.get(eventCode) || 0) + count)
          }
        }
      }
    }
    
    console.log(`[normalize-event-aggregates] Found ${occurrences.length} occurrences from ${playersProcessed} players`)
    console.log(`[normalize-event-aggregates] Unique event codes found: ${eventCodeTotals.size}`)
    
    let inserted = 0
    const errors: string[] = []
    
    if (!dryRun && occurrences.length > 0) {
      // Insert in batches using upsert (on conflict update count)
      const chunkSize = 500
      for (let i = 0; i < occurrences.length; i += chunkSize) {
        const chunk = occurrences.slice(i, i + chunkSize)
        
        const { error: insertError, count } = await supabase
          .from('event_code_occurrences')
          .upsert(chunk, { 
            onConflict: 'ea_match_id,ea_username,event_code',
            ignoreDuplicates: false
          })
        
        if (insertError) {
          errors.push(`Batch ${Math.floor(i / chunkSize)}: ${insertError.message}`)
        } else {
          inserted += chunk.length
        }
        
        console.log(`[normalize-event-aggregates] Progress: ${Math.min(i + chunkSize, occurrences.length)}/${occurrences.length}`)
      }
    } else if (dryRun) {
      inserted = occurrences.length
    }
    
    // Convert event code totals to array for response
    const eventCodeSummary = Array.from(eventCodeTotals.entries())
      .map(([code, total]) => ({ code, total }))
      .sort((a, b) => b.total - a.total)
    
    const hasMore = matches.length === batchSize
    
    console.log(`[normalize-event-aggregates] Completed: ${inserted} inserted, ${errors.length} errors, hasMore=${hasMore}`)
    
    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      matches_processed: matches.length,
      players_processed: playersProcessed,
      occurrences_found: occurrences.length,
      inserted: inserted,
      unique_event_codes: eventCodeTotals.size,
      event_code_summary: eventCodeSummary.slice(0, 50), // Top 50
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      pagination: {
        offset: offset,
        batch_size: batchSize,
        has_more: hasMore,
        next_offset: hasMore ? offset + batchSize : null
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[normalize-event-aggregates] Error:', error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})