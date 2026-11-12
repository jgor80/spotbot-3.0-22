import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Minus, RefreshCw, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp, TrendingDown, TrendingUp } from "lucide-react";
import { futApi, futKeys, type KbPick, type KbPlayerPick, type KbPositionGroup, type KbPriceOutlook, type KbStatPick, type KbTeamPlan } from "@/lib/futApi";
import { coins } from "@/lib/futStats";
import { Busy, ErrorNotice, useFutAvailable } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AGREEMENT, sentimentText, sourceLabel } from "./knowledgePresentation";

const PERIODS = [30, 90, 365] as const;
const SHOW = 6;

function Cites({ ns, plan }: { ns: (number | null)[]; plan: KbTeamPlan }) {
  const list = ns.flatMap((n) => { const c = plan.citations.find((x) => x.n === n); return c ? [c] : []; });
  if (!list.length) return null;
  return <span className="ml-1 inline-flex gap-1 text-xs">{list.map((c) => c.url
    ? <a key={c.n} href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline" title={sourceLabel(c)}>[{c.n}]</a>
    : <span key={c.n} className="text-muted-foreground" title={sourceLabel(c)}>[{c.n}]</span>)}</span>;
}

function PickRow({ p, plan, onPick, bad }: { p: KbPick; plan: KbTeamPlan; onPick: (key: string) => void; bad?: boolean }) {
  return <li className="rounded-lg border border-border p-3 text-sm">
    <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left font-medium hover:underline" onClick={() => onPick(p.key)}>
      {bad ? <ThumbsDown className="h-3.5 w-3.5 text-destructive" aria-hidden /> : <ThumbsUp className="h-3.5 w-3.5 text-success" aria-hidden />}{p.topic}
      <span className="text-xs font-normal text-muted-foreground">{p.claims} claim{p.claims === 1 ? "" : "s"} · {AGREEMENT[p.agreement].label.toLowerCase()}</span>
    </button>
    {p.said && <p className="mt-1 text-muted-foreground">{p.said}<Cites ns={[p.cite]} plan={plan} /></p>}
  </li>;
}

const SIGNAL: Record<KbPriceOutlook["signal"], string> = { falling: "text-destructive", near_high: "text-destructive", near_low: "text-success", rising: "text-primary", steady: "text-muted-foreground" };
function Outlook({ o }: { o?: KbPriceOutlook | null }) {
  if (!o) return null;
  const Icon = o.signal === "falling" ? TrendingDown : o.signal === "rising" || o.signal === "near_high" ? TrendingUp : o.signal === "near_low" ? TrendingDown : Minus;
  return <p className={cn("flex items-start gap-1.5 text-xs", SIGNAL[o.signal])}><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>{o.call}</span></p>;
}
const Inferred = () => <span className="ml-1.5 rounded border border-border px-1 py-px text-[10px] font-normal uppercase tracking-wide text-muted-foreground" title="Worked out from your team, the formation, card stats and prices, not something people said">inferred</span>;

function StatRow({ c }: { c: KbStatPick }) {
  return <li className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-border p-3 text-sm">
    <div className="min-w-0 space-y-1">
      <p className="font-medium">{c.name} <span className="text-xs font-normal text-muted-foreground">{c.rating} {c.version ?? ""} · {c.role} {c.score}</span></p>
      {c.why && <p className="text-xs text-muted-foreground">{c.why}</p>}
      {c.owned && <Badge className="gap-1 font-normal"><Check className="h-3 w-3" />You own this card</Badge>}
      <Outlook o={c.outlook} />
    </div>
    <div className="shrink-0 text-right">{c.price != null ? <><p className="font-semibold tabular-nums">{coins(c.price)}</p><p className="text-xs text-muted-foreground">coins</p></> : <p className="text-xs text-muted-foreground">No price</p>}</div>
  </li>;
}

