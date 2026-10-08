import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

interface Props {
  guildId?: string | null;
  discordUserId: string;
}

export function CareerSets({ guildId, discordUserId }: Props) {
  const { data } = useQuery({
    queryKey: ["careerSets", guildId, discordUserId],
    queryFn: async () => {
      const [{ data: seasons }, { data: rows }] = await Promise.all([
        supabase.from("ea_seasons").select("code,label,starts_at").order("starts_at", { ascending: false }),
        (() => {
          let q = supabase.from("player_season_archive").select("*").eq("discord_user_id", discordUserId);
          if (guildId) q = q.eq("guild_id", guildId);
          return q;
        })(),
      ]);
      const latest = seasons?.[0]?.code;
      return (seasons || [])
        .map((s) => ({ ...s, current: s.code === latest, row: (rows || []).find((r) => r.season_code === s.code) }))
        .filter((s) => s.row && s.row.matches > 0);
    },
    staleTime: 10 * 60 * 1000,
  });

  if (!data?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Layers className="h-5 w-5 text-primary" /> Career Sets
        </CardTitle>
        <p className="text-sm text-muted-foreground">Every competitive season, saved for good — one card set per game.</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map(({ code, label, current, row }) => (
          <div key={code} className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-lg font-bold">{label}</span>
              <Badge variant={current ? "default" : "outline"}>{current ? "In print" : "Closed set"}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <Stat k="Apps" v={row!.matches} />
              <Stat k="Goals" v={row!.goals} />
              <Stat k="Assists" v={row!.assists} />
              <Stat k="Wins" v={row!.wins} />
              <Stat k="MOTM" v={row!.motm} />
              <Stat k="Rating" v={row!.avg_rating ?? "—"} />
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pro stat card</div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <Stat k="Shots" v={row!.shots ?? 0} />
                <Stat k="GK Saves" v={row!.saves ?? 0} />
                <Stat k="Chances*" v={row!.chances_created ?? 0} />
                <Stat k="Hockey Ast*" v={row!.hockey_assists ?? 0} />
                <Stat
                  k="Take-ons*"
                  v={row!.take_on_attempts ? `${row!.dribbles ?? 0}/${row!.take_on_attempts} (${Math.round(((row!.dribbles ?? 0) * 100) / row!.take_on_attempts)}%)` : row!.dribbles ?? 0}
                />
                <Stat
                  k="Net Poss.*"
                  v={(() => { const n = (row!.possessions_won ?? 0) - (row!.possessions_lost ?? 0); return n > 0 ? `+${n}` : n; })()}
                />
                <Stat k="Recoveries*" v={row!.ball_recoveries ?? 0} />
                <Stat k="Def. Stops*" v={row!.defensive_stops ?? 0} />
                <Stat k="Interceptions*" v={row!.interceptions ?? 0} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">* From EA's hidden match data (OurProClub-style, refined). Hockey assists only count build-up passes not already an assist.</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Stat({ k, v }: { k: string; v: number | string }) {
  return (
    <div>
      <div className="font-bold">{v}</div>
      <div className="text-xs text-muted-foreground">{k}</div>
    </div>
  );
}
