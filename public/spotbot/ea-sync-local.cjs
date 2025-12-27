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

// Thresholds for tiered linking
const AUTO_LINK_THRESHOLD = 0.75;  // ≥75% = auto-link immediately
const SUGGEST_THRESHOLD = 0.50;    // 50-74% = save as suggestion for review
// <50% = ignore

// Cleanup orphaned temp profiles where EA username is already linked to a real profile
async function cleanupOrphanedProfiles(guildId) {
  console.log(`\n🧹 Cleaning up orphaned temp profiles...`);
  
  // Get all temp ea_ profiles
  const { data: tempProfiles } = await supabase
    .from('profiles')
    .select('id, discord_user_id, ea_username, ea_platform')
    .like('discord_user_id', 'ea_%');
  
  if (!tempProfiles || tempProfiles.length === 0) {
    console.log(`  ✅ No temp profiles found`);
    return { cleaned: 0 };
  }
  
  // Get all real Discord profiles with EA usernames
  const { data: realProfiles } = await supabase
    .from('profiles')
    .select('discord_user_id, discord_username, ea_username')
    .not('discord_user_id', 'like', 'ea_%')
    .not('ea_username', 'is', null);
  
  // Create a map of EA username -> real Discord profile
  const eaToRealMap = new Map();
  for (const profile of (realProfiles || [])) {
    if (profile.ea_username) {
      eaToRealMap.set(profile.ea_username.toLowerCase(), profile);
    }
  }
  
  let cleanedCount = 0;
  
  for (const tempProfile of tempProfiles) {
    const eaUsername = tempProfile.ea_username;
    if (!eaUsername) continue;
    
    // Check if this EA username is already linked to a real profile
    const realProfile = eaToRealMap.get(eaUsername.toLowerCase());
    if (!realProfile) continue;
    
    const tempDiscordId = tempProfile.discord_user_id;
    const realDiscordId = realProfile.discord_user_id;
    
    console.log(`  🔗 Found orphan: ${eaUsername} (temp: ${tempDiscordId} -> real: ${realDiscordId})`);
    
    // Migrate player_stats from temp to real
    const { data: statsToMigrate } = await supabase
      .from('player_stats')
      .select('id')
      .eq('discord_user_id', tempDiscordId);
    
    if (statsToMigrate && statsToMigrate.length > 0) {
      await supabase
        .from('player_stats')
        .update({ discord_user_id: realDiscordId })
        .eq('discord_user_id', tempDiscordId);
      console.log(`    📊 Migrated ${statsToMigrate.length} player_stats records`);
    }
    
    // Migrate player_club_stats
    await supabase
      .from('player_club_stats')
      .update({ discord_user_id: realDiscordId })
      .eq('discord_user_id', tempDiscordId);
    
    // Delete duplicate player_ratings (keep the real one)
    await supabase
      .from('player_ratings')
      .delete()
      .eq('discord_user_id', tempDiscordId);
    
    // Delete duplicate player_summary (keep the real one)
    await supabase
      .from('player_summary')
      .delete()
      .eq('discord_user_id', tempDiscordId);
    
    // Delete the orphaned temp profile
    await supabase
      .from('profiles')
      .delete()
      .eq('discord_user_id', tempDiscordId);
    
    console.log(`    ✅ Cleaned up orphan: ${eaUsername}`);
    cleanedCount++;
  }
  
  console.log(`  📊 Cleaned up ${cleanedCount} orphaned temp profiles`);
  return { cleaned: cleanedCount };
}

