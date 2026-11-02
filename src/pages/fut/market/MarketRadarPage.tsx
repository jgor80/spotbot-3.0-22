import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Assessment, CardLink, DataTable, Delta, MarketLoading, MarketPrice, MarketShell, Provenance, Regime, Section, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
import { statusStyles } from "@/components/fut/market/marketPresentation";
export default function MarketRadarPage() {
 const context = useMarketPlatform(); const [status, setStatus] = useState("all"), [price, setPrice] = useState(""), [category, setCategory] = useState("all");
 const filters: Record<string, string> = { limit: "100", ...(status === "all" ? {} : { status }), ...(price ? { max_price: price } : {}), ...(category === "all" ? {} : { category }) };
 const query = useQuery({ queryKey: [...futKeys.market, "opportunities", context.platform, filters], queryFn: () => futApi.market.opportunities(context.platform, filters), enabled: context.enabled });
 const categories = useQuery({ queryKey: [...futKeys.market, "opportunity-categories", context.platform], queryFn: () => futApi.market.opportunities(context.platform, { limit: "100" }), enabled: context.enabled, staleTime: 60000 });
 const choices = [...new Set(categories.data?.items.flatMap(item => [item.category, ...item.categories]).filter(Boolean) ?? [])];
 return <MarketShell title="Opportunity radar" {...context}>
 <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(statusStyles).map(([value, style]) => <SelectItem key={value} value={value}>{style.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="max-price">Maximum price (coins)</Label><Input id="max-price" type="number" min={0} step={1} value={price} onChange={e => setPrice(e.target.value)} /></div><div className="space-y-2"><Label>Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{choices.map(value => <SelectItem key={value} value={value}>{value.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div></div>
 <ErrorNotice error={query.error || categories.error} />{query.isPending ? <MarketLoading /> : query.data && <><Provenance value={query.data.provenance} /><p className="text-sm text-muted-foreground">{numberText(query.data.total)} opportunities</p><DataTable headers={["Card", "Category", "Price", "Assessment", "24h", "72h", "Vs market 24h"]} rows={query.data.items.map(item => [<div className="space-y-1"><CardLink id={item.card_id} name={item.name} /><p className="text-xs text-muted-foreground">{numberText(item.rating)}</p></div>, item.category?.replace(/_/g, " "), <MarketPrice value={item.latest_price} freshness={item.freshness} observedAt={item.latest_observed_at} evidence={query.data.provenance.evidence} />, <Assessment status={item.status} reasons={item.reasons} couldBeWrong={item.could_be_wrong} />, <Delta value={item.change_24h} />, <Delta value={item.change_72h} />, <Delta value={item.vs_market_24h_pp} unit=" pp" />])} /><Section title="Market regime"><Regime value={query.data.regime} /></Section></>}</MarketShell>;
}
