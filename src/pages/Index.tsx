import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Target, TrendingUp, Loader2 } from "lucide-react";
import { useGuild } from "@/contexts/GuildContext";
import { useGuildStats } from "@/hooks/useGuildStats";

export default function Dashboard() {
  const { selectedGuildId, isLoading: guildLoading } = useGuild();
  const { data: stats, isLoading: statsLoading } = useGuildStats(selectedGuildId);

  const isLoading = guildLoading || statsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to SpotBot Analytics</p>
        </div>

        {!selectedGuildId && !guildLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>No Server Selected</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>Select a Discord server from the dropdown above to view stats.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Players</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.totalPlayers ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Active in server</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Drafts Played</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.draftsThisMonth ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">This month</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.avgRating ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Server average</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Competitions</CardTitle>
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.totalCompetitionWins ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Verified wins</p>
                </CardContent>
              </Card>
            </div>

            {stats?.totalPlayers === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  <p>No player data found for this server. Start running drafts and games to populate stats!</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
