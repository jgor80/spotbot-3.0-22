import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Standing {
  id: string;
  group_name: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  qualified: boolean;
  team: {
    id: string;
    club: {
      id: string;
      club_name: string;
      club_key: string;
      elo_rating?: number;
    };
  };
}

interface GroupStandingsProps {
  standings: Standing[];
  qualifyCount?: number;
}

export function GroupStandings({ standings, qualifyCount = 2 }: GroupStandingsProps) {
  // Group standings by group_name
  const groups = standings.reduce<Record<string, Standing[]>>((acc, standing) => {
    const group = standing.group_name;
    if (!acc[group]) acc[group] = [];
    acc[group].push(standing);
    return acc;
  }, {});

  const sortedGroupNames = Object.keys(groups).sort();

  if (sortedGroupNames.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No standings available yet. Tournament may not have started.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {sortedGroupNames.map((groupName) => (
          <div key={groupName} className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-4 py-2 font-semibold">
              Group {groupName}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center w-10">P</TableHead>
                  <TableHead className="text-center w-10">W</TableHead>
                  <TableHead className="text-center w-10">D</TableHead>
                  <TableHead className="text-center w-10">L</TableHead>
                  <TableHead className="text-center w-14">GD</TableHead>
                  <TableHead className="text-center w-12 font-bold">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups[groupName].map((standing) => (
                  <TableRow
                    key={standing.id}
                    className={standing.position <= qualifyCount ? "bg-green-500/10" : ""}
                  >
                    <TableCell className="font-medium">
                      {standing.position}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate max-w-[150px]">
                          {standing.team?.club?.club_name || "TBD"}
                        </span>
                        {standing.qualified && (
                          <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                            Q
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{standing.played}</TableCell>
                    <TableCell className="text-center">{standing.wins}</TableCell>
                    <TableCell className="text-center">{standing.draws}</TableCell>
                    <TableCell className="text-center">{standing.losses}</TableCell>
                    <TableCell className="text-center">
                      <span className={standing.goal_difference > 0 ? "text-green-400" : standing.goal_difference < 0 ? "text-red-400" : ""}>
                        {standing.goal_difference > 0 ? "+" : ""}{standing.goal_difference}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-bold">{standing.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
      
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500/30" />
          <span>Qualified for knockout</span>
        </div>
      </div>
    </div>
  );
}
