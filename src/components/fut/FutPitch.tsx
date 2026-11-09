import { Lock, LockOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chemistry, Evidence, FutSlot, FutSquad } from "@/lib/futApi";
import { cn } from "@/lib/utils";
import { evidenceLabels } from "./FutShared";
import { FutCardArt } from "./FutCardArt";

/** Extra card details the squad itself doesn't carry (from the user's card list), so the pitch can show faces and card types. */
export type CardLookup = Map<string, { ea_item_id?: number | null; version?: string | null }>;

// Coordinates are presentation only; chemistry and all analysis stay in the API.
function line(position: string) {
  if (position === "GK") return 4;
  if (["LB", "CB", "RB", "LWB", "RWB"].includes(position)) return 3;
  if (["CDM", "CM", "LM", "RM"].includes(position)) return 2;
  if (["CAM", "CF"].includes(position)) return 1;
  return 0;
}
function lateral(slot: FutSlot) {
  if (slot.slot.startsWith("L")) return 0;
  if (slot.slot.startsWith("R")) return 2;
  return 1;
}
export function ChemistryPips({ value }: { value?: number }) {
  return <div aria-label={value === undefined ? "Chemistry unavailable" : `${value} of 3 chemistry`} className="flex justify-center gap-1">{[1, 2, 3].map(pip => <span key={pip} className={cn("h-2 w-2 rounded-full border border-primary/40", value !== undefined && pip <= value ? "bg-primary" : "bg-muted")} />)}{value === undefined && <span className="text-[10px] text-muted-foreground">—</span>}</div>;
}
export function FutPitch({ squad, chemistry, evidence, lookup, selected, onSelect, onLock }: { squad: FutSquad; chemistry?: Chemistry; evidence?: Record<string, Evidence>; lookup?: CardLookup; selected?: string; onSelect: (slot: string) => void; onLock: (slot: string) => void }) {
  const rows = [0, 1, 2, 3, 4].map(row => squad.slots.filter(slot => line(slot.position) === row).sort((a, b) => lateral(a) - lateral(b))).filter(row => row.length);
  return <div className="relative isolate min-w-0 overflow-hidden rounded-md border border-primary/30 bg-primary/5 px-2 py-6 sm:px-5">
    <svg className="pointer-events-none absolute inset-0 h-full w-full text-primary/20" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true"><rect x="15" y="15" width="570" height="770" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15 400H585M180 15V130H420V15M180 785V670H420V785M240 15V65H360V15M240 785V735H360V785" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="300" cy="400" r="70" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
    <div className="relative flex min-h-[570px] flex-col justify-between gap-5 sm:min-h-[640px]">{rows.map((row, i) => <div key={i} className="flex justify-evenly gap-1.5 sm:gap-3">{row.map(slot => {
      const value = chemistry?.chemistry.players.find(player => player.slot === slot.slot)?.chemistry;
      const cardEvidence = slot.card ? evidence?.[slot.card.id] ?? slot.card.evidence : undefined;
      return <div key={slot.slot} className={cn("relative flex w-full min-w-0 max-w-32 flex-1 flex-col rounded-md border bg-card/95 shadow-sm", selected === slot.slot ? "border-primary ring-1 ring-primary" : "border-border")}>
        <Button variant="ghost" className="h-auto min-h-24 w-full flex-col gap-1 whitespace-normal rounded-b-none px-1 py-2 sm:min-h-28 sm:px-2" aria-label={`Pick player for ${slot.slot}`} onClick={() => onSelect(slot.slot)}>
          <span className="text-[10px] font-semibold text-muted-foreground sm:text-xs">{slot.slot}</span>
          {slot.card ? <FutCardArt card={{ name: slot.card.name, rating: slot.card.rating, position: slot.card.positions[0] ?? slot.position, is_icon: slot.card.is_icon, is_hero: slot.card.is_hero, ...lookup?.get(slot.card.id) }} title={`${slot.card.rating} ${slot.card.name}`} className="w-full max-w-[88px]" /> : <><Plus className="h-5 w-5 text-muted-foreground" /><span className="text-[11px] text-muted-foreground">{slot.position}</span></>}
          <ChemistryPips value={slot.card ? value : undefined} />
          {slot.card && <span className="w-full break-words text-[9px] leading-tight text-muted-foreground">{cardEvidence ? evidenceLabels[cardEvidence] : "Evidence not provided"}</span>}
        </Button>
        <div className="flex items-center justify-center border-t border-border"><Button variant="ghost" size="sm" className="h-7 w-full gap-1 px-1 text-[10px]" title={slot.locked ? "Unlock player" : "Lock player"} aria-label={`${slot.locked ? "Unlock" : "Lock"} ${slot.slot}`} aria-pressed={slot.locked} onClick={() => onLock(slot.slot)}>{slot.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3 text-muted-foreground" />}<span className="hidden sm:inline">{slot.locked ? "Locked" : "Unlocked"}</span></Button></div>
      </div>;
    })}</div>)}</div><Badge variant="outline" className="relative mt-4">{squad.formation}</Badge>
  </div>;
}
