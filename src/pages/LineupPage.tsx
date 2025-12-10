import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LineupBuilder } from "@/components/lineup/LineupBuilder";

const mockPlayers = [
  { discord_user_id: "1", discord_username: "ProPlayer", overall_rating: 87, games_played: 50, wins: 35, goals: 45, assists: 22, form_rating: 75, primary_position: "ST", rank: 1, rating_tier: { name: "Elite", icon: "🏆" } },
  { discord_user_id: "2", discord_username: "MidKing", overall_rating: 82, games_played: 45, wins: 28, goals: 12, assists: 35, form_rating: 60, primary_position: "CAM", rank: 2, rating_tier: { name: "Gold", icon: "🥇" } },
  { discord_user_id: "3", discord_username: "DefenderX", overall_rating: 78, games_played: 40, wins: 25, goals: 3, assists: 8, form_rating: 55, primary_position: "CB", rank: 3, rating_tier: { name: "Gold", icon: "🥇" } },
  { discord_user_id: "4", discord_username: "GoalKeeper1", overall_rating: 75, games_played: 38, wins: 22, goals: 0, assists: 2, form_rating: 50, primary_position: "GK", rank: 4, rating_tier: { name: "Gold", icon: "🥇" } },
  { discord_user_id: "5", discord_username: "Winger99", overall_rating: 73, games_played: 35, wins: 20, goals: 18, assists: 15, form_rating: 65, primary_position: "LW", rank: 5, rating_tier: { name: "Silver", icon: "🥈" } },
];

export default function LineupPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Lineup Builder</h1>
          <p className="text-muted-foreground">Build and save your team formations</p>
        </div>
        <LineupBuilder availablePlayers={mockPlayers} guildId="demo" createdBy="demo" />
      </div>
    </DashboardLayout>
  );
}
