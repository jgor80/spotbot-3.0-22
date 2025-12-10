import { LeaderboardPlayer } from "@/types/player";
import { RatingBadge } from "./RatingBadge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerCardProps {
  player: LeaderboardPlayer;
  rank?: number;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}

export function PlayerCard({ player, rank, onClick, selected, compact }: PlayerCardProps) {
  const formTrend = player.form_rating 
    ? player.form_rating > 60 ? "up" : player.form_rating < 40 ? "down" : "neutral"
    : "neutral";

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
          selected 
            ? "border-primary bg-primary/10" 
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <RatingBadge rating={player.overall_rating} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{player.discord_username || "Unknown"}</p>
          <p className="text-xs text-muted-foreground">{player.primary_position || "ANY"}</p>
        </div>
        {selected && (
          <Badge variant="default" className="shrink-0">Selected</Badge>
        )}
      </div>
    );
  }

  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative overflow-hidden cursor-pointer transition-all hover:shadow-lg",
        selected && "ring-2 ring-primary"
      )}
    >
      {rank && (
        <div className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
          #{rank}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-4">
          <RatingBadge rating={player.overall_rating} size="lg" showTier />

          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-semibold truncate">
              {player.discord_username || "Unknown Player"}
            </h3>
            
            <div className="flex items-center gap-2 mt-1">
              {player.primary_position && (
                <Badge variant="secondary" className="text-xs">
                  {player.primary_position}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {player.games_played} games
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-primary">{player.wins}</p>
                <p className="text-xs text-muted-foreground">Wins</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{player.goals}</p>
                <p className="text-xs text-muted-foreground">Goals</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{player.assists}</p>
                <p className="text-xs text-muted-foreground">Assists</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            {formTrend === "up" && <TrendingUp className="h-5 w-5 text-primary" />}
            {formTrend === "down" && <TrendingDown className="h-5 w-5 text-destructive" />}
            {formTrend === "neutral" && <Minus className="h-5 w-5 text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">Form</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
