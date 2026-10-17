import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { divisionLabel, signed, summarizeDivision, type DivisionSnapshotRow } from "@/lib/divisionProgress";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

// Division, skill rating and EA leaderboard rank over time, from the daily snapshots the EA sync saves
export function DivisionProgressCard({ guildId, clubKey, clubName }: { guildId: string; clubKey: string; clubName: string }) {
  const { data } = useQuery({
    queryKey: ["division-progress", guildId, clubKey],
    queryFn: async () => {
      const [{ data: history, error }, { data: matches }] = await Promise.all([
        supabase
          .from("club_division_history")
          .select("captured_on, captured_at, current_division, best_division, skill_rating, promotions, relegations, season_points, season_wins, season_draws, season_losses, season_rank, alltime_rank, leaderboard_checked")
          .eq("guild_id", guildId)
          .eq("club_key", clubKey)
          .order("captured_on", { ascending: false })
          .limit(120),
        supabase
          .from("club_matches")
          .select("result, created_at, match_type")
          .eq("guild_id", guildId)
          .eq("club_key", clubKey)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (error) throw error;
      return { history: (history || []) as DivisionSnapshotRow[], matches: matches || [] };
    },
  });

  const s = useMemo(() => {
    if (!data?.history.length) return null;
    const matches = data.matches
      .filter((m) => m.result === "win" || m.result === "draw" || m.result === "loss")
      .map((m) => ({ result: m.result as "win" | "draw" | "loss", playedAt: new Date(m.created_at), matchType: m.match_type }));
    return summarizeDivision(data.history, matches);
  }, [data]);

  if (!s) return null;

  const rank = s.seasonRank
    ? `#${s.seasonRank}`
    : s.leaderboardChecked ? "Top 100 only" : "–";
  const rankSub = s.seasonRank
    ? s.seasonRankChange ? `${s.seasonRankChange > 0 ? "Up" : "Down"} ${Math.abs(s.seasonRankChange)} places` : "This season"
    : s.leaderboardChecked ? "Outside EA's top 100" : undefined;
  const since = s.sinceRecord;
  const chart = s.trend.filter((p) => p.skillRating !== null).map((p) => ({ ...p, label: shortDate(p.date) }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" /> {clubName}: division progress</CardTitle>
        <CardDescription>Saved from EA every day since {shortDate(s.trackedSince as string)}. EA only publishes each leaderboard's top 100.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile label="Division" value={divisionLabel(s.division)} sub={s.bestDivision !== null ? `Best: ${divisionLabel(s.bestDivision)}` : undefined} />
          <Tile label="Skill rating" value={s.skillRating !== null ? String(s.skillRating) : "–"} sub={s.srChange7d !== null ? `${signed(s.srChange7d)} last 7 days` : undefined} />
          <Tile label="SR last 30 days" value={s.srChange30d !== null ? signed(s.srChange30d) : "–"} />
          <Tile label="EA season rank" value={rank} sub={rankSub} />
          <Tile label="EA all-time rank" value={s.alltimeRank ? `#${s.alltimeRank}` : s.leaderboardChecked ? "Top 100 only" : "–"} />
          <Tile
            label={s.changes.length ? "Since reaching this division" : "Division games tracked"}
            value={since.played ? `${since.wins}-${since.draws}-${since.losses}` : "–"}
            sub={since.played ? `${since.points} pts from ${since.played} games` : undefined}
          />
        </div>

        {chart.length >= 2 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={48} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: number) => [v, "Skill rating"]}
                  labelFormatter={(l, items) => {
                    const div = items?.[0]?.payload?.division;
                    return div ? `${l} · ${divisionLabel(div)}` : String(l);
                  }}
                />
                <Line type="monotone" dataKey="skillRating" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {s.changes.length > 0 && (
          <ul className="space-y-1 text-sm">
            {s.changes.slice(0, 8).map((c) => (
              <li key={c.on} className="flex items-center gap-2">
                {c.kind === "promoted" ? <ArrowUp className="h-4 w-4 text-green-500" /> : <ArrowDown className="h-4 w-4 text-red-500" />}
                {c.kind === "promoted" ? "Promoted" : "Relegated"} to {divisionLabel(c.to)}
                <span className="text-muted-foreground">{shortDate(c.on)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
