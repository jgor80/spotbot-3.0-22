import { useState, type ReactNode } from "react";
import { DndContext, DragOverlay, MeasuringStrategy, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Lock, LockOpen, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardRole, Chemistry, Evidence, FormationSlot, FutSlot, FutSquad, SquadRoles } from "@/lib/futApi";
import { playsSlot } from "@/lib/futSquadEdit";
import { cn } from "@/lib/utils";
import { evidenceLabels } from "./FutShared";
import { FutCardArt, type CardArtCard } from "./FutCardArt";

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
/** "++ Poacher": the role's bonus level first, as FC 27 shows it. */
export function RoleTag({ role, className }: { role: CardRole; className?: string }) {
  return <span className={cn("inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-medium leading-4", role.level === "plusplus" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground", className)}>
    <span aria-label={role.level === "plusplus" ? "Role plus plus" : "Role plus"}>{role.level === "plusplus" ? "++" : "+"}</span>{role.role}
  </span>;
}

/** The formation's own rows (attack on top, left to right as the formation lists them); falls back to position lines. */
function pitchRows(squad: FutSquad, layout?: FormationSlot[]): FutSlot[][] {
  const at = new Map((layout ?? []).map((s, i) => [s.slot, { row: s.row, i }]));
  if (layout && squad.slots.every(slot => at.has(slot.slot))) {
    const rows = [...new Set(layout.map(s => s.row))].sort((a, b) => b - a);
    return rows.map(row => squad.slots.filter(slot => at.get(slot.slot)!.row === row).sort((a, b) => at.get(a.slot)!.i - at.get(b.slot)!.i)).filter(row => row.length);
  }
  return [0, 1, 2, 3, 4].map(row => squad.slots.filter(slot => line(slot.position) === row).sort((a, b) => lateral(a) - lateral(b))).filter(row => row.length);
}
/** What is being dragged: a player already on the pitch, or a club card from the tray under it. */
export type PitchDrag = { from: "slot"; slot: string; name: string; rating: number; positions: string[]; art: CardArtCard } | { from: "club"; cardId: string; name: string; rating: number; positions: string[]; art: CardArtCard };
export const REMOVE_ZONE = "remove";

interface PitchProps {
  squad: FutSquad; layout?: FormationSlot[]; chemistry?: Chemistry; evidence?: Record<string, Evidence>; lookup?: CardLookup; roles?: SquadRoles; selected?: string;
  onSelect: (slot: string) => void; onLock: (slot: string) => void;
  /** Drag a player onto another slot: they move there, and a player already there swaps back. */
  onMove?: (from: string, to: string) => void;
  /** The remove button on a player, or dragging them off the pitch. */
  onRemove?: (slot: string) => void;
  /** A club card from the tray dropped on a slot. */
  onDropCard?: (cardId: string, slot: string) => void;
  /** Rendered under the pitch inside the same drag area (the club tray). */
  tray?: ReactNode;
  busy?: boolean;
}

function PitchSlot({ slot, value, slotRoles, cardEvidence, art, selected, dragging, canDrag, onSelect, onLock, onRemove }: {
  slot: FutSlot; value?: number; slotRoles: CardRole[]; cardEvidence?: Evidence; art?: CardArtCard; selected: boolean; dragging: PitchDrag | null; canDrag: boolean;
  onSelect: (slot: string) => void; onLock: (slot: string) => void; onRemove?: (slot: string) => void;
}) {
  const drop = useDroppable({ id: `slot:${slot.slot}` });
  const drag = useDraggable({ id: `slot:${slot.slot}`, disabled: !canDrag || !slot.card, data: slot.card && art ? { from: "slot", slot: slot.slot, name: slot.card.name, rating: slot.card.rating, positions: slot.card.positions, art } satisfies PitchDrag : undefined });
  const mine = dragging?.from === "slot" && dragging.slot === slot.slot;
  const fits = !!dragging && !mine && playsSlot(dragging.positions, slot.position);
  return <div ref={drop.setNodeRef} data-slot={slot.slot} className={cn("relative flex w-full min-w-0 max-w-32 flex-1 flex-col rounded-md border bg-card/95 shadow-sm transition-colors",
    selected ? "border-primary ring-1 ring-primary" : "border-border", fits && "border-success/70", dragging && !mine && drop.isOver && (fits ? "ring-2 ring-success" : "ring-2 ring-primary"), mine && "opacity-40")}>
    <Button ref={drag.setNodeRef} {...drag.listeners} variant="ghost" className={cn("h-auto min-h-24 w-full flex-col gap-1 whitespace-normal rounded-b-none px-1 py-2 sm:min-h-28 sm:px-2", canDrag && slot.card && "cursor-grab touch-manipulation active:cursor-grabbing")}
      aria-label={slot.card ? `${slot.slot}: ${slot.card.name}. Press to pick another player${canDrag ? ", or drag to move" : ""}` : `Pick player for ${slot.slot}`} onClick={() => onSelect(slot.slot)}>
      <span className="text-[10px] font-semibold text-muted-foreground sm:text-xs">{slot.slot}</span>
      {slot.card && art ? <FutCardArt card={art} title={`${slot.card.rating} ${slot.card.name}`} className="w-full max-w-[88px]" /> : <><Plus className="h-5 w-5 text-muted-foreground" /><span className="text-[11px] text-muted-foreground">{slot.position}</span></>}
      <ChemistryPips value={slot.card ? value : undefined} />
      {slotRoles.length > 0 && <span className="flex w-full flex-wrap justify-center gap-0.5" title={slotRoles.map(r => `${r.level === "plusplus" ? "++" : "+"} ${r.role}`).join(", ")}><RoleTag role={slotRoles[0]} className="max-w-full truncate" />{slotRoles.length > 1 && <span className="text-[10px] text-muted-foreground">+{slotRoles.length - 1}</span>}</span>}
      {slot.card && <span className="w-full break-words text-[9px] leading-tight text-muted-foreground">{cardEvidence ? evidenceLabels[cardEvidence] : "Evidence not provided"}</span>}
    </Button>
    <div className="flex items-center justify-center border-t border-border">
      <Button variant="ghost" size="sm" className="h-7 min-w-0 flex-1 gap-1 px-1 text-[10px]" title={slot.locked ? "Unlock player" : "Lock player"} aria-label={`${slot.locked ? "Unlock" : "Lock"} ${slot.slot}`} aria-pressed={slot.locked} onClick={() => onLock(slot.slot)}>{slot.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3 text-muted-foreground" />}<span className="hidden sm:inline">{slot.locked ? "Locked" : "Unlocked"}</span></Button>
      {onRemove && slot.card && <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 border-l border-border px-0 text-muted-foreground hover:text-destructive" title="Remove player" aria-label={`Remove ${slot.card.name} from ${slot.slot}`} onClick={() => onRemove(slot.slot)}><X className="h-3.5 w-3.5" /></Button>}
    </div>
  </div>;
}

/** What the pointer is over. The remove bar floats over the page, so a position underneath it wins: a move is never turned into a removal. */
const underPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const slots = hits.filter(h => h.id !== REMOVE_ZONE);
  return slots.length ? slots : hits;
};

function RemoveZone() {
  const drop = useDroppable({ id: REMOVE_ZONE });
  // Pinned to the bottom of the screen while a player is dragged, so it is always in reach and nothing on the page moves
  return <div ref={drop.setNodeRef} className={cn("fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-center gap-2 rounded-md border border-dashed border-destructive bg-background/95 px-3 py-4 text-sm font-medium text-destructive shadow-lg", drop.isOver && "bg-destructive text-destructive-foreground")}><Trash2 className="h-4 w-4" aria-hidden />Drop here to remove from the squad</div>;
}

export function FutPitch({ squad, layout, chemistry, evidence, lookup, roles, selected, onSelect, onLock, onMove, onRemove, onDropCard, tray, busy }: PitchProps) {
  const rows = pitchRows(squad, layout);
  const [dragging, setDragging] = useState<PitchDrag | null>(null);
  // A short move before a drag starts keeps a plain click (or tap) for the player picker; touch needs a brief hold so the page can still scroll
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const canDrag = !!onMove && !busy;
  const start = (e: DragStartEvent) => setDragging((e.active.data.current as PitchDrag | undefined) ?? null);
  const end = (e: DragEndEvent) => {
    const d = e.active.data.current as PitchDrag | undefined;
    setDragging(null);
    const over = e.over ? String(e.over.id) : null;
    if (!d || !over) return;
    if (over === REMOVE_ZONE) { if (d.from === "slot") onRemove?.(d.slot); return; }
    const to = over.startsWith("slot:") ? over.slice(5) : null;
    if (!to) return;
    if (d.from === "slot") { if (d.slot !== to) onMove?.(d.slot, to); } else onDropCard?.(d.cardId, to);
  };
  return <DndContext sensors={sensors} collisionDetection={underPointer} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={start} onDragEnd={end} onDragCancel={() => setDragging(null)}>
    <div className="relative isolate min-w-0 overflow-hidden rounded-md border border-primary/30 bg-primary/5 px-2 py-6 sm:px-5">
      <svg className="pointer-events-none absolute inset-0 h-full w-full text-primary/20" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true"><rect x="15" y="15" width="570" height="770" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15 400H585M180 15V130H420V15M180 785V670H420V785M240 15V65H360V15M240 785V735H360V785" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="300" cy="400" r="70" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
      <div className="relative flex min-h-[570px] flex-col justify-between gap-5 sm:min-h-[640px]">{rows.map((row, i) => <div key={i} className="flex justify-evenly gap-1.5 sm:gap-3">{row.map(slot => <PitchSlot key={slot.slot} slot={slot}
        value={chemistry?.chemistry.players.find(player => player.slot === slot.slot)?.chemistry}
        slotRoles={slot.card ? roles?.[slot.slot]?.roles ?? [] : []}
        cardEvidence={slot.card ? evidence?.[slot.card.id] ?? slot.card.evidence : undefined}
        art={slot.card ? { name: slot.card.name, rating: slot.card.rating, position: slot.card.positions[0] ?? slot.position, is_icon: slot.card.is_icon, is_hero: slot.card.is_hero, ...lookup?.get(slot.card.id) } : undefined}
        selected={selected === slot.slot} dragging={dragging} canDrag={canDrag} onSelect={onSelect} onLock={onLock} onRemove={busy ? undefined : onRemove} />)}</div>)}</div>
      <Badge variant="outline" className="relative mt-4">{squad.formation}</Badge>
    </div>
    {dragging?.from === "slot" && onRemove && <RemoveZone />}
    {onMove && <p className="text-xs text-muted-foreground">Drag a player onto another position to move or swap them{tray ? ", drag a club card onto a position to put them in," : ""} and use the × under a player to take them out. On a phone, press and hold a player to drag. Nothing is saved until you press Save.</p>}
    {tray}
    <DragOverlay dropAnimation={null}>{dragging && <div className="pointer-events-none w-20 rotate-3 drop-shadow-xl"><FutCardArt card={dragging.art} title={`${dragging.rating} ${dragging.name}`} className="w-full" /></div>}</DragOverlay>
  </DndContext>;
}
