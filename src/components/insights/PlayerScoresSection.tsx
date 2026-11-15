import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { carryScores, clutchRatings, defendingSummary, playerScores, powerRankings, type InsightMatch } from "@/lib/clubInsights";

const r0 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v)));
const one = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toFixed(1));

function Score({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  const tone = v >= 700 ? "text-green-600" : v >= 400 ? "" : "text-red-600";
  return <span className={cn("font-medium tabular-nums", tone)}>{Math.round(v)}</span>;
}

function Move({ move }: { move: number | null }) {
  if (move === null) return <Badge variant="secondary">new</Badge>;
  if (move > 0) return <span className="inline-flex items-center text-green-600"><ArrowUp className="h-3.5 w-3.5" />{move}</span>;
  if (move < 0) return <span className="inline-flex items-center text-red-600"><ArrowDown className="h-3.5 w-3.5" />{-move}</span>;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function PlayerScoresSection({ matches }: { matches: InsightMatch[] }) {
  const minGames = matches.length >= 40 ? 5 : 3;
  const data = useMemo(
    () => ({
      scores: playerScores(matches, minGames),
      ranks: powerRankings(matches),
      carry: carryScores(matches, minGames),
      clutch: clutchRatings(matches, Math.max(3, minGames - 1)),
      defending: defendingSummary(matches, minGames),
    }),
    [matches, minGames]
  );
  if (!data.scores.length && !data.ranks.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Player scores</CardTitle>
        <CardDescription>
          Every player out of 1000 against FC27 players of the same role in the community research data, so a defender is only compared with defenders. Overall weights the areas by role
          (forwards lean on attack, defenders on ball-winning). {minGames}+ games to qualify.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {data.scores.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Overall</TableHead>
                  <TableHead className="text-right">Attack</TableHead>
                  <TableHead className="text-right">Possession</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Ball-winning</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Games</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.scores.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell>
                      <div className="min-w-[8rem] font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.role} · {s.tag}</div>
                    </TableCell>
                    <TableCell className="text-right"><Score v={s.overall} /></TableCell>
                    <TableCell className="text-right"><Score v={s.areas.attack} /></TableCell>
                    <TableCell className="text-right"><Score v={s.areas.possession} /></TableCell>
                    <TableCell className="text-right"><Score v={s.areas.ballWinning} /></TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{s.games}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Keepers are scored on saves (half), goals conceded and clean sheets, so they only have an overall.</p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {data.ranks.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Power rankings · last 5 games vs the 5 before</h4>
              <div className="space-y-1">
                {data.ranks.slice(0, 10).map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-2 text-sm">
                    <span><span className="tabular-nums text-muted-foreground">{r.rank}.</span> {r.name}{r.streak >= 3 && <span className="ml-1">🔥{r.streak}W</span>}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="text-muted-foreground">{r.goals}G {r.assists}A · {one(r.avgRating)}</span>
                      <Move move={r.move} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.carry.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Who carries who</h4>
              <div className="space-y-1">
                {data.carry.slice(0, 10).map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-2 text-sm">
                    <span>{c.name} <span className="text-xs text-muted-foreground">{c.label}</span></span>
                    <span className="tabular-nums"><Score v={c.score} /></span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Rating above teammates in the same games, share of the goals they scored or set up, and how much better the club does with them.</p>
            </div>
          )}

          {data.clutch.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Clutch · games decided by one goal or drawn</h4>
              <div className="space-y-1">
                {data.clutch.slice(0, 8).map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-2 text-sm">
                    <span>{c.label === "Ice cold" ? "🧊 " : c.label === "Shrinks" ? "🫠 " : ""}{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {one(c.closeRating)} in {c.closeGames}{c.edge !== null && Math.abs(c.edge) >= 0.05 && <span className={cn("ml-2", c.edge > 0 ? "text-green-600" : "text-red-600")}>{c.edge > 0 ? "+" : ""}{one(c.edge)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(data.defending.players.length > 0 || data.defending.pairs.length > 0) && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Defending{data.defending.trend && data.defending.trend !== "Steady" && <Badge className="ml-2" variant={data.defending.trend === "Tightening" ? "default" : "destructive"}>{data.defending.trend}</Badge>}
              </h4>
              <div className="space-y-1">
                {data.defending.players.slice(0, 6).map((p) => (
                  <div key={p.name} className="flex items-center justify-between gap-2 text-sm">
                    <span>{p.role === "GK" ? "🧤" : "🛡️"} {p.name}</span>
                    <span className="tabular-nums text-muted-foreground">{r0(p.cleanSheetRate)}% CS · {p.concededPerGame.toFixed(1)} GA/g · {p.games} g</span>
                  </div>
                ))}
              </div>
              {data.defending.pairs.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground">Best partnerships at the back</div>
                  {data.defending.pairs.slice(0, 3).map((p) => (
                    <div key={p.names.join("|")} className="flex items-center justify-between gap-2 text-sm">
                      <span>{p.names.join(" & ")}</span>
                      <span className="tabular-nums text-muted-foreground">{r0(p.cleanSheetRate)}% CS · {p.concededPerGame.toFixed(1)} GA/g · {p.games} g</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