function PlayerRow({ p, plan, onPick }: { p: KbPlayerPick; plan: KbTeamPlan; onPick: (key: string) => void }) {
  const c = p.card;
  return <li className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
    <div className="min-w-0 space-y-1">
      <button type="button" className="flex flex-wrap items-center gap-2 text-left font-medium hover:underline" onClick={() => onPick(p.key)}>
        {c ? c.player_name : p.topic}
        {c && <span className="text-xs font-normal text-muted-foreground">{c.overall} {c.version ?? ""}{c.position ? ` · ${c.position}` : ""}</span>}
      </button>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className={cn("font-normal", p.verdict === "rated" ? "border-success/50 text-success" : p.verdict === "overrated" ? "border-destructive/50 text-destructive" : "")}>
          {p.verdict === "rated" ? "Rated" : p.verdict === "overrated" ? "Called overrated" : "Mixed views"} · {p.claims}
        </Badge>
        {p.owned && <Badge className="gap-1 font-normal"><Check className="h-3 w-3" />You own {p.card?.owned ? "this card" : p.owned_card ? `${p.owned_card.rating} ${p.owned_card.version ?? ""}`.trim() : "one"}</Badge>}
        {c?.affordable === true && <Badge variant="outline" className="border-success/50 font-normal text-success">You can afford it</Badge>}
        {c?.affordable === false && <Badge variant="outline" className="font-normal text-muted-foreground">Over your coins</Badge>}
      </div>
      <Outlook o={c?.outlook} />
      {p.said && <p className="text-muted-foreground">{p.said}<Cites ns={[p.cite]} plan={plan} /></p>}
      {p.versions.length > 0 && <p className="text-xs text-muted-foreground">Other versions: {p.versions.map((v) => `${v.overall} ${v.version ?? ""}${v.price != null ? ` (${coins(v.price)})` : ""}${v.owned ? " owned" : ""}`.trim()).join(", ")}</p>}
    </div>
    <div className="shrink-0 text-right">
      {c?.price != null ? <p className="font-semibold tabular-nums">{coins(c.price)}</p> : <p className="text-xs text-muted-foreground">{c ? "No price" : "Not on card list"}</p>}
      {c?.price != null && <p className="text-xs text-muted-foreground">coins</p>}
    </div>
  </li>;
}

