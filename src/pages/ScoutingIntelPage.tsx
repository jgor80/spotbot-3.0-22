import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, Target, Users, Eye, TrendingUp, Trophy, Goal, 
  HandHelping, Shield, Star, Crosshair, ArrowLeftRight,
  Clock, Swords, Filter, SortAsc, SortDesc, ArrowLeft
} from "lucide-react";

interface ScoutedPlayer {
  id: string;
  guild_id: string;
  ea_club_id: string;
  ea_club_name: string | null;
  ea_username: string;
  ea_platform: string | null;
  games_played: number;
  goals: number;
  assists: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  avg_match_rating: number | null;
  clean_sheets: number;
  man_of_match: number;
  primary_position: string | null;
  archetypeid: string | null;
  shots: number;
  tackles: number;
  passes_made: number;
  pass_attempts: number;
  saves: number;
  interceptions: number;
  clearances: number;
  last_scouted_at: string;
  first_seen_at: string;
  times_faced: number;
}

interface OwnPlayer {
  discord_user_id: string;
  discord_username: string | null;
  overall_rating: number;
  primary_position: string | null;
  games_played: number;
  goals: number;
  assists: number;
  wins: number;
  win_rate: number;
  avg_match_rating: number | null;
  shots: number;
  tackles: number;
  passes_made: number;
  saves: number;
  ea_username?: string | null;
}

type SortField = "times_faced" | "games_played" | "goals" | "assists" | "win_rate" | "avg_match_rating";