// Retroactively match existing unlinked ea_ profiles to Discord members
// Now with tiered thresholds and suggestion persistence
// Matches against ALL Discord members (not just unlinked) to find potential links
async function retroMatchUnlinkedProfiles(guildId) {
  console.log(`\n🔄 Checking for unlinked EA profiles to auto-match...`);
  
  // First, cleanup orphaned profiles (where EA is already linked to real profile)
  await cleanupOrphanedProfiles(guildId);
  
  // Get remaining temp ea_ profiles for this guild
  const { data: tempProfiles } = await supabase
    .from('profiles')
    .select('id, discord_user_id, ea_username, ea_platform')
    .like('discord_user_id', 'ea_%');
  
  if (!tempProfiles || tempProfiles.length === 0) {
    console.log(`  ✅ No unlinked EA profiles found`);
    return { matched: 0, suggested: 0, total: 0 };
  }
  
  console.log(`  📋 Found ${tempProfiles.length} unlinked EA profiles`);
  
  // Get ALL real Discord members (for suggestions we can suggest linking to members 
  // who already have a different EA username - they might want to switch)
  const { data: allDiscordMembers } = await supabase
    .from('profiles')
    .select('discord_user_id, discord_username, ea_username')
    .not('discord_user_id', 'like', 'ea_%');
  
  // Separate linked and unlinked members
  const unlinkedMembers = (allDiscordMembers || []).filter(m => !m.ea_username && m.discord_username);
  const linkedMembers = (allDiscordMembers || []).filter(m => m.ea_username && m.discord_username);
  
  console.log(`  👥 Discord members: ${unlinkedMembers.length} unlinked, ${linkedMembers.length} linked`);

  // Get previously rejected suggestions to skip
  const { data: rejectedSuggestions } = await supabase
    .from('link_suggestions')
    .select('ea_username, suggested_discord_id')
    .eq('guild_id', guildId)
    .eq('status', 'rejected');

  const rejectedCombos = new Set(
    (rejectedSuggestions || []).map(s => `${s.ea_username}:${s.suggested_discord_id}`)
  );
  
  let matchedCount = 0;
  let suggestedCount = 0;
  
  for (const tempProfile of tempProfiles) {
    const eaUsername = tempProfile.ea_username;
    if (!eaUsername) continue;
    
    const normalizedEa = normalizeUsername(eaUsername);
    const tempDiscordId = tempProfile.discord_user_id;
    
    // First try to match against unlinked members (for auto-link)
    let matchedMember = null;
    let bestSimilarity = 0;
    let isExactMatch = false;
    
    if (unlinkedMembers.length > 0) {
      const usernames = unlinkedMembers.map(m => m.discord_username).filter(Boolean);
      
      // Try exact normalized match first
      matchedMember = unlinkedMembers.find(
        m => m.discord_username && normalizeUsername(m.discord_username) === normalizedEa
      );
      
      if (matchedMember) {
        bestSimilarity = 1.0;
        isExactMatch = true;
      } else if (usernames.length > 0) {
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
        bestSimilarity = bestMatch.bestMatch.rating;
        
        if (bestSimilarity >= SUGGEST_THRESHOLD) {
          matchedMember = unlinkedMembers.find(
            m => m.discord_username?.toLowerCase() === bestMatch.bestMatch.target || 
                 normalizeUsername(m.discord_username) === bestMatch.bestMatch.target
          );
        }
      }
    }
    
    // If no match found in unlinked, also check linked members for SUGGESTIONS only
    // (they might want to switch their EA account)
    if (!matchedMember && linkedMembers.length > 0) {
      const linkedUsernames = linkedMembers.map(m => m.discord_username).filter(Boolean);
      
      // Try exact normalized match
      let potentialMatch = linkedMembers.find(
        m => m.discord_username && normalizeUsername(m.discord_username) === normalizedEa
      );
      
      if (potentialMatch) {
        // Don't auto-link, but save as high-confidence suggestion
        bestSimilarity = 0.74; // Just below auto-link threshold
        matchedMember = potentialMatch;
      } else if (linkedUsernames.length > 0) {
        const rawMatch = stringSimilarity.findBestMatch(
          eaUsername.toLowerCase(), 
          linkedUsernames.map(u => u.toLowerCase())
        );
        const normalizedMatch = stringSimilarity.findBestMatch(
          normalizedEa, 
          linkedUsernames.map(u => normalizeUsername(u))
        );
        
        const bestMatch = rawMatch.bestMatch.rating >= normalizedMatch.bestMatch.rating ? rawMatch : normalizedMatch;
        
        if (bestMatch.bestMatch.rating >= SUGGEST_THRESHOLD) {
          matchedMember = linkedMembers.find(
            m => m.discord_username?.toLowerCase() === bestMatch.bestMatch.target || 
                 normalizeUsername(m.discord_username) === bestMatch.bestMatch.target
          );
          // Cap at suggestion threshold for linked members (never auto-link)
          bestSimilarity = Math.min(bestMatch.bestMatch.rating, 0.74);
        }
      }
    }
    
    // Skip if no match found
    if (!matchedMember || bestSimilarity < SUGGEST_THRESHOLD) continue;
    
    const realDiscordId = matchedMember.discord_user_id;
    const isLinkedMember = !!matchedMember.ea_username;
    
    // Skip if this combo was previously rejected
    if (rejectedCombos.has(`${eaUsername}:${realDiscordId}`)) {
      console.log(`  ⏭️ Skipping rejected: ${eaUsername} -> ${matchedMember.discord_username}`);
      continue;
    }
    
    // HIGH CONFIDENCE (≥75% or exact) AND unlinked member: Auto-link immediately
    if ((bestSimilarity >= AUTO_LINK_THRESHOLD || isExactMatch) && !isLinkedMember) {
      console.log(`  🎯 Auto-linking: ${eaUsername} -> ${matchedMember.discord_username} (${(bestSimilarity * 100).toFixed(0)}%)`);
      
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
      
      // Migrate player_club_stats
      await supabase
        .from('player_club_stats')
        .update({ discord_user_id: realDiscordId })
        .eq('discord_user_id', tempDiscordId);
      
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
    // MEDIUM CONFIDENCE (50-74%) OR linked member: Save as suggestion for admin review
    else {
      const note = isLinkedMember ? ` (already linked to ${matchedMember.ea_username})` : '';
      console.log(`  💡 Suggesting: ${eaUsername} -> ${matchedMember.discord_username} (${(bestSimilarity * 100).toFixed(0)}%)${note}`);
      
      // Check if suggestion already exists
      const { data: existingSuggestion } = await supabase
        .from('link_suggestions')
        .select('id, status')
        .eq('guild_id', guildId)
        .eq('ea_username', eaUsername)
        .eq('suggested_discord_id', realDiscordId)
        .maybeSingle();
      
      if (!existingSuggestion) {
        // Create new suggestion
        await supabase
          .from('link_suggestions')
          .insert({
            guild_id: guildId,
            temp_profile_id: tempProfile.id,
            ea_username: eaUsername,
            suggested_discord_id: realDiscordId,
            suggested_discord_name: matchedMember.discord_username,
            similarity_score: bestSimilarity,
            status: 'pending'
          });
        
        suggestedCount++;
        console.log(`  📝 Saved suggestion for review`);
      } else {
        console.log(`  ℹ️ Suggestion already exists (${existingSuggestion.status})`);
      }
    }
  }
  
  console.log(`  📊 Results: ${matchedCount} auto-linked, ${suggestedCount} suggested for review (of ${tempProfiles.length} profiles)`);
  return { matched: matchedCount, suggested: suggestedCount, total: tempProfiles.length };
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

// === ROTATING USER-AGENT POOL ===
// Rotate through realistic browser strings to avoid fingerprinting
const USER_AGENT_POOL = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  // Firefox on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  // Safari on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

let currentUserAgentIndex = 0;

function getNextUserAgent() {
  const ua = USER_AGENT_POOL[currentUserAgentIndex];
  currentUserAgentIndex = (currentUserAgentIndex + 1) % USER_AGENT_POOL.length;
  return ua;
}

function getRandomUserAgent() {
  return USER_AGENT_POOL[Math.floor(Math.random() * USER_AGENT_POOL.length)];
}

// === EXPONENTIAL BACKOFF ERROR TRACKING ===
const errorTracking = {
  consecutiveErrors: 0,
  consecutive403Errors: 0,
  lastErrorTime: 0,
  backoffMs: 0,
  totalRequestsToday: 0,
  dayStartTime: Date.now()
};

// Backoff levels: 10s, 30s, 2min, 5min, 15min pause
const BACKOFF_LEVELS = [10000, 30000, 120000, 300000, 900000];

function getBackoffDelay() {
  const level = Math.min(errorTracking.consecutiveErrors, BACKOFF_LEVELS.length - 1);
  return BACKOFF_LEVELS[level];
}

async function applyBackoff() {
  if (errorTracking.consecutiveErrors === 0) return;
  
  const delay = getBackoffDelay();
  console.log(`⏳ Backoff: waiting ${(delay / 1000).toFixed(0)}s after ${errorTracking.consecutiveErrors} consecutive errors...`);
  await new Promise(r => setTimeout(r, delay));
}

function recordSuccess() {
  if (errorTracking.consecutiveErrors > 0) {
    console.log(`✅ Request succeeded - resetting error counter (was ${errorTracking.consecutiveErrors})`);
  }
  errorTracking.consecutiveErrors = 0;
  errorTracking.consecutive403Errors = 0;
  errorTracking.backoffMs = 0;
  errorTracking.totalRequestsToday++;
}

function recordError(statusCode) {
  errorTracking.consecutiveErrors++;
  errorTracking.lastErrorTime = Date.now();
  
  if (statusCode === 403) {
    errorTracking.consecutive403Errors++;
    console.log(`⚠️ 403 error #${errorTracking.consecutive403Errors} (total errors: ${errorTracking.consecutiveErrors})`);
  }
  
  // Check for stale cookie
  if (errorTracking.consecutive403Errors >= 3) {
    console.log(`\n🍪❌ STALE COOKIE DETECTED: ${errorTracking.consecutive403Errors} consecutive 403 errors`);
    console.log(`   Your EA session cookie may have expired.`);
    console.log(`   Please refresh EA_SESSION_COOKIE from browser DevTools.\n`);
  }
}

function shouldPauseDueToErrors() {
  // Pause for 15 minutes after 5+ consecutive errors
  return errorTracking.consecutiveErrors >= 5;
}

// === PERSISTENT CACHE LAYER ===
// Cache with timestamps for freshness checking
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(process.cwd(), '.ea-cache');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE_MB = 50; // Max cache size before auto-cleanup
const CACHE_MAX_FILES = 500; // Max number of cache files
const CACHE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // Auto-cleanup every 30 minutes
const GC_INTERVAL_MS = 60 * 60 * 1000; // Force garbage collection hint every hour

// Track cache stats
const cacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  cleanups: 0,
  lastCleanup: 0,
  lastGC: 0
};

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheFilePath(type, key) {
  ensureCacheDir();
  return path.join(CACHE_DIR, `${type}_${key.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
}

// Get cache directory size in MB
function getCacheSizeMB() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return 0;
    
    const files = fs.readdirSync(CACHE_DIR);
    let totalSize = 0;
    
    for (const file of files) {
      try {
        const stats = fs.statSync(path.join(CACHE_DIR, file));
        totalSize += stats.size;
      } catch (e) {
        // File may have been deleted
      }
    }
    
    return totalSize / (1024 * 1024);
  } catch (err) {
    return 0;
  }
}

// Get number of cache files
function getCacheFileCount() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return 0;
    return fs.readdirSync(CACHE_DIR).length;
  } catch (err) {
    return 0;
  }
}

// Clean up expired cache files
function cleanupExpiredCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return { removed: 0 };
    
    const files = fs.readdirSync(CACHE_DIR);
    let removed = 0;
    const now = Date.now();
    
    for (const file of files) {
      try {
        const filePath = path.join(CACHE_DIR, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const age = now - content.timestamp;
        
        // Remove if expired (older than 2x TTL for extra buffer)
        if (age > CACHE_TTL_MS * 2) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (e) {
        // If we can't read it, remove it
        try {
          fs.unlinkSync(path.join(CACHE_DIR, file));
          removed++;
        } catch (e2) {}
      }
    }
    
    return { removed };
  } catch (err) {
    return { removed: 0, error: err.message };
  }
}

// Clean up oldest cache files to stay under limits
function cleanupOldestCacheFiles(targetRemoval = 100) {
  try {
    if (!fs.existsSync(CACHE_DIR)) return { removed: 0 };
    
    const files = fs.readdirSync(CACHE_DIR);
    const fileStats = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(CACHE_DIR, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        fileStats.push({
          file,
          path: filePath,
          timestamp: content.timestamp || 0
        });
      } catch (e) {
        // If we can't read it, mark it for removal with old timestamp
        fileStats.push({
          file,
          path: path.join(CACHE_DIR, file),
          timestamp: 0
        });
      }
    }
    
    // Sort by timestamp (oldest first) and remove oldest files
    fileStats.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = fileStats.slice(0, Math.min(targetRemoval, fileStats.length));
    
    let removed = 0;
    for (const item of toRemove) {
      try {
        fs.unlinkSync(item.path);
        removed++;
      } catch (e) {}
    }
    
    return { removed };
  } catch (err) {
    return { removed: 0, error: err.message };
  }
}

// Automatic cache maintenance - call periodically
function runCacheMaintenance(force = false) {
  const now = Date.now();
  
  // Skip if ran recently (unless forced)
  if (!force && (now - cacheStats.lastCleanup) < CACHE_CLEANUP_INTERVAL_MS) {
    return;
  }
  
  console.log('\n🧹 Running cache maintenance...');
  cacheStats.lastCleanup = now;
  cacheStats.cleanups++;
  
  // 1. Remove expired cache files
  const expiredResult = cleanupExpiredCache();
  if (expiredResult.removed > 0) {
    console.log(`   ♻️  Removed ${expiredResult.removed} expired cache files`);
  }
  
  // 2. Check size and file count limits
  const sizeMB = getCacheSizeMB();
  const fileCount = getCacheFileCount();
  
  console.log(`   📊 Cache: ${sizeMB.toFixed(2)} MB, ${fileCount} files`);
  
  // 3. Clean up if over limits
  if (sizeMB > CACHE_MAX_SIZE_MB || fileCount > CACHE_MAX_FILES) {
    console.log(`   ⚠️  Cache over limits (max: ${CACHE_MAX_SIZE_MB}MB / ${CACHE_MAX_FILES} files)`);
    const oldestResult = cleanupOldestCacheFiles(Math.ceil(fileCount * 0.3)); // Remove ~30%
    console.log(`   🗑️  Removed ${oldestResult.removed} oldest cache files`);
  }
  
  // 4. Log cache stats
  const hitRate = cacheStats.hits + cacheStats.misses > 0 
    ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)
    : '0';
  console.log(`   📈 Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses (${hitRate}% hit rate)`);
  console.log('');
}

// Force garbage collection hint (if available)
function forceGarbageCollection() {
  const now = Date.now();
  
  // Skip if ran recently
  if ((now - cacheStats.lastGC) < GC_INTERVAL_MS) {
    return;
  }
  
  cacheStats.lastGC = now;
  
  // Get memory usage before
  const memBefore = process.memoryUsage();
  
  // Clear in-memory caches
  apiCache.clubInfo.clear();
  apiCache.clubMembers.clear();
  apiCache.matches.clear();
  apiCache.scoutedOpponents.clear();
  
  // Hint to Node.js to run GC (only works if --expose-gc flag is used)
  if (global.gc) {
    try {
      global.gc();
      const memAfter = process.memoryUsage();
      const freedMB = ((memBefore.heapUsed - memAfter.heapUsed) / (1024 * 1024)).toFixed(2);
      console.log(`🧹 GC: Freed ${freedMB} MB (heap: ${(memAfter.heapUsed / 1024 / 1024).toFixed(1)} MB)`);
    } catch (e) {
      console.log('⚠️  GC hint failed:', e.message);
    }
  } else {
    // Even without --expose-gc, clearing caches helps
    const memAfter = process.memoryUsage();
    console.log(`🧹 Memory: ${(memAfter.heapUsed / 1024 / 1024).toFixed(1)} MB heap used`);
  }
}

// Log memory usage
function logMemoryUsage() {
  const mem = process.memoryUsage();
  console.log(`💾 Memory: heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)}/${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB, RSS ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
}

function getFromPersistentCache(type, key) {
  try {
    const filePath = getCacheFilePath(type, key);
    if (!fs.existsSync(filePath)) {
      cacheStats.misses++;
      return null;
    }
    
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const age = Date.now() - content.timestamp;
    
    if (age > CACHE_TTL_MS) {
      // Cache expired
      cacheStats.misses++;
      return null;
    }
    
    cacheStats.hits++;
    console.log(`📦 Cache hit: ${type}/${key} (${(age / 1000).toFixed(0)}s old)`);
    return content.data;
  } catch (err) {
    cacheStats.misses++;
    return null;
  }
}

function saveToPersistentCache(type, key, data) {
  try {
    const filePath = getCacheFilePath(type, key);
    fs.writeFileSync(filePath, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
    cacheStats.writes++;
  } catch (err) {
    console.log(`⚠️ Failed to write cache: ${err.message}`);
  }
}

function clearPersistentCache() {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
      console.log(`🧹 Cleared ${files.length} cached files`);
      
      // Reset stats
      cacheStats.hits = 0;
      cacheStats.misses = 0;
      cacheStats.writes = 0;
    }
  } catch (err) {
    console.log(`⚠️ Failed to clear cache: ${err.message}`);
  }
}

