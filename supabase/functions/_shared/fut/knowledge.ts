// Knowledge bank (Jeff, 2026-11-10): FUT gameplay and strategy knowledge from the community, and a map of what people
// are saying. The bot's scheduler runs the fut-api job "knowledge-ingest" every 3 hours:
//   1. Collect: Reddit posts with their top comments (official Data API, app-only OAuth with REDDIT_CLIENT_ID /
//      REDDIT_CLIENT_SECRET, or Reddit's public RSS feeds when those keys aren't set) and, four times a day, YouTube videos with their top comments (YouTube Data API with
//      YOUTUBE_API_KEY). A feed without its keys is simply off. Nothing is scraped from web pages.
//   2. Read: Claude turns each source into short claims (topic, category, stance) that link back to it.
// Users can also add a source themselves: a Reddit or YouTube link (fetched through the same APIs when configured) or
// any text they paste (a forum post, a video transcript, their own notes), private unless they share it.
// The map, topic pages, search and the "Ask" chat read the SQL functions in 20261110160000_fut_knowledge_bank.sql.
import { FutError } from "./service.ts";
import { callClaude } from "./squad-import.ts";

type Env = (k: string) => string | undefined;
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message?: string } | null }> };

export const KB_CATEGORIES = ["formations", "tactics", "players", "playstyles", "attacking", "defending", "skills", "settings", "modes", "market", "other"] as const;
export type KbCategory = typeof KB_CATEGORIES[number];
const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_SUBREDDITS = ["EASportsFC", "fut"];
const DEFAULT_YOUTUBE_QUERIES = ["FC 27 meta formation", "FC 27 best custom tactics", "FC 27 meta players Ultimate Team", "FC 27 gameplay tips attacking defending"];
const MAX_BODY = 12_000;
export const MAX_ADD_TEXT = 12_000;
export const MAX_QUESTION = 500;
const UA = "web:gafferbot-knowledge:1.0";

async function rpcData<T>(db: Rpc, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new FutError(`The knowledge bank is unavailable: ${error.message ?? "error"}`, 500);
  return data as T;
}

const squash = (s: unknown, max: number) => typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
const keep = (s: unknown, max: number) => typeof s === "string" ? s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

/** A topic's key: lower case, accents dropped, words joined by dashes ("4-2-3-1 (2)" → "4-2-3-1-2"). */
export function topicKey(topic: string): string {
  return topic.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}

// ---------------------------------------------------------------- collecting

export interface CollectedSource {
  kind: "reddit" | "youtube"; external_id: string; url: string; title: string; author: string | null; community: string;
  published_at: string; score: number; comments: number; body: string; excerpt: string;
}

/** Posts about gameplay, tactics and the meta; pack pulls, memes and showcases are left out. */
const GAMEPLAY = /\b(meta|formations?|tactics?|instructions?|playstyles?\+?|accele ?rate|explosive|lengthy|controlled|finesse|trivela|power shots?|skill moves?|dribbl\w*|defend\w*|jockey\w*|tackl\w*|through balls?|lobs?|cross\w*|headers?|settings|camera|controller|best (players?|cards?|cbs?|strikers?|wingers?|cdms?|cams?|lbs?|rbs?|gks?|sts?|team|squad|formation)|op|overpowered|nerf\w*|buff\w*|patch|title update|rivals|champs|champions|weekend league|squad battles|sbcs?|evo(lution)?s?|chem(istry)?|roles?\+\+?|\d-\d-\d(-\d)?|tips?|guide|how (do|to) (i |you )?(score|defend|win|beat|stop))\b/i;
const OFF_TOPIC_FLAIR = /(pack|pull|meme|humou?r|funny|shitpost|achievement|showcase|picture|image|video clip|rant|news|leak)/i;
const ON_TOPIC_FLAIR = /(discussion|tactic|gameplay|guide|tip|question|meta|squad|help|advice)/i;

export function isGameplayPost(p: { title?: string; selftext?: string; link_flair_text?: string | null; over_18?: boolean; stickied?: boolean }): boolean {
  if (p.over_18 || p.stickied) return false;
  const flair = p.link_flair_text ?? "";
  if (flair && OFF_TOPIC_FLAIR.test(flair) && !ON_TOPIC_FLAIR.test(flair)) return false;
  return GAMEPLAY.test(`${p.title ?? ""} ${(p.selftext ?? "").slice(0, 2000)}`) || ON_TOPIC_FLAIR.test(flair);
}

function threadBody(head: string[], text: string, comments: { body: string; score: number | null }[]): string {
  let out = `${head.join("\n")}\n\n${text ? `${keep(text, 5000)}\n\n` : ""}`;
  if (comments.length) out += "Top comments:\n";
  for (const c of comments) {
    const line = `- ${c.score == null ? "" : `(${c.score} ${c.score === 1 ? "point" : "points"}) `}${squash(c.body, 700)}\n`;
    if (out.length + line.length > MAX_BODY) break;
    out += line;
  }
  return out.trim();
}

