import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { futApi, futKeys, type MarketPlatform, type TradeFlip, type TradeOverview } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { HelperDownload } from "@/components/fut/HelperDownload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, dateText, HistoryChart, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const signed = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${numberText(v)}`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "text-success" : "text-destructive");
const held = (h: number | null) => (h == null ? "–" : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`);

function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return <div className="min-w-0 rounded-lg border border-border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`mt-1 break-words font-display text-xl font-bold tabular-nums sm:text-2xl ${className}`}>{value}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>;
}

const flipRow = (f: TradeFlip) => [
  <span className="font-medium">{f.name}{f.rating ? <span className="text-muted-foreground"> {f.rating}</span> : null}</span>,
  <span className="tabular-nums">{numberText(f.bought_for)}</span>,
  <span className="tabular-nums">{numberText(f.sold_for)}</span>,
  <span className={`tabular-nums font-medium ${tone(f.profit)}`}>{signed(f.profit)}</span>,
  <span className="tabular-nums">{f.roi}%</span>,
  held(f.held_hours),
  dateText(f.sold_at),
];
const FLIP_HEADERS = ["Card", "Bought", "Sold", "Profit after tax", "ROI", "Held", "Sold at"];

function BuyPrice({ platform, itemId }: { platform: MarketPlatform; itemId: number }) {
  const qc = useQueryClient();
  const [v, setV] = useState("");
  const save = useMutation({ mutationFn: () => futApi.trades.setBuyPrice(platform, itemId, Number(v.replace(/[,\s]/g, ""))), onSuccess: () => qc.invalidateQueries({ queryKey: futKeys.trades }) });
  const ok = /^\d[\d,\s]*$/.test(v.trim());
  return <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); if (ok) save.mutate(); }}>
    <Input aria-label="What you paid" inputMode="numeric" className="h-8 w-28" placeholder="Paid" value={v} onChange={e => setV(e.target.value)} />
    <Button size="sm" variant="outline" type="submit" disabled={!ok || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
  </form>;
}

function Overview({ d }: { d: TradeOverview }) {
  const t = d.totals;
  const [all, setAll] = useState(false);
  return <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Profit after tax" value={signed(t.profit)} className={tone(t.profit)} sub={`${t.flips} flip${t.flips === 1 ? "" : "s"}${t.win_rate != null ? `, ${t.win_rate}% in profit` : ""}`} />
      <Stat label="Last 7 days" value={signed(t.week)} className={tone(t.week)} sub={`Last 30 days ${signed(t.month)}`} />
      <Stat label="Tax paid" value={numberText(t.tax_paid)} sub="EA keeps 5% of every sale" />
      <Stat label="Still held" value={String(t.open)} sub={t.open ? `${numberText(t.open_cost)} spent${t.unrealised != null ? `, ${signed(t.unrealised)} at FUT.GG prices after tax` : ""}` : undefined} />
    </div>
    <p className="text-xs text-muted-foreground">{d.note} Prices from FUT.GG {d.prices_at ? dateText(d.prices_at) : "not loaded yet"}.</p>

    {d.history.length > 1 && <Section title="Profit over time"><HistoryChart data={d.history} field="value" label="Profit after tax" /></Section>}

    {(d.best.length > 0 || d.worst.length > 0) && <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Best flips"><DataTable headers={["Card", "Bought", "Sold", "Profit"]} rows={d.best.map(f => flipRow(f).slice(0, 4))} empty="No flips yet." /></Section>
      <Section title="Worst flips"><DataTable headers={["Card", "Bought", "Sold", "Profit"]} rows={d.worst.map(f => flipRow(f).slice(0, 4))} empty="No losing flips. Nice." /></Section>
    </div>}

    <Section title="Flips">
      <DataTable headers={FLIP_HEADERS} rows={(all ? d.flips : d.flips.slice(0, 25)).map(flipRow)} empty="No complete flips yet: the helper needs to see a card won in Transfer Targets and later sold on your transfer list." />
      {d.flips.length > 25 && <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${d.flips.length}`}</Button>}
    </Section>

    <Section title="Still held">
      <DataTable headers={["Card", "Bought", "Listed for", "FUT.GG price", "If sold now"]} rows={d.open.map(o => [
        <span className="font-medium">{o.name}{o.rating ? <span className="text-muted-foreground"> {o.rating}</span> : null}</span>,
        <span className="tabular-nums">{numberText(o.bought_for)}</span>,
        <span className="tabular-nums">{o.listed_for ? numberText(o.listed_for) : "–"}</span>,
        <span className="tabular-nums">{o.price ? numberText(o.price) : "–"}</span>,
        <span className={`tabular-nums ${tone(o.unrealised)}`}>{signed(o.unrealised)}</span>,
      ])} empty="Nothing bought and not yet sold." />
    </Section>

    {d.sales_without_buy.length > 0 && <Section title="Sales without a buy price">
      <p className="text-sm text-muted-foreground">The helper saw these sell but never saw you buy them ({numberText(t.sales_without_buy_after_tax)} coins after tax). Add what you paid to count them as flips.</p>
      <DataTable headers={["Card", "Sold", "After tax", "Sold at", "What you paid"]} rows={d.sales_without_buy.map(s => [
        <span className="font-medium">{s.name}{s.rating ? <span className="text-muted-foreground"> {s.rating}</span> : null}</span>,
        <span className="tabular-nums">{numberText(s.sold_for)}</span>,
        <span className="tabular-nums">{numberText(s.after_tax)}</span>,
        s.sold_at ? dateText(s.sold_at) : "–",
        <BuyPrice platform={d.platform} itemId={s.item_id} />,
      ])} />
    </Section>}
  </>;
}

export default function TradesPage() {
  const context = useMarketPlatform();
  const q = useQuery({ queryKey: [...futKeys.trades, context.platform], queryFn: () => futApi.trades.overview(context.platform), enabled: context.enabled, staleTime: 60_000 });
  const d = q.data;
  const empty = d && !d.totals.flips && !d.totals.open && !d.totals.sales_without_buy;
  return <MarketShell title="Trade Log" showTabs={false} {...context}>
    <ErrorNotice error={q.error} />
    <p className="text-sm text-muted-foreground">Every buy and sale the XI Lab helper saw on your transfer list and Transfer Targets, with profit after EA's 5% tax. It records what the Web App showed you; it never buys, sells or lists anything.</p>
    {q.isPending ? <MarketLoading /> : empty ? <div className="space-y-4 border-y border-border py-10 text-center">
      <Coins className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="font-display text-xl">No trades recorded yet</h2>
      <p className="mx-auto max-w-lg text-sm text-muted-foreground">With the XI Lab helper (v0.6.0 or newer) connected, open <strong>Transfer Targets</strong> and your <strong>transfer list</strong> in the EA Web App as you trade. Won items count as buys and sold items as sales.</p>
      <div className="flex justify-center"><HelperDownload compact /></div>
    </div> : d && <Overview d={d} />}
  </MarketShell>;
}
