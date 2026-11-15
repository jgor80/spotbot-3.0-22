import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToDiscord, PublicFooter, PublicHeader, useInviteUrl } from "@/components/public/PublicChrome";
import { useDropPrerender } from "@/components/RouteMeta";
import { GUIDES, GUIDES_UPDATED, THE_SPOT_PATH, guideBySlug, type Guide } from "@/content/guides";

// Public guide pages (/pro-clubs-discord-bot, /faq, /guides ...). Content lives in src/content/guides.ts.
// Prerendered at build time (scripts/prerender.mjs), so nothing here may touch the browser while rendering.

/** Renders **bold** and [text](href) from the guide text. Internal links use the router. */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index} className="font-semibold text-foreground">{m[1]}</strong>);
    else if (m[3].startsWith("/")) out.push(<Link key={m.index} to={m[3]} className="text-primary underline underline-offset-2">{m[2]}</Link>);
    else out.push(<a key={m.index} href={m[3]} className="text-primary underline underline-offset-2">{m[2]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {items.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {c.to ? <Link to={c.to} className="hover:text-foreground">{c.label}</Link> : <span className="text-foreground">{c.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

export function FaqList({ faq }: { faq: { q: string; a: string }[] }) {
  // Plain <details> keep every answer in the HTML for crawlers and work without JavaScript
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {faq.map((f) => (
        <details key={f.q} className="group px-5 py-4" open>
          <summary className="cursor-pointer list-none font-semibold">
            <h3 className="inline">{f.q}</h3>
          </summary>
          <p className="mt-2 text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

function Cta({ inviteUrl }: { inviteUrl: string | null }) {
  return (
    <section className="rounded-3xl bg-gradient-hero px-6 py-10 text-center text-white">
      <h2 className="text-2xl font-bold sm:text-3xl">Free for every club</h2>
      <p className="mx-auto mt-2 max-w-xl text-white/85">Add GafferBot to your Discord, run /setup and your next match night runs itself. Just want a game? Drop into The Spot.</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <AddToDiscord url={inviteUrl} className="bg-white text-[hsl(220_25%_10%)] hover:bg-white/90" />
        <Button asChild size="lg" variant="outline" className="h-12 border-white/60 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white">
          <Link to={THE_SPOT_PATH}>Find a pickup game</Link>
        </Button>
      </div>
    </section>
  );
}

function PublicPage({ children }: { children: ReactNode }) {
  useDropPrerender();
  const inviteUrl = useInviteUrl();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader inviteUrl={inviteUrl} />
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:py-14">
        {children}
        <Cta inviteUrl={inviteUrl} />
      </main>
      <PublicFooter />
    </div>
  );
}

export function GuideArticle({ guide }: { guide: Guide }) {
  return (
    <PublicPage>
      <article className="space-y-10">
        <header className="space-y-4">
          <Crumbs items={[{ label: "Home", to: "/" }, { label: "Guides", to: "/guides" }, { label: guide.label }]} />
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">{guide.kicker}</p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{guide.h1}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground"><Rich text={guide.answer} /></p>
          <p className="text-xs text-muted-foreground">Updated <time dateTime={GUIDES_UPDATED}>{GUIDES_UPDATED}</time> · By the GafferBot Team</p>
        </header>
        {guide.sections.map((s) => (
          <section key={s.heading} className="space-y-4">
            <h2 className="text-2xl font-bold">{s.heading}</h2>
            {s.paragraphs?.map((p) => (
              <p key={p} className="leading-relaxed text-muted-foreground"><Rich text={p} /></p>
            ))}
            {s.bullets && (
              <ul className="space-y-2 pl-5 text-muted-foreground [&>li]:list-disc">
                {s.bullets.map((b) => <li key={b}><Rich text={b} /></li>)}
              </ul>
            )}
            {s.steps && (
              <ol className="space-y-3">
                {s.steps.map((st, i) => (
                  <li key={st.title} className="flex gap-4 rounded-2xl border bg-card p-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-hero font-display font-bold text-white">{i + 1}</span>
                    <div>
                      <h3 className="font-semibold">{st.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{st.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Questions</h2>
          <FaqList faq={guide.faq} />
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Related guides</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {guide.related.map(guideBySlug).filter(Boolean).map((g) => (
              <li key={g!.slug}>
                <Link to={`/${g!.slug}`} className="block rounded-2xl border bg-card p-4 hover:border-primary">
                  <span className="font-semibold">{g!.h1}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </PublicPage>
  );
}

export function GuidesIndex() {
  return (
    <PublicPage>
      <header className="space-y-4">
        <Crumbs items={[{ label: "Home", to: "/" }, { label: "Guides" }]} />
        <h1 className="text-3xl font-bold sm:text-4xl">Pro Clubs guides</h1>
        <p className="text-lg text-muted-foreground">
          How to run an EA SPORTS FC 27 Pro Clubs club on Discord with GafferBot: setup, availability, lineups, stats, recruiting and where to find a game.
        </p>
      </header>
      <ul className="grid gap-4">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link to={`/${g.slug}`} className="block rounded-2xl border bg-card p-5 hover:border-primary">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{g.kicker}</p>
              <h2 className="mt-1 text-xl font-bold">{g.h1}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{g.description}</p>
            </Link>
          </li>
        ))}
        <li>
          <Link to="/faq" className="block rounded-2xl border bg-card p-5 hover:border-primary">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">FAQ</p>
            <h2 className="mt-1 text-xl font-bold">GafferBot questions and answers</h2>
          </Link>
        </li>
      </ul>
    </PublicPage>
  );
}

export function FaqPage({ faq }: { faq: { q: string; a: string }[] }) {
  return (
    <PublicPage>
      <header className="space-y-4">
        <Crumbs items={[{ label: "Home", to: "/" }, { label: "FAQ" }]} />
        <h1 className="text-3xl font-bold sm:text-4xl">GafferBot FAQ: the Pro Clubs Discord bot</h1>
        <p className="text-lg text-muted-foreground">
          Answers about GafferBot, the free Discord bot for EA SPORTS FC 27 Pro Clubs: what it does, what it costs, where stats come from and how to find a game.
        </p>
      </header>
      <FaqList faq={faq} />
    </PublicPage>
  );
}
