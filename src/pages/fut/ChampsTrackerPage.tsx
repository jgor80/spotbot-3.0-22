import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Flag, Trash2, Trophy } from "lucide-react";
import { futApi, futKeys, type ChampsMode, type ChampsRun, type ChampsSummary } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, dateText, MarketLoading, MarketShell, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const MODES: { value: ChampsMode; label: string }[] = [{ value: "champs", label: "Champions" }, { value: "rivals", label: "Rivals" }, { value: "squad_battles", label: "Squad Battles" }, { value: "other", label: "Other" }];
const RESULT_CLASS = { W: "bg-success text-success-foreground", D: "bg-muted text-foreground", L: "bg-destructive text-destructive-foreground" } as const;
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Pill({ r }: { r: "W" | "D" | "L" }) { return <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${RESULT_CLASS[r]}`}>{r}</span>; }

function Totals({ s }: { s: ChampsSummary }) {
  const items: [string, string][] = [["Record", `${s.w}W ${s.d}D ${s.l}L`], ["Win rate", s.win_rate === null ? "–" : `${s.win_rate}%`], ["Goals", `${s.goals_for}-${s.goals_against}`], ["Best run", `${s.best_win_streak} wins`]];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{items.map(([k, v]) => <div key={k} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="font-display text-xl font-bold tabular-nums">{v}</p></div>)}</div>;
}

function LogGame({ run, formations }: { run: ChampsRun; formations: string[] }) {
  const qc = useQueryClient();
  const [gf, setGf] = useState(""), [ga, setGa] = useState(""), [form, setForm] = useState(""), [pens, setPens] = useState<"" | "won" | "lost">(""), [quit, setQuit] = useState(false);
  const add = useMutation({
    mutationFn: () => futApi.champs.addGame(run.id, { goals_for: Number(gf), goals_against: Number(ga), opponent_formation: form || null, penalties: pens || null, opponent_quit: quit }),
    onSuccess: () => { setGf(""); setGa(""); setPens(""); setQuit(false); qc.invalidateQueries({ queryKey: futKeys.champs }); },
  });
  const ok = /^\d{1,2}$/.test(gf) && /^\d{1,2}$/.test(ga);
  const full = run.games_allowed !== null && run.summary.games >= run.games_allowed;
  if (full || run.finished_at) return null;
  return <form className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3" onSubmit={e => { e.preventDefault(); if (ok) add.mutate(); }}>
    <div className="space-y-1"><Label htmlFor={`gf-${run.id}`}>You</Label><Input id={`gf-${run.id}`} className="w-16" inputMode="numeric" value={gf} onChange={e => setGf(e.target.value)} /></div>
    <div className="space-y-1"><Label htmlFor={`ga-${run.id}`}>Them</Label><Input id={`ga-${run.id}`} className="w-16" inputMode="numeric" value={ga} onChange={e => setGa(e.target.value)} /></div>
    <div className="space-y-1"><Label>Their formation</Label><Select value={form || "none"} onValueChange={v => setForm(v === "none" ? "" : v)}><SelectTrigger className="w-36" aria-label="Opponent formation"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not noted</SelectItem>{formations.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
    {gf !== "" && gf === ga && <div className="space-y-1"><Label>Penalties</Label><Select value={pens || "none"} onValueChange={v => setPens(v === "none" ? "" : v as "won" | "lost")}><SelectTrigger className="w-28" aria-label="Penalties"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No</SelectItem><SelectItem value="won">Won</SelectItem><SelectItem value="lost">Lost</SelectItem></SelectContent></Select></div>}
    <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={quit} onChange={e => setQuit(e.target.checked)} />They quit</label>
    <Button type="submit" disabled={!ok || add.isPending}>{add.isPending ? "Saving…" : "Log game"}</Button>
    <ErrorNotice error={add.error} />
  </form>;
}

function RunCard({ run, formations }: { run: ChampsRun; formations: string[] }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: futKeys.champs });
  const finish = useMutation({ mutationFn: () => futApi.champs.updateRun(run.id, { finished: !run.finished_at }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => futApi.champs.deleteRun(run.id), onSuccess: refresh });
  const removeGame = useMutation({ mutationFn: (id: string) => futApi.champs.deleteGame(id), onSuccess: refresh });
  const s = run.summary;
  const copy = async () => { try { await navigator.clipboard.writeText(run.recap); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } };
  return <article className="min-w-0 space-y-3 rounded-lg border border-border p-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-display text-lg font-semibold">{run.name}</h3><p className="text-xs text-muted-foreground">{MODES.find(m => m.value === run.mode)?.label} · started {dateText(run.started_at)}{run.finished_at ? ` · finished ${dateText(run.finished_at)}` : ""}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>{copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}{copied ? "Copied" : "Copy recap"}</Button>
        <Button size="sm" variant="outline" disabled={finish.isPending} onClick={() => finish.mutate()}><Flag className="mr-1 h-4 w-4" />{run.finished_at ? "Reopen" : "Finish"}</Button>
        <Button size="sm" variant="ghost" aria-label={`Delete ${run.name}`} disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${run.name} and its ${s.games} games?`)) remove.mutate(); }}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </header>
    <Totals s={s} />
    {s.target && <p className={`text-sm ${s.target.status === "reached" ? "text-success" : s.target.status === "out of reach" ? "text-destructive" : ""}`}><Trophy className="mr-1 inline h-4 w-4" />{s.target.line}</p>}
    {run.games.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Results in order">{run.games.map(g => <Pill key={g.id} r={g.result} />)}</div>}
    <LogGame run={run} formations={formations} />
    {s.stages.length === 3 && <p className="text-sm text-muted-foreground">Win rate through the run: {s.stages.map(x => `${x.stage.toLowerCase()} ${x.win_rate ?? "–"}%`).join(", ")}</p>}
    {s.by_formation.length > 0 && <details><summary className="cursor-pointer text-sm text-muted-foreground">By opponent formation and every game</summary>
      <div className="mt-2 space-y-3">
        <DataTable headers={["Their formation", "Games", "Record", "Win rate", "Goals"]} rows={s.by_formation.map(f => [f.formation, String(f.games), `${f.w}W ${f.d}D ${f.l}L`, f.win_rate === null ? "–" : `${f.win_rate}%`, `${f.gf}-${f.ga}`])} />
        <DataTable headers={["#", "Score", "Their formation", "Played", ""]} rows={run.games.map((g, i) => [String(i + 1), <span className="flex items-center gap-2"><Pill r={g.result} />{g.goals_for}-{g.goals_against}{g.penalties ? ` (pens ${g.penalties})` : ""}{g.opponent_quit ? " · quit" : ""}</span>, g.opponent_formation ?? "–", dateText(g.played_at), <Button size="sm" variant="ghost" aria-label="Delete game" onClick={() => removeGame.mutate(g.id)}><Trash2 className="h-3 w-3" /></Button>])} />
      </div>
    </details>}
  </article>;
}

