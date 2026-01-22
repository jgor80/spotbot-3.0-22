import { useRef, useCallback, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DiscordStanding } from "@/hooks/useGlobalLeaderboard";

interface VirtualDiscordsTableProps {
  discords: DiscordStanding[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function VirtualDiscordsTable({
  discords,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: VirtualDiscordsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedGuilds, setExpandedGuilds] = useState<Set<string>>(new Set());

  // Calculate row heights dynamically based on expansion
  const getItemSize = (index: number) => {
    if (index >= discords.length) return 56; // loader row
    const discord = discords[index];
    const isExpanded = expandedGuilds.has(discord.guild_id);
    if (isExpanded && discord.clubs.length > 1) {
      return 56 + discord.clubs.length * 28 + 16; // base + clubs + padding
    }
    return 56;
  };

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? discords.length + 1 : discords.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    getItemKey: (index) => discords[index]?.guild_id || `loader-${index}`,
    overscan: 10,
  });

  const items = rowVirtualizer.getVirtualItems();

  // Infinite scroll trigger
  const lastItem = items[items.length - 1];
  if (lastItem && lastItem.index >= discords.length - 5 && hasNextPage && !isFetchingNextPage) {
    fetchNextPage();
  }

  const toggleExpand = (guildId: string) => {
    setExpandedGuilds((prev) => {
      const next = new Set(prev);
      if (next.has(guildId)) {
        next.delete(guildId);
      } else {
        next.add(guildId);
      }
      return next;
    });
    // Force re-measure after toggle
    rowVirtualizer.measure();
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-yellow-500 text-yellow-950">🥇 1st</Badge>;
    if (rank === 2) return <Badge className="bg-gray-400 text-gray-950">🥈 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-600 text-amber-950">🥉 3rd</Badge>;
    return <span className="text-muted-foreground font-medium">#{rank}</span>;
  };

  if (discords.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No Discord servers with registered clubs yet.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="grid grid-cols-[60px_1fr_80px_100px_80px_100px_80px] gap-2 px-4 py-3 border-b bg-muted/30 text-sm font-medium text-muted-foreground sticky top-0 z-10">
        <div>Rank</div>
        <div>Discord Server</div>
        <div className="text-center">Clubs</div>
        <div className="text-center">Best ELO</div>
        <div className="text-center hidden sm:block">Avg ELO</div>
        <div className="text-center hidden md:block">W/D/L</div>
        <div className="text-center hidden lg:block">GD</div>
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
            const isLoaderRow = virtualRow.index >= discords.length;
            const discord = discords[virtualRow.index];

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

            const isExpanded = expandedGuilds.has(discord.guild_id);
            const hasMultipleClubs = discord.clubs.length > 1;

            return (
              <div
                key={discord.guild_id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="border-b"
              >
                {/* Main row */}
                <div
                  className={`grid grid-cols-[60px_1fr_80px_100px_80px_100px_80px] gap-2 px-4 py-3 items-center hover:bg-muted/50 ${
                    hasMultipleClubs ? "cursor-pointer" : ""
                  }`}
                  onClick={() => hasMultipleClubs && toggleExpand(discord.guild_id)}
                >
                  <div>{getRankBadge(discord.rank)}</div>
                  <div className="min-w-0 flex items-center gap-2">
                    {hasMultipleClubs && (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{discord.guild_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Top club: {discord.best_club_name}
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <Badge variant="outline">{discord.club_count}</Badge>
                  </div>
                  <div className="text-center">
                    <span className="font-mono font-bold">{discord.best_elo}</span>
                  </div>
                  <div className="text-center hidden sm:block">
                    <span className="font-mono text-muted-foreground">{discord.avg_elo}</span>
                  </div>
                  <div className="text-center hidden md:block">
                    <span className="text-green-500">{discord.wins}</span>/
                    <span className="text-yellow-500">{discord.draws}</span>/
                    <span className="text-red-500">{discord.losses}</span>
                  </div>
                  <div className="text-center hidden lg:block">
                    <span
                      className={
                        discord.goal_difference > 0
                          ? "text-green-500"
                          : discord.goal_difference < 0
                          ? "text-red-500"
                          : ""
                      }
                    >
                      {discord.goal_difference > 0 ? "+" : ""}
                      {discord.goal_difference}
                    </span>
                  </div>
                </div>

                {/* Expanded clubs list */}
                {isExpanded && hasMultipleClubs && (
                  <div className="bg-muted/30 px-4 py-2 pl-16">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      All clubs from {discord.guild_name}:
                    </div>
                    <div className="space-y-1">
                      {discord.clubs
                        .sort((a, b) => b.elo_rating - a.elo_rating)
                        .map((club, i) => (
                          <div
                            key={club.club_name}
                            className="flex items-center gap-4 text-sm"
                          >
                            <span className="text-muted-foreground w-6">#{i + 1}</span>
                            <span className="font-medium">{club.club_name}</span>
                            <span className="font-mono text-muted-foreground">
                              {club.elo_rating} ELO
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({club.matches_played} matches)
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