// === API CALL CACHE (in-memory for current cycle) ===
const apiCache = {
  clubInfo: new Map(),
  clubMembers: new Map(),
  matches: new Map(),
  scoutedOpponents: new Set(),
  lastReset: 0
};

function resetApiCache() {
  apiCache.clubInfo.clear();
  apiCache.clubMembers.clear();
  apiCache.matches.clear();
  apiCache.scoutedOpponents.clear();
  apiCache.lastReset = Date.now();
  // Don't clear persistent cache - let TTL handle expiration
  console.log('🔄 In-memory API cache cleared for new sync cycle');
}

// === ENHANCED REQUEST JITTER ===
// More variable delays to appear human-like
async function humanDelay(minMs = 3000, maxMs = 8000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  await new Promise(r => setTimeout(r, delay));
}

// Occasional "reading time" - longer pauses simulating user reading data
async function occasionalReadingPause() {
  // 20% chance of a longer "reading" pause
  if (Math.random() < 0.2) {
    const readTime = Math.floor(Math.random() * 15000) + 15000; // 15-30 seconds
    console.log(`👀 Simulating reading pause (${(readTime / 1000).toFixed(0)}s)...`);
    await new Promise(r => setTimeout(r, readTime));
  }
}

// Longer delay between clubs with more variance
async function clubDelay() {
  const delay = Math.floor(Math.random() * 8000) + 7000; // 7-15 seconds
  console.log(`⏳ Waiting ${(delay / 1000).toFixed(1)}s between clubs...`);
  await new Promise(r => setTimeout(r, delay));
}

