import { useGuild } from "@/contexts/GuildContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Server } from "lucide-react";

export function GuildSelector() {
  const { selectedGuildId, setSelectedGuildId, guilds, isLoading } = useGuild();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4 animate-pulse" />
        Loading...
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4" />
        No servers
      </div>
    );
  }

  return (
    <Select value={selectedGuildId || undefined} onValueChange={setSelectedGuildId}>
      <SelectTrigger className="w-[180px] bg-card border-border">
        <Server className="h-4 w-4 mr-2" />
        <SelectValue placeholder="Select server" />
      </SelectTrigger>
      <SelectContent>
        {guilds.map((guild) => (
          <SelectItem key={guild.guild_id} value={guild.guild_id}>
            {guild.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
