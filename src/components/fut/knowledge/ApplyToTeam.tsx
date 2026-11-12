import { useMutation } from "@tanstack/react-query";
import { Shirt, Sparkles } from "lucide-react";
import { futApi, type KbApplyResult } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FIT: Record<NonNullable<KbApplyResult["advice"]>["fit"], { label: string; className: string }> = {
  high: { label: "Fits your team", className: "border-success/50 text-success" },
  some: { label: "Partly fits", className: "border-primary/50 text-primary" },
  low: { label: "Hardly applies", className: "text-muted-foreground" },
};

export function ApplyResult({ r }: { r: KbApplyResult }) {
  return <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" role="status">
    {r.advice && <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("font-normal", FIT[r.advice.fit].className)}>{FIT[r.advice.fit].label}</Badge>
        <p className="font-medium">{r.advice.headline}</p>
      </div>
      {r.advice.points.length > 0 && <ul className="list-disc space-y-1 pl-5">{r.advice.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      {r.advice.actions.length > 0 && <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Try this</p>
        <ul className="list-disc space-y-1 pl-5">{r.advice.actions.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </div>}
    </>}
    {r.matches.length > 0 && <div className={cn(r.advice && "border-t border-border pt-2")}>
      {r.advice && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From your club</p>}
      <ul className="space-y-1">{r.matches.map((m, i) => <li key={i} className="flex gap-2"><Shirt className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span>{m.text}{m.kind === "playstyle" && m.players.length > 0 ? ` (${m.players.join(", ")})` : ""}</span></li>)}</ul>
    </div>}
    {!r.advice && r.matches.length === 0 && <p>Nothing here names your formation, your players or their PlayStyles{r.team.squad ? "" : ", and you haven't saved a squad yet"}.</p>}
    <p className="text-xs text-muted-foreground">
      Compared with {r.team.squad ? `your squad "${r.team.squad.name}" (${r.team.squad.formation})` : "no saved squad"} and {r.team.club_size.toLocaleString()} club card{r.team.club_size === 1 ? "" : "s"}.
      {r.via === "data" ? " Add a Claude key on your profile for a written read of what it means for your team." : ""}
    </p>
  </div>;
}

/** "How does this apply to my team?" for one topic or one source. */
export function ApplyToTeam({ topic, source, compact }: { topic?: string; source?: string; compact?: boolean }) {
  const apply = useMutation({ mutationFn: () => futApi.knowledge.apply({ topic, source }) });
  return <div className="space-y-2">
    {!apply.data && <Button type="button" variant={compact ? "ghost" : "outline"} size="sm" className={cn("gap-1.5", compact && "h-7 px-2 text-xs")} disabled={apply.isPending} onClick={() => apply.mutate()}>
      <Sparkles className="h-3.5 w-3.5" />{apply.isPending ? "Checking your team…" : "How does this apply to my team?"}
    </Button>}
    <ErrorNotice error={apply.error} />
    {apply.data && <ApplyResult r={apply.data} />}
  </div>;
}
