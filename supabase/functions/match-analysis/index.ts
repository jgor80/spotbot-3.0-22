import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlayerStat {
  name: string;
  position: string;
  rating: number;
  goals: number;
  assists: number;
  passesCompleted: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  interceptions: number;
  shots: number;
  saves: number;
  cleanSheet: boolean;
  manOfMatch: boolean;
  redCard: boolean;
  minutesPlayed: number;
}

interface MatchData {
  result: string;
  scoreFor: number;
  scoreAgainst: number;
  opponent: string;
  matchType: string;
  playerStats: PlayerStat[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchData } = await req.json() as { matchData: MatchData };
    
    if (!matchData || !matchData.playerStats || matchData.playerStats.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No match data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build detailed stats summary for the AI
    const statsContext = matchData.playerStats.map(p => {
      const passAccuracy = p.passAttempts > 0 ? Math.round((p.passesCompleted / p.passAttempts) * 100) : 0;
      const tackleSuccess = p.tackleAttempts > 0 ? Math.round((p.tacklesMade / p.tackleAttempts) * 100) : 0;
      
      return `${p.name} (${p.position}, Rating: ${p.rating.toFixed(1)}): ${p.goals}G ${p.assists}A, ${passAccuracy}% pass accuracy (${p.passesCompleted}/${p.passAttempts}), ${tackleSuccess}% tackle success (${p.tacklesMade}/${p.tackleAttempts}), ${p.interceptions} interceptions, ${p.shots} shots${p.saves > 0 ? `, ${p.saves} saves` : ''}${p.cleanSheet ? ', Clean Sheet' : ''}${p.manOfMatch ? ', MOTM' : ''}${p.redCard ? ', RED CARD' : ''}, ${p.minutesPlayed} mins`;
    }).join('\n');

    const resultText = matchData.result === 'win' ? 'Victory' : matchData.result === 'loss' ? 'Defeat' : 'Draw';
    
    const systemPrompt = `You are an expert football analyst providing post-match analysis for EA FC Pro Clubs matches. Your analysis should be insightful, specific, and actionable. Focus on:
1. Individual standout performances (both positive and negative)
2. Tactical observations based on the stats
3. Chemistry between players (who set up goals, defensive partnerships)
4. Areas for improvement
5. Key moments implied by the stats

Be direct and specific - reference actual player names and their stats. Keep analysis concise but impactful. Use football terminology appropriately.`;

    const userPrompt = `Analyze this Pro Clubs match:

**Match Result**: ${resultText} ${matchData.scoreFor}-${matchData.scoreAgainst} vs ${matchData.opponent || 'Unknown Opponent'}
**Match Type**: ${matchData.matchType || 'Club Match'}

**Player Statistics**:
${statsContext}

Provide a comprehensive match analysis including:
1. **Match Summary** (2-3 sentences on the overall performance)
2. **Star Performers** (who stood out and why)
3. **Areas of Concern** (who struggled or what needs work)
4. **Tactical Insights** (what worked, what didn't based on the stats)
5. **Chemistry Notes** (any notable partnerships or combinations)

Keep the total response under 300 words.`;

    console.log('[match-analysis] Calling Lovable AI for match analysis...');

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[match-analysis] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || 'Unable to generate analysis.';

    console.log('[match-analysis] Successfully generated AI analysis');

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[match-analysis] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
