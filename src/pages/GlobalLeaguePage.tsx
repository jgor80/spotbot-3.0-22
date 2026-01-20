import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlobalLeaderboard } from "@/components/global-league/GlobalLeaderboard";
import { ClubDiscovery } from "@/components/global-league/ClubDiscovery";
import { ChallengeManager } from "@/components/global-league/ChallengeManager";
import { MyClubProfile } from "@/components/global-league/MyClubProfile";
import { Globe, Trophy, Search, Swords, Building2 } from "lucide-react";

export default function GlobalLeaguePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-hero">
              <Globe className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Global Clubs League</h1>
              <p className="text-muted-foreground">
                Cross-server competition for EA FC Pro Clubs
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="leaderboard" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto gap-1">
            <TabsTrigger value="leaderboard" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Leaderboard</span>
            </TabsTrigger>
            <TabsTrigger value="my-club" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">My Club</span>
            </TabsTrigger>
            <TabsTrigger value="discover" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Discover</span>
            </TabsTrigger>
            <TabsTrigger value="challenges" className="flex items-center gap-2">
              <Swords className="h-4 w-4" />
              <span className="hidden sm:inline">Challenges</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard">
            <GlobalLeaderboard />
          </TabsContent>

          <TabsContent value="my-club">
            <MyClubProfile />
          </TabsContent>

          <TabsContent value="discover">
            <ClubDiscovery />
          </TabsContent>

          <TabsContent value="challenges">
            <ChallengeManager />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
