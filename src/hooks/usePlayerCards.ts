import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { useAuth } from "@/contexts/AuthContext";

export function usePlayerCards() {
  const { selectedGuildId } = useGuild();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["renderedPlayerCards", selectedGuildId, user?.id],
    enabled: !!selectedGuildId && !!user,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.functions.invoke("player-cards", { body: { action: "latest", guild_id: selectedGuildId } });
      if (error) throw error;
      return Object.fromEntries((data?.cards ?? []).filter((card: { front_url: string | null }) => card.front_url).map((card: { discord_user_id: string; front_url: string }) => [card.discord_user_id, card.front_url]));
    },
  });
}