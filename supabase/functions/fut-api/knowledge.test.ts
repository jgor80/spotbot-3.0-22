// Knowledge bank through the fut-api routes and the scheduler job, on real PostgreSQL (PGlite), with Reddit, YouTube and
// Claude faked.
import { handle, type Deps } from "./handler.ts";
import { cleanReading, collectReddit, RedditRateLimited, isGameplayPost, parseRedditRss, parseSourceLink, redditMode, rssHtmlText, topicKey } from "../_shared/fut/knowledge.ts";
import { knowledgeDb, ME, OTHER, rpcOver } from "../_shared/fut/knowledge-test-db.ts";

function assert(ok: unknown, msg = "Assertion failed"): asserts ok { if (!ok) throw new Error(msg); }

Deno.test("knowledge helpers: topic keys, links, gameplay filter, cleaning a reading", () => {
  assert(topicKey("4-2-3-1 (2)") === "4-2-3-1-2" && topicKey("Finesse Shot+") === "finesse-shot-plus" && topicKey("Kylian Mbappé") === "kylian-mbappe");
  assert(topicKey("!!!") === "");
  assert(JSON.stringify(parseSourceLink("https://www.reddit.com/r/EASportsFC/comments/1abcde/best_formation/")) === '{"kind":"reddit","id":"1abcde","sub":"EASportsFC"}');
  assert(parseSourceLink("https://youtu.be/dQw4w9WgXcQ?t=3")?.id === "dQw4w9WgXcQ" && parseSourceLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.kind === "youtube");
  assert(parseSourceLink("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ" && parseSourceLink("https://example.com/x") === null && parseSourceLink("nope") === null);
  assert(isGameplayPost({ title: "Is 4-2-3-1 still the meta after the patch?" }));
  assert(!isGameplayPost({ title: "My best pack pull ever", link_flair_text: "Pack Pull" }));
  assert(!isGameplayPost({ title: "4-2-3-1 tips", over_18: true }) && !isGameplayPost({ title: "Lovely weather" }));
  assert(isGameplayPost({ title: "Need help", link_flair_text: "Question" }));
  const r = cleanReading({ relevant: true, summary: "x", claims: [
    { topic: "4-4-2", category: "formations", statement: "Great for counters", stance: "for", strength: 3 },
    { topic: "???", category: "formations", statement: "no key", stance: "for", strength: 1 },
    { topic: "Rivals", category: "weird", statement: "Rivals is sweaty", stance: "against", strength: 9 },
  ] });
  assert(r.claims.length === 2 && r.claims[1]!.category === "other" && r.claims[1]!.stance === -1 && r.claims[1]!.strength === 1, JSON.stringify(r));
  assert(!cleanReading({ relevant: true, claims: [] }).relevant, "no claims means not relevant");
});

const now = Math.floor(Date.now() / 1000);
const redditListing = { data: { children: [
  { data: { id: "p1", title: "4-2-3-1 (2) is the best formation right now", selftext: "Two CDMs, stay back. Custom tactics below.", author: "a", subreddit: "EASportsFC", subreddit_name_prefixed: "r/EASportsFC",
    permalink: "/r/EASportsFC/comments/p1/x/", created_utc: now - 3600, score: 900, num_comments: 120, link_flair_text: "Discussion" } },
  { data: { id: "p2", title: "Look at my pull", selftext: "", subreddit_name_prefixed: "r/EASportsFC", permalink: "/r/EASportsFC/comments/p2/x/", created_utc: now, score: 5000, link_flair_text: "Pack Pull" } },
  { data: { id: "p3", title: "Tactics question", selftext: "", subreddit_name_prefixed: "r/EASportsFC", permalink: "/r/EASportsFC/comments/p3/x/", created_utc: now, score: 3 } },
] } };
const redditThread = [{ data: { children: [{ data: redditListing.data.children[0]!.data }] } }, { data: { children: [
  { kind: "t1", data: { body: "Disagree, 4-2-3-1 gets cut open on the wings", score: 300 } },
  { kind: "t1", data: { body: "AutoMod text", score: 50, author: "AutoModerator" } },
  { kind: "more", data: {} },
] } }];

function fakes() {
  const calls: { url: string; body?: unknown }[] = [];
  let reading: unknown = null, answer: unknown = null, noCredit = false;
  const fetcher = (url: string, init?: RequestInit) => {
    const body = init?.body && String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : init?.body;
    calls.push({ url, body });
    const ok = (v: unknown) => Promise.resolve(new Response(JSON.stringify(v)));
    if (url.includes("reddit.com/api/v1/access_token")) return ok({ access_token: "tok" });
    if (url.includes("oauth.reddit.com/r/EASportsFC/top")) return ok(redditListing);
    if (url.includes("oauth.reddit.com/r/fut/top")) return ok({ data: { children: [] } });
    if (url.includes("/comments/p1")) return ok(redditThread);
    if (url === "https://www.reddit.com/r/fut/comments/rss1/.rss?sort=top&limit=15") return Promise.resolve(new Response(rssThread));
    if (url.includes("youtube/v3/search")) return ok({ items: [{ id: { videoId: "vid00000001" } }] });
    if (url.includes("youtube/v3/videos")) return ok({ items: [{ id: "vid00000001", snippet: { title: "BEST META TACTICS FC 27", description: "4-4-2 custom tactics inside", channelTitle: "Some Creator", publishedAt: new Date().toISOString() }, statistics: { viewCount: "120000", commentCount: "3" } }] });
    if (url.includes("youtube/v3/commentThreads")) return ok({ items: [{ snippet: { topLevelComment: { snippet: { textDisplay: "4-4-2 with these tactics is broken, thanks!", likeCount: 40 } } } }] });
    if (url.includes("api.anthropic.com") && noCredit) return Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }), { status: 400 }));
    if (url.includes("api.anthropic.com")) {
      const isAsk = String((body as { system?: string })?.system ?? "").includes("You answer");
      return ok({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(isAsk ? answer : reading) }] });
    }
    return Promise.resolve(new Response("nope", { status: 404 }));
  };
  return { calls, fetcher, setReading: (v: unknown) => { reading = v; }, setAnswer: (v: unknown) => { answer = v; }, setNoCredit: (v: boolean) => { noCredit = v; } };
}