// Delay between different request types within same club
async function requestTypeDelay() {
  const delay = Math.floor(Math.random() * 5000) + 8000; // 8-13 seconds
  await new Promise(r => setTimeout(r, delay));
}

// EA Session Cookie from environment
const EA_SESSION_COOKIE = process.env.EA_SESSION_COOKIE || '';

// Track consecutive 403 errors for edge function fallback
let consecutive403Errors = 0;
let useEdgeFallback = false;

// Build EA headers with rotating user-agent
function buildEAHeaders() {
  return {
    'accept': 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://www.ea.com',
    'referer': 'https://www.ea.com/',
    'sec-ch-ua': '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent': getNextUserAgent(),
    ...(EA_SESSION_COOKIE && { 'cookie': EA_SESSION_COOKIE })
  };
}

// Static headers for backward compatibility (uses rotating UA internally)
const EA_HEADERS = buildEAHeaders();

if (EA_SESSION_COOKIE) {
  console.log('🍪 EA session cookie configured');
  console.log(`🔄 User-Agent pool: ${USER_AGENT_POOL.length} browsers`);
  console.log(`⏱️  Backoff levels: ${BACKOFF_LEVELS.map(ms => `${ms/1000}s`).join(' → ')}`);
} else {
  console.log('⚠️ No EA_SESSION_COOKIE set - may get 403 errors');
}

