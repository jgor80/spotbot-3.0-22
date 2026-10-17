// Build-time only (scripts/prerender.mjs): renders the public pages to static HTML so search engines,
// link previews and AI crawlers get real content without running the app.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage, { FAQ } from "@/pages/LandingPage";
import TermsPage from "@/pages/TermsPage";
import PrivacyPage from "@/pages/PrivacyPage";
import { PUBLIC_PAGES, canonicalUrl, homeJsonLd, metaFor } from "@/lib/seo";

const PAGES: Record<string, () => JSX.Element> = {
  "/": () => <LandingPage />,
  "/welcome": () => <LandingPage />,
  "/terms": () => <TermsPage />,
  "/privacy": () => <PrivacyPage />,
};

export function render(path: string) {
  const Page = PAGES[path];
  const html = renderToString(
    <StaticRouter location={path}>
      <TooltipProvider>
        <Page />
      </TooltipProvider>
    </StaticRouter>,
  );
  const meta = metaFor(path);
  const jsonLd = path === "/" || path === "/welcome" ? homeJsonLd(FAQ) : null;
  return { html, meta, canonical: canonicalUrl(meta), jsonLd };
}

export const paths = Object.keys(PAGES);
export const sitemapPaths = Object.entries(PUBLIC_PAGES).filter(([, m]) => m.sitemap).map(([p]) => p);
