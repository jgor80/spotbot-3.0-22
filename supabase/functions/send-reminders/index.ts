import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rejectUnlessCaller } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function should be called by a cron job every few minutes
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // verify_jwt is off for this function: only the bot may call it.
  const denied = await rejectUnlessCaller(req, { botOnly: true });
  if (denied) return denied;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date();
    
    // ============================================
    // CLEANUP: Delete expired feedback requests (30+ min old)
    // ============================================
    const { data: deletedFeedback, error: deleteError } = await supabase
      .from("dm_feedback_requests")
      .delete()
      .lt("expires_at", now.toISOString())
      .select("id");
    
    const deletedCount = deletedFeedback?.length || 0;
    if (deletedCount > 0) {
      console.log(`[send-reminders] Deleted ${deletedCount} expired feedback requests`);
    }
    if (deleteError) {
      console.error(`[send-reminders] Error deleting expired feedback:`, deleteError.message);
    }
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    console.log(`[send-reminders] Checking for events needing reminders`);

    // Get events needing 24h reminder
    const { data: events24h } = await supabase
      .from("availability_events")
      .select("*")
      .eq("closed", false)
      .eq("reminder_24h_sent", false)
      .lte("scheduled_at", in24Hours.toISOString())
      .gt("scheduled_at", now.toISOString());

    // Get events needing 2h reminder
    const { data: events2h } = await supabase
      .from("availability_events")
      .select("*")
      .eq("closed", false)
      .eq("reminder_2h_sent", false)
      .lte("scheduled_at", in2Hours.toISOString())
      .gt("scheduled_at", now.toISOString());

    const reminders24h: any[] = [];
    const reminders2h: any[] = [];
    const autoMarked: any[] = [];

    // Process 24h reminders
    for (const event of events24h || []) {
      // Get players who haven't responded
      const { data: noResponse } = await supabase
        .from("player_availability")
        .select("discord_user_id")
        .eq("event_id", event.id)
        .eq("response", "no_response");

      if (noResponse && noResponse.length > 0) {
        reminders24h.push({
          event_id: event.id,
          event_title: event.title,
          scheduled_at: event.scheduled_at,
          guild_id: event.guild_id,
          channel_id: event.channel_id,
          players_to_remind: noResponse.map(p => p.discord_user_id),
        });
      }

      // Mark as sent
      await supabase
        .from("availability_events")
        .update({ reminder_24h_sent: true })
        .eq("id", event.id);
    }

    // Process 2h reminders + auto-mark
    for (const event of events2h || []) {
      // Get players who haven't responded
      const { data: noResponse } = await supabase
        .from("player_availability")
        .select("discord_user_id")
        .eq("event_id", event.id)
        .eq("response", "no_response");

      if (noResponse && noResponse.length > 0) {
        reminders2h.push({
          event_id: event.id,
          event_title: event.title,
          scheduled_at: event.scheduled_at,
          guild_id: event.guild_id,
          channel_id: event.channel_id,
          players_to_remind: noResponse.map(p => p.discord_user_id),
        });

        // Auto-mark as unavailable
        for (const player of noResponse) {
          await supabase
            .from("player_availability")
            .update({
              response: "no",
              auto_marked: true,
              responded_at: new Date().toISOString(),
            })
            .eq("event_id", event.id)
            .eq("discord_user_id", player.discord_user_id);

          autoMarked.push({
            event_id: event.id,
            discord_user_id: player.discord_user_id,
          });
        }
      }

      // Mark as sent
      await supabase
        .from("availability_events")
        .update({ reminder_2h_sent: true })
        .eq("id", event.id);
    }

    console.log(`[send-reminders] 24h reminders: ${reminders24h.length}, 2h reminders: ${reminders2h.length}, auto-marked: ${autoMarked.length}, deleted feedback: ${deletedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        reminders_24h: reminders24h,
        reminders_2h: reminders2h,
        auto_marked_unavailable: autoMarked,
        expired_feedback_deleted: deletedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-reminders] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
