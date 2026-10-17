// One place for every public page's search and share tags. The client sets them on navigation
// (RouteMeta in App.tsx) and scripts/prerender.mjs writes the same tags into the static HTML,
// so crawlers that don't run JavaScript see them too. Anything not listed here is an app page:
// it gets the generic title and noindex.

export const SITE_URL = "https://gafferbot.app";
export const SITE_NAME = "GafferBot";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

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
  title: "GafferBot: The Free Pro Clubs Discord Bot for EA SPORTS FC",
  description:
    "Run your EA FC Pro Clubs club from Discord. GafferBot tracks availability, posts lineups, syncs EA stats and finds you players. Free for every server.",
  canonical: "/",
  sitemap: true,
  index: true,
};

export const PUBLIC_PAGES: Record<string, PageMeta> = {
  "/": HOME,
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

export function metaFor(pathname: string): PageMeta & { path: string } {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const page = PUBLIC_PAGES[path] ?? (path === "/auth" ? AUTH : undefined);
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
