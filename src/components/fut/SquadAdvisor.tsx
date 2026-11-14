import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, Lightbulb, ShoppingCart, Star, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { futApi, type AdvisorFormation, type AdvisorSlot, type AdvisorTarget, type CurrentSquad, type FutSquad, type SuggestBy } from "@/lib/futApi";
import { coins } from "@/lib/futStats";
import { cn } from "@/lib/utils";
import { Busy, ErrorNotice } from "./FutShared";
import { ChemistryPips } from "./FutPitch";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
/**
 * "My current squad": loads the squad last opened in the EA Web App (or the nearest thing to it) and hands it to
 * `onLoaded`, or opens it in Squad Builder when no handler is given. The note under the button says where it came from.
 */
export function LoadCurrentSquad({ onLoaded, variant = "outline", className }: { onLoaded?: (c: CurrentSquad & { squad: FutSquad }) => void; variant?: "default" | "outline"; className?: string }) {
  const navigate = useNavigate();
  const load = useMutation({
    mutationFn: futApi.currentSquad,
    onSuccess: (c) => {
      if (!c.squad) return;
      if (onLoaded) onLoaded({ ...c, squad: c.squad });
      else { const { id: _id, ...squad } = c.squad; navigate("/fut/squads/new", { state: { squad: c.source === "saved" ? { ...squad, name: `${squad.name} copy` } : squad, current: { source: c.source, note: c.note } } }); }
    },
  });
  return <div className={cn("min-w-0 space-y-1", className)}>
    <Button variant={variant} disabled={load.isPending} onClick={() => load.mutate()}><UserRound className="mr-2 h-4 w-4" />{load.isPending ? "Loading…" : "My current squad"}</Button>
    <ErrorNotice error={load.error} />
    {load.data && !load.data.squad && <p className="max-w-md text-sm text-muted-foreground">{load.data.note}</p>}
  </div>;
}

function TargetLine({ t, dream }: { t: AdvisorTarget; dream?: boolean }) {
  return <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
    {dream ? <Star className="h-3 w-3 shrink-0 translate-y-0.5 text-primary" aria-hidden /> : <ShoppingCart className="h-3 w-3 shrink-0 translate-y-0.5 text-success" aria-hidden />}
    <span className="text-muted-foreground">{dream ? "Dream:" : "Buy next:"}</span>
    <span className="font-medium">{t.rating} {t.name}</span>
    <span className="text-muted-foreground">{t.version ?? ""} · {t.role} {t.score}</span>
    <span className={cn("tabular-nums", t.affordable === false ? "text-muted-foreground" : "font-medium")}>{t.price != null ? `${coins(t.price)} coins` : "no price"}</span>
  </p>;
}

function SlotRow({ s, by, busy, onUse }: { s: AdvisorSlot; by: SuggestBy; busy: boolean; onUse: (slot: string, cardId: string) => void }) {
  const top = s.picks.slice(0, 3);
  return <li className="space-y-2 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline" className="w-12 justify-center px-1 text-[10px]">{s.slot}</Badge>
      {s.current ? <><span className="font-medium">{s.current.rating} {s.current.name}</span><ChemistryPips value={s.current.chemistry} />{!s.current.in_position && <span className="text-xs text-destructive">out of position</span>}</>
        : <span className="text-muted-foreground">Empty: nobody at {s.position}</span>}
    </div>
    {top.length > 0 ? <ul className="space-y-1">{top.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className={cn("min-w-0 flex-1 truncate", p.better && "font-medium")}>{p.rating} {p.name}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{by === "ovr" && p.rating_change !== null ? `${signed(p.rating_change)} OVR · ` : ""}{signed(p.change)} chem{by === "chem" && p.rating_change !== null ? ` · ${signed(p.rating_change)} OVR` : ""}</span>
      {p.better && <Badge className="font-normal">{s.current ? "Better" : "Best fit"}</Badge>}
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy} aria-label={`Put ${p.name} at ${s.slot}`} onClick={() => onUse(s.slot, p.id)}>Use</Button>
    </li>)}</ul> : <p className="text-xs text-muted-foreground">No other club card plays {s.position}.</p>}
    {s.target && <TargetLine t={s.target} />}
    {s.dream && <TargetLine t={s.dream} dream />}
  </li>;
}

