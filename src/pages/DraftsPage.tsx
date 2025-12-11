import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { 
  Users, 
  Loader2, 
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Swords,
  Trophy,
  MessageSquare
} from "lucide-react";
import { format } from "date-fns";

interface Draft {
  id: string;
  status: string;
  captain_a_discord_id: string;
  captain_b_discord_id: string;
  team_a_player_ids: string[];
  team_b_player_ids: string[];
  created_at: string;
  completed_at: string | null;
}

interface DraftResult {
  id: string;
  draft_id: string;
  team_a_score: number | null;
  team_b_score: number | null;
  winning_team: string | null;
  status: string;
}

interface FeedbackRequest {
  id: string;
  evaluator_discord_id: string;
  status: string;
  draft_id: string | null;
  created_at: string;
}

export default function DraftsPage() {
  const { selectedGuildId } = useGuild();

  // Fetch drafts
  const { data: drafts, isLoading: draftsLoading } = useQuery({
    queryKey: ["drafts", selectedGuildId],
    queryFn: async (): Promise<Draft[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("drafts")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch draft results
  const { data: draftResults } = useQuery({
    queryKey: ["draftResults", selectedGuildId],
    queryFn: async (): Promise<DraftResult[]> => {
      if (!selectedGuildId || !drafts) return [];
      
      const draftIds = drafts.map(d => d.id);
      if (draftIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("draft_results")
        .select("*")
        .in("draft_id", draftIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId && !!drafts && drafts.length > 0,
  });

  // Fetch pending feedback requests
  const { data: pendingFeedback, isLoading: feedbackLoading } = useQuery({
    queryKey: ["pendingFeedback", selectedGuildId],
    queryFn: async (): Promise<FeedbackRequest[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("dm_feedback_requests")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  const getResultForDraft = (draftId: string) => {
    return draftResults?.find(r => r.draft_id === draftId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>;
      case "picking":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">In Progress</Badge>;
      case "pending":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Pending</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const activeDraft = drafts?.find(d => d.status === "picking" || d.status === "pending");
  const completedDrafts = drafts?.filter(d => d.status === "completed") || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Draft Center</h1>
          <p className="text-muted-foreground">Manage drafts and view history</p>
        </div>

        <Tabs defaultValue="active" className="space-y-4">
          <TabsList>
            <TabsTrigger value="active" className="flex items-center gap-2">
              <Swords className="h-4 w-4" />
              Active Draft
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Pending Feedback
              {pendingFeedback && pendingFeedback.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
                  {pendingFeedback.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-5 w-5" />
                  Active Draft
                </CardTitle>
                <CardDescription>
                  Current draft session
                </CardDescription>
              </CardHeader>
              <CardContent>
                {draftsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : activeDraft ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border">
                      <div>
                        <p className="font-medium">Draft in Progress</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          Started {format(new Date(activeDraft.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      {getStatusBadge(activeDraft.status)}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <h4 className="font-medium text-blue-500 mb-3">Team A</h4>
                        <p className="text-sm text-muted-foreground mb-2">
                          Captain: {activeDraft.captain_a_discord_id.slice(-6)}
                        </p>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{activeDraft.team_a_player_ids.length} players</span>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                        <h4 className="font-medium text-red-500 mb-3">Team B</h4>
                        <p className="text-sm text-muted-foreground mb-2">
                          Captain: {activeDraft.captain_b_discord_id.slice(-6)}
                        </p>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{activeDraft.team_b_player_ids.length} players</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground text-center">
                      Use the SpotBot Discord bot to manage the draft
                    </p>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Swords className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active draft</p>
                    <p className="text-sm mt-1">Start a draft using SpotBot in Discord</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Draft History
                </CardTitle>
                <CardDescription>
                  View past draft results
                </CardDescription>
              </CardHeader>
              <CardContent>
                {draftsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : completedDrafts.length > 0 ? (
                  <div className="space-y-3">
                    {completedDrafts.map((draft) => {
                      const result = getResultForDraft(draft.id);
                      return (
                        <div
                          key={draft.id}
                          className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <Trophy className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                Team A vs Team B
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(draft.created_at), "MMM d, yyyy")}
                                <span className="text-muted-foreground/50">•</span>
                                <Users className="h-3 w-3" />
                                {draft.team_a_player_ids.length + draft.team_b_player_ids.length} players
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {result && (
                              <div className="text-right">
                                <p className="text-xl font-bold">
                                  {result.team_a_score ?? 0} - {result.team_b_score ?? 0}
                                </p>
                                {result.winning_team && (
                                  <p className="text-sm text-muted-foreground capitalize">
                                    {result.winning_team} won
                                  </p>
                                )}
                              </div>
                            )}
                            {getStatusBadge(draft.status)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No completed drafts yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Pending Feedback
                </CardTitle>
                <CardDescription>
                  Feedback requests awaiting responses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {feedbackLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingFeedback && pendingFeedback.length > 0 ? (
                  <div className="space-y-3">
                    {pendingFeedback.map((feedback) => (
                      <div
                        key={feedback.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                      >
                        <div className="flex items-center gap-4">
                          <Clock className="h-5 w-5 text-yellow-500" />
                          <div>
                            <p className="font-medium">
                              Feedback Request
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Users className="h-3 w-3" />
                              {feedback.evaluator_discord_id.slice(-6)}
                              <span className="text-muted-foreground/50">•</span>
                              <Calendar className="h-3 w-3" />
                              {format(new Date(feedback.created_at), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                          Pending
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>All feedback has been completed</p>
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
