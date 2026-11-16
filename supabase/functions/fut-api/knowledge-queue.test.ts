// Knowledge Bank: added sources are read in the background with a status, the right bank is picked, the 10-minute queue
// job reads what people added, and sources the Ultimate Team reader filed as Pro Clubs builds move over. PGlite + fakes.
import assertNode from "node:assert/strict";
import { handle, type Deps } from "./handler.ts";
import { guessArea, readerProblem } from "../_shared/fut/knowledge.ts";
import { knowledgeDb, ME, OTHER, rpcOver } from "../_shared/fut/knowledge-test-db.ts";

const eq = (a: unknown, b: unknown, msg?: string) => assertNode.deepEqual(a, b, `${msg ?? ""} got ${JSON.stringify(a)}`);
const ok = (v: unknown, msg?: string) => assertNode.ok(v, msg);

const FUT_READING = { relevant: true, summary: "Formation tips", claims: [{ topic: "4-2-3-1 (2)", category: "formations", statement: "4-2-3-1 (2) is the most balanced shape", stance: "for", strength: 2 }] };
const CLUBS_READING = { relevant: true, summary: "Clubs builds", claims: [
  { topic: "Finisher ST build (Clubs)", category: "playstyles", statement: "Short Finisher with Rapid is the best striker", stance: "for", strength: 2 },
  { topic: "Recycler build (Clubs)", category: "playstyles", statement: "Recycler CDM at 188 cm holds midfield", stance: "for", strength: 2 },
] };
const BUILD_READING = { relevant: true, summary: "A striker build", builds: [
  { position: "ST", archetype: "finisher", height_cm: 175, weight_kg: 70, skill_moves: 5, weak_foot: 0, playstyles: ["Rapid"], key_attributes: ["finishing"], link: 0, stance: "for", strength: 2, statement: "Short Finisher striker" },
] };

function fakes() {
  const calls: { url: string; system: string }[] = [];
  let noCredit = false;
  const fetcher = (url: string, init?: RequestInit) => {
    const body = init?.body && String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : {};
    calls.push({ url, system: String(body.system ?? "") });
    if (url.includes("api.anthropic.com")) {
      if (noCredit) return Promise.resolve(new Response(JSON.stringify({ error: { message: "Your credit balance is too low" } }), { status: 400 }));
      const builds = String(body.system).includes("Virtual Pro");
      const text = JSON.stringify(builds ? BUILD_READING : String(JSON.stringify(body.messages)).includes("Clubs") ? CLUBS_READING : FUT_READING);
      return Promise.resolve(new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }] })));
    }
    return Promise.resolve(new Response("nope", { status: 404 }));
  };
  return { calls, fetcher, setNoCredit: (v: boolean) => { noCredit = v; } };
}

Deno.test("which bank a source belongs to when nobody says", () => {
  eq(guessArea("BEST STRIKER BUILD FOR LVL 55 | EAFC 27 Clubs. Finisher archetype, 5 star skills"), "proclubs");
  eq(guessArea("4-2-3-1 (2) custom tactics for Rivals and Champs, plus the best SBCs this week"), "fut");
  eq(guessArea("My notes on manual jockeying and lofted through balls"), "fut", "no Pro Clubs words: Ultimate Team as before");
  eq(guessArea("https://proclubsbuilder.co.uk/b/AAAABBBBCCCC"), "proclubs");
  ok(readerProblem(new Error("Your credit balance is too low")).includes("out of credit"));
});