function ShapeRow({ f, now, busy, onApply }: { f: AdvisorFormation; now: { chemistry: number; rating: number }; busy: boolean; onApply: (f: AdvisorFormation) => void }) {
  const [show, setShow] = useState(false);
  return <li className="rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-display text-base font-semibold">{f.formation}</span>
      <span><span className="font-semibold text-primary">{f.chemistry}</span>/33 chem <span className="text-xs text-muted-foreground">({signed(f.chemistry - now.chemistry)})</span></span>
      <span><span className="font-semibold">{f.rating}</span> OVR <span className="text-xs text-muted-foreground">({signed(f.rating - now.rating)})</span></span>
      {f.current && <Badge variant="outline">Your formation</Badge>}
      {f.changes > 0 && <span className="text-xs text-muted-foreground">{f.changes} new player{f.changes === 1 ? "" : "s"}</span>}
      {f.empty.length > 0 && <Badge variant="destructive">{f.empty.length} empty</Badge>}
      <div className="ml-auto flex gap-1.5"><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-expanded={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Who goes where"}</Button><Button size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onApply(f)}>Use</Button></div>
    </div>
    {show && <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">{f.squad.slots.map((s) => <li key={s.slot} className="flex items-center gap-2"><Badge variant="outline" className="w-12 justify-center px-1 text-[10px]">{s.slot}</Badge>{s.card ? <span className="min-w-0 truncate">{s.card.rating} {s.card.name}</span> : <span className="text-muted-foreground">Empty</span>}</li>)}</ul>}
  </li>;
}

/**
 * The squad advisor, under the pitch: for the squad on screen, the best club card for every position by skill
 * (overall) or chemistry, who to buy next and who to dream of, the same players in other formations, and the best
 * eleven the whole club makes in each formation. Every "Use" only changes the squad on screen.
 */
export function SquadAdvisor({ squad, busy, onUse, onApply }: { squad: FutSquad; busy: boolean; onUse: (slot: string, cardId: string) => void; onApply: (f: AdvisorFormation) => void }) {
  const [open, setOpen] = useState(false);
  const [by, setBy] = useState<SuggestBy>("ovr");
  const [onlyBetter, setOnlyBetter] = useState(false);
  const key = `${squad.formation}|${squad.manager?.id ?? ""}|${squad.slots.map((s) => `${s.slot}:${s.card?.id ?? ""}:${s.locked ? 1 : 0}`).join(",")}`;
  const q = useQuery({ queryKey: ["fut", "advisor", key, by], queryFn: () => futApi.squadAdvisor(squad, by), enabled: open, placeholderData: keepPreviousData, staleTime: 5 * 60_000, retry: false });
  const a = q.data;
  const slots = a ? (onlyBetter ? a.slots.filter((s) => !s.current || s.picks.some((p) => p.better)) : a.slots) : [];
  const upgrades = a ? a.slots.filter((s) => !s.current || s.picks.some((p) => p.better)).length : 0;
  const rearrange = a ? a.rearrange.filter((f) => !f.current || f.chemistry > a.now.chemistry) : [];
  return <section className="rounded-md border border-primary/40 bg-primary/5" aria-label="Squad advisor">
    <button type="button" className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Lightbulb className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1"><span className="block font-display text-lg font-semibold">Squad advisor</span><span className="block text-sm text-muted-foreground">Better players for each position, formations that suit these players, and who to go for next.</span></span>
      <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
    </button>
    {open && <div className="space-y-5 border-t border-primary/20 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Rank by</span>
        <ToggleGroup type="single" variant="outline" size="sm" value={by} onValueChange={(v) => { if (v === "ovr" || v === "chem") setBy(v); }} aria-label="Rank suggestions by">
          <ToggleGroupItem value="ovr">Skill</ToggleGroupItem><ToggleGroupItem value="chem">Chemistry</ToggleGroupItem>
        </ToggleGroup>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{by === "ovr" ? "Skill: the highest overall first, chemistry breaks ties." : "Chemistry: what does most for team chemistry first, overall breaks ties."}</p>
      </div>
      <ErrorNotice error={q.error} />
      {q.isPending ? <Busy /> : a && <div className={cn("space-y-5", q.isPlaceholderData && "opacity-60")}>
        <p className="text-sm">Right now: <span className="font-semibold">{a.now.formation}</span>, <span className="font-semibold">{a.now.rating}</span> OVR, <span className="font-semibold text-primary">{a.now.chemistry}</span>/33 chem{a.now.filled < 11 ? `, ${11 - a.now.filled} empty` : ""}. Checked against your {a.owned_cards.toLocaleString()} club cards{a.coins != null ? ` and ${coins(a.coins)} coins` : ""}.</p>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3"><h3 className="font-display text-base font-semibold">1. Players for each position</h3>
            <span className="text-xs text-muted-foreground">{upgrades ? `${upgrades} position${upgrades === 1 ? "" : "s"} could be better` : "Nobody in your club beats this eleven"}</span>
            {upgrades > 0 && upgrades < a.slots.length && <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" aria-pressed={onlyBetter} onClick={() => setOnlyBetter(!onlyBetter)}>{onlyBetter ? "Show every position" : "Only show improvements"}</Button>}</div>
          <ul className="grid gap-2 lg:grid-cols-2">{slots.map((s) => <SlotRow key={s.slot} s={s} by={by} busy={busy} onUse={onUse} />)}</ul>
          <p className="text-xs text-muted-foreground">"Buy next" is the best card for that position you can afford and don't own; "Dream" is the best there is. Both are GafferBot's estimate from in-game stats and FUT.GG prices.</p>
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-base font-semibold">2. Other formations for these players</h3>
          {rearrange.length ? <ul className="space-y-2">{rearrange.map((f) => <ShapeRow key={f.formation} f={f} now={a.now} busy={busy} onApply={onApply} />)}</ul>
            : <p className="text-sm text-muted-foreground">{a.now.filled < 2 ? "Add some players first." : "No other formation fits all of these players in positions they play."}</p>}
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-base font-semibold">3. Best eleven from your whole club</h3>
          {a.club.length ? <ul className="space-y-2">{a.club.map((f) => <ShapeRow key={f.formation} f={f} now={a.now} busy={busy} onApply={onApply} />)}</ul>
            : <p className="text-sm text-muted-foreground">No club cards yet. Sync your club or add cards on My cards.</p>}
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowRight className="h-3 w-3" aria-hidden />Want it built around how you play? Use "Build my ideal squad" above. Nothing here is saved until you press Save.</p>
        </div>
      </div>}
    </div>}
  </section>;
}
