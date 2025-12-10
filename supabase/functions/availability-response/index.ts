import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AvailabilityResponseRequest {
  event_id: string;
  discord_user_id: string;
  response: "yes" | "no" | "maybe";
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

    const { event_id, discord_user_id, response }: AvailabilityResponseRequest = await req.json();

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
