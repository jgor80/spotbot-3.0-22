import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, TrendingUp, TrendingDown, Minus, Search, Building2, Users } from "lucide-react";
import { ClubProfileCard } from "./ClubProfileCard";

interface GlobalClub {
  id: string;
  rank: number;
  club_name: string;
  guild_name: string;
  ea_platform: string;
  elo_rating: number;
  peak_elo: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  current_streak: number;
  form: string;
  status: string;
}

interface DiscordStanding {
  guild_id: string;
  guild_name: string;
  rank: number;
  club_count: number;
  best_elo: number;
  avg_elo: number;
  best_club_name: string;
  total_matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  clubs: Array<{ club_name: string; elo_rating: number; matches_played: number }>;
}

const PLATFORMS = [
  { value: "all", label: "All Platforms" },
  { value: "ps5", label: "PlayStation" },
  { value: "xbox-series-xs", label: "Xbox" },
  { value: "pc", label: "PC" },
];

export function GlobalLeaderboard() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [view, setView] = useState<"clubs" | "discord">("clubs");
  const [hoveredClub, setHoveredClub] = useState<GlobalClub | null>(null);
  const [expandedDiscord, setExpandedDiscord] = useState<string | null>(null);

  const { data: clubsData, isLoading: clubsLoading } = useQuery({
    queryKey: ["global-leaderboard", "clubs", platform, search],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-global-leaderboard", {
        body: {
          limit: 50,
          offset: 0,
          platform: platform === "all" ? undefined : platform,
          search: search || undefined,
          view: "clubs",
        },
      });

      if (error) throw error;
      return data as { clubs: GlobalClub[]; total: number };
    },
    enabled: view === "clubs",
  });

  const { data: discordData, isLoading: discordLoading } = useQuery({
    queryKey: ["global-leaderboard", "discord", platform, search],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-global-leaderboard", {
        body: {
          limit: 50,
          offset: 0,
          platform: platform === "all" ? undefined : platform,
          search: search || undefined,
          view: "discord",
        },
      });

      if (error) throw error;
      return data as { discords: DiscordStanding[]; total: number };
    },
    enabled: view === "discord",
  });

  const isLoading = view === "clubs" ? clubsLoading : discordLoading;
  const clubs = clubsData?.clubs || [];
  const discords = discordData?.discords || [];

  const getStreakDisplay = (streak: number) => {
    if (streak > 0) {
      return (
        <span className="flex items-center gap-1 text-green-500">
          <TrendingUp className="h-3 w-3" />
          W{streak}
        </span>
      );
    } else if (streak < 0) {
      return (
        <span className="flex items-center gap-1 text-red-500">
          <TrendingDown className="h-3 w-3" />
          L{Math.abs(streak)}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" />
        -
      </span>
    );
  };

  const getFormDisplay = (form: string) => {
    return form.split("").map((result, i) => (
      <span
        key={i}
        className={`inline-block w-5 h-5 rounded text-xs font-bold flex items-center justify-center ${
          result === "W"
            ? "bg-green-500/20 text-green-500"
            : result === "L"
            ? "bg-red-500/20 text-red-500"
            : result === "D"
            ? "bg-yellow-500/20 text-yellow-500"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {result}
      </span>
    ));
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-yellow-500 text-yellow-950">🥇 1st</Badge>;
    if (rank === 2) return <Badge className="bg-gray-400 text-gray-950">🥈 2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-600 text-amber-950">🥉 3rd</Badge>;
    return <span className="text-muted-foreground font-medium">#{rank}</span>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Global Rankings
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as "clubs" | "discord")} className="w-auto">
              <TabsList className="h-9">
                <TabsTrigger value="clubs" className="gap-1.5 text-xs">
                  <Building2 className="h-3.5 w-3.5" />
                  Clubs
                </TabsTrigger>
                <TabsTrigger value="discord" className="gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  Discords
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={view === "clubs" ? "Search clubs..." : "Search servers..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[180px]"
              />
            </div>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : view === "clubs" ? (
          // Club Leaderboard
          clubs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No clubs registered in the Global League yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Rank</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="hidden md:table-cell">Server</TableHead>
                    <TableHead className="text-center">ELO</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">W/D/L</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">GD</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Streak</TableHead>
                    <TableHead className="hidden xl:table-cell">Form</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clubs.map((club) => (
                    <TableRow
                      key={club.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onMouseEnter={() => setHoveredClub(club)}
                      onMouseLeave={() => setHoveredClub(null)}
                    >
                      <TableCell>{getRankBadge(club.rank)}</TableCell>
                      <TableCell>
                        <div className="relative">
                          <div className="font-medium">{club.club_name}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {club.ea_platform.replace("-", " ")}
                          </div>
                          {hoveredClub?.id === club.id && (
                            <div className="absolute left-0 top-full mt-2 z-50">
                              <ClubProfileCard club={club} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {club.guild_name}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono font-bold">{club.elo_rating}</span>
                        {club.elo_rating === club.peak_elo && club.matches_played > 5 && (
                          <span className="ml-1 text-yellow-500">★</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <span className="text-green-500">{club.wins}</span>/
                        <span className="text-yellow-500">{club.draws}</span>/
                        <span className="text-red-500">{club.losses}</span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        <span
                          className={
                            club.goal_difference > 0
                              ? "text-green-500"
                              : club.goal_difference < 0
                              ? "text-red-500"
                              : ""
                          }
                        >
                          {club.goal_difference > 0 ? "+" : ""}
                          {club.goal_difference}
                        </span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        {getStreakDisplay(club.current_streak)}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex gap-0.5">{getFormDisplay(club.form)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : (
          // Discord Aggregate Leaderboard
          discords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No Discord servers with registered clubs yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Rank</TableHead>
                    <TableHead>Discord Server</TableHead>
                    <TableHead className="text-center">Clubs</TableHead>
                    <TableHead className="text-center">Best ELO</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">Avg ELO</TableHead>
                    <TableHead className="text-center hidden md:table-cell">W/D/L</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">GD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discords.map((discord) => (
                    <>
                      <TableRow
                        key={discord.guild_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedDiscord(
                            expandedDiscord === discord.guild_id ? null : discord.guild_id
                          )
                        }
                      >
                        <TableCell>{getRankBadge(discord.rank)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{discord.guild_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Top club: {discord.best_club_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{discord.club_count}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono font-bold">{discord.best_elo}</span>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <span className="font-mono text-muted-foreground">{discord.avg_elo}</span>
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <span className="text-green-500">{discord.wins}</span>/
                          <span className="text-yellow-500">{discord.draws}</span>/
                          <span className="text-red-500">{discord.losses}</span>
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          <span
                            className={
                              discord.goal_difference > 0
                                ? "text-green-500"
                                : discord.goal_difference < 0
                                ? "text-red-500"
                                : ""
                            }
                          >
                            {discord.goal_difference > 0 ? "+" : ""}
                            {discord.goal_difference}
                          </span>
                        </TableCell>
                      </TableRow>
                      {expandedDiscord === discord.guild_id && discord.clubs.length > 1 && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="py-2">
                            <div className="pl-8 space-y-1">
                              <div className="text-xs font-medium text-muted-foreground mb-2">
                                All clubs from {discord.guild_name}:
                              </div>
                              {discord.clubs
                                .sort((a, b) => b.elo_rating - a.elo_rating)
                                .map((club, i) => (
                                  <div
                                    key={club.club_name}
                                    className="flex items-center gap-4 text-sm"
                                  >
                                    <span className="text-muted-foreground w-6">#{i + 1}</span>
                                    <span className="font-medium">{club.club_name}</span>
                                    <span className="font-mono text-muted-foreground">
                                      {club.elo_rating} ELO
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      ({club.matches_played} matches)
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}

        {view === "clubs" && clubsData?.total && clubsData.total > 50 && (
          <div className="text-center text-sm text-muted-foreground mt-4">
            Showing top 50 of {clubsData.total} clubs
          </div>
        )}
        {view === "discord" && discordData?.total && discordData.total > 50 && (
          <div className="text-center text-sm text-muted-foreground mt-4">
            Showing top 50 of {discordData.total} Discord servers
          </div>
        )}
      </CardContent>
    </Card>
  );
}
