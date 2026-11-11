import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/fut/FutShared";
import { futApi, futKeys, type MarketPlatform } from "@/lib/futApi";
import { dateText, Delta, MarketLoading, numberText } from "@/components/fut/market/MarketShared";

const RANGES = [{ days: 1, label: "24h" }, { days: 7, label: "7d" }, { days: 30, label: "30d" }, { days: 90, label: "90d" }];

/** One card's FUT.GG price over a chosen range, hourly where the bot keeps hourly prices, with market drops marked. */
export function PriceHistory({ cardId, platform, enabled = true }: { cardId: string; platform: MarketPlatform; enabled?: boolean }) {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: [...futKeys.market, "price-history", cardId, platform, days], queryFn: () => futApi.priceHistory(cardId, platform, days), enabled: enabled && Boolean(cardId), staleTime: 5 * 60_000 });
  const d = q.data, s = d?.stats;
  const short = days <= 7;
  const tick = (t: string) => new Date(t).toLocaleString("en-US", short ? { weekday: "short", hour: "numeric" } : { month: "short", day: "numeric" });
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-4 text-sm tabular-nums">
        {s?.latest != null && <span><span className="text-muted-foreground">Now</span> {numberText(s.latest)}</span>}
        {s?.low != null && <span><span className="text-muted-foreground">Range</span> {numberText(s.low)} to {numberText(s.high)}</span>}
        <span><span className="text-muted-foreground">24h</span> <Delta value={s?.change_24h} /></span>
        <span><span className="text-muted-foreground">7d</span> <Delta value={s?.change_7d} /></span>
      </div>
      <div className="flex gap-1" role="group" aria-label="Chart range">{RANGES.map(r => <Button key={r.days} size="sm" variant={days === r.days ? "default" : "outline"} onClick={() => setDays(r.days)}>{r.label}</Button>)}</div>
    </div>
    <ErrorNotice error={q.error} />
    {q.isPending ? <MarketLoading /> : d && (d.points.length < 2 ? <p className="py-8 text-center text-sm text-muted-foreground">{d.note && !d.ea_item_id ? d.note : "Not enough FUT.GG prices in this range yet."}</p> : <>
      <ChartContainer config={{ price: { label: "Price (coins)", color: "hsl(var(--primary))" } }} className="aspect-auto h-64 w-full">
        <LineChart accessibilityLayer data={d.points} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="t" type="category" tickFormatter={tick} minTickGap={40} tickLine={false} />
          <YAxis width={70} tickFormatter={numberText} tickLine={false} domain={["auto", "auto"]} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_l, payload) => dateText(payload[0]?.payload?.t)} formatter={value => <span>{numberText(Number(value))}</span>} />} />
          {d.market_drops.map(m => <ReferenceLine key={m.t} x={d.points.reduce((best, p) => Math.abs(Date.parse(p.t) - Date.parse(m.t)) < Math.abs(Date.parse(best) - Date.parse(m.t)) ? p.t : best, d.points[0]!.t)} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: `Market ${m.median_move}%`, position: "insideTopRight", fontSize: 11, fill: "hsl(var(--destructive))" }} />)}
          <Line type="linear" dataKey="price" stroke="var(--color-price)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">{d.points.length} prices{s?.hourly_points ? `, ${s.hourly_points} of them hourly` : ""}. {d.market_drops.length ? `Red lines: refreshes where the whole market fell 4% or more (${d.market_drops.length}). ` : ""}{d.note}</p>
    </>)}
  </div>;
}
