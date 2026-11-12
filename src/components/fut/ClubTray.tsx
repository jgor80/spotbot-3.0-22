import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDraggable } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { futApi, futKeys, type FutCard, type FutSquad } from "@/lib/futApi";
import { cn } from "@/lib/utils";
import { ErrorNotice } from "./FutShared";
import { FutCardArt } from "./FutCardArt";
import type { PitchDrag } from "./FutPitch";

const POSITIONS = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST"];
const norm = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function TrayCard({ card, disabled }: { card: FutCard; disabled: boolean }) {
  const art = { name: card.player_name, rating: card.overall, position: card.positions[0], version: card.version, is_icon: card.is_icon, is_hero: card.is_hero, ea_item_id: card.ea_item_id };
  const drag = useDraggable({ id: `card:${card.id}`, disabled, data: { from: "club", cardId: card.id, name: card.player_name, rating: card.overall, positions: card.positions, art } satisfies PitchDrag });
  return <li ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} role="listitem" tabIndex={-1} aria-label={`${card.overall} ${card.player_name}, ${card.positions.join(", ")}. Drag onto a position`}
    className={cn("w-[72px] shrink-0 cursor-grab touch-manipulation select-none space-y-1 text-center active:cursor-grabbing", drag.isDragging && "opacity-40")}>
    <FutCardArt card={art} title={`${card.overall} ${card.player_name}`} className="w-full" />
    <p className="truncate text-[10px] font-medium leading-tight">{card.player_name}</p>
    <p className="truncate text-[10px] leading-tight text-muted-foreground">{card.positions.join(" · ")}</p>
  </li>;
}

/** Club cards that aren't in the squad, to drag onto a position. Lives under the pitch, inside its drag area. */
export function ClubTray({ squad, disabled }: { squad: FutSquad; disabled: boolean }) {
  const [q, setQ] = useState("");
  const [position, setPosition] = useState<string | null>(null);
  const filters = { owned: "true", limit: "100", ...(q.trim() ? { q: q.trim() } : {}), ...(position ? { position } : {}) };
  const cards = useQuery({ queryKey: [...futKeys.cards, "tray", filters], queryFn: () => futApi.cards(filters), placeholderData: keepPreviousData });
  const used = new Set(squad.slots.flatMap(s => s.card ? [s.card.id] : [])), names = new Set(squad.slots.flatMap(s => s.card ? [norm(s.card.name)] : []));
  // A player can only be in the squad once, whichever version
  const list = (cards.data ?? []).filter(c => !used.has(c.id) && !names.has(norm(c.player_name))).sort((a, b) => b.overall - a.overall);
  return <section className="z-10 space-y-2 rounded-md border border-border bg-card p-3 sm:sticky sm:bottom-2 sm:shadow-lg" aria-label="Your club">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[10rem] flex-1 space-y-1"><Label htmlFor="tray-search">Your club <span className="font-normal text-muted-foreground">(drag a card onto a position)</span></Label><Input id="tray-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your club" className="h-8" /></div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by position">{POSITIONS.map(p => <button key={p} type="button" aria-pressed={position === p} onClick={() => setPosition(position === p ? null : p)}
        className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", position === p ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{p}</button>)}</div>
    </div>
    <ErrorNotice error={cards.error} />
    {cards.isPending ? <p className="py-4 text-sm text-muted-foreground">Loading your club…</p>
      : list.length ? <ul className={cn("flex gap-2 overflow-x-auto pb-2", cards.isPlaceholderData && "opacity-60")}>{list.map(c => <TrayCard key={c.id} card={c} disabled={disabled} />)}</ul>
      : <p className="py-4 text-sm text-muted-foreground">{q.trim() || position ? "No club cards match that." : cards.data?.length ? "Every club card is already in the squad." : "No club cards yet. Sync your club or add cards on My cards."}</p>}
  </section>;
}
