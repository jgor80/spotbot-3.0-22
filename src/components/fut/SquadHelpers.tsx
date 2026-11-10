import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BestSquad, Chemistry, futApi, FutSquad, LinkType, SquadRoles, SuggestBy } from "@/lib/futApi";
import { cn } from "@/lib/utils";
import { Busy, ErrorNotice } from "./FutShared";
import { ChemistryPips, RoleTag } from "./FutPitch";
import { FutCardArt } from "./FutCardArt";

const LINK_LABEL: Record<LinkType, string> = { club: "Club", league: "League", nation: "Nation" };

export function ByToggle({ value, onChange, label }: { value: SuggestBy; onChange: (by: SuggestBy) => void; label: string }) {
  return <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={v => { if (v === "ovr" || v === "chem") onChange(v); }} aria-label={label}>
    <ToggleGroupItem value="ovr">Best OVR</ToggleGroupItem>
    <ToggleGroupItem value="chem">Best chem</ToggleGroupItem>
  </ToggleGroup>;
}

/**
 * Team chemistry, broken down: every club, league and nation in the XI with how many players share it, the points it
 * gives, and how many more are needed for the next point. Then each player's chemistry and FC 27 roles for their slot.
 */
export function TeamChemistry({ squad, chemistry, roles }: { squad: FutSquad; chemistry?: Chemistry; roles?: SquadRoles }) {
  const [type, setType] = useState<LinkType>("league");
  const players = chemistry?.chemistry.players ?? [];
  const groups = new Map<string, { key: string; count: number; points: number; next: number | null; need: number | null; names: string[] }>();
  for (const p of players) {
    const b = p.breakdown?.[type];
    if (!b?.key) continue;
    const g = groups.get(b.key.toLowerCase()) ?? { key: b.key, count: 0, points: 0, next: null, need: null, names: [] };
    g.count = Math.max(g.count, b.count); g.points = Math.max(g.points, b.points);
    if (b.next_threshold !== null) { g.next = b.next_threshold; g.need = b.needed_for_next; }
    g.names.push(p.name);
    groups.set(b.key.toLowerCase(), g);
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count || b.points - a.points || a.key.localeCompare(b.key));
  return <section className="space-y-3 border-b border-border pb-6" aria-label="Chemistry links">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium text-muted-foreground">Chemistry links</h2>
      <ToggleGroup type="single" size="sm" variant="outline" value={type} onValueChange={v => { if (v) setType(v as LinkType); }} aria-label="Link type">
        {(["club", "league", "nation"] as const).map(t => <ToggleGroupItem key={t} value={t} className="px-2 text-xs">{LINK_LABEL[t]}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
    {!players.length ? <p className="text-sm text-muted-foreground">Add players to see their links.</p> : <ul className="space-y-2">{list.map(g => <li key={g.key} className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="min-w-0 break-words font-medium">{g.key}</span><span className="shrink-0 text-xs text-muted-foreground">{g.count} {g.count === 1 ? "player" : "players"} · <span className={g.points ? "font-semibold text-primary" : ""}>{g.points} chem</span></span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (g.count / Math.max(g.next ?? g.count, 1)) * 100)}%` }} /></div>
      <p className="text-[11px] text-muted-foreground">{g.next !== null && g.need !== null ? `${g.need} more for ${g.points + 1} chem (needs ${g.next})` : g.points ? "Top threshold reached" : ""}{g.names.length ? `${g.next !== null || g.points ? " · " : ""}${g.names.join(", ")}` : ""}</p>
    </li>)}{list.length === 0 && <li className="text-sm text-muted-foreground">No {LINK_LABEL[type].toLowerCase()} entered on these cards.</li>}</ul>}
    {players.length > 0 && <div className="space-y-1.5 border-t border-border pt-3"><h3 className="text-xs font-medium text-muted-foreground">Players, chemistry and roles</h3>
      <ul className="space-y-1.5">{squad.slots.filter(s => s.card).map(s => {
        const p = players.find(x => x.slot === s.slot);
        const r = roles?.[s.slot]?.roles ?? [];
        return <li key={s.slot} className="space-y-0.5 text-sm">
          <div className="flex items-center gap-2"><Badge variant="outline" className="w-12 shrink-0 justify-center px-1 text-[10px]">{s.slot}</Badge><span className="min-w-0 flex-1 truncate">{s.card!.name}</span><ChemistryPips value={p?.chemistry} /></div>
          {(r.length > 0 || p?.in_position === false || (p?.manager_bonus ?? 0) > 0) && <div className="flex flex-wrap gap-1 pl-14">{p?.in_position === false && <span className="text-[10px] text-destructive">Out of position</span>}{(p?.manager_bonus ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">+{p!.manager_bonus} manager</span>}{r.map(role => <RoleTag key={role.role} role={role} />)}</div>}
        </li>;
      })}</ul>
      <p className="text-[11px] text-muted-foreground">Roles (+ / ++) are the FC 27 player roles each card gets a bonus in at its slot's position, from FUT.GG card data. Cards without FUT.GG data show none.</p>
    </div>}
  </section>;
}

/** "Suggest best squad": the best XI from your club cards by overall or chemistry, for this formation or every one. */
export function BestSquadDialog({ squad, onClose, onApply }: { squad: FutSquad; onClose: () => void; onApply: (result: BestSquad) => void }) {
  const [by, setBy] = useState<SuggestBy>("chem");
  const [scope, setScope] = useState<"this" | "all">("this");
  const run = useMutation({ mutationFn: () => futApi.bestSquad(squad, by, scope === "all" ? "all" : squad.formation) });
  const results = run.data?.results ?? [];
  const locked = squad.slots.filter(s => s.locked && s.card).length;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Suggest best squad</DialogTitle><DialogDescription>Builds the strongest XI from your club cards. Everyone plays a position they have{locked ? `, and your ${locked} locked player${locked === 1 ? "" : "s"} stay` : ""}. Nothing is saved until you press Save.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5"><Label>Aim for</Label><ByToggle value={by} onChange={v => { setBy(v); run.reset(); }} label="Aim for" /></div>
      <div className="space-y-1.5"><Label>Formation</Label><Select value={scope} onValueChange={v => { setScope(v as "this" | "all"); run.reset(); }}><SelectTrigger className="w-48" aria-label="Which formations"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="this">{squad.formation} only</SelectItem><SelectItem value="all">Every formation</SelectItem></SelectContent></Select></div>
      <Button onClick={() => run.mutate()} disabled={run.isPending}><Sparkles className="mr-2 h-4 w-4" />{run.isPending ? "Building…" : "Build"}</Button>
    </div>
    <p className="text-xs text-muted-foreground">Best OVR: highest overall, chemistry breaks ties. Best chem: highest team chemistry, overall breaks ties.</p>
    <ErrorNotice error={run.error} />
    {run.isPending && <Busy />}
    {run.data && <div className="space-y-3"><p className="text-xs text-muted-foreground">From {run.data.owned_cards} club cards.</p>
      {results.map((r, i) => <BestSquadRow key={r.formation} result={r} open={i === 0} onApply={() => onApply(r)} />)}</div>}
  </DialogContent></Dialog>;
}

function BestSquadRow({ result, open, onApply }: { result: BestSquad; open: boolean; onApply: () => void }) {
  const [show, setShow] = useState(open);
  return <div className="rounded-md border border-border p-3">
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-display text-lg font-semibold">{result.formation}</span>
      <span className="text-sm"><span className="font-semibold text-primary">{result.chemistry}</span>/33 chem</span>
      <span className="text-sm"><span className="font-semibold">{result.rating}</span> avg OVR</span>
      {result.empty.length > 0 && <Badge variant="destructive">{result.empty.length} empty</Badge>}
      <div className="ml-auto flex gap-2"><Button variant="ghost" size="sm" onClick={() => setShow(!show)} aria-expanded={show}>{show ? "Hide" : "Players"}</Button><Button size="sm" onClick={onApply}>Use this squad</Button></div>
    </div>
    {show && <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">{result.squad.slots.map(s => <li key={s.slot} className="flex items-center gap-2"><Badge variant="outline" className="w-12 justify-center px-1 text-[10px]">{s.slot}</Badge>{s.card ? <span className="min-w-0 truncate">{s.card.rating} {s.card.name}</span> : <span className="text-muted-foreground">No club card plays {s.position}</span>}</li>)}</ul>}
  </div>;
}

/** Ranked club cards for one slot, by overall or by what they do for team chemistry. Picking one previews it. */
export function SlotSuggestions({ squad, slot, selected, onPick }: { squad: FutSquad; slot: string; selected?: string | null; onPick: (cardId: string) => void }) {
  const [by, setBy] = useState<SuggestBy>("chem");
  const q = useQuery({ queryKey: ["fut", "suggest", squad, slot, by], queryFn: () => futApi.suggestSlot(squad, slot, by), retry: false });
  return <section className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3" aria-label="Suggestions from your club">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Suggested from your club</h3><ByToggle value={by} onChange={setBy} label="Rank suggestions by" /></div>
    <ErrorNotice error={q.error} />
    {q.isPending ? <Busy /> : q.data && (q.data.suggestions.length === 0 ? <p className="text-sm text-muted-foreground">None of your club cards play {q.data.position} and aren't already in the squad.</p>
      : <ul className="flex gap-2 overflow-x-auto pb-1">{q.data.suggestions.map(s => <li key={s.card.id} className="shrink-0">
        <Button variant={selected === s.card.id ? "secondary" : "outline"} aria-pressed={selected === s.card.id} className="h-auto w-28 flex-col gap-1 whitespace-normal px-2 py-2" onClick={() => onPick(s.card.id)}>
          <FutCardArt card={{ name: s.card.name, rating: s.card.rating, position: s.card.positions[0] ?? q.data.position, is_icon: s.card.is_icon, is_hero: s.card.is_hero }} compact className="w-12" />
          <span className="w-full truncate text-xs font-medium">{s.card.name}</span>
          <ChemistryPips value={s.chemistry} />
          <span className="text-[10px] text-muted-foreground">Team {s.team_chemistry}{s.change ? <span className={s.change > 0 ? "text-primary" : "text-destructive"}> ({s.change > 0 ? "+" : ""}{s.change})</span> : ""}</span>
        </Button></li>)}</ul>)}
  </section>;
}
