// Search and share metadata for the public pages. index.html carries the "/" values for crawlers that
// don't run JavaScript, scripts/prerender.mjs writes the others into welcome.html, terms.html and
// privacy.html at build time, and RouteSeo keeps the head in step during in-app navigation.

export const SITE_URL = "https://gafferbot.app";

export interface PageSeo {
  title: string;
  description: string;
}

export const PUBLIC_PAGES: Record<string, PageSeo> = {
  "/": {
    title: "GafferBot: Pro Clubs club manager for Discord",
    description:
      "GafferBot runs your EA SPORTS FC Pro Clubs side from Discord: availability, lineups, EA match stats, player cards and recruiting. Free for every server.",
  },
  "/welcome": {
    title: "GafferBot: Run your Pro Clubs side from Discord",
    description:
      "The Discord bot for EA SPORTS FC Pro Clubs. It chases availability, posts the lineup, syncs your EA stats, makes player cards and finds you players. Free for every server.",
  },
  "/terms": {
    title: "Terms of Service | GafferBot",
    description: "The terms for using GafferBot, the Discord bot and web app for EA SPORTS FC Pro Clubs.",
  },
  "/privacy": {
    title: "Privacy Policy | GafferBot",
    description: "What data GafferBot collects from Discord and EA SPORTS FC Pro Clubs, how it is used and how to remove it.",
  },
};

// Signed-in app and one-off links: kept out of search results
export const APP_TITLE = "GafferBot";
