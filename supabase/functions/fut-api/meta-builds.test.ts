// Community meta builds: reading Pro Clubs build sources, the consensus per position, the SQL on real PostgreSQL
// (PGlite), the scheduled job and the public meta-builds function, with Reddit, YouTube and Claude faked.
import assertNode from "node:assert/strict";
import { handle, type Deps } from "./handler.ts";
import { cleanBuildReading, extractBuildLinks, isBuildPost, loadMetaBuilds } from "../_shared/fut/meta-builds.ts";
import { runKnowledgeIngest } from "../_shared/fut/knowledge.ts";
import { knowledgeDb, ME, rpcOver } from "../_shared/fut/knowledge-test-db.ts";
import { clearCache, createHandler } from "../meta-builds/handler.ts";
import { decodeBuild, emptyBuild, encodeBuild } from "../../../src/lib/proBuild.ts";
import { describeMetaBuild, metaBuildFor, metaBuilds, recency, type BuildRow } from "../../../src/lib/metaBuilds.ts";

const eq = (a: unknown, b: unknown, msg?: string) => assertNode.deepEqual(a, b, msg);
const ok = (v: unknown, msg?: string) => assertNode.ok(v, msg);
const NOW = Date.parse("2026-11-15T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

// A real-format Pro Clubs Builder share: base64 of "version|archetype|level|height|weight|skill|weakFoot|attr:points,...|||name|"
const PCB = btoa("1|12|60|188|82|4|5|finishing:20,positioning:18,acceleration:15,sprintSpeed:15,shotPower:10|||Meta Finisher|");
const pcbLink = `https://proclubsbuilder.co.uk/b/${PCB}`;

Deno.test("build links in a source are decoded, not guessed", () => {
  const ours = encodeBuild({ ...emptyBuild("boss"), heightCm: 193, weightKg: 88, points: { strength: 12 } });
  const links = extractBuildLinks(`Here's mine ${pcbLink}. Also https://gafferbot.app/build?b=${ours} and junk https://proclubsbuilder.co.uk/b/nothing`);
  eq(links.length, 2);
  eq([links[0]!.build.archetype, links[0]!.build.heightCm, links[0]!.build.points.finishing], ["finisher", 188, 20]);
  eq([links[1]!.build.archetype, links[1]!.build.heightCm], ["boss", 193]);
  ok(isBuildPost({ title: "Best ST build for FC 27?" }) && isBuildPost({ title: "Finisher or Target for a 6'2 striker" }) && !isBuildPost({ title: "Our club won the cup!" }));
});

Deno.test("a reading keeps known positions, archetypes, PlayStyles and attributes; a link's numbers win", () => {
  const links = extractBuildLinks(pcbLink);
  const r = cleanBuildReading({ relevant: true, summary: "Striker builds", builds: [
    { position: "ST", archetype: "target", height_cm: 170, weight_kg: 0, skill_moves: 9, weak_foot: 0, playstyles: ["Finesse Shot", "Made Up"], key_attributes: ["finishing", "nope"], link: 1, stance: "for", strength: 3, statement: "The meta striker, shoots from anywhere" },
    { position: "CB", archetype: "boss", height_cm: 193, weight_kg: 88, skill_moves: 2, weak_foot: 3, playstyles: ["Aerial Fortress", "Block"], key_attributes: ["defAware", "strength"], link: 0, stance: "for", strength: 2, statement: "Tall Boss wins every header" },
    { position: "LB", archetype: "none", height_cm: 0, weight_kg: 0, skill_moves: 0, weak_foot: 0, playstyles: [], key_attributes: [], link: 0, stance: "for", strength: 1, statement: "not a position we know" },
    { position: "CDM", archetype: "none", height_cm: 0, weight_kg: 0, skill_moves: 0, weak_foot: 0, playstyles: [], key_attributes: [], link: 7, stance: "against", strength: 1, statement: "Short CDMs get bullied" },
  ] }, links);
  eq(r.builds.length, 3);
  const [st, cb, cdm] = r.builds;
  eq([st!.archetype, st!.height_cm, st!.weight_kg, st!.skill_moves, st!.weak_foot, st!.level], ["finisher", 188, 82, 4, 5, 55], "the link wins (level 60 from an old FC build is capped at 55)");
  eq(st!.playstyles, ["Finesse Shot"]);
  eq(st!.key_attrs, ["finishing"]);
  eq(st!.points?.finishing, 20);
  eq([cb!.archetype, cb!.height_cm, cb!.points], ["boss", 193, null]);
  eq([cdm!.archetype, cdm!.height_cm, cdm!.stance, cdm!.points], [null, null, -1, null], "unknown link number ignored");
  eq(cleanBuildReading({ relevant: true, builds: [] }).relevant, false);
});

const row = (p: Partial<BuildRow> & { id: string }): BuildRow => ({
  position: "ST", archetype: "finisher", height_cm: null, weight_kg: null, skill_moves: null, weak_foot: null, playstyles: [], key_attrs: [], points: null, level: null,
  stance: 1, strength: 2, statement: `Build ${p.id}`, said_at: ago(2), weight: 2,
  ...p,
  source: { id: p.id, kind: "reddit", url: `https://www.reddit.com/r/ProClubs/comments/${p.id}/`, title: `Post ${p.id}`, community: "r/ProClubs", score: 0, published_at: ago(2), ...(p.source ?? {}) },
});

Deno.test("the community meta build is the weighted consensus of what people recommend", () => {
  const rows = [
    row({ id: "a", height_cm: 185, weight_kg: 80, skill_moves: 4, weak_foot: 5, playstyles: ["Finesse Shot", "Quick Step", "Rapid"], key_attrs: ["finishing", "acceleration"], weight: 3 }),
    row({ id: "b", height_cm: 188, weight_kg: 82, skill_moves: 4, weak_foot: 4, playstyles: ["Finesse Shot", "Low Driven Shot"], key_attrs: ["finishing", "positioning"], points: { finishing: 20, positioning: 18 }, level: 60 }),
    row({ id: "c", height_cm: 180, weight_kg: 75, skill_moves: 5, weak_foot: 4, playstyles: ["Finesse Shot", "Quick Step"], key_attrs: ["acceleration"] }),
    row({ id: "d", archetype: "target", height_cm: 195, weight_kg: 90, playstyles: ["Power Header"], key_attrs: ["strength", "finishing"], weight: 1 }),
    row({ id: "e", stance: -1, archetype: "spark", statement: "Spark strikers can't finish" }),
    row({ id: "f", position: "CB", archetype: "boss" }),
  ];
  const st = metaBuildFor("ST", rows, NOW);
  eq(st.builds, 4);
  eq(st.sources, 4);
  eq(st.archetype?.key, "finisher");
  ok(st.archetype!.share > 0.85 && st.archetype!.share < 0.95, String(st.archetype!.share));
  eq(st.agreement, "agreed");
  eq(st.alternatives.map((a) => a.name), ["Target"]);
  eq([st.heightCm, st.weightKg, st.skillMoves, st.weakFoot], [185, 80, 4, 4], "weighted medians of the Finisher builds");
  eq(st.playstyles[0], { name: "Finesse Shot", share: 0.88, builds: 3 });
  ok(st.playstyles.some((p) => p.name === "Quick Step") && !st.playstyles.some((p) => p.name === "Power Header"), "rare picks drop out");
  eq(st.attributes[0]!.name, "Finishing");
  eq(st.pointsFrom?.id, "b", "exact points from the shared build");
  eq(st.warnings.map((w) => w.statement), ["Spark strikers can't finish"]);
  const back = decodeBuild(st.code!)!;
  eq([back.archetype, back.heightCm, back.level, back.points.finishing, back.name], ["finisher", 185, 55, 20, "Community meta ST"]);
  eq(back.playstyles, st.playstyles.map((p) => p.name));
  ok(describeMetaBuild(st).startsWith("Striker: Finisher (") && describeMetaBuild(st).includes("Finesse Shot"));

  const gk = metaBuildFor("GK", rows, NOW);
  eq([gk.builds, gk.archetype, gk.build, gk.code, gk.agreement], [0, null, null, null, "early"], "nobody covered keepers: nothing invented");
  eq(describeMetaBuild(gk), "Goalkeeper: no community builds yet.");
  eq(metaBuilds(rows, NOW).map((m) => m.builds), [4, 0, 0, 0, 0, 0, 1, 0]);
  // Old builds count less
  eq(recency(ago(10), NOW), 1);
  ok(recency(ago(105), NOW) < 0.7 && recency(ago(400), NOW) === 1 / 3);
  const swing = metaBuildFor("ST", [row({ id: "old", archetype: "target", said_at: ago(170) }), row({ id: "new", archetype: "finisher" })], NOW);
  eq(swing.archetype?.key, "finisher", "a fresh build outweighs an old one");
});

Deno.test("builds SQL: area, saving, the public rows and privacy", async () => {
  const pg = await knowledgeDb();
  const { rpc } = rpcOver(pg);
  try {
    const src = (id: string, area?: string) => ({ kind: "reddit", external_id: id, url: `https://www.reddit.com/r/ProClubs/comments/${id}/`, title: `Post ${id}`, community: "r/ProClubs",
      published_at: new Date().toISOString(), score: 300, comments: 4, body: "Best ST build: Finisher 185 cm with Finesse Shot", excerpt: "Best ST build", ...(area ? { area } : {}) });
    eq((await rpc("kb_collect", { p_sources: [src("b1", "proclubs"), src("f1")] })).data, 2);
    const pending = (await rpc("kb_pending", { p_limit: 10 })).data as { id: string; area: string; url: string }[];
    const b1 = pending.find((p) => p.url.includes("b1"))!;
    eq(b1.area, "proclubs");
    eq(pending.find((p) => p.url.includes("f1"))!.area, "fut");
    const builds = [
      { position: "ST", archetype: "finisher", height_cm: 185, weight_kg: 80, skill_moves: 4, weak_foot: 5, level: null, playstyles: ["Finesse Shot"], key_attrs: ["finishing"], points: { finishing: 20 }, stance: 1, strength: 3, statement: "Meta striker" },
      { position: "ST", archetype: "bad!", height_cm: 185, weight_kg: 80, skill_moves: 4, weak_foot: 5, level: null, playstyles: [], key_attrs: [], points: null, stance: 1, strength: 3, statement: "dropped" },
      { position: "CB", archetype: null, height_cm: 260, weight_kg: 88, skill_moves: null, weak_foot: null, level: null, playstyles: [], key_attrs: [], points: null, stance: -1, strength: 1, statement: "Short CBs get bullied" },
    ];
    eq((await rpc("kb_save_builds", { p_source: b1.id, p_status: "read", p_note: "Striker builds", p_builds: builds })).data, 2);
    // A user's private source never reaches the public rows
    const mineId = (await rpc("kb_add", { p_user: ME, p_source: { kind: "note", url: null, title: "My notes", body: "my private build notes here", excerpt: "x", shared: false, area: "proclubs" } })).data as string;
    eq((await rpc("kb_save_builds", { p_source: mineId, p_status: "read", p_note: null, p_builds: [{ ...builds[0], statement: "secret" }] })).data, 1);
    const rows = (await rpc("kb_meta_build_rows", { p_days: 180 })).data as BuildRow[];
    eq(rows.length, 2);
    ok(!rows.some((r) => r.statement === "secret"));
    const st = rows.find((r) => r.position === "ST")!;
    eq([st.archetype, st.height_cm, st.playstyles, st.points, st.source.community], ["finisher", 185, ["Finesse Shot"], { finishing: 20 }, "r/ProClubs"]);
    ok(Number(st.weight) > 3, "popular sources count more");
    eq(rows.find((r) => r.position === "CB")!.height_cm, null, "out of range dropped");
    const list = (await rpc("kb_source_list", { p_user: ME, p_mine: false, p_limit: 10, p_offset: 0 })).data as { sources: { url: string | null; area: string; claims: number }[] };
    const listed = list.sources.find((s) => s.url?.includes("b1"))!;
    eq([listed.area, listed.claims], ["proclubs", 2]);
    // Read again: replaced, not added to
    eq((await rpc("kb_save_builds", { p_source: b1.id, p_status: "read", p_note: null, p_builds: [builds[0]] })).data, 1);
    const out = await loadMetaBuilds({ rpc }, 180);
    eq(out.positions.find((p) => p.position === "ST")!.builds, 1);
    eq(out.positions.find((p) => p.position === "CB")!.builds, 0);
  } finally {
    await pg.close();
  }
});

function fakes(reading: unknown) {
  const calls: { url: string; body?: unknown }[] = [];
  const entry = (id: string, sub: string, title: string, html: string) =>
    `<entry><author><name>/u/someone</name></author><content type="html">${html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</content>` +
    `<id>${id}</id><link href="https://www.reddit.com/r/${sub}/comments/${id.slice(3)}/x/" /><published>${new Date().toISOString()}</published><title>${title}</title></entry>`;
  const feed = (...e: string[]) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${e.join("")}</feed>`;
  const fetcher = (url: string, init?: RequestInit) => {
    const body = init?.body && String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : init?.body;
    calls.push({ url, body });
    const okJson = (v: unknown) => Promise.resolve(new Response(JSON.stringify(v)));
    if (url.startsWith("https://www.reddit.com/r/ProClubs/top/.rss")) {
      return Promise.resolve(new Response(feed(entry("t3_pc1", "ProClubs", "Best ST build after the patch", `<p>Finisher, 6'1, Finesse Shot. ${pcbLink}</p>`), entry("t3_pc2", "ProClubs", "We won the cup lads", "<p>yay</p>"))));
    }
    if (url.startsWith("https://www.reddit.com/r/ProClubs/search.rss")) return Promise.resolve(new Response(feed(entry("t3_pc1", "ProClubs", "Best ST build after the patch", "<p>same post again</p>"))));
    if (url.startsWith("https://www.reddit.com/r/ProClubs/comments/pc1/.rss")) {
      return Promise.resolve(new Response(feed(entry("t3_pc1", "ProClubs", "Best ST build after the patch", `<p>Finisher, 6'1, Finesse Shot. ${pcbLink}</p>`), entry("t1_k1", "ProClubs", "c", "<p>Target is better if you're tall, trust me</p>"))));
    }
    if (url.includes("reddit.com")) return Promise.resolve(new Response(feed()));
    if (url.includes("api.anthropic.com")) return okJson({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reading) }] });
    return Promise.resolve(new Response("nope", { status: 404 }));
  };
  return { calls, fetcher };
}

