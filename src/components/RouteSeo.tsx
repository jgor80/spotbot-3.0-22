import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_TITLE, PUBLIC_PAGES, SITE_URL } from "@/lib/seo";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

// Keeps title, description, canonical and robots right as people move around the app. Public pages
// get their own metadata; every other route is the signed-in app and is marked noindex.
export function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const page = PUBLIC_PAGES[path];
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (page) {
      document.title = page.title;
      setMeta("name", "description", page.description);
      setMeta("property", "og:title", page.title);
      setMeta("property", "og:description", page.description);
      setMeta("property", "og:url", `${SITE_URL}${path}`);
      setMeta("name", "robots", "index, follow");
      if (canonical) canonical.href = `${SITE_URL}${path}`;
    } else {
      document.title = APP_TITLE;
      setMeta("name", "robots", "noindex, follow");
    }
  }, [pathname]);
  return null;
}
