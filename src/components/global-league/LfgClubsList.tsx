import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Radio, 
  Wifi, 
  Clock, 
  Swords,
  Users,
  MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LfgClub {
  id: string;
  club_name: string;
  guild_name: string;
  ea_platform: string;
  elo_rating: number;
  lfg_status: "looking" | "ready" | "in_match";
  lfg_message: string | null;
  lfg_updated_at: string;
  expires_in_minutes: number | null;
  matches_played: number;
  wins: number;
  losses: number;
}

interface LfgClubsListProps {
  platform?: string;
  eloMin?: number;
  eloMax?: number;
  compact?: boolean;
}

export function LfgClubsList({ 
  platform = "all", 
  eloMin, 
  eloMax,
  compact = false 
}: LfgClubsListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lfg-clubs", platform, eloMin, eloMax],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-global-league", {
        body: {
          action: "get-lfg-clubs",
          guild_id: "global", // Required param but not used for this action
          platform: platform === "all" ? undefined : platform,
          elo_min: eloMin,
          elo_max: eloMax,
        },
      });

      if (error) throw error;
      return data.clubs as LfgClub[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const clubs = data || [];
  const readyClubs = clubs.filter(c => c.lfg_status === "ready");
  const lookingClubs = clubs.filter(c => c.lfg_status === "looking");

  const handleChallenge = (club: LfgClub) => {
    toast.info(`Challenge ${club.club_name}`, {
      description: "Challenge system coming soon! Use Discord /globalleague challenge for now.",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Failed to load clubs looking for games.
        </CardContent>
      </Card>
    );
  }

  if (clubs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">No clubs are looking for games right now.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Be the first - set your status to Ready!
          </p>
        </CardContent>
      </Card>
    );
  }

  const ClubCard = ({ club }: { club: LfgClub }) => {
    const isReady = club.lfg_status === "ready";
    const winRate = club.matches_played > 0 
      ? ((club.wins / club.matches_played) * 100).toFixed(0) 
      : "0";

    return (
      <div
        className={cn(
          "p-3 rounded-lg border transition-all hover:border-primary/50",
          isReady ? "bg-green-500/5 border-green-500/30" : "bg-yellow-500/5 border-yellow-500/30"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs px-1.5",
                  isReady 
                    ? "bg-green-500/20 text-green-500 border-green-500/50" 
                    : "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
                )}
              >
                {isReady ? (
                  <><Wifi className="h-3 w-3 mr-1" /> READY</>
                ) : (
                  <><Radio className="h-3 w-3 mr-1" /> LOOKING</>
                )}
              </Badge>
              {club.expires_in_minutes !== null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {club.expires_in_minutes}m
                </span>
              )}
            </div>
            <h4 className="font-semibold truncate">{club.club_name}</h4>
            <p className="text-xs text-muted-foreground truncate">{club.guild_name}</p>
            {club.lfg_message && (
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{club.lfg_message}</span>
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xl font-mono font-bold">{club.elo_rating}</div>
            <div className="text-xs text-muted-foreground">{winRate}% WR</div>
          </div>
        </div>
        {!compact && (
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
            <Badge variant="outline" className="text-xs capitalize">
              {club.ea_platform.replace("-", " ")}
            </Badge>
            <Button
              size="sm"
              variant={isReady ? "default" : "outline"}
              className={cn(isReady && "bg-green-600 hover:bg-green-700")}
              onClick={() => handleChallenge(club)}
            >
              <Swords className="h-3 w-3 mr-1" />
              Challenge
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-green-500" />
            Clubs Looking for Games
          </span>
          <Badge variant="secondary">{clubs.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {readyClubs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-green-500 flex items-center gap-1">
              <Wifi className="h-3 w-3" /> Ready Now ({readyClubs.length})
            </h4>
            <div className="space-y-2">
              {readyClubs.map((club) => (
                <ClubCard key={club.id} club={club} />
              ))}
            </div>
          </div>
        )}
        
        {lookingClubs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-yellow-500 flex items-center gap-1">
              <Radio className="h-3 w-3" /> Looking ({lookingClubs.length})
            </h4>
            <div className="space-y-2">
              {lookingClubs.map((club) => (
                <ClubCard key={club.id} club={club} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}