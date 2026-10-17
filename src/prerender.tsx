// Build-time only (vite build --ssr, then scripts/prerender.mjs): renders the public pages to static HTML
// so search engines and link previews see real content without running JavaScript.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import type { ComponentType } from "react";
import LandingPage from "./pages/LandingPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import { PUBLIC_PAGES, SITE_URL } from "./lib/seo";

const PAGES: Record<string, ComponentType> = {
  "/welcome": LandingPage,
  "/terms": TermsPage,
  "/privacy": PrivacyPage,
};

export { PUBLIC_PAGES, SITE_URL };

export function render(path: string): string {
  const Page = PAGES[path];
  return renderToString(
    <StaticRouter location={path}>
      <Page />
    </StaticRouter>,
  );
}

export const PRERENDER_PATHS = Object.keys(PAGES);
