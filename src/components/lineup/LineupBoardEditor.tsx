import { forwardRef, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Undo2, Redo2, ListPlus, Search, Trash2 } from "lucide-react";
import { LeaderboardPlayer } from "@/types/player";
import { FormationType } from "@/types/formations";
import { FORMATIONS, FORMATION_OPTIONS } from "@/lib/formations";
import { BoardSpot, BoardState, MAX_BENCH, groupByPosition } from "@/lib/lineupBoard";
import { PlayerCardArt } from "@/components/player/PlayerCardArt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface PositionTiers {
  primary: string | null;
  secondary: string[];
  emergency: string[];
}
export type Availability = "yes" | "maybe" | "no";
export type Marker = "card" | "jersey" | "circle";
export type PitchStyle = "classic" | "night" | "chalkboard" | "team";

export interface BoardLook {
  title: string;
  subtitle: string;
  marker: Marker;
  pitch: PitchStyle;
  showRatings: boolean;
  showPositions: boolean;
  textSize: "sm" | "md" | "lg";
  kit: { primary: string; secondary: string; keeper: string };
}

export const DEFAULT_LOOK: BoardLook = {
  title: "",
  subtitle: "",
  marker: "card",
  pitch: "classic",
  showRatings: true,
  showPositions: true,
  textSize: "md",
  kit: { primary: "#b91c3c", secondary: "#f5f0e1", keeper: "#facc15" },
};

const SWATCHES = [
  "#ffffff", "#f5f0e1", "#111111", "#6b7280", "#b91c3c", "#dc2626", "#f97316", "#facc15", "#a3e635", "#16a34a",
  "#0d9488", "#38bdf8", "#2563eb", "#1e3a8a", "#7c3aed", "#f472b6", "#7f1d3a", "#78350f", "#d4af37", "#c0c4cc",
];

// Mowing stripes as one linear-gradient with hard stops (html2canvas can't draw repeating gradients)
const stripes = (a: string, b: string) =>
  `linear-gradient(180deg, ${Array.from({ length: 12 }, (_, i) => `${i % 2 ? b : a} ${(i * 100) / 12}% ${((i + 1) * 100) / 12}%`).join(", ")})`;

const PITCH_BG: Record<PitchStyle, (kit: BoardLook["kit"]) => string> = {
  classic: () => stripes("#5aa64f", "#4f9a45"),
  night: () => stripes("#245a3f", "#1f4d36"),
  chalkboard: () => stripes("#2f4038", "#2b3a33"),
  team: (kit) => stripes(darken(kit.primary, 0.3), darken(kit.primary, 0.4)),
};

// Plain hex maths (no color-mix) so html2canvas can draw it when the graphic is captured
function darken(hex: string, amount: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * (1 - amount)));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const FIT_BORDER: Record<string, string> = {
  primary: "border-emerald-400",
  secondary: "border-amber-300",
  emergency: "border-orange-500",
  none: "border-red-500",
};

export function tierFor(tiers: PositionTiers | undefined, position: string): "primary" | "secondary" | "emergency" | "none" | null {
  if (!tiers) return null;
  if (tiers.primary === position) return "primary";
  if (tiers.secondary.includes(position)) return "secondary";
  if (tiers.emergency.includes(position)) return "emergency";
  return "none";
}

const nameOf = (p?: LeaderboardPlayer) => p?.ea_username || p?.discord_username || "Player";

function Jersey({ main, trim, label, className }: { main: string; trim: string; label: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M30 4 L12 12 L0 34 L14 44 L22 36 L22 100 L78 100 L78 36 L86 44 L100 34 L88 12 L70 4 Q50 18 30 4 Z" fill={main} stroke="rgba(0,0,0,0.45)" strokeWidth="2.5" />
      <path d="M30 4 Q50 18 70 4" fill="none" stroke={trim} strokeWidth="5" />
      <text x="50" y="72" textAnchor="middle" fontFamily="Oswald, Impact, sans-serif" fontWeight="700" fontSize="34" fill={trim}>{label}</text>
    </svg>
  );
}

