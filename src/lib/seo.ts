// One place for every public page's search and share tags. The client sets them on navigation
// (RouteMeta in App.tsx) and scripts/prerender.mjs writes the same tags into the static HTML,
// so crawlers that don't run JavaScript see them too. Anything not listed here is an app page:
// it gets the generic title and noindex.

import { GUIDES, GUIDES_UPDATED, plain, type Guide } from "@/content/guides";

export const SITE_URL = "https://gafferbot.app";
export const SITE_NAME = "GafferBot";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

// GafferBot's profiles on other sites (top.gg, Discord App Directory, Reddit, YouTube, X ...). Add each
// listing here once it is live: search engines and AI answer engines use these links to tie the
// listings to this site as one product.
export const SAME_AS: string[] = [];

export interface PageMeta {
  title: string;
  description: string;
  /** Canonical path; defaults to the page's own path. */
  canonical?: string;
  /** Include in sitemap.xml */
  sitemap?: boolean;
  index?: boolean;
}

const HOME: PageMeta = {
  title: "GafferBot: Free Pro Clubs Discord Bot for EA SPORTS FC 27",
  description:
    "Run your EA FC 27 Pro Clubs club from Discord. GafferBot tracks availability, posts lineups, syncs EA stats and finds you players. Free for every server.",
  canonical: "/",
  sitemap: true,
  index: true,
};

export const PUBLIC_PAGES: Record<string, PageMeta> = {
  "/": HOME,
  ...Object.fromEntries(GUIDES.map((g) => [`/${g.slug}`, { title: g.title, description: g.description, sitemap: true, index: true }])),
  "/guides": {
    title: "Pro Clubs Guides: Run Your FC 27 Club on Discord | GafferBot",
    description: "Guides for EA FC 27 Pro Clubs on Discord: setting up a server, availability, lineups, stats tracking, recruiting free agents and finding pickup games.",
    sitemap: true,
    index: true,
  },
  "/faq": {
    title: "GafferBot FAQ: Pro Clubs Discord Bot Questions Answered",
    description: "Answers about GafferBot, the free EA FC 27 Pro Clubs Discord bot: features, price, EA stats, lineups, recruiting, platforms and pickup games.",
    sitemap: true,
    index: true,
  },
  // Old address of the landing page; same content, so it points search engines at "/".
  "/welcome": { ...HOME, sitemap: false },
  "/terms": {
    title: "Terms of Service | GafferBot",
    description: "The terms for using GafferBot, the Discord bot and website for EA SPORTS FC Pro Clubs managers and players.",
    sitemap: true,
    index: true,
  },
  "/privacy": {
    title: "Privacy Policy | GafferBot",
    description: "What GafferBot collects from Discord and EA SPORTS FC Pro Clubs, how it is used, how long it is kept and how to have it deleted.",
    sitemap: true,
    index: true,
  },
  "/clubs": {
    title: "EA FC 27 Pro Clubs Club Lookup: Stats, Form and Player Scores | GafferBot",
    description: "Look up any EA FC 27 Pro Clubs club: record, recent form, team scores out of 1000 against real FC27 clubs, player scores and the squad. Free, no sign-in.",
    sitemap: true,
    index: true,
  },
  "/transfers": {
    title: "Pro Clubs Transfer Board: Free Agents, Clubs Recruiting, Transfer News | GafferBot",
    description: "EA FC 27 Pro Clubs free agents looking for a club, clubs recruiting, and transfer news straight from EA's club member lists. EA-verified gamertags. Free.",
    sitemap: true,
    index: true,
  },
  "/build": {
    title: "EA FC 27 Pro Clubs Build Planner: Plan and Share Your Virtual Pro | GafferBot",
    description: "Plan an EA FC 27 Pro Clubs Virtual Pro: archetype, height and weight, attribute points against what you have, PlayStyles, and a share link for your club. Free, no sign-in.",
    sitemap: true,
    index: true,
  },
  "/clubs/compare": {
    title: "Compare Two Pro Clubs Clubs Side by Side | GafferBot",
    description: "Put two EA FC 27 Pro Clubs clubs side by side: all-time record, skill rating, recent form and team scores out of 1000. Free, no sign-in.",
    index: true,
  },
};

