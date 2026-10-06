import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Users, Target, TrendingUp, Loader2, UsersRound, Swords, Medal, ChevronRight } from "lucide-react";
import { useGuild } from "@/contexts/GuildContext";
import { useGuildStats } from "@/hooks/useGuildStats";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { SyncMatchesButton } from "@/components/club/SyncMatchesButton";

interface Team {
  id: string;
  name: string;
  tag: string | null;
  team_type: string;
}

interface RecentDraft {
  id: string;
  status: string;
  created_at: string;
  team_a_player_ids: string[];
  team_b_player_ids: string[];
}

export default function Dashboard() {
  const { selectedGuildId, selectedGuild, isLoading: guildLoading } = useGuild();
  const { data: stats, isLoading: statsLoading } = useGuildStats(selectedGuildId);

  // Fetch teams count
  const { data: teams } = useQuery({
    queryKey: ["teamsPreview", selectedGuildId],
    queryFn: async (): Promise<Team[]> => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, tag, team_type")
        .eq("guild_id", selectedGuildId)
        .eq("active", true)
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch recent drafts
  const { data: recentDrafts } = useQuery({
    queryKey: ["recentDraftsPreview", selectedGuildId],
    queryFn: async (): Promise<RecentDraft[]> => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("drafts")
        .select("id, status, created_at, team_a_player_ids, team_b_player_ids")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  const isLoading = guildLoading || statsLoading;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "comp":
        return <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Comp</Badge>;
      case "casual":
        return <Badge className="bg-success/10 text-success border-success/20 text-xs">Casual</Badge>;
      case "academy":
        return <Badge className="bg-info/10 text-info border-info/20 text-xs">Academy</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Match Night</h1>
            <p className="text-muted-foreground">
              {selectedGuild ? `Welcome to ${selectedGuild.name}` : "Welcome to SquadIQ"}
            </p>
          </div>
          {selectedGuildId && <SyncMatchesButton guildId={selectedGuildId} />}
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
            {/* Stats Overview */}
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
                  <CardTitle className="text-sm font-medium">Teams</CardTitle>
                  <UsersRound className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : teams?.length ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Active teams</p>
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

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Teams Quick View */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <UsersRound className="h-5 w-5" />
                      Teams
                    </CardTitle>
                    <CardDescription>Your server's teams</CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/teams">
                      View All
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {teams && teams.length > 0 ? (
                    <div className="space-y-2">
                      {teams.map((team) => (
                        <div
                          key={team.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <UsersRound className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{team.name}</p>
                              {team.tag && (
                                <p className="text-xs text-muted-foreground">[{team.tag}]</p>
                              )}
                            </div>
                          </div>
                          {getTypeBadge(team.team_type)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <UsersRound className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No teams created yet</p>
                      <Button asChild variant="link" size="sm" className="mt-2">
                        <Link to="/teams">Create your first team</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Swords className="h-5 w-5" />
                      Recent Drafts
                    </CardTitle>
                    <CardDescription>Latest draft activity</CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/drafts">
                      View All
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {recentDrafts && recentDrafts.length > 0 ? (
                    <div className="space-y-2">
                      {recentDrafts.map((draft) => (
                        <div
                          key={draft.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Swords className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {draft.team_a_player_ids.length + draft.team_b_player_ids.length} players
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(draft.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Badge
                            className={
                              draft.status === "completed"
                                ? "bg-success/10 text-success border-success/20"
                                : draft.status === "picking"
                                ? "bg-warning/10 text-warning border-warning/20"
                                : "bg-info/10 text-info border-info/20"
                            }
                          >
                            {draft.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <Swords className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No drafts yet</p>
                      <p className="text-xs mt-1">Start a draft in Discord with SpotBot</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Jump to common tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
                    <Link to="/leaderboard">
                      <Trophy className="h-5 w-5" />
                      <span>View Leaderboard</span>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
                    <Link to="/teams">
                      <UsersRound className="h-5 w-5" />
                      <span>Manage Teams</span>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
                    <Link to="/scouting">
                      <Target className="h-5 w-5" />
                      <span>Scout Players</span>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
                    <Link to="/lineup">
                      <Users className="h-5 w-5" />
                      <span>Build Lineup</span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
