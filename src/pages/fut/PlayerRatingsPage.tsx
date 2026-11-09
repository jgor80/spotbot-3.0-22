import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, Columns3, Search, SlidersHorizontal, X } from "lucide-react";
import { futApi, futKeys, FinderResult, PlayerCard } from "@/lib/futApi";
import {
  accelerateLabel, ACCELERATE_TYPES, ALL_STATS, cleanPlayerQuery, CARD_STATS, coins, DETAIL_STATS, FACE_STATS, GK_FACE, PLAYER_POSITIONS,
  PLAYSTYLES, type PlayerQuery, statDef, statLabel,
} from "@/lib/futStats";
import { ErrorNotice, FutShell } from "@/components/fut/FutShared";
import { PlayerFinder } from "@/components/fut/PlayerFinder";
import { MarketLoading, numberText, useMarketPlatform } from "@/components/fut/market/MarketShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FutCardArt, type CardArtCard } from "@/components/fut/FutCardArt";

const art = (card: PlayerCard): CardArtCard => ({ name: card.player_name, rating: card.overall, position: card.position, version: card.version, is_icon: card.is_icon, is_hero: card.is_hero, ea_item_id: card.ea_item_id });

const PAGE = 50;
const COLUMNS_KEY = "fut-player-ratings-columns";
const TYPES: Record<string, string> = { all: "All card types", base: "Base (gold/silver/bronze)", promo: "Promo", icon: "Icons", hero: "Heroes" };
const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);
const num = (value: string) => value === "" ? null : Number(value);
const defaultDirection = (sort: string) => sort === "name" || sort === "price" ? "asc" : "desc";

/** Colour for a 1-99 stat: green at the top, red at the bottom. */
function statTone(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  if (v >= 90) return "font-semibold text-success";
  if (v >= 80) return "text-success";
  if (v >= 65) return "text-foreground";
  if (v >= 50) return "text-warning";
  return "text-destructive";
}
function StatValue({ card, stat }: { card: PlayerCard; stat: string }) {
  const v = card.stats?.[stat];
  if (stat === "height_cm") return <span className="tabular-nums">{v ?? "–"}</span>;
  if (stat === "weak_foot" || stat === "skill_moves") return <span className="tabular-nums">{v ? `${v}★` : "–"}</span>;
  if (stat === "total_stats" || stat === "total_igs") return <span className="tabular-nums">{v ?? "–"}</span>;
  return <span className={cn("tabular-nums", statTone(v))}>{v ?? "–"}</span>;
}

function readQuery(raw: string | null): PlayerQuery {
  if (!raw) return {};
  try { return cleanPlayerQuery(JSON.parse(raw)); } catch { return {}; }
}
/** Only the fields that are set, so the address bar stays short. */
function compact(q: PlayerQuery): PlayerQuery {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === null || v === undefined || v === false || (Array.isArray(v) && !v.length)) continue;
    if (k === "include_alt_positions" && v === true) continue;
    out[k] = v;
  }
  return out as PlayerQuery;
}

interface Chip { label: string; clear: (q: PlayerQuery) => PlayerQuery }
function chipsFor(q: PlayerQuery): Chip[] {
  const out: Chip[] = [];
  for (const b of q.minimums ?? []) out.push({ label: `${statLabel(b.stat)} ${b.value}+`, clear: x => ({ ...x, minimums: x.minimums?.filter(m => m.stat !== b.stat) }) });
  for (const b of q.maximums ?? []) out.push({ label: `${statLabel(b.stat)} up to ${b.value}`, clear: x => ({ ...x, maximums: x.maximums?.filter(m => m.stat !== b.stat) }) });
  for (const p of q.playstyles ?? []) out.push({ label: p, clear: x => ({ ...x, playstyles: x.playstyles?.filter(s => s !== p) }) });
  for (const p of q.playstyles_plus ?? []) out.push({ label: `${p}+`, clear: x => ({ ...x, playstyles_plus: x.playstyles_plus?.filter(s => s !== p) }) });
  for (const k of ["league", "nation", "club"] as const) if (q[k]) out.push({ label: q[k]!, clear: x => ({ ...x, [k]: null }) });
  if (q.positions && q.positions.length > 1) out.push({ label: q.positions.join("/"), clear: x => ({ ...x, positions: [] }) });
  if (q.weights?.length) out.push({ label: `Ranked on ${[...q.weights].sort((a, b) => b.weight - a.weight).map(w => statLabel(w.stat).toLowerCase()).join(", ")}`, clear: x => ({ ...x, weights: [], sort: x.sort === "fit" ? null : x.sort }) });
  return out;
}

