import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CheckCircle2, CircleOff, ExternalLink, Loader2, Lock, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { futApi, futKeys, type KbArea, type KbSource, type KbStatus } from "@/lib/futApi";
import { Busy, ErrorNotice } from "@/components/fut/FutShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ago, sourceLabel } from "./knowledgePresentation";
import { bookmarkletSource, readSentSource } from "./sendToBank";
import { ApplyToTeam } from "./ApplyToTeam";

const MAX_TEXT = 12_000;

function Feed({ on, name, detail }: { on: boolean; name: string; detail: string }) {
  return <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
    {on ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="on" /> : <CircleOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="off" />}
    <div><p className="font-medium">{name} <span className="font-normal text-muted-foreground">{on ? "on" : "off"}</span></p><p className="text-xs text-muted-foreground">{detail}</p></div>
  </div>;
}

export function FeedStatus({ status, area }: { status: KbStatus; area: KbArea }) {
  const clubs = area === "proclubs";
  const run = status.last_run;
  const failures = run ? Object.entries(run.feeds).filter(([, f]) => f.status === "failed") : [];
  const limited = run ? Object.entries(run.feeds).filter(([, f]) => f.status === "limited").map(([name]) => name) : [];
  return <section className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-3">
      <Feed on={status.feeds.reddit} name="Reddit" detail={!status.feeds.reddit ? "Turned off (FUT_KB_REDDIT_RSS=off)."
        : clubs ? "Build posts from r/ProClubs, every 3 hours."
        : status.feeds.reddit_mode === "rss" ? "Top gameplay posts and comments from r/EASportsFC and r/fut through Reddit's public feeds, every 3 hours. Upvotes aren't included."
        : "Top gameplay posts and comments from r/EASportsFC and r/fut, every 3 hours."} />
      <Feed on={status.feeds.youtube} name="YouTube" detail={!status.feeds.youtube ? "Needs a YouTube Data API key (YOUTUBE_API_KEY on the server)."
        : clubs ? "Most-watched Pro Clubs build videos and their top comments, 4 times a day." : "Most-watched FC 27 meta videos and their top comments, 4 times a day."} />
      <Feed on={status.feeds.reader} name="Reader" detail={!status.feeds.reader ? "Needs a Claude API key: add yours on your profile."
        : clubs ? "Claude reads the builds out of each source." : "Claude reads each source into short claims."} />
    </div>
    <p className="text-sm text-muted-foreground">
      {status.paused ? "Collecting is paused (FUT_KNOWLEDGE=off). " : ""}
      Last collected {ago(run?.finished_at)}{run ? `: ${run.read} source${run.read === 1 ? "" : "s"} read` : ""}{status.reading ? `, ${status.reading} being read now` : ""}{status.waiting ? `, ${status.waiting} waiting to be read` : ""}.
      {" "}Sources you add are read straight away; anything still waiting is tried again every 10 minutes.
      {failures.map(([name, f]) => ` ${name} failed: ${f.error ?? "unknown error"}.`).join("")}
      {limited.map((name) => ` ${name === "reddit" ? "Reddit" : name} asked GafferBot to slow down, so it will try again next run.`).join("")}
    </p>
  </section>;
}

/** The other side of the app's knowledge bank, for sources that belong there. */
const OTHER_BANK: Record<KbArea, { path: string; text: string }> = {
  fut: { path: "/knowledge", text: "Pro Clubs build videos and posts go in the Club side's Knowledge Bank" },
  proclubs: { path: "/fut/knowledge", text: "Ultimate Team talk (formations, tactics, cards) goes in the FUT side's Knowledge Bank" },
};

