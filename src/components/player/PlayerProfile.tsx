import { PlayerProfile as PlayerProfileType } from "@/types/player";
import { RatingBadge } from "./RatingBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Trophy, 
  Target, 
  Users, 
  Flame, 
  Snowflake, 
  TrendingUp,
  Award,
  Calendar,
  Star,
  Database,
  CheckCircle2,
  Heart,
  HeartOff,
  ThumbsUp,
  ThumbsDown,
  Minus
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PlayerProfileProps {
  player: PlayerProfileType;
}

export function PlayerProfileView({ player }: PlayerProfileProps) {
  const winRate = player.games_played > 0 
    ? Math.round((player.wins / player.games_played) * 100) 
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-dark p-6 text-primary-foreground">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center text-3xl font-bold">
                {player.discord_username?.charAt(0).toUpperCase() || "?"}
              </div>
              {player.current_streak > 0 && player.streak_type === "win" && (
                <div className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  <Flame className="h-4 w-4" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="font-display text-3xl font-bold">
                {player.discord_username || "Unknown Player"}
              </h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                {player.primary_position && (
                  <Badge variant="secondary">{player.primary_position}</Badge>
                )}
                <Badge variant="outline" className="border-primary-foreground/30">
                  {player.rating_tier.icon} {player.rating_tier.name}
                </Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant={player.baseline_synced ? "default" : "outline"} 
                        className={player.baseline_synced 
                          ? "bg-success/20 text-success border-success/30 gap-1" 
                          : "border-warning/50 text-warning gap-1"
                        }
                      >
                        {player.baseline_synced ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            EA Synced
                          </>
                        ) : (
                          <>
                            <Database className="h-3 w-3" />
                            Pending Sync
                          </>
                        )}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      {player.baseline_synced 
                        ? "EA baseline stats have been imported" 
                        : "EA baseline stats not yet imported"
                      }
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Rating */}
            <RatingBadge rating={player.overall_rating} size="xl" />
          </div>
        </div>

        {/* Stats Row */}
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6">
          <StatBlock label="Games" value={player.games_played} icon={<Target className="h-4 w-4" />} />
          <StatBlock label="Wins" value={player.wins} icon={<Trophy className="h-4 w-4" />} />
          <StatBlock label="Win Rate" value={`${winRate}%`} />
          <StatBlock label="Goals" value={player.goals} />
          <StatBlock label="Assists" value={player.assists} icon={<Users className="h-4 w-4" />} />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="chemistry">Chemistry</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Streaks & Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Current Form
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Form Rating</span>
                    <span className="font-medium">{player.form_rating?.toFixed(0) || "N/A"}</span>
                  </div>
                  <Progress value={player.form_rating || 50} className="h-2" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Current Streak</span>
                  <div className="flex items-center gap-2">
                    {player.streak_type === "win" && <Flame className="h-4 w-4 text-primary" />}
                    {player.streak_type === "loss" && <Snowflake className="h-4 w-4 text-info" />}
                    <span className="font-bold">{player.current_streak}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Longest Win Streak</span>
                  <span className="font-bold">{player.longest_win_streak}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Reliability</span>
                  <span className="font-bold">{player.reliability_score?.toFixed(0) || 100}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Competition Wins */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Competition Wins
                </CardTitle>
              </CardHeader>
              <CardContent>
                {player.competition_wins.length > 0 ? (
                  <div className="space-y-3">
                    {player.competition_wins.slice(0, 5).map((win) => (
                      <div key={win.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          {win.competition_type === "tournament" ? "🏆" : "🏅"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{win.competition_name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{win.tier}</p>
                        </div>
                        {win.verified && (
                          <Badge variant="default" className="shrink-0">Verified</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No competition wins yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Position Ratings</CardTitle>
            </CardHeader>
            <CardContent>
              {player.position_breakdown && player.position_breakdown.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {player.position_breakdown.map((pos) => (
                    <div key={pos.position} className="flex items-center gap-4 p-3 rounded-lg border">
                      <RatingBadge rating={pos.rating} size="md" />
                      <div className="flex-1">
                        <p className="font-medium">{pos.position}</p>
                        <p className="text-xs text-muted-foreground">
                          {pos.games_at_position} games • {pos.goals_at_position}G {pos.assists_at_position}A
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No position data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chemistry" className="space-y-4">
          {/* Vibe Chemistry - Who they prefer/avoid */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Player Preferences
              </CardTitle>
            </CardHeader>
            <CardContent>
              {player.vibe_chemistry && player.vibe_chemistry.length > 0 ? (
                <div className="space-y-3">
                  {player.vibe_chemistry.map((vibe) => (
                    <div key={vibe.partner_id} className="flex items-center gap-4 p-3 rounded-lg border">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                        vibe.vibe_status === "great" ? "bg-success/20 text-success" :
                        vibe.vibe_status === "good" ? "bg-primary/20 text-primary" :
                        vibe.vibe_status === "avoid" ? "bg-destructive/20 text-destructive" :
                        "bg-muted"
                      }`}>
                        {vibe.partner_username?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{vibe.partner_username || "Unknown"}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3 text-success" />
                            {vibe.prefer_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Minus className="h-3 w-3" />
                            {vibe.neutral_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsDown className="h-3 w-3 text-destructive" />
                            {vibe.avoid_count}
                          </span>
                          <span>• {vibe.games_together} games</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={
                          vibe.vibe_status === "great" ? "default" :
                          vibe.vibe_status === "good" ? "secondary" :
                          vibe.vibe_status === "avoid" ? "destructive" :
                          "outline"
                        } className={
                          vibe.vibe_status === "great" ? "bg-success text-success-foreground" :
                          vibe.vibe_status === "good" ? "bg-primary/80" : ""
                        }>
                          {vibe.vibe_status === "great" && "🤝 Great"}
                          {vibe.vibe_status === "good" && "👍 Good"}
                          {vibe.vibe_status === "neutral" && "😐 Neutral"}
                          {vibe.vibe_status === "avoid" && "⚠️ Avoid"}
                        </Badge>
                        {vibe.vibe_score !== null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Vibe: {vibe.vibe_score.toFixed(0)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No vibe data available yet</p>
              )}
            </CardContent>
          </Card>

          {/* Win Rate Chemistry */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Best Partners (Win Rate)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {player.chemistry && player.chemistry.length > 0 ? (
                <div className="space-y-3">
                  {player.chemistry.slice(0, 10).map((chem) => (
                    <div key={chem.partner_id} className="flex items-center gap-4 p-3 rounded-lg border">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-bold">
                        {chem.partner_username?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{chem.partner_username || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {chem.games_together} games together
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{(chem.win_rate * 100).toFixed(0)}%</p>
                        <p className="text-xs text-muted-foreground">Win Rate</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No chemistry data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Achievements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {player.achievements.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {player.achievements.map((achievement) => (
                    <div key={achievement.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <div className="text-2xl">{achievement.achievement_icon}</div>
                      <div>
                        <p className="font-medium">{achievement.achievement_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(achievement.earned_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No achievements yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatBlock({ 
  label, 
  value, 
  icon 
}: { 
  label: string; 
  value: string | number; 
  icon?: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
    </div>
  );
}