export default function ScoutingIntelPage() {
  const { selectedGuildId } = useGuild();
  const [clubFilter, setClubFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("times_faced");
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<ScoutedPlayer | null>(null);
  const [comparePlayer, setComparePlayer] = useState<string | null>(null);

  // Fetch scouted players
  const { data: scoutedPlayers, isLoading } = useQuery({
    queryKey: ["scouted-players", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("scouted_players")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("times_faced", { ascending: false });
      
      if (error) throw error;
      return data as ScoutedPlayer[];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch own players for comparison
  const { data: ownPlayers } = useQuery({
    queryKey: ["own-players-compare", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data: summaryData, error } = await supabase
        .from("player_summary")
        .select(`
          discord_user_id, discord_username, overall_rating, primary_position,
          games_played, goals, assists, wins, win_rate, avg_match_rating,
          shots, tackles, passes_made, saves
        `)
        .eq("guild_id", selectedGuildId)
        .order("overall_rating", { ascending: false });
      
      if (error) throw error;

      // Get EA usernames
      const discordIds = (summaryData || []).map(p => p.discord_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("discord_user_id, ea_username")
        .in("discord_user_id", discordIds);

      const eaMap = new Map((profiles || []).map(p => [p.discord_user_id, p.ea_username]));

      return (summaryData || []).map(p => ({
        ...p,
        ea_username: eaMap.get(p.discord_user_id) || null
      })) as OwnPlayer[];
    },
    enabled: !!selectedGuildId,
  });

  // Get unique clubs from scouted data
  const uniqueClubs = useMemo(() => {
    if (!scoutedPlayers) return [];
    const clubs = new Map<string, string>();
    scoutedPlayers.forEach(p => {
      if (p.ea_club_id && p.ea_club_name) {
        clubs.set(p.ea_club_id, p.ea_club_name);
      }
    });
    return Array.from(clubs.entries()).map(([id, name]) => ({ id, name }));
  }, [scoutedPlayers]);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    if (!scoutedPlayers) return [];
    
    let filtered = scoutedPlayers;
    
    // Club filter
    if (clubFilter !== "all") {
      filtered = filtered.filter(p => p.ea_club_id === clubFilter);
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.ea_username.toLowerCase().includes(query) ||
        (p.ea_club_name?.toLowerCase().includes(query))
      );
    }
    
    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal = a[sortField] ?? 0;
      let bVal = b[sortField] ?? 0;
      return sortDesc ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
    
    return filtered;
  }, [scoutedPlayers, clubFilter, searchQuery, sortField, sortDesc]);

  // Stats summary
  const stats = useMemo(() => {
    if (!scoutedPlayers) return { total: 0, clubs: 0, mostFaced: null };
    const mostFaced = scoutedPlayers.reduce((max, p) => 
      (p.times_faced > (max?.times_faced || 0)) ? p : max
    , scoutedPlayers[0]);
    return {
      total: scoutedPlayers.length,
      clubs: uniqueClubs.length,
      mostFaced
    };
  }, [scoutedPlayers, uniqueClubs]);

  // Get comparison data
  const comparisonData = useMemo(() => {
    if (!selectedPlayer || !comparePlayer || !ownPlayers) return null;
    const ownPlayer = ownPlayers.find(p => p.discord_user_id === comparePlayer);
    if (!ownPlayer) return null;
    return { scouted: selectedPlayer, own: ownPlayer };
  }, [selectedPlayer, comparePlayer, ownPlayers]);

  const getPositionColor = (pos: string | null) => {
    if (!pos) return "bg-muted text-muted-foreground";
    const p = pos.toUpperCase();
    if (p === "GK") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (["CB", "LB", "RB", "LWB", "RWB", "SW"].includes(p)) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (["CDM", "CM", "CAM", "LM", "RM"].includes(p)) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  if (!selectedGuildId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Please select a server to view scouting intel.</p>
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
            <Link to="/scouting" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Scouting
            </Link>
            <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-3">
              <Target className="h-8 w-8 text-primary" />
              Scouting Intel
            </h1>
            <p className="text-muted-foreground">
              Intelligence database on opponent players you've faced
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-sm text-muted-foreground">Players Scouted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.clubs}</div>
                  <p className="text-sm text-muted-foreground">Opponent Clubs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Swords className="h-5 w-5 text-amber-500" />
                <div>
                  <div className="text-lg font-bold">
                    {stats.mostFaced?.ea_username || "N/A"}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Most Faced Player ({stats.mostFaced?.times_faced || 0} times)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search players or clubs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={clubFilter} onValueChange={setClubFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by club" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clubs</SelectItem>
                  {uniqueClubs.map((club) => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="times_faced">Times Faced</SelectItem>
                  <SelectItem value="games_played">Games Played</SelectItem>
                  <SelectItem value="goals">Goals</SelectItem>
                  <SelectItem value="assists">Assists</SelectItem>
                  <SelectItem value="win_rate">Win Rate</SelectItem>
                  <SelectItem value="avg_match_rating">Avg Rating</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortDesc(!sortDesc)}
              >
                {sortDesc ? <SortDesc className="h-4 w-4" /> : <SortAsc className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Players Table */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredPlayers.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Player</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-center">Pos</TableHead>
                      <TableHead className="text-center">
                        <Swords className="h-4 w-4 mx-auto" />
                      </TableHead>
                      <TableHead className="text-center">Games</TableHead>
                      <TableHead className="text-center">
                        <Goal className="h-4 w-4 mx-auto" />
                      </TableHead>
                      <TableHead className="text-center">
                        <HandHelping className="h-4 w-4 mx-auto" />
                      </TableHead>
                      <TableHead className="text-center">Win%</TableHead>
                      <TableHead className="text-center">
                        <Star className="h-4 w-4 mx-auto" />
                      </TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlayers.map((player) => (
                      <TableRow 
                        key={player.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedPlayer(player)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {player.ea_username}
                            {player.times_faced >= 3 && (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">
                                Rival
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {player.ea_club_name || "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={getPositionColor(player.primary_position)}>
                            {player.primary_position || "?"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-amber-500">
                          {player.times_faced}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {player.games_played}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {player.goals}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {player.assists}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {player.win_rate?.toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {player.avg_match_rating?.toFixed(1) || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPlayer(player);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">No Scouted Players</h3>
              <p className="text-muted-foreground">
                Opponent data will appear here after you play matches. The system auto-scouts opponents after each game.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Player Detail Modal */}
        <Dialog open={!!selectedPlayer} onOpenChange={() => { setSelectedPlayer(null); setComparePlayer(null); }}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            {selectedPlayer && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <Crosshair className="h-6 w-6 text-primary" />
                    {selectedPlayer.ea_username}
                    {selectedPlayer.times_faced >= 3 && (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                        Rival ({selectedPlayer.times_faced}x)
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {selectedPlayer.ea_club_name || "Unknown Club"}
                    <span className="text-muted-foreground">•</span>
                    <Badge className={getPositionColor(selectedPlayer.primary_position)}>
                      {selectedPlayer.primary_position || "Unknown"}
                    </Badge>
                  </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh]">
                  <Tabs defaultValue="stats" className="w-full">
                    <TabsList className="w-full justify-start">
                      <TabsTrigger value="stats">Full Stats</TabsTrigger>
                      <TabsTrigger value="compare">Compare</TabsTrigger>
                    </TabsList>

                    <TabsContent value="stats" className="space-y-4 mt-4">
                      {/* Key Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Card>
                          <CardContent className="pt-4 pb-3 text-center">
                            <div className="text-2xl font-bold">{selectedPlayer.games_played}</div>
                            <p className="text-xs text-muted-foreground">Games</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4 pb-3 text-center">
                            <div className="text-2xl font-bold text-emerald-500">
                              {selectedPlayer.win_rate?.toFixed(0)}%
                            </div>
                            <p className="text-xs text-muted-foreground">Win Rate</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4 pb-3 text-center">
                            <div className="text-2xl font-bold">{selectedPlayer.goals}</div>
                            <p className="text-xs text-muted-foreground">Goals</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4 pb-3 text-center">
                            <div className="text-2xl font-bold">{selectedPlayer.assists}</div>
                            <p className="text-xs text-muted-foreground">Assists</p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Detailed Stats */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Performance Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Wins</span>
                              <span className="font-mono">{selectedPlayer.wins}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Losses</span>
                              <span className="font-mono">{selectedPlayer.losses}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Draws</span>
                              <span className="font-mono">{selectedPlayer.draws}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Avg Rating</span>
                              <span className="font-mono">{selectedPlayer.avg_match_rating?.toFixed(1) || "-"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Clean Sheets</span>
                              <span className="font-mono">{selectedPlayer.clean_sheets}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">MOTM</span>
                              <span className="font-mono">{selectedPlayer.man_of_match}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Shots</span>
                              <span className="font-mono">{selectedPlayer.shots}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tackles</span>
                              <span className="font-mono">{selectedPlayer.tackles}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Passes</span>
                              <span className="font-mono">{selectedPlayer.passes_made}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Interceptions</span>
                              <span className="font-mono">{selectedPlayer.interceptions}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Clearances</span>
                              <span className="font-mono">{selectedPlayer.clearances}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Saves</span>
                              <span className="font-mono">{selectedPlayer.saves}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Scouting Info */}
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              First seen: {new Date(selectedPlayer.first_seen_at).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Eye className="h-4 w-4" />
                              Last scouted: {new Date(selectedPlayer.last_scouted_at).toLocaleDateString()}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="compare" className="space-y-4 mt-4">
                      {/* Player Selector */}
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-4">
                            <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
                            <Select value={comparePlayer || ""} onValueChange={setComparePlayer}>
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select your player to compare..." />
                              </SelectTrigger>
                              <SelectContent>
                                {ownPlayers?.map((player) => (
                                  <SelectItem key={player.discord_user_id} value={player.discord_user_id}>
                                    {player.ea_username || player.discord_username || player.discord_user_id}
                                    {player.primary_position && ` (${player.primary_position})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Comparison Table */}
                      {comparisonData ? (
                        <Card>
                          <CardContent className="pt-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Stat</TableHead>
                                  <TableHead className="text-center text-primary">
                                    {comparisonData.own.ea_username || comparisonData.own.discord_username}
                                  </TableHead>
                                  <TableHead className="text-center text-amber-500">
                                    {comparisonData.scouted.ea_username}
                                  </TableHead>
                                  <TableHead className="text-center">Diff</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {[
                                  { label: "Games", own: comparisonData.own.games_played, scouted: comparisonData.scouted.games_played },
                                  { label: "Goals", own: comparisonData.own.goals, scouted: comparisonData.scouted.goals },
                                  { label: "Assists", own: comparisonData.own.assists, scouted: comparisonData.scouted.assists },
                                  { label: "Win Rate", own: comparisonData.own.win_rate, scouted: comparisonData.scouted.win_rate, pct: true },
                                  { label: "Avg Rating", own: comparisonData.own.avg_match_rating, scouted: comparisonData.scouted.avg_match_rating, decimal: true },
                                  { label: "Shots", own: comparisonData.own.shots, scouted: comparisonData.scouted.shots },
                                  { label: "Tackles", own: comparisonData.own.tackles, scouted: comparisonData.scouted.tackles },
                                  { label: "Passes", own: comparisonData.own.passes_made, scouted: comparisonData.scouted.passes_made },
                                ].map((row) => {
                                  const ownVal = row.own ?? 0;
                                  const scoutedVal = row.scouted ?? 0;
                                  const diff = ownVal - scoutedVal;
                                  const diffColor = diff > 0 ? "text-emerald-500" : diff < 0 ? "text-red-500" : "text-muted-foreground";
                                  
                                  return (
                                    <TableRow key={row.label}>
                                      <TableCell>{row.label}</TableCell>
                                      <TableCell className="text-center font-mono">
                                        {row.decimal ? (ownVal as number)?.toFixed(1) : row.pct ? `${(ownVal as number)?.toFixed(0)}%` : ownVal}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {row.decimal ? (scoutedVal as number)?.toFixed(1) : row.pct ? `${(scoutedVal as number)?.toFixed(0)}%` : scoutedVal}
                                      </TableCell>
                                      <TableCell className={`text-center font-mono ${diffColor}`}>
                                        {diff > 0 ? "+" : ""}{row.decimal ? diff.toFixed(1) : row.pct ? `${diff.toFixed(0)}%` : diff}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      ) : (
                        <Card>
                          <CardContent className="py-8 text-center">
                            <ArrowLeftRight className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">
                              Select one of your players above to compare stats
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  </Tabs>
                </ScrollArea>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}