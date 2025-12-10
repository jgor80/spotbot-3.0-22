import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface GuildStats {
  totalPlayers: number;
  draftsThisMonth: number;
  avgRating: number;
  totalCompetitionWins: number;
}

export function useGuildStats(guildId: string | null) {
  return useQuery({
    queryKey: ["guildStats", guildId],
    queryFn: async (): Promise<GuildStats> => {
      if (!guildId) throw new Error("No guild selected");

      // Fetch player count
      const { count: playerCount } = await supabase
        .from("player_summary")
        .select("*", { count: "exact", head: true })
        .eq("guild_id", guildId);

      // Fetch avg rating
      const { data: ratingData } = await supabase
        .from("player_summary")
        .select("overall_rating")
        .eq("guild_id", guildId);

      const avgRating = ratingData?.length
        ? ratingData.reduce((sum, p) => sum + (p.overall_rating || 0), 0) / ratingData.length
        : 0;

      // Fetch drafts this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count: draftCount } = await supabase
        .from("drafts")
        .select("*", { count: "exact", head: true })
        .eq("guild_id", guildId)
        .gte("created_at", startOfMonth.toISOString());

      // Fetch competition wins
      const { count: winsCount } = await supabase
        .from("competition_wins")
        .select("*", { count: "exact", head: true })
        .eq("guild_id", guildId)
        .eq("verified", true);

      return {
        totalPlayers: playerCount || 0,
        draftsThisMonth: draftCount || 0,
        avgRating: Math.round(avgRating * 10) / 10,
        totalCompetitionWins: winsCount || 0,
      };
    },
    enabled: !!guildId,
  });
}
