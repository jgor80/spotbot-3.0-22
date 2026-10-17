// Writes static HTML for the public pages after `vite build` so search engines and link previews get real
// content and per-page metadata without running JavaScript. Cloudflare serves dist/welcome.html at /welcome;
// every other path still falls back to dist/index.html (the "/" metadata). Run via `npm run build`.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const ssrDir = path.join(root, "dist-ssr");

const { render, PRERENDER_PATHS, PUBLIC_PAGES, SITE_URL } = await import(pathToFileURL(path.join(ssrDir, "prerender.js")).href);
const template = readFileSync(path.join(dist, "index.html"), "utf8");
const manifestPath = path.join(dist, ".vite", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// The page's own chunk and the chunks it imports, so the browser fetches them alongside the entry
// instead of after it (main.tsx loads the page before React takes over the static HTML)
const PAGE_SOURCES = { "/welcome": "src/pages/LandingPage.tsx", "/terms": "src/pages/TermsPage.tsx", "/privacy": "src/pages/PrivacyPage.tsx" };
function chunkFiles(key, seen = new Set()) {
  const entry = manifest[key];
  if (!entry || seen.has(key) || entry.isEntry) return seen;
  seen.add(key);
  for (const dep of entry.imports ?? []) chunkFiles(dep, seen);
  return seen;
}
function preloadLinks(route) {
  const keys = chunkFiles(PAGE_SOURCES[route]);
  if (!keys.size) throw new Error(`prerender: no build manifest entry for ${PAGE_SOURCES[route]}`);
  return [...keys]
    .map((k) => `/${manifest[k].file}`)
    .filter((href) => !template.includes(`href="${href}"`))
    .map((href) => `    <link rel="modulepreload" crossorigin href="${href}">`)
    .join("\n");
}

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function setTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`prerender: index.html is missing ${pattern}`);
  return html.replace(pattern, replacement);
}

for (const route of PRERENDER_PATHS) {
  const { title, description } = PUBLIC_PAGES[route];
  const url = `${SITE_URL}${route}`;
  let html = template;
  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${escapeText(title)}</title>`);
  html = setTag(html, /(<meta name="description" content=")[^"]*/, `$1${escapeAttr(description)}`);
  html = setTag(html, /(<link rel="canonical" href=")[^"]*/, `$1${url}`);
  html = setTag(html, /(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  for (const key of ['property="og:title"', 'name="twitter:title"']) {
    html = setTag(html, new RegExp(`(<meta ${key} content=")[^"]*`), `$1${escapeAttr(title)}`);
  }
  for (const key of ['property="og:description"', 'name="twitter:description"']) {
    html = setTag(html, new RegExp(`(<meta ${key} content=")[^"]*`), `$1${escapeAttr(description)}`);
  }
  html = setTag(html, /<\/head>/, `${preloadLinks(route)}\n  </head>`);
  // Swap the "/" crawler fallback (and the script that removes it) for the rendered page
  html = setTag(html, /<div id="root">[\s\S]*?<\/div><\/div>/, `<div id="root" data-prerendered>${render(route)}</div>`);
  html = setTag(html, /\s*<!-- The fallback above[^>]*-->\s*<script>[^<]*<\/script>/, "");
  writeFileSync(path.join(dist, `${route.slice(1)}.html`), html);
  console.log(`prerendered ${route} (${Math.round(html.length / 1024)} KB)`);
}

rmSync(ssrDir, { recursive: true, force: true });
rmSync(path.dirname(manifestPath), { recursive: true, force: true });
