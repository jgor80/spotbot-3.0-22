import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { ManagerEvaluationForm } from "@/components/squadiq/ManagerEvaluationForm";
import {
  MessageSquare,
  Loader2,
  Users,
  Trophy,
  Swords,
  Target,
  Calendar,
  Settings,
  UserCheck,
  BarChart3,
  Gamepad2,
  Link,
  RefreshCw,
  Eye,
  Sparkles,
  Bolt,
  Twitch,
  ClipboardList,
  Shield,
  MapPin,
  Zap,
  Award,
  Play,
  Search,
  Crown
} from "lucide-react";

interface CommandOutput {
  title: string;
  content: string;
  timestamp: Date;
}

export default function SquadIQPanel() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  
  const [commandOutputs, setCommandOutputs] = useState<CommandOutput[]>([]);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  
  // Input states for commands that need parameters
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [eaGamertag, setEaGamertag] = useState("");
  const [searchPlatform, setSearchPlatform] = useState("ps5");
  const [clubSearchName, setClubSearchName] = useState("");
  const [twitchUsername, setTwitchUsername] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [competitionName, setCompetitionName] = useState("");
  
  // Fetch players for selection
  const { data: leaderboardPlayers } = useLeaderboard(
    selectedGuildId,
    "overall",
    undefined,
    200,
    undefined,
    undefined,
    "games"
  );

  const players = (leaderboardPlayers || []).map(p => ({
    discord_user_id: p.discord_user_id,
    discord_username: p.discord_username || null,
    ea_username: p.ea_username || null,
    overall_rating: p.overall_rating,
  }));

  const appendOutput = (title: string, content: string) => {
    setCommandOutputs(prev => [
      { title, content, timestamp: new Date() },
      ...prev
    ].slice(0, 10));
  };

  const runCommand = async (
    commandName: string, 
    handler: () => Promise<void>
  ) => {
    if (!selectedGuildId) {
      toast({
        title: "Select a Server",
        description: "Choose a server first to run commands",
        variant: "destructive",
      });
      return;
    }
    
    setActiveCommand(commandName);
    try {
      await handler();
    } catch (error) {
      toast({
        title: `${commandName} Failed`,
        description: (error as Error).message,
        variant: "destructive",
      });
      appendOutput(`❌ ${commandName}`, `Error: ${(error as Error).message}`);
    } finally {
      setActiveCommand(null);
    }
  };

  // === SCOUTING COMMANDS ===
  const handleScoutPlayer = async () => {
    if (!selectedPlayerId) {
      toast({ title: "Select a Player", description: "Choose a player to scout", variant: "destructive" });
      return;
    }
    await runCommand("Scout Player", async () => {
      const { data, error } = await supabase.functions.invoke("scout-player", {
        body: { guild_id: selectedGuildId, player_id: selectedPlayerId }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      const player = players.find(p => p.discord_user_id === selectedPlayerId);
      appendOutput(
        "🔍 Scout Player",
        `Report generated for ${player?.discord_username || selectedPlayerId}. Rating: ${data.player_data?.overall?.rating?.toFixed?.(1) || "N/A"}`
      );
      toast({ title: "Scout Report Ready", description: "AI analysis complete" });
    });
  };

  const handleScoutEaGamertag = async () => {
    if (!eaGamertag.trim()) {
      toast({ title: "Enter Gamertag", description: "Provide an EA username to scout", variant: "destructive" });
      return;
    }
    await runCommand("Scout EA Gamertag", async () => {
      const { data, error } = await supabase.functions.invoke("scout-player", {
        body: { ea_username: eaGamertag.trim(), ea_platform: searchPlatform }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      appendOutput(
        "🎮 Scout EA Player",
        `Report for ${eaGamertag} (${searchPlatform.toUpperCase()}). Rating: ${data.player_data?.overall?.rating?.toFixed?.(1) || "N/A"} | Games: ${data.player_data?.overall?.games_played || 0}`
      );
      toast({ title: "EA Scout Complete", description: `Pulled stats for ${eaGamertag}` });
    });
  };

  const handleScoutClub = async () => {
    if (!clubSearchName.trim()) {
      toast({ title: "Enter Club Name", description: "Provide a club name to scout", variant: "destructive" });
      return;
    }
    await runCommand("Scout Club", async () => {
      const { data, error } = await supabase.functions.invoke("scout-opponent-club", {
        body: { club_name: clubSearchName.trim(), platform: searchPlatform }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      appendOutput(
        "🏟️ Scout Club",
        `Found ${clubSearchName} on ${searchPlatform.toUpperCase()}. ${data.message || "Club data retrieved."}`
      );
      toast({ title: "Club Scouted", description: `Report ready for ${clubSearchName}` });
    });
  };

  // === LEADERBOARD & STATS COMMANDS ===
  const handleRecentResults = async () => {
    await runCommand("Recent Results", async () => {
      const { data, error } = await supabase.functions.invoke("recent-results", {
        body: { guild_id: selectedGuildId, window_size: 5 }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      const goalsLeader = data.player_highlights?.goals?.[0];
      const ratingLeader = data.player_highlights?.ratings?.[0];
      
      appendOutput(
        "📊 Recent Results",
        `Last ${data.window_size} matches. ${ratingLeader ? `${ratingLeader.name} leads AMR (${ratingLeader.avg.toFixed(1)})` : "No data"}. ${goalsLeader ? `${goalsLeader.name} tops goals (${goalsLeader.goals})` : ""}`
      );
      toast({ title: "Results Loaded", description: "Recent match recap ready" });
    });
  };

  const handleLeaderboard = async (type: string) => {
    await runCommand(`${type} Leaderboard`, async () => {
      const { data, error } = await supabase.functions.invoke("get-leaderboard", {
        body: { guild_id: selectedGuildId, type, limit: 10 }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      const entries = data.entries || [];
      const lines = entries.slice(0, 5).map((e: any) => 
        `${e.rank}. ${e.ea_username || e.discord_username || "Unknown"}`
      ).join(" | ");
      
      appendOutput(
        `🏆 ${type.charAt(0).toUpperCase() + type.slice(1)} Leaderboard`,
        lines || "No entries yet"
      );
      toast({ title: "Leaderboard Ready", description: `${type} rankings loaded` });
    });
  };

  // === PROFILE COMMANDS ===
  const handlePlayerProfile = async () => {
    if (!selectedPlayerId) {
      toast({ title: "Select a Player", description: "Choose a player to view", variant: "destructive" });
      return;
    }
    await runCommand("Player Profile", async () => {
      const { data, error } = await supabase.functions.invoke("get-player-profile", {
        body: { guild_id: selectedGuildId, discord_user_id: selectedPlayerId }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      const p = data.profile || {};
      appendOutput(
        "👤 Player Profile",
        `${p.discord_username || selectedPlayerId} | Rating: ${p.overall_rating?.toFixed(1) || "N/A"} | Pos: ${p.primary_position || "?"} | Games: ${p.games_played || 0} | Win%: ${((p.win_rate || 0) * 100).toFixed(0)}%`
      );
      toast({ title: "Profile Loaded", description: "Player data retrieved" });
    });
  };

  // === EA INTEGRATION COMMANDS ===
  const handleSyncEA = async () => {
    await runCommand("Sync EA Stats", async () => {
      const { data, error } = await supabase.functions.invoke("sync-ea-stats", {
        body: { guild_id: selectedGuildId }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      appendOutput(
        "🔄 EA Sync",
        `Synced ${data.matches_synced || 0} matches, ${data.players_updated || 0} players updated.`
      );
      toast({ title: "EA Sync Complete", description: "Stats updated from EA servers" });
    });
  };

  const handleCalculateRatings = async () => {
    await runCommand("Calculate Ratings", async () => {
      const { data, error } = await supabase.functions.invoke("calculate-ratings", {
        body: { guild_id: selectedGuildId }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      appendOutput(
        "📈 Ratings Calculated",
        `Updated ratings for ${data.players_updated || 0} players.`
      );
      toast({ title: "Ratings Updated", description: "Player ratings recalculated" });
    });
  };

  // === LINEUP COMMANDS ===
  const handleSuggestLineup = async () => {
    await runCommand("Suggest Lineup", async () => {
      const { data, error } = await supabase.functions.invoke("suggest-optimal-lineup", {
        body: { guild_id: selectedGuildId }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      appendOutput(
        "⚽ Optimal Lineup",
        data.message || "Lineup suggestion generated based on available players and position preferences."
      );
      toast({ title: "Lineup Suggested", description: "AI-optimized lineup ready" });
    });
  };

  // === TWITCH COMMANDS ===
  const handleTwitchInfo = (action: "setup" | "list" | "remove") => {
    const messages: Record<string, string> = {
      setup: `Use in Discord: /twitchsetup username:${twitchUsername || "<streamer>"} channel:#channel\nSets up live notifications for a Twitch streamer.`,
      list: "Use in Discord: /twitchlist\nShows all configured Twitch notification channels.",
      remove: `Use in Discord: /twitchremove username:${twitchUsername || "<streamer>"}\nRemoves live notifications for a streamer.`
    };
    
    appendOutput(
      `📺 Twitch ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      messages[action]
    );
  };

  // === COMPETITION COMMANDS ===
  const handleClaimWin = () => {
    appendOutput(
      "🏆 Claim Win",
      `Use in Discord: /claimwin competition:"${competitionName || "<name>"}" type:tournament tier:major\nSubmits a competition win for verification.`
    );
  };

  // === EVENT COMMANDS ===
  const handleCreateEvent = () => {
    appendOutput(
      "📅 Create Event",
      `Use in Discord: /event title:"${eventTitle || "<title>"}" date:"${eventDate || "2024-01-15 20:00"}" type:league\nCreates an availability event for the team.`
    );
  };

  if (!selectedGuildId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Please select a server to access SquadIQ Panel.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            SquadIQ Command Center
          </h1>
          <p className="text-muted-foreground">
            Run all Discord bot commands from one place — no slash commands needed
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Command Categories */}
          <div className="lg:col-span-2 space-y-4">
            <Accordion type="multiple" defaultValue={["scouting", "stats"]} className="space-y-2">
              
              {/* SCOUTING */}
              <AccordionItem value="scouting" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-orange-500" />
                    <span className="font-semibold">Scouting & Intel</span>
                    <Badge variant="secondary" className="ml-2">5 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  {/* Scout Guild Player */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Scout Server Player</label>
                    <div className="flex gap-2">
                      <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select player..." />
                        </SelectTrigger>
                        <SelectContent>
                          {players.map(p => (
                            <SelectItem key={p.discord_user_id} value={p.discord_user_id}>
                              {p.discord_username || p.ea_username || p.discord_user_id} ({p.overall_rating.toFixed(1)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        onClick={handleScoutPlayer}
                        disabled={!selectedPlayerId || activeCommand === "Scout Player"}
                        className="gap-2"
                      >
                        {activeCommand === "Scout Player" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Scout
                      </Button>
                    </div>
                  </div>

                  {/* Scout EA Gamertag */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Scout EA Gamertag</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="EA Username..." 
                        value={eaGamertag}
                        onChange={e => setEaGamertag(e.target.value)}
                        className="flex-1"
                      />
                      <Select value={searchPlatform} onValueChange={setSearchPlatform}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ps5">PS5</SelectItem>
                          <SelectItem value="xbox-series-xs">Xbox</SelectItem>
                          <SelectItem value="pc">PC</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        onClick={handleScoutEaGamertag}
                        disabled={activeCommand === "Scout EA Gamertag"}
                        variant="secondary"
                        className="gap-2"
                      >
                        {activeCommand === "Scout EA Gamertag" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gamepad2 className="h-4 w-4" />}
                        Scout
                      </Button>
                    </div>
                  </div>

                  {/* Scout Club */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Scout Opponent Club</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Club name..." 
                        value={clubSearchName}
                        onChange={e => setClubSearchName(e.target.value)}
                        className="flex-1"
                      />
                      <Button 
                        onClick={handleScoutClub}
                        disabled={activeCommand === "Scout Club"}
                        variant="outline"
                        className="gap-2"
                      >
                        {activeCommand === "Scout Club" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Scout Club
                      </Button>
                    </div>
                  </div>

                  {/* Profile View */}
                  <Button 
                    onClick={handlePlayerProfile}
                    disabled={!selectedPlayerId || activeCommand === "Player Profile"}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    {activeCommand === "Player Profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    View Player Profile
                  </Button>
                </AccordionContent>
              </AccordionItem>

              {/* STATS & LEADERBOARDS */}
              <AccordionItem value="stats" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    <span className="font-semibold">Stats & Leaderboards</span>
                    <Badge variant="secondary" className="ml-2">6 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      onClick={handleRecentResults}
                      disabled={activeCommand === "Recent Results"}
                      variant="outline"
                      className="gap-2 justify-start"
                    >
                      {activeCommand === "Recent Results" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bolt className="h-4 w-4" />}
                      Recent Results
                    </Button>
                    <Button 
                      onClick={() => handleLeaderboard("overall")}
                      disabled={activeCommand === "overall Leaderboard"}
                      variant="outline"
                      className="gap-2 justify-start"
                    >
                      <Trophy className="h-4 w-4" />
                      Overall Leaderboard
                    </Button>
                    <Button 
                      onClick={() => handleLeaderboard("goals")}
                      disabled={activeCommand === "goals Leaderboard"}
                      variant="outline"
                      className="gap-2 justify-start"
                    >
                      <Swords className="h-4 w-4" />
                      Goals Leaders
                    </Button>
                    <Button 
                      onClick={() => handleLeaderboard("assists")}
                      disabled={activeCommand === "assists Leaderboard"}
                      variant="outline"
                      className="gap-2 justify-start"
                    >
                      <Users className="h-4 w-4" />
                      Assists Leaders
                    </Button>
                    <Button 
                      onClick={() => handleLeaderboard("form")}
                      disabled={activeCommand === "form Leaderboard"}
                      variant="outline"
                      className="gap-2 justify-start"
                    >
                      <Zap className="h-4 w-4" />
                      In-Form Players
                    </Button>
                    <Button 
                      onClick={() => handleLeaderboard("win_rate")}
                      disabled={activeCommand === "win_rate Leaderboard"}
                      variant="outline"
                      className="gap-2 justify-start"
                    >
                      <Award className="h-4 w-4" />
                      Win Rate Leaders
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* EA INTEGRATION */}
              <AccordionItem value="ea" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Gamepad2 className="h-5 w-5 text-green-500" />
                    <span className="font-semibold">EA FC Integration</span>
                    <Badge variant="secondary" className="ml-2">4 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      onClick={handleSyncEA}
                      disabled={activeCommand === "Sync EA Stats"}
                      variant="secondary"
                      className="gap-2 justify-start"
                    >
                      {activeCommand === "Sync EA Stats" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Sync EA Stats
                    </Button>
                    <Button 
                      onClick={handleCalculateRatings}
                      disabled={activeCommand === "Calculate Ratings"}
                      variant="secondary"
                      className="gap-2 justify-start"
                    >
                      {activeCommand === "Calculate Ratings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                      Recalculate Ratings
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Discord-only: /setclub, /linkea, /forcelink, /reviewlinks
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* LINEUP & DRAFTS */}
              <AccordionItem value="lineup" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-purple-500" />
                    <span className="font-semibold">Lineup & Drafts</span>
                    <Badge variant="secondary" className="ml-2">5 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <Button 
                    onClick={handleSuggestLineup}
                    disabled={activeCommand === "Suggest Lineup"}
                    className="w-full gap-2"
                  >
                    {activeCommand === "Suggest Lineup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    AI Suggest Optimal Lineup
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Discord-only: /draft, /draftpick, /draftresult, /draftpanel
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* SPOT MANAGEMENT */}
              <AccordionItem value="spots" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-yellow-500" />
                    <span className="font-semibold">Spot Management</span>
                    <Badge variant="secondary" className="ml-2">8 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">
                    Spot management commands require Discord voice channel context:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 border rounded bg-muted/50">/spotpanel - Create spot panel</div>
                    <div className="p-2 border rounded bg-muted/50">/spots - Show read-only board</div>
                    <div className="p-2 border rounded bg-muted/50">/vcspots - VC-linked panel</div>
                    <div className="p-2 border rounded bg-muted/50">/whoisplaying - VC players</div>
                    <div className="p-2 border rounded bg-muted/50">/myprefs - Your preferences</div>
                    <div className="p-2 border rounded bg-muted/50">/pospanel - Preference panel</div>
                    <div className="p-2 border rounded bg-muted/50">/autoassign - Toggle auto</div>
                    <div className="p-2 border rounded bg-muted/50">/syncprefs - Sync from roles</div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* EVENTS & AVAILABILITY */}
              <AccordionItem value="events" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-cyan-500" />
                    <span className="font-semibold">Events & Availability</span>
                    <Badge variant="secondary" className="ml-2">4 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Event Info (Discord command helper)</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Event title..." 
                        value={eventTitle}
                        onChange={e => setEventTitle(e.target.value)}
                        className="flex-1"
                      />
                      <Input 
                        placeholder="Date (2024-01-15 20:00)..." 
                        value={eventDate}
                        onChange={e => setEventDate(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                    <Button onClick={handleCreateEvent} variant="outline" className="w-full gap-2">
                      <Calendar className="h-4 w-4" />
                      Show Event Command
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Discord-only: /available, /attendance, /sendreminders
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* COMPETITIONS */}
              <AccordionItem value="competitions" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <span className="font-semibold">Competitions</span>
                    <Badge variant="secondary" className="ml-2">3 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Claim Win (Discord command helper)</label>
                    <Input 
                      placeholder="Competition name..." 
                      value={competitionName}
                      onChange={e => setCompetitionName(e.target.value)}
                    />
                    <Button onClick={handleClaimWin} variant="outline" className="w-full gap-2">
                      <Trophy className="h-4 w-4" />
                      Show Claim Command
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Discord-only: /verifywin, /pendingwins
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* STREAMING */}
              <AccordionItem value="streaming" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Twitch className="h-5 w-5 text-purple-500" />
                    <span className="font-semibold">Streaming Controls</span>
                    <Badge variant="secondary" className="ml-2">3 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Twitch Username</label>
                    <Input 
                      placeholder="Twitch streamer username..." 
                      value={twitchUsername}
                      onChange={e => setTwitchUsername(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      onClick={() => handleTwitchInfo("setup")}
                      variant="outline"
                      className="gap-2 justify-start border-purple-500/30 hover:bg-purple-500/10"
                    >
                      <Play className="h-4 w-4 text-purple-500" />
                      Setup
                    </Button>
                    <Button 
                      onClick={() => handleTwitchInfo("list")}
                      variant="outline"
                      className="gap-2 justify-start border-purple-500/30 hover:bg-purple-500/10"
                    >
                      <ClipboardList className="h-4 w-4 text-purple-500" />
                      List
                    </Button>
                    <Button 
                      onClick={() => handleTwitchInfo("remove")}
                      variant="outline"
                      className="gap-2 justify-start border-purple-500/30 hover:bg-purple-500/10"
                    >
                      <Twitch className="h-4 w-4 text-purple-500" />
                      Remove
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* CAPTAIN'S CORNER */}
              <AccordionItem value="captains-corner" className="border rounded-lg px-4 border-amber-500/30">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amber-500" />
                    <span className="font-semibold">Captain's Corner</span>
                    <Badge variant="secondary" className="ml-2 bg-amber-500/20 text-amber-600">Performance Ratings</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <ManagerEvaluationForm 
                    guildId={selectedGuildId}
                    evaluatorId="web-user" 
                    players={players}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* ADMIN */}
              <AccordionItem value="admin" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-red-500" />
                    <span className="font-semibold">Admin & Panels</span>
                    <Badge variant="secondary" className="ml-2">6 commands</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">
                    Admin commands for managing Discord panels:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 border rounded bg-muted/50">/squadiq - Main control panel</div>
                    <div className="p-2 border rounded bg-muted/50">/refreshpanel - Refresh panels</div>
                    <div className="p-2 border rounded bg-muted/50">/scoutpanel - Scouting panel</div>
                    <div className="p-2 border rounded bg-muted/50">/eapanel - EA integration panel</div>
                    <div className="p-2 border rounded bg-muted/50">/ratingspanel - Ratings panel</div>
                    <div className="p-2 border rounded bg-muted/50">/spotblock - Block/unblock user</div>
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </div>

          {/* Command Output Feed */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Command Output
                </CardTitle>
                <CardDescription>
                  Results from your commands appear here
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  {commandOutputs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bolt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Run a command to see output</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {commandOutputs.map((output, idx) => (
                        <div 
                          key={`${output.title}-${idx}`} 
                          className="p-3 border rounded-lg bg-muted/30 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{output.title}</p>
                            <span className="text-xs text-muted-foreground">
                              {output.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {output.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
