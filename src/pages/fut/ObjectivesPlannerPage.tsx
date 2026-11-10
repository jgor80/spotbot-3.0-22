import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { futApi, futKeys, type ObjectivePlanItem } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateText, MarketShell, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const STATUS: Record<ObjectivePlanItem["status"], { label: string; className: string }> = {
  covered: { label: "Covered", className: "border-success text-success" },
  short: { label: "Can't cover", className: "border-destructive text-destructive" },
  no_requirement: { label: "Any XI", className: "" },
  unreadable: { label: "Not read", className: "text-muted-foreground" },
};

/** One XI from the club that covers as many objectives' player requirements as possible. */
export default function ObjectivesPlannerPage() {
  const context = useMarketPlatform();
  const navigate = useNavigate();
  const [formation, setFormation] = useState("saved"), [text, setText] = useState(""), [paste, setPaste] = useState(false);
  const formations = useQuery({ queryKey: futKeys.formationSlots, queryFn: futApi.formationSlots, enabled: context.enabled, staleTime: Infinity });
  const plan = useMutation({ mutationFn: () => futApi.objectivesPlan({ platform: context.platform, ...(formation !== "saved" ? { formation } : {}), ...(paste && text.trim() ? { text } : {}) }) });
  const d = plan.data;
  const open = () => { if (!d?.squad) return; const { id: _id, ...squad } = d.squad; navigate("/fut/squads/new", { state: { squad: { ...squad, name: "Objectives XI" } } }); };
  return <MarketShell title="Objectives Planner" showTabs={false} {...context}>
    <p className="text-sm text-muted-foreground">Reads the player requirements in your objectives ("with 3 Premier League players", "using a Brazilian player") and builds one XI from your club that covers as many as possible, so a few games tick off several at once. Objectives come from the XI Lab helper, or paste them.</p>
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4" onSubmit={e => { e.preventDefault(); plan.mutate(); }}>
      <div className="space-y-1.5"><Label>Formation</Label><Select value={formation} onValueChange={setFormation}><SelectTrigger className="w-44" aria-label="Formation"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="saved">My latest squad's</SelectItem>{Object.keys(formations.data ?? {}).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={paste} onChange={e => setPaste(e.target.checked)} />Paste objectives instead</label>
      <Button type="submit" disabled={plan.isPending || (paste && !text.trim())}><ListChecks className="mr-2 h-4 w-4" />{plan.isPending ? "Planning…" : "Plan my XI"}</Button>
      {paste && <div className="w-full space-y-1.5"><Label htmlFor="objectives-text">One objective per line</Label><Textarea id="objectives-text" rows={6} maxLength={20000} value={text} onChange={e => setText(e.target.value)} placeholder="Win a match with 3 Premier League players in your starting XI" /></div>}
    </form>
    <ErrorNotice error={plan.error} />
    {d && <>
      <Section title="Plan">
        <p className="font-display text-lg font-semibold">{d.headline}</p>
        {d.squad && <>
          <p className="text-sm">{d.formation} · rating {d.rating} · chemistry {d.chemistry}/33 · from {d.club_cards} club cards{d.seen_at ? ` · objectives seen ${dateText(d.seen_at)}` : ""}</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">{d.squad.slots.map(s => <li key={s.slot}><span className="font-medium">{s.slot}</span> {s.card ? `${s.card.name} (${s.card.rating ?? "?"})` : "empty"}</li>)}</ul>
          <Button variant="outline" onClick={open}>Open in Squad Builder</Button>
        </>}
      </Section>
      {d.objectives.length > 0 && <Section title="Objectives">
        <ul className="space-y-2">{d.objectives.map((o, i) => <li key={i} className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={STATUS[o.status].className}>{STATUS[o.status].label}</Badge><span className="font-medium">{o.name}</span>{o.mode && <Badge variant="outline">{o.mode}</Badge>}{o.xp ? <span className="text-xs text-muted-foreground">{o.xp} XP</span> : null}{o.end_at && <span className="text-xs text-muted-foreground">ends {dateText(o.end_at)}</span>}</div>
          <p className="mt-1 text-muted-foreground">{o.status === "covered" ? `${o.players.join(", ")}. ${o.note}` : o.note}</p>
        </li>)}</ul>
      </Section>}
      <p className="text-xs text-muted-foreground">{d.note}</p>
    </>}
  </MarketShell>;
}
