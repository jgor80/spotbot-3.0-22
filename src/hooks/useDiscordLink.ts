import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DiscordLink {
  id: string;
  auth_user_id: string;
  discord_user_id: string;
  verified: boolean;
  created_at: string;
}

export function useDiscordLink() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: discordLink, isLoading, error } = useQuery({
    queryKey: ["discordLink", user?.id],
    queryFn: async (): Promise<DiscordLink | null> => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("user_discord_links")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const linkDiscordMutation = useMutation({
    mutationFn: async (discordUsername: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      // Look up the Discord user ID from the profiles table by username
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("discord_user_id")
        .ilike("discord_username", discordUsername.trim())
        .maybeSingle();
      
      if (profileError) throw profileError;
      if (!profile) {
        throw new Error("Discord username not found. Make sure you've played at least one tracked game.");
      }

      const { data, error } = await supabase
        .from("user_discord_links")
        .insert({
          auth_user_id: user.id,
          discord_user_id: profile.discord_user_id,
          verified: false,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("This Discord account is already linked to another user");
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discordLink", user?.id] });
    },
  });

  const unlinkDiscordMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_discord_links")
        .delete()
        .eq("auth_user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discordLink", user?.id] });
    },
  });

  return {
    discordLink,
    isLoading,
    error,
    linkDiscord: linkDiscordMutation.mutate,
    unlinkDiscord: unlinkDiscordMutation.mutate,
    isLinking: linkDiscordMutation.isPending,
    isUnlinking: unlinkDiscordMutation.isPending,
    linkError: linkDiscordMutation.error,
  };
}