// Call the Supabase edge function as fallback when local EA calls fail
async function callEdgeFunctionSync(guildId, clubKey, clubId, platform) {
  console.log(`🌐 Calling edge function fallback for ${clubKey}...`);
  
  try {
    const res = await axios.post(`${supabaseUrl}/functions/v1/sync-ea-stats`, {
      sync_type: 'single_club',
      guild_id: guildId,
      club_key: clubKey,
      club_id: clubId,
      platform: platform
    }, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
    
    console.log(`✅ Edge function sync completed for ${clubKey}`);
    return res.data;
  } catch (err) {
    console.error(`❌ Edge function fallback failed: ${err.message}`);
    return null;
  }
}

// Fetch matches for a specific match type
// EA API uses 'matchType' param with string values like 'leagueMatch', 'playoffMatch'
async function fetchMatchesByType(clubId, platform, matchType) {
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  // Check persistent cache first
  const cacheKey = `${clubId}_${matchType}`;
  const cachedData = getFromPersistentCache('matches', cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  // Apply backoff if we've had errors
  await applyBackoff();
  
  // Check if we should pause due to too many errors
  if (shouldPauseDueToErrors()) {
    console.log(`🛑 Too many errors (${errorTracking.consecutiveErrors}) - pausing for 15 minutes...`);
    await new Promise(r => setTimeout(r, 900000)); // 15 min pause
    errorTracking.consecutiveErrors = 0; // Reset after pause
  }
  
  try {
    await humanDelay(); // Add human-like delay before API call
    console.log(`[EA] Fetching ${matchType} matches for club ${clubId}...`);
    
    // Use fresh headers with rotating user-agent
    const headers = buildEAHeaders();
    
    const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/matches', {
      params: { platform: fcPlatform, clubIds: clubId, matchType: matchType, maxResultCount: 20 },
      headers: headers,
      timeout: 15000
    });
    
    // Record success
    recordSuccess();
    
    if (res.status !== 200) {
      return [];
    }
    
    let matches = res.data;
    
    // Handle different response formats
    if (Array.isArray(matches)) {
      // Cache and return
      saveToPersistentCache('matches', cacheKey, matches);
      return matches;
    } else if (matches?.matches && Array.isArray(matches.matches)) {
      saveToPersistentCache('matches', cacheKey, matches.matches);
      return matches.matches;
    } else {
      // Some responses have matches keyed by match ID
      const vals = Object.values(matches).filter(v => v && typeof v === 'object' && (v.matchId || v.timestamp));
      saveToPersistentCache('matches', cacheKey, vals);
      return vals;
    }
  } catch (err) {
    const status = err.response?.status;
    console.log(`[EA] Failed to fetch ${matchType} matches (${status || 'network'}): ${err.message}`);
    
    // Track error with enhanced tracking
    recordError(status);
    
    // Track 403 errors for fallback
    if (status === 403) {
      consecutive403Errors++;
      if (consecutive403Errors >= 2) {
        console.log(`⚠️ ${consecutive403Errors} consecutive 403 errors - switching to edge function fallback`);
        useEdgeFallback = true;
      }
    }
    
    return [];
  }
}

