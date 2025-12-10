import { useQuery } from "@tanstack/react-query";
import { fetchAvailablePlayers } from "@/hooks/useSupabaseQuery";
import { LeaderboardPlayer } from "@/types/player";

export function useAvailablePlayers(guildId: string | null) {
  return useQuery({
    queryKey: ["availablePlayers", guildId],
    queryFn: async (): Promise<LeaderboardPlayer[]> => {
      if (!guildId) throw new Error("No guild selected");
      return fetchAvailablePlayers(guildId);
    },
    enabled: !!guildId,
  });
}