interface MarkerProps {
  player: LeaderboardPlayer;
  position?: string;
  look: BoardLook;
  rating?: number | null;
  fit?: string | null;
  size?: "pitch" | "bench" | "overlay";
  held?: boolean;
}

// One player on the board: their saved player card (or a kit jersey / circle), name tag, position chip
function PlayerMarker({ player, position, look, rating, fit, size = "pitch", held }: MarkerProps) {
  const name = nameOf(player);
  const isKeeper = position === "GK";
  const main = isKeeper ? look.kit.keeper : look.kit.primary;
  const trim = isKeeper ? "#111111" : look.kit.secondary;
  const shown = rating ?? player.overall_rating;
  const label = look.showRatings && shown ? String(Math.round(shown)) : name.slice(0, 2).toUpperCase();
  const box = size === "bench" ? "w-10 sm:w-12" : "w-10 sm:w-16";
  const jersey = <Jersey main={main} trim={trim} label={label} className={cn(box, "aspect-square drop-shadow")} />;
  const text = { sm: "text-[9px] sm:text-[10px]", md: "text-[10px] sm:text-xs", lg: "text-xs sm:text-sm" }[look.textSize];
  return (
    <div className={cn("relative flex flex-col items-center", held && "scale-110")}>
      {look.showPositions && position && position !== "SUB" && (
        <span className="absolute -left-2 -top-2 z-10 rounded px-1 text-[9px] font-bold leading-4 shadow" style={{ background: main, color: trim }}>
          {position}
        </span>
      )}
      {/* data-fit outlines are an editing aid; the captured graphic hides them */}
      <div data-fit={fit || undefined} className={cn("rounded-md border-2 border-transparent p-px", fit && FIT_BORDER[fit], held && "border-white")}>
        {look.marker === "card" ? (
          <PlayerCardArt discordUserId={player.discord_user_id} name={name} className={cn(box, "border-0 bg-transparent shadow-lg")} fallback={jersey} />
        ) : look.marker === "jersey" ? (
          jersey
        ) : (
          <div className={cn(box, "flex aspect-square items-center justify-center rounded-full border-2 font-bold shadow-lg")} style={{ background: main, color: trim, borderColor: trim }}>
            {label}
          </div>
        )}
      </div>
      <span className={cn("mt-0.5 whitespace-nowrap rounded bg-black/85 px-1.5 pb-1 pt-0.5 font-bold uppercase leading-tight tracking-wide text-white", text)}>
        {name.length > 14 ? `${name.slice(0, 13)}…` : name}
      </span>
    </div>
  );
}

function Draggable({ id, children, onClick, className }: { id: string; children: ReactNode; onClick?: () => void; className?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `player:${id}`, data: { playerId: id } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={(e) => { e.stopPropagation(); onClick?.(); }} className={cn("cursor-grab touch-none select-none active:cursor-grabbing", isDragging && "opacity-30", className)}>
      {children}
    </div>
  );
}

function Drop({ id, children, className, style, onClick }: { id: string; children?: ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={style} onClick={onClick} className={cn(className, isOver && "ring-2 ring-white/90 ring-offset-2 ring-offset-transparent rounded-lg")}>
      {children}
    </div>
  );
}

// The innermost target under the pointer wins, so dropping on a bench player swaps with them
// rather than just joining the bench around them
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (!hits.length) return rectIntersection(args);
  const area = (id: string | number) => {
    const r = args.droppableRects.get(id);
    return r ? r.width * r.height : Infinity;
  };
  return [...hits].sort((a, b) => area(a.id) - area(b.id));
};

function spotFromDropId(id: string): BoardSpot | null {
  if (id === "pool") return { zone: "pool" };
  if (id === "bench:end") return { zone: "bench" };
  const [zone, raw] = id.split(":");
  if (zone === "slot") return { zone: "pitch", index: Number(raw) };
  if (zone === "bench") return { zone: "bench", index: Number(raw) };
  return null;
}

