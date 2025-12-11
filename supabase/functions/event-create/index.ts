import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation helpers (inline to avoid import issues in Deno edge functions)
const DISCORD_ID_REGEX = /^\d{17,19}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateDiscordId(value: unknown, fieldName: string): string | null {
  if (typeof value !== "string" || !DISCORD_ID_REGEX.test(value)) {
    return `${fieldName} must be a valid Discord ID (17-19 digits)`;
  }
  return null;
}

function validateString(value: unknown, fieldName: string, maxLength = 500): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return `${fieldName} is required`;
  }
  if (value.length > maxLength) {
    return `${fieldName} must be at most ${maxLength} characters`;
  }
  return null;
}

const EVENT_TYPES = ["match", "practice", "tournament", "draft", "league"] as const;

interface EventCreateRequest {
  guild_id: string;
  created_by_discord_id: string;
  title: string;
  description?: string;
  event_type: "match" | "practice" | "tournament" | "draft" | "league";
  scheduled_at: string;
  duration_minutes?: number;
  team_id?: string;
  channel_id?: string;
  invite_player_ids?: string[];
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
    }: EventCreateRequest = body;

    // Input validation
    const errors: string[] = [];
    
    const guildIdError = validateDiscordId(guild_id, "guild_id");
    if (guildIdError) errors.push(guildIdError);
    
    const creatorError = validateDiscordId(created_by_discord_id, "created_by_discord_id");
    if (creatorError) errors.push(creatorError);
    
    const titleError = validateString(title, "title", 200);
    if (titleError) errors.push(titleError);
    
    if (description && typeof description === "string" && description.length > 2000) {
      errors.push("description must be at most 2000 characters");
    }
    
    if (!EVENT_TYPES.includes(event_type)) {
      errors.push(`event_type must be one of: ${EVENT_TYPES.join(", ")}`);
    }
    
    if (!scheduled_at || isNaN(new Date(scheduled_at).getTime())) {
      errors.push("scheduled_at must be a valid ISO date");
    }
    
    if (duration_minutes !== undefined && (typeof duration_minutes !== "number" || duration_minutes < 1 || duration_minutes > 1440)) {
      errors.push("duration_minutes must be between 1 and 1440");
    }
    
    if (team_id && !UUID_REGEX.test(team_id)) {
      errors.push("team_id must be a valid UUID");
    }
    
    if (channel_id && !DISCORD_ID_REGEX.test(channel_id)) {
      errors.push("channel_id must be a valid Discord ID");
    }
    
    if (invite_player_ids) {
      if (!Array.isArray(invite_player_ids)) {
        errors.push("invite_player_ids must be an array");
      } else if (invite_player_ids.length > 100) {
        errors.push("invite_player_ids must have at most 100 items");
      } else {
        for (let i = 0; i < invite_player_ids.length; i++) {
          if (!DISCORD_ID_REGEX.test(invite_player_ids[i])) {
            errors.push(`invite_player_ids[${i}] must be a valid Discord ID`);
            break;
          }
        }
      }
    }
    
    if (errors.length > 0) {
      console.log(`[event-create] Validation failed: ${errors.join("; ")}`);
      return new Response(
        JSON.stringify({ error: "Validation failed", details: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[event-create] ${created_by_discord_id} creating event "${title}" for ${scheduled_at}`);

    // Verify creator has permission (admin, moderator, captain, or manager)
    const { data: hasPermission, error: permError } = await supabase.rpc("has_any_role", {
      _guild_id: guild_id,
      _discord_user_id: created_by_discord_id,
      _roles: ["admin", "moderator", "captain", "manager"],
    });

    if (permError) {
      console.error("[event-create] Permission check error:", permError);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce permission check - user must have an appropriate role
    if (hasPermission !== true) {
      console.log(`[event-create] Permission denied for ${created_by_discord_id}`);
      return new Response(
        JSON.stringify({ error: "You don't have permission to create events. Required role: admin, moderator, captain, or manager." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
