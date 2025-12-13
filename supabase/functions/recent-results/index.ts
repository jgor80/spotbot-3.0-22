import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

type PlayerAggregate = {
  name: string
  matches: number
  goals: number
  assists: number
  passesMade: number
  passAttempts: number
  tackles: number
  shots: number
  ratingSum: number
  ratingCount: number
  dribbles: number
  interceptions: number
  saves: number
  clearances: number
  redCards: number
  motm: number
}

function safeNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const parsed = parseFloat(String(value))
  return isNaN(parsed) ? 0 : parsed
}

function upsertPlayer(agg: Map<string, PlayerAggregate>, raw: any) {
  const name = raw.ea_username || raw.playername || 'Unknown Player'
  const existing = agg.get(name) || {
    name,
    matches: 0,
    goals: 0,
    assists: 0,
    passesMade: 0,
    passAttempts: 0,
    tackles: 0,
    shots: 0,
    ratingSum: 0,
    ratingCount: 0,
    dribbles: 0,
    interceptions: 0,
    saves: 0,
    clearances: 0,
    redCards: 0,
    motm: 0
  }

  existing.matches += 1
  existing.goals += safeNumber(raw.goals)
  existing.assists += safeNumber(raw.assists)
  existing.passesMade += safeNumber(raw.passes_made)
  existing.passAttempts += safeNumber(raw.pass_attempts)
  existing.tackles += safeNumber(raw.tackles)
  existing.shots += safeNumber(raw.shots)
  existing.dribbles += safeNumber(raw.dribbles)
  existing.interceptions += safeNumber(raw.interceptions)
  existing.saves += safeNumber(raw.saves)
  existing.clearances += safeNumber(raw.clearances)
  existing.redCards += safeNumber(raw.red_cards)
  existing.motm += raw.motm ? 1 : 0

  if (raw.rating !== undefined && raw.rating !== null) {
    const ratingVal = safeNumber(raw.rating)
    if (!isNaN(ratingVal) && ratingVal > 0) {
      existing.ratingSum += ratingVal
      existing.ratingCount += 1
    }
  }

  agg.set(name, existing)
}

function topPlayers(agg: Map<string, PlayerAggregate>, key: keyof PlayerAggregate, limit = 3) {
  return Array.from(agg.values())
    .filter((p) => p.matches > 0)
    .sort((a, b) => (b[key] as number) - (a[key] as number))
    .slice(0, limit)
}

function average(num: number, den: number) {
  if (!den) return 0
  return num / den
}

type RecentResultsResponse = {
  window_size: number
  recent_matches: any[]
  player_highlights: {
    ratings: { name: string; avg: number; matches: number }[]
    goals: { name: string; goals: number; conversion: number; shots: number }[]
    assists: { name: string; assists: number }[]
    passes: { name: string; passes: number; success: number }[]
    tackles: { name: string; tackles: number }[]
    dribbles: { name: string; dribbles: number }[]
    interceptions: { name: string; interceptions: number }[]
    saves: { name: string; saves: number }[]
  }
  ai_summary?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // ignore
    }

    const guildId = body.guild_id as string | undefined
    const windowSize = Math.max(1, Math.min(Number(body.window_size) || 5, 10))
    const fetchLimit = Math.max(windowSize, Math.min(Number(body.limit) || 12, 25))

    if (!guildId) {
      return new Response(JSON.stringify({ error: 'guild_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: matches, error } = await supabase
      .from('club_matches')
      .select('id, club_key, ea_match_id, result, score_for, score_against, opponent_club_name, match_type, created_at, player_stats')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(fetchLimit)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const matchesList = matches || []
    const windowMatches = matchesList.slice(0, windowSize)

    const aggregates = new Map<string, PlayerAggregate>()
    const lineupSummaries: { opponent: string | null; result: string | null; players: any[]; score: string }[] = []

    for (const match of windowMatches) {
      const stats = Array.isArray(match.player_stats) ? match.player_stats : []
      const sanitizedPlayers: any[] = []
      for (const stat of stats) {
        upsertPlayer(aggregates, stat)
        sanitizedPlayers.push({
          name: stat.ea_username || stat.playername || 'Unknown Player',
          goals: safeNumber(stat.goals),
          assists: safeNumber(stat.assists),
          rating: safeNumber(stat.rating),
          passes: safeNumber(stat.passes_made),
          passAttempts: safeNumber(stat.pass_attempts),
          tackles: safeNumber(stat.tackles),
          dribbles: safeNumber(stat.dribbles),
          interceptions: safeNumber(stat.interceptions)
        })
      }

      lineupSummaries.push({
        opponent: match.opponent_club_name,
        result: match.result,
        score: `${match.score_for ?? 0}-${match.score_against ?? 0}`,
        players: sanitizedPlayers
      })
    }

    const highlight = {
      ratings: topPlayers(aggregates, 'ratingSum').map((p) => ({
        name: p.name,
        avg: average(p.ratingSum, p.ratingCount || p.matches),
        matches: p.matches
      })),
      goals: topPlayers(aggregates, 'goals').map((p) => ({
        name: p.name,
        goals: p.goals,
        shots: p.shots,
        conversion: p.shots > 0 ? Math.round((p.goals / p.shots) * 100) : 0
      })),
      assists: topPlayers(aggregates, 'assists').map((p) => ({ name: p.name, assists: p.assists })),
      passes: topPlayers(aggregates, 'passesMade').map((p) => ({
        name: p.name,
        passes: p.passesMade,
        success: p.passAttempts > 0 ? Math.round((p.passesMade / p.passAttempts) * 100) : 0
      })),
      tackles: topPlayers(aggregates, 'tackles').map((p) => ({ name: p.name, tackles: p.tackles })),
      dribbles: topPlayers(aggregates, 'dribbles').map((p) => ({ name: p.name, dribbles: p.dribbles })),
      interceptions: topPlayers(aggregates, 'interceptions').map((p) => ({ name: p.name, interceptions: p.interceptions })),
      saves: topPlayers(aggregates, 'saves').map((p) => ({ name: p.name, saves: p.saves }))
    }

    let aiSummary: string | undefined
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (openaiKey && windowMatches.length > 0) {
      const prompt = `You are an expert FC Pro Clubs analyst. Summarize the last ${windowMatches.length} matches.
Matches (most recent first): ${windowMatches.map((m) => `${m.result || 'draw'} ${m.score_for || 0}-${m.score_against || 0} vs ${m.opponent_club_name || 'Unknown'}`).join('; ')}
Player highlights (aggregated): ${JSON.stringify(highlight)}
Lineups per match: ${JSON.stringify(lineupSummaries.slice(0, 5))}

Deliver a concise markdown recap with:
- Overall form and momentum
- Which player combos or individuals shined together
- Players struggling or underperforming
- Tactical recommendations for next matches`

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a sharp, data-driven Pro Clubs performance analyst.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 700,
          temperature: 0.6
        })
      })

      if (openaiResponse.ok) {
        const aiResult = await openaiResponse.json()
        aiSummary = aiResult.choices?.[0]?.message?.content || undefined
      }
    }

    const response: RecentResultsResponse = {
      window_size: windowSize,
      recent_matches: matchesList,
      player_highlights: highlight,
      ai_summary: aiSummary
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
