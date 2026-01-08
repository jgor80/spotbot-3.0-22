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

interface GKLeaderboardTableProps {
  players: LeaderboardPlayer[];
  onPlayerClick?: (playerId: string) => void;
}

type SortKey = "rank" | "rating" | "games" | "saves" | "diving" | "reflex" | "cross" | "parry" | "punch" | "goals_conceded" | "clean_sheets" | "wins" | "win_rate" | "save_pct" | "saves_per_game" | "cs_pct";
type SortDirection = "asc" | "desc";

export function GKLeaderboardTable({ players, onPlayerClick }: GKLeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("saves");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection(key === "rank" || key === "goals_conceded" ? "asc" : "desc");
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

      const totalSavesA = (a.saves || 0);
      const totalSavesB = (b.saves || 0);

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
        case "saves":
          aVal = totalSavesA;
          bVal = totalSavesB;
          break;
        case "diving":
          aVal = a.saves_diving || 0;
          bVal = b.saves_diving || 0;
          break;
        case "reflex":
          aVal = a.saves_reflex || 0;
          bVal = b.saves_reflex || 0;
          break;
        case "cross":
          aVal = a.saves_cross || 0;
          bVal = b.saves_cross || 0;
          break;
        case "parry":
          aVal = a.saves_parry || 0;
          bVal = b.saves_parry || 0;
          break;
        case "punch":
          aVal = a.saves_punch || 0;
          bVal = b.saves_punch || 0;
          break;
        case "goals_conceded":
          aVal = a.goals_conceded || 0;
          bVal = b.goals_conceded || 0;
          break;
        case "clean_sheets":
          aVal = a.clean_sheets || 0;
          bVal = b.clean_sheets || 0;
          break;
        case "wins":
          aVal = a.wins || 0;
          bVal = b.wins || 0;
          break;
        case "win_rate":
          aVal = a.win_rate || 0;
          bVal = b.win_rate || 0;
          break;
        case "save_pct":
          const totalFacedA = totalSavesA + (a.goals_conceded || 0);
          const totalFacedB = totalSavesB + (b.goals_conceded || 0);
          aVal = totalFacedA > 0 ? (totalSavesA / totalFacedA) * 100 : 0;
          bVal = totalFacedB > 0 ? (totalSavesB / totalFacedB) * 100 : 0;
          break;
        case "saves_per_game":
          aVal = a.games_played > 0 ? totalSavesA / a.games_played : 0;
          bVal = b.games_played > 0 ? totalSavesB / b.games_played : 0;
          break;
        case "cs_pct":
          aVal = a.games_played > 0 ? ((a.clean_sheets || 0) / a.games_played) * 100 : 0;
          bVal = b.games_played > 0 ? ((b.clean_sheets || 0) / b.games_played) * 100 : 0;
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
          placeholder="Search goalkeepers..."
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
              <SortableHeader columnKey="rating" className="text-center">Rating</SortableHeader>
              <SortableHeader columnKey="games" className="text-center hidden md:table-cell">Games</SortableHeader>
              <SortableHeader columnKey="saves" className="text-center bg-primary/10 text-primary font-semibold">Saves</SortableHeader>
              <SortableHeader columnKey="diving" className="text-center hidden lg:table-cell">Dive</SortableHeader>
              <SortableHeader columnKey="reflex" className="text-center hidden lg:table-cell">Reflex</SortableHeader>
              <SortableHeader columnKey="cross" className="text-center hidden xl:table-cell">Cross</SortableHeader>
              <SortableHeader columnKey="parry" className="text-center hidden xl:table-cell">Parry</SortableHeader>
              <SortableHeader columnKey="goals_conceded" className="text-center hidden md:table-cell">GA</SortableHeader>
              <SortableHeader columnKey="clean_sheets" className="text-center">CS</SortableHeader>
              <SortableHeader columnKey="wins" className="text-center hidden md:table-cell">W/D/L</SortableHeader>
              <SortableHeader columnKey="win_rate" className="text-center hidden lg:table-cell">Win%</SortableHeader>
              <SortableHeader columnKey="saves_per_game" className="text-center hidden lg:table-cell">Sv/G</SortableHeader>
              <SortableHeader columnKey="save_pct" className="text-center hidden md:table-cell">Save%</SortableHeader>
              <SortableHeader columnKey="cs_pct" className="text-center hidden lg:table-cell">CS%</SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedPlayers.map((player) => {
              const totalSaves = player.saves || 0;
              const totalFaced = totalSaves + (player.goals_conceded || 0);
              const savePct = totalFaced > 0 ? (totalSaves / totalFaced) * 100 : 0;
              const savesPerGame = player.games_played > 0 ? totalSaves / player.games_played : 0;
              const csPct = player.games_played > 0 ? ((player.clean_sheets || 0) / player.games_played) * 100 : 0;

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
                          <Badge variant="outline" className="text-xs mt-0.5">GK</Badge>
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
                  <TableCell className="text-center"><RatingBadge rating={player.overall_rating} size="sm" /></TableCell>
                  <TableCell className="text-center hidden md:table-cell">{player.games_played}</TableCell>
                  <TableCell className="text-center font-bold text-primary">{totalSaves}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{player.saves_diving || 0}</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{player.saves_reflex || 0}</TableCell>
                  <TableCell className="text-center hidden xl:table-cell">{player.saves_cross || 0}</TableCell>
                  <TableCell className="text-center hidden xl:table-cell">{player.saves_parry || 0}</TableCell>
                  <TableCell className="text-center hidden md:table-cell text-destructive">{player.goals_conceded || 0}</TableCell>
                  <TableCell className="text-center">{player.clean_sheets || 0}</TableCell>
                  <TableCell className="text-center hidden md:table-cell text-xs">
                    <span className="text-primary">{player.wins || 0}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{player.draws || 0}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-destructive">{player.losses || 0}</span>
                  </TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{(player.win_rate || 0).toFixed(0)}%</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{savesPerGame.toFixed(1)}</TableCell>
                  <TableCell className="text-center hidden md:table-cell">{savePct.toFixed(0)}%</TableCell>
                  <TableCell className="text-center hidden lg:table-cell">{csPct.toFixed(0)}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
