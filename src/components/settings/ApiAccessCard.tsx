import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { 
  Code, 
  Copy, 
  Check, 
  ExternalLink,
  Database,
  Users,
  User,
  History
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Club {
  ea_club_id: string;
  club_name: string;
  club_key: string;
}

export function ApiAccessCard() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  // Fetch clubs for this guild
  const { data: clubs } = useQuery({
    queryKey: ["apiClubs", selectedGuildId],
    queryFn: async (): Promise<Club[]> => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("club_stats")
        .select("ea_club_id, club_name, club_key")
        .eq("guild_id", selectedGuildId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedGuildId,
  });

  const copyToClipboard = async (text: string, endpoint: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedEndpoint(endpoint);
      toast({
        title: "Copied!",
        description: "API URL copied to clipboard",
      });
      setTimeout(() => setCopiedEndpoint(null), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  const endpoints = [
    {
      id: "match-history",
      name: "Match History",
      icon: History,
      description: "Get full match history with player stats",
      path: "get-match-history",
      params: "clubId={CLUB_ID}&limit=50",
      example: {
        success: true,
        count: 50,
        rows: [
          {
            id: 1,
            club_id: "102614",
            club_name: "RushSuperstars2",
            match_type: "leagueMatch",
            match_date: 1765764321,
            match_data: { clubs: {} },
            player_data: {}
          }
        ]
      }
    },
    {
      id: "club-info",
      name: "Club Info",
      icon: Database,
      description: "Get club stats and details",
      path: "get-club-info-api",
      params: "clubId={CLUB_ID}",
      example: {
        success: true,
        club: {
          id: "102614",
          name: "RushSuperstars2",
          skill_rating: 1850,
          wins: 245,
          losses: 89,
          goals_scored: 782
        }
      }
    },
    {
      id: "club-members",
      name: "Club Members",
      icon: Users,
      description: "Get roster with career stats",
      path: "get-club-members-api",
      params: "clubId={CLUB_ID}",
      example: {
        success: true,
        count: 15,
        members: [
          {
            ea_username: "PlayerName",
            overall_rating: 78,
            games_played: 120,
            goals: 45
          }
        ]
      }
    },
    {
      id: "player-stats",
      name: "Player Stats",
      icon: User,
      description: "Get individual player stats",
      path: "get-player-stats-api",
      params: "eaUsername={EA_USERNAME}&limit=50",
      example: {
        success: true,
        player: {
          ea_username: "PlayerName",
          primary_position: "ST"
        },
        career_stats: {
          games_played: 120,
          goals: 45,
          win_rate: 65
        },
        recent_matches: []
      }
    }
  ];

  const selectedClub = clubs?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Public API Access
        </CardTitle>
        <CardDescription>
          Access your club's match history and player stats via our public API - no authentication required
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Club Selector Info */}
        {clubs && clubs.length > 0 ? (
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{selectedClub?.club_name}</p>
                <p className="text-sm text-muted-foreground">
                  Club ID: <code className="px-1.5 py-0.5 rounded bg-background font-mono text-xs">{selectedClub?.ea_club_id}</code>
                </p>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                API Ready
              </Badge>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/50 border text-center">
            <p className="text-muted-foreground">No clubs configured. Add a club to enable API access.</p>
          </div>
        )}

        {/* API Endpoints */}
        <Tabs defaultValue="match-history" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full">
            {endpoints.map(ep => (
              <TabsTrigger key={ep.id} value={ep.id} className="text-xs sm:text-sm">
                <ep.icon className="h-4 w-4 mr-1.5 hidden sm:inline" />
                {ep.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {endpoints.map(ep => {
            const fullUrl = selectedClub 
              ? `${SUPABASE_URL}/functions/v1/${ep.path}?${ep.params.replace('{CLUB_ID}', selectedClub.ea_club_id)}`
              : `${SUPABASE_URL}/functions/v1/${ep.path}?${ep.params}`;

            return (
              <TabsContent key={ep.id} value={ep.id} className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">{ep.description}</p>
                  
                  {/* URL Display */}
                  <div className="flex gap-2">
                    <Input 
                      value={fullUrl}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(fullUrl, ep.id)}
                    >
                      {copiedEndpoint === ep.id ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      asChild
                    >
                      <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>

                {/* Example Response */}
                <div>
                  <p className="text-sm font-medium mb-2">Example Response:</p>
                  <pre className="p-3 rounded-lg bg-muted/50 border text-xs overflow-x-auto">
                    <code>{JSON.stringify(ep.example, null, 2)}</code>
                  </pre>
                </div>

                {/* Parameters */}
                <div className="text-sm">
                  <p className="font-medium mb-1">Parameters:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    {ep.id === "match-history" && (
                      <>
                        <li><code className="text-xs">clubId</code> - EA Club ID (required)</li>
                        <li><code className="text-xs">limit</code> - Max results, 1-500 (default: 50)</li>
                        <li><code className="text-xs">matchType</code> - Filter: leagueMatch, playoffMatch, friendlyMatch</li>
                      </>
                    )}
                    {ep.id === "club-info" && (
                      <li><code className="text-xs">clubId</code> - EA Club ID (required)</li>
                    )}
                    {ep.id === "club-members" && (
                      <li><code className="text-xs">clubId</code> - EA Club ID (required)</li>
                    )}
                    {ep.id === "player-stats" && (
                      <>
                        <li><code className="text-xs">eaUsername</code> - EA FC username (required)</li>
                        <li><code className="text-xs">limit</code> - Recent matches to return, 1-500 (default: 50)</li>
                      </>
                    )}
                  </ul>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>

        {/* Archetype IDs Reference */}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium hover:text-primary transition-colors">
            Archetype ID Reference
          </summary>
          <div className="mt-2 p-3 rounded-lg bg-muted/50 border grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
            <span><code>1</code> Shot Stopper</span>
            <span><code>2</code> Sweeper Keeper</span>
            <span><code>3</code> Progressor</span>
            <span><code>4</code> Boss</span>
            <span><code>5</code> Engine</span>
            <span><code>6</code> Marauder</span>
            <span><code>7</code> Recycler</span>
            <span><code>8</code> Maestro</span>
            <span><code>9</code> Creator</span>
            <span><code>10</code> Spark</span>
            <span><code>11</code> Magician</span>
            <span><code>12</code> Finisher</span>
            <span><code>13</code> Target</span>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
