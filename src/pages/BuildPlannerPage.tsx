import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Minus, Plus, Link2, Download, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ARCHETYPES,
  ATTR_GROUPS,
  ATTRIBUTES,
  HEIGHT_RANGE,
  LEVEL_MAX,
  MAX_PLAYSTYLES,
  PLAYSTYLES,
  POINTS_MAX_PER_ATTR,
  WEIGHT_RANGE,
  buildPath,
  buildSummary,
  decodeBuild,
  emptyBuild,
  encodeBuild,
  groupTotals,
  importProClubsBuilder,
  normaliseBuild,
  type Build,
} from "@/lib/proBuild";
import { CommunityMetaLoader } from "@/components/build/CommunityMetaBuilds";

const LINES = [
  ["GK", "Goalkeepers"],
  ["DEF", "Defenders"],
  ["MID", "Midfielders"],
  ["FWD", "Forwards"],
] as const;

function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-8 text-center tabular-nums">{value}</span>
      <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

// gafferbot.app/build: plan a Virtual Pro, no sign-in. The whole build lives in the ?b= share code.
export default function BuildPlannerPage() {
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const [build, setBuild] = useState<Build>(() => decodeBuild(params.get("b") ?? "") ?? emptyBuild());
  const [importText, setImportText] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);

  // Keep the address bar in sync so a copied URL is always the current build
  useEffect(() => {
    const code = encodeBuild(build);
    if (params.get("b") !== code) setParams({ b: code }, { replace: true });
  }, [build, params, setParams]);

  const set = (patch: Partial<Build>) => setBuild((b) => normaliseBuild({ ...b, ...patch }));
  const setPoints = (key: string, v: number) => setBuild((b) => normaliseBuild({ ...b, points: { ...b.points, [key]: v } }));
  const summary = useMemo(() => buildSummary(build), [build]);
  const totals = useMemo(() => groupTotals(build), [build]);
  const arch = ARCHETYPES.find((a) => a.key === build.archetype)!;
  const groups = ATTR_GROUPS.filter((g) => arch.line === "GK" || g.key !== "goalkeeping" || totals[g.key] > 0);

  const share = async () => {
    const url = `${window.location.origin}${buildPath(build)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Anyone with it sees this build." });
    } catch {
      toast({ title: "Copy this link", description: url });
    }
  };

  const doImport = () => {
    const ours = decodeBuild(importText.trim().replace(/^.*[?&]b=/, "").replace(/[&#].*$/, ""));
    if (ours) {
      setBuild(ours);
      setImportNote("Loaded.");
      return;
    }
    const theirs = importProClubsBuilder(importText);
    if (!theirs) {
      setImportNote("That doesn't look like a build link or code.");
      return;
    }
    setBuild({ ...theirs.build, playstyles: build.playstyles, budget: build.budget });
    setImportNote(theirs.skipped.length ? `Loaded. Skipped attributes we don't know: ${theirs.skipped.join(", ")}.` : "Loaded.");
  };

  const toggleStyle = (name: string) =>
    setBuild((b) => {
      const has = b.playstyles.includes(name);
      if (!has && b.playstyles.length >= MAX_PLAYSTYLES) return b;
      return normaliseBuild({ ...b, playstyles: has ? b.playstyles.filter((p) => p !== name) : [...b.playstyles, name] });
    });

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">EA FC 27 Pro Clubs</p>
          <h1 className="font-display text-3xl font-bold">Virtual Pro build planner</h1>
          <p className="mt-1 text-muted-foreground">
            Plan where your points go before you spend them, then share the build with your club. Type in the points your game says you have and the planner keeps
            count. The link holds the whole build, so there's nothing to sign in to.
          </p>
        </div>

        <CommunityMetaLoader onLoad={(b) => { setBuild({ ...b, budget: build.budget }); toast({ title: "Community build loaded", description: "Change anything you like, then copy the link." }); }} />

        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Build name</Label>
            <Input id="name" value={build.name} maxLength={40} placeholder="e.g. Box-to-box engine" onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Archetype</Label>
            <Select value={build.archetype} onValueChange={(v) => set({ archetype: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINES.map(([line, label]) => (
                  <SelectGroup key={line}>
                    <SelectLabel>{label}</SelectLabel>
                    {ARCHETYPES.filter((a) => a.line === line).map((a) => <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{arch.blurb}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <div className="space-y-1.5">
              <Label htmlFor="level">Level</Label>
              <Input id="level" type="number" min={1} max={LEVEL_MAX} value={build.level} onChange={(e) => set({ level: num(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="height">Height (cm)</Label>
              <Input id="height" type="number" min={HEIGHT_RANGE[0]} max={HEIGHT_RANGE[1]} value={build.heightCm} onChange={(e) => set({ heightCm: num(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" type="number" min={WEIGHT_RANGE[0]} max={WEIGHT_RANGE[1]} value={build.weightKg} onChange={(e) => set({ weightKg: num(e.target.value) })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2">
            <div className="flex items-center gap-2 text-sm">Skill moves <Stepper label="skill moves" value={build.skillMoves} min={1} max={5} onChange={(v) => set({ skillMoves: v })} /></div>
            <div className="flex items-center gap-2 text-sm">Weak foot <Stepper label="weak foot" value={build.weakFoot} min={1} max={5} onChange={(v) => set({ weakFoot: v })} /></div>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="budget">Points you have</Label>
              <Input
                id="budget"
                className="w-32"
                type="number"
                min={0}
                placeholder="from the game"
                value={build.budget ?? ""}
                onChange={(e) => set({ budget: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="text-sm tabular-nums">
              <b className="text-2xl">{summary.spent}</b> spent
              {summary.remaining !== null && (
                <span className={summary.remaining < 0 ? "ml-3 text-destructive" : "ml-3 text-muted-foreground"}>
                  {summary.remaining < 0 ? `${-summary.remaining} over` : `${summary.remaining} left`}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => set({ points: {} })}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reset points
            </Button>
          </div>
          {summary.focus.length > 0 && (
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-label="Where the points went">
              {summary.focus.map((f, i) => (
                <div key={f.group} title={`${f.label} ${Math.round(f.share * 100)}%`} className="h-full" style={{ width: `${f.share * 100}%`, background: `hsl(var(--primary) / ${1 - i * 0.14})` }} />
              ))}
            </div>
          )}
          {summary.focus.length > 0 && (
            <p className="text-sm text-muted-foreground">{summary.focus.map((f) => `${f.label} ${Math.round(f.share * 100)}%`).join(" · ")}</p>
          )}
          {summary.notes.map((n) => <p key={n} className="text-sm text-amber-600 dark:text-amber-400">{n}</p>)}
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.key} className="p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-semibold">{g.label}</h2>
                <span className="text-sm tabular-nums text-muted-foreground">{totals[g.key]}</span>
              </div>
              <div className="space-y-1.5">
                {ATTRIBUTES.filter((a) => a.group === g.key).map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2 text-sm">
                    <span>{a.label}</span>
                    <Stepper label={a.label} value={build.points[a.key] ?? 0} min={0} max={POINTS_MAX_PER_ATTR} onChange={(v) => setPoints(a.key, v)} />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <Card className="space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">PlayStyles</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{build.playstyles.length} / {MAX_PLAYSTYLES}</span>
          </div>
          {ATTR_GROUPS.filter((g) => (arch.line === "GK" ? true : g.key !== "goalkeeping")).map((g) => {
            const styles = PLAYSTYLES.filter((p) => p.group === g.key);
            if (!styles.length) return null;
            return (
              <div key={g.key} className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 text-xs uppercase tracking-wide text-muted-foreground">{g.label}</span>
                {styles.map((p) => {
                  const on = build.playstyles.includes(p.name);
                  return (
                    <button key={p.name} type="button" onClick={() => toggleStyle(p.name)} aria-pressed={on} disabled={!on && build.playstyles.length >= MAX_PLAYSTYLES}>
                      <Badge variant={on ? "default" : "outline"} className="cursor-pointer">{p.name}</Badge>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </Card>

        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="import">Import a build</Label>
            <Input id="import" value={importText} placeholder="Paste a GafferBot or Pro Clubs Builder link" onChange={(e) => { setImportText(e.target.value); setImportNote(null); }} />
            {importNote && <p className="text-xs text-muted-foreground">{importNote}</p>}
          </div>
          <Button variant="outline" onClick={doImport} disabled={!importText.trim()}><Download className="mr-1 h-4 w-4" /> Import</Button>
          <Button onClick={share}><Link2 className="mr-1 h-4 w-4" /> Copy share link</Button>
        </Card>

        <p className="text-xs text-muted-foreground">
          EA doesn't publish FC 27's point costs, caps or PlayStyle unlock rules, so the planner doesn't guess them: what you have to spend comes from your own
          game screen.
        </p>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/clubs" className="underline">Look up a club</Link> · <Link to="/transfers" className="underline">Transfer board</Link> · Powered by{" "}
          <Link to="/welcome" className="underline">GafferBot</Link>
        </p>
      </div>
    </div>
  );
}
