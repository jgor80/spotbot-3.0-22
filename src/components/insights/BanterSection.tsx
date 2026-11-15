import { useMemo, useState } from "react";
import { DoorOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  banterRankings,
  banterWindow,
  betterTogether,
  betterWithout,
  headToHead,
  playerLines,
  superlatives,
  whoGetsTheShirt,
  type BanterWindow,
  type InsightMatch,
  type Split,
} from "@/lib/clubInsights";

const WINDOWS: [BanterWindow, string][] = [
  ["session", "Tonight"],
  ["week", "This week"],
  ["all", "All time"],
];

type ReceiptKind = "without" | "together" | "shirt" | "h2h";
const RECEIPTS: [ReceiptKind, string][] = [
  ["without", "Better without them?"],
  ["together", "Better together?"],
  ["shirt", "Who gets the shirt?"],
  ["h2h", "Head to head"],
];

const one = (v: number | null) => (v === null ? "—" : v.toFixed(1));

function SplitRow({ label, s }: { label: string; s: Split }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
      <span className="font-medium">{label}</span>
      {s.games ? (
        <span className="tabular-nums text-muted-foreground">
          {s.games} g · {s.wins}W {s.draws}D {s.losses}L · {s.pointsPerGame.toFixed(2)} pts/g · {one(s.goalsFor)}-{one(s.goalsAgainst)}
        </span>
      ) : (
        <span className="text-muted-foreground">no games</span>
      )}
    </div>
  );
}

function Receipt({ matches, kind, a, b }: { matches: InsightMatch[]; kind: ReceiptKind; a: string; b: string }) {
  if (!a || (kind !== "without" && !b)) return <p className="text-sm text-muted-foreground">Pick {kind === "without" ? "a player" : "two players"}.</p>;
  if (kind !== "without" && a === b) return <p className="text-sm text-muted-foreground">Pick two different players.</p>;
  if (kind === "without") {
    const r = betterWithout(matches, a);
    if (!r) return null;
    return (
      <div className="space-y-2">
        <p className="font-semibold">{r.headline}</p>
        <SplitRow label={`With ${r.name}`} s={r.with} />
        <SplitRow label={`Without ${r.name}`} s={r.without} />
      </div>
    );
  }
  if (kind === "together") {
    const r = betterTogether(matches, a, b);
    if (!r) return null;
    const [na, nb] = r.names;
    return (
      <div className="space-y-2">
        <p className="font-semibold">{r.headline}</p>
        <SplitRow label="Together" s={r.together} />
        <SplitRow label={`${na} without ${nb}`} s={r.onlyA} />
        <SplitRow label={`${nb} without ${na}`} s={r.onlyB} />
      </div>
    );
  }
  if (kind === "shirt") {
    const r = whoGetsTheShirt(matches, a, b);
    if (!r) return null;
    return (
      <div className="space-y-2">
        <p className="font-semibold">{r.headline}</p>
        {r.players.map((p) => (
          <div key={p.name} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className={cn("font-medium", r.winner === p.name && "text-green-600")}>{p.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {p.games} g apart · {one(p.avgRating)} rating · {p.pointsPerGame.toFixed(2)} pts/g · {p.goalInvolvementsPerGame.toFixed(2)} G+A
            </span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Each player's games in the role while the other wasn't. Points a game decide it, rating breaks a near tie, 3+ games each to call it.</p>
      </div>
    );
  }
  const h = headToHead(matches, a, b);
  if (!h) return null;
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-sm font-semibold">
        <span />
        <span className="text-right">{h.players[0].name}</span>
        <span className="text-right">{h.players[1].name}</span>
      </div>
      {h.rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          {[0, 1].map((i) => (
            <span key={i} className={cn("text-right tabular-nums", row.better === i && "font-semibold text-green-600")}>
              {row.values[i]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function BanterSection({ matches }: { matches: InsightMatch[] }) {
  const [win, setWin] = useState<BanterWindow>("all");
  const [kind, setKind] = useState<ReceiptKind>("without");
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const scoped = useMemo(() => banterWindow(matches, win), [matches, win]);
  const minGames = win === "all" ? (scoped.length >= 40 ? 5 : 3) : win === "week" ? 2 : 1;
  const rankings = useMemo(() => banterRankings(scoped, minGames), [scoped, minGames]);
  const sup = useMemo(() => superlatives(scoped, minGames), [scoped, minGames]);
  const players = useMemo(() => playerLines(matches, 1).sort((x, y) => y.games - x.games), [matches]);
  if (!players.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5" /> Dressing room</CardTitle>
        <CardDescription>Banter that settles the group chat, built only from real match numbers. Every line shows the numbers behind it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {WINDOWS.map(([w, label]) => (
              <Button key={w} size="sm" variant={w === win ? "default" : "outline"} onClick={() => setWin(w)}>
                {label}
              </Button>
            ))}
            <span className="self-center text-xs text-muted-foreground">{scoped.length} games</span>
          </div>
          {rankings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is guilty of anything in this window.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {rankings.map((r) => (
                <div key={r.key} className="rounded-lg border p-3">
                  <div className="text-sm font-semibold">{r.emoji} {r.title}</div>
                  <div className="mb-2 text-xs text-muted-foreground">{r.question}</div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.entries[0].name}</span>
                    <Badge variant="secondary">{r.entries[0].verdict}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.entries[0].line}</p>
                  {r.entries.length > 1 && (
                    <p className="mt-1 text-xs text-muted-foreground">Also in the frame: {r.entries.slice(1, 3).map((e) => e.name).join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {sup.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Squad superlatives</h4>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {sup.map((s) => (
                <div key={s.key} className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{s.emoji} {s.title}</span>
                  <span className="text-right"><span className="font-medium">{s.name}</span> <span className="text-xs text-muted-foreground">{s.line}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="mb-2 text-sm font-semibold">Receipts</h4>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <Select value={kind} onValueChange={(v) => setKind(v as ReceiptKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECEIPTS.map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={a} onValueChange={setA}>
              <SelectTrigger><SelectValue placeholder="Player" /></SelectTrigger>
              <SelectContent>
                {players.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {kind !== "without" && (
              <Select value={b} onValueChange={setB}>
                <SelectTrigger><SelectValue placeholder="Second player" /></SelectTrigger>
                <SelectContent>
                  {players.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <Receipt matches={matches} kind={kind} a={a} b={b} />
          <p className="mt-2 text-xs text-muted-foreground">With and without compares different games against different opponents, so it's a receipt, not proof.</p>
        </div>
      </CardContent>
    </Card>
  );
}
