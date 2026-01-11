import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Calculate Pearson correlation coefficient
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n === 0 || n !== y.length) return 0
  
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0)
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0)
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0)
  
  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  
  if (denominator === 0) return 0
  return numerator / denominator
}

// Analyze event codes: position distribution + correlation testing
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
    const eventCode = requestBody.event_code // Optional: analyze specific code
    const updateMappings = requestBody.update_mappings === true
    
    console.log(`[analyze-event-codes] Starting analysis...`)
    
    // Get all occurrences
    let query = supabase
      .from('event_code_occurrences')
      .select('event_code, count, position_played, goals, assists, shots, tackles, saves, passes_made, pass_attempts, rating')
    
    if (guildId) {
      query = query.eq('guild_id', guildId)
    }
    
    if (eventCode !== undefined) {
      query = query.eq('event_code', eventCode)
    }
    
    const { data: occurrences, error: occError } = await query
    
    if (occError) {
      throw new Error(`Failed to fetch occurrences: ${occError.message}`)
    }
    
    if (!occurrences || occurrences.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No occurrences found. Run normalize-event-aggregates first.',
        analysis: [] 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log(`[analyze-event-codes] Analyzing ${occurrences.length} occurrences...`)
    
    // Get current mappings
    const { data: mappings } = await supabase
      .from('event_code_mappings')
      .select('event_code, label, confidence, derive, category')
    
    const mappingLookup = new Map<number, any>()
    mappings?.forEach(m => mappingLookup.set(m.event_code, m))
    
    // Group occurrences by event code
    const codeGroups = new Map<number, typeof occurrences>()
    for (const occ of occurrences) {
      const existing = codeGroups.get(occ.event_code) || []
      existing.push(occ)
      codeGroups.set(occ.event_code, existing)
    }
    
    // Analyze each event code
    const analysis: Array<{
      event_code: number
      label: string
      confidence: string
      total_count: number
      avg_per_player: number
      sample_count: number
      position_distribution: {
        gk: number
        defender: number
        midfielder: number
        forward: number
        unknown: number
      }
      correlations: {
        goals: number
        assists: number
        shots: number
        tackles: number
        saves: number
        passes_made: number
        rating: number
      }
      suggested_category: string
      suggested_confidence: string
    }> = []
    
    for (const [code, codeOccurrences] of codeGroups) {
      const mapping = mappingLookup.get(code)
      
      // Calculate totals
      const totalCount = codeOccurrences.reduce((sum, o) => sum + o.count, 0)
      const sampleCount = codeOccurrences.length
      const avgPerPlayer = sampleCount > 0 ? totalCount / sampleCount : 0
      
      // Position distribution
      const posCounts = { gk: 0, defender: 0, midfielder: 0, forward: 0, unknown: 0 }
      for (const occ of codeOccurrences) {
        const pos = occ.position_played as keyof typeof posCounts || 'unknown'
        posCounts[pos] = (posCounts[pos] || 0) + 1
      }
      const total = Object.values(posCounts).reduce((a, b) => a + b, 0)
      const posDistribution = {
        gk: total > 0 ? Math.round((posCounts.gk / total) * 100) : 0,
        defender: total > 0 ? Math.round((posCounts.defender / total) * 100) : 0,
        midfielder: total > 0 ? Math.round((posCounts.midfielder / total) * 100) : 0,
        forward: total > 0 ? Math.round((posCounts.forward / total) * 100) : 0,
        unknown: total > 0 ? Math.round((posCounts.unknown / total) * 100) : 0,
      }
      
      // Calculate correlations with known stats
      const counts = codeOccurrences.map(o => o.count)
      const correlations = {
        goals: pearsonCorrelation(counts, codeOccurrences.map(o => o.goals || 0)),
        assists: pearsonCorrelation(counts, codeOccurrences.map(o => o.assists || 0)),
        shots: pearsonCorrelation(counts, codeOccurrences.map(o => o.shots || 0)),
        tackles: pearsonCorrelation(counts, codeOccurrences.map(o => o.tackles || 0)),
        saves: pearsonCorrelation(counts, codeOccurrences.map(o => o.saves || 0)),
        passes_made: pearsonCorrelation(counts, codeOccurrences.map(o => o.passes_made || 0)),
        rating: pearsonCorrelation(counts, codeOccurrences.map(o => o.rating || 0)),
      }
      
      // Suggest category based on position distribution
      let suggestedCategory = 'unknown'
      if (posDistribution.gk > 70) {
        suggestedCategory = 'gk'
      } else if (posDistribution.defender > 50) {
        suggestedCategory = 'defensive'
      } else if (posDistribution.forward > 50) {
        suggestedCategory = 'attacking'
      } else if (posDistribution.midfielder > 40) {
        suggestedCategory = 'passing'
      } else if (Math.abs(correlations.goals) > 0.5 || Math.abs(correlations.assists) > 0.5) {
        suggestedCategory = 'attacking'
      } else if (Math.abs(correlations.tackles) > 0.5) {
        suggestedCategory = 'defensive'
      } else if (Math.abs(correlations.saves) > 0.5) {
        suggestedCategory = 'gk'
      }
      
      // Suggest confidence based on correlation strength
      let suggestedConfidence = 'low'
      const maxCorr = Math.max(
        Math.abs(correlations.goals),
        Math.abs(correlations.assists),
        Math.abs(correlations.shots),
        Math.abs(correlations.tackles),
        Math.abs(correlations.saves),
        Math.abs(correlations.passes_made)
      )
      if (maxCorr > 0.7) {
        suggestedConfidence = 'high'
      } else if (maxCorr > 0.4) {
        suggestedConfidence = 'mid'
      }
      
      // Round correlations for readability
      const roundedCorrelations = {
        goals: Math.round(correlations.goals * 100) / 100,
        assists: Math.round(correlations.assists * 100) / 100,
        shots: Math.round(correlations.shots * 100) / 100,
        tackles: Math.round(correlations.tackles * 100) / 100,
        saves: Math.round(correlations.saves * 100) / 100,
        passes_made: Math.round(correlations.passes_made * 100) / 100,
        rating: Math.round(correlations.rating * 100) / 100,
      }
      
      analysis.push({
        event_code: code,
        label: mapping?.label || `event_${code}_unknown`,
        confidence: mapping?.confidence || 'low',
        total_count: totalCount,
        avg_per_player: Math.round(avgPerPlayer * 100) / 100,
        sample_count: sampleCount,
        position_distribution: posDistribution,
        correlations: roundedCorrelations,
        suggested_category: suggestedCategory,
        suggested_confidence: suggestedConfidence,
      })
    }
    
    // Sort by total count descending
    analysis.sort((a, b) => b.total_count - a.total_count)
    
    // Optionally update mappings with suggestions
    let mappingsUpdated = 0
    if (updateMappings) {
      for (const item of analysis) {
        if (!mappingLookup.has(item.event_code)) {
          // Insert new mapping
          const { error: insertError } = await supabase
            .from('event_code_mappings')
            .insert({
              event_code: item.event_code,
              label: `event_${item.event_code}_unknown`,
              confidence: item.suggested_confidence,
              derive: false,
              category: item.suggested_category,
              correlation_stats: item.correlations,
              notes: `Auto-discovered. Position: GK=${item.position_distribution.gk}%, DEF=${item.position_distribution.defender}%, MID=${item.position_distribution.midfielder}%, FWD=${item.position_distribution.forward}%`
            })
          
          if (!insertError) mappingsUpdated++
        } else {
          // Update correlation stats for existing mappings
          const { error: updateError } = await supabase
            .from('event_code_mappings')
            .update({
              correlation_stats: item.correlations,
              updated_at: new Date().toISOString()
            })
            .eq('event_code', item.event_code)
          
          if (!updateError) mappingsUpdated++
        }
      }
    }
    
    console.log(`[analyze-event-codes] Analyzed ${analysis.length} event codes, updated ${mappingsUpdated} mappings`)
    
    // Summary stats
    const summary = {
      total_occurrences: occurrences.length,
      unique_event_codes: analysis.length,
      high_confidence_codes: analysis.filter(a => a.confidence === 'high' || a.suggested_confidence === 'high').length,
      mid_confidence_codes: analysis.filter(a => a.confidence === 'mid' || a.suggested_confidence === 'mid').length,
      low_confidence_codes: analysis.filter(a => a.confidence === 'low' && a.suggested_confidence === 'low').length,
      gk_specific_codes: analysis.filter(a => a.position_distribution.gk > 70).map(a => a.event_code),
      defensive_codes: analysis.filter(a => a.position_distribution.defender > 50).map(a => a.event_code),
      attacking_codes: analysis.filter(a => a.position_distribution.forward > 50).map(a => a.event_code),
    }
    
    return new Response(JSON.stringify({
      success: true,
      summary,
      analysis: analysis.slice(0, 100), // Top 100
      mappings_updated: mappingsUpdated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[analyze-event-codes] Error:', error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})