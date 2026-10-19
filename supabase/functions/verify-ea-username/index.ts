import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, rejectUnlessCaller, throttleWebUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  username: string;
  platform: string;
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot or a signed-in web user may call it.
  const denied = await rejectUnlessCaller(req);
  if (denied) return denied;
  // Each check calls EA, so web users get a fair-use cap.
  const throttled = await throttleWebUser(req, createAdminClient(), "verify-ea-username", 30, 60 * 60 * 1000);
  if (throttled) return throttled;

  try {
    const { username, platform }: VerifyRequest = await req.json();

    if (!username || !platform) {
      return new Response(
        JSON.stringify({ verified: false, message: "Username and platform are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[verify-ea-username] Verifying ${username} on ${platform}`);

    const normalizedPlatform = platform.toLowerCase();

    // EA has no player search, and its club search rejects cloud requests, so a gamertag is
    // accepted when it looks valid. Stats attach as soon as it appears in a synced match.
    let verified = false;
    const personaId: string | null = null;
    let personaName: string | null = null;

    // Method 3: Check gamertag format validity
    if (!verified) {
      // Platform-specific gamertag validation
      let isValidFormat = /^[a-zA-Z0-9_\-\s.]{3,24}$/.test(username);
      
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
