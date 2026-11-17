// More Pro Clubs build sources read automatically (Jeff, 2026-11-17: "find more sources we can read and scrape
// automatically"). Two kinds, both FC 27 only and inside the build window (meta-builds.ts buildWindowDays):
//   1. Known Pro Clubs creators' newest uploads through the YouTube Data API (channels + playlistItems, 1 unit each).
//   2. Build guides on sites whose robots.txt lets us read them, found through their own sitemap or RSS feed. robots.txt
//      is checked at run time too: a site that blocks this reader, everyone, or AI readers (ClaudeBot, anthropic-ai,
//      GPTBot...) for that page is skipped. A few pages a run, a pause between requests, and each page only once.
// Ruled out on 2026-11-17 (say so in the report, don't add them): Pro Clubs HQ and Dexerto (robots.txt blocks AI
// readers), EA Forums (behind a bot challenge), Sportskeeda (refuses automated requests), allthings.how (feeds removed),
// TikTok (no captions through its embed API, no public search), Twitch (clip titles carry no builds).
import type { CollectedSource } from "./knowledge.ts";

type Env = (k: string) => string | undefined;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export const WEB_USER_AGENT = "GafferBotKB/1.0 (+https://gafferbot.app)";
const UA_TOKEN = "gafferbotkb";
// Sites that ask AI readers to stay away: honoured even though this reader has its own name
const AI_AGENTS = ["claudebot", "claude-web", "anthropic-ai", "gptbot", "ccbot", "google-extended"];

/** Pro Clubs creators whose uploads are mostly builds (handles from their videos already in the bank). */
export const BUILD_CREATORS = [
  "@LeskiGames", "@WhiteGamer7", "@AddictzAnt", "@StarVisionGK", "@MikAegis", "@VirtualProGaming", "@Proclubsweekly",
  "@imbones", "@JCrowe98", "@Ciege_TV", "@jeskaa_gaming", "@ImLearningFC", "@SamTapTap", "@iTzSuperfly", "@dom_llaz",
];

export interface WebSite {
  name: string; feed: string; type: "sitemap" | "rss";
  /** Which links are Pro Clubs build pages (matched on the URL, or the title for RSS). */
  match: RegExp;
}
export const WEB_BUILD_SITES: WebSite[] = [
  { name: "PRO11", feed: "https://www.pro11.net/sitemap-guides-0.xml", type: "sitemap", match: /\/(best-[a-z-]*build[a-z-]*|the-best-[a-z-]*build[a-z-]*)\/?$/i },
  { name: "RealSport101", feed: "https://realsport101.com/sitemap-articles-part-1.xml.gz", type: "sitemap", match: /\/article\/fc-27-([a-z0-9-]*-)?(builds?|archetypes?)(-[a-z0-9-]*)?$/i },
  { name: "FenixBazaar", feed: "https://fenixbazaar.com/?s=clubs+build&feed=rss2", type: "rss", match: /\bclubs\b.*\bbuild\b|\bbuild\b.*\bclubs\b/i },
];

const pause = (ms: number) => ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
const squash = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
const isBuildTitle = (t: string) => /\b(build|archetype|best (st|cb|cdm|cm|cam|lw|rw|winger|striker|gk|goalkeeper|keeper|fullback|full-back|wing-?back|lb|rb|defender|midfielder))\b/i.test(t);

// ---------------------------------------------------------------- creators' uploads

