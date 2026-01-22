import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GlobalClub {
  id: string;
  rank: number;
  club_name: string;
  guild_name: string;
  ea_platform: string;
  elo_rating: number;
  peak_elo: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  current_streak: number;
  form: string;
  status: string;
}

export interface DiscordStanding {
  guild_id: string;
  guild_name: string;
  rank: number;
  club_count: number;
  best_elo: number;
  avg_elo: number;
  best_club_name: string;
  total_matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  clubs: Array<{ club_name: string; elo_rating: number; matches_played: number }>;
}

interface ClubsResponse {
  clubs: GlobalClub[];
  total: number;
  limit: number;
  offset: number;
}

interface DiscordsResponse {
  discords: DiscordStanding[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 30;

export function useGlobalClubsLeaderboard(
  platform: string,
  search: string,
  enabled: boolean
) {
  return useInfiniteQuery({
    queryKey: ["global-leaderboard", "clubs", platform, search],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase.functions.invoke("get-global-leaderboard", {
        body: {
          limit: PAGE_SIZE,
          offset: pageParam,
          platform: platform === "all" ? undefined : platform,
          search: search || undefined,
          view: "clubs",
        },
      });

      if (error) throw error;
      return data as ClubsResponse;
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    initialPageParam: 0,
    enabled,
    staleTime: 60000, // 1 minute - matches Cache-Control max-age
  });
}

export function useGlobalDiscordsLeaderboard(
  platform: string,
  search: string,
  enabled: boolean
) {
  return useInfiniteQuery({
    queryKey: ["global-leaderboard", "discord", platform, search],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase.functions.invoke("get-global-leaderboard", {
        body: {
          limit: PAGE_SIZE,
          offset: pageParam,
          platform: platform === "all" ? undefined : platform,
          search: search || undefined,
          view: "discord",
        },
      });

      if (error) throw error;
      return data as DiscordsResponse;
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    initialPageParam: 0,
    enabled,
    staleTime: 60000,
  });
}

// Flatten pages into single arrays
export function flattenClubsPages(pages: ClubsResponse[] | undefined): GlobalClub[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.clubs);
}

export function flattenDiscordsPages(pages: DiscordsResponse[] | undefined): DiscordStanding[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.discords);
}
