import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MarkAttendanceRequest {
  guild_id: string;
  event_id: string;
  recorded_by_discord_id: string;
  attendance: {
    discord_user_id: string;
    showed_up: boolean;
  }[];
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

    const { guild_id, event_id, recorded_by_discord_id, attendance }: MarkAttendanceRequest = await req.json();

    console.log(`[mark-attendance] Recording attendance for event ${event_id}, ${attendance.length} players`);

    // Get the event
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

    // Get availability responses
    const { data: responses } = await supabase
      .from("player_availability")
      .select("discord_user_id, response")
      .eq("event_id", event_id);

    const responseMap = new Map((responses || []).map(r => [r.discord_user_id, r.response]));

    // Record attendance and update reliability
    for (const record of attendance) {
      const saidAvailable = responseMap.get(record.discord_user_id) === "yes";
      const saidMaybe = responseMap.get(record.discord_user_id) === "maybe";

      // Insert attendance record
      await supabase.from("attendance_records").insert({
        guild_id,
        event_id,
        discord_user_id: record.discord_user_id,
        said_available: saidAvailable || saidMaybe,
        actually_showed: record.showed_up,
        recorded_by_discord_id,
      });

      // Update reliability score
      await updateReliability(supabase, guild_id, record.discord_user_id, saidAvailable, saidMaybe, record.showed_up);
    }

    // Close the event
    await supabase
      .from("availability_events")
      .update({ closed: true })
      .eq("id", event_id);

    console.log(`[mark-attendance] Attendance recorded, reliability updated`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Attendance recorded for ${attendance.length} players`,
        event_closed: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[mark-attendance] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function updateReliability(
  supabase: any,
  guildId: string,
  discordUserId: string,
  saidYes: boolean,
  saidMaybe: boolean,
  showedUp: boolean
) {
  const { data: existing } = await supabase
    .from("player_reliability")
    .select("*")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordUserId)
    .maybeSingle();

  // Scoring:
  // Said Yes + Showed = +1 point
  // Said Yes + No-Show = -3 points (heavy penalty)
  // Said Maybe + Showed = +0.5 points
  // Said Maybe + No-Show = -1 point
  // Said No = neutral (we don't track these typically)

  let pointChange = 0;
  if (saidYes && showedUp) pointChange = 1;
  else if (saidYes && !showedUp) pointChange = -3;
  else if (saidMaybe && showedUp) pointChange = 0.5;
  else if (saidMaybe && !showedUp) pointChange = -1;

  if (existing) {
    const newTotal = existing.total_events + 1;
    const newAvailable = existing.events_available + (saidYes || saidMaybe ? 1 : 0);
    const newShowed = existing.events_showed + (showedUp ? 1 : 0);
    const newNoShowed = existing.events_no_showed + ((saidYes || saidMaybe) && !showedUp ? 1 : 0);

    // Calculate reliability score (base 100, modified by points)
    // We use a weighted moving average approach
    const baseScore = newShowed > 0 ? (newShowed / Math.max(1, newAvailable)) * 100 : 100;
    // Apply penalty for no-shows more heavily
    const penaltyFactor = Math.max(0, 1 - (newNoShowed * 0.1));
    const newScore = Math.max(0, Math.min(100, baseScore * penaltyFactor));

    await supabase
      .from("player_reliability")
      .update({
        total_events: newTotal,
        events_available: newAvailable,
        events_showed: newShowed,
        events_no_showed: newNoShowed,
        reliability_score: newScore,
      })
      .eq("id", existing.id);
  } else {
    const showedValue = showedUp ? 1 : 0;
    const noShowValue = (saidYes || saidMaybe) && !showedUp ? 1 : 0;

    await supabase.from("player_reliability").insert({
      guild_id: guildId,
      discord_user_id: discordUserId,
      total_events: 1,
      events_available: saidYes || saidMaybe ? 1 : 0,
      events_showed: showedValue,
      events_no_showed: noShowValue,
      reliability_score: showedUp ? 100 : (saidYes ? 0 : 100), // No-show on first event = 0
    });
  }

  // Update player summary
  const { data: reliability } = await supabase
    .from("player_reliability")
    .select("reliability_score")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordUserId)
    .maybeSingle();

  if (reliability) {
    await supabase
      .from("player_summary")
      .update({ reliability_score: reliability.reliability_score })
      .eq("guild_id", guildId)
      .eq("discord_user_id", discordUserId);
  }
}
