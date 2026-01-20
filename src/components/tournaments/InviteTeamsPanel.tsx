import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Search, Send, Users } from "lucide-react";

interface Club {
  id: string;
  club_name: string;
  club_key: string;
  ea_platform: string;
  elo_rating?: number;
}

interface InviteTeamsPanelProps {
  tournamentId: string;
  guildId: string;
  discordUserId: string;
  invitedClubIds: string[];
  onInvited: () => void;
}

export function InviteTeamsPanel({
  tournamentId,
  guildId,
  discordUserId,
  invitedClubIds,
  onInvited,
}: InviteTeamsPanelProps) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchClubs();
  }, []);

  const fetchClubs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-global-league", {
        body: { action: "get-clubs", limit: 200 },
      });

      if (error) throw error;
      setClubs(data.clubs || []);
    } catch (err) {
      console.error("Failed to fetch clubs:", err);
    } finally {
      setLoading(false);
    }
  };

  const availableClubs = clubs.filter(
    (club) => !invitedClubIds.includes(club.id)
  );

  const filteredClubs = availableClubs.filter((club) =>
    club.club_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (clubId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(clubId)) {
      newSelected.delete(clubId);
    } else {
      newSelected.add(clubId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredClubs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClubs.map((c) => c.id)));
    }
  };

  const handleInvite = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one team to invite");
      return;
    }

    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-tournaments", {
        body: {
          action: "invite-teams-bulk",
          tournament_id: tournamentId,
          club_ids: Array.from(selectedIds),
          invited_by_discord_id: discordUserId,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      toast.success(`Invited ${data.invited_count} teams!`);
      setSelectedIds(new Set());
      onInvited();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite teams");
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Invite Teams
        </CardTitle>
      </CardHeader>
      <CardContent>
        {availableClubs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            All registered clubs have already been invited
          </p>
        ) : (
          <>
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clubs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleSelectAll}
                disabled={filteredClubs.length === 0}
              >
                {selectedIds.size === filteredClubs.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
              {filteredClubs.map((club) => (
                <label
                  key={club.id}
                  className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedIds.has(club.id)}
                    onCheckedChange={() => handleToggle(club.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{club.club_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {club.ea_platform.toUpperCase()} • ELO: {club.elo_rating || 1200}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} team{selectedIds.size !== 1 ? "s" : ""} selected
                </span>
                <Button onClick={handleInvite} disabled={inviting}>
                  {inviting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Invites
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
