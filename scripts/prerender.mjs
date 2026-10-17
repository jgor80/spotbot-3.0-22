// Runs after `vite build`. Server-renders the public pages (src/entry-prerender.tsx) and writes:
//   dist/index.html            "/" with the landing page in it (also the SPA fallback for app routes)
//   dist/welcome.html, dist/terms.html, dist/privacy.html
//   dist/sitemap.xml
// Each file gets that page's title, description, canonical, robots, Open Graph tags and, for the home
// page, JSON-LD. Cloudflare serves /terms from terms.html. The static copy sits in #prerender, outside
// the React root; an inline script hides it on other routes or when someone is signed in, and the page
// component removes it once React has drawn the live version.
import { build } from "vite";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const dist = path.join(root, "dist");
const ssrOut = path.join(root, "node_modules/.prerender");

await build({
  logLevel: "warn",
  build: { ssr: "src/entry-prerender.tsx", outDir: ssrOut, emptyOutDir: true, rollupOptions: { output: { format: "esm", entryFileNames: "entry.mjs" } } },
  ssr: { noExternal: true },
});
const { render, paths, sitemapPaths } = await import(pathToFileURL(path.join(ssrOut, "entry.mjs")).href);

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Hide the static copy when this file is being served for some other route (SPA fallback) or when a
// signed-in user will get the dashboard instead. Runs before first paint.
const guard = (p) => `<script>(function(){var d=document.documentElement;try{var t=localStorage.getItem("gafferbot-theme");d.classList.add(t==="light"?"light":"dark");var p=location.pathname.replace(/\\/+$/,"")||"/";var s=Object.keys(localStorage).some(function(k){return /^sb-.+-auth-token$/.test(k)});if(p!==${JSON.stringify(p)}||(s&&(p==="/")))d.classList.add("pr-hide")}catch(e){d.classList.add("dark")}})()</script><style>.pr-hide #prerender{display:none}</style>`;

function headFor({ meta, canonical, jsonLd }, p) {
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta name="robots" content="${meta.index === false ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="GafferBot" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
  ];
  if (jsonLd) tags.push(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`);
  tags.push(guard(p));
  return tags.join("\n    ");
}

// Strip the template's own copies of the tags we write per page.
const base = template
  .replace(/<title>[\s\S]*?<\/title>\s*/, "")
  .replace(/<meta\s+(name|property)="(description|robots|og:title|og:description|og:url|og:type|og:site_name|twitter:title|twitter:description)"[^>]*>\s*/g, "")
  .replace(/<link\s+rel="canonical"[^>]*>\s*/g, "");
if (!base.includes('<div id="root"></div>')) throw new Error("prerender: index.html has no empty #root");

const files = { "/": "index.html", "/welcome": "welcome.html", "/terms": "terms.html", "/privacy": "privacy.html" };
for (const p of paths) {
  const page = render(p);
  if (!page.html || page.html.length < 500) throw new Error(`prerender: ${p} rendered almost nothing`);
  const out = base
    .replace("</head>", `    ${headFor(page, p)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="prerender">${page.html}</div><div id="root"></div>`);
  fs.writeFileSync(path.join(dist, files[p]), out);
  console.log(`prerendered ${p} -> dist/${files[p]} (${Math.round(out.length / 1024)} KB)`);
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths.map((p) => `  <url><loc>https://gafferbot.app${p}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);
console.log(`sitemap.xml: ${sitemapPaths.join(", ")}`);
fs.rmSync(ssrOut, { recursive: true, force: true });
