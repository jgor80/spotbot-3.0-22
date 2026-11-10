import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { futApi, FutSquad, UpgradePlan } from "@/lib/futApi";
import { useMarketPlatform } from "./market/MarketShared";
import { Busy, ErrorNotice } from "./FutShared";

const coins = (n: number) => n.toLocaleString("en-US");
const delta = (a: number, b: number) => (b > a ? `+${b - a}` : b < a ? `${b - a}` : "±0");

function PlanRow({ plan, onApply, highlight }: { plan: UpgradePlan; onApply: () => void; highlight?: boolean }) {
  return <div className={`space-y-2 rounded-md border p-3 ${highlight ? "border-primary" : "border-border"}`}>
    <ul className="space-y-1 text-sm">{plan.swaps.map(w => <li key={w.slot}><span className="font-medium">{w.slot}</span>: {w.out.name ?? "empty"}{w.out.rating !== null ? ` (${w.out.rating})` : ""} → <span className="font-medium">{w.in.name}</span>{w.in.rating !== null ? ` (${w.in.rating})` : ""} {w.in.owned ? <Badge variant="outline">In your club</Badge> : <span className="text-muted-foreground">{coins(w.cost)} coins</span>}{w.in.meta !== null && <span className="text-xs text-muted-foreground"> · meta {w.in.meta}{w.out.meta !== null ? ` (was ${w.out.meta})` : ""}</span>}</li>)}</ul>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>Rating {plan.rating_before} → <b>{plan.rating_after}</b></span>
      <span>Chem {plan.chem_before} → <b>{plan.chem_after}</b> ({delta(plan.chem_before, plan.chem_after)})</span>
      <span>Cost <b>{plan.cost ? coins(plan.cost) : "free"}</b>{plan.net_cost !== plan.cost ? ` (${coins(plan.net_cost)} after selling who comes out)` : ""}</span>
      {plan.per_10k !== null && <span className="text-muted-foreground">{plan.per_10k} gain per 10k</span>}
      <Button size="sm" variant="outline" className="ml-auto" onClick={onApply}>Try it</Button>
    </div>
  </div>;
}

/**
 * Upgrade path for a budget: the best single swaps and pairs from market cards (FUT.GG prices) and unused club cards,
 * ranked by team rating, chemistry and metarating. "Try it" only changes the squad on screen; nothing is bought.
 */
export function UpgradePathDialog({ squad, onClose, onApply }: { squad: FutSquad; onClose: () => void; onApply: (squad: FutSquad) => void }) {
  const { platform, setPlatform } = useMarketPlatform();
  const [budget, setBudget] = useState(String(squad.budget ?? 50000));
  const value = Number(budget);
  const ok = /^\d{1,8}$/.test(budget.trim()) && value <= 15_000_000;
  const run = useMutation({ mutationFn: () => futApi.upgrades(squad, value, platform) });
  const apply = (plan: UpgradePlan) => onApply({ ...squad, slots: squad.slots.map(s => { const w = plan.swaps.find(x => x.slot === s.slot); return w ? { ...s, card: w.in.card } : s; }) });
  const d = run.data;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Upgrade path</DialogTitle><DialogDescription>The best upgrades your coins can buy, plus any of your unused club cards that would do better. Locked players stay. Nothing is bought, and the squad only changes when you press Save.</DialogDescription></DialogHeader>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (ok) run.mutate(); }}>
      <div className="space-y-1.5"><Label htmlFor="upgrade-budget">Coins to spend</Label><Input id="upgrade-budget" className="w-36" inputMode="numeric" value={budget} aria-invalid={!ok} onChange={e => { setBudget(e.target.value); run.reset(); }} /></div>
      <div className="space-y-1.5"><Label>Platform</Label><Select value={platform} onValueChange={v => { setPlatform(v); run.reset(); }}><SelectTrigger className="w-32" aria-label="Platform"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="console">Console</SelectItem><SelectItem value="pc">PC</SelectItem></SelectContent></Select></div>
      <Button type="submit" disabled={!ok || run.isPending}><TrendingUp className="mr-2 h-4 w-4" />{run.isPending ? "Searching…" : "Find upgrades"}</Button>
    </form>
    {!ok && <p className="text-sm text-destructive">Enter whole coins, up to 15,000,000.</p>}
    <ErrorNotice error={run.error} />
    {run.isPending && <Busy />}
    {d && <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Now: rating {d.before.rating}, chemistry {d.before.chem}/33. Checked {d.candidates} cards. {d.note}</p>
      {d.best ? <section className="space-y-2"><h3 className="text-sm font-semibold">Best for {coins(d.budget)} coins</h3><PlanRow plan={d.best} highlight onApply={() => apply(d.best!)} /></section> : <p className="text-sm text-muted-foreground">Nothing within {coins(d.budget)} coins beats your current XI. Try a bigger budget.</p>}
      {d.pairs.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">Two swaps together</h3>{d.pairs.slice(0, 5).map((p, i) => <PlanRow key={i} plan={p} onApply={() => apply(p)} />)}</section>}
      {d.singles.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">One swap</h3>{d.singles.map((p, i) => <PlanRow key={i} plan={p} onApply={() => apply(p)} />)}</section>}
      {d.free.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">Free, from your club</h3>{d.free.map((p, i) => <PlanRow key={i} plan={p} onApply={() => apply(p)} />)}</section>}
    </div>}
  </DialogContent></Dialog>;
}
