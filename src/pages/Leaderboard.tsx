import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
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

const POSITION_FILTERS = [
  { value: "all", label: "All Positions" },
  { value: "GK", label: "Goalkeeper" },
  { value: "CB", label: "Center Back" },
  { value: "LB", label: "Left Back" },
  { value: "RB", label: "Right Back" },
  { value: "CDM", label: "CDM" },
  { value: "CM", label: "Center Mid" },
  { value: "CAM", label: "CAM" },
  { value: "LM", label: "Left Mid" },
  { value: "RM", label: "Right Mid" },
  { value: "LW", label: "Left Wing" },
  { value: "RW", label: "Right Wing" },
  { value: "ST", label: "Striker" },
  { value: "CF", label: "Center Forward" },
];

const TIME_PERIODS = [
  { value: "all", label: "All Time" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

export default function Leaderboard() {
  const { selectedGuildId, isLoading: guildLoading, selectedGuild } = useGuild();
  const [activeTab, setActiveTab] = useState("overall");
  const [positionFilter, setPositionFilter] = useState("all");
  const [timePeriod, setTimePeriod] = useState("all");
  const [showWorst, setShowWorst] = useState(false);

  const enabledClubs = (selectedGuild?.clubs || []).filter((club) => club.enabled);

  // Calculate month_year for time filtering
  const monthYear = useMemo(() => {
    if (timePeriod === "all") return undefined;
    const now = new Date();
    if (timePeriod === "month") {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    // For week, we'll filter client-side or just show current month data
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [timePeriod]);
  
  const { data: players, isLoading: playersLoading, error } = useLeaderboard(
    selectedGuildId,
    activeTab,
    positionFilter === "all" ? undefined : positionFilter,
    100, // Fetch more for filtering
    monthYear
  );

  // Client-side filtering and sorting for worst performers
  const processedPlayers = useMemo(() => {
    if (!players) return [];
    
    let filtered = [...players];
    
    // Filter to only players with games for worst performers view
    if (showWorst) {
      filtered = filtered.filter(p => p.games_played >= 3); // Min 3 games to appear
      // Reverse the sort order
      filtered = filtered.reverse();
      // Re-rank
      filtered = filtered.map((p, idx) => ({ ...p, rank: idx + 1 }));
    }
    
    return filtered;
  }, [players, showWorst]);

  const isLoading = guildLoading || playersLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold">
                {showWorst ? "Bottom Performers" : "Leaderboard"}
              </h1>
              <p className="text-muted-foreground">
                {showWorst 
                  ? "Players ranked from worst to best (min 3 games)" 
                  : "Top players ranked by performance, aggregated across every monitored club in this server"}
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
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue placeholder="Filter by position" />
              </SelectTrigger>
              <SelectContent className="bg-card border z-50">
                {POSITION_FILTERS.map((pos) => (
                  <SelectItem key={pos.value} value={pos.value}>
                    {pos.label}
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
        ) : (
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
            ) : processedPlayers && processedPlayers.length > 0 ? (
              <>
                <TabsContent value="overall" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="rating" />
                </TabsContent>
                <TabsContent value="goals" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="goals" />
                </TabsContent>
                <TabsContent value="assists" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="assists" />
                </TabsContent>
                <TabsContent value="wins" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="wins" />
                </TabsContent>
                <TabsContent value="avg_rating" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="avg_rating" />
                </TabsContent>
                <TabsContent value="saves" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="saves" />
                </TabsContent>
                <TabsContent value="tackles" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="tackles" />
                </TabsContent>
                <TabsContent value="clean_sheets" className="mt-4">
                  <LeaderboardTable players={processedPlayers} highlightColumn="clean_sheets" />
                </TabsContent>
              </>
            ) : (
              <Card className="mt-4">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {positionFilter !== "all" 
                    ? `No ${POSITION_FILTERS.find(p => p.value === positionFilter)?.label || positionFilter} players found.`
                    : showWorst 
                      ? "No players with at least 3 games found."
                      : "No players found. Start playing games to appear on the leaderboard!"}
                </CardContent>
              </Card>
            )}
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
