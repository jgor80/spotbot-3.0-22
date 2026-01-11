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

// EA Session Cookie from environment (optional, for bypassing blocks)
const EA_SESSION_COOKIE = Deno.env.get('EA_SESSION_COOKIE') || '';

const EA_HEADERS: Record<string, string> = {
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
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ...(EA_SESSION_COOKIE && { 'Cookie': EA_SESSION_COOKIE })
}

if (EA_SESSION_COOKIE) {
  console.log('[sync-ea-stats] EA session cookie configured')
}

const KNOWN_MEMBER_KEYS = new Set([
  'assists', 'goals', 'gamesPlayed', 'matches', 'wins', 'losses', 'ratingAve', 'avgRating',
  'cleanSheetsDef', 'cleanSheetsGK', 'cleanSheets', 'manOfTheMatch', 'mom', 'favoritePosition', 'proPos',
  'shots', 'tacklesmade', 'tackles', 'passesmade', 'passesMade', 'passattempts', 'passAttempts', 'saves',
  'gksaves', 'gkSaves', 'interceptions', 'clearances', 'name', 'playerName', 'proName', 'proOverall',
  'position', 'pos', 'redcards', 'redCards', 'yellowcards', 'yellowCards', 'goalsConceded', 'penalties',
  'penaltiesTaken', 'dribblesCompleted', 'dribblesAttempted', 'offsides', 'foulsCommitted', 'minutesPlayed',
  // New fields for second assists and dribbles
  'secondAssists', 'secondassists', 'secondAssist', 'secondassist',
  'dribblewon', 'dribbleswon', 'dribblesWon', 'dribbles', 'dribbleattempts', 'dribbleAttempts',
  // Additional known match player stat keys
  'playername', 'rating', 'possession', 'cleansheetsany', 'cleansheetsdef', 'cleansheetsgk',
  'tackleattempts', 'tackleAttempts', 'ballDiveSaves', 'ballDivesaves', 'crossSaves', 'crosssaves',
  'parrySaves', 'parrysaves', 'punchSaves', 'punchsaves', 'reflexSaves', 'reflexsaves',
  'foulcommited', 'fouls', 'archetypeid', 'archetypeId',
  // Career stats fields
  'preferredPosition', 'careerGoals', 'careerAssists', 'careerAppearances',
  // Event aggregate fields (contain hidden stats)
  'match_event_aggregate_0', 'match_event_aggregate_1', 'match_event_aggregate_2', 'match_event_aggregate_3'
])

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
  163: 'ballRecoveriesLoose', // Discovered: r=0.81 with tackles
  164: 'recoveriesOppHalf',   // Discovered: r=0.97 with tackles
  
  // Passing stats
  1: 'passes',             // Pass events
  174: 'forwardPasses',    // Discovered: r=0.65 with passes_made
  176: 'possessionGains',  // Discovered: r=0.80 with passes_made
  215: 'passAttempts',     // Discovered: r=1.0 with passes
  
  // Attacking stats
  3: 'takeOns',            // Dribble attempts (take-ons)
  13: 'shots',             // Confirmed: 100% correlation
  16: 'goals',             // Goal events
  106: 'aerialDuelsWon',   // Discovered: r=0.98 with goals
  217: 'shotsOffTarget',   // Discovered: r=0.70 with shots
  
  // Duel stats
  44: 'aerialDuels',       // Aerial duels total
  100: 'groundDuelsTotal', // Ground duels total
  101: 'groundDuelsWon',   // Ground duels won
  105: 'aerialDuelsTotal', // Aerial duels total
  107: 'looseBallDuels',   // Loose ball duels
  
  // GK stats
  10: 'savesStandard',     // Confirmed: 100% correlation with saves
  50: 'savesDiving',       // GK diving saves
  267: 'goodDirectionSaves', // Confirmed: 100% correlation
  
  // Meta
  113: 'matchPlayed',      // Match played marker
}

// Track unknown event codes for discovery
const discoveredEventCodes = new Set<string>()

// Parse event aggregate strings to extract hidden stats
// Format: "eventId:count,eventId:count,..." e.g., "8:2,12:3,49:1"
function parseEventAggregate(
  agg0?: string,
  agg1?: string,
  agg2?: string,
  agg3?: string
): Record<string, number> {
  const result: Record<string, number> = {}
  const unknownCodes: string[] = []
  
  // Combine all aggregate strings
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
    } else {
      // Track unknown event codes for logging
      if (!discoveredEventCodes.has(pair)) {
        discoveredEventCodes.add(pair)
        unknownCodes.push(pair)
      }
    }
  }
  
  // Log any new unknown codes we found (for discovery)
  if (unknownCodes.length > 0) {
    console.log(`[sync-ea-stats] Discovered unknown event codes: ${unknownCodes.join(', ')}`)
  }
  
  return result
}

// ===== FALLBACK PATH EXTRACTION UTILITY =====
// Per EA data map: "If path is an array, try in order until found"
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return null;
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function extractWithFallback(obj: any, paths: string[]): any {
  for (const path of paths) {
    const value = getNestedValue(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

// Fetch match history with player stats
// matchType9 = Division games, matchType13 = Cup/Knockout games (competitions/friendlies)
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

// Probe potential/undocumented EA endpoints when requested
async function probeHiddenEndpoints(platform: string, clubId: string) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  const candidates = [
    { name: 'club_seasonal_stats', url: `https://proclubs.ea.com/api/fc/clubs/seasonalStats?platform=${fcPlatform}&clubId=${clubId}` },
    { name: 'club_leaderboard', url: `https://proclubs.ea.com/api/fc/clubs/leaderboard?platform=${fcPlatform}&clubId=${clubId}&type=world` },
    { name: 'member_career', url: `https://proclubs.ea.com/api/fc/members/career/stats?platform=${fcPlatform}&clubId=${clubId}` },
    { name: 'club_rivals', url: `https://proclubs.ea.com/api/fc/clubs/rivals/stats?platform=${fcPlatform}&clubId=${clubId}` },
    { name: 'club_settings', url: `https://proclubs.ea.com/api/fc/club/settings?platform=${fcPlatform}&clubId=${clubId}` }
  ]

  const results = [] as { name: string; status: number; ok: boolean }[]

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { headers: EA_HEADERS })
      results.push({ name: candidate.name, status: response.status, ok: response.ok })
    } catch (err) {
      console.error(`[EA] Probe failed for ${candidate.name}:`, err)
      results.push({ name: candidate.name, status: 0, ok: false })
    }
  }

  return results
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

