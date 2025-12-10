import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const mockPlayers = [
  { discord_user_id: "1", discord_username: "ProPlayer", overall_rating: 87, games_played: 50, wins: 35, goals: 45, assists: 22, form_rating: 75, primary_position: "ST", rank: 1, rating_tier: { name: "Elite", icon: "🏆" } },
  { discord_user_id: "2", discord_username: "MidKing", overall_rating: 82, games_played: 45, wins: 28, goals: 12, assists: 35, form_rating: 60, primary_position: "CAM", rank: 2, rating_tier: { name: "Gold", icon: "🥇" } },
  { discord_user_id: "3", discord_username: "DefenderX", overall_rating: 78, games_played: 40, wins: 25, goals: 3, assists: 8, form_rating: 55, primary_position: "CB", rank: 3, rating_tier: { name: "Gold", icon: "🥇" } },
];

export default function Leaderboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
          <p className="text-muted-foreground">Top players ranked by performance</p>
        </div>

        <Tabs defaultValue="overall">
          <TabsList>
            <TabsTrigger value="overall">Overall</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="assists">Assists</TabsTrigger>
            <TabsTrigger value="wins">Wins</TabsTrigger>
          </TabsList>
          <TabsContent value="overall" className="mt-4">
            <LeaderboardTable players={mockPlayers} />
          </TabsContent>
          <TabsContent value="goals" className="mt-4">
            <LeaderboardTable players={mockPlayers} />
          </TabsContent>
          <TabsContent value="assists" className="mt-4">
            <LeaderboardTable players={mockPlayers} />
          </TabsContent>
          <TabsContent value="wins" className="mt-4">
            <LeaderboardTable players={mockPlayers} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
