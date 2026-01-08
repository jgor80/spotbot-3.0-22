import { useState } from "react";
import { useGuild } from "@/contexts/GuildContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { 
  Star, 
  Users, 
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
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

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

type SortField = "ea_username" | "vibe_score" | "total_games_rated" | "avg_enjoyment" | "avg_energy" | "prefer_count" | "neutral_count" | "avoid_count";

export default function RatingsPage() {
  const { selectedGuildId } = useGuild();
  const [sortField, setSortField] = useState<SortField>("vibe_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
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
    }).filter(p => p.total_games_rated > 0);
  })();

  // Sort players
  const sortedPlayers = [...playerVibeRatings].sort((a, b) => {
    let aVal: string | number | null;
    let bVal: string | number | null;
    
    if (sortField === "ea_username") {
      aVal = a.ea_username || a.discord_username || "";
      bVal = b.ea_username || b.discord_username || "";
      return sortDir === "desc" 
        ? (bVal as string).localeCompare(aVal as string)
        : (aVal as string).localeCompare(bVal as string);
    }
    
    aVal = a[sortField] ?? 0;
    bVal = b[sortField] ?? 0;
    return sortDir === "desc" ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
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

  const isLoading = summaryLoading || vibeLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Player Ratings</h1>
            <p className="text-muted-foreground">Player vibe scores from peer feedback</p>
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
                            {playerVibeRatings.filter(p => p.vibe_score).length > 0 
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
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSort("ea_username")}
                          >
                            <div className="flex items-center gap-1">
                              Player <SortIcon field="ea_username" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 text-center"
                            onClick={() => handleSort("total_games_rated")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              Games <SortIcon field="total_games_rated" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 text-center"
                            onClick={() => handleSort("avg_enjoyment")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              Enjoyment <SortIcon field="avg_enjoyment" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 text-center"
                            onClick={() => handleSort("avg_energy")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              Energy <SortIcon field="avg_energy" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 text-center"
                            onClick={() => handleSort("prefer_count")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <ThumbsUp className="h-4 w-4 text-success" /> <SortIcon field="prefer_count" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 text-center"
                            onClick={() => handleSort("neutral_count")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <Minus className="h-4 w-4 text-muted-foreground" /> <SortIcon field="neutral_count" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 text-center"
                            onClick={() => handleSort("avoid_count")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <ThumbsDown className="h-4 w-4 text-destructive" /> <SortIcon field="avoid_count" />
                            </div>
                          </TableHead>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 text-center"
                            onClick={() => handleSort("vibe_score")}
                          >
                            <div className="flex items-center justify-center gap-1">
                              Vibe Score <SortIcon field="vibe_score" />
                            </div>
                          </TableHead>
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

            {/* Recent Peer Vibe Ratings - Anonymous */}
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
      </div>
    </DashboardLayout>
  );
}
