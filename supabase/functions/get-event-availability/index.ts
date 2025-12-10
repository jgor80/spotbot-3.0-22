import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetEventAvailabilityRequest {
  event_id: string;
  include_player_details?: boolean;
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

    const { event_id, include_player_details = true }: GetEventAvailabilityRequest = await req.json();

    console.log(`[get-event-availability] Fetching availability for event ${event_id}`);

    // Get the event
    const { data: event, error: eventError } = await supabase
      .from("availability_events")
      .select("*, teams(name, tag)")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all responses
    const { data: responses } = await supabase
      .from("player_availability")
      .select("*")
      .eq("event_id", event_id);

    // Group by response type
    const grouped = {
      yes: (responses || []).filter(r => r.response === "yes"),
      no: (responses || []).filter(r => r.response === "no"),
      maybe: (responses || []).filter(r => r.response === "maybe"),
      no_response: (responses || []).filter(r => r.response === "no_response"),
    };

    // Get player details if requested
    let playerDetails: any = null;
    if (include_player_details) {
      const allPlayerIds = (responses || []).map(r => r.discord_user_id);

      if (allPlayerIds.length > 0) {
        const { data: summaries } = await supabase
          .from("player_summary")
          .select("discord_user_id, discord_username, overall_rating, current_streak, streak_type, top_achievements, primary_position, reliability_score")
          .eq("guild_id", event.guild_id)
          .in("discord_user_id", allPlayerIds);

        const summaryMap = new Map((summaries || []).map(s => [s.discord_user_id, s]));

        // Enhance responses with player details
        const enhancePlayer = (playerId: string, autoMarked: boolean) => ({
          ...(summaryMap.get(playerId) || { discord_username: null, overall_rating: 50 }),
          discord_user_id: playerId,
          auto_marked: autoMarked,
        });

        playerDetails = {
          yes: grouped.yes.map(r => enhancePlayer(r.discord_user_id, r.auto_marked)),
          no: grouped.no.map(r => enhancePlayer(r.discord_user_id, r.auto_marked)),
          maybe: grouped.maybe.map(r => enhancePlayer(r.discord_user_id, r.auto_marked)),
          no_response: grouped.no_response.map(r => enhancePlayer(r.discord_user_id, r.auto_marked)),
        };

        // Sort by rating
        playerDetails.yes.sort((a: any, b: any) => (b.overall_rating || 0) - (a.overall_rating || 0));
        playerDetails.maybe.sort((a: any, b: any) => (b.overall_rating || 0) - (a.overall_rating || 0));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          event_type: event.event_type,
          scheduled_at: event.scheduled_at,
          duration_minutes: event.duration_minutes,
          team: event.teams,
          closed: event.closed,
          reminder_24h_sent: event.reminder_24h_sent,
          reminder_2h_sent: event.reminder_2h_sent,
        },
        counts: {
          yes: grouped.yes.length,
          no: grouped.no.length,
          maybe: grouped.maybe.length,
          no_response: grouped.no_response.length,
          total: (responses || []).length,
        },
        players: playerDetails || grouped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[get-event-availability] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
