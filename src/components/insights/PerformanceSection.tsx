import { useMemo, useState } from "react";
import { ClipboardList, Gauge } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  AREAS,
  AREA_FIX,
  groupSessions,
  pointsVerdict,
  sessionReport,
  summarisePerformance,
  type InsightMatch,
  type MatchPerformance,
  type Verdict,
} from "@/lib/clubInsights";

const HISTORY_MATCHES = 60;

function signed(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function ScoreBar({ label, score, delta, help }: { label: string; score: number | null; delta?: number | null; help: string }) {
  return (
    <div className="text-sm" title={help}>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {score === null ? "—" : Math.round(score)}
          {delta !== null && delta !== undefined && (
            <span className={cn("ml-1 text-xs", delta >= 0 ? "text-green-600" : "text-red-600")}>{signed(delta, 0)}</span>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 rounded bg-muted">
        <div className="h-2 rounded bg-primary" style={{ width: `${Math.max(0.2, (score ?? 0) / 10)}%` }} />
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const VERDICT_TONE: Record<Verdict, "good" | "bad" | "neutral"> = {
  "Deserved win": "good",
  "Edged it": "good",
  "Smash and grab": "neutral",
  "Fair draw": "neutral",
  "Should have won": "neutral",
  "Got away with it": "neutral",
  "Deserved loss": "bad",
  "Narrow loss": "bad",
  "Hard luck": "neutral",
};

function VerdictBadge({ v }: { v: Verdict }) {
  const tone = VERDICT_TONE[v];
  return <Badge variant={tone === "good" ? "default" : tone === "bad" ? "destructive" : "secondary"}>{v}</Badge>;
}

const RESULT_LETTER: Record<MatchPerformance["result"], string> = { win: "W", draw: "D", loss: "L" };

function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function PerformanceSection({ matches }: { matches: InsightMatch[] }) {
  const summary = useMemo(() => summarisePerformance(matches), [matches]);
  const nights = useMemo(() => groupSessions(matches), [matches]);
  const [night, setNight] = useState("0");
  const report = useMemo(() => {
    const i = Number(night);
    const n = nights[i];
    return n ? sessionReport(n, nights.slice(i + 1).flat().slice(0, HISTORY_MATCHES)) : null;
  }, [nights, night]);

  if (!summary.games) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Front office report</CardTitle>
          <CardDescription>The management view of a night: graded against real FC27 clubs and against your own usual. The Chronicle tells the story; this is what the front office makes of it. Discord gets it when your club voice channel empties.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={night} onValueChange={setNight}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              {nights.slice(0, 20).map((n, i) => (
                <SelectItem key={i} value={String(i)}>
                  {dayLabel(n[0].playedAt)} · {n.length} game{n.length === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {report && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile
                  label="Grade"
                  value={report.grade}
                  sub={report.control === null ? undefined : `Control ${Math.round(report.control)}${report.usualControl !== null ? ` · ${signed(report.control - report.usualControl)} on usual` : ""}`}
                />
                <Tile label="Results" value={`${report.wins}W ${report.draws}D ${report.losses}L`} sub={`Goals ${report.goalsFor}-${report.goalsAgainst}`} />
                <Tile label="What's working" value={report.strength?.label || "—"} sub={report.strength?.delta != null ? `${signed(report.strength.delta)} on usual` : undefined} />
                <Tile label="Priority to address" value={report.fixFirst?.label || "—"} sub={report.fixFirst?.delta != null ? `${signed(report.fixFirst.delta)} on usual` : undefined} />
              </div>
              <p className="text-sm">{report.pointsLine}</p>
              {report.fixFirst && <p className="text-sm text-muted-foreground">🔧 {AREA_FIX[report.fixFirst.key]}</p>}
              {report.playerOfSession && (
                <p className="text-sm">
                  ⭐ <span className="font-semibold">Standout performer: {report.playerOfSession.name}</span>
                  {report.playerOfSession.avgRating !== null && ` (${report.playerOfSession.avgRating.toFixed(1)})`} · {report.playerOfSession.line}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {report.areas.map((a) => (
                  <ScoreBar key={a.key} label={a.label} score={a.score} delta={a.delta} help={AREAS.find((x) => x.key === a.key)?.help || ""} />
                ))}
              </div>
              <div className="space-y-1">
                {report.players.map((p) => (
                  <div key={p.name} className="text-sm">
                    <span className="font-medium">{p.name}</span>
                    {p.avgRating !== null && <span className="tabular-nums text-muted-foreground"> {p.avgRating.toFixed(1)}</span>}: {p.line}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Performance</CardTitle>
          <CardDescription>
            Each game is scored 0-1000 in five areas against 14,240 real FC27 club games, and modelled goals come from shots on target inside and outside the box (fitted on those games). They
            are not EA xG: EA has no shot positions beyond inside or outside the box, so they say nothing about finishing or luck on their own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Points" value={String(summary.points)} sub={`${summary.expectedPoints.toFixed(1)} expected`} />
            <Tile label="Goals for" value={String(summary.goalsFor)} sub={`${summary.modelledFor.toFixed(1)} modelled`} />
            <Tile label="Goals against" value={String(summary.goalsAgainst)} sub={`${summary.modelledAgainst.toFixed(1)} modelled`} />
            <Tile label="Match control" value={summary.control === null ? "—" : `${Math.round(summary.control)}/1000`} sub={`${Math.round(summary.fullDataShare * 100)}% of games with full EA data`} />
          </div>
          <p className="text-sm">{pointsVerdict(summary.points, summary.expectedPoints, summary.games)}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {AREAS.map((a) => (
              <ScoreBar key={a.key} label={a.label} score={summary.areas[a.key]} help={a.help} />
            ))}
          </div>
          {summary.strongest && (
            <p className="text-sm text-muted-foreground">
              Strongest: <span className="font-medium text-foreground">{AREAS.find((a) => a.key === summary.strongest)?.label}</span>
              {summary.weakest && (
                <>
                  {" "}· Lowest: <span className="font-medium text-foreground">{AREAS.find((a) => a.key === summary.weakest)?.label}</span>
                </>
              )}
            </p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Modelled</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Control</TableHead>
                  <TableHead>Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.matches.slice(0, 20).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="min-w-[7rem] font-medium">{RESULT_LETTER[m.result]} vs {m.opponent}</div>
                      <div className="text-xs text-muted-foreground">{dayLabel(m.playedAt)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.scoreFor}-{m.scoreAgainst}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.modelledFor.toFixed(1)}-{m.modelledAgainst.toFixed(1)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{m.control === null ? "—" : Math.round(m.control)}</TableCell>
                    <TableCell><VerdictBadge v={m.verdict} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