const rssEntry = (id: string, title: string, html: string, author = "someone") =>
  `<entry><author><name>/u/${author}</name></author><content type="html">${html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</content>` +
  `<id>${id}</id><link href="https://www.reddit.com/r/fut/comments/${id.slice(3)}/x/" /><updated>2026-11-09T10:00:00+00:00</updated><published>2026-11-09T10:00:00+00:00</published><title>${title}</title></entry>`;
const rssTop = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>/r/fut/top/.rss</id>` +
  rssEntry("t3_rss1", "Best formation after the patch?", `<!-- SC_OFF --><div class="md"><p>Play 4-4-2 with two strikers &amp; it&#39;s great.</p><ul><li>Depth 60</li></ul></div><!-- SC_ON --> &#32; submitted by &#32; <a href="https://www.reddit.com/user/someone"> /u/someone </a>`) +
  rssEntry("t3_rss2", "Look at my new kit", `<div class="md"><p>My club kit</p></div>`) + `</feed>`;
const rssThread = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">` +
  rssEntry("t3_rss1", "Best formation after the patch?", `<div class="md"><p>Play 4-4-2 with two strikers.</p></div>`) +
  rssEntry("t1_c1", "/u/a on Best formation", `<div class="md"><p>Agree, 4-4-2 is the meta right now.</p></div>`, "a") +
  rssEntry("t1_c2", "/u/AutoModerator on Best formation", `<div class="md"><p>AutoMod text that is long enough</p></div>`, "AutoModerator") + `</feed>`;

