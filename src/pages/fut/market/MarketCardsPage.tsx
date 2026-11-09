import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { futApi, futKeys, MarketCatalogueCard } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardLink, DataTable, Delta, MarketLoading, MarketShell, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
import { cn } from "@/lib/utils";

const PAGE = 50;
const POSITIONS = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"];
const SORTS: Record<string, string> = { price_desc: "Price: high to low", price_asc: "Price: low to high", rating_desc: "Rating", change_desc: "Biggest risers", change_asc: "Biggest fallers", name: "Name" };
const TYPES: Record<string, string> = { all: "All card types", base: "Base (gold/silver/bronze)", promo: "Promo", icon: "Icons", hero: "Heroes" };
// Filters live in the address bar so a search survives a refresh, the back button and a shared link
const FILTER_KEYS = ["q", "position", "type", "min_rating", "max_rating", "min_price", "max_price", "sort", "page"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const DEFAULTS: Partial<Record<FilterKey, string>> = { sort: "price_desc" };

// One-tap searches for the questions people ask most
const PRESETS: { label: string; set: Partial<Record<FilterKey, string>> }[] = [
  { label: "Risers", set: { sort: "change_desc" } },
  { label: "Fallers", set: { sort: "change_asc" } },
  { label: "Icons", set: { type: "icon" } },
  { label: "Heroes", set: { type: "hero" } },
  { label: "Promos", set: { type: "promo" } },
  { label: "85+ under 10k", set: { min_rating: "85", max_price: "10000", sort: "rating_desc" } },
  { label: "Cheapest 90+", set: { min_rating: "90", sort: "price_asc" } },
];

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

function CardName({ card }: { card: MarketCatalogueCard }) {
  return card.market_tracked ? <CardLink id={card.id} name={card.player_name} /> : <span className="font-medium">{card.player_name}</span>;
}

/** Search every card on the FUT.GG market with its latest price on the chosen platform. */
export default function MarketCardsPage() {
  const context = useMarketPlatform();
  const [params, setParams] = useSearchParams();
  const get = (key: FilterKey) => params.get(key) ?? DEFAULTS[key] ?? "";
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  // On phones the detailed filters fold away so the results show without scrolling
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Changing any filter goes back to page 1; default values are left out of the URL
  const update = (changes: Partial<Record<FilterKey, string>>, keepPage = false) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(changes)) {
        if (!value || value === "all" || value === DEFAULTS[key as FilterKey]) next.delete(key);
        else next.set(key, value);
      }
      if (!keepPage) next.delete("page");
      return next;
    }, { replace: true });
  };

  // Search as you type, without a request per key press
  const q = get("q");
  useEffect(() => {
    const t = setTimeout(() => { if (search.trim() !== q) update({ q: search.trim() }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const page = Math.max(0, Number(get("page") || "1") - 1);
  const filters = useMemo(() => {
    const out: Record<string, string> = { sort: get("sort"), limit: String(PAGE), offset: String(page * PAGE) };
    for (const key of ["q", "position", "type", "min_rating", "max_rating", "min_price", "max_price"] as const) { const v = get(key); if (v) out[key] = v; }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, page]);
  const activeFilters = FILTER_KEYS.filter(key => key !== "page" && params.get(key)).length;

  const query = useQuery({ queryKey: [...futKeys.market, "cards", context.platform, filters], queryFn: () => futApi.market.catalogue(context.platform, filters), enabled: context.enabled, placeholderData: keepPreviousData });
  const data = query.data, pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  // Fetch the next page in the background so Next is instant
  const qc = useQueryClient();
  useEffect(() => {
    if (!context.enabled || !data || page + 1 >= pages) return;
    const next = { ...filters, offset: String((page + 1) * PAGE) };
    void qc.prefetchQuery({ queryKey: [...futKeys.market, "cards", context.platform, next], queryFn: () => futApi.market.catalogue(context.platform, next) });
  }, [qc, context.enabled, context.platform, data, page, pages, filters]);
  const goTo = (n: number) => { update({ page: n > 0 ? String(n + 1) : "" }, true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const clearAll = () => { setSearch(""); setParams(new URLSearchParams(), { replace: true }); };
  const presetActive = (set: Partial<Record<FilterKey, string>>) => Object.entries(set).every(([k, v]) => get(k as FilterKey) === v);

  return <MarketShell title="Card Search" showTabs={false} {...context}>
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="market-search"
        type="search"
        // Focus the box on desktop only: on a phone it would throw the keyboard over the results
        autoFocus={typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches}
        aria-label="Search cards"
        placeholder="Search any player, club, nation or league"
        className="h-12 pl-12 pr-12 text-base"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {search && <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1/2 -translate-y-1/2" aria-label="Clear search" onClick={() => setSearch("")}><X className="h-4 w-4" /></Button>}
    </div>

    <div className="flex flex-wrap gap-2" aria-label="Quick searches">
      {PRESETS.map(preset => {
        const on = presetActive(preset.set);
        return <Button key={preset.label} type="button" size="sm" variant={on ? "default" : "outline"} className="rounded-full" aria-pressed={on}
          onClick={() => update(on ? Object.fromEntries(Object.keys(preset.set).map(k => [k, ""])) : preset.set)}>{preset.label}</Button>;
      })}
      {(activeFilters > 0 || search) && <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={clearAll}><X className="mr-1 h-3.5 w-3.5" />Clear all</Button>}
    </div>

    <Button type="button" variant="outline" className="w-full md:hidden" aria-expanded={filtersOpen} aria-controls="market-filters" onClick={() => setFiltersOpen(o => !o)}>
      <SlidersHorizontal className="mr-2 h-4 w-4" />{filtersOpen ? "Hide filters" : "More filters"}
    </Button>
    <div id="market-filters" className={cn("grid-cols-2 gap-3 md:grid md:grid-cols-4 xl:grid-cols-7", filtersOpen ? "grid" : "hidden")}>
      <div className="space-y-1.5"><Label>Position</Label><Select value={get("position") || "all"} onValueChange={v => update({ position: v })}><SelectTrigger aria-label="Position"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Card type</Label><Select value={get("type") || "all"} onValueChange={v => update({ type: v })}><SelectTrigger aria-label="Card type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="market-min-rating">Min rating</Label><Input id="market-min-rating" inputMode="numeric" placeholder="Any" value={get("min_rating")} onChange={e => update({ min_rating: digits(e.target.value, 2) })} /></div>
      <div className="space-y-1.5"><Label htmlFor="market-max-rating">Max rating</Label><Input id="market-max-rating" inputMode="numeric" placeholder="Any" value={get("max_rating")} onChange={e => update({ max_rating: digits(e.target.value, 2) })} /></div>
      <div className="space-y-1.5"><Label htmlFor="market-min-price">Min price</Label><Input id="market-min-price" inputMode="numeric" placeholder="Any" value={get("min_price")} onChange={e => update({ min_price: digits(e.target.value, 8) })} /></div>
      <div className="space-y-1.5"><Label htmlFor="market-max-price">Max price</Label><Input id="market-max-price" inputMode="numeric" placeholder="Any" value={get("max_price")} onChange={e => update({ max_price: digits(e.target.value, 8) })} /></div>
      <div className="col-span-2 space-y-1.5 md:col-span-2 xl:col-span-1"><Label>Sort</Label><Select value={get("sort")} onValueChange={v => update({ sort: v })}><SelectTrigger aria-label="Sort"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SORTS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
    </div>

    {data && <p className={cn("text-sm text-muted-foreground", query.isFetching && "opacity-60")} aria-live="polite">{numberText(data.total)} cards with a {context.platform === "pc" ? "PC" : "console"} price{data.published_at ? ` · FUT.GG data from ${new Date(data.published_at).toLocaleString()}` : ""}</p>}
    <ErrorNotice error={query.error} />
    {query.isPending ? <MarketLoading /> : data && (data.catalogue_cards === 0
      ? <div className="space-y-2 border-y border-border py-10 text-center"><h2 className="font-display text-xl">The market card list hasn't loaded yet</h2><p className="text-sm text-muted-foreground">It refreshes with FUT.GG prices at 06:00 and 18:00 UTC.</p></div>
      : <>
        {/* Phones get a stacked list; wider screens get the full table */}
        <ul className="divide-y divide-border rounded-md border border-border md:hidden">
          {data.cards.length ? data.cards.map(card => <li key={card.id} className="flex items-center gap-3 p-3">
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 font-display leading-none text-primary"><span className="text-lg font-bold tabular-nums">{card.overall}</span><span className="text-[10px] font-semibold">{card.position}</span></span>
            <div className="min-w-0 flex-1">
              <p className="truncate"><CardName card={card} /></p>
              <p className="truncate text-xs text-muted-foreground">{[card.version ?? "Card", card.club, card.nation].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="shrink-0 text-right"><p className="font-medium tabular-nums">{numberText(card.price)}</p>{card.change_pct === null ? <span className="text-xs text-muted-foreground">–</span> : <span className="text-xs"><Delta value={card.change_pct} /></span>}</div>
          </li>) : <li className="py-8 text-center text-muted-foreground">No cards match these filters.</li>}
        </ul>
        <div className="hidden md:block">
          <DataTable headers={["Card", "Rating", "Pos", "Type", "Club · Nation", "Price", "Since last refresh"]} empty="No cards match these filters." rows={data.cards.map(card => [
            <CardName card={card} />,
            <span className="tabular-nums">{card.overall}</span>,
            card.position,
            <Badge variant="outline" className="whitespace-nowrap">{card.version ?? "Card"}</Badge>,
            <span className="text-sm text-muted-foreground">{[card.club, card.nation].filter(Boolean).join(" · ") || "–"}</span>,
            <span className="tabular-nums font-medium">{numberText(card.price)}</span>,
            card.change_pct === null ? <span className="text-muted-foreground">–</span> : <Delta value={card.change_pct} />,
          ])} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page === 0 || query.isFetching} onClick={() => goTo(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span>
          <Button variant="outline" disabled={page + 1 >= pages || query.isFetching} onClick={() => goTo(page + 1)}>Next</Button>
        </div>
        <p className="text-xs text-muted-foreground">Prices are FUT.GG's lowest listed price at its last refresh (twice a day), an estimate rather than EA's own market. Cards at 1,000 coins or more open a full analysis page.</p>
      </>)}
  </MarketShell>;
}
