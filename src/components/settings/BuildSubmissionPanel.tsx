import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Upload, 
  Loader2,
  Image,
  CheckCircle2,
  Ruler,
  Weight,
  Sparkles,
  User,
  Search
} from "lucide-react";

interface BuildProfile {
  id: string;
  position: string;
  height_cm: number | null;
  weight_kg: number | null;
  playstyles: string[] | null;
  playstyles_plus: string[] | null;
  build_rating: number | null;
  verified: boolean;
  updated_at: string;
}

export function BuildSubmissionPanel() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [discordUserId, setDiscordUserId] = useState("");
  const [searchedUserId, setSearchedUserId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Fetch existing build profiles for the searched user
  const { data: buildProfiles, isLoading } = useQuery({
    queryKey: ["buildProfiles", selectedGuildId, searchedUserId],
    queryFn: async () => {
      if (!selectedGuildId || !searchedUserId) return [];
      
      const { data, error } = await supabase
        .from("player_build_profiles")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("discord_user_id", searchedUserId)
        .order("position");
      
      if (error) throw error;
      return data as BuildProfile[];
    },
    enabled: !!selectedGuildId && !!searchedUserId,
  });
  
  const handleSearch = () => {
    if (discordUserId.trim()) {
      setSearchedUserId(discordUserId.trim());
    }
  };
  
  // Analyze screenshot mutation
  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedGuildId || !searchedUserId) throw new Error("No guild or user selected");
      
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const { data, error } = await supabase.functions.invoke("analyze-build-screenshot", {
        body: {
          guild_id: selectedGuildId,
          discord_user_id: searchedUserId,
          image_base64: base64,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Analysis failed");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Build Analyzed",
        description: `Extracted ${data.build_data.position} build with ${data.build_data.playstyles?.length || 0} playstyles`,
      });
      queryClient.invalidateQueries({ queryKey: ["buildProfiles"] });
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Show preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    
    // Analyze the image
    setIsUploading(true);
    try {
      await analyzeMutation.mutateAsync(file);
    } finally {
      setIsUploading(false);
    }
  };
  
  if (!selectedGuildId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select a Discord server to manage player builds.
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Search Player Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Player Build Submission
          </CardTitle>
          <CardDescription>
            Upload a screenshot of a player's Pro Clubs build to automatically extract stats using AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
      
      {searchedUserId && (
        <>
          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Build Screenshot
              </CardTitle>
              <CardDescription>
                Take a screenshot of your player's build screen showing position, height, weight, and playstyles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg hover:border-primary/50 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="build-screenshot"
                />
                
                {previewUrl ? (
                  <div className="space-y-4 w-full">
                    <img 
                      src={previewUrl} 
                      alt="Build screenshot preview" 
                      className="max-h-64 mx-auto rounded-lg"
                    />
                    {isUploading && (
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Analyzing screenshot with AI...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <label 
                    htmlFor="build-screenshot" 
                    className="flex flex-col items-center cursor-pointer"
                  >
                    <Image className="h-12 w-12 text-muted-foreground mb-3" />
                    <span className="text-sm font-medium">Click to upload screenshot</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      PNG, JPG up to 10MB
                    </span>
                  </label>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Existing Builds */}
          <Card>
            <CardHeader>
              <CardTitle>Saved Builds</CardTitle>
              <CardDescription>
                Player's existing build profiles for this server
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : buildProfiles && buildProfiles.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {buildProfiles.map((build) => (
                    <div 
                      key={build.id}
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-lg font-bold">
                            {build.position}
                          </Badge>
                          {build.verified && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        {build.build_rating && (
                          <Badge className="bg-primary text-primary-foreground">
                            {build.build_rating} OVR
                          </Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        {build.height_cm && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Ruler className="h-3.5 w-3.5" />
                            <span>{build.height_cm} cm</span>
                          </div>
                        )}
                        {build.weight_kg && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Weight className="h-3.5 w-3.5" />
                            <span>{build.weight_kg} kg</span>
                          </div>
                        )}
                      </div>
                      
                      {(build.playstyles?.length || build.playstyles_plus?.length) ? (
                        <div className="space-y-2">
                          {build.playstyles_plus && build.playstyles_plus.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {build.playstyles_plus.map((ps, i) => (
                                <Badge key={i} className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-xs">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  {ps}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {build.playstyles && build.playstyles.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {build.playstyles.map((ps, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {ps}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                      
                      <p className="text-xs text-muted-foreground mt-3">
                        Updated: {new Date(build.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No builds saved yet. Upload a screenshot above to get started.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
