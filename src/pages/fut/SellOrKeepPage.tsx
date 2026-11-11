import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { futApi, futKeys, type SellAdvice, type SellVerdict } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dateText, Delta, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const VERDICT: Record<SellVerdict, { label: string; className: string }> = {
  sell_now: { label: "Sell now", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  sell_high: { label: "Sell high", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  sell: { label: "Fine to sell", className: "border-warning/40 bg-warning/10 text-warning" },
  wait: { label: "Wait", className: "border-primary/40 bg-primary/10 text-primary" },
  hold_fodder: { label: "SBC fodder", className: "border-primary/40 bg-primary/10 text-primary" },
  keep_evo: { label: "Keep: evolution", className: "border-success/40 bg-success/10 text-success" },
  keep: { label: "Keep", className: "border-success/40 bg-success/10 text-success" },
  no_price: { label: "No price", className: "text-muted-foreground" },
};
const GROUPS: { title: string; verdicts: SellVerdict[] }[] = [
  { title: "Sell", verdicts: ["sell_now", "sell_high", "sell"] },
  { title: "Wait or hold", verdicts: ["wait", "hold_fodder"] },
  { title: "Keep", verdicts: ["keep", "keep_evo"] },
  { title: "No price yet", verdicts: ["no_price"] },
];

function Row({ a }: { a: SellAdvice }) {
  const v = VERDICT[a.verdict];
  return <li className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border py-2 text-sm first:border-t-0">
    <div className="w-12 shrink-0"><FutCardArt compact card={{ name: a.name, rating: a.rating, version: a.version, position: a.positions[0], ea_item_id: a.ea_item_id }} /></div>
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{a.name}</span><span className="text-muted-foreground">{a.rating} {a.positions.join("/")}</span><Badge variant="outline" className={v.className}>{v.label}</Badge></p>
      <p className="text-muted-foreground">{a.reason}</p>
    </div>
    <div className="shrink-0 text-right tabular-nums">
      <p className="font-medium">{a.after_tax != null ? numberText(a.after_tax) : "–"}</p>
      <p className="text-xs">3d <Delta value={a.change_3d} /> · 7d <Delta value={a.change_7d} /></p>
      {a.profit != null && <p className={`text-xs ${a.profit >= 0 ? "text-success" : "text-destructive"}`}>{a.profit >= 0 ? "+" : ""}{numberText(a.profit)} vs paid</p>}
    </div>
  </li>;
}

function Group({ title, items }: { title: string; items: SellAdvice[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  return <Section title={`${title} (${items.length})`}>
    <ul className="rounded-lg border border-border bg-card px-4">{(all ? items : items.slice(0, 20)).map(a => <Row key={a.id} a={a} />)}</ul>
    {items.length > 20 && <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${items.length}`}</Button>}
  </Section>;
}

export default function SellOrKeepPage() {
  const context = useMarketPlatform();
  const q = useQuery({ queryKey: [...futKeys.sellKeep, context.platform], queryFn: () => futApi.sellOrKeep(context.platform), enabled: context.enabled, staleTime: 60_000 });
  const d = q.data;
  return <MarketShell title="Sell or Keep" showTabs={false} {...context}>
    <ErrorNotice error={q.error} />
    <p className="text-sm text-muted-foreground">A verdict for every tradeable card in your synced club: keep what starts in a saved squad or a live evolution, hold cheap high-rated cards for SBCs, and sell the rest at the right moment on FUT.GG's two-week trend. Coins shown are after EA's 5% tax. Nothing here lists or sells.</p>
    {q.isPending ? <MarketLoading /> : d && (d.totals.cards ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Sell now", d.totals.sell_now_coins, `${d.totals.counts.sell_now + d.totals.counts.sell_high} cards falling or near their high`], ["Everything unused", d.totals.sell_all_coins, `${d.totals.counts.sell_now + d.totals.counts.sell_high + d.totals.counts.sell} cards`], ["SBC fodder", d.totals.fodder_value, `${d.totals.counts.hold_fodder} cards`], ["Kept", d.totals.keep_value, `${d.totals.counts.keep + d.totals.counts.keep_evo} cards in squads or evolutions`]].map(([label, value, sub]) =>
          <div key={label as string} className="min-w-0 rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-bold tabular-nums sm:text-2xl">{numberText(value as number)}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></div>)}
      </div>
      <p className="text-xs text-muted-foreground">Prices from FUT.GG {d.prices_at ? dateText(d.prices_at) : "not loaded yet"} · {d.untradeable_skipped} untradeable cards left out · Keep verdicts use your saved squads in <Link className="text-primary underline-offset-4 hover:underline" to="/fut">Squad Builder</Link> and the <Link className="text-primary underline-offset-4 hover:underline" to="/fut/evolutions">Evolutions</Link> finder</p>
      {GROUPS.map(g => <Group key={g.title} title={g.title} items={d.advice.filter(a => g.verdicts.includes(a.verdict))} />)}
    </> : <div className="space-y-3 border-y border-border py-10 text-center">
      <Scale className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="font-display text-xl">No tradeable club cards yet</h2>
      <p className="mx-auto max-w-lg text-sm text-muted-foreground">Sync your club with the XI Lab helper on <Link className="text-primary underline-offset-4 hover:underline" to="/fut/cards">My Cards</Link>, then come back for a verdict on every card.</p>
    </div>)}
  </MarketShell>;
}