async function fetchAllMatchesFromEA(clubId, platform) {
  // Check in-memory cache first
  if (apiCache.matches.has(clubId)) {
    console.log(`[EA] Using cached matches for club ${clubId}`);
    return apiCache.matches.get(clubId);
  }
  
  // Check persistent cache
  const cachedData = getFromPersistentCache('allMatches', clubId);
  if (cachedData) {
    apiCache.matches.set(clubId, cachedData);
    return cachedData;
  }
  
  console.log(`[EA] Fetching all match types for club ${clubId}...`);
  
  // EA API matchType string values (from working implementations)
  // REQUEST BATCHING: Fetch one type at a time with delays between
  const matchTypeConfigs = [
    { matchType: 'leagueMatch', category: 'division' },
    { matchType: 'playoffMatch', category: 'competition' },
    { matchType: 'friendlyMatch', category: 'friendly' }
  ];
  const allMatches = [];
  
  for (let i = 0; i < matchTypeConfigs.length; i++) {
    const { matchType, category } = matchTypeConfigs[i];
    
    // Add delay between different match types (request batching)
    if (i > 0) {
      await requestTypeDelay();
    }
    
    const matches = await fetchMatchesByType(clubId, platform, matchType);
    if (matches.length > 0) {
      console.log(`[EA] ✓ Got ${matches.length} ${matchType} (${category}) matches`);
      // Tag matches with their category
      matches.forEach(m => m._matchCategory = category);
      allMatches.push(...matches);
    }
    
    // Occasional reading pause after fetching data
    await occasionalReadingPause();
  }
  
  console.log(`[EA] ✓ Total: ${allMatches.length} matches across all types`);
  
  // Cache the result (both in-memory and persistent)
  apiCache.matches.set(clubId, allMatches);
  saveToPersistentCache('allMatches', clubId, allMatches);
  return allMatches;
}

// Categorize matches by type based on matchType field in the response data
function categorizeMatches(matches) {
  const division = [];
  const cup = [];
  const friendly = [];
  
  for (const match of matches) {
    const matchType = match.matchType || match.gameType || '';
    const matchTypeStr = String(matchType).toLowerCase();
    
    // Tag with category for later use
    if (matchTypeStr.includes('league') || matchTypeStr === 'matchtype9' || matchTypeStr === '9') {
      match._matchCategory = 'division';
      division.push(match);
    } else if (matchTypeStr.includes('playoff') || matchTypeStr.includes('cup') || matchTypeStr === 'matchtype13' || matchTypeStr === '13') {
      match._matchCategory = 'competition';
      cup.push(match);
    } else if (matchTypeStr.includes('friendly') || matchTypeStr === 'matchtype22' || matchTypeStr === '22') {
      match._matchCategory = 'friendly';
      friendly.push(match);
    } else {
      // Unknown type - default to division (rivals) since that's most common
      console.log(`[EA] Unknown matchType: "${matchType}", defaulting to division`);
      match._matchCategory = 'division';
      division.push(match);
    }
  }
  
  console.log(`[EA] Categorized: ${division.length} division, ${cup.length} cup, ${friendly.length} friendly`);
  return { division, cup, friendly };
}

// Fetch ALL match types and return combined array
async function fetchAllMatches(clubId, platform) {
  const allMatches = await fetchAllMatchesFromEA(clubId, platform);
  
  if (allMatches.length === 0) {
    console.log(`[EA] No matches returned from EA API`);
    return [];
  }
  
  // Categorize but return all matches combined
  categorizeMatches(allMatches);
  return allMatches;
}

// Legacy function for backward compatibility
async function fetchMatches(clubId, platform) {
  return fetchAllMatches(clubId, platform);
}

// Fetch club info - now with enhanced caching, error tracking, and rotating UA
async function fetchClubInfo(clubId, platform) {
  // Check in-memory cache first
  if (apiCache.clubInfo.has(clubId)) {
    console.log(`[EA] Using cached club info for ${clubId}`);
    return apiCache.clubInfo.get(clubId);
  }
  
  // Check persistent cache
  const cachedData = getFromPersistentCache('clubInfo', clubId);
  if (cachedData) {
    apiCache.clubInfo.set(clubId, cachedData);
    return cachedData;
  }
  
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  // Apply backoff if we've had errors
  await applyBackoff();
  
  // Check if we should pause
  if (shouldPauseDueToErrors()) {
    console.log(`🛑 Too many errors - pausing for 15 minutes...`);
    await new Promise(r => setTimeout(r, 900000));
    errorTracking.consecutiveErrors = 0;
  }
  
  try {
    await humanDelay();
    
    // Use fresh headers with rotating user-agent
    const headers = buildEAHeaders();
    
    const res = await axios.get('https://proclubs.ea.com/api/fc/clubs/info', {
      params: { platform: fcPlatform, clubIds: clubId },
      headers: headers,
      timeout: 10000
    });
    
    // Record success
    recordSuccess();
    
    if (res.status !== 200) {
      apiCache.clubInfo.set(clubId, null);
      return null;
    }
    
    const data = res.data;
    let result = null;
    if (Array.isArray(data) && data.length > 0) result = data[0];
    else if (data[clubId]) result = data[clubId];
    else result = data;
    
    // Cache both in-memory and persistent
    apiCache.clubInfo.set(clubId, result);
    saveToPersistentCache('clubInfo', clubId, result);
    return result;
  } catch (err) {
    const status = err.response?.status;
    console.error(`[EA] Club info error:`, err.message);
    
    // Track error with enhanced tracking
    recordError(status);
    
    // Track 403 errors for fallback
    if (status === 403) {
      consecutive403Errors++;
      if (consecutive403Errors >= 2) {
        console.log(`⚠️ ${consecutive403Errors} consecutive 403 errors - switching to edge function fallback`);
        useEdgeFallback = true;
      }
    }
    
    apiCache.clubInfo.set(clubId, null);
    return null;
  }
}

