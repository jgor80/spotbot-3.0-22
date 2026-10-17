import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CalendarCheck,
  Check,
  Globe2,
  MonitorSmartphone,
  Palette,
  Heart,
  LayoutDashboard,
  Newspaper,
  Search,
  Shirt,
  Sparkles,
  TrendingUp,
  Trophy,
  Twitch,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DiscordIcon } from "@/components/DiscordIcon";
import { discordAuthApi } from "@/lib/discordAuthApi";
import { cn } from "@/lib/utils";

// Player cards drawn by the bot's own card renderer (graphics-studio.cjs) from its bundled sample art,
// for a made-up club, so the page shows real GafferBot output without anyone's real photos.
const CARDS = import.meta.glob<string>("/src/assets/landing/cards/*.webp", { eager: true, import: "default" });
const card = (name: string) => CARDS[`/src/assets/landing/cards/${name}.webp`];

// Public marketing page at /welcome: sells GafferBot to managers and captains who haven't added it yet.
// Signed-out visitors to "/" see sign-in first, with a Learn more link here (see HomeRoute in App.tsx).

// View channels, send/embed/attach, read history, reactions, external emoji, mention roles,
// manage messages (sticky panels), manage roles (positions, trophies), change nickname,
// create invites (recruiting), public threads and sending in threads.
const BOT_PERMISSIONS = "309573708865";

const STYLE_LABELS: Record<string, string> = {
  chrome: "Liquid Chrome",
  retro1970s: "1970s Club Archive",
  y2k: "Y2K Club Chrome",
  retro2020s: "2020s Club Prism",
  synthwave: "Synthwave Chill",
  retro1986: "1986 Club Classic",
  obsidian: "Obsidian & Gold",
  esports: "Ultra Esports",
  retro1990s: "1990s Club Collection",
  cyber: "Cyber Glitch",
};

const GALLERY = Object.keys(CARDS).filter((k) => k.includes("/g-")).sort().map((k) => ({
  src: CARDS[k],
  label: STYLE_LABELS[k.replace(/.*\/g-\d+-(\w+)\.webp$/, "$1")] ?? "",
}));

// GafferBot is free; this is where people can chip in to keep it running
const DONATE_URL = "https://venmo.com/u/bleacherjeff";

function useInviteUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    discordAuthApi<{ client_id: string | null }>().then(({ data }) => {
      if (!live || !data?.client_id) return;
      const params = new URLSearchParams({
        client_id: data.client_id,
        scope: "bot applications.commands",
        permissions: BOT_PERMISSIONS,
      });
      setUrl(`https://discord.com/oauth2/authorize?${params}`);
    });
    return () => {
      live = false;
    };
  }, []);
  return url;
}

function AddToDiscord({ url, size = "lg", className }: { url: string | null; size?: "lg" | "default"; className?: string }) {
  // Until the client id loads (or if it can't), send people to sign in, where Discord sign-in still works
  return (
    <Button asChild size={size} className={cn("font-semibold", size === "lg" && "h-12 px-6 text-base", className)}>
      <a href={url ?? "/auth"}>
        <DiscordIcon className="mr-2 h-5 w-5" />
        Add to Discord
      </a>
    </Button>
  );
}

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "A manager hub inside Discord",
    body: "One /manager panel runs the club: events, team sheets, roster, stats and recruiting are all buttons. No commands to memorise, and players never leave the server.",
  },
  {
    icon: Shirt,
    title: "Lineups your squad will actually read",
    body: "Drag players onto the pitch and bench, pick a formation and kit, and post a clean team graphic to Discord. Everyone sees their position before kick-off.",
  },
  {
    icon: CalendarCheck,
    title: "Availability without the chasing",
    body: "Post a game and players tap Yes, Maybe or No. Reminders go out by DM, and the board shows each player's main and backup positions so the gaps are obvious.",
  },
  {
    icon: TrendingUp,
    title: "Stats straight from EA",
    body: "Results, ratings, form and division progress sync on their own. Spot who plays well together, which nights you win and whether you're heading up or down.",
  },
  {
    icon: Search,
    title: "Recruiting and free agents",
    body: "Search a cross-server pool of free agents by position and platform, reach out through the bot, run tryouts and get a report card on every trialist.",
  },
  {
    icon: Globe2,
    title: "The GafferBot Network",
    body: "Opt in to find a last-minute replacement, book friendlies with clubs your level and climb a global leaderboard. Only public club info ever crosses servers.",
  },
];

