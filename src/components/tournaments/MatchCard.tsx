import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Clock, Loader2 } from "lucide-react";

interface Match {
  id: string;
  stage: string;
  group_name?: string;
  match_number: number;
  home_score?: number;
  away_score?: number;
  result_source: string;
  scheduled_at?: string;
  completed_at?: string;
  home_team?: {
    id: string;
    club: { id: string; club_name: string; club_key: string };
  };
  away_team?: {
    id: string;
    club: { id: string; club_name: string; club_key: string };
  };
}

interface MatchCardProps {
  match: Match;
  canSubmitResult: boolean;
  discordUserId: string;
  onResultSubmitted: () => void;
}

export function MatchCard({ match, canSubmitResult, discordUserId, onResultSubmitted }: MatchCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [homeScore, setHomeScore] = useState(match.home_score?.toString() || "");
  const [awayScore, setAwayScore] = useState(match.away_score?.toString() || "");
  const [submitting, setSubmitting] = useState(false);

  const isCompleted = match.result_source !== "pending";

  const handleSubmitResult = async () => {
    if (homeScore === "" || awayScore === "") {
      toast.error("Both scores are required");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-tournaments", {
        body: {
          action: "submit-result",
          match_id: match.id,
          discord_user_id: discordUserId,
          home_score: parseInt(homeScore),
          away_score: parseInt(awayScore),
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      toast.success("Result submitted!");
      setIsEditing(false);
      onResultSubmitted();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit result");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className={`${isCompleted ? "opacity-80" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Home Team */}
          <div className="flex-1 text-right">
            <p className="font-medium truncate">
              {match.home_team?.club?.club_name || "TBD"}
            </p>
          </div>

          {/* Score */}
          <div className="flex items-center gap-2 min-w-[100px] justify-center">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min="0"
                  max="99"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="w-12 text-center p-1 h-8"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="number"
                  min="0"
                  max="99"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="w-12 text-center p-1 h-8"
                />
              </div>
            ) : isCompleted ? (
              <div className="text-xl font-bold">
                {match.home_score} - {match.away_score}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">vs</div>
            )}
          </div>

          {/* Away Team */}
          <div className="flex-1">
            <p className="font-medium truncate">
              {match.away_team?.club?.club_name || "TBD"}
            </p>
          </div>
        </div>

        {/* Match Info & Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            {match.group_name && (
              <Badge variant="outline" className="text-xs">
                Group {match.group_name}
              </Badge>
            )}
            {match.stage !== "group" && (
              <Badge variant="outline" className="text-xs">
                {match.stage.replace(/_/g, " ")}
              </Badge>
            )}
            {isCompleted && (
              <Badge className="text-xs bg-green-500/20 text-green-400">
                <Check className="h-3 w-3 mr-1" />
                {match.result_source}
              </Badge>
            )}
            {!isCompleted && (
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            )}
          </div>

          {canSubmitResult && !isCompleted && (
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSubmitResult} disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Submit
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  Enter Result
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
