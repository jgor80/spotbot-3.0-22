import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Loader2 } from "lucide-react";

interface FeedbackSettingsCardProps {
  guildId: string | null;
}

export function FeedbackSettingsCard({ guildId }: FeedbackSettingsCardProps) {
  const { toast } = useToast();
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current setting
  useEffect(() => {
    async function fetchSettings() {
      if (!guildId) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("guild_settings")
          .select("feedback_enabled")
          .eq("guild_id", guildId)
          .maybeSingle();

        if (error) throw error;

        // If no settings exist, default to true
        setFeedbackEnabled(data?.feedback_enabled ?? true);
      } catch (error) {
        console.error("Failed to fetch feedback settings:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, [guildId]);

  const handleToggle = async (enabled: boolean) => {
    if (!guildId) {
      toast({
        title: "No Guild Selected",
        description: "Please select a guild first.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("guild_settings")
        .update({ feedback_enabled: enabled })
        .eq("guild_id", guildId);

      if (error) throw error;

      setFeedbackEnabled(enabled);
      toast({
        title: enabled ? "Feedback Enabled" : "Feedback Disabled",
        description: enabled 
          ? "Players will receive DMs to rate teammates after matches."
          : "Feedback DMs will no longer be sent after matches.",
      });
    } catch (error) {
      toast({
        title: "Failed to Update",
        description: (error as Error).message,
        variant: "destructive",
      });
      // Revert the switch
      setFeedbackEnabled(!enabled);
    } finally {
      setIsSaving(false);
    }
  };

  if (!guildId) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5 text-primary" />
          Peer Feedback
        </CardTitle>
        <CardDescription>
          Control whether players receive DMs to rate teammates after matches
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="feedback-toggle" className="font-medium">
              Enable Feedback DMs
            </Label>
            <p className="text-sm text-muted-foreground">
              {feedbackEnabled 
                ? "Players will be asked to rate teammates after each match"
                : "No feedback DMs will be sent"}
            </p>
          </div>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              id="feedback-toggle"
              checked={feedbackEnabled}
              onCheckedChange={handleToggle}
              disabled={isSaving}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}