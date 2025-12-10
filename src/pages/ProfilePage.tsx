import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PlayerProfileView } from "@/components/player/PlayerProfile";

const mockProfile = {
  discord_user_id: "1",
  discord_username: "ProPlayer",
  discord_avatar: null,
  primary_position: "ST",
  overall_rating: 87,
  games_played: 50,
  wins: 35,
  losses: 10,
  draws: 5,
  win_rate: 70,
  goals: 45,
  assists: 22,
  form_rating: 75,
  reliability_score: 95,
  current_streak: 5,
  streak_type: "win",
  longest_win_streak: 8,
  achievements: [
    { id: "1", achievement_key: "sniper", achievement_name: "Sniper", achievement_icon: "🎯", earned_at: "2024-01-15" },
    { id: "2", achievement_key: "inferno", achievement_name: "On Fire", achievement_icon: "🔥", earned_at: "2024-02-01" },
  ],
  competition_wins: [
    { id: "1", competition_name: "Winter Cup", competition_type: "tournament" as const, tier: "major", team_name: "Team Alpha", placed_at: "2024-01-20", verified: true },
  ],
  position_breakdown: [
    { position: "ST", rating: 87, games_at_position: 40, goals_at_position: 42, assists_at_position: 15 },
    { position: "CAM", rating: 72, games_at_position: 10, goals_at_position: 3, assists_at_position: 7 },
  ],
  chemistry: [
    { partner_id: "2", partner_username: "MidKing", games_together: 30, wins_together: 22, win_rate: 0.73, synergy_score: 85 },
  ],
  rating_tier: { name: "Elite", icon: "🏆" },
};

export default function ProfilePage() {
  return (
    <DashboardLayout>
      <PlayerProfileView player={mockProfile} />
    </DashboardLayout>
  );
}
