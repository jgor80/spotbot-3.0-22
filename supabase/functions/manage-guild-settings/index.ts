import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateGuildSettingsRequest {
  guild_id: string;
  discord_user_id?: string;
  clubs?: Array<{
    key: string;
    name: string;
    enabled: boolean;
    ea_club_id?: string;
    ea_platform?: string;
    monitoring_enabled?: boolean;
  }>;
  feedback_enabled?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: UpdateGuildSettingsRequest = await req.json();
    const { guild_id, discord_user_id, clubs, feedback_enabled } = body;

    // Validate required fields
    if (!guild_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin/moderator role (only if discord_user_id provided)
    if (discord_user_id) {
      // First, check if ANY roles exist for this guild - if not, allow operation (initial setup)
      const { data: anyRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("guild_id", guild_id)
        .limit(1);

      const hasNoRolesConfigured = !anyRoles || anyRoles.length === 0;

      if (!hasNoRolesConfigured) {
        // Roles exist, check if user has permission
        const { data: hasRole } = await supabase.rpc("has_any_role", {
          _guild_id: guild_id,
          _discord_user_id: discord_user_id,
          _roles: ["admin", "moderator"],
        });

        if (!hasRole) {
          return new Response(
            JSON.stringify({ success: false, error: "Insufficient permissions" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.log(`No roles configured for guild ${guild_id}, allowing operation`);
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (clubs !== undefined) {
      // Validate no duplicate EA club IDs
      const eaClubIds = clubs.filter(c => c.ea_club_id).map(c => c.ea_club_id);
      const uniqueIds = new Set(eaClubIds);
      if (eaClubIds.length !== uniqueIds.size) {
        return new Response(
          JSON.stringify({ success: false, error: "Duplicate EA club IDs detected" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      updateData.clubs = clubs;
    }

    if (feedback_enabled !== undefined) {
      updateData.feedback_enabled = feedback_enabled;
    }

    const { error } = await supabase
      .from("guild_settings")
      .update(updateData)
      .eq("guild_id", guild_id);

    if (error) throw error;

    console.log(`Guild settings updated for ${guild_id}${discord_user_id ? ` by ${discord_user_id}` : ''}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in manage-guild-settings:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
