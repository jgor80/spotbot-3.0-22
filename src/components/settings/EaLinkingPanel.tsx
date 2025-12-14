import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuild } from "@/contexts/GuildContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Link2, 
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  User
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface UnlinkedProfile {
  discord_user_id: string;
  ea_username: string;
  ea_platform: string | null;
}

interface DiscordMember {
  discord_user_id: string;
  discord_username: string | null;
  ea_username: string | null;
}

export function EaLinkingPanel() {
  const { selectedGuildId } = useGuild();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedProfile, setSelectedProfile] = useState<UnlinkedProfile | null>(null);
  const [targetDiscordId, setTargetDiscordId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  
  // Fetch unlinked EA profiles (those with ea_ prefix)
  const { data: unlinkedProfiles, isLoading } = useQuery({
    queryKey: ["unlinkedProfiles", selectedGuildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("discord_user_id, ea_username, ea_platform")
        .like("discord_user_id", "ea_%")
        .not("ea_username", "is", null)
        .order("ea_username");
      
      if (error) throw error;
      return data as UnlinkedProfile[];
    },
    enabled: !!selectedGuildId,
  });
  
  // Fetch Discord members without EA links for the dropdown
  const { data: availableMembers } = useQuery({
    queryKey: ["availableMembers", selectedGuildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("discord_user_id, discord_username, ea_username")
        .not("discord_user_id", "like", "ea_%")
        .is("ea_username", null)
        .order("discord_username");
      
      if (error) throw error;
      return data as DiscordMember[];
    },
    enabled: !!selectedGuildId,
  });
  
  // Filter members based on search
  const filteredMembers = availableMembers?.filter(m => 
    m.discord_username?.toLowerCase().includes(memberSearchQuery.toLowerCase())
  ) || [];
  
  // Link mutation
  const linkMutation = useMutation({
    mutationFn: async ({ eaUsername, discordUserId, platform }: { eaUsername: string; discordUserId: string; platform: string }) => {
      if (!selectedGuildId) throw new Error("No guild selected");
      
      const { data, error } = await supabase.functions.invoke("link-ea-account", {
        body: {
          guild_id: selectedGuildId,
          discord_user_id: discordUserId,
          ea_username: eaUsername,
          ea_platform: platform || "ps5",
        },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Account Linked",
        description: data.message,
      });
      setSelectedProfile(null);
      setTargetDiscordId("");
      queryClient.invalidateQueries({ queryKey: ["unlinkedProfiles"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (error) => {
      toast({
        title: "Link Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });
  
  const filteredProfiles = unlinkedProfiles?.filter(p => 
    p.ea_username?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  
  const handleLink = () => {
    if (!selectedProfile || !targetDiscordId.trim()) return;
    
    linkMutation.mutate({
      eaUsername: selectedProfile.ea_username,
      discordUserId: targetDiscordId.trim(),
      platform: selectedProfile.ea_platform || "ps5",
    });
  };
  
  if (!selectedGuildId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select a Discord server to manage EA account links.
        </CardContent>
      </Card>
    );
  }
  
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Unlinked EA Accounts
          </CardTitle>
          <CardDescription>
            These EA accounts have been detected but not linked to a Discord user. Link them to combine stats.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search EA usernames..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary mb-3" />
              <p className="text-muted-foreground">
                {searchQuery ? "No matching unlinked accounts found." : "All EA accounts are linked!"}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>EA Username</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((profile) => (
                    <TableRow key={profile.discord_user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 font-medium text-sm">
                            {profile.ea_username?.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{profile.ea_username}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {profile.ea_platform || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => setSelectedProfile(profile)}
                        >
                          <Link2 className="h-4 w-4 mr-2" />
                          Link
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          
          {unlinkedProfiles && unlinkedProfiles.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {unlinkedProfiles.length} unlinked account{unlinkedProfiles.length !== 1 ? "s" : ""} found
            </p>
          )}
        </CardContent>
      </Card>
      
      {/* Link Dialog */}
      <Dialog open={!!selectedProfile} onOpenChange={() => { setSelectedProfile(null); setTargetDiscordId(""); setMemberSearchQuery(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link EA Account to Discord</DialogTitle>
            <DialogDescription>
              Select a Discord member to link with this EA account. All stats will be merged.
            </DialogDescription>
          </DialogHeader>
          
          {selectedProfile && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 font-bold">
                  {selectedProfile.ea_username?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{selectedProfile.ea_username}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    Platform: {selectedProfile.ea_platform || "Unknown"}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Select Discord Member</Label>
                <Select value={targetDiscordId} onValueChange={setTargetDiscordId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a Discord member..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <div className="px-2 pb-2">
                      <Input
                        placeholder="Search members..."
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    {filteredMembers.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        {memberSearchQuery ? "No matching members" : "No unlinked members available"}
                      </div>
                    ) : (
                      filteredMembers.map((member) => (
                        <SelectItem key={member.discord_user_id} value={member.discord_user_id}>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{member.discord_username || member.discord_user_id}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only showing Discord members without an EA account linked
                </p>
              </div>
              
              {/* Manual ID fallback */}
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="discord-id" className="text-muted-foreground">Or enter Discord User ID manually</Label>
                <Input
                  id="discord-id"
                  placeholder="e.g. 123456789012345678"
                  value={targetDiscordId}
                  onChange={(e) => setTargetDiscordId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedProfile(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleLink}
              disabled={!targetDiscordId.trim() || linkMutation.isPending}
            >
              {linkMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Link Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