async function yt(path: string, params: Record<string, string>, env: Env, fetchFn: Fetch) {
  const res = await fetchFn(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: env("YOUTUBE_API_KEY")! })}`);
  if (!res.ok) throw new Error(`YouTube answered HTTP ${res.status}`);
  return await res.json() as Record<string, unknown>;
}

/** New build videos from the creators' uploads: video ids, newest first, inside the window and not in the bank yet. */
export async function creatorBuildVideos(env: Env, fetchFn: Fetch, known: (ids: string[]) => Promise<Set<string>>, since: number, limit = 20): Promise<string[]> {
  const handles = (env("FUT_KB_BUILD_CREATORS") ?? "").split(",").map((h) => h.trim()).filter((h) => /^@[A-Za-z0-9._-]{2,40}$/.test(h));
  const ids: { id: string; at: number }[] = [];
  for (const handle of handles.length ? handles : BUILD_CREATORS) {
    try {
      const ch = await yt("channels", { part: "contentDetails", forHandle: handle }, env, fetchFn);
      const uploads = (ch.items as { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] | undefined)?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) continue;
      const list = await yt("playlistItems", { part: "snippet", playlistId: uploads, maxResults: "25" }, env, fetchFn);
      for (const it of (list.items ?? []) as { snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } } }[]) {
        const id = it.snippet?.resourceId?.videoId, at = Date.parse(it.snippet?.publishedAt ?? "");
        if (id && at >= since && isBuildTitle(it.snippet?.title ?? "")) ids.push({ id, at });
      }
    } catch (e) {
      if (/HTTP 403/.test((e as Error).message)) throw e; // quota or key: the rest would fail too
      console.warn(`[fut-api] build creators ${handle}:`, (e as Error).message);
    }
  }
  const fresh = [...new Map(ids.map((v) => [v.id, v])).values()].sort((a, b) => b.at - a.at);
  const seen = fresh.length ? await known(fresh.slice(0, 200).map((v) => v.id)) : new Set<string>();
  return fresh.filter((v) => !seen.has(v.id)).slice(0, limit).map((v) => v.id);
}

// ---------------------------------------------------------------- robots.txt

/** Whether robots.txt lets this reader fetch the path: blocked when it blocks this reader, everyone, or AI readers. */
export function robotsAllows(robots: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null, inRules = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase(), val = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || inRules) { cur = { agents: [], rules: [] }; groups.push(cur); inRules = false; }
      cur.agents.push(val.toLowerCase().replace(/^"|"$/g, ""));
    } else if ((key === "allow" || key === "disallow") && cur) {
      inRules = true;
      if (val) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  const matches = (rule: string) => {
    const re = new RegExp("^" + rule.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$"));
    return re.test(path);
  };
  const verdict = (rules: { allow: boolean; path: string }[]) => {
    let best: { allow: boolean; path: string } | null = null;
    for (const r of rules) if (matches(r.path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    return best ? best.allow : true;
  };
  const ours = groups.filter((g) => g.agents.some((a) => a === UA_TOKEN || a.startsWith(`${UA_TOKEN}/`)));
  if (ours.length) return verdict(ours.flatMap((g) => g.rules));
  const ai = groups.filter((g) => g.agents.some((a) => AI_AGENTS.includes(a)));
  if (ai.length && !verdict(ai.flatMap((g) => g.rules))) return false;
  return verdict(groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules));
}

// ---------------------------------------------------------------- pages

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: "..." };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? all);

/** A page's readable text: the article (or main) without scripts, menus, headers and footers. */
export function pageText(html: string): { title: string; text: string; published: string | null } {
  const title = squash(unescape(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""), 300);
  const published = html.match(/"(?:dateModified|datePublished)"\s*:\s*"([^"]+)"/)?.[1]
    ?? html.match(/<meta[^>]+property="article:(?:modified|published)_time"[^>]+content="([^"]+)"/i)?.[1] ?? null;
  let body = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  body = body.match(/<article\b[\s\S]*<\/article>/i)?.[0] ?? body.match(/<main\b[\s\S]*<\/main>/i)?.[0] ?? body.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? body;
  const text = unescape(body.replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
  return { title, text, published };
}

async function text(url: string, fetchFn: Fetch): Promise<string> {
  const res = await fetchFn(url, { headers: { "user-agent": WEB_USER_AGENT, accept: "text/html,application/xml,application/rss+xml;q=0.9,*/*;q=0.5" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered HTTP ${res.status}`);
  if (url.endsWith(".gz") && res.body && !/xml|text/.test(res.headers.get("content-type") ?? "")) {
    return await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return await res.text();
}