interface LineupBoardEditorProps {
  board: BoardState;
  formation: FormationType;
  players: LeaderboardPlayer[];
  look: BoardLook;
  onLook: (look: BoardLook) => void;
  onMove: (playerId: string, to: BoardSpot) => void;
  onFormation: (formation: FormationType) => void;
  onPasteNames: (text: string) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  positionRating?: (playerId: string, position: string) => number | null;
  tiers?: Map<string, PositionTiers>;
  availability?: Map<string, Availability>;
  toolbar?: ReactNode; // fill buttons
  actions?: ReactNode; // save / post / download
  status?: ReactNode;
}

// The lineup11-style editor: a pitch with player cards you drag between spots, a bench strip,
// and the squad list to drag from; Options / Kits / Image tabs style the graphic that gets posted.
export const LineupBoardEditor = forwardRef<HTMLDivElement, LineupBoardEditorProps>(function LineupBoardEditor(props, graphicRef) {
  const { board, formation, players, look, onLook, onMove, tiers, availability, positionRating } = props;
  const positions = FORMATIONS[formation];
  const byId = useMemo(() => new Map(players.map((p) => [p.discord_user_id, p])), [players]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [held, setHeld] = useState<{ player?: string; slot?: number } | null>(null);
  const [search, setSearch] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onSheet = useMemo(() => new Set([...board.starters.filter(Boolean), ...board.bench] as string[]), [board]);
  // Squad list grouped by primary (comp) position, best rated first; players who are out sink to the bottom of their group
  const pool = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = players
      .filter((p) => !onSheet.has(p.discord_user_id))
      .filter((p) => !q || [p.ea_username, p.discord_username, p.primary_position, tiers?.get(p.discord_user_id)?.primary].some((v) => v?.toLowerCase().includes(q)))
      .map((p) => ({
        ...p,
        id: p.discord_user_id,
        position: (tiers?.get(p.discord_user_id)?.primary || p.primary_position || "").toUpperCase() || null,
        rating: Number(p.overall_rating) || 0,
        out: availability?.get(p.discord_user_id) === "no",
      }));
    return groupByPosition(rows);
  }, [players, onSheet, search, availability, tiers]);

  const update = (patch: Partial<BoardLook>) => onLook({ ...look, ...patch });

  const handleDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as { playerId: string }).playerId);
    setHeld(null);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const id = (e.active.data.current as { playerId: string })?.playerId;
    const spot = e.over ? spotFromDropId(String(e.over.id)) : null;
    if (id && spot) onMove(id, spot);
  };

  // Tap to move works too (phones, or anyone who prefers it): tap a player, then where they go.
  const tapPlayer = (id: string) => {
    if (held?.slot !== undefined) {
      onMove(id, { zone: "pitch", index: held.slot });
      setHeld(null);
    } else if (held?.player && held.player !== id) {
      const target = board.starters.indexOf(id);
      const bench = board.bench.indexOf(id);
      if (target >= 0) onMove(held.player, { zone: "pitch", index: target });
      else if (bench >= 0) onMove(held.player, { zone: "bench", index: bench });
      setHeld(null);
    } else setHeld(held?.player === id ? null : { player: id });
  };
  const tapSlot = (index: number) => {
    if (held?.player) {
      onMove(held.player, { zone: "pitch", index });
      setHeld(null);
    } else setHeld(held?.slot === index ? null : { slot: index });
  };
  const tapZone = (spot: BoardSpot) => {
    if (held?.player) onMove(held.player, spot);
    setHeld(null);
  };

  const fitAt = (id: string, position: string) => tierFor(tiers?.get(id), position);
  const filled = board.starters.filter(Boolean).length;
  const dragPlayer = dragging ? byId.get(dragging) : undefined;
  const hint = held?.player
    ? `Tap a spot, the bench or the squad list to move ${nameOf(byId.get(held.player))}.`
    : held?.slot !== undefined
      ? `Tap a player to put them at ${positions[held.slot].position}.`
      : "Drag player cards onto the pitch or bench. Drop on a teammate to swap.";

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* The graphic: everything inside graphicRef is what Download and Post to Discord capture */}
        <div className="space-y-2">
          {props.toolbar && <div className="flex flex-wrap items-center gap-2">{props.toolbar}</div>}
          <div ref={graphicRef} className="mx-auto w-full max-w-[600px] rounded-2xl bg-[#0f2a1a] p-3 sm:p-4" style={{ background: look.pitch === "night" ? "#06130c" : look.pitch === "chalkboard" ? "#141c18" : "#0f2a1a" }}>
            <div className="mb-2 px-1">
              <p className="break-words pb-1 font-['Oswald',sans-serif] text-xl font-bold uppercase leading-snug tracking-wide text-white sm:text-2xl">{look.title || "Starting XI"}</p>
              <p className="break-words pb-0.5 text-xs leading-snug text-white/70 sm:text-sm">{[formation, look.subtitle].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl" style={{ background: PITCH_BG[look.pitch](look.kit) }}>
              {/* Pitch markings */}
              <div className="pointer-events-none absolute inset-[3%] border-2 border-white/70" />
              <div className="pointer-events-none absolute left-[3%] right-[3%] top-1/2 h-0.5 bg-white/70" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[18%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" />
              <div className="pointer-events-none absolute left-1/2 top-[3%] h-[14%] w-[44%] -translate-x-1/2 border-2 border-t-0 border-white/70" />
              <div className="pointer-events-none absolute left-1/2 top-[3%] h-[5%] w-[20%] -translate-x-1/2 border-2 border-t-0 border-white/70" />
              <div className="pointer-events-none absolute bottom-[3%] left-1/2 h-[14%] w-[44%] -translate-x-1/2 border-2 border-b-0 border-white/70" />
              <div className="pointer-events-none absolute bottom-[3%] left-1/2 h-[5%] w-[20%] -translate-x-1/2 border-2 border-b-0 border-white/70" />

              {positions.map((pos, index) => {
                const id = board.starters[index];
                const player = id ? byId.get(id) : undefined;
                return (
                  <Drop
                    key={index}
                    id={`slot:${index}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    {player ? (
                      <Draggable id={player.discord_user_id} onClick={() => tapPlayer(player.discord_user_id)}>
                        <PlayerMarker
                          player={player}
                          position={pos.position}
                          look={look}
                          rating={positionRating?.(player.discord_user_id, pos.position)}
                          fit={fitAt(player.discord_user_id, pos.position)}
                          held={held?.player === player.discord_user_id}
                        />
                      </Draggable>
                    ) : (
                      <button
                        type="button"
                        onClick={() => tapSlot(index)}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-white/70 bg-white/10 text-[11px] font-bold text-white sm:h-14 sm:w-14 sm:text-xs",
                          held?.slot === index && "border-solid bg-white/30",
                        )}
                      >
                        {pos.position}
                      </button>
                    )}
                  </Drop>
                );
              })}
            </div>

            {/* Bench */}
            <Drop id="bench:end" onClick={() => held?.player && tapZone({ zone: "bench" })} className="mt-3 rounded-xl bg-black/35 p-2">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="font-['Oswald',sans-serif] text-sm font-bold uppercase tracking-[0.2em] text-white">Bench</span>
                <span className="text-[11px] text-white/60">{board.bench.length}/{MAX_BENCH}</span>
              </div>
              <div className="flex min-h-[72px] flex-wrap items-start justify-center gap-2 sm:gap-3">
                {board.bench.map((id, k) => {
                  const player = byId.get(id);
                  if (!player) return null;
                  return (
                    <Drop key={id} id={`bench:${k}`}>
                      <Draggable id={id} onClick={() => tapPlayer(id)}>
                        <PlayerMarker player={player} position="SUB" look={look} size="bench" held={held?.player === id} />
                      </Draggable>
                    </Drop>
                  );
                })}
                {board.bench.length === 0 && <p className="self-center text-xs text-white/60">Drag subs here</p>}
              </div>
            </Drop>
          </div>
          <p className="text-center text-xs text-muted-foreground">{hint}</p>
        </div>

        {/* Side panel, as on lineup11: undo/redo, paste names, then tabs */}
        <div className="rounded-2xl border bg-card p-3 shadow-sm lg:sticky lg:top-20">
          <div className="mb-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={props.onUndo} disabled={!props.canUndo} title="Undo"><Undo2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={props.onRedo} disabled={!props.canRedo} title="Redo"><Redo2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={props.onClear} disabled={!onSheet.size} title="Clear the board"><Trash2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPasteOpen(true)}><ListPlus className="mr-1.5 h-4 w-4" />Paste names</Button>
          </div>

          <Tabs defaultValue="squad">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="squad">Squad</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
              <TabsTrigger value="kits">Kits</TabsTrigger>
              <TabsTrigger value="image">Image</TabsTrigger>
            </TabsList>

            <TabsContent value="squad" className="mt-3">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search players or positions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Drop id="pool" onClick={() => held?.player && onSheet.has(held.player) && tapZone({ zone: "pool" })} className="rounded-lg">
                <ScrollArea className="h-[380px] pr-2 lg:h-[calc(100vh-24rem)]">
                  <div className="space-y-1.5">
                    {pool.map((group) => (
                      <div key={group.position} className="space-y-1.5">
                        <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>{group.position === "Any" ? "No position set" : group.position}</span>
                          <span>{group.players.length}</span>
                        </div>
                        {group.players.map((p) => {
                          const t = tiers?.get(p.discord_user_id);
                          const answer = availability?.get(p.discord_user_id);
                          return (
                            <Draggable key={p.discord_user_id} id={p.discord_user_id} onClick={() => tapPlayer(p.discord_user_id)}>
                              <div className={cn("flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-muted/60", held?.player === p.discord_user_id && "border-primary bg-primary/10", answer === "no" && "opacity-60")}>
                                <PlayerCardArt discordUserId={p.discord_user_id} name={nameOf(p)} className="w-8 shrink-0" fallback={<Jersey main={look.kit.primary} trim={look.kit.secondary} label={String(Math.round(p.overall_rating))} className="w-8" />} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">
                                    {p.position && <span className="mr-1.5 rounded bg-muted px-1 py-px text-[10px] font-bold text-muted-foreground">{p.position}</span>}
                                    {nameOf(p)}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {(t && [t.secondary.length ? `Also ${t.secondary.join("/")}` : "", t.emergency.length ? `emerg. ${t.emergency.join("/")}` : ""].filter(Boolean).join(" · ")) ||
                                      (p.position ? `${p.position} only` : "Any position")}
                                  </p>
                                </div>
                                {answer && <Badge variant={answer === "yes" ? "default" : "secondary"} className="shrink-0 text-[10px]">{answer === "yes" ? "Available" : answer === "maybe" ? "Maybe" : "Out"}</Badge>}
                                <span className="w-7 shrink-0 text-right text-sm font-bold">{Math.round(p.overall_rating)}</span>
                              </div>
                            </Draggable>
                          );
                        })}
                      </div>
                    ))}
                    {pool.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Everyone is on the sheet.</p>}
                  </div>
                </ScrollArea>
              </Drop>
              {tiers && tiers.size > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">Card outline: <span className="text-emerald-500">comp position</span> · <span className="text-amber-500">plays it well</span> · <span className="text-orange-500">emergency</span> · <span className="text-red-500">not their position</span></p>
              )}
            </TabsContent>

            <TabsContent value="options" className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={look.title} placeholder="Starting XI" maxLength={60} onChange={(e) => update({ title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Subtitle</Label>
                <Input value={look.subtitle} placeholder="Opponent, cup round, kick-off..." maxLength={60} onChange={(e) => update({ subtitle: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Formation</Label>
                <Select value={formation} onValueChange={(v) => props.onFormation(v as FormationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMATION_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Player marker</Label>
                <ToggleGroup type="single" value={look.marker} onValueChange={(v) => v && update({ marker: v as Marker })} className="grid grid-cols-3">
                  <ToggleGroupItem value="card">Card</ToggleGroupItem>
                  <ToggleGroupItem value="jersey">Jersey</ToggleGroupItem>
                  <ToggleGroupItem value="circle">Circle</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-[11px] text-muted-foreground">Card shows each player's latest saved player card; anyone without one gets a jersey.</p>
              </div>
              <div className="flex items-center justify-between"><Label htmlFor="lb-ratings">Show ratings</Label><Switch id="lb-ratings" checked={look.showRatings} onCheckedChange={(v) => update({ showRatings: v })} /></div>
              <div className="flex items-center justify-between"><Label htmlFor="lb-positions">Show positions</Label><Switch id="lb-positions" checked={look.showPositions} onCheckedChange={(v) => update({ showPositions: v })} /></div>
              <div className="space-y-1.5">
                <Label>Text size</Label>
                <ToggleGroup type="single" value={look.textSize} onValueChange={(v) => v && update({ textSize: v as BoardLook["textSize"] })} className="grid grid-cols-3">
                  <ToggleGroupItem value="sm">Small</ToggleGroupItem>
                  <ToggleGroupItem value="md">Medium</ToggleGroupItem>
                  <ToggleGroupItem value="lg">Large</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </TabsContent>

            <TabsContent value="kits" className="mt-3 space-y-4">
              {([
                ["primary", "Main colour"],
                ["secondary", "Second colour"],
                ["keeper", "Goalkeeper"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <div className="grid grid-cols-10 gap-1.5">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`${label} ${c}`}
                        onClick={() => update({ kit: { ...look.kit, [key]: c } })}
                        className={cn("aspect-square rounded-full border", look.kit[key] === c && "ring-2 ring-primary ring-offset-2")}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-center gap-4 pt-1">
                <Jersey main={look.kit.primary} trim={look.kit.secondary} label="10" className="w-14" />
                <Jersey main={look.kit.keeper} trim="#111111" label="1" className="w-14" />
              </div>
            </TabsContent>

            <TabsContent value="image" className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <Label>Pitch style</Label>
                <ToggleGroup type="single" value={look.pitch} onValueChange={(v) => v && update({ pitch: v as PitchStyle })} className="grid grid-cols-2 gap-2">
                  {(["classic", "night", "chalkboard", "team"] as PitchStyle[]).map((p) => (
                    <ToggleGroupItem key={p} value={p} className="h-14 flex-col gap-1 border">
                      <span className="h-4 w-10 rounded" style={{ background: PITCH_BG[p](look.kit) }} />
                      <span className="text-xs capitalize">{p === "team" ? "Team colours" : p}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <p className="text-[11px] text-muted-foreground">Download and Post to Discord use exactly what you see on the left: title, pitch, cards and bench.</p>
            </TabsContent>
          </Tabs>

          <div className="mt-3 border-t pt-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span><strong className="text-foreground">{filled}/{positions.length}</strong> starters · <strong className="text-foreground">{board.bench.length}</strong> subs</span>
              {props.status}
            </div>
            <div className="grid grid-cols-3 gap-2">{props.actions}</div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragPlayer ? <PlayerMarker player={dragPlayer} look={look} size="overlay" /> : null}
      </DragOverlay>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste names</DialogTitle>
            <DialogDescription>One player per line, goalkeeper first, in formation order. The first {positions.length} start and the rest go on the bench. A shirt number at the start of a line is ignored. EA or Discord names both work.</DialogDescription>
          </DialogHeader>
          <Textarea rows={12} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"1 Keeper\n2 Left back\n..."} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button>
            <Button onClick={() => { props.onPasteNames(pasteText); setPasteOpen(false); }} disabled={!pasteText.trim()}>Apply names</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
});
