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
  eq([st!.archetype, st!.height_cm, st!.weight_kg, st!.skill_moves, st!.weak_foot, st!.level], ["finisher", 188, 82, 4, 5, 60], "the link wins");
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
  eq([back.archetype, back.heightCm, back.level, back.points.finishing, back.name], ["finisher", 185, 60, 20, "Community meta ST"]);
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
    };
    const add = async (b: unknown) => {
      const res = await handle(new Request("http://local/functions/v1/fut-api/v1/knowledge/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }), deps);
      return { status: res.status, data: await res.json() };
    };
    const added = await add({ url: "https://www.youtube.com/watch?v=abcdefghijk", text: "My CB build: Boss, 6'4, 88 kg, Aerial Fortress, max Def Awareness and Strength.", share: true, area: "proclubs" });
    eq(added.status, 201, JSON.stringify(added.data));
    eq([added.data.data.claims, added.data.data.topics], [1, ["CB"]]);
    // A build link alone is enough
    eq((await add({ url: pcbLink, area: "proclubs", share: true })).status, 201);
    eq((await add({ url: pcbLink })).status, 400, "an Ultimate Team source still needs text");

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
