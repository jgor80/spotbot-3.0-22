import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  username: string;
  platform: string;
}

// Platform mapping for EA API
const platformMap: Record<string, string> = {
  ps5: "ps5",
  ps4: "ps4",
  xbsx: "xbsx",
  xone: "xone",
  pc: "pc",
  playstation: "ps5",
  xbox: "xbsx",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, platform }: VerifyRequest = await req.json();

    if (!username || !platform) {
      return new Response(
        JSON.stringify({ verified: false, message: "Username and platform are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[verify-ea-username] Verifying ${username} on ${platform}`);

    const normalizedPlatform = platformMap[platform.toLowerCase()] || platform.toLowerCase();

    // Try to find the player via EA Pro Clubs search
    // First, search for clubs that might contain this player
    const searchUrl = `https://proclubs.ea.com/api/fc/allTimeLeaderboard/search?platform=${normalizedPlatform}&clubName=${encodeURIComponent(username)}`;
    
    let verified = false;
    let personaId: string | null = null;
    let personaName: string | null = null;

    try {
      // Method 1: Search club leaderboard for similar names
      const searchResponse = await fetch(searchUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        
        // Check if any club matches or contains the username
        if (searchData && Array.isArray(searchData)) {
          const matchingClub = searchData.find((club: { name?: string }) => 
            club.name?.toLowerCase().includes(username.toLowerCase()) ||
            username.toLowerCase().includes(club.name?.toLowerCase() || "")
          );
          
          if (matchingClub) {
            verified = true;
            personaName = username;
            console.log(`[verify-ea-username] Found matching club: ${matchingClub.name}`);
          }
        }
      }
    } catch (searchError) {
      console.log(`[verify-ea-username] Club search failed: ${searchError}`);
    }

    // Method 2: Try member career stats endpoint
    if (!verified) {
      try {
        // For direct username verification, we use a different approach
        // The EA API doesn't have a direct username search, but we can verify
        // by checking if stats exist for common club patterns
        
        // Since we can't directly verify usernames without club context,
        // we'll do a soft verification based on format
        const usernamePattern = /^[a-zA-Z0-9_\-\s]{3,24}$/;
        
        if (usernamePattern.test(username)) {
          // Accept usernames that match valid EA username format
          // Full verification will happen when they play a game
          verified = true;
          personaName = username;
          console.log(`[verify-ea-username] Username format valid, soft verified`);
        }
      } catch (memberError) {
        console.log(`[verify-ea-username] Member verification failed: ${memberError}`);
      }
    }

    // Method 3: Check gamertag format validity
    if (!verified) {
      // Platform-specific gamertag validation
      let isValidFormat = false;
      
      if (normalizedPlatform === "pc") {
        // Origin/EA App usernames: 4-16 chars
        isValidFormat = username.length >= 4 && username.length <= 16;
      } else if (normalizedPlatform.startsWith("ps")) {
        // PSN IDs: 3-16 chars
        isValidFormat = username.length >= 3 && username.length <= 16;
      } else if (normalizedPlatform.startsWith("xb")) {
        // Xbox Gamertags: 1-15 chars
        isValidFormat = username.length >= 1 && username.length <= 15;
      }

      if (isValidFormat) {
        verified = true;
        personaName = username;
        console.log(`[verify-ea-username] Format valid for ${normalizedPlatform}`);
      }
    }

    return new Response(
      JSON.stringify({
        verified,
        persona_id: personaId,
        persona_name: personaName,
        platform: normalizedPlatform,
        message: verified 
          ? "Username format verified. Full verification occurs when stats are synced."
          : "Could not verify username format",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[verify-ea-username] Error:", error);
    return new Response(
      JSON.stringify({ verified: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
