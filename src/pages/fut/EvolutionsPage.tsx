import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, HelpCircle, TrendingUp, Wand2 } from "lucide-react";
import { futApi, futKeys, type EvolutionView } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { HelperDownload } from "@/components/fut/HelperDownload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateText, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

function EvolutionCard({ e }: { e: EvolutionView }) {
  return <article className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words font-display text-lg font-semibold">{e.name}</h3>
        <p className="text-sm text-muted-foreground">{[e.coins ? `${numberText(e.coins)} coins` : null, e.points ? `${numberText(e.points)} FC Points` : null, e.end_at ? `ends ${dateText(e.end_at)}` : null].filter(Boolean).join(" · ") || (e.source === "pasted" ? "Pasted" : "Free or cost not shown")}</p>
      </div>
      <Badge variant="outline">{e.eligible} of your cards can enter{e.maybe ? `, ${e.maybe} maybe` : ""}</Badge>
    </header>
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div><h4 className="text-xs font-semibold uppercase text-muted-foreground">Who can enter</h4><ul className="mt-1 space-y-0.5">{e.rule_lines.map((l, i) => <li key={i}>{l}</li>)}{!e.rule_lines.length && <li className="text-muted-foreground">No requirements read</li>}</ul></div>
      <div><h4 className="text-xs font-semibold uppercase text-muted-foreground">Upgrades</h4><ol className="mt-1 space-y-0.5">{e.level_lines.map((l, i) => <li key={i}><span className="text-muted-foreground">Level {i + 1}:</span> {l.join(", ")}</li>)}{!e.level_lines.length && <li className="text-muted-foreground">No upgrades read</li>}</ol></div>
    </div>
    {e.unread.length > 0 && <p className="text-xs text-warning">Not read yet: {e.unread.join("; ")}. Check these against the game.</p>}
    {e.matches.length ? <ul className="space-y-2">{e.matches.map(m => <li key={m.card.id} className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border pt-2 text-sm">
      <div className="w-14 shrink-0"><FutCardArt compact card={{ name: m.card.name, rating: m.card.overall, version: m.card.version, is_icon: m.card.is_icon, is_hero: m.card.is_hero, position: m.card.positions[0], ea_item_id: m.card.ea_item_id }} /></div>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{m.card.name} <span className="text-muted-foreground">{m.card.positions.join("/")}</span></p>
        <p className="flex items-center gap-1 tabular-nums">{m.card.overall} <ArrowRight className="h-3 w-3" /> <strong>{m.after.overall}</strong>{m.after.positions.length > m.card.positions.length && <span className="text-muted-foreground"> · adds {m.after.positions.filter(p => !m.card.positions.includes(p)).join(", ")}</span>}</p>
        {m.eligible === null && <p className="flex items-center gap-1 text-xs text-warning"><HelpCircle className="h-3 w-3" />Can't check: {m.checks.filter(c => c.ok === null).map(c => c.label).join(", ")}</p>}
      </div>
      {m.squad.gain > 0 ? <Badge variant="outline" className="border-success/40 bg-success/10 text-success"><TrendingUp className="mr-1 h-3 w-3" />+{m.squad.gain} at {m.squad.slot}</Badge> : <span className="text-xs text-muted-foreground">Wouldn't start</span>}
    </li>)}</ul> : <p className="text-sm text-muted-foreground">None of your synced club cards can enter this one.</p>}
  </article>;
}

export default function EvolutionsPage() {
  const context = useMarketPlatform();
  const overview = useQuery({ queryKey: [...futKeys.evolutions, context.platform], queryFn: () => futApi.evolutions.overview(context.platform), enabled: context.enabled, staleTime: 60_000 });
  const [name, setName] = useState(""), [rules, setRules] = useState(""), [ups, setUps] = useState("");
  const check = useMutation({ mutationFn: () => futApi.evolutions.check({ name, requirements: rules, upgrades: ups }) });
  const d = overview.data;
  return <MarketShell title="Evolutions" showTabs={false} {...context}>
    <ErrorNotice error={overview.error || check.error} />
    <p className="text-sm text-muted-foreground">Which of your club cards can enter each evolution, what they become after every level, and how much each one would improve your latest saved squad. New ratings add up EA's +OVR upgrades, so treat them as estimates. Nothing here starts or pays for an evolution.</p>

    {overview.isPending ? <MarketLoading /> : d && <>
      {d.best_upgrades.length > 0 && <Section title="Best evolutions for your squad">
        <ul className="grid gap-2 sm:grid-cols-2">{d.best_upgrades.map(b => <li key={b.card_id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm"><Check className="h-4 w-4 shrink-0 text-success" /><span className="min-w-0 break-words"><strong>{b.name}</strong> in <strong>{b.evolution}</strong> becomes {b.after}: +{b.gain} at {b.slot}{d.squad ? ` in ${d.squad}` : ""}</span></li>)}</ul>
      </Section>}
      <Section title="Live evolutions">
        <p className="text-xs text-muted-foreground">Seen {d.seen_at ? dateText(d.seen_at) : "–"} · {d.club_cards} club cards · Squad: {d.squad ?? "none saved yet (save one in Squad Builder to see starting gains)"} · EA's evolution fields aren't confirmed for FC 27 yet</p>
        {d.evolutions.length ? <div className="grid items-start gap-4 lg:grid-cols-2">{d.evolutions.map(e => <EvolutionCard key={e.id} e={e} />)}</div>
          : <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
            <p>No evolutions from the helper yet. Install the XI Lab helper (v0.10.0 or newer), open <strong>Evolutions</strong> in the EA Web App and look through the list. You can also paste one below.</p>
            <HelperDownload compact />
          </div>}
        {Object.keys(d.shape).length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Evolution fields the helper saw</summary><p className="mt-2 break-words font-mono text-xs text-muted-foreground">{Object.entries(d.shape).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" · ")}</p></details>}
      </Section>
    </>}

    <Section title="Check an evolution">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 lg:grid-cols-2">
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="evo-name">Name</Label><Input id="evo-name" value={name} maxLength={120} placeholder="e.g. Midfield Maestro" onChange={e => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="evo-rules">Requirements, one per line</Label><Textarea id="evo-rules" rows={6} value={rules} maxLength={4000} placeholder={"Overall: Max 82\nPace: Max 85\nPosition: CM, CDM\nPlayStyles+: Max 1"} onChange={e => setRules(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="evo-ups">Upgrades ("Level 2" lines between levels)</Label><Textarea id="evo-ups" rows={6} value={ups} maxLength={4000} placeholder={"Level 1\n+2 OVR\nPassing +3\nLevel 2\nPlayStyle+: Incisive Pass"} onChange={e => setUps(e.target.value)} /></div>
        <div className="lg:col-span-2"><Button disabled={check.isPending || (!rules.trim() && !ups.trim())} onClick={() => check.mutate()}><Wand2 className="mr-2 h-4 w-4" />{check.isPending ? "Checking…" : "Find my cards"}</Button></div>
      </div>
      {check.data && <EvolutionCard e={check.data.evolution} />}
    </Section>
  </MarketShell>;
}
