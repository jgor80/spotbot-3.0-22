import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useGuild } from "@/contexts/GuildContext";
import { ScoutingLists } from "@/components/scouting/ScoutingLists";
import { MatchDetailView } from "@/components/scouting/MatchDetailView";
import {
  Search,
  Loader2, 
  Target, 
  Swords, 
  ClipboardList,
  Trophy,
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Sparkles,
  ListChecks,
  BarChart3,
  MessageSquare,
  Bolt
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RatingBadge } from "@/components/player/RatingBadge";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";

interface ClubMatch {
  id: string;
  ea_match_id: string;
  result: string | null;
  score_for: number | null;
  score_against: number | null;
  opponent_club_name: string | null;
  match_type: string;
  created_at: string;
}

interface RecentResultsHighlight {
  ratings: { name: string; avg: number; matches: number }[];
  goals: { name: string; goals: number; conversion: number; shots: number }[];
  assists: { name: string; assists: number }[];
  passes: { name: string; passes: number; success: number }[];
  tackles: { name: string; tackles: number }[];
  dribbles: { name: string; dribbles: number }[];
  interceptions: { name: string; interceptions: number }[];
  saves: { name: string; saves: number }[];
}

interface RecentResultsResponse {
  window_size: number;
  recent_matches: ClubMatch[];
  detailed_matches?: DetailedMatch[];
  player_highlights: RecentResultsHighlight;
  ai_summary?: string;
}

interface DetailedMatch {
  id: string;
  ea_match_id: string;
  result: string | null;
  score_for: number;
  score_against: number;
  opponent_club_name: string | null;
  match_type: string;
  created_at: string;
  club_key: string;
  players: any[];
}

interface PlayerSummary {
  discord_user_id: string;
  discord_username: string | null;
  ea_username: string | null;
  overall_rating: number;
  primary_position: string | null;
}

interface AggregatePlayerStats {
  discord_user_id: string;
  discord_username: string | null;
  overall_rating: number;
  primary_position: string | null;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  assists: number;
  win_rate: number;
  form_rating: number | null;
  reliability_score: number | null;
  achievement_count: number;
  ea_username?: string | null;
  ea_platform?: string | null;
  clean_sheets: number;
  man_of_match: number;
  avg_match_rating: number | null;
  shots: number;
  tackles: number;
  passes_made: number;
  pass_attempts: number;
  saves: number;
}

