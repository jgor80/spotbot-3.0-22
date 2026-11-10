import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys, type FodderRating } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, HistoryChart, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const SIGNAL: Record<FodderRating["signal"], { label: string; className: string }> = {
  spike: { label: "Spiking", className: "border-destructive text-destructive" },
  cheap: { label: "Cheap", className: "border-success text-success" },
  normal: { label: "Normal", className: "" },
  new: { label: "New", className: "text-muted-foreground" },
};
const pct = (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${n}%`);

/** What SBC fodder (the cheapest cards of each rating, 81-91) costs now and over time, with demand spikes. */
export default function FodderIndexPage() {
  const context = useMarketPlatform();
  const [days, setDays] = useState(30);
  const [rating, setRating] = useState<number | null>(null);
  const q = useQuery({ queryKey: [...futKeys.fodder, context.platform, days], queryFn: () => futApi.fodderIndex(context.platform, days), enabled: context.enabled, staleTime: 30 * 60_000 });
  const d = q.data;
  const picked = d?.ratings.find(r => r.rating === rating) ?? null;
  return <MarketShell title="Fodder Index" showTabs={false} {...context}>
    <ErrorNotice error={q.error} />
    <p className="text-sm text-muted-foreground">What SBC fodder costs: the 5 cheapest cards of each rating on FUT.GG, at every twice-daily refresh. A rating well above its week usually means a demanding SBC just dropped; well below is a good time to stock up.</p>
    <div className="flex items-end gap-3"><div className="space-y-1.5"><span className="text-sm font-medium">Period</span><Select value={String(days)} onValueChange={v => setDays(Number(v))}><SelectTrigger className="w-32" aria-label="Period"><SelectValue /></SelectTrigger><SelectContent>{[7, 14, 30, 60, 90].map(n => <SelectItem key={n} value={String(n)}>{n} days</SelectItem>)}</SelectContent></Select></div></div>
    {q.isPending ? <MarketLoading /> : d && <>
      <Section title="Fodder index">
        <p className="font-display text-lg font-semibold">{d.headline}</p>
        <p className="text-sm">Index {d.index ?? "–"}{d.index_change_7d !== null && <span className="text-muted-foreground"> ({d.index_change_7d > 0 ? "+" : ""}{d.index_change_7d} in 7 days)</span>}</p>
        <HistoryChart data={d.index_history} field="value" label="Fodder index (100 = start)" />
      </Section>
      <Section title="By rating">
        <DataTable headers={["Rating", "Floor", "24h", "7 days", "vs week", "30-day range", "Signal", ""]} rows={d.ratings.map(r => [String(r.rating), numberText(r.floor), pct(r.change_24h), pct(r.change_7d), pct(r.vs_week), `${numberText(r.low_30d)} to ${numberText(r.high_30d)}`, <Badge key="s" variant="outline" className={SIGNAL[r.signal].className}>{SIGNAL[r.signal].label}</Badge>, <button key="c" type="button" className="text-xs underline" onClick={() => setRating(rating === r.rating ? null : r.rating)}>{rating === r.rating ? "Hide" : "Chart"}</button>])} />
        {picked && <div className="space-y-2"><p className="text-sm">{picked.line}</p><HistoryChart data={picked.history} field="value" label={`${picked.rating} floor (coins)`} /></div>}
        <ul className="space-y-1 text-sm">{d.ratings.filter(r => r.signal === "spike" || r.signal === "cheap").map(r => <li key={r.rating}>{r.line}</li>)}</ul>
      </Section>
      <p className="text-xs text-muted-foreground">{d.note}</p>
    </>}
  </MarketShell>;
}
