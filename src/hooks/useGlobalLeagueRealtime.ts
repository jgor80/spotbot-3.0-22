import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseGlobalLeagueRealtimeOptions {
  enabled?: boolean;
  guildIds?: string[];
}

/**
 * Selective real-time subscription for Global League updates.
 * Only subscribes to changes affecting visible guilds to minimize overhead.
 */
export function useGlobalLeagueRealtime({
  enabled = true,
  guildIds = [],
}: UseGlobalLeagueRealtimeOptions = {}) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Create channel for global league updates
    const channel = supabase.channel("global-league-updates");

    // Subscribe to LFG status changes
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "global_league_clubs",
        filter: guildIds.length > 0 ? `guild_id=in.(${guildIds.join(",")})` : undefined,
      },
      (payload) => {
        // Invalidate LFG queries when status changes
        if (
          payload.old &&
          payload.new &&
          (payload.old as any).lfg_status !== (payload.new as any).lfg_status
        ) {
          queryClient.invalidateQueries({ queryKey: ["lfg-clubs"] });
        }

        // Invalidate leaderboard queries for ELO changes
        if (
          payload.old &&
          payload.new &&
          (payload.old as any).elo_rating !== (payload.new as any).elo_rating
        ) {
          queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
        }
      }
    );

    // Subscribe to new clubs being registered
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "global_league_clubs",
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
        queryClient.invalidateQueries({ queryKey: ["lfg-clubs"] });
      }
    );

    // Subscribe to match completions (affects ELO)
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "global_league_matches",
        filter: "status=eq.completed",
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      }
    );

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, guildIds.join(","), queryClient]);

  return channelRef.current;
}