Deno.test("Reddit through its RSS feeds when there are no API keys", async () => {
  assert(redditMode(() => undefined) === "rss" && redditMode((k) => k === "FUT_KB_REDDIT_RSS" ? "off" : undefined) === "off");
  assert(redditMode((k) => ({ REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s" } as Record<string, string>)[k]) === "api");
  assert(rssHtmlText("&lt;p&gt;One &amp;amp; two&lt;/p&gt;&lt;p&gt;Three&lt;/p&gt;") === "One & two\nThree");
  const entries = parseRedditRss(rssTop);
  assert(entries.length === 2 && entries[0]!.id === "t3_rss1" && entries[0]!.author === "someone" && entries[0]!.text === "Play 4-4-2 with two strikers & it's great.\n- Depth 60", JSON.stringify(entries[0]));
  const urls: string[] = [];
  const fetcher = (url: string) => {
    urls.push(url);
    if (url.includes("/r/fut/top/.rss")) return Promise.resolve(new Response(rssTop));
    if (url.includes("/comments/rss1/.rss")) return Promise.resolve(new Response(rssThread));
    return Promise.resolve(new Response("blocked", { status: 403 }));
  };
  const fast = (more: Record<string, string> = {}) => (k: string) => ({ FUT_KB_SUBREDDITS: "fut", FUT_KB_REDDIT_GAP_MS: "0", ...more } as Record<string, string>)[k];
  const got = await collectReddit(fast(), fetcher);
  assert(got.length === 1 && got[0]!.external_id === "rss1" && got[0]!.url === "https://www.reddit.com/r/fut/comments/rss1/x/" && got[0]!.score === 0, JSON.stringify(got));
  assert(got[0]!.body.includes("number 1 in today's top posts") && got[0]!.body.includes("- Agree, 4-4-2 is the meta") && !got[0]!.body.includes("AutoMod"), got[0]!.body);
  assert(urls.length === 2 && !urls.some((u) => u.includes("oauth")), "no sign-in, the kit post isn't fetched");
  let failed = "";
  await collectReddit(fast({ FUT_KB_SUBREDDITS: "EASportsFC" }), fetcher).catch((e) => { failed = (e as Error).message; });
  assert(failed.includes("HTTP 403"), "a blocked feed fails the run's Reddit step so it shows on the page");

  // Rate limits: posts already in the bank aren't fetched again, a 429 stops asking and keeps what's collected
  urls.length = 0;
  assert((await collectReddit(fast(), fetcher, () => Promise.resolve(new Set(["rss1"])))).length === 0 && urls.length === 1, "known post: only the listing is read");
  let limitedAt = "";
  const limitedFetch = (url: string) => {
    urls.push(url);
    if (url.includes("/r/fut/top/.rss")) return Promise.resolve(new Response(rssTop));
    limitedAt = url;
    return Promise.resolve(new Response("slow down", { status: 429, headers: { "retry-after": "60" } }));
  };
  urls.length = 0;
  const partial = await collectReddit(fast({ FUT_KB_SUBREDDITS: "fut,EASportsFC" }), limitedFetch);
  assert(partial.length === 1 && partial[0]!.external_id === "rss1" && urls.length === 2 && limitedAt.includes("/comments/rss1/"), `keeps the post, stops before r/EASportsFC: ${urls.join(" ")}`);
  let rateMsg = "";
  await collectReddit(fast({ FUT_KB_SUBREDDITS: "EASportsFC" }), limitedFetch).catch((e) => { rateMsg = e instanceof RedditRateLimited ? e.message : ""; });
  assert(rateMsg.includes("HTTP 429") && rateMsg.includes("60 s"), rateMsg);
  urls.length = 0;
  const started = Date.now();
  await collectReddit(fast({ FUT_KB_REDDIT_GAP_MS: "40" }), fetcher);
  assert(urls.length === 2 && Date.now() - started >= 40, "requests are spaced out");
});

Deno.test("knowledge routes and the ingest job", async () => {
  const pg = await knowledgeDb();
  try {
    const runs: Record<string, unknown>[] = [];
    const db = { ...rpcOver(pg), from: (t: string) => ({ insert: (row: Record<string, unknown>) => { runs.push({ t, ...row }); return Promise.resolve({ data: null, error: null }); } }) };
    const f = fakes();
    const env0: Record<string, string> = { FUT_ENABLED: "true", FUT_KB_REDDIT_RSS: "off" };
    const deps = (env: Record<string, string> = {}, bot = false): Deps => ({
      db: db as unknown as Deps["db"], userFor: (req) => Promise.resolve(req.headers.get("x-test-user")), env: (k) => ({ ...env0, ...env })[k],
      isBot: () => Promise.resolve(bot), fetch: f.fetcher as unknown as Deps["fetch"],
    });
    // deno-lint-ignore no-explicit-any
    const call = async (path: string, method = "GET", body?: unknown, env: Record<string, string> = {}, user = ME): Promise<{ status: number; data: any }> => {
      const res = await handle(new Request(`http://local/functions/v1/fut-api/v1${path}`, { method, headers: { "content-type": "application/json", "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) }), deps(env));
      return { status: res.status, data: await res.json() };
    };
    const job = async (env: Record<string, string>, bot = true) => {
      const res = await handle(new Request("http://local/functions/v1/fut-api", { method: "POST", body: JSON.stringify({ job: "knowledge-ingest" }) }), deps(env, bot));
      return { status: res.status, data: await res.json() };
    };

    assert((await job({}, false)).status === 401, "only the bot");
    const off = await job({});
    assert(off.status === 200 && off.data.data.feeds.reddit.status === "off" && off.data.data.feeds.youtube.status === "off" && off.data.data.read === 0, JSON.stringify(off.data));
    assert((await job({ FUT_KNOWLEDGE: "off" })).data.data.paused);

    f.setReading({ relevant: true, summary: "Formation debate", claims: [
      { topic: "4-2-3-1 (2)", category: "formations", statement: "Best formation now: two CDMs stay back", stance: "for", strength: 3 },
      { topic: "4-2-3-1 (2)", category: "formations", statement: "Gets cut open on the wings", stance: "against", strength: 2 },
      { topic: "4-4-2", category: "formations", statement: "4-4-2 custom tactics are broken", stance: "for", strength: 2 },
    ] });
    const keys = { REDDIT_CLIENT_ID: "id", REDDIT_CLIENT_SECRET: "s", YOUTUBE_API_KEY: "y", ANTHROPIC_API_KEY: "k", FUT_KB_YOUTUBE_HOURS: Array.from({ length: 24 }, (_, i) => i).join(",") };
    // Out of Claude credit: the run stops reading without blaming any source
    f.setNoCredit(true);
    const broke = await job(keys);
    assert(broke.status === 200 && broke.data.data.feeds.reddit.collected === 1, `only the gameplay post with enough upvotes: ${JSON.stringify(broke.data)}`);
    assert(broke.data.data.feeds.reader.status === "failed" && broke.data.data.feeds.reader.error.includes("credit balance") && broke.data.data.read === 0 && broke.data.data.failed === 0 && broke.data.data.waiting === 2, JSON.stringify(broke.data.data));
    assert(f.calls.filter((c) => c.url.includes("anthropic")).length === 1, "stops after the first refusal");
    f.setNoCredit(false);
    const ran = await job(keys);
    assert(ran.status === 200, JSON.stringify(ran.data));
    const r = ran.data.data;
    assert(r.feeds.reddit.status === "ok" && r.feeds.reddit.collected === 0, JSON.stringify(r.feeds));
    assert(r.feeds.youtube.collected === 0 && r.read === 2 && r.claims === 6 && r.waiting === 0, JSON.stringify(r));
    assert(runs.length === 3 && runs.at(-1)!.t === "kb_runs" && runs.at(-1)!.read === 2, "each run is logged");
    const readerCall = f.calls.find((c) => c.url.includes("anthropic") && JSON.stringify(c.body).includes("Disagree, 4-2-3-1"));
    assert(readerCall && !JSON.stringify(readerCall.body).includes("AutoMod text"), "top comments go to the reader, AutoModerator doesn't");
    const second = (f.calls.filter((c) => c.url.includes("anthropic")).at(-1)!.body as { system: string }).system;
    assert(second.includes("4-2-3-1 (2) (formations)"), "topics from the first source are offered to the next");
    const notNow = await job({ ...keys, FUT_KB_YOUTUBE_HOURS: "99" });
    assert(notNow.data.data.feeds.youtube.status === "later" && notNow.data.data.feeds.reddit.collected === 0, "already stored; YouTube waits for its hours");

    const map = await call("/knowledge/map?days=30");
    assert(map.status === 200 && map.data.data.topics[0].key === "4-2-3-1-2" && map.data.data.topics[0].claims === 4 && map.data.data.topics[0].agreement === "leaning", JSON.stringify(map.data).slice(0, 400));
    assert((await call("/knowledge/map?category=bogus")).status === 400);
    const topic = await call("/knowledge/topics/4-4-2");
    assert(topic.status === 200 && topic.data.data.claims === 2 && topic.data.data.statements[0].source.url.startsWith("https://"), JSON.stringify(topic.data).slice(0, 300));
    assert((await call("/knowledge/topics/nothing")).status === 404);
    const status = await call("/knowledge/status");
    assert(status.data.data.feeds.reddit === false && status.data.data.sources === 2 && status.data.data.last_run === null, "status uses the caller's env; runs log went to the fake");

    // Adding: pasted text is read and private; too short is refused; a Reddit link without keys asks for the text
    f.setReading({ relevant: true, summary: "My notes", claims: [{ topic: "Explosive AcceleRATE", category: "playstyles", statement: "Explosive wingers win every race", stance: "for", strength: 2 }] });
    assert((await call("/knowledge/sources", "POST", { text: "too short" }, { ANTHROPIC_API_KEY: "k" })).status === 400);
    assert((await call("/knowledge/sources", "POST", { url: "https://www.reddit.com/r/fut/comments/zz9999/x/" }, { ANTHROPIC_API_KEY: "k" })).status === 422);
    assert((await call("/knowledge/sources", "POST", { text: "x".repeat(100) })).status === 503, "needs a key");
    const added = await call("/knowledge/sources", "POST", { text: "I tested it all weekend: explosive AcceleRATE wingers win every race against lengthy defenders.", share: true }, { ANTHROPIC_API_KEY: "k" });
    assert(added.status === 201 && added.data.data.claims === 1 && added.data.data.shared === false, `notes stay private: ${JSON.stringify(added.data)}`);
    assert(!(await call("/knowledge/map", "GET", undefined, {}, OTHER)).data.data.topics.some((t: { key: string }) => t.key === "explosive-accelerate"));
    const mine = await call("/knowledge/sources?mine=true");
    assert(mine.data.data.total === 1 && mine.data.data.sources[0].mine, JSON.stringify(mine.data));
    const linked = await call("/knowledge/sources", "POST", { url: "https://www.reddit.com/r/EASportsFC/comments/p1/x/" }, { ...keys });
    assert(linked.status === 201 && linked.data.data.shared === true, `a link already in the bank is read again: ${JSON.stringify(linked.data)}`);
    const viaRss = await call("/knowledge/sources", "POST", { url: "https://www.reddit.com/r/fut/comments/rss1/x/" }, { ANTHROPIC_API_KEY: "k", FUT_KB_REDDIT_RSS: "" });
    assert(viaRss.status === 201 && viaRss.data.data.shared === true, `without Reddit keys a link is fetched from its RSS feed: ${JSON.stringify(viaRss.data)}`);
    const rssRead = JSON.stringify(f.calls.filter((c) => c.url.includes("anthropic")).at(-1)!.body);
    assert(rssRead.includes("Play 4-4-2 with two strikers") && rssRead.includes("Agree, 4-4-2 is the meta") && !rssRead.includes("submitted by"), rssRead.slice(0, 600));

    // Ask: search fallback without a key, Claude with citations with one
    const plain = await call("/knowledge/ask", "POST", { question: "Is 4-2-3-1 still good?" });
    assert(plain.status === 200 && plain.data.data.via === "search" && plain.data.data.answer.includes("4-2-3-1") && plain.data.data.sources.length >= 1, JSON.stringify(plain.data));
    f.setAnswer({ answer: "Most people rate 4-2-3-1 (2) highly [1], but some say the wings are weak [1].", used: [1], topics: ["4-2-3-1 (2)"] });
    const smart = await call("/knowledge/ask", "POST", { question: "Is 4-2-3-1 still good?", history: [{ role: "user", text: "hi" }, { role: "bot", text: "x" }] }, { ANTHROPIC_API_KEY: "k" });
    assert(smart.data.data.via === "ai" && smart.data.data.sources.length === 1 && smart.data.data.sources[0].url.startsWith("https://"), JSON.stringify(smart.data));
    assert((await call("/knowledge/ask", "POST", { question: "" })).status === 400);

    const id = mine.data.data.sources[0].id;
    assert((await call(`/knowledge/sources/${id}`, "DELETE", undefined, {}, OTHER)).status === 404);
    assert((await call(`/knowledge/sources/${id}`, "DELETE")).status === 200);
  } finally { await pg.close(); }
});

Deno.test("MCP knowledge tools read the same bank as the website", async () => {
  const { FUT_TOOLS } = await import("../gafferbot-mcp/fut.ts");
  const pg = await knowledgeDb();
  try {
    const { rpc } = rpcOver(pg);
    await rpc("kb_collect", { p_sources: [{ kind: "reddit", external_id: "m1", url: "https://www.reddit.com/r/fut/comments/m1/", title: "t", community: "r/fut", published_at: new Date().toISOString(), score: 100, body: "a body that is long enough to keep" }] });
    const [src] = (await rpc("kb_pending", {})).data as { id: string }[];
    await rpc("kb_save_reading", { p_source: src!.id, p_status: "read", p_note: null, p_claims: [{ topic_key: "4-4-2", topic: "4-4-2", category: "formations", statement: "4-4-2 is great on counters", stance: 1, strength: 2 }] });
    const links = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { auth_user_id: ME } }) }) }) }) }) };
    const ctx = { db: links, discordUserId: "1", futDb: { rpc } };
    const tool = (name: string) => FUT_TOOLS.find((t) => t.name === name)!;
    // deno-lint-ignore no-explicit-any
    const found: any = await tool("search_fut_knowledge").run({ query: "best 4-4-2 tactics" }, ctx as never);
    assert(found.claims.length === 1 && found.claims[0].source.url.includes("m1"), JSON.stringify(found));
    // deno-lint-ignore no-explicit-any
    const map: any = await tool("get_fut_knowledge_map").run({}, ctx as never);
    assert(map.map.topics[0].key === "4-4-2", JSON.stringify(map));
    // deno-lint-ignore no-explicit-any
    const detail: any = await tool("get_fut_knowledge_map").run({ topic_key: "4-4-2" }, ctx as never);
    assert(detail.topic.statements.length === 1);
    let failed = false; try { await tool("get_fut_knowledge_map").run({ topic_key: "nope-nothing" }, ctx as never); } catch { failed = true; }
    assert(failed, "an unknown topic is a tool error");
  } finally { await pg.close(); }
});
