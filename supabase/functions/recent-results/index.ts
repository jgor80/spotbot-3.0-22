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
  tackleAttempts: number
  shots: number
  ratingSum: number
  ratingCount: number
  dribbles: number
  interceptions: number
  saves: number
  clearances: number
  redCards: number
  motm: number
  secondsPlayed: number
  goalsConceded: number
}

function safeNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const parsed = parseFloat(String(value))
  return isNaN(parsed) ? 0 : parsed
}

function upsertPlayer(agg: Map<string, PlayerAggregate>, raw: any) {
  const name = raw.ea_username || raw.playername || raw.name || 'Unknown Player'
  const existing = agg.get(name) || {
    name,
    matches: 0,
    goals: 0,
    assists: 0,
    passesMade: 0,
    passAttempts: 0,
    tackles: 0,
    tackleAttempts: 0,
    shots: 0,
    ratingSum: 0,
    ratingCount: 0,
    dribbles: 0,
    interceptions: 0,
    saves: 0,
    clearances: 0,
    redCards: 0,
    motm: 0,
    secondsPlayed: 0,
    goalsConceded: 0
  }

  existing.matches += 1
  existing.goals += safeNumber(raw.goals)
  existing.assists += safeNumber(raw.assists)
  existing.passesMade += safeNumber(raw.passes_made || raw.passesmade)
  existing.passAttempts += safeNumber(raw.pass_attempts || raw.passattempts)
  existing.tackles += safeNumber(raw.tackles || raw.tacklesmade)
  existing.tackleAttempts += safeNumber(raw.tackle_attempts || raw.tackleattempts)
  existing.shots += safeNumber(raw.shots)
  existing.dribbles += safeNumber(raw.dribbles)
  existing.interceptions += safeNumber(raw.interceptions)
  existing.saves += safeNumber(raw.saves || raw.gksaves)
  existing.clearances += safeNumber(raw.clearances)
  existing.redCards += safeNumber(raw.red_cards || raw.redcards)
  existing.motm += (raw.motm || raw.man_of_match || raw.manOfTheMatch) ? 1 : 0
  existing.secondsPlayed += safeNumber(raw.seconds_played || raw.secondsPlayed)
  existing.goalsConceded += safeNumber(raw.goals_conceded || raw.goalsconceded)

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

type MatchPlayerStat = {
  name: string
  position: string | null
  archetypeid: string | null
  rating: number
  goals: number
  assists: number
  shots: number
  passesMade: number
  passAttempts: number
  passAccuracy: number
  tackles: number
  tackleAttempts: number
  tackleSuccessRate: number
  dribbles: number
  interceptions: number
  clearances: number
  saves: number
  redCards: number
  motm: boolean
  minutesPlayed: number
  goalsConceded: number
}

type DetailedMatch = {
  id: string
  ea_match_id: string
  result: string | null
  score_for: number
  score_against: number
  opponent_club_name: string | null
  match_type: string
  created_at: string
  club_key: string
  players: MatchPlayerStat[]
}

type RecentResultsResponse = {
  window_size: number
  recent_matches: any[]
  detailed_matches: DetailedMatch[]
  player_highlights: {
    ratings: { name: string; avg: number; matches: number }[]
    goals: { name: string; goals: number; conversion: number; shots: number }[]
    assists: { name: string; assists: number }[]
    passes: { name: string; passes: number; success: number }[]
    tackles: { name: string; tackles: number; attempts: number; successRate: number }[]
    dribbles: { name: string; dribbles: number }[]
    interceptions: { name: string; interceptions: number }[]
    saves: { name: string; saves: number }[]
    redCards: { name: string; redCards: number }[]
    minutesPlayed: { name: string; minutes: number }[]
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
    const clubKey = body.club_key as string | undefined
    const windowSize = Math.max(1, Math.min(Number(body.window_size) || 5, 10))
    const fetchLimit = Math.max(windowSize, Math.min(Number(body.limit) || 12, 25))
    const includeAiSummary = body.include_ai_summary !== false

    if (!guildId) {
      return new Response(JSON.stringify({ error: 'guild_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let query = supabase
      .from('club_matches')
      .select('id, club_key, ea_match_id, result, score_for, score_against, opponent_club_name, match_type, created_at, player_stats, match_data')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(fetchLimit)

    if (clubKey) {
      query = query.eq('club_key', clubKey)
    }

    const { data: matches, error } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const matchesList = matches || []
    const windowMatches = matchesList.slice(0, windowSize)

    const aggregates = new Map<string, PlayerAggregate>()
    const detailedMatches: DetailedMatch[] = []
    const lineupSummaries: { opponent: string | null; result: string | null; players: any[]; score: string }[] = []

    for (const match of windowMatches) {
      const stats = Array.isArray(match.player_stats) ? match.player_stats : []
      const sanitizedPlayers: MatchPlayerStat[] = []
      
      for (const stat of stats) {
        upsertPlayer(aggregates, stat)
        
        const passesMade = safeNumber(stat.passes_made || stat.passesmade)
        const passAttempts = safeNumber(stat.pass_attempts || stat.passattempts)
        const tackles = safeNumber(stat.tackles || stat.tacklesmade)
        const tackleAttempts = safeNumber(stat.tackle_attempts || stat.tackleattempts)
        
        sanitizedPlayers.push({
          name: stat.ea_username || stat.playername || stat.name || 'Unknown Player',
          position: stat.position || stat.pos || stat.favoritePosition || null,
          archetypeid: stat.archetypeid || stat.archetypeId || null,
          rating: safeNumber(stat.rating),
          goals: safeNumber(stat.goals),
          assists: safeNumber(stat.assists),
          shots: safeNumber(stat.shots),
          passesMade,
          passAttempts,
          passAccuracy: passAttempts > 0 ? Math.round((passesMade / passAttempts) * 100) : 0,
          tackles,
          tackleAttempts,
          tackleSuccessRate: tackleAttempts > 0 ? Math.round((tackles / tackleAttempts) * 100) : 0,
          dribbles: safeNumber(stat.dribbles),
          interceptions: safeNumber(stat.interceptions),
          clearances: safeNumber(stat.clearances),
          saves: safeNumber(stat.saves || stat.gksaves),
          redCards: safeNumber(stat.red_cards || stat.redcards),
          motm: !!(stat.motm || stat.man_of_match || stat.manOfTheMatch),
          minutesPlayed: Math.round(safeNumber(stat.seconds_played || stat.secondsPlayed) / 60),
          goalsConceded: safeNumber(stat.goals_conceded || stat.goalsconceded)
        })
      }

      detailedMatches.push({
        id: match.id,
        ea_match_id: match.ea_match_id,
        result: match.result,
        score_for: match.score_for ?? 0,
        score_against: match.score_against ?? 0,
        opponent_club_name: match.opponent_club_name,
        match_type: match.match_type,
        created_at: match.created_at,
        club_key: match.club_key,
        players: sanitizedPlayers.sort((a, b) => b.rating - a.rating)
      })

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
      tackles: topPlayers(aggregates, 'tackles').map((p) => ({
        name: p.name,
        tackles: p.tackles,
        attempts: p.tackleAttempts,
        successRate: p.tackleAttempts > 0 ? Math.round((p.tackles / p.tackleAttempts) * 100) : 0
      })),
      dribbles: topPlayers(aggregates, 'dribbles').map((p) => ({ name: p.name, dribbles: p.dribbles })),
      interceptions: topPlayers(aggregates, 'interceptions').map((p) => ({ name: p.name, interceptions: p.interceptions })),
      saves: topPlayers(aggregates, 'saves').map((p) => ({ name: p.name, saves: p.saves })),
      redCards: Array.from(aggregates.values())
        .filter(p => p.redCards > 0)
        .sort((a, b) => b.redCards - a.redCards)
        .slice(0, 3)
        .map(p => ({ name: p.name, redCards: p.redCards })),
      minutesPlayed: topPlayers(aggregates, 'secondsPlayed').map((p) => ({
        name: p.name,
        minutes: Math.round(p.secondsPlayed / 60)
      }))
    }

    let aiSummary: string | undefined
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (openaiKey && windowMatches.length > 0 && includeAiSummary) {
      const prompt = `You are an expert EA FC Pro Clubs analyst writing a comprehensive match report. Analyze the last ${windowMatches.length} matches in detail.

MATCH RESULTS (most recent first):
${windowMatches.map((m, i) => `${i + 1}. ${m.result?.toUpperCase() || 'DRAW'} ${m.score_for || 0}-${m.score_against || 0} vs ${m.opponent_club_name || 'Unknown'}`).join('\n')}

AGGREGATED PLAYER HIGHLIGHTS (last ${windowMatches.length} games):
- **Highest AMR**: ${highlight.ratings.map(p => `${p.name} (${p.avg.toFixed(1)})`).join(', ') || 'No data'}
- **Top Goalscorers**: ${highlight.goals.map(p => `${p.name} (${p.goals} goals, ${p.conversion}% conv)`).join(', ') || 'No data'}
- **Top Assisters**: ${highlight.assists.map(p => `${p.name} (${p.assists})`).join(', ') || 'No data'}
- **Top Passers**: ${highlight.passes.map(p => `${p.name} (${p.passes} passes, ${p.success}%)`).join(', ') || 'No data'}
- **Top Tacklers**: ${highlight.tackles.map(p => `${p.name} (${p.tackles} tackles, ${p.successRate}%)`).join(', ') || 'No data'}
- **Top Dribblers**: ${highlight.dribbles.map(p => `${p.name} (${p.dribbles})`).join(', ') || 'No data'}
- **Top Interceptors**: ${highlight.interceptions.map(p => `${p.name} (${p.interceptions})`).join(', ') || 'No data'}
${highlight.saves.length > 0 ? `- **Top Keepers**: ${highlight.saves.map(p => `${p.name} (${p.saves} saves)`).join(', ')}` : ''}
${highlight.redCards.length > 0 ? `- **🟥 Red Cards**: ${highlight.redCards.map(p => `${p.name} (${p.redCards})`).join(', ')}` : ''}

PER-MATCH LINEUPS AND STATS:
${JSON.stringify(lineupSummaries.slice(0, 5), null, 2)}

Deliver a DETAILED markdown analysis with these sections:
## 📊 Form & Momentum
- Overall record and point trend
- Score patterns (high-scoring, defensive, etc.)

## ⭐ Standout Performers
- MVP candidates with specific stats backing up why
- Hot players on scoring/assist streaks

## 🤝 Chemistry & Combinations
- Which players seem to play well TOGETHER (look for patterns in lineups that won vs lost)
- Effective attacking partnerships
- Defensive pairings that work

## ⚠️ Concerns & Underperformers
- Players struggling with form
- Defensive issues (if conceding goals)
- Discipline problems (red cards)

## 💡 Tactical Recommendations
- What to maintain that's working
- Suggested changes for improvement
- Lineup/formation suggestions`

      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a sharp, data-driven Pro Clubs performance analyst who provides actionable insights with specific stats to back up every claim. Be concise but thorough.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 1200,
            temperature: 0.7
          })
        })

        if (openaiResponse.ok) {
          const aiResult = await openaiResponse.json()
          aiSummary = aiResult.choices?.[0]?.message?.content || undefined
        } else {
          console.log('[recent-results] OpenAI response not ok:', openaiResponse.status)
        }
      } catch (aiError) {
        console.log('[recent-results] OpenAI error:', aiError)
      }
    }

    const response: RecentResultsResponse = {
      window_size: windowSize,
      recent_matches: matchesList,
      detailed_matches: detailedMatches,
      player_highlights: highlight,
      ai_summary: aiSummary
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[recent-results] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
