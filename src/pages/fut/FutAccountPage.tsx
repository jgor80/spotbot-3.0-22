import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ListTodo, Trash2, Users, Wallet } from "lucide-react";
import { futApi, futKeys, type ClubShare, type AccountItem, type AccountOverview, type AccountSection, type AccountTrade, type AccountTradeState } from "@/lib/futApi";
import { FutCardArt } from "@/components/fut/FutCardArt";
import { ErrorNotice } from "@/components/fut/FutShared";
import { HelperDownload } from "@/components/fut/HelperDownload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDiscordLink } from "@/hooks/useDiscordLink";
import { DataTable, dateText, HistoryChart, MarketLoading, MarketShell, numberText, Section, useMarketPlatform } from "@/components/fut/market/MarketShared";

const coins = (v: number | null | undefined) => (v == null ? "–" : `${numberText(v)}`);

/** "in 5h", "in 2d", "ended". */
function endsText(iso: string | null, now = Date.now()) {
  if (!iso) return "–";
  const h = (Date.parse(iso) - now) / 3_600_000;
  if (h <= 0) return "ended";
  if (h < 1) return `in ${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `in ${Math.round(h)}h`;
  return `in ${Math.round(h / 24)}d`;
}

const STATE: Record<AccountTradeState, { label: string; className: string }> = {
  sold: { label: "Sold", className: "border-success/40 bg-success/10 text-success" },
  won: { label: "Won", className: "border-success/40 bg-success/10 text-success" },
  winning: { label: "Winning", className: "border-success/40 text-success" },
  listed: { label: "Listed", className: "border-primary/40 text-primary" },
  expired: { label: "Expired", className: "border-warning/40 bg-warning/10 text-warning" },
  outbid: { label: "Outbid", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  lost: { label: "Lost", className: "text-muted-foreground" },
  unlisted: { label: "Not listed", className: "text-muted-foreground" },
  watching: { label: "Watching", className: "text-muted-foreground" },
};
const StateBadge = ({ state }: { state: AccountTradeState }) => <Badge variant="outline" className={STATE[state].className}>{STATE[state].label}</Badge>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="min-w-0 rounded-lg border border-border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 break-words font-display text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>;
}

const Seen = ({ at }: { at: string | null }) => <p className="text-xs text-muted-foreground">{at ? `As the Web App showed it ${dateText(at)}` : "Not captured yet."}</p>;

function CardName({ item }: { item: AccountItem }) {
  const player = (item.item_type ?? "player").toLowerCase() === "player" && item.rating != null;
  return <div className="flex min-w-0 items-center gap-2.5">
    {player && <FutCardArt card={{ name: item.name, rating: item.rating, position: item.position, version: item.version, ea_item_id: item.ea_item_id }} compact className="w-9" />}
    <div className="min-w-0"><span className="font-medium">{item.name}</span>{item.version && <span className="ml-1 text-xs text-muted-foreground">{item.version}</span>}{item.untradeable && <Badge variant="outline" className="ml-2 text-[10px]">Untradeable</Badge>}</div>
  </div>;
}

function TradeTable({ items, watch }: { items: AccountTrade[]; watch: boolean }) {
  return <div className="overflow-x-auto"><DataTable
    headers={["Card", "Rating", "Status", watch ? "Current bid" : "Buy Now", watch ? "Buy Now" : "Sold for / bid", "FUT.GG price", "Ends"]}
    rows={items.map(i => [<CardName item={i} />, i.rating ?? "–", <StateBadge state={i.state} />, coins(watch ? i.current_bid ?? i.starting_bid : i.buy_now), coins(watch ? i.buy_now : i.current_bid), coins(i.price), endsText(i.expires_at)])}
    empty={watch ? "Nothing in your Transfer Targets." : "Your transfer list is empty."} /></div>;
}

function Empty() {
  return <div className="space-y-4 border-y border-border py-10 text-center">
    <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
    <h2 className="font-display text-xl">No account data yet</h2>
    <ol className="mx-auto max-w-lg list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground">
      <li>Install the XI Lab helper (v0.6.0 or newer) and connect it in Market Lab → Import prices.</li>
      <li>Sign in to the EA FC Web App. Your coins, FC Points, transfer list, watchlist and unassigned items load by themselves.</li>
      <li>Open <strong>SBCs</strong> and <strong>Objectives</strong> once so the helper can read them too.</li>
      <li>Come back here: the helper uploads within a few minutes.</li>
    </ol>
    <div className="flex justify-center"><HelperDownload compact /></div>
  </div>;
}

const SECTION_LABEL: Record<AccountSection, string> = { balance: "Balance", profile: "Club", tradepile: "Transfer list", watchlist: "Transfer Targets", unassigned: "Unassigned", sbcs: "SBCs", sbc_challenges: "SBC challenges", evolutions: "Evolutions", objectives: "Objectives", season: "Season" };

function Overview({ d }: { d: AccountOverview }) {
  const [allSbcs, setAllSbcs] = useState(false);
  const [doneObjectives, setDoneObjectives] = useState(false);
  const b = d.balance, p = d.profile;
  const others = (b?.currencies ?? []).filter(c => !/^(COINS?|(FC_?)?POINTS?)$/.test(c.name) && !/DRAFT/.test(c.name));
  const record = p && (p.won != null || p.lost != null) ? `${p.won ?? 0}W ${p.draw ?? 0}D ${p.lost ?? 0}L` : null;
  const ts = d.tradepile?.summary;
  const sbcs = d.sbcs ? (allSbcs ? d.sbcs.items : d.sbcs.items.slice(0, 15)) : [];
  const objectives = d.objectives ? d.objectives.items.filter(o => doneObjectives || !o.done) : [];
  return <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Coins" value={coins(b?.coins)} sub={d.seen.balance ? `Seen ${dateText(d.seen.balance)}` : undefined} />
      <Stat label="FC Points" value={coins(b?.points)} />
      {b?.draft_tokens != null && <Stat label="Draft tokens" value={coins(b.draft_tokens)} />}
      {others.map(c => <Stat key={c.name} label={c.name.replace(/_/g, " ").toLowerCase().replace(/^\w/, x => x.toUpperCase())} value={coins(c.funds)} />)}
      {p && <Stat label={p.club_name ?? "Club"} value={record ?? "–"} sub={[p.division_online ? `Division ${p.division_online}` : null, p.trophies ? `${p.trophies} trophies` : null, p.unopened_packs ? `${p.unopened_packs} unopened packs` : null].filter(Boolean).join(" · ") || undefined} />}
    </div>
    <p className="text-xs text-muted-foreground">Prices from FUT.GG {d.prices_at ? dateText(d.prices_at) : "not loaded yet"} · Read from the Web App by the helper, not checked against FC 27 yet</p>

    {d.tips.length > 0 && <Section title="To do">
      <ul className="space-y-2">{d.tips.map((t, i) => <li key={i} className="flex gap-2 text-sm"><ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{t}</span></li>)}</ul>
    </Section>}

    {d.history.length > 1 && <Section title="Coins over time"><HistoryChart data={d.history.map(h => ({ t: h.t, value: h.coins }))} field="value" label="Coins" /></Section>}

    <Section title="Transfer list">
      <Seen at={d.seen.tradepile} />
      {d.tradepile && ts && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Sold" value={String(ts.sold)} sub={ts.sold ? `${numberText(ts.sold_for)} coins, ${numberText(ts.sold_after_tax)} after tax` : undefined} />
          <Stat label="Listed" value={String(ts.listed)} sub={ts.listed ? `${numberText(ts.listed_after_tax)} after tax if all sell` : undefined} />
          <Stat label="Expired / not listed" value={`${ts.expired} / ${ts.unlisted}`} sub={ts.idle_market_value ? `About ${numberText(ts.idle_market_value)} coins at FUT.GG prices` : undefined} />
          <Stat label="Slots used" value={ts.max ? `${ts.total}/${ts.max}` : String(ts.total)} />
        </div>
        <TradeTable items={d.tradepile.items} watch={false} />
      </>}
    </Section>

    <Section title="Transfer Targets">
      <Seen at={d.seen.watchlist} />
      {d.watchlist && <>
        <p className="text-sm text-muted-foreground">{d.watchlist.summary.winning} winning · {d.watchlist.summary.outbid} outbid · {d.watchlist.summary.won} won · {d.watchlist.summary.lost} lost{d.watchlist.summary.coins_in_bids ? ` · ${numberText(d.watchlist.summary.coins_in_bids)} coins in winning bids` : ""}</p>
        <TradeTable items={d.watchlist.items} watch />
      </>}
    </Section>

    <Section title="Unassigned">
      <Seen at={d.seen.unassigned} />
      {d.unassigned && <>
        <p className="text-sm text-muted-foreground">{d.unassigned.total} items · {d.unassigned.duplicates} duplicates{d.unassigned.tradeable_value ? ` · tradeable ones worth about ${numberText(d.unassigned.tradeable_value)} coins` : ""}</p>
        <div className="overflow-x-auto"><DataTable headers={["Card", "Rating", "Duplicate", "FUT.GG price"]} rows={d.unassigned.items.map(i => [<CardName item={i} />, i.rating ?? "–", i.duplicate ? <Badge variant="outline" className="border-warning/40 text-warning">Duplicate</Badge> : "", coins(i.price)])} empty="Nothing unassigned." /></div>
      </>}
    </Section>

    <Section title="Squad Building Challenges">
      <Seen at={d.seen.sbcs} />
      {d.sbcs && <>
        <p className="text-sm text-muted-foreground">{d.sbcs.open} open of {d.sbcs.total}, ending soonest first. <Link className="text-primary underline-offset-4 hover:underline" to="/fut/sbc">Solve them from your club in the SBC Solver</Link>.</p>
        <div className="overflow-x-auto"><DataTable headers={["SBC", "Group", "Progress", "Ends", "Reward"]} rows={sbcs.map(s => [
          <div className="min-w-[10rem]"><span className="font-medium">{s.name}</span>{s.repeatable && <Badge variant="outline" className="ml-2 text-[10px]">Repeatable{s.repeat_limit ? ` ×${s.repeat_limit}` : ""}</Badge>}{s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}</div>,
          s.category ?? "–",
          s.times_completed && !s.repeatable ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" />Done</span> : s.challenges ? `${s.completed ?? 0}/${s.challenges}${s.times_completed ? ` · done ${s.times_completed}×` : ""}` : "–",
          endsText(s.end_at),
          s.awards.map(a => `${a.count && a.count > 1 ? `${a.count}× ` : ""}${a.type}${a.untradeable ? " (untradeable)" : ""}`).join(", ") || "–",
        ])} empty="Open SBCs in the Web App so the helper can read them." /></div>
        {d.sbcs.items.length > 15 && <Button variant="outline" size="sm" onClick={() => setAllSbcs(v => !v)}>{allSbcs ? "Show fewer" : `Show all ${d.sbcs.items.length}`}</Button>}
      </>}
    </Section>

    <Section title="Objectives">
      <Seen at={d.seen.objectives} />
      {d.objectives && <>
        <p className="text-sm text-muted-foreground">{d.objectives.done} of {d.objectives.total} done{d.objectives.xp_left ? ` · ${numberText(d.objectives.xp_left)} XP still to earn` : ""}</p>
        <div className="overflow-x-auto"><DataTable headers={["Objective", "Group", "Progress", "XP", "Ends"]} rows={objectives.map(o => [
          <span className={o.done ? "text-muted-foreground line-through" : "font-medium"}>{o.name}</span>, o.group ?? "–",
          o.target ? `${Math.min(o.progress ?? 0, o.target)}/${o.target}` : "–", o.xp ? numberText(o.xp) : "–", endsText(o.end_at),
        ])} empty={d.objectives.total ? "Every objective here is done." : "Open Objectives in the Web App so the helper can read them."} /></div>
        {d.objectives.done > 0 && <Button variant="outline" size="sm" onClick={() => setDoneObjectives(v => !v)}>{doneObjectives ? "Hide done" : `Show ${d.objectives.done} done`}</Button>}
      </>}
    </Section>

    {d.season && <Section title="Season progress">
      <Seen at={d.seen.season} />
      <dl className="grid gap-3 text-sm sm:grid-cols-3">{Object.entries(d.season).map(([k, v]) => <div key={k}><dt className="break-words text-xs text-muted-foreground">{k}</dt><dd className="tabular-nums font-medium">{numberText(v)}</dd></div>)}</dl>
    </Section>}
  </>;
}

/** Card art addresses the helper (0.8.0+) saw the Web App load: used to work out EA's promo background names. */
function CardArtSeen({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const art = useQuery({ queryKey: [...futKeys.account, "card-art"], queryFn: futApi.cardArt, enabled: enabled && open, staleTime: 5 * 60_000 });
  return <details className="text-sm" onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
    <summary className="cursor-pointer text-muted-foreground">Card art addresses seen{art.data ? ` (${art.data.length})` : ""}</summary>
    <div className="mt-2 space-y-2">
      <p className="text-xs text-muted-foreground">Addresses of card backgrounds the EA Web App loaded while you browsed (helper 0.8.0 or newer). Open a few TOTW, Icon and Hero cards in your club so their backgrounds show up here. Only the addresses are kept, never the images.</p>
      <ErrorNotice error={art.error} />
      {art.isPending && open ? <MarketLoading /> : art.data && (art.data.length
        ? <ul className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">{art.data.map(a => <li key={a.url} className="break-all"><span className="text-muted-foreground">{a.sightings}× </span>{a.url.replace(/^https:\/\/www\.ea\.com\/ea-sports-fc\/ultimate-team\/web-app\//, "…/")}</li>)}</ul>
        : <p className="text-xs text-muted-foreground">None yet.</p>)}
    </div>
  </details>;
}

/** What the player shares with the Discord servers they're in. Off until they switch it on. */
function ClubSharing({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const { discordLink } = useDiscordLink();
  const q = useQuery({ queryKey: futKeys.clubShare, queryFn: futApi.clubShare.get, enabled });
  const set = useMutation({ mutationFn: (patch: Partial<ClubShare>) => futApi.clubShare.set(patch), onSuccess: d => qc.setQueryData(futKeys.clubShare, d) });
  const d = q.data;
  return <Section title="Share with my Discord club">
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><Users className="mt-0.5 h-4 w-4 shrink-0" />GafferBot can post your big pack pulls to your club's Discord channel and put you on the club's weekly FUT board (club value, trading profit, Champs record, best pull) and in "who has this card". Your coins and transfer list are never shared. Both are off until you switch them on, and your club's leaders can turn FUT off for the whole server.</p>
    {!discordLink?.verified && <p className="text-sm">Link your Discord account on your <Link className="underline" to="/profile">profile</Link> first, so GafferBot knows which servers you're in.</p>}
    <ErrorNotice error={q.error || set.error} />
    {d && <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><span><span className="block text-sm font-medium">Post my big pulls</span><span className="text-xs text-muted-foreground">From packs the helper saw you open</span></span><Switch checked={d.share_pulls} disabled={set.isPending} onCheckedChange={v => set.mutate({ share_pulls: v })} aria-label="Post my big pulls" /></label>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><span><span className="block text-sm font-medium">Show me on the FUT board</span><span className="text-xs text-muted-foreground">Also lets members see which cards you own</span></span><Switch checked={d.share_board} disabled={set.isPending} onCheckedChange={v => set.mutate({ share_board: v })} aria-label="Show me on the FUT board" /></label>
      <div className="space-y-1.5"><Label>Only pulls rated</Label><Select value={String(d.min_pull_rating)} onValueChange={v => set.mutate({ min_pull_rating: Number(v) })}><SelectTrigger aria-label="Minimum pull rating"><SelectValue /></SelectTrigger><SelectContent>{[80, 83, 84, 85, 86, 87, 88, 89, 90, 92].map(r => <SelectItem key={r} value={String(r)}>{r}+</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Platform shared</Label><Select value={d.platform} onValueChange={v => set.mutate({ platform: v as "console" | "pc" })}><SelectTrigger aria-label="Platform shared"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="console">Console</SelectItem><SelectItem value="pc">PC</SelectItem></SelectContent></Select></div>
    </div>}
  </Section>;
}

export default function FutAccountPage() {
  const context = useMarketPlatform(), qc = useQueryClient();
  const query = useQuery({ queryKey: [...futKeys.account, context.platform], queryFn: () => futApi.account.get(context.platform), enabled: context.enabled, staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const clear = useMutation({ mutationFn: () => futApi.account.clear(context.platform), onSuccess: () => qc.invalidateQueries({ queryKey: futKeys.account }) });
  const d = query.data;
  return <MarketShell title="My Account" showTabs={false} {...context}>
    <ErrorNotice error={query.error || clear.error} />
    <p className="text-sm text-muted-foreground">Your coins, FC Points, transfer list, watchlist, unassigned items, SBCs and objectives, as the EA Web App last showed them. The helper only copies what the Web App loads anyway; it never lists, bids, claims or submits anything.</p>
    <ClubSharing enabled={context.enabled} />
    {query.isPending ? <MarketLoading /> : d && (!d.connected ? <Empty /> : <>
      <Overview d={d} />
      <Section title="What the helper has seen">
        <DataTable headers={["Part", "Last seen"]} rows={(Object.keys(SECTION_LABEL) as AccountSection[]).map(k => [SECTION_LABEL[k], d.seen[k] ? dateText(d.seen[k]) : "Not yet"])} />
        {d.shape && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Field names EA sent</summary><div className="mt-2 space-y-1">{Object.entries(d.shape).map(([k, v]) => <p key={k} className="break-words font-mono text-xs text-muted-foreground"><span className="text-foreground">{k}:</span> {v.join(", ") || "–"}</p>)}</div></details>}
        <CardArtSeen enabled={context.enabled} />
        <Button variant="outline" size="sm" disabled={clear.isPending} onClick={() => { if (window.confirm("Delete your stored account data and coin history for this platform? The helper uploads it again next time you sign in to the Web App.")) clear.mutate(); }}><Trash2 className="mr-2 h-4 w-4" />Clear account data</Button>
      </Section>
    </>)}
  </MarketShell>;
}
