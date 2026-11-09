import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Copy, WandSparkles, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { futApi, futKeys, FutSquad, squadBudget } from "@/lib/futApi";
import { Busy, ErrorNotice, EvidenceBadge, FutShell, Price, Rules, useFutAvailable } from "@/components/fut/FutShared";
import { SurgeonDetails } from "@/components/fut/ChemistryDetails";
import { FutPitch } from "@/components/fut/FutPitch";
import { SlotPicker } from "@/components/fut/SlotPicker";
import { ChemistryOptimizer } from "@/components/fut/ChemistryOptimizer";
import { SquadImport } from "@/components/fut/SquadImport";

export default function FutSquadPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = useFutAvailable();
  const [squad, setSquad] = useState<FutSquad | null>(null);
  const [baseline, setBaseline] = useState("");
  const [selected, setSelected] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);
  const [optimizer, setOptimizer] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [budgetError, setBudgetError] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const saved = useQuery({ queryKey: ["fut", "squad", id], queryFn: () => futApi.squad(id ?? ""), enabled: enabled && !!id && id !== "new", retry: false });
  useEffect(() => {
    const draft = id === "new" ? (location.state as { squad?: FutSquad } | null)?.squad : saved.data;
    if (draft) { setSquad(draft); setBaseline(id === "new" ? "" : JSON.stringify(draft)); setSelected(undefined); }
  }, [id, saved.data, location.state]);
  const dirty = squad !== null && JSON.stringify(squad) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const linkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = (event.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin || link.pathname === window.location.pathname) return;
      event.preventDefault(); event.stopPropagation(); setLeaveTo(link.pathname + link.search + link.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", linkClick, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", linkClick, true); };
  }, [dirty]);
  const analysis = useQuery({ queryKey: ["fut", "chemistry", squad], queryFn: () => { if (!squad) throw new Error("No squad"); return futApi.chemistry(squad); }, enabled: enabled && !!squad, retry: false });
  const diagnosis = useQuery({ queryKey: ["fut", "diagnose", squad, selected], queryFn: () => { if (!squad) throw new Error("No squad"); return futApi.diagnose(squad, selected); }, enabled: enabled && !!squad, retry: false });
  const managers = useQuery({ queryKey: futKeys.managers, queryFn: futApi.managers, enabled });
  const cards = useQuery({ queryKey: [...futKeys.cards, "evidence"], queryFn: () => futApi.cards({ limit: "100" }), enabled: enabled && !!squad });
  const afterSaved = (result: FutSquad) => {
    setSquad(result); setBaseline(JSON.stringify(result)); qc.invalidateQueries({ queryKey: futKeys.squads });
    if (result.id) { qc.setQueryData(["fut", "squad", result.id], result); navigate(`/fut/squads/${result.id}`, { replace: true, state: null }); }
  };
  const save = useMutation({ mutationFn: () => { if (!squad) throw new Error("No squad"); return futApi.saveSquad(squad); }, onSuccess: afterSaved });
  const copy = useMutation({ mutationFn: () => { if (!squad) throw new Error("No squad"); return futApi.saveAs(squad, copyName.trim()); }, onSuccess: result => { setCopyOpen(false); afterSaved(result); } });
  const change = (edit: Partial<FutSquad>) => setSquad(current => current ? { ...current, ...edit } : current);
  const current = squad?.slots.find(slot => slot.slot === selected);
  const currentEvidence = cards.data?.find(card => card.id === current?.card?.id)?.evidence ?? current?.card?.evidence;
  return <FutShell title={squad?.name || "Squad builder"} actions={squad && <><Badge variant={dirty ? "secondary" : "outline"}>{dirty ? "Unsaved changes" : "Saved"}</Badge><Button variant="outline" disabled={budgetError || save.isPending || copy.isPending} onClick={() => { copy.reset(); setCopyName(`${squad.name} copy`); setCopyOpen(true); }}><Copy className="mr-2 h-4 w-4" />Save as</Button><Button disabled={budgetError || !dirty || save.isPending || copy.isPending || !squad.name.trim()} onClick={() => save.mutate()}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Saving…" : "Save"}</Button></>}>
    <Button asChild variant="ghost" size="sm"><Link to="/fut"><ArrowLeft className="mr-2 h-4 w-4" />My squads</Link></Button><ErrorNotice error={saved.error || save.error} />
    {!squad ? saved.isPending && id !== "new" ? <Busy /> : <div className="py-10 text-center text-muted-foreground">{id === "new" ? "This unsaved squad is no longer available. Create a new squad from XI Lab." : "Squad unavailable."}</div> : <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 space-y-4"><div className="flex flex-wrap items-end gap-3"><div className="min-w-[12rem] flex-1 space-y-1.5"><Label htmlFor="squad-name">Squad name</Label><Input id="squad-name" value={squad.name} onChange={e => change({ name: e.target.value })} /></div><SquadImport squad={squad} onChange={next => setSquad(current => current ? (typeof next === "function" ? next(current) : next) : current)} /></div><FutPitch squad={squad} chemistry={analysis.data} evidence={Object.fromEntries((cards.data ?? []).map(card => [card.id, card.evidence]))} lookup={new Map((cards.data ?? []).map(card => [card.id, { ea_item_id: card.ea_item_id, version: card.version }]))} selected={selected} onSelect={slot => { setSelected(slot); setPicking(true); }} onLock={slot => change({ slots: squad.slots.map(item => item.slot === slot ? { ...item, locked: !item.locked } : item) })} />
      </section>
      <aside className="min-w-0 space-y-6"><section className="space-y-3 border-b border-border pb-6"><h2 className="text-sm font-medium text-muted-foreground">Team chemistry</h2><p className="font-display text-5xl font-bold text-primary">{analysis.isFetching ? "…" : analysis.data?.chemistry.total ?? "—"}<span className="text-xl text-muted-foreground"> /33</span></p><ErrorNotice error={analysis.error} /><Rules info={analysis.data} /><div className="flex items-center justify-between gap-3 border-t border-border pt-3"><span className="text-sm">Tactical fit <Badge variant="outline">Estimate</Badge></span><span className="font-display text-lg font-semibold">{analysis.isFetching ? "…" : analysis.data?.fit.average ?? "—"}</span></div><Button className="w-full" disabled={budgetError} onClick={() => setOptimizer(true)}><WandSparkles className="mr-2 h-4 w-4" />Improve chemistry</Button></section>
        <section className="space-y-4 border-b border-border pb-6"><div className="space-y-1.5"><Label>Manager</Label><Select value={squad.manager?.id ?? "none"} onValueChange={value => change({ manager: managers.data?.find(manager => manager.id === value) ?? null })}><SelectTrigger aria-label="Manager picker"><SelectValue placeholder="Choose manager" /></SelectTrigger><SelectContent><SelectItem value="none">No manager</SelectItem>{squad.manager && !managers.data?.some(manager => manager.id === squad.manager?.id) && <SelectItem value={squad.manager.id}>{squad.manager.name}</SelectItem>}{managers.data?.map(manager => <SelectItem key={manager.id} value={manager.id}>{manager.name} · {manager.nation} · {manager.league}</SelectItem>)}</SelectContent></Select><ErrorNotice error={managers.error} />{squad.manager && <Price value={squad.manager.price} />}</div><div className="space-y-1.5"><Label htmlFor="squad-budget">Budget (coins)</Label><Input id="squad-budget" type="number" min={0} step={1} aria-invalid={budgetError} value={squad.budget ?? 0} onChange={e => { try { change({ budget: squadBudget(e.target.value) }); setBudgetError(false); } catch { setBudgetError(true); } }} />{budgetError && <p className="text-sm text-destructive">Budget must be a whole number of coins, 0 or more.</p>}</div></section>
        <section className="space-y-3"><h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Stethoscope className="h-5 w-5 text-primary" />Chemistry Surgeon</h2><Select value={selected ?? "all"} onValueChange={value => setSelected(value === "all" ? undefined : value)}><SelectTrigger aria-label="Chemistry Surgeon player"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All players below 3</SelectItem>{squad.slots.filter(slot => slot.card).map(slot => <SelectItem key={slot.slot} value={slot.slot}>{slot.slot} · {slot.card?.name}</SelectItem>)}</SelectContent></Select>
          {current?.card && <div className="space-y-1"><p className="font-medium">{current.card.name}</p><EvidenceBadge evidence={currentEvidence} /><Price value={current.card.price} /><ErrorNotice error={cards.error} /></div>}
          <ErrorNotice error={diagnosis.error} />{diagnosis.isFetching ? <Busy /> : diagnosis.data && <><Rules info={diagnosis.data} /><SurgeonDetails value={diagnosis.data} /></>}
        </section>
      </aside>
    </div>}
    {squad && picking && selected && <SlotPicker key={`${id}-${selected}`} squad={squad} slot={selected} onClose={() => setPicking(false)} onAssigned={setSquad} />}
    {squad && optimizer && <ChemistryOptimizer squad={squad} initialSlot={selected} onClose={() => setOptimizer(false)} onSaved={result => { setOptimizer(false); afterSaved(result); }} />}
    <Dialog open={copyOpen} onOpenChange={value => { if (!copy.isPending) setCopyOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Save as new squad</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); copy.mutate(); }}><Label htmlFor="copy-name">Name</Label><Input id="copy-name" required value={copyName} onChange={e => setCopyName(e.target.value)} /><ErrorNotice error={copy.error} /><Button type="submit" disabled={!copyName.trim() || copy.isPending}>{copy.isPending ? "Saving…" : "Save copy"}</Button></form></DialogContent></Dialog>
    <Dialog open={!!leaveTo} onOpenChange={open => { if (!open) setLeaveTo(null); }}><DialogContent><DialogHeader><DialogTitle>Leave without saving?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Your unsaved changes will be lost.</p><div className="flex gap-2"><Button variant="outline" onClick={() => setLeaveTo(null)}>Keep editing</Button><Button variant="destructive" onClick={() => { const target = leaveTo; setLeaveTo(null); if (target) navigate(target); }}>Leave</Button></div></DialogContent></Dialog>
  </FutShell>;
}
