import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PressEmbed, type PressBody } from "@/components/clublife/PressEmbed";

const PAGE = 15;
const SECTIONS: Record<string, { label: string; kinds: string[] }> = {
  all: { label: "Everything", kinds: [] },
  editions: { label: "Editions", kinds: ["edition", "session"] },
  reports: { label: "Match reports", kinds: ["match_report"] },
  wire: { label: "Network wire", kinds: ["network_wire"] },
};

type PressRow = { id: string; kind: string; printed_at: string; headline: string | null; body: PressBody };

export default function NewspaperPage() {
  const { selectedGuildId } = useGuild();
  const [section, setSection] = useState("all");

  const press = useInfiniteQuery({
    queryKey: ["club-press", selectedGuildId, section],
    enabled: !!selectedGuildId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<PressRow[]> => {
      let q = supabase.from("club_press").select("id,kind,printed_at,headline,body").eq("guild_id", selectedGuildId!).order("printed_at", { ascending: false }).range(pageParam, pageParam + PAGE - 1);
      const kinds = SECTIONS[section].kinds;
      if (kinds.length) q = q.in("kind", kinds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PressRow[];
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  const rows = press.data?.pages.flat() ?? [];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">The Paper</h1>
          <p className="text-muted-foreground">Every Chronicle edition, match report and Network wire the club's paper has printed in Discord.</p>
        </div>
        <Tabs value={section} onValueChange={setSection}>
          <TabsList>
            {Object.entries(SECTIONS).map(([k, s]) => (
              <TabsTrigger key={k} value={k}>{s.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {press.isLoading && <p className="text-muted-foreground">Fetching the morning papers…</p>}
        {press.isError && <p className="text-destructive">Couldn't load the paper.</p>}
        {!press.isLoading && !rows.length && (
          <Card className="p-6 text-muted-foreground">Nothing printed yet. The Chronicle goes out overnight after a session, and match reports post after each game once the paper is switched on in Autopilot.</Card>
        )}
        <div className="space-y-5">
          {rows.map((r) => <PressEmbed key={r.id} body={r.body} printedAt={r.printed_at} />)}
        </div>
        {press.hasNextPage && (
          <Button variant="outline" className="w-full" onClick={() => press.fetchNextPage()} disabled={press.isFetchingNextPage}>
            {press.isFetchingNextPage ? "Loading…" : "Older editions"}
          </Button>
        )}
      </div>
    </DashboardLayout>
  );
}
