import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { toast } from "sonner";
import { 
  Play, 
  Send, 
  Users, 
  Loader2, 
  UserPlus,
  RefreshCcw,
  XCircle,
  Trophy,
  Swords
} from "lucide-react";

interface PlayerSummary {
  discord_user_id: string;
  discord_username: string | null;
  overall_rating: number;
  primary_position: string | null;
}

interface ActiveDraft {
  id: string;
  status: string;
  captain_a_discord_id: string;
  captain_b_discord_id: string;
  team_a_player_ids: string[];
  team_b_player_ids: string[];
  available_player_ids: string[];
  current_picker: string | null;
  pick_number: number;
}

export function DraftControlPanel() {
  const { selectedGuildId } = useGuild();
  const queryClient = useQueryClient();
  
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [teamAScore, setTeamAScore] = useState("");
  const [teamBScore, setTeamBScore] = useState("");
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [pickDialogOpen, setPickDialogOpen] = useState(false);
  const [selectedPick, setSelectedPick] = useState<string>("");

  // Fetch available players for drafting
  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ["draftPlayers", selectedGuildId],
    queryFn: async (): Promise<PlayerSummary[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("player_summary")
        .select("discord_user_id, discord_username, overall_rating, primary_position")
        .eq("guild_id", selectedGuildId)
        .order("overall_rating", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch active draft
  const { data: activeDraft, isLoading: draftLoading, refetch: refetchDraft } = useQuery({
    queryKey: ["activeDraft", selectedGuildId],
    queryFn: async (): Promise<ActiveDraft | null> => {
      if (!selectedGuildId) return null;
      
      const { data, error } = await supabase
        .from("drafts")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .in("status", ["pending", "picking"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedGuildId,
  });

  // Start draft mutation
  const startDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId || selectedPlayers.length < 4) {
        throw new Error("Need at least 4 players to start a draft");
      }
      
      const { data, error } = await supabase.functions.invoke("draft-start", {
        body: {
          guild_id: selectedGuildId,
          player_discord_ids: selectedPlayers,
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success("Draft started!");
      setStartDialogOpen(false);
      setSelectedPlayers([]);
      queryClient.invalidateQueries({ queryKey: ["activeDraft", selectedGuildId] });
      queryClient.invalidateQueries({ queryKey: ["drafts", selectedGuildId] });
    },
    onError: (error) => {
      toast.error(`Failed to start draft: ${error.message}`);
    },
  });

  // Report result mutation
  const reportResultMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraft) throw new Error("No active draft");
      
      const scoreA = parseInt(teamAScore, 10);
      const scoreB = parseInt(teamBScore, 10);
      
      if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
        throw new Error("Please enter valid scores (0 or higher)");
      }
      
      const { data, error } = await supabase.functions.invoke("draft-result", {
        body: {
          draft_id: activeDraft.id,
          reporter_discord_id: "web_panel",
          team_a_score: scoreA,
          team_b_score: scoreB,
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data.status === "confirmed") {
        toast.success("Result confirmed! Stats recorded.");
      } else {
        toast.success(`Result reported. ${data.confirmations}/${data.needed} confirmations.`);
      }
      setResultDialogOpen(false);
      setTeamAScore("");
      setTeamBScore("");
      queryClient.invalidateQueries({ queryKey: ["activeDraft", selectedGuildId] });
      queryClient.invalidateQueries({ queryKey: ["drafts", selectedGuildId] });
    },
    onError: (error) => {
      toast.error(`Failed to report result: ${error.message}`);
    },
  });

  // Make pick mutation
  const makePickMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraft || !selectedPick) throw new Error("No pick selected");
      
      const { data, error } = await supabase.functions.invoke("draft-pick", {
        body: {
          draft_id: activeDraft.id,
          captain_discord_id: activeDraft.current_picker,
          picked_player_discord_id: selectedPick,
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Player picked!");
      setPickDialogOpen(false);
      setSelectedPick("");
      refetchDraft();
    },
    onError: (error) => {
      toast.error(`Failed to make pick: ${error.message}`);
    },
  });

  // Cancel draft mutation
  const cancelDraftMutation = useMutation({
    mutationFn: async () => {
      if (!activeDraft) throw new Error("No active draft");
      
      const { error } = await supabase
        .from("drafts")
        .update({ status: "cancelled" })
        .eq("id", activeDraft.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Draft cancelled");
      queryClient.invalidateQueries({ queryKey: ["activeDraft", selectedGuildId] });
      queryClient.invalidateQueries({ queryKey: ["drafts", selectedGuildId] });
    },
    onError: (error) => {
      toast.error(`Failed to cancel draft: ${error.message}`);
    },
  });

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayers(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const getPlayerName = (discordId: string) => {
    const player = players?.find(p => p.discord_user_id === discordId);
    return player?.discord_username || discordId.slice(-6);
  };

  if (draftLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" />
          Draft Control Panel
        </CardTitle>
        <CardDescription>
          Manage drafts directly from the web interface
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {activeDraft ? (
          <>
            {/* Active Draft Info */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    <Swords className="h-4 w-4" />
                    Draft in Progress
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Pick #{activeDraft.pick_number} • {activeDraft.status}
                  </p>
                </div>
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                  Live
                </Badge>
              </div>

              {/* Teams */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <h5 className="font-medium text-blue-400 text-sm mb-2">
                    🔵 Team A ({activeDraft.team_a_player_ids.length})
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    Captain: {getPlayerName(activeDraft.captain_a_discord_id)}
                  </p>
                  <div className="mt-2 space-y-1">
                    {activeDraft.team_a_player_ids.map(id => (
                      <Badge key={id} variant="secondary" className="text-xs mr-1">
                        {getPlayerName(id)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <h5 className="font-medium text-red-400 text-sm mb-2">
                    🔴 Team B ({activeDraft.team_b_player_ids.length})
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    Captain: {getPlayerName(activeDraft.captain_b_discord_id)}
                  </p>
                  <div className="mt-2 space-y-1">
                    {activeDraft.team_b_player_ids.map(id => (
                      <Badge key={id} variant="secondary" className="text-xs mr-1">
                        {getPlayerName(id)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Available Players */}
              {activeDraft.available_player_ids.length > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <h5 className="font-medium text-sm mb-2">
                    Available Players ({activeDraft.available_player_ids.length})
                  </h5>
                  <div className="flex flex-wrap gap-1">
                    {activeDraft.available_player_ids.map(id => (
                      <Badge key={id} variant="outline" className="text-xs">
                        {getPlayerName(id)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Picker */}
              {activeDraft.current_picker && activeDraft.available_player_ids.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm font-medium text-green-400">
                    ⏳ Waiting for: {getPlayerName(activeDraft.current_picker)}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              {/* Make Pick */}
              {activeDraft.available_player_ids.length > 0 && (
                <Dialog open={pickDialogOpen} onOpenChange={setPickDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="default" className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Make Pick
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Make a Pick</DialogTitle>
                      <DialogDescription>
                        Select a player for {getPlayerName(activeDraft.current_picker || "")}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Select Player</Label>
                        <Select value={selectedPick} onValueChange={setSelectedPick}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a player..." />
                          </SelectTrigger>
                          <SelectContent>
                            {activeDraft.available_player_ids.map(id => {
                              const player = players?.find(p => p.discord_user_id === id);
                              return (
                                <SelectItem key={id} value={id}>
                                  {player?.discord_username || id.slice(-6)} 
                                  {player?.overall_rating && ` (${player.overall_rating.toFixed(0)})`}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        onClick={() => makePickMutation.mutate()}
                        disabled={!selectedPick || makePickMutation.isPending}
                      >
                        {makePickMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <UserPlus className="h-4 w-4 mr-2" />
                        )}
                        Confirm Pick
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {/* Report Result */}
              <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Report Result
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Report Draft Result</DialogTitle>
                    <DialogDescription>
                      Enter the final scores for both teams
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="teamA">🔵 Team A Score</Label>
                      <Input
                        id="teamA"
                        type="number"
                        min="0"
                        max="99"
                        placeholder="0"
                        value={teamAScore}
                        onChange={(e) => setTeamAScore(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teamB">🔴 Team B Score</Label>
                      <Input
                        id="teamB"
                        type="number"
                        min="0"
                        max="99"
                        placeholder="0"
                        value={teamBScore}
                        onChange={(e) => setTeamBScore(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button 
                      onClick={() => reportResultMutation.mutate()}
                      disabled={reportResultMutation.isPending || !teamAScore || !teamBScore}
                    >
                      {reportResultMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Submit Result
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Refresh */}
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => refetchDraft()}
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>

              {/* Cancel Draft */}
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => {
                  if (confirm("Are you sure you want to cancel this draft?")) {
                    cancelDraftMutation.mutate();
                  }
                }}
                disabled={cancelDraftMutation.isPending}
              >
                {cancelDraftMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Cancel Draft
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* No Active Draft - Start New */}
            <div className="text-center py-6">
              <Swords className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No active draft</p>
              
              <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    Start New Draft
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Start New Draft</DialogTitle>
                    <DialogDescription>
                      Select at least 4 players to start a draft. Captains will be auto-selected based on experience.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <div className="flex items-center justify-between mb-4">
                      <Label>Select Players ({selectedPlayers.length} selected)</Label>
                      {selectedPlayers.length > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedPlayers([])}
                        >
                          Clear All
                        </Button>
                      )}
                    </div>
                    
                    {playersLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : players && players.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto p-1">
                        {players.map((player) => {
                          const isSelected = selectedPlayers.includes(player.discord_user_id);
                          return (
                            <button
                              key={player.discord_user_id}
                              onClick={() => togglePlayerSelection(player.discord_user_id)}
                              className={`p-3 rounded-lg border text-left transition-all ${
                                isSelected 
                                  ? "bg-primary/10 border-primary" 
                                  : "bg-muted/30 border-border hover:bg-muted/50"
                              }`}
                            >
                              <p className="font-medium text-sm truncate">
                                {player.discord_username || player.discord_user_id.slice(-6)}
                              </p>
                              <div className="flex items-center justify-between mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {player.primary_position || "?"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {player.overall_rating?.toFixed(0) || "—"}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No players found. Players need to have their stats synced first.
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button 
                      onClick={() => startDraftMutation.mutate()}
                      disabled={selectedPlayers.length < 4 || startDraftMutation.isPending}
                    >
                      {startDraftMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Start Draft ({selectedPlayers.length} players)
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
