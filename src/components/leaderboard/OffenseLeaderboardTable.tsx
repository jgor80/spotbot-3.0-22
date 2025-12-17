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
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

interface OffenseLeaderboardTableProps {
  players: LeaderboardPlayer[];
  onPlayerClick?: (playerId: string) => void;
}

type SortKey = "rank" | "rating" | "games" | "goals" | "assists" | "shots" | "shot_conv" | "dribbles" | "offsides" | "ga_per_game";
type SortDirection = "asc" | "desc";

export function OffenseLeaderboardTable({ players, onPlayerClick }: OffenseLeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("goals");
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
        case "shots":
          aVal = a.shots || 0;
          bVal = b.shots || 0;
          break;
        case "shot_conv":
          aVal = a.shots > 0 ? (a.goals / a.shots) * 100 : 0;
          bVal = b.shots > 0 ? (b.goals / b.shots) * 100 : 0;
          break;
        case "dribbles":
          aVal = a.dribbles || 0;
          bVal = b.dribbles || 0;
          break;
        case "offsides":
          aVal = a.offsides || 0;
          bVal = b.offsides || 0;
          break;
        case "ga_per_game":
          aVal = a.games_played > 0 ? (a.goals + a.assists) / a.games_played : 0;
          bVal = b.games_played > 0 ? (b.goals + b.assists) / b.games_played : 0;
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
          placeholder="Search attackers..."
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
              <SortableHeader columnKey="goals" className="text-center bg-primary/10 text-primary font-semibold">Goals</SortableHeader>
              <SortableHeader columnKey="assists" className="text-center">Assists</SortableHeader>
              <SortableHeader columnKey="shots" className="text-center hidden lg:table-cell">Shots</SortableHeader>
              <SortableHeader columnKey="shot_conv" className="text-center hidden lg:table-cell">Conv%</SortableHeader>
              <SortableHeader columnKey="dribbles" className="text-center hidden xl:table-cell">Dribbles</SortableHeader>
              <SortableHeader columnKey="offsides" className="text-center hidden xl:table-cell">Offsides</SortableHeader>
              <SortableHeader columnKey="ga_per_game" className="text-center hidden md:table-cell">G+A/G</SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedPlayers.map((player) => {
              const shotConv = player.shots > 0 ? (player.goals / player.shots) * 100 : 0;
              const gaPerGame = player.games_played > 0 ? (player.goals + player.assists) / player.games_played : 0;

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
                  <TableCell className="text-center font-bold text-primary">{player.goals}</TableCell>
                  <TableCell className="text-center">{player.assists}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{player.shots || 0}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{shotConv.toFixed(0)}%</TableCell>
                  <TableCell className="text-center hidden xl:table-cell">{player.dribbles || 0}</TableCell>
                  <TableCell className="text-center hidden xl:table-cell">{player.offsides || 0}</TableCell>
                  <TableCell className="text-center hidden md:table-cell">{gaPerGame.toFixed(2)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
