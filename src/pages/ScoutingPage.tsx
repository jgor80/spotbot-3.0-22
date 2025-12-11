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
import { useMutation } from "@tanstack/react-query";
import { 
  Search, 
  Loader2, 
  Trophy, 
  Users, 
  TrendingUp,
  Swords,
  Target,
  Shield,
  Eye
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClubSearchResult {
  clubId: string;
  name: string;
  region: string | null;
  division: string | null;
  platform: string;
}

interface ScoutReport {
  club: ClubSearchResult;
  matches: Array<{
    matchId: string;
    result: string;
    scoreFor: number;
    scoreAgainst: number;
    opponentName: string;
  }>;
  stats: {
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    goalsFor: number;
    goalsAgainst: number;
    avgGoalsFor: number;
    avgGoalsAgainst: number;
  };
  analysis?: string;
}

export default function ScoutingPage() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  
  const [clubName, setClubName] = useState("");
  const [platform, setPlatform] = useState("ps5");
  const [scoutReport, setScoutReport] = useState<ScoutReport | null>(null);
  
  // Match Preview state
  const [homeClub, setHomeClub] = useState("");
  const [awayClub, setAwayClub] = useState("");
  const [previewPlatform, setPreviewPlatform] = useState("ps5");
  const [matchPreview, setMatchPreview] = useState<string | null>(null);

  // Scout a club mutation
  const scoutMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId) throw new Error("No guild selected");
      
      const { data, error } = await supabase.functions.invoke("scout-club", {
        body: { 
          guild_id: selectedGuildId,
          club_name: clubName, 
          platform 
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Scout failed");
      return data;
    },
    onSuccess: (data) => {
      setScoutReport(data.report);
      toast({
        title: "Scout Report Ready",
        description: `Found ${data.report.stats.gamesPlayed} matches for ${data.report.club.name}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Scout Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Match preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId) throw new Error("No guild selected");
      
      const { data, error } = await supabase.functions.invoke("match-preview", {
        body: { 
          guild_id: selectedGuildId,
          home_club: homeClub,
          away_club: awayClub,
          platform: previewPlatform 
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Preview failed");
      return data;
    },
    onSuccess: (data) => {
      setMatchPreview(data.preview);
      toast({
        title: "Match Preview Ready",
        description: `${homeClub} vs ${awayClub}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Preview Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Eye className="h-8 w-8 text-primary" />
            Scouting Center
          </h1>
          <p className="text-muted-foreground">Scout opponents and prepare for matches</p>
        </div>

        <Tabs defaultValue="scout" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="scout">
              <Search className="h-4 w-4 mr-2" />
              Scout Club
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Swords className="h-4 w-4 mr-2" />
              Match Preview
            </TabsTrigger>
          </TabsList>

          {/* Scout Club Tab */}
          <TabsContent value="scout" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Scout a Club
                </CardTitle>
                <CardDescription>
                  Search for an EA FC Pro Clubs team to analyze their recent performance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2 space-y-2">
                    <Label htmlFor="club-name">Club Name</Label>
                    <Input
                      id="club-name"
                      placeholder="Enter club name to scout"
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && scoutMutation.mutate()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform">Platform</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ps5">PlayStation 5</SelectItem>
                        <SelectItem value="xbsx">Xbox Series X|S</SelectItem>
                        <SelectItem value="pc">PC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button 
                  onClick={() => scoutMutation.mutate()} 
                  disabled={!clubName || scoutMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {scoutMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Scout Club
                </Button>
              </CardContent>
            </Card>

            {/* Scout Report */}
            {scoutReport && (
              <div className="grid gap-6 md:grid-cols-2">
                {/* Club Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      {scoutReport.club.name}
                    </CardTitle>
                    <CardDescription>
                      {scoutReport.club.region && <span>{scoutReport.club.region} • </span>}
                      Division {scoutReport.club.division || "N/A"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <StatCard 
                        icon={<Target className="h-4 w-4" />}
                        label="Games Played"
                        value={scoutReport.stats.gamesPlayed}
                      />
                      <StatCard 
                        icon={<Trophy className="h-4 w-4" />}
                        label="Win Rate"
                        value={`${scoutReport.stats.winRate.toFixed(0)}%`}
                        highlight={scoutReport.stats.winRate >= 60}
                      />
                      <StatCard 
                        icon={<TrendingUp className="h-4 w-4" />}
                        label="Avg Goals For"
                        value={scoutReport.stats.avgGoalsFor.toFixed(1)}
                      />
                      <StatCard 
                        icon={<Shield className="h-4 w-4" />}
                        label="Avg Goals Against"
                        value={scoutReport.stats.avgGoalsAgainst.toFixed(1)}
                      />
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Badge variant="default">{scoutReport.stats.wins}W</Badge>
                      <Badge variant="secondary">{scoutReport.stats.draws}D</Badge>
                      <Badge variant="destructive">{scoutReport.stats.losses}L</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Matches */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Swords className="h-5 w-5" />
                      Recent Matches
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {scoutReport.matches.slice(0, 10).map((match, idx) => (
                          <div 
                            key={match.matchId || idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-lg ${
                                match.result === 'win' ? 'text-primary' : 
                                match.result === 'loss' ? 'text-destructive' : 
                                'text-muted-foreground'
                              }`}>
                                {match.result === 'win' ? '✓' : match.result === 'loss' ? '✗' : '—'}
                              </span>
                              <span className="text-sm truncate max-w-[120px]">
                                {match.opponentName}
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              {match.scoreFor}-{match.scoreAgainst}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* AI Analysis */}
                {scoutReport.analysis && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        Scouting Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{scoutReport.analysis}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Match Preview Tab */}
          <TabsContent value="preview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-5 w-5" />
                  Match Preview
                </CardTitle>
                <CardDescription>
                  Compare two clubs and get an AI-powered match prediction
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="home-club">Home Club</Label>
                    <Input
                      id="home-club"
                      placeholder="Your club name"
                      value={homeClub}
                      onChange={(e) => setHomeClub(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="away-club">Away Club</Label>
                    <Input
                      id="away-club"
                      placeholder="Opponent club name"
                      value={awayClub}
                      onChange={(e) => setAwayClub(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preview-platform">Platform</Label>
                    <Select value={previewPlatform} onValueChange={setPreviewPlatform}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ps5">PlayStation 5</SelectItem>
                        <SelectItem value="xbsx">Xbox Series X|S</SelectItem>
                        <SelectItem value="pc">PC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button 
                  onClick={() => previewMutation.mutate()} 
                  disabled={!homeClub || !awayClub || previewMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Swords className="h-4 w-4 mr-2" />
                  )}
                  Generate Preview
                </Button>
              </CardContent>
            </Card>

            {matchPreview && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    {homeClub} vs {awayClub}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="whitespace-pre-wrap">{matchPreview}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  highlight = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}
