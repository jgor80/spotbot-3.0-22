/**
 * Local EA Sync Script
 * Run this locally to bypass EA's cloud IP blocking
 * Your Railway bot handles Discord, this just syncs EA data to Supabase
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

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

// Sync member stats to player_stats table
async function syncMemberStats(guildId, clubId, platform, clubName) {
  const members = await fetchClubMembers(clubId, platform);
  
  if (!members.length) {
    console.log(`⚠️ No members found for ${clubName}`);
    return 0;
  }
  
  let synced = 0;
  
  for (const member of members) {
    const eaUsername = member.name || member.playerName;
    if (!eaUsername) continue;
    
    // Find linked Discord profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('discord_user_id')
      .eq('ea_username', eaUsername)
      .maybeSingle();
    
    if (!profile) {
      console.log(`  ⏭️ No linked profile for ${eaUsername}`);
      continue;
    }
    
    // Aggregate stats from EA member data
    const goals = parseInt(member.goals || 0);
    const assists = parseInt(member.assists || 0);
    const gamesPlayed = parseInt(member.gamesPlayed || member.matches || 0);
    const wins = parseInt(member.wins || 0);
    const avgRating = parseFloat(member.ratingAve || member.avgRating || 0);
    const cleanSheets = parseInt(member.cleanSheetsDef || member.cleanSheetsGK || 0);
    const manOfMatch = parseInt(member.manOfTheMatch || 0);
    const position = member.favoritePosition || member.proPos || null;
    
    // Check if we already have stats for this player
    const { data: existingStats, error: checkError } = await supabase
      .from('player_stats')
      .select('id, goals, assists')
      .eq('guild_id', guildId)
      .eq('discord_user_id', profile.discord_user_id)
      .eq('match_type', 'ea_aggregate')
      .maybeSingle();
    
    if (existingStats) {
      // Update existing aggregate
      const { error } = await supabase
        .from('player_stats')
        .update({
          goals,
          assists,
          ea_match_rating: avgRating,
          position_played: position,
          recorded_at: new Date().toISOString()
        })
        .eq('id', existingStats.id);
      
      if (!error) {
        console.log(`  🔄 Updated ${eaUsername}: ${goals}G ${assists}A (${avgRating.toFixed(1)} avg)`);
        synced++;
      }
    } else {
      // Insert new aggregate record
      const { error } = await supabase
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
      
      if (!error) {
        console.log(`  ✅ Added ${eaUsername}: ${goals}G ${assists}A (${avgRating.toFixed(1)} avg)`);
        synced++;
      }
    }
  }
  
  return synced;
}

// Process and sync matches
async function syncMatches(guildId, clubKey, club) {
  const matches = await fetchMatches(club.ea_club_id, club.ea_platform);
  
  if (!matches.length) {
    console.log(`⚠️ No matches found for ${club.name}`);
    return { synced: 0, skipped: 0 };
  }
  
  // Get existing match IDs
  const { data: existingMatches } = await supabase
    .from('club_matches')
    .select('ea_match_id')
    .eq('guild_id', guildId)
    .eq('club_key', clubKey);
  
  const existingIds = new Set((existingMatches || []).map(m => m.ea_match_id));
  
  let synced = 0, skipped = 0;
  
  for (const matchData of matches) {
    const matchId = matchData.matchId?.toString();
    if (!matchId || existingIds.has(matchId)) {
      skipped++;
      continue;
    }
    
    // Process match
    const ourClubData = matchData.clubs?.[club.ea_club_id];
    const opponentClubId = Object.keys(matchData.clubs || {}).find(id => id !== club.ea_club_id);
    const opponentClubData = opponentClubId ? matchData.clubs[opponentClubId] : null;
    
    const scoreFor = parseInt(ourClubData?.goals || 0);
    const scoreAgainst = parseInt(opponentClubData?.goals || 0);
    
    let result = 'draw';
    if (scoreFor > scoreAgainst) result = 'win';
    else if (scoreFor < scoreAgainst) result = 'loss';
    
    // Extract player stats
    const playerStats = [];
    const players = matchData.players?.[club.ea_club_id] || {};
    
    for (const [, pStats] of Object.entries(players)) {
      playerStats.push({
        ea_username: pStats.playername,
        goals: parseInt(pStats.goals || 0),
        assists: parseInt(pStats.assists || 0),
        rating: parseFloat(pStats.rating || 0),
        position: pStats.pos,
        motm: pStats.mom === '1',
        shots: parseInt(pStats.shots || 0),
        tackles: parseInt(pStats.tacklesmade || 0),
        passes_made: parseInt(pStats.passesmade || 0),
        pass_attempts: parseInt(pStats.passattempts || 0),
        red_cards: pStats.redcards === '1'
      });
    }
    
    // Insert match
    const { error: matchError } = await supabase.from('club_matches').insert({
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
    });
    
    if (matchError) {
      console.error(`[DB] Match insert error:`, matchError.message);
      continue;
    }
    
    // Record player stats for linked players
    for (const pStat of playerStats) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('ea_username', pStat.ea_username)
        .maybeSingle();
      
      if (profile) {
        await supabase.from('player_stats').insert({
          guild_id: guildId,
          discord_user_id: profile.discord_user_id,
          match_type: 'club',
          goals: pStat.goals,
          assists: pStat.assists,
          clean_sheet: pStat.position === 'GK' && scoreAgainst === 0,
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
      }
    }
    
    synced++;
    console.log(`✅ Synced match ${matchId}: ${result} ${scoreFor}-${scoreAgainst}`);
  }
  
  return { synced, skipped };
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
  
  for (const settings of guildSettings || []) {
    const clubs = settings.clubs || [];
    
    for (const club of clubs) {
      if (!club.ea_club_id || !club.ea_platform || !club.monitoring_enabled) continue;
      
      console.log(`\n📊 Syncing ${club.name} (${club.ea_club_id})...`);
      
      // Sync club stats
      await syncClubStats(settings.guild_id, club.key, club.ea_club_id, club.ea_platform);
      clubsSynced++;
      
      // Sync member stats (aggregate career stats)
      console.log(`\n👥 Syncing member stats for ${club.name}...`);
      const membersSynced = await syncMemberStats(settings.guild_id, club.ea_club_id, club.ea_platform, club.name);
      
      // Sync matches
      const { synced, skipped } = await syncMatches(settings.guild_id, club.key, club);
      totalSynced += synced;
      totalSkipped += skipped;
    }
  }
  
  console.log(`\n✅ Sync complete: ${totalSynced} matches synced, ${totalSkipped} skipped, ${clubsSynced} clubs updated\n`);
}

// Run immediately then every 2 minutes
console.log('🚀 EA Sync Local started');
console.log('📡 Running from your local IP to bypass EA cloud blocking');
console.log('⏱️  Syncing every 2 minutes\n');

runSync();
setInterval(runSync, 120000);