/** Reddit through the Data API when its keys are set, otherwise through Reddit's public RSS feeds (FUT_KB_REDDIT_RSS=off turns those off). */
export function redditMode(env: Env): "api" | "rss" | "off" {
  if (env("REDDIT_CLIENT_ID") && env("REDDIT_CLIENT_SECRET")) return "api";
  return env("FUT_KB_REDDIT_RSS") === "off" ? "off" : "rss";
}
export function redditFeedOn(env: Env) { return redditMode(env) !== "off"; }
export function youtubeFeedOn(env: Env) { return !!env("YOUTUBE_API_KEY"); }

async function redditToken(env: Env, fetchFn: Fetch): Promise<string> {
  const res = await fetchFn("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env("REDDIT_CLIENT_ID")}:${env("REDDIT_CLIENT_SECRET")}`)}`,
      "content-type": "application/x-www-form-urlencoded", "user-agent": env("REDDIT_USER_AGENT") || UA,
    },
    body: "grant_type=client_credentials",
  });
  const out = await res.json().catch(() => null) as { access_token?: string } | null;
  if (!res.ok || !out?.access_token) throw new Error(`Reddit sign-in failed (HTTP ${res.status})`);
  return out.access_token;
}

interface RedditPost { id: string; title: string; selftext?: string; author?: string; subreddit?: string; subreddit_name_prefixed?: string; permalink: string;
  created_utc: number; score: number; num_comments?: number; over_18?: boolean; stickied?: boolean; link_flair_text?: string | null }

async function redditJson(url: string, token: string, env: Env, fetchFn: Fetch): Promise<unknown> {
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${token}`, "user-agent": env("REDDIT_USER_AGENT") || UA } });
  if (!res.ok) throw new Error(`Reddit answered HTTP ${res.status}`);
  return res.json();
}

function redditComments(listing: unknown): { body: string; score: number }[] {
  const children = (Array.isArray(listing) ? (listing[1] as { data?: { children?: unknown[] } })?.data?.children : null) ?? [];
  return children.flatMap((c) => {
    const d = (c as { kind?: string; data?: { body?: string; score?: number; stickied?: boolean; author?: string } });
    if (d.kind !== "t1" || !d.data?.body || d.data.stickied || d.data.author === "AutoModerator" || d.data.body === "[deleted]" || d.data.body === "[removed]") return [];
    return [{ body: d.data.body, score: Math.max(0, Number(d.data.score) || 0) }];
  }).filter((c) => c.score >= 2).sort((a, b) => b.score - a.score).slice(0, 12);
}

function redditSource(p: RedditPost, comments: { body: string; score: number }[]): CollectedSource {
  const community = p.subreddit_name_prefixed || `r/${p.subreddit ?? ""}`;
  return {
    kind: "reddit", external_id: p.id, url: `https://www.reddit.com${p.permalink}`, title: squash(p.title, 300), author: p.author ? squash(p.author, 100) : null,
    community, published_at: new Date(p.created_utc * 1000).toISOString(), score: Math.max(0, p.score | 0), comments: Math.max(0, (p.num_comments ?? 0) | 0),
    body: threadBody([`Reddit post in ${community} (${p.score} upvotes${p.link_flair_text ? `, flair "${squash(p.link_flair_text, 40)}"` : ""})`, `Title: ${squash(p.title, 300)}`], p.selftext ?? "", comments),
    excerpt: squash(p.selftext || p.title, 280),
  };
}

function redditSubs(env: Env): string[] {
  const subs = (env("FUT_KB_SUBREDDITS") ?? "").split(",").map((s) => s.trim().replace(/^r\//i, "")).filter((s) => /^[A-Za-z0-9_]{2,30}$/.test(s));
  return subs.length ? subs : DEFAULT_SUBREDDITS;
}

/** The day's top gameplay posts from each subreddit, with their top comments. */
export async function collectReddit(env: Env, fetchFn: Fetch, known?: (ids: string[]) => Promise<Set<string>>): Promise<CollectedSource[]> {
  if (redditMode(env) === "rss") return collectRedditRss(env, fetchFn, known);
  const token = await redditToken(env, fetchFn);
  const minScore = Number(env("FUT_KB_REDDIT_MIN_SCORE")) || 20;
  const perSub = Number(env("FUT_KB_REDDIT_PER_SUB")) || 8;
  const out: CollectedSource[] = [];
  for (const sub of redditSubs(env)) {
    const listing = await redditJson(`https://oauth.reddit.com/r/${sub}/top?t=day&limit=50&raw_json=1`, token, env, fetchFn) as { data?: { children?: { data: RedditPost }[] } };
    const posts = (listing?.data?.children ?? []).map((c) => c.data).filter((p) => p?.id && p.score >= minScore && isGameplayPost(p)).slice(0, perSub);
    for (const p of posts) {
      const comments = redditComments(await redditJson(`https://oauth.reddit.com/r/${sub}/comments/${p.id}?sort=top&limit=15&depth=1&raw_json=1`, token, env, fetchFn).catch(() => null));
      out.push(redditSource(p, comments));
    }
  }
  return out;
}

// ---------------------------------------------------------------- Reddit RSS (no API keys)
// Reddit publishes Atom feeds for feed readers: a subreddit's top posts, and a post with its top comments. They carry
// no scores, so the day's top listing order stands in for popularity. Read politely: a few posts per run, one at a time.

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return XML_ENTITIES[e.toLowerCase()] ?? m;
  });
}
/** Reddit's entry HTML → plain text: paragraphs kept, the "submitted by … [link] [comments]" footer dropped. */
export function rssHtmlText(html: string): string {
  const h = decodeEntities(html).replace(/<!--\s*SC_ON\s*-->[\s\S]*$/i, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(br|\/p|\/li|\/h\d|\/blockquote|\/pre)\b[^>]*>/gi, "\n").replace(/<li\b[^>]*>/gi, "- ").replace(/<[^>]+>/g, "");
  return keep(decodeEntities(h).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n"), MAX_BODY);
}
export interface RssEntry { id: string; title: string; author: string | null; link: string; published: string | null; text: string }
export function parseRedditRss(xml: string): RssEntry[] {
  const tag = (e: string, t: string) => e.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, e]) => {
    const id = tag(e!, "id").trim();
    if (!/^t[13]_[a-z0-9]{2,16}$/.test(id)) return [];
    const author = decodeEntities(tag(tag(e!, "author"), "name")).trim().replace(/^\/u\//, "");
    return [{ id, title: squash(decodeEntities(tag(e!, "title")), 300), author: author || null, link: decodeEntities(e!.match(/<link\b[^>]*href="([^"]+)"/)?.[1] ?? ""),
      published: tag(e!, "published").trim() || tag(e!, "updated").trim() || null, text: rssHtmlText(tag(e!, "content")) }];
  });
}

