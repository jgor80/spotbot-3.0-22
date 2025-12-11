import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation helpers
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface MarkAttendanceRequest {
  guild_id: string;
  event_id: string;
  recorded_by_discord_id: string;
  attendance: {
    discord_user_id: string;
    showed_up: boolean;
  }[];
}

function validateRequest(body: any): string[] {
  const errors: string[] = [];
  
  if (!body.guild_id || !DISCORD_ID_REGEX.test(body.guild_id)) {
    errors.push("guild_id must be a valid Discord ID");
  }
  if (!body.event_id || !UUID_REGEX.test(body.event_id)) {
    errors.push("event_id must be a valid UUID");
  }
  if (!body.recorded_by_discord_id || !DISCORD_ID_REGEX.test(body.recorded_by_discord_id)) {
    errors.push("recorded_by_discord_id must be a valid Discord ID");
  }
  
  if (!Array.isArray(body.attendance)) {
    errors.push("attendance must be an array");
  } else if (body.attendance.length === 0) {
    errors.push("attendance must have at least 1 record");
  } else if (body.attendance.length > 50) {
    errors.push("attendance must have at most 50 records");
  } else {
    for (let i = 0; i < body.attendance.length; i++) {
      const record = body.attendance[i];
      if (!record.discord_user_id || !DISCORD_ID_REGEX.test(record.discord_user_id)) {
        errors.push(`attendance[${i}].discord_user_id must be a valid Discord ID`);
        break;
      }
      if (typeof record.showed_up !== "boolean") {
        errors.push(`attendance[${i}].showed_up must be a boolean`);
        break;
      }
    }
  }
  
  return errors;
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

    const body = await req.json();
    
    // Validate input
    const errors = validateRequest(body);
    if (errors.length > 0) {
      console.log(`[mark-attendance] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { guild_id, event_id, recorded_by_discord_id, attendance }: MarkAttendanceRequest = body;

    console.log(`[mark-attendance] Recording attendance for event ${event_id}, ${attendance.length} players`);

    // Verify recorder has permission (admin, moderator, captain, or manager)
    const { data: hasPermission, error: permError } = await supabase.rpc("has_any_role", {
      _guild_id: guild_id,
      _discord_user_id: recorded_by_discord_id,
      _roles: ["admin", "moderator", "captain", "manager"],
    });

    if (permError) {
      console.error("[mark-attendance] Permission check error:", permError);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce permission check
    if (hasPermission !== true) {
      console.log(`[mark-attendance] Permission denied for ${recorded_by_discord_id}`);
      return new Response(
        JSON.stringify({ error: "You don't have permission to mark attendance. Required role: admin, moderator, captain, or manager." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

  if (existing) {
    const newTotal = existing.total_events + 1;
    const newAvailable = existing.events_available + (saidYes || saidMaybe ? 1 : 0);
    const newShowed = existing.events_showed + (showedUp ? 1 : 0);
    const newNoShowed = existing.events_no_showed + ((saidYes || saidMaybe) && !showedUp ? 1 : 0);

    const baseScore = newShowed > 0 ? (newShowed / Math.max(1, newAvailable)) * 100 : 100;
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
      reliability_score: showedUp ? 100 : (saidYes ? 0 : 100),
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