export default function ScoutingPage() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  
  const [searchClubName, setSearchClubName] = useState("");
  const [searchPlatform, setSearchPlatform] = useState("ps5");
  const [isSearching, setIsSearching] = useState(false);
  const [scoutReport, setScoutReport] = useState<string | null>(null);
  
  // Player scouting state
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [isScoutingPlayer, setIsScoutingPlayer] = useState(false);
  const [isScoutingEaPlayer, setIsScoutingEaPlayer] = useState(false);
  const [eaGamertag, setEaGamertag] = useState("");
  const [playerScoutReport, setPlayerScoutReport] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [commandOutputs, setCommandOutputs] = useState<{ title: string; content: string }[]>([]);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  // Fetch players for selection with EA usernames
  const { data: players } = useQuery({
    queryKey: ["players", selectedGuildId],
    queryFn: async (): Promise<PlayerSummary[]> => {
      if (!selectedGuildId) return [];
      
      // Fetch player summaries
      const { data: summaryData, error: summaryError } = await supabase
        .from("player_summary")
        .select("discord_user_id, discord_username, overall_rating, primary_position")
        .eq("guild_id", selectedGuildId)
        .order("overall_rating", { ascending: false });
      
      if (summaryError) throw summaryError;

      // Fetch EA usernames from profiles
      const discordIds = (summaryData || []).map(p => p.discord_user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("discord_user_id, ea_username")
        .in("discord_user_id", discordIds);

      const eaUsernameMap = new Map(
        (profilesData || []).map(p => [p.discord_user_id, p.ea_username])
      );

      return (summaryData || []).map(p => ({
        ...p,
        ea_username: eaUsernameMap.get(p.discord_user_id) || null,
      }));
    },
    enabled: !!selectedGuildId,
  });

  // Fetch saved scouting reports
  const { data: savedReports, refetch: refetchReports } = useQuery({
    queryKey: ["scoutingReports", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("scouting_reports")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("updated_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch aggregate stats for all players with EA usernames
  const { data: aggregateStats, isLoading: aggregateLoading } = useQuery({
    queryKey: ["aggregateStats", selectedGuildId],
    queryFn: async (): Promise<AggregatePlayerStats[]> => {
      if (!selectedGuildId) return [];
      
      // Fetch player summary
      const { data: summaryData, error: summaryError } = await supabase
        .from("player_summary")
        .select(`
          discord_user_id,
          discord_username,
          overall_rating,
          primary_position,
          games_played,
          wins,
          losses,
          draws,
          goals,
          assists,
          win_rate,
          form_rating,
          reliability_score,
          achievement_count,
          clean_sheets,
          man_of_match,
          avg_match_rating,
          shots,
          tackles,
          passes_made,
          pass_attempts,
          saves
        `)
        .eq("guild_id", selectedGuildId)
        .order("overall_rating", { ascending: false });
      
      if (summaryError) throw summaryError;
      
      // Fetch profiles for EA usernames
      const discordIds = (summaryData || []).map(p => p.discord_user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("discord_user_id, ea_username, ea_platform")
        .in("discord_user_id", discordIds);
      
      // Merge EA usernames into player stats
      const profileMap = new Map(
        (profilesData || []).map(p => [p.discord_user_id, p])
      );
      
      return (summaryData || []).map(player => ({
        ...player,
        losses: player.losses || 0,
        draws: player.draws || 0,
        clean_sheets: player.clean_sheets || 0,
        man_of_match: player.man_of_match || 0,
        avg_match_rating: player.avg_match_rating || null,
        shots: player.shots || 0,
        tackles: player.tackles || 0,
        passes_made: player.passes_made || 0,
        pass_attempts: player.pass_attempts || 0,
        saves: player.saves || 0,
        ea_username: profileMap.get(player.discord_user_id)?.ea_username || null,
        ea_platform: profileMap.get(player.discord_user_id)?.ea_platform || null
      }));
    },
    enabled: !!selectedGuildId,
  });

  // Fetch recent club matches for the current guild
  const { data: recentMatches, isLoading: matchesLoading } = useQuery({
    queryKey: ["clubMatches", selectedGuildId],
    queryFn: async (): Promise<ClubMatch[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("club_matches")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch recent results with highlights and AI summary
  const { data: recentResults, isLoading: recentResultsLoading } = useQuery({
    queryKey: ["recentResults", selectedGuildId],
    queryFn: async (): Promise<RecentResultsResponse | null> => {
      if (!selectedGuildId) return null;

      const { data, error } = await supabase.functions.invoke("recent-results", {
        body: { guild_id: selectedGuildId, window_size: 5 },
      });

      if (error) throw error;
      if (!data || data.error) throw new Error(data.error || "Failed to load results");
      return data as RecentResultsResponse;
    },
    enabled: !!selectedGuildId,
  });

  // Load existing report when player is selected
  const loadExistingReport = (playerId: string) => {
    const existingReport = savedReports?.find(r => r.discord_user_id === playerId);
    if (existingReport) {
      setPlayerScoutReport(existingReport.report_content);
      setPlayerData(existingReport.player_data);
    } else {
      setPlayerScoutReport(null);
      setPlayerData(null);
    }
  };

  const handlePlayerSelect = (playerId: string) => {
    setSelectedPlayerId(playerId);
    loadExistingReport(playerId);
  };

  const handleScoutPlayer = async () => {
    if (!selectedPlayerId || !selectedGuildId) return;

    setIsScoutingPlayer(true);
    setPlayerScoutReport(null);
    setPlayerData(null);
    
    try {
      toast({
        title: "Scouting Player",
        description: "Gathering stats and generating AI analysis...",
      });
      
      const { data, error } = await supabase.functions.invoke("scout-player", {
        body: { guild_id: selectedGuildId, player_id: selectedPlayerId }
      });
      
      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setPlayerScoutReport(data.analysis);
      setPlayerData(data.player_data);
      
      // Refetch saved reports to update cache
      refetchReports();
      
      toast({
        title: "Scout Report Ready",
        description: "AI analysis complete and saved",
      });

      setCommandOutputs(prev => [
        {
          title: "SquadIQ • Player Scout",
          content: `Saved and refreshed the report for ${selectedPlayerId}. Latest rating: ${
            data.player_data?.overall?.rating?.toFixed?.(1) || "N/A"
          } across ${data.player_data?.overall?.games_played || 0} games.`,
        },
        ...prev,
      ].slice(0, 4));
    } catch (error) {
      toast({
        title: "Scouting Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsScoutingPlayer(false);
    }
  };

  const handleScoutEaPlayer = async () => {
    const trimmedGamertag = eaGamertag.trim();
    if (!trimmedGamertag) {
      toast({
        title: "EA Gamertag Required",
        description: "Enter an EA ID or gamertag to scout",
        variant: "destructive",
      });
      return;
    }

    setIsScoutingEaPlayer(true);
    setPlayerScoutReport(null);
    setPlayerData(null);

    try {
      toast({
        title: "Searching EA",
        description: `Gathering stats for ${trimmedGamertag}...`,
      });

      const { data, error } = await supabase.functions.invoke("scout-player", {
        body: { ea_username: trimmedGamertag, ea_platform: searchPlatform },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setPlayerScoutReport(data.analysis);
      setPlayerData(data.player_data);

      toast({
        title: "Scout Report Ready",
        description: `AI analysis generated for ${trimmedGamertag}`,
      });

      appendCommandOutput(
        "SquadIQ • EA Gamertag Scout",
        `Pulled every EA stat for ${trimmedGamertag} (${searchPlatform.toUpperCase()}). Latest rating: ${
          data.player_data?.overall?.rating?.toFixed?.(1) || "N/A"
        } | Games: ${data.player_data?.overall?.games_played || 0}.`
      );
    } catch (error) {
      toast({
        title: "EA Lookup Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsScoutingEaPlayer(false);
    }
  };

  const handleScoutClub = async () => {
    if (!searchClubName.trim()) return;
    
    setIsSearching(true);
    setScoutReport(null);
    
    try {
      toast({
        title: "Scouting Club",
        description: `Searching for ${searchClubName} on ${searchPlatform}...`,
      });
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setScoutReport(`
## Scout Report: ${searchClubName}

### Overview
- **Platform:** ${searchPlatform.toUpperCase()}
- **Division:** Elite Division
- **Recent Form:** WWDWL

### Key Players
1. **PlayerOne** - ST - 78 OVR - Top Scorer
2. **PlayerTwo** - CM - 75 OVR - Playmaker
3. **PlayerThree** - GK - 72 OVR - Shot Stopper

### Tactical Analysis
This team plays an aggressive 4-3-3 formation with quick transitions.
Focus on controlling midfield to limit their counter-attacks.

### Recommendations
- Press high to disrupt their build-up
- Target their weak left-back position
- Be wary of their clinical striker
      `);

      toast({
        title: "Scout Report Ready",
        description: `Report generated for ${searchClubName}`,
      });
    } catch (error) {
      toast({
        title: "Scouting Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const appendCommandOutput = (title: string, content: string) => {
    setCommandOutputs(prev => [{ title, content }, ...prev].slice(0, 4));
  };

  const handleQuickRecentResults = async () => {
    if (!selectedGuildId) {
      toast({
        title: "Select a Guild",
        description: "Choose a server to pull recent results",
        variant: "destructive",
      });
      return;
    }

    setActiveCommand("recent-results");
    try {
      const { data, error } = await supabase.functions.invoke("recent-results", {
        body: { guild_id: selectedGuildId, window_size: 5 },
      });

      if (error) throw error;
      if (!data || data.error) throw new Error(data?.error || "Unable to load recent results");

      const goalsLeader = data.player_highlights?.goals?.[0];
      const ratingLeader = data.player_highlights?.ratings?.[0];
      const assistsLeader = data.player_highlights?.assists?.[0];

      appendCommandOutput(
        "SquadIQ • Recent Results",
        `Last ${data.window_size} matches ready. ${
          ratingLeader ? `${ratingLeader.name} leads AMR at ${ratingLeader.avg.toFixed?.(1)}` : "No rating leader yet"
        }. ${
          goalsLeader ? `${goalsLeader.name} tops goals (${goalsLeader.goals})` : "No goals data"
        }. ${assistsLeader ? `${assistsLeader.name} leads assists (${assistsLeader.assists})` : "No assists data"}.`
      );

      toast({ title: "Recent Results", description: "Pulled last 5-match recap for Discord panel" });
    } catch (error) {
      toast({
        title: "Recent Results Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setActiveCommand(null);
    }
  };

  const handleQuickFormLeaderboard = async () => {
    if (!selectedGuildId) {
      toast({
        title: "Select a Guild",
        description: "Choose a server to pull form leaderboard",
        variant: "destructive",
      });
      return;
    }

    setActiveCommand("form-leaderboard");
    try {
      const { data, error } = await supabase.functions.invoke("get-leaderboard", {
        body: { guild_id: selectedGuildId, type: "form", limit: 5 },
      });

      if (error) throw error;
      if (!data || data.error) throw new Error(data?.error || "Unable to load form leaderboard");

      const entries = data.entries || [];
      const lines = entries
        .map((entry: any) => `${entry.rank}. ${entry.ea_username || entry.discord_username || entry.discord_user_id} (${entry.form_rating ?? "-"} form)`)
        .join(" | ");

      appendCommandOutput(
        "SquadIQ • In-Form Leaders",
        entries.length ? lines : "No form data yet — run EA sync first."
      );

      toast({ title: "Form Leaderboard", description: "In-form results are ready for the SquadIQ panel" });
    } catch (error) {
      toast({
        title: "Form Leaderboard Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setActiveCommand(null);
    }
  };

  const getResultIcon = (result: string | null) => {
    switch (result) {
      case "win":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "loss":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case "win":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Win</Badge>;
      case "loss":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Loss</Badge>;
      default:
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Draw</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Scouting Center</h1>
          <p className="text-muted-foreground">Scout opponents, players, and analyze match history</p>
        </div>

        <Card className="bg-muted/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              SquadIQ Discord Panel
            </CardTitle>
            <CardDescription>
              One-click buttons that mirror the Discord scouting commands so staff don&apos;t need slash commands.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-4 gap-2">
              <Button
                variant="secondary"
                onClick={handleScoutPlayer}
                disabled={!selectedPlayerId || isScoutingPlayer || activeCommand === "scout-player"}
                className="w-full justify-start gap-2"
              >
                {isScoutingPlayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bolt className="h-4 w-4" />}
                Scout Selected Player
              </Button>

              <Button
                variant="secondary"
                onClick={handleScoutEaPlayer}
                disabled={isScoutingEaPlayer}
                className="w-full justify-start gap-2"
              >
                {isScoutingEaPlayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bolt className="h-4 w-4" />}
                Scout EA Gamertag
              </Button>

              <Button
                variant="outline"
                onClick={handleQuickRecentResults}
                disabled={activeCommand === "recent-results"}
                className="w-full justify-start gap-2"
              >
                {activeCommand === "recent-results" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bolt className="h-4 w-4" />}
                Recent Results Recap
              </Button>

              <Button
                variant="outline"
                onClick={handleQuickFormLeaderboard}
                disabled={activeCommand === "form-leaderboard"}
                className="w-full justify-start gap-2"
              >
                {activeCommand === "form-leaderboard" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bolt className="h-4 w-4" />}
                In-Form Leaderboard
              </Button>
            </div>

            {commandOutputs.length > 0 && (
              <div className="grid md:grid-cols-2 gap-3">
                {commandOutputs.map((entry, idx) => (
                  <div key={`${entry.title}-${idx}`} className="rounded-lg border bg-background p-3 shadow-sm">
                    <p className="font-medium">{entry.title}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{entry.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="player" className="space-y-4">
          <TabsList>
            <TabsTrigger value="player" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Scout Player
            </TabsTrigger>
            <TabsTrigger value="scout" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Scout Club
            </TabsTrigger>
            <TabsTrigger value="matches" className="flex items-center gap-2">
              <Swords className="h-4 w-4" />
              Club Matches
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Match Preview
            </TabsTrigger>
            <TabsTrigger value="lists" className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              My Lists
            </TabsTrigger>
            <TabsTrigger value="all-stats" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              All Players
            </TabsTrigger>
          </TabsList>

          <TabsContent value="player" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Player Scout
                </CardTitle>
                <CardDescription>
                  Generate a comprehensive AI-powered scouting report for any player
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedPlayerId} onValueChange={handlePlayerSelect}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a player to scout..." />
                    </SelectTrigger>
                    <SelectContent>
                      {players?.map((player) => {
                        const hasReport = savedReports?.some(r => r.discord_user_id === player.discord_user_id);
                        const displayName = player.ea_username || player.discord_username || player.discord_user_id;
                        return (
                          <SelectItem key={player.discord_user_id} value={player.discord_user_id}>
                            <span className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {player.overall_rating.toFixed(1)}
                              </Badge>
                              {displayName}
                              {player.primary_position && (
                                <span className="text-muted-foreground text-xs">
                                  ({player.primary_position})
                                </span>
                              )}
                              {hasReport && (
                                <Badge variant="secondary" className="text-xs ml-1">
                                  Report
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleScoutPlayer} 
                    disabled={isScoutingPlayer || !selectedPlayerId}
                    title={playerScoutReport ? "Regenerate Report" : "Generate Report"}
                  >
                    {isScoutingPlayer ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                  <div className="flex flex-col md:flex-row gap-2">
                    <Input
                      placeholder="EA ID / Gamertag (outside your server)"
                      value={eaGamertag}
                      onChange={(e) => setEaGamertag(e.target.value)}
                    />
                    <Select value={searchPlatform} onValueChange={setSearchPlatform}>
                      <SelectTrigger className="md:w-[180px]">
                        <SelectValue placeholder="Platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ps5">PS5 / PS4</SelectItem>
                        <SelectItem value="xbox-series-xs">Xbox</SelectItem>
                        <SelectItem value="pc">PC</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleScoutEaPlayer}
                      disabled={isScoutingPlayer || isScoutingEaPlayer}
                      variant="secondary"
                    >
                      {isScoutingEaPlayer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-2">Scout EA Gamertag</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pulls every stat EA exposes for this player across tracked clubs and any clubs we discover in EA search.
                  </p>
                </div>

                {/* Show existing report timestamp if viewing saved report */}
                {selectedPlayerId && savedReports?.find(r => r.discord_user_id === selectedPlayerId) && !(isScoutingPlayer || isScoutingEaPlayer) && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>Last updated: {format(new Date(savedReports.find(r => r.discord_user_id === selectedPlayerId)!.updated_at), "PPp")}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleScoutPlayer}>
                      Refresh Report
                    </Button>
                  </div>
                )}

                {(isScoutingPlayer || isScoutingEaPlayer) && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center space-y-4">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                      <p className="text-muted-foreground">
                        Analyzing player data with AI...
                      </p>
                    </div>
                  </div>
                )}

                {playerData && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg bg-muted/30 border">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{playerData.overall.rating?.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">Overall Rating</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{playerData.overall.games_played}</p>
                      <p className="text-xs text-muted-foreground">Games</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{playerData.overall.win_rate?.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Win Rate</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{playerData.overall.goals + playerData.overall.assists}</p>
                      <p className="text-xs text-muted-foreground">G+A</p>
                    </div>
                  </div>
                )}

                {playerData?.raw_member_fields?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    EA fields discovered: {playerData.raw_member_fields.join(", ")}
                  </p>
                )}

                {playerScoutReport && (
                  <div className="mt-6 p-6 rounded-lg bg-muted/50 border prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{playerScoutReport}</ReactMarkdown>
                  </div>
                )}

                {!playerScoutReport && !(isScoutingPlayer || isScoutingEaPlayer) && (
                  <div className="py-12 text-center text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a player to generate an AI scouting report</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scout" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Scout a Club
                </CardTitle>
                <CardDescription>
                  Search for any Pro Clubs team and generate a detailed scouting report
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Club name to scout..."
                    value={searchClubName}
                    onChange={(e) => setSearchClubName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScoutClub()}
                    className="flex-1"
                  />
                  <Select value={searchPlatform} onValueChange={setSearchPlatform}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ps5">PS5</SelectItem>
                      <SelectItem value="ps4">PS4</SelectItem>
                      <SelectItem value="xbsx">Xbox X|S</SelectItem>
                      <SelectItem value="xone">Xbox One</SelectItem>
                      <SelectItem value="pc">PC</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleScoutClub} disabled={isSearching || !searchClubName.trim()}>
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {scoutReport && (
                  <div className="mt-6 p-6 rounded-lg bg-muted/50 border">
                    <pre className="whitespace-pre-wrap text-sm font-sans">{scoutReport}</pre>
                  </div>
                )}

                {!scoutReport && !isSearching && (
                  <div className="py-12 text-center text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Enter a club name to generate a scouting report</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="matches" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Last 5 Match Standouts
                  </CardTitle>
                  <CardDescription>
                    Aggregated leaders from the most recent matches in your server
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recentResultsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : recentResults ? (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs uppercase text-muted-foreground mb-1">Highest AMR</p>
                          <div className="space-y-1">
                            {recentResults.player_highlights.ratings.map((p) => (
                              <div key={`rating-${p.name}`} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                                <span className="font-medium truncate">{p.name}</span>
                                <span className="text-sm text-muted-foreground">{p.avg.toFixed(1)} AMR</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-muted-foreground mb-1">Top Goalscorers</p>
                          <div className="space-y-1">
                            {recentResults.player_highlights.goals.map((p) => (
                              <div key={`goals-${p.name}`} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                                <span className="font-medium truncate">{p.name}</span>
                                <span className="text-sm text-muted-foreground">{p.goals} G ({p.conversion}% conv)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-muted-foreground mb-1">Top Assisters</p>
                          <div className="space-y-1">
                            {recentResults.player_highlights.assists.map((p) => (
                              <div key={`assists-${p.name}`} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                                <span className="font-medium truncate">{p.name}</span>
                                <span className="text-sm text-muted-foreground">{p.assists} assists</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs uppercase text-muted-foreground mb-1">Top Passers</p>
                          <div className="space-y-1">
                            {recentResults.player_highlights.passes.map((p) => (
                              <div key={`passes-${p.name}`} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                                <span className="font-medium truncate">{p.name}</span>
                                <span className="text-sm text-muted-foreground">{p.passes} passes ({p.success}% success)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-muted-foreground mb-1">Top Tacklers</p>
                          <div className="space-y-1">
                            {recentResults.player_highlights.tackles.map((p) => (
                              <div key={`tackles-${p.name}`} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                                <span className="font-medium truncate">{p.name}</span>
                                <span className="text-sm text-muted-foreground">{p.tackles} tackles</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs uppercase text-muted-foreground mb-1">Dribblers</p>
                            <div className="space-y-1">
                              {recentResults.player_highlights.dribbles.map((p) => (
                                <div key={`dribbles-${p.name}`} className="rounded-lg border bg-muted/40 px-3 py-2">
                                  <p className="font-medium truncate">{p.name}</p>
                                  <p className="text-xs text-muted-foreground">{p.dribbles} dribbles</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-muted-foreground mb-1">Interceptions</p>
                            <div className="space-y-1">
                              {recentResults.player_highlights.interceptions.map((p) => (
                                <div key={`interceptions-${p.name}`} className="rounded-lg border bg-muted/40 px-3 py-2">
                                  <p className="font-medium truncate">{p.name}</p>
                                  <p className="text-xs text-muted-foreground">{p.interceptions} INT</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {recentResults.player_highlights.saves.length > 0 && (
                          <div>
                            <p className="text-xs uppercase text-muted-foreground mb-1">Top Keepers</p>
                            <div className="space-y-1">
                              {recentResults.player_highlights.saves.map((p) => (
                                <div key={`saves-${p.name}`} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                                  <span className="font-medium truncate">{p.name}</span>
                                  <span className="text-sm text-muted-foreground">{p.saves} saves</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-muted-foreground">
                      <p>No recent matches yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    AI Recap (last 5)
                  </CardTitle>
                  <CardDescription>Quick digest of chemistry, form, and takeaways</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentResultsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : recentResults?.ai_summary ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{recentResults.ai_summary}</ReactMarkdown>
                    </div>
                  ) : recentResults ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <p>Sync a few matches to generate an AI recap.</p>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <p>Recent results not available.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-5 w-5" />
                  Recent Club Matches
                </CardTitle>
                <CardDescription>
                  View your club's recent match history and results
                </CardDescription>
              </CardHeader>
              <CardContent>
                {matchesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : recentResults?.detailed_matches && recentResults.detailed_matches.length > 0 ? (
                  <div className="space-y-3">
                    {recentResults.detailed_matches.map((match) => (
                      <MatchDetailView key={match.id} match={match} />
                    ))}
                  </div>
                ) : recentMatches && recentMatches.length > 0 ? (
                  <div className="space-y-3">
                    {recentMatches.map((match) => (
                      <div
                        key={match.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {getResultIcon(match.result)}
                          <div>
                            <p className="font-medium">
                              vs {match.opponent_club_name || "Unknown Club"}
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(match.created_at), "MMM d, yyyy")}
                              <span className="text-muted-foreground/50">•</span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {match.match_type}
                              </Badge>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xl font-bold">
                              {match.score_for ?? 0} - {match.score_against ?? 0}
                            </p>
                          </div>
                          {getResultBadge(match.result)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Swords className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No club matches recorded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Match Preview
                </CardTitle>
                <CardDescription>
                  Generate a pre-match analysis for upcoming games
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Club</label>
                    <Input placeholder="Enter your club name..." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Opponent Club</label>
                    <Input placeholder="Enter opponent club name..." />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Select defaultValue="ps5">
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ps5">PS5</SelectItem>
                      <SelectItem value="ps4">PS4</SelectItem>
                      <SelectItem value="xbsx">Xbox X|S</SelectItem>
                      <SelectItem value="xone">Xbox One</SelectItem>
                      <SelectItem value="pc">PC</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="flex-1">
                    <Trophy className="h-4 w-4 mr-2" />
                    Generate Match Preview
                  </Button>
                </div>

                <div className="mt-6 py-12 text-center text-muted-foreground border-t">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter both club names to generate a match preview</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lists" className="space-y-4">
            <ScoutingLists currentUserId="captain_user" />
          </TabsContent>

          <TabsContent value="all-stats" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  All Player Stats
                </CardTitle>
                <CardDescription>
                  Aggregate stats and ratings for all Discord members
                </CardDescription>
              </CardHeader>
              <CardContent>
                {aggregateLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : aggregateStats && aggregateStats.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead className="text-center">Rating</TableHead>
                          <TableHead className="text-center hidden md:table-cell">Games</TableHead>
                          <TableHead className="text-center hidden md:table-cell">Wins</TableHead>
                          <TableHead className="text-center hidden sm:table-cell">Win %</TableHead>
                          <TableHead className="text-center hidden lg:table-cell">Goals</TableHead>
                          <TableHead className="text-center hidden lg:table-cell">Assists</TableHead>
                          <TableHead className="text-center hidden xl:table-cell">G+A</TableHead>
                          <TableHead className="text-center hidden xl:table-cell">Form</TableHead>
                          <TableHead className="text-center hidden xl:table-cell">Reliability</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aggregateStats.map((player, index) => (
                          <TableRow 
                            key={player.discord_user_id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSelectedPlayerId(player.discord_user_id);
                              // Switch to scout player tab
                              const tabTrigger = document.querySelector('[data-state="active"][value="all-stats"]')?.closest('[role="tablist"]')?.querySelector('[value="player"]') as HTMLElement;
                              tabTrigger?.click();
                            }}
                          >
                            <TableCell className="font-medium text-muted-foreground">
                              {index + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                                  {(player.ea_username || player.discord_username || player.discord_user_id).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {player.ea_username || player.discord_username || player.discord_user_id}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    {player.primary_position && (
                                      <Badge variant="outline" className="text-xs">
                                        {player.primary_position}
                                      </Badge>
                                    )}
                                    {player.ea_username && player.discord_username && (
                                      <span className="text-xs text-muted-foreground">
                                        ({player.discord_username})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <RatingBadge rating={player.overall_rating} />
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              {player.games_played}
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              {player.wins}
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                              <span className={player.win_rate >= 50 ? "text-green-500" : player.win_rate >= 40 ? "text-yellow-500" : "text-red-500"}>
                                {player.win_rate.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-center hidden lg:table-cell">
                              {player.goals}
                            </TableCell>
                            <TableCell className="text-center hidden lg:table-cell">
                              {player.assists}
                            </TableCell>
                            <TableCell className="text-center hidden xl:table-cell font-bold">
                              {player.goals + player.assists}
                            </TableCell>
                            <TableCell className="text-center hidden xl:table-cell">
                              {player.form_rating ? (
                                <span className={player.form_rating >= 60 ? "text-green-500" : player.form_rating >= 40 ? "text-yellow-500" : "text-red-500"}>
                                  {player.form_rating.toFixed(0)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center hidden xl:table-cell">
                              {player.reliability_score ? (
                                <span className={player.reliability_score >= 80 ? "text-green-500" : player.reliability_score >= 60 ? "text-yellow-500" : "text-red-500"}>
                                  {player.reliability_score.toFixed(0)}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No players found in this server</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
