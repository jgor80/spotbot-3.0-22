import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Columns2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CardForm, POSITIONS } from "@/components/fut/CardForm";
import { ClubImport } from "@/components/fut/ClubImport";
import { ApiDetails, Busy, ErrorNotice, EvidenceBadge, FutShell, Price, Rules, useFutAvailable } from "@/components/fut/FutShared";
import { futApi, FutCard, FutManager, futKeys } from "@/lib/futApi";

function Managers() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: futKeys.managers, queryFn: futApi.managers });
  const [name, setName] = useState("");
  const [nation, setNation] = useState("");
  const [league, setLeague] = useState("");
  const [price, setPrice] = useState("");
  const [owned, setOwned] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<FutManager | null>(null);
  const add = useMutation({ mutationFn: () => futApi.addManager({ name, nation, league, owned, ...(price ? { price: Number(price) } : {}) }), onSuccess: () => { qc.invalidateQueries({ queryKey: futKeys.managers }); setName(""); setNation(""); setLeague(""); setPrice(""); } });
  const remove = useMutation({ mutationFn: futApi.deleteManager, onSuccess: () => { qc.invalidateQueries({ queryKey: futKeys.managers }); setRemoveTarget(null); } });
  return <section className="space-y-4 border-t border-border pt-6"><h2 className="font-display text-xl font-semibold">Managers</h2><ErrorNotice error={list.error || add.error} />
    <form onSubmit={e => { e.preventDefault(); add.mutate(); }} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Manager name", name, setName], ["Nation", nation, setNation], ["League", league, setLeague]].map(([title, value, setter]) => <div key={String(title)} className="space-y-1.5"><Label htmlFor={`manager-${title}`}>{String(title)}</Label><Input id={`manager-${title}`} required value={String(value)} onChange={e => (setter as (v: string) => void)(e.target.value)} /></div>)}<div className="space-y-1.5"><Label htmlFor="manager-price">Price (user-entered)</Label><Input id="manager-price" type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} /></div><Label className="flex h-10 items-center gap-2"><Checkbox checked={owned} onCheckedChange={value => setOwned(value === true)} />Owned</Label><Button type="submit" disabled={add.isPending}><Plus className="mr-2 h-4 w-4" />Add manager</Button></form>
    {list.isPending ? <Busy /> : <ul className="divide-y divide-border">{list.data?.map(manager => <li key={manager.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-medium">{manager.name}</p><p className="text-sm text-muted-foreground">{manager.nation} · {manager.league} · {manager.owned ? "Owned" : "Not owned"}</p><Price value={manager.price} /></div><Button size="icon" variant="ghost" title="Remove manager" aria-label={`Remove ${manager.name}`} onClick={() => { remove.reset(); setRemoveTarget(manager); }}><Trash2 className="h-4 w-4" /></Button></li>)}{!list.isError && list.data?.length === 0 && <li className="py-4 text-sm text-muted-foreground">No managers yet.</li>}</ul>}
    <Dialog open={!!removeTarget} onOpenChange={value => { if (!value && !remove.isPending) setRemoveTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Remove {removeTarget?.name}?</DialogTitle></DialogHeader><ErrorNotice error={remove.error} /><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (removeTarget) remove.mutate(removeTarget.id); }}>Remove manager</Button></DialogContent></Dialog>
  </section>;
}
export default function FutCardsPage() {
  const enabled = useFutAvailable();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [position, setPosition] = useState("all");
  const [min, setMin] = useState("");
  const [owned, setOwned] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<FutCard | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<FutCard | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const filters = { q, limit: "100", ...(position !== "all" ? { position } : {}), ...(min ? { min_overall: min } : {}), ...(owned ? { owned: "true" } : {}) };
  const cards = useQuery({ queryKey: [...futKeys.cards, filters], queryFn: () => futApi.cards(filters), enabled });
  const save = useMutation({ mutationFn: (card: Omit<FutCard, "id">) => futApi.saveCard(card, editing?.id), onSuccess: () => { qc.invalidateQueries({ queryKey: futKeys.cards }); setFormOpen(false); } });
  const remove = useMutation({ mutationFn: futApi.deleteCard, onSuccess: () => { qc.invalidateQueries({ queryKey: futKeys.cards }); setSelected(ids => ids.filter(id => id !== deleting?.id)); setDeleting(null); } });
  const compare = useMutation({ mutationFn: futApi.compareCards });
  return <FutShell title="My cards" actions={<><Button variant="outline" disabled={selected.length < 2} onClick={() => { setComparisonOpen(true); compare.mutate(selected); }}><Columns2 className="mr-2 h-4 w-4" />Compare ({selected.length}/4)</Button><ClubImport /><Button onClick={() => { save.reset(); setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add card</Button></>}>
    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-1.5"><Label htmlFor="card-search">Search</Label><Input id="card-search" placeholder="Player or version" value={q} onChange={e => setQ(e.target.value)} /></div><div className="space-y-1.5"><Label>Position</Label><Select value={position} onValueChange={setPosition}><SelectTrigger aria-label="Position filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="min-overall">Minimum overall</Label><Input id="min-overall" type="number" min={1} max={99} value={min} onChange={e => setMin(e.target.value)} /></div><Label className="flex h-10 items-center gap-2"><Checkbox checked={owned} onCheckedChange={v => setOwned(v === true)} />Owned only</Label></div>
    <ErrorNotice error={cards.error} />
    {cards.isPending ? <Busy /> : <div className="min-w-0 overflow-x-auto rounded-md border border-border"><Table><TableHeader><TableRow><TableHead className="w-12">Pick</TableHead><TableHead>Player</TableHead><TableHead>OVR</TableHead><TableHead>Positions</TableHead><TableHead>Club / League / Nation</TableHead><TableHead>Evidence</TableHead><TableHead>Price</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{cards.data?.map(card => <TableRow key={card.id}><TableCell><Checkbox aria-label={`Compare ${card.player_name}`} checked={selected.includes(card.id)} disabled={!selected.includes(card.id) && selected.length >= 4} onCheckedChange={v => setSelected(ids => v ? [...ids, card.id] : ids.filter(id => id !== card.id))} /></TableCell><TableCell><p className="font-medium">{card.player_name}</p><p className="text-xs text-muted-foreground">{card.version || "Base"} · {card.owned ? "Owned" : "Not owned"}</p></TableCell><TableCell className="font-display text-lg font-semibold">{card.overall}</TableCell><TableCell>{card.positions.join(", ")}</TableCell><TableCell><p>{card.club}</p><p className="text-xs text-muted-foreground">{card.league} · {card.nation}</p></TableCell><TableCell><EvidenceBadge evidence={card.evidence} /></TableCell><TableCell><Price value={card.price} /></TableCell><TableCell><div className="flex"><Button size="icon" variant="ghost" aria-label={`Edit ${card.player_name}`} title="Edit card" onClick={() => { save.reset(); setEditing(card); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${card.player_name}`} title="Delete card" onClick={() => { remove.reset(); setDeleting(card); }}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}{!cards.isError && cards.data?.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No cards found.</TableCell></TableRow>}</TableBody></Table></div>}
    <Managers />
    <Dialog open={formOpen} onOpenChange={value => { if (!save.isPending) setFormOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Edit card" : "Add card"}</DialogTitle></DialogHeader><ErrorNotice error={save.error} /><CardForm key={editing?.id ?? "new"} initial={editing ?? undefined} pending={save.isPending} onSave={card => save.mutate(card)} /></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={value => { if (!value && !remove.isPending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.player_name}?</DialogTitle></DialogHeader><ErrorNotice error={remove.error} /><div className="flex gap-2"><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(deleting.id); }}>Delete card</Button></div></DialogContent></Dialog>
    <Dialog open={comparisonOpen} onOpenChange={setComparisonOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Card comparison</DialogTitle></DialogHeader><ErrorNotice error={compare.error} />{compare.isPending ? <Busy /> : compare.data && <><Rules info={compare.data} /><ApiDetails value={compare.data} /><div className="flex flex-wrap gap-2">{cards.data?.filter(card => selected.includes(card.id)).map(card => <div key={card.id} className="text-sm">{card.player_name} <EvidenceBadge evidence={card.evidence} /></div>)}</div><p className="text-xs text-muted-foreground">Prices: user-entered coins · Tactical fit: Estimate</p></>}</DialogContent></Dialog>
  </FutShell>;
}
