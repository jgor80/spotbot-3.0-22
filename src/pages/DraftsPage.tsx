import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { 
  Swords, 
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  Trophy,
  Calendar,
  MessageSquare
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  match_type: string;
  teammates_to_evaluate: string[];
  created_at: string;
}

export default function DraftsPage() {
  const { selectedGuildId } = useGuild();

  // Fetch drafts
  const { data: drafts, isLoading: draftsLoading } = useQuery({
    queryKey: ["drafts", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("drafts")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as Draft[];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch draft results
  const { data: results } = useQuery({
    queryKey: ["draftResults", selectedGuildId, drafts],
    queryFn: async () => {
      if (!selectedGuildId || !drafts?.length) return {};
      
      const draftIds = drafts.map(d => d.id);
      const { data, error } = await supabase
        .from("draft_results")
        .select("*")
        .in("draft_id", draftIds);
      
      if (error) throw error;
      
      // Map by draft_id
      const resultMap: Record<string, DraftResult> = {};
      (data || []).forEach(r => {
        resultMap[r.draft_id] = r as DraftResult;
      });
      return resultMap;
    },
    enabled: !!selectedGuildId && !!drafts?.length,
  });

  // Fetch pending feedback
  const { data: pendingFeedback } = useQuery({
    queryKey: ["pendingFeedback", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("dm_feedback_requests")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as FeedbackRequest[];
    },
    enabled: !!selectedGuildId,
  });

  const activeDrafts = drafts?.filter(d => ['pending', 'picking'].includes(d.status)) || [];
  const completedDrafts = drafts?.filter(d => d.status === 'completed') || [];
  const cancelledDrafts = drafts?.filter(d => d.status === 'cancelled') || [];

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    picking: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    completed: "bg-green-500/10 text-green-500 border-green-500/20",
    cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Swords className="h-8 w-8 text-primary" />
            Draft Center
          </h1>
          <p className="text-muted-foreground">Manage drafts and peer feedback</p>
        </div>

        {!selectedGuildId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Select a server to view drafts
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="active" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-lg">
              <TabsTrigger value="active">
                <Swords className="h-4 w-4 mr-2" />
                Active ({activeDrafts.length})
              </TabsTrigger>
              <TabsTrigger value="history">
                <Trophy className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
              <TabsTrigger value="feedback">
                <MessageSquare className="h-4 w-4 mr-2" />
                Feedback ({pendingFeedback?.length || 0})
              </TabsTrigger>
            </TabsList>

            {/* Active Drafts Tab */}
            <TabsContent value="active">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Swords className="h-5 w-5" />
                    Active Drafts
                  </CardTitle>
                  <CardDescription>
                    Drafts currently in progress
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {draftsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : activeDrafts.length > 0 ? (
                    <div className="space-y-4">
                      {activeDrafts.map((draft) => (
                        <DraftCard key={draft.id} draft={draft} statusColors={statusColors} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Swords className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No active drafts</p>
                      <p className="text-sm mt-2">Use /draft in Discord to start one</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Draft History
                  </CardTitle>
                  <CardDescription>
                    Past drafts and results
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {draftsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : completedDrafts.length > 0 ? (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {completedDrafts.map((draft) => {
                          const result = results?.[draft.id];
                          return (
                            <div 
                              key={draft.id}
                              className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                            >
                              <div className="flex-shrink-0">
                                <Swords className="h-6 w-6 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    Draft #{draft.id.slice(0, 8)}
                                  </p>
                                  <Badge className={statusColors[draft.status]}>{draft.status}</Badge>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {draft.team_a_player_ids.length + draft.team_b_player_ids.length} players
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(draft.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                              {result && (
                                <div className="text-right">
                                  <p className="font-mono font-bold text-lg">
                                    {result.team_a_score} - {result.team_b_score}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {result.winning_team === 'a' ? '🔴 Team A Won' : 
                                     result.winning_team === 'b' ? '🔵 Team B Won' : 
                                     'Draw'}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No completed drafts yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Feedback Tab */}
            <TabsContent value="feedback">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Pending Feedback
                  </CardTitle>
                  <CardDescription>
                    Players who haven't completed their peer evaluations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingFeedback && pendingFeedback.length > 0 ? (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {pendingFeedback.map((fb) => (
                          <div 
                            key={fb.id}
                            className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex-shrink-0">
                              <Clock className="h-5 w-5 text-yellow-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">
                                User {fb.evaluator_discord_id.slice(-6)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {fb.teammates_to_evaluate.length} teammates to rate • 
                                {fb.match_type === 'club' ? ' Club Match' : ' Draft'}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {new Date(fb.created_at).toLocaleDateString()}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>All feedback completed!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

function DraftCard({ draft, statusColors }: { draft: Draft; statusColors: Record<string, string> }) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" />
          <span className="font-medium">Draft #{draft.id.slice(0, 8)}</span>
        </div>
        <Badge className={statusColors[draft.status]}>{draft.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg bg-red-500/10">
          <p className="text-sm font-medium text-red-500 mb-2">🔴 Team A</p>
          <p className="text-xs text-muted-foreground mb-1">
            Captain: {draft.captain_a_discord_id.slice(-6)}
          </p>
          <p className="text-sm">{draft.team_a_player_ids.length} players</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-500/10">
          <p className="text-sm font-medium text-blue-500 mb-2">🔵 Team B</p>
          <p className="text-xs text-muted-foreground mb-1">
            Captain: {draft.captain_b_discord_id.slice(-6)}
          </p>
          <p className="text-sm">{draft.team_b_player_ids.length} players</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Started: {new Date(draft.created_at).toLocaleString()}
      </p>
    </div>
  );
}
