import { eventKind } from "@/lib/eventKind";
import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import html2canvas from "html2canvas";
import { DashboardLayout, PageHeader } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGuild } from "@/contexts/GuildContext";
import { useAvailablePlayers } from "@/hooks/useAvailablePlayers";
import { FormationType } from "@/types/formations";
import { FORMATION_OPTIONS, FORMATIONS, getPositionRatingCategory } from "@/lib/formations";
import { AnnounceLineupDialog } from "@/components/lineup/AnnounceLineupDialog";
import { LineupBoardEditor, DEFAULT_LOOK, type BoardLook, type PositionTiers, type Availability } from "@/components/lineup/LineupBoardEditor";
import { autofillLineup } from "@/lib/lineupAutofill";
import { BoardSpot, BoardState, MAX_BENCH, boardFromNames, boardToSlots, movePlayer, resizeBoard, slotsToBoard } from "@/lib/lineupBoard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Users, 
  Loader2, 
  Plus,
  Shield,
  UserPlus,
  Trash2,
  Crown,
  User,
  ChevronRight,
  X,
  ClipboardList,
  Wand2,
  Save,
  Download,
  Image,
  Headphones,
  CalendarCheck,
  Megaphone
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useClubTheme } from "@/hooks/useClubTheme";

interface Team {
  id: string;
  guild_id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
  team_type: string;
  captain_discord_id: string | null;
  manager_discord_ids: string[];
  active: boolean;
  created_at: string;
}

interface TeamRoster {
  id: string;
  team_id: string;
  discord_user_id: string;
  role: string;
  primary_position: string | null;
  joined_at: string;
}

interface PlayerSummary {
  discord_user_id: string;
  discord_username: string | null;
  overall_rating: number;
  primary_position: string | null;
}

const emptyBoard = (count: number): BoardState => ({ starters: Array(count).fill(null), bench: [] });

