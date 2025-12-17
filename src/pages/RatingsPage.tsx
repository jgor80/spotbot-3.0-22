import { useState } from "react";
import { useGuild } from "@/contexts/GuildContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Star, 
  Users, 
  Target, 
  TrendingUp, 
  Shield, 
  Brain, 
  MessageSquare, 
  Zap, 
  Activity,
  Trophy,
  Flame,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { RatingBadge } from "@/components/player/RatingBadge";

interface PeerEvaluation {
  id: string;
  evaluated_discord_id: string;
  evaluator_discord_id: string;
  position_played: string | null;
  technical_skill: number | null;
  game_iq: number | null;
  work_ethic: number | null;
  communication: number | null;
  consistency: number | null;
  clutch_factor: number | null;
  overall_score: number | null;
  trust_weighted_score: number | null;
  created_at: string;
}

interface PositionStats {
  position: string;
  evaluationCount: number;
  avgTechnicalSkill: number;
  avgGameIq: number;
  avgWorkEthic: number;
  avgCommunication: number;
  avgConsistency: number;
  avgClutchFactor: number;
  avgOverall: number;
}

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
}

export default function RatingsPage() {
  const { selectedGuildId } = useGuild();
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof PlayerRatingSummary>("overall_rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Fetch peer evaluations
  const { data: evaluations, isLoading: evalsLoading } = useQuery({
    queryKey: ["peer-evaluations", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("peer_evaluations")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PeerEvaluation[];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch player summaries for comprehensive view
  const { data: playerSummaries, isLoading: playersLoading } = useQuery({
    queryKey: ["player-summaries", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      const { data: summaries, error: summaryError } = await supabase
        .from("player_summary")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("overall_rating", { ascending: false });
      if (summaryError) throw summaryError;

      // Get EA usernames from profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("discord_user_id, ea_username");

      const profileMap = new Map(profiles?.map(p => [p.discord_user_id, p.ea_username]) || []);

      return summaries.map(s => ({
        ...s,
        ea_username: profileMap.get(s.discord_user_id) || null,
      })) as PlayerRatingSummary[];
    },
    enabled: !!selectedGuildId,
  });

  // Calculate position-grouped stats
  const positionStats: PositionStats[] = (() => {
    if (!evaluations) return [];
    
    const positionMap = new Map<string, PeerEvaluation[]>();
    
    evaluations.forEach(ev => {
      const pos = ev.position_played || "Unknown";
      if (!positionMap.has(pos)) {
        positionMap.set(pos, []);
      }
      positionMap.get(pos)!.push(ev);
    });

    return Array.from(positionMap.entries()).map(([position, evals]) => {
      const avg = (field: keyof PeerEvaluation) => {
        const valid = evals.filter(e => e[field] != null);
        if (valid.length === 0) return 0;
        return valid.reduce((sum, e) => sum + (e[field] as number), 0) / valid.length;
      };

      return {
        position,
        evaluationCount: evals.length,
        avgTechnicalSkill: avg("technical_skill"),
        avgGameIq: avg("game_iq"),
        avgWorkEthic: avg("work_ethic"),
        avgCommunication: avg("communication"),
        avgConsistency: avg("consistency"),
        avgClutchFactor: avg("clutch_factor"),
        avgOverall: avg("overall_score"),
      };
    }).sort((a, b) => b.evaluationCount - a.evaluationCount);
  })();

  // Get evaluations for selected position
  const filteredEvaluations = selectedPosition
    ? evaluations?.filter(e => e.position_played === selectedPosition) || []
    : evaluations || [];

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Player Ratings</h1>
          <p className="text-muted-foreground">Peer evaluations by position and comprehensive player stats</p>
        </div>

        <Tabs defaultValue="positions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="positions">By Position</TabsTrigger>
            <TabsTrigger value="all-players">All Players</TabsTrigger>
            <TabsTrigger value="evaluations">Recent Evaluations</TabsTrigger>
          </TabsList>

          {/* Position-Based Analysis */}
          <TabsContent value="positions" className="space-y-4">
            {evalsLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : positionStats.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No peer evaluations with position data yet
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {positionStats.map((pos) => (
                  <Card 
                    key={pos.position} 
                    className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${
                      selectedPosition === pos.position ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedPosition(
                      selectedPosition === pos.position ? null : pos.position
                    )}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-lg px-3 py-1">
                          {pos.position}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {pos.evaluationCount} evals
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" />
                          Technical
                        </span>
                        <div className="flex items-center gap-2">
                          <Progress value={pos.avgTechnicalSkill * 20} className="w-16 h-2" />
                          <span className="text-sm font-medium w-8">
                            {pos.avgTechnicalSkill.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <Brain className="h-4 w-4 text-info" />
                          Game IQ
                        </span>
                        <div className="flex items-center gap-2">
                          <Progress value={pos.avgGameIq * 20} className="w-16 h-2" />
                          <span className="text-sm font-medium w-8">
                            {pos.avgGameIq.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4 text-success" />
                          Work Ethic
                        </span>
                        <div className="flex items-center gap-2">
                          <Progress value={pos.avgWorkEthic * 20} className="w-16 h-2" />
                          <span className="text-sm font-medium w-8">
                            {pos.avgWorkEthic.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-warning" />
                          Comms
                        </span>
                        <div className="flex items-center gap-2">
                          <Progress value={pos.avgCommunication * 20} className="w-16 h-2" />
                          <span className="text-sm font-medium w-8">
                            {pos.avgCommunication.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          Consistency
                        </span>
                        <div className="flex items-center gap-2">
                          <Progress value={pos.avgConsistency * 20} className="w-16 h-2" />
                          <span className="text-sm font-medium w-8">
                            {pos.avgConsistency.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <Zap className="h-4 w-4 text-primary" />
                          Clutch
                        </span>
                        <div className="flex items-center gap-2">
                          <Progress value={pos.avgClutchFactor * 20} className="w-16 h-2" />
                          <span className="text-sm font-medium w-8">
                            {pos.avgClutchFactor.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Avg Overall</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= Math.round(pos.avgOverall)
                                    ? "fill-primary text-primary"
                                    : "text-muted"
                                }`}
                              />
                            ))}
                            <span className="ml-2 font-bold">{pos.avgOverall.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {selectedPosition && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Evaluations at {selectedPosition}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead className="text-center">Tech</TableHead>
                        <TableHead className="text-center">IQ</TableHead>
                        <TableHead className="text-center">Work</TableHead>
                        <TableHead className="text-center">Comms</TableHead>
                        <TableHead className="text-center">Cons</TableHead>
                        <TableHead className="text-center">Clutch</TableHead>
                        <TableHead className="text-center">Overall</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvaluations.slice(0, 20).map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium">
                            {ev.evaluated_discord_id.substring(0, 8)}...
                          </TableCell>
                          <TableCell className="text-center">{ev.technical_skill || "-"}</TableCell>
                          <TableCell className="text-center">{ev.game_iq || "-"}</TableCell>
                          <TableCell className="text-center">{ev.work_ethic || "-"}</TableCell>
                          <TableCell className="text-center">{ev.communication || "-"}</TableCell>
                          <TableCell className="text-center">{ev.consistency || "-"}</TableCell>
                          <TableCell className="text-center">{ev.clutch_factor || "-"}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={ev.overall_score && ev.overall_score >= 4 ? "default" : "secondary"}>
                              {ev.overall_score?.toFixed(1) || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(ev.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
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
                          onClick={() => handleSort("reliability_score")}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Rel <SortIcon field="reliability_score" />
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
                            {player.reliability_score?.toFixed(0) || 100}%
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

          {/* Recent Evaluations */}
          <TabsContent value="evaluations">
            {evalsLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Peer Evaluations</CardTitle>
                </CardHeader>
                <CardContent>
                  {!evaluations || evaluations.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No peer evaluations yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {evaluations.slice(0, 30).map((ev) => (
                        <div 
                          key={ev.id} 
                          className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                Player {ev.evaluated_discord_id.substring(0, 8)}...
                              </span>
                              {ev.position_played && (
                                <Badge variant="outline">{ev.position_played}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Evaluated by {ev.evaluator_discord_id.substring(0, 8)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-center">
                              <Target className="h-4 w-4 mx-auto text-primary" />
                              <span>{ev.technical_skill || "-"}</span>
                            </div>
                            <div className="text-center">
                              <Brain className="h-4 w-4 mx-auto text-info" />
                              <span>{ev.game_iq || "-"}</span>
                            </div>
                            <div className="text-center">
                              <MessageSquare className="h-4 w-4 mx-auto text-warning" />
                              <span>{ev.communication || "-"}</span>
                            </div>
                            <div className="text-center">
                              <Zap className="h-4 w-4 mx-auto text-primary" />
                              <span>{ev.clutch_factor || "-"}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= Math.round(ev.overall_score || 0)
                                    ? "fill-primary text-primary"
                                    : "text-muted"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(ev.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