/** Reddit asked us to slow down (HTTP 429): the run stops asking Reddit and keeps what it already has. */
export class RedditRateLimited extends Error {
  constructor(public retryAfter: number | null) { super(`Reddit is rate-limiting the server's feed requests (HTTP 429)${retryAfter ? `; it asked to wait ${retryAfter} s` : ""}`); }
}
// Reddit asks for "<platform>:<app id>:<version> (by …)"; generic agents get rate-limited first.
const RSS_UA = "web:app.gafferbot.knowledge:1.1 (by gafferbot.app)";

async function redditRss(url: string, env: Env, fetchFn: Fetch): Promise<RssEntry[]> {
  const res = await fetchFn(url, { headers: { "user-agent": env("REDDIT_USER_AGENT") || RSS_UA, accept: "application/atom+xml" } });
  if (res.status === 429) { await res.body?.cancel(); throw new RedditRateLimited(Number(res.headers.get("retry-after")) || null); }
  if (!res.ok) throw new Error(`Reddit's RSS feed answered HTTP ${res.status}`);
  return parseRedditRss(await res.text());
}

const redditPermalink = (link: string) => { try { const u = new URL(link); return /(^|\.)reddit\.com$/.test(u.hostname) && u.pathname.startsWith("/r/") ? u.pathname : null; } catch { return null; } };

/** One post with its top comments, from the post's RSS feed. */
async function redditRssThread(sub: string, id: string, env: Env, fetchFn: Fetch, rank = 0): Promise<CollectedSource | null> {
  return threadFromRss(sub, id, await redditRss(`https://www.reddit.com/r/${sub}/comments/${id}/.rss?sort=top&limit=15`, env, fetchFn), rank);
}
function threadFromRss(sub: string, id: string, entries: RssEntry[], rank: number): CollectedSource | null {
  const post = entries.find((e) => e.id === `t3_${id}`);
  if (!post) return null;
  const comments = entries.filter((e) => e.id.startsWith("t1_") && e.text.length > 15 && e.author !== "AutoModerator").slice(0, 12).map((e) => ({ body: e.text, score: null }));
  return rssSource(sub, post, comments, rank);
}

