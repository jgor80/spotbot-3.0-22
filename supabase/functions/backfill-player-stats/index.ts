import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    
    let totalUpdated = 0
    let totalSkipped = 0
    const errors: string[] = []
    
    for (const match of matches) {
      try {
        const matchData = match.match_data as any
        if (!matchData?.players) {
          totalSkipped++
          continue
        }
        
        // Find our club's player data in the match
        const clubIds = Object.keys(matchData.players || {})
        
        for (const clubId of clubIds) {
          const players = matchData.players[clubId]
          if (!players) continue
          
          for (const [playerId, pStats] of Object.entries(players) as any) {
            const eaUsername = pStats.playername
            if (!eaUsername) continue
            
            // Find profile for this EA username
            const { data: profile } = await supabase
              .from('profiles')
              .select('discord_user_id')
              .eq('ea_username', eaUsername)
              .maybeSingle()
            
            if (!profile || profile.discord_user_id.startsWith('ea_')) continue
            
            // Calculate detailed stats from EA match data
            const savesDiving = parseInt(pStats.ballDiveSaves || pStats.ballDivesaves || 0)
            const savesCross = parseInt(pStats.crossSaves || pStats.crosssaves || 0)
            const savesParry = parseInt(pStats.parrySaves || pStats.parrysaves || 0)
            const savesPunch = parseInt(pStats.punchSaves || pStats.punchsaves || 0)
            const savesReflex = parseInt(pStats.reflexSaves || pStats.reflexsaves || 0)
            const goalsConceeded = parseInt(pStats.goalsconceded || pStats.goalsConceded || 0)
            const tackleAttempts = parseInt(pStats.tackleattempts || pStats.tackleAttempts || 0)
            
            // Clean sheet from EA data
            const isCleanSheet = pStats.cleansheetsany === '1' || pStats.cleansheetsdef === '1' || pStats.cleansheetsgk === '1'
            
            // Find existing player_stats record for this match
            const { data: existingStat } = await supabase
              .from('player_stats')
              .select('id')
              .eq('guild_id', match.guild_id)
              .eq('discord_user_id', profile.discord_user_id)
              .eq('ea_match_id', match.ea_match_id)
              .maybeSingle()
            
            if (!existingStat) {
              totalSkipped++
              continue
            }
            
            // Update with detailed stats
            const updateData: any = {
              saves_diving: savesDiving,
              saves_cross: savesCross,
              saves_parry: savesParry,
              saves_punch: savesPunch,
              saves_reflex: savesReflex,
              goals_conceded: goalsConceeded,
              tackle_attempts: tackleAttempts,
              interceptions: parseInt(pStats.interceptions || 0),
              clearances: parseInt(pStats.clearances || 0),
              dribbles: parseInt(pStats.dribblewon || pStats.dribbles || 0),
              fouls: parseInt(pStats.fouls || pStats.foulcommited || 0),
              offsides: parseInt(pStats.offsides || 0),
              archetypeid: pStats.archetypeid || pStats.archetypeId || null
            }
            
            // Update clean_sheet if EA data has it
            if (isCleanSheet) {
              updateData.clean_sheet = true
            }
            
            if (!dryRun) {
              const { error: updateError } = await supabase
                .from('player_stats')
                .update(updateData)
                .eq('id', existingStat.id)
              
              if (updateError) {
                errors.push(`Failed to update stat ${existingStat.id}: ${updateError.message}`)
                continue
              }
            }
            
            totalUpdated++
          }
        }
      } catch (err) {
        errors.push(`Error processing match ${match.ea_match_id}: ${err}`)
      }
    }
    
    console.log(`[backfill-player-stats] Completed: ${totalUpdated} updated, ${totalSkipped} skipped, ${errors.length} errors`)
    
    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      total_matches: matches.length,
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
