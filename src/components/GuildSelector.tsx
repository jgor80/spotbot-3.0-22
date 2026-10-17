import { useState } from "react";
import { useGuild } from "@/contexts/GuildContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Server, ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClubTheme, themeOf, type ClubTheme } from "@/hooks/useClubTheme";

// The club's crest, else a dot in its team colours, else the server icon
function ClubMark({ theme, className }: { theme: ClubTheme | null; className?: string }) {
  if (theme?.crest) return <img src={theme.crest} alt="" className={cn("h-5 w-5 shrink-0 object-contain", className)} />;
  if (theme) return <span className={cn("h-4 w-4 shrink-0 rounded-full border border-border", className)} style={{ background: `linear-gradient(135deg, ${theme.primary} 50%, ${theme.secondary} 50%)` }} />;
  return <Server className={cn("h-4 w-4 shrink-0", className)} />;
}

export function GuildSelector({ className }: { className?: string }) {
  const { selectedGuildId, setSelectedGuildId, guilds, filteredGuilds, isLoading, searchQuery, setSearchQuery, selectedGuild } = useGuild();
  const [open, setOpen] = useState(false);
  const theme = useClubTheme();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4" />
        <span>No servers – link Discord</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[220px] justify-between bg-card border-border hover:bg-muted", className)}
          style={theme ? { boxShadow: `inset 0 -3px 0 ${theme.primary}` } : undefined}
        >
          <div className="flex items-center gap-2 truncate">
            <ClubMark theme={theme} className={theme ? undefined : "text-primary"} />
            <span className="truncate">
              {selectedGuild?.name || "Select server"}
            </span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        {/* Search Input */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Guild List */}
        <ScrollArea className="max-h-[300px]">
          <div className="p-1">
            {filteredGuilds.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No servers found.
              </div>
            ) : (
              filteredGuilds.map((guild) => (
                <button
                  key={guild.guild_id}
                  onClick={() => {
                    setSelectedGuildId(guild.guild_id);
                    setSearchQuery("");
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-left transition-colors",
                    selectedGuildId === guild.guild_id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  )}
                >
                  <ClubMark theme={guild.clubs.filter((c) => c && c.enabled !== false).map(themeOf).find(Boolean) || null} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{guild.name || `Server ${guild.guild_id.slice(-6)}`}</p>
                  </div>
                  {selectedGuildId === guild.guild_id && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