function rssSource(sub: string, post: RssEntry, comments: { body: string; score: null }[], rank: number): CollectedSource {
  const community = `r/${sub}`;
  const permalink = redditPermalink(post.link) ?? `/r/${sub}/comments/${post.id.slice(3)}/`;
  return {
    kind: "reddit", external_id: post.id.slice(3), url: `https://www.reddit.com${permalink}`, title: post.title, author: post.author ? squash(post.author, 100) : null,
    community, published_at: post.published ?? new Date().toISOString(), score: 0, comments: comments.length,
    body: threadBody([`Reddit post in ${community}${rank ? ` (number ${rank} in today's top posts)` : ""}`, `Title: ${post.title}`], post.text, comments),
    excerpt: squash(post.text || post.title, 280),
  };
}

/** The day's top gameplay posts from each subreddit's RSS feed, with the top comments of posts the bank hasn't seen yet.
 * Reddit rate-limits these feeds, so requests are spaced out (FUT_KB_REDDIT_GAP_MS, default 5 s), only a few comment
 * feeds are read per run (FUT_KB_REDDIT_THREADS_PER_RUN, default 6), and a 429 stops the run's Reddit requests. */
export async function collectRedditRss(env: Env, fetchFn: Fetch, known: (ids: string[]) => Promise<Set<string>> = () => Promise.resolve(new Set())): Promise<CollectedSource[]> {
  const perSub = Number(env("FUT_KB_REDDIT_PER_SUB")) || 6;
  const gap = Number(env("FUT_KB_REDDIT_GAP_MS") ?? 5000);
  let threadsLeft = Number(env("FUT_KB_REDDIT_THREADS_PER_RUN") ?? 6);
  let calls = 0, limited: RedditRateLimited | null = null;
  const rss = async (url: string) => {
    if (calls++ && gap > 0) await new Promise((r) => setTimeout(r, gap));
    return redditRss(url, env, fetchFn);
  };
  const out: CollectedSource[] = [];
  try {
    for (const sub of redditSubs(env)) {
      const top = (await rss(`https://www.reddit.com/r/${sub}/top/.rss?t=day&limit=40`)).filter((e) => e.id.startsWith("t3_"));
      const posts = top.map((e, i) => ({ e, rank: i + 1 })).filter(({ e }) => isGameplayPost({ title: e.title, selftext: e.text })).slice(0, perSub);
      const seen = posts.length ? await known(posts.map(({ e }) => e.id.slice(3))) : new Set<string>();
      for (const { e, rank } of posts) {
        if (seen.has(e.id.slice(3))) continue; // already in the bank; collecting again changes nothing
        let full: CollectedSource | null = null;
        if (threadsLeft > 0) {
          threadsLeft--;
          full = await rss(`https://www.reddit.com/r/${sub}/comments/${e.id.slice(3)}/.rss?sort=top&limit=15`)
            .then((entries) => threadFromRss(sub, e.id.slice(3), entries, rank))
            .catch((err) => { if (err instanceof RedditRateLimited) limited = err; return null; });
        }
        out.push(full ?? rssSource(sub, e, [], rank));
        if (limited) throw limited; // keep this post (without comments), ask Reddit nothing more this run
      }
    }
  } catch (err) {
    // Rate-limited part way through: keep what was collected; with nothing collected, report it
    if (!(err instanceof RedditRateLimited) || !out.length) throw err;
    console.warn("[fut-api] knowledge reddit:", (err as Error).message);
  }
  return out;
}

const YT = "https://www.googleapis.com/youtube/v3";
interface YtVideo { id: string; snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string; defaultAudioLanguage?: string };
  statistics?: { viewCount?: string; commentCount?: string } }

async function ytJson(path: string, params: Record<string, string>, env: Env, fetchFn: Fetch): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ ...params, key: env("YOUTUBE_API_KEY")! });
  const res = await fetchFn(`${YT}/${path}?${q}`);
  if (!res.ok) throw new Error(`YouTube answered HTTP ${res.status}`);
  return await res.json() as Record<string, unknown>;
}

async function youtubeSources(ids: string[], env: Env, fetchFn: Fetch, minViews: number): Promise<CollectedSource[]> {
  if (!ids.length) return [];
  const videos = ((await ytJson("videos", { part: "snippet,statistics", id: ids.join(","), maxResults: "50" }, env, fetchFn)).items ?? []) as YtVideo[];
  const out: CollectedSource[] = [];
  for (const v of videos) {
    const views = Number(v.statistics?.viewCount) || 0;
    if (!v.id || views < minViews) continue;
    let comments: { body: string; score: number }[] = [];
    if (Number(v.statistics?.commentCount) > 0) {
      const threads = await ytJson("commentThreads", { part: "snippet", videoId: v.id, order: "relevance", maxResults: "20", textFormat: "plainText" }, env, fetchFn).catch(() => ({ items: [] }));
      comments = ((threads.items ?? []) as { snippet?: { topLevelComment?: { snippet?: { textDisplay?: string; likeCount?: number } } } }[])
        .map((t) => ({ body: t.snippet?.topLevelComment?.snippet?.textDisplay ?? "", score: Number(t.snippet?.topLevelComment?.snippet?.likeCount) || 0 }))
        .filter((c) => c.body.length > 15).sort((a, b) => b.score - a.score).slice(0, 15);
    }
    const s = v.snippet ?? {};
    out.push({
      kind: "youtube", external_id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, title: squash(s.title, 300), author: s.channelTitle ? squash(s.channelTitle, 100) : null,
      community: squash(s.channelTitle || "YouTube", 100), published_at: s.publishedAt ?? new Date().toISOString(), score: views, comments: Number(v.statistics?.commentCount) || 0,
      body: threadBody([`YouTube video by ${squash(s.channelTitle, 100)} (${views.toLocaleString("en")} views)`, `Title: ${squash(s.title, 300)}`, "Description (the video itself isn't included):"], s.description ?? "", comments),
      excerpt: squash(s.description || s.title, 280),
    });
  }
  return out;
}

