// Server-side bits of the public pages that change with live data:
//  - /play/<slug>: a public Social Hub page. The static build only has the landing page's HTML, which would
//    tell crawlers this page is a copy of "/". Here we serve the same app shell with the hub's own title,
//    description, canonical, structured data and a plain-HTML summary that crawlers and AI engines read
//    without running JavaScript. The app then draws the live page on top as before.
//  - /clubs, /clubs/compare and /club/<platform>/<clubId>: public club lookup pages. Same idea: the
//    page's own title, description, canonical and robots, and for a club page its name and record.
//  - /sitemap.xml: the build's sitemap plus every public hub page.
import { hubDescription, hubTitle, type HubPublic } from "../src/lib/hubMeta";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "../src/lib/publicBackend";
import { metaFor } from "../src/lib/seo";
import type { PublicClubPayload } from "../src/lib/publicClub";

const SITE = "https://gafferbot.app";

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// hub_public is world-readable (RLS allows anon), so this reads it with the same public backend and anon
// key as the website: no secrets needed, and PR previews work the same as production.
async function hubs(query: string): Promise<HubPublic[]> {
  const res = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/hub_public?${query}`, {
    headers: { apikey: PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}` },
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
    [hub] = await hubs(`select=slug,name,icon_url,invite_code,members,snapshot,updated_at&slug=eq.${slug}&limit=1`);
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

// Shared by the hub and club pages: the app shell with this page's own tags and crawlable summary
async function shellWith(
  req: Request,
  env: Env,
  page: { url: string; title: string; description: string; index: boolean; jsonLd?: unknown; html?: string; status?: number; maxAge?: number },
): Promise<Response> {
  const shell = await env.ASSETS.fetch(new Request(new URL("/", req.url)));
  const attr = (name: string, value: string) => ({ element: (el: Element) => el.setAttribute(name, value) });
  const rewriter = new HTMLRewriter()
    .on("title", { element: (el) => el.setInnerContent(page.title) })
    .on('meta[name="description"]', attr("content", page.description))
    .on('meta[property="og:title"]', attr("content", page.title))
    .on('meta[name="twitter:title"]', attr("content", page.title))
    .on('meta[property="og:description"]', attr("content", page.description))
    .on('meta[name="twitter:description"]', attr("content", page.description))
    .on('meta[property="og:url"]', attr("content", page.url))
    .on('link[rel="canonical"]', attr("href", page.url))
    .on('meta[name="robots"]', attr("content", page.index ? "index, follow, max-image-preview:large" : "noindex, nofollow"))
    .on('script[type="application/ld+json"]', {
      element: (el) => (page.jsonLd ? el.setInnerContent(JSON.stringify(page.jsonLd).replace(/</g, "\\u003c"), { html: true }) : el.remove()),
    })
    .on("div#prerender", { element: (el) => el.setInnerContent(page.html ?? "", { html: true }) });
  const headers = new Headers(shell.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", `public, max-age=${page.maxAge ?? 300}`);
  headers.delete("Content-Length");
  headers.delete("ETag");
  return rewriter.transform(new Response(shell.body, { status: page.status ?? 200, headers }));
}

function clubHtml(c: PublicClubPayload, url: string) {
  const o = c.overall;
  const record = o ? `${o.wins} wins, ${o.draws} draws and ${o.losses} losses in ${o.games} games` : null;
  const squad = c.members.slice(0, 15).map((m) => `<li>${esc(m.name)}: ${m.games} games, ${m.goals} goals, ${m.assists} assists${m.rating !== null ? `, ${m.rating.toFixed(1)} average rating` : ""}</li>`).join("");
  return `<main style="max-width:48rem;margin:0 auto;padding:2.5rem 1rem">
<p>EA FC 27 Pro Clubs club</p>
<h1>${esc(c.name)}</h1>
${record ? `<p>All-time: ${esc(record)}${o?.skillRating ? `, skill rating ${o.skillRating}` : ""}${o?.bestDivision ? `, best division ${o.bestDivision}` : ""}.</p>` : ""}
${squad ? `<h2>Squad</h2><ul>${squad}</ul>` : ""}
<p>Team scores out of 1000, recent form and player scores load on <a href="${esc(url)}">this page</a>. Look up <a href="${SITE}/clubs">any other club</a> or run your own club with <a href="${SITE}/">GafferBot</a>, the free Pro Clubs Discord bot.</p>
</main>`;
}

const CLUB_PATH = /^\/club\/(common-gen5|nx)\/(\d{1,15})\/?$/;
export const isClubLookupPath = (path: string) => path === "/clubs" || path === "/clubs/" || path === "/clubs/compare" || path === "/clubs/compare/" || CLUB_PATH.test(path);

// loadClub: fetches the public-club function (through the bot's functions server); null when it can't
export async function clubLookupPage(req: Request, env: Env, loadClub: (platform: string, clubId: string) => Promise<PublicClubPayload | null>): Promise<Response> {
  const path = new URL(req.url).pathname;
  const meta = metaFor(path);
  const url = `${SITE}${meta.path}`;
  const m = path.match(CLUB_PATH);
  if (!m) return shellWith(req, env, { url, title: meta.title, description: meta.description, index: meta.index !== false });
  let club: PublicClubPayload | null = null;
  try {
    club = await loadClub(m[1], m[2]);
  } catch (e) {
    console.error("club page", e);
  }
  if (!club) return shellWith(req, env, { url, title: meta.title, description: meta.description, index: false, maxAge: 60 });
  const o = club.overall;
  const title = `${club.name}: Pro Clubs stats, form and player scores | GafferBot`;
  const description = `${club.name} on EA FC 27 Pro Clubs${o ? `: ${o.wins}W ${o.draws}D ${o.losses}L all time${o.skillRating ? `, skill rating ${o.skillRating}` : ""}` : ""}. Recent form, team scores out of 1000 and player scores, free.`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: title,
        description,
        url,
        isPartOf: { "@type": "WebSite", name: "GafferBot", url: SITE },
        about: { "@type": "SportsTeam", name: club.name, sport: "EA SPORTS FC Pro Clubs", ...(club.crest ? { logo: club.crest } : {}) },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Club lookup", item: `${SITE}/clubs` },
          { "@type": "ListItem", position: 3, name: club.name, item: url },
        ],
      },
    ],
  };
  return shellWith(req, env, { url, title, description, index: true, jsonLd, html: clubHtml(club, url) });
}

export async function sitemap(req: Request, env: Env): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/sitemap.xml", req.url)));
  let xml = await base.text();
  try {
    const rows = await hubs("select=slug,updated_at&order=updated_at.desc&limit=1000");
    const urls = rows
      .map((h) => `  <url><loc>${SITE}/play/${esc(h.slug)}</loc>${h.updated_at ? `<lastmod>${h.updated_at.slice(0, 10)}</lastmod>` : ""}</url>`)
      .join("\n");
    if (urls) xml = xml.replace("</urlset>", `${urls}\n</urlset>`);
  } catch (e) {
    console.error("sitemap hubs", e);
  }
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
