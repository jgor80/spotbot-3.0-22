import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuild } from "@/contexts/GuildContext";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function Leaderboard() {
  const { selectedGuildId, isLoading: guildLoading } = useGuild();
  const [activeTab, setActiveTab] = useState("overall");
  
  const { data: players, isLoading: playersLoading, error } = useLeaderboard(
    selectedGuildId,
    activeTab
  );

  const isLoading = guildLoading || playersLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
          <p className="text-muted-foreground">Top players ranked by performance</p>
        </div>

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
                  No players found. Start playing games to appear on the leaderboard!
                </CardContent>
              </Card>
            )}
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
