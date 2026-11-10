import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Trash2 } from "lucide-react";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Assessment, CardLink, DataTable, Delta, MarketLoading, MarketPrice, MarketShell, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
/** Discord DMs when a watched card reaches your buy/sell target or moves a lot between FUT.GG refreshes. */
function PriceAlerts() {
 const qc = useQueryClient();
 const query = useQuery({ queryKey: [...futKeys.market, "alerts"], queryFn: () => futApi.alerts.settings() });
 const [dm, setDm] = useState(true), [move, setMove] = useState("");
 useEffect(() => { if (query.data) { setDm(query.data.dm); setMove(query.data.move_pct == null ? "" : String(query.data.move_pct)); } }, [query.data]);
 const save = useMutation({ mutationFn: () => futApi.alerts.save({ dm, move_pct: move.trim() ? Number(move) : null }), onSuccess: () => qc.invalidateQueries({ queryKey: [...futKeys.market, "alerts"] }) });
 const changed = !!query.data && (dm !== query.data.dm || (move.trim() ? Number(move) : null) !== query.data.move_pct);
 return <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
  <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><BellRing className="h-5 w-5" />Price alerts on Discord</h2>
  <ErrorNotice error={query.error || save.error} />
  <p className="text-muted-foreground">GafferBot DMs you after each FUT.GG price refresh (06:00 and 18:00 UTC) when a card below reaches your buy or sell target. Set targets on a card's page. {query.data?.needs_discord}</p>
  <div className="flex flex-wrap items-end gap-4">
   <label className="flex items-center gap-2"><Checkbox checked={dm} onCheckedChange={v => setDm(v === true)} />Send me alerts</label>
   <div className="space-y-1"><label htmlFor="alert-move" className="text-xs text-muted-foreground">Also when a watched card moves at least (%)</label><Input id="alert-move" className="w-28" inputMode="numeric" placeholder="Off" value={move} onChange={e => setMove(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
   <Button size="sm" disabled={!changed || save.isPending} onClick={() => save.mutate()}>Save</Button>
  </div>
 </section>;
}

export default function MarketWatchlistPage() {
 const context = useMarketPlatform(), qc = useQueryClient();
 const query = useQuery({ queryKey: [...futKeys.market, "watchlist", context.platform], queryFn: () => futApi.market.watchlist(context.platform), enabled: context.enabled });
 const remove = useMutation({ mutationFn: (id: string) => futApi.market.unwatch(id, context.platform), onSuccess: () => qc.invalidateQueries({ queryKey: futKeys.market }) });
 const items = query.data?.items.filter(item => item.platform === context.platform) ?? [];
 return <MarketShell title="Watchlist" {...context}><ErrorNotice error={query.error || remove.error} /><PriceAlerts />{query.isPending ? <MarketLoading /> : query.data && <><p className="text-sm text-muted-foreground">{query.data.note}</p><DataTable headers={["Card", "Latest price", "Status", "Your targets", "Since added", "Note", "Remove"]} rows={items.map(item => [<CardLink id={item.card_id} name={item.name} />, <MarketPrice value={item.latest_price} freshness={item.freshness} />, <Assessment status={item.status} reasons={item.reasons} couldBeWrong={item.could_be_wrong} />, <div className="space-y-2 text-sm"><p>Buy: {numberText(item.target_buy)} coins</p><p>Sell: {numberText(item.target_sell)} coins</p>{item.at_target_buy && <Badge variant="outline" className="border-success/30 text-success">At your buy target</Badge>}{item.at_target_sell && <Badge variant="outline" className="border-success/30 text-success">At your sell target</Badge>}<p className="text-xs text-muted-foreground">User-entered targets</p></div>, <Delta value={item.since_added_pct} />, item.note || "–", <Button variant="ghost" size="icon" aria-label={`Remove ${item.name}`} title="Remove from watchlist" disabled={remove.isPending} onClick={() => remove.mutate(item.card_id)}><Trash2 className="h-4 w-4" /></Button>])} empty="No watched cards on this platform yet." /></>}</MarketShell>;
}
