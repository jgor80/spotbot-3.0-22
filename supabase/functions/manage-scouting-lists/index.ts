import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManageScoutingListRequest {
  action: "create" | "update" | "delete";
  guild_id: string;
  discord_user_id: string;
  // For create
  name?: string;
  description?: string;
  is_public?: boolean;
  // For update/delete
  list_id?: string;
  player_ids?: string[];
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

    const body: ManageScoutingListRequest = await req.json();
    const { action, guild_id, discord_user_id, name, description, is_public, list_id, player_ids } = body;

    // Validate required fields
    if (!action || !guild_id || !discord_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create") {
      if (!name?.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: "List name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("scouting_lists")
        .insert({
          guild_id,
          created_by_discord_id: discord_user_id,
          name: name.trim(),
          description: description || null,
          is_public: is_public || false,
          player_ids: [],
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`Scouting list created: ${name} in guild ${guild_id} by ${discord_user_id}`);

      return new Response(
        JSON.stringify({ success: true, list: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update" || action === "delete") {
      if (!list_id) {
        return new Response(
          JSON.stringify({ success: false, error: "List ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify list ownership or user has role
      const { data: list } = await supabase
        .from("scouting_lists")
        .select("id, guild_id, created_by_discord_id")
        .eq("id", list_id)
        .single();

      if (!list || list.guild_id !== guild_id) {
        return new Response(
          JSON.stringify({ success: false, error: "List not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user is owner or has admin/scout role
      const isOwner = list.created_by_discord_id === discord_user_id;
      let hasRole = false;
      
      if (!isOwner) {
        const { data: roleCheck } = await supabase.rpc("has_any_role", {
          _guild_id: guild_id,
          _discord_user_id: discord_user_id,
          _roles: ["admin", "moderator", "scout"],
        });
        hasRole = !!roleCheck;
      }

      if (!isOwner && !hasRole) {
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "update") {
        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (is_public !== undefined) updateData.is_public = is_public;
        if (player_ids !== undefined) updateData.player_ids = player_ids;

        const { error } = await supabase
          .from("scouting_lists")
          .update(updateData)
          .eq("id", list_id);

        if (error) throw error;

        console.log(`Scouting list updated: ${list_id} by ${discord_user_id}`);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "delete") {
        const { error } = await supabase
          .from("scouting_lists")
          .delete()
          .eq("id", list_id);

        if (error) throw error;

        console.log(`Scouting list deleted: ${list_id} by ${discord_user_id}`);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in manage-scouting-lists:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
