import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGuild } from "@/contexts/GuildContext";
import { 
  Trophy, 
  Medal,
  Crown,
  Star,
  Plus,
  Loader2,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Users
} from "lucide-react";
import { format } from "date-fns";

interface CompetitionWin {
  id: string;
  discord_user_id: string;
  competition_name: string;
  competition_type: "tournament" | "league";
  tier: string;
  team_name: string | null;
  verified: boolean;
  placed_at: string | null;
  created_at: string;
}

interface PendingClaim {
  id: string;
  claimed_by_discord_id: string;
  competition_name: string;
  competition_type: "tournament" | "league";
  tier: string;
  team_name: string | null;
  status: string;
  created_at: string;
}

export default function CompetitionsPage() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form state
  const [discordUserId, setDiscordUserId] = useState("");
  const [competitionName, setCompetitionName] = useState("");
  const [competitionType, setCompetitionType] = useState<"tournament" | "league">("tournament");
  const [tier, setTier] = useState("minor");
  const [teamName, setTeamName] = useState("");
  const [placedAt, setPlacedAt] = useState("");

  // Fetch verified wins
  const { data: verifiedWins, isLoading: winsLoading } = useQuery({
    queryKey: ["competitionWins", selectedGuildId],
    queryFn: async (): Promise<CompetitionWin[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("competition_wins")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("verified", true)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch pending claims
  const { data: pendingClaims, isLoading: claimsLoading } = useQuery({
    queryKey: ["pendingClaims", selectedGuildId],
    queryFn: async (): Promise<PendingClaim[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("pending_win_claims")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Submit win claim
  const submitClaimMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId || !discordUserId || !competitionName) {
        throw new Error("Missing required fields");
      }
      
      const { error } = await supabase
        .from("pending_win_claims")
        .insert({
          guild_id: selectedGuildId,
          claimed_by_discord_id: discordUserId,
          competition_name: competitionName,
          competition_type: competitionType,
          tier: tier as "major" | "minor" | "community" | "div1" | "div2" | "div3" | "div4",
          team_name: teamName || null,
          placed_at: placedAt || null,
          status: "pending" as const,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Win Claim Submitted",
        description: "Your claim has been submitted for admin review.",
      });
      // Reset form
      setDiscordUserId("");
      setCompetitionName("");
      setTeamName("");
      setPlacedAt("");
      queryClient.invalidateQueries({ queryKey: ["pendingClaims", selectedGuildId] });
    },
    onError: (error) => {
      toast({
        title: "Submission Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Approve claim
  const approveClaimMutation = useMutation({
    mutationFn: async (claimId: string) => {
      const claim = pendingClaims?.find(c => c.id === claimId);
      if (!claim || !selectedGuildId) throw new Error("Claim not found");
      
      // Create verified win
      const { error: insertError } = await supabase
        .from("competition_wins")
        .insert({
          guild_id: selectedGuildId,
          discord_user_id: claim.claimed_by_discord_id,
          competition_name: claim.competition_name,
          competition_type: claim.competition_type,
          tier: claim.tier as "major" | "minor" | "community" | "div1" | "div2" | "div3" | "div4",
          team_name: claim.team_name,
          verified: true,
          verified_at: new Date().toISOString(),
        });
      
      if (insertError) throw insertError;
      
      // Update claim status
      const { error: updateError } = await supabase
        .from("pending_win_claims")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", claimId);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast({
        title: "Claim Approved",
        description: "The competition win has been verified.",
      });
      queryClient.invalidateQueries({ queryKey: ["pendingClaims", selectedGuildId] });
      queryClient.invalidateQueries({ queryKey: ["competitionWins", selectedGuildId] });
    },
    onError: (error) => {
      toast({
        title: "Approval Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Reject claim
  const rejectClaimMutation = useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("pending_win_claims")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", claimId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Claim Rejected",
        description: "The claim has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["pendingClaims", selectedGuildId] });
    },
    onError: (error) => {
      toast({
        title: "Rejection Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const getTierIcon = (tierValue: string) => {
    switch (tierValue) {
      case "major":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "minor":
        return <Medal className="h-4 w-4 text-slate-400" />;
      case "community":
        return <Star className="h-4 w-4 text-blue-500" />;
      case "div1":
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case "div2":
        return <Trophy className="h-4 w-4 text-slate-400" />;
      case "div3":
        return <Trophy className="h-4 w-4 text-amber-600" />;
      default:
        return <Trophy className="h-4 w-4" />;
    }
  };

  const getTierBadge = (tierValue: string) => {
    const tierLabels: Record<string, string> = {
      major: "Major",
      minor: "Minor",
      community: "Community",
      div1: "Division 1",
      div2: "Division 2",
      div3: "Division 3",
      div4: "Division 4",
    };
    
    return (
      <Badge variant="outline" className="capitalize">
        {getTierIcon(tierValue)}
        <span className="ml-1">{tierLabels[tierValue] || tierValue}</span>
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Competitions</h1>
          <p className="text-muted-foreground">Track tournament and league wins</p>
        </div>

        <Tabs defaultValue="submit" className="space-y-4">
          <TabsList>
            <TabsTrigger value="submit" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Submit Win
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Claims
              {pendingClaims && pendingClaims.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
                  {pendingClaims.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="verified" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Verified Wins
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Submit Competition Win
                </CardTitle>
                <CardDescription>
                  Submit a tournament or league win for verification
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Discord User ID *</label>
                    <Input
                      placeholder="123456789012345678"
                      value={discordUserId}
                      onChange={(e) => setDiscordUserId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Competition Name *</label>
                    <Input
                      placeholder="e.g. VPG Champions League"
                      value={competitionName}
                      onChange={(e) => setCompetitionName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Type</label>
                    <Select value={competitionType} onValueChange={(v) => setCompetitionType(v as "tournament" | "league")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tournament">Tournament</SelectItem>
                        <SelectItem value="league">League</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tier</label>
                    <Select value={tier} onValueChange={setTier}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {competitionType === "tournament" ? (
                          <>
                            <SelectItem value="major">Major</SelectItem>
                            <SelectItem value="minor">Minor</SelectItem>
                            <SelectItem value="community">Community</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="div1">Division 1</SelectItem>
                            <SelectItem value="div2">Division 2</SelectItem>
                            <SelectItem value="div3">Division 3</SelectItem>
                            <SelectItem value="div4">Division 4</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date Won</label>
                    <Input
                      type="date"
                      value={placedAt}
                      onChange={(e) => setPlacedAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Team Name (Optional)</label>
                  <Input
                    placeholder="Team name when win was achieved"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>

                <Button
                  onClick={() => submitClaimMutation.mutate()}
                  disabled={submitClaimMutation.isPending || !discordUserId || !competitionName}
                  className="w-full"
                >
                  {submitClaimMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Submit Win Claim
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Pending Claims
                </CardTitle>
                <CardDescription>
                  Review and approve or reject win claims
                </CardDescription>
              </CardHeader>
              <CardContent>
                {claimsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingClaims && pendingClaims.length > 0 ? (
                  <div className="space-y-3">
                    {pendingClaims.map((claim) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border"
                      >
                        <div className="flex items-center gap-4">
                          {getTierIcon(claim.tier)}
                          <div>
                            <p className="font-medium">{claim.competition_name}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Users className="h-3 w-3" />
                              {claim.claimed_by_discord_id.slice(-6)}
                              {claim.team_name && (
                                <>
                                  <span className="text-muted-foreground/50">•</span>
                                  {claim.team_name}
                                </>
                              )}
                              <span className="text-muted-foreground/50">•</span>
                              <Calendar className="h-3 w-3" />
                              {format(new Date(claim.created_at), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getTierBadge(claim.tier)}
                          <Badge variant="outline" className="capitalize">
                            {claim.competition_type}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                            onClick={() => approveClaimMutation.mutate(claim.id)}
                            disabled={approveClaimMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => rejectClaimMutation.mutate(claim.id)}
                            disabled={rejectClaimMutation.isPending}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No pending claims to review</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verified" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Verified Wins
                </CardTitle>
                <CardDescription>
                  All verified tournament and league wins
                </CardDescription>
              </CardHeader>
              <CardContent>
                {winsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : verifiedWins && verifiedWins.length > 0 ? (
                  <div className="space-y-3">
                    {verifiedWins.map((win) => (
                      <div
                        key={win.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                      >
                        <div className="flex items-center gap-4">
                          {getTierIcon(win.tier)}
                          <div>
                            <p className="font-medium">{win.competition_name}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Users className="h-3 w-3" />
                              {win.discord_user_id.slice(-6)}
                              {win.team_name && (
                                <>
                                  <span className="text-muted-foreground/50">•</span>
                                  {win.team_name}
                                </>
                              )}
                              {win.placed_at && (
                                <>
                                  <span className="text-muted-foreground/50">•</span>
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(win.placed_at), "MMM d, yyyy")}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getTierBadge(win.tier)}
                          <Badge variant="outline" className="capitalize">
                            {win.competition_type}
                          </Badge>
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No verified wins yet</p>
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
