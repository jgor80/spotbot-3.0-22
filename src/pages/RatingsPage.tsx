import { useState } from "react";
import { useGuild } from "@/contexts/GuildContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { 
  Star, 
  Users, 
  TrendingUp, 
  Trophy,
  Flame,
  ChevronDown,
  ChevronUp,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Sparkles,
  Zap,
  RefreshCw,
  Clock
} from "lucide-react";
import { RatingBadge } from "@/components/player/RatingBadge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface PlayerRatingSummary {
  discord_user_id: string;
  discord_username: string | null;
  ea_username: string | null;
  overall_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  goals: number;
  assists: number;
  clean_sheets: number | null;
  man_of_match: number | null;
  avg_match_rating: number | null;
  form_rating: number | null;
  reliability_score: number | null;
  primary_position: string | null;
  shots: number | null;
  tackles: number | null;
  passes_made: number | null;
  pass_attempts: number | null;
  saves: number | null;
  current_streak: number;
  longest_win_streak: number;
  streak_type: string | null;
  vibe_score: number | null;
}

interface PlayerVibeData {
  discord_user_id: string;
  discord_username: string | null;
  ea_username: string | null;
  vibe_score: number | null;
  total_games_rated: number;
  prefer_count: number;
  neutral_count: number;
  avoid_count: number;
  avg_enjoyment: number;
  avg_energy: number;
}

