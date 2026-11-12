import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { futApi, futKeys, KB_CATEGORIES, type KbCategory } from "@/lib/futApi";
import { Busy, ErrorNotice, FutShell, useFutAvailable } from "@/components/fut/FutShared";
import { KnowledgeMap, TopicHighlights, TopicTable } from "@/components/fut/knowledge/KnowledgeMap";
import { TopicPanel } from "@/components/fut/knowledge/TopicPanel";
import { AskBank } from "@/components/fut/knowledge/AskBank";
import { TeamPlan } from "@/components/fut/knowledge/TeamPlan";
import { FeedStatus, SourcesPanel } from "@/components/fut/knowledge/SourcesPanel";
import { ago, CATEGORY_LABELS } from "@/components/fut/knowledge/knowledgePresentation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const PERIODS = [7, 30, 90] as const;
const TABS = ["map", "team", "ask", "sources"] as const;
type Tab = typeof TABS[number];

/** Knowledge Bank: what the FUT community says about gameplay and strategy, as a map, an Ask chat and the sources. */
export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? params.get("tab") as Tab : "map";
  const daysRaw = Number(params.get("days"));
  const days = (PERIODS as readonly number[]).includes(daysRaw) ? daysRaw : 30;
  const category = (KB_CATEGORIES as readonly string[]).includes(params.get("category") ?? "") ? params.get("category") as KbCategory : null;
  const topic = params.get("topic");
  const set = (changes: Record<string, string | null>) => setParams((p) => {
    const next = new URLSearchParams(p);
    for (const [k, v] of Object.entries(changes)) if (v === null) next.delete(k); else next.set(k, v);
    return next;
  }, { replace: true });

  const enabled = useFutAvailable();
  const status = useQuery({ queryKey: [...futKeys.knowledge, "status"], queryFn: futApi.knowledge.status, enabled, staleTime: 60_000 });
  const map = useQuery({ queryKey: [...futKeys.knowledge, "map", days, category], queryFn: () => futApi.knowledge.map(days, category), enabled: enabled && tab === "map", placeholderData: keepPreviousData });
  const pick = (key: string) => set({ topic: key });
  const s = status.data;

  return <FutShell title="Knowledge Bank">
    <p className="-mt-3 text-sm text-muted-foreground">
      What the FUT community is saying about formations, tactics, players and gameplay, gathered from Reddit, YouTube and sources you add.
      {s?.topics != null ? ` ${s.topics.toLocaleString()} topics from ${(s.sources ?? 0).toLocaleString()} sources, last collected ${ago(s.last_run?.finished_at)}.` : ""}
    </p>
    <Tabs value={tab} onValueChange={(v) => set({ tab: v === "map" ? null : v })}>
      <TabsList><TabsTrigger value="map">Map</TabsTrigger><TabsTrigger value="team">For my team</TabsTrigger><TabsTrigger value="ask">Ask</TabsTrigger><TabsTrigger value="sources">Sources</TabsTrigger></TabsList>

      <TabsContent value="map" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => set({ days: v === "30" ? null : v })}>
            <SelectTrigger className="w-36" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((d) => <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of topic">
            <Button type="button" size="sm" variant={category ? "outline" : "default"} className="h-8 rounded-full" onClick={() => set({ category: null })}>All</Button>
            {KB_CATEGORIES.map((c) => <Button key={c} type="button" size="sm" variant={category === c ? "default" : "outline"} className={cn("h-8 rounded-full")} aria-pressed={category === c}
              onClick={() => set({ category: category === c ? null : c })}>{CATEGORY_LABELS[c]}</Button>)}
          </div>
        </div>
        <ErrorNotice error={map.error} />
        {map.isPending ? <Busy /> : map.data && (map.data.topics.length === 0
          ? <div className="space-y-4 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="font-medium">Nothing on the map for this period yet.</p>
              <p className="text-sm text-muted-foreground">Sources are collected every 3 hours once Reddit or YouTube is connected, and you can add your own on the Sources tab.</p>
              <Button variant="outline" onClick={() => set({ tab: "sources" })}>Add a source</Button>
              {s && <div className="text-left"><FeedStatus status={s} /></div>}
            </div>
          : <>
              <section className={cn("rounded-xl border border-border bg-card p-4 transition-opacity", map.isPlaceholderData && "opacity-60")}>
                <KnowledgeMap map={map.data} onPick={pick} />
              </section>
              <TopicHighlights topics={map.data.topics} onPick={pick} />
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold">Every topic <span className="font-normal text-muted-foreground">({map.data.topics.length}, {map.data.claims.toLocaleString()} claims)</span></h2>
                <TopicTable topics={map.data.topics} onPick={pick} />
              </section>
            </>)}
      </TabsContent>

      <TabsContent value="team"><TeamPlan onPick={pick} /></TabsContent>

      <TabsContent value="ask"><AskBank /></TabsContent>

      <TabsContent value="sources" className="space-y-4">
        {s && <FeedStatus status={s} />}
        <SourcesPanel />
      </TabsContent>
    </Tabs>
    <TopicPanel topicKey={topic} days={days} onClose={() => set({ topic: null })} />
  </FutShell>;
}
