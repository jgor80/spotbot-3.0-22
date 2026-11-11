import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Package, Trash2 } from "lucide-react";
import { futApi, futKeys, type PackAdviceItem, type PackStoreSeen, type PackVerdict } from "@/lib/futApi";
import { ErrorNotice } from "@/components/fut/FutShared";
import { HelperDownload } from "@/components/fut/HelperDownload";
import { useCardImages } from "@/components/fut/FutCardArt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dateText, Delta, HistoryChart, MarketLoading, MarketShell, Notes, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const VERDICT: Record<PackVerdict, { label: string; className: string }> = {
  buy: { label: "Worth buying", className: "border-success/40 bg-success/10 text-success" },
  only_for_fodder: { label: "Only for SBC fodder", className: "border-warning/40 bg-warning/10 text-warning" },
  skip: { label: "Skip", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  points_only: { label: "FC Points only", className: "text-muted-foreground" },
  no_odds: { label: "Needs odds", className: "text-muted-foreground" },
  no_prices: { label: "No prices yet", className: "text-muted-foreground" },
};

/** "Fri 14 Nov, 18:00 (in 2 d 5 h)" for when a pack leaves the store. */
function endsText(endAt: string, now = Date.now()) {
  const ms = Date.parse(endAt) - now;
  const when = new Date(endAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const h = Math.floor(ms / 3_600_000), d = Math.floor(h / 24);
  const left = ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : d >= 1 ? `${d} d ${h % 24} h` : `${h} h`;
  return `${when} (in ${left})`;
}

const coins = (v: number | null | undefined) => (v == null ? "–" : `${numberText(v)} coins`);
const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);

const TILE: Record<PackAdviceItem["quality"], string> = {
  gold: "from-amber-300 via-yellow-500 to-amber-700 text-amber-950",
  silver: "from-slate-200 via-slate-400 to-slate-600 text-slate-900",
  bronze: "from-orange-300 via-amber-700 to-orange-900 text-orange-50",
  mixed: "from-indigo-400 via-violet-600 to-fuchsia-800 text-white",
};

