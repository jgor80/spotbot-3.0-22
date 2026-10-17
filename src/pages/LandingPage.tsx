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

const EXTRAS = [
  { icon: Newspaper, label: "Match reports and a club newspaper", body: "A newspaper-style report after every game, plus daily editions on your run and season storyline." },
  { icon: Sparkles, label: "Player cards and graphics", body: "Turn players' own photos into cards, posters and banners in 18 styles, in your club colours." },
  { icon: Bell, label: "Auto recaps", body: "The score, the standouts and the ratings land in your recap channel as soon as EA has the game." },
  { icon: Trophy, label: "Stat trophies", body: "Golden Boot, Playmaker, Golden Glove and In-Form roles that move after every synced match." },
  { icon: MonitorSmartphone, label: "Web Control Room", body: "Every Discord panel action also works here on the website, with the same permissions." },
  { icon: Palette, label: "Your club's identity", body: "Colours, crest, kits and a newspaper voice that make every post look and sound like your club." },
  { icon: Twitch, label: "Twitch go-live alerts", body: "Let the server know when your players are streaming." },
  { icon: UsersRound, label: "Drafts and pick-up spots", body: "Run captain drafts and open spots for pick-up games when you're short." },
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
            loading="lazy"
            className="absolute w-[17%] -translate-x-1/2 -translate-y-1/2 rounded-[6%] shadow-[0_8px_20px_rgba(0,0,0,0.55)] ring-1 ring-black/40 transition-transform duration-300 hover:z-10 hover:scale-125"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function CardFan({ className }: { className?: string }) {
  const picks = [GALLERY[1], GALLERY[6], GALLERY[3]].filter(Boolean);
  return (
    <div className={cn("relative h-[380px] sm:h-[460px]", className)}>
      {picks.map((g, i) => (
        <img
          key={g.src}
          src={g.src}
          alt={`${g.label} player card`}
          className={cn(
            "absolute top-0 w-[58%] rounded-2xl shadow-2xl ring-1 ring-white/10 transition-transform duration-500 hover:z-20 hover:-translate-y-3",
            i === 0 && "left-0 top-8 -rotate-[8deg]",
            i === 1 && "left-1/2 z-10 -translate-x-1/2",
            i === 2 && "right-0 top-8 rotate-[8deg]"
          )}
        />
      ))}
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
            <a href="#fun" className="hover:text-foreground">Why GafferBot</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#screens" className="hover:text-foreground">Screens</a>
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
              <CardFan />
              <AvailabilityMockup className="absolute -bottom-10 -left-2 z-30 w-[66%] sm:-left-8" />
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

        {/* Only on GafferBot */}
        <section id="fun" className="relative scroll-mt-20 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(var(--accent)/0.12),transparent_55%)]" />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-accent">Only on GafferBot</p>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">The bit your group chat will love</h2>
              <p className="mt-3 text-muted-foreground">
                Other tools stop at a spreadsheet. GafferBot turns every match night into something your squad talks
                about: their own player cards, a newspaper about the club, and banter built on real stats.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border bg-card p-5 lg:row-span-2">
                <p className="font-display text-xl font-bold">🍝 The Roast</p>
                <p className="mt-1 text-sm text-muted-foreground">After a bad night, the recap hands out awards nobody wants, all from real EA numbers.</p>
                <div className="mt-4 rounded-xl border-l-4 border-[hsl(335_80%_75%)] bg-[hsl(228_8%_20%)] p-4 text-sm text-white">
                  <p className="font-bold">🍝 The Roast: Northside FC</p>
                  <p className="mt-1 text-xs text-white/60">Last night: W1 D0 L2</p>
                  <div className="mt-3 space-y-3 text-[13px] leading-snug">
                    <p><span className="font-semibold">🎯 Sniper on the Grassy Knoll</span><br />Marino: 9 shots, 0 goals. The stand behind the goal has been notified.</p>
                    <p><span className="font-semibold">🏃 The Cardio King</span><br />Bruno: covered every blade of grass, touched the ball 14 times.</p>
                    <p><span className="font-semibold">🧱 Brick Wall of Regret</span><br />Ferri: 6 tackles tried, 1 won. Respect the effort.</p>
                  </div>
                  <p className="mt-3 text-[11px] text-white/50">Banter only. Hug your teammates.</p>
                </div>
                <p className="mt-6 font-display text-xl font-bold">🎤 The press conference</p>
                <p className="mt-1 text-sm text-muted-foreground">Face the tabloids after the final whistle and pick your answer.</p>
                <div className="mt-3 rounded-xl bg-[hsl(228_8%_20%)] p-4 text-[13px] text-white">
                  <p><span className="font-semibold">Reporter:</span> Was tonight's defending a tactic, or a cry for help?</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                    {["Blame the servers", "Blame the referee", "Walk out"].map((b) => (
                      <span key={b} className="rounded bg-[hsl(228_7%_32%)] px-2.5 py-1.5">{b}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-[hsl(40_45%_92%)] p-5 text-[hsl(30_15%_12%)] lg:col-span-2">
                <div className="flex items-center justify-between border-y-2 border-[hsl(30_15%_12%)] py-1 text-[11px] font-semibold uppercase tracking-widest">
                  <span className="text-[hsl(142_60%_32%)]">Final edition</span>
                  <span>Last 10: 7-1-2</span>
                </div>
                <p className="mt-3 text-center font-display text-3xl font-bold uppercase leading-none sm:text-4xl">The Northside Chronicle</p>
                <p className="mt-3 text-center font-display text-2xl font-bold uppercase leading-tight sm:text-3xl">Fontana hat-trick sinks Wolves Town</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-[120px_1fr]">
                  <img src={card("xi-st")} alt="" loading="lazy" className="mx-auto w-28 rounded-md shadow-lg sm:w-full" />
                  <p className="text-sm leading-relaxed">
                    Northside sit 14-3-5 and the arrow points up: 10 points from the last five. Fontana leads the scoring
                    with 24 while Galli pulls the strings with 14 assists. GafferBot writes a match report after every
                    game and a full edition twice a day, in your club's own voice, with your players on the front page.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5">
                <p className="font-display text-xl font-bold">🚨 The Rumour Mill</p>
                <p className="mt-2 rounded-lg bg-muted p-3 text-sm">
                  EXCLUSIVE: Costa spotted at the airport carrying a suitcase and a single sandwich. Agents deny everything.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Made-up transfer gossip about your squad, always labelled fiction. Plus a quote wall for voice chat gold.</p>
              </div>

              <div className="rounded-2xl border bg-card p-5">
                <p className="font-display text-xl font-bold">🏆 Stat trophies</p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {["👑 Club Legend", "⚽ Golden Boot", "🎯 Playmaker", "🧤 Golden Glove", "🔥 In-Form"].map((r) => (
                    <span key={r} className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-medium">{r}</span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Real Discord roles that move to whoever earns them after every synced match. Bragging rights, updated automatically.</p>
              </div>
            </div>
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
          <h3 className="mt-16 text-2xl font-bold">And the rest of the kit bag</h3>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXTRAS.map((e) => (
              <div key={e.label} className="rounded-xl border bg-card p-5">
                <e.icon className="h-5 w-5 text-primary" />
                <p className="mt-3 font-display text-lg font-bold leading-tight">{e.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Screens */}
        <section id="screens" className="scroll-mt-20 border-t border-border/60">
          <div className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:space-y-28 sm:py-24">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">See it in action</p>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">What your club actually gets</h2>
            </div>

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

            <div>
              <div className="max-w-2xl">
                <h3 className="text-2xl font-bold sm:text-3xl">A card for every player, in 18 styles</h3>
                <p className="mt-3 text-muted-foreground">
                  Players post a photo of their pro and GafferBot turns it into a collectible card with their real season
                  stats. Go modern broadcast, 1970s archive, Y2K chrome or obsidian and gold. The same art powers signing
                  announcements, recruiting posters, match-day banners and the Chronicle's front page.
                </p>
              </div>
              <div className="-mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:thin]">
                {GALLERY.map((g) => (
                  <figure key={g.src} className="w-44 shrink-0 snap-start sm:w-52">
                    <img
                      src={g.src}
                      alt={`${g.label} player card`}
                      loading="lazy"
                      className="w-full rounded-xl shadow-xl ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-2"
                    />
                    <figcaption className="mt-2 text-center text-xs text-muted-foreground">{g.label}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Sample cards for a made-up club. Yours are drawn from your own players' pros.</p>
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
