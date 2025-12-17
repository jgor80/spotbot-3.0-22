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
import { ClubsManager } from "@/components/settings/ClubsManager";
import { FeedbackSettingsCard } from "@/components/settings/FeedbackSettingsCard";
import { EaLinkingPanel } from "@/components/settings/EaLinkingPanel";
import { BuildSubmissionPanel } from "@/components/settings/BuildSubmissionPanel";
import { 
  Gamepad2, 
  User, 
  Link2, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Search,
  RefreshCw,
  Users,
  Zap,
  Hammer
} from "lucide-react";

interface PlayerProfile {
  discord_user_id: string;
  discord_username: string | null;
  ea_username: string | null;
  ea_platform: string | null;
  ea_persona_id: string | null;
  primary_position: string | null;
}

function SyncNowCard({ guildId }: { guildId: string | null }) {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncNow = async () => {
    if (!guildId) {
      toast({
        title: "No Guild Selected",
        description: "Please select a guild first.",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-ea-stats", {
        body: { sync_type: "full", guild_id: guildId },
      });

      if (error) throw error;

      toast({
        title: "EA Sync Complete",
        description: `Synced ${data?.memberStatsSynced || 0} players, ${data?.clubStatsSynced || 0} clubs, ${data?.totalSynced || 0} matches.`,
      });
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-warning" />
          EA Stats Sync
        </CardTitle>
        <CardDescription>
          Manually trigger an immediate sync of EA FC Pro Clubs stats for all monitored clubs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={handleSyncNow} 
          disabled={isSyncing || !guildId}
          className="gap-2"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Sync Now
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [discordUserId, setDiscordUserId] = useState("");
  const [searchedUserId, setSearchedUserId] = useState<string | null>(null);
  
  // Form state for EA linking
  const [eaUsername, setEaUsername] = useState("");
  const [eaPlatform, setEaPlatform] = useState<string>("ps5");
  
  // Position preferences
  const [positions, setPositions] = useState<string[]>([]);

  // Fetch player profile
  const { data: profile, isLoading: profileLoading, refetch } = useQuery({
    queryKey: ["playerSettings", searchedUserId],
    queryFn: async (): Promise<PlayerProfile | null> => {
      if (!searchedUserId) return null;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("discord_user_id", searchedUserId)
        .maybeSingle();
      
      if (error) throw error;
      
      // Also fetch position preferences
      if (selectedGuildId) {
        const { data: prefs } = await supabase
          .from("position_preferences")
          .select("preferences")
          .eq("guild_id", selectedGuildId)
          .eq("user_id", searchedUserId)
          .maybeSingle();
        
        if (prefs?.preferences) {
          setPositions(prefs.preferences);
        }
      }
      
      if (data) {
        setEaUsername(data.ea_username || "");
        setEaPlatform(data.ea_platform || "ps5");
      }
      
      return data;
    },
    enabled: !!searchedUserId,
  });

  // Verify EA username mutation
  const verifyEaMutation = useMutation({
    mutationFn: async ({ username, platform }: { username: string; platform: string }) => {
      const { data, error } = await supabase.functions.invoke("verify-ea-username", {
        body: { username, platform },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.verified) {
        toast({
          title: "EA Account Verified",
          description: `Found: ${data.persona_name} (${data.platform})`,
        });
      } else {
        toast({
          title: "Verification Failed",
          description: data.message || "Could not verify EA account",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Verification Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Link EA account mutation
  const linkEaMutation = useMutation({
    mutationFn: async () => {
      if (!searchedUserId) throw new Error("No user selected");
      
      // First verify the EA account
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-ea-username", {
        body: { username: eaUsername, platform: eaPlatform },
      });
      
      if (verifyError) throw verifyError;
      if (!verifyData.verified) throw new Error("Could not verify EA account");
      
      // Update the profile
      const { error } = await supabase
        .from("profiles")
        .upsert({
          discord_user_id: searchedUserId,
          ea_username: eaUsername,
          ea_platform: eaPlatform,
          ea_persona_id: verifyData.persona_id || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "discord_user_id",
        });
      
      if (error) throw error;
      
      return verifyData;
    },
    onSuccess: () => {
      toast({
        title: "EA Account Linked",
        description: "Your EA account has been verified and linked successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["playerSettings", searchedUserId] });
    },
    onError: (error) => {
      toast({
        title: "Link Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Save position preferences
  const savePositionsMutation = useMutation({
    mutationFn: async () => {
      if (!searchedUserId || !selectedGuildId) throw new Error("Missing data");
      
      const { error } = await supabase
        .from("position_preferences")
        .upsert({
          user_id: searchedUserId,
          guild_id: selectedGuildId,
          preferences: positions,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id,guild_id",
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Positions Saved",
        description: "Your position preferences have been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    if (discordUserId.trim()) {
      setSearchedUserId(discordUserId.trim());
    }
  };

  const allPositions = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST", "CF"];

  const togglePosition = (pos: string) => {
    setPositions(prev => 
      prev.includes(pos) 
        ? prev.filter(p => p !== pos) 
        : [...prev, pos]
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="font-display text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage teams and player settings</p>
        </div>

        <Tabs defaultValue="teams" className="space-y-4">
          <TabsList>
            <TabsTrigger value="teams">
              <Users className="h-4 w-4 mr-2" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="ea-linking">
              <Link2 className="h-4 w-4 mr-2" />
              EA Linking
            </TabsTrigger>
            <TabsTrigger value="players">
              <User className="h-4 w-4 mr-2" />
              Players
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="space-y-4">
            <SyncNowCard guildId={selectedGuildId} />
            <FeedbackSettingsCard guildId={selectedGuildId} />
            <ClubsManager />
          </TabsContent>

          <TabsContent value="ea-linking">
            <EaLinkingPanel />
          </TabsContent>

          <TabsContent value="players" className="space-y-6">
            {/* Search Player Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Find Player
                </CardTitle>
                <CardDescription>Enter a Discord User ID to manage their account links</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Discord User ID (e.g. 123456789012345678)"
                    value={discordUserId}
                    onChange={(e) => setDiscordUserId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={!discordUserId.trim()}>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {profileLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {searchedUserId && !profileLoading && (
              <Tabs defaultValue="ea-account" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="ea-account">EA Account</TabsTrigger>
                  <TabsTrigger value="positions">Positions</TabsTrigger>
                  <TabsTrigger value="build">
                    <Hammer className="h-4 w-4 mr-2" />
                    My Build
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ea-account">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Gamepad2 className="h-5 w-5" />
                        EA Account Linking
                      </CardTitle>
                      <CardDescription>
                        Connect your EA FC Pro Clubs account to enable automatic stat tracking
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Current Status */}
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background">
                          <User className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">
                            {profile?.discord_username || `User ${searchedUserId.slice(-6)}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Discord ID: {searchedUserId}
                          </p>
                        </div>
                        {profile?.ea_username ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Linked
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            Not Linked
                          </Badge>
                        )}
                      </div>

                      {/* EA Account Info (if linked) */}
                      {profile?.ea_username && (
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
                          <Gamepad2 className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">{profile.ea_username}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              Platform: {profile.ea_platform || "Unknown"}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      {/* Link Form */}
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="ea-username">EA Username / Gamertag</Label>
                            <Input
                              id="ea-username"
                              placeholder="Your Pro Clubs name"
                              value={eaUsername}
                              onChange={(e) => setEaUsername(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="platform">Platform</Label>
                            <Select value={eaPlatform} onValueChange={setEaPlatform}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ps5">PlayStation 5</SelectItem>
                                <SelectItem value="ps4">PlayStation 4</SelectItem>
                                <SelectItem value="xbsx">Xbox Series X|S</SelectItem>
                                <SelectItem value="xone">Xbox One</SelectItem>
                                <SelectItem value="pc">PC</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => verifyEaMutation.mutate({ username: eaUsername, platform: eaPlatform })}
                            disabled={!eaUsername || verifyEaMutation.isPending}
                          >
                            {verifyEaMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Shield className="h-4 w-4 mr-2" />
                            )}
                            Verify
                          </Button>
                          <Button
                            onClick={() => linkEaMutation.mutate()}
                            disabled={!eaUsername || linkEaMutation.isPending}
                          >
                            {linkEaMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Link2 className="h-4 w-4 mr-2" />
                            )}
                            Link Account
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="positions">
                  <Card>
                    <CardHeader>
                      <CardTitle>Position Preferences</CardTitle>
                      <CardDescription>
                        Select your preferred positions (in order of preference)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex flex-wrap gap-2">
                        {allPositions.map((pos) => {
                          const isSelected = positions.includes(pos);
                          const order = positions.indexOf(pos);
                          return (
                            <Button
                              key={pos}
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              onClick={() => togglePosition(pos)}
                              className="relative"
                            >
                              {pos}
                              {isSelected && order >= 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground border">
                                  {order + 1}
                                </span>
                              )}
                            </Button>
                          );
                        })}
                      </div>

                      {positions.length > 0 && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground mb-2">Current order:</p>
                          <div className="flex flex-wrap gap-1">
                            {positions.map((pos, idx) => (
                              <Badge key={pos} variant="secondary">
                                {idx + 1}. {pos}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={() => savePositionsMutation.mutate()}
                        disabled={savePositionsMutation.isPending}
                      >
                        {savePositionsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Save Preferences
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="build">
                  <BuildSubmissionPanel discordUserId={searchedUserId} />
                </TabsContent>
              </Tabs>
            )}

            {!searchedUserId && !profileLoading && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter a Discord User ID above to manage account settings</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
