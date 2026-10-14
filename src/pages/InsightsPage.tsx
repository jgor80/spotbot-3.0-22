import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingDown, TrendingUp, Lightbulb, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useGuild } from "@/contexts/GuildContext";
import { cn } from "@/lib/utils";
import {
  ClubMatchRow,
  LineupRow,
  MatchResult,
  WinRecord,
  computeCombos,
  computeFormations,
  computeOverview,
  computePlayerImpact,
  computeWinLossGaps,
  generateInsights,
  gdPerGame,
  toInsightMatches,
  winPct,
  COMPETITIONS,
  matchCompetition,
  isSeparateCompetition,
} from "@/lib/clubInsights";

// League / Tournament / BYOT follow the tags managers set in Discord (Manager Hub → Tag Matches).
// Tournament and BYOT games are kept apart, so the default view leaves them out.
const MATCH_TYPES = [
  { value: "all", label: "Regular games" },
  ...COMPETITIONS.map((c) => ({ value: c.value, label: c.label })),
  { value: "everything", label: "All games incl. tournaments" },
];

const RANGES = [
  { value: "20", label: "Last 20" },
  { value: "50", label: "Last 50" },
  { value: "100", label: "Last 100" },
  { value: "all", label: "All time" },
];

const RESULT_STYLE: Record<MatchResult, { letter: string; className: string }> = {
  win: { letter: "W", className: "bg-green-600 text-white" },
  draw: { letter: "D", className: "bg-muted text-foreground" },
  loss: { letter: "L", className: "bg-red-600 text-white" },
};

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `${Math.round(n)}%`;
}

function one(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : n.toFixed(1);
}

function recordText(r: WinRecord) {
  return `${r.wins}-${r.draws}-${r.losses}`;
}

