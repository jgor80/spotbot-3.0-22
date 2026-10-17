import { lazy, type ComponentType } from "react";

// A lazy page that main.tsx can load before the first render. The public pages are prerendered to static
// HTML at build time (scripts/prerender.mjs), so React swaps that HTML for the same page in one step
// instead of flashing the loading spinner first.
function preloadablePage(load: () => Promise<{ default: ComponentType }>) {
  let Loaded: ComponentType | null = null;
  const preload = () => load().then((m) => { Loaded = m.default; });
  const Lazy = lazy(load);
  const Page = () => (Loaded ? <Loaded /> : <Lazy />);
  return Object.assign(Page, { preload });
}

export const LandingPage = preloadablePage(() => import("./pages/LandingPage"));
export const TermsPage = preloadablePage(() => import("./pages/TermsPage"));
export const PrivacyPage = preloadablePage(() => import("./pages/PrivacyPage"));
