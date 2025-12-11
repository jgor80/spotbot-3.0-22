import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Guild {
  guild_id: string;
  name: string;
  clubs: Array<{ key: string; name: string; enabled: boolean }>;
}

interface GuildContextType {
  selectedGuildId: string | null;
  setSelectedGuildId: (id: string) => void;
  guilds: Guild[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredGuilds: Guild[];
  selectedGuild: Guild | null;
}

const GuildContext = createContext<GuildContextType | undefined>(undefined);

export function GuildProvider({ children }: { children: ReactNode }) {
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(() => {
    return localStorage.getItem("selectedGuildId");
  });
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchGuilds() {
      try {
        // Fetch guilds from guild_settings with their club configurations
        const { data, error } = await supabase
          .from("guild_settings")
          .select("guild_id, clubs");

        if (error) throw error;

        // Also try to get guild names from profiles table (discord servers don't store names directly)
        // We'll use the first enabled club name as a fallback display name
        const guildList = (data || []).map((g) => {
          let clubs: Array<{ key: string; name: string; enabled: boolean }> = [];
          
          // Parse clubs JSON safely
          try {
            if (Array.isArray(g.clubs)) {
              clubs = g.clubs as Array<{ key: string; name: string; enabled: boolean }>;
            }
          } catch {
            clubs = [];
          }
          
          // Use first enabled club name as guild display name, or fallback to ID
          const enabledClub = clubs.find(c => c.enabled);
          const displayName = enabledClub?.name || `Server ${g.guild_id.slice(-6)}`;

          return {
            guild_id: g.guild_id,
            name: displayName,
            clubs,
          };
        });

        setGuilds(guildList);

        // Auto-select first guild if none selected
        if (!selectedGuildId && guildList.length > 0) {
          setSelectedGuildId(guildList[0].guild_id);
        }
      } catch (err) {
        console.error("Failed to fetch guilds:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchGuilds();
  }, []);

  useEffect(() => {
    if (selectedGuildId) {
      localStorage.setItem("selectedGuildId", selectedGuildId);
    }
  }, [selectedGuildId]);

  // Filter guilds based on search query
  const filteredGuilds = guilds.filter((guild) =>
    guild.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    guild.guild_id.includes(searchQuery)
  );

  // Get the currently selected guild object
  const selectedGuild = guilds.find(g => g.guild_id === selectedGuildId) || null;

  return (
    <GuildContext.Provider
      value={{
        selectedGuildId,
        setSelectedGuildId,
        guilds,
        isLoading,
        searchQuery,
        setSearchQuery,
        filteredGuilds,
        selectedGuild,
      }}
    >
      {children}
    </GuildContext.Provider>
  );
}

export function useGuild() {
  const context = useContext(GuildContext);
  if (context === undefined) {
    throw new Error("useGuild must be used within a GuildProvider");
  }
  return context;
}