function PositionCard({ g, plan, onPick }: { g: KbPositionGroup; plan: KbTeamPlan; onPick: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const list = all ? g.community : g.community.slice(0, SHOW);
  return <section className="space-y-2 rounded-xl border border-border bg-card p-4">
    <h3 className="flex items-baseline justify-between gap-2 font-display text-lg font-semibold">
      {g.position === "Other" ? "Position unknown" : g.position}
      <span className="text-xs font-normal text-muted-foreground">{g.in_formation ? `${g.in_formation} in the formation` : "not in the formation"}</span>
    </h3>
    {g.community.length ? <ul className="space-y-2">{list.map((p) => <PlayerRow key={p.key} p={p} plan={plan} onPick={onPick} />)}</ul>
      : null}
    {g.community.length > SHOW && <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${g.community.length}`}</Button>}
    {g.by_stats.length > 0 && <>
      <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.community.length ? "Also strong here by in-game stats" : "Nobody's talking about this position, so here are the best by in-game stats"}</h4>
      <ul className="space-y-2">{g.by_stats.map((c) => <StatRow key={c.card_id} c={c} />)}</ul>
    </>}
    {g.yours.length > 0 && <p className="border-t border-border pt-2 text-xs text-muted-foreground">
      Your best here: {g.yours.map((y) => `${y.name} ${y.rating}${y.in_squad ? " (in squad)" : ""}`).join(", ")}
    </p>}
  </section>;
}

/** The knowledge bank's view as a game plan for the user's team. */
export function TeamPlan({ onPick }: { onPick: (key: string) => void }) {
  const qc = useQueryClient();
  const enabled = useFutAvailable();
  const [days, setDays] = useState<number>(90);
  const [squad, setSquad] = useState<string | null>(null);
  const key = [...futKeys.knowledge, "team-plan", days, squad];
  const q = useQuery({ queryKey: key, queryFn: () => futApi.knowledge.teamPlan(days, squad), enabled, placeholderData: keepPreviousData, staleTime: 10 * 60_000 });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try { qc.setQueryData(key, await futApi.knowledge.teamPlan(days, squad, true)); } finally { setRefreshing(false); }
  };
  const plan = q.data;
  const rec = plan?.formation.recommended;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
        <SelectTrigger className="w-40" aria-label="Period"><SelectValue /></SelectTrigger>
        <SelectContent>{PERIODS.map((d) => <SelectItem key={d} value={String(d)}>{d === 365 ? "Last year" : `Last ${d} days`}</SelectItem>)}</SelectContent>
      </Select>
      {plan && plan.team.squads.length > 0 && <Select value={squad ?? plan.team.squad?.id ?? ""} onValueChange={(v) => setSquad(v)}>
        <SelectTrigger className="w-56" aria-label="Compare with squad"><SelectValue placeholder="Your squad" /></SelectTrigger>
        <SelectContent>{plan.team.squads.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.formation})</SelectItem>)}</SelectContent>
      </Select>}
      <Button variant="outline" size="sm" className="gap-1.5" disabled={refreshing || q.isFetching} onClick={refresh}><RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />Refresh</Button>
    </div>
    <ErrorNotice error={q.error} />
    {q.isPending ? <Busy /> : plan && (
      <div className={cn("space-y-4", q.isPlaceholderData && "opacity-60")}>
        <p className="text-sm text-muted-foreground">
          Built from {plan.claims.toLocaleString()} claims in {plan.sources.toLocaleString()} sources about formations, tactics, PlayStyles and players
          {plan.team.squad ? `, compared with "${plan.team.squad.name}" (${plan.team.squad.formation})` : ""}{plan.team.club_size ? ` and your ${plan.team.club_size.toLocaleString()} club cards` : ""}.
          {plan.team.coins != null ? ` You have ${coins(plan.team.coins)} coins.` : ""}
          {plan.widened_from ? ` The last ${plan.widened_from} days were thin, so this reads everything from the last year.` : ""}
        </p>

        {(plan.summary || plan.for_your_team.length > 0) && <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="h-4 w-4 text-primary" />What it means for your team</h2>
          {plan.summary && <p className="text-sm">{plan.summary}</p>}
          {plan.for_your_team.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{plan.for_your_team.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </section>}

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">Formation</h2>
          {rec ? <div className="space-y-1">
            <button type="button" className="font-display text-3xl font-bold hover:underline" onClick={() => onPick(rec.key)}>{rec.formation}</button>
            <p className="text-sm text-muted-foreground">{sentimentText(rec.net)} · {rec.claims} claims · {AGREEMENT[rec.agreement].label.toLowerCase()} · {plan.confidence} confidence</p>
            {plan.formation.basis === "least_criticised" && <p className="text-sm text-muted-foreground">Nobody is clearly for any formation right now; this is the one people criticise least.</p>}
            {(plan.formation_why || rec.said) && <p className="text-sm">{plan.formation_why ?? rec.said}<Cites ns={[rec.cite]} plan={plan} /></p>}
          </div> : <div className="space-y-1">
            <p className="font-display text-3xl font-bold">{plan.formation.name}<Inferred /></p>
            <p className="text-sm text-muted-foreground">{plan.formation.basis === "your_squad" ? "The bank has no formation talk yet, so the plan is built on the formation you already play." : "The bank has no formation talk yet, so the plan is built on the usual meta shape."}</p>
            {plan.formation_why && <p className="text-sm">{plan.formation_why}</p>}
          </div>}
          {plan.team.squad && rec && <p className={cn("rounded-lg p-2 text-sm", plan.team.squad.formation === rec.formation ? "bg-success/10" : "bg-muted")}>
            {plan.team.squad.formation === rec.formation ? `You already play ${rec.formation}.`
              : `You play ${plan.team.squad.formation}${plan.formation.yours ? ` (${sentimentText(plan.formation.yours.net).toLowerCase()}, ${plan.formation.yours.claims} claims)` : ", which the bank hasn't talked about lately"}.`}
            {plan.team.squad.formation !== rec.formation && <> <Link to={`/fut/squads/${encodeURIComponent(plan.team.squad.id)}`} className="text-primary hover:underline">Try {rec.formation} in Squad Builder</Link>.</>}
          </p>}
          {plan.formation.ranked.length > 1 && <div className="flex flex-wrap gap-1.5">
            {plan.formation.ranked.map((f) => <Button key={f.formation} variant="outline" size="sm" className={cn("h-7 rounded-full text-xs", (f.net ?? 0) < 0 && "text-muted-foreground line-through decoration-destructive/60")} onClick={() => onPick(f.key)}>
              {f.formation} · {sentimentText(f.net).toLowerCase()}</Button>)}
          </div>}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-lg font-semibold">Custom tactics</h2>
            {plan.settings.length > 0 && <table className="w-full text-sm">
              <tbody>{plan.settings.map((s, i) => <tr key={i} className="border-b border-border last:border-0 align-top">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">{s.setting}{s.inferred && <Inferred />}</th>
                <td className="py-1.5"><span className="font-semibold">{s.value}</span>{s.why && <span className="block text-xs text-muted-foreground">{s.why}<Cites ns={s.cites} plan={plan} /></span>}</td>
              </tr>)}</tbody>
            </table>}
            {plan.tactics.recommended.length > 0 && <ul className="space-y-2">{plan.tactics.recommended.map((p) => <PickRow key={p.key} p={p} plan={plan} onPick={onPick} />)}</ul>}
            {!plan.settings.length && !plan.tactics.recommended.length && <p className="text-sm text-muted-foreground">No tactics talk with a clear lean yet.</p>}
            {plan.tactics.avoid.length > 0 && <>
              <h3 className="flex items-center gap-1.5 pt-1 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-destructive" />People warn against</h3>
              <ul className="space-y-2">{plan.tactics.avoid.map((p) => <PickRow key={p.key} p={p} plan={plan} onPick={onPick} bad />)}</ul>
            </>}
          </section>
          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-lg font-semibold">Player instructions</h2>
            {plan.instructions.length ? <ul className="space-y-2 text-sm">{plan.instructions.map((s, i) => <li key={i} className="rounded-lg border border-border p-3">
              <p><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{s.position}</span><span className="font-medium">{s.instruction}</span>{s.inferred && <Inferred />}</p>
              {s.why && <p className="mt-1 text-xs text-muted-foreground">{s.why}<Cites ns={s.cites} plan={plan} /></p>}
            </li>)}</ul> : <p className="text-sm text-muted-foreground">{plan.via === "ai" ? "No player instructions in the bank yet." : "Add a Claude key on your profile to turn the claims into settings and player instructions."}</p>}
            {plan.playstyles.recommended.length > 0 && <>
              <h3 className="pt-1 text-sm font-semibold">PlayStyles people rate</h3>
              <ul className="space-y-2">{plan.playstyles.recommended.map((p) => <PickRow key={p.key} p={p} plan={plan} onPick={onPick} />)}</ul>
            </>}
          </section>
        </div>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Players by position <span className="font-normal text-muted-foreground">({plan.positions.reduce((n, g) => n + g.community.length, 0)} talked about)</span></h2>
          <p className="text-sm text-muted-foreground">Who the community talks about at each position of {plan.formation.name}, with today's price, how it has moved over two weeks and whether to buy now or wait. Every position is filled in from in-game stats{plan.team.coins ? " within your coins" : ""}, so nothing is left blank.</p>
          <div className="grid gap-4 md:grid-cols-2">{plan.positions.map((g) => <PositionCard key={g.position} g={g} plan={plan} onPick={onPick} />)}</div>
        </section>

        {plan.citations.length > 0 && <section className="space-y-1">
          <h2 className="text-sm font-semibold">Sources</h2>
          <ol className="space-y-1 text-xs text-muted-foreground">{plan.citations.map((c) => <li key={c.n} className="flex gap-1.5"><span className="tabular-nums">[{c.n}]</span>
            {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1 hover:underline"><span className="truncate">{sourceLabel(c)}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : <span>{sourceLabel(c)}</span>}
          </li>)}</ol>
        </section>}
        <p className="text-xs text-muted-foreground">The formation and player lists come straight from what people said (more talk and stronger agreement count more). {plan.via === "ai" ? "Claude wrote the settings, instructions and notes from the same claims." : ""} These are community opinions, not facts.</p>
      </div>)}
  </div>;
}