Deno.test("the scheduled run collects Pro Clubs build posts and reads them into builds", async () => {
  const pg = await knowledgeDb();
  const { rpc } = rpcOver(pg);
  try {
    const f = fakes({ relevant: true, summary: "Striker build", builds: [
      { position: "ST", archetype: "finisher", height_cm: 185, weight_kg: 0, skill_moves: 0, weak_foot: 0, playstyles: ["Finesse Shot"], key_attributes: ["finishing"], link: 1, stance: "for", strength: 3, statement: "Meta striker build" },
      { position: "ST", archetype: "target", height_cm: 0, weight_kg: 0, skill_moves: 0, weak_foot: 0, playstyles: [], key_attributes: [], link: 0, stance: "mixed", strength: 1, statement: "Target if you're tall" },
    ] });
    const env = (k: string) => ({ FUT_KB_REDDIT_GAP_MS: "0", ANTHROPIC_API_KEY: "k", FUT_KB_YOUTUBE_HOURS: "99" } as Record<string, string>)[k];
    const r = await runKnowledgeIngest({ rpc }, env, f.fetcher, new Date(NOW));
    eq(r.feeds.builds, { status: "ok", collected: 1 }, "the build post once (it was in two feeds); the cup post filtered out");
    eq([r.builds, r.claims], [1, 2]);
    const reader = f.calls.find((c) => c.url.includes("anthropic") && String((c.body as { system: string }).system).includes("Pro Clubs"))!;
    const text = JSON.stringify(reader.body);
    ok(text.includes("[L1]") && text.includes("Meta Finisher") && text.includes("Target is better"), "links decoded for the reader, top comments included");
    const rows = (await rpc("kb_meta_build_rows", { p_days: 180 })).data as BuildRow[];
    const meta = metaBuildFor("ST", rows);
    eq([meta.archetype?.key, meta.heightCm, meta.weightKg, meta.build?.points.finishing], ["finisher", 188, 82, 20], "link numbers saved");
    ok(meta.topSources[0]!.url!.startsWith("https://www.reddit.com/r/ProClubs/comments/pc1/"));
    // Off switch
    const off = await runKnowledgeIngest({ rpc }, (k) => k === "FUT_KB_BUILDS" ? "off" : env(k), f.fetcher, new Date(NOW));
    eq(off.feeds.builds, { status: "off" });
  } finally {
    await pg.close();
  }
});

