import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface SessionData {
  id: string;
  club_key: string;
  guild_id: string;
  started_at: string;
  ended_at: string | null;
  player_count: number;
  players: string[];
  match_count: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  total_shots: number;
  total_shots_on_target: number;
  total_passes_made: number;
  total_pass_attempts: number;
  total_tackles: number;
  total_tackle_attempts: number;
  total_assists: number;
  red_cards: number;
  clean_sheets: number;
}

interface SessionCardProps {
  session: SessionData;
  onExpand?: () => void;
  isExpanded?: boolean;
  children?: React.ReactNode;
}

export function SessionCard({ session, onExpand, isExpanded, children }: SessionCardProps) {
  const [expanded, setExpanded] = useState(isExpanded || false);

  const winRate = session.match_count > 0 ? (session.wins / session.match_count) * 100 : 0;
  const drawRate = session.match_count > 0 ? (session.draws / session.match_count) * 100 : 0;
  const lossRate = session.match_count > 0 ? (session.losses / session.match_count) * 100 : 0;
  const shotPct = session.total_shots > 0 
    ? ((session.total_shots_on_target / session.total_shots) * 100).toFixed(0) 
    : "0";
  const passPct = session.total_pass_attempts > 0 
    ? ((session.total_passes_made / session.total_pass_attempts) * 100).toFixed(0) 
    : "0";
  const tacklePct = session.total_tackle_attempts > 0 
    ? ((session.total_tackles / session.total_tackle_attempts) * 100).toFixed(0) 
    : "0";

  // Generate form dots (W=green, D=amber, L=red)
  const formResults: ('W' | 'D' | 'L')[] = [];
  for (let i = 0; i < session.wins; i++) formResults.push('W');
  for (let i = 0; i < session.draws; i++) formResults.push('D');
  for (let i = 0; i < session.losses; i++) formResults.push('L');
  // Sort by result order in actual matches would be ideal, but we don't have that data yet
  
  const handleClick = () => {
    if (onExpand) {
      onExpand();
    }
    setExpanded(!expanded);
  };

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="py-4">
        <div 
          className="cursor-pointer"
          onClick={handleClick}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-lg font-semibold">
                {session.match_count} {session.match_count === 1 ? 'match' : 'matches'}
              </span>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{session.player_count} players</span>
              </div>
            </div>
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-4 mb-4">
            {/* W/D/L */}
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-500">{session.wins}</div>
              <div className="text-xs text-muted-foreground">W</div>
              <div className="text-xs text-muted-foreground">{winRate.toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-500">{session.draws}</div>
              <div className="text-xs text-muted-foreground">D</div>
              <div className="text-xs text-muted-foreground">{drawRate.toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-500">{session.losses}</div>
              <div className="text-xs text-muted-foreground">L</div>
              <div className="text-xs text-muted-foreground">{lossRate.toFixed(0)}%</div>
            </div>

            {/* Goals */}
            <div className="text-center">
              <div className="text-lg font-bold">{session.goals_for}</div>
              <div className="text-xs text-muted-foreground">Goals</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{session.goals_against}</div>
              <div className="text-xs text-muted-foreground">G-ag</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{session.total_assists}</div>
              <div className="text-xs text-muted-foreground">Ass</div>
            </div>

            {/* Percentages */}
            <div className="text-center">
              <div className="text-lg font-bold">{shotPct}%</div>
              <div className="text-xs text-muted-foreground">Shot%</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{passPct}%</div>
              <div className="text-xs text-muted-foreground">Pass%</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{tacklePct}%</div>
              <div className="text-xs text-muted-foreground">Tkl%</div>
            </div>
          </div>

          {/* Form Dots & Date Range */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {formResults.slice(0, 10).map((result, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "w-3 h-3 rounded-full",
                    result === 'W' && "bg-emerald-500",
                    result === 'D' && "bg-amber-500",
                    result === 'L' && "bg-red-500"
                  )}
                />
              ))}
            </div>
            <div className="text-sm text-muted-foreground">
              {format(new Date(session.started_at), "MMM d, yyyy")}
              {session.ended_at && (
                <>
                  {" "}({format(new Date(session.started_at), "HH:mm")} - {format(new Date(session.ended_at), "HH:mm")})
                </>
              )}
            </div>
          </div>

          {/* Additional Stats Row */}
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-6 text-sm text-muted-foreground">
            <span>🧤 CS: <span className="text-foreground font-medium">{session.clean_sheets}</span></span>
            <span>🟥 RC: <span className="text-foreground font-medium">{session.red_cards}</span></span>
            <span>GD: <span className={cn(
              "font-medium",
              session.goals_for - session.goals_against > 0 && "text-emerald-500",
              session.goals_for - session.goals_against < 0 && "text-red-500",
              session.goals_for - session.goals_against === 0 && "text-foreground"
            )}>
              {session.goals_for - session.goals_against > 0 ? '+' : ''}{session.goals_for - session.goals_against}
            </span></span>
          </div>
        </div>

        {/* Expanded Content (matches in this session) */}
        {expanded && children && (
          <div className="mt-4 pt-4 border-t border-border">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
