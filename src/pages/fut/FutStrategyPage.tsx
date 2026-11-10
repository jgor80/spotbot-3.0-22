import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarClock, ListChecks, ShieldAlert, TrendingDown, TrendingUp, Repeat } from "lucide-react";
import { futApi, futKeys, type DailyStrategy, type StrategyBuy, type StrategyRisk, type StrategySell } from "@/lib/futApi";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, dateText, Delta, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const coins = (v: number | null | undefined) => (v == null ? "–" : numberText(v));
const BUDGET_KEY = "gafferbot-strategy-budget", RISK_KEY = "gafferbot-strategy-risk";
const read = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const write = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private window */ } };

const STANCE: Record<DailyStrategy["stance"], { label: string; className: string }> = {
  buy: { label: "Buying day", className: "border-success/40 bg-success/10 text-success" },
  sell: { label: "Selling day", className: "border-warning/40 bg-warning/10 text-warning" },
  flip: { label: "Flipping day", className: "border-primary/40 bg-primary/10 text-primary" },
};
const CONFIDENCE: Record<StrategyBuy["confidence"], string> = { high: "border-success/40 text-success", medium: "border-primary/40 text-primary", low: "text-muted-foreground" };
const SELL_REASON: Record<string, string> = { near_high: "Near its high", falling: "Falling", weekend_demand: "Weekend demand", before_event: "Before a big drop" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="min-w-0 rounded-lg border border-border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 break-words font-display text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>;
}

function Card({ c }: { c: { name: string; rating: number | null; position: string | null; version: string | null; ea_item_id: number } }) {
  return <div className="flex min-w-0 items-center gap-3">
    <FutCardArt card={{ name: c.name, rating: c.rating, position: c.position, version: c.version, ea_item_id: c.ea_item_id }} compact className="w-11 shrink-0" />
    <div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="truncate text-xs text-muted-foreground">{[c.rating, c.position, c.version].filter(Boolean).join(" · ")}</p></div>
  </div>;
}

