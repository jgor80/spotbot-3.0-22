import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SessionCard } from "./SessionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

interface SessionsListProps {
  guildId: string;
  clubFilter?: string;
  renderMatches?: (sessionId: string) => React.ReactNode;
}

export function SessionsList({ guildId, clubFilter, renderMatches }: SessionsListProps) {
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ["club-sessions", guildId, clubFilter],
    queryFn: async () => {
      let query = supabase
        .from("club_sessions")
        .select("*")
        .eq("guild_id", guildId)
        .order("started_at", { ascending: false });

      if (clubFilter && clubFilter !== "all") {
        query = query.eq("club_key", clubFilter);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!guildId,
  });

  // Calculate aggregate stats
  const aggregateStats = sessions?.reduce(
    (acc, session) => ({
      totalSessions: acc.totalSessions + 1,
      totalMatches: acc.totalMatches + (session.match_count || 0),
      totalWins: acc.totalWins + (session.wins || 0),
      totalDraws: acc.totalDraws + (session.draws || 0),
      totalLosses: acc.totalLosses + (session.losses || 0),
      totalGoals: acc.totalGoals + (session.goals_for || 0),
      totalGoalsAgainst: acc.totalGoalsAgainst + (session.goals_against || 0),
    }),
    {
      totalSessions: 0,
      totalMatches: 0,
      totalWins: 0,
      totalDraws: 0,
      totalLosses: 0,
      totalGoals: 0,
      totalGoalsAgainst: 0,
    }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-red-500">Error loading sessions: {(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No gaming sessions found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sessions are created when matches are synced within 30 minutes of each other.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Aggregate Summary */}
      {aggregateStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{aggregateStats.totalSessions}</div>
              <p className="text-sm text-muted-foreground">Sessions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{aggregateStats.totalMatches}</div>
              <p className="text-sm text-muted-foreground">Total Matches</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-emerald-500">
                {aggregateStats.totalMatches > 0 
                  ? ((aggregateStats.totalWins / aggregateStats.totalMatches) * 100).toFixed(0) 
                  : 0}%
              </div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className={`text-2xl font-bold ${
                aggregateStats.totalGoals - aggregateStats.totalGoalsAgainst > 0 
                  ? 'text-emerald-500' 
                  : aggregateStats.totalGoals - aggregateStats.totalGoalsAgainst < 0 
                    ? 'text-red-500' 
                    : ''
              }`}>
                {aggregateStats.totalGoals - aggregateStats.totalGoalsAgainst > 0 ? '+' : ''}
                {aggregateStats.totalGoals - aggregateStats.totalGoalsAgainst}
              </div>
              <p className="text-sm text-muted-foreground">Goal Difference</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={{
              ...session,
              players: (session.players as string[]) || [],
            }}
          >
            {renderMatches && renderMatches(session.id)}
          </SessionCard>
        ))}
      </div>
    </div>
  );
}