/** The last few days' most-watched FC 27 meta videos for each search, with their top comments. */
export async function collectYouTube(env: Env, fetchFn: Fetch, now = Date.now()): Promise<CollectedSource[]> {
  const queries = (env("FUT_KB_YOUTUBE_QUERIES") ?? "").split("|").map((q) => q.trim()).filter(Boolean);
  const after = new Date(now - 3 * 86_400_000).toISOString();
  const ids = new Set<string>();
  for (const q of queries.length ? queries.slice(0, 8) : DEFAULT_YOUTUBE_QUERIES) {
    const found = await ytJson("search", { part: "snippet", type: "video", order: "viewCount", maxResults: "6", publishedAfter: after, q, relevanceLanguage: "en" }, env, fetchFn);
    for (const item of (found.items ?? []) as { id?: { videoId?: string } }[]) if (item.id?.videoId) ids.add(item.id.videoId);
  }
  return youtubeSources([...ids].slice(0, 50), env, fetchFn, Number(env("FUT_KB_YOUTUBE_MIN_VIEWS")) || 5000);
}

/** A Reddit post or YouTube video link → its id, or null for any other link. */
export function parseSourceLink(raw: string): { kind: "reddit" | "youtube"; id: string; sub?: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www|old|new|m)\./, "");
  if (host === "reddit.com") {
    const m = u.pathname.match(/^\/r\/([A-Za-z0-9_]{2,30})\/comments\/([a-z0-9]{2,12})(\/|$)/i);
    return m ? { kind: "reddit", id: m[2]!.toLowerCase(), sub: m[1] } : null;
  }
  if (host === "youtu.be") { const id = u.pathname.slice(1, 12); return /^[A-Za-z0-9_-]{11}$/.test(id) ? { kind: "youtube", id } : null; }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/)?.[1] ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { kind: "youtube", id } : null;
  }
  return null;
}

async function fetchLinked(link: NonNullable<ReturnType<typeof parseSourceLink>>, env: Env, fetchFn: Fetch): Promise<CollectedSource | null> {
  if (link.kind === "youtube") {
    if (!youtubeFeedOn(env)) return null;
    return (await youtubeSources([link.id], env, fetchFn, 0))[0] ?? null;
  }
  if (redditMode(env) === "off") return null;
  if (redditMode(env) === "rss") return link.sub ? redditRssThread(link.sub, link.id, env, fetchFn) : null;
  const token = await redditToken(env, fetchFn);
  const thread = await redditJson(`https://oauth.reddit.com/r/${link.sub}/comments/${link.id}?sort=top&limit=15&depth=1&raw_json=1`, token, env, fetchFn);
  const post = (Array.isArray(thread) ? (thread[0] as { data?: { children?: { data: RedditPost }[] } })?.data?.children?.[0]?.data : null);
  if (!post?.id || post.over_18) return null;
  return redditSource(post, redditComments(thread));
}

// ---------------------------------------------------------------- reading with Claude

/** The Claude account can't be used (out of credit, bad key): nothing can be read until that's fixed, so no source is blamed. */
export class ReaderUnavailable extends FutError {
  constructor(why: string) { super(`The reader can't use the Claude API right now: ${why}`, 503); }
}

export interface Claim { topic: string; topic_key: string; category: KbCategory; statement: string; stance: -1 | 0 | 1; strength: 1 | 2 | 3 }
export interface Reading { relevant: boolean; summary: string; claims: Claim[] }

const READ_SCHEMA = {
  type: "object", additionalProperties: false, required: ["relevant", "summary", "claims"],
  properties: {
    relevant: { type: "boolean" },
    summary: { type: "string" },
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["topic", "category", "statement", "stance", "strength"], properties: {
      topic: { type: "string" },
      category: { type: "string", enum: [...KB_CATEGORIES] },
      statement: { type: "string" },
      stance: { type: "string", enum: ["for", "against", "mixed"] },
      strength: { type: "integer", enum: [1, 2, 3] },
    } } },
  },
};

function readerPrompt(known: { topic: string; category: string }[]): string {
  return [
    "You read EA SPORTS FC 27 Ultimate Team community posts, video descriptions and their comments, and write down the gameplay and strategy claims people make, for a knowledge bank that maps what the community thinks. Return JSON only.",
    "",
    "relevant: false when the source has no gameplay or strategy content (pack pulls, memes, complaints with no claim, news with no opinion); then claims is empty.",
    "summary: one plain sentence on what the source is about (under 25 words).",
    "claims: up to 12, the most useful first. Each is one opinion or tip someone in the source states:",
    "- topic: the specific thing being judged, as a short name people would search for: a formation (\"4-2-3-1 (2)\", \"4-4-2\"), a tactic or setting (\"Balanced defensive approach\", \"Competitive controller settings\"), a player card (\"Kylian Mbappé\"), a PlayStyle or AcceleRATE type (\"Finesse Shot+\", \"Explosive AcceleRATE\"), a technique (\"Trivela shots\", \"Manual jockeying\", \"Driven lob through balls\"), a game mode (\"Rivals\", \"Champions\") or a market idea (\"Investing in TOTW cards\"). Not a sentence, not \"FC 27\", not \"gameplay\" on its own.",
    "- Reuse a name from the known topics below whenever it is the same thing, spelled exactly as listed.",
    "- category: formations, tactics (custom tactics, player instructions), players (cards), playstyles (PlayStyles, Roles, AcceleRATE), attacking, defending, skills (skill moves, dribbling), settings (controller, camera, game settings), modes (Rivals, Champions, Squad Battles, SBCs, Evolutions), market (trading, coins, prices), other.",
    "- statement: the claim in your own plain words, under 30 words, specific (numbers, instructions, positions, why). Never copy long passages and never include usernames.",
    "- stance relative to the topic: for = it is good, strong, effective, meta, worth it, recommended; against = bad, weak, overrated, nerfed, not worth it; mixed = conditional, it depends, or neutral how-to information.",
    "- strength: 3 = the main point of the post or video, or echoed by many highly upvoted comments; 2 = clearly argued or well upvoted; 1 = a passing remark.",
    "- When commenters disagree with the post, record both sides as separate claims. Skip jokes, sarcasm you can't read and claims about other games.",
    "",
    known.length ? `Known topics:\n${known.map((k) => `${k.topic} (${k.category})`).join("\n")}` : "Known topics: none yet.",
  ].join("\n");
}

