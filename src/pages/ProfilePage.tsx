import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PlayerProfileView } from "@/components/player/PlayerProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuild } from "@/contexts/GuildContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { useDiscordLink } from "@/hooks/useDiscordLink";
import { useSearchParams, Link } from "react-router-dom";
import { Loader2, Link as LinkIcon, Unlink, User, Search, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ProfilePage() {
  const { selectedGuildId, isLoading: guildLoading } = useGuild();
  const { user, isLoading: authLoading } = useAuth();
  const { discordLink, isLoading: linkLoading, linkDiscord, unlinkDiscord, isLinking, isUnlinking, linkError } = useDiscordLink();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const userIdFromUrl = searchParams.get("user");
  
  const [inputUserId, setInputUserId] = useState(userIdFromUrl || "");
  const [discordIdInput, setDiscordIdInput] = useState("");
  const [showSearch, setShowSearch] = useState(!!userIdFromUrl);
  
  // Determine which Discord ID to use for profile
  const profileDiscordId = userIdFromUrl || discordLink?.discord_user_id || null;
  
  const { data: player, isLoading: profileLoading, error } = usePlayerProfile(
    selectedGuildId,
    profileDiscordId
  );

  const handleSearch = () => {
    if (inputUserId.trim()) {
      setSearchParams({ user: inputUserId.trim() });
    }
  };

  const handleLinkDiscord = () => {
    if (!discordIdInput.trim()) {
      toast.error("Please enter your Discord User ID");
      return;
    }
    linkDiscord(discordIdInput.trim(), {
      onSuccess: () => {
        toast.success("Discord account linked successfully!");
        setDiscordIdInput("");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  };

  const handleUnlink = () => {
    unlinkDiscord(undefined, {
      onSuccess: () => {
        toast.success("Discord account unlinked");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  };

  const isLoading = guildLoading || profileLoading || authLoading || linkLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Player Profile</h1>
          <p className="text-muted-foreground">View and manage your player statistics</p>
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
            {/* User Account Section */}
            {!user ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Sign In to View Your Profile
                  </CardTitle>
                  <CardDescription>
                    Link your Discord account to automatically load your player profile
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/auth">
                    <Button>Sign In / Sign Up</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : !discordLink ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LinkIcon className="h-5 w-5" />
                    Link Your Discord Account
                  </CardTitle>
                  <CardDescription>
                    Connect your Discord account to view your player profile automatically
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      To find your Discord User ID: Enable Developer Mode in Discord Settings → App Settings → Advanced,
                      then right-click your username and select "Copy User ID"
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter your Discord User ID (e.g., 123456789012345678)"
                      value={discordIdInput}
                      onChange={(e) => setDiscordIdInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLinkDiscord()}
                    />
                    <Button onClick={handleLinkDiscord} disabled={isLinking}>
                      {isLinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                      Link
                    </Button>
                  </div>
                  {linkError && (
                    <p className="text-sm text-destructive">{linkError.message}</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Your Linked Account
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Discord User ID</p>
                      <p className="text-sm text-muted-foreground font-mono">{discordLink.discord_user_id}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleUnlink}
                      disabled={isUnlinking}
                    >
                      {isUnlinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlink className="h-4 w-4 mr-2" />}
                      Unlink
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Search Other Players Section */}
            <Card>
              <CardHeader>
                <CardTitle 
                  className="flex items-center gap-2 cursor-pointer" 
                  onClick={() => setShowSearch(!showSearch)}
                >
                  <Search className="h-5 w-5" />
                  Search Other Players
                </CardTitle>
                <CardDescription>
                  Look up any player by their Discord User ID
                </CardDescription>
              </CardHeader>
              {showSearch && (
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter Discord User ID"
                      value={inputUserId}
                      onChange={(e) => setInputUserId(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <Button onClick={handleSearch}>Search</Button>
                    {userIdFromUrl && (
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setSearchParams({});
                          setInputUserId("");
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Player Profile Display */}
            {profileDiscordId && (
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
                    {discordLink && !userIdFromUrl ? (
                      <>
                        <p>No player data found for your Discord account in this server.</p>
                        <p className="text-sm mt-2">Make sure you've played some games with the club first!</p>
                      </>
                    ) : (
                      "Player not found. Make sure the Discord User ID is correct."
                    )}
                  </CardContent>
                </Card>
              )
            )}
            
            {!profileDiscordId && user && discordLink && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
