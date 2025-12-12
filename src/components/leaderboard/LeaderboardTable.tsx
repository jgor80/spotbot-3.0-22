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
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardTableProps {
  players: LeaderboardPlayer[];
  onPlayerClick?: (playerId: string) => void;
}

export function LeaderboardTable({ players, onPlayerClick }: LeaderboardTableProps) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center">#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead className="text-center">Rating</TableHead>
            <TableHead className="text-center hidden md:table-cell">Games</TableHead>
            <TableHead className="text-center hidden md:table-cell">Wins</TableHead>
            <TableHead className="text-center hidden sm:table-cell">Goals</TableHead>
            <TableHead className="text-center hidden sm:table-cell">Assists</TableHead>
            <TableHead className="text-center">Form</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player) => {
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
                <TableCell className="text-center hidden md:table-cell">
                  {player.wins}
                </TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  {player.goals}
                </TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  {player.assists}
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
