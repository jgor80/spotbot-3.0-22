import { useMemo } from "react";
import { CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { KbMap, KbTopic } from "@/lib/futApi";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGREEMENT, AGREEMENT_ORDER, CATEGORY_LABELS, sentimentText, trendText } from "./knowledgePresentation";

interface Point extends KbTopic { x: number; y: number; z: number; label: string }

// Bubbles sit inside the plot even at the extremes, so a topic everyone loves isn't half cut off
const clamp = (v: number | null) => Math.max(-0.95, Math.min(0.95, v ?? 0));

function TopicTip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const t = active ? payload?.[0]?.payload : null;
  if (!t) return null;
  const a = AGREEMENT[t.agreement];
  return <div className="max-w-64 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md">
    <p className="font-semibold">{t.topic}</p>
    <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[t.category]}</p>
    <p className="mt-2 flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />{a.label} · {sentimentText(t.net)}</p>
    <p className="text-muted-foreground">{t.for} for · {t.against} against · {t.mixed} mixed, from {t.sources} source{t.sources === 1 ? "" : "s"}</p>
    <p className="text-muted-foreground">Talk is {trendText(t.trend)}</p>
  </div>;
}

// One line above the bubble (Recharts' own label wraps at the bubble's width)
function BubbleLabel(props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
  const { x, y, width, value } = props;
  if (!value || x == null || y == null) return null;
  return <text x={Number(x) + Number(width ?? 0) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground))" style={{ pointerEvents: "none" }}>{String(value)}</text>;
}

function TrendIcon({ trend }: { trend: number | null }) {
  if (trend != null && trend >= 0.2) return <ArrowUpRight className="h-4 w-4 text-foreground" aria-label="rising" />;
  if (trend != null && trend <= -0.2) return <ArrowDownRight className="h-4 w-4 text-muted-foreground" aria-label="cooling" />;
  return <Minus className="h-4 w-4 text-muted-foreground" aria-label="steady" />;
}

/** The map: each topic placed by how people feel about it (left against, right for) and whether talk about it is rising. */
export function KnowledgeMap({ map, onPick }: { map: KbMap; onPick: (key: string) => void }) {
  const points = useMemo<Point[]>(() => {
    // Phones get fewer, shorter labels so they don't run into each other
    const narrow = typeof window !== "undefined" && window.innerWidth < 640;
    const max = narrow ? 14 : 22;
    const top = new Set([...map.topics].sort((a, b) => b.buzz - a.buzz).slice(0, narrow ? 5 : 10).map((t) => t.key));
    return map.topics.slice(0, 120).map((t) => ({ ...t, x: clamp(t.net), y: clamp(t.trend), z: t.buzz, label: top.has(t.key) ? (t.topic.length > max ? `${t.topic.slice(0, max - 1)}…` : t.topic) : "" }));
  }, [map.topics]);
  const groups = AGREEMENT_ORDER.map((a) => ({ a, points: points.filter((p) => p.agreement === a) })).filter((g) => g.points.length);

  return <div className="kb-viz space-y-3">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Legend">
      {AGREEMENT_ORDER.map((a) => <span key={a} className="flex items-center gap-1.5" title={AGREEMENT[a].help}>
        <span aria-hidden className="h-3 w-3 rounded-full border-2 border-card" style={{ background: AGREEMENT[a].color }} />{AGREEMENT[a].label}
      </span>)}
      <span className="text-muted-foreground">Bigger bubble = talked about more</span>
    </div>
    <div className="relative h-[420px] w-full sm:h-[480px]" role="img" aria-label={`Map of ${map.topics.length} topics by sentiment and trend. The table below lists them all.`}>
      <span className="pointer-events-none absolute left-14 top-1 text-xs text-muted-foreground">↑ Talk rising</span>
      <span className="pointer-events-none absolute bottom-12 left-14 text-xs text-muted-foreground">↓ Cooling off</span>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 16, bottom: 20, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} />
          <XAxis type="number" dataKey="x" domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} tickFormatter={(v: number) => v === -1 ? "Against" : v === 1 ? "For" : v === 0 ? "Mixed" : ""}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <YAxis type="number" dataKey="y" domain={[-1, 1]} ticks={[-1, 0, 1]} width={48} tickFormatter={(v: number) => v === 1 ? "Rising" : v === -1 ? "Fading" : "Steady"}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
          <ZAxis type="number" dataKey="z" range={[60, 1400]} />
          <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
          <Tooltip content={<TopicTip />} cursor={false} />
          {groups.map(({ a, points }) => <Scatter key={a} name={AGREEMENT[a].label} data={points} fill={AGREEMENT[a].color} fillOpacity={0.85}
            stroke="hsl(var(--card))" strokeWidth={2} cursor="pointer" isAnimationActive={false}
            onClick={(p: { payload?: Point }) => p?.payload && onPick(p.payload.key)}>
            <LabelList dataKey="label" content={BubbleLabel} />
          </Scatter>)}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
    <p className="text-xs text-muted-foreground">Left to right: how people feel about it, weighted by upvotes and views. Bottom to top: talk in the newer half of the period against the older half. Click a bubble for both sides and the sources.</p>
  </div>;
}