function AddSource({ area, onAdded }: { area: KbArea; onAdded: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(""), [title, setTitle] = useState(""), [text, setText] = useState(""), [share, setShare] = useState(false);
  const clubs = area === "proclubs";
  const [sent, setSent] = useState(false);
  // A page sent with the "Send to Knowledge Bank" button arrives in the #fragment: fill the form, then clear it.
  useEffect(() => {
    const got = readSentSource(window.location.hash);
    if (!got) return;
    setUrl(got.url); setTitle(got.title); setText(got.text); setShare(!!got.url); setSent(true);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, []);
  const add = useMutation({
    mutationFn: () => futApi.knowledge.add({ url: url.trim() || undefined, title: title.trim() || undefined, text: text.trim() || undefined, share, area }),
    onSuccess: () => { setUrl(""); setTitle(""); setText(""); setSent(false); onAdded(); qc.invalidateQueries({ queryKey: futKeys.knowledge }); },
  });
  const r = add.data;
  return <section aria-labelledby="add-title" className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div>
      <h2 id="add-title" className="flex items-center gap-2 font-display text-lg font-semibold"><Plus className="h-4 w-4 text-primary" />Add a source</h2>
      <p className="text-sm text-muted-foreground">{clubs ? "Paste a Reddit post, a YouTube build video, a Pro Clubs Builder or GafferBot build link, or a build you write out. Claude reads the builds out of it for the community meta builds." : "Paste a Reddit or YouTube link, or any post, guide, video transcript or your own notes. Claude reads it into claims that join the map."} GafferBot doesn't copy other websites, so for other links paste the text too.</p>
    </div>
    {sent && <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm" role="status">Here's the page you sent. Check it, trim anything that isn't gameplay talk, then press Add and read.</p>}
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!add.isPending) add.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="kb-url">Link (optional)</Label><Input id="kb-url" type="url" inputMode="url" placeholder={clubs ? "https://www.youtube.com/watch?v=…" : "https://www.reddit.com/r/EASportsFC/comments/…"} value={url} maxLength={600} onChange={(e) => setUrl(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="kb-title">Title (optional)</Label><Input id="kb-title" placeholder={clubs ? "e.g. My level 55 Finisher ST" : "e.g. My 4-4-2 tactics notes"} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} /></div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="kb-text">Text</Label>
        <Textarea id="kb-text" rows={6} maxLength={MAX_TEXT} placeholder={clubs ? "e.g. ST: Finisher, 6'1, 80 kg, 4★ skills. Finesse Shot, Quick Step, Rapid. Max finishing and acceleration first." : "Paste the post, the video's transcript or your notes"} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-right text-xs text-muted-foreground">{text.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}</p>
      </div>
      <p className="text-xs text-muted-foreground">{OTHER_BANK[area].text}: <Link to={OTHER_BANK[area].path} className="underline underline-offset-2">open it</Link>.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><Switch checked={share} onCheckedChange={setShare} disabled={!url.trim()} aria-describedby="kb-share-help" />Share with everyone</label>
        <Button type="submit" disabled={add.isPending || (!url.trim() && text.trim().length < (clubs ? 10 : 40))}>{add.isPending ? "Adding…" : "Add and read"}</Button>
      </div>
      <p id="kb-share-help" className="text-xs text-muted-foreground">Reddit and YouTube links are shared once fetched. Other sources stay private to you unless they have a link and you share them; notes are always private.</p>
    </form>
    <ErrorNotice error={add.error} />
    {r && <p className="rounded-lg bg-muted p-3 text-sm" role="status">Added{r.area !== area ? ` to ${r.area === "proclubs" ? "the Pro Clubs builds" : "the Ultimate Team bank"}` : ""}. Claude is reading it now, which takes up to a minute: its status shows under Added by me below.{r.shared ? " It's shared with everyone." : " Only you can see it."}</p>}
  </section>;
}

/** The "Send to Knowledge Bank" bookmarklet, to drag to the bookmarks bar. */
function BrowserButton({ area }: { area: KbArea }) {
  const link = useRef<HTMLAnchorElement>(null);
  // React won't render javascript: links, so the bookmarklet is set on the element directly.
  useEffect(() => { link.current?.setAttribute("href", bookmarkletSource(window.location.origin, area === "proclubs" ? "/knowledge" : "/fut/knowledge")); }, [area]);
  return <section aria-labelledby="send-title" className="space-y-2 rounded-xl border border-border bg-card p-4">
    <h2 id="send-title" className="flex items-center gap-2 font-display text-lg font-semibold"><Bookmark className="h-4 w-4 text-primary" />Send pages from your browser</h2>
    <p className="text-sm text-muted-foreground">On a computer, drag this button to your bookmarks bar. When you're reading a Reddit thread (or any guide or forum post), click it: the post and its top comments open here, ready to add. Select some text first to send just that part.</p>
    <a ref={link} href="#" onClick={(e) => e.preventDefault()} draggable
      className="inline-flex cursor-grab items-center gap-2 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary active:cursor-grabbing">
      <Bookmark className="h-4 w-4" />{area === "proclubs" ? "Send to Pro Clubs builds" : "Send to Knowledge Bank"}
    </a>
    <p className="text-xs text-muted-foreground">It only reads the page you click it on, and nothing is added until you press Add and read.</p>
  </section>;
}

/** Where a source is in reading, in plain words, with the reason when it's stuck. */
export function SourceState({ s, onRetry, retrying }: { s: KbSource; onRetry?: (id: string) => void; retrying?: boolean }) {
  const what = s.area === "proclubs" ? "build" : "claim";
  if (s.status === "reading") return <span className="inline-flex items-center gap-1 font-medium text-primary"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />Reading now…</span>;
  // A failed source's copy is gone, so only a Reddit or YouTube link (fetched again) can be retried then
  const retry = s.mine && onRetry && (s.status === "pending" || (s.status === "failed" && (s.kind === "reddit" || s.kind === "youtube")))
    ? <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={retrying} onClick={() => onRetry(s.id)}><RotateCcw className="mr-1 h-3 w-3" />Try again</Button> : null;
  if (s.status === "pending") return <span className="inline-flex flex-wrap items-center gap-1 text-warning">Waiting to be read{s.note ? `: ${s.note.replace(/^Waiting: /, "").replace(/^Moved to Pro Clubs builds; reading it again\.$/, "moved here from the FUT side")}` : ""} {retry}</span>;
  if (s.status === "failed") return <span className="inline-flex flex-wrap items-center gap-1 text-destructive">Couldn't read{s.note ? `: ${s.note}` : ""} {retry}</span>;
  if (s.status === "skipped") return <span>Read: no {s.area === "proclubs" ? "Pro Clubs builds" : "gameplay or strategy claims"} found</span>;
  return <span>{s.claims} {what}{s.claims === 1 ? "" : "s"}</span>;
}

/** Keep checking while one of your sources is being read or waiting. */
const pollWhileReading = (sources: KbSource[] | undefined) => sources?.some((s) => s.mine && (s.status === "reading" || s.status === "pending")) ? 4000 : false;

function SourceRow({ s, onDelete, deleting, onRetry, retrying }: { s: KbSource; onDelete: (id: string) => void; deleting: boolean; onRetry: (id: string) => void; retrying: boolean }) {
  return <li className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
    <div className="min-w-0 flex-1 space-y-1">
      {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 font-medium hover:underline"><span className="truncate">{sourceLabel(s)}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>
        : <p className="font-medium">{sourceLabel(s)}</p>}
      {s.note && (s.status === "read" || s.status === "skipped") && <p className="text-muted-foreground">{s.note}</p>}
      <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <span>{ago(s.published_at)}</span>
        {s.score > 0 && <span>· {s.score.toLocaleString()} {s.kind === "youtube" ? "views" : "upvotes"}</span>}
        {(s.status === "read" || s.status === "skipped") && <span>· <SourceState s={s} /></span>}
        {s.mine && <span className="inline-flex items-center gap-1">· {s.shared ? <><Users className="h-3 w-3" />shared by you</> : <><Lock className="h-3 w-3" />private</>}</span>}
      </p>
      {s.status !== "read" && s.status !== "skipped" && <p className="text-xs"><SourceState s={s} onRetry={onRetry} retrying={retrying} /></p>}
      {s.claims > 0 && s.area !== "proclubs" && <ApplyToTeam source={s.id} compact />}
    </div>
    {s.mine && <Button type="button" variant="ghost" size="icon" aria-label="Delete this source" disabled={deleting} onClick={() => onDelete(s.id)}><Trash2 className="h-4 w-4" /></Button>}
  </li>;
}

/** The sources of one bank: fut on the FUT side, proclubs on the Club side. */
export function SourcesPanel({ area }: { area: KbArea }) {
  const qc = useQueryClient();
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const list = useQuery({ queryKey: [...futKeys.knowledge, "sources", area, mine, page], queryFn: () => futApi.knowledge.sources(area, mine, page), placeholderData: keepPreviousData,
    refetchInterval: (q) => pollWhileReading(q.state.data?.sources) });
  // When a read finishes, the map, topics and builds pick it up
  const busy = !!pollWhileReading(list.data?.sources);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) { qc.invalidateQueries({ queryKey: futKeys.knowledge }); qc.invalidateQueries({ queryKey: ["meta-builds"] }); }
    wasBusy.current = busy;
  }, [busy, qc]);
  const remove = useMutation({ mutationFn: futApi.knowledge.remove, onSuccess: () => qc.invalidateQueries({ queryKey: futKeys.knowledge }) });
  const retry = useMutation({ mutationFn: futApi.knowledge.retry, onSuccess: () => qc.invalidateQueries({ queryKey: futKeys.knowledge }) });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 30));
  return <div className="space-y-4">
    <AddSource area={area} onAdded={() => { setMine(true); setPage(0); }} />
    <BrowserButton area={area} />
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Sources{list.data ? <span className="font-normal text-muted-foreground"> ({list.data.total.toLocaleString()})</span> : null}</h2>
        <Tabs value={mine ? "mine" : "all"} onValueChange={(v) => { setMine(v === "mine"); setPage(0); }}>
          <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="mine">Added by me</TabsTrigger></TabsList>
        </Tabs>
      </div>
      <ErrorNotice error={list.error ?? remove.error ?? retry.error} />
      {list.isPending ? <Busy /> : list.data?.sources.length
        ? <ul className="space-y-2">{list.data.sources.map((s) => <SourceRow key={s.id} s={s} onDelete={(id) => remove.mutate(id)} deleting={remove.isPending} onRetry={(id) => retry.mutate(id)} retrying={retry.isPending} />)}</ul>
        : <p className="text-sm text-muted-foreground">{mine ? "You haven't added any sources yet." : "No sources yet."}</p>}
      {pages > 1 && <div className="flex items-center justify-end gap-2 text-sm">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
        <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
        <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Older</Button>
      </div>}
    </section>
    <p className="text-xs text-muted-foreground">Collected posts and videos keep only their link, community, date and score after 30 days; the claims are GafferBot's own short summaries with links back. Reddit and YouTube are read through their official APIs and Reddit's public feeds.</p>
  </div>;
}
