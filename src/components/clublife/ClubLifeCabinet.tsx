// Trophy Room tabs for Club Life: who holds each belt (and the longest reigns), Awards Night winners,
// and the club's badge wall with how rare each badge is.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { BadgeTile } from "@/components/clublife/BadgeTile";
import { BADGES, BELTS, TIER_ORDER, daysBetween, rarityLabel } from "@/lib/clubLife";

type Reign = { trophy: string; player_name: string; started_at: string; ended_at: string | null };
type Nominee = { key: string; name: string; line?: string; url?: string };
type Ballot = { id: string; period_label: string; status: string; closes_at: string; closed_at: string | null; categories: { key: string; label: string; emoji: string; nominees: Nominee[] }[]; results: Record<string, { winner: string | null; votes: Record<string, number> }> | null };
type BadgeRow = { player_key: string; player_name: string; badge: string; earned_at: string };

const Empty = ({ children }: { children: string }) => <Card className="p-6 text-muted-foreground">{children}</Card>;

export function BeltsTab({ guildId }: { guildId: string }) {
  const q = useQuery({
    queryKey: ["belts", guildId],
    queryFn: async () => {
      const { data } = await supabase.from("trophy_reigns").select("trophy,player_name,started_at,ended_at").eq("guild_id", guildId).order("started_at", { ascending: false }).limit(1000);
      return (data ?? []) as Reign[];
    },
  });
  if (q.isLoading) return <p className="text-muted-foreground">Checking the belts…</p>;
  const reigns = q.data ?? [];
  if (!reigns.length) return <Empty>No belts yet. They start changing hands once the club plays and Stat Trophies are on.</Empty>;
  const longest = [...reigns].sort((a, b) => daysBetween(b.started_at, b.ended_at) - daysBetween(a.started_at, a.ended_at)).slice(0, 5);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(BELTS).map(([key, belt]) => {
          const now = reigns.find((r) => r.trophy === key && !r.ended_at);
          const count = reigns.filter((r) => r.trophy === key).length;
          return (
            <Card key={key} className="p-4">
              <p className="text-sm text-muted-foreground">{belt.name}</p>
              <p className="font-semibold">{now ? now.player_name : "Vacant"}</p>
              <p className="text-xs text-muted-foreground">{now ? `${daysBetween(now.started_at)} days · ` : ""}{count} reign{count === 1 ? "" : "s"} so far</p>
            </Card>
          );
        })}
      </div>
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Longest reigns</h2>
        <Card className="divide-y divide-border">
          {longest.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span><strong>{r.player_name}</strong> · {BELTS[r.trophy]?.name ?? r.trophy}</span>
              <span className="text-muted-foreground">{daysBetween(r.started_at, r.ended_at)} days{r.ended_at ? "" : " and counting"}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

export function AwardsTab({ guildId }: { guildId: string }) {
  const q = useQuery({
    queryKey: ["awards", guildId],
    queryFn: async () => {
      const { data } = await supabase.from("club_award_ballots").select("id,period_label,status,closes_at,closed_at,categories,results").eq("guild_id", guildId).order("opens_at", { ascending: false }).limit(24);
      return (data ?? []) as unknown as Ballot[];
    },
  });
  if (q.isLoading) return <p className="text-muted-foreground">Setting out the chairs…</p>;
  const ballots = q.data ?? [];
  if (!ballots.length) return <Empty>No Awards Night yet. One opens on the 1st of each month in Discord, or a leader can start one from /manager → Club Life.</Empty>;
  return (
    <div className="space-y-6">
      {ballots.map((b) => (
        <section key={b.id}>
          <h2 className="mb-3 font-display text-xl font-semibold">
            {b.period_label} Awards {b.status === "open" && <span className="text-sm font-normal text-primary">· voting open in Discord until {new Date(b.closes_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {b.categories.map((c) => {
              const result = b.results?.[c.key];
              const winner = c.nominees.find((n) => n.key === result?.winner);
              return (
                <Card key={c.key} className="p-4">
                  <p className="text-sm text-muted-foreground">{c.emoji} {c.label}</p>
                  {winner ? (
                    <>
                      <p className="font-semibold">{winner.name}</p>
                      {winner.line && <p className="text-xs text-muted-foreground">{winner.line}</p>}
                      {winner.url && <a href={winner.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Watch the clip</a>}
                    </>
                  ) : (
                    <p className="text-sm">{b.status === "open" ? c.nominees.map((n) => n.name).join(", ") : "No votes cast"}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BadgesTab({ guildId }: { guildId: string }) {
  const q = useQuery({
    queryKey: ["club-badges", guildId],
    queryFn: async () => {
      const [badges, players] = await Promise.all([
        supabase.from("player_badges").select("player_key,player_name,badge,earned_at").eq("guild_id", guildId).order("earned_at", { ascending: true }).limit(5000),
        supabase.from("player_career").select("player_key", { count: "exact", head: true }).eq("guild_id", guildId),
      ]);
      return { rows: (badges.data ?? []) as BadgeRow[], players: players.count ?? 0 };
    },
  });
  if (q.isLoading) return <p className="text-muted-foreground">Polishing the medals…</p>;
  const { rows, players } = q.data ?? { rows: [], players: 0 };
  if (!rows.length) return <Empty>No badges yet. They unlock from real EA match data as the club plays.</Empty>;
  const keys = Object.keys(BADGES).sort((a, b) => TIER_ORDER.indexOf(BADGES[b].tier) - TIER_ORDER.indexOf(BADGES[a].tier));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => {
        const holders = rows.filter((r) => r.badge === k);
        if (!holders.length) return <BadgeTile key={k} badge={k} locked />;
        const names = holders.map((h) => h.player_name);
        return (
          <div key={k} className="space-y-1">
            <BadgeTile badge={k} rarity={rarityLabel(holders.length, players)} />
            <p className="px-1 text-xs text-muted-foreground">First: {names[0]}{names.length > 1 ? ` · also ${names.slice(1, 4).join(", ")}${names.length > 4 ? ` +${names.length - 4}` : ""}` : ""}</p>
          </div>
        );
      })}
    </div>
  );
}
