import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tierClass } from "@/components/fut/market/MetaRating";
import { MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

function AddCard({ platform, onAdd, disabled }: { platform: "console" | "pc"; onAdd: (id: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const q = useQuery({ queryKey: [...futKeys.meta, "compare-search", text, platform], queryFn: () => futApi.players.search({ text }, platform, 0, 8), enabled: text.trim().length >= 3, staleTime: 60_000 });
  return <div className="space-y-2">
    <Input aria-label="Find a card to add" placeholder={disabled ? "Four cards at most" : "Add a card: type a name"} value={text} disabled={disabled} onChange={e => setText(e.target.value)} />
    {q.data && text.trim().length >= 3 && <ul className="rounded-lg border border-border bg-card">{q.data.cards.map(c => <li key={c.id}><button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { onAdd(c.id); setText(""); }}><Plus className="h-3 w-3" /><span className="font-medium">{c.player_name}</span><span className="text-muted-foreground">{c.overall} {c.position}{c.version ? ` · ${c.version}` : ""}{c.price ? ` · ${numberText(c.price)}` : ""}</span></button></li>)}{!q.data.cards.length && <li className="px-3 py-2 text-sm text-muted-foreground">No cards found.</li>}</ul>}
  </div>;
}

export default function CardComparePage() {
  const context = useMarketPlatform();
  const [params, setParams] = useSearchParams();
  const ids = useMemo(() => (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4), [params]);
  const [styles, setStyles] = useState<Record<string, string>>({});
  const setIds = (next: string[]) => setParams(next.length ? { ids: next.join(",") } : {});
  const q = useQuery({ queryKey: [...futKeys.meta, "compare", ids, styles, context.platform], queryFn: () => futApi.compareAny(ids, context.platform, styles), enabled: context.enabled && ids.length >= 2, staleTime: 60_000 });
  const d = q.data;
  const groups = d ? [...new Set(d.rows.map(r => r.group))] : [];
  return <MarketShell title="Compare cards" showTabs={false} {...context}>
    <p className="text-sm text-muted-foreground">Two to four cards side by side: full in-game stats with a chem style applied, the PlayStyles they share and don't, how well each plays at the positions they share, and price per rating point.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <AddCard platform={context.platform} disabled={ids.length >= 4} onAdd={id => !ids.includes(id) && setIds([...ids, id])} />
      {ids.length < 2 && <p className="self-center text-sm text-muted-foreground">Add {2 - ids.length} more card{ids.length === 1 ? "" : "s"} to compare. Cards from Player Ratings, Card Search or your club all work.</p>}
    </div>
    <ErrorNotice error={q.error} />
    {ids.length >= 2 && (q.isPending ? <MarketLoading /> : d && <>
      <p className="rounded-lg border border-border bg-card p-3 text-sm">{d.summary}</p>
      <div className={`grid gap-3 ${d.cards.length > 2 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"}`}>{d.cards.map(c => {
        const options = c.positions[0] === "GK" ? d.chem_styles.gk : d.chem_styles.outfield;
        return <div key={c.id} className="min-w-0 space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-3">
            <div className="w-14 shrink-0"><FutCardArt compact card={{ name: c.name, rating: c.rating, version: c.version, position: c.positions[0], ea_item_id: c.ea_item_id }} /></div>
            <div className="min-w-0 flex-1"><Link className="break-words font-medium text-primary underline-offset-4 hover:underline" to={`/fut/market/card/${encodeURIComponent(c.id)}`}>{c.name}</Link><p className="text-xs text-muted-foreground">{c.rating} · {c.positions.join("/")}{c.owned ? " · yours" : ""}</p></div>
            <Button size="icon" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => setIds(ids.filter(i => i !== c.id))}><X className="h-4 w-4" /></Button>
          </div>
          <Select value={styles[c.id] ?? "best"} onValueChange={v => setStyles(s => { const n = { ...s }; if (v === "best") delete n[c.id]; else n[c.id] = v; return n; })}><SelectTrigger aria-label={`Chem style for ${c.name}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="best">Best chem style</SelectItem>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
          {c.meta && <p className="text-sm"><Badge variant="outline" className={tierClass(c.meta.score)}>{c.meta.score}</Badge> {c.meta.position} {c.meta.role}{c.meta.chem_style ? ` · ${c.meta.chem_style}` : ""}</p>}
          <p className="text-sm tabular-nums">{c.price ? `${numberText(c.price)} coins` : "No price"}{c.price_per_rating ? <span className="text-muted-foreground"> · {numberText(c.price_per_rating)} per rating point</span> : null}</p>
          <p className="text-xs text-muted-foreground">Leads on {c.wins} stat{c.wins === 1 ? "" : "s"}{c.only_this.length ? ` · only this card: ${c.only_this.join(", ")}` : ""}</p>
        </div>;
      })}</div>
      {d.shared_playstyles.length > 0 && <p className="text-sm"><span className="text-muted-foreground">All have:</span> {d.shared_playstyles.join(", ")}</p>}
      <Section title="Stats">
        <div className="overflow-x-auto rounded-lg border border-border"><Table><TableHeader><TableRow><TableHead>Stat</TableHead>{d.cards.map(c => <TableHead key={c.id} className="text-right">{c.name}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{groups.map(g => <Fragment key={g}>
            <TableRow><TableCell colSpan={d.cards.length + 1} className="bg-muted/40 py-1 text-xs font-semibold uppercase text-muted-foreground">{g}</TableCell></TableRow>
            {d.rows.filter(r => r.group === g).map(r => <TableRow key={r.key}><TableCell className="whitespace-nowrap">{r.label}</TableCell>{r.values.map((v, i) => <TableCell key={i} className={`text-right tabular-nums ${r.leaders.includes(i) ? "font-bold text-success" : ""}`}>{v ?? "–"}</TableCell>)}</TableRow>)}
          </Fragment>)}</TableBody></Table></div>
        <p className="text-xs text-muted-foreground">{d.note}</p>
      </Section>
    </>)}
  </MarketShell>;
}