function Lift({ value, hasBaseline }: { value: number; hasBaseline: boolean }) {
  if (!hasBaseline) return <span className="text-muted-foreground">—</span>;
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", up ? "text-green-600" : "text-red-600")}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {up ? "+" : ""}{Math.round(value)} pts
    </span>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-xl font-bold sm:text-2xl">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function InsightsPage() {
  const { selectedGuildId, selectedGuild } = useGuild();
  const [clubKey, setClubKey] = useState("all");
  const [matchType, setMatchType] = useState("all");
  const [range, setRange] = useState("50");
  const [comboSize, setComboSize] = useState<"2" | "3">("2");

  const { data, isLoading } = useQuery({
    queryKey: ["club-insights", selectedGuildId, clubKey, matchType, range],
    queryFn: async () => {
      if (!selectedGuildId) return { rows: [] as ClubMatchRow[], lineups: [] as LineupRow[] };
      const limit = range === "all" ? 1000 : Number(range);

      // Tags live in match_data, so filter by kind of game here; read further back so the range still fills up
      let query = supabase
        .from("club_matches")
        .select("id, result, score_for, score_against, match_type, created_at, opponent_club_name, player_stats, match_data")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(matchType === "everything" ? limit : 1000);
      if (clubKey !== "all") query = query.eq("club_key", clubKey);
      const { data: all, error } = await query;
      if (error) throw error;
      const keep = (r: ClubMatchRow) =>
        matchType === "everything" || (matchType === "all" ? !isSeparateCompetition(matchCompetition(r)) : matchCompetition(r) === matchType);
      const rows = (all || []).filter(keep).slice(0, limit);

      const { data: lineups } = await supabase
        .from("lineups")
        .select("formation, created_at")
        .eq("guild_id", selectedGuildId)
        .order("created_at", { ascending: false })
        .limit(500);

      return { rows: (rows || []) as ClubMatchRow[], lineups: (lineups || []) as LineupRow[] };
    },
    enabled: !!selectedGuildId,
  });

  const analysis = useMemo(() => {
    const matches = toInsightMatches(data?.rows || [], data?.lineups || []);
    const minGames = matches.length >= 40 ? 5 : 3;
    return {
      matches,
      overview: computeOverview(matches),
      insights: generateInsights(matches),
      combos: computeCombos(matches, comboSize === "2" ? 2 : 3, minGames).slice(0, 10),
      impact: computePlayerImpact(matches, minGames),
      formations: computeFormations(matches),
      gaps: computeWinLossGaps(matches),
    };
  }, [data, comboSize]);

  const { overview } = analysis;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight md:text-3xl">Tactical Insights</h1>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">What works and what doesn't, from your synced EA matches.</p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Select value={clubKey} onValueChange={setClubKey}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clubs</SelectItem>
                {selectedGuild?.clubs.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATCH_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : overview.played === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No synced matches yet for this filter. Link your club in Discord with <code>/manager → Admin → Link EA Club</code> and play a few games.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatTile label="Record (W-D-L)" value={`${overview.wins}-${overview.draws}-${overview.losses}`} sub={`${overview.played} games`} />
              <StatTile label="Win rate" value={pct(overview.winPct)} />
              <StatTile
                label="Goals for / against"
                value={`${overview.goalsFor} / ${overview.goalsAgainst}`}
                sub={`${(overview.goalsFor / overview.played).toFixed(1)} scored per game`}
              />
              <StatTile label="Clean sheets" value={String(overview.cleanSheets)} />
              <StatTile label="Avg possession" value={pct(overview.avgPossession)} />
              <StatTile label="Pass completion" value={pct(overview.passCompletion)} sub={overview.shotsPerGame !== null ? `${one(overview.shotsPerGame)} shots per game` : undefined} />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Form (latest first)</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-1.5">
                {overview.form.map((r, i) => (
                  <span
                    key={i}
                    title={`${analysis.matches[i].opponent}: ${analysis.matches[i].scoreFor}-${analysis.matches[i].scoreAgainst}`}
                    className={cn("h-7 w-7 rounded flex items-center justify-center text-xs font-bold", RESULT_STYLE[r].className)}
                  >
                    {RESULT_STYLE[r].letter}
                  </span>
                ))}
              </CardContent>
            </Card>

            {/* Key insights */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Key insights</CardTitle>
                <CardDescription>Patterns with enough games behind them to take seriously.</CardDescription>
              </CardHeader>
              <CardContent>
                {analysis.insights.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing stands out yet. Insights appear once there are clear gaps across at least a handful of games.</p>
                ) : (
                  <ul className="space-y-2">
                    {analysis.insights.map((ins, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <Badge
                          variant={ins.tone === "bad" ? "destructive" : ins.tone === "good" ? "default" : "secondary"}
                          className="shrink-0 h-5"
                        >
                          {ins.tone === "bad" ? "Fix" : ins.tone === "good" ? "Works" : "Note"}
                        </Badge>
                        <span>{ins.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Chemistry */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Player chemistry</CardTitle>
                      <CardDescription>Win rate together vs. when only some of them play.</CardDescription>
                    </div>
                    <Select value={comboSize} onValueChange={(v) => setComboSize(v as "2" | "3")}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">Duos</SelectItem>
                        <SelectItem value="3">Trios</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Players</TableHead>
                        <TableHead className="text-right">Together</TableHead>
                        <TableHead className="text-right">Apart</TableHead>
                        <TableHead className="text-right">Lift</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.combos.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Not enough games together yet.</TableCell></TableRow>
                      ) : analysis.combos.map((c) => (
                        <TableRow key={c.names.join("|")}>
                          <TableCell className="font-medium">{c.names.join(" + ")}</TableCell>
                          <TableCell className="text-right">{pct(winPct(c.together))} <span className="text-muted-foreground text-xs">({c.together.games})</span></TableCell>
                          <TableCell className="text-right">{c.apart.games ? <>{pct(winPct(c.apart))} <span className="text-muted-foreground text-xs">({c.apart.games})</span></> : "—"}</TableCell>
                          <TableCell className="text-right"><Lift value={c.lift} hasBaseline={c.apart.games > 0} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* On/off impact */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Player impact</CardTitle>
                  <CardDescription>Club win rate with each player on the pitch vs. without them.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead className="text-right">With</TableHead>
                        <TableHead className="text-right">Without</TableHead>
                        <TableHead className="text-right">GD/game</TableHead>
                        <TableHead className="text-right">Lift</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.impact.map((p) => (
                        <TableRow key={p.key}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right">{pct(winPct(p.with))} <span className="text-muted-foreground text-xs">({p.with.games})</span></TableCell>
                          <TableCell className="text-right">{p.without.games ? <>{pct(winPct(p.without))} <span className="text-muted-foreground text-xs">({p.without.games})</span></> : "—"}</TableCell>
                          <TableCell className="text-right">{gdPerGame(p.with) >= 0 ? "+" : ""}{gdPerGame(p.with).toFixed(1)}</TableCell>
                          <TableCell className="text-right"><Lift value={p.lift} hasBaseline={p.without.games > 0} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Win vs loss gaps */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Wins vs. losses</CardTitle>
                  <CardDescription>Team averages, biggest drop-offs in losses first.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {analysis.gaps.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-6 pb-6">Needs at least 3 wins and 3 losses with detailed stats.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead className="text-right">In wins</TableHead>
                          <TableHead className="text-right">In losses</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.gaps.map((g) => (
                          <TableRow key={g.key}>
                            <TableCell className="font-medium">{g.label}</TableCell>
                            <TableCell className="text-right">{g.unit === "%" ? pct(g.inWins) : one(g.inWins)}</TableCell>
                            <TableCell className={cn("text-right", g.severity >= 0.08 && "text-red-600 font-medium")}>
                              {g.unit === "%" ? pct(g.inLosses) : one(g.inLosses)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Formations */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Formations</CardTitle>
                  <CardDescription>EA doesn't report formations, so matches are matched to the lineup saved in the 6 hours before kick-off.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {analysis.formations.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-6 pb-6">Save a lineup on the Teams page before you play to start tracking formations.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Formation</TableHead>
                          <TableHead className="text-right">W-D-L</TableHead>
                          <TableHead className="text-right">Win rate</TableHead>
                          <TableHead className="text-right">GF / GA per game</TableHead>
                          <TableHead className="text-right">Avg rating</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.formations.map((f) => (
                          <TableRow key={f.formation}>
                            <TableCell className="font-medium">{f.formation}</TableCell>
                            <TableCell className="text-right">{recordText(f.record)}</TableCell>
                            <TableCell className="text-right">{pct(winPct(f.record))}</TableCell>
                            <TableCell className="text-right">{f.goalsForPerGame.toFixed(1)} / {f.goalsAgainstPerGame.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{one(f.avgRating)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