const FLOW = [
  { icon: CalendarCheck, title: "Post the game", body: "Pick the time and opponent. GafferBot posts the board and pings the right role." },
  { icon: Bell, title: "Squad replies", body: "Players tap Yes, Maybe or No. Anyone quiet gets a DM reminder before kick-off." },
  { icon: Shirt, title: "Pick the XI", body: "Drag available players into a formation, then post the lineup to Discord." },
  { icon: TrendingUp, title: "Results land", body: "EA stats sync after the game: the recap, ratings, form and division update." },
];

const FUN = [
  { icon: Newspaper, label: "Club newspaper", body: "A match report after every game and a daily edition on the run, in your club's own voice." },
  { icon: Trophy, label: "Stat trophies", body: "Golden Boot, Playmaker, Golden Glove and In-Form roles that move after every match." },
  { icon: Sparkles, label: "Banter, kept honest", body: "Roast awards from real EA numbers, plus transfer rumours that are clearly labelled fiction." },
  { icon: Palette, label: "Your club's look", body: "Colours, crest and kits on every post and graphic." },
];

const EXTRAS = [
  { icon: MonitorSmartphone, label: "Web Control Room", body: "Every Discord panel action also works on the website, with the same permissions." },
  { icon: Bell, label: "Auto recaps", body: "Score, standouts and ratings in your recap channel when EA has the game." },
  { icon: LayoutDashboard, label: "Multi-club servers", body: "Each club keeps its own roster, events, stats and colours." },
  { icon: Twitch, label: "Twitch alerts", body: "Let the server know when players go live." },
  { icon: UsersRound, label: "Drafts and pick-up spots", body: "Captain drafts and open spots when you're short." },
  { icon: Search, label: "Tryouts", body: "Report cards on every trialist with Promote, Second trial or Release." },
];

const STEPS = [
  { title: "Add GafferBot", body: "Invite it to your club's Discord server. It posts a short welcome." },
  { title: "Run /setup", body: "Link your EA club, pick colours and a crest, and choose your channels. About two minutes." },
  { title: "Play", body: "Post your next game. Availability, the lineup, reminders and the recap take care of themselves." },
];

const FAQ = [
  {
    q: "Do my players need an account?",
    a: "No. Players use buttons in Discord. They can sign in here with Discord if they want their own profile and stats on the web, but it's optional.",
  },
  {
    q: "Where do the stats come from?",
    a: "EA's public Pro Clubs data for your club. Link your club once in /setup and new matches sync on their own. Some numbers, like hidden stats and chemistry, are GafferBot's estimates and are labelled that way.",
  },
  {
    q: "Can I run more than one club in a server?",
    a: "Yes. Each club keeps its own roster, events, stats and colours, and players are matched by the club name in their roles.",
  },
  {
    q: "What does it cost?",
    a: "Nothing right now. Every feature is unlocked for every server while GafferBot grows. If it helps your club, a donation keeps the servers running.",
  },
  {
    q: "Is this made by EA?",
    a: "No. GafferBot is an independent project and isn't made, endorsed or sponsored by Electronic Arts or Discord.",
  },
];

// ---------- Mockups (drawn in HTML so they stay sharp and follow the theme) ----------

// 4-3-3 with every player shown as their own card, as the lineup image does
const CARD_XI: { key: string; x: number; y: number }[] = [
  { key: "lw", x: 17, y: 15 },
  { key: "st", x: 50, y: 10 },
  { key: "rw", x: 83, y: 15 },
  { key: "cm1", x: 26, y: 41 },
  { key: "cm3", x: 50, y: 37 },
  { key: "cm2", x: 74, y: 41 },
  { key: "lb", x: 12, y: 67 },
  { key: "cb1", x: 37, y: 70 },
  { key: "cb2", x: 63, y: 70 },
  { key: "rb", x: 88, y: 67 },
  { key: "gk", x: 50, y: 91 },
];

