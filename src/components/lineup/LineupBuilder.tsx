import { useState, useMemo } from "react";
import { LeaderboardPlayer, LineupSlot } from "@/types/player";
import { FormationType } from "@/types/formations";
import { FORMATION_OPTIONS, FORMATIONS } from "@/lib/formations";
import { FormationPitch } from "./FormationPitch";
import { PlayerCard } from "@/components/player/PlayerCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Wand2, Save, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

interface LineupBuilderProps {
  availablePlayers: LeaderboardPlayer[];
  guildId: string;
  createdBy: string;
  onSave?: (lineup: { formation: FormationType; slots: LineupSlot[]; name: string }) => void;
  onSuggest?: (formation: FormationType, playerIds: string[], priority: string) => Promise<LineupSlot[]>;
}

export function LineupBuilder({ 
  availablePlayers, 
  guildId, 
  createdBy, 
  onSave,
  onSuggest 
}: LineupBuilderProps) {
  const [formation, setFormation] = useState<FormationType>("4-3-3 FLAT");
  const [slots, setSlots] = useState<LineupSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [lineupName, setLineupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const positions = FORMATIONS[formation];

  const filteredPlayers = useMemo(() => {
    const assignedIds = new Set(slots.map(s => s.discord_user_id));
    return availablePlayers.filter(p => {
      if (assignedIds.has(p.discord_user_id)) return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return p.ea_username?.toLowerCase().includes(query) ||
             p.discord_username?.toLowerCase().includes(query) ||
             p.primary_position?.toLowerCase().includes(query);
    });
  }, [availablePlayers, slots, searchQuery]);

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

  const handleRemovePlayer = (slotIndex: number) => {
    setSlots(prev => prev.filter(s => s.slot_index !== slotIndex));
  };

  const handleReset = () => {
    setSlots([]);
    setSelectedSlot(null);
    setLineupName("");
  };

  const handleAutoFill = async () => {
    if (!onSuggest) return;
    
    setIsLoading(true);
    try {
      const playerIds = availablePlayers.map(p => p.discord_user_id);
      const suggested = await onSuggest(formation, playerIds, "balanced");
      setSlots(suggested);
      toast.success("Lineup auto-filled!");
    } catch (error) {
      toast.error("Failed to generate lineup");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    if (slots.length < 11) {
      toast.error("Please fill all 11 positions");
      return;
    }
    onSave?.({ formation, slots, name: lineupName || "Untitled Lineup" });
  };

  const avgRating = slots.length > 0
    ? slots.reduce((sum, s) => sum + (s.rating || 0), 0) / slots.length
    : 0;

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* Formation Pitch */}
      <div className="lg:col-span-3 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Formation</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={formation} onValueChange={(v) => setFormation(v as FormationType)}>
                <SelectTrigger className="w-32">
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

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Lineup name..."
            value={lineupName}
            onChange={(e) => setLineupName(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <Button onClick={handleAutoFill} disabled={isLoading} variant="secondary">
            <Wand2 className="h-4 w-4 mr-2" />
            Auto-Fill
          </Button>
          <Button onClick={handleReset} variant="outline">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={slots.length < 11}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Players: <strong className="text-foreground">{slots.length}/11</strong></span>
          <span>Avg Rating: <strong className="text-foreground">{avgRating.toFixed(1)}</strong></span>
        </div>
      </div>

      {/* Player Pool */}
      <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>Available Players</span>
              <Badge variant="secondary">{filteredPlayers.length}</Badge>
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                {filteredPlayers.map((player) => (
                  <PlayerCard
                    key={player.discord_user_id}
                    player={player}
                    compact
                    onClick={() => handlePlayerSelect(player)}
                  />
                ))}
                {filteredPlayers.length === 0 && (
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
                    <span>{slot.ea_username || slot.discord_username || "Unknown"}</span>
                    <span className="text-primary font-bold">{slot.rating?.toFixed(0)}</span>
                    <button
                      onClick={() => handleRemovePlayer(slot.slot_index)}
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
  );
}
