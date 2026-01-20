import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Building2, 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Target,
  Shield,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { LfgToggle } from "./LfgToggle";

interface MyClubData {
  id: string;
  club_name: string;
  club_key: string;
  guild_id: string;
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
  last_match_at: string | null;
  created_at: string;
  lfg_status?: string;
  lfg_message?: string;
  lfg_expires_at?: string | null;
}

export function MyClubProfile() {
  const { selectedGuildId, selectedGuild } = useGuild();

  const { data: myClub, isLoading, error } = useQuery({
    queryKey: ["my-global-league-club", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return null;

      const { data, error } = await supabase.functions.invoke("manage-global-league", {
        body: {
          action: "get-profile",
          guild_id: selectedGuildId,
        },
      });

      if (error) throw error;
      if (!data?.club) return null;
      
      return data.club as MyClubData;
    },
    enabled: !!selectedGuildId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!myClub) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-xl font-bold mb-2">Not Registered</h3>
          <p className="text-muted-foreground mb-4">
            {selectedGuild?.name || "Your club"} is not registered in the Global League yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">/globalleague join</code> in Discord to register.
          </p>
        </CardContent>
      </Card>
    );
  }

  const winRate = myClub.matches_played > 0 
    ? ((myClub.wins / myClub.matches_played) * 100).toFixed(1) 
    : "0.0";
  const goalDiff = myClub.goals_for - myClub.goals_against;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-hero">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <CardTitle>{myClub.club_name}</CardTitle>
                <p className="text-sm text-muted-foreground capitalize">
                  {myClub.ea_platform.replace("-", " ")}
                </p>
              </div>
            </div>
            <Badge variant={myClub.status === "active" ? "default" : "secondary"}>
              {myClub.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-mono font-bold">{myClub.elo_rating}</div>
              <div className="text-sm text-muted-foreground">Current ELO</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-mono font-bold text-yellow-500">{myClub.peak_elo}</div>
              <div className="text-sm text-muted-foreground">Peak ELO</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-mono font-bold">{myClub.matches_played}</div>
              <div className="text-sm text-muted-foreground">Matches</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-mono font-bold">{winRate}%</div>
              <div className="text-sm text-muted-foreground">Win Rate</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4" /> Record
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg bg-green-500/10">
                  <div className="text-2xl font-bold text-green-500">{myClub.wins}</div>
                  <div className="text-xs text-muted-foreground">Wins</div>
                </div>
                <div className="p-3 rounded-lg bg-yellow-500/10">
                  <div className="text-2xl font-bold text-yellow-500">{myClub.draws}</div>
                  <div className="text-xs text-muted-foreground">Draws</div>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10">
                  <div className="text-2xl font-bold text-red-500">{myClub.losses}</div>
                  <div className="text-xs text-muted-foreground">Losses</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Target className="h-4 w-4" /> Goals
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Goals For</span>
                  <span className="font-medium text-green-500">{myClub.goals_for}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Goals Against</span>
                  <span className="font-medium text-red-500">{myClub.goals_against}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Goal Difference
                  </span>
                  <span className={`font-bold ${goalDiff > 0 ? 'text-green-500' : goalDiff < 0 ? 'text-red-500' : ''}`}>
                    {goalDiff > 0 ? '+' : ''}{goalDiff}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                {myClub.current_streak > 0 ? (
                  <>
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-green-500 font-medium">{myClub.current_streak} Win Streak</span>
                  </>
                ) : myClub.current_streak < 0 ? (
                  <>
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="text-red-500 font-medium">{Math.abs(myClub.current_streak)} Loss Streak</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No active streak</span>
                )}
              </div>
              {myClub.last_match_at && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Last match: {format(new Date(myClub.last_match_at), "MMM d, yyyy")}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <LfgToggle
        currentStatus={myClub.lfg_status || "offline"}
        currentMessage={myClub.lfg_message || ""}
        expiresAt={myClub.lfg_expires_at}
        clubKey={myClub.club_key || "club1"}
      />

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <h4 className="font-medium mb-2">Recent Matches</h4>
          <p className="text-sm text-muted-foreground">
            Match history coming soon. For now, friendly matches between registered clubs are automatically tracked.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
