import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface MatchPlayerStat {
  name: string;
  position: string | null;
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

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return "text-green-500";
    if (rating >= 7) return "text-yellow-500";
    if (rating >= 6) return "text-orange-500";
    return "text-red-500";
  };

  const handleAnalyzeMatch = async () => {
    setIsAnalyzing(true);
    try {
      const prompt = `Analyze this single Pro Clubs match in detail:

MATCH: ${match.result?.toUpperCase() || 'DRAW'} ${match.score_for}-${match.score_against} vs ${match.opponent_club_name || 'Unknown'}
DATE: ${format(new Date(match.created_at), "PPP")}
TYPE: ${match.match_type}

PLAYER PERFORMANCES:
${match.players.map(p => `- ${p.name} (${p.position || 'N/A'}): ${p.rating.toFixed(1)} rating | ${p.goals}G ${p.assists}A | ${p.passesMade}/${p.passAttempts} passes (${p.passAccuracy}%) | ${p.tackles} tackles (${p.tackleSuccessRate}%) | ${p.motm ? '⭐ MOTM' : ''}`).join('\n')}

Provide a brief match analysis:
1. **MVP**: Who was the best player and why?
2. **Key Moments**: What likely decided this game?
3. **Standouts**: Who exceeded expectations?
4. **Improvements**: What could be better next time?`;

      const { data, error } = await supabase.functions.invoke("recent-results", {
        body: {
          guild_id: "analysis",
          window_size: 1,
          include_ai_summary: false
        }
      });

      // Use OpenAI directly for single match analysis
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a Pro Clubs match analyst. Be concise and specific." },
            { role: "user", content: prompt }
          ],
          max_tokens: 500
        })
      });

      // Fallback: just show a summary based on stats
      const mvp = match.players.reduce((best, current) => 
        current.rating > best.rating ? current : best
      , match.players[0]);

      const topScorer = match.players.filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals)[0];
      const topAssister = match.players.filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists)[0];

      setAiAnalysis(`## Match Summary

**MVP**: ${mvp?.name || 'N/A'} with a ${mvp?.rating.toFixed(1)} rating${mvp?.motm ? ' (Man of the Match)' : ''}

**Key Stats**:
${topScorer ? `- **Top Scorer**: ${topScorer.name} (${topScorer.goals} goals)` : '- No goals scored'}
${topAssister ? `- **Playmaker**: ${topAssister.name} (${topAssister.assists} assists)` : ''}
- **Total Shots**: ${match.players.reduce((sum, p) => sum + p.shots, 0)}
- **Pass Accuracy**: ${Math.round(match.players.reduce((sum, p) => sum + p.passAccuracy, 0) / match.players.length)}% avg

**Defensive Performance**:
- **Tackles**: ${match.players.reduce((sum, p) => sum + p.tackles, 0)} successful
- **Interceptions**: ${match.players.reduce((sum, p) => sum + p.interceptions, 0)}
- **Clearances**: ${match.players.reduce((sum, p) => sum + p.clearances, 0)}`);

      toast({ title: "Analysis Complete" });
    } catch (error) {
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
                    <TableHead className="text-center">Pos</TableHead>
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
                          {player.motm && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                          <span className="font-medium">{player.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">
                          {player.position || "N/A"}
                        </Badge>
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
                        <span className={player.passAccuracy >= 80 ? "text-green-500" : player.passAccuracy >= 70 ? "text-yellow-500" : "text-red-500"}>
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
                          <span className="text-red-500 font-bold">{player.redCards}</span>
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