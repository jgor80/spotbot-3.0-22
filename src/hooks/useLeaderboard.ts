import { useQuery } from "@tanstack/react-query";
import { fetchLeaderboard } from "@/hooks/useSupabaseQuery";
import { LeaderboardPlayer } from "@/types/player";

export function useLeaderboard(
  guildId: string | null,
  type: string = "overall",
  position?: string,
  limit: number = 50
) {
  return useQuery({
    queryKey: ["leaderboard", guildId, type, position, limit],
    queryFn: async (): Promise<LeaderboardPlayer[]> => {
      if (!guildId) throw new Error("No guild selected");
      return fetchLeaderboard(guildId, type, position, limit);
    },
    enabled: !!guildId,
  });
}