// Fetch club seasonal stats (current division, skill rating for current season)
async function fetchClubSeasonalStats(clubId: string, platform: string) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  
  try {
    const response = await fetch(`https://proclubs.ea.com/api/fc/clubs/seasonalStats?platform=${fcPlatform}&clubIds=${clubId}`, {
      headers: EA_HEADERS
    })
    
    if (!response.ok) {
      console.error(`[EA] Club seasonal stats request failed: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    // Per data map: jsonpaths: ["$.clubs[0]", "$[0]", "$"]
    if (Array.isArray(data) && data.length > 0) return data[0]
    if (data?.clubs?.[0]) return data.clubs[0]
    if (data[clubId]) return data[clubId]
    return data
  } catch (err) {
    console.error(`[EA] Error fetching club seasonal stats for ${clubId}:`, err)
    return null
  }
}

// Fetch club overall/career stats
async function fetchClubOverallStats(clubId: string, platform: string) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  
  try {
    const response = await fetch(`https://proclubs.ea.com/api/fc/clubs/overallStats?platform=${fcPlatform}&clubIds=${clubId}`, {
      headers: EA_HEADERS
    })
    
    if (!response.ok) {
      console.error(`[EA] Club overall stats request failed: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    if (Array.isArray(data) && data.length > 0) return data[0]
    if (data?.clubs?.[0]) return data.clubs[0]
    if (data[clubId]) return data[clubId]
    return data
  } catch (err) {
    console.error(`[EA] Error fetching club overall stats for ${clubId}:`, err)
    return null
  }
}

// Fetch club playoff achievements/trophies
async function fetchClubPlayoffAchievements(clubId: string, platform: string) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  
  try {
    // Note: This endpoint uses clubId (singular) not clubIds
    const response = await fetch(`https://proclubs.ea.com/api/fc/club/playoffAchievements?platform=${fcPlatform}&clubId=${clubId}`, {
      headers: EA_HEADERS
    })
    
    if (!response.ok) {
      console.error(`[EA] Club playoff achievements request failed: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    return data
  } catch (err) {
    console.error(`[EA] Error fetching club playoff achievements for ${clubId}:`, err)
    return null
  }
}

// Fetch member career stats (preferred position, career totals)
async function fetchMemberCareerStats(clubId: string, platform: string) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform
  
  try {
    const response = await fetch(`https://proclubs.ea.com/api/fc/members/career/stats?platform=${fcPlatform}&clubId=${clubId}`, {
      headers: EA_HEADERS
    })
    
    if (!response.ok) {
      console.error(`[EA] Member career stats request failed: ${response.status}`)
      return []
    }
    
    const data = await response.json()
    // Per data map: jsonpaths: ["$.members", "$.players", "$"]
    if (data?.members && Array.isArray(data.members)) return data.members
    if (data?.players && Array.isArray(data.players)) return data.players
    if (Array.isArray(data)) return data
    return Object.values(data).filter(v => v && typeof v === 'object')
  } catch (err) {
    console.error(`[EA] Error fetching member career stats for ${clubId}:`, err)
    return []
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

// Calculate streaks and form from recent matches
function calculateClubForm(matches: any[], clubId: string): {
  win_streak: number;
  loss_streak: number;
  unbeaten_streak: number;
  last_5_results: string[];
  last_10_results: string[];
  league_games: number;
  cup_games: number;
  friendly_games: number;
  total_clean_sheets: number;
} {
  // Sort matches by timestamp (most recent first)
  const sortedMatches = [...matches].sort((a, b) => {
    const timeA = parseInt(a.timestamp || a.matchTime || 0);
    const timeB = parseInt(b.timestamp || b.matchTime || 0);
    return timeB - timeA;
  });

  const results: string[] = [];
  let winStreak = 0;
  let lossStreak = 0;
  let unbeatenStreak = 0;
  let leagueGames = 0;
  let cupGames = 0;
  let friendlyGames = 0;
  let totalCleanSheets = 0;

  for (const match of sortedMatches.slice(0, 10)) {
    const clubs = match.clubs || {};
    const ourClub = clubs[clubId];
    if (!ourClub) continue;

    // Determine result
    const goalsFor = parseInt(ourClub.goals || 0);
    const goalsAgainst = Object.entries(clubs)
      .filter(([id]) => id !== clubId)
      .reduce((sum, [, club]: [string, any]) => sum + parseInt(club.goals || 0), 0);

    let result: string;
    if (goalsFor > goalsAgainst) result = 'W';
    else if (goalsFor < goalsAgainst) result = 'L';
    else result = 'D';

    results.push(result);

    // Count clean sheets
    if (goalsAgainst === 0) totalCleanSheets++;

    // Count match types
    const matchType = match.matchType?.toLowerCase() || '';
    if (matchType.includes('league') || matchType.includes('division') || matchType === 'matchtype9') {
      leagueGames++;
    } else if (matchType.includes('cup') || matchType.includes('knockout') || matchType === 'matchtype13') {
      cupGames++;
    } else {
      friendlyGames++;
    }
  }

  // Calculate current streaks (from most recent)
  for (const r of results) {
    if (r === 'W') {
      if (lossStreak === 0 && results.indexOf(r) === results.findIndex(x => x === r)) winStreak++;
      else break;
    } else break;
  }
  for (const r of results) {
    if (r === 'L') {
      if (winStreak === 0 && results.indexOf(r) === results.findIndex(x => x === r)) lossStreak++;
      else break;
    } else break;
  }
  for (const r of results) {
    if (r !== 'L') unbeatenStreak++;
    else break;
  }

  return {
    win_streak: winStreak,
    loss_streak: lossStreak,
    unbeaten_streak: unbeatenStreak,
    last_5_results: results.slice(0, 5),
    last_10_results: results.slice(0, 10),
    league_games: leagueGames,
    cup_games: cupGames,
    friendly_games: friendlyGames,
    total_clean_sheets: totalCleanSheets,
  };
}

// Session detection: find or create a session for a match
// Sessions group matches played within 30 minutes of each other
const SESSION_GAP_MINUTES = 30;

async function findOrCreateSession(
  supabase: any,
  guildId: string,
  clubKey: string,
  matchTimestamp: number
): Promise<string | null> {
  try {
    const matchDate = new Date(matchTimestamp * 1000);
    const windowStart = new Date(matchDate.getTime() - SESSION_GAP_MINUTES * 60 * 1000);
    const windowEnd = new Date(matchDate.getTime() + SESSION_GAP_MINUTES * 60 * 1000);

    // Look for an existing session within the time window
    const { data: existingSessions, error: findError } = await supabase
      .from('club_sessions')
      .select('id, started_at, ended_at')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey)
      .or(`and(started_at.lte.${windowEnd.toISOString()},ended_at.gte.${windowStart.toISOString()}),and(started_at.lte.${windowEnd.toISOString()},ended_at.is.null)`)
      .order('started_at', { ascending: false })
      .limit(1);

    if (findError) {
      console.error(`[sync-ea-stats] Error finding session:`, findError);
      return null;
    }

    if (existingSessions && existingSessions.length > 0) {
      const session = existingSessions[0];
      // Update ended_at if this match extends the session
      const sessionEnd = session.ended_at ? new Date(session.ended_at) : new Date(session.started_at);
      if (matchDate > sessionEnd) {
        await supabase
          .from('club_sessions')
          .update({ ended_at: matchDate.toISOString() })
          .eq('id', session.id);
      }
      const sessionStart = new Date(session.started_at);
      if (matchDate < sessionStart) {
        await supabase
          .from('club_sessions')
          .update({ started_at: matchDate.toISOString() })
          .eq('id', session.id);
      }
      return session.id;
    }

    // Create a new session
    const { data: newSession, error: createError } = await supabase
      .from('club_sessions')
      .insert({
        guild_id: guildId,
        club_key: clubKey,
        started_at: matchDate.toISOString(),
        ended_at: matchDate.toISOString(),
      })
      .select('id')
      .single();

    if (createError) {
      console.error(`[sync-ea-stats] Error creating session:`, createError);
      return null;
    }

    console.log(`[sync-ea-stats] Created new session ${newSession.id} for ${clubKey}`);
    return newSession.id;
  } catch (err) {
    console.error(`[sync-ea-stats] Error in findOrCreateSession:`, err);
    return null;
  }
}

// Update session aggregate stats after adding a match
async function updateSessionStats(
  supabase: any,
  sessionId: string,
  matchData: {
    result: string;
    scoreFor: number;
    scoreAgainst: number;
    playerStats: any[];
    playerUsernames: string[];
  }
) {
  try {
    // Get current session data
    const { data: session, error: fetchError } = await supabase
      .from('club_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      console.error(`[sync-ea-stats] Error fetching session for update:`, fetchError);
      return;
    }

    // Aggregate new values
    const isCleanSheet = matchData.scoreAgainst === 0;
    const existingPlayers = (session.players as string[]) || [];
    const newPlayers = [...new Set([...existingPlayers, ...matchData.playerUsernames])];

    // Sum up player stats
    let totalShots = 0, totalShotsOnTarget = 0, totalPassesMade = 0, totalPassAttempts = 0;
    let totalTackles = 0, totalTackleAttempts = 0, totalAssists = 0, redCards = 0;

    for (const pStat of matchData.playerStats) {
      totalShots += pStat.shots || 0;
      totalShotsOnTarget += pStat.goals || 0; // Using goals as proxy for shots on target
      totalPassesMade += pStat.passes_made || 0;
      totalPassAttempts += pStat.pass_attempts || 0;
      totalTackles += pStat.tackles || 0;
      totalTackleAttempts += pStat.tackle_attempts || 0;
      totalAssists += pStat.assists || 0;
      if (pStat.red_cards) redCards++;
    }

    const { error: updateError } = await supabase
      .from('club_sessions')
      .update({
        match_count: (session.match_count || 0) + 1,
        wins: (session.wins || 0) + (matchData.result === 'win' ? 1 : 0),
        draws: (session.draws || 0) + (matchData.result === 'draw' ? 1 : 0),
        losses: (session.losses || 0) + (matchData.result === 'loss' ? 1 : 0),
        goals_for: (session.goals_for || 0) + matchData.scoreFor,
        goals_against: (session.goals_against || 0) + matchData.scoreAgainst,
        total_shots: (session.total_shots || 0) + totalShots,
        total_shots_on_target: (session.total_shots_on_target || 0) + totalShotsOnTarget,
        total_passes_made: (session.total_passes_made || 0) + totalPassesMade,
        total_pass_attempts: (session.total_pass_attempts || 0) + totalPassAttempts,
        total_tackles: (session.total_tackles || 0) + totalTackles,
        total_tackle_attempts: (session.total_tackle_attempts || 0) + totalTackleAttempts,
        total_assists: (session.total_assists || 0) + totalAssists,
        red_cards: (session.red_cards || 0) + redCards,
        clean_sheets: (session.clean_sheets || 0) + (isCleanSheet ? 1 : 0),
        players: newPlayers,
        player_count: newPlayers.length,
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error(`[sync-ea-stats] Error updating session stats:`, updateError);
    }
  } catch (err) {
    console.error(`[sync-ea-stats] Error in updateSessionStats:`, err);
  }
}

// Track division changes for promotions/relegations
async function trackDivisionChange(
  supabase: any,
  guildId: string,
  clubKey: string,
  currentDivision: string | null
) {
  if (!currentDivision) return;

  try {
    // Get current club stats
    const { data: clubStats, error: fetchError } = await supabase
      .from('club_stats')
      .select('previous_division, promotions, relegations')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey)
      .maybeSingle();

    if (fetchError || !clubStats) return;

    const previousDiv = clubStats.previous_division;
    if (!previousDiv || previousDiv === currentDivision) {
      // Just update the previous_division if not set
      if (!previousDiv) {
        await supabase
          .from('club_stats')
          .update({ previous_division: currentDivision })
          .eq('guild_id', guildId)
          .eq('club_key', clubKey);
      }
      return;
    }

    // Extract division numbers (assumes format like "Division 1", "Div 2", etc.)
    const prevNum = parseInt(previousDiv.replace(/\D/g, '')) || 99;
    const currNum = parseInt(currentDivision.replace(/\D/g, '')) || 99;

    let updates: any = { previous_division: currentDivision };

    if (currNum < prevNum) {
      // Promoted (lower division number = higher division)
      updates.promotions = (clubStats.promotions || 0) + 1;
      console.log(`[sync-ea-stats] Club ${clubKey} promoted from ${previousDiv} to ${currentDivision}`);
    } else if (currNum > prevNum) {
      // Relegated
      updates.relegations = (clubStats.relegations || 0) + 1;
      console.log(`[sync-ea-stats] Club ${clubKey} relegated from ${previousDiv} to ${currentDivision}`);
    }

    await supabase
      .from('club_stats')
      .update(updates)
      .eq('guild_id', guildId)
      .eq('club_key', clubKey);
  } catch (err) {
    console.error(`[sync-ea-stats] Error tracking division change:`, err);
  }
}

