import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Compass, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { futApi, futKeys, type FutSquad, type IdealFormationOption, type IdealPicks, type IdealSquad, type KbPositionGroup } from "@/lib/futApi";
import { coins } from "@/lib/futStats";
import { cn } from "@/lib/utils";
import { Busy, ErrorNotice } from "./FutShared";
import { Cites, Inferred, Outlook } from "./knowledge/TeamPlan";

const STORE = "fut.playstyle";
const MAX = 600;
const PICKS = "fut.playstyle.picks";
// Keys match SHAPE_TRAITS and PLAYER_TRAITS in supabase/functions/_shared/fut/ideal-squad.ts
const STYLES: [string, string][] = [["possession", "Possession"], ["counter", "Counter attack"], ["attacking", "All-out attack"], ["defensive", "Solid defence"], ["wingers", "Wingers"], ["wide_mids", "Width and crosses"], ["narrow", "Through the middle"], ["cam", "Number 10"], ["two_cdms", "Two holding mids"], ["midfield_three", "Midfield three"]];
const PLAYERS: [string, string][] = [["pace", "Pace"], ["passing", "Passing"], ["dribbling", "Dribbling"], ["shooting", "Shooting"], ["defending", "Defending"], ["physical", "Strength"]];
const STRIKERS: [1 | 2 | 3, string][] = [[1, "One striker"], [2, "Two strikers"], [3, "Front three"]];
const DEFENDERS: [3 | 4 | 5, string][] = [[3, "Three at the back"], [4, "Four at the back"], [5, "Five at the back"]];
type Picks = Required<Pick<IdealPicks, "traits">> & Pick<IdealPicks, "strikers" | "defenders" | "formation">;
const saved = () => { try { return localStorage.getItem(STORE) ?? ""; } catch { return ""; } };
const savedPicks = (): Picks => {
  try {
    const p = JSON.parse(localStorage.getItem(PICKS) ?? "{}") as Partial<Picks>;
    return { traits: Array.isArray(p.traits) ? p.traits.filter((t): t is string => typeof t === "string") : [], strikers: STRIKERS.some(([n]) => n === p.strikers) ? p.strikers : null, defenders: DEFENDERS.some(([n]) => n === p.defenders) ? p.defenders : null, formation: null };
  } catch { return { traits: [], strikers: null, defenders: null, formation: null }; }
};
const remember = (text: string, picks: Picks) => { try { localStorage.setItem(STORE, text); localStorage.setItem(PICKS, JSON.stringify({ ...picks, formation: null })); } catch { /* private window: nothing to keep */ } };

