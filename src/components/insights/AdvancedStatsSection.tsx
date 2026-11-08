import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ROLE_LABELS,
  benchRole,
  benchmarkPlayer,
  computeAdvancedPlayers,
  computeFormTrends,
  computeOpponentProfiles,
  percentileText,
  computePartnerships,
  computePressing,
  computeSessionFatigue,
  type AdvancedPlayer,
  type FormTrend,
  type InsightMatch,
} from "@/lib/clubInsights";

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `${Math.round(n)}%`;
}

function one(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : n.toFixed(1);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function signed(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const r = Math.round(n);
  return `${r > 0 ? "+" : ""}${r} pts`;
}

const TREND_VARIANT: Record<FormTrend["trend"], "default" | "secondary" | "destructive"> = {
  Improving: "default",
  Steady: "secondary",
  Dipping: "destructive",
};

function PlayerDetail({ p, trend }: { p: AdvancedPlayer; trend?: FormTrend }) {
  const d = p.derived;
  const t = p.totals;
  const g = p.games;
  const per = (v: number) => (v / g).toFixed(1);
  const role = benchRole(p);
  const bench = benchmarkPlayer(p);
  return (
    <div className="grid gap-6 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-4">
      {role && bench.length > 0 && (
        <div className="sm:col-span-2 lg:col-span-4">
          <h4 className="mb-2 text-sm font-semibold">Against FC27 {ROLE_LABELS[role].toLowerCase()}s</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bench.map((b) => (
              <div key={b.key} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="font-medium tabular-nums">{percentileText(b.percentile, role)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-muted">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.max(2, Math.round(b.percentile))}%` }} />
                </div>
              </div>
            ))}
          </div>
          {trend && (
            <p className="mt-3 text-sm">
              <Badge variant={TREND_VARIANT[trend.trend]} className="mr-2">{trend.trend}</Badge>
              Last {trend.recentGames} games vs the {trend.earlierGames} before: decisions {signed(trend.decisionChange)}, positioning {signed(trend.positioningChange)}, passing {signed(trend.passCompletionChange)}.
            </p>
          )}
        </div>
      )}
      <div>
        <h4 className="mb-1 text-sm font-semibold">Passing</h4>
        <Row label="Completion" value={pct(d.passCompletion)} />
        <Row label="Short / medium / long" value={`${pct(d.shortPassPct)} / ${pct(d.mediumPassPct)} / ${pct(d.longPassPct)}`} />
        <Row label="Crosses" value={pct(d.crossPct)} />
        <Row label="Forward share" value={`${pct(d.forwardShare)}${d.passStyle ? ` · ${d.passStyle}` : ""}`} />
        <Row label="Through balls / game" value={per(t.throughBalls)} />
        <Row label="First-time passes / game" value={per(t.firstTimePasses)} />
        <Row label="Second assists" value={String(t.secondAssists)} />
      </div>
      <div>
        <h4 className="mb-1 text-sm font-semibold">Shooting and dribbling</h4>
        <Row label="Shot accuracy" value={pct(d.shotAccuracy)} />
        <Row label="Shots from inside the box" value={pct(d.insideBoxShotShare)} />
        <Row label="Weak-foot / first-time goals" value={`${t.weakFootGoals} / ${t.firstTimeGoals}`} />
        <Row label="Goals off the post" value={String(t.postGoals)} />
        <Row label="Dribbles / game" value={per(t.dribbles)} />
        <Row label="Players beaten (skill moves)" value={`${t.beats} (${t.skillMoveBeats})`} />
      </div>
      <div>
        <h4 className="mb-1 text-sm font-semibold">Defending</h4>
        <Row label="Tackle success" value={pct(d.tackleSuccess)} />
        <Row label="Sliding share of tackles won" value={pct(d.slidingTackleShare)} />
        <Row label="Interceptions / game" value={per(t.interceptions)} />
        <Row label="Aerials won (att / def)" value={`${t.aerialsWonAttacking} / ${t.aerialsWonDefending}`} />
        <Row label="Ball won (own / mid / att third)" value={`${t.wonDefensiveThird} / ${t.wonMiddleThird} / ${t.wonAttackingThird}`} />
        <Row label="Ball lost (own / mid / att third)" value={`${t.lostDefensiveThird} / ${t.lostMiddleThird} / ${t.lostAttackingThird}`} />
      </div>
      <div>
        <h4 className="mb-1 text-sm font-semibold">Positioning, decisions, discipline</h4>
        <Row label="Positional discipline" value={pct(d.positionalDiscipline)} />
        <Row label="Out of position / game (severe)" value={`${one(d.outOfPositionPerGame)} (${one(d.severeOutOfPositionPerGame)})`} />
        <Row label="Decision score" value={pct(d.decisionScore)} />
        <Row label="Fouls committed / won" value={`${t.foulsCommitted} / ${t.foulsWon}`} />
        <Row label="Yellow cards" value={String(t.yellowCards)} />
        <Row label="Penalties conceded" value={String(t.penaltiesConceded)} />
        {t.goodDirectionSaves > 0 && <Row label="Good-direction saves" value={String(t.goodDirectionSaves)} />}
      </div>
      {p.roles.length > 0 && (
        <div className="sm:col-span-2 lg:col-span-4">
          <h4 className="mb-1 text-sm font-semibold">By role</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">Avg rating</TableHead>
                <TableHead className="text-right">Positional discipline</TableHead>
                <TableHead className="text-right">Decision score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.roles.map((r) => (
                <TableRow key={r.role}>
                  <TableCell className="font-medium">
                    {ROLE_LABELS[r.role]} {p.bestRole === r.role && <Badge variant="secondary" className="ml-1">Best</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{r.games}</TableCell>
                  <TableCell className="text-right">{one(r.avgRating)}</TableCell>
                  <TableCell className="text-right">{pct(r.positionalDiscipline)}</TableCell>
                  <TableCell className="text-right">{pct(r.decisionScore)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Stats decoded from EA's hidden per-player event counts (see src/lib/advancedStats.ts)
export function AdvancedStatsSection({ matches }: { matches: InsightMatch[] }) {
  const withEvents = useMemo(() => matches.filter((m) => m.players.some((p) => p.events)), [matches]);
  const minGames = withEvents.length >= 40 ? 5 : 3;
  const data = useMemo(
    () => ({
      players: computeAdvancedPlayers(withEvents, minGames),
      sessions: computeSessionFatigue(withEvents),
      pressing: computePressing(withEvents),
      pairs: computePartnerships(withEvents, minGames).slice(0, 8),
      trends: computeFormTrends(withEvents),
      opponents: computeOpponentProfiles(withEvents).filter((o) => o.passCompletion !== null),
    }),
    [withEvents, minGames],
  );
  const [selected, setSelected] = useState<string>("");
  const player = data.players.find((p) => p.key === selected) || data.players[0];
  const [oppKey, setOppKey] = useState<string>("");
  const opp = data.opponents.find((o) => o.opponent === oppKey) || data.opponents[0];

  if (withEvents.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Activity className="h-5 w-5" /> Deep stats</h2>
        <p className="text-sm text-muted-foreground">
          From EA's hidden per-player event data ({withEvents.length} matches), decoded with community research checked against 51,000 FC27 player games.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Players</CardTitle>
          <CardDescription>
            Decision score is how often EA's in-game feedback says "good option" or better. Positional discipline is EA's "good positioning" praise vs. out-of-position warnings. Players with {minGames}+ games.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">GP</TableHead>
                <TableHead className="text-right">Best role</TableHead>
                <TableHead className="text-right">Decisions</TableHead>
                <TableHead className="text-right">Positioning</TableHead>
                <TableHead className="text-right">Out of pos / g</TableHead>
                <TableHead className="text-right">Pass style</TableHead>
                <TableHead className="text-right">Tackle %</TableHead>
                <TableHead className="text-right">Press / g</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.players.map((p) => (
                <TableRow key={p.key} className="cursor-pointer" onClick={() => setSelected(p.key)} data-state={player?.key === p.key ? "selected" : undefined}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{p.games}</TableCell>
                  <TableCell className="text-right">{p.bestRole ? ROLE_LABELS[p.bestRole] : "—"}</TableCell>
                  <TableCell className="text-right">{pct(p.derived.decisionScore)}</TableCell>
                  <TableCell className="text-right">{pct(p.derived.positionalDiscipline)}</TableCell>
                  <TableCell className="text-right">{one(p.derived.outOfPositionPerGame)}</TableCell>
                  <TableCell className="text-right">{p.derived.passStyle || "—"}</TableCell>
                  <TableCell className="text-right">{pct(p.derived.tackleSuccess)}</TableCell>
                  <TableCell className="text-right">{one(p.derived.pressingPerGame)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {player && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">{player.name}</CardTitle>
                <CardDescription>{player.games} games with EA event data</CardDescription>
              </div>
              <Select value={player.key} onValueChange={setSelected}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {data.players.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <PlayerDetail p={player} trend={data.trends.find((t) => t.key === player.key)} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Through a session</CardTitle>
            <CardDescription>Results and decisions by game number on a night (a gap of 90+ minutes starts a new session).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead className="text-right">Played</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">Decisions</TableHead>
                  <TableHead className="text-right">Out of pos / player</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sessions.map((l) => (
                  <TableRow key={l.label}>
                    <TableCell className="font-medium">{l.label}</TableCell>
                    <TableCell className="text-right">{l.games}</TableCell>
                    <TableCell className="text-right">{pct(l.winPct)}</TableCell>
                    <TableCell className="text-right">{pct(l.decisionScore)}</TableCell>
                    <TableCell className="text-right">{one(l.outOfPositionPerPlayer)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pressing vs. results</CardTitle>
            <CardDescription>Games split by how often the club won the ball in the attacking third.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.pressing.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Needs 9+ games with EA event data.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Press</TableHead>
                    <TableHead className="text-right">Ball wins up front</TableHead>
                    <TableHead className="text-right">Games</TableHead>
                    <TableHead className="text-right">Win rate</TableHead>
                    <TableHead className="text-right">GF / GA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pressing.map((b) => (
                    <TableRow key={b.band}>
                      <TableCell className="font-medium">{b.band}</TableCell>
                      <TableCell className="text-right">{b.range}</TableCell>
                      <TableCell className="text-right">{b.games}</TableCell>
                      <TableCell className="text-right">{pct(b.winPct)}</TableCell>
                      <TableCell className="text-right">{b.goalsFor.toFixed(1)} / {b.goalsAgainst.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Partnerships</CardTitle>
          <CardDescription>
            Defender and midfielder pairs: out-of-position warnings and balls lost per game together vs. what the same two average apart. Small samples are noisy, so lean on pairs with plenty of games.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.pairs.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No defender or midfielder pair has {minGames}+ games together yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">Out of pos together / apart</TableHead>
                  <TableHead className="text-right">Ball lost together / apart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pairs.map((p) => (
                  <TableRow key={p.names.join("|")}>
                    <TableCell className="font-medium">{p.names.join(" + ")} <span className="text-xs text-muted-foreground">{p.roles}</span></TableCell>
                    <TableCell className="text-right">{p.games}</TableCell>
                    <TableCell className="text-right">{pct(p.winPct)}</TableCell>
                    <TableCell className="text-right">{one(p.outOfPositionTogether)} / {one(p.outOfPositionApart)}</TableCell>
                    <TableCell className="text-right">{one(p.lostTogether)} / {one(p.lostApart)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Form</CardTitle>
            <CardDescription>Each player's last 10 games against the games before them. Changes are in percentage points.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.trends.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Needs 15+ games with EA event data for a player.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Trend</TableHead>
                    <TableHead className="text-right">Decisions</TableHead>
                    <TableHead className="text-right">Positioning</TableHead>
                    <TableHead className="text-right">Passing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.trends.map((t) => (
                    <TableRow key={t.key}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right"><Badge variant={TREND_VARIANT[t.trend]}>{t.trend}</Badge></TableCell>
                      <TableCell className="text-right">{signed(t.decisionChange)}</TableCell>
                      <TableCell className="text-right">{signed(t.positioningChange)}</TableCell>
                      <TableCell className="text-right">{signed(t.passCompletionChange)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Opponent scouting</CardTitle>
                <CardDescription>How clubs you've played look in EA's data on their side, compared with FC27 clubs.</CardDescription>
              </div>
              {data.opponents.length > 0 && opp && (
                <Select value={opp.opponent} onValueChange={setOppKey}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.opponents.map((o) => <SelectItem key={o.opponent} value={o.opponent}>{o.opponent} ({o.games})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!opp ? (
              <p className="text-sm text-muted-foreground">No opponent event data yet.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <Row label="Your record" value={`${opp.record.wins}W ${opp.record.draws}D ${opp.record.losses}L`} />
                  <Row label="Pass completion · style" value={`${pct(opp.passCompletion)}${opp.passStyle ? ` · ${opp.passStyle}` : ""}`} />
                  <Row label="Ball wins up front / game" value={one(opp.perGame.pressing)} />
                  <Row label="Ball lost in own third / game" value={one(opp.perGame.lostOwnThird)} />
                  <Row label="Shots / game (inside box)" value={`${one(opp.perGame.shots)} (${pct(opp.insideBoxShotShare)})`} />
                  <Row label="Aerials won / game" value={one(opp.perGame.aerialsWon)} />
                </div>
                {opp.threats.length > 0 && (
                  <p className="text-sm"><span className="text-muted-foreground">Danger men: </span>{opp.threats.map((t) => `${t.name} (${t.goals}G, ${t.shots} shots)`).join(", ")}</p>
                )}
                {opp.tips.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {opp.tips.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
