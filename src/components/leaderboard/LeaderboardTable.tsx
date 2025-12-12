import { LeaderboardPlayer } from "@/types/player";
import { RatingBadge } from "@/components/player/RatingBadge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

interface LeaderboardTableProps {
  players: LeaderboardPlayer[];
  onPlayerClick?: (playerId: string) => void;
}

type SortKey = "rank" | "rating" | "games" | "wins" | "win_rate" | "goals" | "assists" | "clean_sheets" | "motm" | "pass_pct";
type SortDirection = "asc" | "desc";

export function LeaderboardTable({ players, onPlayerClick }: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Default to descending for most stats (higher is better), ascending for rank
      setSortDirection(key === "rank" ? "asc" : "desc");
    }
  };

  const sortedPlayers = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
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
        case "wins":
          aVal = a.wins;
          bVal = b.wins;
          break;
        case "win_rate":
          aVal = a.win_rate || 0;
          bVal = b.win_rate || 0;
          break;
        case "goals":
          aVal = a.goals;
          bVal = b.goals;
          break;
        case "assists":
          aVal = a.assists;
          bVal = b.assists;
          break;
        case "clean_sheets":
          aVal = a.clean_sheets || 0;
          bVal = b.clean_sheets || 0;
          break;
        case "motm":
          aVal = a.man_of_match || 0;
          bVal = b.man_of_match || 0;
          break;
        case "pass_pct":
          aVal = a.pass_attempts > 0 ? (a.passes_made / a.pass_attempts) * 100 : 0;
          bVal = b.pass_attempts > 0 ? (b.passes_made / b.pass_attempts) * 100 : 0;
          break;
        default:
          return 0;
      }

      if (sortDirection === "asc") {
        return aVal - bVal;
      }
      return bVal - aVal;
    });
    return sorted;
  }, [players, sortKey, sortDirection]);

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
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <SortableHeader columnKey="rank" className="w-12 text-center">#</SortableHeader>
            <TableHead>Player</TableHead>
            <SortableHeader columnKey="rating" className="text-center">Rating</SortableHeader>
            <SortableHeader columnKey="games" className="text-center hidden md:table-cell">Games</SortableHeader>
            <SortableHeader columnKey="wins" className="text-center hidden md:table-cell">W/D/L</SortableHeader>
            <SortableHeader columnKey="win_rate" className="text-center hidden lg:table-cell">Win%</SortableHeader>
            <SortableHeader columnKey="goals" className="text-center hidden sm:table-cell">Goals</SortableHeader>
            <SortableHeader columnKey="assists" className="text-center hidden sm:table-cell">Assists</SortableHeader>
            <SortableHeader columnKey="clean_sheets" className="text-center hidden lg:table-cell">CS</SortableHeader>
            <SortableHeader columnKey="motm" className="text-center hidden lg:table-cell">MotM</SortableHeader>
            <SortableHeader columnKey="pass_pct" className="text-center hidden xl:table-cell">Pass%</SortableHeader>
            <TableHead className="text-center">Form</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPlayers.map((player) => {
            const formTrend = player.form_rating 
              ? player.form_rating > 60 ? "up" : player.form_rating < 40 ? "down" : "neutral"
              : "neutral";

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
                  ) : (
                    player.rank
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-medium text-sm">
                      {(player.ea_username || player.discord_username)?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium">{player.ea_username || player.discord_username || "Unknown"}</p>
                        {player.ea_username && player.discord_username && (
                          <p className="text-xs text-muted-foreground">{player.discord_username}</p>
                        )}
                        {player.primary_position && (
                          <Badge variant="outline" className="text-xs mt-0.5">
                            {player.primary_position}
                          </Badge>
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
                              <p className="text-sm">Unlinked EA account - needs Discord linking</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <RatingBadge rating={player.overall_rating} size="sm" />
                </TableCell>
                <TableCell className="text-center hidden md:table-cell">
                  {player.games_played}
                </TableCell>
                <TableCell className="text-center hidden md:table-cell text-xs">
                  <span className="text-primary">{player.wins}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">{player.draws}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-destructive">{player.losses}</span>
                </TableCell>
                <TableCell className="text-center hidden lg:table-cell">
                  {player.win_rate?.toFixed(0)}%
                </TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  {player.goals}
                </TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  {player.assists}
                </TableCell>
                <TableCell className="text-center hidden lg:table-cell">
                  {player.clean_sheets || 0}
                </TableCell>
                <TableCell className="text-center hidden lg:table-cell">
                  {player.man_of_match || 0}
                </TableCell>
                <TableCell className="text-center hidden xl:table-cell">
                  {player.pass_attempts > 0 
                    ? ((player.passes_made / player.pass_attempts) * 100).toFixed(0) + '%'
                    : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    {formTrend === "up" && <TrendingUp className="h-5 w-5 text-primary" />}
                    {formTrend === "down" && <TrendingDown className="h-5 w-5 text-destructive" />}
                    {formTrend === "neutral" && <Minus className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
