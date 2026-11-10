import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RoleLine } from "@/components/fut/market/MetaRating";
import { dateText, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const POSITIONS = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST"];

export default function MetaRatingsPage() {
  const context = useMarketPlatform();
  const [position, setPosition] = useState("ST"), [role, setRole] = useState(""), [budget, setBudget] = useState(""), [mine, setMine] = useState(false);
  const maxPrice = budget.trim() ? Number(budget.replace(/[,\s]/g, "").replace(/k$/i, "000")) || null : null;
  const q = useQuery({ queryKey: [...futKeys.meta, "top", position, role, maxPrice, mine, context.platform], queryFn: () => futApi.meta.top({ position, role: role || undefined, max_price: maxPrice, owned_only: mine, platform: context.platform }), enabled: context.enabled, staleTime: 5 * 60_000 });
  const d = q.data;
  return <MarketShell title="Meta Ratings" showTabs={false} {...context}>
    <ErrorNotice error={q.error} />
    <p className="text-sm text-muted-foreground">How well cards actually play in a role, not just their overall: in-game attributes, PlayStyles and PlayStyles+, height, AcceleRATE, weak foot and skill moves, under the chem style that suits each card best. Open any card for its score in every role.</p>
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5"><Label>Position</Label><Select value={position} onValueChange={v => { setPosition(v); setRole(""); }}><SelectTrigger aria-label="Position"><SelectValue /></SelectTrigger><SelectContent>{POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Role</Label><Select value={role || "any"} onValueChange={v => setRole(v === "any" ? "" : v)}><SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Best role</SelectItem>{(d?.position === position ? d.roles : []).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="meta-budget">Budget (coins)</Label><Input id="meta-budget" inputMode="numeric" placeholder="Any, e.g. 50k" value={budget} onChange={e => setBudget(e.target.value)} /></div>
      <div className="flex items-end gap-2 pb-2"><Switch id="meta-mine" checked={mine} onCheckedChange={setMine} /><Label htmlFor="meta-mine">Only my club</Label></div>
    </div>
    {q.isPending ? <MarketLoading /> : d && <Section title={`Best ${d.position}${d.role ? ` ${d.role}s` : "s"}${d.max_price ? ` under ${numberText(d.max_price)}` : ""}`}>
      {d.cards.length ? <ul className="space-y-2">{d.cards.map((c, i) => <li key={c.card_id} className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-3">
        <span className="w-6 shrink-0 pt-1 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
        <div className="w-12 shrink-0"><FutCardArt compact card={{ name: c.name, rating: c.rating, version: c.version, position: c.position, ea_item_id: c.ea_item_id }} /></div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2"><Link className="break-words font-medium text-primary underline-offset-4 hover:underline" to={`/fut/market/card/${encodeURIComponent(c.card_id)}`}>{c.name}</Link><span className="text-sm text-muted-foreground">{c.rating} · {c.price ? `${numberText(c.price)} coins` : "no price"}</span>{c.owned && <Badge variant="outline">In your club</Badge>}</p>
          <ul><RoleLine r={c.meta} /></ul>
        </div>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No cards with full stats match. Full stats fill in from FUT.GG a few hundred cards at a time ({numberText(d.with_stats)} so far).</p>}
      <p className="text-xs text-muted-foreground">Prices from FUT.GG {d.published_at ? dateText(d.published_at) : "not loaded yet"}. {d.note}</p>
    </Section>}
  </MarketShell>;
}
