import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { DashboardLayout, PageHeader } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { futApi, FutApiError, futKeys, Evidence, RuleInfo } from "@/lib/futApi";
import { CardImageCredit } from "./FutCardArt";

export const evidenceLabels: Record<Evidence, string> = { game_data: "Game data", estimate: "Estimate", hypothesis: "Hypothesis", verified: "Verified" };
export function EvidenceBadge({ evidence }: { evidence?: Evidence }) {
  return <Badge variant="outline">{evidence ? evidenceLabels[evidence] : "Evidence not provided"}</Badge>;
}
export function Rules({ info }: { info?: RuleInfo }) {
  if (!info) return null;
  return <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    {info.rule_version && <span>Rules: {info.rule_version}</span>}
    {info.rule_status === "unverified" && <Tooltip><TooltipTrigger asChild><Badge variant="outline" tabIndex={0}>Unverified rules</Badge></TooltipTrigger><TooltipContent>Community thresholds, not confirmed by EA yet.</TooltipContent></Tooltip>}
  </div>;
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error instanceof Error ? error.message : String(error)}</AlertDescription></Alert>;
}
export function Busy() { return <div role="status" aria-label="Loading" className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>; }
export function FutShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const health = useQuery({ queryKey: futKeys.health, queryFn: futApi.health, retry: false, staleTime: 30 * 60_000 });
  const unavailable = health.error instanceof FutApiError && health.error.status === 404;
  return <DashboardLayout><div className="space-y-6">
    <PageHeader title={title} actions={!unavailable && !health.isPending && !health.isError ? actions : undefined} />
    {health.isPending ? <Busy /> : unavailable ? <div className="space-y-3 py-12 text-center"><FlaskConical className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="font-display text-xl font-semibold">GafferBot FUT isn't available yet</h2><Button variant="outline" onClick={() => health.refetch()}>Try again</Button><Button asChild variant="ghost"><Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to the Club app</Link></Button></div> : health.isError ? <div className="space-y-3"><ErrorNotice error={health.error} /><Button variant="outline" onClick={() => health.refetch()}>Try again</Button></div> : <><Rules info={health.data} />{children}<CardImageCredit /></>}
  </div></DashboardLayout>;
}
export function useFutAvailable() {
  const health = useQuery({ queryKey: futKeys.health, queryFn: futApi.health, retry: false, staleTime: 30 * 60_000 });
  return health.isSuccess;
}
export function Price({ value }: { value?: number | null }) { return <span>{value == null ? "—" : value.toLocaleString()} <span className="text-xs text-muted-foreground">user-entered coins</span></span>; }
const hiddenKeys = new Set(["squad", "owner_id", "id", "rule_version", "rule_status", "evidence", "created_at", "updated_at"]);
function label(key: string) { return key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()); }
// Presentation only: heterogeneous API explanations/rows are rendered without deriving any stats.
export function ApiDetails({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value !== "object") return <span className="break-words">{String(value)}</span>;
  if (Array.isArray(value)) return value.length ? <ul className="space-y-2">{value.map((item, i) => <li key={i} className="border-l-2 border-border pl-3"><ApiDetails value={item} /></li>)}</ul> : <span className="text-muted-foreground">None</span>;
  return <dl className="space-y-2">{Object.entries(value).filter(([key]) => !hiddenKeys.has(key)).map(([key, item]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{label(key)}</dt><dd className="mt-0.5 text-sm"><ApiDetails value={item} /></dd></div>)}</dl>;
}