/** EA's pack picture when the server allows EA images and the helper saw one; else GafferBot's own pack tile. */
function PackPicture({ pack }: { pack: PackAdviceItem }) {
  const images = useCardImages();
  const [broken, setBroken] = useState(false);
  if (images && pack.image_url && !broken)
    return <img src={pack.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-24 w-[4.5rem] shrink-0 object-contain" />;
  return <div aria-hidden="true" className={`flex h-24 w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-md bg-gradient-to-b shadow-inner ${TILE[pack.quality]}`}>
    <Package className="h-7 w-7 opacity-80" />
    {pack.item_count ? <span className="mt-1 text-xs font-bold tabular-nums">{pack.item_count} items</span> : null}
    {pack.rare ? <span className="text-[10px] font-semibold uppercase opacity-80">{pack.rare} rare</span> : null}
  </div>;
}

function PackCard({ pack }: { pack: PackAdviceItem }) {
  const v = VERDICT[pack.verdict];
  return <article className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4">
    <header className="flex items-start gap-3">
      <PackPicture pack={pack} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className={v.className}>{v.label}</Badge>
          {pack.untradeable && <Badge variant="outline">Untradeable</Badge>}
          {pack.unopened && <Badge variant="outline">In My Packs</Badge>}
        </div>
        <h3 className="break-words font-display text-lg font-semibold leading-tight">{pack.name}</h3>
        {pack.description && <p className="text-sm text-muted-foreground">{pack.description}</p>}
        <p className="text-sm text-muted-foreground">
          {[pack.coins ? coins(pack.coins) : null, pack.points ? `${numberText(pack.points)} FC Points` : null].filter(Boolean).join(" or ") || "No price shown"}
          {pack.item_count ? ` · ${pack.item_count} items${pack.rare ? `, ${pack.rare} rare` : ""}` : ""}
        </p>
        <p className={`text-xs ${pack.end_at && Date.parse(pack.end_at) - Date.now() < 24 * 3_600_000 ? "font-medium text-warning" : "text-muted-foreground"}`}>
          <Clock className="mr-1 inline h-3 w-3 align-[-2px]" />{pack.end_at ? `Leaves the store ${endsText(pack.end_at)}` : "No end date from EA"}
        </p>
        {!pack.named && <p className="text-xs text-muted-foreground">EA's name not read yet (store pack {pack.pack_id})</p>}
      </div>
    </header>
    <p className="text-sm">{pack.why}</p>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-muted-foreground">Average value{pack.untradeable ? "" : " after tax"}</dt><dd className="tabular-nums font-medium">{coins(pack.ev_after_tax)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Typical pack</dt><dd className="tabular-nums">{coins(pack.ev_low == null ? null : Math.round(pack.ev_low * (pack.untradeable ? 1 : 0.95)))}</dd></div>
      <div><dt className="text-xs text-muted-foreground">{pack.coins ? "Typical return" : "Value per 100 points"}</dt><dd className="tabular-nums">{pack.coins ? pct(pack.ratio) : coins(pack.value_per_100_points)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Value trend</dt><dd><Delta value={pack.trend_pct} /></dd></div>
    </dl>
    {pack.tips.length > 0 && <div className="space-y-1"><h4 className="flex items-center gap-1 text-sm font-semibold"><Clock className="h-4 w-4" />When</h4><ul className="list-disc space-y-1 pl-5 text-sm">{pack.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">Odds and how it was priced</summary>
      <div className="mt-3 space-y-3 overflow-x-auto">
        <DataTable headers={["EA's line", "Odds", "Ratings", "Typical card", "Average card"]} rows={pack.lines.map(l => [l.label, l.odds_text, l.covers ?? "–", l.value_low == null ? <span className="text-muted-foreground">{l.note ?? "–"}</span> : coins(Math.round(l.value_low)), l.value_high == null ? "–" : coins(Math.round(l.value_high))])} empty="The helper hasn't seen this pack's odds yet." />
        {pack.fodder_items > 0 && <p className="text-muted-foreground">The other {pack.fodder_items} items count as fodder at about {coins(pack.fodder_each)} each.</p>}
        {pack.notes.length > 0 && <Notes items={pack.notes} />}
        {pack.history.length > 1 && <HistoryChart data={pack.history} field="value" label="Average value" />}
      </div>
    </details>
  </article>;
}

/** What the helper saw in the Store (addresses and field names only), so a store it couldn't read can be fixed. */
function SeenStore({ seen, missed }: { seen: PackStoreSeen[]; missed: boolean }) {
  return <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-left text-sm">
    <h3 className="font-semibold">{missed ? "The helper saw the Store but couldn't read any packs from it" : "Store answers the helper saw"}</h3>
    {missed && <p className="text-muted-foreground">EA's FC 27 store doesn't look the way the helper expects yet. Send a screenshot of this box and it can be taught to read it. Only addresses and field names are listed, never your data.</p>}
    <ul className="space-y-2">{seen.map((x, i) => <li key={i} className="min-w-0 border-t border-border pt-2">
      <p className="break-all font-mono text-xs">{x.path}</p>
      <p className="text-xs text-muted-foreground">{x.packs} packs, {x.odds} odds lines read{x.at ? ` · ${dateText(x.at)}` : ""}</p>
      <p className="break-words font-mono text-xs text-muted-foreground">Fields: {x.keys.join(", ") || "–"}</p>
    </li>)}</ul>
  </div>;
}

function Empty() {
  return <div className="space-y-4 border-y border-border py-10 text-center">
    <Package className="mx-auto h-10 w-10 text-muted-foreground" />
    <h2 className="font-display text-xl">No packs yet</h2>
    <ol className="mx-auto max-w-lg list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground">
      <li>Install the XI Lab helper (v0.12.0 or newer), reload it in chrome://extensions, then reload the Web App and connect the helper in Market Lab → Import prices.</li>
      <li>In the EA FC Web App, open <strong>Store → Packs</strong> and look through the tabs.</li>
      <li>Open a pack's odds (Pack Probability) so the helper can read them.</li>
      <li>Come back here: the helper uploads within a few minutes.</li>
    </ol>
    <div className="flex justify-center"><HelperDownload compact /></div>
  </div>;
}

export default function PackAdvisorPage() {
  const context = useMarketPlatform(), qc = useQueryClient();
  const query = useQuery({ queryKey: [...futKeys.packs, context.platform], queryFn: () => futApi.packs.advice(context.platform), enabled: context.enabled, staleTime: 2 * 60_000, refetchInterval: 3 * 60_000 });
  const clear = useMutation({ mutationFn: () => futApi.packs.clear(context.platform), onSuccess: () => qc.invalidateQueries({ queryKey: futKeys.packs }) });
  const d = query.data;
  const opens = d?.pulls.opens ?? [];
  const seen = d?.shape?.seen ?? [];
  // Packs that expire while the page is open drop off at the next minute tick (the server hides them on every load).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const live = (d?.packs ?? []).filter(p => !p.end_at || Date.parse(p.end_at) > now);
  return <MarketShell title="Pack Advisor" showTabs={false} {...context}>
    <ErrorNotice error={query.error || clear.error} />
    <p className="text-sm text-muted-foreground">Which store packs are worth your coins, and when to open them. The helper copies the packs, prices and EA's pack odds from the Store screen when you open it; card values come from FUT.GG's latest prices. It never buys or opens anything.</p>
    {query.isPending ? <MarketLoading /> : d && (live.length === 0 && opens.length === 0 ? <>{seen.length > 0 && <SeenStore seen={seen} missed />}<Empty /></> : <>
      <p className="text-xs text-muted-foreground">Store seen {d.captured_at ? dateText(d.captured_at) : "–"} · Prices from FUT.GG {d.prices_at ? dateText(d.prices_at) : "not loaded yet"} · Estimates, not checked against FC 27 yet</p>
      <Section title="Live in the store">
        {live.length ? <div className="grid items-start gap-4 lg:grid-cols-2">{live.map(p => <PackCard key={p.pack_id} pack={p} />)}</div>
          : <p className="text-sm text-muted-foreground">No packs live in the store for this platform. Open Store → Packs in the Web App.</p>}
        {(d.hidden ?? 0) > 0 && <p className="text-xs text-muted-foreground">{d.hidden} older {d.hidden === 1 ? "pack is" : "packs are"} hidden: expired, not started yet, or missing from the latest store list.</p>}
      </Section>
      <Section title="Your pack openings">
        <div className="overflow-x-auto"><DataTable headers={["Pack", "Opened", "Items", "Sell value after tax", "Untradeable value", "Profit"]} rows={opens.map(o => [o.pack_name, dateText(o.opened_at), o.items, coins(o.after_tax), coins(o.untradeable_value), o.profit == null ? "–" : <Delta value={o.profit} unit=" coins" />])} empty="Open a pack in the Web App and the helper records what it gave you." /></div>
      </Section>
      <Section title="How it's worked out">
        <Notes items={d.model} />
        {seen.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Store answers the helper saw</summary><div className="mt-2"><SeenStore seen={seen} missed={false} /></div></details>}
        {d.shape && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Store fields the helper saw</summary><p className="mt-2 break-words font-mono text-xs text-muted-foreground">{[...(d.shape.pack_keys ?? []), ...(d.shape.odds_keys ?? []), ...(d.shape.category_keys ?? [])].join(", ") || "–"}</p></details>}
        <Button variant="outline" size="sm" disabled={clear.isPending} onClick={() => { if (window.confirm("Delete the stored packs and pack openings for this platform? The helper uploads the store again next time you open it.")) clear.mutate(); }}><Trash2 className="mr-2 h-4 w-4" />Clear stored packs</Button>
      </Section>
    </>)}
  </MarketShell>;
}
