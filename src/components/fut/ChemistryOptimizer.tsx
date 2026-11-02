import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { futApi, FutSquad, squadBudget } from "@/lib/futApi";
import { ApiDetails, Busy, ErrorNotice, Rules } from "./FutShared";

export function ChemistryOptimizer({ squad, initialSlot, onClose, onSaved }: { squad: FutSquad; initialSlot?: string; onClose: () => void; onSaved: (squad: FutSquad) => void }) {
  const [slot, setSlot] = useState(initialSlot ?? "team");
  const [slotTarget, setSlotTarget] = useState("3");
  const [totalTarget, setTotalTarget] = useState("33");
  const [budget, setBudget] = useState(String(squad.budget ?? ""));
  const [maxSwaps, setMaxSwaps] = useState("2");
  const [manager, setManager] = useState(true);
  const [netLoss, setNetLoss] = useState(false);
  const [copyName, setCopyName] = useState(`${squad.name} improved`);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const optimize = useMutation({ mutationFn: () => futApi.optimize(squad, { ...(slot !== "team" ? { slot, slot_target: Number(slotTarget) } : {}), ...(totalTarget ? { total_target: Number(totalTarget) } : {}) }, { budget: squadBudget(budget), max_swaps: Number(maxSwaps), allow_manager_change: manager, allow_net_loss: netLoss }) });
  const save = useMutation({ mutationFn: (solution: FutSquad) => futApi.saveAs(solution, copyName.trim()), onSuccess: onSaved });
  const compare = useMutation({ mutationFn: (solution: FutSquad) => futApi.compareSquads(squad, solution) });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Improve chemistry</DialogTitle></DialogHeader>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); setCompareIndex(null); compare.reset(); optimize.mutate(); }}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5"><Label>Player to fix</Label><Select value={slot} onValueChange={setSlot}><SelectTrigger aria-label="Player to fix"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="team">Team only</SelectItem>{squad.slots.filter(s => s.card).map(s => <SelectItem key={s.slot} value={s.slot}>{s.slot} · {s.card?.name}</SelectItem>)}</SelectContent></Select></div>
      {slot !== "team" && <div className="space-y-1.5"><Label htmlFor="slot-target">Player chemistry target</Label><Input id="slot-target" type="number" min={0} max={3} required value={slotTarget} onChange={e => setSlotTarget(e.target.value)} /></div>}
      <div className="space-y-1.5"><Label htmlFor="team-target">Team chemistry target</Label><Input id="team-target" type="number" min={0} max={33} value={totalTarget} onChange={e => setTotalTarget(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="optimizer-budget">Budget (coins)</Label><Input id="optimizer-budget" type="number" min={0} step={1} value={budget} onChange={e => setBudget(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Maximum swaps</Label><Select value={maxSwaps} onValueChange={setMaxSwaps}><SelectTrigger aria-label="Maximum swaps"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div>
    </div><div className="flex flex-wrap gap-4"><Label className="flex items-center gap-2"><Checkbox checked={manager} onCheckedChange={v => setManager(v === true)} />Allow manager change</Label><Label className="flex items-center gap-2"><Checkbox checked={netLoss} onCheckedChange={v => setNetLoss(v === true)} />Allow net loss</Label></div><Button type="submit" disabled={optimize.isPending || (slot === "team" && totalTarget === "")}>{optimize.isPending ? "Finding solutions…" : "Find solutions"}</Button></form>
    <ErrorNotice error={optimize.error || save.error || compare.error} />
    {optimize.isPending ? <Busy /> : optimize.data && <section className="space-y-4 border-t border-border pt-4"><Rules info={optimize.data} />
      {optimize.data.status === "already_met" && <p className="text-sm">Your chemistry goal is already met.</p>}
      {optimize.data.status === "infeasible" && <p className="text-sm">No solution found within these constraints.</p>}
      {!!optimize.data.solutions?.length && <div className="space-y-1.5"><Label htmlFor="solution-name">New squad name</Label><Input id="solution-name" value={copyName} onChange={e => setCopyName(e.target.value)} /></div>}
      {optimize.data.solutions?.map((solution, index) => <Card key={index}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Solution {index + 1}</h3><p className="font-display text-xl font-bold">{solution.total_before} → {solution.total_after}<span className="ml-1 text-xs font-normal text-muted-foreground">/33 chemistry</span></p></div><div><p className="text-xs font-medium text-muted-foreground">Cost · based on user-entered prices</p><ApiDetails value={solution.cost} /></div><h4 className="text-sm font-medium">Changes</h4><ApiDetails value={solution.swaps} /><ApiDetails value={solution.explanation} />{!!solution.buy?.length && <><h4 className="text-sm font-medium">Cards needed</h4><ApiDetails value={solution.buy} /></>}<div className="flex flex-wrap gap-2"><Button disabled={save.isPending || !copyName.trim()} onClick={() => save.mutate(solution.squad)}>Apply as new squad</Button><Button variant="outline" disabled={compare.isPending} onClick={() => { setCompareIndex(index); compare.mutate(solution.squad); }}>Compare</Button></div>{compareIndex === index && (compare.isPending ? <Busy /> : compare.data && <div className="space-y-3 border-t border-border pt-3"><h4 className="font-medium">Original vs solution</h4><Rules info={compare.data} /><ApiDetails value={compare.data} /><p className="text-xs text-muted-foreground">Tactical fit: Estimate · Prices: user-entered coins</p></div>)}</CardContent></Card>)}
      {!!optimize.data.blockers?.length && <div className="space-y-2"><h3 className="font-medium">Blockers</h3><ApiDetails value={optimize.data.blockers} /></div>}
      {!!optimize.data.rejected?.length && <div className="space-y-2"><h3 className="font-medium">Rejected options</h3><ApiDetails value={optimize.data.rejected} /></div>}
    </section>}
  </DialogContent></Dialog>;
}
