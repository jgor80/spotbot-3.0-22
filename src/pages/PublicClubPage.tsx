import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AREAS } from "@/lib/clubInsights";
import { compareParam, isPublicPlatform, publicClubView } from "@/lib/publicClub";
import { PlayerScoresSection } from "@/components/insights/PlayerScoresSection";
import { ExportButton } from "@/components/insights/ExportButton";
import { ClubSearch, Crest, platformLabel, usePublicClub } from "@/components/publicClub/publicClubApi";

const RESULT = { win: { letter: "W", cls: "bg-green-600" }, draw: { letter: "D", cls: "bg-amber-500" }, loss: { letter: "L", cls: "bg-red-600" } } as const;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

// Public club page (gafferbot.app/club/<platform>/<clubId>): any EA club, no sign-in
export default function PublicClubPage() {
  const { platform: p, clubId } = useParams();
  const platform = isPublicPlatform(p) ? p : null;
  const club = usePublicClub(platform, clubId && /^\d+$/.test(clubId) ? clubId : null);
  const view = useMemo(() => (club.data ? publicClubView(club.data) : null), [club.data]);
  const o = club.data?.overall;
  // The Worker already serves this title to crawlers; keep the tab in step once the club loads
  useEffect(() => {
    if (club.data?.name) document.title = `${club.data.name}: Pro Clubs stats, form and player scores | GafferBot`;
  }, [club.data?.name]);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-2 text-sm">
          <Link to="/clubs" className="text-muted-foreground hover:underline">← Find a club</Link>
          <Link to="/welcome" className="text-muted-foreground hover:underline">GafferBot</Link>
        </div>

        {(!platform || club.isLoading) && <p className="text-muted-foreground">{platform ? "Loading the club from EA…" : "That link isn't a club page."}</p>}
        {club.error && (
          <Card className="space-y-4 p-6">
            <div>
              <h1 className="font-display text-2xl font-bold">Couldn't load this club</h1>
              <p className="mt-1 text-muted-foreground">{(club.error as Error).message}</p>
            </div>
            <ClubSearch />
          </Card>
        )}

        {club.data && view && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Crest src={club.data.crest} name={club.data.name} className="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">EA FC Pro Clubs · {platformLabel(club.data.platform)}</p>
                <h1 className="truncate font-display text-3xl font-bold">{club.data.name}</h1>
                <div className="mt-1 flex gap-1">
                  {view.form.map((r, i) => (
                    <span key={i} className={cn("flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white", RESULT[r].cls)}>{RESULT[r].letter}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <ExportButton matches={view.matches} clubName={club.data.name} size="default" />
                <Button asChild variant="outline">
                  <Link to={`/clubs/compare?a=${compareParam(club.data.platform, club.data.clubId)}`}><ArrowLeftRight className="mr-1 h-4 w-4" /> Compare</Link>
                </Button>
              </div>
            </div>

            {o && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="All-time record" value={`${o.wins}-${o.draws}-${o.losses}`} sub={o.games ? `${Math.round((o.wins / o.games) * 100)}% wins in ${o.games}` : undefined} />
                <Tile label="Skill rating" value={o.skillRating ? String(o.skillRating) : "—"} sub={o.bestDivision ? `Best: Division ${o.bestDivision}` : undefined} />
                <Tile label="Goals" value={`${o.goals} / ${o.goalsAgainst}`} sub={o.games ? `${(o.goals / o.games).toFixed(2)} for, ${(o.goalsAgainst / o.games).toFixed(2)} against a game` : undefined} />
                <Tile label="Titles" value={String(o.titles)} sub={`${o.promotions} promotions · ${o.relegations} relegations`} />
              </div>
            )}

            {view.recent.games > 0 && (
              <Card className="space-y-4 p-5">
                <div>
                  <h2 className="font-display text-xl font-semibold">Team scores · last {view.recent.games} games</h2>
                  <p className="text-sm text-muted-foreground">
                    Out of 1000 against real FC27 clubs. {view.recent.wins}W {view.recent.draws}D {view.recent.losses}L, {view.recent.pointsPerGame.toFixed(2)} points a game
                    where the chances they made and allowed were worth {view.recent.expectedPointsPerGame.toFixed(2)}.
                  </p>
                </div>
                <div className="space-y-2">
                  {AREAS.map(({ key, label, help }) => {
                    const v = view.areas[key];
                    return (
                      <div key={key} title={help}>
                        <div className="flex justify-between text-sm">
                          <span>{label}{view.strongest === key && <Badge className="ml-2" variant="secondary">Best</Badge>}{view.weakest === key && <Badge className="ml-2" variant="outline">Weakest</Badge>}</span>
                          <span className="tabular-nums font-medium">{v === null ? "—" : Math.round(v)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-muted">
                          <div className={cn("h-2 rounded", v === null ? "" : v >= 700 ? "bg-green-600" : v >= 400 ? "bg-primary" : "bg-red-600")} style={{ width: `${v === null ? 0 : v / 10}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {view.results.length > 0 && (
              <Card className="p-5">
                <h2 className="mb-3 font-display text-xl font-semibold">Recent games</h2>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Opponent</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Chances (modelled)</TableHead>
                        <TableHead className="text-right">Verdict</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view.results.slice(0, 15).map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="max-w-[12rem] truncate font-medium">{m.opponent}</div>
                            <div className="text-xs text-muted-foreground">{m.playedAt.toLocaleDateString()}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums"><span className={cn("font-semibold", m.result === "win" ? "text-green-600" : m.result === "loss" ? "text-red-600" : "")}>{m.scoreFor}-{m.scoreAgainst}</span></TableCell>
                          <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{m.modelledFor.toFixed(1)}-{m.modelledAgainst.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-sm">{m.verdict}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}

            <PlayerScoresSection matches={view.matches} />

            {club.data.members.length > 0 && (
              <Card className="p-5">
                <h2 className="mb-3 font-display text-xl font-semibold">Squad (EA season stats)</h2>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead className="text-right">Games</TableHead>
                        <TableHead className="text-right">G</TableHead>
                        <TableHead className="text-right">A</TableHead>
                        <TableHead className="text-right">Rating</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">MOTM</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Pass %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {club.data.members.map((m) => (
                        <TableRow key={m.name}>
                          <TableCell>
                            <div className="font-medium">{m.name}</div>
                            {m.position && <div className="text-xs capitalize text-muted-foreground">{m.position}</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{m.games}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.goals}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.assists}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.rating === null ? "—" : m.rating.toFixed(1)}</TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">{m.motm}</TableCell>
                          <TableCell className="hidden text-right tabular-nums md:table-cell">{m.passSuccess === null ? "—" : `${Math.round(m.passSuccess)}%`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}

            <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
              <div className="flex-1">
                <h2 className="font-display text-lg font-semibold">Is this your club?</h2>
                <p className="text-sm text-muted-foreground">
                  Add GafferBot to your Discord and all of this posts itself after every night, with team sheets, availability and a report on what to fix. Free.
                </p>
              </div>
              <Button asChild><Link to="/welcome">Get GafferBot</Link></Button>
            </Card>

            <p className="text-center text-xs text-muted-foreground">
              From EA's public Pro Clubs data, fetched {new Date(club.data.fetchedAt).toLocaleTimeString()}. EA keeps only each club's most recent games.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
