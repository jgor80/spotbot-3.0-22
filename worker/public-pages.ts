// Server-side bits of the public pages that change with live data:
//  - /play/<slug>: a public Social Hub page. The static build only has the landing page's HTML, which would
//    tell crawlers this page is a copy of "/". Here we serve the same app shell with the hub's own title,
//    description, canonical, structured data and a plain-HTML summary that crawlers and AI engines read
//    without running JavaScript. The app then draws the live page on top as before.
//  - /sitemap.xml: the build's sitemap plus every public hub page.
import { hubDescription, hubTitle, type HubPublic } from "../src/lib/hubMeta";

const SITE = "https://gafferbot.app";

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// hub_public is world-readable (RLS allows anon); the Worker only has the service key, and only reads.
async function hubs(env: Env, query: string): Promise<HubPublic[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/hub_public?${query}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`hub_public ${res.status}`);
  return (await res.json()) as HubPublic[];
}

function hubHtml(h: HubPublic) {
  const snap = h.snapshot ?? {};
  const join = h.invite_code ? `https://discord.gg/${encodeURIComponent(h.invite_code)}` : null;
  const lobbies = (snap.lobbies ?? [])
    .map((l) => `<li>${esc(l.name)}: ${l.humans}/11${l.live ? ", in a game" : ""}${l.open?.length ? `, open: ${esc(l.open.join(", "))}` : ""}</li>`)
    .join("");
  const leaders = (snap.leaders ?? []).slice(0, 10).map((r) => `<li>${esc(r.name)}: ${r.xp} XP</li>`).join("");
  return `<main style="max-width:48rem;margin:0 auto;padding:2.5rem 1rem">
<p>EA FC 27 Pro Clubs Social Hub</p>
<h1>${esc(h.name)}</h1>
<p>${esc(hubDescription(h))}</p>
${join ? `<p><a href="${esc(join)}">Join ${esc(h.name)} on Discord</a></p>` : ""}
<h2>How it works</h2>
<p>Drop in any time: no trials, no sign-ups. Press Play now on the board in Discord and GafferBot puts you in the lobby that needs your position, or calls a game when enough people are on. Smalls, friendlies, pickup drafts, a weekly tournament, levels and badges. Find players you click with, then find a team or start one.</p>
${lobbies ? `<h2>Lobbies</h2><ul>${lobbies}</ul>` : ""}
${leaders ? `<h2>This week's top players</h2><ol>${leaders}</ol>` : ""}
<p>Powered by <a href="${SITE}/">GafferBot</a>, the free Pro Clubs Discord bot. See <a href="${SITE}/pro-clubs-pickup-games">Pro Clubs pickup games</a> and <a href="${SITE}/guides">all guides</a>.</p>
</main>`;
}

function hubJsonLd(h: HubPublic, url: string) {
  const join = h.invite_code ? `https://discord.gg/${h.invite_code}` : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: hubTitle(h),
        description: hubDescription(h),
        url,
        isPartOf: { "@type": "WebSite", name: "GafferBot", url: SITE },
        about: {
          "@type": "Organization",
          name: h.name,
          description: hubDescription(h),
          ...(join ? { url: join, sameAs: [join] } : {}),
          ...(h.icon_url ? { logo: h.icon_url } : {}),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Pro Clubs pickup games", item: `${SITE}/pro-clubs-pickup-games` },
          { "@type": "ListItem", position: 3, name: h.name, item: url },
        ],
      },
    ],
  };
}

export async function playPage(req: Request, env: Env, slug: string): Promise<Response> {
  // A plain request (no If-None-Match from the browser), so the shell always comes back with a body
  const shell = await env.ASSETS.fetch(new Request(new URL("/", req.url)));
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return shell;
  let hub: HubPublic | undefined;
  try {
    [hub] = await hubs(env, `select=slug,name,icon_url,invite_code,members,snapshot,updated_at&slug=eq.${slug}&limit=1`);
  } catch (e) {
    console.error("play page", e);
    return shell; // the app still loads the hub itself
  }
  const url = `${SITE}/play/${slug}`;
  const title = hub ? hubTitle(hub) : "Hub not found | GafferBot";
  const description = hub ? hubDescription(hub) : "This Social Hub isn't public, or the link is wrong.";
  const attr = (name: string, value: string) => ({ element: (el: Element) => el.setAttribute(name, value) });
  const rewriter = new HTMLRewriter()
    .on("title", { element: (el) => el.setInnerContent(title) })
    .on('meta[name="description"]', attr("content", description))
    .on('meta[property="og:title"]', attr("content", title))
    .on('meta[name="twitter:title"]', attr("content", title))
    .on('meta[property="og:description"]', attr("content", description))
    .on('meta[name="twitter:description"]', attr("content", description))
    .on('meta[property="og:url"]', attr("content", url))
    .on('link[rel="canonical"]', attr("href", url))
    .on('meta[name="robots"]', attr("content", hub ? "index, follow, max-image-preview:large" : "noindex, nofollow"))
    .on('script[type="application/ld+json"]', {
      element: (el) => (hub ? el.setInnerContent(JSON.stringify(hubJsonLd(hub, url)).replace(/</g, "\\u003c"), { html: true }) : el.remove()),
    })
    .on("div#prerender", { element: (el) => el.setInnerContent(hub ? hubHtml(hub) : "", { html: true }) });
  const headers = new Headers(shell.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300");
  headers.delete("Content-Length");
  headers.delete("ETag");
  return rewriter.transform(new Response(shell.body, { status: hub ? 200 : 404, headers }));
}

export async function sitemap(req: Request, env: Env): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/sitemap.xml", req.url)));
  let xml = await base.text();
  try {
    const rows = await hubs(env, "select=slug,updated_at&order=updated_at.desc&limit=1000");
    const urls = rows
      .map((h) => `  <url><loc>${SITE}/play/${esc(h.slug)}</loc>${h.updated_at ? `<lastmod>${h.updated_at.slice(0, 10)}</lastmod>` : ""}</url>`)
      .join("\n");
    if (urls) xml = xml.replace("</urlset>", `${urls}\n</urlset>`);
  } catch (e) {
    console.error("sitemap hubs", e);
  }
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
