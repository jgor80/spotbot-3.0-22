import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutoLinkRequest {
  guild_id: string;
}

// Simple string similarity function (Dice coefficient)
function stringSimilarity(str1: string, str2: string): number {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { guild_id }: AutoLinkRequest = await req.json();

    if (!guild_id) {
      return new Response(
        JSON.stringify({ success: false, error: "guild_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[auto-link-ea] Starting auto-link for guild ${guild_id}`);

    const result = { linked: 0, skipped: 0, noMatch: 0, details: [] as any[] };

    // Get all temporary ea_ profiles that need linking
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
          message: "No unlinked EA accounts to process",
          ...result 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[auto-link-ea] Found ${tempProfiles.length} unlinked EA profiles`);

    // Get existing Discord profiles that don't have EA accounts linked
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

    const unlinkedMembers = (discordProfiles || []).filter(p => !p.ea_username);
    const unlinkedMemberIds = new Set(unlinkedMembers.map(m => m.discord_user_id));

    for (const tempProfile of tempProfiles) {
      const eaUsername = tempProfile.ea_username;
      if (!eaUsername) continue;

      // Find best match using fuzzy matching
      let bestMatch: { discord_user_id: string; discord_username: string } | null = null;
      let bestSimilarity = 0;

      // Check all potential matches
      for (const [discordId, discordUsername] of usernameMap.entries()) {
        // Skip if already has EA linked
        if (!unlinkedMemberIds.has(discordId)) continue;

        const similarity = stringSimilarity(
          eaUsername.toLowerCase(), 
          discordUsername.toLowerCase()
        );
        
        if (similarity > bestSimilarity && similarity >= 0.5) {
          bestSimilarity = similarity;
          bestMatch = { discord_user_id: discordId, discord_username: discordUsername };
        }
      }

      if (!bestMatch) {
        result.noMatch++;
        result.details.push({
          ea_username: eaUsername,
          status: "no_match",
          reason: "No Discord member with similar username found"
        });
        continue;
      }

      // Check if target already has an EA account linked
      const existingProfile = discordProfiles?.find(p => p.discord_user_id === bestMatch!.discord_user_id);
      if (existingProfile?.ea_username) {
        result.skipped++;
        result.details.push({
          ea_username: eaUsername,
          discord_username: bestMatch.discord_username,
          status: "skipped",
          reason: "Discord user already has EA account linked"
        });
        continue;
      }

      console.log(`[auto-link-ea] Linking ${eaUsername} -> ${bestMatch.discord_username} (${(bestSimilarity * 100).toFixed(0)}%)`);

      const tempDiscordId = tempProfile.discord_user_id;
      const realDiscordId = bestMatch.discord_user_id;

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

    console.log(`[auto-link-ea] Complete: linked=${result.linked}, skipped=${result.skipped}, noMatch=${result.noMatch}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-link complete: ${result.linked} linked, ${result.skipped} skipped, ${result.noMatch} no match`,
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
