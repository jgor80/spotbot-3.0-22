import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, TrendingDown, TrendingUp } from "lucide-react";
import { futApi, futKeys, type CalendarVerdict } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { DataTable, dateText, MarketLoading, MarketShell, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const VERDICT: Record<CalendarVerdict, { label: string; className: string }> = {
  sell_before: { label: "Usually drops", className: "border-destructive text-destructive" },
  buy_before: { label: "Usually rises", className: "border-success text-success" },
  no_pattern: { label: "No clear pattern", className: "" },
  not_enough_data: { label: "Not enough weeks yet", className: "text-muted-foreground" },
};
const pct = (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${n}%`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** FUT's weekly rhythm for the next 7 days, each event back-tested on GafferBot's own FUT.GG snapshots by rating band. */
export default function MarketCalendarPage() {
  const context = useMarketPlatform();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: [...futKeys.calendar, context.platform], queryFn: () => futApi.marketCalendar(context.platform), enabled: context.enabled, staleTime: 30 * 60_000 });
  const d = q.data;
  return <MarketShell title="Market Calendar" showTabs={false} {...context}>
    <ErrorNotice error={q.error} />
    <p className="text-sm text-muted-foreground">When prices usually move: Team of the Week, rewards, Friday promos and Champs weekend, with what actually happened after each of the last weeks' events in GafferBot's own FUT.GG prices. Patterns only show once there are at least four weeks of them. Past patterns aren't promises.</p>
    {q.isPending ? <MarketLoading /> : d && <>
      <Section title="Next 7 days">
        <div className="space-y-3">{d.upcoming.map(u => {
          const v = VERDICT[u.verdict], id = `${u.key}-${u.at}`;
          return <article key={id} className="space-y-2 rounded-lg border border-border p-4">
            <header className="flex flex-wrap items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /><h3 className="font-display font-semibold">{u.label}</h3><span className="text-sm text-muted-foreground">{when(u.at)} ({u.uk})</span><Badge variant="outline" className={v.className}>{u.verdict === "sell_before" ? <TrendingDown className="mr-1 h-3 w-3" /> : u.verdict === "buy_before" ? <TrendingUp className="mr-1 h-3 w-3" /> : null}{v.label}</Badge></header>
            <p className="text-sm">{u.headline}</p>
            <p className="text-xs text-muted-foreground">{u.why}</p>
            <button type="button" className="text-xs underline" onClick={() => setOpen(open === id ? null : id)}>{open === id ? "Hide" : "By rating band"}</button>
            {open === id && <DataTable headers={["Cards", "Weeks", "Median move", "Down / up", "What it means"]} rows={u.bands.map(b => [b.band === "all" ? "All tracked" : b.band, String(b.weeks), pct(b.median), `${b.falls} / ${b.rises}`, VERDICT[b.verdict].label])} />}
          </article>;
        })}</div>
      </Section>
      <Section title="Recent market crashes">
        {d.crashes.length ? <DataTable headers={["Refresh", "UK day", "Median move", "Cards"]} rows={d.crashes.map(c => [dateText(c.t), c.uk_weekday, pct(c.move), String(c.cards)])} /> : <p className="text-sm text-muted-foreground">No refresh in the last 90 days where the median tracked card fell 4% or more.</p>}
      </Section>
      <p className="text-xs text-muted-foreground">{d.days_of_prices} days of prices. {d.note}</p>
    </>}
  </MarketShell>;
}
