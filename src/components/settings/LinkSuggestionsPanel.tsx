import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Loader2,
  CheckCircle2,
  XCircle,
  Lightbulb,
  User,
  Link2
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LinkSuggestion {
  id: string;
  ea_username: string;
  suggested_discord_id: string;
  suggested_discord_name: string | null;
  similarity_score: number;
  temp_profile_id: string;
  created_at: string;
}

export function LinkSuggestionsPanel() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminDiscordId, setAdminDiscordId] = useState("");
  
  // Fetch pending suggestions
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["linkSuggestions", selectedGuildId],
    queryFn: async () => {
      if (!selectedGuildId) return [];
      
      const { data, error } = await supabase
        .from("link_suggestions")
        .select("*")
        .eq("guild_id", selectedGuildId)
        .eq("status", "pending")
        .order("similarity_score", { ascending: false });
      
      if (error) throw error;
      return data as LinkSuggestion[];
    },
    enabled: !!selectedGuildId,
  });

  // Approve suggestion mutation - uses existing link-ea-account edge function
  const approveMutation = useMutation({
    mutationFn: async (suggestion: LinkSuggestion) => {
      if (!selectedGuildId) throw new Error("No guild selected");
      
      // Call link-ea-account to do the actual linking
      const { data, error } = await supabase.functions.invoke("link-ea-account", {
        body: {
          guild_id: selectedGuildId,
          discord_user_id: suggestion.suggested_discord_id,
          ea_username: suggestion.ea_username,
          ea_platform: "ps5", // Default platform
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      // The link-ea-account function handles updating suggestion status via service role
      return data;
    },
    onSuccess: (_, suggestion) => {
      toast({
        title: "Link Approved",
        description: `Linked ${suggestion.ea_username} to ${suggestion.suggested_discord_name || suggestion.suggested_discord_id}`,
      });
      queryClient.invalidateQueries({ queryKey: ["linkSuggestions"] });
      queryClient.invalidateQueries({ queryKey: ["unlinkedProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setProcessingId(null);
    },
    onError: (error) => {
      toast({
        title: "Approval Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
      setProcessingId(null);
    },
  });

  // Reject suggestion mutation - using edge function
  const rejectMutation = useMutation({
    mutationFn: async (suggestion: LinkSuggestion) => {
      if (!selectedGuildId || !adminDiscordId.trim()) {
        throw new Error("Missing admin Discord ID");
      }
      
      const { data, error } = await supabase.functions.invoke("manage-link-suggestions", {
        body: {
          action: "reject",
          guild_id: selectedGuildId,
          discord_user_id: adminDiscordId.trim(),
          suggestion_id: suggestion.id,
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to reject suggestion");
      
      return data;
    },
    onSuccess: (_, suggestion) => {
      toast({
        title: "Suggestion Rejected",
        description: `Rejected suggestion for ${suggestion.ea_username}`,
      });
      queryClient.invalidateQueries({ queryKey: ["linkSuggestions"] });
      setProcessingId(null);
    },
    onError: (error) => {
      toast({
        title: "Rejection Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
      setProcessingId(null);
    },
  });

  const handleApprove = (suggestion: LinkSuggestion) => {
    setProcessingId(suggestion.id);
    approveMutation.mutate(suggestion);
  };

  const handleReject = (suggestion: LinkSuggestion) => {
    setProcessingId(suggestion.id);
    rejectMutation.mutate(suggestion);
  };

  if (!selectedGuildId) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Link Suggestions
        </CardTitle>
        <CardDescription>
          Review suggested links between EA accounts and Discord members based on username similarity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Admin Discord ID input for authorization */}
        <div className="p-3 rounded-lg bg-muted/30 border">
          <label className="text-sm font-medium">Your Discord ID (for authorization)</label>
          <Input
            placeholder="123456789012345678"
            value={adminDiscordId}
            onChange={(e) => setAdminDiscordId(e.target.value)}
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">Required to approve or reject suggestions</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !suggestions || suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-primary mb-3" />
            <p className="text-muted-foreground">
              No pending suggestions. Run Auto-Link to generate new suggestions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>EA Username</TableHead>
                    <TableHead>Suggested Discord</TableHead>
                    <TableHead className="text-center">Similarity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((suggestion) => (
                    <TableRow key={suggestion.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 font-medium text-sm">
                            {suggestion.ea_username?.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{suggestion.ea_username}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{suggestion.suggested_discord_name || suggestion.suggested_discord_id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={suggestion.similarity_score >= 0.75 ? "default" : "secondary"}
                          className={suggestion.similarity_score >= 0.75 ? "bg-primary/10 text-primary" : ""}
                        >
                          {Math.round(suggestion.similarity_score * 100)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(suggestion)}
                            disabled={processingId === suggestion.id || !adminDiscordId.trim()}
                          >
                            {processingId === suggestion.id && rejectMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(suggestion)}
                            disabled={processingId === suggestion.id}
                          >
                            {processingId === suggestion.id && approveMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Link2 className="h-4 w-4 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-sm text-muted-foreground">
              {suggestions.length} pending suggestion{suggestions.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
