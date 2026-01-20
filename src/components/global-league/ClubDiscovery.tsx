import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Swords, Filter } from "lucide-react";
import { ClubProfileCard } from "./ClubProfileCard";
import { toast } from "sonner";

interface DiscoverableClub {
  id: string;
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
  current_streak: number;
  status: string;
  last_match_at: string | null;
}

const PLATFORMS = [
  { value: "all", label: "All Platforms" },
  { value: "ps5", label: "PlayStation" },
  { value: "xbox-series-xs", label: "Xbox" },
  { value: "pc", label: "PC" },
];

export function ClubDiscovery() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [eloRange, setEloRange] = useState([800, 1600]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClub, setSelectedClub] = useState<DiscoverableClub | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["discover-clubs", platform, search, eloRange],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-global-leaderboard", {
        body: {
          limit: 50,
          platform: platform === "all" ? undefined : platform,
          search: search || undefined,
        },
      });

      if (error) throw error;
      
      // Filter by ELO range client-side for now
      const clubs = (data?.clubs || []).filter(
        (club: DiscoverableClub) => club.elo_rating >= eloRange[0] && club.elo_rating <= eloRange[1]
      );
      
      return clubs as DiscoverableClub[];
    },
  });

  const clubs = data || [];

  const handleChallenge = async (club: DiscoverableClub) => {
    // For now, just show a toast - challenge system will be implemented later
    toast.info(`Challenge ${club.club_name}`, {
      description: "Challenge system coming soon! Use Discord /globalleague challenge for now.",
    });
  };

  const getActivityStatus = (lastMatchAt: string | null) => {
    if (!lastMatchAt) return { label: "New", color: "bg-blue-500/20 text-blue-500" };
    
    const daysSinceMatch = Math.floor(
      (Date.now() - new Date(lastMatchAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceMatch <= 3) return { label: "Active", color: "bg-green-500/20 text-green-500" };
    if (daysSinceMatch <= 7) return { label: "Recent", color: "bg-yellow-500/20 text-yellow-500" };
    if (daysSinceMatch <= 14) return { label: "Quiet", color: "bg-orange-500/20 text-orange-500" };
    return { label: "Inactive", color: "bg-muted text-muted-foreground" };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find Opponents
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clubs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-[200px]"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {showFilters && (
          <CardContent className="border-t pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Platform</label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  ELO Range: {eloRange[0]} - {eloRange[1]}
                </label>
                <Slider
                  value={eloRange}
                  onValueChange={setEloRange}
                  min={600}
                  max={2000}
                  step={50}
                  className="mt-2"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : clubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No clubs found matching your criteria.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clubs.map((club) => {
            const activity = getActivityStatus(club.last_match_at);
            
            return (
              <Card
                key={club.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedClub(selectedClub?.id === club.id ? null : club)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold">{club.club_name}</h3>
                      <p className="text-sm text-muted-foreground">{club.guild_name}</p>
                    </div>
                    <Badge className={activity.color}>{activity.label}</Badge>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div className="text-2xl font-mono font-bold">{club.elo_rating}</div>
                    <Badge variant="outline" className="capitalize">
                      {club.ea_platform.replace("-", " ")}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm mb-4">
                    <span>
                      <span className="text-green-500">{club.wins}W</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-yellow-500">{club.draws}D</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-red-500">{club.losses}L</span>
                    </span>
                    <span className="text-muted-foreground">
                      {club.matches_played} games
                    </span>
                  </div>

                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChallenge(club);
                    }}
                  >
                    <Swords className="h-4 w-4 mr-2" />
                    Challenge
                  </Button>

                  {selectedClub?.id === club.id && (
                    <div className="mt-4 pt-4 border-t">
                      <ClubProfileCard club={club} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