// Fetch club members - now with enhanced caching, error tracking, and rotating UA
async function fetchClubMembers(clubId, platform) {
  // Check in-memory cache first
  if (apiCache.clubMembers.has(clubId)) {
    console.log(`[EA] Using cached members for club ${clubId}`);
    return apiCache.clubMembers.get(clubId);
  }
  
  // Check persistent cache
  const cachedData = getFromPersistentCache('clubMembers', clubId);
  if (cachedData) {
    apiCache.clubMembers.set(clubId, cachedData);
    return cachedData;
  }
  
  const fcPlatform = EA_PLATFORM_MAP[platform] || platform;
  
  // Apply backoff if we've had errors
  await applyBackoff();
  
  // Check if we should pause
  if (shouldPauseDueToErrors()) {
    console.log(`🛑 Too many errors - pausing for 15 minutes...`);
    await new Promise(r => setTimeout(r, 900000));
    errorTracking.consecutiveErrors = 0;
  }
  
  try {
    await humanDelay();
    
    // Use fresh headers with rotating user-agent
    const headers = buildEAHeaders();
    
    const res = await axios.get('https://proclubs.ea.com/api/fc/members/stats', {
      params: { platform: fcPlatform, clubId },
      headers: headers,
      timeout: 10000
    });
    
    // Record success
    recordSuccess();
    
    if (res.status !== 200) {
      apiCache.clubMembers.set(clubId, []);
      return [];
    }
    
    const data = res.data;
    let result = [];
    if (data?.members) result = data.members;
    else if (Array.isArray(data)) result = data;
    else result = Object.values(data).filter(v => v && typeof v === 'object');
    
    // Cache both in-memory and persistent
    apiCache.clubMembers.set(clubId, result);
    saveToPersistentCache('clubMembers', clubId, result);
    return result;
  } catch (err) {
    const status = err.response?.status;
    console.error(`[EA] Club members error:`, err.message);
    
    // Track error with enhanced tracking
    recordError(status);
    
    // Track 403 errors for fallback
    if (status === 403) {
      consecutive403Errors++;
      if (consecutive403Errors >= 2) {
        console.log(`⚠️ ${consecutive403Errors} consecutive 403 errors - switching to edge function fallback`);
        useEdgeFallback = true;
      }
    }
    
    apiCache.clubMembers.set(clubId, []);
    return [];
  }
}