export default function TeamsPage() {
  const { selectedGuildId, isLoading: guildLoading } = useGuild();
  const { toast: toastHook } = useToast();
  const queryClient = useQueryClient();
  
  // Teams state
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamTag, setNewTeamTag] = useState("");
  const [newTeamType, setNewTeamType] = useState("comp");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedPlayerRole, setSelectedPlayerRole] = useState("player");

  // Lineup state
  const [formation, setFormation] = useState<FormationType>("4-3-3 FLAT");
  const [board, setBoard] = useState<BoardState>(() => emptyBoard(FORMATIONS["4-3-3 FLAT"].length));
  const [history, setHistory] = useState<{ past: { board: BoardState; formation: FormationType }[]; future: { board: BoardState; formation: FormationType }[] }>({ past: [], future: [] });
  const [look, setLook] = useState<BoardLook>(DEFAULT_LOOK);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [lineupName, setLineupName] = useState("");
  const [isLineupLoading, setIsLineupLoading] = useState(false);
  const [lineupTeamId, setLineupTeamId] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [isFillingFromVoice, setIsFillingFromVoice] = useState(false);
  const [voiceChoices, setVoiceChoices] = useState<{ id: string; name: string; user_ids: string[] }[] | null>(null);
  // The last save, and the board it saved (an edit after that needs a new save before posting)
  const [savedLineup, setSavedLineup] = useState<{ id: string; name: string; board: BoardState } | null>(null);
  // The event board's Build Lineup link opens /teams?event=<id>
  const [searchParams] = useSearchParams();
  const [lineupEventId, setLineupEventId] = useState<string>(searchParams.get("event") || "");
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "teams" ? "teams" : "lineup");
  const [isFillingFromEvent, setIsFillingFromEvent] = useState(false);
  const pitchRef = useRef<HTMLDivElement>(null);

  // Available players for lineup
  const { data: availablePlayers, isLoading: playersLoading } = useAvailablePlayers(selectedGuildId);
  const positions = FORMATIONS[formation];

  // Fetch position ratings for all players in the guild
  const { data: positionRatings } = useQuery({
    queryKey: ["positionRatings", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("player_position_ratings")
        .select("discord_user_id, position, rating")
        .eq("guild_id", selectedGuildId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch teams
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", selectedGuildId],
    queryFn: async (): Promise<Team[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .order("name");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Fetch roster for selected team
  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ["teamRoster", selectedTeam?.id],
    queryFn: async (): Promise<TeamRoster[]> => {
      if (!selectedTeam) return [];
      
      const { data, error } = await supabase
        .from("team_rosters")
        .select("*")
        .eq("team_id", selectedTeam.id)
        .order("role");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedTeam,
  });

  // Fetch players for team management
  const { data: players } = useQuery({
    queryKey: ["players", selectedGuildId],
    queryFn: async (): Promise<PlayerSummary[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("player_summary")
        .select("discord_user_id, discord_username, overall_rating, primary_position")
        .eq("guild_id", selectedGuildId)
        .order("overall_rating", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGuildId || !newTeamName.trim()) {
        throw new Error("Missing required fields");
      }
      
      const { data, error } = await supabase.functions.invoke("manage-teams", {
        body: {
          action: "create",
          guild_id: selectedGuildId,
          team_name: newTeamName.trim(),
          team_tag: newTeamTag.trim() || null,
          team_type: newTeamType,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to create team");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setIsCreateOpen(false);
      setNewTeamName("");
      setNewTeamTag("");
      toastHook({ title: "Team Created", description: "Your team has been created successfully" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      if (!selectedGuildId) {
        throw new Error("Missing guild");
      }
      
      const { data, error } = await supabase.functions.invoke("manage-teams", {
        body: {
          action: "delete",
          guild_id: selectedGuildId,
          team_id: teamId,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to delete team");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setSelectedTeam(null);
      toastHook({ title: "Team Deleted" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Add player to team
  const addPlayerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTeam || !selectedPlayerId || !selectedGuildId) {
        throw new Error("Missing data");
      }
      
      const player = players?.find(p => p.discord_user_id === selectedPlayerId);
      
      const { data, error } = await supabase.functions.invoke("manage-roster", {
        body: {
          action: "add",
          guild_id: selectedGuildId,
          team_id: selectedTeam.id,
          player_discord_id: selectedPlayerId,
          role: selectedPlayerRole,
          primary_position: player?.primary_position || null,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to add player");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamRoster"] });
      setIsAddPlayerOpen(false);
      setSelectedPlayerId("");
      toastHook({ title: "Player Added" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Remove player from team
  const removePlayerMutation = useMutation({
    mutationFn: async (rosterId: string) => {
      if (!selectedTeam || !selectedGuildId) {
        throw new Error("Missing data");
      }
      
      const { data, error } = await supabase.functions.invoke("manage-roster", {
        body: {
          action: "remove",
          guild_id: selectedGuildId,
          team_id: selectedTeam.id,
          roster_id: rosterId,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to remove player");
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamRoster"] });
      toastHook({ title: "Player Removed" });
    },
    onError: (error) => {
      toastHook({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  });

  // Helper functions
  const getPlayerInfo = (discordUserId: string) => {
    return players?.find(p => p.discord_user_id === discordUserId);
  };

  const getPlayerDisplayName = (discordUserId: string) => {
    const player = getPlayerInfo(discordUserId);
    return player?.discord_username || "Unknown Player";
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "captain":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "manager":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "comp":
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Competitive</Badge>;
      case "casual":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Casual</Badge>;
      case "academy":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Academy</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const playersNotInTeam = players?.filter(
    p => !roster?.some(r => r.discord_user_id === p.discord_user_id)
  ) || [];

  // Lineup board: every change goes through commitBoard so Undo/Redo can step through it
  const commitBoard = (next: BoardState) => {
    if (next === board) return;
    setHistory(h => ({ past: [...h.past, { board, formation }].slice(-50), future: [] }));
    setBoard(next);
  };
  const undo = () => {
    const last = history.past[history.past.length - 1];
    if (!last) return;
    setHistory(h => ({ past: h.past.slice(0, -1), future: [{ board, formation }, ...h.future] }));
    setBoard(last.board);
    setFormation(last.formation);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory(h => ({ past: [...h.past, { board, formation }], future: h.future.slice(1) }));
    setBoard(next.board);
    setFormation(next.formation);
  };
  const handleMove = (playerId: string, to: BoardSpot) => {
    const next = movePlayer(board, playerId, to);
    if (next === board && to.zone === "bench") toast.info(`The bench holds ${MAX_BENCH}`);
    commitBoard(next);
  };
  const handleFormation = (next: FormationType) => {
    if (next === formation) return;
    setHistory(h => ({ past: [...h.past, { board, formation }].slice(-50), future: [] }));
    setFormation(next);
    setBoard(resizeBoard(board, FORMATIONS[next].length));
  };
  const handlePasteNames = (text: string) => {
    const { state, unmatched } = boardFromNames(
      text,
      (availablePlayers || []).map(p => ({ id: p.discord_user_id, names: [p.ea_username, p.discord_username] })),
      positions.length,
    );
    commitBoard(state);
    if (unmatched.length) toast.warning(`No player found for: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? "…" : ""}`);
    else toast.success("Names applied");
  };

  // The rating shown on a card: the player's rating for that kind of position, else their overall
  const getPositionRating = (playerId: string, position: string) => {
    const category = getPositionRatingCategory(position);
    return positionRatings?.find(r => r.discord_user_id === playerId && r.position === category)?.rating ?? null;
  };

  // Position tiers (comp / plays well / emergency) colour each card by how well it fits its spot
  const { data: tierRows } = useQuery({
    queryKey: ["positionTiers", selectedGuildId],
    queryFn: async () => {
      // player_positions is newer than the generated types; a server without it just shows no tiers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("player_positions")
        .select("discord_user_id, primary_position, secondary_positions, emergency_positions")
        .eq("guild_id", selectedGuildId);
      if (error) return [];
      return (data || []) as { discord_user_id: string; primary_position: string | null; secondary_positions: string[] | null; emergency_positions: string[] | null }[];
    },
    enabled: !!selectedGuildId,
    staleTime: 5 * 60 * 1000,
  });
  const positionTiers = useMemo(() => new Map<string, PositionTiers>((tierRows || []).map(r => [r.discord_user_id, {
    primary: r.primary_position,
    secondary: r.secondary_positions || [],
    emergency: r.emergency_positions || [],
  }])), [tierRows]);

  // The chosen event's availability answers mark each squad player Available / Maybe / Out
  const { data: availabilityRows } = useQuery({
    queryKey: ["lineupAvailability", lineupEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_availability")
        .select("discord_user_id, response, position")
        .eq("event_id", lineupEventId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!lineupEventId,
  });
  const eventAvailability = useMemo(
    () => new Map<string, Availability>((availabilityRows || []).filter(r => ["yes", "maybe", "no"].includes(r.response)).map(r => [r.discord_user_id, r.response as Availability])),
    [availabilityRows],
  );

  // Open a saved lineup (the Discord team sheet's "Drag & drop on the web" link: /lineup?lineup=<id>)
  const openLineupId = searchParams.get("lineup");
  useEffect(() => {
    if (!openLineupId || !selectedGuildId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("get-lineup", { body: { lineup_id: openLineupId } });
      if (cancelled) return;
      if (error || !data?.success) {
        toast.error("Couldn't open that lineup");
        return;
      }
      const f = (FORMATION_OPTIONS as string[]).includes(data.lineup.formation) ? data.lineup.formation as FormationType : formation;
      setFormation(f);
      setBoard(slotsToBoard([...(data.starters || []), ...(data.substitutes || [])], FORMATIONS[f].length));
      setHistory({ past: [], future: [] });
      setLineupName(data.lineup.name || "");
      if (data.lineup.team_id) setLineupTeamId(data.lineup.team_id);
      if (data.lineup.event_id) setLineupEventId(data.lineup.event_id);
      if (data.lineup.event?.title) setLook(l => ({ ...l, subtitle: data.lineup.event.title }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLineupId, selectedGuildId]);

  // Remember the graphic's look per server (browser only). Until someone picks kit colours here, the
  // graphic uses the club's team colours from /setup.
  const clubTheme = useClubTheme(lineupTeamId || null);
  useEffect(() => {
    if (!selectedGuildId) return;
    let saved: Partial<BoardLook> = {};
    try {
      saved = JSON.parse(localStorage.getItem(`lineupLook:${selectedGuildId}`) || "{}");
    } catch { /* storage blocked or bad saved look */ }
    setLook(l => {
      const next: BoardLook = { ...DEFAULT_LOOK, ...saved, title: l.title, subtitle: l.subtitle };
      const untouched = next.kit.primary === DEFAULT_LOOK.kit.primary && next.kit.secondary === DEFAULT_LOOK.kit.secondary;
      return untouched && clubTheme ? { ...next, kit: { ...next.kit, primary: clubTheme.primary, secondary: clubTheme.secondary } } : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGuildId, clubTheme?.primary, clubTheme?.secondary]);
  useEffect(() => {
    if (!selectedGuildId) return;
    try {
      const { title: _t, subtitle: _s, ...rest } = look;
      localStorage.setItem(`lineupLook:${selectedGuildId}`, JSON.stringify(rest));
    } catch { /* storage blocked */ }
  }, [look, selectedGuildId]);

  // The squad's name is the graphic's default title
  const lineupTeamName = teams?.find(t => t.id === lineupTeamId)?.name;
  useEffect(() => {
    if (lineupTeamName && !look.title) setLook(l => ({ ...l, title: lineupName || `${lineupTeamName} Starting XI` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupTeamName]);
  // Upcoming events this lineup can be saved against
  const { data: upcomingEvents } = useQuery({
    queryKey: ["upcomingEvents", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      const { data, error } = await supabase
        .from("availability_events")
        .select("id, title, scheduled_at, team_id")
        .eq("guild_id", selectedGuildId)
        .eq("closed", false)
        .not("club_key", "is", null)
        .gte("scheduled_at", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  // Picking an event picks its squad too
  useEffect(() => {
    const event = upcomingEvents?.find(e => e.id === lineupEventId);
    if (event?.team_id && !lineupTeamId) setLineupTeamId(event.team_id);
  }, [lineupEventId, upcomingEvents, lineupTeamId]);

  // Fill the open spots with the players in a voice channel, best position fits first.
  // signedUpPositions (from an event's position sign-up) win over position tiers, then saved preferences.
  const fillFromVoiceChannel = async (userIds: string[], signedUpPositions?: Map<string, string[]>) => {
    if (!selectedGuildId || !availablePlayers) return;
    const candidates = availablePlayers.filter(p => userIds.includes(p.discord_user_id) && !onBoard.has(p.discord_user_id));
    if (candidates.length === 0) {
      toast.info("Everyone there is already on the sheet");
      return;
    }

    const { data: prefs } = await supabase
      .from("position_preferences")
      .select("user_id, preferences")
      .eq("guild_id", selectedGuildId)
      .in("user_id", candidates.map(p => p.discord_user_id));
    const prefsByUser = new Map((prefs || []).map(p => [p.user_id, p.preferences || []]));
    // Comp position first, then the ones they play well, then emergency cover
    const tierOrder = (id: string) => {
      const t = positionTiers.get(id);
      return t ? [t.primary, ...t.secondary, ...t.emergency].filter(Boolean) as string[] : null;
    };

    const occupied = new Set(board.starters.flatMap((id, i) => (id ? [i] : [])));
    const picks = autofillLineup(
      positions.map(p => p.position),
      candidates.map(p => ({
        discord_user_id: p.discord_user_id,
        overall_rating: p.overall_rating,
        preferences: signedUpPositions?.get(p.discord_user_id)
          || tierOrder(p.discord_user_id)
          || prefsByUser.get(p.discord_user_id)
          || (p.primary_position ? [p.primary_position] : []),
      })),
      positionRatings || [],
      occupied,
    );

    const starters = [...board.starters];
    for (const [slotIndex, userId] of picks.entries()) starters[slotIndex] = userId;
    // Anyone left over waits on the bench
    const placed = new Set(picks.values());
    const bench = [...board.bench];
    for (const p of candidates) if (!placed.has(p.discord_user_id) && bench.length < MAX_BENCH) bench.push(p.discord_user_id);
    commitBoard({ starters, bench });
    const open = starters.filter(s => !s).length;
    const benched = bench.length - board.bench.length;
    toast.success(`Placed ${picks.size} players${benched ? `, ${benched} on the bench` : ""}${open > 0 ? `, ${open} spots still open` : ""}`);
  };

  const handleFillFromVoice = async () => {
    if (!selectedGuildId || !availablePlayers?.length) return;
    setIsFillingFromVoice(true);
    try {
      const { data, error } = await supabase.functions.invoke("announce-lineup", {
        body: {
          action: "voice",
          guild_id: selectedGuildId,
          user_ids: availablePlayers.map(p => p.discord_user_id),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const channels = (data?.channels || []) as { id: string; name: string; user_ids: string[] }[];
      if (channels.length === 0) {
        toast.info("Nobody from your player list is in voice or checked in to tonight's roll call");
      } else if (channels.length === 1) {
        await fillFromVoiceChannel(channels[0].user_ids);
      } else {
        setVoiceChoices(channels);
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsFillingFromVoice(false);
    }
  };

  // Fill from the players who said Available for the chosen event (Maybes go to the bench)
  const handleFillFromEvent = async () => {
    if (!lineupEventId) return;
    setIsFillingFromEvent(true);
    try {
      const { data, error } = await supabase
        .from("player_availability")
        .select("discord_user_id, position, response")
        .eq("event_id", lineupEventId)
        .in("response", ["yes", "maybe"]);
      if (error) throw error;
      const yes = (data || []).filter(r => r.response === "yes");
      if (!yes.length) {
        toast.info("Nobody has said they're available for this event yet");
        return;
      }
      const signedUp = new Map(
        yes.filter(r => r.position).map(r => [r.discord_user_id, (r.position as string).split(",")]),
      );
      await fillFromVoiceChannel(yes.map(r => r.discord_user_id), signedUp);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsFillingFromEvent(false);
    }
  };

  // Saves the board as a new lineup for the squad; returns its id (the saved one if nothing changed)
  const handleSaveLineup = async (quiet = false): Promise<string | null> => {
    if (savedLineup && savedLineup.board === board) {
      if (!quiet) toast.info("Already saved");
      return savedLineup.id;
    }
    if (!filledCount) {
      toast.error("Put at least one player on the pitch");
      return null;
    }
    if (!selectedGuildId) {
      toast.error("No guild selected");
      return null;
    }
    if (!lineupTeamId) {
      toast.error("Please select a squad to save this lineup to");
      return null;
    }

    const selectedLineupTeam = teams?.find(t => t.id === lineupTeamId);
    const defaultName = selectedLineupTeam ? `${selectedLineupTeam.name} Starting XI` : "Untitled Lineup";

    setIsLineupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-lineup", {
        body: {
          guild_id: selectedGuildId,
          formation,
          name: lineupName || look.title || defaultName,
          team_id: lineupTeamId,
          event_id: lineupEventId || undefined,
          slots: boardToSlots(board, positions.map(p => p.position)),
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to save lineup");

      setSavedLineup({ id: data.lineup_id, name: lineupName || look.title || defaultName, board });
      if (!quiet) toast.success(`Lineup saved for ${selectedLineupTeam?.name || "team"}`);
      return data.lineup_id as string;
    } catch (error) {
      toast.error((error as Error).message);
      return null;
    } finally {
      setIsLineupLoading(false);
    }
  };

  // Post to Discord: save if anything changed, then pick the channel and send the graphic
  const handlePostToDiscord = async () => {
    const id = await handleSaveLineup(true);
    if (id) setAnnounceOpen(true);
  };

  // Everything in the editor's graphic (title, pitch, cards, bench), as a PNG data URL
  const capturePitchImage = async (): Promise<string | null> => {
    if (!pitchRef.current) return null;
    try {
      const canvas = await html2canvas(pitchRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        // Position-fit outlines help while picking; the posted graphic shouldn't show them
        onclone: (doc) => doc.querySelectorAll<HTMLElement>("[data-fit]").forEach((el) => { el.style.borderColor = "transparent"; }),
      });
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error("Pitch capture error:", error);
      return null;
    }
  };

  const handleExportImage = async () => {
    setIsExporting(true);
    try {
      const image = await capturePitchImage();
      if (!image) throw new Error("Failed to export image");
      const selectedLineupTeam = teams?.find(t => t.id === lineupTeamId);
      const link = document.createElement("a");
      link.download = selectedLineupTeam
        ? `${selectedLineupTeam.name.replace(/\s+/g, "_")}_lineup.png`
        : `lineup_${formation.replace(/\s+/g, "_")}.png`;
      link.href = image;
      link.click();
      toast.success("Lineup image downloaded!");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const starterIds = board.starters.filter(Boolean) as string[];
  const filledCount = starterIds.length;
  const onBoard = new Set([...starterIds, ...board.bench]);
  const avgRating = filledCount > 0
    ? starterIds.reduce((sum, id) => sum + (availablePlayers?.find(p => p.discord_user_id === id)?.overall_rating || 0), 0) / filledCount
    : 0;

  if (!selectedGuildId && !guildLoading) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>No Server Selected</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            <p>Select a Discord server from the dropdown above to manage teams and lineups.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Lineup Builder" description="Pick the XI for the next game, post it to Discord, and manage your squads." />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
            <TabsTrigger value="lineup" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Lineup
            </TabsTrigger>
            <TabsTrigger value="teams" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Squads
            </TabsTrigger>
          </TabsList>

          {/* Teams Tab */}
          <TabsContent value="teams" className="space-y-6">
            <div className="flex items-center justify-end">
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Team
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Team</DialogTitle>
                    <DialogDescription>
                      Add a new team to this Discord server
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Team Name *</label>
                      <Input
                        placeholder="e.g., Rush Superstars"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Team Tag</label>
                      <Input
                        placeholder="e.g., RS"
                        value={newTeamTag}
                        onChange={(e) => setNewTeamTag(e.target.value)}
                        maxLength={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Team Type</label>
                      <div className="flex gap-2">
                        {["comp", "casual", "academy"].map((type) => (
                          <Button
                            key={type}
                            type="button"
                            variant={newTeamType === type ? "default" : "outline"}
                            size="sm"
                            onClick={() => setNewTeamType(type)}
                            className="capitalize"
                          >
                            {type === "comp" ? "Competitive" : type}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => createTeamMutation.mutate()}
                      disabled={!newTeamName.trim() || createTeamMutation.isPending}
                    >
                      {createTeamMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Create Team
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Teams List */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Teams
                  </CardTitle>
                  <CardDescription>
                    {teams?.length || 0} teams in this server
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {teamsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : teams && teams.length > 0 ? (
                    <div className="space-y-2">
                      {teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => setSelectedTeam(team)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left ${
                            selectedTeam?.id === team.id
                              ? "bg-primary/10 border border-primary/20"
                              : "bg-muted/30 hover:bg-muted/50 border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{team.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {team.tag && (
                                  <span className="text-xs text-muted-foreground">[{team.tag}]</span>
                                )}
                                {getTypeBadge(team.team_type)}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p>No teams yet</p>
                      <p className="text-sm">Create your first team above</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Team Details & Roster */}
              <Card className="lg:col-span-2">
                {selectedTeam ? (
                  <>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {selectedTeam.name}
                            {selectedTeam.tag && (
                              <span className="text-muted-foreground font-normal">[{selectedTeam.tag}]</span>
                            )}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            {getTypeBadge(selectedTeam.team_type)}
                            <span>•</span>
                            <span>{roster?.length || 0} players</span>
                            <span>•</span>
                            <span>Created {format(new Date(selectedTeam.created_at), "MMM d, yyyy")}</span>
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
                            <DialogTrigger asChild>
                              <Button size="sm">
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Player
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Player to {selectedTeam.name}</DialogTitle>
                                <DialogDescription>
                                  Select a player to add to the team roster
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Player</label>
                                  <select
                                    className="w-full p-2 rounded-md border bg-background"
                                    value={selectedPlayerId}
                                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                                  >
                                    <option value="">Select player...</option>
                                    {playersNotInTeam.map((player) => (
                                      <option key={player.discord_user_id} value={player.discord_user_id}>
                                        {player.discord_username || "Unknown"} ({player.overall_rating.toFixed(1)})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Role</label>
                                  <div className="flex gap-2">
                                    {["player", "captain", "manager"].map((role) => (
                                      <Button
                                        key={role}
                                        type="button"
                                        variant={selectedPlayerRole === role ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setSelectedPlayerRole(role)}
                                        className="capitalize"
                                      >
                                        {role}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddPlayerOpen(false)}>
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={() => addPlayerMutation.mutate()}
                                  disabled={!selectedPlayerId || addPlayerMutation.isPending}
                                >
                                  {addPlayerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                  Add Player
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Team</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {selectedTeam.name}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteTeamMutation.mutate(selectedTeam.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {rosterLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : roster && roster.length > 0 ? (
                        <div className="space-y-2">
                          {roster.map((member) => {
                            const player = getPlayerInfo(member.discord_user_id);
                            return (
                              <div
                                key={member.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                              >
                                <div className="flex items-center gap-3">
                                  {getRoleIcon(member.role)}
                                  <div>
                                    <p className="font-medium">
                                      {player?.discord_username || "Unknown Player"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {member.primary_position || player?.primary_position || "No position"}
                                      <span className="mx-2">•</span>
                                      <span className="capitalize">{member.role}</span>
                                      {player && (
                                        <>
                                          <span className="mx-2">•</span>
                                          <span>{player.overall_rating.toFixed(1)} OVR</span>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removePlayerMutation.mutate(member.id)}
                                  disabled={removePlayerMutation.isPending}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-muted-foreground">
                          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                          <p>No players in this team</p>
                          <p className="text-sm">Add players using the button above</p>
                        </div>
                      )}
                    </CardContent>
                  </>
                ) : (
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a team to view details</p>
                  </CardContent>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* Lineup Builder Tab */}
          <TabsContent value="lineup" className="space-y-6">
            {guildLoading || playersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : availablePlayers && availablePlayers.length > 0 ? (
              <div className="space-y-4">
                <LineupBoardEditor
                  ref={pitchRef}
                  board={board}
                  formation={formation}
                  players={availablePlayers}
                  look={look}
                  onLook={setLook}
                  onMove={handleMove}
                  onFormation={handleFormation}
                  onPasteNames={handlePasteNames}
                  onClear={() => commitBoard(emptyBoard(positions.length))}
                  onUndo={undo}
                  onRedo={redo}
                  canUndo={history.past.length > 0}
                  canRedo={history.future.length > 0}
                  positionRating={getPositionRating}
                  tiers={positionTiers}
                  availability={eventAvailability}
                  status={
                    savedLineup && savedLineup.board === board
                      ? <span className="text-emerald-600">● Saved</span>
                      : <span>● Not saved</span>
                  }
                  toolbar={
                    <>
                      <Button variant="outline" size="sm" onClick={handleFillFromVoice} disabled={isFillingFromVoice || filledCount >= positions.length}>
                        {isFillingFromVoice ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Headphones className="h-4 w-4 mr-2" />}
                        Fill from Voice
                      </Button>
                      {lineupEventId && (
                        <Button variant="outline" size="sm" onClick={handleFillFromEvent} disabled={isFillingFromEvent || filledCount >= positions.length}>
                          {isFillingFromEvent ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarCheck className="h-4 w-4 mr-2" />}
                          Fill from Availability
                        </Button>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">Avg rating <strong className="text-foreground">{avgRating.toFixed(1)}</strong></span>
                    </>
                  }
                  actions={
                    <>
                      <Button variant="secondary" onClick={() => handleSaveLineup()} disabled={!filledCount || isLineupLoading || !lineupTeamId}>
                        {isLineupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                        Save
                      </Button>
                      <Button onClick={handlePostToDiscord} disabled={!filledCount || isLineupLoading || !lineupTeamId}>
                        <Megaphone className="h-4 w-4 mr-1.5" />
                        Post
                      </Button>
                      <Button variant="outline" onClick={handleExportImage} disabled={!filledCount || isExporting}>
                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
                        Image
                      </Button>
                    </>
                  }
                />
                {!lineupTeamId && <p className="text-sm text-muted-foreground">Pick a squad below to save or post this lineup.</p>}

                {/* Save to Team */}
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-sm font-medium mb-1.5 block">Squad</label>
                      <Select value={lineupTeamId} onValueChange={setLineupTeamId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a team..." />
                        </SelectTrigger>
                        <SelectContent>
                          {teams?.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name} {team.tag && `[${team.tag}]`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!!upcomingEvents?.length && (
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-sm font-medium mb-1.5 block">For event (shows who's available)</label>
                        <Select value={lineupEventId || "none"} onValueChange={(v) => setLineupEventId(v === "none" ? "" : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="No event" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No event</SelectItem>
                            {upcomingEvents.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {eventKind(e.title)} · {e.title} · {format(new Date(e.scheduled_at), "EEE d MMM, HH:mm")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-sm font-medium mb-1.5 block">Lineup name (optional)</label>
                      <Input
                        placeholder={lineupTeamId ? `${teams?.find(t => t.id === lineupTeamId)?.name || ''} Starting XI` : "Lineup name..."}
                        value={lineupName}
                        onChange={(e) => setLineupName(e.target.value)}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No players found. Players need to play games before they can be added to lineups.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={!!voiceChoices} onOpenChange={(open) => !open && setVoiceChoices(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fill from where?</DialogTitle>
            <DialogDescription>Players from your list are in more than one voice channel or checked in to the roll call.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {voiceChoices?.map((c) => (
              <Button
                key={c.id}
                variant="outline"
                className="w-full justify-between"
                onClick={async () => {
                  setVoiceChoices(null);
                  await fillFromVoiceChannel(c.user_ids);
                }}
              >
                <span>{c.id === "checkins" ? "📞" : "🔊"} {c.name}</span>
                <Badge variant="secondary">{c.user_ids.length}</Badge>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {selectedGuildId && (
        <AnnounceLineupDialog
          open={announceOpen && !!savedLineup}
          onOpenChange={setAnnounceOpen}
          guildId={selectedGuildId}
          lineupId={savedLineup?.id ?? null}
          lineupName={savedLineup?.name ?? ""}
          captureImage={capturePitchImage}
        />
      )}
    </DashboardLayout>
  );
}