function Pill({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return <button type="button" aria-pressed={on} title={title} onClick={onClick}
    className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")}>{children}</button>;
}
function PillRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5" role="group" aria-label={label}><p className="text-xs font-medium text-muted-foreground">{label}</p><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}

function ScoreBar({ label, value, note }: { label: string; value: number | null; note: string }) {
  return <div className="min-w-0 flex-1">
    <div className="flex items-baseline justify-between gap-2 text-xs"><span className="font-medium">{label}</span><span className="truncate text-muted-foreground">{note}</span></div>
    <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100)}%` }} /></div>
  </div>;
}

/** How the three parts of a formation's score read: your style, the community, your club. */
function Parts({ o, best }: { o: IdealFormationOption; best: number }) {
  return <div className="flex flex-col gap-3 sm:flex-row">
    <ScoreBar label="Your style" value={o.style?.fit ?? null} note={o.style ? `${o.style.matched.length} of ${o.style.matched.length + o.style.missed.length} things you asked for` : "no playstyle given"} />
    <ScoreBar label="Community" value={o.community ? Math.max(0, o.community.score) / (best || 1) : null} note={o.community ? `${o.community.claims} claim${o.community.claims === 1 ? "" : "s"}, ${o.community.score > 0 ? "for" : o.community.score < 0 ? "against" : "split"}` : "not talked about"} />
    <ScoreBar label="Your club" value={o.club ? o.club.filled / 11 : null} note={o.club ? `${o.club.rating} OVR, ${o.club.chemistry}/33 chem${o.club.empty.length ? `, ${o.club.empty.length} empty` : ""}` : "no club cards"} />
  </div>;
}

/** The one card worth buying at a position: a player people rate that you don't own, else the best on stats. */
function target(g: KbPositionGroup) {
  const talked = g.community.find((p) => !p.owned && p.verdict !== "overrated" && p.card);
  if (talked?.card) return { name: talked.card.player_name, detail: `${talked.card.overall} ${talked.card.version ?? ""} · ${talked.claims} claim${talked.claims === 1 ? "" : "s"}`, price: talked.card.price, outlook: talked.card.outlook, from: "community" as const };
  const stat = g.by_stats.find((c) => !c.owned);
  return stat ? { name: stat.name, detail: `${stat.rating} ${stat.version ?? ""} · ${stat.role} ${stat.score}`, price: stat.price, outlook: stat.outlook, from: "stats" as const } : null;
}

/** "Build my ideal squad": say how you like to play; get the formation, XI, tactics and buy targets for it. */
export function IdealSquadDialog({ squad, onClose, onApply }: { squad: FutSquad; onClose: () => void; onApply: (result: IdealSquad) => void }) {
  const [text, setText] = useState(saved);
  const [picks, setPicks] = useState<Picks>(savedPicks);
  const metas = useQuery({ queryKey: [...futKeys.knowledge, "squad-metas"], queryFn: futApi.squadMetas, staleTime: 10 * 60_000 });
  const run = useMutation({ mutationFn: (formation?: string) => { remember(text.trim(), picks); return futApi.idealSquad(squad, text.trim(), { ...picks, formation: formation ?? picks.formation }); } });
  const toggle = (k: string) => setPicks((p) => ({ ...p, traits: p.traits.includes(k) ? p.traits.filter((x) => x !== k) : [...p.traits, k] }));
  const anything = !!(text.trim() || picks.traits.length || picks.strikers || picks.defenders || picks.formation);
  const r = run.data;
  const plan = r?.plan;
  const chosen = r?.options.find((o) => o.formation === r.formation);
  const best = Math.max(0, ...(r?.options ?? []).map((o) => o.community?.score ?? 0));
  const locked = squad.slots.filter((s) => s.locked && s.card).length;
  const targets = (plan?.positions ?? []).flatMap((g) => { const t = target(g); return t ? [{ g, t }] : []; });

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>Build my ideal squad</DialogTitle><DialogDescription>Pick how you like to play, or say it in your own words. You get the formation, players and tactics that fit it, weighed with what the community backs in the Knowledge Bank and what your club can field{locked ? `. Your ${locked} locked player${locked === 1 ? " stays" : "s stay"}` : ""}. Nothing is saved until you press Save.</DialogDescription></DialogHeader>

    <div className="space-y-3">
      <PillRow label={metas.data?.metas.some((x) => x.basis === "community") ? "Top metas in the Knowledge Bank right now" : "Top metas"}>
        {metas.isPending ? <span className="text-xs text-muted-foreground">Loading the top metas…</span> : (metas.data?.metas ?? []).map((x) => <Pill key={x.formation} on={picks.formation === x.formation} title={x.said ?? undefined}
          onClick={() => setPicks((p) => p.formation === x.formation ? { ...p, formation: null } : { ...p, formation: x.formation, strikers: null, defenders: null })}>
          {x.formation} <span className="font-normal opacity-80">· {x.basis === "community" ? `${x.claims} claim${x.claims === 1 ? "" : "s"}` : "usual meta"}</span></Pill>)}
        {metas.isError && <span className="text-xs text-muted-foreground">The top metas couldn't be loaded. Everything else still works.</span>}
      </PillRow>
      <PillRow label="Style of play">{STYLES.map(([k, label]) => <Pill key={k} on={picks.traits.includes(k)} onClick={() => toggle(k)}>{label}</Pill>)}</PillRow>
      <PillRow label="What I want from my players">{PLAYERS.map(([k, label]) => <Pill key={k} on={picks.traits.includes(k)} onClick={() => toggle(k)}>{label}</Pill>)}</PillRow>
      <div className="grid gap-3 sm:grid-cols-2">
        <PillRow label="Strikers">{STRIKERS.map(([n, label]) => <Pill key={n} on={picks.strikers === n} onClick={() => setPicks((p) => ({ ...p, strikers: p.strikers === n ? null : n, formation: null }))}>{label}</Pill>)}</PillRow>
        <PillRow label="Defenders">{DEFENDERS.map(([n, label]) => <Pill key={n} on={picks.defenders === n} onClick={() => setPicks((p) => ({ ...p, defenders: p.defenders === n ? null : n, formation: null }))}>{label}</Pill>)}</PillRow>
      </div>
      {picks.formation && <p className="text-xs text-muted-foreground">Building on {picks.formation}. Picking a number of strikers or defenders instead lets the builder choose the formation.</p>}
      <Label htmlFor="playstyle">In my own words (optional)</Label>
      <Textarea id="playstyle" value={text} maxLength={MAX} rows={2} placeholder="For example: I like two quick strikers, getting it wide and crossing, and I defend with two holding midfielders." onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => run.mutate(undefined)} disabled={run.isPending}><Compass className="mr-2 h-4 w-4" />{run.isPending ? "Building…" : r ? "Build again" : "Build"}</Button>
        <p className="text-xs text-muted-foreground">{anything ? "Your picks are remembered on this device for next time." : "Pick nothing to go on the community view and your club alone."}</p>
      </div>
    </div>
    <ErrorNotice error={run.error} />
    {run.isPending && <Busy />}

    {r && plan && !run.isPending && <div className="space-y-4">
      {r.playstyle.summary && <p className="rounded-lg bg-muted p-3 text-sm"><span className="font-medium">How I read you: </span>{r.playstyle.summary}</p>}

      <section className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-3xl font-bold">{r.formation}</h3>
          <span className="text-sm"><span className="font-semibold">{r.rating}</span> avg OVR</span>
          <span className="text-sm"><span className="font-semibold text-primary">{r.chemistry}</span>/33 chem</span>
          {r.empty.length > 0 && <Badge variant="destructive">{r.empty.length} empty</Badge>}
          <Button className="ml-auto" onClick={() => onApply(r)}>Use this squad</Button>
        </div>
        {chosen && <><p className="text-sm">{chosen.why}</p><Parts o={chosen} best={best} /></>}
        {plan.formation_why && <p className="text-sm text-muted-foreground">{plan.formation_why}</p>}
        {r.options.length > 1 && <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Other shapes that scored well. Pick one to build it instead.</p>
          <div className="flex flex-wrap gap-1.5">{r.options.filter((o) => o.formation !== r.formation).map((o) => <Button key={o.formation} variant="outline" size="sm" className="h-7 rounded-full text-xs" title={o.why} disabled={run.isPending} onClick={() => run.mutate(o.formation)}>
            {o.formation} · {o.score}{o.community && o.community.score > 0 && o.community.score === best ? " · community favourite" : ""}</Button>)}</div>
        </div>}
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h3 className="font-display text-lg font-semibold">Your XI</h3>
        <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">{r.squad.slots.map((s) => <li key={s.slot} className="flex items-start gap-2">
          <Badge variant="outline" className="mt-0.5 w-12 shrink-0 justify-center px-1 text-[10px]">{s.slot}</Badge>
          {s.card ? <span className="min-w-0"><span className="font-medium">{s.card.rating} {s.card.name}</span>{r.notes[s.slot] && <span className="block text-xs text-muted-foreground">{r.notes[s.slot]}</span>}</span>
            : <span className="text-muted-foreground">No club card plays {s.position}. See who to buy below.</span>}
        </li>)}</ul>
        {plan.team.club_size === 0 && <p className="text-sm text-muted-foreground">You have no club cards yet, so the XI is empty. <Link to="/fut/cards" className="text-primary hover:underline">Sync your club or add cards</Link> and build again.</p>}
      </section>

      {(plan.summary || plan.for_your_team.length > 0 || plan.settings.length > 0 || plan.instructions.length > 0 || plan.tactics.recommended.length > 0) && <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="h-4 w-4 text-primary" />Tactics</h3>
        {plan.summary && <p className="text-sm">{plan.summary}</p>}
        {plan.settings.length > 0 && <table className="w-full text-sm"><tbody>{plan.settings.map((s, i) => <tr key={i} className="border-b border-border align-top last:border-0">
          <th scope="row" className="py-1.5 pr-3 text-left font-medium">{s.setting}{s.inferred && <Inferred />}</th>
          <td className="py-1.5"><span className="font-semibold">{s.value}</span>{s.why && <span className="block text-xs text-muted-foreground">{s.why}<Cites ns={s.cites} plan={plan} /></span>}</td>
        </tr>)}</tbody></table>}
        {plan.instructions.length > 0 && <ul className="space-y-1.5 text-sm">{plan.instructions.map((s, i) => <li key={i}>
          <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{s.position}</span><span className="font-medium">{s.instruction}</span>{s.inferred && <Inferred />}
          {s.why && <span className="block text-xs text-muted-foreground">{s.why}<Cites ns={s.cites} plan={plan} /></span>}
        </li>)}</ul>}
        {!plan.settings.length && plan.tactics.recommended.length > 0 && <ul className="space-y-1.5 text-sm">{plan.tactics.recommended.slice(0, 6).map((p) => <li key={p.key}><span className="font-medium">{p.topic}</span>{p.said && <span className="block text-xs text-muted-foreground">{p.said}<Cites ns={[p.cite]} plan={plan} /></span>}</li>)}</ul>}
        {plan.tactics.avoid.length > 0 && <p className="text-xs text-muted-foreground">People warn against: {plan.tactics.avoid.slice(0, 4).map((p) => p.topic).join(", ")}.</p>}
        {plan.for_your_team.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{plan.for_your_team.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        {plan.via !== "ai" && <p className="text-xs text-muted-foreground">Add a Claude key on your <Link to="/profile" className="text-primary hover:underline">profile</Link> to get exact settings and player instructions written for your style.</p>}
      </section>}

      {targets.length > 0 && <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h3 className="font-display text-lg font-semibold">Who to buy for this shape</h3>
        <p className="text-xs text-muted-foreground">One pick per position you don't already own: a player people rate, else the best on in-game stats{plan.team.coins ? ` within your ${coins(plan.team.coins)} coins` : ""}. The full lists are on <Link to="/fut/knowledge?tab=team" className="text-primary hover:underline">Knowledge Bank, For my team</Link>.</p>
        <ul className="grid gap-2 sm:grid-cols-2">{targets.map(({ g, t }) => <li key={g.position} className={cn("flex items-start justify-between gap-3 rounded-lg border border-border p-2.5 text-sm", r.squad.slots.some((s) => s.position === g.position && !s.card) && "border-primary/50")}>
          <div className="min-w-0 space-y-0.5">
            <p><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{g.position}</span><span className="font-medium">{t.name}</span></p>
            <p className="text-xs text-muted-foreground">{t.detail} · {t.from === "community" ? "people rate him" : "on stats"}</p>
            <Outlook o={t.outlook} />
          </div>
          <div className="shrink-0 text-right">{t.price != null ? <p className="font-semibold tabular-nums">{coins(t.price)}</p> : <p className="text-xs text-muted-foreground">No price</p>}</div>
        </li>)}</ul>
      </section>}

      <p className="text-xs text-muted-foreground">The formation is scored on your style (half), what the community backs (about a third) and how strong an XI your club makes in it. Built from {plan.claims.toLocaleString()} community claims in {plan.sources.toLocaleString()} sources. These are opinions and estimates, not facts.</p>
    </div>}
  </DialogContent></Dialog>;
}
