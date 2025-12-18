/**
 * Local EA Sync Script
 * Run this locally to bypass EA's cloud IP blocking
 * Your Railway bot handles Discord, this just syncs EA data to Supabase
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const stringSimilarity = require('string-similarity');

// Normalize username for better matching - strip common variations
function normalizeUsername(username) {
  if (!username) return '';
  return username
    .toLowerCase()
    .replace(/[_\-\.]/g, '')         // Remove underscores, dashes, dots
    .replace(/[0-9]+$/g, '')         // Remove trailing numbers
    .replace(/^(ttv|yt|twitch)/i, '') // Remove common prefixes
    .replace(/x{2,}$/i, '')          // Remove trailing xxx
    .trim();
}

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
  
  // Find best match using both raw and normalized usernames
  const usernames = allMembers.map(m => m.discord_username || '').filter(Boolean);
  if (!usernames.length) return null;
  
  const normalizedEa = normalizeUsername(eaUsername);
  
  // Try exact normalized match first
  for (const member of allMembers) {
    if (member.discord_username && normalizeUsername(member.discord_username) === normalizedEa) {
      console.log(`  🎯 Exact normalized match: ${eaUsername} -> ${member.discord_username}`);
      return member;
    }
  }
  
  // Try fuzzy match on both raw and normalized
  const rawMatch = stringSimilarity.findBestMatch(eaUsername.toLowerCase(), usernames.map(u => u.toLowerCase()));
  const normalizedMatch = stringSimilarity.findBestMatch(normalizedEa, usernames.map(u => normalizeUsername(u)));
  
  // Use whichever match is better
  const bestMatch = rawMatch.bestMatch.rating >= normalizedMatch.bestMatch.rating ? rawMatch : normalizedMatch;
  const matchType = rawMatch.bestMatch.rating >= normalizedMatch.bestMatch.rating ? 'raw' : 'normalized';
  
  // Accept matches with > 40% similarity (lowered for better coverage)
  if (bestMatch.bestMatch.rating >= 0.4) {
    const matchedMember = allMembers.find(
      m => m.discord_username?.toLowerCase() === bestMatch.bestMatch.target || 
           normalizeUsername(m.discord_username) === bestMatch.bestMatch.target
    );
    if (matchedMember) {
      console.log(`  🔍 Fuzzy match (${matchType}): ${eaUsername} -> ${matchedMember.discord_username} (${(bestMatch.bestMatch.rating * 100).toFixed(0)}%)`);
      return matchedMember;
    }
  }
  
  return null;
}

// Retroactively match existing unlinked ea_ profiles to Discord members
async function retroMatchUnlinkedProfiles(guildId) {
  console.log(`\n🔄 Checking for unlinked EA profiles to auto-match...`);
  
  // Get all temp ea_ profiles for this guild
  const { data: tempProfiles } = await supabase
    .from('profiles')
    .select('discord_user_id, ea_username, ea_platform')
    .like('discord_user_id', 'ea_%');
  
  if (!tempProfiles || tempProfiles.length === 0) {
    console.log(`  ✅ No unlinked EA profiles found`);
    return { matched: 0, total: 0 };
  }
  
  console.log(`  📋 Found ${tempProfiles.length} unlinked EA profiles`);
  
  // Get all real Discord members (not temp ea_ profiles)
  const { data: discordMembers } = await supabase
    .from('profiles')
    .select('discord_user_id, discord_username, ea_username')
    .not('discord_user_id', 'like', 'ea_%');
  
  // Filter to only members without EA link
  const unlinkedMembers = (discordMembers || []).filter(m => !m.ea_username && m.discord_username);
  
  if (unlinkedMembers.length === 0) {
    console.log(`  ⚠️ No Discord members available for linking (all already linked)`);
    return { matched: 0, total: tempProfiles.length };
  }
  
  let matchedCount = 0;
  
  for (const tempProfile of tempProfiles) {
    const eaUsername = tempProfile.ea_username;
    if (!eaUsername) continue;
    
    // Get Discord usernames for comparison
    const usernames = unlinkedMembers.map(m => m.discord_username).filter(Boolean);
    if (usernames.length === 0) continue;
    
    const normalizedEa = normalizeUsername(eaUsername);
    
    // Try exact normalized match first
    let matchedMember = unlinkedMembers.find(
      m => m.discord_username && normalizeUsername(m.discord_username) === normalizedEa
    );
    
    if (matchedMember) {
      console.log(`  🎯 Retro exact match: ${eaUsername} -> ${matchedMember.discord_username}`);
    } else {
      // Try fuzzy match on both raw and normalized
      const rawMatch = stringSimilarity.findBestMatch(
        eaUsername.toLowerCase(), 
        usernames.map(u => u.toLowerCase())
      );
      const normalizedMatch = stringSimilarity.findBestMatch(
        normalizedEa, 
        usernames.map(u => normalizeUsername(u))
      );
      
      // Use whichever match is better
      const bestMatch = rawMatch.bestMatch.rating >= normalizedMatch.bestMatch.rating ? rawMatch : normalizedMatch;
      
      // Accept matches with > 35% similarity for retro-matching (more lenient)
      if (bestMatch.bestMatch.rating >= 0.35) {
        matchedMember = unlinkedMembers.find(
          m => m.discord_username?.toLowerCase() === bestMatch.bestMatch.target || 
               normalizeUsername(m.discord_username) === bestMatch.bestMatch.target
        );
        
        if (matchedMember) {
          console.log(`  🔗 Retro-linking: ${eaUsername} -> ${matchedMember.discord_username} (${(bestMatch.bestMatch.rating * 100).toFixed(0)}%)`);
        }
      }
      const tempDiscordId = tempProfile.discord_user_id;
      const realDiscordId = matchedMember.discord_user_id;
        
        // Update the real Discord profile with EA info
        await supabase
          .from('profiles')
          .update({ 
            ea_username: eaUsername, 
            ea_platform: tempProfile.ea_platform 
          })
          .eq('discord_user_id', realDiscordId);
        
        // Migrate player_stats
        await supabase
          .from('player_stats')
          .update({ discord_user_id: realDiscordId })
          .eq('discord_user_id', tempDiscordId);
        
        // Migrate player_ratings
        const { data: tempRating } = await supabase
          .from('player_ratings')
          .select('id')
          .eq('discord_user_id', tempDiscordId)
          .maybeSingle();
        
        if (tempRating) {
          const { data: existingRating } = await supabase
            .from('player_ratings')
            .select('id')
            .eq('discord_user_id', realDiscordId)
            .maybeSingle();
          
          if (!existingRating) {
            await supabase
              .from('player_ratings')
              .update({ discord_user_id: realDiscordId })
              .eq('id', tempRating.id);
          } else {
            await supabase
              .from('player_ratings')
              .delete()
              .eq('id', tempRating.id);
          }
        }
        
        // Migrate player_summary
        const { data: tempSummary } = await supabase
          .from('player_summary')
          .select('id')
          .eq('discord_user_id', tempDiscordId)
          .maybeSingle();
        
        if (tempSummary) {
          const { data: existingSummary } = await supabase
            .from('player_summary')
            .select('id')
            .eq('discord_user_id', realDiscordId)
            .maybeSingle();
          
          if (!existingSummary) {
            await supabase
              .from('player_summary')
              .update({ discord_user_id: realDiscordId })
              .eq('id', tempSummary.id);
          } else {
            await supabase
              .from('player_summary')
              .delete()
              .eq('id', tempSummary.id);
          }
        }
        
        // Migrate position_preferences
        await supabase
          .from('position_preferences')
          .update({ user_id: realDiscordId })
          .eq('user_id', tempDiscordId);
        
        // Delete temp profile
        await supabase
          .from('profiles')
          .delete()
          .eq('discord_user_id', tempDiscordId);
        
        console.log(`  ✅ Migrated all data from ${tempDiscordId} to ${realDiscordId}`);
        matchedCount++;
        
        // Remove from unlinked list so we don't double-match
        const idx = unlinkedMembers.findIndex(m => m.discord_user_id === realDiscordId);
        if (idx !== -1) unlinkedMembers.splice(idx, 1);
    }
  }
  
  console.log(`  📊 Retro-matched ${matchedCount}/${tempProfiles.length} profiles`);
  return { matched: matchedCount, total: tempProfiles.length };
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

// Match type mappings - try string-based values first, then legacy numeric
const MATCH_TYPE_CONFIG = {
  division: ['leagueMatch', 'matchType9'],
  competition: ['playoffMatch', 'matchType13'],
  friendly: ['friendlyMatch', 'matchType22']
};

// Fetch match history using matchType parameter
async function fetchMatchesByType(clubId, platform, matchTypeValue, category = 'division') {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  try {
    console.log(`[EA] Fetching ${category} matches (matchType=${matchTypeValue}) for club ${clubId}...`);
    
    // Use matchType parameter (confirmed required by EA API)
    const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
      params: { platform: fcPlatform, clubIds: clubId, matchType: matchTypeValue, maxResultCount: 30 },
      headers: EA_HEADERS,
      timeout: 10000
    });
    
    if (res.status !== 200) return [];
    
    let matches = res.data;
    if (Array.isArray(matches) && matches.length > 0) {
      console.log(`[EA] ✓ Got ${matches.length} ${category} matches using matchType=${matchTypeValue}`);
      return matches;
    }
    if (matches?.matches && matches.matches.length > 0) {
      console.log(`[EA] ✓ Got ${matches.matches.length} ${category} matches using matchType=${matchTypeValue}`);
      return matches.matches;
    }
    
    const vals = Object.values(matches).filter(v => v && typeof v === 'object');
    if (vals.length > 0) {
      console.log(`[EA] ✓ Got ${vals.length} ${category} matches using matchType=${matchTypeValue}`);
      return vals;
    }
    
    return [];
  } catch (err) {
    const status = err.response?.status;
    const errorData = err.response?.data;
    console.log(`[EA] matchType=${matchTypeValue} failed (${status || 'network'}): ${err.message}`);
    if (errorData) {
      console.log(`[EA] Error response: ${JSON.stringify(errorData).substring(0, 200)}`);
    }
    return [];
  }
}

// Fetch matches for a category with fallback match types
async function fetchMatchesWithFallback(clubId, platform, category) {
  const matchTypes = MATCH_TYPE_CONFIG[category] || ['matchType9'];
  
  for (const matchType of matchTypes) {
    const matches = await fetchMatchesByType(clubId, platform, matchType, category);
    if (matches.length > 0) {
      // Tag matches with category
      for (const m of matches) {
        m._matchCategory = category;
      }
      return matches;
    }
    console.log(`[EA] ${matchType} returned no results, trying next fallback...`);
  }
  
  console.log(`[EA] All ${category} match types exhausted, no matches found`);
  return [];
}

// Fetch ALL match types (division, competition, friendly) with fallbacks
async function fetchAllMatches(clubId, platform) {
  const allMatches = [];
  
  // Division/League matches
  const divisionMatches = await fetchMatchesWithFallback(clubId, platform, 'division');
  allMatches.push(...divisionMatches);
  
  // Competition/Cup matches
  const cupMatches = await fetchMatchesWithFallback(clubId, platform, 'competition');
  allMatches.push(...cupMatches);
  
  // Friendly matches
  const friendlyMatches = await fetchMatchesWithFallback(clubId, platform, 'friendly');
  allMatches.push(...friendlyMatches);
  
  console.log(`[EA] Total matches fetched: ${allMatches.length} (${divisionMatches.length} division, ${cupMatches.length} cup, ${friendlyMatches.length} friendly)`);
  return allMatches;
}

// Legacy function for backward compatibility
async function fetchMatches(clubId, platform) {
  return fetchAllMatches(clubId, platform);
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

// Auto-scout opponent club and store their player data
async function scoutOpponentClub(guildId, opponentClubId, platform, incrementTimesFaced = false) {
  if (!opponentClubId) return { scouted: 0 };
  
  console.log(`🔍 Auto-scouting opponent club ${opponentClubId}...`);
  
  // Fetch club info first
  const clubInfo = await fetchClubInfo(opponentClubId, platform);
  const clubName = clubInfo?.name || `Club ${opponentClubId}`;
  
  // Fetch opponent members
  const members = await fetchClubMembers(opponentClubId, platform);
  
  if (!members.length) {
    console.log(`  ⚠️ No members found for opponent ${clubName}`);
    return { scouted: 0, clubName };
  }
  
  let scoutedCount = 0;
  
  for (const member of members) {
    const eaUsername = member.name || member.playerName;
    if (!eaUsername) continue;
    
    const gamesPlayed = parseInt(member.gamesPlayed || member.games || 0);
    const goals = parseInt(member.goals || 0);
    const assists = parseInt(member.assists || 0);
    const wins = parseInt(member.wins || 0);
    const losses = parseInt(member.losses || 0);
    const draws = parseInt(member.draws || member.ties || 0);
    const cleanSheets = parseInt(member.cleanSheetsDef || member.cleanSheetsGK || member.cleanSheets || 0);
    const manOfMatch = parseInt(member.manOfTheMatch || member.motm || 0);
    const avgRating = parseFloat(member.ratingAve || member.avgRating || 0) || null;
    const position = member.favoritePosition || member.proPos || null;
    const archetype = member.archetypeid || member.archetype || null;

    const playerData = {
      guild_id: guildId,
      ea_club_id: opponentClubId,
      ea_club_name: clubName,
      ea_username: eaUsername,
      ea_platform: platform,
      games_played: gamesPlayed,
      goals,
      assists,
      wins,
      losses,
      draws,
      win_rate: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0,
      avg_match_rating: avgRating,
      clean_sheets: cleanSheets,
      man_of_match: manOfMatch,
      primary_position: position,
      archetypeid: archetype,
      shots: parseInt(member.shots || 0),
      tackles: parseInt(member.tackles || member.tacklesAttempted || 0),
      passes_made: parseInt(member.passesMade || 0),
      pass_attempts: parseInt(member.passesAttempted || 0),
      saves: parseInt(member.saves || 0),
      interceptions: parseInt(member.interceptions || 0),
      clearances: parseInt(member.clearances || 0),
      last_scouted_at: new Date().toISOString()
    };

    // Check if player already scouted
    const { data: existing } = await supabase
      .from('scouted_players')
      .select('id, times_faced')
      .eq('guild_id', guildId)
      .eq('ea_club_id', opponentClubId)
      .eq('ea_username', eaUsername)
      .maybeSingle();

    if (existing) {
      // Update existing
      const updateData = {
        ...playerData,
        times_faced: incrementTimesFaced ? (existing.times_faced || 0) + 1 : existing.times_faced || 0
      };
      
      await supabase
        .from('scouted_players')
        .update(updateData)
        .eq('id', existing.id);
    } else {
      // Insert new
      await supabase
        .from('scouted_players')
        .insert({
          ...playerData,
          times_faced: incrementTimesFaced ? 1 : 0,
          first_seen_at: new Date().toISOString()
        });
    }
    
    scoutedCount++;
  }
  
  console.log(`  ✅ Scouted ${scoutedCount} players from ${clubName}`);
  return { scouted: scoutedCount, clubName };
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
    
    // Debug: Log raw EA member data to see available fields (first player of each club)
    if (synced === 0) {
      console.log(`  🔍 [DEBUG] Sample EA member data for ${eaUsername}:`);
      console.log(`  🔍 [DEBUG] Keys:`, Object.keys(member).join(', '));
      // Log all pass-related fields
      console.log(`  🔍 [DEBUG] Pass fields: passesmade=${member.passesmade}, passattempts=${member.passattempts}, passingaccuracy=${member.passingaccuracy}, passaccuracy=${member.passaccuracy}, passSuccessRate=${member.passSuccessRate}`);
      console.log(`  🔍 [DEBUG] Win fields: wins=${member.wins}, losses=${member.losses}, winRate=${member.winRate}, gamesPlayed=${member.gamesPlayed}`);
    }
    
    // Extract ALL aggregate stats from EA member data (matching EA website fields)
    const goals = parseInt(member.goals || 0);
    const assists = parseInt(member.assists || 0);
    const gamesPlayed = parseInt(member.gamesPlayed || member.matches || member.memberGamesPlayed || 0);
    
    // EA API provides winRate as decimal (e.g., 0.55 = 55%) - calculate wins from it
    let wins = parseInt(member.wins || member.memberWins || 0);
    let losses = parseInt(member.losses || member.memberLosses || 0);
    
    // If wins/losses are 0 but we have winRate, calculate from it
    if (wins === 0 && gamesPlayed > 0) {
      let winRateDecimal = 0;
      if (member.winRate !== undefined) {
        winRateDecimal = parseFloat(member.winRate);
        // Handle both 0.55 and 55 formats
        if (winRateDecimal > 1) winRateDecimal = winRateDecimal / 100;
      }
      wins = Math.round(gamesPlayed * winRateDecimal);
      // Estimate losses as ~80% of non-wins, leaving ~20% as draws
      losses = Math.round((gamesPlayed - wins) * 0.8);
    }
    
    const draws = Math.max(0, gamesPlayed - wins - losses);
    const avgRating = parseFloat(member.ratingAve || member.avgRating || member.proOverall || 0);
    const cleanSheets = parseInt(member.cleanSheetsDef || member.cleanSheetsGK || member.cleanSheets || 0);
    const manOfMatch = parseInt(member.manOfTheMatch || member.mom || 0);
    const position = favoritePosition;
    
    // Calculate winRate for display
    const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
    
    // Extended stats from EA API (all fields visible on EA club member page)
    const shots = parseInt(member.shots || 0);
    const tackles = parseInt(member.tacklesmade || member.tacklesMade || member.tackles || 0);
    const tackleAttempts = parseInt(member.tackleattempts || member.tackleAttempts || 0);
    const tackleSuccessRate = tackleAttempts > 0 ? (tackles / tackleAttempts) * 100 : 0;
    const passesMade = parseInt(member.passesmade || member.passesMade || member.passes || 0);
    let passAttempts = parseInt(member.passattempts || member.passAttempts || 0);
    
    // EA may provide pass accuracy directly as passingaccuracy, passaccuracy, or passSuccessRate
    let passSuccessRate = 0;
    const passAccuracyRaw = member.passingaccuracy || member.passaccuracy || member.passSuccessRate || member.passAccuracy;
    if (passAccuracyRaw !== undefined) {
      passSuccessRate = parseFloat(passAccuracyRaw);
      if (passSuccessRate <= 1 && passSuccessRate > 0) passSuccessRate *= 100; // Handle decimal format
      // If we have pass accuracy but no attempts, estimate attempts from made/accuracy
      if (passAttempts === 0 && passSuccessRate > 0 && passesMade > 0) {
        passAttempts = Math.round(passesMade / (passSuccessRate / 100));
      }
    } else if (passAttempts > 0) {
      passSuccessRate = (passesMade / passAttempts) * 100;
    }
    const saves = parseInt(member.saves || member.gksaves || member.gkSaves || 0);
    const interceptions = parseInt(member.interceptions || 0);
    const clearances = parseInt(member.clearances || 0);
    
    // GK-specific detailed save breakdowns from EA member data
    const savesDiving = parseInt(member.savesdiving || member.gkSavesDiving || member.gksavesdive || 0);
    const savesReflex = parseInt(member.savesreflex || member.gkSavesReflex || member.gksavesreflex || 0);
    const savesParry = parseInt(member.savesparry || member.gkSavesParry || member.gksavesparry || 0);
    const savesCross = parseInt(member.savescross || member.gkSavesCross || member.gksavescross || member.crosscatches || 0);
    const savesPunch = parseInt(member.savespunch || member.gkSavesPunch || member.gksavespunch || member.punches || 0);
    const goalsConceded = parseInt(member.goalsconceded || member.goalsAgainst || member.goalsConceded || 0);
    const dribbles = parseInt(member.dribblewon || member.dribbles || 0);
    const fouls = parseInt(member.fouls || member.foulcommited || 0);
    const offsides = parseInt(member.offsides || 0);
    
    console.log(`  📊 ${eaUsername}: ${gamesPlayed} games, ${goals}G/${assists}A, ${winRate.toFixed(1)}% win, ${passSuccessRate.toFixed(1)}% pass, ${tackleSuccessRate.toFixed(1)}% tackle`);
    
    // Update stats for ALL players (including ea_ prefixed temp profiles)
    // ===== ENSURE player_ratings record exists =====
    const { data: existingRating } = await supabase
      .from('player_ratings')
      .select('id, games_played, baseline_synced')
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
      // Create initial rating record with EA aggregate stats including GK-specific
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
          tackle_attempts: tackleAttempts,
          passes_made: passesMade,
          pass_attempts: passAttempts,
          saves: saves,
          interceptions: interceptions,
          clearances: clearances,
          // GK-specific stats
          saves_diving: savesDiving,
          saves_reflex: savesReflex,
          saves_parry: savesParry,
          saves_cross: savesCross,
          saves_punch: savesPunch,
          goals_conceded: goalsConceded,
          dribbles: dribbles,
          fouls: fouls,
          offsides: offsides,
          baseline_synced: true,
        });
      
      console.log(`  ✨ Created player_ratings for ${eaUsername} (${gamesPlayed} games, ${goals}G/${assists}A)`);
    } else {
      // Always update stats from EA member board (source of truth for aggregate stats)
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
          tackle_attempts: tackleAttempts,
          passes_made: passesMade,
          pass_attempts: passAttempts,
          saves: saves,
          interceptions: interceptions,
          clearances: clearances,
          // GK-specific stats
          saves_diving: savesDiving,
          saves_reflex: savesReflex,
          saves_parry: savesParry,
          saves_cross: savesCross,
          saves_punch: savesPunch,
          goals_conceded: goalsConceded,
          dribbles: dribbles,
          fouls: fouls,
          offsides: offsides,
          baseline_synced: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRating.id);
      
      console.log(`  📈 Updated player_ratings for ${eaUsername} (${gamesPlayed} games, ${goals}G/${assists}A, ${avgRating.toFixed(1)} avg)`);
    }
    
    // ===== ENSURE player_summary record exists =====
    const { data: existingSummary } = await supabase
      .from('player_summary')
      .select('id, games_played, baseline_synced')
      .eq('guild_id', guildId)
      .eq('discord_user_id', profile.discord_user_id)
      .maybeSingle();
    
    if (!existingSummary) {
      // Create initial summary record with EA aggregate stats including GK-specific
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
          tackle_attempts: tackleAttempts,
          passes_made: passesMade,
          pass_attempts: passAttempts,
          saves: saves,
          interceptions: interceptions,
          clearances: clearances,
          // GK-specific stats
          saves_diving: savesDiving,
          saves_reflex: savesReflex,
          saves_parry: savesParry,
          saves_cross: savesCross,
          saves_punch: savesPunch,
          goals_conceded: goalsConceded,
          dribbles: dribbles,
          fouls: fouls,
          offsides: offsides,
          baseline_synced: true,
        });
      
      console.log(`  ✨ Created player_summary for ${eaUsername} (${gamesPlayed} games, ${goals}G/${assists}A)`);
    } else {
      // Always update stats from EA member board (source of truth for aggregate stats)
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
          tackle_attempts: tackleAttempts,
          passes_made: passesMade,
          pass_attempts: passAttempts,
          saves: saves,
          interceptions: interceptions,
          clearances: clearances,
          // GK-specific stats
          saves_diving: savesDiving,
          saves_reflex: savesReflex,
          saves_parry: savesParry,
          saves_cross: savesCross,
          saves_punch: savesPunch,
          goals_conceded: goalsConceded,
          dribbles: dribbles,
          fouls: fouls,
          offsides: offsides,
          baseline_synced: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSummary.id);
      
      console.log(`  📈 Updated player_summary for ${eaUsername} (${gamesPlayed} games, ${goals}G/${assists}A, ${winRate.toFixed(1)}% WR)`);
    }
    
    // Track for rating recalculation (only real Discord users)
    const isRealUser = !profile.discord_user_id.startsWith('ea_');
    if (isRealUser) {
      updatedPlayerIds.push(profile.discord_user_id);
    }
    synced++;
    
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
      // Extract ALL available stats from EA API - comprehensive capture
      playerStats.push({
        ea_username: pStats.playername || pStats.name,
        goals: parseInt(pStats.goals || 0),
        assists: parseInt(pStats.assists || 0),
        rating: parseFloat(pStats.rating || 0),
        position: pStats.pos || pStats.position,
        motm: pStats.mom === '1' || pStats.mom === 1,
        shots: parseInt(pStats.shots || 0),
        tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
        tackle_attempts: parseInt(pStats.tackleattempts || pStats.tackleAttempts || 0),
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
        offsides: parseInt(pStats.offsides || 0),
        // Player archetype/build from EA (like OurProClub captures)
        archetypeid: pStats.archetypeid || pStats.archetypeId || pStats.archetype || null,
        seconds_played: parseInt(pStats.secondsPlayed || pStats.seconds_played || 0),
        // GK-specific detailed save breakdowns
        saves_diving: parseInt(pStats.savesdiving || pStats.gkSavesDiving || pStats.gksavesdive || 0),
        saves_reflex: parseInt(pStats.savesreflex || pStats.gkSavesReflex || pStats.gksavesreflex || 0),
        saves_parry: parseInt(pStats.savesparry || pStats.gkSavesParry || pStats.gksavesparry || 0),
        saves_cross: parseInt(pStats.savescross || pStats.gkSavesCross || pStats.gksavescross || pStats.crosscatches || 0),
        saves_punch: parseInt(pStats.savespunch || pStats.gkSavesPunch || pStats.gksavespunch || pStats.punches || 0),
        // GK goals conceded
        goals_conceded: parseInt(pStats.goalsconceded || pStats.goalsAgainst || 0),
        // Clean sheet tracking for GK (already calculated separately but capture raw too)
        cleansheetsgk: pStats.cleansheetsgk === '1' || pStats.cleansheetsgk === 1,
        cleansheetsdef: pStats.cleansheetsdef === '1' || pStats.cleansheetsdef === 1
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
          match_type: matchData._matchCategory || 'division',
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
        
        // Auto-scout opponent club when new match is detected
        if (opponentClubId) {
          await scoutOpponentClub(guildId, opponentClubId, club.ea_platform, true);
        }
      }
    } else {
      skipped++;
    }
    
    // Record individual player stats with deduplication
    const matchPlayerIds = []; // Track players in THIS match for feedback
    
    for (const pStat of playerStats) {
      // Find profile for this EA username - prioritize real Discord users over temp ea_ profiles
      let { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('ea_username', pStat.ea_username)
        .not('discord_user_id', 'like', 'ea_%')
        .maybeSingle();
      
      // Fall back to temp profile if no real user found
      if (!profile) {
        const { data: tempProfile } = await supabase
          .from('profiles')
          .select('discord_user_id')
          .eq('ea_username', pStat.ea_username)
          .like('discord_user_id', 'ea_%')
          .maybeSingle();
        profile = tempProfile;
      }
      
      if (!profile) continue;
      
      // Skip temp profiles (ea_*) - only real Discord users
      if (profile.discord_user_id.startsWith('ea_')) continue;
      
      // Check if we already have this player's stats for this match
      const statsKey = `${matchId}:${profile.discord_user_id}`;
      if (existingPlayerStatsSet.has(statsKey)) continue;
      
      // Insert player stats with ea_match_id for future deduplication - comprehensive stats
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
        tackle_attempts: pStat.tackle_attempts,
        passes_made: pStat.passes_made,
        pass_attempts: pStat.pass_attempts,
        red_cards: pStat.red_cards,
        // Extended stats
        interceptions: pStat.interceptions,
        clearances: pStat.clearances,
        possession: pStat.possession,
        dribbles: pStat.dribbles,
        fouls: pStat.fouls,
        offsides: pStat.offsides,
        seconds_played: pStat.seconds_played,
        archetypeid: pStat.archetypeid,
        // GK-specific detailed save breakdowns
        saves_diving: pStat.saves_diving,
        saves_reflex: pStat.saves_reflex,
        saves_parry: pStat.saves_parry,
        saves_cross: pStat.saves_cross,
        saves_punch: pStat.saves_punch,
        goals_conceded: pStat.goals_conceded
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
    // First check if feedback is enabled for this guild
    if (isNewMatch && clubMatchId && matchPlayerIds.length >= 2) {
      const { data: guildSettings } = await supabase
        .from('guild_settings')
        .select('feedback_enabled')
        .eq('guild_id', guildId)
        .single();
      
      // Skip if feedback is disabled
      if (guildSettings && guildSettings.feedback_enabled === false) {
        console.log(`📨 Feedback disabled for guild ${guildId}, skipping...`);
      } else {
        console.log(`📨 Creating feedback requests for ${matchPlayerIds.length} players...`);
        
        // Build player data with positions and EA usernames for the feedback panel
        const playerDataMap = {};
        for (const pStat of playerStats) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('discord_user_id, ea_username')
            .eq('ea_username', pStat.ea_username)
            .not('discord_user_id', 'like', 'ea_%')
            .maybeSingle();
          
          if (profile && matchPlayerIds.includes(profile.discord_user_id)) {
            playerDataMap[profile.discord_user_id] = {
              discord_user_id: profile.discord_user_id,
              ea_username: pStat.ea_username,
              position_played: pStat.position || 'ANY'
            };
          }
        }
        
        let createdCount = 0;
        for (const evaluatorId of matchPlayerIds) {
          // Check if a feedback request already exists for this player + match
          const { data: existingRequest } = await supabase
            .from('dm_feedback_requests')
            .select('id')
            .eq('evaluator_discord_id', evaluatorId)
            .eq('club_match_id', clubMatchId)
            .maybeSingle();
          
          if (existingRequest) {
            console.log(`  ⏭️ Feedback request already exists for ${evaluatorId}, skipping...`);
            continue;
          }
          
          // Build teammates data array with positions (everyone except the evaluator)
          const teammatesData = matchPlayerIds
            .filter(id => id !== evaluatorId)
            .map(id => playerDataMap[id] || { discord_user_id: id, ea_username: 'Unknown', position_played: 'ANY' });
          
          const { error: feedbackError } = await supabase
            .from('dm_feedback_requests')
            .insert({
              guild_id: guildId,
              evaluator_discord_id: evaluatorId,
              club_match_id: clubMatchId,
              match_type: 'club',
              teammates_to_evaluate: matchPlayerIds.filter(id => id !== evaluatorId),
              teammates_data: teammatesData,
              status: 'pending',
              expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes only
            });
          
          if (feedbackError) {
            // Could be unique constraint violation - just skip
            if (feedbackError.code === '23505') {
              console.log(`  ⏭️ Duplicate feedback request for ${evaluatorId}, skipping...`);
            } else {
              console.log(`  ⚠️ Feedback request error for ${evaluatorId}: ${feedbackError.message}`);
            }
          } else {
            createdCount++;
          }
        }
        
        console.log(`  ✅ Created ${createdCount} feedback requests with position data`);
      }
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

// Update player stats with aggregated data from all clubs
async function updateAggregatedPlayerStats(guildId, eaUsername, stats) {
  const updatedPlayerIds = [];
  
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
      await supabase
        .from('profiles')
        .update({ ea_username: eaUsername, ea_platform: stats.platform })
        .eq('discord_user_id', fuzzyMatch.discord_user_id);
      profile = { discord_user_id: fuzzyMatch.discord_user_id };
      console.log(`  ✅ Auto-linked ${eaUsername} to Discord user ${fuzzyMatch.discord_username}`);
    } else {
      // Create temp profile
      const tempDiscordId = `ea_${eaUsername.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const { data: existingTemp } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('discord_user_id', tempDiscordId)
        .maybeSingle();
      
      if (existingTemp) {
        profile = existingTemp;
      } else {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({
            discord_user_id: tempDiscordId,
            ea_username: eaUsername,
            ea_platform: stats.platform
          })
          .select('discord_user_id')
          .single();
        profile = newProfile;
      }
    }
  }
  
  if (!profile) return [];
  
  // Calculate aggregated values
  const gamesPlayed = stats.gamesPlayed;
  const goals = stats.goals;
  const assists = stats.assists;
  const wins = stats.wins;
  const losses = stats.losses;
  const draws = Math.max(0, gamesPlayed - wins - losses);
  const winRate = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
  const avgRating = stats.totalRatingWeight > 0 ? stats.weightedRatingSum / stats.totalRatingWeight : 0;
  
  // Map position
  const positionMap = {
    'goalkeeper': 'GK', 'gk': 'GK',
    'defender': 'CB', 'cb': 'CB', 'rb': 'RB', 'lb': 'LB', 'rwb': 'RWB', 'lwb': 'LWB',
    'midfielder': 'CM', 'cm': 'CM', 'cdm': 'CDM', 'cam': 'CAM', 'rm': 'RM', 'lm': 'LM',
    'attacker': 'ST', 'st': 'ST', 'cf': 'CF', 'rw': 'RW', 'lw': 'LW', 'rf': 'RF', 'lf': 'LF'
  };
  const mappedPosition = stats.position ? (positionMap[stats.position.toLowerCase()] || stats.position.toUpperCase()) : null;
  
  // Get discord username
  const { data: fullProfile } = await supabase
    .from('profiles')
    .select('discord_username')
    .eq('discord_user_id', profile.discord_user_id)
    .maybeSingle();
  
  // Update player_ratings
  const { data: existingRating } = await supabase
    .from('player_ratings')
    .select('id')
    .eq('guild_id', guildId)
    .eq('discord_user_id', profile.discord_user_id)
    .maybeSingle();
  
  const ratingsData = {
    games_played: gamesPlayed,
    wins: wins,
    losses: losses,
    draws: draws,
    total_goals: goals,
    total_assists: assists,
    total_clean_sheets: stats.cleanSheets,
    total_motm: stats.manOfMatch,
    avg_match_rating: avgRating,
    shots: stats.shots,
    tackles: stats.tackles,
    passes_made: stats.passesMade,
    pass_attempts: stats.passAttempts,
    saves: stats.saves,
    interceptions: stats.interceptions,
    clearances: stats.clearances,
    baseline_synced: true,
    updated_at: new Date().toISOString()
  };
  
  if (!existingRating) {
    await supabase
      .from('player_ratings')
      .insert({
        guild_id: guildId,
        discord_user_id: profile.discord_user_id,
        overall_rating: 50,
        ...ratingsData
      });
  } else {
    await supabase
      .from('player_ratings')
      .update(ratingsData)
      .eq('id', existingRating.id);
  }
  
  // Update player_summary
  const { data: existingSummary } = await supabase
    .from('player_summary')
    .select('id')
    .eq('guild_id', guildId)
    .eq('discord_user_id', profile.discord_user_id)
    .maybeSingle();
  
  const summaryData = {
    discord_username: fullProfile?.discord_username || eaUsername,
    primary_position: mappedPosition,
    games_played: gamesPlayed,
    wins: wins,
    losses: losses,
    draws: draws,
    win_rate: winRate,
    goals: goals,
    assists: assists,
    clean_sheets: stats.cleanSheets,
    man_of_match: stats.manOfMatch,
    avg_match_rating: avgRating,
    shots: stats.shots,
    tackles: stats.tackles,
    passes_made: stats.passesMade,
    pass_attempts: stats.passAttempts,
    saves: stats.saves,
    baseline_synced: true,
    updated_at: new Date().toISOString()
  };
  
  if (!existingSummary) {
    await supabase
      .from('player_summary')
      .insert({
        guild_id: guildId,
        discord_user_id: profile.discord_user_id,
        overall_rating: 50,
        ...summaryData
      });
  } else {
    await supabase
      .from('player_summary')
      .update(summaryData)
      .eq('id', existingSummary.id);
  }
  
  console.log(`  📈 ${eaUsername}: ${gamesPlayed} total games, ${goals}G/${assists}A, ${winRate.toFixed(1)}% WR (${stats.clubCount} clubs)`);
  
  // Track for rating recalculation (only real Discord users)
  if (!profile.discord_user_id.startsWith('ea_')) {
    updatedPlayerIds.push(profile.discord_user_id);
  }
  
  return updatedPlayerIds;
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
        timeout: 120000 // 2 minutes for large player batches
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
    const enabledClubs = clubs.filter(c => c.ea_club_id && c.ea_platform && c.monitoring_enabled);
    
    if (enabledClubs.length === 0) continue;
    
    // ===== PHASE 1: Collect all member data from all clubs =====
    const playerAggregates = new Map(); // eaUsername -> aggregated stats
    
    for (const club of enabledClubs) {
      console.log(`\n📊 Syncing ${club.name} (${club.ea_club_id})...`);
      
      // Sync club stats
      await syncClubStats(settings.guild_id, club.key, club.ea_club_id, club.ea_platform);
      clubsSynced++;
      
      // Fetch member stats (but don't update DB yet - collect for aggregation)
      console.log(`\n👥 Collecting member stats from ${club.name}...`);
      const members = await fetchClubMembers(club.ea_club_id, club.ea_platform);
      
      for (const member of members) {
        const eaUsername = member.name || member.playerName;
        if (!eaUsername) continue;
        
        // Extract stats from this club
        const gamesPlayed = parseInt(member.gamesPlayed || member.matches || member.memberGamesPlayed || 0);
        
        // EA API provides winRate as decimal (e.g., 0.55 = 55%) - calculate wins from it
        let wins = parseInt(member.wins || member.memberWins || 0);
        let losses = parseInt(member.losses || member.memberLosses || 0);
        
        // If wins/losses are 0 but we have winRate, calculate from it
        if (wins === 0 && gamesPlayed > 0) {
          let winRateDecimal = 0;
          if (member.winRate !== undefined) {
            winRateDecimal = parseFloat(member.winRate);
            // Handle both 0.55 and 55 formats
            if (winRateDecimal > 1) winRateDecimal = winRateDecimal / 100;
          }
          wins = Math.round(gamesPlayed * winRateDecimal);
          // Estimate losses (assume roughly equal to non-wins for now, minus some draws)
          // A reasonable estimate: losses ~ (gamesPlayed - wins) * 0.8, draws ~ 20% of remaining
          losses = Math.round((gamesPlayed - wins) * 0.8);
        }
        
        const stats = {
          gamesPlayed,
          goals: parseInt(member.goals || 0),
          assists: parseInt(member.assists || 0),
          wins,
          losses,
          avgRating: parseFloat(member.ratingAve || member.avgRating || member.proOverall || 0),
          cleanSheets: parseInt(member.cleanSheetsDef || member.cleanSheetsGK || member.cleanSheets || 0),
          manOfMatch: parseInt(member.manOfTheMatch || member.mom || 0),
          shots: parseInt(member.shots || 0),
          tackles: parseInt(member.tacklesmade || member.tackles || 0),
          passesMade: parseInt(member.passesmade || member.passesMade || member.passes || 0),
          passAttempts: (() => {
            let attempts = parseInt(member.passattempts || member.passAttempts || 0);
            // Estimate attempts from pass accuracy if not provided
            if (attempts === 0) {
              const passAccuracyRaw = member.passingaccuracy || member.passaccuracy || member.passSuccessRate || member.passAccuracy;
              const passesMade = parseInt(member.passesmade || member.passesMade || member.passes || 0);
              if (passAccuracyRaw !== undefined && passesMade > 0) {
                let passAcc = parseFloat(passAccuracyRaw);
                if (passAcc <= 1 && passAcc > 0) passAcc *= 100;
                if (passAcc > 0) attempts = Math.round(passesMade / (passAcc / 100));
              }
            }
            return attempts;
          })(),
          saves: parseInt(member.saves || member.gksaves || member.gkSaves || 0),
          interceptions: parseInt(member.interceptions || 0),
          clearances: parseInt(member.clearances || 0),
          position: member.favoritePosition || member.proPos || null,
          platform: club.ea_platform
        };
        
        console.log(`  📊 ${eaUsername}: ${stats.gamesPlayed} games, ${stats.goals}G/${stats.assists}A from ${club.name}`);
        
        // ===== SAVE PER-CLUB STATS to player_club_stats table =====
        // Find or create profile for EA username
        let profile = null;
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('discord_user_id')
          .eq('ea_username', eaUsername)
          .maybeSingle();
        
        if (existingProfile) {
          profile = existingProfile;
        } else {
          // Try fuzzy match or create temp profile
          const fuzzyMatch = await fuzzyMatchEaToDiscord(supabase, settings.guild_id, eaUsername);
          if (fuzzyMatch) {
            await supabase
              .from('profiles')
              .update({ ea_username: eaUsername, ea_platform: club.ea_platform })
              .eq('discord_user_id', fuzzyMatch.discord_user_id);
            profile = { discord_user_id: fuzzyMatch.discord_user_id };
          } else {
            const tempDiscordId = `ea_${eaUsername.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const { data: existingTemp } = await supabase
              .from('profiles')
              .select('discord_user_id')
              .eq('discord_user_id', tempDiscordId)
              .maybeSingle();
            
            if (existingTemp) {
              profile = existingTemp;
            } else {
              const { data: newProfile } = await supabase
                .from('profiles')
                .insert({
                  discord_user_id: tempDiscordId,
                  ea_username: eaUsername,
                  ea_platform: club.ea_platform
                })
                .select('discord_user_id')
                .single();
              profile = newProfile;
            }
          }
        }
        
        if (profile) {
          // Get discord username
          const { data: fullProfile } = await supabase
            .from('profiles')
            .select('discord_username')
            .eq('discord_user_id', profile.discord_user_id)
            .maybeSingle();
          
          // Map position
          const positionMap = {
            'goalkeeper': 'GK', 'gk': 'GK',
            'defender': 'CB', 'cb': 'CB', 'rb': 'RB', 'lb': 'LB', 'rwb': 'RWB', 'lwb': 'LWB',
            'midfielder': 'CM', 'cm': 'CM', 'cdm': 'CDM', 'cam': 'CAM', 'rm': 'RM', 'lm': 'LM',
            'attacker': 'ST', 'st': 'ST', 'cf': 'CF', 'rw': 'RW', 'lw': 'LW', 'rf': 'RF', 'lf': 'LF'
          };
          const mappedPosition = stats.position ? (positionMap[stats.position.toLowerCase()] || stats.position.toUpperCase()) : null;
          const draws = Math.max(0, stats.gamesPlayed - stats.wins - stats.losses);
          const winRate = stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) * 100 : 0;
          
          // Upsert to player_club_stats
          const { error: clubStatsError } = await supabase
            .from('player_club_stats')
            .upsert({
              guild_id: settings.guild_id,
              discord_user_id: profile.discord_user_id,
              club_key: club.key,
              ea_club_id: club.ea_club_id,
              discord_username: fullProfile?.discord_username || eaUsername,
              primary_position: mappedPosition,
              games_played: stats.gamesPlayed,
              wins: stats.wins,
              losses: stats.losses,
              draws: draws,
              win_rate: winRate,
              goals: stats.goals,
              assists: stats.assists,
              clean_sheets: stats.cleanSheets,
              man_of_match: stats.manOfMatch,
              avg_match_rating: stats.avgRating,
              shots: stats.shots,
              tackles: stats.tackles,
              passes_made: stats.passesMade,
              pass_attempts: stats.passAttempts,
              saves: stats.saves,
              interceptions: stats.interceptions,
              clearances: stats.clearances,
              baseline_synced: true,
              updated_at: new Date().toISOString()
            }, { onConflict: 'guild_id,discord_user_id,club_key' });
          
          if (clubStatsError) {
            console.log(`  ⚠️ player_club_stats upsert error for ${eaUsername}: ${clubStatsError.message}`);
          }
        }
        
        // Aggregate with existing data for this player
        if (playerAggregates.has(eaUsername)) {
          const existing = playerAggregates.get(eaUsername);
          existing.gamesPlayed += stats.gamesPlayed;
          existing.goals += stats.goals;
          existing.assists += stats.assists;
          existing.wins += stats.wins;
          existing.losses += stats.losses;
          existing.cleanSheets += stats.cleanSheets;
          existing.manOfMatch += stats.manOfMatch;
          existing.shots += stats.shots;
          existing.tackles += stats.tackles;
          existing.passesMade += stats.passesMade;
          existing.passAttempts += stats.passAttempts;
          existing.saves += stats.saves;
          existing.interceptions += stats.interceptions;
          existing.clearances += stats.clearances;
          // Weighted average for rating
          existing.totalRatingWeight += stats.gamesPlayed;
          existing.weightedRatingSum += stats.avgRating * stats.gamesPlayed;
          existing.clubCount++;
        } else {
          playerAggregates.set(eaUsername, {
            ...stats,
            totalRatingWeight: stats.gamesPlayed,
            weightedRatingSum: stats.avgRating * stats.gamesPlayed,
            clubCount: 1
          });
        }
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
    
    // ===== PHASE 2: Update database with aggregated stats =====
    console.log(`\n📊 Updating aggregated stats for ${playerAggregates.size} players...`);
    
    for (const [eaUsername, stats] of playerAggregates) {
      const updatedPlayerIds = await updateAggregatedPlayerStats(settings.guild_id, eaUsername, stats);
      
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
  
  // Run retro-matching for unlinked profiles
  await retroMatchUnlinkedProfiles();
  
  console.log(`\n✅ Sync complete: ${totalSynced} matches synced, ${totalSkipped} skipped, ${clubsSynced} clubs updated\n`);
}

// Backfill scouted_players from existing club_matches
async function backfillOpponentScouting() {
  console.log('\n🔍 Starting opponent scouting backfill...\n');
  
  // Get all guilds with club stats (to know platform)
  const { data: clubStats } = await supabase
    .from('club_stats')
    .select('guild_id, ea_club_id, ea_platform');
  
  if (!clubStats?.length) {
    console.log('❌ No club stats found');
    return;
  }
  
  // Create a map of guild_id -> platform
  const guildPlatforms = {};
  const ourClubIds = new Set();
  for (const cs of clubStats) {
    guildPlatforms[cs.guild_id] = cs.ea_platform;
    ourClubIds.add(cs.ea_club_id);
  }
  
  // Get all unique opponent clubs from matches
  const { data: matches } = await supabase
    .from('club_matches')
    .select('guild_id, opponent_club_id, match_data')
    .not('opponent_club_id', 'is', null);
  
  if (!matches?.length) {
    console.log('❌ No matches with opponent data found');
    return;
  }
  
  // Group by opponent club and count times faced
  const opponentCounts = {};
  for (const match of matches) {
    const oppId = match.opponent_club_id;
    if (!oppId || ourClubIds.has(oppId)) continue;
    
    const key = `${match.guild_id}:${oppId}`;
    if (!opponentCounts[key]) {
      opponentCounts[key] = {
        guild_id: match.guild_id,
        opponent_club_id: oppId,
        platform: guildPlatforms[match.guild_id] || 'ps5',
        times_faced: 0
      };
    }
    opponentCounts[key].times_faced++;
  }
  
  const uniqueOpponents = Object.values(opponentCounts);
  console.log(`📊 Found ${uniqueOpponents.length} unique opponent clubs to scout\n`);
  
  let scoutedClubs = 0;
  let totalPlayers = 0;
  
  for (const opp of uniqueOpponents) {
    try {
      // Scout the opponent club
      const result = await scoutOpponentClub(opp.guild_id, opp.opponent_club_id, opp.platform, false);
      
      if (result.scouted > 0) {
        // Update times_faced for all players in this club
        await supabase
          .from('scouted_players')
          .update({ times_faced: opp.times_faced })
          .eq('guild_id', opp.guild_id)
          .eq('ea_club_id', opp.opponent_club_id);
        
        scoutedClubs++;
        totalPlayers += result.scouted;
        console.log(`  📈 Set times_faced=${opp.times_faced} for ${result.clubName || opp.opponent_club_id}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ❌ Error scouting ${opp.opponent_club_id}:`, err.message);
    }
  }
  
  console.log(`\n✅ Backfill complete: ${scoutedClubs} clubs, ${totalPlayers} players scouted\n`);
}

// Backfill last 10 games for each club (avoiding duplicates)
async function backfillMatchHistory() {
  console.log('\n🔄 Backfilling match history (last 10 games per club)...\n');
  
  // Get all guilds and their clubs
  const { data: guilds } = await supabase
    .from('guild_settings')
    .select('guild_id, clubs, name');
  
  if (!guilds?.length) {
    console.log('❌ No guilds found');
    return;
  }
  
  let totalSynced = 0;
  let totalSkipped = 0;
  
  for (const guild of guilds) {
    const guildId = guild.guild_id;
    const guildName = guild.name || guildId;
    const clubs = guild.clubs || [];
    
    console.log(`\n📋 Processing guild: ${guildName}`);
    
    // Get all existing match IDs for this guild to avoid duplicates
    const { data: existingMatches } = await supabase
      .from('club_matches')
      .select('ea_match_id')
      .eq('guild_id', guildId);
    
    const existingMatchIds = new Set((existingMatches || []).map(m => m.ea_match_id));
    console.log(`  📊 Found ${existingMatchIds.size} existing matches in DB`);
    
    for (const club of clubs) {
      if (!club.enabled || !club.ea_club_id) continue;
      
      const clubName = club.name || club.key;
      const platform = club.ea_platform || 'ps5';
      const clubKey = club.key;
      
      console.log(`\n  ⚽ Fetching matches for ${clubName} (${club.ea_club_id})...`);
      
      try {
        // Fetch all match types
        const allMatches = await fetchAllMatches(club.ea_club_id, platform);
        
        if (!allMatches.length) {
          console.log(`    ⚠️ No matches found from EA API`);
          continue;
        }
        
        // Sort by match ID (higher = more recent) and take last 10
        const sortedMatches = allMatches.sort((a, b) => {
          const idA = parseInt(a.matchId || 0);
          const idB = parseInt(b.matchId || 0);
          return idB - idA;
        }).slice(0, 10);
        
        console.log(`    📥 Processing ${sortedMatches.length} most recent matches...`);
        
        let clubSynced = 0;
        let clubSkipped = 0;
        
        for (const matchData of sortedMatches) {
          const matchId = matchData.matchId?.toString();
          if (!matchId) continue;
          
          // Skip if already exists
          if (existingMatchIds.has(matchId)) {
            clubSkipped++;
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
          
          // Get opponent name from club data
          const opponentName = opponentClubData?.details?.name || opponentClubData?.name || 'Unknown';
          
          // Extract player stats
          const playerStats = [];
          const players = matchData.players?.[club.ea_club_id] || {};
          
          for (const [playerId, pStats] of Object.entries(players)) {
            playerStats.push({
              ea_username: pStats.playername || pStats.name,
              goals: parseInt(pStats.goals || 0),
              assists: parseInt(pStats.assists || 0),
              rating: parseFloat(pStats.rating || 0),
              position: pStats.pos || pStats.position,
              motm: pStats.mom === '1' || pStats.mom === 1,
              shots: parseInt(pStats.shots || 0),
              tackles: parseInt(pStats.tacklesmade || pStats.tackles || 0),
              tackle_attempts: parseInt(pStats.tackleattempts || 0),
              passes_made: parseInt(pStats.passesmade || 0),
              pass_attempts: parseInt(pStats.passattempts || 0),
              red_cards: pStats.redcards === '1' || pStats.redcards === 1,
              saves: parseInt(pStats.saves || 0),
              interceptions: parseInt(pStats.interceptions || 0),
              clearances: parseInt(pStats.clearances || 0),
              dribbles: parseInt(pStats.dribblewon || 0),
              fouls: parseInt(pStats.fouls || 0),
              offsides: parseInt(pStats.offsides || 0),
              archetypeid: pStats.archetypeid || null,
              seconds_played: parseInt(pStats.secondsPlayed || 0),
              saves_diving: parseInt(pStats.savesdiving || 0),
              saves_reflex: parseInt(pStats.savesreflex || 0),
              saves_parry: parseInt(pStats.savesparry || 0),
              saves_cross: parseInt(pStats.savescross || 0),
              saves_punch: parseInt(pStats.savespunch || 0),
              goals_conceded: parseInt(pStats.goalsconceded || 0)
            });
          }
          
          // Determine match type from category
          const matchType = matchData._matchCategory || 'division';
          
          // Insert match
          const { data: insertedMatch, error: matchError } = await supabase
            .from('club_matches')
            .insert({
              guild_id: guildId,
              club_key: clubKey,
              ea_match_id: matchId,
              match_type: matchType,
              result,
              score_for: scoreFor,
              score_against: scoreAgainst,
              opponent_club_name: opponentName,
              opponent_club_id: opponentClubId,
              match_data: matchData,
              player_stats: playerStats
            })
            .select('id')
            .single();
          
          if (matchError) {
            if (matchError.code === '23505') {
              // Duplicate - already exists
              clubSkipped++;
            } else {
              console.log(`    ❌ Error inserting match ${matchId}: ${matchError.message}`);
            }
            continue;
          }
          
          clubSynced++;
          existingMatchIds.add(matchId); // Track to avoid re-processing
          
          // Also insert player_stats for each player
          for (const pStat of playerStats) {
            // Find profile for this EA username
            let { data: profile } = await supabase
              .from('profiles')
              .select('discord_user_id')
              .eq('ea_username', pStat.ea_username)
              .not('discord_user_id', 'like', 'ea_%')
              .maybeSingle();
            
            if (!profile) continue;
            
            // Check if player stats already exist for this match
            const { data: existingStats } = await supabase
              .from('player_stats')
              .select('id')
              .eq('ea_match_id', matchId)
              .eq('discord_user_id', profile.discord_user_id)
              .maybeSingle();
            
            if (existingStats) continue;
            
            // Insert player stats
            await supabase.from('player_stats').insert({
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
              tackle_attempts: pStat.tackle_attempts,
              passes_made: pStat.passes_made,
              pass_attempts: pStat.pass_attempts,
              red_cards: pStat.red_cards,
              interceptions: pStat.interceptions,
              clearances: pStat.clearances,
              dribbles: pStat.dribbles,
              fouls: pStat.fouls,
              offsides: pStat.offsides,
              seconds_played: pStat.seconds_played,
              archetypeid: pStat.archetypeid,
              saves_diving: pStat.saves_diving,
              saves_reflex: pStat.saves_reflex,
              saves_parry: pStat.saves_parry,
              saves_cross: pStat.saves_cross,
              saves_punch: pStat.saves_punch,
              goals_conceded: pStat.goals_conceded
            });
          }
          
          console.log(`    ✅ ${matchType}: ${result} ${scoreFor}-${scoreAgainst} vs ${opponentName}`);
        }
        
        console.log(`    📊 ${clubName}: ${clubSynced} new, ${clubSkipped} already existed`);
        totalSynced += clubSynced;
        totalSkipped += clubSkipped;
        
        // Small delay between clubs to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
        
      } catch (err) {
        console.error(`    ❌ Error fetching matches for ${clubName}:`, err.message);
      }
    }
  }
  
  console.log(`\n✅ Backfill complete: ${totalSynced} new matches synced, ${totalSkipped} duplicates skipped\n`);
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

// Check for command line arguments
const args = process.argv.slice(2);
if (args.includes('--backfill-scouting')) {
  console.log('🚀 Running opponent scouting backfill...');
  backfillOpponentScouting().then(() => {
    console.log('✅ Backfill complete, exiting.');
    process.exit(0);
  });
} else if (args.includes('--backfill-matches')) {
  console.log('🚀 Running match history backfill (last 10 games per club)...');
  backfillMatchHistory().then(() => {
    console.log('✅ Match backfill complete, exiting.');
    process.exit(0);
  });
} else {
  // Run immediately then every 10 minutes
  console.log('🚀 EA Sync Local started');
  console.log('📡 Running from your local IP to bypass EA cloud blocking');
  console.log('⏱️  Syncing every 10 minutes (active 8 AM - 2 AM CT)');
  console.log('💡 Run with --backfill-scouting to backfill opponent intel');
  console.log('💡 Run with --backfill-matches to backfill last 10 games per club\n');
  
  scheduledSync();
  setInterval(scheduledSync, 600000); // 10 minutes = 600,000ms
}
