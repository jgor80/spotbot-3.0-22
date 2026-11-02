import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UsersRound, ChartNoAxesCombined } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { futApi, futKeys, FutSquad, squadBudget } from "@/lib/futApi";
import { Busy, ErrorNotice, FutShell, Rules, useFutAvailable } from "@/components/fut/FutShared";

function SquadItem({ squad, onDelete, pending }: { squad: FutSquad; onDelete: () => void; pending: boolean }) {
  const analysis = useQuery({ queryKey: ["fut", "list-chemistry", squad.id, squad.updated_at], queryFn: () => futApi.chemistry(squad.id ?? squad) });
  return <Card><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-display text-lg font-semibold">{squad.name || "Untitled squad"}</h3><p className="text-sm text-muted-foreground">{squad.formation}</p></div><Button variant="ghost" size="icon" aria-label={`Delete ${squad.name}`} title="Delete squad" onClick={onDelete} disabled={pending}><Trash2 className="h-4 w-4" /></Button></div><div className="flex items-end justify-between gap-2"><div><p className="font-display text-2xl font-bold">{analysis.isPending ? "…" : analysis.data?.chemistry.total ?? "—"}<span className="ml-1 text-sm font-normal text-muted-foreground">/33 chemistry</span></p><p className="mt-1 text-xs text-muted-foreground">Last edited {squad.updated_at ? new Date(squad.updated_at).toLocaleString() : "—"}</p></div><Button asChild variant="outline"><Link to={`/fut/squads/${squad.id}`}>Open</Link></Button></div><Rules info={analysis.data} /><ErrorNotice error={analysis.error} /></CardContent></Card>;
}
export default function FutHomePage() {
  const enabled = useFutAvailable();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [formation, setFormation] = useState("");
  const [budget, setBudget] = useState("");
  const [deleting, setDeleting] = useState<FutSquad | null>(null);
  const squads = useQuery({ queryKey: futKeys.squads, queryFn: futApi.squads, enabled });
  const formations = useQuery({ queryKey: ["fut", "formations"], queryFn: futApi.formations, enabled: enabled && open });
  const create = useMutation({ mutationFn: () => futApi.newSquad({ formation, name: name.trim() || "New squad", budget: squadBudget(budget) }), onSuccess: squad => { setOpen(false); navigate("/fut/squads/new", { state: { squad } }); } });
  const remove = useMutation({ mutationFn: (id: string) => futApi.deleteSquad(id), onSuccess: () => { qc.invalidateQueries({ queryKey: futKeys.squads }); setDeleting(null); } });
  return <FutShell title="XI Lab" actions={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New squad</Button>}>
    <Button asChild variant="outline"><Link to="/fut/market"><ChartNoAxesCombined className="mr-2 h-4 w-4" />Market Lab</Link></Button>
    <section className="space-y-4"><h2 className="font-display text-xl font-semibold">My squads</h2><ErrorNotice error={squads.error} />{squads.isPending ? <Busy /> : squads.data?.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{squads.data.map(squad => <SquadItem key={squad.id} squad={squad} pending={remove.isPending} onDelete={() => { remove.reset(); setDeleting(squad); }} />)}</div> : !squads.isError && <div className="space-y-3 border-y border-border py-14 text-center"><UsersRound className="mx-auto h-9 w-9 text-muted-foreground" /><h3 className="font-display text-lg font-semibold">No squads yet</h3><Button variant="outline" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New squad</Button></div>}</section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>New squad</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); create.mutate(); }}><ErrorNotice error={formations.error || create.error} /><div className="space-y-2"><Label htmlFor="new-name">Squad name</Label><Input id="new-name" value={name} onChange={e => setName(e.target.value)} /></div><div className="space-y-2"><Label>Formation</Label><Select value={formation} onValueChange={setFormation}><SelectTrigger aria-label="Formation"><SelectValue placeholder={formations.isPending ? "Loading formations…" : "Choose formation"} /></SelectTrigger><SelectContent>{formations.data?.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="new-budget">Budget (coins)</Label><Input id="new-budget" type="number" min={0} step={1} value={budget} onChange={e => setBudget(e.target.value)} /></div><Button disabled={!formation || create.isPending} type="submit">{create.isPending ? "Creating…" : "Create squad"}</Button></form></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={value => { if (!value && !remove.isPending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle></DialogHeader><ErrorNotice error={remove.error} /><div className="flex gap-2"><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (deleting?.id) remove.mutate(deleting.id); }}>{remove.isPending ? "Deleting…" : "Delete squad"}</Button></div></DialogContent></Dialog>
  </FutShell>;
}