function BuyRow({ b, sized }: { b: StrategyBuy; sized: boolean }) {
  return <li className="space-y-3 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <Card c={b} />
      <div className="flex flex-wrap gap-1.5"><Badge variant="outline" className={CONFIDENCE[b.confidence]}>{b.confidence} confidence</Badge>{b.kind === "fodder" && <Badge variant="outline">SBC fodder</Badge>}</div>
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-muted-foreground">Buy up to</dt><dd className="font-semibold tabular-nums">{coins(b.buy_at)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">List at</dt><dd className="font-semibold tabular-nums">{coins(b.sell_at)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Profit each, after tax</dt><dd className="font-semibold tabular-nums text-success">+{coins(b.profit)} <span className="text-xs font-normal">({b.roi}%)</span></dd></div>
      <div><dt className="text-xs text-muted-foreground">{sized ? "Buy" : "Hold for"}</dt><dd className="font-semibold tabular-nums">{sized && b.quantity ? `${b.quantity} × = ${coins(b.spend)}` : b.hold}</dd></div>
    </dl>
    <ul className="space-y-1 text-sm">{b.why.map((w, i) => <li key={i} className="flex gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span>{w}</span></li>)}
      {b.risks.map((w, i) => <li key={`r${i}`} className="flex gap-2 text-muted-foreground"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{w}</span></li>)}</ul>
    <p className="text-xs text-muted-foreground">Hold {b.hold.toLowerCase()} · 24h <Delta value={b.change_24h} /> · week {coins(b.low)} to {coins(b.high)}</p>
  </li>;
}

function SellRow({ s }: { s: StrategySell }) {
  return <li className="space-y-3 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <Card c={s} />
      <div className="flex flex-wrap gap-1.5"><Badge variant="outline" className="border-warning/40 text-warning">{SELL_REASON[s.reason] ?? s.reason}</Badge>{s.in_squad && <Badge variant="outline">In your squad</Badge>}</div>
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-muted-foreground">List at</dt><dd className="font-semibold tabular-nums">{coins(s.list_at)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">To sell fast</dt><dd className="font-semibold tabular-nums">{coins(s.quick_at)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Copies</dt><dd className="font-semibold tabular-nums">{s.quantity}</dd></div>
      <div><dt className="text-xs text-muted-foreground">You get, after tax</dt><dd className="font-semibold tabular-nums text-success">{coins(s.after_tax)}</dd></div>
    </dl>
    <p className="flex gap-2 text-sm"><TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{s.why}</span></p>
  </li>;
}

const OUTCOME: Record<string, { label: string; className: string }> = {
  hit: { label: "Hit sell price", className: "border-success/40 bg-success/10 text-success" },
  open_up: { label: "Up", className: "border-success/40 text-success" },
  open_down: { label: "Down", className: "border-destructive/40 text-destructive" },
  too_soon: { label: "Too soon", className: "text-muted-foreground" },
  unknown: { label: "No price", className: "text-muted-foreground" },
};

function Plan({ d }: { d: DailyStrategy }) {
  const sized = d.budget.coins != null;
  const r = d.record;
  return <>
    <div className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={STANCE[d.stance].className}>{STANCE[d.stance].label}</Badge><span className="text-xs text-muted-foreground">{d.timing.weekday} {d.timing.uk_time} UK · prices from FUT.GG {d.prices_at ? dateText(d.prices_at) : "not loaded yet"}</span></div>
      <p className="font-display text-lg font-semibold leading-snug sm:text-xl">{d.headline}</p>
      <p className="text-sm text-muted-foreground">{d.timing.now}</p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Coins" value={coins(d.budget.coins)} sub={d.budget.coins_source === "helper" ? `From the Web App${d.budget.coins_at ? `, ${dateText(d.budget.coins_at)}` : ""}` : d.budget.coins_source === "entered" ? "Entered by you" : "Not known yet"} />
      <Stat label="Keep back" value={coins(d.budget.reserve)} sub={`${d.budget.reserve_pct}% reserve`} />
      <Stat label="Buying today" value={coins(d.budget.buy_spend || null)} sub={d.budget.per_pick ? `Up to ${numberText(d.budget.per_pick)} per card` : undefined} />
      <Stat label="Profit if all sell" value={d.budget.expected_profit ? `+${numberText(d.budget.expected_profit)}` : "–"} sub="After EA's 5% tax" />
    </div>

    <Section title="Today's plan">
      <ol className="space-y-2">{d.steps.map((s, i) => <li key={i} className="flex gap-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{i + 1}</span><span className="pt-0.5">{s}</span></li>)}</ol>
    </Section>

    <Section title="Timing">
      <ul className="space-y-2 text-sm">
        {d.timing.next && <li className="flex gap-2"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{d.timing.next}</span></li>}
        <li className="flex gap-2"><Repeat className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{d.timing.daily}</span></li>
        {d.timing.events.map(e => <li key={e.name} className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span><strong>{e.name}</strong> ({e.date}): {e.advice}</span></li>)}
      </ul>
    </Section>

    <Section title={`Buy and flip (${d.buys.length})`}>
      {d.buys.length ? <ul className="space-y-3">{d.buys.map(b => <BuyRow key={b.ea_item_id} b={b} sized={sized} />)}</ul> :
        <p className="text-sm text-muted-foreground">No card is far enough under its usual price to flip at a profit after tax today. Keeping coins is a fine plan.</p>}
    </Section>

    <Section title={`Sell from your club (${d.sells.length})`}>
      {d.sells.length ? <ul className="space-y-3">{d.sells.map(s => <SellRow key={s.card_id} s={s} />)}</ul> :
        <p className="text-sm text-muted-foreground">Nothing in your club stands out to sell today. Sync your club with the XI Lab helper (My Cards) so the plan can see your tradeable cards.</p>}
    </Section>

    {d.transfer_list.length > 0 && <Section title="Transfer list">
      <div className="overflow-x-auto"><DataTable headers={["Card", "Status", "Listed at", "Market", "Do this"]} rows={d.transfer_list.map(f => [
        <span className="font-medium">{f.name}{f.rating ? <span className="ml-1 text-xs text-muted-foreground">{f.rating}</span> : null}</span>, f.state, coins(f.buy_now), coins(f.price), <span className="text-sm">{f.why}</span>,
      ])} /></div>
    </Section>}

    {d.watch.length > 0 && <Section title="Also worth a look">
      <p className="text-sm text-muted-foreground">More cards under their usual price that didn't make today's buys (budget, slots, or one per player).</p>
      <div className="overflow-x-auto"><DataTable headers={["Card", "Buy up to", "List at", "Profit after tax", "Confidence"]} rows={d.watch.map(b => [
        <Card c={b} />, coins(b.buy_at), coins(b.sell_at), <span className="tabular-nums text-success">+{coins(b.profit)} ({b.roi}%)</span>, b.confidence,
      ])} /></div>
    </Section>}

    <Section title="How earlier picks did">
      {r.picks ? <>
        <p className="text-sm">{r.hit} of {r.picks} picks from the last {r.days} day{r.days === 1 ? "" : "s"} reached their sell price{r.avg_now_pct != null ? `; selling every pick at today's price would return ${r.avg_now_pct > 0 ? "+" : ""}${r.avg_now_pct}% on average after tax` : ""}.</p>
        <div className="overflow-x-auto"><DataTable headers={["Day", "Card", "Buy", "Sell target", "Best since", "Now", "Result"]} rows={r.items.map(i => [
          i.plan_date, i.name, coins(i.buy_at), coins(i.sell_at), coins(i.best), coins(i.now), <Badge variant="outline" className={OUTCOME[i.outcome]?.className}>{OUTCOME[i.outcome]?.label ?? i.outcome}{i.now_pct != null && i.outcome !== "hit" ? ` ${i.now_pct > 0 ? "+" : ""}${i.now_pct}%` : ""}</Badge>,
        ])} /></div>
      </> : <p className="text-sm text-muted-foreground">Each day's buy picks are saved. From tomorrow this shows which ones reached their sell price, so you can see how far to trust the plan.</p>}
    </Section>

    <Section title="Read this first">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{d.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </Section>
  </>;
}

export default function FutStrategyPage() {
  const context = useMarketPlatform();
  const [budgetText, setBudgetText] = useState(() => read(BUDGET_KEY));
  const [budget, setBudget] = useState<number | null>(() => { const n = Number(read(BUDGET_KEY)); return Number.isInteger(n) && n > 0 ? n : null; });
  const [risk, setRisk] = useState<StrategyRisk>(() => (["careful", "normal", "bold"].includes(read(RISK_KEY)) ? read(RISK_KEY) as StrategyRisk : "normal"));
  useEffect(() => write(RISK_KEY, risk === "normal" ? "" : risk), [risk]);
  const query = useQuery({
    queryKey: [...futKeys.strategy, context.platform, budget, risk],
    queryFn: () => futApi.strategy(context.platform, { budget, risk }),
    enabled: context.enabled, staleTime: 5 * 60_000, refetchInterval: 30 * 60_000, placeholderData: keepPreviousData,
  });
  const apply = () => {
    const n = Number(budgetText.replace(/[,\s]/g, ""));
    const v = budgetText.trim() && Number.isInteger(n) && n >= 0 ? n : null;
    setBudget(v); write(BUDGET_KEY, v == null ? "" : String(v));
  };
  return <MarketShell title="Daily Strategy" showTabs={false} {...context}>
    <p className="text-sm text-muted-foreground">What to buy, sell and relist today, built from a week of FUT.GG prices, your coins, your club and the FUT calendar. Advice only: GafferBot never trades for you.</p>
    <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" onSubmit={e => { e.preventDefault(); apply(); }}>
      <div className="space-y-2"><Label htmlFor="budget">Coins to plan with</Label><Input id="budget" inputMode="numeric" placeholder={query.data?.budget.coins_source === "helper" ? `${numberText(query.data.budget.coins ?? 0)} from the Web App` : "Your coin balance"} value={budgetText} onChange={e => setBudgetText(e.target.value)} /></div>
      <div className="space-y-2"><Label>Risk</Label><Select value={risk} onValueChange={v => setRisk(v as StrategyRisk)}><SelectTrigger aria-label="Risk"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="careful">Careful</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="bold">Bold</SelectItem></SelectContent></Select></div>
      <Button type="submit" variant="outline" disabled={query.isFetching}><ListChecks className="mr-2 h-4 w-4" />Update plan</Button>
    </form>
    <p className="text-xs text-muted-foreground">Leave coins empty to use the balance the XI Lab helper read from the Web App.</p>
    <ErrorNotice error={query.error} />
    {query.isPending ? <MarketLoading /> : query.data && <Plan d={query.data} />}
  </MarketShell>;
}
