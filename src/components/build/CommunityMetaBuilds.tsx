// Community meta builds: the best Virtual Pro build per position according to the Pro Clubs community (Reddit and
// YouTube, read into the Knowledge Bank). Used on the public Build lab (load one into the planner) and the Knowledge
// Bank's Pro Clubs builds tab. Data from the public meta-builds function (src/lib/metaBuilds.ts has the rules).
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, ExternalLink, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { decodeBuild, type Build } from "@/lib/proBuild";
import { META_POSITIONS, type MetaBuild, type MetaPosition, type MetaSource } from "@/lib/metaBuilds";
import { cn } from "@/lib/utils";

export interface MetaBuildsResponse { days: number; builds: number; positions: MetaBuild[]; generated_at: string }
export const META_PERIODS = [30, 90, 180, 365] as const;

export function useMetaBuilds(days = 180) {
  return useQuery({
    queryKey: ["meta-builds", days],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`meta-builds?days=${days}`, { method: "GET" });
      if (error) throw error;
      return data as MetaBuildsResponse;
    },
    staleTime: 5 * 60_000,
  });
}

const pct = (share: number) => `${Math.round(share * 100)}%`;
const AGREEMENT: Record<MetaBuild["agreement"], { label: string; tone: string; detail: string }> = {
  agreed: { label: "Agreed", tone: "bg-success/15 text-success", detail: "Most builds people share for this position agree." },
  leaning: { label: "Leaning", tone: "bg-primary/15 text-primary", detail: "One archetype leads, but plenty of people go another way." },
  split: { label: "Split", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400", detail: "The community is split on this position." },
  early: { label: "Early", tone: "bg-muted text-muted-foreground", detail: "Only a couple of builds so far, so treat it as a first read." },
};

function sourceName(s: MetaSource) {
  if (s.kind === "youtube") return s.community ? `${s.community} on YouTube` : "YouTube";
  if (s.kind === "reddit") return s.community ?? "Reddit";
  return s.community ?? "Shared source";
}

function SourceLink({ s }: { s: MetaSource }) {
  const label = s.title || sourceName(s);
  return <li className="text-sm">
    {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">{label}<ExternalLink className="h-3 w-3" /></a> : <span className="font-medium">{label}</span>}
    <span className="text-muted-foreground"> · {sourceName(s)} · {new Date(s.published_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
    <p className="text-xs text-muted-foreground">{s.statement}</p>
  </li>;
}

/** One position's community meta build, with where it came from. */
export function MetaBuildCard({ meta, onLoad, compact = false, className }: { meta: MetaBuild; onLoad?: (b: Build) => void; compact?: boolean; className?: string }) {
  if (!meta.builds || !meta.build) {
    return <Card className={cn("space-y-1 p-4 text-sm", className)}>
      <p className="font-medium">No community builds for {meta.label.toLowerCase()} yet.</p>
      <p className="text-muted-foreground">GafferBot reads Pro Clubs build posts and videos every few hours. Builds people share for this position will show here.</p>
    </Card>;
  }
  const a = AGREEMENT[meta.agreement];
  const build = decodeBuild(meta.code ?? "") ?? meta.build;
  const body = [meta.heightCm && `${meta.heightCm} cm`, meta.weightKg && `${meta.weightKg} kg`, meta.skillMoves && `${meta.skillMoves}★ skill moves`, meta.weakFoot && `${meta.weakFoot}★ weak foot`].filter(Boolean);
  return <Card className={cn("space-y-4 p-4", className)}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Community meta {meta.label.toLowerCase()}</p>
        <h3 className="font-display text-2xl font-bold">{meta.archetype?.name ?? "Archetype not agreed"}</h3>
        <p className="text-sm text-muted-foreground">
          {meta.archetype ? `${pct(meta.archetype.share)} of builds` : "Nobody named an archetype"}
          {meta.alternatives.length > 0 && <> · also {meta.alternatives.map((x) => `${x.name} ${pct(x.share)}`).join(", ")}</>}
        </p>
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", a.tone)} title={a.detail}>{a.label}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />{meta.builds} build{meta.builds === 1 ? "" : "s"} · {meta.sources} source{meta.sources === 1 ? "" : "s"}</span>
      </div>
    </div>

    {body.length > 0 && <p className="text-sm"><b>Body and skills:</b> {body.join(" · ")}</p>}

    {meta.playstyles.length > 0 && <div className="space-y-1.5">
      <p className="text-sm font-semibold">PlayStyles</p>
      <div className="flex flex-wrap gap-1.5">{meta.playstyles.map((p) => <Badge key={p.name} variant="secondary" title={`In ${pct(p.share)} of builds`}>{p.name} <span className="ml-1 font-normal opacity-70">{pct(p.share)}</span></Badge>)}</div>
    </div>}

    {meta.attributes.length > 0 && <div className="space-y-1.5">
      <p className="text-sm font-semibold">Max these first</p>
      <div className="flex flex-wrap gap-1.5">{meta.attributes.map((p) => <Badge key={p.name} variant="outline" title={`Named in ${pct(p.share)} of builds`}>{p.name}</Badge>)}</div>
    </div>}

    {meta.pointsFrom
      ? <p className="text-xs text-muted-foreground">Attribute points come from the most-backed build someone shared as a link{meta.pointsFrom.title ? ` ("${meta.pointsFrom.title}")` : ""}.</p>
      : <p className="text-xs text-muted-foreground">Nobody shared exact points for this build yet, so loading it sets the archetype, body, skills and PlayStyles and you spend the points (start with the attributes above).</p>}

    {!compact && meta.warnings.length > 0 && <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="inline-flex items-center gap-1 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> What people warn against</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">{meta.warnings.map((w, i) => <li key={i}>{w.statement}</li>)}</ul>
    </div>}

    <div className="flex flex-wrap gap-2">
      {onLoad
        ? <Button onClick={() => onLoad(build)}><Download className="mr-1 h-4 w-4" /> Load this build</Button>
        : <Button asChild><Link to={`/build?b=${meta.code}`}>Open in Build lab</Link></Button>}
    </div>

    {!compact && <details className="group">
      <summary className="cursor-pointer text-sm font-semibold">Where this comes from ({meta.topSources.length})</summary>
      <ul className="mt-2 space-y-2">{meta.topSources.map((s) => <SourceLink key={s.id} s={s} />)}</ul>
    </details>}
  </Card>;
}

/** Position picker + the meta build for it. */
export function CommunityMetaBuilds({ onLoad, compact = false, initial = "ST", days = 180 }: { onLoad?: (b: Build) => void; compact?: boolean; initial?: MetaPosition; days?: number }) {
  const [position, setPosition] = useState<MetaPosition>(initial);
  const q = useMetaBuilds(days);
  const meta = q.data?.positions?.find((p) => p.position === position);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Position">
      {META_POSITIONS.map((p) => {
        const n = q.data?.positions?.find((m) => m.position === p.key)?.builds ?? 0;
        return <Button key={p.key} type="button" size="sm" variant={position === p.key ? "default" : "outline"} className="h-8 rounded-full" aria-pressed={position === p.key} onClick={() => setPosition(p.key)} title={`${p.label}: ${n} build${n === 1 ? "" : "s"}`}>
          {p.key}{q.data && <span className={cn("ml-1 text-xs", position === p.key ? "opacity-80" : "text-muted-foreground")}>{n}</span>}
        </Button>;
      })}
    </div>
    {q.isPending ? <p className="text-sm text-muted-foreground">Loading what the community recommends...</p>
      : q.error ? <p className="text-sm text-destructive">Couldn't load the community builds. Try again in a minute.</p>
      : meta && <MetaBuildCard meta={meta} onLoad={onLoad} compact={compact} />}
  </div>;
}

/** Compact loader for the Build lab: pick a position, see the summary, load it into the planner. */
export function CommunityMetaLoader({ onLoad, className, innerClassName }: { onLoad: (b: Build) => void; className?: string; innerClassName?: string }) {
  const [position, setPosition] = useState<MetaPosition>("ST");
  const q = useMetaBuilds(180);
  const meta = q.data?.positions?.find((p) => p.position === position);
  return <Card className={cn("space-y-3 p-4", className)}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-semibold">Load community meta build</h2>
        <p className="text-sm text-muted-foreground">What the Pro Clubs community on Reddit and YouTube says is the best build for each position.</p>
      </div>
      <Select value={position} onValueChange={(v) => setPosition(v as MetaPosition)}>
        <SelectTrigger className="w-44" aria-label="Position"><SelectValue /></SelectTrigger>
        <SelectContent>{META_POSITIONS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label} ({p.key})</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {q.isPending ? <p className="text-sm text-muted-foreground">Loading...</p>
      : q.error ? <p className="text-sm text-destructive">Couldn't load the community builds right now.</p>
      : meta && <MetaBuildCard meta={meta} onLoad={onLoad} compact className={innerClassName} />}
  </Card>;
}