function CardPitch({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl border border-white/10 bg-[hsl(224_30%_6%)] p-4 shadow-2xl sm:p-6", className)}>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Matchday XI</p>
          <p className="font-display text-2xl font-bold uppercase text-white sm:text-3xl">Northside FC</p>
        </div>
        <p className="text-right text-xs text-white/60">4-3-3 · League night<br />vs Wolves Town</p>
      </div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_center,hsl(142_45%_22%),hsl(150_50%_9%))]">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_9%,hsl(0_0%_100%/0.03)_9%_18%)]" />
        <div className="absolute inset-[4%] rounded-lg border border-white/20" />
        <div className="absolute left-[4%] right-[4%] top-1/2 border-t border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-[18%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        {CARD_XI.map((p) => (
          <img
            key={p.key}
            src={card(`xi-${p.key}`)}
            alt=""
            width={220}
            height={308}
            loading="lazy"
            className="absolute w-[17%] -translate-x-1/2 -translate-y-1/2 rounded-[6%] shadow-[0_8px_20px_rgba(0,0,0,0.55)] ring-1 ring-black/40 transition-transform duration-300 hover:z-10 hover:scale-125"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// The hero: one Discord channel showing the real flow, availability board then the posted lineup
function MatchNightWindow({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-white/10 bg-[hsl(228_8%_15%)] shadow-2xl", className)}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-sm text-white/80">
        <span className="text-white/40">#</span> match-night
        <span className="ml-auto flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
      </div>
      <div className="space-y-4 p-4">
        <AvailabilityMockup className="border-0 bg-transparent p-0 shadow-none" />
        <div>
          <p className="text-xs text-white/50">GafferBot · after the game</p>
          <div className="mt-2 rounded-xl border-l-4 border-primary bg-[hsl(228_8%_20%)] p-3 text-white">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Full time: Northside 3-1 Wolves Town</p>
              <span className="rounded bg-[hsl(142_60%_30%)] px-1.5 py-0.5 text-[10px] font-bold">W</span>
            </div>
            <div className="mt-3 flex gap-3">
              <img src={card("xi-st")} alt="" width={220} height={308} className="w-16 shrink-0 rounded-md shadow-lg" />
              <div className="space-y-1 text-xs">
                <p><span className="text-white/50">Player of the match</span><br /><span className="font-semibold">Fontana · 8.9 · 2 goals</span></p>
                <p className="text-white/70">Galli 2 assists · Rossi 5 saves</p>
                <p className="text-white/70">Form W W D W W · Division 3, up 2 this season</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AvailabilityMockup({ className }: { className?: string }) {
  const rows = [
    { name: "Fontana", pos: "ST", alt: "CAM", state: "yes" },
    { name: "Greco", pos: "CM", alt: "CDM", state: "yes" },
    { name: "Ferri", pos: "CB", alt: "RB", state: "maybe" },
    { name: "Rossi", pos: "GK", alt: "", state: "yes" },
  ] as const;
  return (
    <div className={cn("rounded-xl border border-white/10 bg-[hsl(228_8%_20%)] p-4 text-left text-white shadow-2xl", className)}>
      <div className="flex items-center gap-2">
        <img src="/brand/badge-128.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full" />
        <p className="text-sm font-semibold">
          GafferBot <span className="ml-1 rounded bg-[hsl(235_86%_65%)] px-1 py-px text-[10px] font-semibold">APP</span>
        </p>
      </div>
      <div className="mt-3 border-l-4 border-primary pl-3">
        <p className="text-sm font-bold">League game vs Wolves Town</p>
        <p className="text-xs text-white/60">Tonight 21:00 · 9 in, 2 maybe</p>
        <ul className="mt-2 space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", r.state === "yes" ? "bg-primary" : "bg-accent")} />
              <span className="w-16">{r.name}</span>
              <span className="font-bold">{r.pos}</span>
              {r.alt && <span className="text-white/50">{r.alt}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex gap-2 text-xs font-medium">
        <span className="rounded bg-[hsl(142_60%_30%)] px-3 py-1.5">Yes</span>
        <span className="rounded bg-[hsl(228_7%_32%)] px-3 py-1.5">Maybe</span>
        <span className="rounded bg-[hsl(0_60%_45%)] px-3 py-1.5">No</span>
      </div>
    </div>
  );
}

function InsightsMockup({ className }: { className?: string }) {
  const form = ["W", "W", "D", "W", "L", "W", "W", "W"];
  const bars = [38, 52, 46, 61, 58, 70, 66, 78];
  return (
    <div className={cn("rounded-2xl border bg-card p-5 shadow-xl", className)}>
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-bold">Club insights</p>
        <Badge variant="outline" className="border-primary/40 text-primary">Division 3 · up 2</Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ["14-3-5", "Record"],
          ["64%", "Win rate"],
          ["7.4", "Avg rating"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-muted p-2">
            <p className="font-display text-xl font-bold">{v}</p>
            <p className="text-[11px] text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">Form</p>
      <div className="mt-1 flex gap-1">
        {form.map((r, i) => (
          <span
            key={i}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
              r === "W" && "bg-success text-success-foreground",
              r === "D" && "bg-muted-foreground/30 text-foreground",
              r === "L" && "bg-destructive text-destructive-foreground"
            )}
          >
            {r}
          </span>
        ))}
      </div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">Skill rating</p>
      <div className="mt-1 flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-primary/80" style={{ height: `${h}%` }} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Best partnership: Greco + Bruno, 8 wins from 9</p>
    </div>
  );
}

