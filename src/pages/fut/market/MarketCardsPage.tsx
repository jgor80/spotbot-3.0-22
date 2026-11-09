import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { futApi, futKeys } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardLink, DataTable, Delta, MarketLoading, MarketShell, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";

const PAGE = 50;
const POSITIONS = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"];
const SORTS: Record<string, string> = { price_desc: "Price: high to low", price_asc: "Price: low to high", rating_desc: "Rating", change_desc: "Biggest risers", change_asc: "Biggest fallers", name: "Name" };
const TYPES: Record<string, string> = { all: "All card types", base: "Base (gold/silver/bronze)", promo: "Promo", icon: "Icons", hero: "Heroes" };

/** Every card in the FUT.GG market with its latest price on the chosen platform: the market-only view. */
export default function MarketCardsPage() {
  const context = useMarketPlatform();
  const [search, setSearch] = useState(""), [q, setQ] = useState(""), [position, setPosition] = useState("all"), [type, setType] = useState("all");
  const [minRating, setMinRating] = useState(""), [maxPrice, setMaxPrice] = useState(""), [sort, setSort] = useState("price_desc"), [page, setPage] = useState(0);
  // Search as you type, without a request per key press
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);
  const filters: Record<string, string> = {
    sort, limit: String(PAGE), offset: String(page * PAGE), ...(q ? { q } : {}), ...(position === "all" ? {} : { position }), ...(type === "all" ? {} : { type }),
    ...(/^\d+$/.test(minRating) ? { min_rating: minRating } : {}), ...(/^\d+$/.test(maxPrice) ? { max_price: maxPrice } : {}),
  };
  const query = useQuery({ queryKey: [...futKeys.market, "cards", context.platform, filters], queryFn: () => futApi.market.catalogue(context.platform, filters), enabled: context.enabled, placeholderData: keepPreviousData });
  const data = query.data, pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };
  return <MarketShell title="Market cards" {...context}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="market-search">Search</Label><Input id="market-search" placeholder="Player, club, nation or league" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="space-y-2"><Label>Position</Label><Select value={position} onValueChange={reset(setPosition)}><SelectTrigger aria-label="Position"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Card type</Label><Select value={type} onValueChange={reset(setType)}><SelectTrigger aria-label="Card type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="market-min-rating">Min rating</Label><Input id="market-min-rating" inputMode="numeric" placeholder="Any" value={minRating} onChange={e => reset(setMinRating)(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
      <div className="space-y-2"><Label htmlFor="market-max-price">Max price</Label><Input id="market-max-price" inputMode="numeric" placeholder="Any" value={maxPrice} onChange={e => reset(setMaxPrice)(e.target.value.replace(/\D/g, "").slice(0, 8))} /></div>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2"><Label>Sort</Label><Select value={sort} onValueChange={reset(setSort)}><SelectTrigger className="w-52" aria-label="Sort"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SORTS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      {data && <p className="text-sm text-muted-foreground">{numberText(data.total)} cards with a {context.platform === "pc" ? "PC" : "console"} price{data.published_at ? ` · FUT.GG data from ${new Date(data.published_at).toLocaleString()}` : ""}</p>}
    </div>
    <ErrorNotice error={query.error} />
    {query.isPending ? <MarketLoading /> : data && (data.catalogue_cards === 0
      ? <div className="space-y-2 border-y border-border py-10 text-center"><h2 className="font-display text-xl">The market card list hasn't loaded yet</h2><p className="text-sm text-muted-foreground">It refreshes with FUT.GG prices at 06:00 and 18:00 UTC.</p></div>
      : <>
        <DataTable headers={["Card", "Rating", "Pos", "Type", "Club · Nation", "Price", "Since last refresh"]} empty="No cards match these filters." rows={data.cards.map(card => [
          card.market_tracked ? <CardLink id={card.id} name={card.player_name} /> : <span className="font-medium">{card.player_name}</span>,
          <span className="tabular-nums">{card.overall}</span>,
          card.position,
          <Badge variant="outline" className="whitespace-nowrap">{card.version ?? "Card"}</Badge>,
          <span className="text-sm text-muted-foreground">{[card.club, card.nation].filter(Boolean).join(" · ") || "–"}</span>,
          <span className="tabular-nums font-medium">{numberText(card.price)}</span>,
          card.change_pct === null ? <span className="text-muted-foreground">–</span> : <Delta value={card.change_pct} />,
        ])} />
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span>
          <Button variant="outline" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
        <p className="text-xs text-muted-foreground">Prices are FUT.GG's lowest listed price at its last refresh (twice a day), an estimate rather than EA's own market. Cards at 1,000 coins or more open a full analysis page.</p>
      </>)}
  </MarketShell>;
}