// Auto-scout opponent club and store their player data
// Now with caching to avoid scouting same opponent multiple times per cycle
async function scoutOpponentClub(guildId, opponentClubId, platform, incrementTimesFaced = false) {
  if (!opponentClubId) return { scouted: 0 };
  
  // Skip if already scouted this sync cycle
  const cacheKey = `${guildId}:${opponentClubId}`;
  if (apiCache.scoutedOpponents.has(cacheKey)) {
    console.log(`  ⏭️ Already scouted opponent ${opponentClubId} this cycle, skipping...`);
    return { scouted: 0, skipped: true };
  }
  
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
  
  // Mark as scouted for this cycle to avoid duplicate calls
  apiCache.scoutedOpponents.add(cacheKey);
  
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
// Optimized to skip processing early if all matches are already synced
async function syncMatches(guildId, clubKey, club) {
  const matches = await fetchMatches(club.ea_club_id, club.ea_platform);
  
  if (!matches.length) {
    console.log(`⚠️ No matches found for ${club.name}`);
    return { synced: 0, skipped: 0, playerStats: 0, updatedPlayerIds: [] };
  }
  
  // Process last 50 matches for comprehensive history
  const last50Matches = matches.slice(0, 50);
  
  // Get existing match IDs from club_matches
  const { data: existingMatches } = await supabase
    .from('club_matches')
    .select('ea_match_id')
    .eq('guild_id', guildId)
    .eq('club_key', clubKey);
  
  const existingMatchIds = new Set((existingMatches || []).map(m => m.ea_match_id));
  
  // Early exit: if all matches already exist, skip processing entirely
  const matchIds = last50Matches.map(m => m.matchId?.toString()).filter(Boolean);
  const newMatchIds = matchIds.filter(id => !existingMatchIds.has(id));
  
  if (newMatchIds.length === 0) {
    console.log(`⏭️ All ${last50Matches.length} matches already synced for ${club.name}, skipping...`);
    return { synced: 0, skipped: last50Matches.length, playerStats: 0, updatedPlayerIds: [] };
  }
  
  console.log(`📊 Processing ${newMatchIds.length} new matches (${last50Matches.length - newMatchIds.length} already synced) for ${club.name}`);
  
  // Get existing player stats by ea_match_id for deduplication (only for new matches)
  const { data: existingPlayerStats } = await supabase
    .from('player_stats')
    .select('ea_match_id, discord_user_id')
    .eq('guild_id', guildId)
    .in('ea_match_id', newMatchIds);
  
  const existingPlayerStatsSet = new Set(
    (existingPlayerStats || []).map(s => `${s.ea_match_id}:${s.discord_user_id}`)
  );
  
  let synced = 0, skipped = 0, playerStatsCount = 0;
  const updatedPlayerIds = []; // Track players who got new stats
  
  // Only process new matches (not in existingMatchIds)
  const newMatches = last50Matches.filter(m => !existingMatchIds.has(m.matchId?.toString()));
  
  for (const matchData of newMatches) {
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
    
    // Insert match in club_matches (we already filtered to only new matches)
    let clubMatchId = null;
    
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
      // Could be duplicate - skip silently
      if (matchError.code === '23505') {
        skipped++;
        continue;
      }
      console.error(`[DB] Match insert error:`, matchError.message);
      continue;
    }
    
    clubMatchId = insertedMatch.id;
    synced++;
    console.log(`✅ New match ${matchId}: ${result} ${scoreFor}-${scoreAgainst}`);
    
    // Auto-scout opponent club when new match is detected (uses cache to avoid duplicate calls)
    if (opponentClubId) {
      await scoutOpponentClub(guildId, opponentClubId, club.ea_platform, true);
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
    // We know this is a new match since we pre-filtered the list
    if (clubMatchId && matchPlayerIds.length >= 2) {
      const { data: feedbackSettings } = await supabase
        .from('guild_settings')
        .select('feedback_enabled')
        .eq('guild_id', guildId)
        .single();
      
      // Skip if feedback is disabled
      if (feedbackSettings && feedbackSettings.feedback_enabled === false) {
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
  
  // Reset API cache and fallback state at start of each sync cycle
  resetApiCache();
  consecutive403Errors = 0;
  useEdgeFallback = false;
  
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
      
      // Check if we should use edge function fallback
      if (useEdgeFallback) {
        console.log(`🌐 Using edge function fallback for ${club.name}`);
        const result = await callEdgeFunctionSync(settings.guild_id, club.key, club.ea_club_id, club.ea_platform);
        if (result) {
          console.log(`✅ Edge function synced ${club.name}`);
          clubsSynced++;
        } else {
          console.log(`⚠️ Edge function failed for ${club.name}`);
        }
        // Add delay between clubs
        await clubDelay();
        continue;
      }
      
      // Sync club stats
      await syncClubStats(settings.guild_id, club.key, club.ea_club_id, club.ea_platform);
      clubsSynced++;
      
      // Add delay between clubs to avoid rate limiting
      if (enabledClubs.indexOf(club) < enabledClubs.length - 1) {
        await clubDelay();
      }
      
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

// Check if current time is within active hours (9 AM - 3 AM Central Time)
function isActiveHours() {
  // Get current time in Central Time
  const now = new Date();
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const hour = centralTime.getHours();
  
  // Active from 9 AM (9) to 3 AM (3) next day
  // So we're INACTIVE only between 3 AM and 9 AM (hours 3-8)
  return hour >= 9 || hour < 3;
}

// Run sync if within active hours
function scheduledSync() {
  // Run maintenance tasks first
  runCacheMaintenance();
  forceGarbageCollection();
  
  if (isActiveHours()) {
    runSync();
  } else {
    const now = new Date();
    const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    console.log(`\n💤 Outside active hours (${centralTime.toLocaleTimeString()}). Syncing resumes at 9 AM CT.\n`);
    
    // During inactive hours, do aggressive cleanup
    console.log('🧹 Running aggressive cleanup during inactive hours...');
    runCacheMaintenance(true);
    forceGarbageCollection();
    logMemoryUsage();
  }
}

// Handle uncaught errors to keep running
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err.message);
  console.error(err.stack);
  // Don't exit - try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - try to keep running
});

// Periodic health check and maintenance (every 5 minutes)
function healthCheck() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  console.log(`\n💓 Health check (uptime: ${hours}h ${minutes}m)`);
  logMemoryUsage();
  
  const sizeMB = getCacheSizeMB();
  const fileCount = getCacheFileCount();
  console.log(`📦 Cache: ${sizeMB.toFixed(2)} MB, ${fileCount} files`);
  
  // Log error tracking stats
  if (errorTracking.consecutiveErrors > 0) {
    console.log(`⚠️  Error state: ${errorTracking.consecutiveErrors} consecutive errors, ${errorTracking.consecutive403Errors} 403s`);
  }
  
  console.log('');
}

// Check for command line arguments
const args = process.argv.slice(2);

// Handle --clear-cache flag
if (args.includes('--clear-cache')) {
  console.log('🧹 Clearing persistent cache...');
  clearPersistentCache();
  if (args.length === 1) {
    console.log('✅ Cache cleared, exiting.');
    process.exit(0);
  }
}

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
} else if (args.includes('--auto-link')) {
  console.log('🔗 Running EA to Discord auto-link...');
  retroMatchUnlinkedProfiles().then((result) => {
    console.log(`✅ Auto-link complete: matched ${result?.matched || 0}/${result?.total || 0} profiles, exiting.`);
    process.exit(0);
  });
} else {
  // Run immediately then every 15 minutes
  console.log('\n🚀 EA Sync Local started');
  console.log('📡 Running from your local IP to bypass EA cloud blocking');
  console.log('⏱️  Syncing every 15 minutes (active 9 AM - 3 AM CT)');
  console.log(`🔄 Anti-blocking: ${USER_AGENT_POOL.length} rotating UAs, exponential backoff, request jitter`);
  console.log(`💾 Persistent cache: ${CACHE_TTL_MS / 1000 / 60} min TTL, max ${CACHE_MAX_SIZE_MB}MB / ${CACHE_MAX_FILES} files`);
  console.log(`🧹 Auto-cleanup: every ${CACHE_CLEANUP_INTERVAL_MS / 60000} min, GC hint every ${GC_INTERVAL_MS / 60000} min`);
  console.log('\n💡 Command-line options:');
  console.log('   --backfill-scouting  Backfill opponent intel');
  console.log('   --backfill-matches   Backfill last 10 games per club');
  console.log('   --auto-link          Manually link EA accounts to Discord');
  console.log('   --clear-cache        Clear persistent cache');
  console.log('\n💡 Pro tip: Run with --expose-gc for better memory management\n');
  
  // Initial health check
  logMemoryUsage();
  
  // Start scheduled tasks
  scheduledSync();
  setInterval(scheduledSync, 900000); // 15 minutes = 900,000ms
  setInterval(healthCheck, 300000); // Health check every 5 minutes
}
