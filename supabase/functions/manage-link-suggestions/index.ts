import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManageLinkSuggestionRequest {
  action: "reject";
  guild_id: string;
  discord_user_id: string;
  suggestion_id: string;
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

    const body: ManageLinkSuggestionRequest = await req.json();
    const { action, guild_id, discord_user_id, suggestion_id } = body;

    // Validate required fields
    if (!action || !guild_id || !discord_user_id || !suggestion_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin/moderator role
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

    // Verify suggestion belongs to this guild
    const { data: suggestion } = await supabase
      .from("link_suggestions")
      .select("id, guild_id")
      .eq("id", suggestion_id)
      .single();

    if (!suggestion || suggestion.guild_id !== guild_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Suggestion not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reject") {
      const { error } = await supabase
        .from("link_suggestions")
        .update({ 
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: discord_user_id,
        })
        .eq("id", suggestion_id);

      if (error) throw error;

      console.log(`Link suggestion rejected: ${suggestion_id} by ${discord_user_id}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in manage-link-suggestions:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
