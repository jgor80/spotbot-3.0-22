// Coach: the FUT home page. One answer to "what should I do with my coins right now for my squad", built from the
// other tools (account, squad, sell or keep, upgrades, SBCs, daily strategy), each step linking to the page that does it.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpCircle, Coins, HandCoins, Hourglass, PiggyBank, Puzzle, RefreshCw, Repeat, Settings2, Tag, TrendingUp, type LucideIcon } from "lucide-react";
import { futApi, futKeys, type CoachPlan, type CoachStep, type CoachStepKind } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { FUT_SECTIONS } from "@/components/fut/futSections";
import { Button } from "@/components/ui/button";
import { dateText, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const STEP: Record<CoachStepKind, { icon: LucideIcon; label: string }> = {
  setup: { icon: Settings2, label: "Set up" }, collect: { icon: HandCoins, label: "Collect" }, relist: { icon: Repeat, label: "Relist" }, sell: { icon: Tag, label: "Sell" },
  swap: { icon: RefreshCw, label: "Free swap" }, upgrade: { icon: ArrowUpCircle, label: "Upgrade" }, save: { icon: PiggyBank, label: "Save" }, sbc: { icon: Puzzle, label: "SBCs" },
  flip: { icon: TrendingUp, label: "Grow coins" }, hold: { icon: Hourglass, label: "Hold" },
};
const SQUAD_SOURCE: Record<CoachPlan["squad"]["source"], string> = { game: "Your squad from the EA Web App", saved: "Your newest saved squad", club: "Your club's best eleven", none: "No squad yet" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="min-w-0 rounded-lg border border-border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 break-words font-display text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>;
}

function Step({ step, n }: { step: CoachStep; n: number }) {
  const Icon = STEP[step.kind].icon;
  return <li className="flex min-w-0 gap-3 rounded-lg border border-border bg-card p-4">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">{n}</div>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" />{STEP[step.kind].label}</p>
          <h3 className="break-words font-display text-base font-semibold sm:text-lg">{step.title}</h3>
        </div>
        {step.coins != null && step.coins !== 0 && <p className={`shrink-0 font-display text-lg font-bold tabular-nums ${step.coins > 0 ? "text-success" : "text-foreground"}`}>{step.coins > 0 ? "+" : "−"}{numberText(Math.abs(step.coins))}</p>}
      </div>
      <p className="text-sm text-muted-foreground">{step.detail}</p>
      {!!step.items?.length && <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {step.items.map((item, i) => <li key={`${item.name}-${i}`} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
          <span className="min-w-0 break-words"><span className="font-medium">{item.name}</span>{item.rating != null && <span className="text-muted-foreground"> {item.rating}</span>}<span className="block text-xs text-muted-foreground">{item.note}</span></span>
          {item.coins != null && <span className="shrink-0 tabular-nums">{numberText(item.coins)}</span>}
        </li>)}
      </ul>}
      {step.link && <Button asChild size="sm" variant="outline"><Link to={step.link.to}>{step.link.label}<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>}
    </div>
  </li>;
}

function Plan({ d }: { d: CoachPlan }) {
  const Icon = STEP[d.headline.kind].icon;
  const m = d.money;
  return <>
    <section className="rounded-lg border border-primary/40 bg-primary/5 p-5">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary"><Icon className="h-4 w-4" />Do this now</p>
      <h2 className="mt-1 break-words font-display text-2xl font-bold sm:text-3xl">{d.headline.title}</h2>
      <p className="mt-2 text-muted-foreground">{d.headline.detail}</p>
    </section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Coins" value={m.coins != null ? numberText(m.coins) : "Not seen yet"} sub={m.coins != null ? (m.coins_at ? `Seen ${dateText(m.coins_at)}` : undefined) : "Open the Web App with the helper"} />
      <Stat label="You could raise" value={numberText(m.sold + m.sell_now + m.sell_steady)} sub={[m.sold ? `${numberText(m.sold)} already sold` : null, "cards you don't play, after tax"].filter(Boolean).join(" · ")} />
      <Stat label="To spend on your squad" value={numberText(m.available)} sub={m.upgrade_cost != null ? `Best upgrade costs ${numberText(m.upgrade_cost)}` : "Coins plus what you can raise"} />
      <Stat label="Your squad" value={d.squad.rating != null ? `${d.squad.rating} rated` : "–"} sub={[d.squad.formation, d.squad.chemistry != null ? `${d.squad.chemistry}/33 chem` : null].filter(Boolean).join(" · ") || undefined} />
    </div>
    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{SQUAD_SOURCE[d.squad.source]}.</span> {d.squad.note}</p>

    <Section title="Your plan, in order">
      <ol className="space-y-3">{d.steps.map((step, i) => <Step key={`${step.kind}-${i}`} step={step} n={i + 1} />)}</ol>
    </Section>

    {!!d.others.length && <Section title="Other upgrades you could afford">
      <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
        {d.others.map((p, i) => <li key={i} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
          <span className="min-w-0 break-words">{p.swaps.map(s => `${s.in.name}${s.in.rating != null ? ` (${s.in.rating})` : ""} for ${s.out.name ?? "an empty spot"} at ${s.position}`).join(" + ")}
            <span className="block text-xs text-muted-foreground">Rating {p.rating_before} to {p.rating_after} · chemistry {p.chem_before} to {p.chem_after}</span></span>
          <span className="shrink-0 tabular-nums">{p.cost ? numberText(p.cost) : "Free"}</span>
        </li>)}
      </ul>
      <p className="text-xs text-muted-foreground">Open your squad in Squad Builder for every option, position by position.</p>
    </Section>}

    {(d.timing.now || !!d.timing.events.length) && <Section title="Timing">
      <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
        {d.timing.now && <p>{d.timing.now}</p>}
        {d.timing.next && <p className="text-muted-foreground">{d.timing.next}</p>}
        {d.timing.events.map(e => <p key={e.name} className="text-muted-foreground"><span className="font-medium text-foreground">{e.name}:</span> {e.advice}</p>)}
      </div>
    </Section>}

    <Section title="Where everything lives">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FUT_SECTIONS.filter(s => s.key !== "coach").map(s => <Link key={s.key} to={s.tabs[0]!.path} className="min-w-0 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
          <p className="font-display font-semibold">{s.label}</p>
          <p className="text-sm text-muted-foreground">{s.question}</p>
          <p className="mt-2 break-words text-xs text-muted-foreground">{s.tabs.map(t => t.label).join(" · ")}</p>
        </Link>)}
      </div>
    </Section>

    <div className="space-y-1 text-xs text-muted-foreground">
      <p>Prices from FUT.GG {d.prices_at ? dateText(d.prices_at) : "not loaded yet"}.</p>
      {d.notes.map(note => <p key={note}>{note}</p>)}
    </div>
  </>;
}

export default function FutCoachPage() {
  const context = useMarketPlatform();
  const query = useQuery({ queryKey: [...futKeys.coach, context.platform], queryFn: () => futApi.coach(context.platform), enabled: context.enabled, staleTime: 5 * 60_000 });
  return <MarketShell title="What should I do with my coins?" {...context}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><Coins className="h-4 w-4 shrink-0" />Your coins, your squad, your club and today's prices, turned into one plan.</p>
      <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-1.5 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
    </div>
    <ErrorNotice error={query.error} />
    {query.isPending ? <MarketLoading /> : query.data ? <Plan d={query.data} /> : null}
  </MarketShell>;
}
