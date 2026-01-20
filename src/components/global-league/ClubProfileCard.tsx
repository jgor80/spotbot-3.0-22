import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Trophy, Target, Shield } from "lucide-react";

interface ClubProfileCardProps {
  club: {
    id: string;
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
    current_streak: number;
    status: string;
  };
}

export function ClubProfileCard({ club }: ClubProfileCardProps) {
  const winRate = club.matches_played > 0 
    ? ((club.wins / club.matches_played) * 100).toFixed(1) 
    : "0.0";
  
  const goalDiff = club.goals_for - club.goals_against;
  const avgGoalsFor = club.matches_played > 0 
    ? (club.goals_for / club.matches_played).toFixed(1) 
    : "0.0";

  return (
    <Card className="w-72 shadow-lg border-primary/20 bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">{club.club_name}</h3>
            <p className="text-sm text-muted-foreground">{club.guild_name}</p>
          </div>
          <Badge variant="outline" className="capitalize">
            {club.ea_platform.replace("-", " ")}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-2xl font-mono font-bold">{club.elo_rating}</div>
            <div className="text-xs text-muted-foreground">Current ELO</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-2xl font-mono font-bold text-yellow-500">{club.peak_elo}</div>
            <div className="text-xs text-muted-foreground">Peak ELO</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Trophy className="h-3 w-3" /> Win Rate
            </span>
            <span className="font-medium">{winRate}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Target className="h-3 w-3" /> Avg Goals/Game
            </span>
            <span className="font-medium">{avgGoalsFor}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Shield className="h-3 w-3" /> Goal Difference
            </span>
            <span className={`font-medium ${goalDiff > 0 ? 'text-green-500' : goalDiff < 0 ? 'text-red-500' : ''}`}>
              {goalDiff > 0 ? '+' : ''}{goalDiff}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm">
            <span className="text-green-500">{club.wins}W</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-yellow-500">{club.draws}D</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-red-500">{club.losses}L</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            {club.current_streak > 0 ? (
              <>
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-green-500">W{club.current_streak}</span>
              </>
            ) : club.current_streak < 0 ? (
              <>
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-red-500">L{Math.abs(club.current_streak)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No streak</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
