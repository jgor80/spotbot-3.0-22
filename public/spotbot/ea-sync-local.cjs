/**
 * Local EA Sync Script
 * Run this locally to bypass EA's cloud IP blocking
 * Your Railway bot handles Discord, this just syncs EA data to Supabase
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const stringSimilarity = require('string-similarity');

// Fuzzy match EA usernames to Discord members
async function fuzzyMatchEaToDiscord(supabase, guildId, eaUsername) {
  // Get all real Discord members in the guild (not temp ea_ profiles)
  const { data: guildMembers } = await supabase
    .from('profiles')
    .select('discord_user_id, discord_username')
    .not('discord_user_id', 'like', 'ea_%')
    .not('ea_username', 'is', null);
  
  // Also get guild members without EA links
  const { data: unlinkedMembers } = await supabase
    .from('profiles')
    .select('discord_user_id, discord_username')
    .not('discord_user_id', 'like', 'ea_%')
    .is('ea_username', null);
  
  const allMembers = [...(guildMembers || []), ...(unlinkedMembers || [])];
  
  if (!allMembers.length) return null;
  
  // Find best match
  const usernames = allMembers.map(m => m.discord_username || '').filter(Boolean);
  if (!usernames.length) return null;
  
  const match = stringSimilarity.findBestMatch(eaUsername.toLowerCase(), usernames.map(u => u.toLowerCase()));
  
  // Only accept matches with > 70% similarity
  if (match.bestMatch.rating >= 0.7) {
    const matchedMember = allMembers.find(
      m => m.discord_username?.toLowerCase() === match.bestMatch.target
    );
    if (matchedMember) {
      console.log(`  🔍 Fuzzy match: ${eaUsername} -> ${matchedMember.discord_username} (${(match.bestMatch.rating * 100).toFixed(0)}%)`);
      return matchedMember;
    }
  }
  
  return null;
}

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  console.log('Create a .env file with:');
  console.log('SUPABASE_URL=https://vynlrqlisrvuejwawaxh.supabase.co');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// EA API Configuration
const EA_PLATFORM_MAP = {
  'ps5': 'common-gen5',
  'xbox-series-xs': 'common-gen5',
  'pc': 'common-gen5',
  'ps4': 'common-gen4',
  'xboxone': 'common-gen4'
};

const EA_HEADERS = {
  'accept': 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'origin': 'https://www.ea.com',
  'referer': 'https://www.ea.com/',
  'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

// Fetch match history - tries multiple matchType formats
async function fetchMatches(clubId, platform) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  // EA API sometimes changes matchType format - try multiple options
  const matchTypes = ['leagueMatch', 'gameType9', 'matchType9', 'league'];
  
  for (const matchType of matchTypes) {
    try {
      console.log(`[EA] Trying matchType: ${matchType}`);
      const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
        params: { platform: fcPlatform, clubIds: clubId, matchType, maxResultCount: 50 },
        headers: EA_HEADERS,
        timeout: 10000
      });
      
      if (res.status !== 200) continue;
      
      let matches = res.data;
      if (Array.isArray(matches) && matches.length > 0) {
        console.log(`[EA] Success with matchType: ${matchType}`);
        return matches;
      }
      if (matches?.matches && matches.matches.length > 0) {
        console.log(`[EA] Success with matchType: ${matchType}`);
        return matches.matches;
      }
      
      const vals = Object.values(matches).filter(v => v && typeof v === 'object');
      if (vals.length > 0) {
        console.log(`[EA] Success with matchType: ${matchType}`);
        return vals;
      }
    } catch (err) {
      console.log(`[EA] matchType ${matchType} failed: ${err.message}`);
    }
  }
  
  // Also try without matchType param
  try {
    console.log(`[EA] Trying without matchType param`);
    const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
      params: { platform: fcPlatform, clubIds: clubId, maxResultCount: 50 },
      headers: EA_HEADERS,
      timeout: 10000
    });
    
    if (res.status === 200) {
      let matches = res.data;
      if (Array.isArray(matches)) return matches;
      if (matches?.matches) return matches.matches;
      return Object.values(matches).filter(v => v && typeof v === 'object');
    }
  } catch (err) {
    console.log(`[EA] No matchType failed: ${err.message}`);
  }
  
  return [];
}

// Fetch club info
async function fetchClubInfo(clubId, platform) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  try {
    const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/info', {
      params: { platform: fcPlatform, clubIds: clubId },
      headers: EA_HEADERS,
      timeout: 10000
    });
    
    if (res.status !== 200) return null;
    
    const data = res.data;
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data[clubId]) return data[clubId];
    return data;
  } catch (err) {
    console.error(`[EA] Club info error:`, err.message);
    return null;
  }
}

// Fetch club members
async function fetchClubMembers(clubId, platform) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  try {
    const res = await axios.get('https://proclubs.ea.com/api/fc/members/stats', {
      params: { platform: fcPlatform, clubId },
      headers: EA_HEADERS,
      timeout: 10000
    });
    
    if (res.status !== 200) return [];
    
    const data = res.data;
    if (data?.members) return data.members;
    if (Array.isArray(data)) return data;
    return Object.values(data).filter(v => v && typeof v === 'object');
  } catch (err) {
    console.error(`[EA] Club members error:`, err.message);
    return [];
  }
}

// Sync club stats to database
async function syncClubStats(guildId, clubKey, clubId, platform) {
  const clubInfo = await fetchClubInfo(clubId, platform);
  if (!clubInfo) return null;
  
  const clubData = {
    guild_id: guildId,
    club_key: clubKey,
    ea_club_id: clubId,
    ea_platform: platform,
    skill_rating: parseInt(clubInfo.skillRating || 0),
    wins: parseInt(clubInfo.wins || 0),
    draws: parseInt(clubInfo.draws || clubInfo.ties || 0),
    losses: parseInt(clubInfo.losses || 0),
    goals_scored: parseInt(clubInfo.goals || clubInfo.goalsScored || 0),
    goals_conceded: parseInt(clubInfo.goalsAgainst || 0),
    total_members: parseInt(clubInfo.memberCount || 0),
    club_name: clubInfo.name || null,
    best_division: clubInfo.bestDivision || null,
    last_synced_at: new Date().toISOString()
  };
  
  const { error } = await supabase
    .from('club_stats')
    .upsert(clubData, { onConflict: 'guild_id,club_key' });
  
  if (error) {
    console.error(`[DB] Club stats upsert error:`, error.message);
    return null;
  }
  
  console.log(`✅ Synced club stats: ${clubData.club_name || clubKey} (SR: ${clubData.skill_rating})`);
  return clubData;
}

// Sync member stats to player_stats table AND update player_ratings/player_summary
async function syncMemberStats(guildId, clubId, platform, clubName) {
  const members = await fetchClubMembers(clubId, platform);
  
  if (!members.length) {
    console.log(`⚠️ No members found for ${clubName}`);
    return { synced: 0, updatedPlayerIds: [] };
  }
  
  let synced = 0;
  const updatedPlayerIds = [];
  
  for (const member of members) {
    const eaUsername = member.name || member.playerName;
    if (!eaUsername) continue;
    
    // Find or create profile for EA username
    let { data: profile } = await supabase
      .from('profiles')
      .select('discord_user_id')
      .eq('ea_username', eaUsername)
      .maybeSingle();
    
    if (!profile) {
      // Try fuzzy matching to Discord members first
      const fuzzyMatch = await fuzzyMatchEaToDiscord(supabase, guildId, eaUsername);
      
      if (fuzzyMatch) {
        // Auto-link to matched Discord user
        const { error: linkError } = await supabase
          .from('profiles')
          .update({ ea_username: eaUsername, ea_platform: platform })
          .eq('discord_user_id', fuzzyMatch.discord_user_id);
        
        if (!linkError) {
          profile = { discord_user_id: fuzzyMatch.discord_user_id };
          console.log(`  ✅ Auto-linked ${eaUsername} to Discord user ${fuzzyMatch.discord_username}`);
        }
      }
      
      // Fall back to temp profile if no fuzzy match
      if (!profile) {
        const tempDiscordId = `ea_${eaUsername.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        const { data: existingTemp } = await supabase
          .from('profiles')
          .select('discord_user_id')
          .eq('discord_user_id', tempDiscordId)
          .maybeSingle();
        
        if (existingTemp) {
          await supabase
            .from('profiles')
            .update({ ea_username: eaUsername, ea_platform: platform })
            .eq('discord_user_id', tempDiscordId);
          profile = existingTemp;
          console.log(`  🔗 Linked existing temp profile for ${eaUsername}`);
        } else {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              discord_user_id: tempDiscordId,
              ea_username: eaUsername,
              ea_platform: platform
            })
            .select('discord_user_id')
            .single();
          
          if (insertError) {
            console.log(`  ❌ Failed to create profile for ${eaUsername}: ${insertError.message}`);
            continue;
          }
          
          console.log(`  ✨ Created temp profile for ${eaUsername}`);
          profile = newProfile;
        }
      }
    }
    
    // Extract favorite position from EA data
    const favoritePosition = member.favoritePosition || member.proPos || null;
    
    // Auto-update position preferences from EA data
    if (favoritePosition && profile.discord_user_id) {
      // Map EA position codes to our position format
      const positionMap = {
        'goalkeeper': 'GK', 'gk': 'GK',
        'defender': 'CB', 'cb': 'CB', 'rb': 'RB', 'lb': 'LB', 'rwb': 'RWB', 'lwb': 'LWB',
        'midfielder': 'CM', 'cm': 'CM', 'cdm': 'CDM', 'cam': 'CAM', 'rm': 'RM', 'lm': 'LM',
        'attacker': 'ST', 'st': 'ST', 'cf': 'CF', 'rw': 'RW', 'lw': 'LW', 'rf': 'RF', 'lf': 'LF'
      };
      
      const normalizedPosition = positionMap[favoritePosition.toLowerCase()] || favoritePosition.toUpperCase();
      
      // Upsert position preference
      const { error: prefError } = await supabase
        .from('position_preferences')
        .upsert({
          guild_id: guildId,
          user_id: profile.discord_user_id,
          preferences: [normalizedPosition],
          updated_at: new Date().toISOString()
        }, { onConflict: 'guild_id,user_id' });
      
      if (prefError) {
        console.log(`  ⚠️ Position pref error for ${eaUsername}: ${prefError.message}`);
      }
    }
    
    // Extract ALL aggregate stats from EA member data (matching EA website fields)
    const goals = parseInt(member.goals || 0);
    const assists = parseInt(member.assists || 0);
    const gamesPlayed = parseInt(member.gamesPlayed || member.matches || member.memberGamesPlayed || 0);
    const wins = parseInt(member.wins || 0);
    const losses = parseInt(member.losses || 0);
    const draws = gamesPlayed - wins - losses;
    const avgRating = parseFloat(member.ratingAve || member.avgRating || member.proOverall || 0);
    const cleanSheets = parseInt(member.cleanSheetsDef || member.cleanSheetsGK || member.cleanSheets || 0);
    const manOfMatch = parseInt(member.manOfTheMatch || member.mom || 0);
    const position = favoritePosition;
    const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
    
    // Extended stats from EA API (all fields visible on EA club member page)
    const shots = parseInt(member.shots || 0);
    const tackles = parseInt(member.tacklesmade || member.tacklesMade || member.tackles || 0);
    const tackleAttempts = parseInt(member.tackleattempts || member.tackleAttempts || 0);
    const tackleSuccessRate = tackleAttempts > 0 ? (tackles / tackleAttempts) * 100 : 0;
    const passesMade = parseInt(member.passesmade || member.passesMade || 0);
    const passAttempts = parseInt(member.passattempts || member.passAttempts || 0);
    const passSuccessRate = passAttempts > 0 ? (passesMade / passAttempts) * 100 : 0;
    const saves = parseInt(member.saves || member.gksaves || member.gkSaves || 0);
    const interceptions = parseInt(member.interceptions || 0);
    const clearances = parseInt(member.clearances || 0);
    
    console.log(`  📊 ${eaUsername}: ${gamesPlayed} games, ${goals}G/${assists}A, ${winRate.toFixed(1)}% win, ${passSuccessRate.toFixed(1)}% pass, ${tackleSuccessRate.toFixed(1)}% tackle`);
    
    // Skip temp profiles for rating updates (only real Discord users)
    const isRealUser = !profile.discord_user_id.startsWith('ea_');
    
    if (isRealUser) {
      // ===== ENSURE player_ratings record exists =====
      const { data: existingRating } = await supabase
        .from('player_ratings')
        .select('id, games_played')
        .eq('guild_id', guildId)
        .eq('discord_user_id', profile.discord_user_id)
        .maybeSingle();
      
      // Get discord username from profile
      const { data: fullProfile } = await supabase
        .from('profiles')
        .select('discord_username')
        .eq('discord_user_id', profile.discord_user_id)
        .maybeSingle();
      
      // Define positionMap
      const positionMap = {
        'goalkeeper': 'GK', 'gk': 'GK',
        'defender': 'CB', 'cb': 'CB', 'rb': 'RB', 'lb': 'LB', 'rwb': 'RWB', 'lwb': 'LWB',
        'midfielder': 'CM', 'cm': 'CM', 'cdm': 'CDM', 'cam': 'CAM', 'rm': 'RM', 'lm': 'LM',
        'attacker': 'ST', 'st': 'ST', 'cf': 'CF', 'rw': 'RW', 'lw': 'LW', 'rf': 'RF', 'lf': 'LF'
      };
      
      const mappedPosition = position ? (positionMap[position.toLowerCase()] || position.toUpperCase()) : null;
      
      if (!existingRating) {
        // Create initial rating record with EA aggregate stats as baseline
        await supabase
          .from('player_ratings')
          .insert({
            guild_id: guildId,
            discord_user_id: profile.discord_user_id,
            overall_rating: 50,
            games_played: gamesPlayed,
            wins: wins,
            losses: losses,
            draws: draws,
            total_goals: goals,
            total_assists: assists,
            total_clean_sheets: cleanSheets,
            total_motm: manOfMatch,
            avg_match_rating: avgRating,
            shots: shots,
            tackles: tackles,
            passes_made: passesMade,
            pass_attempts: passAttempts,
            saves: saves,
            interceptions: interceptions,
            clearances: clearances,
          });
        
        console.log(`  ✨ Created player_ratings for ${eaUsername} with EA baseline (${gamesPlayed} games)`);
      } else if (existingRating.games_played < gamesPlayed) {
        // Update with EA aggregate if it has more games (EA is authoritative for career totals)
        await supabase
          .from('player_ratings')
          .update({
            games_played: gamesPlayed,
            wins: wins,
            losses: losses,
            draws: draws,
            total_goals: goals,
            total_assists: assists,
            total_clean_sheets: cleanSheets,
            total_motm: manOfMatch,
            avg_match_rating: avgRating,
            shots: shots,
            tackles: tackles,
            passes_made: passesMade,
            pass_attempts: passAttempts,
            saves: saves,
            interceptions: interceptions,
            clearances: clearances,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRating.id);
        
        console.log(`  📈 Updated player_ratings for ${eaUsername} from EA (${existingRating.games_played} → ${gamesPlayed} games)`);
      }
      
      // ===== ENSURE player_summary record exists =====
      const { data: existingSummary } = await supabase
        .from('player_summary')
        .select('id, games_played')
        .eq('guild_id', guildId)
        .eq('discord_user_id', profile.discord_user_id)
        .maybeSingle();
      
      if (!existingSummary) {
        // Create initial summary record with EA aggregate stats as baseline
        await supabase
          .from('player_summary')
          .insert({
            guild_id: guildId,
            discord_user_id: profile.discord_user_id,
            discord_username: fullProfile?.discord_username || eaUsername,
            overall_rating: 50,
            primary_position: mappedPosition,
            games_played: gamesPlayed,
            wins: wins,
            losses: losses,
            draws: draws,
            win_rate: winRate,
            goals: goals,
            assists: assists,
            clean_sheets: cleanSheets,
            man_of_match: manOfMatch,
            avg_match_rating: avgRating,
            shots: shots,
            tackles: tackles,
            passes_made: passesMade,
            pass_attempts: passAttempts,
            saves: saves,
          });
        
        console.log(`  ✨ Created player_summary for ${eaUsername} with EA baseline (${gamesPlayed} games, ${goals}G/${assists}A)`);
      } else if (existingSummary.games_played < gamesPlayed) {
        // Update with EA aggregate if it has more games (EA is authoritative for career totals)
        await supabase
          .from('player_summary')
          .update({
            discord_username: fullProfile?.discord_username || eaUsername,
            primary_position: mappedPosition,
            games_played: gamesPlayed,
            wins: wins,
            losses: losses,
            draws: draws,
            win_rate: winRate,
            goals: goals,
            assists: assists,
            clean_sheets: cleanSheets,
            man_of_match: manOfMatch,
            avg_match_rating: avgRating,
            shots: shots,
            tackles: tackles,
            passes_made: passesMade,
            pass_attempts: passAttempts,
            saves: saves,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSummary.id);
        
        console.log(`  📈 Updated player_summary for ${eaUsername} from EA (${existingSummary.games_played} → ${gamesPlayed} games)`);
      } else {
        // Only update position and username if EA games <= tracked games
        await supabase
          .from('player_summary')
          .update({
            discord_username: fullProfile?.discord_username || eaUsername,
            primary_position: mappedPosition,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSummary.id);
      }
      
      // Track for rating recalculation
      updatedPlayerIds.push(profile.discord_user_id);
      synced++;
    }
    
    // Also update the ea_aggregate record in player_stats for historical tracking
    const { data: existingStats } = await supabase
      .from('player_stats')
      .select('id')
      .eq('guild_id', guildId)
      .eq('discord_user_id', profile.discord_user_id)
      .eq('match_type', 'ea_aggregate')
      .maybeSingle();
    
    if (existingStats) {
      await supabase
        .from('player_stats')
        .update({
          goals,
          assists,
          ea_match_rating: avgRating,
          position_played: position,
          recorded_at: new Date().toISOString()
        })
        .eq('id', existingStats.id);
    } else {
      await supabase
        .from('player_stats')
        .insert({
          guild_id: guildId,
          discord_user_id: profile.discord_user_id,
          match_type: 'ea_aggregate',
          goals,
          assists,
          ea_match_rating: avgRating,
          position_played: position,
          won: null,
          clean_sheet: cleanSheets > 0,
          man_of_match: manOfMatch > 0
        });
    }
  }
  
  return { synced, updatedPlayerIds };
}

// Process and sync matches (last 50 with deduplication)
async function syncMatches(guildId, clubKey, club) {
  const matches = await fetchMatches(club.ea_club_id, club.ea_platform);
  
  if (!matches.length) {
    console.log(`⚠️ No matches found for ${club.name}`);
    return { synced: 0, skipped: 0, playerStats: 0, updatedPlayerIds: [] };
  }
  
  // Process last 50 matches for comprehensive history
  const last50Matches = matches.slice(0, 50);
  console.log(`📊 Processing last ${last50Matches.length} matches for ${club.name}`);
  
  // Get existing match IDs from club_matches
  const { data: existingMatches } = await supabase
    .from('club_matches')
    .select('ea_match_id')
    .eq('guild_id', guildId)
    .eq('club_key', clubKey);
  
  const existingMatchIds = new Set((existingMatches || []).map(m => m.ea_match_id));
  
  // Get existing player stats by ea_match_id for deduplication
  const matchIds = last50Matches.map(m => m.matchId?.toString()).filter(Boolean);
  const { data: existingPlayerStats } = await supabase
    .from('player_stats')
    .select('ea_match_id, discord_user_id')
    .eq('guild_id', guildId)
    .in('ea_match_id', matchIds);
  
  const existingPlayerStatsSet = new Set(
    (existingPlayerStats || []).map(s => `${s.ea_match_id}:${s.discord_user_id}`)
  );
  
  let synced = 0, skipped = 0, playerStatsCount = 0;
  const updatedPlayerIds = []; // Track players who got new stats
  
  for (const matchData of last50Matches) {
    const matchId = matchData.matchId?.toString();
    if (!matchId) {
      skipped++;
      continue;
    }
    
    // Process match data
    const ourClubData = matchData.clubs?.[club.ea_club_id];
    const opponentClubId = Object.keys(matchData.clubs || {}).find(id => id !== club.ea_club_id);
    const opponentClubData = opponentClubId ? matchData.clubs[opponentClubId] : null;
    
    const scoreFor = parseInt(ourClubData?.goals || 0);
    const scoreAgainst = parseInt(opponentClubData?.goals || 0);
    
    let result = 'draw';
    if (scoreFor > scoreAgainst) result = 'win';
    else if (scoreFor < scoreAgainst) result = 'loss';
    
    // Extract extended player stats from EA data
    const playerStats = [];
    const players = matchData.players?.[club.ea_club_id] || {};
    
    for (const [playerId, pStats] of Object.entries(players)) {
      // Extract ALL available stats from EA API
      playerStats.push({
        ea_username: pStats.playername || pStats.name,
        goals: parseInt(pStats.goals || 0),
        assists: parseInt(pStats.assists || 0),
        rating: parseFloat(pStats.rating || 0),
        position: pStats.pos || pStats.position,
        motm: pStats.mom === '1' || pStats.mom === 1,
        shots: parseInt(pStats.shots || 0),
        tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
        passes_made: parseInt(pStats.passesmade || pStats.passesMade || 0),
        pass_attempts: parseInt(pStats.passattempts || pStats.passAttempts || 0),
        red_cards: pStats.redcards === '1' || pStats.redcards === 1,
        // Extended stats
        saves: parseInt(pStats.saves || pStats.gksaves || 0),
        interceptions: parseInt(pStats.interceptions || 0),
        clearances: parseInt(pStats.clearances || 0),
        possession: parseFloat(pStats.possession || 0),
        dribbles: parseInt(pStats.dribblewon || pStats.dribbles || 0),
        fouls: parseInt(pStats.fouls || pStats.foulcommited || 0),
        offsides: parseInt(pStats.offsides || 0)
      });
    }
    
    // Insert/update match in club_matches (skip if exists)
    const isNewMatch = !existingMatchIds.has(matchId);
    let clubMatchId = null;
    
    if (isNewMatch) {
      const { data: insertedMatch, error: matchError } = await supabase
        .from('club_matches')
        .insert({
          guild_id: guildId,
          club_key: clubKey,
          ea_match_id: matchId,
          match_type: 'division',
          result,
          score_for: scoreFor,
          score_against: scoreAgainst,
          opponent_club_name: opponentClubData?.name || 'Unknown',
          opponent_club_id: opponentClubId,
          match_data: matchData,
          player_stats: playerStats
        })
        .select('id')
        .single();
      
      if (matchError) {
        console.error(`[DB] Match insert error:`, matchError.message);
      } else {
        clubMatchId = insertedMatch.id;
        synced++;
        console.log(`✅ New match ${matchId}: ${result} ${scoreFor}-${scoreAgainst}`);
      }
    } else {
      skipped++;
    }
    
    // Record individual player stats with deduplication
    const matchPlayerIds = []; // Track players in THIS match for feedback
    
    for (const pStat of playerStats) {
      // Find profile for this EA username
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('ea_username', pStat.ea_username)
        .maybeSingle();
      
      if (!profile) continue;
      
      // Skip temp profiles (ea_*) - only real Discord users
      if (profile.discord_user_id.startsWith('ea_')) continue;
      
      // Check if we already have this player's stats for this match
      const statsKey = `${matchId}:${profile.discord_user_id}`;
      if (existingPlayerStatsSet.has(statsKey)) continue;
      
      // Insert player stats with ea_match_id for future deduplication
      const { error: statsError } = await supabase.from('player_stats').insert({
        guild_id: guildId,
        discord_user_id: profile.discord_user_id,
        ea_match_id: matchId,
        match_type: 'club',
        goals: pStat.goals,
        assists: pStat.assists,
        clean_sheet: (pStat.position === 'GK' || pStat.position === 'goalkeeper') && scoreAgainst === 0,
        won: result === 'win',
        ea_match_rating: pStat.rating,
        position_played: pStat.position,
        man_of_match: pStat.motm,
        shots: pStat.shots,
        tackles: pStat.tackles,
        passes_made: pStat.passes_made,
        pass_attempts: pStat.pass_attempts,
        red_cards: pStat.red_cards
      });
      
      if (!statsError) {
        playerStatsCount++;
        existingPlayerStatsSet.add(statsKey); // Mark as processed
        matchPlayerIds.push(profile.discord_user_id);
        // Track player for rating recalculation
        if (!updatedPlayerIds.includes(profile.discord_user_id)) {
          updatedPlayerIds.push(profile.discord_user_id);
        }
        
        // Update position ratings tally
        if (pStat.position) {
          await updatePositionRating(guildId, profile.discord_user_id, pStat.position, {
            goals: pStat.goals,
            assists: pStat.assists,
            rating: pStat.rating,
            won: result === 'win'
          });
        }
      }
    }
    
    // Create feedback requests for new matches with multiple players
    if (isNewMatch && clubMatchId && matchPlayerIds.length >= 2) {
      console.log(`📨 Creating feedback requests for ${matchPlayerIds.length} players...`);
      
      for (const evaluatorId of matchPlayerIds) {
        // Teammates are everyone except the evaluator
        const teammates = matchPlayerIds.filter(id => id !== evaluatorId);
        
        const { error: feedbackError } = await supabase
          .from('dm_feedback_requests')
          .insert({
            guild_id: guildId,
            evaluator_discord_id: evaluatorId,
            club_match_id: clubMatchId,
            match_type: 'club',
            teammates_to_evaluate: teammates,
            status: 'pending',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
          });
        
        if (feedbackError) {
          console.log(`  ⚠️ Feedback request error for ${evaluatorId}: ${feedbackError.message}`);
        }
      }
      
      console.log(`  ✅ Created ${matchPlayerIds.length} feedback requests`);
    }
  }
  
  if (playerStatsCount > 0) {
    console.log(`📈 Recorded ${playerStatsCount} player stats entries`);
  }
  
  return { synced, skipped, playerStats: playerStatsCount, updatedPlayerIds };
}

// Update position rating tally for a player
async function updatePositionRating(guildId, discordUserId, position, stats) {
  // Normalize position
  const positionMap = {
    'goalkeeper': 'GK', 'gk': 'GK',
    'defender': 'CB', 'cb': 'CB', 'rb': 'RB', 'lb': 'LB', 'rwb': 'RWB', 'lwb': 'LWB',
    'midfielder': 'CM', 'cm': 'CM', 'cdm': 'CDM', 'cam': 'CAM', 'rm': 'RM', 'lm': 'LM',
    'attacker': 'ST', 'st': 'ST', 'cf': 'CF', 'rw': 'RW', 'lw': 'LW', 'rf': 'RF', 'lf': 'LF'
  };
  
  const normalizedPosition = positionMap[position.toLowerCase()] || position.toUpperCase();
  
  // Get existing position rating
  const { data: existing } = await supabase
    .from('player_position_ratings')
    .select('*')
    .eq('guild_id', guildId)
    .eq('discord_user_id', discordUserId)
    .eq('position', normalizedPosition)
    .maybeSingle();
  
  if (existing) {
    // Update existing tally
    const newGames = existing.games_at_position + 1;
    const newGoals = existing.goals_at_position + (stats.goals || 0);
    const newAssists = existing.assists_at_position + (stats.assists || 0);
    
    // Calculate rolling average for match rating
    const currentAvg = existing.avg_match_rating || 0;
    const newAvg = currentAvg > 0 
      ? (currentAvg * existing.games_at_position + stats.rating) / newGames
      : stats.rating;
    
    // Recalculate position rating based on performance
    const winRate = stats.won ? 1 : 0;
    const currentRating = existing.rating || 50;
    const performanceBonus = (stats.goals * 3) + (stats.assists * 2) + (stats.rating / 10);
    const newRating = Math.min(100, Math.max(0, 
      currentRating + (performanceBonus * 0.1) + (winRate * 2 - 1)
    ));
    
    await supabase
      .from('player_position_ratings')
      .update({
        games_at_position: newGames,
        goals_at_position: newGoals,
        assists_at_position: newAssists,
        avg_match_rating: newAvg,
        rating: newRating,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
  } else {
    // Insert new position rating
    const initialRating = 50 + (stats.rating / 10) + (stats.goals * 2) + stats.assists;
    
    await supabase
      .from('player_position_ratings')
      .insert({
        guild_id: guildId,
        discord_user_id: discordUserId,
        position: normalizedPosition,
        games_at_position: 1,
        goals_at_position: stats.goals || 0,
        assists_at_position: stats.assists || 0,
        avg_match_rating: stats.rating || 0,
        rating: Math.min(100, Math.max(0, initialRating))
      });
  }
}

// Trigger rating recalculation for players with new stats
async function triggerRatingRecalculation(guildId, playerIds) {
  if (!playerIds.length) return;
  
  console.log(`📊 Triggering rating recalculation for ${playerIds.length} players...`);
  
  try {
    // Call the calculate-ratings edge function
    const response = await axios.post(
      `${supabaseUrl}/functions/v1/calculate-ratings`,
      { 
        guild_id: guildId, 
        player_ids: playerIds,
        trigger: 'ea_sync'
      },
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    if (response.status === 200) {
      console.log(`✅ Ratings recalculated for ${playerIds.length} players`);
    }
  } catch (err) {
    console.log(`⚠️ Rating recalculation skipped: ${err.message}`);
  }
}

// Main sync loop
async function runSync() {
  console.log('\n🔄 Starting EA sync...\n');
  
  // Get all guilds with EA-linked clubs
  const { data: guildSettings, error } = await supabase
    .from('guild_settings')
    .select('guild_id, clubs');
  
  if (error) {
    console.error('❌ Failed to fetch guild settings:', error.message);
    return;
  }
  
  let totalSynced = 0, totalSkipped = 0, clubsSynced = 0;
  const playersToRecalculate = new Map(); // guildId -> Set of playerIds
  
  for (const settings of guildSettings || []) {
    const clubs = settings.clubs || [];
    
    for (const club of clubs) {
      if (!club.ea_club_id || !club.ea_platform || !club.monitoring_enabled) continue;
      
      console.log(`\n📊 Syncing ${club.name} (${club.ea_club_id})...`);
      
      // Sync club stats
      await syncClubStats(settings.guild_id, club.key, club.ea_club_id, club.ea_platform);
      clubsSynced++;
      
      // Sync member stats (aggregate career stats) - updates player_ratings and player_summary
      console.log(`\n👥 Syncing member stats for ${club.name}...`);
      const { synced: membersSynced, updatedPlayerIds: memberPlayerIds } = await syncMemberStats(settings.guild_id, club.ea_club_id, club.ea_platform, club.name);
      
      // Track players from member stats sync for rating recalculation
      if (memberPlayerIds && memberPlayerIds.length > 0) {
        if (!playersToRecalculate.has(settings.guild_id)) {
          playersToRecalculate.set(settings.guild_id, new Set());
        }
        memberPlayerIds.forEach(id => playersToRecalculate.get(settings.guild_id).add(id));
      }
      
      // Sync matches
      const { synced, skipped, playerStats, updatedPlayerIds } = await syncMatches(settings.guild_id, club.key, club);
      totalSynced += synced;
      totalSkipped += skipped;
      
      // Track players who need rating recalculation
      if (updatedPlayerIds && updatedPlayerIds.length > 0) {
        if (!playersToRecalculate.has(settings.guild_id)) {
          playersToRecalculate.set(settings.guild_id, new Set());
        }
        updatedPlayerIds.forEach(id => playersToRecalculate.get(settings.guild_id).add(id));
      }
    }
  }
  
  // Trigger rating recalculation for all affected players
  for (const [guildId, playerIds] of playersToRecalculate) {
    await triggerRatingRecalculation(guildId, Array.from(playerIds));
  }
  
  console.log(`\n✅ Sync complete: ${totalSynced} matches synced, ${totalSkipped} skipped, ${clubsSynced} clubs updated\n`);
}

// Check if current time is within active hours (8 AM - 2 AM Central Time)
function isActiveHours() {
  // Get current time in Central Time
  const now = new Date();
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const hour = centralTime.getHours();
  
  // Active from 8 AM (8) to 2 AM (2) next day
  // So we're INACTIVE only between 2 AM and 8 AM (hours 2-7)
  return hour >= 8 || hour < 2;
}

// Run sync if within active hours
function scheduledSync() {
  if (isActiveHours()) {
    runSync();
  } else {
    const now = new Date();
    const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    console.log(`\n💤 Outside active hours (${centralTime.toLocaleTimeString()}). Syncing resumes at 8 AM CT.\n`);
  }
}

// Run immediately then every 10 minutes
console.log('🚀 EA Sync Local started');
console.log('📡 Running from your local IP to bypass EA cloud blocking');
console.log('⏱️  Syncing every 10 minutes (active 8 AM - 2 AM CT)\n');

scheduledSync();
setInterval(scheduledSync, 600000); // 10 minutes = 600,000ms
