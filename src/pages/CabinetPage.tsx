import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProPhotoUploads } from "@/components/ProPhotoUploads";
import { AwardsTab, BadgesTab, BeltsTab } from "@/components/clublife/ClubLifeCabinet";

type BinderCard = { id: string; style: string; name: string; created_at: string; front_url: string | null; back_url: string | null };
type SeasonRow = { discord_user_id: string; season_code: string; matches: number; goals: number; assists: number; clean_sheets: number; tackles: number; interceptions: number; motm: number };
type Win = { id: string; competition_name: string; competition_type: string; tier: string | null; team_name: string | null; placed_at: string | null; created_at: string; verified: boolean | null };

function FlipCard({ card }: { card: BinderCard }) {
  const [flipped, setFlipped] = useState(false);
  const canFlip = !!card.back_url;
  return (
    <button
      type="button"
      onClick={() => canFlip && setFlipped((f) => !f)}
      className="group text-left [perspective:1200px]"
      aria-label={canFlip ? `Flip ${card.name} card` : `${card.name} card`}
    >
      <div
        className="relative aspect-[5/7] w-full transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(8deg)_rotateX(4deg)]"
        style={flipped ? { transform: "rotateY(180deg)" } : undefined}
      >
        <div className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-muted shadow-lg [backface-visibility:hidden]">
          {card.front_url && <img src={card.front_url} alt={`${card.name} card front`} className="h-full w-full object-cover" loading="lazy" />}
        </div>
        {canFlip && (
          <div className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-muted shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <img src={card.back_url!} alt={`${card.name} card back`} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{card.name}</span>
        <Badge variant="secondary" className="shrink-0 text-xs">{card.style}</Badge>
      </div>
      {canFlip && <span className="text-xs text-muted-foreground">Tap to flip</span>}
    </button>
  );
}

const AWARDS: { key: keyof SeasonRow | "defence"; label: string; emoji: string; value: (r: SeasonRow) => number }[] = [
  { key: "goals", label: "Golden Boot", emoji: "⚽", value: (r) => r.goals },
  { key: "assists", label: "Playmaker", emoji: "🎯", value: (r) => r.assists },
  { key: "motm", label: "MVP", emoji: "⭐", value: (r) => r.motm },
  { key: "defence", label: "The Wall", emoji: "🛡️", value: (r) => r.tackles + r.interceptions },
  { key: "clean_sheets", label: "Golden Glove", emoji: "🧤", value: (r) => r.clean_sheets },
  { key: "matches", label: "Iron Man", emoji: "🦾", value: (r) => r.matches },
];

export default function CabinetPage() {
  const { selectedGuildId } = useGuild();

  const binder = useQuery({
    queryKey: ["binder"],
    queryFn: async (): Promise<BinderCard[]> => {
      const { data, error } = await supabase.functions.invoke("player-cards", { body: { action: "binder" } });
      if (error) throw error;
      return data?.cards ?? [];
    },
  });

  const cabinet = useQuery({
    queryKey: ["cabinet", selectedGuildId],
    enabled: !!selectedGuildId,
    queryFn: async () => {
      const [seasons, wins] = await Promise.all([
        supabase.from("player_season_archive").select("discord_user_id,season_code,matches,goals,assists,clean_sheets,tackles,interceptions,motm").eq("guild_id", selectedGuildId!),
        supabase.from("competition_wins").select("id,competition_name,competition_type,tier,team_name,placed_at,created_at,verified").eq("guild_id", selectedGuildId!).order("created_at", { ascending: false }),
      ]);
      const rows = (seasons.data ?? []) as SeasonRow[];
      const ids = [...new Set(rows.map((r) => r.discord_user_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("discord_user_id,ea_username,discord_username").in("discord_user_id", ids)
        : { data: [] };
      const names = new Map((profiles ?? []).map((p) => [p.discord_user_id, p.ea_username || p.discord_username || "Unknown"]));
      const bySeason = new Map<string, SeasonRow[]>();
      for (const r of rows) bySeason.set(r.season_code, [...(bySeason.get(r.season_code) ?? []), r]);
      const seasonsOut = [...bySeason.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([code, list]) => ({
          code,
          awards: AWARDS.map((a) => {
            const best = Math.max(0, ...list.map(a.value));
            const who = best > 0 ? list.filter((r) => a.value(r) === best).map((r) => names.get(r.discord_user_id) ?? "Unknown") : [];
            return { ...a, best, who };
          }).filter((a) => a.who.length),
        }));
      return { seasons: seasonsOut, wins: ((wins.data ?? []) as Win[]).filter((w) => w.verified !== false) };
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Trophy Room</h1>
          <p className="text-muted-foreground">Your card binder, your pro photos, the club's trophy cabinet, belts, Awards Night winners and badge wall.</p>
        </div>
        <Tabs defaultValue="binder">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="binder">My Binder</TabsTrigger>
            <TabsTrigger value="cabinet">Trophy Cabinet</TabsTrigger>
            <TabsTrigger value="belts">Belts</TabsTrigger>
            <TabsTrigger value="awards">Awards</TabsTrigger>
            <TabsTrigger value="badges">Badges</TabsTrigger>
            <TabsTrigger value="photos">My Pro Photos</TabsTrigger>
          </TabsList>

          <TabsContent value="binder" className="mt-6">
            {binder.isLoading ? (
              <p className="text-muted-foreground">Opening your binder…</p>
            ) : binder.isError ? (
              <p className="text-destructive">Couldn't load your cards. Make sure your Discord account is linked.</p>
            ) : !binder.data?.length ? (
              <Card className="p-6 text-muted-foreground">No cards yet. Make one in Discord with /graphics → Player Card.</Card>
            ) : (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                {binder.data.map((c) => <FlipCard key={c.id} card={c} />)}
              </div>
            )}
          </TabsContent>

          {selectedGuildId && (
            <>
              <TabsContent value="belts" className="mt-6"><BeltsTab guildId={selectedGuildId} /></TabsContent>
              <TabsContent value="awards" className="mt-6"><AwardsTab guildId={selectedGuildId} /></TabsContent>
              <TabsContent value="badges" className="mt-6"><BadgesTab guildId={selectedGuildId} /></TabsContent>
            </>
          )}

          <TabsContent value="photos" className="mt-6">
            <ProPhotoUploads />
          </TabsContent>

          <TabsContent value="cabinet" className="mt-6 space-y-6">
            {cabinet.isLoading && <p className="text-muted-foreground">Polishing the silverware…</p>}
            {cabinet.data && (
              <>
                <section>
                  <h2 className="mb-3 font-display text-xl font-semibold">🏆 Championships</h2>
                  {cabinet.data.wins.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {cabinet.data.wins.map((w) => (
                        <Card key={w.id} className="p-4">
                          <p className="font-semibold">{w.competition_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {w.competition_type}{w.tier ? ` · ${w.tier}` : ""} · {new Date(w.placed_at ?? w.created_at).getFullYear()}
                          </p>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="p-4 text-muted-foreground">No titles recorded yet. The first one is waiting.</Card>
                  )}
                </section>
                {cabinet.data.seasons.map((s) => (
                  <section key={s.code}>
                    <h2 className="mb-3 font-display text-xl font-semibold">Season {s.code.toUpperCase()}</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {s.awards.map((a) => (
                        <Card key={a.label} className="p-4">
                          <p className="text-sm text-muted-foreground">{a.emoji} {a.label}</p>
                          <p className="font-semibold">{a.who.join(", ")}</p>
                          <p className="text-xs text-muted-foreground">{a.best}</p>
                        </Card>
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
