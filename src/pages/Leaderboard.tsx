import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuild } from "@/contexts/GuildContext";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { Loader2 } from "lucide-react";
import { useState } from "react";

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

export default function Leaderboard() {
  const { selectedGuildId, isLoading: guildLoading, selectedGuild } = useGuild();
  const [activeTab, setActiveTab] = useState("overall");
  const [positionFilter, setPositionFilter] = useState("all");

  const enabledClubs = (selectedGuild?.clubs || []).filter((club) => club.enabled);
  
  const { data: players, isLoading: playersLoading, error } = useLeaderboard(
    selectedGuildId,
    activeTab,
    positionFilter === "all" ? undefined : positionFilter
  );

  const isLoading = guildLoading || playersLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
            <p className="text-muted-foreground">Top players ranked by performance, organized by Discord server and aggregated across every enabled club.</p>
          </div>
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
            <TabsList>
              <TabsTrigger value="overall">Overall</TabsTrigger>
              <TabsTrigger value="goals">Goals</TabsTrigger>
              <TabsTrigger value="assists">Assists</TabsTrigger>
              <TabsTrigger value="wins">Wins</TabsTrigger>
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
            ) : players && players.length > 0 ? (
              <>
                <TabsContent value="overall" className="mt-4">
                  <LeaderboardTable players={players} />
                </TabsContent>
                <TabsContent value="goals" className="mt-4">
                  <LeaderboardTable players={players} />
                </TabsContent>
                <TabsContent value="assists" className="mt-4">
                  <LeaderboardTable players={players} />
                </TabsContent>
                <TabsContent value="wins" className="mt-4">
                  <LeaderboardTable players={players} />
                </TabsContent>
              </>
            ) : (
              <Card className="mt-4">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {positionFilter !== "all" 
                    ? `No ${POSITION_FILTERS.find(p => p.value === positionFilter)?.label || positionFilter} players found.`
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
