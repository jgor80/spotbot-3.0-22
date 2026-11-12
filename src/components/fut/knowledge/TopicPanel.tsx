import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, Lock } from "lucide-react";
import { futApi, futKeys, type KbStatement } from "@/lib/futApi";
import { Busy, ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ApplyToTeam } from "./ApplyToTeam";
import { AGREEMENT, ago, CATEGORY_LABELS, sentimentText, sourceLabel, STANCE } from "./knowledgePresentation";

function Statement({ s }: { s: KbStatement }) {
  const label = sourceLabel(s.source);
  return <li className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
    <p>{s.statement}</p>
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      {s.source.url
        ? <a href={s.source.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1 hover:underline"><span className="truncate">{label}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>
        : <span className="inline-flex items-center gap-1">{s.source.mine && <Lock className="h-3 w-3" />}{label}</span>}
      <span>· {ago(s.said_at)}</span>
      {s.source.score > 0 && <span>· {s.source.score.toLocaleString()} {s.source.kind === "youtube" ? "views" : "upvotes"}</span>}
    </p>
  </li>;
}

function WeekTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-border bg-popover p-2 text-xs text-popover-foreground shadow-md">
    <p className="font-medium">Week of {label}</p>
    {payload.map((p) => <p key={p.name}>{p.name}: {p.value}</p>)}
  </div>;
}

/** One topic: both sides with their sources, and how talk about it moved week by week. */
export function TopicPanel({ topicKey, days, onClose }: { topicKey: string | null; days: number; onClose: () => void }) {
  const q = useQuery({ queryKey: [...futKeys.knowledge, "topic", topicKey, days], queryFn: () => futApi.knowledge.topic(topicKey!, Math.max(days, 90)), enabled: !!topicKey });
  const t = q.data;
  const weeks = (t?.weeks ?? []).map((w) => ({ ...w, label: new Date(w.week).toLocaleDateString(undefined, { day: "numeric", month: "short" }) }));
  const sides = ([1, -1, 0] as const).map((stance) => ({ stance, list: (t?.statements ?? []).filter((s) => s.stance === stance) })).filter((g) => g.list.length);

  return <Sheet open={!!topicKey} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="kb-viz w-full overflow-y-auto sm:max-w-xl">
      {q.isPending ? <Busy /> : q.isError ? <ErrorNotice error={q.error} /> : t && <div className="space-y-5">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="font-display text-2xl">{t.topic}</SheetTitle>
          <SheetDescription>{CATEGORY_LABELS[t.category]} · last {t.days} days · {t.claims} claim{t.claims === 1 ? "" : "s"} from {t.sources} source{t.sources === 1 ? "" : "s"}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-normal"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: AGREEMENT[t.agreement].color }} />{AGREEMENT[t.agreement].label}</Badge>
          <Badge variant="outline" className="font-normal">{sentimentText(t.net)}</Badge>
        </div>
        {/* For against mixed, as one bar */}
        <div>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {([1, -1, 0] as const).map((st) => { const n = st === 1 ? t.for : st === -1 ? t.against : t.mixed; return n ? <div key={st} style={{ flexGrow: n, background: STANCE[st].color }} /> : null; })}
          </div>
          <p className="mt-1 flex gap-4 text-xs text-muted-foreground"><span>{t.for} for</span><span>{t.against} against</span><span>{t.mixed} mixed or how-to</span></p>
        </div>
        <ApplyToTeam key={t.key} topic={t.key} />
        {weeks.length > 1 && <section aria-label="Claims per week">
          <h3 className="mb-1 text-sm font-semibold">Week by week</h3>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip content={<WeekTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="for" name="For" stackId="s" fill="var(--kb-for)" stroke="hsl(var(--card))" strokeWidth={1} isAnimationActive={false} />
                <Bar dataKey="against" name="Against" stackId="s" fill="var(--kb-against)" stroke="hsl(var(--card))" strokeWidth={1} isAnimationActive={false} />
                <Bar dataKey="mixed" name="Mixed" stackId="s" fill="var(--kb-mixed)" stroke="hsl(var(--card))" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>}
        {sides.map(({ stance, list }) => <section key={stance} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STANCE[stance].color }} />
            {stance === 1 ? "What people like" : stance === -1 ? "What people don't" : "Tips and it-depends"} ({list.length})</h3>
          <ul className="space-y-2">{list.slice(0, 20).map((s) => <Statement key={s.id} s={s} />)}</ul>
        </section>)}
        <p className="text-xs text-muted-foreground">Claims are GafferBot's short summaries of what people said, not facts. Follow the links for the full posts and videos.</p>
      </div>}
    </SheetContent>
  </Sheet>;
}
