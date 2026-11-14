import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Public Social Hub page (gafferbot.app/play/<slug>): a server opted in from Discord, and the bot keeps
// the snapshot fresh (public/spotbot/social-hub.cjs publish). Lobby counts and open positions only.
type Snapshot = {
  playing?: number;
  lobbies?: { name: string; humans: number; live: boolean; open: string[] }[];
  leaders?: { name: string; xp: number; level: number | null }[];
};

export default function PlayPage() {
  const { slug } = useParams();
  const hub = useQuery({
    queryKey: ["hub-public", slug],
    enabled: !!slug,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("hub_public").select("name,icon_url,invite_code,members,snapshot,updated_at").eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const snap = (hub.data?.snapshot ?? {}) as Snapshot;
  const join = hub.data?.invite_code ? `https://discord.gg/${hub.data.invite_code}` : null;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {hub.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!hub.isLoading && !hub.data && (
          <Card className="p-6">
            <h1 className="font-display text-2xl font-bold">Hub not found</h1>
            <p className="mt-2 text-muted-foreground">This Social Hub isn't public, or the link is wrong.</p>
          </Card>
        )}
        {hub.data && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              {hub.data.icon_url && <img src={hub.data.icon_url} alt="" className="h-16 w-16 rounded-2xl" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">EA FC Pro Clubs Social Hub</p>
                <h1 className="truncate font-display text-3xl font-bold">{hub.data.name}</h1>
                <p className="text-muted-foreground">
                  {snap.playing ? `${snap.playing} playing right now` : "Nobody on right now: be the first"}
                  {hub.data.members ? ` · ${hub.data.members} members` : ""}
                </p>
              </div>
              {join && (
                <Button asChild size="lg">
                  <a href={join} target="_blank" rel="noopener noreferrer">Join and play</a>
                </Button>
              )}
            </div>
            <Card className="p-5">
              <p className="text-sm">
                Drop in any time: no trials, no sign-ups. Press <b>Play now</b> on the board in Discord and GafferBot puts you in the lobby that needs your position.
                Smalls, friendlies, pickup drafts, a weekly tournament, levels and badges.
              </p>
            </Card>
            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold">Lobbies</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {(snap.lobbies ?? []).map((l) => (
                  <Card key={l.name} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{l.humans ? (l.live ? "🎮" : "🟢") : "⚪"} {l.name}</span>
                      <span className={cn("text-sm", l.humans ? "text-foreground" : "text-muted-foreground")}>{l.humans}/11{l.live ? " · in a game" : ""}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{l.humans ? (l.open.length ? `Open: ${l.open.join(", ")}` : "Full") : "Empty: jump in and start one"}</p>
                  </Card>
                ))}
              </div>
            </section>
            {!!snap.leaders?.length && (
              <section className="space-y-3">
                <h2 className="font-display text-xl font-semibold">This week's top players</h2>
                <Card className="divide-y divide-border">
                  {snap.leaders.map((r, i) => (
                    <div key={`${r.name}-${i}`} className="flex items-center gap-3 px-4 py-2">
                      <span className="w-8 text-center font-display font-bold">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      {r.level && <span className="text-sm text-muted-foreground">L{r.level}</span>}
                      <span className="w-20 text-right font-semibold">{r.xp} XP</span>
                    </div>
                  ))}
                </Card>
              </section>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Updated {new Date(hub.data.updated_at).toLocaleTimeString()} · Powered by <a href="/" className="underline">GafferBot</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
