import { useState } from "react";
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
  Settings,
  Trash2,
  Crown,
  User,
  ChevronRight,
  Edit,
  X
} from "lucide-react";
import { format } from "date-fns";

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
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamTag, setNewTeamTag] = useState("");
  const [newTeamType, setNewTeamType] = useState("comp");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedPlayerRole, setSelectedPlayerRole] = useState("player");

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

  // Fetch players for adding to team
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
      if (!selectedGuildId || !newTeamName.trim()) throw new Error("Missing required fields");
      
      const { error } = await supabase
        .from("teams")
        .insert({
          guild_id: selectedGuildId,
          name: newTeamName.trim(),
          tag: newTeamTag.trim() || null,
          team_type: newTeamType,
          active: true,
          manager_discord_ids: []
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setIsCreateOpen(false);
      setNewTeamName("");
      setNewTeamTag("");
      toast({ title: "Team Created", description: "Your team has been created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setSelectedTeam(null);
      toast({ title: "Team Deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Add player to team
  const addPlayerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTeam || !selectedPlayerId) throw new Error("Missing data");
      
      const player = players?.find(p => p.discord_user_id === selectedPlayerId);
      
      const { error } = await supabase
        .from("team_rosters")
        .insert({
          team_id: selectedTeam.id,
          discord_user_id: selectedPlayerId,
          role: selectedPlayerRole,
          primary_position: player?.primary_position || null
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamRoster"] });
      setIsAddPlayerOpen(false);
      setSelectedPlayerId("");
      toast({ title: "Player Added" });
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Remove player from team
  const removePlayerMutation = useMutation({
    mutationFn: async (rosterId: string) => {
      const { error } = await supabase
        .from("team_rosters")
        .delete()
        .eq("id", rosterId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamRoster"] });
      toast({ title: "Player Removed" });
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  const getPlayerInfo = (discordUserId: string) => {
    return players?.find(p => p.discord_user_id === discordUserId);
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Teams</h1>
            <p className="text-muted-foreground">Manage teams and rosters for this server</p>
          </div>
          
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
                                    {player.discord_username || player.discord_user_id} ({player.overall_rating.toFixed(1)})
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
                              Add Player
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Team</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{selectedTeam.name}"? This will also remove all roster entries.
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
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : roster && roster.length > 0 ? (
                    <div className="space-y-2">
                      {roster.map((member) => {
                        const player = getPlayerInfo(member.discord_user_id);
                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                          >
                            <div className="flex items-center gap-3">
                              {getRoleIcon(member.role)}
                              <div>
                                <p className="font-medium">
                                  {player?.discord_username || member.discord_user_id}
                                </p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Badge variant="outline" className="text-xs">
                                    {player?.overall_rating?.toFixed(1) || "?"}
                                  </Badge>
                                  {member.primary_position && (
                                    <span>{member.primary_position}</span>
                                  )}
                                  <span className="capitalize">{member.role}</span>
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
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
                    <div className="py-12 text-center text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p>No players in this team</p>
                      <p className="text-sm">Add players to build your roster</p>
                    </div>
                  )}
                </CardContent>
              </>
            ) : (
              <CardContent className="py-16">
                <div className="text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Select a Team</p>
                  <p className="text-sm">Choose a team from the list to view and manage its roster</p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
