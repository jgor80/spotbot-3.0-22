import { useQuery } from "@tanstack/react-query";
import { fetchPlayerProfile } from "@/hooks/useSupabaseQuery";
import { PlayerProfile } from "@/types/player";

export function usePlayerProfile(guildId: string | null, discordUserId: string | null) {
  return useQuery({
    queryKey: ["playerProfile", guildId, discordUserId],
    queryFn: async (): Promise<PlayerProfile | null> => {
      if (!guildId || !discordUserId) throw new Error("Missing guild or user ID");
      return fetchPlayerProfile(guildId, discordUserId, {
        includePositionBreakdown: true,
        includeChemistry: true,
        includeVibeChemistry: true,
        includeRecentGames: true,
      });
    },
    enabled: !!guildId && !!discordUserId,
  });
}
