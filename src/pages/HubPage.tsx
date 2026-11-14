import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { useDiscordLink } from "@/hooks/useDiscordLink";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HUB_BADGES, HUB_CHALLENGES, HUB_TIERS, chemLabel, challengeProgress, challengesFor, levelFor, seasonKeyOf, seasonLabel, tierFor, weekKeyOf, xpForLevel } from "@/lib/hubXp";

type HubRow = {
  discord_user_id: string;
  xp: number;
  games: number;
  wins: number;
  goals: number;
  assists: number;
  voice_minutes: number;
  mates: string[];
  badges: string[];
  streak: number;
  best_streak: number;
  week_key: string | null;
  week_xp: number;
  season_key: string | null;
  season_xp: number;
  rating: number;
  rated_games: number;
  week: Record<string, unknown> & { done?: string[] };
};

type PairRow = { user_a: string; user_b: string; games: number; rated_games: number; wins: number; minutes: number; score: number };

const TIER_STYLE: Record<string, string> = {
  common: "border-border",
  rare: "border-sky-500/50",
  epic: "border-violet-500/60",
  legendary: "border-amber-400/70",
};

function MyCard({ row, name }: { row: HubRow | null; name: string }) {
  const xp = row?.xp ?? 0;
  const level = levelFor(xp);
  const tier = tierFor(level);
  const into = xp - xpForLevel(level);
  const span = xpForLevel(level + 1) - xpForLevel(level);
  const next = HUB_TIERS.find((t) => t.level > level);
  const week = weekKeyOf();
  const w = row?.week_key === week ? row.week ?? {} : {};
  const done = new Set(w.done ?? []);
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-primary/30 via-primary/10 to-transparent p-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{name}</p>
        <h2 className="mt-1 font-display text-3xl font-bold">{tier.emoji} Level {level} {tier.name}</h2>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.round((into / Math.max(1, span)) * 100)}%` }} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {xp} XP · {into}/{span} to level {level + 1}
          {next ? ` · ${next.emoji} ${next.name} at level ${next.level}` : ""}
        </p>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">This week ({row?.week_key === week ? row.week_xp : 0} XP)</p>
          <ul className="mt-2 space-y-2">
            {challengesFor(week).map((k) => {
              const c = HUB_CHALLENGES[k];
              const p = challengeProgress(w, k);
              return (
                <li key={k} className="text-sm">
                  <div className="flex justify-between">
                    <span>{done.has(k) ? "✅" : "▫️"} {c.text}</span>
                    <span className="text-muted-foreground">{p}/{c.target}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.round((p / c.target) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">150 XP each, plus 200 XP for all three. New ones every Monday.</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Hub career</p>
          <p className="mt-2 text-sm">
            {row?.games ?? 0} games · {row?.wins ?? 0} wins · {row?.goals ?? 0}G {row?.assists ?? 0}A
            <br />
            {Math.round((row?.voice_minutes ?? 0) / 60)}h in lobbies · played with {row?.mates?.length ?? 0} people
            <br />
            {row?.streak ?? 0}-day streak (best {row?.best_streak ?? 0})
          </p>
        </div>
      </div>
      <div className="space-y-2 px-6 pb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Badges ({row?.badges?.length ?? 0}/{Object.keys(HUB_BADGES).length})
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(HUB_BADGES).map(([key, b]) => {
            const have = row?.badges?.includes(key);
            return (
              <div key={key} className={cn("rounded-lg border p-3", TIER_STYLE[b.tier], !have && "opacity-40")}>
                <p className="font-semibold">🏅 {b.name}</p>
                <p className="text-xs text-muted-foreground">{b.help} · {b.tier}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default function HubPage() {
  const { selectedGuildId } = useGuild();
  const { discordLink } = useDiscordLink();
  const me = discordLink?.discord_user_id;
  const [period, setPeriod] = useState<"week" | "season" | "rating" | "all">("week");

  const hub = useQuery({
    queryKey: ["hub-players", selectedGuildId, me],
    enabled: !!selectedGuildId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hub_players")
        .select("discord_user_id,xp,games,wins,goals,assists,voice_minutes,mates,badges,streak,best_streak,week_key,week_xp,week,season_key,season_xp,rating,rated_games")
        .eq("guild_id", selectedGuildId!)
        .order("xp", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as unknown as HubRow[];
      const [{ data: duos }, { data: mineA }, { data: mineB }, { data: fame }] = await Promise.all([
        supabase.from("hub_pairs").select("user_a,user_b,games,rated_games,wins,minutes,score").eq("guild_id", selectedGuildId!).gte("games", 3).order("score", { ascending: false }).limit(10),
        me ? supabase.from("hub_pairs").select("user_a,user_b,games,rated_games,wins,minutes,score").eq("guild_id", selectedGuildId!).eq("user_a", me) : Promise.resolve({ data: [] }),
        me ? supabase.from("hub_pairs").select("user_a,user_b,games,rated_games,wins,minutes,score").eq("guild_id", selectedGuildId!).eq("user_b", me) : Promise.resolve({ data: [] }),
        supabase.from("hub_hall_of_fame").select("season_key,place,discord_user_id,xp").eq("guild_id", selectedGuildId!).order("season_key", { ascending: false }).order("place").limit(36),
      ]);
      const partners = [...((mineA ?? []) as PairRow[]), ...((mineB ?? []) as PairRow[])].sort((a, b) => b.score - a.score).slice(0, 8);
      const ids = [...new Set([...rows.map((r) => r.discord_user_id), ...((duos ?? []) as PairRow[]).flatMap((d) => [d.user_a, d.user_b]), ...partners.flatMap((d) => [d.user_a, d.user_b]), ...(fame ?? []).map((f) => f.discord_user_id)])];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("discord_user_id,ea_username,discord_username").in("discord_user_id", ids)
        : { data: [] };
      const names = new Map((profiles ?? []).map((p) => [p.discord_user_id, p.discord_username || p.ea_username || "Player"]));
      return { rows, names, duos: (duos ?? []) as PairRow[], partners, fame: fame ?? [] };
    },
  });

  const week = weekKeyOf();
  const board = useMemo(() => {
    const rows = hub.data?.rows ?? [];
    const season = seasonKeyOf();
    const list =
      period === "week"
        ? rows.filter((r) => r.week_key === week && r.week_xp > 0).sort((a, b) => b.week_xp - a.week_xp)
        : period === "season"
          ? rows.filter((r) => r.season_key === season && r.season_xp > 0).sort((a, b) => b.season_xp - a.season_xp)
          : period === "rating"
            ? rows.filter((r) => r.rated_games > 0).sort((a, b) => b.rating - a.rating)
            : rows.filter((r) => r.xp > 0);
    return list.slice(0, 50);
  }, [hub.data, period, week]);
  const mine = (hub.data?.rows ?? []).find((r) => me && r.discord_user_id === me) ?? null;
  const nameOf = (id: string) => hub.data?.names.get(id) ?? "Player";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Hub XP</h1>
          <p className="text-muted-foreground">
            Levels, weekly challenges and badges for everyone who plays on this server, in any lobby or team. XP comes from time in voice with others, games, wins, goals, assists and starting games.
          </p>
        </div>
        {hub.isLoading && <p className="text-muted-foreground">Loading the hub…</p>}
        {!hub.isLoading && <MyCard row={mine} name={me ? nameOf(me) : "You"} />}
        {!hub.isLoading && (
          <section className="space-y-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Chemistry</h2>
              <p className="text-sm text-muted-foreground">
                Who works well together, from time in voice, games together and results. 🔥 great · ✅ good · 🤝 getting there. Build a squad from it with the Chemistry button on the hub board in Discord.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Your best partners</p>
                {!hub.data?.partners.length && <p className="mt-2 text-sm text-muted-foreground">Play a few games in the lobbies and your partners show up here.</p>}
                <ul className="mt-2 space-y-1 text-sm">
                  {hub.data?.partners.map((p) => {
                    const other = p.user_a === me ? p.user_b : p.user_a;
                    return (
                      <li key={other} className="flex justify-between gap-2">
                        <span className="truncate">{chemLabel(p.score)} {nameOf(other)}</span>
                        <span className="text-muted-foreground">
                          <b className="text-foreground">{p.score}</b> · {p.games} games{p.rated_games ? ` · ${Math.round((100 * p.wins) / p.rated_games)}% won` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Best duos on the server</p>
                {!hub.data?.duos.length && <p className="mt-2 text-sm text-muted-foreground">Not enough games yet.</p>}
                <ul className="mt-2 space-y-1 text-sm">
                  {hub.data?.duos.map((d) => (
                    <li key={`${d.user_a}:${d.user_b}`} className="flex justify-between gap-2">
                      <span className="truncate">{chemLabel(d.score)} {nameOf(d.user_a)} + {nameOf(d.user_b)}</span>
                      <span className="text-muted-foreground"><b className="text-foreground">{d.score}</b> · {d.games} games</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>
        )}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Leaderboard</h2>
            <div className="flex gap-2">
              {(["week", "season", "rating", "all"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn("rounded-full border px-3 py-1 text-sm", period === p ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}
                >
                  {p === "week" ? "This week" : p === "season" ? seasonLabel(seasonKeyOf()) : p === "rating" ? "Pickup rating" : "All time"}
                </button>
              ))}
            </div>
          </div>
          {!board.length && !hub.isLoading && (
            <Card className="p-6 text-muted-foreground">
              Nobody has XP here yet. Hub XP runs on servers with the Social Hub set up: /manager → Casual Play → Set Up Social Hub.
            </Card>
          )}
          {!!board.length && (
            <Card className="divide-y divide-border">
              {board.map((r, i) => {
                const level = levelFor(r.xp);
                const tier = tierFor(level);
                return (
                  <div key={r.discord_user_id} className={cn("flex items-center gap-3 px-4 py-3", r.discord_user_id === me && "bg-primary/10")}>
                    <span className="w-8 text-center font-display font-bold">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{nameOf(r.discord_user_id)}{r.discord_user_id === me ? " (you)" : ""}</span>
                    <span className="text-sm text-muted-foreground">{tier.emoji} L{level}</span>
                    <span className="w-24 text-right font-semibold">{period === "week" ? `${r.week_xp} XP` : period === "season" ? `${r.season_xp} XP` : period === "rating" ? r.rating : `${r.xp} XP`}</span>
                  </div>
                );
              })}
            </Card>
          )}
        </section>
        {!!hub.data?.fame.length && (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold">Hall of Fame</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...new Set(hub.data.fame.map((f) => f.season_key))].map((key) => (
                <Card key={key} className="p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{seasonLabel(key)}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {hub.data!.fame.filter((f) => f.season_key === key).map((f) => (
                      <li key={f.place} className="flex justify-between gap-2">
                        <span className="truncate">{["🥇", "🥈", "🥉"][f.place - 1]} {nameOf(f.discord_user_id)}</span>
                        <span className="text-muted-foreground">{f.xp} XP</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
