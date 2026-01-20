import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupStandings } from "./GroupStandings";
import { KnockoutBracket } from "./KnockoutBracket";
import { MatchCard } from "./MatchCard";
import { InviteTeamsPanel } from "./InviteTeamsPanel";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Loader2,
  Play,
  Trophy,
  Users,
} from "lucide-react";
import { format } from "date-fns";

interface TournamentDetailProps {
  tournamentId: string;
  guildId: string;
  discordUserId: string;
  onBack: () => void;
}

export function TournamentDetail({
  tournamentId,
  guildId,
  discordUserId,
  onBack,
}: TournamentDetailProps) {
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [startingTournament, setStartingTournament] = useState(false);
  const [generatingKnockout, setGeneratingKnockout] = useState(false);

  useEffect(() => {
    fetchTournament();
  }, [tournamentId]);

  const fetchTournament = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-tournaments", {
        body: { action: "get-tournament", tournament_id: tournamentId },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      setTournament(data.tournament);
      setTeams(data.teams || []);
      setMatches(data.matches || []);
      setStandings(data.standings || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  };

  const handleStartTournament = async () => {
    const acceptedCount = teams.filter((t) => t.status === "accepted").length;
    if (acceptedCount < (tournament?.min_teams || 8)) {
      toast.error(`Need at least ${tournament?.min_teams || 8} accepted teams to start`);
      return;
    }

    setStartingTournament(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-tournaments", {
        body: {
          action: "start-tournament",
          tournament_id: tournamentId,
          discord_user_id: discordUserId,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      toast.success(`Tournament started with ${data.teams_count} teams in ${data.groups} groups!`);
      fetchTournament();
    } catch (err: any) {
      toast.error(err.message || "Failed to start tournament");
    } finally {
      setStartingTournament(false);
    }
  };

  const handleGenerateKnockout = async () => {
    setGeneratingKnockout(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-tournaments", {
        body: {
          action: "generate-fixtures",
          tournament_id: tournamentId,
          discord_user_id: discordUserId,
          stage: "knockout",
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      toast.success(`Knockout bracket generated! ${data.qualified_teams} teams qualified.`);
      fetchTournament();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate knockout");
    } finally {
      setGeneratingKnockout(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Tournament not found</p>
        <Button variant="ghost" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tournaments
        </Button>
      </div>
    );
  }

  const isOwner = tournament.created_by_discord_id === discordUserId;
  const acceptedTeams = teams.filter((t) => t.status === "accepted");
  const groupMatches = matches.filter((m) => m.stage === "group");
  const knockoutMatches = matches.filter((m) => m.stage !== "group");
  const allGroupMatchesCompleted = groupMatches.length > 0 && groupMatches.every((m) => m.result_source !== "pending");

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    registration: "bg-blue-500/20 text-blue-400",
    group_stage: "bg-yellow-500/20 text-yellow-400",
    knockout: "bg-orange-500/20 text-orange-400",
    completed: "bg-green-500/20 text-green-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{tournament.name}</h1>
            <Badge className={statusColors[tournament.status]}>
              {tournament.status.replace(/_/g, " ")}
            </Badge>
          </div>
          {tournament.description && (
            <p className="text-muted-foreground mt-2">{tournament.description}</p>
          )}
        </div>

        <div className="flex gap-2">
          {isOwner && tournament.status === "draft" && (
            <Button onClick={handleStartTournament} disabled={startingTournament}>
              {startingTournament ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Tournament
            </Button>
          )}
          {isOwner && tournament.status === "group_stage" && allGroupMatchesCompleted && (
            <Button onClick={handleGenerateKnockout} disabled={generatingKnockout}>
              {generatingKnockout ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trophy className="h-4 w-4 mr-2" />
              )}
              Generate Knockout
            </Button>
          )}
        </div>
      </div>

      {/* Tournament Info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              Teams
            </div>
            <p className="text-2xl font-bold mt-1">
              {acceptedTeams.length} / {tournament.max_teams}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="h-4 w-4" />
              Groups
            </div>
            <p className="text-2xl font-bold mt-1">
              {tournament.teams_per_group} teams each
            </p>
          </CardContent>
        </Card>
        {tournament.starts_at && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Start Date
              </div>
              <p className="text-lg font-medium mt-1">
                {format(new Date(tournament.starts_at), "MMM d, yyyy")}
              </p>
            </CardContent>
          </Card>
        )}
        {tournament.time_slot && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Time Slot
              </div>
              <p className="text-lg font-medium mt-1 capitalize">
                {tournament.time_slot.replace(/_/g, " ")}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue={tournament.status === "knockout" ? "bracket" : "standings"}>
        <TabsList>
          {(tournament.status === "draft" || tournament.status === "registration") && (
            <TabsTrigger value="teams">Teams</TabsTrigger>
          )}
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="bracket">Bracket</TabsTrigger>
          {isOwner && (tournament.status === "draft" || tournament.status === "registration") && (
            <TabsTrigger value="invite">Invite Teams</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="teams" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Registered Teams ({acceptedTeams.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {teams.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No teams invited yet
                </p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <span className="font-medium truncate">
                        {team.club?.club_name || "Unknown"}
                      </span>
                      <Badge
                        variant={team.status === "accepted" ? "default" : "secondary"}
                      >
                        {team.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="standings" className="mt-4">
          <GroupStandings standings={standings} />
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          <div className="space-y-4">
            {groupMatches.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Group Stage</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {groupMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      canSubmitResult={isOwner}
                      discordUserId={discordUserId}
                      onResultSubmitted={fetchTournament}
                    />
                  ))}
                </div>
              </div>
            )}
            {knockoutMatches.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Knockout Stage</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {knockoutMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      canSubmitResult={isOwner}
                      discordUserId={discordUserId}
                      onResultSubmitted={fetchTournament}
                    />
                  ))}
                </div>
              </div>
            )}
            {matches.length === 0 && (
              <p className="text-muted-foreground text-center py-8">
                No matches scheduled yet
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="bracket" className="mt-4">
          <KnockoutBracket matches={knockoutMatches} />
        </TabsContent>

        <TabsContent value="invite" className="mt-4">
          <InviteTeamsPanel
            tournamentId={tournamentId}
            guildId={guildId}
            discordUserId={discordUserId}
            invitedClubIds={teams.map((t) => t.club_id)}
            onInvited={fetchTournament}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