/** The site's links that look like build pages, with their date from the feed. */
export function feedLinks(site: WebSite, xml: string): { url: string; title: string | null; at: number | null; content: string | null }[] {
  if (site.type === "sitemap") {
    return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
      url: unescape(m[1]!.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() ?? ""), title: null,
      at: Date.parse(m[1]!.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? "") || null, content: null,
    })).filter((l) => /^https:\/\//.test(l.url) && site.match.test(new URL(l.url).pathname));
  }
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const tag = (t: string) => m[1]!.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() ?? "";
    return { url: unescape(tag("link")), title: squash(unescape(tag("title")), 300), at: Date.parse(tag("pubDate")) || null, content: tag("content:encoded") || null };
  }).filter((l) => /^https:\/\//.test(l.url) && site.match.test(l.title ?? ""));
}

/** A stable id for a page: 'w' and the first 30 hex characters of its URL's SHA-256. */
export async function webId(url: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url.replace(/[?#].*$/, "").replace(/\/$/, ""))));
  return "w" + [...hash].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 30);
}

/**
 * New build pages from the sites, read once each: up to FUT_KB_WEB_PER_RUN (6) a run, FUT_KB_WEB_GAP_MS (2 s) between
 * requests to a site. FUT_KB_BUILD_WEB=off turns this off.
 */
export async function collectWebBuildSources(env: Env, fetchFn: Fetch, known: (ids: string[]) => Promise<Set<string>>, since: number,
  olderGame: (title: string) => boolean): Promise<CollectedSource[]> {
  const gap = Number(env("FUT_KB_WEB_GAP_MS") ?? 2000);
  let left = Number(env("FUT_KB_WEB_PER_RUN") ?? 6);
  const out: CollectedSource[] = [];
  let failure: Error | null = null;
  for (const site of WEB_BUILD_SITES) {
    if (left <= 0) break;
    try {
      const origin = new URL(site.feed).origin;
      const robots = await text(`${origin}/robots.txt`, fetchFn).catch(() => "");
      if (!robotsAllows(robots, new URL(site.feed).pathname + new URL(site.feed).search)) { console.warn(`[fut-api] build web ${site.name}: robots.txt says no`); continue; }
      await pause(gap);
      const links = feedLinks(site, await text(site.feed, fetchFn))
        .filter((l) => (l.at ?? Date.now()) >= since && !(l.title && olderGame(l.title)) && robotsAllows(robots, new URL(l.url).pathname))
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 60);
      const ids = await Promise.all(links.map((l) => webId(l.url)));
      const seen = ids.length ? await known(ids) : new Set<string>();
      for (let i = 0; i < links.length && left > 0; i++) {
        if (seen.has(ids[i]!)) continue;
        const l = links[i]!;
        let page: { title: string; text: string; published: string | null };
        if (l.content) page = { title: l.title ?? "", text: pageText(`<article>${unescape(l.content)}</article>`).text, published: null };
        else { await pause(gap); page = pageText(await text(l.url, fetchFn).catch(() => "")); }
        left--;
        const title = squash(l.title || page.title, 300);
        const at = l.at ?? (Date.parse(page.published ?? "") || null);
        if (page.text.length < 400 || olderGame(title) || (at !== null && at < since)) continue;
        out.push({
          area: "proclubs", kind: "web" as CollectedSource["kind"], external_id: ids[i]!, url: l.url, title, author: null, community: site.name,
          published_at: new Date(at ?? Date.now()).toISOString(), score: 0, comments: 0,
          body: `Page: ${l.url}\nSite: ${site.name}\nTitle: ${title}\n\n${page.text}`.slice(0, 14_000), excerpt: squash(page.text, 280),
        });
      }
    } catch (e) {
      failure ??= e as Error;
      console.warn(`[fut-api] build web ${site.name}:`, (e as Error).message);
    }
  }
  if (!out.length && failure) throw failure;
  return out;
}
