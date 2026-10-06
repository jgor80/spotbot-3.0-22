import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DiscordChannel {
  id: string;
  name: string;
  parent: string | null;
}

interface AnnounceLineupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string;
  lineupId: string | null;
  lineupName: string;
  // Renders the pitch to a PNG data URL, or null if it can't
  captureImage: () => Promise<string | null>;
}

export function AnnounceLineupDialog({
  open,
  onOpenChange,
  guildId,
  lineupId,
  lineupName,
  captureImage,
}: AnnounceLineupDialogProps) {
  const [channelId, setChannelId] = useState("");
  const [mentionPlayers, setMentionPlayers] = useState(true);
  const [dmPlayers, setDmPlayers] = useState(false);
  const [attachImage, setAttachImage] = useState(true);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["discordChannels", guildId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("announce-lineup", {
        body: { action: "channels", guild_id: guildId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { channels: DiscordChannel[]; default_channel_id: string | null };
    },
    enabled: open && !!guildId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!channelId && data?.default_channel_id) setChannelId(data.default_channel_id);
  }, [data, channelId]);

  const handleAnnounce = async () => {
    if (!lineupId || !channelId) return;
    setIsSending(true);
    try {
      const image = attachImage ? await captureImage() : null;
      const { data: result, error } = await supabase.functions.invoke("announce-lineup", {
        body: {
          action: "announce",
          lineup_id: lineupId,
          channel_id: channelId,
          mention_players: mentionPlayers,
          dm_players: dmPlayers,
          message,
          image_base64: image,
        },
      });
      if (error) throw error;
      if (!result?.success) throw new Error(result?.error || "Failed to announce lineup");

      const dmNote = dmPlayers
        ? ` DMs sent to ${result.dm_sent}${result.dm_failed ? ` (${result.dm_failed} had DMs closed)` : ""}.`
        : "";
      toast.success(`Lineup posted in Discord.${dmNote}`);
      setMessage("");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish lineup to Discord</DialogTitle>
          <DialogDescription>
            Post <strong>{lineupName}</strong> to a Discord channel and let the starting XI know.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading channels...
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{(error as Error).message}</p>
            ) : (
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a channel..." />
                </SelectTrigger>
                <SelectContent>
                  {data?.channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      #{c.name}{c.parent ? ` (${c.parent})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="announce-message">Message (optional)</Label>
            <Textarea
              id="announce-message"
              placeholder="Kick-off 9pm, be online 10 minutes early."
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="mention-players">Ping the starting XI</Label>
            <Switch id="mention-players" checked={mentionPlayers} onCheckedChange={setMentionPlayers} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="dm-players">DM each starter their position</Label>
            <Switch id="dm-players" checked={dmPlayers} onCheckedChange={setDmPlayers} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="attach-image">Attach pitch graphic</Label>
            <Switch id="attach-image" checked={attachImage} onCheckedChange={setAttachImage} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button onClick={handleAnnounce} disabled={!lineupId || !channelId || isSending}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Megaphone className="h-4 w-4 mr-2" />}
            Announce
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
