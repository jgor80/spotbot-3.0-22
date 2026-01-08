import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGuild } from "@/contexts/GuildContext";
import { useAvailablePlayers } from "@/hooks/useAvailablePlayers";
import { FormationType, LineupSlot, LeaderboardPlayer } from "@/types/player";
import { FORMATION_OPTIONS, FORMATIONS } from "@/lib/formations";
import { FormationPitch } from "@/components/lineup/FormationPitch";
import { PlayerCard } from "@/components/player/PlayerCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Users, 
  Loader2, 
  Plus,
  Shield,
  UserPlus,
  Trash2,
  Crown,
  User,
  ChevronRight,
  X,
  ClipboardList,
  Wand2,
  Save,
  RotateCcw,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Team {
  id: string;
  guild_id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
  team_type: string;
  captain_discord_id: string | null;
  manager_discord_ids: string[];
  active: boolean;
  created_at: string;
}

interface TeamRoster {
  id: string;
  team_id: string;
  discord_user_id: string;
  role: string;
  primary_position: string | null;
  joined_at: string;
}

interface PlayerSummary {
  discord_user_id: string;
  discord_username: string | null;
  overall_rating: number;
  primary_position: string | null;
}

export default function TeamsPage() {
  const { selectedGuildId, isLoading: guildLoading } = useGuild();
  const { toast: toastHook } = useToast();
  const queryClient = useQueryClient();
  
  // Teams state
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamTag, setNewTeamTag] = useState("");
  const [newTeamType, setNewTeamType] = useState("comp");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedPlayerRole, setSelectedPlayerRole] = useState("player");

  // Lineup state
  const [formation, setFormation] = useState<FormationType>("4-3-3 FLAT");
  const [slots, setSlots] = useState<LineupSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [lineupName, setLineupName] = useState("");
  const [lineupSearchQuery, setLineupSearchQuery] = useState("");
  const [isLineupLoading, setIsLineupLoading] = useState(false);
  const [lineupTeamId, setLineupTeamId] = useState<string>("");

  // Available players for lineup
  const { data: availablePlayers, isLoading: playersLoading } = useAvailablePlayers(selectedGuildId);
  const positions = FORMATIONS[formation];

  // Fetch teams
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", selectedGuildId],
    queryFn: async (): Promise<Team[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("name");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch roster for selected team
  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ["teamRoster", selectedTeam?.id],
    queryFn: async (): Promise<TeamRoster[]> => {
      if (!selectedTeam) return [];
      
      const { data, error } = await supabase
        .from("team_rosters")
        .select("*")
        .eq("team_id", selectedTeam.id)
        .order("role");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedTeam,
  });

  // Fetch players for team management
  const { data: players } = useQuery({
    queryKey: ["players", selectedGuildId],
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

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId || !newTeamName.trim()) {
        throw new Error("Missing required fields");
      }
      
      const { data, error } = await supabase.functions.invoke("manage-teams", {
        body: {
          action: "create",
          guild_id: selectedGuildId,
          team_name: newTeamName.trim(),
          team_tag: newTeamTag.trim() || null,
          team_type: newTeamType,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to create team");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setIsCreateOpen(false);
      setNewTeamName("");
      setNewTeamTag("");
      toastHook({ title: "Team Created", description: "Your team has been created successfully" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      if (!selectedGuildId) {
        throw new Error("Missing guild");
      }
      
      const { data, error } = await supabase.functions.invoke("manage-teams", {
        body: {
          action: "delete",
          guild_id: selectedGuildId,
          team_id: teamId,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to delete team");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setSelectedTeam(null);
      toastHook({ title: "Team Deleted" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Add player to team
  const addPlayerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTeam || !selectedPlayerId || !selectedGuildId) {
        throw new Error("Missing data");
      }
      
      const player = players?.find(p => p.discord_user_id === selectedPlayerId);
      
      const { data, error } = await supabase.functions.invoke("manage-roster", {
        body: {
          action: "add",
          guild_id: selectedGuildId,
          team_id: selectedTeam.id,
          player_discord_id: selectedPlayerId,
          role: selectedPlayerRole,
          primary_position: player?.primary_position || null,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to add player");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamRoster"] });
      setIsAddPlayerOpen(false);
      setSelectedPlayerId("");
      toastHook({ title: "Player Added" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Remove player from team
  const removePlayerMutation = useMutation({
    mutationFn: async (rosterId: string) => {
      if (!selectedTeam || !selectedGuildId) {
        throw new Error("Missing data");
      }
      
      const { data, error } = await supabase.functions.invoke("manage-roster", {
        body: {
          action: "remove",
          guild_id: selectedGuildId,
          team_id: selectedTeam.id,
          roster_id: rosterId,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to remove player");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamRoster"] });
      toastHook({ title: "Player Removed" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Helper functions
  const getPlayerInfo = (discordUserId: string) => {
    return players?.find(p => p.discord_user_id === discordUserId);
  };

  const getPlayerDisplayName = (discordUserId: string) => {
    const player = getPlayerInfo(discordUserId);
    return player?.discord_username || "Unknown Player";
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "captain":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "manager":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "comp":
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Competitive</Badge>;
      case "casual":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Casual</Badge>;
      case "academy":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Academy</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const playersNotInTeam = players?.filter(
    p => !roster?.some(r => r.discord_user_id === p.discord_user_id)
  ) || [];

  // Lineup functions
  const filteredLineupPlayers = useMemo(() => {
    if (!availablePlayers) return [];
    const assignedIds = new Set(slots.map(s => s.discord_user_id));
    return availablePlayers.filter(p => {
      if (assignedIds.has(p.discord_user_id)) return false;
      if (!lineupSearchQuery) return true;
      const query = lineupSearchQuery.toLowerCase();
      return p.ea_username?.toLowerCase().includes(query) ||
             p.discord_username?.toLowerCase().includes(query) ||
             p.primary_position?.toLowerCase().includes(query);
    });
  }, [availablePlayers, slots, lineupSearchQuery]);

  const handleSlotClick = (slotIndex: number) => {
    if (selectedSlot === slotIndex) {
      setSelectedSlot(null);
    } else {
      setSelectedSlot(slotIndex);
    }
  };

  const handlePlayerSelect = (player: LeaderboardPlayer) => {
    if (selectedSlot === null) {
      toast.error("Please select a position first");
      return;
    }

    const position = positions[selectedSlot].position;
    const newSlot: LineupSlot = {
      slot_index: selectedSlot,
      position,
      discord_user_id: player.discord_user_id,
      discord_username: player.discord_username || undefined,
      ea_username: player.ea_username || undefined,
      rating: player.overall_rating,
      is_substitute: false,
    };

    setSlots(prev => {
      const filtered = prev.filter(s => s.slot_index !== selectedSlot);
      return [...filtered, newSlot];
    });
    setSelectedSlot(null);
  };

  const handleRemoveLineupPlayer = (slotIndex: number) => {
    setSlots(prev => prev.filter(s => s.slot_index !== slotIndex));
  };

  const handleReset = () => {
    setSlots([]);
    setSelectedSlot(null);
    setLineupName("");
    setLineupTeamId("");
  };

  const handleSaveLineup = async () => {
    if (slots.length < 11) {
      toast.error("Please fill all 11 positions");
      return;
    }

    if (!selectedGuildId) {
      toast.error("No guild selected");
      return;
    }

    if (!lineupTeamId) {
      toast.error("Please select a team to save this lineup to");
      return;
    }

    const selectedLineupTeam = teams?.find(t => t.id === lineupTeamId);
    const defaultName = selectedLineupTeam 
      ? `${selectedLineupTeam.name} Starting XI` 
      : "Untitled Lineup";

    setIsLineupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-lineup", {
        body: {
          guild_id: selectedGuildId,
          created_by_discord_id: "web-user",
          formation,
          name: lineupName || defaultName,
          team_id: lineupTeamId,
          slots: slots.map(s => ({
            slot_index: s.slot_index,
            position: s.position,
            discord_user_id: s.discord_user_id,
            is_substitute: s.is_substitute,
          })),
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to save lineup");

      toast.success(`Starting XI saved for ${selectedLineupTeam?.name || "team"}!`);
      handleReset();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsLineupLoading(false);
    }
  };

  const avgRating = slots.length > 0
    ? slots.reduce((sum, s) => sum + (s.rating || 0), 0) / slots.length
    : 0;

  if (!selectedGuildId && !guildLoading) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>No Server Selected</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            <p>Select a Discord server from the dropdown above to manage teams and lineups.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Teams & Lineups</h1>
          <p className="text-muted-foreground">Manage teams, rosters, and build lineups</p>
        </div>

        <Tabs defaultValue="teams" className="space-y-6">
          <TabsList>
            <TabsTrigger value="teams" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="lineup" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Lineup Builder
            </TabsTrigger>
          </TabsList>

          {/* Teams Tab */}
          <TabsContent value="teams" className="space-y-6">
            <div className="flex items-center justify-end">
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Team</DialogTitle>
                    <DialogDescription>
                      Add a new team to this Discord server
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Team Name *</label>
                      <Input
                        placeholder="e.g., Rush Superstars"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Team Tag</label>
                      <Input
                        placeholder="e.g., RS"
                        value={newTeamTag}
                        onChange={(e) => setNewTeamTag(e.target.value)}
                        maxLength={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Team Type</label>
                      <div className="flex gap-2">
                        {["comp", "casual", "academy"].map((type) => (
                          <Button
                            key={type}
                            type="button"
                            variant={newTeamType === type ? "default" : "outline"}
                            size="sm"
                            onClick={() => setNewTeamType(type)}
                            className="capitalize"
                          >
                            {type === "comp" ? "Competitive" : type}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => createTeamMutation.mutate()}
                      disabled={!newTeamName.trim() || createTeamMutation.isPending}
                    >
                      {createTeamMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Create Team
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Teams List */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Teams
                  </CardTitle>
                  <CardDescription>
                    {teams?.length || 0} teams in this server
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {teamsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : teams && teams.length > 0 ? (
                    <div className="space-y-2">
                      {teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => setSelectedTeam(team)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left ${
                            selectedTeam?.id === team.id
                              ? "bg-primary/10 border border-primary/20"
                              : "bg-muted/30 hover:bg-muted/50 border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{team.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {team.tag && (
                                  <span className="text-xs text-muted-foreground">[{team.tag}]</span>
                                )}
                                {getTypeBadge(team.team_type)}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p>No teams yet</p>
                      <p className="text-sm">Create your first team above</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Team Details & Roster */}
              <Card className="lg:col-span-2">
                {selectedTeam ? (
                  <>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {selectedTeam.name}
                            {selectedTeam.tag && (
                              <span className="text-muted-foreground font-normal">[{selectedTeam.tag}]</span>
                            )}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            {getTypeBadge(selectedTeam.team_type)}
                            <span>•</span>
                            <span>{roster?.length || 0} players</span>
                            <span>•</span>
                            <span>Created {format(new Date(selectedTeam.created_at), "MMM d, yyyy")}</span>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
                            <DialogTrigger asChild>
                              <Button size="sm">
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Player
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Player to {selectedTeam.name}</DialogTitle>
                                <DialogDescription>
                                  Select a player to add to the team roster
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Player</label>
                                  <select
                                    className="w-full p-2 rounded-md border bg-background"
                                    value={selectedPlayerId}
                                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                                  >
                                    <option value="">Select player...</option>
                                    {playersNotInTeam.map((player) => (
                                      <option key={player.discord_user_id} value={player.discord_user_id}>
                                        {player.discord_username || "Unknown"} ({player.overall_rating.toFixed(1)})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Role</label>
                                  <div className="flex gap-2">
                                    {["player", "captain", "manager"].map((role) => (
                                      <Button
                                        key={role}
                                        type="button"
                                        variant={selectedPlayerRole === role ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setSelectedPlayerRole(role)}
                                        className="capitalize"
                                      >
                                        {role}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddPlayerOpen(false)}>
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={() => addPlayerMutation.mutate()}
                                  disabled={!selectedPlayerId || addPlayerMutation.isPending}
                                >
                                  {addPlayerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                  Add Player
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Team</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {selectedTeam.name}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteTeamMutation.mutate(selectedTeam.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {rosterLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : roster && roster.length > 0 ? (
                        <div className="space-y-2">
                          {roster.map((member) => {
                            const player = getPlayerInfo(member.discord_user_id);
                            return (
                              <div
                                key={member.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                              >
                                <div className="flex items-center gap-3">
                                  {getRoleIcon(member.role)}
                                  <div>
                                    <p className="font-medium">
                                      {player?.discord_username || "Unknown Player"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {member.primary_position || player?.primary_position || "No position"}
                                      <span className="mx-2">•</span>
                                      <span className="capitalize">{member.role}</span>
                                      {player && (
                                        <>
                                          <span className="mx-2">•</span>
                                          <span>{player.overall_rating.toFixed(1)} OVR</span>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removePlayerMutation.mutate(member.id)}
                                  disabled={removePlayerMutation.isPending}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-muted-foreground">
                          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                          <p>No players in this team</p>
                          <p className="text-sm">Add players using the button above</p>
                        </div>
                      )}
                    </CardContent>
                  </>
                ) : (
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a team to view details</p>
                  </CardContent>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* Lineup Builder Tab */}
          <TabsContent value="lineup" className="space-y-6">
            {guildLoading || playersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : availablePlayers && availablePlayers.length > 0 ? (
              <div className="grid lg:grid-cols-5 gap-6">
                {/* Formation Pitch */}
                <div className="lg:col-span-3 space-y-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle>Formation</CardTitle>
                      <div className="flex items-center gap-2">
                        <Select value={formation} onValueChange={(v) => setFormation(v as FormationType)}>
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FORMATION_OPTIONS.map((f) => (
                              <SelectItem key={f} value={f}>{f}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <FormationPitch
                        formation={formation}
                        slots={slots}
                        onSlotClick={handleSlotClick}
                        selectedSlot={selectedSlot}
                      />
                    </CardContent>
                  </Card>

                  {/* Save to Team */}
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-sm font-medium mb-1.5 block">Save as Starting XI for</label>
                        <Select value={lineupTeamId} onValueChange={setLineupTeamId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a team..." />
                          </SelectTrigger>
                          <SelectContent>
                            {teams?.map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name} {team.tag && `[${team.tag}]`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-sm font-medium mb-1.5 block">Lineup Name (optional)</label>
                        <Input
                          placeholder={lineupTeamId ? `${teams?.find(t => t.id === lineupTeamId)?.name || ''} Starting XI` : "Lineup name..."}
                          value={lineupName}
                          onChange={(e) => setLineupName(e.target.value)}
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Players: <strong className="text-foreground">{slots.length}/11</strong></span>
                      <span>Avg Rating: <strong className="text-foreground">{avgRating.toFixed(1)}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button onClick={handleReset} variant="outline">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset
                      </Button>
                      <Button 
                        onClick={handleSaveLineup} 
                        disabled={slots.length < 11 || isLineupLoading || !lineupTeamId}
                      >
                        {isLineupLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        <Save className="h-4 w-4 mr-2" />
                        Save Starting XI
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Player Pool */}
                <div className="lg:col-span-2">
                  <Card className="h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between">
                        <span>Available Players</span>
                        <Badge variant="secondary">{filteredLineupPlayers.length}</Badge>
                      </CardTitle>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search players..."
                          value={lineupSearchQuery}
                          onChange={(e) => setLineupSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[500px] px-4 pb-4">
                        <div className="space-y-2">
                          {selectedSlot !== null && (
                            <div className="sticky top-0 bg-card py-2 z-10 border-b">
                              <p className="text-sm text-muted-foreground">
                                Select player for <Badge variant="default">{positions[selectedSlot].position}</Badge>
                              </p>
                            </div>
                          )}
                          {filteredLineupPlayers.map((player) => (
                            <PlayerCard
                              key={player.discord_user_id}
                              player={player}
                              compact
                              onClick={() => handlePlayerSelect(player)}
                            />
                          ))}
                          {filteredLineupPlayers.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">
                              No players available
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                {/* Selected Players */}
                {slots.length > 0 && (
                  <div className="lg:col-span-5">
                    <Card>
                      <CardHeader>
                        <CardTitle>Selected Players</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {slots.sort((a, b) => a.slot_index - b.slot_index).map((slot) => (
                            <Badge 
                              key={slot.slot_index} 
                              variant="secondary"
                              className="flex items-center gap-2 py-1.5 px-3"
                            >
                              <span className="font-bold">{slot.position}</span>
                              <span>{slot.discord_username || slot.ea_username || "Unknown"}</span>
                              <span className="text-primary font-bold">{slot.rating?.toFixed(0)}</span>
                              <button
                                onClick={() => handleRemoveLineupPlayer(slot.slot_index)}
                                className="hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No players found. Players need to play games before they can be added to lineups.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
