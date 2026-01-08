import { LeaderboardPlayer } from "@/types/player";
import { RatingBadge } from "@/components/player/RatingBadge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

interface MidfielderLeaderboardTableProps {
  players: LeaderboardPlayer[];
  onPlayerClick?: (playerId: string) => void;
}

type SortKey = "rank" | "rating" | "games" | "goals" | "assists" | "passes" | "pass_pct" | "tackles" | "interceptions" | "wins" | "win_rate" | "passes_per_game" | "positions";
type SortDirection = "asc" | "desc";

// Format position counts for display (short version)
function formatPositionCountsShort(positionCounts?: Record<string, number>): string {
  if (!positionCounts || Object.keys(positionCounts).length === 0) return "-";
  const sorted = Object.entries(positionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  return sorted.map(([pos, count]) => `${pos}(${count})`).join(", ");
}

// Format position counts for tooltip (full version)
function formatPositionCountsFull(positionCounts?: Record<string, number>): string[] {
  if (!positionCounts || Object.keys(positionCounts).length === 0) return [];
  return Object.entries(positionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([pos, count]) => `${pos}: ${count} games`);
}

export function MidfielderLeaderboardTable({ players, onPlayerClick }: MidfielderLeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("passes");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection(key === "rank" ? "asc" : "desc");
    }
  };

  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = players.filter((player) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        player.ea_username?.toLowerCase().includes(query) ||
        player.discord_username?.toLowerCase().includes(query)
      );
    });

    return [...filtered].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortKey) {
        case "rank":
          aVal = a.rank;
          bVal = b.rank;
          break;
        case "rating":
          aVal = a.overall_rating;
          bVal = b.overall_rating;
          break;
        case "games":
          aVal = a.games_played;
          bVal = b.games_played;
          break;
        case "goals":
          aVal = a.goals;
          bVal = b.goals;
          break;
        case "assists":
          aVal = a.assists;
          bVal = b.assists;
          break;
        case "passes":
          aVal = a.passes_made || 0;
          bVal = b.passes_made || 0;
          break;
        case "pass_pct":
          aVal = a.pass_attempts > 0 ? ((a.passes_made || 0) / a.pass_attempts) * 100 : 0;
          bVal = b.pass_attempts > 0 ? ((b.passes_made || 0) / b.pass_attempts) * 100 : 0;
          break;
        case "tackles":
          aVal = a.tackles || 0;
          bVal = b.tackles || 0;
          break;
        case "interceptions":
          aVal = a.interceptions || 0;
          bVal = b.interceptions || 0;
          break;
        case "wins":
          aVal = a.wins || 0;
          bVal = b.wins || 0;
          break;
        case "win_rate":
          aVal = a.win_rate || 0;
          bVal = b.win_rate || 0;
          break;
        case "passes_per_game":
          aVal = a.games_played > 0 ? (a.passes_made || 0) / a.games_played : 0;
          bVal = b.games_played > 0 ? (b.passes_made || 0) / b.games_played : 0;
          break;
        case "positions":
          aVal = Object.keys(a.position_counts || {}).length;
          bVal = Object.keys(b.position_counts || {}).length;
          break;
        default:
          return 0;
      }

      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [players, sortKey, sortDirection, searchQuery]);

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const SortableHeader = ({ columnKey, children, className }: { columnKey: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead 
      className={cn("cursor-pointer hover:bg-muted/80 transition-colors select-none", className)}
      onClick={() => handleSort(columnKey)}
    >
      <div className="flex items-center justify-center">
        {children}
        <SortIcon columnKey={columnKey} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search midfielders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-card"
        />
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortableHeader columnKey="rank" className="w-12 text-center">#</SortableHeader>
              <TableHead>Player</TableHead>
              <SortableHeader columnKey="rating" className="text-center">Rating</SortableHeader>
              <SortableHeader columnKey="games" className="text-center hidden md:table-cell">Games</SortableHeader>
              <SortableHeader columnKey="passes" className="text-center bg-primary/10 text-primary font-semibold">Passes</SortableHeader>
              <SortableHeader columnKey="pass_pct" className="text-center hidden lg:table-cell">Pass%</SortableHeader>
              <SortableHeader columnKey="assists" className="text-center">Assists</SortableHeader>
              <SortableHeader columnKey="goals" className="text-center hidden md:table-cell">Goals</SortableHeader>
              <SortableHeader columnKey="tackles" className="text-center hidden lg:table-cell">Tackles</SortableHeader>
              <SortableHeader columnKey="wins" className="text-center hidden md:table-cell">W/D/L</SortableHeader>
              <SortableHeader columnKey="win_rate" className="text-center hidden lg:table-cell">Win%</SortableHeader>
              <SortableHeader columnKey="passes_per_game" className="text-center hidden lg:table-cell">Pass/G</SortableHeader>
              <SortableHeader columnKey="positions" className="text-center hidden xl:table-cell">Positions</SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedPlayers.map((player) => {
              const passPct = player.pass_attempts > 0 ? ((player.passes_made || 0) / player.pass_attempts) * 100 : 0;
              const passesPerGame = player.games_played > 0 ? (player.passes_made || 0) / player.games_played : 0;
              const positionsShort = formatPositionCountsShort(player.position_counts);
              const positionsFull = formatPositionCountsFull(player.position_counts);

              return (
                <TableRow
                  key={player.discord_user_id}
                  onClick={() => onPlayerClick?.(player.discord_user_id)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted/50",
                    player.rank <= 3 && "bg-primary/5"
                  )}
                >
                  <TableCell className="text-center font-bold">
                    {player.rank <= 3 ? (
                      <span className="text-lg">
                        {player.rank === 1 && "🥇"}
                        {player.rank === 2 && "🥈"}
                        {player.rank === 3 && "🥉"}
                      </span>
                    ) : player.rank}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-medium text-sm">
                        {(player.ea_username || player.discord_username)?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{player.ea_username || player.discord_username || "Unknown"}</p>
                          {player.primary_position && (
                            <Badge variant="outline" className="text-xs mt-0.5">{player.primary_position}</Badge>
                          )}
                        </div>
                        {player.discord_user_id.startsWith('ea_') && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-amber-500/20 text-amber-500">
                                  <AlertTriangle className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-sm">Unlinked EA account</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center"><RatingBadge rating={player.overall_rating} size="sm" /></TableCell>
                  <TableCell className="text-center hidden md:table-cell">{player.games_played}</TableCell>
                  <TableCell className="text-center font-bold text-primary">{player.passes_made || 0}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{passPct.toFixed(0)}%</TableCell>
                  <TableCell className="text-center">{player.assists}</TableCell>
                  <TableCell className="text-center hidden md:table-cell">{player.goals}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{player.tackles || 0}</TableCell>
                  <TableCell className="text-center hidden md:table-cell text-xs">
                    <span className="text-primary">{player.wins || 0}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{player.draws || 0}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-destructive">{player.losses || 0}</span>
                  </TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{(player.win_rate || 0).toFixed(0)}%</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{passesPerGame.toFixed(1)}</TableCell>
                  <TableCell className="text-center hidden xl:table-cell text-xs text-muted-foreground">
                    {positionsFull.length > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="cursor-help underline decoration-dotted">
                            {positionsShort}
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-sm space-y-1">
                              <p className="font-semibold mb-1">Positions Played</p>
                              {positionsFull.map((line, i) => (
                                <p key={i}>{line}</p>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
