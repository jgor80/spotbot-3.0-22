// Pro Clubs Knowledge Bank (Club side): what the Pro Clubs community says is the best Virtual Pro build for each
// position, and the build posts and videos it's read from. Ultimate Team knowledge is on the FUT side (/fut/knowledge).
// Same data as before (Knowledge Bank sources with area 'proclubs' and their builds); see meta-builds.ts.
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout, PageHeader } from "@/components/layout/DashboardLayout";
import { ProClubsBuilds } from "@/components/fut/knowledge/ProClubsBuilds";
import { FeedStatus, SourcesPanel } from "@/components/fut/knowledge/SourcesPanel";
import { ago } from "@/components/fut/knowledge/knowledgePresentation";
import { ErrorNotice } from "@/components/fut/FutShared";
import { futApi, futKeys } from "@/lib/futApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["builds", "sources"] as const;
type Tab = typeof TABS[number];

export default function ProClubsKnowledgePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? params.get("tab") as Tab : "builds";
  const status = useQuery({ queryKey: [...futKeys.knowledge, "status", "proclubs"], queryFn: () => futApi.knowledge.status("proclubs"), staleTime: 60_000, retry: false });
  const s = status.data;
  return <DashboardLayout><div className="space-y-6">
    <PageHeader title="Pro Clubs Knowledge Bank" description={<>
      The builds the Pro Clubs community rates for each position, read from r/FIFAClubs, r/ProClubs, build videos and builds you add.
      {s ? ` ${(s.builds ?? 0).toLocaleString()} builds from ${s.sources.toLocaleString()} sources, last collected ${ago(s.last_run?.finished_at)}.` : ""}
      {" "}Ultimate Team tips are in the <Link to="/fut/knowledge" className="underline underline-offset-2">FUT Knowledge Bank</Link>.
    </>} />
    <Tabs value={tab} onValueChange={(v) => setParams((p) => { const next = new URLSearchParams(p); if (v === "builds") next.delete("tab"); else next.set("tab", v); return next; }, { replace: true })}>
      <TabsList><TabsTrigger value="builds">Meta builds</TabsTrigger><TabsTrigger value="sources">Sources</TabsTrigger></TabsList>
      <TabsContent value="builds"><ProClubsBuilds /></TabsContent>
      <TabsContent value="sources" className="space-y-4">
        <ErrorNotice error={status.error} />
        {s && <FeedStatus status={s} area="proclubs" />}
        <SourcesPanel area="proclubs" />
      </TabsContent>
    </Tabs>
  </div></DashboardLayout>;
}
