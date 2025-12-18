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

// Map EA positions to categories - EA API stores as lowercase categories
const FORWARD_POSITIONS = ['ST', 'CF', 'LW', 'RW', 'RS', 'LS', 'forward', 'FORWARD'];
const MIDFIELDER_POSITIONS = ['CAM', 'CM', 'CDM', 'LM', 'RM', 'LCM', 'RCM', 'LAM', 'RAM', 'midfielder', 'MIDFIELDER'];
const DEFENDER_POSITIONS = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'LCB', 'RCB', 'defender', 'DEFENDER'];
const GK_POSITIONS = ['GK', 'goalkeeper', 'GOALKEEPER'];

export default function Leaderboard() {
  const { selectedGuildId, isLoading: guildLoading, selectedGuild } = useGuild();
  const [activeTab, setActiveTab] = useState("overall");
  const [boardType, setBoardType] = useState("overall");
  const [timePeriod, setTimePeriod] = useState("all");
  const [showWorst, setShowWorst] = useState(false);
  const [clubFilter, setClubFilter] = useState("all");
  const [statsSource, setStatsSource] = useState<"all" | "members" | "games">("members");

  const enabledClubs = (selectedGuild?.clubs || []).filter((club) => club.enabled);

  const monthYear = useMemo(() => {
    if (timePeriod === "all") return undefined;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [timePeriod]);

  const effectivePositionFilter = useMemo(() => {
    if (boardType === "goalkeeper") return "GK";
    // For positional boards, we filter client-side based on EA position categories
    return undefined;
  }, [boardType]);
  
  const { data: players, isLoading: playersLoading, error } = useLeaderboard(
    selectedGuildId,
    activeTab,
    effectivePositionFilter,
    100,
    monthYear,
    clubFilter === "all" ? undefined : clubFilter,
    statsSource
  );

  const processedPlayers = useMemo(() => {
    if (!players) return [];
    
    let filtered = [...players];
    
    // Filter by EA position category
    if (boardType === "forward") {
      filtered = filtered.filter(p => 
        FORWARD_POSITIONS.includes(p.primary_position || '') ||
        (!p.primary_position && (p.goals > 0 || p.assists > 0))
      );
    } else if (boardType === "midfielder") {
      filtered = filtered.filter(p => 
        MIDFIELDER_POSITIONS.includes(p.primary_position || '') ||
        (!p.primary_position && (p.passes_made || 0) > 0)
      );
    } else if (boardType === "defender") {
      filtered = filtered.filter(p => 
        DEFENDER_POSITIONS.includes(p.primary_position || '') ||
        (!p.primary_position && ((p.tackles || 0) > 0 || (p.interceptions || 0) > 0))
      );
    } else if (boardType === "goalkeeper") {
      filtered = filtered.filter(p => 
        GK_POSITIONS.includes(p.primary_position || '') || (p.saves || 0) > 0
      );
    }
    
    if (showWorst) {
      filtered = filtered.filter(p => p.games_played >= 3);
      filtered = filtered.reverse();
    }
    
    filtered = filtered.map((p, idx) => ({ ...p, rank: idx + 1 }));
    
    return filtered;
  }, [players, showWorst, boardType]);

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
              <h1 className="font-display text-3xl font-bold">
                {showWorst ? "Bottom Performers" : 
                  boardType === "forward" ? "Forward Leaderboard" :
                  boardType === "midfielder" ? "Midfielder Leaderboard" :
                  boardType === "defender" ? "Defender Leaderboard" :
                  boardType === "goalkeeper" ? "Goalkeeper Leaderboard" :
                  "Leaderboard"}
              </h1>
              <p className="text-muted-foreground">
                {showWorst 
                  ? "Players ranked from worst to best (min 3 games)" 
                  : boardType === "forward" 
                    ? "Goals, assists, shots, dribbles & shot conversion"
                    : boardType === "midfielder"
                      ? "Passes, assists, tackles, interceptions & possession"
                      : boardType === "defender"
                        ? "Tackles, interceptions, clearances & clean sheets"
                        : boardType === "goalkeeper"
                          ? "Saves breakdown, clean sheets & save percentage"
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
          <div className="flex flex-wrap gap-3">
            <Select value={boardType} onValueChange={setBoardType}>
              <SelectTrigger className="w-[150px] bg-card">
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
              <SelectTrigger className="w-[180px] bg-card">
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
            <Select value={statsSource} onValueChange={(v) => setStatsSource(v as "all" | "members" | "games")}>
              <SelectTrigger className="w-[200px] bg-card">
                <SelectValue placeholder="Stats source" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                <SelectItem value="members">EA Member Stats</SelectItem>
                <SelectItem value="games">Tracked Games Only</SelectItem>
                <SelectItem value="all">Combined View</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timePeriod} onValueChange={setTimePeriod}>
              <SelectTrigger className="w-[140px] bg-card">
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
          </div>
        </div>

        {selectedGuild && (
          <Card className="bg-muted/30">
            <CardContent className="pt-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Discord server: <span className="font-medium text-foreground">{selectedGuild.name}</span>
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground">Enabled clubs:</span>
                {enabledClubs.length > 0 ? (
                  enabledClubs.map((club) => (
                    <Badge key={club.key} variant="secondary" className="text-xs">
                      {club.name || club.key}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline" className="text-xs">No clubs configured</Badge>
                )}
              </div>
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
            <TabsList className="flex-wrap h-auto gap-1">
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
