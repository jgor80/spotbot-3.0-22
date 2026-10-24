// The Club Life half of a player profile: career totals, badge wall with rarity, belts, this week's
// coach goal and the stories the club's paper has written about them. All of it is written by the bot.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeTile } from "@/components/clublife/BadgeTile";
import { BADGES, BELTS, TIER_ORDER, daysBetween, rarityLabel } from "@/lib/clubLife";

type Career = { club_key: string; player_key: string; player_name: string; apps: number; wins: number; goals: number; assists: number; motm: number; clean_sheets: number; hat_tricks: number; best_rating: number | null; best_match_at: string | null; first_match_at: string | null };
type BadgeRow = { player_key: string; badge: string; tier: string; earned_at: string; detail: string | null; featured: boolean };
type Reign = { trophy: string; started_at: string; ended_at: string | null };
type Goal = { label: string; status: string; result: number | null; target: number; week_start: string };
type Press = { id: string; headline: string | null; printed_at: string; kind: string };

export function CareerSection({ guildId, discordUserId }: { guildId: string; discordUserId: string }) {
  const q = useQuery({
    queryKey: ["career-section", guildId, discordUserId],
    queryFn: async () => {
      const { data: careers } = await supabase
        .from("player_career")
        .select("club_key,player_key,player_name,apps,wins,goals,assists,motm,clean_sheets,hat_tricks,best_rating,best_match_at,first_match_at")
        .eq("guild_id", guildId)
        .eq("discord_user_id", discordUserId);
      const mine = ((careers ?? []) as Career[]).sort((a, b) => b.apps - a.apps);
      if (!mine.length) return null;
      const keys = mine.map((c) => c.player_key);
      const clubs = [...new Set(mine.map((c) => c.club_key))];
      const [allBadges, players, reigns, goals, press] = await Promise.all([
        supabase.from("player_badges").select("player_key,badge,tier,earned_at,detail,featured").eq("guild_id", guildId).in("club_key", clubs).limit(5000),
        supabase.from("player_career").select("player_key", { count: "exact", head: true }).eq("guild_id", guildId).in("club_key", clubs),
        supabase.from("trophy_reigns").select("trophy,started_at,ended_at").eq("guild_id", guildId).in("player_key", keys).order("started_at", { ascending: false }).limit(50),
        supabase.from("player_goals").select("label,status,result,target,week_start").eq("guild_id", guildId).in("player_key", keys).order("week_start", { ascending: false }).limit(6),
        supabase.from("club_press").select("id,headline,printed_at,kind").eq("guild_id", guildId).overlaps("player_keys", keys).order("printed_at", { ascending: false }).limit(6),
      ]);
      const badgeRows = (allBadges.data ?? []) as BadgeRow[];
      const holders = new Map<string, number>();
      for (const b of badgeRows) holders.set(b.badge, (holders.get(b.badge) ?? 0) + 1);
      const earned = badgeRows.filter((b) => keys.includes(b.player_key)).sort((a, b) => TIER_ORDER.indexOf(b.tier as never) - TIER_ORDER.indexOf(a.tier as never) || b.earned_at.localeCompare(a.earned_at));
      return {
        career: mine[0],
        earned,
        holders,
        players: players.count ?? 0,
        reigns: (reigns.data ?? []) as Reign[],
        goals: (goals.data ?? []) as Goal[],
        press: (press.data ?? []) as Press[],
      };
    },
  });

  if (q.isLoading || !q.data) return null;
  const { career: c, earned, holders, players, reigns, goals, press } = q.data;
  const have = new Set(earned.map((b) => b.badge));
  const locked = Object.keys(BADGES).filter((k) => !have.has(k));
  const held = reigns.filter((r) => !r.ended_at);
  const goal = goals[0];

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Club career</CardTitle>
          <CardDescription>{c.first_match_at ? `Since ${new Date(c.first_match_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : "Every tracked game for the club"}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ["Apps", c.apps],
            ["Wins", c.wins],
            ["Goals", c.goals],
            ["Assists", c.assists],
            ["MOTM", c.motm],
            ["Best", c.best_rating ? Number(c.best_rating).toFixed(1) : "-"],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="font-display text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {(held.length > 0 || reigns.length > 0 || goal) && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Belts</CardTitle>
              <CardDescription>Weekly stat belts change hands as the numbers move.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {held.map((r) => <p key={r.trophy + r.started_at}><strong>{BELTS[r.trophy]?.name ?? r.trophy}</strong> · held for {daysBetween(r.started_at)} days</p>)}
              {!held.length && <p className="text-muted-foreground">No belt right now.</p>}
              {reigns.filter((r) => r.ended_at).slice(0, 4).map((r) => (
                <p key={r.trophy + r.started_at} className="text-muted-foreground">{BELTS[r.trophy]?.name ?? r.trophy} · {daysBetween(r.started_at, r.ended_at)} days, lost {new Date(r.ended_at!).toLocaleDateString()}</p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Coach goal</CardTitle>
              <CardDescription>One target a week, set from your own numbers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {goal ? (
                <>
                  <p className="font-semibold">{goal.label}</p>
                  <p className="text-muted-foreground">
                    Week of {new Date(goal.week_start).toLocaleDateString()} · {goal.status === "open" ? "in progress" : goal.status === "met" ? "✅ met" : goal.status === "missed" ? "missed" : "no games"}
                  </p>
                  {goals.slice(1).length > 0 && <p className="text-xs text-muted-foreground">Last weeks: {goals.slice(1).map((g) => (g.status === "met" ? "✅" : g.status === "missed" ? "❌" : "·")).join(" ")}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">Goals arrive with the Monday digest.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Badges</CardTitle>
          <CardDescription>{earned.length} of {Object.keys(BADGES).length} unlocked. Rare and better badges can be worn as a frame on your Studio cards (Discord: /me → My Career).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {earned.map((b) => <BadgeTile key={b.badge} badge={b.badge} detail={b.detail} featured={b.featured} rarity={rarityLabel(holders.get(b.badge) ?? 1, players)} />)}
          </div>
          {locked.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Still to unlock ({locked.length})</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {locked.map((k) => <BadgeTile key={k} badge={k} locked />)}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {press.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>In the papers</CardTitle>
            <CardDescription>Stories the club's paper has printed about {c.player_name}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {press.map((p) => (
              <p key={p.id}>
                <Link to="/paper" className="font-medium hover:underline">{p.headline || "Untitled"}</Link>
                <span className="text-muted-foreground"> · {new Date(p.printed_at).toLocaleDateString()}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
