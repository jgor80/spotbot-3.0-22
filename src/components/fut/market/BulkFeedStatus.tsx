import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys, type MarketPlatform } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";

export function BulkFeedStatus({ enabled, platform }: { enabled: boolean; platform: MarketPlatform }) {
  const query = useQuery({ queryKey: [...futKeys.market, "futgg-feed"], queryFn: futApi.market.futggFeed, enabled, refetchInterval: 300_000 });
  const feed = query.data, snapshot = feed?.platforms.find((p) => p.platform === platform);
  return <section className="space-y-2 rounded-lg border border-border p-4" aria-label="Automatic market prices">
    <h2 className="font-semibold">Automatic market prices</h2>
    <ErrorNotice error={query.error} />
    {feed?.last_run?.status === "failed" && <p className="text-sm text-amber-500">The last automatic refresh failed. Previously collected prices remain available with their original dates.</p>}
    {query.isPending ? <p>Checking price collection…</p> : query.isError ? <p>Price collection status is unavailable.</p> : !feed?.enabled ? <p>Automatic bulk prices are not enabled yet.</p>
      : !snapshot?.published_at ? <p>Waiting for the first {platform} snapshot. Scheduled at {feed.schedule}.</p>
      : <><p>{snapshot.market_price_count.toLocaleString()} prices across {snapshot.card_count.toLocaleString()} entries · {platform === "pc" ? "PC" : "Console"}</p>
        <p className="text-sm text-muted-foreground">Dataset published {new Date(snapshot.published_at).toLocaleString()}. Checked {snapshot.checked_at ? new Date(snapshot.checked_at).toLocaleString() : "unknown"}. Refreshes at {feed.schedule}.</p>
        {snapshot.overdue && <p className="text-sm text-amber-500">The dataset is over 12 hours old. Current prices may be unavailable.</p>}
        <p className="text-xs text-muted-foreground">{feed.note}</p></>}
  </section>;
}
