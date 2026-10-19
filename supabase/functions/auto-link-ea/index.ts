import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rejectUnlessCaller, requireGuildAccess } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutoLinkRequest {
  guild_id: string;
}

// Thresholds for tiered linking
const AUTO_LINK_THRESHOLD = 0.75;  // ≥75% = auto-link immediately
const SUGGEST_THRESHOLD = 0.35;    // 35-74% = save as suggestion for review (lowered from 0.50)
// <35% = ignore

// Dice coefficient string similarity
function diceSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length < 2 || str2.length < 2) return 0;
  
  const bigrams = new Map<string, number>();
  for (let i = 0; i < str1.length - 1; i++) {
    const bigram = str1.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }
  
  let intersectionSize = 0;
  for (let i = 0; i < str2.length - 1; i++) {
    const bigram = str2.substring(i, i + 2);
    const count = bigrams.get(bigram) || 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }
  
  return (2.0 * intersectionSize) / (str1.length + str2.length - 2);
}

// Levenshtein distance for better matching
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  if (m === 0) return n;
  if (n === 0) return m;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  
  return dp[m][n];
}

// Convert Levenshtein distance to similarity (0-1)
function levenshteinSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  return 1 - (levenshteinDistance(str1, str2) / maxLen);
}

// Combined string similarity using both algorithms
function stringSimilarity(str1: string, str2: string): number {
  const dice = diceSimilarity(str1, str2);
  const lev = levenshteinSimilarity(str1, str2);
  // Weight Levenshtein slightly higher as it handles transpositions better
  return (dice * 0.4) + (lev * 0.6);
}

// Common gaming prefixes/suffixes to remove
const GAMING_PREFIXES = ['ttv', 'yt', 'twitch', 'fn', 'rno', 'faze', 'optic', 'nrg', 'g2', 'c9', 'tsm', 'fnatic'];
const GAMING_SUFFIXES = ['tv', 'yt', 'ttv', 'fn', 'gaming', 'esports', 'clan'];
const CLAN_TAG_REGEX = /^\[.*?\]|^\{.*?\}|^\(.*?\)|<.*?>|\[.*?\]$|\{.*?\}$|\(.*?\)$/gi;

// Common role prefixes found before | in Discord display names
const ROLE_PREFIXES = ['owner', 'manager', 'captain', 'director', 'coach', 'admin', 'mod', 'moderator', 'staff', 'founder', 'co-owner', 'vp', 'gm', 'agm', 'lead', 'head'];

// Extract the actual username from Discord display names that may have roles
// e.g., "Owner | JohnDoe" -> "JohnDoe", "Captain | PlayerName" -> "PlayerName"
function extractDiscordName(displayName: string): string {
  if (!displayName) return '';
  
  // Check if there's a | separator
  if (displayName.includes('|')) {
    const parts = displayName.split('|').map(p => p.trim());
    
    // If first part looks like a role, use the second part
    if (parts.length >= 2) {
      const firstPartLower = parts[0].toLowerCase();
      const isRolePrefix = ROLE_PREFIXES.some(role => 
        firstPartLower === role || 
        firstPartLower.includes(role)
      );
      
      if (isRolePrefix) {
        // Return the part after the | (could be multiple |, take the rest)
        return parts.slice(1).join('|').trim();
      }
    }
  }
  
  return displayName;
}

// Normalize username for better matching
function normalizeUsername(username: string): string {
  if (!username) return '';
  
  // First extract the actual name from Discord display names with roles
  let normalized = extractDiscordName(username).toLowerCase();
  
  // Remove clan tags [TAG], {TAG}, (TAG), <TAG>
  normalized = normalized.replace(CLAN_TAG_REGEX, '');
  
  // Remove underscores, dashes, dots, spaces
  normalized = normalized.replace(/[_\-\.\s]/g, '');
  
  // Remove trailing numbers
  normalized = normalized.replace(/[0-9]+$/g, '');
  
  // Remove common gaming prefixes
  for (const prefix of GAMING_PREFIXES) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length + 2) {
      normalized = normalized.substring(prefix.length);
    }
  }
  
  // Remove common gaming suffixes
  for (const suffix of GAMING_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 2) {
      normalized = normalized.substring(0, normalized.length - suffix.length);
    }
  }
  
  // Remove trailing xxx patterns
  normalized = normalized.replace(/x{2,}$/i, '');
  
  return normalized.trim();
}

