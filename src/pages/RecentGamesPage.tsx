import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { matchCompetition, matchTag } from "@/lib/clubInsights";
import { Trophy, Minus, X, Users, Calendar, Target, Star, Goal, HandHelping, Shield, Footprints, ChevronRight, Search, Clock } from "lucide-react";
import { SessionsList } from "@/components/club/SessionsList";
import { getArchetypeName, getArchetypeInfo, getArchetypeBadgeClasses, getPositionalCategoryBadgeClasses, formatPositionalCategory } from "@/lib/archetypes";

interface ClubMatch {
  id: string;
  ea_match_id: string;
  club_key: string;
  guild_id: string;
  result: string | null;
  score_for: number | null;
  score_against: number | null;
  opponent_club_name: string | null;
  opponent_club_id: string | null;
  match_type: string;
  created_at: string;
  player_stats: any;
  match_data: any;
}

interface PlayerStat {
  name?: string;
  ea_username?: string;
  goals?: number;
  assists?: number;
  rating?: number;
  ea_match_rating?: number;
  position?: string;
  position_played?: string;
  tackles?: number;
  passes_made?: number;
  pass_attempts?: number;
  shots?: number;
  saves?: number;
  saves_diving?: number;
  saves_reflex?: number;
  saves_parry?: number;
  saves_cross?: number;
  saves_punch?: number;
  interceptions?: number;
  clearances?: number;
  dribbles?: number;
  fouls?: number;
  offsides?: number;
  man_of_match?: boolean;
  clean_sheet?: boolean;
  goals_conceded?: number;
  possession?: number;
  archetypeid?: string | number;
  [key: string]: any;
}

