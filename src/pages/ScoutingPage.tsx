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
import { useQuery } from "@tanstack/react-query";
import { useGuild } from "@/contexts/GuildContext";
import { 
  Search, 
  Loader2, 
  Target, 
  Swords, 
  ClipboardList,
  Trophy,
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";
import { format } from "date-fns";

interface ClubMatch {
  id: string;
  ea_match_id: string;
  result: string | null;
  score_for: number | null;
  score_against: number | null;
  opponent_club_name: string | null;
  match_type: string;
  created_at: string;
}

export default function ScoutingPage() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  
  const [searchClubName, setSearchClubName] = useState("");
  const [searchPlatform, setSearchPlatform] = useState("ps5");
  const [isSearching, setIsSearching] = useState(false);
  const [scoutReport, setScoutReport] = useState<string | null>(null);

  // Fetch recent club matches for the current guild
  const { data: recentMatches, isLoading: matchesLoading } = useQuery({
    queryKey: ["clubMatches", selectedGuildId],
    queryFn: async (): Promise<ClubMatch[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("club_matches")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  const handleScoutClub = async () => {
    if (!searchClubName.trim()) return;
    
    setIsSearching(true);
    setScoutReport(null);
    
    try {
      // This would call your scouting edge function
      toast({
        title: "Scouting Club",
        description: `Searching for ${searchClubName} on ${searchPlatform}...`,
      });
      
      // Simulate scouting report (in real implementation, call edge function)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setScoutReport(`
## Scout Report: ${searchClubName}

### Overview
- **Platform:** ${searchPlatform.toUpperCase()}
- **Division:** Elite Division
- **Recent Form:** WWDWL

### Key Players
1. **PlayerOne** - ST - 78 OVR - Top Scorer
2. **PlayerTwo** - CM - 75 OVR - Playmaker
3. **PlayerThree** - GK - 72 OVR - Shot Stopper

### Tactical Analysis
This team plays an aggressive 4-3-3 formation with quick transitions.
Focus on controlling midfield to limit their counter-attacks.

### Recommendations
- Press high to disrupt their build-up
- Target their weak left-back position
- Be wary of their clinical striker
      `);
      
      toast({
        title: "Scout Report Ready",
        description: `Report generated for ${searchClubName}`,
      });
    } catch (error) {
      toast({
        title: "Scouting Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getResultIcon = (result: string | null) => {
    switch (result) {
      case "win":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "loss":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case "win":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Win</Badge>;
      case "loss":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Loss</Badge>;
      default:
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Draw</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Scouting Center</h1>
          <p className="text-muted-foreground">Scout opponents and analyze match history</p>
        </div>

        <Tabs defaultValue="scout" className="space-y-4">
          <TabsList>
            <TabsTrigger value="scout" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Scout Club
            </TabsTrigger>
            <TabsTrigger value="matches" className="flex items-center gap-2">
              <Swords className="h-4 w-4" />
              Club Matches
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Match Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scout" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Scout a Club
                </CardTitle>
                <CardDescription>
                  Search for any Pro Clubs team and generate a detailed scouting report
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Club name to scout..."
                    value={searchClubName}
                    onChange={(e) => setSearchClubName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScoutClub()}
                    className="flex-1"
                  />
                  <Select value={searchPlatform} onValueChange={setSearchPlatform}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ps5">PS5</SelectItem>
                      <SelectItem value="ps4">PS4</SelectItem>
                      <SelectItem value="xbsx">Xbox X|S</SelectItem>
                      <SelectItem value="xone">Xbox One</SelectItem>
                      <SelectItem value="pc">PC</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleScoutClub} disabled={isSearching || !searchClubName.trim()}>
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {scoutReport && (
                  <div className="mt-6 p-6 rounded-lg bg-muted/50 border">
                    <pre className="whitespace-pre-wrap text-sm font-sans">{scoutReport}</pre>
                  </div>
                )}

                {!scoutReport && !isSearching && (
                  <div className="py-12 text-center text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Enter a club name to generate a scouting report</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="matches" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-5 w-5" />
                  Recent Club Matches
                </CardTitle>
                <CardDescription>
                  View your club's recent match history and results
                </CardDescription>
              </CardHeader>
              <CardContent>
                {matchesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : recentMatches && recentMatches.length > 0 ? (
                  <div className="space-y-3">
                    {recentMatches.map((match) => (
                      <div
                        key={match.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {getResultIcon(match.result)}
                          <div>
                            <p className="font-medium">
                              vs {match.opponent_club_name || "Unknown Club"}
                            </p>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(match.created_at), "MMM d, yyyy")}
                              <span className="text-muted-foreground/50">•</span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {match.match_type}
                              </Badge>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xl font-bold">
                              {match.score_for ?? 0} - {match.score_against ?? 0}
                            </p>
                          </div>
                          {getResultBadge(match.result)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    <Swords className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No club matches recorded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Match Preview
                </CardTitle>
                <CardDescription>
                  Generate a pre-match analysis for upcoming games
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Club</label>
                    <Input placeholder="Enter your club name..." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Opponent Club</label>
                    <Input placeholder="Enter opponent club name..." />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Select defaultValue="ps5">
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ps5">PS5</SelectItem>
                      <SelectItem value="ps4">PS4</SelectItem>
                      <SelectItem value="xbsx">Xbox X|S</SelectItem>
                      <SelectItem value="xone">Xbox One</SelectItem>
                      <SelectItem value="pc">PC</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="flex-1">
                    <Trophy className="h-4 w-4 mr-2" />
                    Generate Match Preview
                  </Button>
                </div>

                <div className="mt-6 py-12 text-center text-muted-foreground border-t">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter both club names to generate a match preview</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