// Tokenize username into parts for partial matching
function tokenizeUsername(username: string): string[] {
  if (!username) return [];
  
  // First extract the actual name from Discord display names
  const cleanName = extractDiscordName(username);
  
  // Split on common separators
  const tokens = cleanName
    .toLowerCase()
    .split(/[_\-\.\s|]+/)
    .filter(t => t.length >= 2)
    .filter(t => !ROLE_PREFIXES.includes(t)); // Filter out role words
  
  // Also add the full normalized version
  const normalized = normalizeUsername(username);
  if (normalized && !tokens.includes(normalized)) {
    tokens.push(normalized);
  }
  
  return tokens;
}

// Check if any token from one username matches any token from another
function tokenMatchScore(username1: string, username2: string): number {
  const tokens1 = tokenizeUsername(username1);
  const tokens2 = tokenizeUsername(username2);
  
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  let bestMatch = 0;
  for (const t1 of tokens1) {
    for (const t2 of tokens2) {
      // Exact token match
      if (t1 === t2) {
        bestMatch = Math.max(bestMatch, 0.9);
      } else {
        // Partial token similarity
        const sim = stringSimilarity(t1, t2);
        if (sim > 0.8) {
          bestMatch = Math.max(bestMatch, sim * 0.85);
        }
      }
    }
  }
  
  return bestMatch;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot or a signed-in web user may call it.
  const denied = await rejectUnlessCaller(req);
  if (denied) return denied;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { guild_id }: AutoLinkRequest = await req.json();
    // Linking rewrites the server's player records, so only its leaders may run it from the web.
    const noAccess = await requireGuildAccess(req, supabase, guild_id, "leader");
    if (noAccess) return noAccess;

    if (!guild_id) {
      return new Response(
        JSON.stringify({ success: false, error: "guild_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[auto-link-ea] Starting auto-link for guild ${guild_id}`);

    const result = { 
      linked: 0, 
      suggested: 0, 
      skipped: 0, 
      noMatch: 0,
      cleaned: 0,
      details: [] as any[] 
    };

    // First, cleanup orphaned temp profiles (where EA is already linked to real profile)
    const { data: allTempProfiles } = await supabase
      .from("profiles")
      .select("discord_user_id, ea_username, ea_platform")
      .like("discord_user_id", "ea_%");

    const { data: allRealProfiles } = await supabase
      .from("profiles")
      .select("discord_user_id, discord_username, ea_username")
      .not("discord_user_id", "like", "ea_%");

    // Create a map of EA username -> real Discord profile
    const eaToRealMap = new Map<string, any>();
    for (const profile of (allRealProfiles || [])) {
      if (profile.ea_username) {
        eaToRealMap.set(profile.ea_username.toLowerCase(), profile);
      }
    }

    // Cleanup orphans - comprehensive migration across ALL tables and guilds
    for (const tempProfile of (allTempProfiles || [])) {
      const eaUsername = tempProfile.ea_username;
      if (!eaUsername) continue;

      const realProfile = eaToRealMap.get(eaUsername.toLowerCase());
      if (!realProfile) continue;

      const tempDiscordId = tempProfile.discord_user_id;
      const realDiscordId = realProfile.discord_user_id;

      console.log(`[auto-link-ea] Cleaning orphan: ${eaUsername} (${tempDiscordId} -> ${realDiscordId})`);

      // Migrate player_stats (all guilds)
      await supabase
        .from("player_stats")
        .update({ discord_user_id: realDiscordId })
        .eq("discord_user_id", tempDiscordId);

      // Migrate player_club_stats (all guilds)
      await supabase
        .from("player_club_stats")
        .update({ discord_user_id: realDiscordId })
        .eq("discord_user_id", tempDiscordId);

      // Migrate player_streaks (all guilds)
      await supabase
        .from("player_streaks")
        .update({ discord_user_id: realDiscordId })
        .eq("discord_user_id", tempDiscordId);

      // Migrate player_position_ratings (all guilds)
      await supabase
        .from("player_position_ratings")
        .update({ discord_user_id: realDiscordId })
        .eq("discord_user_id", tempDiscordId);

      // Migrate position_preferences (all guilds) - note: uses user_id not discord_user_id
      await supabase
        .from("position_preferences")
        .update({ user_id: realDiscordId })
        .eq("user_id", tempDiscordId);

      // For player_ratings: migrate or delete per guild
      const { data: tempRatings } = await supabase
        .from("player_ratings")
        .select("id, guild_id")
        .eq("discord_user_id", tempDiscordId);

      for (const tempRating of (tempRatings || [])) {
        const { data: existingRating } = await supabase
          .from("player_ratings")
          .select("id")
          .eq("discord_user_id", realDiscordId)
          .eq("guild_id", tempRating.guild_id)
          .maybeSingle();

        if (!existingRating) {
          await supabase
            .from("player_ratings")
            .update({ discord_user_id: realDiscordId })
            .eq("id", tempRating.id);
        } else {
          await supabase
            .from("player_ratings")
            .delete()
            .eq("id", tempRating.id);
        }
      }

      // For player_summary: migrate or delete per guild
      const { data: tempSummaries } = await supabase
        .from("player_summary")
        .select("id, guild_id")
        .eq("discord_user_id", tempDiscordId);

      for (const tempSummary of (tempSummaries || [])) {
        const { data: existingSummary } = await supabase
          .from("player_summary")
          .select("id")
          .eq("discord_user_id", realDiscordId)
          .eq("guild_id", tempSummary.guild_id)
          .maybeSingle();

        if (!existingSummary) {
          await supabase
            .from("player_summary")
            .update({ discord_user_id: realDiscordId })
            .eq("id", tempSummary.id);
        } else {
          await supabase
            .from("player_summary")
            .delete()
            .eq("id", tempSummary.id);
        }
      }

      // Delete the orphaned temp profile
      await supabase.from("profiles").delete().eq("discord_user_id", tempDiscordId);

      result.cleaned++;
    }

    // Get remaining temp profiles after cleanup
    const { data: tempProfiles, error: tempError } = await supabase
      .from("profiles")
      .select("discord_user_id, ea_username, ea_platform")
      .like("discord_user_id", "ea_%")
      .not("ea_username", "is", null);

    if (tempError) {
      console.error("[auto-link-ea] Error fetching temp profiles:", tempError);
      throw tempError;
    }

    if (!tempProfiles || tempProfiles.length === 0) {
      console.log("[auto-link-ea] No unlinked EA profiles found");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Cleaned ${result.cleaned} orphans. No unlinked EA accounts to process.`,
          ...result 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[auto-link-ea] Found ${tempProfiles.length} unlinked EA profiles`);

    // Get ALL Discord profiles (not just unlinked) for suggestions
    const { data: discordProfiles, error: discordError } = await supabase
      .from("profiles")
      .select("discord_user_id, discord_username, ea_username")
      .not("discord_user_id", "like", "ea_%");

    if (discordError) {
      console.error("[auto-link-ea] Error fetching discord profiles:", discordError);
      throw discordError;
    }

    // Also get usernames from player_summary for matching
    const { data: playerSummaries } = await supabase
      .from("player_summary")
      .select("discord_user_id, discord_username")
      .eq("guild_id", guild_id)
      .not("discord_user_id", "like", "ea_%");

    // Get previously rejected suggestions to skip
    const { data: rejectedSuggestions } = await supabase
      .from("link_suggestions")
      .select("ea_username, suggested_discord_id")
      .eq("guild_id", guild_id)
      .eq("status", "rejected");

    const rejectedCombos = new Set(
      (rejectedSuggestions || []).map(s => `${s.ea_username}:${s.suggested_discord_id}`)
    );

    // Build a map of discord_user_id -> username from all sources
    const usernameMap = new Map<string, string>();
    
    for (const profile of discordProfiles || []) {
      if (profile.discord_username) {
        usernameMap.set(profile.discord_user_id, profile.discord_username);
      }
    }
    
    for (const summary of playerSummaries || []) {
      if (summary.discord_username && !usernameMap.has(summary.discord_user_id)) {
        usernameMap.set(summary.discord_user_id, summary.discord_username);
      }
    }

    // Separate unlinked and linked members
    const unlinkedMembers = (discordProfiles || []).filter(p => !p.ea_username);
    const unlinkedMemberIds = new Set(unlinkedMembers.map(m => m.discord_user_id));
    const linkedMembers = (discordProfiles || []).filter(p => p.ea_username && p.discord_username);

    for (const tempProfile of tempProfiles) {
      const eaUsername = tempProfile.ea_username;
      if (!eaUsername) continue;

      const normalizedEa = normalizeUsername(eaUsername);
      const tempDiscordId = tempProfile.discord_user_id;

      // Find best match - first try unlinked members (for auto-link)
      let bestMatch: { discord_user_id: string; discord_username: string; isLinked: boolean } | null = null;
      let bestSimilarity = 0;

      // Check unlinked members first
      for (const member of unlinkedMembers) {
        const discordUsername = usernameMap.get(member.discord_user_id);
        if (!discordUsername) continue;

        // Skip if this combo was previously rejected
        if (rejectedCombos.has(`${eaUsername}:${member.discord_user_id}`)) continue;

        // Check for exact normalized match
        if (normalizeUsername(discordUsername) === normalizedEa) {
          bestSimilarity = 1.0;
          bestMatch = { discord_user_id: member.discord_user_id, discord_username: discordUsername, isLinked: false };
          break;
        }

        // Calculate similarity using multiple methods
        const rawSimilarity = stringSimilarity(eaUsername.toLowerCase(), discordUsername.toLowerCase());
        const normalizedSimilarity = stringSimilarity(normalizedEa, normalizeUsername(discordUsername));
        const tokenScore = tokenMatchScore(eaUsername, discordUsername);
        const similarity = Math.max(rawSimilarity, normalizedSimilarity, tokenScore);
        
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = { discord_user_id: member.discord_user_id, discord_username: discordUsername, isLinked: false };
        }
      }

      // If no good match in unlinked, check linked members for suggestions
      if ((!bestMatch || bestSimilarity < SUGGEST_THRESHOLD) && linkedMembers.length > 0) {
        for (const member of linkedMembers) {
          const discordUsername = member.discord_username!;
          
          // Skip if this combo was previously rejected
          if (rejectedCombos.has(`${eaUsername}:${member.discord_user_id}`)) continue;

          // Check for exact normalized match
          if (normalizeUsername(discordUsername) === normalizedEa) {
            bestSimilarity = 0.74; // Cap below auto-link for linked members
            bestMatch = { discord_user_id: member.discord_user_id, discord_username: discordUsername, isLinked: true };
            break;
          }

          const rawSimilarity = stringSimilarity(eaUsername.toLowerCase(), discordUsername.toLowerCase());
          const normalizedSimilarity = stringSimilarity(normalizedEa, normalizeUsername(discordUsername));
          const tokenScore = tokenMatchScore(eaUsername, discordUsername);
          const similarity = Math.min(Math.max(rawSimilarity, normalizedSimilarity, tokenScore), 0.74); // Cap for linked
          
          if (similarity > bestSimilarity && similarity >= SUGGEST_THRESHOLD) {
            bestSimilarity = similarity;
            bestMatch = { discord_user_id: member.discord_user_id, discord_username: discordUsername, isLinked: true };
          }
        }
      }

      // Apply tiered thresholds
      if (!bestMatch || bestSimilarity < SUGGEST_THRESHOLD) {
        result.noMatch++;
        result.details.push({
          ea_username: eaUsername,
          status: "no_match",
          reason: bestMatch 
            ? `Best match ${bestMatch.discord_username} only ${Math.round(bestSimilarity * 100)}% (below ${SUGGEST_THRESHOLD * 100}% threshold)`
            : "No Discord member with similar username found"
        });
        continue;
      }

      const realDiscordId = bestMatch.discord_user_id;

      // HIGH CONFIDENCE (≥75%) AND unlinked: Auto-link immediately
      if (bestSimilarity >= AUTO_LINK_THRESHOLD && !bestMatch.isLinked) {
        console.log(`[auto-link-ea] Auto-linking ${eaUsername} -> ${bestMatch.discord_username} (${(bestSimilarity * 100).toFixed(0)}%)`);

        // Update the real Discord profile with EA info
        const { error: upsertError } = await supabase
          .from("profiles")
          .upsert({
            discord_user_id: realDiscordId,
            ea_username: eaUsername,
            ea_platform: tempProfile.ea_platform,
            discord_username: bestMatch.discord_username,
            updated_at: new Date().toISOString()
          }, { onConflict: "discord_user_id" });

        if (upsertError) {
          console.error(`[auto-link-ea] Error upserting profile:`, upsertError);
          continue;
        }

        // Migrate player_stats
        await supabase
          .from("player_stats")
          .update({ discord_user_id: realDiscordId })
          .eq("discord_user_id", tempDiscordId)
          .eq("guild_id", guild_id);

        // Migrate player_summary
        const { data: tempSummary } = await supabase
          .from("player_summary")
          .select("id")
          .eq("discord_user_id", tempDiscordId)
          .eq("guild_id", guild_id)
          .maybeSingle();

        if (tempSummary) {
          const { data: existingSummary } = await supabase
            .from("player_summary")
            .select("id")
            .eq("discord_user_id", realDiscordId)
            .eq("guild_id", guild_id)
            .maybeSingle();

          if (!existingSummary) {
            await supabase
              .from("player_summary")
              .update({ discord_user_id: realDiscordId })
              .eq("id", tempSummary.id);
          } else {
            await supabase
              .from("player_summary")
              .delete()
              .eq("id", tempSummary.id);
          }
        }

        // Migrate player_ratings
        const { data: tempRating } = await supabase
          .from("player_ratings")
          .select("id")
          .eq("discord_user_id", tempDiscordId)
          .eq("guild_id", guild_id)
          .maybeSingle();

        if (tempRating) {
          const { data: existingRating } = await supabase
            .from("player_ratings")
            .select("id")
            .eq("discord_user_id", realDiscordId)
            .eq("guild_id", guild_id)
            .maybeSingle();

          if (!existingRating) {
            await supabase
              .from("player_ratings")
              .update({ discord_user_id: realDiscordId })
              .eq("id", tempRating.id);
          } else {
            await supabase
              .from("player_ratings")
              .delete()
              .eq("id", tempRating.id);
          }
        }

        // Migrate position_preferences
        await supabase
          .from("position_preferences")
          .update({ user_id: realDiscordId })
          .eq("user_id", tempDiscordId)
          .eq("guild_id", guild_id);

        // Migrate player_club_stats
        await supabase
          .from("player_club_stats")
          .update({ discord_user_id: realDiscordId })
          .eq("discord_user_id", tempDiscordId)
          .eq("guild_id", guild_id);

        // Migrate player_streaks
        await supabase
          .from("player_streaks")
          .update({ discord_user_id: realDiscordId })
          .eq("discord_user_id", tempDiscordId)
          .eq("guild_id", guild_id);

        // Migrate player_position_ratings
        await supabase
          .from("player_position_ratings")
          .update({ discord_user_id: realDiscordId })
          .eq("discord_user_id", tempDiscordId)
          .eq("guild_id", guild_id);

        // Delete temp profile
        await supabase
          .from("profiles")
          .delete()
          .eq("discord_user_id", tempDiscordId);

        result.linked++;
        result.details.push({
          ea_username: eaUsername,
          discord_username: bestMatch.discord_username,
          similarity: Math.round(bestSimilarity * 100),
          status: "linked"
        });

        // Remove from unlinked set to prevent double-matching
        unlinkedMemberIds.delete(realDiscordId);
      } 
      // MEDIUM CONFIDENCE (50-74%) OR linked member: Save as suggestion for admin review
      else {
        const note = bestMatch.isLinked ? " (already linked to different EA)" : "";
        console.log(`[auto-link-ea] Suggesting ${eaUsername} -> ${bestMatch.discord_username} (${(bestSimilarity * 100).toFixed(0)}%)${note}`);

        // Check if suggestion already exists
        const { data: existingSuggestion } = await supabase
          .from("link_suggestions")
          .select("id, status")
          .eq("guild_id", guild_id)
          .eq("ea_username", eaUsername)
          .eq("suggested_discord_id", realDiscordId)
          .maybeSingle();

        if (!existingSuggestion) {
          // Create new suggestion - use discord_user_id as temp_profile_id
          await supabase
            .from("link_suggestions")
            .insert({
              guild_id: guild_id,
              temp_profile_id: tempDiscordId,
              ea_username: eaUsername,
              suggested_discord_id: realDiscordId,
              suggested_discord_name: bestMatch.discord_username,
              similarity_score: bestSimilarity,
              status: "pending"
            });

          result.suggested++;
          result.details.push({
            ea_username: eaUsername,
            discord_username: bestMatch.discord_username,
            similarity: Math.round(bestSimilarity * 100),
            status: "suggested",
            isLinkedMember: bestMatch.isLinked
          });
        } else if (existingSuggestion.status === "pending") {
          result.details.push({
            ea_username: eaUsername,
            discord_username: bestMatch.discord_username,
            similarity: Math.round(bestSimilarity * 100),
            status: "already_suggested"
          });
        }
      }
    }

    console.log(`[auto-link-ea] Complete: cleaned=${result.cleaned}, linked=${result.linked}, suggested=${result.suggested}, skipped=${result.skipped}, noMatch=${result.noMatch}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-link complete: ${result.cleaned} orphans cleaned, ${result.linked} linked, ${result.suggested} suggested for review, ${result.skipped} skipped, ${result.noMatch} no match`,
        ...result
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[auto-link-ea] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
