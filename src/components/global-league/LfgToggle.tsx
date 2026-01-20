import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Radio, 
  Wifi, 
  WifiOff, 
  Clock, 
  MessageSquare,
  Loader2,
  Gamepad2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LfgToggleProps {
  currentStatus?: string;
  currentMessage?: string;
  expiresAt?: string | null;
  clubKey?: string;
}

type LfgStatus = "offline" | "looking" | "ready";

const STATUS_CONFIG = {
  offline: {
    label: "Offline",
    description: "Not looking for games",
    icon: WifiOff,
    color: "bg-muted text-muted-foreground",
    buttonVariant: "outline" as const,
  },
  looking: {
    label: "Looking",
    description: "Browsing for opponents",
    icon: Radio,
    color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/50",
    buttonVariant: "outline" as const,
  },
  ready: {
    label: "Ready",
    description: "Available to play now",
    icon: Wifi,
    color: "bg-green-500/20 text-green-500 border-green-500/50",
    buttonVariant: "default" as const,
  },
};

export function LfgToggle({ 
  currentStatus = "offline", 
  currentMessage = "",
  expiresAt,
  clubKey = "club1"
}: LfgToggleProps) {
  const { selectedGuildId } = useGuild();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState(currentMessage);
  const [selectedStatus, setSelectedStatus] = useState<LfgStatus>(currentStatus as LfgStatus);

  const { mutate: updateStatus, isPending } = useMutation({
    mutationFn: async ({ status, lfgMessage }: { status: LfgStatus; lfgMessage?: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-global-league", {
        body: {
          action: "set-lfg-status",
          guild_id: selectedGuildId,
          club_key: clubKey,
          lfg_status: status,
          lfg_message: lfgMessage,
          expires_in_hours: 2,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Status updated!");
      queryClient.invalidateQueries({ queryKey: ["my-global-league-club"] });
      queryClient.invalidateQueries({ queryKey: ["lfg-clubs"] });
    },
    onError: (error) => {
      toast.error("Failed to update status", {
        description: error.message,
      });
    },
  });

  const handleStatusChange = (status: LfgStatus) => {
    setSelectedStatus(status);
    updateStatus({ status, lfgMessage: status !== "offline" ? message : undefined });
  };

  const getTimeRemaining = () => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return null;
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const timeRemaining = getTimeRemaining();
  const isActive = currentStatus !== "offline";

  return (
    <Card className={cn(
      "transition-all duration-300",
      isActive && "border-primary/50 shadow-lg shadow-primary/10"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5" />
            Match Availability
          </span>
          {isActive && timeRemaining && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeRemaining}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(STATUS_CONFIG) as [LfgStatus, typeof STATUS_CONFIG.offline][]).map(
            ([status, config]) => {
              const Icon = config.icon;
              const isSelected = currentStatus === status;
              
              return (
                <Button
                  key={status}
                  variant={isSelected ? "default" : "outline"}
                  className={cn(
                    "flex flex-col h-auto py-3 gap-1 transition-all",
                    isSelected && status === "ready" && "bg-green-600 hover:bg-green-700",
                    isSelected && status === "looking" && "bg-yellow-600 hover:bg-yellow-700",
                    !isSelected && "hover:border-primary/50"
                  )}
                  disabled={isPending}
                  onClick={() => handleStatusChange(status)}
                >
                  {isPending && selectedStatus === status ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                  <span className="text-xs font-medium">{config.label}</span>
                </Button>
              );
            }
          )}
        </div>

        {isActive && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>Status message (optional)</span>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Looking for a scrimmage"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={100}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || message === currentMessage}
                onClick={() => updateStatus({ status: currentStatus as LfgStatus, lfgMessage: message })}
              >
                Update
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {isActive 
            ? "Other clubs can see you're looking for games. Status expires automatically after 2 hours."
            : "Set yourself as 'Looking' or 'Ready' to let other clubs know you want to play."
          }
        </p>
      </CardContent>
    </Card>
  );
}