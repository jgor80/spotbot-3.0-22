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
import { Undo2, Redo2, ListPlus, Search, Trash2, Zap } from "lucide-react";
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
import type { ClubTheme } from "@/hooks/useClubTheme";

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
const stripes = (a: string, b: string, count = 12) =>
  `linear-gradient(180deg, ${Array.from({ length: count }, (_, i) => `${i % 2 ? b : a} ${(i * 100) / count}% ${((i + 1) * 100) / count}%`).join(", ")})`;

// Plain hex maths (no color-mix) so html2canvas can draw it when the graphic is captured
function rgbOf(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number) {
  const x = rgbOf(a), y = rgbOf(b);
  if (!x || !y) return a;
  return `#${x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, "0")).join("")}`;
}
function darken(hex: string, amount: number) {
  return mix(hex, "#000000", amount);
}
function alpha(hex: string, a: number) {
  const c = rgbOf(hex);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})` : hex;
}
// Black or white text on a colour
function ink(hex: string) {
  const c = rgbOf(hex);
  return c && 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 160 ? "#111111" : "#ffffff";
}
// "H S% L%" for overriding the shadcn --primary variable with a club colour
function hslVar(hex: string) {
  const c = rgbOf(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `${Math.round(((h * 60) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const PITCH_BG: Record<PitchStyle, (kit: BoardLook["kit"]) => string> = {
  classic: () => stripes("#4f9d4a", "#468f42"),
  night: () => stripes("#1f4f37", "#1b4630"),
  chalkboard: () => stripes("#2f4038", "#2b3a33"),
  // A deep pitch in the club's main colour, so the graphic itself carries the team
  team: (kit) => stripes(mix(kit.primary, "#0a0d10", 0.5), mix(kit.primary, "#0a0d10", 0.58)),
};
const PITCH_LINES: Record<PitchStyle, (kit: BoardLook["kit"]) => string> = {
  classic: () => "rgba(255, 255, 255, 0.75)",
  night: () => "rgba(255, 255, 255, 0.6)",
  chalkboard: () => "rgba(255, 255, 255, 0.55)",
  // Lines in the second colour, or white when that is too dark to see on the pitch
  team: (kit) => (ink(kit.secondary) === "#ffffff" ? "rgba(255, 255, 255, 0.55)" : alpha(kit.secondary, 0.75)),
};

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

// One player on the board: their saved player card (or a kit jersey / circle) over a club-coloured
// name plate, with a position tag in the second colour
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
  const plateBg = look.kit.primary;
  const tagBg = look.kit.secondary;
  return (
    <div className={cn("relative flex flex-col items-center", held && "scale-110")}>
      {look.showPositions && position && position !== "SUB" && (
        <span
          className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-1.5 text-[9px] font-black leading-4 tracking-wider shadow-md"
          style={{ background: isKeeper ? look.kit.keeper : tagBg, color: ink(isKeeper ? look.kit.keeper : tagBg), border: `1px solid ${alpha(plateBg, 0.6)}` }}
        >
          {position}
        </span>
      )}
      {/* data-fit outlines are an editing aid; the captured graphic hides them */}
      <div data-fit={fit || undefined} className={cn("rounded-lg border-2 border-transparent p-px", fit && FIT_BORDER[fit], held && "border-white")}>
        {look.marker === "card" ? (
          <PlayerCardArt discordUserId={player.discord_user_id} name={name} className={cn(box, "border-0 bg-transparent shadow-lg")} fallback={jersey} />
        ) : look.marker === "jersey" ? (
          jersey
        ) : (
          <div
            className={cn(box, "flex aspect-square items-center justify-center rounded-full border-[3px] font-display text-base font-bold shadow-lg sm:text-xl")}
            style={{ background: `linear-gradient(160deg, ${main} 0%, ${darken(main, 0.35)} 100%)`, color: trim, borderColor: trim }}
          >
            {label}
          </div>
        )}
      </div>
      <div className={cn("-mt-1 flex", text)}>
        <span
          className="whitespace-nowrap rounded-md px-1.5 pb-1.5 pt-0.5 font-bold uppercase leading-tight tracking-wide"
          style={{ background: plateBg, color: ink(plateBg), borderTop: `2px solid ${tagBg}`, boxShadow: `0 2px 8px ${alpha("#000000", 0.45)}` }}
        >
          {name.length > 14 ? `${name.slice(0, 13)}…` : name}
        </span>
      </div>
    </div>
  );
}

// The club crest, or a shield in the club's colours with its initials when there isn't one
function Crest({ url, name, primary, secondary, className }: { url?: string | null; name: string; primary: string; secondary: string; className?: string }) {
  if (url) return <img src={url} alt={`${name} crest`} className={cn("object-contain drop-shadow", className)} />;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "GB";
  return (
    <svg viewBox="0 0 100 116" className={className} aria-hidden>
      <path d="M50 3 L95 17 L95 58 Q95 95 50 113 Q5 95 5 58 L5 17 Z" fill={primary} stroke={secondary} strokeWidth="6" />
      <path d="M50 14 L84 25 L84 58 Q84 86 50 101" fill="none" stroke={alpha(secondary, 0.35)} strokeWidth="4" />
      <text x="50" y="72" textAnchor="middle" fontFamily="Oswald, Impact, sans-serif" fontWeight="700" fontSize="38" fill={secondary}>{initials}</text>
    </svg>
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

// The GafferBot mark from the site header (plain hex so html2canvas draws it in the graphic)
function GafferMark({ className, icon }: { className?: string; icon?: string }) {
  return (
    <span className={cn("flex items-center justify-center rounded-md shadow-sm", className)} style={{ background: "linear-gradient(135deg, #22c55e 0%, #0f9d6b 100%)" }}>
      <Zap className={icon} color="#06130c" fill="#06130c" />
    </span>
  );
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
  theme?: ClubTheme | null; // the club's team colours and crest from /setup
  squad?: ReactNode; // squad picker: saving and posting need one
  clubName?: string;
}

// The lineup editor: a club-coloured header with the sheet's stats and actions, the squad rail to drag
// from, the matchday graphic (pitch with player cards, bench) in the middle, and a style panel.
// Everything picks up the club's team colours: the page chrome from /setup, the graphic from the kit.
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

  const kit = look.kit;
  // Page chrome follows the club's team colours, or the kit picked here for clubs without any
  const chrome = props.theme ? { primary: props.theme.primary, secondary: props.theme.secondary } : { primary: kit.primary, secondary: kit.secondary };
  const crestUrl = props.theme?.crest || null;
  const club = props.clubName || props.theme?.name || "Your club";
  const starterRatings = board.starters.flatMap((id, i) => {
    const p = id ? byId.get(id) : undefined;
    const r = p ? positionRating?.(p.discord_user_id, positions[i].position) ?? p.overall_rating : null;
    return r ? [Number(r)] : [];
  });
  const avg = starterRatings.length ? Math.round(starterRatings.reduce((a, b) => a + b, 0) / starterRatings.length) : null;
  // Inside the editor, shadcn buttons, tabs, switches and focus rings take the club's main colour
  const primaryVar = hslVar(chrome.primary);
  const vars = (primaryVar
    ? { "--primary": primaryVar, "--primary-foreground": ink(chrome.primary) === "#ffffff" ? "0 0% 100%" : "0 0% 7%", "--ring": primaryVar }
    : {}) as React.CSSProperties;
  const lines = PITCH_LINES[look.pitch](kit);
  const frameDark = look.pitch === "night" ? "#04080a" : look.pitch === "chalkboard" ? "#0c1110" : "#06090c";
  const AVAIL_BAR: Record<Availability, string> = { yes: "#22c55e", maybe: "#f59e0b", no: "#ef4444" };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="dark space-y-4 rounded-3xl bg-background p-2 text-foreground sm:p-3" style={vars}>
        {/* Club header: crest, sheet stats, history and the save / post / image actions */}
        <div
          className="relative overflow-hidden rounded-2xl text-white shadow-lg"
          style={{ background: `linear-gradient(115deg, ${chrome.primary} 0%, ${mix(chrome.primary, "#0a0d12", 0.55)} 38%, #0a0d12 78%)` }}
        >
          <div className="pointer-events-none absolute -right-10 top-0 hidden h-full w-40 -skew-x-[20deg] opacity-80 md:block" style={{ background: chrome.secondary }} />
          <div className="pointer-events-none absolute right-24 top-0 hidden h-full w-6 -skew-x-[20deg] opacity-60 md:block" style={{ background: chrome.primary }} />
          <div className="relative flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <Crest url={crestUrl} name={club} primary={chrome.primary} secondary={chrome.secondary} className="h-14 w-12 shrink-0 sm:h-16 sm:w-14" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/75">
                  <GafferMark className="h-4 w-4 rounded" icon="h-2.5 w-2.5" />GafferBot · Lineup Builder
                </p>
                <p className="truncate font-display text-2xl font-bold uppercase italic leading-tight tracking-wide">{club}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-full bg-white/15 px-2 py-0.5">XI {filled}/{positions.length}</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5">Bench {board.bench.length}/{MAX_BENCH}</span>
                  {avg !== null && <span className="rounded-full px-2 py-0.5" style={{ background: chrome.secondary, color: ink(chrome.secondary) }}>AVG {avg}</span>}
                  <span className="text-white/80">{props.status}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
              {props.squad && <div className="w-44">{props.squad}</div>}
              <div className="w-40">
                <Select value={formation} onValueChange={(v) => props.onFormation(v as FormationType)}>
                  <SelectTrigger aria-label="Formation" className="h-9 border-white/25 bg-black/30 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMATION_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center rounded-lg bg-black/30 p-0.5">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white" onClick={props.onUndo} disabled={!props.canUndo} title="Undo"><Undo2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white" onClick={props.onRedo} disabled={!props.canRedo} title="Redo"><Redo2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white" onClick={props.onClear} disabled={!onSheet.size} title="Clear the board"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-foreground [&_button]:h-9">{props.actions}</div>
            </div>
          </div>
          <div className="h-1" style={{ background: `linear-gradient(90deg, ${chrome.secondary}, ${chrome.primary})` }} />
        </div>
        {props.toolbar && <div className="flex flex-wrap items-center gap-2">{props.toolbar}</div>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_260px] lg:items-start">
          {/* The graphic: everything inside graphicRef is what Download and Post to Discord capture */}
          <div className="space-y-2 lg:col-start-2 lg:row-start-1">
            <div
              ref={graphicRef}
              className="relative mx-auto w-full max-w-[620px] overflow-hidden rounded-[22px] p-3 sm:p-4"
              style={{ background: `linear-gradient(160deg, ${mix(kit.primary, frameDark, 0.3)} 0%, ${mix(kit.primary, frameDark, 0.72)} 42%, ${frameDark} 100%)` }}
            >
              {/* Diagonal kit bands behind the header */}
              <div className="pointer-events-none absolute -right-8 -top-6 h-36 w-24 rotate-[25deg]" style={{ background: kit.secondary, opacity: 0.85 }} />
              <div className="pointer-events-none absolute right-16 -top-6 h-36 w-5 rotate-[25deg]" style={{ background: kit.secondary, opacity: 0.45 }} />

              <div className="relative mb-3 flex items-center gap-3 px-1">
                <Crest url={crestUrl} name={club} primary={kit.primary} secondary={kit.secondary} className="h-12 w-11 shrink-0 sm:h-14 sm:w-12" />
                <div className="min-w-0 flex-1">
                  <p className="break-words pb-1 font-display text-xl font-bold uppercase italic leading-snug tracking-wide text-white sm:text-2xl">{look.title || "Starting XI"}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                    <span className="rounded px-1.5 pb-1 pt-0.5 text-[10px] font-black leading-tight tracking-wider sm:text-[11px]" style={{ background: kit.secondary, color: ink(kit.secondary) }}>{formation}</span>
                    {look.subtitle && <span className="break-words text-xs leading-snug text-white/80 sm:text-sm">{look.subtitle}</span>}
                  </div>
                </div>
                {avg !== null && look.showRatings && (
                  <div className="relative mr-8 hidden shrink-0 flex-col items-center rounded-lg px-2.5 py-1 sm:flex" style={{ background: alpha("#000000", 0.4), border: `1px solid ${alpha(kit.secondary, 0.6)}` }}>
                    <span className="font-display text-2xl font-bold leading-none text-white">{avg}</span>
                    <span className="pb-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/70">Avg</span>
                  </div>
                )}
              </div>

              <div
                className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl"
                style={{ background: PITCH_BG[look.pitch](kit), border: `3px solid ${alpha(kit.secondary, 0.85)}`, boxShadow: `0 10px 30px ${alpha("#000000", 0.45)}` }}
              >
                {/* Shade at both ends so the cards pop */}
                <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, ${alpha("#000000", 0.28)} 0%, ${alpha("#000000", 0)} 22%, ${alpha("#000000", 0)} 78%, ${alpha("#000000", 0.3)} 100%)` }} />
                {/* Crest watermark on the centre spot */}
                {crestUrl && <img src={crestUrl} alt="" className="pointer-events-none absolute left-1/2 top-1/2 w-[34%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.13]" />}
                {/* Pitch markings */}
                <div className="pointer-events-none absolute inset-[3%] rounded-md border-2" style={{ borderColor: lines }} />
                <div className="pointer-events-none absolute left-[3%] right-[3%] top-1/2 h-0.5" style={{ background: lines }} />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[18%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: lines }} />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: lines }} />
                <div className="pointer-events-none absolute left-1/2 top-[3%] h-[14%] w-[44%] -translate-x-1/2 border-2 border-t-0" style={{ borderColor: lines }} />
                <div className="pointer-events-none absolute left-1/2 top-[3%] h-[5%] w-[20%] -translate-x-1/2 border-2 border-t-0" style={{ borderColor: lines }} />
                <div className="pointer-events-none absolute bottom-[3%] left-1/2 h-[14%] w-[44%] -translate-x-1/2 border-2 border-b-0" style={{ borderColor: lines }} />
                <div className="pointer-events-none absolute bottom-[3%] left-1/2 h-[5%] w-[20%] -translate-x-1/2 border-2 border-b-0" style={{ borderColor: lines }} />

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
                            "flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed text-[11px] font-black tracking-wider sm:h-14 sm:w-14 sm:text-xs",
                            held?.slot === index && "border-solid",
                          )}
                          style={{ borderColor: alpha(kit.secondary, 0.9), background: alpha(kit.primary, held?.slot === index ? 0.75 : 0.35), color: "#ffffff" }}
                        >
                          {pos.position}
                        </button>
                      )}
                    </Drop>
                  );
                })}
              </div>

              {/* Bench */}
              <Drop
                id="bench:end"
                onClick={() => held?.player && tapZone({ zone: "bench" })}
                className="relative mt-3 flex rounded-xl"
                style={{ background: alpha("#000000", 0.38), borderTop: `3px solid ${kit.secondary}` }}
              >
                <div className="flex w-9 shrink-0 flex-col items-center justify-center gap-1 rounded-bl-xl py-2" style={{ background: kit.primary, color: ink(kit.primary) }}>
                  <span className="flex flex-col items-center font-display text-[11px] font-bold leading-[1.15]">{"SUBS".split("").map((c, i) => <span key={i}>{c}</span>)}</span>
                  <span className="text-[10px] font-bold opacity-80">{board.bench.length}</span>
                </div>
                <div className="flex min-h-[78px] flex-1 flex-wrap items-start justify-center gap-2 px-2 pb-3 pt-2 sm:gap-3">
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

              <div className="mt-2 flex items-center justify-between px-1 pb-1 text-[9px] font-bold uppercase leading-normal tracking-[0.25em] text-white/55">
                <span className="whitespace-nowrap">{club}</span>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <GafferMark className="h-4 w-4 rounded" icon="h-2.5 w-2.5" />
                  <span className="font-display text-[11px] tracking-[0.2em] text-white/80">GafferBot</span>
                  <span className="lowercase tracking-normal text-white/45">gafferbot.app</span>
                </span>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">{hint}</p>
          </div>

          {/* Squad rail */}
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:sticky lg:top-20 lg:col-start-1 lg:row-start-1">
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: `linear-gradient(90deg, ${alpha(chrome.primary, 0.22)}, transparent)`, borderBottom: `2px solid ${chrome.primary}` }}>
              <span className="font-display text-sm font-bold uppercase tracking-[0.2em]">Squad</span>
              <span className="rounded-full px-1.5 text-[10px] font-bold leading-4" style={{ background: chrome.primary, color: ink(chrome.primary) }}>{pool.reduce((n, g) => n + g.players.length, 0)}</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => setPasteOpen(true)}><ListPlus className="mr-1 h-3.5 w-3.5" />Paste names</Button>
            </div>
            <div className="p-3">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search players or positions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Drop id="pool" onClick={() => held?.player && onSheet.has(held.player) && tapZone({ zone: "pool" })} className="rounded-lg">
                <ScrollArea className="h-[340px] pr-2 lg:h-[calc(100vh-22rem)]">
                  <div className="space-y-1.5">
                    {pool.map((group) => (
                      <div key={group.position} className="space-y-1.5">
                        <div className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <span className="h-3 w-1 rounded-full" style={{ background: chrome.primary }} />
                          <span>{group.position === "Any" ? "No position set" : group.position}</span>
                          <span className="ml-auto">{group.players.length}</span>
                        </div>
                        {group.players.map((p) => {
                          const t = tiers?.get(p.discord_user_id);
                          const answer = availability?.get(p.discord_user_id);
                          const isHeld = held?.player === p.discord_user_id;
                          return (
                            <Draggable key={p.discord_user_id} id={p.discord_user_id} onClick={() => tapPlayer(p.discord_user_id)}>
                              <div
                                className={cn("relative flex items-center gap-2 overflow-hidden rounded-lg border bg-background/60 py-1.5 pl-3 pr-2 transition-colors hover:bg-muted/60", answer === "no" && "opacity-60")}
                                style={isHeld ? { borderColor: chrome.primary, background: alpha(chrome.primary, 0.12) } : undefined}
                                title={answer ? (answer === "yes" ? "Available" : answer === "maybe" ? "Maybe" : "Out") : undefined}
                              >
                                <span className="absolute inset-y-0 left-0 w-1" style={{ background: answer ? AVAIL_BAR[answer] : alpha(chrome.primary, 0.35) }} />
                                <PlayerCardArt discordUserId={p.discord_user_id} name={nameOf(p)} className="w-8 shrink-0" fallback={<Jersey main={kit.primary} trim={kit.secondary} label={String(Math.round(p.overall_rating))} className="w-8" />} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold">{nameOf(p)}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {(t && [t.secondary.length ? `Also ${t.secondary.join("/")}` : "", t.emergency.length ? `emerg. ${t.emergency.join("/")}` : ""].filter(Boolean).join(" · ")) ||
                                      (p.position ? `${p.position} only` : "Any position")}
                                  </p>
                                </div>
                                {answer && answer !== "yes" && <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px]">{answer === "maybe" ? "Maybe" : "Out"}</Badge>}
                                <div className="flex w-9 shrink-0 flex-col items-center rounded-md py-0.5" style={{ background: alpha(chrome.primary, 0.14) }}>
                                  <span className="text-sm font-black leading-tight">{Math.round(p.overall_rating)}</span>
                                  {p.position && <span className="text-[9px] font-bold leading-tight text-muted-foreground">{p.position}</span>}
                                </div>
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
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {availability && availability.size > 0 && <>Edge: <span className="text-emerald-500">available</span> · <span className="text-amber-500">maybe</span> · <span className="text-red-500">out</span>. </>}
                {tiers && tiers.size > 0 && <>Card outline: <span className="text-emerald-500">comp position</span> · <span className="text-amber-500">plays it well</span> · <span className="text-orange-500">emergency</span> · <span className="text-red-500">not their position</span></>}
              </p>
            </div>
          </div>

          {/* Style panel */}
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1 xl:col-start-3 xl:row-start-1">
            <div className="px-3 py-2.5" style={{ background: `linear-gradient(90deg, ${alpha(chrome.primary, 0.22)}, transparent)`, borderBottom: `2px solid ${chrome.primary}` }}>
              <span className="font-display text-sm font-bold uppercase tracking-[0.2em]">Style</span>
            </div>
            <Tabs defaultValue="look" className="p-3">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="look">Look</TabsTrigger>
                <TabsTrigger value="kits">Kits</TabsTrigger>
                <TabsTrigger value="pitch">Pitch</TabsTrigger>
              </TabsList>

              <TabsContent value="look" className="mt-3 space-y-4">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={look.title} placeholder="Starting XI" maxLength={60} onChange={(e) => update({ title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Subtitle</Label>
                  <Input value={look.subtitle} placeholder="Opponent, cup round, kick-off..." maxLength={60} onChange={(e) => update({ subtitle: e.target.value })} />
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
                {props.theme && (
                  <button
                    type="button"
                    onClick={() => update({ kit: { ...kit, primary: props.theme!.primary, secondary: props.theme!.secondary } })}
                    className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs hover:bg-muted/60"
                  >
                    <span className="flex overflow-hidden rounded-md border">
                      <span className="h-6 w-5" style={{ background: props.theme.primary }} />
                      <span className="h-6 w-5" style={{ background: props.theme.secondary }} />
                    </span>
                    <span><strong className="block text-foreground">Use team colours</strong>From {props.theme.name}'s setup</span>
                  </button>
                )}
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
                          onClick={() => update({ kit: { ...kit, [key]: c } })}
                          className={cn("aspect-square rounded-full border", kit[key] === c && "ring-2 ring-primary ring-offset-2")}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-center gap-4 pt-1">
                  <Jersey main={kit.primary} trim={kit.secondary} label="10" className="w-14" />
                  <Jersey main={kit.keeper} trim="#111111" label="1" className="w-14" />
                </div>
              </TabsContent>

              <TabsContent value="pitch" className="mt-3 space-y-4">
                <ToggleGroup type="single" value={look.pitch} onValueChange={(v) => v && update({ pitch: v as PitchStyle })} className="grid grid-cols-2 gap-2">
                  {(["team", "classic", "night", "chalkboard"] as PitchStyle[]).map((p) => (
                    <ToggleGroupItem key={p} value={p} className="h-16 flex-col gap-1 border">
                      <span className="h-6 w-12 rounded" style={{ background: PITCH_BG[p](kit), border: `2px solid ${PITCH_LINES[p](kit)}` }} />
                      <span className="text-xs capitalize">{p === "team" ? "Team colours" : p}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-[11px] text-muted-foreground">Download and Post to Discord use exactly the graphic in the middle: title, pitch, cards and bench.</p>
              </TabsContent>
            </Tabs>
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
