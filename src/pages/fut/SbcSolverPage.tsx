import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Puzzle, ShoppingCart, Wand2, X } from "lucide-react";
import { futApi, futKeys, type SbcChallengeSeen, type SbcRequirement, type SbcSolution, type SbcSolved, type SbcWorthVerdict } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { HelperDownload } from "@/components/fut/HelperDownload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dateText, MarketLoading, MarketShell, Notes, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const coins = (v: number | null | undefined) => (v == null ? "–" : `${numberText(v)} coins`);

const VERDICT: Record<SbcWorthVerdict, { label: string; className: string }> = {
  do_it: { label: "Worth doing", className: "border-success/40 bg-success/10 text-success" },
  free: { label: "Free from your club", className: "border-success/40 bg-success/10 text-success" },
  close: { label: "About even", className: "border-warning/40 bg-warning/10 text-warning" },
  skip: { label: "Not worth the coins", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  unknown: { label: "Reward value unknown", className: "text-muted-foreground" },
};

const SOURCE: Record<string, string> = { spare: "Spare duplicate", buy: "Buy", owned: "Club" };

interface Draft { name: string; formation: string; requirements: SbcRequirement[]; lines: string[] }

function SquadResult({ r }: { r: SbcSolved }) {
  const buys = r.slots.filter(s => s.card?.source === "buy");
  return <article className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="break-words font-display text-lg font-semibold">{r.name}</h3>
        <p className="text-sm text-muted-foreground">{r.formation} · Team rating {r.team_rating}{r.chemistry ? ` · Chemistry ${r.chemistry}` : ""}</p>
      </div>
      <Badge variant="outline" className={r.feasible ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}>{r.feasible ? "Meets every requirement" : "Not complete"}</Badge>
    </header>
    <ul className="grid gap-1 text-sm sm:grid-cols-2">{r.checks.map((c, i) => <li key={i} className="flex items-start gap-2">{c.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}<span className="min-w-0 break-words">{c.label} <span className="text-muted-foreground">({c.actual})</span></span></li>)}</ul>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{r.slots.map(s => <div key={s.slot} className="min-w-0 space-y-1 text-center">
      <p className="text-xs font-medium text-muted-foreground">{s.slot}</p>
      {s.card ? <>
        <FutCardArt compact card={{ name: s.card.name, rating: s.card.rating, version: s.card.version, is_icon: s.card.is_icon, is_hero: s.card.is_hero, position: s.card.positions[0] ?? s.position, ea_item_id: s.card.ea_item_id }} title={`${s.card.name} · ${s.card.league ?? ""} · ${s.card.nation ?? ""}`} />
        <p className="truncate text-xs">{s.card.name}</p>
        <p className={`text-xs ${s.card.source === "buy" ? "text-warning" : "text-muted-foreground"}`}>{s.card.source === "buy" ? coins(s.card.price) : s.card.source === "owned" ? (s.card.untradeable ? "Untradeable" : "Club, tradeable") : SOURCE[s.card.source]}</p>
      </> : <p className="rounded border border-dashed border-border py-8 text-xs text-muted-foreground">Empty</p>}
    </div>)}</div>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-muted-foreground">To buy</dt><dd className="tabular-nums font-medium">{coins(r.buy_cost)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Tradeable club cards used (after tax)</dt><dd className="tabular-nums">{coins(r.tradeable_value)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">From your club</dt><dd className="tabular-nums">{r.counts.spare} spare, {r.counts.untradeable} untradeable, {r.counts.tradeable} tradeable</dd></div>
      <div><dt className="text-xs text-muted-foreground">Real cost to you</dt><dd className="tabular-nums font-medium">{coins(r.total_cost)}</dd></div>
    </dl>
    {buys.length > 0 && <div className="space-y-1"><h4 className="flex items-center gap-1 text-sm font-semibold"><ShoppingCart className="h-4 w-4" />Buy list</h4>
      <ul className="space-y-1 text-sm">{buys.map(s => <li key={s.slot} className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words">{s.card!.name} · {s.card!.rating} {s.card!.positions[0] ?? ""} · {s.card!.league ?? ""}</span><span className="tabular-nums">{coins(s.card!.price)}</span></li>)}</ul></div>}
    <Notes items={r.notes} />
  </article>;
}

function SeenChallenge({ c, onUse }: { c: SbcChallengeSeen; onUse: () => void }) {
  return <li className="min-w-0 space-y-1 border-t border-border pt-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{c.name}</span><Button size="sm" variant="outline" onClick={onUse}>Use these requirements</Button></div>
    <p className="text-xs text-muted-foreground">{c.formation ?? c.ea_formation ?? "Formation not read"} · {c.lines.join(" · ") || "No requirements read"}</p>
    {c.unread.length > 0 && <p className="text-xs text-warning">Not read yet: {c.unread.join("; ")}. Add them by pasting the text.</p>}
  </li>;
}

export default function SbcSolverPage() {
  const context = useMarketPlatform();
  const overview = useQuery({ queryKey: [...futKeys.sbc, context.platform], queryFn: () => futApi.sbc.overview(context.platform), enabled: context.enabled, staleTime: 60_000 });
  const [drafts, setDrafts] = useState<Draft[]>([{ name: "My SBC", formation: "4-3-3", requirements: [], lines: [] }]);
  const [setId, setSetId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState<string[]>([]);
  const [useTradeables, setUseTradeables] = useState(true);
  const [buy, setBuy] = useState(true);
  const [protect, setProtect] = useState("");
  const [reward, setReward] = useState("");
  const [result, setResult] = useState<SbcSolution | null>(null);

  const parse = useMutation({
    mutationFn: () => futApi.sbc.parse(text),
    onSuccess: d => { setDrafts(ds => ds.map((x, i) => (i === 0 ? { ...x, requirements: [...x.requirements, ...d.requirements], lines: [...x.lines, ...d.lines] } : x))); setUnread(d.unread); setText(""); },
  });
  const solve = useMutation({
    mutationFn: () => futApi.sbc.solve({
      platform: context.platform, ...(setId ? { set_id: setId } : {}), ...(reward.trim() && Number(reward) >= 0 ? { reward: Math.round(Number(reward)) } : {}),
      challenges: drafts.map(d => ({ name: d.name, formation: d.formation, requirements: d.requirements })),
      options: { use_tradeables: useTradeables, buy, protect_from: protect.trim() ? Number(protect) : null },
    }),
    onSuccess: setResult,
  });

  const d = overview.data;
  const formations = d?.formations ?? ["4-3-3"];
  const loadChallenges = (list: SbcChallengeSeen[], set: number | null) => {
    setDrafts(list.map(c => ({ name: c.name, formation: c.formation ?? "4-3-3", requirements: c.requirements, lines: c.lines })));
    setSetId(set); setUnread(list.flatMap(c => c.unread)); setResult(null);
  };
  const removeLine = (di: number, li: number) => setDrafts(ds => ds.map((x, i) => (i === di ? { ...x, requirements: x.requirements.filter((_, j) => j !== li), lines: x.lines.filter((_, j) => j !== li) } : x)));
  const sets = d?.sets ?? [];
  const seenAny = sets.some(s => s.challenges_seen.length) || (d?.other_challenges.length ?? 0) > 0;

  return <MarketShell title="SBC Solver" showTabs={false} {...context}>
    <ErrorNotice error={overview.error || parse.error || solve.error} />
    <p className="text-sm text-muted-foreground">Finds the cheapest way to finish an SBC. It uses your spare duplicates and untradeable cards first, then tradeable club cards, then the cheapest cards on the market at FUT.GG's latest prices. It also tells you whether the reward is worth it. It never hands anything in: you build and submit the squad yourself in EA's app.</p>

    <Section title="Your SBCs">
      {overview.isPending ? <MarketLoading /> : !sets.length && !seenAny ? <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
        <p>No SBCs from the helper yet. Install the XI Lab helper (v0.9.0 or newer), open <strong>SBC</strong> in the EA Web App, then open the set you want. The helper reads each challenge's requirements. You can also paste requirements below.</p>
        <HelperDownload compact />
      </div> : <>
        <p className="text-xs text-muted-foreground">SBC list seen {d?.sets_at ? dateText(d.sets_at) : "–"} · Challenges seen {d?.challenges_at ? dateText(d.challenges_at) : "–"} · EA's requirement fields aren't confirmed for FC 27 yet, so check the lines against the game.</p>
        <ul className="grid gap-3 lg:grid-cols-2">{sets.map(s => <li key={s.set_id} className="min-w-0 space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><p className="break-words font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{[s.category, s.challenges ? `${s.completed ?? 0}/${s.challenges} done` : null, s.end_at ? `ends ${dateText(s.end_at)}` : null, s.repeatable ? "repeatable" : null].filter(Boolean).join(" · ")}</p></div>
            {s.challenges_seen.length > 1 && <Button size="sm" onClick={() => loadChallenges(s.challenges_seen, s.set_id)}>Solve whole set</Button>}
          </div>
          {s.challenges_seen.length ? <ul className="space-y-2">{s.challenges_seen.map(c => <SeenChallenge key={c.challenge_id} c={c} onUse={() => loadChallenges([c], s.set_id)} />)}</ul>
            : <p className="text-xs text-muted-foreground">Open this set in the Web App so the helper can read its requirements.</p>}
        </li>)}</ul>
        {(d?.other_challenges.length ?? 0) > 0 && <ul className="space-y-2 text-sm">{d!.other_challenges.map(c => <SeenChallenge key={c.challenge_id} c={c} onUse={() => loadChallenges([c], null)} />)}</ul>}
        {seenAny && d?.shape.requirement && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Requirement fields the helper saw</summary><p className="mt-2 break-words font-mono text-xs text-muted-foreground">{[...(d.shape.challenge ?? []), ...(d.shape.requirement ?? [])].join(", ")}</p></details>}
      </>}
    </Section>

    <Section title="Requirements">
      {drafts.map((dr, di) => <div key={di} className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`sbc-name-${di}`}>Challenge</Label><Input id={`sbc-name-${di}`} value={dr.name} maxLength={120} onChange={e => setDrafts(ds => ds.map((x, i) => (i === di ? { ...x, name: e.target.value } : x)))} /></div>
          <div className="space-y-1.5"><Label>Formation</Label><Select value={dr.formation} onValueChange={v => setDrafts(ds => ds.map((x, i) => (i === di ? { ...x, formation: v } : x)))}><SelectTrigger aria-label="Formation"><SelectValue /></SelectTrigger><SelectContent>{formations.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {dr.lines.length ? <ul className="space-y-1 text-sm">{dr.lines.map((l, li) => <li key={li} className="flex items-center justify-between gap-2"><span className="min-w-0 break-words">{l}</span><Button size="sm" variant="ghost" aria-label={`Remove ${l}`} onClick={() => removeLine(di, li)}><X className="h-4 w-4" /></Button></li>)}</ul>
          : <p className="text-sm text-muted-foreground">No requirements yet. Paste them below or pick a challenge above.</p>}
      </div>)}
      <div className="space-y-2">
        <Label htmlFor="sbc-text">Paste requirements (from EA's app, FUT.GG or FUTBIN), one per line</Label>
        <Textarea id="sbc-text" rows={5} value={text} maxLength={4000} placeholder={"Min. Team Rating: 84\nMin. 1 Players: Team of the Week\nPlayers from the same Club: Max. 3"} onChange={e => setText(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!text.trim() || parse.isPending} onClick={() => parse.mutate()}><Wand2 className="mr-2 h-4 w-4" />Read requirements</Button>
          {(drafts.length > 1 || drafts[0]!.lines.length > 0) && <Button variant="ghost" onClick={() => { setDrafts([{ name: "My SBC", formation: "4-3-3", requirements: [], lines: [] }]); setSetId(null); setUnread([]); setResult(null); }}>Start over</Button>}
        </div>
        {unread.length > 0 && <p className="text-sm text-warning">Couldn't read: {unread.join("; ")}</p>}
      </div>
      <div className="grid gap-3 rounded-lg border border-border p-4 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2"><Checkbox checked={useTradeables} onCheckedChange={v => setUseTradeables(v === true)} />Use tradeable club cards</label>
        <label className="flex items-center gap-2"><Checkbox checked={buy} onCheckedChange={v => setBuy(v === true)} />Buy missing cards from the market</label>
        <div className="space-y-1.5"><Label htmlFor="sbc-protect">Keep club cards rated this or higher</Label><Input id="sbc-protect" inputMode="numeric" placeholder="e.g. 88" value={protect} onChange={e => setProtect(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
        <div className="space-y-1.5"><Label htmlFor="sbc-reward">Reward worth (coins, optional)</Label><Input id="sbc-reward" inputMode="numeric" placeholder={setId ? "Worked out from the reward" : "e.g. 25000"} value={reward} onChange={e => setReward(e.target.value.replace(/\D/g, "").slice(0, 9))} /></div>
      </div>
      <Button disabled={solve.isPending || drafts.every(x => !x.requirements.length)} onClick={() => solve.mutate()}><Puzzle className="mr-2 h-4 w-4" />{solve.isPending ? "Solving…" : drafts.length > 1 ? `Solve all ${drafts.length} challenges` : "Solve"}</Button>
    </Section>

    {result && <Section title="Cheapest squad">
      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={VERDICT[result.worth.verdict].className}>{VERDICT[result.worth.verdict].label}</Badge><span className="text-sm text-muted-foreground">Prices from FUT.GG {result.prices_at ? dateText(result.prices_at) : "not loaded yet"} · {result.owned_cards} club cards, {result.spare_duplicates} spare duplicates</span></div>
        <p className="text-sm">{result.worth.why}</p>
        {result.challenges.length > 1 && <p className="text-sm">All {result.challenges.length} challenges: {coins(result.buy_cost)} to buy, {coins(result.total_cost)} real cost. No card is used twice.</p>}
      </div>
      <div className="grid gap-4">{result.challenges.map((c, i) => <SquadResult key={i} r={c} />)}</div>
    </Section>}
  </MarketShell>;
}
