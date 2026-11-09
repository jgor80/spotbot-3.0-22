import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Assessment, CardLink, DataTable, Delta, MarketLoading, MarketPrice, MarketShell, Provenance, Regime, Section, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
import { statusStyles } from "@/components/fut/market/marketPresentation";
const PAGE = 25;
export default function MarketRadarPage() {
 const context = useMarketPlatform(); const [status, setStatusRaw] = useState("all"), [price, setPriceRaw] = useState(""), [category, setCategoryRaw] = useState("all"), [page, setPage] = useState(0);
 // Any filter change starts again from the first page
 const setStatus = (v: string) => { setStatusRaw(v); setPage(0); }, setPrice = (v: string) => { setPriceRaw(v); setPage(0); }, setCategory = (v: string) => { setCategoryRaw(v); setPage(0); };
 // One page at a time from the server; the server keeps the full scan, so paging doesn't rescore every card
 const filters: Record<string, string> = { limit: String(PAGE), offset: String(page * PAGE), ...(status === "all" ? {} : { status }), ...(price ? { max_price: price } : {}), ...(category === "all" ? {} : { category }) };
 const query = useQuery({ queryKey: [...futKeys.market, "opportunities", context.platform, filters], queryFn: () => futApi.market.opportunities(context.platform, filters), enabled: context.enabled, placeholderData: keepPreviousData });
 // The server lists every category in the full scan, whatever the filters
 const choices = query.data?.categories ?? [];
 const pages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE)) : 1;
 return <MarketShell title="Opportunity radar" {...context}>
 <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(statusStyles).map(([value, style]) => <SelectItem key={value} value={value}>{style.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="max-price">Maximum price (coins)</Label><Input id="max-price" type="number" min={0} step={1} value={price} onChange={e => setPrice(e.target.value)} /></div><div className="space-y-2"><Label>Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{choices.map(value => <SelectItem key={value} value={value}>{value.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div></div>
 <ErrorNotice error={query.error} />{query.isPending ? <MarketLoading /> : query.data && <><Provenance value={query.data.provenance} /><p className="text-sm text-muted-foreground">{numberText(query.data.total)} opportunities</p><DataTable headers={["Card", "Category", "Price", "Assessment", "24h", "72h", "Vs market 24h"]} rows={query.data.items.map(item => [<div className="space-y-1"><CardLink id={item.card_id} name={item.name} /><p className="text-xs text-muted-foreground">{numberText(item.rating)}</p></div>, item.category?.replace(/_/g, " "), <MarketPrice value={item.latest_price} freshness={item.freshness} observedAt={item.latest_observed_at} evidence={query.data.provenance.evidence} />, <Assessment status={item.status} reasons={item.reasons} couldBeWrong={item.could_be_wrong} />, <Delta value={item.change_24h} />, <Delta value={item.change_72h} />, <Delta value={item.vs_market_24h_pp} unit=" pp" />])} />{pages > 1 && <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button><span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span><Button variant="outline" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>}<Section title="Market regime"><Regime value={query.data.regime} /></Section></>}</MarketShell>;
}