Deno.test("public meta-builds function and adding a build source on the website", async () => {
  const pg = await knowledgeDb();
  const { rpc } = rpcOver(pg);
  try {
    const f = fakes({ relevant: true, summary: "A CB build", builds: [
      { position: "CB", archetype: "boss", height_cm: 193, weight_kg: 88, skill_moves: 2, weak_foot: 3, playstyles: ["Aerial Fortress"], key_attributes: ["defAware"], link: 0, stance: "for", strength: 3, statement: "Tall Boss CB" },
    ] });
    const deps: Deps = {
      db: { rpc } as unknown as Deps["db"], userFor: () => Promise.resolve(ME), isBot: () => Promise.resolve(false), fetch: f.fetcher as unknown as Deps["fetch"],
      env: (k) => ({ FUT_ENABLED: "true", ANTHROPIC_API_KEY: "k", FUT_KB_REDDIT_RSS: "off" } as Record<string, string>)[k],
      waitUntil: (p) => { background.push(p); },
    };
    const background: Promise<unknown>[] = [];
    const add = async (b: unknown) => {
      const res = await handle(new Request("http://local/functions/v1/fut-api/v1/knowledge/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }), deps);
      const data = await res.json();
      while (background.length) await background.shift();
      return { status: res.status, data };
    };
    const added = await add({ url: "https://www.youtube.com/watch?v=abcdefghijk", text: "My CB build: Boss, 6'4, 88 kg, Aerial Fortress, max Def Awareness and Strength.", share: true, area: "proclubs" });
    eq(added.status, 202, JSON.stringify(added.data));
    eq([added.data.data.status, added.data.data.area], ["reading", "proclubs"]);
    // deno-lint-ignore no-explicit-any
    const builds = ((await rpc("kb_source_list", { p_user: ME, p_mine: true })).data as any).sources;
    eq([builds[0].status, builds[0].claims, builds[0].area], ["read", 1, "proclubs"]);
    // A build link alone is enough
    eq((await add({ url: pcbLink, area: "proclubs", share: true })).status, 202);
    eq((await add({ url: pcbLink, area: "fut" })).status, 400, "an Ultimate Team source still needs text");
    // TikTok: the caption has to be pasted in (its embed API doesn't give it)
    const tiktok = await add({ url: "https://www.tiktok.com/@someone/video/7688461037280038176", area: "proclubs" });
    eq(tiktok.status, 400);
    ok(/TikTok doesn't let apps read/.test(JSON.stringify(tiktok.data)), JSON.stringify(tiktok.data));
    eq((await add({ url: "https://www.tiktok.com/@someone/video/7688461037280038176", area: "proclubs", text: "Sweeper Keeper GK build: 6'5, Footwork+ and Far Reach, max reactions and diving." })).status, 202);
    // Nobody said which bank: a build link is Pro Clubs on its own
    eq((await add({ url: pcbLink })).data.data.area, "proclubs");

    clearCache();
    const handler = createHandler(() => ({ rpc }));
    const res = await handler(new Request("http://local/functions/v1/meta-builds?days=90"));
    const body = await res.json();
    eq(res.status, 200);
    eq(body.days, 90);
    const cb = body.positions.find((p: { position: string }) => p.position === "CB");
    eq([cb.archetype.key, cb.heightCm, cb.builds], ["boss", 193, 2]);
    ok(cb.topSources.some((s: { url: string }) => s.url === "https://www.youtube.com/watch?v=abcdefghijk"));
    eq((await handler(new Request("http://local/functions/v1/meta-builds", { method: "POST" }))).status, 405);
  } finally {
    await pg.close();
  }
});

Deno.test("build collector: one search per position, five new videos each, and the hand-picked videos once", async () => {
  const { collectBuildSources, BUILD_SEED_VIDEOS, DEFAULT_BUILD_QUERIES } = await import("../_shared/fut/meta-builds.ts");
  const searches: string[] = [];
  let listed: string[] = [];
  const vid = (n: number, q: number) => `q${q}v${String(n).padStart(8, "0")}`.slice(0, 11);
  const fetcher = (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/search")) {
      const q = DEFAULT_BUILD_QUERIES.indexOf(u.searchParams.get("q")!);
      searches.push(u.searchParams.get("q")!);
      return Promise.resolve(new Response(JSON.stringify({ items: Array.from({ length: 10 }, (_, n) => ({ id: { videoId: vid(n, q) } })) })));
    }
    if (u.pathname.endsWith("/videos")) {
      const ids = u.searchParams.get("id")!.split(",");
      listed = listed.concat(ids);
      return Promise.resolve(new Response(JSON.stringify({ items: ids.map((id) => ({ id, snippet: { title: `Build ${id}`, channelTitle: "c", description: "A level 55 build", publishedAt: new Date().toISOString() }, statistics: { viewCount: "5000", commentCount: "0" } })) })));
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  };
  const env = (k: string) => ({ YOUTUBE_API_KEY: "y" } as Record<string, string>)[k];
  // The first seed video is already in the bank
  const known = (ids: string[]) => Promise.resolve(new Set(ids.filter((id) => id === BUILD_SEED_VIDEOS[0])));
  const got = await collectBuildSources(env, fetcher as never, known, { reddit: false, youtube: true, seed: true });
  eq(searches.length, 10, "one per position, a second for keepers and full-backs");
  ok(DEFAULT_BUILD_QUERIES.some((q) => /goalkeeper/i.test(q)) && DEFAULT_BUILD_QUERIES.some((q) => /fullback/i.test(q)));
  eq(got.filter((s) => BUILD_SEED_VIDEOS.includes(s.external_id)).length, BUILD_SEED_VIDEOS.length - 1);
  eq(got.filter((s) => s.external_id.startsWith("q7")).length, 5, "five per search");
  ok(got.every((s) => s.area === "proclubs"));
  // Off the YouTube hours only the seed runs (no searches)
  searches.length = 0;
  await collectBuildSources(env, fetcher as never, () => Promise.resolve(new Set(BUILD_SEED_VIDEOS)), { reddit: false, youtube: false, seed: true });
  eq(searches.length, 0);
});

Deno.test("Reddit build feeds: r/FIFAClubs and r/ProClubs, three positions' searches a run, every position in turn", async () => {
  const { redditBuildFeeds, REDDIT_BUILD_SEARCHES } = await import("../_shared/fut/meta-builds.ts");
  const env = (_k: string) => undefined;
  const run = 3 * 3_600_000;
  const first = redditBuildFeeds(env, 0);
  eq(first.slice(0, 2).map((f) => f.sub), ["FIFAClubs", "ProClubs"]);
  ok(first.every((f) => f.url.startsWith("https://www.reddit.com/r/")));
  const searched = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const feeds = redditBuildFeeds(env, i * run).filter((f) => f.url.includes("/r/FIFAClubs/search.rss"));
    eq(feeds.length, 3);
    for (const f of feeds) searched.add(decodeURIComponent(new URL(f.url).searchParams.get("q")!));
  }
  eq(searched.size, Object.keys(REDDIT_BUILD_SEARCHES).length, "every position searched within three runs");
  const own = redditBuildFeeds((k) => k === "FUT_KB_BUILD_SUBS" ? "ProClubs, bad sub!" : undefined, 0);
  eq(own[0]!.sub, "ProClubs");
  ok(own.every((f) => !f.url.includes("bad")));
});

Deno.test("FC 27 builds only, from the build window (9 weeks unless FUT_KB_BUILD_DAYS says otherwise)", async () => {
  const { collectBuildSources, olderGameTitle, buildWindowDays, BUILD_SEED_VIDEOS } = await import("../_shared/fut/meta-builds.ts");
  ok(olderGameTitle("The BEST Level 100 Sweeper Keeper GK Build | FC26 Pro Clubs"));
  ok(olderGameTitle("EA FC 25 best CB build") && olderGameTitle("FIFA 23 pro clubs striker"));
  ok(!olderGameTitle("BEST CB BUILD FOR LVL 55 | EAFC 27 Clubs") && !olderGameTitle("FC 26 vs FC 27: what changed for CBs") && !olderGameTitle("Best Boss CB build"));
  eq([buildWindowDays(() => undefined), buildWindowDays(() => "30"), buildWindowDays(() => "3")], [63, 30, 63]);
  const day = 86_400_000;
  const videos: Record<string, { title: string; at: number }> = {
    [BUILD_SEED_VIDEOS[0]!]: { title: "Level 55 GK build | FC27 Pro Clubs", at: NOW - 10 * day },
    [BUILD_SEED_VIDEOS[1]!]: { title: "Level 100 GK build | FC26 Pro Clubs", at: NOW - 10 * day },
    [BUILD_SEED_VIDEOS[2]!]: { title: "Old GK build", at: NOW - 80 * day },
  };
  const fetcher = (url: string) => {
    const ids = new URL(url).searchParams.get("id")!.split(",").filter((id) => videos[id]);
    return Promise.resolve(new Response(JSON.stringify({ items: ids.map((id) => ({ id, snippet: { title: videos[id]!.title, publishedAt: new Date(videos[id]!.at).toISOString() }, statistics: { viewCount: "1", commentCount: "0" } })) })));
  };
  const got = await collectBuildSources((k) => ({ YOUTUBE_API_KEY: "y" } as Record<string, string>)[k], fetcher as never, () => Promise.resolve(new Set()), { reddit: false, youtube: false, seed: true }, NOW);
  eq(got.map((s) => s.external_id), [BUILD_SEED_VIDEOS[0]], "the FC 26 video and the one older than 9 weeks are left out");
  const wide = await collectBuildSources((k) => ({ YOUTUBE_API_KEY: "y", FUT_KB_BUILD_DAYS: "120" } as Record<string, string>)[k], fetcher as never, () => Promise.resolve(new Set()), { reddit: false, youtube: false, seed: true }, NOW);
  eq(wide.length, 2, "a wider window keeps the older FC 27 video, never the FC 26 one");
});
