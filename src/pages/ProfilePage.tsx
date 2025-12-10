import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PlayerProfileView } from "@/components/player/PlayerProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuild } from "@/contexts/GuildContext";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function ProfilePage() {
  const { selectedGuildId, isLoading: guildLoading } = useGuild();
  const [searchParams, setSearchParams] = useSearchParams();
  const userIdFromUrl = searchParams.get("user");
  
  const [inputUserId, setInputUserId] = useState(userIdFromUrl || "");
  
  const { data: player, isLoading: profileLoading, error } = usePlayerProfile(
    selectedGuildId,
    userIdFromUrl
  );

  const handleSearch = () => {
    if (inputUserId.trim()) {
      setSearchParams({ user: inputUserId.trim() });
    }
  };

  const isLoading = guildLoading || profileLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Player Profile</h1>
          <p className="text-muted-foreground">View detailed player statistics</p>
        </div>

        {!selectedGuildId && !guildLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>No Server Selected</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <p>Select a Discord server from the dropdown above to view profiles.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Search Player</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Discord User ID"
                    value={inputUserId}
                    onChange={(e) => setInputUserId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button onClick={handleSearch}>Search</Button>
                </div>
              </CardContent>
            </Card>

            {userIdFromUrl && (
              isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Failed to load profile. Please check the user ID and try again.
                  </CardContent>
                </Card>
              ) : player ? (
                <PlayerProfileView player={player} />
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Player not found. Make sure the Discord User ID is correct.
                  </CardContent>
                </Card>
              )
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
