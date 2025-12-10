import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LineupBuilder } from "@/components/lineup/LineupBuilder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuild } from "@/contexts/GuildContext";
import { useAvailablePlayers } from "@/hooks/useAvailablePlayers";
import { Loader2 } from "lucide-react";

export default function LineupPage() {
  const { selectedGuildId, isLoading: guildLoading } = useGuild();
  const { data: players, isLoading: playersLoading, error } = useAvailablePlayers(selectedGuildId);

  const isLoading = guildLoading || playersLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Lineup Builder</h1>
          <p className="text-muted-foreground">Build and save your team formations</p>
        </div>

        {!selectedGuildId && !guildLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>No Server Selected</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>Select a Discord server from the dropdown above to build lineups.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Failed to load players. Please try again.
            </CardContent>
          </Card>
        ) : players && players.length > 0 ? (
          <LineupBuilder 
            availablePlayers={players} 
            guildId={selectedGuildId!} 
            createdBy="web-user" 
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No players found. Players need to play games before they can be added to lineups.
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
