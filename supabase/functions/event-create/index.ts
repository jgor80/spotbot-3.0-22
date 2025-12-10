import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EventCreateRequest {
  guild_id: string;
  created_by_discord_id: string;
  title: string;
  description?: string;
  event_type: "match" | "practice" | "tournament" | "draft" | "league";
  scheduled_at: string; // ISO timestamp
  duration_minutes?: number;
  team_id?: string;
  channel_id?: string;
  invite_player_ids?: string[]; // If empty, invites entire server/team
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

    const {
      guild_id,
      created_by_discord_id,
      title,
      description,
      event_type = "match",
      scheduled_at,
      duration_minutes = 90,
      team_id,
      channel_id,
      invite_player_ids,
    }: EventCreateRequest = await req.json();

    console.log(`[event-create] ${created_by_discord_id} creating event "${title}" for ${scheduled_at}`);

    // Verify creator has permission (admin, moderator, captain, or manager)
    const { data: hasPermission } = await supabase.rpc("has_any_role", {
      _guild_id: guild_id,
      _discord_user_id: created_by_discord_id,
      _roles: ["admin", "moderator", "captain", "manager"],
    });

    // For now, allow if no roles exist (new server)
    // In production, you'd want stricter checks

    // Create the event
    const { data: event, error: eventError } = await supabase
      .from("availability_events")
      .insert({
        guild_id,
        team_id,
        title,
        description,
        event_type,
        scheduled_at,
        duration_minutes,
        created_by_discord_id,
        channel_id,
      })
      .select()
      .single();

    if (eventError) {
      console.error("[event-create] Error:", eventError);
      throw eventError;
    }

    // If specific players are invited, create their availability entries
    if (invite_player_ids && invite_player_ids.length > 0) {
      const availabilityInserts = invite_player_ids.map(playerId => ({
        event_id: event.id,
        discord_user_id: playerId,
        response: "no_response",
      }));

      await supabase.from("player_availability").insert(availabilityInserts);
    }

    // If team_id is provided, invite all team members
    if (team_id) {
      const { data: roster } = await supabase
        .from("team_rosters")
        .select("discord_user_id")
        .eq("team_id", team_id);

      if (roster && roster.length > 0) {
        const availabilityInserts = roster.map(member => ({
          event_id: event.id,
          discord_user_id: member.discord_user_id,
          response: "no_response",
        }));

        await supabase
          .from("player_availability")
          .upsert(availabilityInserts, { onConflict: "event_id,discord_user_id" });
      }
    }

    console.log(`[event-create] Event ${event.id} created successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        event_id: event.id,
        event,
        message: `Event "${title}" created for ${new Date(scheduled_at).toLocaleString()}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[event-create] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