function TopicRow({ t, onPick }: { t: KbTopic; onPick: (key: string) => void }) {
  return <TableRow className="cursor-pointer" onClick={() => onPick(t.key)}>
    <TableCell><button type="button" className="text-left font-medium hover:underline" onClick={(e) => { e.stopPropagation(); onPick(t.key); }}>{t.topic}</button>
      <div className="text-xs text-muted-foreground sm:hidden">{CATEGORY_LABELS[t.category]}</div></TableCell>
    <TableCell className="hidden text-muted-foreground sm:table-cell">{CATEGORY_LABELS[t.category]}</TableCell>
    <TableCell><span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: AGREEMENT[t.agreement].color }} />{AGREEMENT[t.agreement].label}</span>
      <div className="text-xs text-muted-foreground">{sentimentText(t.net)}</div></TableCell>
    <TableCell className="tabular-nums">{t.for}<span className="text-muted-foreground"> / </span>{t.against}<span className="text-muted-foreground"> / </span>{t.mixed}</TableCell>
    <TableCell><span className="flex items-center gap-1"><TrendIcon trend={t.trend} /><span className="hidden text-muted-foreground md:inline">{trendText(t.trend)}</span></span></TableCell>
  </TableRow>;
}

/** Every topic on the map as a table (also the accessible version of the chart). */
export function TopicTable({ topics, onPick }: { topics: KbTopic[]; onPick: (key: string) => void }) {
  return <div className="kb-viz overflow-x-auto rounded-xl border border-border">
    <Table>
      <TableHeader><TableRow>
        <TableHead>Topic</TableHead><TableHead className="hidden sm:table-cell">Kind</TableHead><TableHead>View</TableHead>
        <TableHead><abbr title="For / against / mixed claims" className="no-underline">For / vs / mixed</abbr></TableHead><TableHead>Talk</TableHead>
      </TableRow></TableHeader>
      <TableBody>{topics.map((t) => <TopicRow key={t.key} t={t} onPick={onPick} />)}</TableBody>
    </Table>
  </div>;
}

/** Three short lists: what's heating up, what people agree on, and what they argue about. */
export function TopicHighlights({ topics, onPick }: { topics: KbTopic[]; onPick: (key: string) => void }) {
  const rising = topics.filter((t) => (t.trend ?? 0) >= 0.2 && t.claims >= 2).sort((a, b) => b.buzz * (b.trend ?? 0) - a.buzz * (a.trend ?? 0)).slice(0, 5);
  const agreed = topics.filter((t) => t.agreement === "agreed").slice(0, 5);
  const split = topics.filter((t) => t.agreement === "split").slice(0, 5);
  const box = (title: string, help: string, list: KbTopic[]) => <section className="rounded-xl border border-border bg-card p-4">
    <h3 className="font-display font-semibold">{title}</h3>
    <p className="mb-2 text-xs text-muted-foreground">{help}</p>
    {list.length ? <ul className="space-y-1.5">{list.map((t) => <li key={t.key}>
      <button type="button" onClick={() => onPick(t.key)} className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-muted">
        <span className="truncate">{t.topic}</span>
        <Badge variant="outline" className="shrink-0 font-normal">{sentimentText(t.net)}</Badge>
      </button></li>)}</ul> : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
  </section>;
  return <div className="grid gap-3 md:grid-cols-3">
    {box("Heating up", "More talk lately than earlier in the period", rising)}
    {box("Community agrees", "70%+ of what's said points one way", agreed)}
    {box("Hot debates", "People are split", split)}
  </div>;
}