// ---------- Page ----------

export default function LandingPage() {
  const inviteUrl = useInviteUrl();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/brand/badge-128.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0" />
            <span className="font-display text-xl font-bold">GafferBot</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
                        <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#extras" className="hover:text-foreground">Extras</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <AddToDiscord url={inviteUrl} size="default" className="hidden sm:inline-flex" />
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.18),transparent_60%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Badge variant="outline" className="border-primary/40 text-primary">Built for EA SPORTS FC Pro Clubs</Badge>
              <h1 className="mt-5 text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
                Run your Pro Clubs side <span className="text-gradient">from Discord.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                GafferBot is the assistant manager your club never had. It chases availability, posts the lineup, syncs
                your EA stats and finds you players, so match night is about playing.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <AddToDiscord url={inviteUrl} />
                <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                  <a href="#features">See what it does</a>
                </Button>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {["Free for every server", "Set up in about two minutes", "Players just tap buttons"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <MatchNightWindow className="mx-auto w-full max-w-md" />
          </div>
        </section>

        {/* Problem → promise */}
        <section className="border-y border-border/60 bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 text-center sm:grid-cols-3">
            {[
              ["No more roll calls", "Stop asking “who's on tonight?” in general chat."],
              ["No more spreadsheets", "Stats, form and division progress update themselves."],
              ["No more empty slots", "Find a replacement or a new signing in minutes."],
            ].map(([t, b]) => (
              <div key={t}>
                <p className="font-display text-xl font-bold">{t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Match night, start to finish */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Match night, start to finish</h2>
            <p className="mt-3 text-muted-foreground">Everything happens in your Discord with buttons. The website is there when you want more room.</p>
          </div>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-4">
            {FLOW.map((f, i) => (
              <li key={f.title} className="bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-display font-bold text-primary">{i + 1}</span>
                  <f.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Everything a manager does</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">One bot for the whole club</h2>
            <p className="mt-3 text-muted-foreground">
              Made for managers and captains. Works for a single squad or a server with several clubs.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-xl font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Screens */}
        <section id="screens" className="scroll-mt-20 border-t border-border/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">

            <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
              <CardPitch className="mx-auto w-full max-w-xl" />
              <div>
                <h3 className="text-2xl font-bold sm:text-3xl">Your XI, as player cards</h3>
                <p className="mt-3 text-muted-foreground">
                  Pick the team on the web or straight from Discord and GafferBot posts a lineup where every spot is that
                  player's own card. The squad sees exactly who is starting, and they actually want to share it.
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  {["Drag and drop, any formation, up to 9 on the bench", "Shows who is available and who is out of position", "Posted to your lineup channel in one click"].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </section>

        {/* Showcase */}
        <section className="bg-muted/30">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">Know your squad</p>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">See what wins you games</h2>
              <p className="mt-3 text-muted-foreground">
                Every synced match feeds your club's insights: form, records by night and competition, player ratings,
                who plays best together and where you sit in your division. Tag games as League, Tournament or BYOT and
                filter everything by it.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Division and skill rating tracked day by day",
                  "Player cards and season stats for every member",
                  "Hidden EA stats like possession and defensive stops",
                  "Recaps and match reports posted after every game",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <InsightsMockup className="mx-auto w-full max-w-md" />
          </div>
        </section>

        {/* Extras */}
        <section id="extras" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">The extras</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">The bits that keep a squad together</h2>
            <p className="mt-3 text-muted-foreground">Small touches that make the server somewhere players want to be, all switched on per club.</p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center">
              <div className="flex shrink-0 justify-center -space-x-10 sm:w-60">
                {[GALLERY[1], GALLERY[6], GALLERY[3]].filter(Boolean).map((g, i) => (
                  <img
                    key={g.src}
                    src={g.src}
                    alt={`${g.label} player card`}
                    width={420}
                    height={588}
                    loading="lazy"
                    className={cn("w-24 rounded-lg shadow-xl ring-1 ring-black/30", i === 1 && "z-10 -translate-y-2", i === 0 && "-rotate-6", i === 2 && "rotate-6")}
                  />
                ))}
              </div>
              <div>
                <p className="flex items-center gap-2 font-display text-xl font-bold"><Sparkles className="h-5 w-5 text-primary" /> Player cards</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Players post a photo of their pro and get a card with their real season stats, in 18 styles and your club
                  colours. The same art shows up on lineups, signing posts and recruiting posters.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FUN.map((f) => (
                <div key={f.label} className="rounded-2xl border bg-card p-5">
                  <f.icon className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-bold">{f.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            {EXTRAS.map((e) => (
              <li key={e.label} className="flex items-start gap-2">
                <e.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span><span className="font-medium text-foreground">{e.label}.</span> {e.body}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Setup */}
        <section className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-24">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Up and running before kick-off</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border bg-card p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-hero font-display text-lg font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
            <div className="mx-auto max-w-xl rounded-3xl border border-primary/40 bg-card p-8 text-center shadow-xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">Pricing</p>
              <p className="mt-3 font-display text-6xl font-bold">Free</p>
              <p className="mt-2 text-muted-foreground">Every feature, every server, no card needed.</p>
              <ul className="mx-auto mt-6 grid max-w-sm gap-2 text-left text-sm">
                {[
                  "Every club, player and event in your server",
                  "Lineups, availability and reminders",
                  "EA stat sync, insights and recaps",
                  "Recruiting, free agents and the Network",
                  "Graphics, player cards and the club newspaper",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
              <AddToDiscord url={inviteUrl} className="mt-8 w-full sm:w-auto" />
              <div className="mt-6 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                <p>Enjoying GafferBot? It runs on donations.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
                    <Heart className="mr-2 h-4 w-4 text-destructive" />
                    Donate
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 sm:py-24">
          <h2 className="text-center text-3xl font-bold sm:text-4xl">Questions</h2>
          <Accordion type="single" collapsible className="mt-8">
            {FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Final call to action */}
        <section className="px-4 pb-16 sm:pb-24">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-hero px-6 py-12 text-center text-white sm:py-16">
            <h2 className="text-3xl font-bold sm:text-4xl">Give your club a gaffer</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">
              Add GafferBot to your Discord, run /setup, and your next match night runs itself.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 bg-white px-6 text-base font-semibold text-[hsl(220_25%_10%)] hover:bg-white/90">
                <a href={inviteUrl ?? "/auth"}>
                  <DiscordIcon className="mr-2 h-5 w-5" />
                  Add to Discord
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-white/60 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white">
                <Link to="/auth">Already a member? Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} GafferBot. Not affiliated with Electronic Arts or Discord.
          </p>
          <nav className="flex gap-4">
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Donate</a>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