export default function RecentGamesPage() {
  const { selectedGuildId, selectedGuild } = useGuild();
  const [clubFilter, setClubFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedMatch, setSelectedMatch] = useState<ClubMatch | null>(null);
  const [statsTab, setStatsTab] = useState<string>("team");
  const [viewMode, setViewMode] = useState<string>("matches");

  const enabledClubs = useMemo(() => {
    if (!selectedGuild?.clubs) return [];
    return selectedGuild.clubs.filter(c => c.enabled);
  }, [selectedGuild]);

  // Fetch all matches with pagination to get complete history
  const { data: matches, isLoading, error } = useQuery({
    queryKey: ["recent-games", selectedGuildId, clubFilter],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const allMatches: ClubMatch[] = [];
      const pageSize = 1000; // Supabase max per request
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        let query = supabase
          .from("club_matches")
          .select("*")
          .eq("guild_id", selectedGuildId)
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        
        if (clubFilter !== "all") {
          query = query.eq("club_key", clubFilter);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        if (data && data.length > 0) {
          allMatches.push(...(data as ClubMatch[]));
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      
      console.log("[RecentGamesPage] Fetched complete history:", { guildId: selectedGuildId, matchCount: allMatches.length });
      return allMatches;
    },
    enabled: !!selectedGuildId,
  });

  // Debug logging
  console.log("[RecentGamesPage] State:", { selectedGuildId, isLoading, matchesLength: matches?.length, error });

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

  // A manager's tag (Discord: Manager Hub → Tag Matches) wins over EA's own match type
  const getMatchTypeBadge = (match: ClubMatch) => {
    const tagged = !!matchTag(match);
    switch (matchCompetition(match)) {
      case "tournament":
        return <Badge className="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30">Tournament</Badge>;
      case "byot":
        return <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30">BYOT</Badge>;
      case "smalls":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Smalls</Badge>;
      case "league":
        return <Badge variant="secondary">{tagged ? "League" : "Division"}</Badge>;
      case "cup":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Cup</Badge>;
      default:
        return <Badge variant="outline">Friendly</Badge>;
    }
  };

  const getClubName = (clubKey: string) => {
    const club = enabledClubs.find(c => c.key === clubKey);
    return club?.name || clubKey;
  };

  const getOpponentName = (match: ClubMatch) => {
    // First try the direct column
    if (match.opponent_club_name && match.opponent_club_name !== "Unknown") {
      return match.opponent_club_name;
    }
    
    // Parse from match_data.clubs
    if (match.match_data?.clubs) {
      const clubs = match.match_data.clubs;
      const clubKeys = Object.keys(clubs);
      
      // Find the opponent club (not our club)
      for (const key of clubKeys) {
        const clubData = clubs[key];
        // Check if this is the opponent (their result is opposite of ours, or check by ID)
        if (key !== match.opponent_club_id) {
          // This might be our club - check further
          const opponentId = match.opponent_club_id;
          if (opponentId && clubs[opponentId]) {
            return clubs[opponentId].details?.name || clubs[opponentId].name || `Club ${opponentId}`;
          }
        }
        // If we have opponent_club_id, use it directly
        if (key === match.opponent_club_id) {
          return clubData.details?.name || clubData.name || `Club ${key}`;
        }
      }
      
      // Fallback: find the club that lost when we won (or vice versa)
      for (const key of clubKeys) {
        const clubData = clubs[key];
        const clubName = clubData.details?.name || clubData.name;
        if (clubName) {
          // Return the first club name that isn't ours
          const ourClubName = getClubName(match.club_key);
          if (clubName !== ourClubName) {
            return clubName;
          }
        }
      }
    }
    
    return match.opponent_club_name || "Unknown Opponent";
  };

  const getPlayerCount = (playerStats: any) => {
    if (!playerStats) return 0;
    if (Array.isArray(playerStats)) return playerStats.length;
    if (typeof playerStats === "object") return Object.keys(playerStats).length;
    return 0;
  };

  const parsePlayerStats = (playerStats: any): PlayerStat[] => {
    if (!playerStats) return [];
    if (Array.isArray(playerStats)) return playerStats;
    if (typeof playerStats === "object") {
      return Object.entries(playerStats).map(([key, value]) => ({
        name: key,
        ...(typeof value === "object" ? value : {}),
      })) as PlayerStat[];
    }
    return [];
  };

  const getPlayerName = (player: PlayerStat): string => {
    return player.ea_username || player.name || "Unknown Player";
  };

  // Extract opponent player stats from match_data
  const parseOpponentStats = (match: ClubMatch): PlayerStat[] => {
    if (!match.match_data?.players) return [];
    
    const players = match.match_data.players;
    const opponentClubId = match.opponent_club_id;
    
    if (!opponentClubId || !players[opponentClubId]) return [];
    
    const opponentPlayers = players[opponentClubId];
    
    return Object.entries(opponentPlayers).map(([playerId, playerData]: [string, any]) => ({
      name: playerData.playername || playerData.commonname || `Player ${playerId}`,
      ea_username: playerData.playername,
      goals: parseInt(playerData.goals) || 0,
      assists: parseInt(playerData.assists) || 0,
      rating: parseFloat(playerData.rating) || 0,
      ea_match_rating: parseFloat(playerData.rating) || 0,
      position: playerData.pos,
      position_played: playerData.pos,
      tackles: parseInt(playerData.tackles) || 0,
      passes_made: parseInt(playerData.passesmade) || 0,
      pass_attempts: parseInt(playerData.passattempts) || 0,
      shots: parseInt(playerData.shots) || 0,
      saves_diving: parseInt(playerData.gksaves) || 0,
      saves_reflex: 0,
      saves_parry: 0,
      saves_cross: 0,
      saves_punch: 0,
      interceptions: parseInt(playerData.interceptions) || 0,
      clearances: parseInt(playerData.clearances) || 0,
      dribbles: parseInt(playerData.dribblessucc) || 0,
      fouls: parseInt(playerData.foulcommitted) || 0,
      offsides: parseInt(playerData.offsides) || 0,
      man_of_match: playerData.mom === "1",
      goals_conceded: parseInt(playerData.goalsconceded) || 0,
      possession: parseInt(playerData.poss) || 0,
    })) as PlayerStat[];
  };

  // Get all player names from a match (both teams)
  const getMatchPlayerNames = (match: ClubMatch): string[] => {
    const names: string[] = [];
    
    // Get our team player names from player_stats
    const teamStats = parsePlayerStats(match.player_stats);
    teamStats.forEach(player => {
      const name = getPlayerName(player);
      if (name && name !== "Unknown Player") {
        names.push(name.toLowerCase());
      }
    });
    
    // Get opponent player names from match_data
    const opponentStats = parseOpponentStats(match);
    opponentStats.forEach(player => {
      const name = getPlayerName(player);
      if (name && name !== "Unknown Player") {
        names.push(name.toLowerCase());
      }
    });
    
    return names;
  };

  // Filter matches by search query (opponent name or player name). Not memoised: it's cheap, and the
  // name helpers read the selected server's clubs, so a memo keyed on matches alone could go stale.
  const filterMatches = (): ClubMatch[] => {
    if (!matches) return [];
    if (!searchQuery.trim()) return matches;
    
    const query = searchQuery.toLowerCase();
    return matches.filter(match => {
      // Check opponent team name
      const opponentName = getOpponentName(match).toLowerCase();
      if (opponentName.includes(query)) return true;
      
      // Check player names
      const playerNames = getMatchPlayerNames(match);
      return playerNames.some(name => name.includes(query));
    });
  };
  const filteredMatches = filterMatches();

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
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Tabs value={viewMode} onValueChange={setViewMode} className="w-auto">
              <TabsList>
                <TabsTrigger value="matches" className="gap-1">
                  <Target className="h-4 w-4" />
                  Matches
                </TabsTrigger>
                <TabsTrigger value="sessions" className="gap-1">
                  <Clock className="h-4 w-4" />
                  Sessions
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team or player..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full sm:w-[200px]"
              />
            </div>
            <Select value={clubFilter} onValueChange={setClubFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
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
        </div>

        {/* Sessions View */}
        {viewMode === "sessions" ? (
          <SessionsList guildId={selectedGuildId} clubFilter={clubFilter} />
        ) : (
          <>
        {/* Stats Summary */}
        {filteredMatches && filteredMatches.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-emerald-500">
                  {filteredMatches.filter(m => m.result === "win").length}
                </div>
                <p className="text-sm text-muted-foreground">Wins</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-500">
                  {filteredMatches.filter(m => m.result === "loss").length}
                </div>
                <p className="text-sm text-muted-foreground">Losses</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-amber-500">
                  {filteredMatches.filter(m => m.result === "draw").length}
                </div>
                <p className="text-sm text-muted-foreground">Draws</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {filteredMatches.length}
                </div>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "Matching" : "Total"} Games
                </p>
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
        ) : filteredMatches && filteredMatches.length > 0 ? (
          <div className="space-y-3">
            {filteredMatches.map((match) => (
              <Card 
                key={match.id} 
                className="hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedMatch(match);
                  setStatsTab("team");
                }}
              >
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
                        <span className="font-medium">{getOpponentName(match)}</span>
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

                    {/* Badges & Arrow */}
                    <div className="flex items-center gap-2">
                      {getMatchTypeBadge(match)}
                      <Badge variant="outline" className="font-mono text-xs">
                        {match.club_key}
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : searchQuery ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">No Matches Found</h3>
              <p className="text-muted-foreground">
                No games found against "{searchQuery}". Try a different search term.
              </p>
            </CardContent>
          </Card>
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
          </>
        )}

        {/* Match Detail Modal */}
        <Dialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            {selectedMatch && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {getResultIcon(selectedMatch.result)}
                      <span className="text-2xl font-mono">
                        {selectedMatch.score_for ?? "-"} - {selectedMatch.score_against ?? "-"}
                      </span>
                      {getResultBadge(selectedMatch.result)}
                    </div>
                  </DialogTitle>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
                    <span className="font-medium text-foreground">{getClubName(selectedMatch.club_key)}</span>
                    <span>vs</span>
                    <span>{getOpponentName(selectedMatch)}</span>
                    <span>•</span>
                    <span>{format(new Date(selectedMatch.created_at), "MMM d, yyyy h:mm a")}</span>
                    {getMatchTypeBadge(selectedMatch)}
                  </div>
                </DialogHeader>

                <Tabs value={statsTab} onValueChange={setStatsTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="team">Your Team</TabsTrigger>
                    <TabsTrigger value="opponent">
                      Opponent ({parseOpponentStats(selectedMatch).length})
                    </TabsTrigger>
                  </TabsList>

                  <ScrollArea className="max-h-[55vh]">
                    <TabsContent value="team" className="mt-0">
                      {parsePlayerStats(selectedMatch.player_stats).length > 0 ? (
                        <div className="space-y-6">
                          {/* Player Stats Table */}
                          <div>
                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {getClubName(selectedMatch.club_key)} Performance
                            </h3>
                            <div className="rounded-md border overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="min-w-[150px]">Player</TableHead>
                                    <TableHead className="text-center">Category</TableHead>
                                    <TableHead className="text-center">Role</TableHead>
                                    <TableHead className="text-center">
                                      <Star className="h-4 w-4 mx-auto" />
                                    </TableHead>
                                    <TableHead className="text-center">
                                      <Goal className="h-4 w-4 mx-auto" />
                                    </TableHead>
                                    <TableHead className="text-center">
                                      <HandHelping className="h-4 w-4 mx-auto" />
                                    </TableHead>
                                    <TableHead className="text-center">Shots</TableHead>
                                    <TableHead className="text-center">Pass</TableHead>
                                    <TableHead className="text-center">Tackles</TableHead>
                                    <TableHead className="text-center">Int</TableHead>
                                    <TableHead className="text-center">Saves</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {parsePlayerStats(selectedMatch.player_stats).map((player, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                          {getPlayerName(player)}
                                          {player.man_of_match && (
                                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                                              MOTM
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {(() => {
                                          const category = player.position_played || player.position;
                                          if (!category) return <span className="text-muted-foreground">-</span>;
                                          return (
                                            <Badge className={cn("text-xs capitalize", getPositionalCategoryBadgeClasses(category))}>
                                              {formatPositionalCategory(category)}
                                            </Badge>
                                          );
                                        })()}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {(() => {
                                          const info = getArchetypeInfo(player.archetypeid);
                                          const name = getArchetypeName(player.archetypeid);
                                          if (!name) return <span className="text-muted-foreground">-</span>;
                                          return (
                                            <Badge className={cn("text-xs", getArchetypeBadgeClasses(info?.category || null))}>
                                              {name}
                                            </Badge>
                                          );
                                        })()}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.ea_match_rating || player.rating || "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.goals ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.assists ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.shots ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono text-xs">
                                        {player.passes_made !== undefined && player.pass_attempts !== undefined
                                          ? `${player.passes_made}/${player.pass_attempts}`
                                          : "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.tackles ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.interceptions ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {(player.saves || player.saves_diving || player.saves_reflex) 
                                          ? (player.saves ?? ((player.saves_diving || 0) + (player.saves_reflex || 0) + (player.saves_parry || 0) + (player.saves_cross || 0) + (player.saves_punch || 0)))
                                          : "-"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>

                          {/* Detailed Stats Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {parsePlayerStats(selectedMatch.player_stats).map((player, idx) => (
                              <Card key={idx} className="overflow-hidden">
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold">{getPlayerName(player)}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {player.position_played || player.position || "?"}
                                      </Badge>
                                    </div>
                                    {player.man_of_match && (
                                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        <Star className="h-3 w-3 mr-1" />
                                        MOTM
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div className="text-center p-2 bg-muted/50 rounded">
                                      <div className="text-lg font-bold">{player.ea_match_rating || player.rating || "-"}</div>
                                      <div className="text-xs text-muted-foreground">Rating</div>
                                    </div>
                                    <div className="text-center p-2 bg-muted/50 rounded">
                                      <div className="text-lg font-bold text-emerald-500">{player.goals ?? 0}</div>
                                      <div className="text-xs text-muted-foreground">Goals</div>
                                    </div>
                                    <div className="text-center p-2 bg-muted/50 rounded">
                                      <div className="text-lg font-bold text-blue-500">{player.assists ?? 0}</div>
                                      <div className="text-xs text-muted-foreground">Assists</div>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                                    {player.shots !== undefined && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.shots}</div>
                                        <div className="text-muted-foreground">Shots</div>
                                      </div>
                                    )}
                                    {player.tackles !== undefined && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.tackles}</div>
                                        <div className="text-muted-foreground">Tackles</div>
                                      </div>
                                    )}
                                    {player.interceptions !== undefined && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.interceptions}</div>
                                        <div className="text-muted-foreground">Int</div>
                                      </div>
                                    )}
                                    {player.clearances !== undefined && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.clearances}</div>
                                        <div className="text-muted-foreground">Clears</div>
                                      </div>
                                    )}
                                    {player.dribbles !== undefined && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.dribbles}</div>
                                        <div className="text-muted-foreground">Dribbles</div>
                                      </div>
                                    )}
                                    {player.fouls !== undefined && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.fouls}</div>
                                        <div className="text-muted-foreground">Fouls</div>
                                      </div>
                                    )}
                                    {player.offsides !== undefined && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.offsides}</div>
                                        <div className="text-muted-foreground">Offsides</div>
                                      </div>
                                    )}
                                    {(player.passes_made !== undefined) && (
                                      <div className="text-center">
                                        <div className="font-mono">{player.passes_made}/{player.pass_attempts || "?"}</div>
                                        <div className="text-muted-foreground">Passes</div>
                                      </div>
                                    )}
                                  </div>

                                  {(player.saves_diving || player.saves_reflex || player.saves_parry) && (
                                    <div className="mt-3 pt-3 border-t">
                                      <div className="text-xs text-muted-foreground mb-2">Goalkeeper Saves</div>
                                      <div className="grid grid-cols-5 gap-2 text-xs">
                                        <div className="text-center">
                                          <div className="font-mono">{player.saves_diving || 0}</div>
                                          <div className="text-muted-foreground">Diving</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="font-mono">{player.saves_reflex || 0}</div>
                                          <div className="text-muted-foreground">Reflex</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="font-mono">{player.saves_parry || 0}</div>
                                          <div className="text-muted-foreground">Parry</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="font-mono">{player.saves_cross || 0}</div>
                                          <div className="text-muted-foreground">Cross</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="font-mono">{player.saves_punch || 0}</div>
                                          <div className="text-muted-foreground">Punch</div>
                                        </div>
                                      </div>
                                      {player.goals_conceded !== undefined && (
                                        <div className="mt-2 text-center">
                                          <span className="text-muted-foreground">Goals Conceded: </span>
                                          <span className="font-mono">{player.goals_conceded}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No player stats available for your team.</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="opponent" className="mt-0">
                      {parseOpponentStats(selectedMatch).length > 0 ? (
                        <div className="space-y-6">
                          {/* Opponent Stats Table */}
                          <div>
                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              {getOpponentName(selectedMatch)} Performance
                            </h3>
                            <div className="rounded-md border overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="min-w-[150px]">Player</TableHead>
                                    <TableHead className="text-center">Pos</TableHead>
                                    <TableHead className="text-center">
                                      <Star className="h-4 w-4 mx-auto" />
                                    </TableHead>
                                    <TableHead className="text-center">
                                      <Goal className="h-4 w-4 mx-auto" />
                                    </TableHead>
                                    <TableHead className="text-center">
                                      <HandHelping className="h-4 w-4 mx-auto" />
                                    </TableHead>
                                    <TableHead className="text-center">Shots</TableHead>
                                    <TableHead className="text-center">Pass</TableHead>
                                    <TableHead className="text-center">Tackles</TableHead>
                                    <TableHead className="text-center">Int</TableHead>
                                    <TableHead className="text-center">Saves</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {parseOpponentStats(selectedMatch).map((player, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                          {getPlayerName(player)}
                                          {player.man_of_match && (
                                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                                              MOTM
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Badge variant="outline" className="text-xs">
                                          {player.position_played || player.position || "-"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.ea_match_rating || player.rating || "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.goals ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.assists ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.shots ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono text-xs">
                                        {player.passes_made !== undefined && player.pass_attempts !== undefined
                                          ? `${player.passes_made}/${player.pass_attempts}`
                                          : "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.tackles ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.interceptions ?? "-"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {player.saves_diving || "-"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>

                          {/* Opponent Detailed Stats Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {parseOpponentStats(selectedMatch).map((player, idx) => (
                              <Card key={idx} className="overflow-hidden border-red-500/20">
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold">{getPlayerName(player)}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {player.position_played || player.position || "?"}
                                      </Badge>
                                    </div>
                                    {player.man_of_match && (
                                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                        <Star className="h-3 w-3 mr-1" />
                                        MOTM
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div className="text-center p-2 bg-muted/50 rounded">
                                      <div className="text-lg font-bold">{player.ea_match_rating || player.rating || "-"}</div>
                                      <div className="text-xs text-muted-foreground">Rating</div>
                                    </div>
                                    <div className="text-center p-2 bg-muted/50 rounded">
                                      <div className="text-lg font-bold text-red-500">{player.goals ?? 0}</div>
                                      <div className="text-xs text-muted-foreground">Goals</div>
                                    </div>
                                    <div className="text-center p-2 bg-muted/50 rounded">
                                      <div className="text-lg font-bold text-orange-500">{player.assists ?? 0}</div>
                                      <div className="text-xs text-muted-foreground">Assists</div>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                                    <div className="text-center">
                                      <div className="font-mono">{player.shots ?? 0}</div>
                                      <div className="text-muted-foreground">Shots</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-mono">{player.tackles ?? 0}</div>
                                      <div className="text-muted-foreground">Tackles</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-mono">{player.interceptions ?? 0}</div>
                                      <div className="text-muted-foreground">Int</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-mono">{player.clearances ?? 0}</div>
                                      <div className="text-muted-foreground">Clears</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-mono">{player.dribbles ?? 0}</div>
                                      <div className="text-muted-foreground">Dribbles</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-mono">{player.fouls ?? 0}</div>
                                      <div className="text-muted-foreground">Fouls</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-mono">{player.offsides ?? 0}</div>
                                      <div className="text-muted-foreground">Offsides</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-mono">{player.possession ?? 0}%</div>
                                      <div className="text-muted-foreground">Poss</div>
                                    </div>
                                  </div>

                                  {player.saves_diving > 0 && (
                                    <div className="mt-3 pt-3 border-t">
                                      <div className="text-xs text-muted-foreground mb-2">Goalkeeper</div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="text-center">
                                          <div className="font-mono">{player.saves_diving}</div>
                                          <div className="text-muted-foreground">Saves</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="font-mono">{player.goals_conceded}</div>
                                          <div className="text-muted-foreground">Conceded</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No opponent stats available for this match.</p>
                          <p className="text-sm mt-2">Opponent data may not be stored in the match record.</p>
                        </div>
                      )}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
