import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

interface Match {
  id: string;
  stage: string;
  round_number: number;
  match_number: number;
  home_score?: number;
  away_score?: number;
  result_source: string;
  winner_team_id?: string;
  home_team?: {
    id: string;
    club: { id: string; club_name: string; club_key: string };
  };
  away_team?: {
    id: string;
    club: { id: string; club_name: string; club_key: string };
  };
}

interface KnockoutBracketProps {
  matches: Match[];
}

const stageOrder = [
  "round_of_64",
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
];

const stageLabels: Record<string, string> = {
  round_of_64: "Round of 64",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter Finals",
  semi_final: "Semi Finals",
  third_place: "3rd Place",
  final: "Final",
};

export function KnockoutBracket({ matches }: KnockoutBracketProps) {
  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Knockout bracket not yet generated.</p>
        <p className="text-sm">Complete the group stage first.</p>
      </div>
    );
  }

  // Group matches by stage
  const matchesByStage = matches.reduce<Record<string, Match[]>>((acc, match) => {
    if (!acc[match.stage]) acc[match.stage] = [];
    acc[match.stage].push(match);
    return acc;
  }, {});

  const stages = stageOrder.filter((s) => matchesByStage[s]?.length > 0);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-6 min-w-max">
        {stages.map((stage) => (
          <div key={stage} className="flex flex-col gap-4 min-w-[220px]">
            <div className="text-center">
              <Badge variant="secondary" className="mb-2">
                {stageLabels[stage] || stage}
              </Badge>
            </div>
            
            <div className="flex flex-col gap-4 justify-around flex-1">
              {matchesByStage[stage]
                .sort((a, b) => a.match_number - b.match_number)
                .map((match) => (
                  <BracketMatch key={match.id} match={match} isFinal={stage === "final"} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatch({ match, isFinal }: { match: Match; isFinal?: boolean }) {
  const isCompleted = match.result_source !== "pending";
  const homeWon = isCompleted && match.winner_team_id === match.home_team?.id;
  const awayWon = isCompleted && match.winner_team_id === match.away_team?.id;

  return (
    <Card className={`${isFinal ? "border-primary" : ""}`}>
      <CardContent className="p-0">
        {/* Home Team */}
        <div
          className={`flex items-center justify-between px-3 py-2 border-b ${
            homeWon ? "bg-green-500/10" : ""
          }`}
        >
          <span className={`text-sm truncate max-w-[140px] ${homeWon ? "font-bold" : ""}`}>
            {match.home_team?.club?.club_name || "TBD"}
          </span>
          <span className={`text-sm font-mono ${homeWon ? "font-bold" : ""}`}>
            {isCompleted ? match.home_score : "-"}
          </span>
        </div>
        
        {/* Away Team */}
        <div
          className={`flex items-center justify-between px-3 py-2 ${
            awayWon ? "bg-green-500/10" : ""
          }`}
        >
          <span className={`text-sm truncate max-w-[140px] ${awayWon ? "font-bold" : ""}`}>
            {match.away_team?.club?.club_name || "TBD"}
          </span>
          <span className={`text-sm font-mono ${awayWon ? "font-bold" : ""}`}>
            {isCompleted ? match.away_score : "-"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