function CardDetail({ card }: { card: PlayerCard }) {
  const gk = card.position === "GK";
  const groups = ["Pace", "Shooting", "Passing", "Dribbling", "Defending", "Physical", "Goalkeeping"].filter(g => gk ? g === "Goalkeeping" || g === "Physical" || g === "Pace" : g !== "Goalkeeping");
  const facts = [
    card.foot && `${card.foot === "left" ? "Left" : "Right"} foot`, card.weak_foot && `${card.weak_foot}★ weak foot`, card.skill_moves && `${card.skill_moves}★ skills`,
    card.height_cm && `${card.height_cm} cm`, card.accelerate_type && `AcceleRATE: ${accelerateLabel(card.accelerate_type)}`,
    card.alt_positions?.length ? `Also plays ${card.alt_positions.join(", ")}` : null, card.league, card.nation,
  ].filter(Boolean) as string[];
  if (!card.has_stats) return <p className="text-sm text-muted-foreground">Full stats for this card haven't been downloaded yet. They fill in over a few hours after a card is released.</p>;
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
      {groups.map(group => <div key={group} className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h4>
        <dl className="space-y-0.5 text-sm">
          {DETAIL_STATS.filter(s => s.group === group).map(s => <div key={s.key} className="flex justify-between gap-2"><dt className="truncate text-muted-foreground">{s.label}</dt><dd><StatValue card={card} stat={s.key} /></dd></div>)}
        </dl>
      </div>)}
    </div>
    {(card.playstyles_plus.length > 0 || card.playstyles.length > 0) && <div className="flex flex-wrap gap-1.5">
      {card.playstyles_plus.map(p => <Badge key={p} className="bg-fut text-fut-foreground hover:bg-fut">{p}+</Badge>)}
      {card.playstyles.map(p => <Badge key={p} variant="outline">{p}</Badge>)}
    </div>}
    {card.roles.length > 0 && <p className="text-sm"><span className="text-muted-foreground">Roles: </span>{card.roles.map(r => `${r.role}${r.level === "plusplus" ? "++" : "+"} (${r.position})`).join(", ")}</p>}
    {card.market_tracked && <Button asChild variant="outline" size="sm"><Link to={`/fut/market/card/${encodeURIComponent(card.id)}`}>Price history and analysis</Link></Button>}
  </div>;
}

