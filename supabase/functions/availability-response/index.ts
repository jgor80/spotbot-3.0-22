import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rejectUnlessCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_RESPONSES = ["yes", "no", "maybe"] as const;

interface AvailabilityResponseRequest {
  event_id: string;
  discord_user_id: string;
  response: "yes" | "no" | "maybe";
}

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.event_id || !UUID_REGEX.test(body.event_id)) {
    errors.push("event_id must be a valid UUID");
  }
  if (!body.discord_user_id || !DISCORD_ID_REGEX.test(body.discord_user_id)) {
    errors.push("discord_user_id must be a valid Discord ID");
  }
  if (!VALID_RESPONSES.includes(body.response)) {
    errors.push(`response must be one of: ${VALID_RESPONSES.join(", ")}`);
  }
  
  return errors;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot may call it.
  const denied = await rejectUnlessCaller(req, { botOnly: true });
  if (denied) return denied;

  try {
    // Verify the request is from the Discord bot (service role key)
    const authHeader = req.headers.get("authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      console.log("[availability-response] Unauthorized: Missing or invalid service role key");
      return new Response(
        JSON.stringify({ error: "This operation requires bot authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey
    );

    const body = await req.json();
    
    // Validate input
    const errors = validateRequest(body);
    if (errors.length > 0) {
      console.log(`[availability-response] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { event_id, discord_user_id, response }: AvailabilityResponseRequest = body;

    console.log(`[availability-response] ${discord_user_id} responding "${response}" to event ${event_id}`);

    // Check if event exists and is not closed
    const { data: event, error: eventError } = await supabase
      .from("availability_events")
      .select("*")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event.closed) {
      return new Response(
        JSON.stringify({ error: "Event is closed for responses" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert the response
    const { error: upsertError } = await supabase
      .from("player_availability")
      .upsert({
        event_id,
        discord_user_id,
        response,
        responded_at: new Date().toISOString(),
        auto_marked: false,
      }, { onConflict: "event_id,discord_user_id" });

    if (upsertError) {
      console.error("[availability-response] Error:", upsertError);
      throw upsertError;
    }

    // Get current response counts
    const { data: responses } = await supabase
      .from("player_availability")
      .select("response")
      .eq("event_id", event_id);

    const counts = {
      yes: (responses || []).filter(r => r.response === "yes").length,
      no: (responses || []).filter(r => r.response === "no").length,
      maybe: (responses || []).filter(r => r.response === "maybe").length,
      no_response: (responses || []).filter(r => r.response === "no_response").length,
    };

    console.log(`[availability-response] Response recorded. Counts: ${JSON.stringify(counts)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `You responded "${response}" to ${event.title}`,
        counts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[availability-response] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
