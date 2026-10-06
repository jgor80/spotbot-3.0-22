import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface SyncMatchesButtonProps {
  guildId: string;
  clubKey?: string;
}

// Pulls the latest EA matches for this server (or one club) through the sync-ea-stats edge function
export function SyncMatchesButton({ guildId, clubKey }: SyncMatchesButtonProps) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-ea-stats", {
        body: { sync_type: "full", guild_id: guildId, club_key: clubKey },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.ea_throttled && !data?.synced) {
        toast.warning(data.warning ?? "EA servers are throttling requests right now. Try again in a minute.");
      } else if (!data?.club_stats_synced && !data?.synced) {
        toast.info("No EA-linked club to sync. Link one in Discord with /manager → Admin → Link EA Club.");
      } else {
        toast.success(`Synced ${data.synced ?? 0} new matches and ${data.member_stats_synced ?? 0} players.`);
      }
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.error(`Sync failed: ${(err as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button onClick={handleSync} disabled={isSyncing}>
      {isSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
      Sync Latest Matches
    </Button>
  );
}
