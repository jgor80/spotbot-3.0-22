// More Pro Clubs build sources: creators' uploads and build guides on sites that allow it (build-web.ts).
import { collectWebBuildSources, creatorBuildVideos, feedLinks, pageText, robotsAllows, webId, WEB_BUILD_SITES, WEB_USER_AGENT } from "../_shared/fut/build-web.ts";
import { collectBuildSources, olderGameTitle } from "../_shared/fut/meta-builds.ts";
import { knowledgeDb, rpcOver } from "../_shared/fut/knowledge-test-db.ts";

const eq = (a: unknown, b: unknown, msg = "values differ") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};
const ok = (v: unknown, msg = "expected true") => { if (!v) throw new Error(msg); };
const NOW = Date.parse("2026-11-17T04:00:00Z");
const DAY = 86_400_000;

Deno.test("robots.txt: our reader, everyone and AI readers", () => {
  const hq = "User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: anthropic-ai\nDisallow: /\n\nUser-agent: *\nAllow: /\nDisallow: /admin\n";
  ok(!robotsAllows(hq, "/blog/best-pro-clubs-goalkeeper-builds/"), "a site that blocks AI readers is skipped");
  const pro11 = "User-agent: *\nAllow: /\nDisallow: /search/\n\nSitemap: https://www.pro11.net/sitemap-index.xml\n";
  ok(robotsAllows(pro11, "/best-shot-stopper-build/") && !robotsAllows(pro11, "/search/?q=x"));
  ok(robotsAllows("", "/anything"), "no robots.txt: allowed");
  ok(!robotsAllows("User-agent: GafferBotKB\nDisallow: /\n\nUser-agent: *\nAllow: /\n", "/x"), "a rule for this reader wins");
  ok(robotsAllows("User-agent: *\nDisallow: /*?s=*\n", "/guide/") && !robotsAllows("User-agent: *\nDisallow: /*?s=*\n", "/?s=clubs"), "wildcards");
  ok(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/builds\n", "/private/builds/gk"), "the longer rule wins");
});

Deno.test("pages and feeds: readable text, build links, stable ids", async () => {
  const page = pageText(`<html><head><title>Best Shot Stopper Build in EA FC 27 Pro Clubs &amp; more</title><script>var x=1</script>
    <script type="application/ld+json">{"datePublished":"2026-10-08T00:00:00.000Z"}</script></head>
    <body><nav>Guides Tools</nav><article><h1>Shot Stopper</h1><p>Height: 6'5&quot;</p><ul><li>Reactions 90</li></ul></article><footer>©</footer></body></html>`);
  eq(page.title, "Best Shot Stopper Build in EA FC 27 Pro Clubs & more");
  eq(page.text, "Shot Stopper\nHeight: 6'5\"\nReactions 90");
  eq(page.published, "2026-10-08T00:00:00.000Z");
  const pro11 = WEB_BUILD_SITES.find((s) => s.name === "PRO11")!;
  const links = feedLinks(pro11, `<urlset><url><loc>https://www.pro11.net/best-shot-stopper-build/</loc><lastmod>2026-11-01T00:00:00.000Z</lastmod></url>
    <url><loc>https://www.pro11.net/how-to-play-gk/</loc></url><url><loc>https://www.pro11.net/the-best-cam-build-for-clubs/</loc></url></urlset>`);
  eq(links.map((l) => l.url), ["https://www.pro11.net/best-shot-stopper-build/", "https://www.pro11.net/the-best-cam-build-for-clubs/"]);
  eq(links[0]!.at, Date.parse("2026-11-01T00:00:00.000Z"));
  const fenix = WEB_BUILD_SITES.find((s) => s.name === "FenixBazaar")!;
  const items = feedLinks(fenix, `<rss><channel><item><title>EA FC 27 Clubs Best Goalkeeper Build: Shot Stopper or Sweeper Keeper?</title><link>https://fenixbazaar.com/2026/10/26/gk/</link>
    <pubDate>Mon, 26 Oct 2026 10:00:00 +0000</pubDate><content:encoded><![CDATA[<p>Go 6'6".</p>]]></content:encoded></item>
    <item><title>How to Get Free Coins in EA FC 27 Ultimate Team</title><link>https://fenixbazaar.com/coins/</link></item></channel></rss>`);
  eq(items.length, 1);
  eq(items[0]!.content, "<p>Go 6'6\".</p>");
  const id = await webId("https://www.pro11.net/best-shot-stopper-build/");
  eq([id.length, id[0], id === await webId("https://www.pro11.net/best-shot-stopper-build"), /^[A-Za-z0-9_-]{1,40}$/.test(id)], [31, "w", true, true]);
});

function sites(robots: Record<string, string> = {}) {
  const calls: { url: string; ua: string | null }[] = [];
  const article = (title: string, date: string, body = "Archetype: Shot Stopper. Height 6'5\", 90 kg. ".repeat(20)) =>
    `<html><head><title>${title}</title><script type="application/ld+json">{"dateModified":"${date}"}</script></head><body><article>${body}</article></body></html>`;
  const pages: Record<string, string> = {
    "https://www.pro11.net/sitemap-guides-0.xml": `<urlset>
      <url><loc>https://www.pro11.net/best-shot-stopper-build/</loc><lastmod>2026-11-01T00:00:00.000Z</lastmod></url>
      <url><loc>https://www.pro11.net/best-marauder-build/</loc><lastmod>2026-11-01T00:00:00.000Z</lastmod></url>
      <url><loc>https://www.pro11.net/best-striker-build-for-fifa/</loc><lastmod>2025-10-01T00:00:00.000Z</lastmod></url></urlset>`,
    "https://www.pro11.net/best-shot-stopper-build/": article("Best Shot Stopper Build in EA FC 27 Pro Clubs", "2026-11-01T00:00:00.000Z"),
    "https://www.pro11.net/best-marauder-build/": article("Best Marauder Build in EA FC 27 Pro Clubs: Full-Back Height & Stats", "2026-11-01T00:00:00.000Z"),
    "https://realsport101.com/sitemap-articles-part-1.xml.gz": `<urlset><url><loc>https://realsport101.com/article/fc-27-best-fullback-build-for-clubs-the-grounds-archetype-playstyles-attributes</loc><lastmod>2026-09-24T15:20:20.985Z</lastmod></url>
      <url><loc>https://realsport101.com/article/fc-26-best-clubs-fullback-builds-lb-rb-guide</loc><lastmod>2025-09-24T15:20:20.985Z</lastmod></url>
      <url><loc>https://realsport101.com/article/fc-27-bone-builder-evolution-best-players</loc><lastmod>2026-11-10T00:00:00.000Z</lastmod></url></urlset>`,
    "https://realsport101.com/article/fc-27-best-fullback-build-for-clubs-the-grounds-archetype-playstyles-attributes": article("FC 27 Best Fullback Build For Clubs", "2026-09-24T15:20:20.985Z"),
    "https://realsport101.com/article/fc-27-bone-builder-evolution-best-players": article("FC 27 Bone Builder Evolution", "2026-11-10T00:00:00.000Z", "Ultimate Team evolution. ".repeat(40)),
    "https://fenixbazaar.com/?s=clubs+build&feed=rss2": `<rss><channel>
      <item><title>EA FC 27 Clubs Best Goalkeeper Build: Shot Stopper or Sweeper Keeper?</title><link>https://fenixbazaar.com/2026/10/26/ea-fc-27-clubs-best-goalkeeper-build/</link><pubDate>Mon, 26 Oct 2026 10:00:00 +0000</pubDate>
        <content:encoded><![CDATA[<p>${"Sweeper Keeper at 6'6\" with Footwork+. ".repeat(20)}</p>]]></content:encoded></item>
      <item><title>Best EA FC 26 Clubs Build</title><link>https://fenixbazaar.com/2025/09/25/fc26/</link><pubDate>Thu, 25 Oct 2026 10:00:00 +0000</pubDate></item></channel></rss>`,
  };
  const fetcher = (url: string, init?: RequestInit) => {
    calls.push({ url, ua: new Headers(init?.headers).get("user-agent") });
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return Promise.resolve(new Response(robots[u.hostname] ?? "User-agent: *\nAllow: /\n"));
    const body = pages[url];
    return Promise.resolve(body ? new Response(body, { headers: { "content-type": "text/xml" } }) : new Response("missing", { status: 404 }));
  };
  return { calls, fetcher };
}

Deno.test("web build guides: FC 27 pages inside the window, each once, politely", async () => {
  const f = sites();
  const env = (k: string) => ({ FUT_KB_WEB_GAP_MS: "0" } as Record<string, string>)[k];
  const since = NOW - 63 * DAY;
  const got = await collectWebBuildSources(env, f.fetcher, () => Promise.resolve(new Set()), since, olderGameTitle);
  eq(got.map((s) => s.community).sort(), ["FenixBazaar", "PRO11", "PRO11", "RealSport101"], "the old FIFA page, the FC 26 pages and the Ultimate Team page left out");
  ok(got.every((s) => s.kind === "web" && s.area === "proclubs" && /^w[0-9a-f]{30}$/.test(s.external_id) && s.body.length <= 14_000));
  ok(got.find((s) => s.community === "FenixBazaar")!.body.includes("Footwork+"), "an RSS item's own text is used, no page fetch");
  ok(!f.calls.some((c) => c.url.includes("fenixbazaar.com/2026")), "no page fetch for an RSS item with its text");
  ok(f.calls.every((c) => c.ua === WEB_USER_AGENT), "every request names the reader");
  // Known pages are not fetched again; the per-run cap holds
  const ids = new Set(got.map((s) => s.external_id));
  const again = sites();
  eq((await collectWebBuildSources(env, again.fetcher, (q) => Promise.resolve(new Set(q.filter((i) => ids.has(i)))), since, olderGameTitle)).length, 0);
  ok(!again.calls.some((c) => c.url.includes("/best-") || c.url.includes("/article/")), "nothing fetched twice");
  eq((await collectWebBuildSources((k) => ({ FUT_KB_WEB_GAP_MS: "0", FUT_KB_WEB_PER_RUN: "1" } as Record<string, string>)[k], sites().fetcher, () => Promise.resolve(new Set()), since, olderGameTitle)).length, 1);
  // A site whose robots.txt blocks AI readers is skipped
  const blocked = sites({ "www.pro11.net": "User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n" });
  const b = await collectWebBuildSources(env, blocked.fetcher, () => Promise.resolve(new Set()), since, olderGameTitle);
  ok(!b.some((s) => s.community === "PRO11") && !blocked.calls.some((c) => c.url.includes("pro11.net/sitemap")), "robots.txt honoured before the feed is read");
});

Deno.test("creators' uploads: build videos from the window, newest first, unknown only", async () => {
  const uploads: Record<string, { id: string; title: string; at: number }[]> = {
    "@LeskiGames": [{ id: "aaaaaaaaaaa", title: "This Level 55 CB Build is a BRICK WALL", at: NOW - 2 * DAY }, { id: "bbbbbbbbbbb", title: "Pack opening!!", at: NOW - DAY }],
    "@StarVisionGK": [{ id: "ccccccccccc", title: "Best Sweeper Keeper Build | FC27 Pro Clubs", at: NOW - 5 * DAY }, { id: "ddddddddddd", title: "Best GK build", at: NOW - 90 * DAY }],
  };
  let units = 0;
  const fetcher = (url: string) => {
    units++;
    const u = new URL(url);
    if (u.pathname.endsWith("/channels")) {
      const h = u.searchParams.get("forHandle")!;
      return Promise.resolve(new Response(JSON.stringify({ items: uploads[h] ? [{ contentDetails: { relatedPlaylists: { uploads: `UU${h}` } } }] : [] })));
    }
    const h = u.searchParams.get("playlistId")!.slice(2);
    return Promise.resolve(new Response(JSON.stringify({ items: (uploads[h] ?? []).map((v) => ({ snippet: { title: v.title, publishedAt: new Date(v.at).toISOString(), resourceId: { videoId: v.id } } })) })));
  };
  const env = (k: string) => ({ YOUTUBE_API_KEY: "y", FUT_KB_BUILD_CREATORS: "@LeskiGames,@StarVisionGK,not a handle" } as Record<string, string>)[k];
  eq(await creatorBuildVideos(env, fetcher, () => Promise.resolve(new Set()), NOW - 63 * DAY), ["aaaaaaaaaaa", "ccccccccccc"]);
  eq(units, 4, "two quota units a channel");
  eq(await creatorBuildVideos(env, fetcher, () => Promise.resolve(new Set(["aaaaaaaaaaa"])), NOW - 63 * DAY), ["ccccccccccc"]);
});

Deno.test("the build collector stores web guides in the Pro Clubs bank only", async () => {
  const pg = await knowledgeDb();
  const { rpc } = rpcOver(pg);
  try {
    const f = sites();
    const env = (k: string) => ({ FUT_KB_WEB_GAP_MS: "0" } as Record<string, string>)[k];
    const got = await collectBuildSources(env, f.fetcher as never, () => Promise.resolve(new Set()), { reddit: false, youtube: false, web: true }, NOW);
    eq(got.length, 4);
    eq((await rpc("kb_collect", { p_sources: got })).data, 4);
    eq(((await rpc("kb_known", { p_kind: "web", p_ids: got.map((s) => s.external_id) })).data as string[]).length, 4);
    eq((await rpc("kb_collect", { p_sources: [{ ...got[0], external_id: "wffff", area: "fut" }] })).data, 0, "no web pages in the Ultimate Team bank");
  } finally {
    await pg.close();
  }
});
