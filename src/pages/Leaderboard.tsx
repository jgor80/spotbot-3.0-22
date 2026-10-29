import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { OffenseLeaderboardTable } from "@/components/leaderboard/OffenseLeaderboardTable";
import { DefenseLeaderboardTable } from "@/components/leaderboard/DefenseLeaderboardTable";
import { GKLeaderboardTable } from "@/components/leaderboard/GKLeaderboardTable";
import { MidfielderLeaderboardTable } from "@/components/leaderboard/MidfielderLeaderboardTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useGuild } from "@/contexts/GuildContext";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { Loader2, TrendingDown } from "lucide-react";
import { useState, useMemo } from "react";

const TIME_PERIODS = [
  { value: "all", label: "All Time" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const BOARD_TYPES = [
  { value: "overall", label: "Overall" },
  { value: "forward", label: "Forward" },
  { value: "midfielder", label: "Midfielder" },
  { value: "defender", label: "Defender" },
  { value: "goalkeeper", label: "Goalkeeper" },
];

const MATCH_TYPES = [
  { value: "all", label: "All Games" },
  { value: "division", label: "Division" },
  { value: "competition", label: "Cup/Competition" },
  { value: "friendly", label: "Friendly" },
  // Short-handed friendlies (Smalls tag); they also count in All Games
  { value: "smalls", label: "Smalls" },
  // Games managers tagged in Discord (Tag Matches); kept off the regular boards
  { value: "tournament", label: "Tournament" },
  { value: "byot", label: "BYOT" },
];

const GAMES_PLAYED_FILTERS = [
  { value: "0", label: "All Players" },
  { value: "10", label: "10+ Games" },
  { value: "25", label: "25+ Games" },
  { value: "50", label: "50+ Games" },
  { value: "100", label: "100+ Games" },
];


export default function Leaderboard() {
  const { selectedGuildId, isLoading: guildLoading, selectedGuild } = useGuild();
  const [activeTab, setActiveTab] = useState("overall");
  const [boardType, setBoardType] = useState("overall");
  const [timePeriod, setTimePeriod] = useState("all");
  const [showWorst, setShowWorst] = useState(false);
  const [clubFilter, setClubFilter] = useState("all");
  const [statsSource, setStatsSource] = useState<"all" | "members" | "games">("games");
  const [matchType, setMatchType] = useState("all");
  const [minGamesPlayed, setMinGamesPlayed] = useState("0");

  const enabledClubs = (selectedGuild?.clubs || []).filter((club) => club.enabled);

  // Pass time_period directly to edge function for filtering by game timestamp
  const timePeriodFilter = useMemo(() => {
    if (timePeriod === "all") return undefined;
    return timePeriod; // "week" or "month"
  }, [timePeriod]);

  // Pass position filter to edge function for positional boards
  const effectivePositionFilter = useMemo(() => {
    if (boardType === "goalkeeper") return "goalkeeper";
    if (boardType === "forward") return "forward";
    if (boardType === "midfielder") return "midfielder";
    if (boardType === "defender") return "defender";
    return undefined;
  }, [boardType]);
  
  // For positional boards, always use tracked game stats (position data comes from match records)
  // Also use tracked games for GK-specific tabs (saves, clean_sheets) since EA member board doesn't have this data
  // Also force tracked games when match type filter is set (can't filter EA member stats by match type)
  // Also force tracked games when time period is set (can only filter by game timestamp with tracked games)
  const effectiveStatsSource = useMemo(() => {
    if (timePeriod !== "all") return "games"; // Time period filter requires tracked games
    if (matchType !== "all") return "games";
    if (boardType !== "overall") return "games";
    // For GK-related tabs on overall board, use tracked games since EA API doesn't provide saves data
    if (activeTab === "saves" || activeTab === "clean_sheets") return "games";
    return statsSource;
  }, [boardType, statsSource, activeTab, matchType, timePeriod]);
  
  const { data: players, isLoading: playersLoading, error } = useLeaderboard(
    selectedGuildId,
    activeTab,
    effectivePositionFilter,
    100,
    timePeriodFilter,
    clubFilter === "all" ? undefined : clubFilter,
    effectiveStatsSource,
    matchType
  );

  // For positional boards, no client-side filtering needed - edge function handles it
  // For overall board, just pass through
  const processedPlayers = useMemo(() => {
    if (!players) return [];
    
    let filtered = [...players];
    
    // Apply minimum games played filter
    const minGames = parseInt(minGamesPlayed, 10);
    if (minGames > 0) {
      filtered = filtered.filter(p => p.games_played >= minGames);
    }
    
    if (showWorst) {
      filtered = filtered.filter(p => p.games_played >= 3);
      filtered = filtered.reverse();
    }
    
    filtered = filtered.map((p, idx) => ({ ...p, rank: idx + 1 }));
    
    return filtered;
  }, [players, showWorst, minGamesPlayed]);

  const isLoading = guildLoading || playersLoading;

  const renderTable = () => {
    if (processedPlayers.length === 0) {
      return (
        <Card className="mt-4">
          <CardContent className="py-8 text-center text-muted-foreground">
            {boardType === "goalkeeper" 
              ? "No goalkeepers found with save data."
              : boardType === "forward"
                ? "No forwards found with goal/assist data."
                : boardType === "midfielder"
                  ? "No midfielders found."
                  : boardType === "defender"
                    ? "No defenders found with defensive stats."
                    : showWorst 
                      ? "No players with at least 3 games found."
                      : "No players found."}
          </CardContent>
        </Card>
      );
    }

    switch (boardType) {
      case "forward":
        return <OffenseLeaderboardTable players={processedPlayers} />;
      case "midfielder":
        return <MidfielderLeaderboardTable players={processedPlayers} />;
      case "defender":
        return <DefenseLeaderboardTable players={processedPlayers} />;
      case "goalkeeper":
        return <GKLeaderboardTable players={processedPlayers} />;
      default:
        return <LeaderboardTable players={processedPlayers} highlightColumn={activeTab as any} />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold leading-tight md:text-3xl">
                {showWorst ? "Club Stats: bottom performers" :
                  boardType === "forward" ? "Club Stats: forwards" :
                  boardType === "midfielder" ? "Club Stats: midfielders" :
                  boardType === "defender" ? "Club Stats: defenders" :
                  boardType === "goalkeeper" ? "Club Stats: goalkeepers" :
                  "Club Stats"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground md:text-base">
                {showWorst 
                  ? "Players ranked from worst to best (min 3 games)" 
                  : boardType === "forward" 
                    ? "Goals, assists, shots, dribbles & shot conversion (tracked games)"
                    : boardType === "midfielder"
                      ? "Passes, assists, tackles, interceptions & possession (tracked games)"
                      : boardType === "defender"
                        ? "Tackles, interceptions, clearances & clean sheets (tracked games)"
                        : boardType === "goalkeeper"
                          ? "Saves breakdown, clean sheets & save percentage (tracked games)"
                          : clubFilter === "all"
                            ? statsSource === "members"
                              ? "Career stats from EA member board"
                              : statsSource === "games"
                                ? "Stats from tracked matches only"
                                : "EA member stats with tracked game indicators"
                            : `Stats for ${enabledClubs.find(c => c.key === clubFilter)?.name || clubFilter}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="worst-mode"
                  checked={showWorst}
                  onCheckedChange={setShowWorst}
                />
                <Label htmlFor="worst-mode" className="text-sm flex items-center gap-1">
                  <TrendingDown className="h-4 w-4" />
                  Worst
                </Label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <Select value={boardType} onValueChange={setBoardType}>
              <SelectTrigger className="w-full bg-card sm:w-[150px]">
                <SelectValue placeholder="Board type" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                {BOARD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clubFilter} onValueChange={setClubFilter}>
              <SelectTrigger className="w-full bg-card sm:w-[180px]">
                <SelectValue placeholder="Select club" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                <SelectItem value="all">All Clubs (Aggregate)</SelectItem>
                {enabledClubs.map((club) => (
                  <SelectItem key={club.key} value={club.key}>
                    {club.name || club.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select 
              value={boardType !== "overall" ? "games" : statsSource} 
              onValueChange={(v) => setStatsSource(v as "all" | "members" | "games")}
              disabled={boardType !== "overall"}
            >
              <SelectTrigger className="w-full bg-card sm:w-[200px]">
                <SelectValue placeholder="Stats source" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                <SelectItem value="members">EA Member Stats</SelectItem>
                <SelectItem value="games">Tracked Games Only</SelectItem>
                <SelectItem value="all">Combined View</SelectItem>
              </SelectContent>
            </Select>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger className="w-full bg-card sm:w-[160px]">
                <SelectValue placeholder="Match type" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                {MATCH_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timePeriod} onValueChange={setTimePeriod}>
              <SelectTrigger className="w-full bg-card sm:w-[140px]">
                <SelectValue placeholder="Time period" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                {TIME_PERIODS.map((period) => (
                  <SelectItem key={period.value} value={period.value}>
                    {period.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={minGamesPlayed} onValueChange={setMinGamesPlayed}>
              <SelectTrigger className="w-full bg-card sm:w-[140px]">
                <SelectValue placeholder="Min games" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                {GAMES_PLAYED_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedGuild && enabledClubs.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-4 text-sm text-muted-foreground">
              No EA club is linked to this server yet. Link one in Discord with <code>/manager → Admin → Link EA Club</code> to start tracking matches.
            </CardContent>
          </Card>
        )}

        {!selectedGuildId && !guildLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>No Server Selected</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>Select a Discord server from the dropdown above to view the leaderboard.</p>
            </CardContent>
          </Card>
        ) : boardType === "overall" ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-auto sm:flex-wrap">
              <TabsTrigger value="overall">Overall</TabsTrigger>
              <TabsTrigger value="goals">Goals</TabsTrigger>
              <TabsTrigger value="assists">Assists</TabsTrigger>
              <TabsTrigger value="wins">Wins</TabsTrigger>
              <TabsTrigger value="avg_rating">Avg Rating</TabsTrigger>
              <TabsTrigger value="saves">Saves (GK)</TabsTrigger>
              <TabsTrigger value="tackles">Tackles</TabsTrigger>
              <TabsTrigger value="clean_sheets">Clean Sheets</TabsTrigger>
            </TabsList>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <Card className="mt-4">
                <CardContent className="py-8 text-center text-muted-foreground">
                  Failed to load leaderboard. Please try again.
                </CardContent>
              </Card>
            ) : (
              <>
                <TabsContent value="overall" className="mt-4">{renderTable()}</TabsContent>
                <TabsContent value="goals" className="mt-4">{renderTable()}</TabsContent>
                <TabsContent value="assists" className="mt-4">{renderTable()}</TabsContent>
                <TabsContent value="wins" className="mt-4">{renderTable()}</TabsContent>
                <TabsContent value="avg_rating" className="mt-4">{renderTable()}</TabsContent>
                <TabsContent value="saves" className="mt-4">{renderTable()}</TabsContent>
                <TabsContent value="tackles" className="mt-4">{renderTable()}</TabsContent>
                <TabsContent value="clean_sheets" className="mt-4">{renderTable()}</TabsContent>
              </>
            )}
          </Tabs>
        ) : (
          <div className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Failed to load leaderboard. Please try again.
                </CardContent>
              </Card>
            ) : renderTable()}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
