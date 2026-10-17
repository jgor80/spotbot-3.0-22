import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { canonicalUrl, metaFor, NOT_FOUND_META, OG_IMAGE, type PageMeta } from "@/lib/seo";

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}
const meta = (key: "name" | "property", id: string) => () => {
  const m = document.createElement("meta");
  m.setAttribute(key, id);
  return m;
};

export function applyMeta(m: PageMeta & { path: string }) {
  document.title = m.title;
  const url = m.index === false ? null : canonicalUrl(m);
  setTag('meta[name="description"]', meta("name", "description"), "content", m.description);
  setTag('meta[name="robots"]', meta("name", "robots"), "content", m.index === false ? "noindex, nofollow" : "index, follow");
  setTag('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), "href", url);
  setTag('meta[property="og:title"]', meta("property", "og:title"), "content", m.title);
  setTag('meta[property="og:description"]', meta("property", "og:description"), "content", m.description);
  setTag('meta[property="og:url"]', meta("property", "og:url"), "content", url);
  setTag('meta[property="og:image"]', meta("property", "og:image"), "content", OG_IMAGE);
  setTag('meta[name="twitter:title"]', meta("name", "twitter:title"), "content", m.title);
  setTag('meta[name="twitter:description"]', meta("name", "twitter:description"), "content", m.description);
}

/** Keeps the page title, description, canonical and robots tags in step with the route. */
export function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => applyMeta(metaFor(pathname)), [pathname]);
  return null;
}

/** For the 404 page: it is served with status 200 by the SPA fallback, so tell crawlers not to index it. */
export function useNotFoundMeta() {
  const { pathname } = useLocation();
  useEffect(() => applyMeta({ ...NOT_FOUND_META, path: pathname }), [pathname]);
}

/** Removes the static copy of the page that scripts/prerender.mjs puts in index.html, once React has drawn the real one. */
export function useDropPrerender() {
  useEffect(() => {
    document.getElementById("prerender")?.remove();
  }, []);
}