export function cleanReading(raw: unknown): Reading {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const claims: Claim[] = [];
  for (const c of Array.isArray(o.claims) ? o.claims.slice(0, 15) : []) {
    const x = c && typeof c === "object" ? c as Record<string, unknown> : {};
    const topic = squash(x.topic, 80), statement = squash(x.statement, 300), key = topicKey(topic);
    const category = KB_CATEGORIES.includes(x.category as KbCategory) ? x.category as KbCategory : "other";
    const stance = x.stance === "for" ? 1 : x.stance === "against" ? -1 : 0;
    const strength = [1, 2, 3].includes(Number(x.strength)) ? Number(x.strength) as 1 | 2 | 3 : 1;
    if (!key || statement.length < 3) continue;
    claims.push({ topic, topic_key: key, category, statement, stance, strength });
  }
  return { relevant: o.relevant !== false && claims.length > 0, summary: squash(o.summary, 300), claims };
}

export async function readSource(text: string, known: { topic: string; category: string }[], env: Env, fetchFn: Fetch): Promise<Reading> {
  const res = await callClaude(env, fetchFn as typeof fetch, {
    model: env("FUT_KB_MODEL") || DEFAULT_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: { type: "json_schema", schema: READ_SCHEMA } },
    system: readerPrompt(known),
    messages: [{ role: "user", content: [{ type: "text", text: `<source>\n${text.slice(0, MAX_BODY + 2000)}\n</source>` }] }],
  });
  const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } } | null;
  if (!res.ok) {
    const why = out?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /credit balance|billing/i.test(why))) throw new ReaderUnavailable(why);
    throw new FutError(res.status === 429 || res.status >= 500 ? "The reader is busy. Try again in a minute." : `The reader couldn't read that source (${why}).`, 502);
  }
  if (out?.stop_reason === "refusal") return { relevant: false, summary: "The reader declined this source.", claims: [] };
  const body = (out?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  try { return cleanReading(JSON.parse(body)); } catch { throw new FutError("The reader returned something unreadable.", 502); }
}

async function saveReading(db: Rpc, id: string, reading: Reading): Promise<number> {
  return await rpcData<number>(db, "kb_save_reading", {
    p_source: id, p_status: reading.relevant ? "read" : "skipped", p_note: reading.summary || null,
    p_claims: reading.claims.map(({ topic, topic_key, category, statement, stance, strength }) => ({ topic, topic_key, category, statement, stance, strength })),
  }) ?? 0;
}

// ---------------------------------------------------------------- the scheduled job

export interface IngestResult { feeds: Record<string, { status: "ok" | "off" | "failed" | "later" | "limited"; collected?: number; error?: string }>; read: number; skipped: number; failed: number; claims: number; waiting: number; cleaned: number }

