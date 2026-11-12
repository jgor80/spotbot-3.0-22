import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Search, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys, type MarketOverview } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BulkFeedStatus } from "@/components/fut/market/BulkFeedStatus";
import { CardLink, DataTable, Delta, Freshness, HistoryChart, ImportEmpty, MarketDetails, MarketEvidenceLabel, MarketLoading, MarketShell, Notes, Provenance, Regime, Section, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
const MOOD: Record<string, { label: string; text: string }> = {
 broadly_rising: { label: "Rising", text: "Most cards are going up. Selling is easier and buys cost more, so flip quickly and don't chase." },
 broadly_falling: { label: "Falling", text: "Most cards are going down. Hold coins and buy only cards that have stopped falling." },
 sideways: { label: "Steady", text: "Prices are moving sideways. Profits come from cards that dipped below their usual price and bounced." },
 insufficient_data: { label: "Not enough data", text: "There isn't enough fresh price history yet to read the market." },
};
const pctText = (v: number | null | undefined) => (v == null ? null : `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}%`);
const COVERAGE: Record<string, string> = { cards: "Cards tracked", fresh: "Price up to date", stale: "Price out of date", missing: "No price yet" };

/** The market in a few plain sentences, from the main index, the mood and the biggest movers. */
function Summary({ data }: { data: MarketOverview }) {
 const index = data.indexes[0], mood = MOOD[data.regime?.primary ?? ""] ?? { label: data.regime?.primary?.replace(/_/g, " ") ?? "–", text: "" };
 const c24 = index?.changes["24h"] ?? null, c7 = index?.changes["7d"] ?? null;
 const up = data.relative_strength_leaders[0], down = data.largest_declines[0];
 const Icon = mood.label === "Rising" ? TrendingUp : mood.label === "Falling" ? TrendingDown : Minus;
 return <div className="space-y-3 rounded-lg border border-border bg-card p-5">
  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Icon className="h-4 w-4" />The market right now: {mood.label}</p>
  <ul className="space-y-1.5 text-sm">
   {index && (c24 != null || c7 != null) && <li>The average card ({index.label.toLowerCase()}) is {[pctText(c24) && `${pctText(c24)} in 24 hours`, pctText(c7) && `${pctText(c7)} this week`].filter(Boolean).join(" and ")}.</li>}
   {mood.text && <li>{mood.text}</li>}
   {up && up.change_24h != null && <li>Rising most: <strong>{up.name}</strong> {pctText(up.change_24h)} in 24 hours{up.vs_market_pp != null ? `, ${Math.round(up.vs_market_pp * 10) / 10} points better than the average card` : ""}.</li>}
   {down && down.change_24h != null && <li>Falling most: <strong>{down.name}</strong> {pctText(down.change_24h)} in 24 hours.</li>}
  </ul>
  <div className="flex flex-wrap gap-2 pt-1">
   <Button asChild size="sm"><Link to="/fut/strategy"><CalendarCheck className="mr-1.5 h-4 w-4" />What should I buy and sell?</Link></Button>
   <Button asChild size="sm" variant="outline"><Link to="/fut/market/cards"><Search className="mr-1.5 h-4 w-4" />Look up a card</Link></Button>
  </div>
 </div>;
}

export default function MarketOverviewPage() {
 const context = useMarketPlatform(); const [indexId, setIndexId] = useState("");
 const query = useQuery({ queryKey: [...futKeys.market, "overview", context.platform], queryFn: () => futApi.market.overview(context.platform), enabled: context.enabled });
 const data = query.data, selected = data?.indexes.find(index => index.basket_id === indexId) ?? data?.indexes[0];
 return <MarketShell title="Market Lab" {...context}><BulkFeedStatus enabled={context.enabled} platform={context.platform} /><ErrorNotice error={query.error} />{query.isPending ? <MarketLoading /> : data && <><Provenance value={data.provenance} />
 {data.coverage.cards === 0 || !data.indexes.length ? <ImportEmpty /> : <>
 <Summary data={data} />
 <p className="text-sm text-muted-foreground">Each index follows a group of cards, like a stock market index: if it's up, most of those cards got dearer. Pick one to see its chart.</p>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.indexes.map(index => <Card key={index.basket_id}><CardContent className="space-y-3 p-4"><Button variant="ghost" className="h-auto max-w-full justify-start whitespace-normal px-0 text-left font-semibold" onClick={() => setIndexId(index.basket_id)} aria-pressed={selected?.basket_id === index.basket_id}>{index.label}</Button><p className="text-sm text-muted-foreground">{index.description}</p><p className="font-display text-3xl tabular-nums">{numberText(index.value)}</p><MarketEvidenceLabel evidence={data.provenance.evidence} /><div className="flex flex-wrap gap-3">{Object.entries(index.changes).map(([window, value]) => <div key={window} className="text-sm"><span className="mr-1 text-muted-foreground">{window}</span><Delta value={value} /></div>)}</div><details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Index details</summary><MarketDetails value={{ trend: index.trend, volatility_24h: index.volatility_24h, constituents_now: index.constituents_now, distribution: index.distribution }} /></details></CardContent></Card>)}</div>
 {selected && <Section title={selected.label}><HistoryChart data={data.index_history[selected.basket_id] ?? []} field="value" label={selected.label} /></Section>}
 </>}
 <Section title="Cards we track"><div className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-4">{Object.entries(data.coverage).map(([label, count]) => <div key={label}><p className="text-xs text-muted-foreground">{COVERAGE[label] ?? label}</p><p className="text-xl tabular-nums">{numberText(count)}</p></div>)}</div></Section>
 <Section title="Market mood, in detail"><p className="mb-3 text-sm text-muted-foreground">What kind of market it is, read from how the indexes moved, and what that means for trading.</p><Regime value={data.regime} /></Section>
 <div className="grid min-w-0 gap-6 xl:grid-cols-2">{[{ title: "Doing better than the market", items: data.relative_strength_leaders }, { title: "Falling the most", items: data.largest_declines }].map(group => <Section key={group.title} title={group.title}><DataTable headers={["Card", "Rating", "24 hours", "Vs average card", "Price from"]} rows={group.items.map(item => [<CardLink id={item.card_id} name={item.name} />, numberText(item.rating), <Delta value={item.change_24h} />, <Delta value={item.vs_market_pp} unit=" pp" />, <Freshness observedAt={item.latest_observed_at} />])} /></Section>)}</div><Notes title="Notes" items={data.notes} />
 </>}</MarketShell>;
}