/** Every FUT card with its full stats: search, filter, sort by any stat, or describe the player you want. */
export default function PlayerRatingsPage() {
  const context = useMarketPlatform();
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readQuery(params.get("s")), [params]);
  const page = Math.max(0, Number(params.get("page") || "1") - 1);
  const [search, setSearch] = useState(query.text ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>(() => { try { const v = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((k: unknown) => typeof k === "string" && statDef(k)) : []; } catch { return []; } });
  const [minStat, setMinStat] = useState("acceleration");
  const [minValue, setMinValue] = useState("");
  useEffect(() => { try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(extra)); } catch { /* columns stay for this visit */ } }, [extra]);

  const setQuery = (next: PlayerQuery, keepPage = false) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      const c = compact(cleanPlayerQuery(next));
      if (Object.keys(c).length) p.set("s", JSON.stringify(c)); else p.delete("s");
      if (!keepPage) p.delete("page");
      return p;
    }, { replace: true });
  };
  const patch = (changes: Partial<PlayerQuery>) => setQuery({ ...query, ...changes });

  // Search as you type, without a request per key press
  useEffect(() => {
    const t = setTimeout(() => { if ((search.trim() || null) !== (query.text ?? null)) patch({ text: search.trim() || null }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const key = [...futKeys.all, "players", context.platform, compact(query), page] as const;
  const result = useQuery({ queryKey: key, queryFn: () => futApi.players.search(query, context.platform, page, PAGE), enabled: context.enabled, placeholderData: keepPreviousData });
  const qc = useQueryClient();
  const data = result.data, pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  useEffect(() => {
    if (!context.enabled || !data || page + 1 >= pages) return;
    void qc.prefetchQuery({ queryKey: [...futKeys.all, "players", context.platform, compact(query), page + 1], queryFn: () => futApi.players.search(query, context.platform, page + 1, PAGE) });
  }, [qc, context.enabled, context.platform, data, page, pages, query]);

  const onFinder = (r: FinderResult) => {
    // The chat already ran the search: show it without asking again
    const q = cleanPlayerQuery(r.query);
    qc.setQueryData([...futKeys.all, "players", context.platform, compact(q), 0], r.result);
    setSearch(q.text ?? "");
    setQuery(q);
    setOpen(null);
  };
  const clearAll = () => { setSearch(""); setParams(new URLSearchParams(), { replace: true }); };
  const goTo = (n: number) => { setParams(prev => { const p = new URLSearchParams(prev); if (n > 0) p.set("page", String(n + 1)); else p.delete("page"); return p; }, { replace: true }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const sort = data?.sort ?? query.sort ?? (query.weights?.length ? "fit" : "overall");
  const direction = data?.direction ?? query.direction ?? defaultDirection(sort);
  const sortBy = (s: string) => patch(s === sort ? { sort: s, direction: direction === "desc" ? "asc" : "desc" } : { sort: s, direction: null });
  const gkOnly = query.positions?.length === 1 && query.positions[0] === "GK";
  const faceCols = gkOnly ? GK_FACE.map(g => ({ key: g.key, short: g.short })) : FACE_STATS.map(s => ({ key: s.key, short: s.short }));
  // Extra columns: the user's picks, plus whatever the search ranks or sorts on
  const shown = useMemo(() => {
    const base = new Set([...faceCols.map(c => c.key), "overall"]);
    const want = [...extra, ...(query.weights ?? []).map(w => w.stat), ...(statDef(sort) ? [sort] : []), ...(query.minimums ?? []).map(m => m.stat)];
    return [...new Set(want)].filter(k => !base.has(k) && statDef(k));
  }, [extra, query.weights, query.minimums, sort, faceCols]);
  const hasFit = !!query.weights?.length;
  const chips = chipsFor(query);
  const activeCount = Object.keys(compact(query)).length;

  const SortHead = ({ id, label, className, title }: { id: string; label: string; className?: string; title?: string }) => (
    <TableHead className={cn("whitespace-nowrap", className)} aria-sort={sort === id ? (direction === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" title={title ?? `Sort by ${statLabel(id)}`} className={cn("inline-flex items-center gap-0.5 hover:text-foreground", sort === id && "font-semibold text-foreground")} onClick={() => sortBy(id)}>
        {label}{sort === id && (direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
  const columns = 4 + faceCols.length + shown.length + (hasFit ? 1 : 0) + 1;

  return <FutShell title="Player Ratings" actions={<Select value={context.platform} onValueChange={context.setPlatform}><SelectTrigger className="w-36" aria-label="Platform"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="console">Console</SelectItem><SelectItem value="pc">PC</SelectItem></SelectContent></Select>}>
    <PlayerFinder platform={context.platform} query={query} onResult={onFinder} onReset={clearAll} />

    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label="Search players" placeholder="Search any player, club, nation, league or card type" className="h-12 pl-12 pr-12 text-base" value={search} onChange={e => setSearch(e.target.value)} />
      {search && <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1/2 -translate-y-1/2" aria-label="Clear search" onClick={() => setSearch("")}><X className="h-4 w-4" /></Button>}
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="space-y-1.5"><Label>Position</Label><Select value={query.positions?.length === 1 ? query.positions[0] : query.positions?.length ? "multi" : "all"} onValueChange={v => patch({ positions: v === "all" || v === "multi" ? [] : [v] })}><SelectTrigger aria-label="Position"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{query.positions && query.positions.length > 1 && <SelectItem value="multi">{query.positions.join("/")}</SelectItem>}{PLAYER_POSITIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Card type</Label><Select value={query.card_type ?? "all"} onValueChange={v => patch({ card_type: v === "all" ? null : v as PlayerQuery["card_type"] })}><SelectTrigger aria-label="Card type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="pr-max-price">Max price</Label><Input id="pr-max-price" inputMode="numeric" placeholder="Any" value={query.max_price ?? ""} onChange={e => patch({ max_price: num(digits(e.target.value, 8)) })} /></div>
      <div className="space-y-1.5"><Label>Sort by</Label>
        <div className="flex gap-1">
          <Select value={sort} onValueChange={v => patch({ sort: v, direction: null })}><SelectTrigger aria-label="Sort by" className="min-w-0"><SelectValue /></SelectTrigger><SelectContent>
            <SelectGroup>{hasFit && <SelectItem value="fit">Best fit</SelectItem>}<SelectItem value="overall">Overall</SelectItem><SelectItem value="price">Price</SelectItem><SelectItem value="name">Name</SelectItem></SelectGroup>
            <SelectGroup><SelectLabel>Face stats</SelectLabel>{FACE_STATS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectGroup>
            {["Pace", "Shooting", "Passing", "Dribbling", "Defending", "Physical", "Goalkeeping"].map(g => <SelectGroup key={g}><SelectLabel>{g}</SelectLabel>{DETAIL_STATS.filter(s => s.group === g).map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectGroup>)}
            <SelectGroup><SelectLabel>Card</SelectLabel>{CARD_STATS.filter(s => s.key !== "overall").map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectGroup>
          </SelectContent></Select>
          <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label={direction === "asc" ? "Lowest first" : "Highest first"} onClick={() => patch({ sort, direction: direction === "desc" ? "asc" : "desc" })}>{direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" aria-expanded={filtersOpen} aria-controls="pr-filters" onClick={() => setFiltersOpen(o => !o)}><SlidersHorizontal className="mr-2 h-4 w-4" />{filtersOpen ? "Fewer filters" : "More filters"}<ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", filtersOpen && "rotate-180")} /></Button>
      <Popover>
        <PopoverTrigger asChild><Button type="button" variant="outline" size="sm"><Columns3 className="mr-2 h-4 w-4" />Columns{extra.length ? ` (${extra.length})` : ""}</Button></PopoverTrigger>
        <PopoverContent align="start" className="max-h-96 w-72 overflow-y-auto">
          <p className="mb-2 text-sm font-medium">Show these stats as columns</p>
          {[...DETAIL_STATS, ...CARD_STATS.filter(s => s.key !== "overall")].map(s => <label key={s.key} className="flex items-center gap-2 py-1 text-sm">
            <Checkbox checked={extra.includes(s.key)} onCheckedChange={on => setExtra(list => on ? [...list, s.key] : list.filter(k => k !== s.key))} />{s.label}
          </label>)}
        </PopoverContent>
      </Popover>
      {chips.map(chip => <Badge key={chip.label} variant="secondary" className="gap-1 pr-1 font-normal">{chip.label}<button type="button" aria-label={`Remove ${chip.label}`} className="rounded-full p-0.5 hover:bg-background" onClick={() => setQuery(chip.clear(query))}><X className="h-3 w-3" /></button></Badge>)}
      {(activeCount > 0 || search) && <Button type="button" size="sm" variant="ghost" onClick={clearAll}><X className="mr-1 h-3.5 w-3.5" />Clear all</Button>}
    </div>

    {filtersOpen && <div id="pr-filters" className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 md:grid-cols-4 xl:grid-cols-6">
      <div className="space-y-1.5"><Label htmlFor="pr-min-rating">Min rating</Label><Input id="pr-min-rating" inputMode="numeric" placeholder="Any" value={query.min_rating ?? ""} onChange={e => patch({ min_rating: num(digits(e.target.value, 2)) })} /></div>
      <div className="space-y-1.5"><Label htmlFor="pr-max-rating">Max rating</Label><Input id="pr-max-rating" inputMode="numeric" placeholder="Any" value={query.max_rating ?? ""} onChange={e => patch({ max_rating: num(digits(e.target.value, 2)) })} /></div>
      <div className="space-y-1.5"><Label htmlFor="pr-min-price">Min price</Label><Input id="pr-min-price" inputMode="numeric" placeholder="Any" value={query.min_price ?? ""} onChange={e => patch({ min_price: num(digits(e.target.value, 8)) })} /></div>
      <div className="space-y-1.5"><Label>Foot</Label><Select value={query.foot ?? "any"} onValueChange={v => patch({ foot: v === "any" ? null : v as "left" | "right" })}><SelectTrigger aria-label="Foot"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Either foot</SelectItem><SelectItem value="left">Left</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent></Select></div>
      {(["weak_foot", "skill_moves"] as const).map(stat => {
        const current = query.minimums?.find(m => m.stat === stat)?.value;
        return <div key={stat} className="space-y-1.5"><Label>{stat === "weak_foot" ? "Weak foot" : "Skill moves"}</Label><Select value={current ? String(current) : "any"} onValueChange={v => patch({ minimums: [...(query.minimums ?? []).filter(m => m.stat !== stat), ...(v === "any" ? [] : [{ stat, value: Number(v) }])] })}><SelectTrigger aria-label={stat === "weak_foot" ? "Weak foot" : "Skill moves"}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem>{[2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}★ or more</SelectItem>)}</SelectContent></Select></div>;
      })}
      <div className="space-y-1.5"><Label>PlayStyle</Label><Select value="" onValueChange={v => patch(v.endsWith("+") ? { playstyles_plus: [...new Set([...(query.playstyles_plus ?? []), v.slice(0, -1)])] } : { playstyles: [...new Set([...(query.playstyles ?? []), v])] })}><SelectTrigger aria-label="Add a PlayStyle"><SelectValue placeholder="Add a PlayStyle" /></SelectTrigger><SelectContent>{PLAYSTYLES.map(p => <Fragment key={p}><SelectItem value={p}>{p}</SelectItem><SelectItem value={`${p}+`}>{p}+</SelectItem></Fragment>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>AcceleRATE</Label><Select value={query.accelerate_types?.length === 1 ? query.accelerate_types[0] : "any"} onValueChange={v => patch({ accelerate_types: v === "any" ? [] : [v] })}><SelectTrigger aria-label="AcceleRATE"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem>{ACCELERATE_TYPES.map(a => <SelectItem key={a} value={a}>{accelerateLabel(a)}</SelectItem>)}</SelectContent></Select></div>
      <div className="col-span-2 space-y-1.5">
        <Label>Stat at least</Label>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const v = Number(minValue); if (!minValue || !Number.isFinite(v)) return; patch({ minimums: [...(query.minimums ?? []).filter(m => m.stat !== minStat), { stat: minStat, value: v }] }); setMinValue(""); }}>
          <Select value={minStat} onValueChange={setMinStat}><SelectTrigger aria-label="Stat" className="min-w-0"><SelectValue /></SelectTrigger><SelectContent>{ALL_STATS.filter(s => s.key !== "weak_foot" && s.key !== "skill_moves").map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent></Select>
          <Input inputMode="numeric" aria-label="Minimum value" placeholder="80" className="w-20" value={minValue} onChange={e => setMinValue(digits(e.target.value, 3))} />
          <Button type="submit" variant="outline" disabled={!minValue}>Add</Button>
        </form>
      </div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={!!query.owned_only} onCheckedChange={v => patch({ owned_only: v })} />Only cards in my club</label>
      <label className="flex items-center gap-2 text-sm"><Switch checked={!!query.priced_only} onCheckedChange={v => patch({ priced_only: v })} />Only cards on the market</label>
      <label className="flex items-center gap-2 text-sm"><Switch checked={query.include_alt_positions !== false} onCheckedChange={v => patch({ include_alt_positions: v })} />Include other positions</label>
    </div>}

    {data && <p className={cn("text-sm text-muted-foreground", result.isFetching && "opacity-60")} aria-live="polite">
      {numberText(data.total)} card{data.total === 1 ? "" : "s"}{data.with_stats < data.catalogue_cards ? ` · full stats for ${numberText(data.with_stats)} of ${numberText(data.catalogue_cards)} cards so far (the rest fill in over the next few hours)` : ""}{data.published_at ? ` · ${context.platform === "pc" ? "PC" : "Console"} prices from FUT.GG, ${new Date(data.published_at).toLocaleString()}` : ""}
    </p>}
    <ErrorNotice error={result.error} />
    {result.isPending ? <MarketLoading /> : data && (data.catalogue_cards === 0
      ? <div className="space-y-2 border-y border-border py-10 text-center"><h2 className="font-display text-xl">The card list hasn't loaded yet</h2><p className="text-sm text-muted-foreground">It refreshes with FUT.GG prices at 06:00 and 18:00 UTC.</p></div>
      : <>
        {/* Phones: a stacked list with the six face stats; wider screens: the sortable table */}
        <ul className="divide-y divide-border rounded-md border border-border md:hidden">
          {data.cards.length ? data.cards.map(card => {
            const gk = card.position === "GK";
            const face = gk ? GK_FACE.map(g => ({ key: g.key, short: g.short })) : FACE_STATS.map(s => ({ key: s.key, short: s.short }));
            return <li key={card.id} className="p-3">
              <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={open === card.id} onClick={() => setOpen(o => o === card.id ? null : card.id)}>
                <FutCardArt card={art(card)} compact className="w-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{card.player_name}{card.owned && <Badge variant="outline" className="ml-2 align-middle text-[10px]">Owned</Badge>}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[card.version ?? "Card", card.club].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 text-right"><span className="block font-medium tabular-nums">{card.price != null ? coins(card.price) : "–"}</span>{hasFit && card.fit != null && <span className="block text-xs text-primary">Fit {card.fit}</span>}</span>
              </button>
              <div className="mt-2 grid grid-cols-6 gap-1 text-center text-xs">{face.map(f => <div key={f.key}><div className="text-[10px] text-muted-foreground">{f.short}</div><StatValue card={card} stat={f.key} /></div>)}</div>
              {open === card.id && <div className="mt-3 border-t border-border pt-3"><CardDetail card={card} /></div>}
            </li>;
          }) : <li className="py-8 text-center text-muted-foreground">No cards match these filters.</li>}
        </ul>
        <div className="hidden md:block">
          <Table>
            <TableHeader><TableRow>
              <SortHead id="name" label="Card" />
              <SortHead id="overall" label="OVR" />
              <TableHead>Pos</TableHead>
              <SortHead id="price" label="Price" />
              {hasFit && <SortHead id="fit" label="Fit" title="How well the card matches your search (weighted average of the stats it ranks on)" />}
              {faceCols.map(c => <SortHead key={c.key} id={c.key} label={c.short} className="text-center" />)}
              {shown.map(k => <SortHead key={k} id={k} label={statDef(k)?.short ?? k} title={`Sort by ${statLabel(k)}`} className="text-center" />)}
              <TableHead><span className="sr-only">Details</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.cards.length ? data.cards.map(card => <Fragment key={card.id}>
                <TableRow className="cursor-pointer" onClick={() => setOpen(o => o === card.id ? null : card.id)}>
                  <TableCell className="max-w-[19rem]"><div className="flex items-center gap-3"><FutCardArt card={art(card)} compact className="w-9" /><div className="min-w-0">
                    <p className="truncate font-medium">{card.player_name}{card.owned && <Badge variant="outline" className="ml-2 text-[10px]">Owned</Badge>}</p>
                    <p className="truncate text-xs text-muted-foreground">{[card.version ?? "Card", card.club, card.nation].filter(Boolean).join(" · ")}</p>
                  </div></div></TableCell>
                  <TableCell className="font-display text-base font-semibold tabular-nums">{card.overall}</TableCell>
                  <TableCell className="whitespace-nowrap">{card.position}{card.alt_positions?.length ? <span className="text-xs text-muted-foreground"> {card.alt_positions.join(" ")}</span> : null}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{card.price != null ? numberText(card.price) : <span className="text-xs text-muted-foreground">Not on market</span>}</TableCell>
                  {hasFit && <TableCell className="font-semibold tabular-nums text-primary">{card.fit ?? "–"}</TableCell>}
                  {faceCols.map((c, i) => <TableCell key={c.key} className="text-center"><StatValue card={card} stat={!gkOnly && card.position === "GK" ? GK_FACE[i]!.key : c.key} /></TableCell>)}
                  {shown.map(k => <TableCell key={k} className="text-center"><StatValue card={card} stat={k} /></TableCell>)}
                  <TableCell><ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open === card.id && "rotate-180")} /></TableCell>
                </TableRow>
                {open === card.id && <TableRow className="hover:bg-transparent"><TableCell colSpan={columns} className="bg-muted/30"><CardDetail card={card} /></TableCell></TableRow>}
              </Fragment>) : <TableRow><TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">No cards match these filters.</TableCell></TableRow>}
            </TableBody>
          </Table>
          {!gkOnly && data.cards.some(c => c.position === "GK") && <p className="mt-2 text-xs text-muted-foreground">Goalkeepers show their keeper stats (DIV, HAN, KIC, REF, SPD, POS) in the six face-stat columns.</p>}
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page === 0 || result.isFetching} onClick={() => goTo(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span>
          <Button variant="outline" disabled={page + 1 >= pages || result.isFetching} onClick={() => goTo(page + 1)}>Next</Button>
        </div>
        <p className="text-xs text-muted-foreground">Card stats and prices come from FUT.GG (prices are its lowest listed price at the last refresh, twice a day). Untradeable SBC and objective cards show "Not on market".</p>
      </>)}
  </FutShell>;
}
