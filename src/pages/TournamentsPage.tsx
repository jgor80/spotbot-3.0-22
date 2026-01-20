import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { TournamentsList } from "@/components/tournaments/TournamentsList";
import { CreateTournamentForm } from "@/components/tournaments/CreateTournamentForm";
import { TournamentDetail } from "@/components/tournaments/TournamentDetail";
import { useGuild } from "@/contexts/GuildContext";
import { useAuth } from "@/contexts/AuthContext";

type View = "list" | "create" | "detail";

export default function TournamentsPage() {
  const { selectedGuildId } = useGuild();
  const { user } = useAuth();
  const [view, setView] = useState<View>("list");
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  const discordUserId = user?.user_metadata?.provider_id || user?.id || "";

  const handleViewTournament = (id: string) => {
    setSelectedTournamentId(id);
    setView("detail");
  };

  const handleBack = () => {
    setView("list");
    setSelectedTournamentId(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {view === "list" && (
          <>
            <div>
              <h1 className="text-2xl font-bold">Tournaments</h1>
              <p className="text-muted-foreground">
                BYOT tournaments with group stages and knockout rounds
              </p>
            </div>
            <TournamentsList
              guildId={selectedGuildId || ""}
              onCreateNew={() => setView("create")}
              onViewTournament={handleViewTournament}
            />
          </>
        )}

        {view === "create" && (
          <CreateTournamentForm
            guildId={selectedGuildId || ""}
            discordUserId={discordUserId}
            onSuccess={handleViewTournament}
            onCancel={handleBack}
          />
        )}

        {view === "detail" && selectedTournamentId && (
          <TournamentDetail
            tournamentId={selectedTournamentId}
            guildId={selectedGuildId || ""}
            discordUserId={discordUserId}
            onBack={handleBack}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
