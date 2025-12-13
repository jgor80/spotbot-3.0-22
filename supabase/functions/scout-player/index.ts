import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// EA API Configuration
const EA_PLATFORM_MAP: Record<string, string> = {
  'ps5': 'common-gen5',
  'xbox-series-xs': 'common-gen5',
  'pc': 'common-gen5',
  'ps4': 'common-gen4',
  'xboxone': 'common-gen4'
};

const EA_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Referer': 'https://www.ea.com/games/ea-sports-fc/clubs',
  'Origin': 'https://www.ea.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

type PersonaProfile = {
  platform: string;
  persona_id?: string;
  display_name?: string;
  club_id?: string;
  club_name?: string;
  raw?: any;
};

// Attempt direct persona lookups for a gamertag so external players (non-tracked clubs) can be scouted
async function fetchPlayerPersonas(eaUsername: string, platform: string): Promise<PersonaProfile[]> {
  const candidates: PersonaProfile[] = [];
  const probes = [
    `https://proclubs.ea.com/api/fc/players/search?platform=${platform}&personaName=${encodeURIComponent(eaUsername)}`,
    `https://proclubs.ea.com/api/fc/personas/search?platform=${platform}&personaName=${encodeURIComponent(eaUsername)}`
  ];

  for (const probeUrl of probes) {
    try {
      const resp = await fetch(probeUrl, { headers: EA_HEADERS });
      if (!resp.ok) continue;

      const payload = await resp.json();
      const entries = Array.isArray(payload)
        ? payload
        : (payload?.players || payload?.personas || []);

      for (const entry of entries) {
        if (!entry) continue;
        const displayName = entry.name || entry.personaName || entry.persona_name || entry.displayName;

        // Keep loosely matched results but prefer exact gamertag matches
        if (displayName && displayName.toLowerCase().includes(eaUsername.toLowerCase())) {
          candidates.push({
            platform,
            persona_id: (entry.personaId || entry.persona_id || entry.id)?.toString(),
            display_name: displayName,
            club_id: (entry.clubId || entry.club_id)?.toString(),
            club_name: entry.clubName || entry.club_name,
            raw: entry
          });
        }
      }
    } catch (err) {
      console.log(`[scout-player] Persona probe failed (${platform} ${probeUrl}):`, err);
    }
  }

  // Deduplicate by persona + platform
  const deduped = new Map<string, PersonaProfile>();
  for (const hit of candidates) {
    const key = `${hit.platform}:${hit.persona_id || hit.display_name}`;
    if (!deduped.has(key)) deduped.set(key, hit);
  }

  return [...deduped.values()];
}

// Search for a player's club memberships
async function searchPlayerClubs(eaUsername: string): Promise<any[]> {
  const clubs: any[] = [];
  const platforms = ['common-gen5', 'common-gen4'];
  const searchTerms = new Set<string>([eaUsername, eaUsername.substring(0, 3)].filter(Boolean));

  for (const platform of platforms) {
    for (const term of searchTerms) {
      try {
        const searchUrl = `https://proclubs.ea.com/api/fc/clubs/search?platform=${platform}&clubName=${encodeURIComponent(term)}`;
        const response = await fetch(searchUrl, { headers: EA_HEADERS });

        if (response.ok) {
          const data = await response.json();
          const clubList = Array.isArray(data) ? data : data?.clubs || [];

          for (const club of clubList.slice(0, 15)) {
            const members = await fetchClubMembers(club.clubId?.toString(), platform);
            const playerMember = members.find((m: any) =>
              (m.name || m.playerName)?.toLowerCase() === eaUsername.toLowerCase()
            );

            if (playerMember) {
              clubs.push({
                club_id: club.clubId?.toString(),
                club_name: club.name || club.clubName,
                platform,
                player_stats: playerMember
              });
            }
          }
        }
      } catch (err) {
        console.log(`[scout-player] Error searching on ${platform} (${term}):`, err);
      }
    }
  }

  return clubs;
}

// Fetch club members
async function fetchClubMembers(clubId: string, platform: string): Promise<any[]> {
  try {
    const response = await fetch(
      `https://proclubs.ea.com/api/fc/members/stats?platform=${platform}&clubId=${clubId}`,
      { headers: EA_HEADERS }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data?.members) return data.members;
    if (Array.isArray(data)) return data;
    return Object.values(data).filter(v => v && typeof v === 'object');
  } catch (err) {
    return [];
  }
}