// Sign-in is reachable but not worth indexing (robots.txt also keeps crawlers off it).
const AUTH: PageMeta = { title: "Sign in | GafferBot", description: HOME.description, index: false };

export const APP_META: PageMeta = {
  title: "GafferBot",
  description: HOME.description,
  index: false,
};

export const NOT_FOUND_META: PageMeta = {
  title: "Page not found | GafferBot",
  description: HOME.description,
  index: false,
};

// Public Social Hub pages (/play/<slug>): a server's shop window, so they can be found
const PLAY: PageMeta = {
  title: "Play EA FC Pro Clubs any time | GafferBot Social Hub",
  description: "Drop-in EA FC Pro Clubs on Discord: live lobbies, smalls and friendlies, pickup drafts, a weekly tournament, levels and badges. Join and play now.",
  index: true,
};

// Public club pages (/club/<platform>/<clubId>): any EA club, found by its name in search
const CLUB: PageMeta = {
  title: "Pro Clubs club stats, form and player scores | GafferBot",
  description: "This EA FC 27 Pro Clubs club's record, recent form, team scores out of 1000 against real FC27 clubs, player scores and squad. Free, no sign-in.",
  index: true,
};

export function metaFor(pathname: string): PageMeta & { path: string } {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const page = PUBLIC_PAGES[path] ?? (path === "/auth" ? AUTH : /^\/play\/[a-z0-9-]+$/.test(path) ? PLAY : /^\/club\/(common-gen5|nx)\/\d+$/.test(path) ? CLUB : undefined);
  return { ...(page ?? APP_META), path };
}

export const canonicalUrl = (m: PageMeta & { path: string }) => `${SITE_URL}${m.canonical ?? m.path}`;

// Structured data for the home page (Organization, WebSite and the app itself).
export function homeJsonLd(faq: { q: string; a: string }[]) {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      image: OG_IMAGE,
      description: HOME.description,
      applicationCategory: "GameApplication",
      applicationSubCategory: "Discord bot",
      featureList: [
        "Availability and reminders for Pro Clubs games",
        "Lineup builder with all 28 FC 27 formations",
        "EA SPORTS FC 27 Pro Clubs stats sync, recaps and insights",
        "Free agent pool and recruiting",
        "Drop-in pickup games (Social Hub)",
      ],
      operatingSystem: "Discord, Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

const crumbs = (items: { name: string; path: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
});

const faqPage = (faq: { q: string; a: string }[]) => ({
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: plain(f.a) } })),
});

const ORG_REF = { "@id": `${SITE_URL}/#org` };

// Structured data for a guide page: the article, its breadcrumb, its FAQ and (setup guide) its steps
export function guideJsonLd(g: Guide) {
  const url = `${SITE_URL}/${g.slug}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Article",
      "@id": `${url}#article`,
      headline: g.h1,
      description: g.description,
      url,
      image: OG_IMAGE,
      datePublished: GUIDES_UPDATED,
      dateModified: GUIDES_UPDATED,
      author: { "@type": "Organization", name: "GafferBot Team", url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
      about: { "@type": "SoftwareApplication", name: SITE_NAME, url: SITE_URL, applicationCategory: "GameApplication" },
      mainEntityOfPage: url,
    },
    crumbs([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: g.label, path: `/${g.slug}` }]),
    faqPage(g.faq),
  ];
  const steps = g.howTo ? g.sections.find((s) => s.steps)?.steps : undefined;
  if (steps) {
    graph.push({
      "@type": "HowTo",
      name: g.h1,
      description: plain(g.answer),
      totalTime: "PT5M",
      step: steps.map((st, i) => ({ "@type": "HowToStep", position: i + 1, name: st.title, text: st.body })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function guidesIndexJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Pro Clubs guides",
        url: `${SITE_URL}/guides`,
        publisher: ORG_REF,
        hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.h1, url: `${SITE_URL}/${g.slug}` })),
      },
      crumbs([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }]),
    ],
  };
}

export function faqJsonLd(faq: { q: string; a: string }[]) {
  return { "@context": "https://schema.org", "@graph": [faqPage(faq), crumbs([{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }])] };
}
