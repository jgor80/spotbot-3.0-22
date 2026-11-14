// The FUT app's map: seven sections, each answering one question, with the pages inside it as tabs. The nav, the tabs
// under every FUT page header and the Coach page's links all read this, so a page lives in exactly one place.
export interface FutTab { path: string; label: string }
export interface FutSection { key: string; label: string; short: string; question: string; tabs: FutTab[]; /** Pages without a tab of their own (detail pages). */ also?: string[] }

export const FUT_SECTIONS: FutSection[] = [
  { key: "coach", label: "Coach", short: "Coach", question: "What should I do with my coins right now?", tabs: [{ path: "/fut", label: "Coins plan" }] },
  { key: "squad", label: "Squad", short: "Squad", question: "How do I make my team better?", also: ["/fut/squads/"], tabs: [
    { path: "/fut/squads", label: "Squad Builder" }, { path: "/fut/evolutions", label: "Evolutions" }, { path: "/fut/objectives", label: "Objectives" }, { path: "/fut/champs", label: "Champs Tracker" },
  ] },
  { key: "players", label: "Players", short: "Players", question: "Who's good, and what do they cost?", also: ["/fut/market/card/"], tabs: [
    { path: "/fut/market/cards", label: "Card Search" }, { path: "/fut/players", label: "Player Ratings" }, { path: "/fut/meta", label: "Meta Ratings" }, { path: "/fut/compare", label: "Compare" },
  ] },
  { key: "market", label: "Market", short: "Market", question: "How do I grow my coins?", tabs: [
    { path: "/fut/strategy", label: "Daily Strategy" }, { path: "/fut/market", label: "Market now" }, { path: "/fut/market/radar", label: "Opportunities" }, { path: "/fut/market/watchlist", label: "Watchlist" },
    { path: "/fut/calendar", label: "Calendar" }, { path: "/fut/fodder", label: "Fodder prices" }, { path: "/fut/market/import", label: "Import prices" }, { path: "/fut/market/sources", label: "Data sources" },
  ] },
  { key: "club", label: "My Club", short: "Club", question: "What have I got, and what's it worth?", tabs: [
    { path: "/fut/account", label: "Account" }, { path: "/fut/cards", label: "My Cards" }, { path: "/fut/sell", label: "Sell or Keep" }, { path: "/fut/trades", label: "Trade Log" },
  ] },
  { key: "packs", label: "Packs & SBCs", short: "SBCs", question: "Is it worth doing?", tabs: [
    { path: "/fut/sbc", label: "SBC Solver" }, { path: "/fut/packs", label: "Pack Advisor" }, { path: "/fut/draft", label: "Draft and Packs" },
  ] },
  { key: "knowledge", label: "Knowledge Bank", short: "Bank", question: "What does the community say?", tabs: [{ path: "/fut/knowledge", label: "Knowledge Bank" }] },
];

/** The section a FUT page belongs to, and which of its tabs is the current one. */
export function futSectionFor(pathname: string): { section: FutSection; tab: FutTab | null } | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const section of FUT_SECTIONS) {
    const tab = section.tabs.find((t) => t.path === path);
    if (tab) return { section, tab };
  }
  for (const section of FUT_SECTIONS) if (section.also?.some((prefix) => path.startsWith(prefix))) return { section, tab: section.tabs[0] ?? null };
  return null;
}
