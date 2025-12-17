import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Upload, 
  User, 
  Ruler, 
  Weight, 
  Loader2,
  CheckCircle2,
  Sparkles,
  ImageIcon
} from "lucide-react";

interface BuildProfile {
  id: string;
  discord_user_id: string;
  position: string;
  height_cm: number | null;
  weight_kg: number | null;
  playstyles: string[] | null;
  playstyles_plus: string[] | null;
  build_rating: number | null;
  verified: boolean;
  screenshot_url: string | null;
}

const POSITIONS = ["GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST", "CF"];

const PLAYSTYLES = [
  "Trivela", "Finesse Shot", "Chip Shot", "Power Shot", "Dead Ball", "Power Header",
  "Incisive Pass", "Pinged Pass", "Long Ball Pass", "Tiki Taka", "Whipped Pass",
  "First Touch", "Flair", "Press Proven", "Technical", "Rapid",
  "Relentless", "Anticipate", "Jockey", "Block", "Intercept", "Bruiser", "Slide Tackle",
  "Acrobatic", "Aerial", "Quick Reflexes", "Far Throw", "Footwork", "Rush Out", "Far Reach", "Deflector", "Cross Claimer"
];

interface BuildSubmissionPanelProps {
  discordUserId: string;
}

export function BuildSubmissionPanel({ discordUserId }: BuildSubmissionPanelProps) {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [position, setPosition] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [selectedPlaystyles, setSelectedPlaystyles] = useState<string[]>([]);
  const [selectedPlaystylesPlus, setSelectedPlaystylesPlus] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch existing build profile
  const { data: buildProfile, isLoading } = useQuery({
    queryKey: ["buildProfile", selectedGuildId, discordUserId],
    queryFn: async (): Promise<BuildProfile | null> => {
      if (!selectedGuildId || !discordUserId) return null;

      const { data, error } = await supabase
        .from("player_build_profiles")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("discord_user_id", discordUserId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPosition(data.position || "");
        setHeightCm(data.height_cm?.toString() || "");
        setWeightKg(data.weight_kg?.toString() || "");
        setSelectedPlaystyles(data.playstyles || []);
        setSelectedPlaystylesPlus(data.playstyles_plus || []);
      }

      return data;
    },
    enabled: !!selectedGuildId && !!discordUserId,
  });

  // Save build mutation
  const saveBuildMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId || !discordUserId || !position) {
        throw new Error("Missing required fields");
      }

      const buildData = {
        guild_id: selectedGuildId,
        discord_user_id: discordUserId,
        position,
        height_cm: heightCm ? parseInt(heightCm) : null,
        weight_kg: weightKg ? parseInt(weightKg) : null,
        playstyles: selectedPlaystyles.length > 0 ? selectedPlaystyles : null,
        playstyles_plus: selectedPlaystylesPlus.length > 0 ? selectedPlaystylesPlus : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("player_build_profiles")
        .upsert(buildData, { onConflict: "guild_id,discord_user_id,position" });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Build Saved",
        description: "Your player build has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["buildProfile", selectedGuildId, discordUserId] });
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const togglePlaystyle = (playstyle: string, isPlus: boolean) => {
    if (isPlus) {
      setSelectedPlaystylesPlus((prev) =>
        prev.includes(playstyle) ? prev.filter((p) => p !== playstyle) : [...prev, playstyle]
      );
    } else {
      setSelectedPlaystyles((prev) =>
        prev.includes(playstyle) ? prev.filter((p) => p !== playstyle) : [...prev, playstyle]
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Pro Build Details
          </CardTitle>
          <CardDescription>
            Enter your Pro Clubs build information for accurate rating calculations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Position */}
          <div className="space-y-2">
            <Label>Primary Position</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger>
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {pos}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Height & Weight */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Height (cm)
              </Label>
              <Input
                type="number"
                placeholder="e.g. 185"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                min={150}
                max={210}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Weight className="h-4 w-4" />
                Weight (kg)
              </Label>
              <Input
                type="number"
                placeholder="e.g. 80"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                min={45}
                max={120}
              />
            </div>
          </div>

          {/* Playstyles */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Playstyles
            </Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30 max-h-48 overflow-y-auto">
              {PLAYSTYLES.map((playstyle) => (
                <Badge
                  key={playstyle}
                  variant={selectedPlaystyles.includes(playstyle) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => togglePlaystyle(playstyle, false)}
                >
                  {playstyle}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected: {selectedPlaystyles.length} playstyles
            </p>
          </div>

          {/* Playstyles+ */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Playstyles+ (Enhanced)
            </Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-primary/5 border-primary/20 max-h-48 overflow-y-auto">
              {PLAYSTYLES.map((playstyle) => (
                <Badge
                  key={playstyle}
                  variant={selectedPlaystylesPlus.includes(playstyle) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => togglePlaystyle(playstyle, true)}
                >
                  {playstyle}+
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected: {selectedPlaystylesPlus.length} playstyles+
            </p>
          </div>

          {/* Current Build Status */}
          {buildProfile && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium">Build on file: {buildProfile.position}</p>
                <p className="text-sm text-muted-foreground">
                  {buildProfile.height_cm}cm / {buildProfile.weight_kg}kg •{" "}
                  {(buildProfile.playstyles?.length || 0) + (buildProfile.playstyles_plus?.length || 0)} playstyles
                </p>
              </div>
              {buildProfile.build_rating && (
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {buildProfile.build_rating.toFixed(0)}
                </Badge>
              )}
            </div>
          )}

          {/* Save Button */}
          <Button
            onClick={() => saveBuildMutation.mutate()}
            disabled={!position || saveBuildMutation.isPending}
            className="w-full"
          >
            {saveBuildMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Save Build
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
