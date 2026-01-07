import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Save, Loader2, Users, Wifi, WifiOff, Trash2, AlertTriangle } from "lucide-react";
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

interface Club {
  key: string;
  name: string;
  enabled: boolean;
  ea_club_id?: string;
  ea_platform?: string;
  monitoring_enabled?: boolean;
}

interface SortableClubItemProps {
  club: Club;
  isDuplicate: boolean;
  onToggleEnabled: (key: string) => void;
  onToggleMonitoring: (key: string) => void;
  onDelete: (key: string) => void;
}

function SortableClubItem({ club, isDuplicate, onToggleEnabled, onToggleMonitoring, onDelete }: SortableClubItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: club.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        isDragging ? "border-primary shadow-lg" : isDuplicate ? "border-destructive" : "border-border"
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{club.name}</span>
          {club.ea_club_id && (
            <Badge variant="outline" className="text-xs">
              EA Linked
            </Badge>
          )}
          {isDuplicate && (
            <Badge variant="destructive" className="text-xs flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Duplicate
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {club.key} {club.ea_platform && `• ${club.ea_platform}`}
          {club.ea_club_id && ` • ID: ${club.ea_club_id}`}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {club.ea_club_id && (
          <div className="flex items-center gap-2">
            {club.monitoring_enabled ? (
              <Wifi className="h-4 w-4 text-primary" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <Switch
              checked={club.monitoring_enabled || false}
              onCheckedChange={() => onToggleMonitoring(club.key)}
              aria-label="Toggle EA monitoring"
            />
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <Users className={`h-4 w-4 ${club.enabled ? "text-primary" : "text-muted-foreground"}`} />
          <Switch
            checked={club.enabled}
            onCheckedChange={() => onToggleEnabled(club.key)}
            aria-label="Toggle club enabled"
          />
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {club.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the club from this server. Any linked EA data and stats will remain in the database but will no longer be tracked.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(club.key)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function ClubsManager() {
  const { selectedGuildId, selectedGuild } = useGuild();
  const { toast } = useToast();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [adminDiscordId, setAdminDiscordId] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load clubs from context
  useEffect(() => {
    if (selectedGuild?.clubs) {
      setClubs(selectedGuild.clubs as Club[]);
      setHasChanges(false);
    }
  }, [selectedGuild]);

  // Find duplicate EA club IDs
  const getDuplicateEaClubIds = (): Set<string> => {
    const eaClubIds = clubs
      .filter(c => c.ea_club_id)
      .map(c => c.ea_club_id!);
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const id of eaClubIds) {
      if (seen.has(id)) {
        duplicates.add(id);
      }
      seen.add(id);
    }
    return duplicates;
  };

  const duplicateEaClubIds = getDuplicateEaClubIds();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setClubs((items) => {
        const oldIndex = items.findIndex((item) => item.key === active.id);
        const newIndex = items.findIndex((item) => item.key === over.id);
        setHasChanges(true);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleEnabled = (key: string) => {
    setClubs((items) =>
      items.map((item) =>
        item.key === key ? { ...item, enabled: !item.enabled } : item
      )
    );
    setHasChanges(true);
  };

  const toggleMonitoring = (key: string) => {
    setClubs((items) =>
      items.map((item) =>
        item.key === key ? { ...item, monitoring_enabled: !item.monitoring_enabled } : item
      )
    );
    setHasChanges(true);
  };

  const deleteClub = (key: string) => {
    setClubs((items) => items.filter((item) => item.key !== key));
    setHasChanges(true);
    toast({
      title: "Club Removed",
      description: "Remember to save changes to apply.",
    });
  };

  const saveChanges = async () => {
    if (!selectedGuildId || !adminDiscordId.trim()) {
      toast({
        title: "Missing Discord ID",
        description: "Please enter your Discord ID to authorize this action.",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates before saving
    if (duplicateEaClubIds.size > 0) {
      toast({
        title: "Duplicate EA Clubs Detected",
        description: "Please remove duplicate EA club links before saving. Each EA club can only be tracked once per server.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-guild-settings", {
        body: {
          guild_id: selectedGuildId,
          discord_user_id: adminDiscordId.trim(),
          clubs: clubs,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to update settings");

      toast({
        title: "Clubs Updated",
        description: "Team order and settings have been saved.",
      });
      setHasChanges(false);
    } catch (error) {
      toast({
        title: "Save Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedGuildId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a server to manage clubs
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Management
            </CardTitle>
            <CardDescription>
              Drag to reorder teams. Toggle visibility and EA monitoring.
            </CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={saveChanges} disabled={isSaving || !adminDiscordId.trim()}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </div>
        {duplicateEaClubIds.size > 0 && (
          <div className="mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Duplicate EA clubs detected! Each EA club can only be tracked once per server.
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Admin Discord ID input for authorization */}
        <div className="p-3 rounded-lg bg-muted/30 border">
          <label className="text-sm font-medium">Your Discord ID (for authorization)</label>
          <Input
            placeholder="123456789012345678"
            value={adminDiscordId}
            onChange={(e) => setAdminDiscordId(e.target.value)}
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">Required to save changes</p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={clubs.map((c) => c.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {clubs.map((club) => (
                <SortableClubItem
                  key={club.key}
                  club={club}
                  isDuplicate={club.ea_club_id ? duplicateEaClubIds.has(club.ea_club_id) : false}
                  onToggleEnabled={toggleEnabled}
                  onToggleMonitoring={toggleMonitoring}
                  onDelete={deleteClub}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {clubs.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No teams configured for this server
          </div>
        )}
      </CardContent>
    </Card>
  );
}
