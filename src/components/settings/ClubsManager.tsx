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
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Save, Loader2, Users, Wifi, WifiOff } from "lucide-react";

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
  onToggleEnabled: (key: string) => void;
  onToggleMonitoring: (key: string) => void;
}

function SortableClubItem({ club, onToggleEnabled, onToggleMonitoring }: SortableClubItemProps) {
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
        isDragging ? "border-primary shadow-lg" : "border-border"
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
        </div>
        <p className="text-xs text-muted-foreground">
          {club.key} {club.ea_platform && `• ${club.ea_platform}`}
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

  const saveChanges = async () => {
    if (!selectedGuildId) return;

    setIsSaving(true);
    try {
      // Cast to satisfy Supabase Json type
      const clubsJson = JSON.parse(JSON.stringify(clubs));
      
      const { error } = await supabase
        .from("guild_settings")
        .update({ 
          clubs: clubsJson, 
          updated_at: new Date().toISOString() 
        })
        .eq("guild_id", selectedGuildId);

      if (error) throw error;

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
            <Button onClick={saveChanges} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
                  onToggleEnabled={toggleEnabled}
                  onToggleMonitoring={toggleMonitoring}
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
