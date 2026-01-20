import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TournamentCard } from "./TournamentCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trophy } from "lucide-react";

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

interface TournamentsListProps {
  guildId: string;
  onCreateNew: () => void;
  onViewTournament: (id: string) => void;
}

export function TournamentsList({ guildId, onCreateNew, onViewTournament }: TournamentsListProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    fetchTournaments();
  }, [guildId]);

  const fetchTournaments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-tournaments", {
        body: { action: "get-tournaments", guild_id: guildId, limit: 100 },
      });

      if (error) throw error;
      setTournaments(data.tournaments || []);
    } catch (err) {
      console.error("Failed to fetch tournaments:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTournaments = tournaments.filter((t) => {
    if (filter === "active") {
      return ["registration", "group_stage", "knockout"].includes(t.status);
    }
    if (filter === "completed") {
      return t.status === "completed";
    }
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Create Tournament
        </Button>
      </div>

      {filteredTournaments.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Tournaments</h3>
          <p className="text-muted-foreground mb-4">
            {filter === "all"
              ? "Create your first tournament to get started"
              : `No ${filter} tournaments found`}
          </p>
          {filter === "all" && (
            <Button onClick={onCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Tournament
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              onView={onViewTournament}
            />
          ))}
        </div>
      )}
    </div>
  );
}
