import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Guild {
  guild_id: string;
  name: string;
}

interface GuildContextType {
  selectedGuildId: string | null;
  setSelectedGuildId: (id: string) => void;
  guilds: Guild[];
  isLoading: boolean;
}

const GuildContext = createContext<GuildContextType | undefined>(undefined);

export function GuildProvider({ children }: { children: ReactNode }) {
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(() => {
    return localStorage.getItem("selectedGuildId");
  });
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchGuilds() {
      try {
        // Fetch unique guilds from guild_settings
        const { data, error } = await supabase
          .from("guild_settings")
          .select("guild_id, clubs");

        if (error) throw error;

        const guildList = (data || []).map((g) => ({
          guild_id: g.guild_id,
          name: `Server ${g.guild_id.slice(-4)}`, // Fallback name
        }));

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

  return (
    <GuildContext.Provider value={{ selectedGuildId, setSelectedGuildId, guilds, isLoading }}>
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
