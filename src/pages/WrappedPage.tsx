import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { useDiscordLink } from "@/hooks/useDiscordLink";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BadgeTile } from "@/components/clublife/BadgeTile";
import { cn } from "@/lib/utils";

type Wrapped = {
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  goals: number;
  assists: number;
  motm: number;
  avgRating: number | null;
  bestNight: { at: string; games: number; goals: number; assists: number; avg: number } | null;
  partner: { name: string; games: number; winPct: number } | null;
  rival: { opponent: string; games: number; wins: number; losses: number } | null;
  badges: { badge: string; detail?: string | null }[];
  title: { key: string; text: string; stat: string };
};
type Row = { period_key: string; period_label: string; player_key: string; player_name: string; discord_user_id: string | null; created_at: string; data: Wrapped };

// Same tiles as the bot's Wrapped image (public/spotbot/wrapped.cjs wrappedTiles)
function tiles(d: Wrapped) {
  const out: { label: string; value: string; sub?: string | null }[] = [
    { label: "Games", value: `${d.games}`, sub: `${d.wins}W ${d.draws}D ${d.losses}L · ${d.winPct}% won` },
    { label: "Goals + assists", value: `${d.goals} + ${d.assists}`, sub: d.motm ? `${d.motm}× Man of the Match` : d.avgRating ? `${d.avgRating.toFixed(2)} average rating` : null },
  ];
  if (d.bestNight) out.push({ label: "Best night", value: `${d.bestNight.avg.toFixed(1)} avg`, sub: `${new Date(d.bestNight.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.bestNight.games} games, ${d.bestNight.goals}G ${d.bestNight.assists}A` });
  if (d.partner) out.push({ label: "Favourite partner", value: d.partner.name, sub: `${d.partner.games} games together · ${d.partner.winPct}% won` });
  if (d.rival) out.push({ label: "Most-faced opponent", value: d.rival.opponent, sub: `${d.rival.games} meetings · ${d.rival.wins}W ${d.rival.losses}L` });
  out.push({ label: "The stat", value: d.title.stat, sub: d.title.key === "squad" ? null : "Best in the club" });
  return out.slice(0, 6);
}

function WrappedCard({ row }: { row: Row }) {
  const d = row.data;
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-primary/30 via-primary/10 to-transparent p-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{row.period_label} Wrapped</p>
        <h2 className="mt-1 font-display text-3xl font-bold">{d.name}</h2>
        <p className="mt-1 text-lg">{d.title.text}</p>
      </div>
      <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {tiles(d).map((t) => (
          <div key={t.label} className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t.label}</p>
            <p className="mt-1 truncate font-display text-2xl font-bold">{t.value}</p>
            {t.sub && <p className="text-xs text-muted-foreground">{t.sub}</p>}
          </div>
        ))}
      </div>
      {!!d.badges?.length && (
        <div className="space-y-2 px-6 pb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Badges earned</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.badges.map((b) => <BadgeTile key={b.badge} badge={b.badge} detail={b.detail} />)}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function WrappedPage() {
  const { selectedGuildId } = useGuild();
  const { discordLink } = useDiscordLink();
  const me = discordLink?.discord_user_id;
  const [period, setPeriod] = useState<string>("");
  const [viewing, setViewing] = useState<string>("");

  const wrapped = useQuery({
    queryKey: ["player-wrapped", selectedGuildId],
    enabled: !!selectedGuildId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("player_wrapped")
        .select("period_key,period_label,player_key,player_name,discord_user_id,created_at,data")
        .eq("guild_id", selectedGuildId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const periods = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of wrapped.data ?? []) if (!seen.has(r.period_key)) seen.set(r.period_key, r.period_label);
    return [...seen.entries()];
  }, [wrapped.data]);

  useEffect(() => {
    if (!period && periods.length) setPeriod(periods[0][0]);
  }, [period, periods]);

  const inPeriod = (wrapped.data ?? []).filter((r) => r.period_key === period).sort((a, b) => b.data.games - a.data.games);
  const mine = inPeriod.find((r) => me && r.discord_user_id === me);
  const shown = inPeriod.find((r) => r.player_key === viewing) ?? mine ?? inPeriod[0];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Club Wrapped</h1>
            <p className="text-muted-foreground">Your month or season in one card: games, best night, favourite partner, most-faced opponent and the badges you earned.</p>
          </div>
          {periods.length > 0 && (
            <Select value={period} onValueChange={(v) => { setPeriod(v); setViewing(""); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Period" /></SelectTrigger>
              <SelectContent>
                {periods.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        {wrapped.isLoading && <p className="text-muted-foreground">Wrapping it up…</p>}
        {!wrapped.isLoading && !inPeriod.length && (
          <Card className="p-6 text-muted-foreground">No Wrapped yet. GafferBot makes them on the 1st of each month and at the end of each EA season, or a leader can run one now from Discord: /manager → Club Life → Wrapped.</Card>
        )}
        {shown && <WrappedCard row={shown} />}
        {inPeriod.length > 1 && (
          <section>
            <h2 className="mb-3 font-display text-xl font-semibold">The squad's Wrapped</h2>
            <div className="flex flex-wrap gap-2">
              {inPeriod.map((r) => (
                <button
                  key={r.player_key}
                  type="button"
                  onClick={() => setViewing(r.player_key)}
                  className={cn("rounded-full border px-3 py-1 text-sm", r.player_key === shown?.player_key ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}
                >
                  {r.player_name}{r === mine ? " (you)" : ""}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
