// Build-time only (scripts/prerender.mjs): renders the public pages to static HTML so search engines,
// link previews and AI crawlers get real content without running the app.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "@/pages/LandingPage";
import TermsPage from "@/pages/TermsPage";
import PrivacyPage from "@/pages/PrivacyPage";
import { FaqPage, GuideArticle, GuidesIndex } from "@/pages/GuidePage";
import { GUIDES, HOME_FAQ, THE_SPOT_PATH, allFaq, plain } from "@/content/guides";
import { PUBLIC_PAGES, SITE_URL, canonicalUrl, faqJsonLd, guideJsonLd, guidesIndexJsonLd, homeJsonLd, metaFor } from "@/lib/seo";

const FAQ_ALL = allFaq(HOME_FAQ);

const PAGES: Record<string, { page: () => JSX.Element; jsonLd?: () => unknown }> = {
  "/": { page: () => <LandingPage />, jsonLd: () => homeJsonLd(HOME_FAQ) },
  "/welcome": { page: () => <LandingPage />, jsonLd: () => homeJsonLd(HOME_FAQ) },
  "/terms": { page: () => <TermsPage /> },
  "/privacy": { page: () => <PrivacyPage /> },
  "/guides": { page: () => <GuidesIndex />, jsonLd: guidesIndexJsonLd },
  "/faq": { page: () => <FaqPage faq={FAQ_ALL} />, jsonLd: () => faqJsonLd(FAQ_ALL) },
  ...Object.fromEntries(GUIDES.map((g) => [`/${g.slug}`, { page: () => <GuideArticle guide={g} />, jsonLd: () => guideJsonLd(g) }])),
};

export function render(path: string) {
  const { page: Page, jsonLd } = PAGES[path];
  const html = renderToString(
    <StaticRouter location={path}>
      <TooltipProvider>
        <Page />
      </TooltipProvider>
    </StaticRouter>,
  );
  const meta = metaFor(path);
  return { html, meta, canonical: canonicalUrl(meta), jsonLd: jsonLd?.() ?? null };
}

export const paths = Object.keys(PAGES);
export const sitemapPaths = Object.entries(PUBLIC_PAGES).filter(([, m]) => m.sitemap).map(([p]) => p);

// /llms.txt (https://llmstxt.org): a short map of the site for AI assistants and answer engines.
// /llms-full.txt: every guide and answer in plain text, so they can quote GafferBot accurately.
export function llmsTxt() {
  const lines = [
    "# GafferBot",
    "",
    "> GafferBot is a free Discord bot and website for EA SPORTS FC 27 Pro Clubs. It runs a club from one /manager panel in Discord: availability with reminders, a lineup builder with all 28 FC 27 formations, EA stats sync with recaps and insights, a cross-server free agent pool and recruiting, and match night tools. It also runs The Spot, an open Discord server for drop-in Pro Clubs pickup games. Every feature is free; AI-generated images have a free allowance per server, then optional image packs. GafferBot is independent and not made by EA or Discord.",
    "",
    "## Guides",
    ...GUIDES.map((g) => `- [${g.h1}](${SITE_URL}/${g.slug}): ${g.description}`),
    "",
    "## Key pages",
    `- [Home](${SITE_URL}/): what GafferBot does, pricing and FAQ`,
    `- [FAQ](${SITE_URL}/faq): every common question, answered`,
    `- [The Spot: Pro Clubs pickup server](${SITE_URL}${THE_SPOT_PATH}): live lobbies and the Discord invite`,
    `- [Full text for AI assistants](${SITE_URL}/llms-full.txt)`,
    "",
    "## Optional",
    `- [Terms of Service](${SITE_URL}/terms)`,
    `- [Privacy Policy](${SITE_URL}/privacy)`,
    "",
  ];
  return lines.join("\n");
}

export function llmsFullTxt() {
  const out = [llmsTxt(), ""];
  for (const g of GUIDES) {
    out.push(`# ${g.h1}`, `URL: ${SITE_URL}/${g.slug}`, "", plain(g.answer), "");
    for (const s of g.sections) {
      out.push(`## ${s.heading}`, "");
      s.paragraphs?.forEach((p) => out.push(plain(p), ""));
      s.bullets?.forEach((b) => out.push(`- ${plain(b)}`));
      s.steps?.forEach((st, i) => out.push(`${i + 1}. ${st.title}: ${st.body}`));
      if (s.bullets || s.steps) out.push("");
    }
    out.push("## Questions", "");
    g.faq.forEach((f) => out.push(`Q: ${f.q}`, `A: ${plain(f.a)}`, ""));
  }
  out.push("# GafferBot FAQ", `URL: ${SITE_URL}/faq`, "");
  FAQ_ALL.forEach((f) => out.push(`Q: ${f.q}`, `A: ${plain(f.a)}`, ""));
  return out.join("\n");
}
