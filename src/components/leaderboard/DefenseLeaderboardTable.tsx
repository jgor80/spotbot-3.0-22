import { LeaderboardPlayer } from "@/types/player";
import { RatingBadge } from "@/components/player/RatingBadge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { getArchetypeName, getArchetypeInfo, getArchetypeBadgeClasses, inferPosition, getPrimaryPosition } from "@/lib/archetypes";

interface DefenseLeaderboardTableProps {
  players: LeaderboardPlayer[];
  onPlayerClick?: (playerId: string) => void;
}

type SortKey = "rank" | "rating" | "games" | "tackles" | "tackle_pct" | "interceptions" | "clearances" | "fouls" | "clean_sheets" | "wins" | "win_rate" | "ga_per_game" | "def_per_game" | "tackles_per_game" | "positions";
type SortDirection = "asc" | "desc";

export function DefenseLeaderboardTable({ players, onPlayerClick }: DefenseLeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("tackles");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Lower is better for rank, fouls, and goals against per game
      setSortDirection(key === "rank" || key === "fouls" || key === "ga_per_game" ? "asc" : "desc");
    }
  };

  const filteredAndSortedPlayers = useMemo(() => {
    const filtered = players.filter((player) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        player.ea_username?.toLowerCase().includes(query) ||
        player.discord_username?.toLowerCase().includes(query)
      );
    });

    return [...filtered].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortKey) {
        case "rank":
          aVal = a.rank;
          bVal = b.rank;
          break;
        case "rating":
          aVal = a.overall_rating;
          bVal = b.overall_rating;
          break;
        case "games":
          aVal = a.games_played;
          bVal = b.games_played;
          break;
        case "tackles":
          aVal = a.tackles || 0;
          bVal = b.tackles || 0;
          break;
        case "tackle_pct":
          aVal = (a.tackle_attempts || 0) > 0 ? ((a.tackles || 0) / a.tackle_attempts!) * 100 : 0;
          bVal = (b.tackle_attempts || 0) > 0 ? ((b.tackles || 0) / b.tackle_attempts!) * 100 : 0;
          break;
        case "ga_per_game":
          aVal = a.games_played > 0 ? (a.goals_conceded || 0) / a.games_played : 0;
          bVal = b.games_played > 0 ? (b.goals_conceded || 0) / b.games_played : 0;
          break;
        case "interceptions":
          aVal = a.interceptions || 0;
          bVal = b.interceptions || 0;
          break;
        case "clearances":
          aVal = a.clearances || 0;
          bVal = b.clearances || 0;
          break;
        case "fouls":
          aVal = a.fouls || 0;
          bVal = b.fouls || 0;
          break;
        case "clean_sheets":
          // Use defender-specific clean sheets if available, fallback to combined
          aVal = a.clean_sheets_def ?? a.clean_sheets ?? 0;
          bVal = b.clean_sheets_def ?? b.clean_sheets ?? 0;
          break;
        case "wins":
          aVal = a.wins || 0;
          bVal = b.wins || 0;
          break;
        case "win_rate":
          aVal = a.win_rate || 0;
          bVal = b.win_rate || 0;
          break;
        case "def_per_game":
          aVal = a.games_played > 0 ? ((a.tackles || 0) + (a.interceptions || 0) + (a.clearances || 0)) / a.games_played : 0;
          bVal = b.games_played > 0 ? ((b.tackles || 0) + (b.interceptions || 0) + (b.clearances || 0)) / b.games_played : 0;
          break;
        case "tackles_per_game":
          aVal = a.games_played > 0 ? (a.tackles || 0) / a.games_played : 0;
          bVal = b.games_played > 0 ? (b.tackles || 0) / b.games_played : 0;
          break;
        case "positions":
          aVal = Object.keys(a.position_counts || {}).length;
          bVal = Object.keys(b.position_counts || {}).length;
          break;
        default:
          return 0;
      }

      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [players, sortKey, sortDirection, searchQuery]);

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const SortableHeader = ({ columnKey, children, className }: { columnKey: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead 
      className={cn("cursor-pointer hover:bg-muted/80 transition-colors select-none", className)}
      onClick={() => handleSort(columnKey)}
    >
      <div className="flex items-center justify-center">
        {children}
        <SortIcon columnKey={columnKey} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search defenders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-card"
        />
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortableHeader columnKey="rank" className="w-12 text-center">#</SortableHeader>
              <TableHead>Player</TableHead>
              <TableHead className="text-center hidden lg:table-cell">Pos</TableHead>
              <TableHead className="text-center hidden lg:table-cell">Build</TableHead>
              <SortableHeader columnKey="rating" className="text-center">Rating</SortableHeader>
              <SortableHeader columnKey="games" className="text-center hidden md:table-cell">Games</SortableHeader>
              <SortableHeader columnKey="tackles" className="text-center bg-primary/10 text-primary font-semibold">Tackles</SortableHeader>
              <SortableHeader columnKey="tackle_pct" className="text-center hidden lg:table-cell">Tkl%</SortableHeader>
              <SortableHeader columnKey="interceptions" className="text-center">Int</SortableHeader>
              <SortableHeader columnKey="clearances" className="text-center hidden lg:table-cell">Clear</SortableHeader>
              <SortableHeader columnKey="clean_sheets" className="text-center hidden md:table-cell">CS</SortableHeader>
              <SortableHeader columnKey="ga_per_game" className="text-center hidden xl:table-cell">GA/G</SortableHeader>
              <SortableHeader columnKey="wins" className="text-center hidden md:table-cell">W/D/L</SortableHeader>
              <SortableHeader columnKey="win_rate" className="text-center hidden lg:table-cell">Win%</SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedPlayers.map((player) => {
              const gaPerGame = player.games_played > 0 ? (player.goals_conceded || 0) / player.games_played : 0;
              const tacklePct = (player.tackle_attempts || 0) > 0 ? ((player.tackles || 0) / player.tackle_attempts!) * 100 : 0;
              
              const archetypeId = player.most_used_archetype;
              const archetypeInfo = getArchetypeInfo(archetypeId);
              const archetypeName = getArchetypeName(archetypeId);
              const inferredPos = inferPosition(archetypeId) || getPrimaryPosition(player.position_counts);

              return (
                <TableRow
                  key={player.discord_user_id}
                  onClick={() => onPlayerClick?.(player.discord_user_id)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted/50",
                    player.rank <= 3 && "bg-primary/5"
                  )}
                >
                  <TableCell className="text-center font-bold">
                    {player.rank <= 3 ? (
                      <span className="text-lg">
                        {player.rank === 1 && "🥇"}
                        {player.rank === 2 && "🥈"}
                        {player.rank === 3 && "🥉"}
                      </span>
                    ) : player.rank}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-medium text-sm">
                        {(player.ea_username || player.discord_username)?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{player.ea_username || player.discord_username || "Unknown"}</p>
                        </div>
                        {player.discord_user_id.startsWith('ea_') && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-amber-500/20 text-amber-500">
                                  <AlertTriangle className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-sm">Unlinked EA account</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center hidden lg:table-cell">
                    {inferredPos ? (
                      <Badge variant="outline" className="text-xs">
                        {inferredPos}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center hidden lg:table-cell">
                    {archetypeName ? (
                      <Badge className={cn("text-xs", getArchetypeBadgeClasses(archetypeInfo?.category || null))}>
                        {archetypeName}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center"><RatingBadge rating={player.overall_rating} size="sm" /></TableCell>
                  <TableCell className="text-center hidden md:table-cell">{player.games_played}</TableCell>
                  <TableCell className="text-center font-bold text-primary">{player.tackles || 0}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{tacklePct.toFixed(0)}%</TableCell>
                  <TableCell className="text-center">{player.interceptions || 0}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{player.clearances || 0}</TableCell>
                  <TableCell className="text-center hidden md:table-cell">{player.clean_sheets_def ?? player.clean_sheets ?? 0}</TableCell>
                  <TableCell className="text-center hidden xl:table-cell">{gaPerGame.toFixed(2)}</TableCell>
                  <TableCell className="text-center hidden md:table-cell text-xs">
                    <span className="text-primary">{player.wins || 0}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{player.draws || 0}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-destructive">{player.losses || 0}</span>
                  </TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{(player.win_rate || 0).toFixed(0)}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