export default function ChampsTrackerPage() {
  const context = useMarketPlatform();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...futKeys.champs, context.platform], queryFn: () => futApi.champs.overview(context.platform), enabled: context.enabled });
  const [mode, setMode] = useState<ChampsMode>("champs"), [name, setName] = useState(""), [games, setGames] = useState(""), [target, setTarget] = useState("");
  const create = useMutation({ mutationFn: () => futApi.champs.createRun({ platform: context.platform, mode, name: name || undefined, games_allowed: num(games), target_wins: num(target) }), onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: futKeys.champs }); } });
  const d = q.data;
  return <MarketShell title="Champs Tracker" showTabs={false} {...context}>
    <ErrorNotice error={q.error || create.error} />
    <p className="text-sm text-muted-foreground">Log your Champions, Rivals and Squad Battles games as you play: score and the opponent's formation is enough. GafferBot tracks your record, form, streaks, which formations beat you and whether you fade late, and writes a recap you can paste into Discord. Nothing is read from EA.</p>
    <form className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
      <div className="space-y-1.5"><Label>Mode</Label><Select value={mode} onValueChange={v => setMode(v as ChampsMode)}><SelectTrigger aria-label="Mode"><SelectValue /></SelectTrigger><SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="run-name">Name</Label><Input id="run-name" placeholder="e.g. Weekend 3" maxLength={80} value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="run-games">Games in the run</Label><Input id="run-games" inputMode="numeric" placeholder="Optional" value={games} onChange={e => setGames(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="run-target">Win target</Label><Input id="run-target" inputMode="numeric" placeholder="Optional" value={target} onChange={e => setTarget(e.target.value)} /></div>
      <div className="flex items-end"><Button type="submit" className="w-full" disabled={create.isPending}>Start a run</Button></div>
    </form>
    {q.isPending ? <MarketLoading /> : d && <>
      {d.by_mode.length > 0 && <Section title="All time">{d.by_mode.map(m => <div key={m.mode} className="space-y-2"><h3 className="flex items-center gap-2 text-sm font-semibold">{m.label}<Badge variant="outline">{m.games} games</Badge>{m.form && <span className="flex gap-1">{m.form.split("").map((r, i) => <Pill key={i} r={r as "W" | "D" | "L"} />)}</span>}</h3><Totals s={m} /></div>)}</Section>}
      <Section title="Runs">{d.runs.length ? <div className="space-y-4">{d.runs.map(r => <RunCard key={r.id} run={r} formations={d.formations} />)}</div> : <p className="text-sm text-muted-foreground">No runs yet. Start one above when your next Champs weekend or Rivals week begins.</p>}</Section>
    </>}
  </MarketShell>;
}
