import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Trophy, Minus, X, Users, Calendar, Target } from "lucide-react";

interface ClubMatch {
  id: string;
  ea_match_id: string;
  club_key: string;
  guild_id: string;
  result: string | null;
  score_for: number | null;
  score_against: number | null;
  opponent_club_name: string | null;
  match_type: string;
  created_at: string;
  player_stats: any;
}

interface Club {
  key: string;
  name: string;
  enabled: boolean;
}

export default function RecentGamesPage() {
  const { selectedGuildId, selectedGuild } = useGuild();
  const [clubFilter, setClubFilter] = useState<string>("all");

  // Get enabled clubs from selected guild
  const enabledClubs = useMemo(() => {
    if (!selectedGuild?.clubs) return [];
    return selectedGuild.clubs.filter(c => c.enabled);
  }, [selectedGuild]);

  // Fetch recent matches
  const { data: matches, isLoading, error } = useQuery({
    queryKey: ["recent-games", selectedGuildId, clubFilter],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      let query = supabase
        .from("club_matches")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (clubFilter !== "all") {
        query = query.eq("club_key", clubFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ClubMatch[];
    },
    enabled: !!selectedGuildId,
  });

  const getResultIcon = (result: string | null) => {
    switch (result) {
      case "win":
        return <Trophy className="h-4 w-4 text-emerald-500" />;
      case "loss":
        return <X className="h-4 w-4 text-red-500" />;
      case "draw":
        return <Minus className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case "win":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Win</Badge>;
      case "loss":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Loss</Badge>;
      case "draw":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Draw</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getMatchTypeBadge = (matchType: string) => {
    switch (matchType) {
      case "division":
        return <Badge variant="secondary">Division</Badge>;
      case "competition":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Cup</Badge>;
      case "friendly":
        return <Badge variant="outline">Friendly</Badge>;
      default:
        return <Badge variant="outline">{matchType}</Badge>;
    }
  };

  const getClubName = (clubKey: string) => {
    const club = enabledClubs.find(c => c.key === clubKey);
    return club?.name || clubKey;
  };

  const getPlayerCount = (playerStats: any) => {
    if (!playerStats) return 0;
    if (Array.isArray(playerStats)) return playerStats.length;
    if (typeof playerStats === "object") return Object.keys(playerStats).length;
    return 0;
  };

  if (!selectedGuildId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Please select a server to view recent games.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Recent Games</h1>
            <p className="text-muted-foreground">
              View all tracked matches across your clubs
            </p>
          </div>
          
          <Select value={clubFilter} onValueChange={setClubFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by club" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clubs</SelectItem>
              {enabledClubs.map((club) => (
                <SelectItem key={club.key} value={club.key}>
                  {club.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats Summary */}
        {matches && matches.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-emerald-500">
                  {matches.filter(m => m.result === "win").length}
                </div>
                <p className="text-sm text-muted-foreground">Wins</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-500">
                  {matches.filter(m => m.result === "loss").length}
                </div>
                <p className="text-sm text-muted-foreground">Losses</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-amber-500">
                  {matches.filter(m => m.result === "draw").length}
                </div>
                <p className="text-sm text-muted-foreground">Draws</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {matches.length}
                </div>
                <p className="text-sm text-muted-foreground">Total Games</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Games List */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-500">Error loading games: {(error as Error).message}</p>
            </CardContent>
          </Card>
        ) : matches && matches.length > 0 ? (
          <div className="space-y-3">
            {matches.map((match) => (
              <Card key={match.id} className="hover:bg-muted/50 transition-colors">
                <CardContent className="py-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Result & Score */}
                    <div className="flex items-center gap-4 min-w-[180px]">
                      {getResultIcon(match.result)}
                      <div className="text-2xl font-bold font-mono">
                        {match.score_for ?? "-"} - {match.score_against ?? "-"}
                      </div>
                      {getResultBadge(match.result)}
                    </div>

                    {/* Match Info */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{getClubName(match.club_key)}</span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="font-medium">{match.opponent_club_name || "Unknown"}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(match.created_at), "MMM d, yyyy h:mm a")}
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {getPlayerCount(match.player_stats)} players
                        </div>
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2">
                      {getMatchTypeBadge(match.match_type)}
                      <Badge variant="outline" className="font-mono text-xs">
                        {match.club_key}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">No Games Found</h3>
              <p className="text-muted-foreground">
                No tracked games yet. Games will appear here after EA sync runs.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
