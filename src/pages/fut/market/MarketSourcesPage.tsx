import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { DataTable, DemoWarning, MarketEvidenceLabel, MarketLoading, MarketShell, useMarketPlatform } from "@/components/fut/market/MarketShared";
export default function MarketSourcesPage() {
 const context = useMarketPlatform(); const query = useQuery({ queryKey: [...futKeys.market, "sources", context.platform], queryFn: () => futApi.market.sources(context.platform), enabled: context.enabled });
 const permission = (value?: boolean | null) => value == null ? "–" : value ? "Yes" : "No";
 return <MarketShell title="Data sources" {...context}><ErrorNotice error={query.error} />{query.isPending ? <MarketLoading /> : query.data && <>{query.data.some(source => source.is_demo) && <DemoWarning />}<DataTable headers={["Source", "Status", "Status note", "Storage", "Analytics", "Training", "Redistribution", "Evidence"]} rows={query.data.map(source => [<div><p className="font-medium">{source.name}</p><p className="text-xs text-muted-foreground">{source.kind}</p></div>, <Badge variant="outline" className={source.status === "enabled" ? "border-success/30 text-success" : "text-muted-foreground"}>{source.status.replace(/_/g, " ")}</Badge>, source.status_note, permission(source.permissions.storage), permission(source.permissions.derived_analytics), permission(source.permissions.model_training), permission(source.permissions.redistribution), <MarketEvidenceLabel evidence={source.evidence} />])} /></>}
 <p className="text-sm text-muted-foreground">No live price feed is connected: none is authorised. Real prices come only from your own imports and the XI Lab Price Capture extension, which reads transfer-market results the EA Web App already loaded when you searched.</p></MarketShell>;
}
