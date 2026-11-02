import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Assessment, CardLink, DataTable, Delta, MarketLoading, MarketPrice, MarketShell, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
export default function MarketWatchlistPage() {
 const context = useMarketPlatform(), qc = useQueryClient();
 const query = useQuery({ queryKey: [...futKeys.market, "watchlist", context.platform], queryFn: () => futApi.market.watchlist(context.platform), enabled: context.enabled });
 const remove = useMutation({ mutationFn: (id: string) => futApi.market.unwatch(id, context.platform), onSuccess: () => qc.invalidateQueries({ queryKey: futKeys.market }) });
 const items = query.data?.items.filter(item => item.platform === context.platform) ?? [];
 return <MarketShell title="Watchlist" {...context}><ErrorNotice error={query.error || remove.error} />{query.isPending ? <MarketLoading /> : query.data && <><p className="text-sm text-muted-foreground">{query.data.note}</p><DataTable headers={["Card", "Latest price", "Status", "Your targets", "Since added", "Note", "Remove"]} rows={items.map(item => [<CardLink id={item.card_id} name={item.name} />, <MarketPrice value={item.latest_price} freshness={item.freshness} />, <Assessment status={item.status} reasons={item.reasons} couldBeWrong={item.could_be_wrong} />, <div className="space-y-2 text-sm"><p>Buy: {numberText(item.target_buy)} coins</p><p>Sell: {numberText(item.target_sell)} coins</p>{item.at_target_buy && <Badge variant="outline" className="border-success/30 text-success">At your buy target</Badge>}{item.at_target_sell && <Badge variant="outline" className="border-success/30 text-success">At your sell target</Badge>}<p className="text-xs text-muted-foreground">User-entered targets</p></div>, <Delta value={item.since_added_pct} />, item.note || "–", <Button variant="ghost" size="icon" aria-label={`Remove ${item.name}`} title="Remove from watchlist" disabled={remove.isPending} onClick={() => remove.mutate(item.card_id)}><Trash2 className="h-4 w-4" /></Button>])} empty="No watched cards on this platform yet." /></>}</MarketShell>;
}