Deno.test("added sources: background read with status, the right bank, retry, the queue job", async () => {
  const pg = await knowledgeDb();
  try {
    const { rpc } = rpcOver(pg);
    const f = fakes();
    const background: Promise<unknown>[] = [];
    const settle = async () => { while (background.length) await background.shift(); };
    const deps = (env: Record<string, string> = {}, bot = false): Deps => ({
      db: { rpc } as unknown as Deps["db"], userFor: (req) => Promise.resolve(req.headers.get("x-test-user")),
      env: (k) => ({ FUT_ENABLED: "true", FUT_KB_REDDIT_RSS: "off", ANTHROPIC_API_KEY: "k", ...env })[k],
      isBot: () => Promise.resolve(bot), fetch: f.fetcher as unknown as Deps["fetch"], waitUntil: (p) => { background.push(p); },
    });
    // deno-lint-ignore no-explicit-any
    const call = async (path: string, method = "GET", body?: unknown, user = ME): Promise<{ status: number; data: any }> => {
      const res = await handle(new Request(`http://local/functions/v1/fut-api/v1${path}`, { method, headers: { "content-type": "application/json", "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) }), deps());
      return { status: res.status, data: await res.json() };
    };
    const job = async (name: string) => {
      const res = await handle(new Request("http://local/functions/v1/fut-api", { method: "POST", body: JSON.stringify({ job: name }) }), deps({}, true));
      return { status: res.status, data: await res.json() };
    };
    const mine = async () => (await call("/knowledge/sources?mine=true")).data.data.sources as { id: string; status: string; area: string; claims: number; note: string | null }[];

    // A Pro Clubs build video's text added without saying which bank: read as builds, not Ultimate Team claims
    const clubs = await call("/knowledge/sources", "POST", { url: "https://example.com/build", text: "BEST STRIKER BUILD FOR LVL 55 | EAFC 27 Clubs. Finisher archetype, 175 cm, 5 star skills, Rapid. Max finishing first." });
    eq([clubs.status, clubs.data.data.status, clubs.data.data.area], [202, "reading", "proclubs"]);
    await settle();
    let rows = await mine();
    eq([rows[0]!.status, rows[0]!.area, rows[0]!.claims], ["read", "proclubs", 1]);

    // The page said Ultimate Team but the reader found only Pro Clubs builds: moved over and read as builds
    const misfiled = await call("/knowledge/sources", "POST", { text: "Clubs talk: everyone says the short striker with Rapid is the one, and the CDM should be tall.", area: "fut" });
    eq(misfiled.data.data.area, "fut");
    await settle();
    rows = await mine();
    const moved = rows.find((r) => r.id === misfiled.data.data.id)!;
    eq([moved.status, moved.area, moved.claims], ["read", "proclubs", 1]);
    const claims = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM fut.kb_claims WHERE source_id = $1", [moved.id]);
    eq(claims.rows[0]!.n, 0, "no Ultimate Team claims left on it");

    // Out of credit: waits with the reason, no attempt counted; the queue job reads it once the account works
    f.setNoCredit(true);
    const waiting = await call("/knowledge/sources", "POST", { text: "My Ultimate Team notes: 4-2-3-1 (2) is balanced, and Rivals rewards are worth it.", area: "fut" });
    await settle();
    let row = (await mine()).find((r) => r.id === waiting.data.data.id)!;
    eq(row.status, "pending");
    ok(row.note?.includes("out of credit"), row.note ?? "");
    const stopped = await job("knowledge-queue");
    ok(stopped.data.data.feeds.reader?.status === "failed", JSON.stringify(stopped.data));
    f.setNoCredit(false);
    const ran = await job("knowledge-queue");
    eq([ran.status, ran.data.data.read], [200, 1], JSON.stringify(ran.data));
    row = (await mine()).find((r) => r.id === waiting.data.data.id)!;
    eq([row.status, row.claims], ["read", 1]);

    // A read that never finished (restart) counts as waiting again after 15 minutes
    const stuckRow = await pg.query<{ id: string }>("INSERT INTO fut.kb_sources (kind, title, body, added_by, status, reading_at) VALUES ('note', 'stuck', 'Notes about Rivals: play 4-4-2 and drop deep when you lead late.', $1, 'reading', now() - interval '20 minutes') RETURNING id", [ME]);
    const stuck = { data: { data: { id: stuckRow.rows[0]!.id } } };
    eq((await mine()).find((r) => r.id === stuck.data.data.id)!.status, "pending");
    eq((await job("knowledge-queue")).data.data.read, 1);

    // Retry: only your own, and a failed one is read again
    await pg.query("UPDATE fut.kb_sources SET status = 'failed', attempts = 3, note = 'boom', body = 'Retry body about 4-2-3-1 (2) being balanced in Ultimate Team.' WHERE id = $1", [stuck.data.data.id]);
    eq((await call(`/knowledge/sources/${stuck.data.data.id}/retry`, "POST", {}, OTHER)).status, 404);
    const again = await call(`/knowledge/sources/${stuck.data.data.id}/retry`, "POST", {});
    eq([again.status, again.data.data.status], [202, "reading"]);
    await settle();
    eq((await mine()).find((r) => r.id === stuck.data.data.id)!.status, "read");

    // People's own sources come before popular collected ones
    await rpc("kb_collect", { p_sources: [{ kind: "reddit", external_id: "pop1", url: "https://www.reddit.com/r/fut/comments/pop1/", title: "t", community: "r/fut", published_at: new Date().toISOString(), score: 9000, body: "a popular post body long enough" }] });
    await pg.query("INSERT INTO fut.kb_sources (kind, title, body, added_by, status) VALUES ('note', 'mine', 'my own note body long enough', $1, 'pending')", [ME]);
    const order = (await rpc("kb_pending", { p_limit: 2 })).data as { title: string; added: boolean }[];
    eq(order.map((s) => s.added), [true, false]);
    eq((await rpc("kb_pending", { p_limit: 5 })).data, [], "handed-out sources are claimed");
  } finally { await pg.close(); }
});

Deno.test("migration: sources filed as Pro Clubs build talk move to the Pro Clubs side", async () => {
  const { PGlite } = await import("npm:@electric-sql/pglite@0.5.15");
  const { KB_SETUP } = await import("../_shared/fut/knowledge-test-db.ts");
  const db = new PGlite();
  try {
    await db.exec(KB_SETUP);
    for (const m of ["20261110160000_fut_knowledge_bank.sql", "20261112010000_fut_kb_retry.sql", "20261112090000_fut_kb_team.sql", "20261110230000_fut_sell_or_keep.sql", "20261115210000_kb_meta_builds.sql"]) {
      await db.exec(await Deno.readTextFile(new URL(`../../migrations/${m}`, import.meta.url)));
    }
    const src = async (kind: string, title: string, addedBy: string | null, topics: string[], ext: string | null = null) => {
      const r = await db.query<{ id: string }>("INSERT INTO fut.kb_sources (kind, external_id, url, title, added_by, status, body) VALUES ($1, $2, $3, $4, $5, 'read', NULL) RETURNING id",
        [kind, ext, ext ? `https://www.youtube.com/watch?v=${ext}` : null, title, addedBy]);
      for (const t of topics) await db.query("INSERT INTO fut.kb_claims (source_id, topic_key, topic, category, statement, stance, strength, said_at) VALUES ($1, $2, $3, 'playstyles', 'a statement', 1, 1, now())", [r.rows[0]!.id, t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), t]);
      return r.rows[0]!.id;
    };
    const video = await src("youtube", "BEST CM BUILD FOR LVL 55", ME, ["Maestro box-to-box CM build (Clubs)", "Player height in Clubs builds"], "HgzKPR1Xjok");
    const note = await src("note", "my clubs notes", ME, ["Spark winger build (Clubs)"]);
    const futNote = await src("note", "fut notes", ME, ["4-3-1-2", "Rivals", "Finisher ST build (Clubs)"]);
    const collected = await src("youtube", "collected", null, ["CB build (Clubs)"], "aaaaaaaaaaa");
    await db.exec(await Deno.readTextFile(new URL("../../migrations/20261116220000_kb_reading_status.sql", import.meta.url)));
    const get = async (id: string) => (await db.query<{ area: string; status: string; refetch: boolean; note: string | null; claims: number }>(
      "SELECT area, status, refetch, note, (SELECT count(*)::int FROM fut.kb_claims c WHERE c.source_id = s.id) AS claims FROM fut.kb_sources s WHERE id = $1", [id])).rows[0]!;
    const v = await get(video);
    eq([v.area, v.status, v.refetch, v.claims], ["proclubs", "pending", true, 0], "a YouTube link is fetched again and read as builds");
    const n = await get(note);
    eq([n.area, n.status, n.claims], ["proclubs", "failed", 0]);
    ok(n.note?.includes("add it again on the Pro Clubs side"));
    eq((await get(futNote)).area, "fut", "mostly Ultimate Team: stays");
    eq((await get(collected)).area, "fut", "collected sources aren't touched");
    const waiting = await db.query<{ r: { waiting: number } }>("SELECT fut.kb_status() AS r");
    eq(waiting.rows[0]!.r.waiting, 1, "the video waits to be fetched again");
  } finally { await db.close(); }
});