export default function RatingsPage() {
  const { selectedGuildId } = useGuild();
  const [sortField, setSortField] = useState<keyof PlayerRatingSummary>("overall_rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      queryClient.invalidateQueries({ queryKey: ["player-summary-vibe"] }),
      queryClient.invalidateQueries({ queryKey: ["player-vibe-chemistry-aggregates"] }),
      queryClient.invalidateQueries({ queryKey: ["profiles-lookup"] }),
      queryClient.invalidateQueries({ queryKey: ["recent-peer-evaluations"] }),
    ]);
    toast.success("Ratings refreshed");
    setIsRefreshing(false);
  };

  // Fetch recent peer evaluations (anonymous - no user identifiers shown)
  const { data: recentEvaluations, isLoading: recentLoading } = useQuery({
    queryKey: ["recent-peer-evaluations", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("peer_evaluations")
        .select("id, enjoyment, team_energy, play_again, created_at")
        .eq("guild_id", selectedGuildId)
        .not("enjoyment", "is", null)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch player summary with vibe scores - uses aggregated data only
  const { data: playerSummaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["player-summary-vibe", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("player_summary")
        .select("discord_user_id, discord_username, vibe_score")
        .eq("guild_id", selectedGuildId)
        .not("vibe_score", "is", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch aggregated vibe chemistry data (pair-wise aggregates, not raw evaluations)
  const { data: vibeChemistryData, isLoading: vibeLoading } = useQuery({
    queryKey: ["player-vibe-chemistry-aggregates", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("player_vibe_chemistry")
        .select("player_a_discord_id, player_b_discord_id, games_together, avg_enjoyment, avg_team_energy, prefer_count, neutral_count, avoid_count, vibe_score")
        .eq("guild_id", selectedGuildId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch profiles for username lookup
  const { data: profiles } = useQuery({
    queryKey: ["profiles-lookup", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("discord_user_id, discord_username, ea_username");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch player stats from tracked games (unified with leaderboard)
  const { data: leaderboardPlayers, isLoading: playersLoading } = useLeaderboard(
    selectedGuildId,
    "overall",
    undefined,
    200,
    undefined,
    undefined,
    "games"
  );

  // Map leaderboard players to PlayerRatingSummary format
  const playerSummaries: PlayerRatingSummary[] = (leaderboardPlayers || []).map(p => {
    const vibeData = playerSummaryData?.find(v => v.discord_user_id === p.discord_user_id);
    return {
      discord_user_id: p.discord_user_id,
      discord_username: p.discord_username || null,
      ea_username: p.ea_username || null,
      overall_rating: p.overall_rating,
      games_played: p.games_played,
      wins: p.wins,
      losses: p.losses || 0,
      draws: p.draws || 0,
      win_rate: p.win_rate,
      goals: p.goals,
      assists: p.assists,
      clean_sheets: p.clean_sheets || null,
      man_of_match: p.man_of_match || null,
      avg_match_rating: p.avg_match_rating || null,
      form_rating: p.form_rating || null,
      reliability_score: p.reliability_score || null,
      primary_position: p.primary_position || null,
      shots: p.shots || null,
      tackles: p.tackles || null,
      passes_made: p.passes_made || null,
      pass_attempts: p.pass_attempts || null,
      saves: p.saves || null,
      current_streak: p.current_streak || 0,
      longest_win_streak: 0,
      streak_type: p.streak_type || null,
      vibe_score: vibeData?.vibe_score || null,
    };
  });

  // Calculate per-player vibe ratings from aggregated chemistry data
  const playerVibeRatings: PlayerVibeData[] = (() => {
    if (!vibeChemistryData || !profiles) return [];
    
    // Aggregate chemistry records per player
    const playerMap = new Map<string, {
      games: number;
      prefer: number;
      neutral: number;
      avoid: number;
      totalEnjoyment: number;
      totalEnergy: number;
      count: number;
    }>();
    
    vibeChemistryData.forEach(record => {
      // Each chemistry record represents the relationship between two players
      // Aggregate for player_a
      if (!playerMap.has(record.player_a_discord_id)) {
        playerMap.set(record.player_a_discord_id, { games: 0, prefer: 0, neutral: 0, avoid: 0, totalEnjoyment: 0, totalEnergy: 0, count: 0 });
      }
      const playerA = playerMap.get(record.player_a_discord_id)!;
      playerA.games += record.games_together || 0;
      playerA.prefer += record.prefer_count || 0;
      playerA.neutral += record.neutral_count || 0;
      playerA.avoid += record.avoid_count || 0;
      if (record.avg_enjoyment) {
        playerA.totalEnjoyment += record.avg_enjoyment;
        playerA.count++;
      }
      if (record.avg_team_energy) {
        playerA.totalEnergy += record.avg_team_energy;
      }
      
      // Aggregate for player_b
      if (!playerMap.has(record.player_b_discord_id)) {
        playerMap.set(record.player_b_discord_id, { games: 0, prefer: 0, neutral: 0, avoid: 0, totalEnjoyment: 0, totalEnergy: 0, count: 0 });
      }
      const playerB = playerMap.get(record.player_b_discord_id)!;
      playerB.games += record.games_together || 0;
      playerB.prefer += record.prefer_count || 0;
      playerB.neutral += record.neutral_count || 0;
      playerB.avoid += record.avoid_count || 0;
      if (record.avg_enjoyment) {
        playerB.totalEnjoyment += record.avg_enjoyment;
        playerB.count++;
      }
      if (record.avg_team_energy) {
        playerB.totalEnergy += record.avg_team_energy;
      }
    });

    const profilesLookup = new Map((profiles || []).map(p => [p.discord_user_id, p]));
    const summaryLookup = new Map((playerSummaryData || []).map(p => [p.discord_user_id, p]));

    return Array.from(playerMap.entries()).map(([discord_user_id, data]) => {
      const profile = profilesLookup.get(discord_user_id);
      const summary = summaryLookup.get(discord_user_id);
      
      return {
        discord_user_id,
        discord_username: profile?.discord_username || summary?.discord_username || null,
        ea_username: profile?.ea_username || null,
        vibe_score: summary?.vibe_score || null,
        total_games_rated: data.games,
        prefer_count: data.prefer,
        neutral_count: data.neutral,
        avoid_count: data.avoid,
        avg_enjoyment: data.count > 0 ? data.totalEnjoyment / data.count : 0,
        avg_energy: data.count > 0 ? data.totalEnergy / data.count : 0,
      };
    }).filter(p => p.total_games_rated > 0).sort((a, b) => (b.vibe_score || 0) - (a.vibe_score || 0));
  })();

  // Sort players
  const sortedPlayers = [...(playerSummaries || [])].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    return sortDir === "desc" ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
  });

  const handleSort = (field: keyof PlayerRatingSummary) => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: keyof PlayerRatingSummary }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />;
  };

  if (!selectedGuildId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Select a server to view ratings</p>
        </div>
      </DashboardLayout>
    );
  }

  const isLoading = summaryLoading || vibeLoading || playersLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Player Ratings</h1>
            <p className="text-muted-foreground">Player vibe scores and comprehensive stats</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="vibe-ratings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="vibe-ratings">Vibe Ratings</TabsTrigger>
            <TabsTrigger value="all-players">All Players</TabsTrigger>
          </TabsList>

          {/* Vibe Ratings Summary - Uses aggregated data only */}
          <TabsContent value="vibe-ratings" className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-96" />
            ) : (
              <div className="space-y-4">
                {playerVibeRatings.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No vibe ratings yet. Ratings appear after players rate each other in Discord.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Summary Stats */}
                <div className="grid md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{playerVibeRatings.length}</p>
                          <p className="text-sm text-muted-foreground">Players Rated</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-success/10">
                          <Star className="h-5 w-5 text-success" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {playerVibeRatings.reduce((sum, p) => sum + p.total_games_rated, 0)}
                          </p>
                          <p className="text-sm text-muted-foreground">Total Games Rated</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-info/10">
                          <Heart className="h-5 w-5 text-info" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {playerVibeRatings.length > 0 
                              ? (playerVibeRatings.reduce((sum, p) => sum + p.avg_enjoyment, 0) / playerVibeRatings.length).toFixed(1)
                              : "-"}
                          </p>
                          <p className="text-sm text-muted-foreground">Avg Enjoyment</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-warning/10">
                          <Sparkles className="h-5 w-5 text-warning" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {playerVibeRatings.length > 0 
                              ? (playerVibeRatings.filter(p => p.vibe_score).reduce((sum, p) => sum + (p.vibe_score || 0), 0) / playerVibeRatings.filter(p => p.vibe_score).length).toFixed(0)
                              : "-"}
                          </p>
                          <p className="text-sm text-muted-foreground">Avg Vibe Score</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Player Vibe Ratings Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      Player Vibe Ratings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead className="text-center">Games</TableHead>
                          <TableHead className="text-center">Enjoyment</TableHead>
                          <TableHead className="text-center">Energy</TableHead>
                          <TableHead className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <ThumbsUp className="h-4 w-4 text-success" />
                            </div>
                          </TableHead>
                          <TableHead className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Minus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </TableHead>
                          <TableHead className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <ThumbsDown className="h-4 w-4 text-destructive" />
                            </div>
                          </TableHead>
                          <TableHead className="text-center">Vibe Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {playerVibeRatings.map((player) => (
                          <TableRow key={player.discord_user_id}>
                            <TableCell>
                              <div>
                                <span className="font-medium">
                                  {player.ea_username || player.discord_username || "Unknown"}
                                </span>
                                {player.ea_username && player.discord_username && (
                                  <span className="text-xs text-muted-foreground block">
                                    {player.discord_username}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{player.total_games_rated}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Heart className="h-4 w-4 text-pink-500" />
                                <span className="font-medium">{player.avg_enjoyment.toFixed(1)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Zap className="h-4 w-4 text-yellow-500" />
                                <span className="font-medium">{player.avg_energy.toFixed(1)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-success font-medium">
                              {player.prefer_count}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">
                              {player.neutral_count}
                            </TableCell>
                            <TableCell className="text-center text-destructive font-medium">
                              {player.avoid_count}
                            </TableCell>
                            <TableCell className="text-center">
                              {player.vibe_score != null ? (
                                <Badge 
                                  variant={player.vibe_score >= 70 ? "default" : player.vibe_score >= 40 ? "secondary" : "destructive"}
                                  className={player.vibe_score >= 70 ? "bg-success" : ""}
                                >
                                  {player.vibe_score.toFixed(0)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                  </>
                )}

                {/* Recent Peer Vibe Ratings - Anonymous - Always show this card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Recent Peer Vibe Ratings
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Anonymous feedback from recent matches</p>
                  </CardHeader>
                  <CardContent>
                    {recentLoading ? (
                      <Skeleton className="h-32" />
                    ) : recentEvaluations && recentEvaluations.length > 0 ? (
                      <div className="space-y-2">
                        {recentEvaluations.map((evaluation) => (
                          <div key={evaluation.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(evaluation.created_at), { addSuffix: true })}
                            </span>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1">
                                <Heart className="h-4 w-4 text-pink-500" />
                                <span>{evaluation.enjoyment}/5</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Zap className="h-4 w-4 text-yellow-500" />
                                <span>{evaluation.team_energy}/5</span>
                              </div>
                              <Badge variant={
                                evaluation.play_again === "prefer" ? "default" : 
                                evaluation.play_again === "avoid" ? "destructive" : "secondary"
                              }>
                                {evaluation.play_again === "prefer" ? "👍" : 
                                 evaluation.play_again === "avoid" ? "👎" : "➖"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">No recent ratings yet</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* All Players Comprehensive View */}
          <TabsContent value="all-players">
            {playersLoading ? (
              <Skeleton className="h-96" />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    All Player Data ({sortedPlayers.length} players)
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleSort("ea_username")}
                        >
                          <div className="flex items-center gap-1">
                            Player <SortIcon field="ea_username" />
                          </div>
                        </TableHead>
                        <TableHead>Pos</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("overall_rating")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Rating <SortIcon field="overall_rating" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("games_played")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            GP <SortIcon field="games_played" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("wins")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            W <SortIcon field="wins" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("win_rate")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            W% <SortIcon field="win_rate" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("goals")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            G <SortIcon field="goals" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("assists")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            A <SortIcon field="assists" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("avg_match_rating")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            AvgR <SortIcon field="avg_match_rating" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("form_rating")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Form <SortIcon field="form_rating" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 text-center"
                          onClick={() => handleSort("vibe_score")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Vibe <SortIcon field="vibe_score" />
                          </div>
                        </TableHead>
                        <TableHead className="text-center">Streak</TableHead>
                        <TableHead className="text-center">CS</TableHead>
                        <TableHead className="text-center">MOTM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPlayers.map((player) => (
                        <TableRow key={player.discord_user_id}>
                          <TableCell>
                            <div>
                              <span className="font-medium">
                                {player.ea_username || player.discord_username || "Unknown"}
                              </span>
                              {player.ea_username && player.discord_username && (
                                <span className="text-xs text-muted-foreground block">
                                  {player.discord_username}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {player.primary_position && (
                              <Badge variant="outline" className="text-xs">
                                {player.primary_position}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <RatingBadge rating={player.overall_rating} size="sm" />
                          </TableCell>
                          <TableCell className="text-center">{player.games_played}</TableCell>
                          <TableCell className="text-center text-success">{player.wins}</TableCell>
                          <TableCell className="text-center">
                            {(player.win_rate * 100).toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-center font-medium">{player.goals}</TableCell>
                          <TableCell className="text-center">{player.assists}</TableCell>
                          <TableCell className="text-center">
                            {player.avg_match_rating?.toFixed(1) || "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {player.form_rating ? (
                              <Badge 
                                variant={player.form_rating >= 60 ? "default" : "secondary"}
                                className={player.form_rating >= 70 ? "bg-success" : ""}
                              >
                                {player.form_rating.toFixed(0)}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {player.vibe_score != null ? (
                              <Badge 
                                variant={player.vibe_score >= 70 ? "default" : player.vibe_score >= 40 ? "secondary" : "destructive"}
                                className={player.vibe_score >= 70 ? "bg-success" : ""}
                              >
                                {player.vibe_score.toFixed(0)}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {player.current_streak > 0 && (
                              <div className="flex items-center justify-center gap-1">
                                {player.streak_type === "win" ? (
                                  <Flame className="h-4 w-4 text-primary" />
                                ) : (
                                  <span className="text-muted-foreground">❄</span>
                                )}
                                <span className="font-medium">{player.current_streak}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{player.clean_sheets || 0}</TableCell>
                          <TableCell className="text-center">
                            {player.man_of_match ? (
                              <div className="flex items-center justify-center">
                                <Trophy className="h-4 w-4 text-warning" />
                                <span className="ml-1">{player.man_of_match}</span>
                              </div>
                            ) : 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
