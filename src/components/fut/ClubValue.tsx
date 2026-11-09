import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Busy, ErrorNotice } from "@/components/fut/FutShared";
import { ClubValueCard, futApi, futKeys, MarketPlatform } from "@/lib/futApi";

const coins = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never");
const SHOWN = 25;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl font-semibold">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}

function PriceCell({ card }: { card: ClubValueCard }) {
  if (card.price == null) return <span className="text-muted-foreground">No price yet</span>;
  return <span>{coins(card.price)} <span className="text-xs text-muted-foreground">{card.price_source === "web_app_capture" ? "your capture" : "FUT.GG"}</span></span>;
}

/** Club trade value: which synced cards can be sold and what the tradeable copies are worth now. */
export function ClubValue() {
  const [platform, setPlatform] = useState<MarketPlatform>("console");
  const [tab, setTab] = useState<"tradeable" | "untradeable">("tradeable");
  const [all, setAll] = useState(false);
  const value = useQuery({ queryKey: [...futKeys.cards, "club-value", platform], queryFn: () => futApi.clubValue(platform) });
  const d = value.data;
  const tradeable = (d?.cards ?? []).filter(c => c.tradeable_quantity > 0);
  const untradeable = (d?.cards ?? []).filter(c => c.tradeable_quantity < c.quantity);
  const rows = tab === "tradeable" ? tradeable : untradeable;
  const shown = all ? rows : rows.slice(0, SHOWN);
  return <section className="space-y-4 rounded-lg border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Coins className="h-5 w-5" />Club value</h2>
      <Select value={platform} onValueChange={v => setPlatform(v as MarketPlatform)}><SelectTrigger className="w-32" aria-label="Platform"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="console">Console</SelectItem><SelectItem value="pc">PC</SelectItem></SelectContent></Select>
    </div>
    <ErrorNotice error={value.error} />
    {value.isPending ? <Busy /> : d && (d.totals.cards === 0
      ? <p className="text-sm text-muted-foreground">Sync your club first: open your club in the EA Web App with the XI Lab helper on, then use Sync club.</p>
      : <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Tradeable value after 5% tax" value={coins(d.totals.value_after_tax)} hint={`${coins(d.totals.value)} at lowest Buy Now`} />
          <Stat label="Tradeable cards" value={coins(d.totals.tradeable_cards)} hint={d.totals.tradeable_copies > d.totals.tradeable_cards ? `${d.totals.tradeable_copies} copies` : undefined} />
          <Stat label="Untradeable cards" value={coins(d.totals.untradeable_cards)} hint={d.totals.untradeable_value ? `${coins(d.totals.untradeable_value)} if they could be sold` : undefined} />
          <Stat label="Tradeable without a price" value={coins(d.totals.unpriced_tradeable)} hint="Not counted in the value" />
        </div>
        <p className="text-xs text-muted-foreground">Prices: FUT.GG {when(d.prices_published_at)}, or your own Web App capture when it's newer. Club synced {when(d.last_sync)}. Cards you've sold since stay listed until the helper's club is cleared and synced again.</p>
        <Tabs value={tab} onValueChange={v => { setTab(v as typeof tab); setAll(false); }}>
          <TabsList><TabsTrigger value="tradeable">Tradeable ({tradeable.length})</TabsTrigger><TabsTrigger value="untradeable">Untradeable ({untradeable.length})</TabsTrigger></TabsList>
        </Tabs>
        <div className="min-w-0 overflow-x-auto rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Player</TableHead><TableHead>OVR</TableHead><TableHead>Pos</TableHead><TableHead>Copies</TableHead><TableHead>Price</TableHead>{tab === "tradeable" && <TableHead>Worth after tax</TableHead>}</TableRow></TableHeader>
          <TableBody>{shown.map(c => <TableRow key={c.id}>
            <TableCell><p className="font-medium">{c.player_name}</p><p className="text-xs text-muted-foreground">{c.version || "Base"}{c.tradeable === null ? " · tradeable status unknown" : ""}{c.missing_from_last_sync ? " · not in your last sync" : ""}</p></TableCell>
            <TableCell className="font-display text-lg font-semibold">{c.overall}</TableCell>
            <TableCell>{c.position}</TableCell>
            <TableCell>{tab === "tradeable" ? (c.tradeable_quantity < c.quantity ? `${c.tradeable_quantity} of ${c.quantity}` : c.quantity) : (c.tradeable_quantity > 0 ? `${c.quantity - c.tradeable_quantity} of ${c.quantity}` : c.quantity)}</TableCell>
            <TableCell><PriceCell card={c} /></TableCell>
            {tab === "tradeable" && <TableCell className="font-medium">{coins(c.value_after_tax)}</TableCell>}
          </TableRow>)}
          {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{tab === "tradeable" ? "No tradeable cards in your synced club." : "No untradeable cards in your synced club."}</TableCell></TableRow>}</TableBody></Table></div>
        {rows.length > SHOWN && <Button variant="ghost" size="sm" onClick={() => setAll(v => !v)}>{all ? "Show fewer" : `Show all ${rows.length}`}</Button>}
        {tab === "tradeable" && <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><Badge variant="outline">Estimate</Badge>Lowest Buy Now, not a guaranteed sale. EA's price range limits and your own listing price decide what you actually get.</div>}
      </>)}
  </section>;
}
