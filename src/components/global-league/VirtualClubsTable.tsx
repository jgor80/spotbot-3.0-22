import { useRef, useCallback, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { GlobalClub } from "@/hooks/useGlobalLeaderboard";
import { LazyClubProfileCard } from "./LazyClubProfileCard";

interface VirtualClubsTableProps {
  clubs: GlobalClub[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function VirtualClubsTable({
  clubs,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: VirtualClubsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [hoveredClubId, setHoveredClubId] = useState<string | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? clubs.length + 1 : clubs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const items = rowVirtualizer.getVirtualItems();

  // Infinite scroll trigger
  const lastItem = items[items.length - 1];
  const loadMore = useCallback(() => {
    if (
      lastItem &&
      lastItem.index >= clubs.length - 5 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [lastItem, clubs.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Check for load more on scroll
  if (lastItem && lastItem.index >= clubs.length - 5 && hasNextPage && !isFetchingNextPage) {
    loadMore();
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-yellow-500 text-yellow-950">🥇 1st</Badge>;
    if (rank === 2) return <Badge className="bg-gray-400 text-gray-950">🥈 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-600 text-amber-950">🥉 3rd</Badge>;
    return <span className="text-muted-foreground font-medium">#{rank}</span>;
  };

  const getStreakDisplay = (streak: number) => {
    if (streak > 0) {
      return (
        <span className="flex items-center gap-1 text-green-500">
          <TrendingUp className="h-3 w-3" />
          W{streak}
        </span>
      );
    } else if (streak < 0) {
      return (
        <span className="flex items-center gap-1 text-red-500">
          <TrendingDown className="h-3 w-3" />
          L{Math.abs(streak)}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" />-
      </span>
    );
  };

  const getFormDisplay = (form: string) => {
    return form.split("").map((result, i) => (
      <span
        key={i}
        className={`inline-flex w-5 h-5 rounded text-xs font-bold items-center justify-center ${
          result === "W"
            ? "bg-green-500/20 text-green-500"
            : result === "L"
            ? "bg-red-500/20 text-red-500"
            : result === "D"
            ? "bg-yellow-500/20 text-yellow-500"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {result}
      </span>
    ));
  };

  if (clubs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No clubs registered in the Global League yet.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="grid grid-cols-[60px_1fr_100px_80px_80px_80px_100px] gap-2 px-4 py-3 border-b bg-muted/30 text-sm font-medium text-muted-foreground sticky top-0 z-10">
        <div>Rank</div>
        <div>Club</div>
        <div className="text-center">ELO</div>
        <div className="text-center hidden sm:block">W/D/L</div>
        <div className="text-center hidden lg:block">GD</div>
        <div className="text-center hidden lg:block">Streak</div>
        <div className="hidden xl:block">Form</div>
      </div>

      {/* Virtualized rows */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: "calc(100vh - 400px)", minHeight: "400px" }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualRow) => {
            const isLoaderRow = virtualRow.index >= clubs.length;
            const club = clubs[virtualRow.index];

            if (isLoaderRow) {
              return (
                <div
                  key="loader"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center justify-center text-muted-foreground text-sm"
                >
                  {isFetchingNextPage ? "Loading more..." : "Load more"}
                </div>
              );
            }

            return (
              <div
                key={club.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="grid grid-cols-[60px_1fr_100px_80px_80px_80px_100px] gap-2 px-4 items-center border-b hover:bg-muted/50 cursor-pointer"
                onMouseEnter={() => setHoveredClubId(club.id)}
                onMouseLeave={() => setHoveredClubId(null)}
              >
                <div>{getRankBadge(club.rank)}</div>
                <div className="relative min-w-0">
                  <div className="font-medium truncate">{club.club_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {club.guild_name} • {club.ea_platform.replace("-", " ")}
                  </div>
                  {hoveredClubId === club.id && (
                    <LazyClubProfileCard club={club} />
                  )}
                </div>
                <div className="text-center">
                  <span className="font-mono font-bold">{club.elo_rating}</span>
                  {club.elo_rating === club.peak_elo && club.matches_played > 5 && (
                    <span className="ml-1 text-yellow-500">★</span>
                  )}
                </div>
                <div className="text-center hidden sm:block">
                  <span className="text-green-500">{club.wins}</span>/
                  <span className="text-yellow-500">{club.draws}</span>/
                  <span className="text-red-500">{club.losses}</span>
                </div>
                <div className="text-center hidden lg:block">
                  <span
                    className={
                      club.goal_difference > 0
                        ? "text-green-500"
                        : club.goal_difference < 0
                        ? "text-red-500"
                        : ""
                    }
                  >
                    {club.goal_difference > 0 ? "+" : ""}
                    {club.goal_difference}
                  </span>
                </div>
                <div className="text-center hidden lg:block">
                  {getStreakDisplay(club.current_streak)}
                </div>
                <div className="hidden xl:block">
                  <div className="flex gap-0.5">{getFormDisplay(club.form)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