// Sync club stats to database
async function syncClubStats(supabase: any, guildId: string, clubKey: string, clubId: string, platform: string, recentMatches?: any[]) {
  try {
    // Fetch all available club data from EA API endpoints
    const clubInfo = await fetchClubInfo(clubId, platform)
    if (!clubInfo) return null

    // NEW: Fetch seasonal stats for current division (not just best)
    const seasonalStats = await fetchClubSeasonalStats(clubId, platform)
    
    // NEW: Fetch overall stats for total matches played
    const overallStats = await fetchClubOverallStats(clubId, platform)
    
    // NEW: Fetch playoff achievements/trophies
    const playoffData = await fetchClubPlayoffAchievements(clubId, platform)

    // Calculate form from recent matches if provided
    const formData = recentMatches && recentMatches.length > 0
      ? calculateClubForm(recentMatches, clubId)
      : null;
    
    // Extract data using fallback paths per EA data map
    const clubData: Record<string, any> = {
      guild_id: guildId,
      club_key: clubKey,
      ea_club_id: clubId,
      ea_platform: platform,
      
      // From club_info endpoint with fallback paths
      club_name: extractWithFallback(clubInfo, ['name', 'clubName']) || null,
      crest_id: extractWithFallback(clubInfo, ['crestId', 'crest_id']) || null,
      region: extractWithFallback(clubInfo, ['region', 'customKit.region']) || null,
      custom_kit_home: extractWithFallback(clubInfo, ['customKit.home', 'customKit']) || null,
      total_members: parseInt(extractWithFallback(clubInfo, ['memberCount', 'members']) || 0),
      best_division: extractWithFallback(clubInfo, ['bestDivision', 'divisionName']) || null,
      stadium_name: extractWithFallback(clubInfo, ['stadiumName', 'stadium']) || null,
      reputation_tier: extractWithFallback(clubInfo, ['reputationTier', 'clubStar']) || null,
      
      // From seasonal stats endpoint with fallback paths
      current_division: extractWithFallback(seasonalStats, ['division', 'currentDivision']) || null,
      skill_rating: parseInt(extractWithFallback(seasonalStats, ['skillRating', 'skill_rating']) || 
                            extractWithFallback(clubInfo, ['skillRating', 'skill_rating']) || 0),
      wins: parseInt(extractWithFallback(seasonalStats, ['wins']) || 
                    extractWithFallback(clubInfo, ['wins']) || 0),
      draws: parseInt(extractWithFallback(seasonalStats, ['ties', 'draws']) || 
                     extractWithFallback(clubInfo, ['draws', 'ties']) || 0),
      losses: parseInt(extractWithFallback(seasonalStats, ['losses']) || 
                      extractWithFallback(clubInfo, ['losses']) || 0),
      
      // From overall stats endpoint with fallback paths
      overall_matches_played: parseInt(extractWithFallback(overallStats, ['gamesPlayed', 'matchesPlayed']) || 0),
      goals_scored: parseInt(extractWithFallback(overallStats, ['goals', 'goalsFor']) || 
                            extractWithFallback(clubInfo, ['goals', 'goalsFor']) || 0),
      goals_conceded: parseInt(extractWithFallback(overallStats, ['goalsAgainst']) || 
                              extractWithFallback(clubInfo, ['goalsAgainst']) || 0),
      
      // Playoff achievements (stored as JSONB)
      playoff_achievements: extractWithFallback(playoffData, ['achievements', 'trophies', 'playoffAchievements']) || null,
      
      last_synced_at: new Date().toISOString()
    }

    // Add form data if calculated
    if (formData) {
      clubData.win_streak = formData.win_streak;
      clubData.loss_streak = formData.loss_streak;
      clubData.unbeaten_streak = formData.unbeaten_streak;
      clubData.last_5_results = formData.last_5_results;
      clubData.last_10_results = formData.last_10_results;
      clubData.league_games = formData.league_games;
      clubData.cup_games = formData.cup_games;
      clubData.friendly_games = formData.friendly_games;
      clubData.total_clean_sheets = formData.total_clean_sheets;
    }
    
    const { error } = await supabase
      .from('club_stats')
      .upsert(clubData, { onConflict: 'guild_id,club_key' })
    
    if (error) {
      console.error(`[sync-ea-stats] Failed to sync club stats:`, error.message)
      return null
    }
    
    console.log(`[sync-ea-stats] Synced club stats for ${clubData.club_name}: ${clubData.skill_rating} SR, div: ${clubData.current_division || 'N/A'}, form: ${formData?.last_5_results?.join('') || 'N/A'}`)
    return clubData
  } catch (err) {
    console.error(`[sync-ea-stats] Error syncing club stats:`, err)
    return null
  }
}

type AggregatedPlayerStats = {
  discord_user_id: string
  discord_username: string | null
  games_played: number
  wins: number
  losses: number
  draws: number
  goals: number
  assists: number
  second_assists: number
  clean_sheets: number
  man_of_match: number
  rating_sum: number
  shots: number
  tackles: number
  tackle_attempts: number
  passes_made: number
  pass_attempts: number
  saves: number
  saves_diving: number
  saves_reflex: number
  saves_parry: number
  saves_cross: number
  saves_punch: number
  goals_conceded: number
  interceptions: number
  clearances: number
  dribbles: number
  dribble_attempts: number
  fouls: number
  offsides: number
  seconds_played: number
  position_counts: Record<string, number>
}

function getPrimaryPosition(positionCounts: Record<string, number>): string | null {
  const sorted = Object.entries(positionCounts).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] || null
}

function addOrUpdateAggregate(
  aggregates: Map<string, AggregatedPlayerStats>,
  profile: { discord_user_id: string; discord_username: string | null },
  stats: {
    gamesPlayed: number
    wins: number
    losses: number
    draws: number
    goals: number
    assists: number
    secondAssists: number
    cleanSheets: number
    manOfMatch: number
    avgRating: number
    shots: number
    tackles: number
    passesMade: number
    passAttempts: number
    saves: number
    interceptions: number
    clearances: number
    dribbles: number
    dribbleAttempts: number
    normalizedPosition: string | null
  }
) {
  const existing = aggregates.get(profile.discord_user_id)

  const aggregate: AggregatedPlayerStats = existing ?? {
    discord_user_id: profile.discord_user_id,
    discord_username: profile.discord_username,
    games_played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    goals: 0,
    assists: 0,
    second_assists: 0,
    clean_sheets: 0,
    man_of_match: 0,
    rating_sum: 0,
    shots: 0,
    tackles: 0,
    tackle_attempts: 0,
    passes_made: 0,
    pass_attempts: 0,
    saves: 0,
    saves_diving: 0,
    saves_reflex: 0,
    saves_parry: 0,
    saves_cross: 0,
    saves_punch: 0,
    goals_conceded: 0,
    interceptions: 0,
    clearances: 0,
    dribbles: 0,
    dribble_attempts: 0,
    fouls: 0,
    offsides: 0,
    seconds_played: 0,
    position_counts: {},
  }

  aggregate.discord_username = profile.discord_username
  aggregate.games_played += stats.gamesPlayed
  aggregate.wins += stats.wins
  aggregate.losses += stats.losses
  aggregate.draws += stats.draws
  aggregate.goals += stats.goals
  aggregate.assists += stats.assists
  aggregate.second_assists += stats.secondAssists
  aggregate.clean_sheets += stats.cleanSheets
  aggregate.man_of_match += stats.manOfMatch
  aggregate.rating_sum += stats.avgRating * stats.gamesPlayed
  aggregate.shots += stats.shots
  aggregate.tackles += stats.tackles
  aggregate.passes_made += stats.passesMade
  aggregate.pass_attempts += stats.passAttempts
  aggregate.saves += stats.saves
  aggregate.interceptions += stats.interceptions
  aggregate.clearances += stats.clearances
  aggregate.dribbles += stats.dribbles
  aggregate.dribble_attempts += stats.dribbleAttempts

  if (stats.normalizedPosition) {
    aggregate.position_counts[stats.normalizedPosition] =
      (aggregate.position_counts[stats.normalizedPosition] || 0) + 1
  }

  aggregates.set(profile.discord_user_id, aggregate)
}

function trackDiscoveredMemberKeys(member: Record<string, unknown>, tracker: Set<string>) {
  Object.keys(member || {}).forEach((key) => tracker.add(key))
}

function calculateClubPerformanceRating(
  avgRating: number,
  winRate: number,
  goals: number,
  assists: number,
  gamesPlayed: number,
) {
  return Math.min(100, Math.max(0,
    (avgRating * 10) +
    (winRate * 0.3) +
    (goals / Math.max(1, gamesPlayed) * 10) +
    (assists / Math.max(1, gamesPlayed) * 5)
  ))
}

