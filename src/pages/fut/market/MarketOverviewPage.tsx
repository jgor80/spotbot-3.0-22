import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CardLink, DataTable, Delta, Freshness, HistoryChart, ImportEmpty, MarketDetails, MarketEvidenceLabel, MarketLoading, MarketShell, Notes, Provenance, Regime, Section, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
export default function MarketOverviewPage() {
 const context = useMarketPlatform(); const [indexId, setIndexId] = useState("");
 const query = useQuery({ queryKey: [...futKeys.market, "overview", context.platform], queryFn: () => futApi.market.overview(context.platform), enabled: context.enabled });
 const data = query.data, selected = data?.indexes.find(index => index.basket_id === indexId) ?? data?.indexes[0];
 return <MarketShell title="Market Lab" {...context}><ErrorNotice error={query.error} />{query.isPending ? <MarketLoading /> : data && <><Provenance value={data.provenance} />
 {data.coverage.cards === 0 || !data.indexes.length ? <ImportEmpty /> : <>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.indexes.map(index => <Card key={index.basket_id}><CardContent className="space-y-3 p-4"><Button variant="ghost" className="h-auto max-w-full justify-start whitespace-normal px-0 text-left font-semibold" onClick={() => setIndexId(index.basket_id)} aria-pressed={selected?.basket_id === index.basket_id}>{index.label}</Button><p className="text-sm text-muted-foreground">{index.description}</p><p className="font-display text-3xl tabular-nums">{numberText(index.value)}</p><MarketEvidenceLabel evidence={data.provenance.evidence} /><div className="flex flex-wrap gap-3">{Object.entries(index.changes).map(([window, value]) => <div key={window} className="text-sm"><span className="mr-1 text-muted-foreground">{window}</span><Delta value={value} /></div>)}</div><details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Index details</summary><MarketDetails value={{ trend: index.trend, volatility_24h: index.volatility_24h, constituents_now: index.constituents_now, distribution: index.distribution }} /></details></CardContent></Card>)}</div>
 {selected && <Section title={selected.label}><HistoryChart data={data.index_history[selected.basket_id] ?? []} field="value" label={selected.label} /></Section>}
 </>}
 <Section title="Coverage"><div className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-4">{Object.entries(data.coverage).map(([label, count]) => <div key={label}><p className="text-xs capitalize text-muted-foreground">{label}</p><p className="text-xl tabular-nums">{numberText(count)}</p></div>)}</div></Section>
 <Section title="Market regime"><Regime value={data.regime} /></Section>
 <div className="grid min-w-0 gap-6 xl:grid-cols-2">{[{ title: "Relative strength leaders", items: data.relative_strength_leaders }, { title: "Largest declines", items: data.largest_declines }].map(group => <Section key={group.title} title={group.title}><DataTable headers={["Card", "Rating", "24h", "Vs market", "Observed"]} rows={group.items.map(item => [<CardLink id={item.card_id} name={item.name} />, numberText(item.rating), <Delta value={item.change_24h} />, <Delta value={item.vs_market_pp} unit=" pp" />, <Freshness observedAt={item.latest_observed_at} />])} /></Section>)}</div><Notes title="Notes" items={data.notes} />
 </>}</MarketShell>;
}
