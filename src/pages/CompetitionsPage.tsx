import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Trophy, 
  Medal,
  Loader2,
  Plus,
  Check,
  X,
  Calendar,
  Users,
  Crown,
  Star
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CompetitionWin {
  id: string;
  competition_name: string;
  competition_type: 'tournament' | 'league';
  tier: string;
  team_name: string | null;
  placed_at: string | null;
  verified: boolean;
  discord_user_id: string;
}

interface PendingClaim {
  id: string;
  competition_name: string;
  competition_type: 'tournament' | 'league';
  tier: string;
  team_name: string | null;
  placed_at: string | null;
  claimed_by_discord_id: string;
  status: string;
  created_at: string;
}

export default function CompetitionsPage() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Add win form state
  const [discordUserId, setDiscordUserId] = useState("");
  const [competitionName, setCompetitionName] = useState("");
  const [competitionType, setCompetitionType] = useState<'tournament' | 'league'>("tournament");
  const [tier, setTier] = useState("major");
  const [teamName, setTeamName] = useState("");
  const [placedAt, setPlacedAt] = useState("");

  // Fetch verified wins
  const { data: verifiedWins, isLoading: winsLoading } = useQuery({
    queryKey: ["competitionWins", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("competition_wins")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("verified", true)
        .order("placed_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as CompetitionWin[];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch pending claims
  const { data: pendingClaims, isLoading: claimsLoading } = useQuery({
    queryKey: ["pendingClaims", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("pending_win_claims")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as PendingClaim[];
    },
    enabled: !!selectedGuildId,
  });

  // Add win mutation
  const addWinMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId) throw new Error("No guild selected");
      
      // Map tier to valid enum values
      const validTier = tier as "major" | "minor" | "community" | "div1" | "div2" | "div3" | "div4";
      
      const { error } = await supabase.from("competition_wins").insert({
        guild_id: selectedGuildId,
        discord_user_id: discordUserId,
        competition_name: competitionName,
        competition_type: competitionType,
        tier: validTier,
        team_name: teamName || null,
        placed_at: placedAt || null,
        verified: true, // Admin-added wins are auto-verified
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Win Added",
        description: `${competitionType === 'tournament' ? 'Tournament' : 'League'} win recorded for player`,
      });
      queryClient.invalidateQueries({ queryKey: ["competitionWins", selectedGuildId] });
      // Reset form
      setDiscordUserId("");
      setCompetitionName("");
      setTeamName("");
      setPlacedAt("");
    },
    onError: (error) => {
      toast({
        title: "Failed to Add Win",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Approve claim mutation
  const approveMutation = useMutation({
    mutationFn: async (claimId: string) => {
      const claim = pendingClaims?.find(c => c.id === claimId);
      if (!claim || !selectedGuildId) throw new Error("Claim not found");
      
      // Map tier to valid enum values
      const validTier = claim.tier as "major" | "minor" | "community" | "div1" | "div2" | "div3" | "div4";
      
      // Add to competition_wins
      await supabase.from("competition_wins").insert({
        guild_id: selectedGuildId,
        discord_user_id: claim.claimed_by_discord_id,
        competition_name: claim.competition_name,
        competition_type: claim.competition_type,
        tier: validTier,
        team_name: claim.team_name,
        placed_at: claim.placed_at,
        verified: true,
      });
      
      // Update claim status
      await supabase
        .from("pending_win_claims")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", claimId);
    },
    onSuccess: () => {
      toast({ title: "Claim Approved" });
      queryClient.invalidateQueries({ queryKey: ["pendingClaims", selectedGuildId] });
      queryClient.invalidateQueries({ queryKey: ["competitionWins", selectedGuildId] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Approve",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Reject claim mutation
  const rejectMutation = useMutation({
    mutationFn: async (claimId: string) => {
      await supabase
        .from("pending_win_claims")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", claimId);
    },
    onSuccess: () => {
      toast({ title: "Claim Rejected" });
      queryClient.invalidateQueries({ queryKey: ["pendingClaims", selectedGuildId] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Reject",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const tierColors: Record<string, string> = {
    major: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    minor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    community: "bg-green-500/10 text-green-500 border-green-500/20",
    div1: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    div2: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    div3: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    div4: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Trophy className="h-8 w-8 text-primary" />
            Competition Wins
          </h1>
          <p className="text-muted-foreground">Track tournament and league victories</p>
        </div>

        {!selectedGuildId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Select a server to manage competition wins
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="add" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-lg">
              <TabsTrigger value="add">
                <Plus className="h-4 w-4 mr-2" />
                Add Win
              </TabsTrigger>
              <TabsTrigger value="pending">
                <Medal className="h-4 w-4 mr-2" />
                Pending ({pendingClaims?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="history">
                <Trophy className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Add Win Tab */}
            <TabsContent value="add">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5" />
                    Record a Win
                  </CardTitle>
                  <CardDescription>
                    Manually add a tournament or league win for a player
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="discord-id">Discord User ID</Label>
                      <Input
                        id="discord-id"
                        placeholder="123456789012345678"
                        value={discordUserId}
                        onChange={(e) => setDiscordUserId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="competition-name">Competition Name</Label>
                      <Input
                        id="competition-name"
                        placeholder="e.g., VPG Division 1"
                        value={competitionName}
                        onChange={(e) => setCompetitionName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Competition Type</Label>
                      <Select value={competitionType} onValueChange={(v) => setCompetitionType(v as 'tournament' | 'league')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tournament">
                            <div className="flex items-center gap-2">
                              <Trophy className="h-4 w-4" />
                              Tournament
                            </div>
                          </SelectItem>
                          <SelectItem value="league">
                            <div className="flex items-center gap-2">
                              <Medal className="h-4 w-4" />
                              League
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tier</Label>
                      <Select value={tier} onValueChange={setTier}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {competitionType === 'tournament' ? (
                            <>
                              <SelectItem value="major">🏆 Major</SelectItem>
                              <SelectItem value="minor">🥈 Minor</SelectItem>
                              <SelectItem value="community">🏅 Community</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="div1">Div 1</SelectItem>
                              <SelectItem value="div2">Div 2</SelectItem>
                              <SelectItem value="div3">Div 3</SelectItem>
                              <SelectItem value="div4">Div 4</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">Date Won</Label>
                      <Input
                        id="date"
                        type="date"
                        value={placedAt}
                        onChange={(e) => setPlacedAt(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="team-name">Team Name (Optional)</Label>
                    <Input
                      id="team-name"
                      placeholder="e.g., FC United"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                    />
                  </div>

                  <Button 
                    onClick={() => addWinMutation.mutate()}
                    disabled={!discordUserId || !competitionName || addWinMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {addWinMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Add Win
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Pending Claims Tab */}
            <TabsContent value="pending">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Medal className="h-5 w-5" />
                    Pending Win Claims
                  </CardTitle>
                  <CardDescription>
                    Review and verify player-submitted win claims
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {claimsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : pendingClaims && pendingClaims.length > 0 ? (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-4">
                        {pendingClaims.map((claim) => (
                          <div 
                            key={claim.id}
                            className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                          >
                            <div className="flex-shrink-0">
                              {claim.competition_type === 'tournament' ? (
                                <Trophy className="h-8 w-8 text-yellow-500" />
                              ) : (
                                <Medal className="h-8 w-8 text-blue-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{claim.competition_name}</p>
                                <Badge className={tierColors[claim.tier] || ""}>{claim.tier}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Claimed by: &lt;@{claim.claimed_by_discord_id}&gt;
                              </p>
                              {claim.team_name && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {claim.team_name}
                                </p>
                              )}
                              {claim.placed_at && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(claim.placed_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => approveMutation.mutate(claim.id)}
                                disabled={approveMutation.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectMutation.mutate(claim.id)}
                                disabled={rejectMutation.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Check className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending claims to review</p>
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
                    <Star className="h-5 w-5" />
                    Verified Wins
                  </CardTitle>
                  <CardDescription>
                    All verified competition wins for this server
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {winsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : verifiedWins && verifiedWins.length > 0 ? (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {verifiedWins.map((win) => (
                          <div 
                            key={win.id}
                            className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex-shrink-0">
                              {win.competition_type === 'tournament' ? (
                                <Trophy className="h-6 w-6 text-yellow-500" />
                              ) : (
                                <Medal className="h-6 w-6 text-blue-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{win.competition_name}</p>
                                <Badge variant="outline" className={tierColors[win.tier] || ""}>
                                  {win.tier}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {win.team_name && `${win.team_name} • `}
                                {win.placed_at ? new Date(win.placed_at).toLocaleDateString() : 'Date unknown'}
                              </p>
                            </div>
                            <Badge variant="default" className="bg-primary/10 text-primary">
                              <Check className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No verified wins yet</p>
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
