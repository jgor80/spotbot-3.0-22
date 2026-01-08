import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronUp,
  Trophy,
  Target,
  Users,
  Timer,
  Shield,
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Star
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getArchetypeName, getArchetypeInfo, getArchetypeBadgeClasses, getPositionalCategoryBadgeClasses, formatPositionalCategory } from "@/lib/archetypes";

interface MatchPlayerStat {
  name: string;
  position: string | null;
  archetypeid: string | null;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  passAccuracy: number;
  tackles: number;
  tackleAttempts: number;
  tackleSuccessRate: number;
  dribbles: number;
  interceptions: number;
  clearances: number;
  saves: number;
  redCards: number;
  motm: boolean;
  minutesPlayed: number;
  goalsConceded: number;
}

interface DetailedMatch {
  id: string;
  ea_match_id: string;
  result: string | null;
  score_for: number;
  score_against: number;
  opponent_club_name: string | null;
  match_type: string;
  created_at: string;
  club_key: string;
  players: MatchPlayerStat[];
}

interface MatchDetailViewProps {
  match: DetailedMatch;
}

export function MatchDetailView({ match }: MatchDetailViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const { toast } = useToast();

  const getResultIcon = (result: string | null) => {
    switch (result) {
      case "win":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "loss":
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return <Minus className="h-4 w-4 text-warning" />;
    }
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case "win":
        return <Badge className="bg-success/10 text-success border-success/20">Win</Badge>;
      case "loss":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Loss</Badge>;
      default:
        return <Badge className="bg-warning/10 text-warning border-warning/20">Draw</Badge>;
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return "text-success";
    if (rating >= 7) return "text-warning";
    if (rating >= 6) return "text-accent";
    return "text-destructive";
  };

  const handleAnalyzeMatch = async () => {
    setIsAnalyzing(true);
    try {
      // Prepare player stats for the edge function
      const playerStats = match.players.map(p => ({
        name: p.name,
        position: p.position || 'N/A',
        rating: p.rating,
        goals: p.goals,
        assists: p.assists,
        passesCompleted: p.passesMade,
        passAttempts: p.passAttempts,
        tacklesMade: p.tackles,
        tackleAttempts: p.tackleAttempts,
        interceptions: p.interceptions,
        shots: p.shots,
        saves: p.saves,
        cleanSheet: p.goalsConceded === 0,
        manOfMatch: p.motm,
        redCard: p.redCards > 0,
        minutesPlayed: p.minutesPlayed
      }));

      const { data, error } = await supabase.functions.invoke('match-analysis', {
        body: {
          matchData: {
            result: match.result,
            scoreFor: match.score_for,
            scoreAgainst: match.score_against,
            opponent: match.opponent_club_name,
            matchType: match.match_type,
            playerStats
          }
        }
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.error);
      }

      setAiAnalysis(data.analysis);
      toast({ title: "AI Analysis Complete" });
    } catch (error) {
      console.error('Match analysis error:', error);
      toast({ 
        title: "Analysis Failed", 
        description: (error as Error).message,
        variant: "destructive" 
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getResultIcon(match.result)}
                <div>
                  <p className="font-medium">
                    vs {match.opponent_club_name || "Unknown Club"}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(match.created_at), "MMM d, yyyy HH:mm")}
                    <span className="text-muted-foreground/50">•</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {match.match_type}
                    </Badge>
                    <span className="text-muted-foreground/50">•</span>
                    <Users className="h-3 w-3" />
                    {match.players.length} players
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xl font-bold">
                    {match.score_for} - {match.score_against}
                  </p>
                </div>
                {getResultBadge(match.result)}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Quick Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <Target className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{match.players.reduce((sum, p) => sum + p.goals, 0)}</p>
                <p className="text-xs text-muted-foreground">Goals</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{match.players.reduce((sum, p) => sum + p.assists, 0)}</p>
                <p className="text-xs text-muted-foreground">Assists</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <Trophy className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">
                  {(match.players.reduce((sum, p) => sum + p.rating, 0) / match.players.length).toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">Avg Rating</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <Shield className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{match.players.reduce((sum, p) => sum + p.tackles, 0)}</p>
                <p className="text-xs text-muted-foreground">Tackles</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <Timer className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">
                  {Math.round(match.players.reduce((sum, p) => sum + p.passAccuracy, 0) / match.players.length)}%
                </p>
                <p className="text-xs text-muted-foreground">Pass Acc</p>
              </div>
            </div>

            {/* Full Player Stats Table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-center">Category</TableHead>
                    <TableHead className="text-center">Role</TableHead>
                    <TableHead className="text-center">Rating</TableHead>
                    <TableHead className="text-center">G</TableHead>
                    <TableHead className="text-center">A</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Shots</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Pass %</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Tackles</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">INT</TableHead>
                    <TableHead className="text-center hidden xl:table-cell">Saves</TableHead>
                    <TableHead className="text-center hidden xl:table-cell">🟥</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {match.players.map((player, idx) => (
                    <TableRow key={`${player.name}-${idx}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                                          {player.motm && <Star className="h-4 w-4 text-warning fill-warning" />}
                                          <span className="font-medium">{player.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const category = player.position;
                          if (!category) return <span className="text-muted-foreground">-</span>;
                          return (
                            <Badge className={cn("text-xs capitalize", getPositionalCategoryBadgeClasses(category))}>
                              {formatPositionalCategory(category)}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const info = getArchetypeInfo(player.archetypeid);
                          const name = getArchetypeName(player.archetypeid);
                          if (!name) return <span className="text-muted-foreground">-</span>;
                          return (
                            <Badge className={cn("text-xs", getArchetypeBadgeClasses(info?.category || null))}>
                              {name}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold ${getRatingColor(player.rating)}`}>
                          {player.rating.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {player.goals > 0 ? player.goals : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {player.assists > 0 ? player.assists : "-"}
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        {player.shots > 0 ? player.shots : "-"}
                      </TableCell>
                                      <TableCell className="text-center hidden md:table-cell">
                                        <span className={player.passAccuracy >= 80 ? "text-success" : player.passAccuracy >= 70 ? "text-warning" : "text-destructive"}>
                                          {player.passAccuracy}%
                                        </span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        {player.tackles > 0 ? (
                          <span>
                            {player.tackles}
                            {player.tackleSuccessRate > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({player.tackleSuccessRate}%)
                              </span>
                            )}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        {player.interceptions > 0 ? player.interceptions : "-"}
                      </TableCell>
                      <TableCell className="text-center hidden xl:table-cell">
                        {player.saves > 0 ? player.saves : "-"}
                      </TableCell>
                      <TableCell className="text-center hidden xl:table-cell">
                                        {player.redCards > 0 ? (
                                          <span className="text-destructive font-bold">{player.redCards}</span>
                                        ) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* AI Analysis Button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAnalyzeMatch}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                AI Match Analysis
              </Button>
            </div>

            {/* AI Analysis Result */}
            {aiAnalysis && (
              <div className="rounded-lg bg-muted/40 p-4 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}