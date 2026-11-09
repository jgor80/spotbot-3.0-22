import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { futApi, futKeys, FutSquad } from "@/lib/futApi";
import { Busy, ErrorNotice, EvidenceBadge, Price, Rules } from "./FutShared";
import { SwapChanges } from "./ChemistryDetails";
import { FutCardArt } from "./FutCardArt";

export function SlotPicker({ squad, slot, onClose, onAssigned }: { squad: FutSquad; slot: string; onClose: () => void; onAssigned: (squad: FutSquad) => void }) {
  const current = squad.slots.find(item => item.slot === slot);
  const [q, setQ] = useState("");
  const [positionOnly, setPositionOnly] = useState(true);
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [candidate, setCandidate] = useState<string | null | undefined>(undefined);
  const filters = { q, limit: "100", ...(ownedOnly ? { owned: "true" } : {}), ...(positionOnly && current ? { position: current.position } : {}) };
  const cards = useQuery({ queryKey: [...futKeys.cards, "picker", filters], queryFn: () => futApi.cards(filters) });
  const preview = useQuery({ queryKey: ["fut", "preview", squad, slot, candidate], queryFn: () => futApi.preview(squad, slot, candidate ?? null), enabled: candidate !== undefined, retry: false });
  const assign = useMutation({ mutationFn: () => futApi.assign(squad, slot, candidate ?? null), onSuccess: result => { onAssigned(result); onClose(); } });
  return <Dialog open onOpenChange={open => { if (!open && !assign.isPending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Pick a player · {slot}</DialogTitle></DialogHeader>
    <div className="space-y-3"><Label htmlFor="pick-search">Search my cards</Label><Input id="pick-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Player name" /><Label className="flex items-center gap-2"><Checkbox checked={positionOnly} onCheckedChange={v => setPositionOnly(v === true)} />{current?.position} positions first</Label><Label className="flex items-center gap-2"><Checkbox checked={ownedOnly} onCheckedChange={v => setOwnedOnly(v === true)} />Owned only</Label></div>
    <ErrorNotice error={cards.error || assign.error} />
    {cards.isPending ? <Busy /> : <div className="max-h-64 space-y-2 overflow-y-auto">{current?.card && <Button variant={candidate === null ? "default" : "outline"} className="w-full" disabled={assign.isPending} onClick={() => setCandidate(null)}>Clear this slot</Button>}{cards.data?.map(card => <Button key={card.id} variant={candidate === card.id ? "secondary" : "outline"} disabled={assign.isPending} className="h-auto w-full items-center justify-between gap-3 whitespace-normal py-2 text-left" onClick={() => setCandidate(card.id)} aria-pressed={candidate === card.id}><FutCardArt card={{ name: card.player_name, rating: card.overall, position: card.positions[0], version: card.version, is_icon: card.is_icon, is_hero: card.is_hero, ea_item_id: card.ea_item_id }} compact className="w-10" /><span className="min-w-0 flex-1"><span className="block break-words font-medium">{card.player_name} · {card.overall}</span><span className="block text-xs text-muted-foreground">{card.version} · {card.positions.join(", ")} · {card.club} · {card.owned ? "Owned" : "Target"}</span><EvidenceBadge evidence={card.evidence} /></span><span className="shrink-0 text-xs"><Price value={card.price} /></span></Button>)}{cards.data?.length === 0 && <p className="py-5 text-sm text-muted-foreground">{ownedOnly ? "No matching owned cards." : "No matching cards."}</p>}</div>}
    {candidate !== undefined && <section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">Swap preview</h3><ErrorNotice error={preview.error} />{preview.isPending ? <Busy /> : preview.data && <><p className="font-display text-2xl font-bold">{preview.data.total_before} → {preview.data.total_after}<span className="ml-2 text-sm font-normal text-muted-foreground">/33 team chemistry</span></p><Rules info={preview.data} /><h4 className="text-sm font-medium">Who gains and loses</h4><SwapChanges changes={preview.data.diff.changes} squad={squad} /></>}<Button disabled={!preview.isSuccess || assign.isPending} onClick={() => assign.mutate()}>{assign.isPending ? "Applying…" : "Confirm pick"}</Button></section>}
  </DialogContent></Dialog>;
}
