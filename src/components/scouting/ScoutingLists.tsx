import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Loader2,
  Plus,
  Users,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  UserPlus,
  X,
  List,
  ClipboardList
} from "lucide-react";

interface ScoutingList {
  id: string;
  guild_id: string;
  created_by_discord_id: string;
  name: string;
  description: string | null;
  player_ids: string[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface PlayerSummary {
  discord_user_id: string;
  discord_username: string | null;
  overall_rating: number;
  primary_position: string | null;
}

interface ScoutingListsProps {
  currentUserId?: string;
}

export function ScoutingLists({ currentUserId }: ScoutingListsProps) {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingList, setEditingList] = useState<ScoutingList | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListPublic, setNewListPublic] = useState(false);
  const [addingPlayerToList, setAddingPlayerToList] = useState<string | null>(null);
  const [selectedPlayerToAdd, setSelectedPlayerToAdd] = useState("");

  // Fetch scouting lists
  const { data: lists, isLoading: listsLoading } = useQuery({
    queryKey: ["scoutingLists", selectedGuildId],
    queryFn: async (): Promise<ScoutingList[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("scouting_lists")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch players for adding to lists
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

  // Create list mutation
  const createListMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId || !currentUserId) throw new Error("Missing guild or user");
      
      const { error } = await supabase
        .from("scouting_lists")
        .insert({
          guild_id: selectedGuildId,
          created_by_discord_id: currentUserId,
          name: newListName,
          description: newListDescription || null,
          is_public: newListPublic,
          player_ids: []
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoutingLists"] });
      setIsCreateOpen(false);
      setNewListName("");
      setNewListDescription("");
      setNewListPublic(false);
      toast({ title: "List Created", description: "Your scouting list has been created" });
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Update list mutation
  const updateListMutation = useMutation({
    mutationFn: async (list: Partial<ScoutingList> & { id: string }) => {
      const { error } = await supabase
        .from("scouting_lists")
        .update({
          name: list.name,
          description: list.description,
          is_public: list.is_public,
          player_ids: list.player_ids
        })
        .eq("id", list.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoutingLists"] });
      setEditingList(null);
      toast({ title: "List Updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Delete list mutation
  const deleteListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase
        .from("scouting_lists")
        .delete()
        .eq("id", listId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoutingLists"] });
      toast({ title: "List Deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Add player to list
  const addPlayerToList = async (listId: string, playerId: string) => {
    const list = lists?.find(l => l.id === listId);
    if (!list) return;
    
    if (list.player_ids.includes(playerId)) {
      toast({ title: "Already in list", variant: "destructive" });
      return;
    }
    
    await updateListMutation.mutateAsync({
      id: listId,
      name: list.name,
      description: list.description,
      is_public: list.is_public,
      player_ids: [...list.player_ids, playerId]
    });
    
    setAddingPlayerToList(null);
    setSelectedPlayerToAdd("");
  };

  // Remove player from list
  const removePlayerFromList = async (listId: string, playerId: string) => {
    const list = lists?.find(l => l.id === listId);
    if (!list) return;
    
    await updateListMutation.mutateAsync({
      id: listId,
      name: list.name,
      description: list.description,
      is_public: list.is_public,
      player_ids: list.player_ids.filter(id => id !== playerId)
    });
  };

  const getPlayerInfo = (playerId: string) => {
    return players?.find(p => p.discord_user_id === playerId);
  };

  if (listsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Scouting Lists</h3>
          <p className="text-sm text-muted-foreground">Create and manage lists of players you're scouting</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New List
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Scouting List</DialogTitle>
              <DialogDescription>
                Create a new list to track players you're interested in
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">List Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Draft Targets, Midfield Options..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Notes about this list..."
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="public"
                  checked={newListPublic}
                  onCheckedChange={setNewListPublic}
                />
                <Label htmlFor="public">Make this list public</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createListMutation.mutate()}
                disabled={!newListName.trim() || createListMutation.isPending}
              >
                {createListMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Create List
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {lists && lists.length > 0 ? (
        <div className="grid gap-4">
          {lists.map((list) => (
            <Card key={list.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <List className="h-4 w-4" />
                      {list.name}
                      {list.is_public ? (
                        <Badge variant="secondary" className="text-xs">
                          <Eye className="h-3 w-3 mr-1" />
                          Public
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Private
                        </Badge>
                      )}
                    </CardTitle>
                    {list.description && (
                      <CardDescription>{list.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog open={addingPlayerToList === list.id} onOpenChange={(open) => {
                      if (!open) {
                        setAddingPlayerToList(null);
                        setSelectedPlayerToAdd("");
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => setAddingPlayerToList(list.id)}>
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Player to List</DialogTitle>
                          <DialogDescription>
                            Select a player to add to "{list.name}"
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Select value={selectedPlayerToAdd} onValueChange={setSelectedPlayerToAdd}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a player..." />
                            </SelectTrigger>
                            <SelectContent>
                              {players?.filter(p => !list.player_ids.includes(p.discord_user_id)).map((player) => (
                                <SelectItem key={player.discord_user_id} value={player.discord_user_id}>
                                  <span className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {player.overall_rating.toFixed(1)}
                                    </Badge>
                                    {player.discord_username || player.discord_user_id}
                                    {player.primary_position && (
                                      <span className="text-muted-foreground text-xs">
                                        ({player.primary_position})
                                      </span>
                                    )}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => {
                            setAddingPlayerToList(null);
                            setSelectedPlayerToAdd("");
                          }}>
                            Cancel
                          </Button>
                          <Button 
                            onClick={() => addPlayerToList(list.id, selectedPlayerToAdd)}
                            disabled={!selectedPlayerToAdd || updateListMutation.isPending}
                          >
                            Add Player
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete List</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{list.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteListMutation.mutate(list.id)}
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
                {list.player_ids.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {list.player_ids.map((playerId) => {
                      const player = getPlayerInfo(playerId);
                      return (
                        <Badge
                          key={playerId}
                          variant="secondary"
                          className="flex items-center gap-2 py-1.5 px-3"
                        >
                          <span className="text-xs font-bold text-primary">
                            {player?.overall_rating?.toFixed(1) || "?"}
                          </span>
                          {player?.discord_username || playerId}
                          {player?.primary_position && (
                            <span className="text-muted-foreground">
                              ({player.primary_position})
                            </span>
                          )}
                          <button
                            onClick={() => removePlayerFromList(list.id, playerId)}
                            className="ml-1 hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No players in this list yet. Click the + button to add players.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scouting lists yet</p>
              <p className="text-sm">Create your first list to start tracking players</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