// Sync member career stats to player_ratings and player_summary
async function syncMemberStats(
  supabase: any,
  guildId: string,
  clubId: string,
  platform: string,
  clubName: string,
  aggregates: Map<string, AggregatedPlayerStats>
) {
  try {
    // Fetch season stats from members endpoint
    const members = await fetchClubMembers(clubId, platform)
    if (!members || members.length === 0) {
      console.log(`[sync-ea-stats] No members found for ${clubName}`)
      return { synced: 0, updatedPlayerIds: [], unknownMemberKeys: [] as string[] }
    }

    // NEW: Fetch career stats for preferred position and career totals
    const careerMembers = await fetchMemberCareerStats(clubId, platform)
    
    // Create lookup map for career data by player name (lowercase for matching)
    const careerLookup = new Map<string, any>()
    for (const m of careerMembers || []) {
      const name = extractWithFallback(m, ['name', 'playerName', 'personaName'])
      if (name) careerLookup.set(name.toLowerCase(), m)
    }

    let synced = 0
    const updatedPlayerIds: string[] = []
    const discoveredMemberKeys = new Set<string>()
    
    const positionMap: Record<string, string> = {
      'goalkeeper': 'GK', 'gk': 'GK',
      'defender': 'CB', 'cb': 'CB', 'rb': 'RB', 'lb': 'LB', 'rwb': 'RWB', 'lwb': 'LWB',
      'midfielder': 'CM', 'cm': 'CM', 'cdm': 'CDM', 'cam': 'CAM', 'rm': 'RM', 'lm': 'LM',
      'attacker': 'ST', 'st': 'ST', 'cf': 'CF', 'rw': 'RW', 'lw': 'LW', 'rf': 'RF', 'lf': 'LF'
    }
    
    for (const member of members) {
      trackDiscoveredMemberKeys(member, discoveredMemberKeys)
      const eaUsername = extractWithFallback(member, ['name', 'playerName', 'personaName'])
      if (!eaUsername) continue
      
      // Get career data for this member (if available)
      const careerData = careerLookup.get(eaUsername.toLowerCase())
      
      // Find profile for this EA username
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id, discord_username')
        .eq('ea_username', eaUsername)
        .maybeSingle()
      
      if (!profile || profile.discord_user_id.startsWith('ea_')) continue
      
      // Extract preferred position from career stats using fallback paths per data map
      const preferredPosition = extractWithFallback(careerData, ['favoritePosition', 'preferredPosition', 'pos']) ||
                                extractWithFallback(member, ['favoritePosition', 'proPos', 'pos'])
      
      // Extract career stats using fallback paths
      const careerGoals = parseInt(extractWithFallback(careerData, ['goals', 'stats.goals', 'career.goals']) || 0)
      const careerAssists = parseInt(extractWithFallback(careerData, ['assists', 'stats.assists', 'career.assists']) || 0)
      const careerAppearances = parseInt(extractWithFallback(careerData, ['gamesPlayed', 'appearances', 'stats.gamesPlayed']) || 0)
      
      // Update profile with preferred position and career stats from EA
      if (preferredPosition || careerGoals || careerAssists || careerAppearances) {
        const profileUpdate: Record<string, any> = {}
        if (preferredPosition) profileUpdate.preferred_position = preferredPosition
        if (careerGoals) profileUpdate.career_goals = careerGoals
        if (careerAssists) profileUpdate.career_assists = careerAssists
        if (careerAppearances) profileUpdate.career_appearances = careerAppearances
        
        if (Object.keys(profileUpdate).length > 0) {
          await supabase
            .from('profiles')
            .update(profileUpdate)
            .eq('discord_user_id', profile.discord_user_id)
          
          console.log(`[sync-ea-stats] Updated profile for ${eaUsername}: preferred_position=${preferredPosition}, career=${careerGoals}g ${careerAssists}a ${careerAppearances}apps`)
        }
      }
      
      // Extract aggregate stats from EA member season data
      const goals = parseInt(extractWithFallback(member, ['goals']) || 0)
      const assists = parseInt(extractWithFallback(member, ['assists']) || 0)
      const gamesPlayed = parseInt(extractWithFallback(member, ['gamesPlayed', 'matches']) || 0)
      const wins = parseInt(extractWithFallback(member, ['wins']) || 0)
      const losses = parseInt(extractWithFallback(member, ['losses']) || 0)
      const draws = gamesPlayed - wins - losses
      const avgRating = parseFloat(extractWithFallback(member, ['ratingAve', 'avgRating']) || 0)
      const cleanSheets = parseInt(extractWithFallback(member, ['cleanSheetsDef', 'cleanSheetsGK', 'cleanSheets']) || 0)
      const manOfMatch = parseInt(extractWithFallback(member, ['manOfTheMatch', 'mom']) || 0)
      const position = extractWithFallback(member, ['favoritePosition', 'proPos']) || null

      // Extended stats from EA API using fallback paths
      const shots = parseInt(extractWithFallback(member, ['shots']) || 0)
      const tackles = parseInt(extractWithFallback(member, ['tacklesmade', 'tackles']) || 0)
      const passesMade = parseInt(extractWithFallback(member, ['passesmade', 'passesMade']) || 0)
      const passAttempts = parseInt(extractWithFallback(member, ['passattempts', 'passAttempts']) || 0)
      const saves = parseInt(extractWithFallback(member, ['saves', 'gksaves', 'gkSaves']) || 0)
      const interceptions = parseInt(extractWithFallback(member, ['interceptions']) || 0)
      const clearances = parseInt(extractWithFallback(member, ['clearances']) || 0)
      
      // New fields: second assists and dribbles
      const secondAssists = parseInt(extractWithFallback(member, ['secondAssists', 'secondassists', 'secondAssist', 'secondassist']) || 0)
      const dribbles = parseInt(extractWithFallback(member, ['dribblesCompleted', 'dribblewon', 'dribbleswon', 'dribbles']) || 0)
      const dribbleAttempts = parseInt(extractWithFallback(member, ['dribblesAttempted', 'dribbleattempts', 'dribbleAttempts']) || 0)
      
      // Debug log to discover all EA member fields
      console.log(`[sync-ea-stats] Member ${eaUsername} fields:`, JSON.stringify(Object.keys(member).sort()))

      const normalizedPosition = position ? (positionMap[position.toLowerCase()] || position.toUpperCase()) : null

      addOrUpdateAggregate(aggregates, profile, {
        gamesPlayed,
        wins,
        losses,
        draws,
        goals,
        assists,
        secondAssists,
        cleanSheets,
        manOfMatch,
        avgRating,
        shots,
        tackles,
        passesMade,
        passAttempts,
        saves,
        interceptions,
        clearances,
        dribbles,
        dribbleAttempts,
        normalizedPosition,
      })

      updatedPlayerIds.push(profile.discord_user_id)
      synced++
      console.log(`[sync-ea-stats] Collected ${eaUsername}: ${gamesPlayed}G ${wins}W ${goals}g ${assists}a ${secondAssists}sa ${dribbles}dr`)
    }

    const unknownMemberKeys = [...discoveredMemberKeys].filter((key) => !KNOWN_MEMBER_KEYS.has(key))
    if (unknownMemberKeys.length > 0) {
      console.log(`[sync-ea-stats] Unmapped member keys detected: ${unknownMemberKeys.join(', ')}`)
    }

    return { synced, updatedPlayerIds, unknownMemberKeys }
  } catch (err) {
    console.error(`[sync-ea-stats] Error syncing member stats:`, err)
    return { synced: 0, updatedPlayerIds: [], unknownMemberKeys: [] as string[] }
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

async function persistAggregatedStats(
  supabase: any,
  guildId: string,
  aggregates: Map<string, AggregatedPlayerStats>
) {
  let persisted = 0
  for (const aggregate of aggregates.values()) {
    const gamesPlayed = aggregate.games_played
    const draws = Math.max(0, gamesPlayed - aggregate.wins - aggregate.losses)
    aggregate.draws = draws
    const winRate = gamesPlayed > 0 ? (aggregate.wins / gamesPlayed) * 100 : 0
    const avgRating = gamesPlayed > 0 ? aggregate.rating_sum / gamesPlayed : 0
    const primaryPosition = getPrimaryPosition(aggregate.position_counts)
    const clubPerformanceRating = calculateClubPerformanceRating(
      avgRating,
      winRate,
      aggregate.goals,
      aggregate.assists,
      gamesPlayed
    )

    const { data: existingRatings, error: ratingsFetchError } = await supabase
      .from('player_ratings')
      .select('id')
      .eq('guild_id', guildId)
      .eq('discord_user_id', aggregate.discord_user_id)

    if (ratingsFetchError) {
      console.error(`[sync-ea-stats] Failed to fetch player_ratings row for ${aggregate.discord_user_id}:`, ratingsFetchError)
      continue
    }

    const ratingId = existingRatings?.[0]?.id
    const extraRatingIds = (existingRatings || []).slice(1).map((row: any) => row.id)
    if (extraRatingIds.length > 0) {
      console.log(`[sync-ea-stats] Cleaning up duplicate player_ratings rows for ${aggregate.discord_user_id}: ${extraRatingIds.join(',')}`)
      await supabase.from('player_ratings').delete().in('id', extraRatingIds)
    }

    const ratingsData = {
      games_played: gamesPlayed,
      wins: aggregate.wins,
      losses: aggregate.losses,
      draws: draws,
      total_goals: aggregate.goals,
      total_assists: aggregate.assists,
      total_second_assists: aggregate.second_assists,
      total_clean_sheets: aggregate.clean_sheets,
      total_motm: aggregate.man_of_match,
      club_performance_rating: clubPerformanceRating,
      avg_match_rating: avgRating,
      shots: aggregate.shots,
      tackles: aggregate.tackles,
      tackle_attempts: aggregate.tackle_attempts,
      passes_made: aggregate.passes_made,
      pass_attempts: aggregate.pass_attempts,
      saves: aggregate.saves,
      saves_diving: aggregate.saves_diving,
      saves_reflex: aggregate.saves_reflex,
      saves_parry: aggregate.saves_parry,
      saves_cross: aggregate.saves_cross,
      saves_punch: aggregate.saves_punch,
      goals_conceded: aggregate.goals_conceded,
      interceptions: aggregate.interceptions,
      clearances: aggregate.clearances,
      dribbles: aggregate.dribbles,
      dribble_attempts: aggregate.dribble_attempts,
      fouls: aggregate.fouls,
      offsides: aggregate.offsides,
      last_game_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (ratingId) {
      await supabase
        .from('player_ratings')
        .update({ ...ratingsData, overall_rating: clubPerformanceRating })
        .eq('id', ratingId)
    } else {
      await supabase
        .from('player_ratings')
        .insert({
          guild_id: guildId,
          discord_user_id: aggregate.discord_user_id,
          overall_rating: clubPerformanceRating,
          ...ratingsData
        })
    }

    const { data: existingSummaries, error: summaryFetchError } = await supabase
      .from('player_summary')
      .select('id')
      .eq('guild_id', guildId)
      .eq('discord_user_id', aggregate.discord_user_id)

    if (summaryFetchError) {
      console.error(`[sync-ea-stats] Failed to fetch player_summary row for ${aggregate.discord_user_id}:`, summaryFetchError)
      continue
    }

    const summaryId = existingSummaries?.[0]?.id
    const extraSummaryIds = (existingSummaries || []).slice(1).map((row: any) => row.id)
    if (extraSummaryIds.length > 0) {
      console.log(`[sync-ea-stats] Cleaning up duplicate player_summary rows for ${aggregate.discord_user_id}: ${extraSummaryIds.join(',')}`)
      await supabase.from('player_summary').delete().in('id', extraSummaryIds)
    }

    const summaryData = {
      guild_id: guildId,
      discord_user_id: aggregate.discord_user_id,
      discord_username: aggregate.discord_username,
      games_played: gamesPlayed,
      wins: aggregate.wins,
      losses: aggregate.losses,
      draws: draws,
      goals: aggregate.goals,
      assists: aggregate.assists,
      second_assists: aggregate.second_assists,
      win_rate: winRate,
      overall_rating: clubPerformanceRating,
      avg_match_rating: avgRating,
      clean_sheets: aggregate.clean_sheets,
      man_of_match: aggregate.man_of_match,
      shots: aggregate.shots,
      tackles: aggregate.tackles,
      tackle_attempts: aggregate.tackle_attempts,
      passes_made: aggregate.passes_made,
      pass_attempts: aggregate.pass_attempts,
      saves: aggregate.saves,
      saves_diving: aggregate.saves_diving,
      saves_reflex: aggregate.saves_reflex,
      saves_parry: aggregate.saves_parry,
      saves_cross: aggregate.saves_cross,
      saves_punch: aggregate.saves_punch,
      goals_conceded: aggregate.goals_conceded,
      dribbles: aggregate.dribbles,
      dribble_attempts: aggregate.dribble_attempts,
      fouls: aggregate.fouls,
      offsides: aggregate.offsides,
      seconds_played: aggregate.seconds_played,
      interceptions: aggregate.interceptions,
      clearances: aggregate.clearances,
      primary_position: primaryPosition,
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (summaryId) {
      await supabase.from('player_summary').update(summaryData).eq('id', summaryId)
    } else {
      await supabase.from('player_summary').insert(summaryData)
    }

    persisted++
  }

  return persisted
}

function calculateFormRatingFromResults(results: string[]) {
  const windowed = results.slice(0, 5)
  const formPoints = windowed.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)
  return Math.round((formPoints / 15) * 100)
}

async function updatePlayerFormFromRecentMatches(
  supabase: any,
  guildId: string,
  discordUserId: string
) {
  const { data: recentStats, error: statsError } = await supabase
    .from('player_stats')
    .select('ea_match_id')
    .eq('guild_id', guildId)
    .eq('discord_user_id', discordUserId)
    .eq('match_type', 'club')
    .not('ea_match_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)

  if (statsError || !recentStats || recentStats.length === 0) return

  const matchIds = [...new Set(recentStats.map((s: any) => s.ea_match_id).filter(Boolean))]
  if (matchIds.length === 0) return

  const { data: matchResults, error: matchError } = await supabase
    .from('club_matches')
    .select('ea_match_id, result')
    .eq('guild_id', guildId)
    .in('ea_match_id', matchIds)

  if (matchError || !matchResults || matchResults.length === 0) return

  const resultMap = new Map(matchResults.map((m: any) => [m.ea_match_id, m.result]))
  const orderedResults = recentStats
    .map((stat: any) => {
      const r = resultMap.get(stat.ea_match_id)
      if (r === 'win') return 'W'
      if (r === 'loss') return 'L'
      if (r === 'draw') return 'D'
      return null
    })
    .filter((r: string | null): r is string => Boolean(r))

  if (orderedResults.length === 0) return

  const last5 = orderedResults.slice(0, 5)
  const last10 = orderedResults.slice(0, 10)

  let currentWinStreak = 0
  let currentLossStreak = 0
  let longestWinStreak = 0
  let longestLossStreak = 0

  for (const res of last10) {
    if (res === 'W') {
      if (currentLossStreak === 0) currentWinStreak++
      else currentWinStreak = 1
      currentLossStreak = 0
    } else if (res === 'L') {
      if (currentWinStreak === 0) currentLossStreak++
      else currentLossStreak = 1
      currentWinStreak = 0
    } else {
      currentWinStreak = 0
      currentLossStreak = 0
    }

    longestWinStreak = Math.max(longestWinStreak, currentWinStreak)
    longestLossStreak = Math.max(longestLossStreak, currentLossStreak)
  }

  // Current streak should be based on the leading run of W or L values
  const leading = last10[0]
  let currentWin = 0
  let currentLoss = 0
  for (const res of last10) {
    if (res !== leading) break
    if (res === 'W') currentWin++
    if (res === 'L') currentLoss++
  }

  const formRating = calculateFormRatingFromResults(last5)

  await supabase
    .from('player_streaks')
    .upsert({
      guild_id: guildId,
      discord_user_id: discordUserId,
      current_win_streak: leading === 'W' ? currentWin : 0,
      current_loss_streak: leading === 'L' ? currentLoss : 0,
      longest_win_streak: longestWinStreak,
      longest_loss_streak: longestLossStreak,
      last_5_results: last5,
      last_10_results: last10,
      form_rating: formRating,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,discord_user_id' })
}

// Sync tracked game stats from player_stats into player_club_stats per club
async function syncTrackedGameStatsToClubStats(
  supabase: any,
  guildId: string,
  clubKey: string
) {
  try {
    // Get all tracked games for this club
    const { data: clubMatches } = await supabase
      .from('club_matches')
      .select('ea_match_id')
      .eq('guild_id', guildId)
      .eq('club_key', clubKey);
    
    if (!clubMatches || clubMatches.length === 0) return 0;
    
    const clubMatchIds = clubMatches.map((m: any) => m.ea_match_id);
    
    // Get all player_stats for these matches
    const { data: playerStats, error: statsError } = await supabase
      .from('player_stats')
      .select(`
        discord_user_id,
        goals,
        assists,
        second_assists,
        won,
        ea_match_rating,
        clean_sheet,
        man_of_match,
        shots,
        tackles,
        tackle_attempts,
        passes_made,
        pass_attempts,
        saves_diving,
        saves_reflex,
        saves_parry,
        saves_cross,
        saves_punch,
        goals_conceded,
        interceptions,
        clearances,
        dribbles,
        dribble_attempts,
        fouls,
        offsides,
        seconds_played,
        position_played,
        archetypeid,
        ea_match_id
      `)
      .eq('guild_id', guildId)
      .in('ea_match_id', clubMatchIds);
    
    if (statsError) {
      console.error(`[sync-ea-stats] Error fetching player_stats for club ${clubKey}:`, statsError);
      return 0;
    }
    
    if (!playerStats || playerStats.length === 0) return 0;
    
    // Aggregate stats per player
    const playerAggregates = new Map<string, any>();
    
    for (const stat of playerStats) {
      const existing = playerAggregates.get(stat.discord_user_id) || {
        discord_user_id: stat.discord_user_id,
        games_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goals: 0,
        assists: 0,
        second_assists: 0,
        clean_sheets: 0,
        man_of_match: 0,
        shots: 0,
        tackles: 0,
        tackle_attempts: 0,
        passes_made: 0,
        pass_attempts: 0,
        saves: 0,
        saves_diving: 0,
        saves_reflex: 0,
        saves_parry: 0,
        saves_cross: 0,
        saves_punch: 0,
        goals_conceded: 0,
        interceptions: 0,
        clearances: 0,
        dribbles: 0,
        dribble_attempts: 0,
        fouls: 0,
        offsides: 0,
        seconds_played: 0,
        rating_sum: 0,
        position_counts: {} as Record<string, number>,
        archetypeid: null,
      };
      
      existing.games_played += 1;
      existing.goals += stat.goals || 0;
      existing.assists += stat.assists || 0;
      existing.second_assists += stat.second_assists || 0;
      existing.clean_sheets += stat.clean_sheet ? 1 : 0;
      existing.man_of_match += stat.man_of_match ? 1 : 0;
      existing.shots += stat.shots || 0;
      existing.tackles += stat.tackles || 0;
      existing.tackle_attempts += stat.tackle_attempts || 0;
      existing.passes_made += stat.passes_made || 0;
      existing.pass_attempts += stat.pass_attempts || 0;
      existing.saves += (stat.saves_diving || 0) + (stat.saves_reflex || 0) + (stat.saves_parry || 0) + (stat.saves_cross || 0) + (stat.saves_punch || 0);
      existing.saves_diving += stat.saves_diving || 0;
      existing.saves_reflex += stat.saves_reflex || 0;
      existing.saves_parry += stat.saves_parry || 0;
      existing.saves_cross += stat.saves_cross || 0;
      existing.saves_punch += stat.saves_punch || 0;
      existing.goals_conceded += stat.goals_conceded || 0;
      existing.interceptions += stat.interceptions || 0;
      existing.clearances += stat.clearances || 0;
      existing.dribbles += stat.dribbles || 0;
      existing.dribble_attempts += stat.dribble_attempts || 0;
      existing.fouls += stat.fouls || 0;
      existing.offsides += stat.offsides || 0;
      existing.seconds_played += stat.seconds_played || 0;
      existing.rating_sum += stat.ea_match_rating || 0;
      existing.archetypeid = existing.archetypeid || stat.archetypeid;
      
      if (stat.won === true) existing.wins += 1;
      else if (stat.won === false) existing.losses += 1;
      else existing.draws += 1;
      
      if (stat.position_played) {
        existing.position_counts[stat.position_played] = (existing.position_counts[stat.position_played] || 0) + 1;
      }
      
      playerAggregates.set(stat.discord_user_id, existing);
    }
    
    // Update player_club_stats with aggregated tracked game stats
    let updated = 0;
    for (const [discordUserId, agg] of playerAggregates) {
      const avgRating = agg.games_played > 0 ? agg.rating_sum / agg.games_played : 0;
      const winRate = agg.games_played > 0 ? (agg.wins / agg.games_played) * 100 : 0;
      const primaryPosition = getPrimaryPosition(agg.position_counts);
      
      // Check if player already has a record in player_club_stats
      const { data: existingRecord } = await supabase
        .from('player_club_stats')
        .select('id, games_played, goals, assists, saves, clean_sheets')
        .eq('guild_id', guildId)
        .eq('club_key', clubKey)
        .eq('discord_user_id', discordUserId)
        .maybeSingle();
      
      const clubStatsData = {
        guild_id: guildId,
        club_key: clubKey,
        discord_user_id: discordUserId,
        games_played: agg.games_played,
        wins: agg.wins,
        losses: agg.losses,
        draws: agg.draws,
        goals: agg.goals,
        assists: agg.assists,
        second_assists: agg.second_assists,
        clean_sheets: agg.clean_sheets,
        man_of_match: agg.man_of_match,
        avg_match_rating: avgRating,
        win_rate: winRate,
        shots: agg.shots,
        tackles: agg.tackles,
        tackle_attempts: agg.tackle_attempts,
        passes_made: agg.passes_made,
        pass_attempts: agg.pass_attempts,
        saves: agg.saves,
        saves_diving: agg.saves_diving,
        saves_reflex: agg.saves_reflex,
        saves_parry: agg.saves_parry,
        saves_cross: agg.saves_cross,
        saves_punch: agg.saves_punch,
        goals_conceded: agg.goals_conceded,
        interceptions: agg.interceptions,
        clearances: agg.clearances,
        dribbles: agg.dribbles,
        dribble_attempts: agg.dribble_attempts,
        fouls: agg.fouls,
        offsides: agg.offsides,
        seconds_played: agg.seconds_played,
        primary_position: primaryPosition,
        archetypeid: agg.archetypeid,
        updated_at: new Date().toISOString(),
      };
      
      if (existingRecord) {
        // Update existing record - merge with EA member stats if they exist
        const { error: updateError } = await supabase
          .from('player_club_stats')
          .update(clubStatsData)
          .eq('id', existingRecord.id);
        
        if (!updateError) updated++;
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('player_club_stats')
          .insert(clubStatsData);
        
        if (!insertError) updated++;
      }
    }
    
    console.log(`[sync-ea-stats] Updated ${updated} player_club_stats records for club ${clubKey} from tracked games`);
    return updated;
  } catch (err) {
    console.error(`[sync-ea-stats] Error syncing tracked game stats to club stats:`, err);
    return 0;
  }
}

// Enrich player_summary with save breakdowns from tracked games
// This is needed because EA member board only provides total saves, not breakdowns
async function enrichPlayerSummaryWithTrackedStats(
  supabase: any,
  guildId: string,
  playerIds: string[]
) {
  if (playerIds.length === 0) return 0;
  
  try {
    // Get all tracked game stats for these players
    const { data: playerStats, error: statsError } = await supabase
      .from('player_stats')
      .select(`
        discord_user_id,
        clean_sheet,
        saves_diving,
        saves_reflex,
        saves_parry,
        saves_cross,
        saves_punch,
        goals_conceded,
        tackles,
        tackle_attempts,
        clearances,
        interceptions,
        fouls,
        offsides,
        seconds_played
      `)
      .eq('guild_id', guildId)
      .in('discord_user_id', playerIds);
    
    if (statsError || !playerStats || playerStats.length === 0) return 0;
    
    // Aggregate stats per player
    const playerAggregates = new Map<string, any>();
    
    for (const stat of playerStats) {
      const existing = playerAggregates.get(stat.discord_user_id) || {
        clean_sheets: 0,
        saves: 0,
        saves_diving: 0,
        saves_reflex: 0,
        saves_parry: 0,
        saves_cross: 0,
        saves_punch: 0,
        goals_conceded: 0,
        tackles: 0,
        tackle_attempts: 0,
        clearances: 0,
        interceptions: 0,
        fouls: 0,
        offsides: 0,
        seconds_played: 0,
      };
      
      existing.clean_sheets += stat.clean_sheet ? 1 : 0;
      existing.saves_diving += stat.saves_diving || 0;
      existing.saves_reflex += stat.saves_reflex || 0;
      existing.saves_parry += stat.saves_parry || 0;
      existing.saves_cross += stat.saves_cross || 0;
      existing.saves_punch += stat.saves_punch || 0;
      existing.saves += (stat.saves_diving || 0) + (stat.saves_reflex || 0) + 
                        (stat.saves_parry || 0) + (stat.saves_cross || 0) + (stat.saves_punch || 0);
      existing.goals_conceded += stat.goals_conceded || 0;
      existing.tackles += stat.tackles || 0;
      existing.tackle_attempts += stat.tackle_attempts || 0;
      existing.clearances += stat.clearances || 0;
      existing.interceptions += stat.interceptions || 0;
      existing.fouls += stat.fouls || 0;
      existing.offsides += stat.offsides || 0;
      existing.seconds_played += stat.seconds_played || 0;
      
      playerAggregates.set(stat.discord_user_id, existing);
    }
    
    // Update player_summary with the aggregated tracked game stats
    let updated = 0;
    for (const [discordUserId, agg] of playerAggregates) {
      // Only update save breakdowns if player has any saves (likely a GK)
      if (agg.saves > 0) {
        const { error: updateError } = await supabase
          .from('player_summary')
          .update({
            saves: agg.saves,
            saves_diving: agg.saves_diving,
            saves_reflex: agg.saves_reflex,
            saves_parry: agg.saves_parry,
            saves_cross: agg.saves_cross,
            saves_punch: agg.saves_punch,
            goals_conceded: agg.goals_conceded,
            clean_sheets: agg.clean_sheets,
            updated_at: new Date().toISOString(),
          })
          .eq('guild_id', guildId)
          .eq('discord_user_id', discordUserId);
        
        if (!updateError) updated++;
      }
    }
    
    console.log(`[sync-ea-stats] Enriched ${updated} player_summary records with tracked game stats`);
    return updated;
  } catch (err) {
    console.error(`[sync-ea-stats] Error enriching player_summary with tracked stats:`, err);
    return 0;
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
    
    // Parse request body for sync type and optional probing
    let syncType = 'full'
    let requestBody: any = null
    try {
      requestBody = await req.json()
      syncType = requestBody.sync_type || 'full'
    } catch { /* ignore parse errors */ }

    const probeHidden = Boolean(requestBody?.probe_hidden) || Deno.env.get('EA_PROBE_HIDDEN') === 'true'
    
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
    const unmappedMemberKeys = new Set<string>()
    let hiddenProbeResults: { name: string; status: number; ok: boolean }[] = []
    const lastGameSnapshots: {
      guild_id: string
      club_key: string
      match_id: string | null
      match_fields: string[]
      player_fields: string[]
    }[] = []
    
    for (const settings of guildSettings) {
      const guildId = settings.guild_id
      const clubs = settings.clubs as any[]
      const aggregates = new Map<string, AggregatedPlayerStats>()
      const guildUpdatedPlayerIds = new Set<string>()

      if (!clubs || !Array.isArray(clubs)) continue
      
      for (const club of clubs) {
        if (!club.ea_club_id || !club.ea_platform || !club.monitoring_enabled) {
          continue
        }
        
        console.log(`[sync-ea-stats] Syncing ${club.name} (${club.ea_club_id}) for guild ${guildId}`)
        
        try {
          // Optionally probe undocumented endpoints for visibility
          if (probeHidden && hiddenProbeResults.length === 0) {
            hiddenProbeResults = await probeHiddenEndpoints(club.ea_platform, club.ea_club_id)
            console.log(`[sync-ea-stats] Hidden endpoint probe results:`, hiddenProbeResults)
          }

          // Fetch matches first so we can calculate form for club stats
          let allRecentMatches: any[] = [];
          if (syncType === 'full') {
            // Fetch division matches (matchType9), cup/competition matches (matchType13), and friendly matches (matchType22)
            const divisionMatches = await fetchMatches(club.ea_club_id, club.ea_platform, 'matchType9')
            const competitionMatches = await fetchMatches(club.ea_club_id, club.ea_platform, 'matchType13')
            const friendlyMatches = await fetchMatches(club.ea_club_id, club.ea_platform, 'matchType22')
            allRecentMatches = [...divisionMatches, ...competitionMatches, ...friendlyMatches]
          }

          // Sync club stats with form data from recent matches
          const clubStatsResult = await syncClubStats(supabase, guildId, club.key, club.ea_club_id, club.ea_platform, allRecentMatches)
          if (clubStatsResult) clubStatsSynced++

          // Sync member career stats (pulls from EA member list API)
          const { updatedPlayerIds, unknownMemberKeys } = await syncMemberStats(
            supabase, guildId, club.ea_club_id, club.ea_platform, club.name, aggregates
          )
          updatedPlayerIds.forEach(id => guildUpdatedPlayerIds.add(id))
          unknownMemberKeys?.forEach((key) => unmappedMemberKeys.add(key))
          
          // Also sync recent matches for match-by-match tracking
          if (syncType === 'full') {
            // Use division matches for primary processing
            const matches = allRecentMatches.filter(m => 
              (m.matchType?.includes?.('9') || m.matchType === 'matchType9') ||
              !m.matchType // Include matches without explicit type
            );

            if (matches && matches.length > 0) {
              // Surface every field we can see on the most recent match so we know what EA returns
              const latestMatch = matches.reduce((latest: any, current: any) => {
                const latestTime = parseInt(latest?.timestamp || latest?.matchDate || 0)
                const currentTime = parseInt(current?.timestamp || current?.matchDate || 0)
                if (!latest) return current
                if (!isNaN(currentTime) && currentTime > latestTime) return current
                return latest
              }, null as any)

              if (latestMatch) {
                const matchFields = Object.keys(latestMatch)
                const playerFieldSet = new Set<string>()
                const latestPlayers = latestMatch.players?.[club.ea_club_id] || {}
                for (const [, pStats] of Object.entries(latestPlayers) as any) {
                  Object.keys(pStats || {}).forEach((key) => playerFieldSet.add(key))
                }

                lastGameSnapshots.push({
                  guild_id: guildId,
                  club_key: club.key,
                  match_id: latestMatch.matchId?.toString?.() || null,
                  match_fields: matchFields,
                  player_fields: [...playerFieldSet]
                })
              }

              const { data: existingMatches } = await supabase
                .from('club_matches')
                .select('ea_match_id')
                .eq('guild_id', guildId)
                .eq('club_key', club.key)
              
              const existingIds = new Set((existingMatches || []).map((m: any) => m.ea_match_id))
              
              for (const matchData of matches) {
                // Use fallback paths per EA data map for match ID and timestamp
                const matchId = extractWithFallback(matchData, ['matchId', 'id', 'gameId'])?.toString()
                if (!matchId || existingIds.has(matchId)) {
                  totalSkipped++
                  continue
                }
                
                // Extract club data using fallback paths
                const homeClubId = extractWithFallback(matchData, ['home.clubId', 'clubs.home.clubId', 'homeId'])
                const awayClubId = extractWithFallback(matchData, ['away.clubId', 'clubs.away.clubId', 'awayId'])
                const ourClubData = matchData.clubs?.[club.ea_club_id]
                const opponentClubId = Object.keys(matchData.clubs || {}).find((id: string) => id !== club.ea_club_id)
                const opponentClubData = opponentClubId ? matchData.clubs[opponentClubId] : null
                
                // Extract scores using fallback paths
                const scoreFor = parseInt(extractWithFallback(ourClubData, ['goals']) || 
                                         extractWithFallback(matchData, ['home.goals', 'homeGoals', 'score.home']) || 0)
                const scoreAgainst = parseInt(extractWithFallback(opponentClubData, ['goals']) || 
                                             extractWithFallback(matchData, ['away.goals', 'awayGoals', 'score.away']) || 0)
                
                let result = 'draw'
                if (scoreFor > scoreAgainst) result = 'win'
                else if (scoreFor < scoreAgainst) result = 'loss'
                
                const playerStats: any[] = []
                // Use fallback paths for players data
                const players = extractWithFallback(matchData, ['players', 'playerStats', 'participants'])?.[club.ea_club_id] || 
                               matchData.players?.[club.ea_club_id] || {}
                
                for (const [, pStats] of Object.entries(players) as any) {
                  // Debug log all player stat fields from EA
                  console.log(`[sync-ea-stats] Match player ${pStats.playername} fields:`, JSON.stringify(Object.keys(pStats).sort()))
                  
                  // Parse event aggregates to extract hidden stats (interceptions, clearances, etc.)
                  const eventStats = parseEventAggregate(
                    pStats.match_event_aggregate_0,
                    pStats.match_event_aggregate_1,
                    pStats.match_event_aggregate_2,
                    pStats.match_event_aggregate_3
                  )
                  
                  // Calculate total saves from all save types
                  const savesDiving = parseInt(pStats.ballDiveSaves || pStats.ballDivesaves || 0)
                  const savesCross = parseInt(pStats.crossSaves || pStats.crosssaves || 0)
                  const savesParry = parseInt(pStats.parrySaves || pStats.parrysaves || 0)
                  const savesPunch = parseInt(pStats.punchSaves || pStats.punchsaves || 0)
                  const savesReflex = parseInt(pStats.reflexSaves || pStats.reflexsaves || 0)
                  const totalSaves = savesDiving + savesCross + savesParry + savesPunch + savesReflex
                  
                  // Clean sheet detection from EA data
                  const isCleanSheet = pStats.cleansheetsany === '1' || pStats.cleansheetsdef === '1' || pStats.cleansheetsgk === '1'
                  
                  // Extract interceptions and clearances from event aggregates (hidden stats!)
                  const interceptions = eventStats.interceptions || parseInt(pStats.interceptions || 0)
                  const clearances = eventStats.clearances || parseInt(pStats.clearances || 0)
                  const secondAssists = eventStats.secondAssists || parseInt(pStats.secondAssists || pStats.secondassists || 0)
                  const dribbles = eventStats.takeOns || parseInt(pStats.dribblesCompleted || pStats.dribblewon || pStats.dribbles || 0)
                  const dribbleAttempts = parseInt(pStats.dribblesAttempted || pStats.dribbleattempts || pStats.dribbleAttempts || 0)
                  const ballRecoveries = eventStats.ballRecoveries || 0
                  
                  playerStats.push({
                    ea_username: pStats.playername,
                    goals: parseInt(pStats.goals || 0),
                    assists: parseInt(pStats.assists || 0),
                    second_assists: secondAssists,
                    rating: parseFloat(pStats.rating || 0),
                    position: pStats.pos,
                    motm: pStats.mom === '1',
                    shots: parseInt(pStats.shots || 0),
                    tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
                    tackle_attempts: parseInt(pStats.tackleattempts || pStats.tackleAttempts || 0),
                    passes_made: parseInt(pStats.passesmade || pStats.passesMade || 0),
                    pass_attempts: parseInt(pStats.passattempts || pStats.passAttempts || 0),
                    red_cards: pStats.redcards === '1',
                    // GK save breakdowns
                    saves: totalSaves || parseInt(pStats.saves || pStats.gksaves || 0),
                    saves_diving: savesDiving,
                    saves_cross: savesCross,
                    saves_parry: savesParry,
                    saves_punch: savesPunch,
                    saves_reflex: savesReflex,
                    goals_conceded: parseInt(pStats.goalsconceded || pStats.goalsConceded || 0),
                    clean_sheet: isCleanSheet,
                    interceptions: interceptions,
                    clearances: clearances,
                    ball_recoveries: ballRecoveries,
                    possession: parseFloat(pStats.possession || 0),
                    dribbles: dribbles,
                    dribble_attempts: dribbleAttempts,
                    fouls: parseInt(pStats.fouls || pStats.foulcommited || 0),
                    offsides: parseInt(pStats.offsides || 0),
                    archetypeid: pStats.archetypeid || pStats.archetypeId || null
                  })
                }
                
                // Find or create session for this match using fallback paths for timestamp
                const matchTimestamp = parseInt(extractWithFallback(matchData, ['timestamp', 'matchTimestamp', 'time', 'matchTime']) || Date.now() / 1000);
                const sessionId = await findOrCreateSession(supabase, guildId, club.key, matchTimestamp);

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
                  player_stats: playerStats,
                  session_id: sessionId
                })
                
                if (!insertError) {
                  totalSynced++
                  existingIds.add(matchId)
                  
                  // Update session stats
                  if (sessionId) {
                    const playerUsernames = playerStats.map(p => p.ea_username).filter(Boolean);
                    await updateSessionStats(supabase, sessionId, {
                      result,
                      scoreFor,
                      scoreAgainst,
                      playerStats,
                      playerUsernames
                    });
                  }
                  
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
                        second_assists: pStat.second_assists,
                        clean_sheet: pStat.clean_sheet || (pStat.position === 'GK' && scoreAgainst === 0),
                        won: result === 'win',
                        ea_match_rating: pStat.rating,
                        position_played: pStat.position,
                        man_of_match: pStat.motm,
                        shots: pStat.shots,
                        tackles: pStat.tackles,
                        tackle_attempts: pStat.tackle_attempts,
                        passes_made: pStat.passes_made,
                        pass_attempts: pStat.pass_attempts,
                        red_cards: pStat.red_cards,
                        // GK save breakdowns
                        saves_diving: pStat.saves_diving,
                        saves_cross: pStat.saves_cross,
                        saves_parry: pStat.saves_parry,
                        saves_punch: pStat.saves_punch,
                        saves_reflex: pStat.saves_reflex,
                        goals_conceded: pStat.goals_conceded,
                        interceptions: pStat.interceptions,
                        clearances: pStat.clearances,
                        dribbles: pStat.dribbles,
                        dribble_attempts: pStat.dribble_attempts,
                        fouls: pStat.fouls,
                        offsides: pStat.offsides,
                        archetypeid: pStat.archetypeid
                      })

                      guildUpdatedPlayerIds.add(profile.discord_user_id)
                      await updatePlayerPositionPreferences(supabase, guildId, profile.discord_user_id)
                    }
                  }
                }
              }
            }
            
            // Track division changes for promotions/relegations
            if (clubStatsResult?.best_division) {
              await trackDivisionChange(supabase, guildId, club.key, clubStatsResult.best_division);
            }
            
            // Process competition/cup matches (matchType13) - these are tournament/league games
            const competitionMatches = allRecentMatches.filter(m => 
              m.matchType?.includes?.('13') || m.matchType === 'matchType13'
            );
            if (competitionMatches && competitionMatches.length > 0) {
              const { data: existingCompMatches } = await supabase
                .from('club_matches')
                .select('ea_match_id')
                .eq('guild_id', guildId)
                .eq('club_key', club.key)
              
              const existingCompIds = new Set((existingCompMatches || []).map((m: any) => m.ea_match_id))
              
              for (const matchData of competitionMatches) {
                const matchId = matchData.matchId?.toString()
                if (!matchId || existingCompIds.has(matchId)) {
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
                  // Calculate total saves from all save types
                  const savesDiving = parseInt(pStats.ballDiveSaves || pStats.ballDivesaves || 0)
                  const savesCross = parseInt(pStats.crossSaves || pStats.crosssaves || 0)
                  const savesParry = parseInt(pStats.parrySaves || pStats.parrysaves || 0)
                  const savesPunch = parseInt(pStats.punchSaves || pStats.punchsaves || 0)
                  const savesReflex = parseInt(pStats.reflexSaves || pStats.reflexsaves || 0)
                  const totalSaves = savesDiving + savesCross + savesParry + savesPunch + savesReflex
                  
                  // Clean sheet detection from EA data
                  const isCleanSheet = pStats.cleansheetsany === '1' || pStats.cleansheetsdef === '1' || pStats.cleansheetsgk === '1'
                  
                  // New fields: second assists and dribble attempts
                  const secondAssists = parseInt(pStats.secondAssists || pStats.secondassists || pStats.secondAssist || pStats.secondassist || 0)
                  const dribbles = parseInt(pStats.dribblesCompleted || pStats.dribblewon || pStats.dribbleswon || pStats.dribbles || 0)
                  const dribbleAttempts = parseInt(pStats.dribblesAttempted || pStats.dribbleattempts || pStats.dribbleAttempts || 0)
                  
                  playerStats.push({
                    ea_username: pStats.playername,
                    goals: parseInt(pStats.goals || 0),
                    assists: parseInt(pStats.assists || 0),
                    second_assists: secondAssists,
                    rating: parseFloat(pStats.rating || 0),
                    position: pStats.pos,
                    motm: pStats.mom === '1',
                    shots: parseInt(pStats.shots || 0),
                    tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
                    tackle_attempts: parseInt(pStats.tackleattempts || pStats.tackleAttempts || 0),
                    passes_made: parseInt(pStats.passesmade || pStats.passesMade || 0),
                    pass_attempts: parseInt(pStats.passattempts || pStats.passAttempts || 0),
                    red_cards: pStats.redcards === '1',
                    // GK save breakdowns
                    saves: totalSaves || parseInt(pStats.saves || pStats.gksaves || 0),
                    saves_diving: savesDiving,
                    saves_cross: savesCross,
                    saves_parry: savesParry,
                    saves_punch: savesPunch,
                    saves_reflex: savesReflex,
                    goals_conceded: parseInt(pStats.goalsconceded || pStats.goalsConceded || 0),
                    clean_sheet: isCleanSheet,
                    interceptions: parseInt(pStats.interceptions || 0),
                    clearances: parseInt(pStats.clearances || 0),
                    possession: parseFloat(pStats.possession || 0),
                    dribbles: dribbles,
                    dribble_attempts: dribbleAttempts,
                    fouls: parseInt(pStats.fouls || pStats.foulcommited || 0),
                    offsides: parseInt(pStats.offsides || 0),
                    archetypeid: pStats.archetypeid || pStats.archetypeId || null
                  })
                }
                
                // Find or create session for this match
                const matchTimestamp = parseInt(matchData.timestamp || matchData.matchTime || Date.now() / 1000);
                const sessionId = await findOrCreateSession(supabase, guildId, club.key, matchTimestamp);

                const { error: insertError } = await supabase.from('club_matches').insert({
                  guild_id: guildId,
                  club_key: club.key,
                  ea_match_id: matchId,
                  match_type: 'competition', // Competition/cup games
                  result,
                  score_for: scoreFor,
                  score_against: scoreAgainst,
                  opponent_club_name: opponentClubData?.name || 'Unknown',
                  opponent_club_id: opponentClubId,
                  match_data: matchData,
                  player_stats: playerStats,
                  session_id: sessionId
                })
                
                if (!insertError) {
                  totalSynced++
                  existingCompIds.add(matchId)
                  
                  // Update session stats
                  if (sessionId) {
                    const playerUsernames = playerStats.map(p => p.ea_username).filter(Boolean);
                    await updateSessionStats(supabase, sessionId, {
                      result,
                      scoreFor,
                      scoreAgainst,
                      playerStats,
                      playerUsernames
                    });
                  }
                  
                  // Record player stats for competition matches
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
                        match_type: 'competition', // Competition/cup match type
                        goals: pStat.goals,
                        assists: pStat.assists,
                        second_assists: pStat.second_assists,
                        clean_sheet: pStat.clean_sheet || (pStat.position === 'GK' && scoreAgainst === 0),
                        won: result === 'win',
                        ea_match_rating: pStat.rating,
                        position_played: pStat.position,
                        man_of_match: pStat.motm,
                        shots: pStat.shots,
                        tackles: pStat.tackles,
                        tackle_attempts: pStat.tackle_attempts,
                        passes_made: pStat.passes_made,
                        pass_attempts: pStat.pass_attempts,
                        red_cards: pStat.red_cards,
                        // GK save breakdowns
                        saves_diving: pStat.saves_diving,
                        saves_cross: pStat.saves_cross,
                        saves_parry: pStat.saves_parry,
                        saves_punch: pStat.saves_punch,
                        saves_reflex: pStat.saves_reflex,
                        goals_conceded: pStat.goals_conceded,
                        interceptions: pStat.interceptions,
                        clearances: pStat.clearances,
                        dribbles: pStat.dribbles,
                        dribble_attempts: pStat.dribble_attempts,
                        fouls: pStat.fouls,
                        offsides: pStat.offsides,
                        archetypeid: pStat.archetypeid
                      })

                      guildUpdatedPlayerIds.add(profile.discord_user_id)
                      await updatePlayerPositionPreferences(supabase, guildId, profile.discord_user_id)
                    }
                  }
                }
              }
            }
            
            // Process friendly matches (matchType22)
            const friendlyMatches = allRecentMatches.filter(m => 
              m.matchType?.includes?.('22') || m.matchType === 'matchType22'
            );
            if (friendlyMatches && friendlyMatches.length > 0) {
              console.log(`[sync-ea-stats] Processing ${friendlyMatches.length} friendly matches for ${club.name}`)
              
              const { data: existingFriendlyMatches } = await supabase
                .from('club_matches')
                .select('ea_match_id')
                .eq('guild_id', guildId)
                .eq('club_key', club.key)
              
              const existingFriendlyIds = new Set((existingFriendlyMatches || []).map((m: any) => m.ea_match_id))
              
              for (const matchData of friendlyMatches) {
                const matchId = matchData.matchId?.toString()
                if (!matchId || existingFriendlyIds.has(matchId)) {
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
                  // Calculate total saves from all save types
                  const savesDiving = parseInt(pStats.ballDiveSaves || pStats.ballDivesaves || 0)
                  const savesCross = parseInt(pStats.crossSaves || pStats.crosssaves || 0)
                  const savesParry = parseInt(pStats.parrySaves || pStats.parrysaves || 0)
                  const savesPunch = parseInt(pStats.punchSaves || pStats.punchsaves || 0)
                  const savesReflex = parseInt(pStats.reflexSaves || pStats.reflexsaves || 0)
                  const totalSaves = savesDiving + savesCross + savesParry + savesPunch + savesReflex
                  
                  // Clean sheet detection from EA data
                  const isCleanSheet = pStats.cleansheetsany === '1' || pStats.cleansheetsdef === '1' || pStats.cleansheetsgk === '1'
                  
                  // New fields: second assists and dribble attempts
                  const secondAssists = parseInt(pStats.secondAssists || pStats.secondassists || pStats.secondAssist || pStats.secondassist || 0)
                  const dribbles = parseInt(pStats.dribblesCompleted || pStats.dribblewon || pStats.dribbleswon || pStats.dribbles || 0)
                  const dribbleAttempts = parseInt(pStats.dribblesAttempted || pStats.dribbleattempts || pStats.dribbleAttempts || 0)
                  
                  playerStats.push({
                    ea_username: pStats.playername,
                    goals: parseInt(pStats.goals || 0),
                    assists: parseInt(pStats.assists || 0),
                    second_assists: secondAssists,
                    rating: parseFloat(pStats.rating || 0),
                    position: pStats.pos,
                    motm: pStats.mom === '1',
                    shots: parseInt(pStats.shots || 0),
                    tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
                    tackle_attempts: parseInt(pStats.tackleattempts || pStats.tackleAttempts || 0),
                    passes_made: parseInt(pStats.passesmade || pStats.passesMade || 0),
                    pass_attempts: parseInt(pStats.passattempts || pStats.passAttempts || 0),
                    red_cards: pStats.redcards === '1',
                    saves: totalSaves || parseInt(pStats.saves || pStats.gksaves || 0),
                    saves_diving: savesDiving,
                    saves_cross: savesCross,
                    saves_parry: savesParry,
                    saves_punch: savesPunch,
                    saves_reflex: savesReflex,
                    goals_conceded: parseInt(pStats.goalsconceded || pStats.goalsConceded || 0),
                    clean_sheet: isCleanSheet,
                    interceptions: parseInt(pStats.interceptions || 0),
                    clearances: parseInt(pStats.clearances || 0),
                    possession: parseFloat(pStats.possession || 0),
                    dribbles: dribbles,
                    dribble_attempts: dribbleAttempts,
                    fouls: parseInt(pStats.fouls || pStats.foulcommited || 0),
                    offsides: parseInt(pStats.offsides || 0),
                    archetypeid: pStats.archetypeid || pStats.archetypeId || null
                  })
                }
                
                const { error: insertError } = await supabase.from('club_matches').insert({
                  guild_id: guildId,
                  club_key: club.key,
                  ea_match_id: matchId,
                  match_type: 'friendly',
                  result,
                  score_for: scoreFor,
                  score_against: scoreAgainst,
                  opponent_club_name: opponentClubData?.details?.name || opponentClubData?.name || 'Unknown',
                  opponent_club_id: opponentClubId,
                  match_data: matchData,
                  player_stats: playerStats
                })
                
                if (!insertError) {
                  totalSynced++
                  existingFriendlyIds.add(matchId)
                  
                  // Record player stats for friendly matches
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
                        match_type: 'friendly',
                        goals: pStat.goals,
                        assists: pStat.assists,
                        second_assists: pStat.second_assists,
                        clean_sheet: pStat.clean_sheet || (pStat.position === 'GK' && scoreAgainst === 0),
                        won: result === 'win',
                        ea_match_rating: pStat.rating,
                        position_played: pStat.position,
                        man_of_match: pStat.motm,
                        shots: pStat.shots,
                        tackles: pStat.tackles,
                        tackle_attempts: pStat.tackle_attempts,
                        passes_made: pStat.passes_made,
                        pass_attempts: pStat.pass_attempts,
                        red_cards: pStat.red_cards,
                        saves_diving: pStat.saves_diving,
                        saves_cross: pStat.saves_cross,
                        saves_parry: pStat.saves_parry,
                        saves_punch: pStat.saves_punch,
                        saves_reflex: pStat.saves_reflex,
                        goals_conceded: pStat.goals_conceded,
                        interceptions: pStat.interceptions,
                        clearances: pStat.clearances,
                        dribbles: pStat.dribbles,
                        dribble_attempts: pStat.dribble_attempts,
                        fouls: pStat.fouls,
                        offsides: pStat.offsides,
                        archetypeid: pStat.archetypeid
                      })

                      guildUpdatedPlayerIds.add(profile.discord_user_id)
                      await updatePlayerPositionPreferences(supabase, guildId, profile.discord_user_id)
                    }
                  }
                }
              }
            }
          }
          
          // Sync tracked game stats back to player_club_stats for this club
          await syncTrackedGameStatsToClubStats(supabase, guildId, club.key)
          
          guildsProcessed++
        } catch (clubErr) {
          console.error(`[sync-ea-stats] Error syncing club ${club.name}:`, clubErr)
        }
      }

      if (aggregates.size > 0) {
        const persisted = await persistAggregatedStats(supabase, guildId, aggregates)
        memberStatsSynced += persisted
      }

      // Rebuild form rating and streaks from the last 5-10 club games for updated players
      const formUpdateIds = Array.from(guildUpdatedPlayerIds)
      for (const playerId of formUpdateIds) {
        await updatePlayerFormFromRecentMatches(supabase, guildId, playerId)
      }

      // Enrich player_summary with save breakdowns from tracked games
      // (EA member board only provides total saves, not breakdowns)
      if (guildUpdatedPlayerIds.size > 0) {
        await enrichPlayerSummaryWithTrackedStats(supabase, guildId, Array.from(guildUpdatedPlayerIds))
      }

      // Recalculate ratings for players touched within this guild using the aggregated totals
      const recalculationIds = Array.from(guildUpdatedPlayerIds)
      if (recalculationIds.length > 0) {
        console.log(`[sync-ea-stats] Triggering rating recalculation for guild ${guildId} (${recalculationIds.length} players)`)
        await supabase.functions.invoke('calculate-ratings', {
          body: { guild_id: guildId, player_ids: recalculationIds, trigger: 'ea_sync' }
        })
      }
    }

    if (unmappedMemberKeys.size > 0) {
      console.log(`[sync-ea-stats] Unmapped member fields seen across clubs: ${[...unmappedMemberKeys].join(', ')}`)
    }

    console.log(`[sync-ea-stats] Completed: ${totalSynced} matches, ${memberStatsSynced} members, ${clubStatsSynced} clubs`)

    return new Response(JSON.stringify({
      success: true,
      synced: totalSynced,
      skipped: totalSkipped,
      club_stats_synced: clubStatsSynced,
      member_stats_synced: memberStatsSynced,
      guilds_processed: guildsProcessed,
      hidden_probe_results: hiddenProbeResults.length > 0 ? hiddenProbeResults : undefined,
      last_game_fields: lastGameSnapshots.length > 0 ? lastGameSnapshots : undefined,
      unknown_member_fields: unmappedMemberKeys.size > 0 ? [...unmappedMemberKeys] : undefined
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
});
