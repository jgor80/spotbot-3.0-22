import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CalendarCheck,
  Check,
  Globe2,
  Heart,
  LayoutDashboard,
  Newspaper,
  Search,
  Shield,
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

// Signed-out homepage: sells GafferBot to managers and captains who haven't added it yet.
// Signed-in visitors never see this; "/" shows their club dashboard instead (see HomeRoute in App.tsx).

// View channels, send/embed/attach, read history, reactions, external emoji, mention roles,
// manage messages (sticky panels), manage roles (positions, trophies), change nickname,
// create invites (recruiting), public threads and sending in threads.
const BOT_PERMISSIONS = "309573708865";

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

const EXTRAS = [
  { icon: Newspaper, label: "Match reports and a club newspaper" },
  { icon: Sparkles, label: "Player cards and graphics" },
  { icon: Trophy, label: "Stat trophies and roles" },
  { icon: Bell, label: "Auto recaps after every game" },
  { icon: Twitch, label: "Twitch go-live alerts" },
  { icon: UsersRound, label: "Drafts and pick-up spots" },
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
    a: "Nothing right now. Every feature is unlocked for every server while GafferBot grows. If it helps your club, a tip on Venmo (@bleacherjeff) keeps the servers running.",
  },
  {
    q: "Is this made by EA?",
    a: "No. GafferBot is an independent project and isn't made, endorsed or sponsored by Electronic Arts or Discord.",
  },
];

// ---------- Mockups (drawn in HTML so they stay sharp and follow the theme) ----------

const PITCH_433: { pos: string; name: string; x: number; y: number }[] = [
  { pos: "ST", name: "Fontana", x: 50, y: 12 },
  { pos: "LW", name: "Costa", x: 18, y: 20 },
  { pos: "RW", name: "Marino", x: 82, y: 20 },
  { pos: "CM", name: "Greco", x: 28, y: 44 },
  { pos: "CM", name: "Bruno", x: 50, y: 50 },
  { pos: "CM", name: "Galli", x: 72, y: 44 },
  { pos: "LB", name: "Bianchi", x: 14, y: 70 },
  { pos: "CB", name: "Ferri", x: 38, y: 74 },
  { pos: "CB", name: "Conte", x: 62, y: 74 },
  { pos: "RB", name: "Lombardi", x: 86, y: 70 },
  { pos: "GK", name: "Rossi", x: 50, y: 90 },
];

function PitchMockup({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-[hsl(150_45%_9%)] p-3 shadow-2xl", className)}>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <p className="font-display text-lg font-bold uppercase tracking-wide text-white">Starting XI</p>
        <p className="text-xs text-white/60">4-3-3 · League night</p>
      </div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[repeating-linear-gradient(180deg,hsl(122_38%_44%)_0_10%,hsl(122_38%_40%)_10%_20%)]">
        <div className="absolute inset-3 rounded-sm border border-white/50" />
        <div className="absolute left-3 right-3 top-1/2 border-t border-white/50" />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
        <div className="absolute left-1/2 top-3 h-[14%] w-[44%] -translate-x-1/2 border border-t-0 border-white/50" />
        <div className="absolute bottom-3 left-1/2 h-[14%] w-[44%] -translate-x-1/2 border border-b-0 border-white/50" />
        {PITCH_433.map((p) => (
          <div
            key={p.name}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shadow-md sm:h-8 sm:w-8",
                p.pos === "GK" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
              )}
            >
              {p.pos}
            </span>
            <span className="mt-0.5 rounded bg-black/75 px-1.5 py-px text-[9px] font-semibold uppercase text-white sm:text-[10px]">
              {p.name}
            </span>
          </div>
        ))}
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
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Shield className="h-4 w-4" />
        </span>
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
        <span className="rounded bg-[hsl(142_60%_36%)] px-3 py-1.5">Yes</span>
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
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-hero">
              <Shield className="h-5 w-5 text-white" />
            </span>
            <span className="font-display text-xl font-bold">GafferBot</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
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
            <div className="relative mx-auto w-full max-w-md">
              <PitchMockup className="ml-auto w-[78%]" />
              <AvailabilityMockup className="absolute -bottom-6 -left-2 w-[66%] sm:-left-6" />
            </div>
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
          <div className="mt-6 flex flex-wrap gap-2">
            {EXTRAS.map((e) => (
              <span key={e.label} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <e.icon className="h-4 w-4 text-primary" />
                {e.label}
              </span>
            ))}
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

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-24">
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
                    Tip on Venmo @bleacherjeff
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
