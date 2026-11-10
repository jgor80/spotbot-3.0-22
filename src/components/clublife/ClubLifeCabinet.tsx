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

// Matchday Picks (public/spotbot/matchday-picks.cjs): the season table, the Oracle and recent nights
const VERDICTS: Record<string, string> = {
  win: "📈 more wins than losses",
  even: "⚖️ wins and losses level",
  loss: "📉 more losses than wins",
};
type Round = { id: string; season_key: string; season_label: string | null; status: string; opened_at: string; outcome: { games: number; wins: number; draws: number; losses: number; verdict: string; topScorers: string[]; topGoals: number; players: Record<string, { name: string }> } | null; potn_options: { key: string; name: string; line: string }[] | null; potn_winner: string | null };
type PickRow = { round_id: string; discord_user_id: string; points: number };

export function PicksTab({ guildId }: { guildId: string }) {
  const q = useQuery({
    queryKey: ["matchday-picks", guildId],
    queryFn: async () => {
      const { data: rounds } = await supabase.from("matchday_rounds").select("id,season_key,season_label,status,opened_at,outcome,potn_options,potn_winner").eq("guild_id", guildId).in("status", ["voting", "closed"]).order("opened_at", { ascending: false }).limit(200);
      const list = (rounds ?? []) as unknown as Round[];
      const season = list[0]?.season_key;
      const ids = list.filter((r) => r.season_key === season).map((r) => r.id);
      const { data: picks } = ids.length ? await supabase.from("matchday_picks").select("round_id,discord_user_id,points").in("round_id", ids) : { data: [] };
      const rows = (picks ?? []) as PickRow[];
      const users = [...new Set(rows.map((p) => p.discord_user_id))];
      const { data: profiles } = users.length ? await supabase.from("profiles").select("discord_user_id,ea_username,discord_username").in("discord_user_id", users) : { data: [] };
      const names = new Map((profiles ?? []).map((p) => [p.discord_user_id, p.discord_username || p.ea_username || "Member"]));
      const by = new Map<string, { id: string; points: number; nights: number; best: number }>();
      for (const p of rows) {
        const r = by.get(p.discord_user_id) ?? { id: p.discord_user_id, points: 0, nights: 0, best: 0 };
        r.points += p.points;
        r.nights++;
        r.best = Math.max(r.best, p.points);
        by.set(p.discord_user_id, r);
      }
      const table = [...by.values()].sort((a, b) => b.points - a.points || b.best - a.best || a.nights - b.nights).map((r) => ({ ...r, name: names.get(r.id) ?? "Member" }));
      return { table, rounds: list.slice(0, 8), seasonLabel: list[0]?.season_label || season };
    },
  });
  if (q.isLoading) return <p className="text-muted-foreground">Reading the tea leaves…</p>;
  const { table, rounds, seasonLabel } = q.data ?? { table: [], rounds: [], seasonLabel: "" };
  if (!rounds.length) return <Empty>No Matchday Picks scored yet. Picks open in Discord when the first player joins the club's voice channel, or a leader opens them from /manager → Club Life.</Empty>;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Season {seasonLabel} table</h2>
        <Card className="divide-y divide-border">
          {table.slice(0, 20).map((r, i) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span>{i === 0 ? "👁️" : `${i + 1}.`} <strong>{r.name}</strong>{i === 0 && <span className="ml-1 text-xs text-primary">The Oracle</span>}</span>
              <span className="text-muted-foreground"><strong className="text-foreground">{r.points}</strong> pts · {r.nights} night{r.nights === 1 ? "" : "s"} · best {r.best}</span>
            </div>
          ))}
          {!table.length && <p className="p-3 text-sm text-muted-foreground">Nobody has scored yet this season.</p>}
        </Card>
      </section>
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Recent nights</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {rounds.map((r) => {
            const o = r.outcome;
            const fan = r.potn_options?.find((p) => p.key === r.potn_winner);
            return (
              <Card key={r.id} className="space-y-1 p-4 text-sm">
                <p className="text-muted-foreground">{new Date(r.opened_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                {o && <p className="font-semibold">{o.wins}W {o.draws}D {o.losses}L · {VERDICTS[o.verdict] ?? o.verdict}</p>}
                {o?.topScorers?.length ? <p>⚽ Top scorer: {o.topScorers.map((k) => o.players[k]?.name ?? k).join(", ")} ({o.topGoals})</p> : null}
                <p>⭐ Fans' Player of the Night: {fan ? fan.name : r.status === "voting" ? "voting open in Discord" : "no votes"}</p>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Rivalries (public/spotbot/rivalries.cjs): every club played 3+ times
type Rival = { club_key: string; opponent: string; level: string; games: number; wins: number; draws: number; losses: number; goals_for: number; goals_against: number; form: string | null; biggest_win: { score: string } | null; last_result: { result: string; score: string; at: string } | null };

export function RivalsTab({ guildId }: { guildId: string }) {
  const q = useQuery({
    queryKey: ["rivals", guildId],
    queryFn: async () => {
      const { data } = await supabase.from("club_rivalries").select("club_key,opponent,level,games,wins,draws,losses,goals_for,goals_against,form,biggest_win,last_result").eq("guild_id", guildId).order("games", { ascending: false }).limit(60);
      return (data ?? []) as unknown as Rival[];
    },
  });
  if (q.isLoading) return <p className="text-muted-foreground">Checking the grudges…</p>;
  const rivals = q.data ?? [];
  if (!rivals.length) return <Empty>No rivals yet. Any club you play 3 or more times becomes one.</Empty>;
  const nemesis = [...rivals].filter((r) => r.losses > r.wins).sort((a, b) => b.losses - b.wins - (a.losses - a.wins))[0];
  const favourite = [...rivals].filter((r) => r.wins > r.losses).sort((a, b) => b.wins - b.losses - (a.wins - a.losses))[0];
  return (
    <div className="space-y-6">
      {(nemesis || favourite) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {nemesis && <Card className="p-4"><p className="text-sm text-muted-foreground">😈 Nemesis</p><p className="font-semibold">{nemesis.opponent}</p><p className="text-xs text-muted-foreground">{nemesis.wins}W {nemesis.draws}D {nemesis.losses}L</p></Card>}
          {favourite && <Card className="p-4"><p className="text-sm text-muted-foreground">😁 Favourite opponent</p><p className="font-semibold">{favourite.opponent}</p><p className="text-xs text-muted-foreground">{favourite.wins}W {favourite.draws}D {favourite.losses}L</p></Card>}
        </div>
      )}
      <Card className="divide-y divide-border">
        {rivals.map((r) => (
          <div key={r.club_key + r.opponent} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>{r.level === "derby" ? "🔥" : "⚔️"} <strong>{r.opponent}</strong> <span className="text-muted-foreground">· {r.games} meetings</span></span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{r.wins}W {r.draws}D {r.losses}L</strong> · {r.goals_for}-{r.goals_against}
              {r.form ? ` · form ${r.form}` : ""}{r.biggest_win ? ` · best ${r.biggest_win.score}` : ""}
            </span>
          </div>
        ))}
      </Card>
      <p className="text-xs text-muted-foreground">10 or more meetings makes it a derby 🔥. Updated after every synced game.</p>
    </div>
  );
}
