import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Users, Calendar, Clock, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface Tournament {
  id: string;
  name: string;
  description?: string;
  status: string;
  max_teams: number;
  time_slot?: string;
  starts_at?: string;
  platform?: string;
  tournament_teams?: { count: number }[];
}

interface TournamentCardProps {
  tournament: Tournament;
  onView: (id: string) => void;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-blue-500/20 text-blue-400",
  group_stage: "bg-yellow-500/20 text-yellow-400",
  knockout: "bg-orange-500/20 text-orange-400",
  completed: "bg-green-500/20 text-green-400",
  cancelled: "bg-destructive/20 text-destructive",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  registration: "Registration Open",
  group_stage: "Group Stage",
  knockout: "Knockout",
  completed: "Completed",
  cancelled: "Cancelled",
};

const timeSlotLabels: Record<string, string> = {
  early_bird: "🌅 Early Bird",
  daytime: "☀️ Daytime",
  prime_time: "🌙 Prime Time",
  after_hours: "🌃 After Hours",
};

export function TournamentCard({ tournament, onView }: TournamentCardProps) {
  const teamCount = tournament.tournament_teams?.[0]?.count ?? 0;

  return (
    <Card className="group hover:border-primary/50 transition-colors cursor-pointer" onClick={() => onView(tournament.id)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{tournament.name}</CardTitle>
          </div>
          <Badge className={statusColors[tournament.status] || "bg-muted"}>
            {statusLabels[tournament.status] || tournament.status}
          </Badge>
        </div>
        {tournament.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {tournament.description}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>{teamCount} / {tournament.max_teams} teams</span>
          </div>
          
          {tournament.starts_at && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(tournament.starts_at), "MMM d, yyyy")}</span>
            </div>
          )}
          
          {tournament.time_slot && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>{timeSlotLabels[tournament.time_slot] || tournament.time_slot}</span>
            </div>
          )}
          
          {tournament.platform && (
            <Badge variant="outline" className="text-xs">
              {tournament.platform.toUpperCase()}
            </Badge>
          )}
        </div>
        
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" className="group-hover:text-primary">
            View Details <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
