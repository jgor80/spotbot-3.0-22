import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { filterPlayers, type BoardClub, type BoardPlayer, type TransferMove } from "@/lib/transfers";
import { isPublicPlatform, publicClubPath } from "@/lib/publicClub";
import { Crest } from "@/components/publicClub/publicClubApi";

type Board = { players: BoardPlayer[]; clubs: BoardClub[]; moves: TransferMove[] };

const LINES = [
  ["all", "All positions"],
  ["GK", "Goalkeepers"],
  ["DEF", "Defenders"],
  ["MID", "Midfielders"],
  ["ATT", "Attackers"],
] as const;

const PLATFORMS: Record<string, string> = { ps5: "PS5", xbox: "Xbox", pc: "PC", switch: "Switch" };

const ago = (iso: string) => {
  const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

function ClubLink({ id, platform, name }: { id: string; platform: string; name: string | null }) {
  const label = name || "another club";
  return isPublicPlatform(platform) && /^\d+$/.test(id) ? <Link to={publicClubPath(platform, id)} className="font-medium hover:underline">{label}</Link> : <span className="font-medium">{label}</span>;
}

// gafferbot.app/transfers: players looking for a club, clubs recruiting and transfer news, no sign-in
export default function TransfersPage() {
  const [line, setLine] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const board = useQuery({
    queryKey: ["transfer-board"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("transfer-board", { method: "GET" });
      if (error) throw new Error("Couldn't load the transfer board right now.");
      return data as Board;
    },
  });
  const players = useMemo(
    () => filterPlayers(board.data?.players ?? [], { line: line === "all" ? undefined : line, platform: platform === "all" ? undefined : platform, verifiedOnly }),
    [board.data, line, platform, verifiedOnly]
  );

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">EA FC 27 Pro Clubs</p>
          <h1 className="font-display text-3xl font-bold">Transfer board</h1>
          <p className="mt-1 text-muted-foreground">
            Players looking for a club, clubs looking for players, and who moved where. Moves come straight from EA's club member lists, and a ✓ means the
            gamertag is linked to the player's EA account.
          </p>
        </div>
        {board.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {board.error && <p className="text-destructive">{(board.error as Error).message}</p>}
        {board.data && (
          <Tabs defaultValue="players">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="players">Players ({board.data.players.length})</TabsTrigger>
              <TabsTrigger value="clubs">Clubs ({board.data.clubs.length})</TabsTrigger>
              <TabsTrigger value="news">Transfer news</TabsTrigger>
            </TabsList>

            <TabsContent value="players" className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={line} onValueChange={setLine}>
                  <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{LINES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All platforms</SelectItem>
                    {Object.entries(PLATFORMS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <Switch id="verified" checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
                  <Label htmlFor="verified">EA-verified only</Label>
                </div>
              </div>
              {players.length === 0 ? (
                <Card className="p-5 text-sm text-muted-foreground">Nobody matching that right now.</Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {players.map((p) => (
                    <Card key={p.id} className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 font-semibold">
                            <span className="truncate">{p.gamertag ?? "Gamertag not listed"}</span>
                            {p.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-green-600" aria-label="EA-verified" />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[p.platform ? PLATFORMS[p.platform] ?? p.platform : null, p.timezone, `listed ${ago(p.updatedAt)}`].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <Badge variant={p.status === "looking" ? "default" : "secondary"}>{p.status === "looking" ? "Looking" : "Open to offers"}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">{p.positions.map((pos, i) => <Badge key={pos} variant={i === 0 ? "outline" : "secondary"}>{pos}</Badge>)}</div>
                      {p.stats ? (
                        <div className="text-sm tabular-nums">{p.stats.games} games · {p.stats.rating ?? "—"} avg · {p.stats.goals}G {p.stats.assists}A · {p.stats.motm} MOTM</div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No tracked games yet</div>
                      )}
                      {p.notes && <p className="text-sm text-muted-foreground">"{p.notes}"</p>}
                    </Card>
                  ))}
                </div>
              )}
              <Card className="p-4 text-sm text-muted-foreground">
                <b className="text-foreground">Managers:</b> reach out from Discord with <b>/manager → Recruiting → Search Free Agents</b>. GafferBot asks the player, who decides
                whether to share their Discord name. <b className="text-foreground">Players:</b> list yourself with <b>/me → Free Agent</b>, then turn on <b>Public board</b> in Free Agent Details.
              </Card>
            </TabsContent>

            <TabsContent value="clubs" className="space-y-3">
              {board.data.clubs.length === 0 ? (
                <Card className="p-5 text-sm text-muted-foreground">No clubs recruiting on the public board right now.</Card>
              ) : (
                board.data.clubs.map((c) => (
                  <Card key={`${c.name}-${c.updatedAt}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Crest src={c.crest} name={c.name} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {c.eaClubId && c.platform && isPublicPlatform(c.platform) ? <Link to={publicClubPath(c.platform, c.eaClubId)} className="hover:underline">{c.name}</Link> : c.name}
                        </div>
                        <div className="text-sm">Looking for: <b>{c.positions}</b></div>
                        <div className="text-xs text-muted-foreground">{[c.division, c.record, `posted ${ago(c.updatedAt)}`].filter(Boolean).join(" · ")}</div>
                        {c.notes && <p className="mt-1 text-sm text-muted-foreground">{c.notes}</p>}
                      </div>
                    </div>
                    {c.invite && (
                      <Button asChild size="sm"><a href={c.invite} target="_blank" rel="noopener noreferrer">Join their Discord</a></Button>
                    )}
                  </Card>
                ))
              )}
              <p className="text-sm text-muted-foreground">Clubs: post a poster with <b>/manager → Recruiting → Recruitment Poster</b> and it shows here for 14 days.</p>
            </TabsContent>

            <TabsContent value="news">
              {board.data.moves.length === 0 ? (
                <Card className="p-5 text-sm text-muted-foreground">No moves spotted yet.</Card>
              ) : (
                <Card className="divide-y divide-border">
                  {board.data.moves.map((m) => (
                    <div key={`${m.ea_username}-${m.from_club_id}-${m.to_club_id}`} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-sm">
                      <span className="font-semibold">{m.ea_username}</span>
                      <ClubLink id={m.from_club_id} platform={m.platform} name={m.from_club_name} />
                      <span className="text-muted-foreground">→</span>
                      <ClubLink id={m.to_club_id} platform={m.platform} name={m.to_club_name} />
                      <span className="ml-auto text-xs text-muted-foreground">{ago(m.detected_at)}</span>
                    </div>
                  ))}
                </Card>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Spotted when a gamertag appears in a club's EA member list after being in another club's. Every club looked up on GafferBot adds to it.</p>
            </TabsContent>
          </Tabs>
        )}
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/clubs" className="underline">Look up a club</Link> · Powered by <Link to="/welcome" className="underline">GafferBot</Link>
        </p>
      </div>
    </div>
  );
}