// Fetch player stats from a specific club
async function fetchPlayerFromClub(clubId: string, platform: string, eaUsername: string): Promise<any | null> {
  const members = await fetchClubMembers(clubId, platform);
  return members.find((m: any) =>
    (m.name || m.playerName)?.toLowerCase() === eaUsername.toLowerCase()
  ) || null;
}

function summarizeMemberStats(member: any) {
  const gamesPlayed = parseInt(member.gamesPlayed || member.matches || 0);
  const wins = parseInt(member.wins || 0);
  const losses = parseInt(member.losses || 0);
  const draws = Math.max(0, gamesPlayed - wins - losses);
  const goals = parseInt(member.goals || 0);
  const assists = parseInt(member.assists || 0);
  const avgRating = parseFloat(member.ratingAve || member.avgRating || 0);
  const cleanSheets = parseInt(member.cleanSheetsDef || member.cleanSheetsGK || member.cleanSheets || 0);
  const manOfMatch = parseInt(member.manOfTheMatch || member.mom || 0);
  const shots = parseInt(member.shots || 0);
  const tackles = parseInt(member.tacklesmade || member.tackles || 0);
  const passesMade = parseInt(member.passesmade || member.passesMade || 0);
  const passAttempts = parseInt(member.passattempts || member.passAttempts || 0);
  const saves = parseInt(member.saves || member.gksaves || member.gkSaves || 0);
  const interceptions = parseInt(member.interceptions || 0);
  const clearances = parseInt(member.clearances || 0);

  return {
    games_played: gamesPlayed,
    wins,
    losses,
    draws,
    goals,
    assists,
    clean_sheets: cleanSheets,
    man_of_match: manOfMatch,
    avg_rating: avgRating,
    shots,
    tackles,
    passes_made: passesMade,
    pass_attempts: passAttempts,
    pass_accuracy: passAttempts > 0 ? (passesMade / passAttempts) * 100 : 0,
    saves,
    interceptions,
    clearances,
    position: member.favoritePosition || member.proPos || member.pos || null,
    pro_overall: parseInt(member.proOverall || 0)
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { guild_id, player_id, ea_username, ea_platform } = await req.json();
    const normalizedEaUsername = (ea_username || '').trim();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let playerData: any = null;
    let eaClubStats: any[] = [];
    let personaProfiles: PersonaProfile[] = [];
    let discordPlayerFound = false;

    // Mode 1: Scout by EA username (external player lookup)
    if (normalizedEaUsername) {
      console.log(`[scout-player] Searching EA for: ${normalizedEaUsername}`);
      
      // First check if this EA username is linked to a Discord user in our system
      const { data: linkedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('ea_username', normalizedEaUsername)
        .maybeSingle();
      
      if (linkedProfile && !linkedProfile.discord_user_id.startsWith('ea_')) {
        // This EA user is a Discord member - use their full data
        discordPlayerFound = true;
        console.log(`[scout-player] Found linked Discord user: ${linkedProfile.discord_user_id}`);
      }
      
      // Search EA API for all clubs this player is in
      const platforms = [
        ea_platform ? (EA_PLATFORM_MAP[ea_platform] || ea_platform) : null,
        'common-gen5',
        'common-gen4'
      ].filter(Boolean) as string[];

      // Probe EA directly for persona info so we can scout players outside tracked clubs
      for (const platform of platforms) {
        const hits = await fetchPlayerPersonas(normalizedEaUsername, platform);
        if (hits?.length) {
          personaProfiles.push(...hits);
        }
      }

      // Get all guild clubs to search
      const { data: guildSettings } = await supabase
        .from('guild_settings')
        .select('guild_id, clubs');

      // Also search EA directly so we can surface clubs outside our tracked guild list
      const discoveredClubs = await searchPlayerClubs(normalizedEaUsername);
      const memberFieldSet = new Set<string>();
      const processedClubKeys = new Set<string>();

      for (const settings of guildSettings || []) {
        const clubs = settings.clubs as any[] || [];
        for (const club of clubs) {
          if (!club.ea_club_id || !club.ea_platform) continue;

          const fcPlatform = EA_PLATFORM_MAP[club.ea_platform] || club.ea_platform;
          const playerStats = await fetchPlayerFromClub(club.ea_club_id, fcPlatform, normalizedEaUsername);

          if (playerStats) {
            Object.keys(playerStats || {}).forEach((k) => memberFieldSet.add(k));
            const stats = summarizeMemberStats(playerStats);
            eaClubStats.push({
              guild_id: settings.guild_id,
              club_id: club.ea_club_id,
              club_name: club.name,
              club_key: club.key,
              platform: club.ea_platform,
              stats,
              raw_member: playerStats,
              source: 'tracked_club'
            });
            processedClubKeys.add(`${fcPlatform}:${club.ea_club_id}`);
          }
        }
      }

      // Pull clubs discovered via EA search (outside our guilds)
      for (const club of discoveredClubs) {
        const fcPlatform = platforms.find(p => p === club.platform) || club.platform;
        const dedupeKey = `${fcPlatform}:${club.club_id}`;
        if (processedClubKeys.has(dedupeKey)) continue;

        const playerStats = club.player_stats;
        if (playerStats) {
          Object.keys(playerStats || {}).forEach((k) => memberFieldSet.add(k));
          const stats = summarizeMemberStats(playerStats);
          eaClubStats.push({
            guild_id: null,
            club_id: club.club_id,
            club_name: club.club_name,
            club_key: null,
            platform: fcPlatform,
            stats,
            raw_member: playerStats,
            source: 'ea_search'
          });
          processedClubKeys.add(dedupeKey);
        }
      }

      // Also pull any clubs referenced by persona probes (even if not tracked/discovered via club search)
      for (const persona of personaProfiles) {
        if (!persona.club_id) continue;
        const fcPlatform = platforms.find(p => p === persona.platform) || persona.platform;
        const dedupeKey = `${fcPlatform}:${persona.club_id}`;
        if (processedClubKeys.has(dedupeKey)) continue;

        const playerStats = await fetchPlayerFromClub(persona.club_id, fcPlatform, normalizedEaUsername);
        if (playerStats) {
          Object.keys(playerStats || {}).forEach((k) => memberFieldSet.add(k));
          const stats = summarizeMemberStats(playerStats);
          eaClubStats.push({
            guild_id: null,
            club_id: persona.club_id,
            club_name: persona.club_name,
            club_key: null,
            platform: fcPlatform,
            stats,
            raw_member: playerStats,
            source: 'ea_persona_probe'
          });
          processedClubKeys.add(dedupeKey);
        }
      }

      // Build player data from EA stats
      if (eaClubStats.length > 0 || discordPlayerFound || personaProfiles.length > 0) {
      
      // Build player data from EA stats
      if (eaClubStats.length > 0 || discordPlayerFound) {
        // Aggregate stats across all clubs (tracked + discovered)
        const aggregated = eaClubStats.reduce((acc, club) => ({
          games_played: acc.games_played + club.stats.games_played,
          wins: acc.wins + club.stats.wins,
          losses: acc.losses + club.stats.losses,
          draws: acc.draws + club.stats.draws,
          goals: acc.goals + club.stats.goals,
          assists: acc.assists + club.stats.assists,
          clean_sheets: acc.clean_sheets + club.stats.clean_sheets,
          motm: acc.motm + club.stats.man_of_match,
          shots: acc.shots + club.stats.shots,
          tackles: acc.tackles + club.stats.tackles,
          passes_made: acc.passes_made + club.stats.passes_made,
          pass_attempts: acc.pass_attempts + club.stats.pass_attempts,
          saves: acc.saves + club.stats.saves,
          interceptions: acc.interceptions + club.stats.interceptions,
          clearances: acc.clearances + club.stats.clearances,
          total_rating: acc.total_rating + (club.stats.avg_rating * club.stats.games_played),
          rating_games: acc.rating_games + club.stats.games_played
        }), {
          games_played: 0, wins: 0, losses: 0, draws: 0, goals: 0, assists: 0,
          clean_sheets: 0, motm: 0, shots: 0, tackles: 0, passes_made: 0,
          pass_attempts: 0, saves: 0, interceptions: 0, clearances: 0,
          total_rating: 0, rating_games: 0
        });

        const avgRating = aggregated.rating_games > 0 ? aggregated.total_rating / aggregated.rating_games : 0;
        const winRate = aggregated.games_played > 0 ? (aggregated.wins / aggregated.games_played * 100) : 0;
        const passAccuracy = aggregated.pass_attempts > 0 ? (aggregated.passes_made / aggregated.pass_attempts * 100) : 0;
        
        // Get primary position from most played
        const positions = eaClubStats.map(c => c.stats.position).filter(Boolean);
        const primaryPosition = positions.length > 0 ? positions[0] : 'Unknown';

        playerData = {
          profile: {
            username: normalizedEaUsername,
            ea_username: normalizedEaUsername,
            ea_platform: eaClubStats[0]?.platform || personaProfiles[0]?.platform || 'Unknown',
            ea_platform: eaClubStats[0]?.platform || 'Unknown',
            primary_position: primaryPosition,
            is_discord_member: discordPlayerFound,
            persona_profiles: personaProfiles
          },
          overall: {
            rating: avgRating * 10, // Convert 0-10 to 0-100
            games_played: aggregated.games_played,
            wins: aggregated.wins,
            losses: aggregated.losses,
            draws: aggregated.draws,
            win_rate: winRate,
            goals: aggregated.goals,
            assists: aggregated.assists,
            clean_sheets: aggregated.clean_sheets,
            motm_count: aggregated.motm
          },
          extended_stats: {
            shots: aggregated.shots,
            tackles: aggregated.tackles,
            passes_made: aggregated.passes_made,
            pass_attempts: aggregated.pass_attempts,
            pass_accuracy: passAccuracy.toFixed(1),
            saves: aggregated.saves,
            goals_per_game: aggregated.games_played > 0 ? (aggregated.goals / aggregated.games_played).toFixed(2) : 0,
            assists_per_game: aggregated.games_played > 0 ? (aggregated.assists / aggregated.games_played).toFixed(2) : 0,
            interceptions: aggregated.interceptions,
            clearances: aggregated.clearances
          },
          clubs: eaClubStats.map(c => ({
            name: c.club_name,
            platform: c.platform,
            source: c.source,
            games: c.stats.games_played,
            draws: c.stats.draws,
            wins: c.stats.wins,
            goals: c.stats.goals,
            assists: c.stats.assists,
            clean_sheets: c.stats.clean_sheets,
            motm: c.stats.man_of_match,
            avg_rating: c.stats.avg_rating,
            pass_accuracy: c.stats.pass_accuracy,
            interceptions: c.stats.interceptions,
            clearances: c.stats.clearances,
            pro_overall: c.stats.pro_overall
          })),
          raw_member_fields: [...memberFieldSet],
          source: 'ea_api'
        };
      } else {
        return new Response(JSON.stringify({
          error: 'Player not found in EA search',
          searched_ea_username: normalizedEaUsername,
          persona_profiles: personaProfiles
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    // Mode 2: Scout by Discord ID (existing functionality)
    else if (guild_id && player_id) {
      discordPlayerFound = true;
      
      // Fetch all player data in parallel
      const [
        { data: summary },
        { data: ratings },
        { data: profile },
        { data: streaks },
        { data: achievements },
        { data: positionRatings },
        { data: chemistry },
        { data: recentStats },
        { data: reliability },
        { data: competitionWins }
      ] = await Promise.all([
        supabase.from('player_summary').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
        supabase.from('player_ratings').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
        supabase.from('profiles').select('*').eq('discord_user_id', player_id).maybeSingle(),
        supabase.from('player_streaks').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
        supabase.from('player_achievements').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id),
        supabase.from('player_position_ratings').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).order('games_at_position', { ascending: false }),
        supabase.from('player_chemistry').select('*').eq('guild_id', guild_id).or(`player_a_discord_id.eq.${player_id},player_b_discord_id.eq.${player_id}`).order('games_together', { ascending: false }).limit(10),
        supabase.from('player_stats').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).order('recorded_at', { ascending: false }).limit(20),
        supabase.from('player_reliability').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).maybeSingle(),
        supabase.from('competition_wins').select('*').eq('guild_id', guild_id).eq('discord_user_id', player_id).eq('verified', true)
      ]);

      if (!summary && !ratings && !profile) {
        return new Response(JSON.stringify({ error: 'Player not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // If player has EA username, fetch their stats from ALL clubs they're in
      if (profile?.ea_username) {
        const { data: guildSettings } = await supabase
          .from('guild_settings')
          .select('guild_id, clubs');
        
        for (const settings of guildSettings || []) {
          const clubs = settings.clubs as any[] || [];
          for (const club of clubs) {
            if (!club.ea_club_id || !club.ea_platform) continue;
            
            const fcPlatform = EA_PLATFORM_MAP[club.ea_platform] || club.ea_platform;
            const playerStats = await fetchPlayerFromClub(club.ea_club_id, fcPlatform, profile.ea_username);
            
            if (playerStats) {
              eaClubStats.push({
                guild_id: settings.guild_id,
                club_name: club.name,
                platform: club.ea_platform,
                stats: {
                  goals: parseInt(playerStats.goals || 0),
                  assists: parseInt(playerStats.assists || 0),
                  games_played: parseInt(playerStats.gamesPlayed || playerStats.matches || 0),
                  wins: parseInt(playerStats.wins || 0),
                  avg_rating: parseFloat(playerStats.ratingAve || playerStats.avgRating || 0),
                  position: playerStats.favoritePosition || playerStats.proPos
                }
              });
            }
          }
        }
      }

      // Build comprehensive player data object
      playerData = {
        profile: {
          username: summary?.discord_username || profile?.discord_username || player_id,
          ea_username: profile?.ea_username,
          ea_platform: profile?.ea_platform,
          primary_position: summary?.primary_position || profile?.primary_position,
          is_discord_member: true
        },
        overall: {
          rating: summary?.overall_rating || ratings?.overall_rating || 50,
          games_played: summary?.games_played || ratings?.games_played || 0,
          wins: summary?.wins || ratings?.wins || 0,
          losses: ratings?.losses || 0,
          draws: ratings?.draws || 0,
          win_rate: summary?.win_rate || 0,
          goals: summary?.goals || ratings?.total_goals || 0,
          assists: summary?.assists || ratings?.total_assists || 0,
          clean_sheets: ratings?.total_clean_sheets || 0,
          motm_count: ratings?.total_motm || 0
        },
        ratings_breakdown: {
          overall: ratings?.overall_rating,
          draft_performance: ratings?.draft_performance_rating,
          club_performance: ratings?.club_performance_rating,
          peer_rating: ratings?.peer_rating,
          build_quality: ratings?.build_quality_rating
        },
        form: {
          form_rating: summary?.form_rating || streaks?.form_rating,
          current_streak: summary?.current_streak || 0,
          streak_type: summary?.streak_type,
          longest_win_streak: summary?.longest_win_streak || streaks?.longest_win_streak || 0,
          current_win_streak: streaks?.current_win_streak || 0,
          current_loss_streak: streaks?.current_loss_streak || 0,
          current_goal_streak: streaks?.current_goal_streak || 0,
          last_5_results: streaks?.last_5_results || [],
          last_10_results: streaks?.last_10_results || []
        },
        positions: positionRatings?.map(p => ({
          position: p.position,
          games: p.games_at_position,
          goals: p.goals_at_position,
          assists: p.assists_at_position,
          avg_rating: p.avg_match_rating,
          position_rating: p.rating
        })) || [],
        reliability: {
          score: reliability?.reliability_score || summary?.reliability_score || 100,
          total_events: reliability?.total_events || 0,
          events_showed: reliability?.events_showed || 0,
          events_no_showed: reliability?.events_no_showed || 0
        },
        chemistry: chemistry?.map(c => ({
          partner_id: c.player_a_discord_id === player_id ? c.player_b_discord_id : c.player_a_discord_id,
          games_together: c.games_together,
          wins_together: c.wins_together,
          win_rate: c.win_rate,
          synergy_score: c.synergy_score
        })) || [],
        achievements: achievements?.map(a => ({
          name: a.achievement_name,
          icon: a.achievement_icon,
          earned_at: a.earned_at
        })) || [],
        competition_wins: competitionWins?.map(w => ({
          competition: w.competition_name,
          type: w.competition_type,
          tier: w.tier,
          team: w.team_name,
          date: w.placed_at
        })) || [],
        recent_games: recentStats?.map(s => ({
          date: s.recorded_at,
          match_type: s.match_type,
          position: s.position_played,
          goals: s.goals,
          assists: s.assists,
          rating: s.ea_match_rating,
          won: s.won,
          clean_sheet: s.clean_sheet,
          motm: s.man_of_match
        })) || [],
        clubs: eaClubStats,
        source: 'database'
      };
    } else {
      return new Response(JSON.stringify({ error: 'Either guild_id+player_id or ea_username is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate additional stats
    const totalGoalContributions = playerData.overall.goals + playerData.overall.assists;
    const goalsPerGame = playerData.overall.games_played > 0 ? (playerData.overall.goals / playerData.overall.games_played).toFixed(2) : 0;
    const assistsPerGame = playerData.overall.games_played > 0 ? (playerData.overall.assists / playerData.overall.games_played).toFixed(2) : 0;
    
    // Build AI prompt based on data source
    const clubsInfo = playerData.clubs?.length > 0
      ? `\nCLUB MEMBERSHIPS (${playerData.clubs.length} clubs):\n${JSON.stringify(playerData.clubs, null, 2)}`
      : '';
    const personaInfo = personaProfiles.length > 0
      ? `\nEA PERSONA PROFILES (${personaProfiles.length} hits):\n${JSON.stringify(personaProfiles, null, 2)}`
      : '';

    const prompt = `You are an expert football/soccer scout and analyst. Analyze this player's comprehensive statistics and provide a detailed scouting report.

PLAYER DATA:
${JSON.stringify(playerData, null, 2)}
${clubsInfo}
${personaInfo}

ADDITIONAL METRICS:
- Goals per game: ${goalsPerGame}
- Assists per game: ${assistsPerGame}
- Total goal contributions: ${totalGoalContributions}
- Data source: ${playerData.source === 'ea_api' ? 'EA FC Pro Clubs API (external lookup)' : 'SquadIQ Database (Discord member)'}
- Is Discord member: ${discordPlayerFound}
- Clubs tracked: ${eaClubStats.length}

Provide a detailed scouting report covering:
1. **Player Overview** - Brief summary of who this player is
2. **Strengths** - What they excel at based on the data
3. **Weaknesses** - Areas needing improvement
4. **Position Analysis** - Best positions and versatility
5. **Form Assessment** - Current form and recent performance trends${playerData.form ? '' : ' (N/A for external lookups)'}
6. **Chemistry Insights** - Who they play well with${playerData.chemistry?.length > 0 ? '' : ' (N/A for external lookups)'}
7. **Reliability Rating** - Attendance and consistency${playerData.reliability ? '' : ' (N/A for external lookups)'}
8. **Multi-Club Analysis** - Performance across different clubs${eaClubStats.length > 0 ? '' : ' (N/A)'}
9. **Draft Value** - How valuable would they be in a draft pick
10. **Recommendations** - Tactical suggestions for using this player

Be specific and reference actual numbers from the data. Format with markdown.`;

    // Call OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert football scout providing detailed player analysis reports. Be analytical, insightful, and back up observations with data.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI error:', error);
      return new Response(JSON.stringify({ error: 'Failed to generate AI analysis' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResult = await openaiResponse.json();
    const analysis = aiResult.choices[0]?.message?.content || 'Unable to generate analysis';

    // Save the scouting report to database (upsert - replace if exists)
    const playerId = player_id || `ea_${ea_username?.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const reportGuildId = guild_id || eaClubStats[0]?.guild_id || 'global';
    
    try {
      await supabase
        .from('scouting_reports')
        .upsert({
          guild_id: reportGuildId,
          discord_user_id: playerId,
          ea_username: ea_username || playerData.profile?.ea_username,
          report_content: analysis,
          player_data: playerData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'guild_id,discord_user_id'
        });
      console.log(`[scout-player] Saved scouting report for ${playerId} in guild ${reportGuildId}`);
    } catch (saveError) {
      console.error('[scout-player] Failed to save report:', saveError);
      // Don't fail the request if save fails
    }

    return new Response(JSON.stringify({
      success: true,
      player_data: playerData,
      ea_clubs: eaClubStats,
      persona_profiles: personaProfiles,
      analysis
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scout-player:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});