/** Collect from each configured feed, then read what's waiting (most popular first). YouTube runs on its own hours to stay inside the API quota. */
export async function runKnowledgeIngest(db: Rpc, env: Env, fetchFn: Fetch, now = new Date()): Promise<IngestResult> {
  const feeds: IngestResult["feeds"] = {};
  const collect = async (name: string, on: boolean, run: () => Promise<CollectedSource[]>) => {
    if (!on) { feeds[name] = { status: "off" }; return; }
    try {
      const found = await run();
      const stored = found.length ? await rpcData<number>(db, "kb_collect", { p_sources: found }) : 0;
      feeds[name] = { status: "ok", collected: stored };
    } catch (e) {
      console.error(`[fut-api] knowledge ${name}:`, e);
      feeds[name] = { status: e instanceof RedditRateLimited ? "limited" : "failed", error: squash((e as Error).message, 200) };
    }
  };
  const knownReddit = async (ids: string[]) => new Set(await rpcData<string[]>(db, "kb_known", { p_kind: "reddit", p_ids: ids }) ?? []);
  await collect("reddit", redditFeedOn(env), () => collectReddit(env, fetchFn, knownReddit));
  const youtubeHours = (env("FUT_KB_YOUTUBE_HOURS") ?? "1,7,13,19").split(",").map(Number);
  if (youtubeFeedOn(env) && !youtubeHours.includes(now.getUTCHours())) feeds.youtube = { status: "later" };
  else await collect("youtube", youtubeFeedOn(env), () => collectYouTube(env, fetchFn, now.getTime()));

  const result: IngestResult = { feeds, read: 0, skipped: 0, failed: 0, claims: 0, waiting: 0, cleaned: 0 };
  const hasKey = !!(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY"));
  if (hasKey) {
    const pending = await rpcData<{ id: string; body: string }[]>(db, "kb_pending", { p_limit: Number(env("FUT_KB_READ_PER_RUN")) || 25 });
    const known = pending.length ? await rpcData<{ topic: string; category: string }[]>(db, "kb_known_topics", { p_limit: 150 }) : [];
    for (const s of pending) {
      try {
        const reading = await readSource(s.body, known, env, fetchFn);
        const n = await saveReading(db, s.id, reading);
        if (n > 0) { result.read++; result.claims += n; } else result.skipped++;
        // New topics are offered to the next source in the same run
        for (const c of reading.claims) if (!known.some((k) => k.topic === c.topic)) known.push({ topic: c.topic, category: c.category });
      } catch (e) {
        if (e instanceof ReaderUnavailable) { feeds.reader = { status: "failed", error: squash(e.message, 200) }; break; }
        result.failed++;
        await rpcData(db, "kb_save_reading", { p_source: s.id, p_status: "failed", p_note: squash((e as Error).message, 200), p_claims: null });
        if (e instanceof FutError && e.status === 502 && /busy/.test(e.message)) break;
      }
    }
  }
  result.cleaned = await rpcData<number>(db, "kb_cleanup", {}) ?? 0;
  const status = await rpcData<{ waiting: number }>(db, "kb_status", {});
  result.waiting = status?.waiting ?? 0;
  return result;
}

// ---------------------------------------------------------------- what users do

export interface AddInput { url?: string | null; text?: string | null; title?: string | null; share?: boolean }

/** Add a source: a Reddit or YouTube link (fetched through the official APIs when configured) and/or pasted text. Read straight away. */
export async function addSource(db: Rpc, userId: string, input: AddInput, env: Env, fetchFn: Fetch) {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const text = typeof input.text === "string" ? keep(input.text, MAX_ADD_TEXT) : "";
  if (url && (!/^https:\/\/\S+$/.test(url) || url.length > 600)) throw new FutError("Links must start with https:// (up to 600 characters).");
  if (!(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY"))) throw new FutError("Reading sources needs a Claude API key: add yours on your profile.", 503);
  const link = url ? parseSourceLink(url) : null;
  let fetched: CollectedSource | null = null;
  if (link && !text) {
    fetched = await fetchLinked(link, env, fetchFn).catch((e) => { console.error("[fut-api] knowledge link:", e); return null; });
    if (!fetched) throw new FutError(`${link.kind === "reddit" ? "Reddit" : "YouTube"} links can't be fetched here yet. Paste the post or the video's transcript into the text box too.`, 422);
  }
  if (!fetched && text.length < 40) throw new FutError(url ? "Paste the text from that page too (at least a few sentences); GafferBot doesn't copy other websites itself." : "Paste at least a few sentences.");
  const title = squash(input.title, 300) || fetched?.title || squash(text.split("\n")[0], 120) || "Pasted source";
  const share = input.share === true && (!!url || !!fetched);
  const source = fetched
    ? { ...fetched, shared: true }
    : { kind: url ? "web" : "note", external_id: null, url: url || null, title, author: null, community: url ? new URL(url).hostname.replace(/^www\./, "") : null,
        published_at: new Date().toISOString(), score: 0, comments: 0, body: text, excerpt: squash(text, 280), shared: share };
  const id = await rpcData<string | null>(db, "kb_add", { p_user: userId, p_source: source });
  if (!id) throw new FutError("That source couldn't be saved.", 500);
  const known = await rpcData<{ topic: string; category: string }[]>(db, "kb_known_topics", { p_limit: 150 });
  const body = fetched ? fetched.body : `${url ? `Page: ${url}\n` : "The user's own notes or a pasted source.\n"}Title: ${title}\n\n${text}`;
  const reading = await readSource(body, known, env, fetchFn);
  const claims = await saveReading(db, id, reading);
  return { id, claims, relevant: reading.relevant, summary: reading.summary, shared: fetched ? true : share, topics: [...new Set(reading.claims.map((c) => c.topic))] };
}

export interface AskTurn { role: "user" | "assistant"; text: string }
interface FoundClaim { id: number; topic: string; topic_key: string; category: string; statement: string; stance: number; said_at: string;
  source: { id: string; kind: string; url: string | null; title: string | null; community: string | null; score: number; published_at: string; mine: boolean } }

const ASK_SCHEMA = {
  type: "object", additionalProperties: false, required: ["answer", "used", "topics"],
  properties: {
    answer: { type: "string" },
    used: { type: "array", items: { type: "integer" } },
    topics: { type: "array", items: { type: "string" } },
  },
};

/** Answer a question from the bank, citing the sources. Without Claude, the best matching claims grouped by topic. */
export async function ask(db: Rpc, userId: string, question: string, history: AskTurn[], env: Env, fetchFn: Fetch, beforeAi?: () => void) {
  const q = squash(question, MAX_QUESTION);
  if (!q) throw new FutError("Ask a question about FUT gameplay or strategy.");
  const context = [...history.filter((t) => t.role === "user").slice(-2).map((t) => t.text), q].join(" ");
  const found = await rpcData<FoundClaim[]>(db, "kb_search", { p_user: userId, p_q: context, p_limit: 40, p_days: 120 });
  const claims = found.length ? found : await rpcData<FoundClaim[]>(db, "kb_search", { p_user: userId, p_q: q, p_limit: 40, p_days: 365 });
  const sources = new Map<string, { n: number; id: string; kind: string; url: string | null; title: string | null; community: string | null; published_at: string; mine: boolean }>();
  for (const c of claims) if (!sources.has(c.source.id)) sources.set(c.source.id, { n: sources.size + 1, ...c.source });
  const cite = (c: FoundClaim) => sources.get(c.source.id)!.n;
  const fallback = () => {
    const byTopic = new Map<string, FoundClaim[]>();
    for (const c of claims.slice(0, 12)) byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c]);
    const answer = claims.length
      ? [...byTopic].map(([t, cs]) => `**${t}**: ${cs.slice(0, 3).map((c) => `${c.statement} [${cite(c)}]`).join(" ")}`).join("\n\n")
      : "Nothing in the knowledge bank matches that yet.";
    return { answer, via: "search" as const, sources: [...sources.values()].filter((s) => claims.slice(0, 12).some((c) => c.source.id === s.id)), topics: [...byTopic.keys()], claims: claims.length };
  };
  if (!claims.length || !(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY"))) return fallback();
  beforeAi?.();
  const notes = claims.map((c) => `[${cite(c)}] ${c.topic} (${c.category}; ${c.stance === 1 ? "for" : c.stance === -1 ? "against" : "mixed"}; ${c.said_at.slice(0, 10)}${c.source.score ? `; ${c.source.kind === "youtube" ? "views" : "upvotes"} ${c.source.score}` : ""}): ${c.statement}`).join("\n");
  const res = await callClaude(env, fetchFn as typeof fetch, {
    model: env("FUT_KB_MODEL") || DEFAULT_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: ASK_SCHEMA } },
    system: [
      "You answer EA SPORTS FC 27 Ultimate Team gameplay and strategy questions using only the community claims you are given (from Reddit, YouTube and users' own notes). Return JSON only.",
      "answer: a short, direct answer in plain language (under 180 words, Markdown allowed: short paragraphs or a few bullets). Say what most people recommend, where they disagree, and anything that changed recently. Put the claim's number in square brackets after each point, like [2]. If the claims don't answer the question, say so plainly and mention what the bank does cover. Never invent stats, tactics or players that aren't in the claims, and don't present opinions as facts.",
      "used: the numbers you cited. topics: the topic names your answer is about, spelled as given.",
    ].join("\n"),
    messages: [
      ...history.slice(-4).map((t) => ({ role: t.role, content: t.text.slice(0, 1500) })),
      { role: "user", content: `Claims:\n${notes}\n\nQuestion: ${q}` },
    ],
  });
  const out = await res.json().catch(() => null) as { content?: { type: string; text?: string }[]; stop_reason?: string } | null;
  if (!res.ok || out?.stop_reason === "refusal") return fallback();
  let parsed: { answer?: unknown; used?: unknown; topics?: unknown };
  try { parsed = JSON.parse((out?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")); } catch { return fallback(); }
  const used = new Set(Array.isArray(parsed.used) ? parsed.used.map(Number) : []);
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim().slice(0, 3000) : "";
  if (!answer) return fallback();
  for (const m of answer.matchAll(/\[(\d{1,3})\]/g)) used.add(Number(m[1]));
  const topics = Array.isArray(parsed.topics) ? parsed.topics.filter((t): t is string => typeof t === "string").slice(0, 8) : [];
  return { answer, via: "ai" as const, sources: [...sources.values()].filter((s) => used.has(s.n)), topics, claims: claims.length };
}

export const knowledgeMap = (db: Rpc, userId: string, days: number, category: string | null) =>
  rpcData(db, "kb_map", { p_user: userId, p_days: days, p_category: category });
export const knowledgeTopic = (db: Rpc, userId: string, key: string, days: number) =>
  rpcData(db, "kb_topic", { p_user: userId, p_key: key, p_days: days });
export const knowledgeSources = (db: Rpc, userId: string, mine: boolean, limit: number, offset: number) =>
  rpcData(db, "kb_source_list", { p_user: userId, p_mine: mine, p_limit: limit, p_offset: offset });
export const deleteKnowledgeSource = (db: Rpc, userId: string, id: string) => rpcData<boolean>(db, "kb_delete", { p_user: userId, p_id: id });
export async function knowledgeStatus(db: Rpc, env: Env) {
  const status = await rpcData<Record<string, unknown>>(db, "kb_status", {});
  return { ...status, feeds: { reddit: redditFeedOn(env), reddit_mode: redditMode(env), youtube: youtubeFeedOn(env), reader: !!(env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY")) },
    paused: env("FUT_KNOWLEDGE") === "off", categories: KB_CATEGORIES };
}
